const LocalDB = {
  KEY: "noc-store",
  LEGACY_ALERT_KEY: "noc-alerts",

  getState() {
    const data = localStorage.getItem(this.KEY);

    if (data) {
      try {
        const parsed = JSON.parse(data);
        return {
          alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
          corrective: parsed.corrective || { fiber: [], equipment: [], other: [] },
        };
      } catch {
        return { alerts: [], corrective: { fiber: [], equipment: [], other: [] } };
      }
    }

    const legacyAlerts = localStorage.getItem(this.LEGACY_ALERT_KEY);
    if (legacyAlerts) {
      try {
        return {
          alerts: JSON.parse(legacyAlerts) || [],
          corrective: { fiber: [], equipment: [], other: [] },
        };
      } catch {
        return { alerts: [], corrective: { fiber: [], equipment: [], other: [] } };
      }
    }

    return { alerts: [], corrective: { fiber: [], equipment: [], other: [] } };
  },

  saveState(nextState) {
    const state = {
      alerts: Array.isArray(nextState.alerts) ? nextState.alerts : [],
      corrective: nextState.corrective || { fiber: [], equipment: [], other: [] },
    };

    localStorage.setItem(this.KEY, JSON.stringify(state));
    localStorage.setItem(this.LEGACY_ALERT_KEY, JSON.stringify(state.alerts));
  },

  getAlerts() {
    return this.getState().alerts;
  },

  saveAlerts(alerts) {
    const current = this.getState();
    this.saveState({ ...current, alerts });
  },

  getCorrective() {
    return this.getState().corrective;
  },

  saveCorrective(corrective) {
    const current = this.getState();
    this.saveState({ ...current, corrective });
  },

  addAlert(alert) {
    const current = this.getState();
    current.alerts.push(alert);
    this.saveState(current);
  },

  deleteAlert(incidentId) {
    const current = this.getState();
    current.alerts = current.alerts.filter((alert) => alert.incidentId !== incidentId);
    this.saveState(current);
  },
};