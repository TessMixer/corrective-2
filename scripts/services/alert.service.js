// scripts/services/alert.service.js

window.AlertService = {
  async loadFromLocal() {
    const syncedState = await LocalDB.syncFromCloud();
    const alerts = syncedState.alerts || [];
    const calendarEvents = syncedState.calendarEvents || [];
    const corrective = syncedState.corrective || { fiber: [], equipment: [], other: [] };

    Store.dispatch((state) => ({
      ...state,
      alerts,
      calendarEvents,
      corrective: {
        fiber: corrective.fiber || [],
        equipment: corrective.equipment || [],
        other: corrective.other || [],
      },
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
      alert.incidentId === incidentId ? { ...alert, status: "COMPLETE" } : alert
    );

    LocalDB.saveAlerts(updated);

    Store.dispatch((state) => ({
      ...state,
      alerts: updated,
    }));
  },

  cancelAlert(incidentId) {
    const updated = Store.getState().alerts.map((alert) =>
      alert.incidentId === incidentId ? { ...alert, status: "CANCEL" } : alert
    );

    LocalDB.saveAlerts(updated);

    Store.dispatch((state) => ({
      ...state,
      alerts: updated,
    }));
  },

  createAlert(alertData) {
    const newAlert = {
      incidentId: alertData.incidentId,
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
    const alert = state.alerts.find((item) => item.incidentId === incidentId);

    if (!alert) return;
    const selectedType = workType || alert.workType || "Other";

    let type = "other";
    if (selectedType === "Fiber") type = "fiber";
    if (selectedType === "Equipment") type = "equipment";

    const updatedAlerts = state.alerts.filter((item) => item.incidentId !== incidentId);
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