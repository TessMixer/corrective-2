const LocalDB = {
  KEY: "noc-store",
  LEGACY_ALERT_KEY: "noc-alerts",

  // Strip base64 data URLs from all attachments before persisting to localStorage
  // to prevent QuotaExceededError. Base64 blobs are kept only in memory (Store).
  stripBase64ForStorage(state) {
    const stripAttachments = (arr) => (arr || []).map(a =>
      (a.url || "").startsWith("data:") ? { ...a, url: "" } : a
    );
    const stripIncident = (inc) => {
      if (!inc) return inc;
      const result = { ...inc };
      if (result.nsFinish?.attachments) {
        result.nsFinish = { ...result.nsFinish, attachments: stripAttachments(result.nsFinish.attachments) };
      }
      if (result.updates) {
        result.updates = result.updates.map(u =>
          u.attachments ? { ...u, attachments: stripAttachments(u.attachments) } : u
        );
      }
      if (result.attachments) result.attachments = stripAttachments(result.attachments);
      return result;
    };
    const stripList = (list) => (list || []).map(stripIncident);
    return {
      ...state,
      alerts: stripList(state.alerts),
      corrective: {
        fiber:      stripList(state.corrective?.fiber),
        equipment:  stripList(state.corrective?.equipment),
        other:      stripList(state.corrective?.other),
      },
    };
  },

  normalizeState(input) {
    const alerts = Array.isArray(input?.alerts) ? input.alerts : [];
    const corrective = input?.corrective || { fiber: [], equipment: [], other: [] };
    const calendarEvents = Array.isArray(input?.calendarEvents) ? input.calendarEvents : [];

    return {
      alerts,
      corrective,
      calendarEvents,
    };
  },

  getState() {
    const data = localStorage.getItem(this.KEY);

    if (data) {
      try {
        return this.normalizeState(JSON.parse(data));
      } catch {
        return this.normalizeState({});
      }
    }

    const legacyAlerts = localStorage.getItem(this.LEGACY_ALERT_KEY);
    if (legacyAlerts) {
      try {
        return this.normalizeState({
          alerts: JSON.parse(legacyAlerts) || [],
          corrective: { fiber: [], equipment: [], other: [] },
        });
      } catch {
        return this.normalizeState({});
      }
    }

    return this.normalizeState({});
  },

  CACHE_TIMESTAMP_KEY: "noc-store-synced-at-v2",
  CLOUD_SYNC_TTL_MS: 3 * 60 * 1000, // 3 minutes — skip Firestore read if cache is fresh

  async syncFromCloud() {
    if (!window.FirebaseSync?.loadCloudState) {
      console.warn("FirebaseSync.loadCloudState not available for syncFromCloud.");
      return this.getState();
    }

    // If local cache is fresh enough, skip Firestore read entirely
    const lastSync = Number(localStorage.getItem(this.CACHE_TIMESTAMP_KEY) || 0);
    const cacheAge = Date.now() - lastSync;
    const localState = this.getState();
    const hasLocalData = localState.alerts.length > 0 ||
      Object.values(localState.corrective).some(arr => arr.length > 0);

    if (hasLocalData && cacheAge < this.CLOUD_SYNC_TTL_MS) {
      console.info(`LocalDB: Cache is fresh (${Math.round(cacheAge/1000)}s old), skipping Firestore read.`);
      return localState;
    }

    try {
      const cloudState = await window.FirebaseSync.loadCloudState();
      if (!cloudState) {
        console.info("LocalDB: Cloud returned null (quota/error) — keeping local cache.");
        return localState;
      }

      // Safety check: don't overwrite local data with empty cloud result
      const cloudAlerts = Array.isArray(cloudState.alerts) ? cloudState.alerts : [];
      const cloudCorrective = cloudState.corrective || {};
      const hasCloudData = cloudAlerts.length > 0 ||
        Object.values(cloudCorrective).some(arr => Array.isArray(arr) && arr.length > 0);

      if (!hasCloudData && hasLocalData) {
        console.warn("LocalDB: Cloud returned empty but local has data — keeping local cache to prevent data loss.");
        return localState;
      }

      // Build local incident lookup by incidentId for merge
      const localIncidentMap = {};
      const allLocal = [
        ...(localState.alerts || []),
        ...Object.values(localState.corrective || {}).flat(),
      ];
      allLocal.forEach((inc) => {
        const id = String(inc.incidentId || inc.incident || inc.id || "").toLowerCase().trim();
        if (id) localIncidentMap[id] = inc;
      });

      // Merge: if local has updates/nsFinish that cloud doc lacks, keep local fields
      const mergeIncident = (cloudInc) => {
        const id = String(cloudInc.incidentId || cloudInc.incident || cloudInc.id || "").toLowerCase().trim();
        const local = localIncidentMap[id];
        if (!local) return cloudInc;
        const merged = { ...cloudInc };
        // Preserve local updates if cloud has none or fewer
        const cloudUpdates = Array.isArray(cloudInc.updates) ? cloudInc.updates : [];
        const localUpdates = Array.isArray(local.updates) ? local.updates : [];
        if (localUpdates.length > cloudUpdates.length) {
          merged.updates = localUpdates;
          console.info(`LocalDB: Preserved ${localUpdates.length} local updates for ${id} (cloud had ${cloudUpdates.length})`);
        }
        // Preserve local nsFinish if cloud has none
        if (!cloudInc.nsFinish && local.nsFinish) {
          merged.nsFinish = local.nsFinish;
          console.info(`LocalDB: Preserved local nsFinish for ${id}`);
        }
        return merged;
      };

      const normalized = this.normalizeState({
        alerts: (Array.isArray(cloudState.alerts) ? cloudState.alerts : []).map(mergeIncident),
        corrective: {
          fiber: ((cloudState.corrective || {}).fiber || []).map(mergeIncident),
          equipment: ((cloudState.corrective || {}).equipment || []).map(mergeIncident),
          other: ((cloudState.corrective || {}).other || []).map(mergeIncident),
        },
        calendarEvents: cloudState.calendarEvents,
      });
      const storageState = this.stripBase64ForStorage(normalized);
      try {
        localStorage.setItem(this.KEY, JSON.stringify(storageState));
        localStorage.setItem(this.LEGACY_ALERT_KEY, JSON.stringify(storageState.alerts));
        localStorage.setItem(this.CACHE_TIMESTAMP_KEY, String(Date.now()));
      } catch (e) {
        if (e.name === "QuotaExceededError") {
          console.warn("LocalDB: syncFromCloud — quota exceeded, clearing legacy cache and retrying");
          try {
            localStorage.removeItem(this.LEGACY_ALERT_KEY);
            localStorage.setItem(this.KEY, JSON.stringify(storageState));
            localStorage.setItem(this.CACHE_TIMESTAMP_KEY, String(Date.now()));
          } catch (e2) {
            console.error("LocalDB: syncFromCloud — still over quota after clearing:", e2);
          }
        }
      }
      console.info("LocalDB: Synced from Cloud with local merge. Cache updated.");
      return normalized;
    } catch (error) {
      console.warn("Cloud sync (read) failed, using local state:", error);
      return localState;
    }
  },

  saveState(nextState, options = {}) {
    const current = this.getState();
    const merged = {
      alerts: nextState?.alerts ?? current.alerts,
      corrective: nextState?.corrective ?? current.corrective,
      calendarEvents: nextState?.calendarEvents ?? current.calendarEvents,
    };

    const state = this.normalizeState(merged);
    const storageState = this.stripBase64ForStorage(state);

    // Always update local cache immediately (base64 stripped to stay within quota)
    try {
      localStorage.setItem(this.KEY, JSON.stringify(storageState));
      localStorage.setItem(this.LEGACY_ALERT_KEY, JSON.stringify(storageState.alerts));
    } catch (e) {
      if (e.name === "QuotaExceededError") {
        console.warn("LocalDB: localStorage quota exceeded — clearing old alerts cache and retrying");
        try {
          localStorage.removeItem(this.LEGACY_ALERT_KEY);
          localStorage.setItem(this.KEY, JSON.stringify(storageState));
        } catch (e2) {
          console.error("LocalDB: still over quota after clearing alerts cache:", e2);
        }
      }
    }

    if (!options.skipCloudSync) {
      // For metadata (Calendar), we use the root sync
      if (window.FirebaseSync?.saveCloudState) {
        window.FirebaseSync.saveCloudState(state).catch((error) => {
          console.warn("LocalDB: Cloud metadata sync failed:", error);
        });
      }

      // NOTE: Granular incident sync (saveIncidentToCloud) should be called 
      // by the service layer during specific actions to prevent list-overwriting.
    }
  },

  getAlerts() {
    return this.getState().alerts;
  },

  saveAlerts(alerts, options = {}) {
    const current = this.getState();
    this.saveState({ ...current, alerts }, options);
  },

  getCorrective() {
    return this.getState().corrective;
  },

  saveCorrective(corrective) {
    const current = this.getState();
    this.saveState({ ...current, corrective });
  },

  getCalendarEvents() {
    return this.getState().calendarEvents;
  },

  saveCalendarEvents(calendarEvents) {
    const current = this.getState();
    this.saveState({ ...current, calendarEvents });
  },

  addAlert(alert) {
    const current = this.getState();
    // Use incidentId if provided, else fallback to incident
    const id = alert.incidentId || alert.incident;
    if (!id) return;
    
    // Avoid duplicates
    const exists = current.alerts.some(a => (a.incidentId || a.incident) === id);
    if (!exists) {
      current.alerts.push(alert);
      this.saveState(current);
    }
  },

  deleteAlert(id) {
    const current = this.getState();
    const normalizedId = String(id || "").toLowerCase().trim();
    
    current.alerts = current.alerts.filter((alert) => {
      const aId = String(alert.incidentId || alert.incident || "").toLowerCase().trim();
      return aId !== normalizedId;
    });
    
    this.saveState(current);
  },
};