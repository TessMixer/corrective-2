// scripts/services/alert.service.js
function getIncidentKey(alert) {
  return alert?.incident || alert?.incidentId || alert?.id;
}

window.AlertService = {
  async loadFromLocal() {
    const res = await fetch("/.netlify/functions/get-alerts", { cache: "no-store" });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || "LOAD_ALERTS_FAILED");
    }

    const alerts = Array.isArray(data.alerts) ? data.alerts : [];

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

  responseAlert(incidentId, eta, workType) {
    const state = Store.getState();
    const alert = state.alerts.find((item) => getIncidentKey(item) === incidentId);

    if (!alert) return;
    const selectedType = workType || alert.workType || "Other";

    let type = "other";
    if (selectedType === "Fiber") type = "fiber";
    if (selectedType === "Equipment") type = "equipment";

    const updatedAlerts = state.alerts.filter((item) => getIncidentKey(item) !== incidentId);
    const updatedCorrective = {
      ...state.corrective,
      [type]: [...(state.corrective[type] || []), { ...alert, workType: selectedType, eta, status: "PROCESS", respondedAt: new Date().toISOString() }],
    };

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