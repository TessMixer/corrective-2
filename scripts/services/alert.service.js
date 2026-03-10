// scripts/services/alert.service.js
function getIncidentKey(alert) {
  return alert?.incident || alert?.incidentId || alert?.id;
}

function getTicketIdentity(ticket = {}, fallbackIndex = 0) {
  return [
    ticket.ticket || ticket.symphonyTicket || `index-${fallbackIndex}`,
    ticket.cid || "",
    ticket.port || "",
    ticket.downTime || "",
  ]
    .map((value) => String(value || "").trim().toLowerCase())
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

function buildCorrectiveCard(incidentAlerts = [], selectedType, eta, existingCard = null) {
  const seed = incidentAlerts[0] || existingCard || {};
  const uniqueNodes = [...new Set(incidentAlerts.map((alert) => alert.node).filter(Boolean))];
  const uniqueAlarms = [...new Set(incidentAlerts.map((alert) => alert.alarm).filter(Boolean))];

  return {
    ...seed,
    incident: getIncidentKey(seed),
    incidentId: getIncidentKey(seed),
    node: uniqueNodes.join(", ") || seed.node || "-",
    alarm: uniqueAlarms.join(" | ") || seed.alarm || "-",
    tickets: mergeTickets(incidentAlerts.length ? incidentAlerts : [existingCard || {}]),
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
      res = await fetch("/.netlify/functions/get-alerts", { cache: "no-store" });
    } catch (error) {
      console.warn("Load alerts API unreachable, falling back to local state:", error);
      return;
    }

    const raw = await res.text();
    let data = {};
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        console.warn("Load alerts returned non-JSON payload, skipping remote sync.");
        return;
      }
    }

    if (!res.ok) {
      console.warn("Load alerts API failed:", data?.error || res.status);
      return;
    }

    const alerts = (Array.isArray(data.alerts) ? data.alerts : []).filter((alert) => {
      const status = String(alert?.status || "").trim().toUpperCase();
      const stage = String(alert?.workflowStage || "").trim().toUpperCase();
      return status !== "PROCESS" && stage !== "CORRECTIVE";
    });

    Store.dispatch((state) => ({
      ...state,
      alerts,
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

  completeAlert(incidentId) {
    const updated = Store.getState().alerts.map((alert) =>
      getIncidentKey(alert) === incidentId ? { ...alert, status: "COMPLETE" } : alert
    );

    LocalDB.saveAlerts(updated);

    Store.dispatch((state) => ({
      ...state,
      alerts: updated,
    }));
  },

  cancelAlert(incidentId) {
    const updated = Store.getState().alerts.map((alert) =>
      getIncidentKey(alert) === incidentId ? { ...alert, previousStatus: alert.status, status: "CANCEL", cancelledAt: new Date().toISOString() } : alert
    );

    LocalDB.saveAlerts(updated);

    Store.dispatch((state) => ({
      ...state,
      alerts: updated,
    }));
  },

  createAlert(alertData) {
    const incidentId = alertData.incident || alertData.incidentId || alertData.id;
    const newAlert = {
      incident: incidentId,
      incidentId,
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      ...alertData,
    };

    const alerts = [...Store.getState().alerts, newAlert];
    LocalDB.saveAlerts(alerts);

    Store.dispatch((state) => ({
      ...state,
      alerts,
    }));
  },

  async responseAlert(incidentId, eta, workType) {
    const state = Store.getState();
    const incidentAlerts = state.alerts.filter((item) => getIncidentKey(item) === incidentId);
    const alert = incidentAlerts[0];

    if (!alert) return;
    const selectedType = workType || alert.workType || "Other";

    let type = "other";
    if (selectedType === "Fiber") type = "fiber";
    if (selectedType === "Equipment") type = "equipment";
    const allCorrective = Object.values(state.corrective || {}).flat();
    const existingCard = allCorrective.find((item) => getIncidentKey(item) === incidentId);
    const correctiveCard = buildCorrectiveCard(incidentAlerts, selectedType, eta, existingCard);

    const updatedAlerts = state.alerts.filter((item) => getIncidentKey(item) !== incidentId);
    const updatedCorrective = {
      fiber: (state.corrective.fiber || []).filter((item) => getIncidentKey(item) !== incidentId),
      equipment: (state.corrective.equipment || []).filter((item) => getIncidentKey(item) !== incidentId),
      other: (state.corrective.other || []).filter((item) => getIncidentKey(item) !== incidentId),
    };
    updatedCorrective[type] = [...(updatedCorrective[type] || []), correctiveCard];

    try {
      const response = await fetch("/.netlify/functions/respond-incident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incident_number: incidentId, work_type: selectedType, eta }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.error || "RESPOND_INCIDENT_FAILED");
      }
    } catch (error) {
      console.warn("Respond API failed, applying local fallback:", error);
    }
    LocalDB.saveState({
      alerts: updatedAlerts,
      corrective: updatedCorrective,
    });

    Store.dispatch((current) => ({
      ...current,
      alerts: updatedAlerts,
      corrective: updatedCorrective,
    }));
  },
};