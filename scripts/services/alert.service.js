// scripts/services/alert.service.js

/**
 * Parse any timestamp format to milliseconds.
 * Handles: ISO string, Firestore Timestamp ({ _seconds, seconds }), Date object.
 */
function parseTimestampMs(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return new Date(value).getTime() || 0;
  if (typeof value.toMillis === "function") return value.toMillis(); // Firestore client SDK
  const seconds = value._seconds ?? value.seconds; // Firestore admin SDK serialized via JSON
  if (typeof seconds === "number") return seconds * 1000;
  return new Date(value).getTime() || 0;
}

/**
 * Write-lock: persisted in localStorage so it survives page refresh.
 * Prevents server polling from overwriting local data before Firestore propagates.
 */
const WRITE_LOCK_MS = 60 * 1000; // 60 seconds — covers CDN cache (30s) + Firestore propagation
const WRITE_LOCK_STORAGE_KEY = "noc-recent-writes";

function _loadWriteLocks() {
  try { return JSON.parse(localStorage.getItem(WRITE_LOCK_STORAGE_KEY) || "{}"); } catch { return {}; }
}

function markRecentWrite(incidentKey) {
  const locks = _loadWriteLocks();
  locks[String(incidentKey).toLowerCase()] = Date.now();
  localStorage.setItem(WRITE_LOCK_STORAGE_KEY, JSON.stringify(locks));
}

function isRecentlyWritten(incidentKey) {
  const locks = _loadWriteLocks();
  const key = String(incidentKey).toLowerCase();
  const t = locks[key];
  if (!t) return false;
  if (Date.now() - t > WRITE_LOCK_MS) {
    delete locks[key];
    localStorage.setItem(WRITE_LOCK_STORAGE_KEY, JSON.stringify(locks));
    return false;
  }
  return true;
}

function getIncidentKey(alert) {
  return alert?.incident || alert?.incidentId || alert?.id || alert?.incident_number;
}

function getTicketIdentity(ticket = {}, fallbackIndex = 0) {
  return [
    ticket.ticket || ticket.symphonyTicket || `index-${fallbackIndex}`,
    ticket.cid || "",
    ticket.port || "",
    ticket.downTime || "",
  ]
    .map((value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, ""))
    .join("::");
}

function mergeTickets(alerts = []) {
  const byIdentity = new Map();

  alerts.forEach((alert) => {
    (alert.tickets || []).forEach((ticket, index) => {
      const key = getTicketIdentity(ticket, index);
      if (!byIdentity.has(key)) {
        byIdentity.set(key, { ...ticket });
      }
    });
  });

  return Array.from(byIdentity.values());
}
function normalizeIncidentId(value) {
  return String(value || "").trim().toLowerCase();
}

function toComparableShape(items = []) {
  return (items || [])
    .map((item) => ({
      key: normalizeIncidentId(getIncidentKey(item)),
      status: String(item?.status || "").trim().toUpperCase(),
      // Use parseTimestampMs to normalize ALL formats to a number — prevents
      // "[object Object]" vs ISO string false-positives that caused constant re-renders
      updatedAt: parseTimestampMs(item?.updatedAt || item?.updated_at || item?.respondedAt),
    }))
    .filter((item) => item.key)
    .sort((a, b) => a.key.localeCompare(b.key));
}

function hasCloudDataChanged(currentState, nextAlerts, nextCorrective) {
  const currentComparable = {
    alerts: toComparableShape(currentState?.alerts || []),
    corrective: {
      fiber: toComparableShape(currentState?.corrective?.fiber || []),
      equipment: toComparableShape(currentState?.corrective?.equipment || []),
      other: toComparableShape(currentState?.corrective?.other || []),
    },
  };

  const nextComparable = {
    alerts: toComparableShape(nextAlerts),
    corrective: {
      fiber: toComparableShape(nextCorrective?.fiber || []),
      equipment: toComparableShape(nextCorrective?.equipment || []),
      other: toComparableShape(nextCorrective?.other || []),
    },
  };

  return JSON.stringify(currentComparable) !== JSON.stringify(nextComparable);
}

function buildCorrectiveCard(incidentAlerts = [], selectedType, eta, existingCard = null) {
  const seed = incidentAlerts[0] || existingCard || {};
  const uniqueNodes = [...new Set(incidentAlerts.map((alert) => alert.node).filter(Boolean))];
  const uniqueAlarms = [...new Set(incidentAlerts.map((alert) => alert.alarm).filter(Boolean))];

  // Preserve per-node ticket mapping so the detail view can show each node's own tickets.
  // nodeDetails: [{ node, tickets, alarm, detail }, ...]
  const nodeDetails = incidentAlerts.length
    ? incidentAlerts.map((a) => ({
        node: a.node || "-",
        tickets: a.tickets || [],
        alarm: a.alarm || "",
        detail: a.detail || "",
      }))
    : (existingCard?.nodeDetails || []);

  return {
    ...seed,
    incident: getIncidentKey(seed),
    incidentId: getIncidentKey(seed),
    node: uniqueNodes.join(", ") || seed.node || "-",
    alarm: uniqueAlarms.join(" | ") || seed.alarm || "-",
    tickets: mergeTickets(incidentAlerts.length ? incidentAlerts : [existingCard || {}]),
    nodeDetails,
    workType: selectedType || seed.workType || "Other",
    eta: eta || seed.eta || "-",
    status: "PROCESS",
    respondedAt: seed.respondedAt || new Date().toISOString(),
    rootCause: seed.rootCause || "",
    solution: seed.solution || "",
    remark: seed.remark || "",
  };
}

window.AlertService = {
  async loadFromLocal() {
    let res;
    try {
      res = await fetch("/.netlify/functions/get-incidents", { cache: "no-store" });
    } catch (error) {
      console.warn("Load incidents API unreachable, falling back to local state:", error);
      return;
    }

    const raw = await res.text();
    let data = {};
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        console.warn("Load incidents returned non-JSON payload, skipping remote sync.");
        return;
      }
    }

    if (!res.ok) {
      if (res.status === 404) {
        console.info("Server incidents API not found (running in local mode). Skipping cloud sync.");
      } else {
        console.warn("Load incidents API failed:", data?.error || res.status);
      }
      return;
    }

    // Server timed out — data is empty, skip sync to preserve local state
    if (data?.meta?.timeout) {
      console.warn("[AlertService] get-incidents timed out on server, keeping local state.");
      return;
    }

    // Merge items by incident ID — combine tickets from all nodes into one entry
    const mergeTicketArrays = (existingTickets = [], incomingTickets = []) => {
      const byKey = new Map();
      const ticketKey = (t) => t.ticket || t.symphonyTicket || t.cid || "";
      [...existingTickets, ...incomingTickets].forEach((t, i) => {
        const k = ticketKey(t) || `idx-${i}`;
        if (!byKey.has(k)) byKey.set(k, t);
        else byKey.set(k, { ...byKey.get(k), ...t });
      });
      return Array.from(byKey.values());
    };

    const uniqueByIncident = (items = []) => {
      const map = new Map();
      items.forEach((item, index) => {
        const incidentKey = String(
          getIncidentKey(item) || item?.incident_number || item?.caseId || ""
        ).trim().toLowerCase();
        const nodeKey = String(item?.node || "").trim().toLowerCase().replace(/\s+/g, "_");
        // Use incidentId__node as dedup key so each node stays as its own row
        const dedupeKey = incidentKey
          ? (nodeKey ? `${incidentKey}__${nodeKey}` : incidentKey)
          : `fallback-${index}-${nodeKey}-${item?.alarm || "no-alarm"}`;
        if (!dedupeKey) return;

        const normalizedItem = incidentKey ? item : {
          ...item,
          incidentId: item?.incidentId || incidentKey,
          incident: item?.incident || incidentKey,
        };

        if (!map.has(dedupeKey)) {
          map.set(dedupeKey, { ...normalizedItem });
        } else {
          // Same incident+node seen twice (e.g. two polls) — keep newer
          const existing = map.get(dedupeKey);
          const newTime = parseTimestampMs(normalizedItem.updatedAt);
          const existTime = parseTimestampMs(existing.updatedAt);
          if (newTime > existTime) {
            map.set(dedupeKey, { ...existing, ...normalizedItem });
          }
        }
      });
      return Array.from(map.values());
    };
    const alerts = uniqueByIncident(Array.isArray(data.alerts) ? data.alerts : []);
    const corrective = data.corrective || { fiber: [], equipment: [], other: [] };
    const normalizedCorrective = {
      fiber: uniqueByIncident(corrective.fiber || []),
      equipment: uniqueByIncident(corrective.equipment || []),
      other: uniqueByIncident(corrective.other || []),
    };
    const currentState = Store.getState();

    // Statuses that are locally hidden — never let server overwrite these back to visible
    const HIDDEN_STATUSES = ["CANCEL", "CANCELLED", "DELETED", "DELETE", "TRASH"];

    // Preserve local-only incidents created within the last 5 minutes that the
    // server doesn't know about yet (Firebase propagation delay).
    const PENDING_SYNC_WINDOW_MS = 5 * 60 * 1000;
    const serverAlertKeys = new Set(alerts.map((a) => normalizeIncidentId(getIncidentKey(a))));
    // Key: incidentId__node (same format as uniqueByIncident above)
    const localAlertMap = new Map();
    (currentState.alerts || []).forEach((a) => {
      const incKey = normalizeIncidentId(getIncidentKey(a));
      const nodeKey = String(a?.node || "").trim().toLowerCase().replace(/\s+/g, "_");
      const key = incKey ? (nodeKey ? `${incKey}__${nodeKey}` : incKey) : null;
      if (key) localAlertMap.set(key, a);
    });

    // Build corrective key set to detect alerts recently moved to corrective
    const localCorrectiveKeySet = new Set();
    ["fiber", "equipment", "other"].forEach((tab) => {
      (currentState.corrective?.[tab] || []).forEach((a) => {
        const k = normalizeIncidentId(getIncidentKey(a));
        if (k) localCorrectiveKeySet.add(k);
      });
    });

    // Apply same write-lock + timestamp merge to alerts
    const mergedServerAlerts = alerts.flatMap((serverAlert) => {
      const incKey = normalizeIncidentId(getIncidentKey(serverAlert));
      const nodeKey = String(serverAlert?.node || "").trim().toLowerCase().replace(/\s+/g, "_");
      const key = incKey ? (nodeKey ? `${incKey}__${nodeKey}` : incKey) : null;
      if (!key) return [serverAlert];
      const localAlert = localAlertMap.get(key);
      if (!localAlert) {
        // Alert was removed locally — if it was recently moved to corrective, suppress it
        // so stale server data (CDN cache / propagation delay) doesn't bring it back
        if (isRecentlyWritten(incKey) && localCorrectiveKeySet.has(incKey)) return [];
        return [serverAlert];
      }
      if (isRecentlyWritten(incKey)) return [{ ...serverAlert, ...localAlert }];
      const serverTime = parseTimestampMs(serverAlert.updatedAt);
      const localTime = parseTimestampMs(localAlert.updatedAt);
      return [localTime > serverTime ? { ...serverAlert, ...localAlert } : serverAlert];
    });

    // serverAlertKeys = set of "incidentId__node" keys from server
    const serverAlertNodeKeys = new Set(alerts.map((a) => {
      const incKey = normalizeIncidentId(getIncidentKey(a));
      const nodeKey = String(a?.node || "").trim().toLowerCase().replace(/\s+/g, "_");
      return incKey ? (nodeKey ? `${incKey}__${nodeKey}` : incKey) : null;
    }).filter(Boolean));

    const recentLocalAlerts = (currentState.alerts || []).filter((a) => {
      const incKey = normalizeIncidentId(getIncidentKey(a));
      const nodeKey = String(a?.node || "").trim().toLowerCase().replace(/\s+/g, "_");
      const key = incKey ? (nodeKey ? `${incKey}__${nodeKey}` : incKey) : null;
      if (!key) return false;
      if (HIDDEN_STATUSES.includes((a.status || "").toUpperCase())) return !serverAlertNodeKeys.has(key);
      if (serverAlertNodeKeys.has(key)) return false;
      const age = Date.now() - new Date(a.createdAt || 0).getTime();
      return age < PENDING_SYNC_WINDOW_MS;
    });
    const mergedAlerts = [...mergedServerAlerts, ...recentLocalAlerts];

    // Build a map of ALL local corrective incidents → which tab they belong to now.
    // Used to detect cross-tab moves: if server says incident is in "other" but
    // local moved it to "fiber", we must exclude it from the "other" merge entirely.
    const localCorrectiveTabMap = new Map(); // incidentKey → "fiber"|"equipment"|"other"
    ["fiber", "equipment", "other"].forEach((tab) => {
      (currentState.corrective[tab] || []).forEach((a) => {
        const key = normalizeIncidentId(getIncidentKey(a));
        if (key) localCorrectiveTabMap.set(key, tab);
      });
    });

    const mergeRecentCorrective = (serverList, localList, currentTab) => {
      // Build local lookup by incident key
      const localMap = new Map();
      (localList || []).forEach((a) => {
        const key = normalizeIncidentId(getIncidentKey(a));
        if (key) localMap.set(key, a);
      });

      // For each server item: protect local data if it's newer OR within write-lock window
      const merged = serverList
        .filter((serverItem) => {
          const key = normalizeIncidentId(getIncidentKey(serverItem));
          if (!isRecentlyWritten(key)) return true; // not locked — keep in list, merge below
          const localTab = localCorrectiveTabMap.get(key);
          // If locally this incident now lives in a DIFFERENT tab → exclude from this tab's list.
          // This prevents a CDN-cached "Other" entry from reappearing after a move to "Fiber".
          if (localTab && localTab !== currentTab) return false;
          return true;
        })
        .map((serverItem) => {
          const key = normalizeIncidentId(getIncidentKey(serverItem));
          const localItem = localMap.get(key);
          if (!localItem) return serverItem;

          // Write-lock: recently saved locally → never let stale server data win
          if (isRecentlyWritten(key)) {
            return { ...serverItem, ...localItem };
          }

          // Timestamp comparison — handles ISO string, Firestore Timestamp, admin SDK JSON
          const serverTime = parseTimestampMs(serverItem.updatedAt);
          const localTime = parseTimestampMs(localItem.updatedAt);

          if (localTime > serverTime) {
            // Local is newer — use local data, fall back to server for missing fields
            return { ...serverItem, ...localItem };
          }
          // Server wins, but preserve alertClass from local — it's set at creation from the
          // original alert and may not exist in the Firestore sub-collection document
          if (localItem.alertClass && !serverItem.alertClass) {
            return { ...serverItem, alertClass: localItem.alertClass };
          }
          return serverItem;
        });

      // Add recent local items not yet in server (propagation delay)
      const serverKeys = new Set(serverList.map((a) => normalizeIncidentId(getIncidentKey(a))));
      const recentLocal = (localList || []).filter((a) => {
        const key = normalizeIncidentId(getIncidentKey(a));
        if (!key || serverKeys.has(key)) return false;
        const age = Date.now() - new Date(a.createdAt || a.respondedAt || 0).getTime();
        return age < PENDING_SYNC_WINDOW_MS;
      });

      return [...merged, ...recentLocal];
    };
    const mergedCorrective = {
      fiber: mergeRecentCorrective(normalizedCorrective.fiber, currentState.corrective?.fiber, "fiber"),
      equipment: mergeRecentCorrective(normalizedCorrective.equipment, currentState.corrective?.equipment, "equipment"),
      other: mergeRecentCorrective(normalizedCorrective.other, currentState.corrective?.other, "other"),
    };

    const changed = hasCloudDataChanged(currentState, mergedAlerts, mergedCorrective);
    if (!changed) return;

    // IMPORTANT: remote is authoritative; replace local lists so deletions from cloud
    // are reflected immediately without requiring full page refresh.
    LocalDB.saveState({
      alerts: mergedAlerts,
      corrective: mergedCorrective,
      calendarEvents: currentState.calendarEvents || [],
    }, { skipCloudSync: true });

    Store.dispatch((state) => ({
      ...state,
      alerts: mergedAlerts,
      corrective: mergedCorrective,
    }));
  },

  async loadFromEmail() {
    const emails = await EmailRepository.getUnreadAlerts();
    const alerts = emails.map((email) => EmailParser.toAlert(email));
    LocalDB.saveAlerts(alerts);
    Store.dispatch((state) => ({
      ...state,
      alerts,
    }));
  },

  markRecentWrite,

  async completeAlert(incidentId) {
    markRecentWrite(incidentId);
    const updated = Store.getState().alerts.map((alert) =>
      getIncidentKey(alert) === incidentId ? { ...alert, status: "COMPLETE", completedAt: new Date().toISOString() } : alert
    );
    LocalDB.saveAlerts(updated, { skipCloudSync: true });
    Store.dispatch((state) => ({
      ...state,
      alerts: updated,
    }));

    // Trigger Granular Cloud Sync
    const incident = updated.find(a => getIncidentKey(a) === incidentId);
    if (incident && window.FirebaseSync?.saveIncidentToCloud) {
       await window.FirebaseSync.saveIncidentToCloud(incident).catch(e => console.warn("Cloud Sync failed:", e));
    }
  },

  async cancelAlert(incidentId) {
    markRecentWrite(incidentId);
    const updated = Store.getState().alerts.map((alert) =>
      getIncidentKey(alert) === incidentId ? { ...alert, previousStatus: alert.status, status: "CANCEL", cancelledAt: new Date().toISOString() } : alert
    );
    LocalDB.saveAlerts(updated, { skipCloudSync: true });
    Store.dispatch((state) => ({
      ...state,
      alerts: updated,
    }));

    // Trigger Granular Cloud Sync
    const incident = updated.find(a => getIncidentKey(a) === incidentId);
    if (incident && window.FirebaseSync?.saveIncidentToCloud) {
       await window.FirebaseSync.saveIncidentToCloud(incident).catch(e => console.warn("Cloud Sync failed:", e));
    }

    // Call legacy API as background task
    fetch("/.netlify/functions/cancel-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incident_number: incidentId }),
    }).catch(e => console.warn("Cancel API background error:", e));
  },

  async restoreAlert(incidentId) {
    const state = Store.getState();

    // Normalize ID for comparison: strip __nodename suffix, lowercase
    const normalizeKey = (v) => String(v || "").split("__")[0].toLowerCase().trim();
    const normalizedId = normalizeKey(incidentId);

    const matchesId = (item) => normalizeKey(getIncidentKey(item)) === normalizedId;

    // ลบ field ที่เกี่ยวกับการ cancel ออก (ห้ามส่ง undefined ไป Firestore)
    const stripCancelFields = (item) => {
      const copy = { ...item };
      delete copy.previousStatus;
      delete copy.cancelledAt;
      delete copy.cancelReason;
      delete copy.deletedAt;
      return copy;
    };

    // Try to restore from alerts (CANCEL status)
    const restoredAlert = state.alerts.find(matchesId);
    if (restoredAlert) {
      const updatedAlerts = state.alerts.map(a => {
        if (!matchesId(a)) return a;
        const stripped = stripCancelFields(a);
        stripped.status = a.previousStatus || "ACTIVE";
        return stripped;
      });
      LocalDB.saveAlerts(updatedAlerts, { skipCloudSync: true });
      Store.dispatch(s => ({ ...s, alerts: updatedAlerts }));
      const restored = updatedAlerts.find(matchesId);
      if (restored && window.FirebaseSync?.saveIncidentToCloud) {
        await window.FirebaseSync.saveIncidentToCloud(restored).catch(e => console.warn("Cloud Sync failed:", e));
      }
      fetch("/.netlify/functions/restore-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incident_number: incidentId }),
      }).catch(e => console.warn("Restore API background error:", e));
      return;
    }

    // Try to restore from corrective (CANCELLED status)
    const restoreCorrective = (list) => list.map(item => {
      if (!matchesId(item)) return item;
      const stripped = stripCancelFields(item);
      stripped.status = item.previousStatus || "CORRECTIVE";
      return stripped;
    });
    const nextCorrective = {
      fiber: restoreCorrective(state.corrective.fiber || []),
      equipment: restoreCorrective(state.corrective.equipment || []),
      other: restoreCorrective(state.corrective.other || []),
    };
    LocalDB.saveState({ alerts: state.alerts, corrective: nextCorrective }, { skipCloudSync: true });
    Store.dispatch(s => ({ ...s, corrective: nextCorrective }));
    const restoredCorr = [...nextCorrective.fiber, ...nextCorrective.equipment, ...nextCorrective.other]
      .find(matchesId);
    if (restoredCorr && window.FirebaseSync?.saveIncidentToCloud) {
      await window.FirebaseSync.saveIncidentToCloud(restoredCorr).catch(e => console.warn("Cloud Sync failed:", e));
    }
  },

  async createAlert(alertData) {
    const incidentId = alertData.incident || alertData.incidentId || alertData.id;
    const newAlert = {
      incident: incidentId,
      incidentId,
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      ...alertData,
    };
    const alerts = [...Store.getState().alerts, newAlert];
    LocalDB.saveAlerts(alerts, { skipCloudSync: true });
    Store.dispatch((state) => ({
      ...state,
      alerts,
    }));

    // Trigger Granular Cloud Sync
    if (window.FirebaseSync?.saveIncidentToCloud) {
      await window.FirebaseSync.saveIncidentToCloud(newAlert).catch(e => console.warn("Cloud Sync failed:", e));
    }
  },

  async responseAlert(incidentId, eta, workType, assignedTeam = "", responseNote = "") {
    markRecentWrite(incidentId);
    const state = Store.getState();
    const incidentAlerts = state.alerts.filter((item) => getIncidentKey(item) === incidentId);
    if (!incidentAlerts.length) return;

    const alert = incidentAlerts[0];
    const selectedType = workType || alert.workType || "Other";
    let type = "other";
    if (selectedType === "Fiber") type = "fiber";
    if (selectedType === "Equipment") type = "equipment";

    const allCorrective = Object.values(state.corrective || {}).flat();
    const existingCard = allCorrective.find((item) => getIncidentKey(item) === incidentId);

    // Create combined corrective card but also update individual statuses
    const correctiveCard = buildCorrectiveCard(incidentAlerts, selectedType, eta, existingCard);
    correctiveCard.status = "CORRECTIVE";
    if (assignedTeam) correctiveCard.assignedTeam = assignedTeam;
    if (responseNote) correctiveCard.responseNote = responseNote; 

    const updatedAlerts = state.alerts.filter((item) => getIncidentKey(item) !== incidentId);
    const updatedCorrective = {
      fiber: (state.corrective.fiber || []).filter((item) => getIncidentKey(item) !== incidentId),
      equipment: (state.corrective.equipment || []).filter((item) => getIncidentKey(item) !== incidentId),
      other: (state.corrective.other || []).filter((item) => getIncidentKey(item) !== incidentId),
    };

    updatedCorrective[type] = [...(updatedCorrective[type] || []), correctiveCard];

    // Important: Cloud Sync will use the updated state
    LocalDB.saveState({
      alerts: updatedAlerts,
      corrective: updatedCorrective,
    }, { skipCloudSync: true });
    
    Store.dispatch((current) => ({
      ...current,
      alerts: updatedAlerts,
      corrective: updatedCorrective,
    }));

    // Trigger sync
    // Trigger Granular Cloud Sync
    if (window.FirebaseSync?.saveIncidentToCloud) {
      await window.FirebaseSync.saveIncidentToCloud(correctiveCard).catch(e => console.warn("Cloud Sync failed:", e));
    }

    // Call legacy API as background task
    fetch("/.netlify/functions/respond-incident", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incident_number: incidentId, work_type: selectedType, eta }),
    }).catch(e => console.warn("Respond API background error:", e));
  },

  async deleteIncident(incidentId) {
    if (!confirm(`Are you sure you want to PERMANENTLY delete incident ${incidentId}? This cannot be undone.`)) return;

    // 1. Update Local State immediately
    Store.dispatch((state) => {
      const alerts = state.alerts.filter(a => getIncidentKey(a) !== incidentId);
      const corrective = {
        fiber: (state.corrective.fiber || []).filter(i => getIncidentKey(i) !== incidentId),
        equipment: (state.corrective.equipment || []).filter(i => getIncidentKey(i) !== incidentId),
        other: (state.corrective.other || []).filter(i => getIncidentKey(i) !== incidentId),
      };
      LocalDB.saveState({ ...state, alerts, corrective }, { skipCloudSync: true });
      return { ...state, alerts, corrective };
    });

    // 2. Trigger Granular Cloud Deletion
    if (window.FirebaseSync?.deleteIncidentFromCloud) {
       await window.FirebaseSync.deleteIncidentFromCloud(incidentId).catch(e => console.warn("Cloud Deletion failed:", e));
    }

    // 3. Call legacy API as background task
    fetch("/.netlify/functions/delete-incident", {
      method: "POST",
      body: JSON.stringify({ incidentId }),
    }).catch(e => console.warn("Permanent deletion sync background error:", e));
  },
};