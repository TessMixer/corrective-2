const LocalDB = {
  KEY: "noc-store",
  LEGACY_ALERT_KEY: "noc-alerts",

  normalizeState(input) {
    return {
      alerts: Array.isArray(input?.alerts) ? input.alerts : [],
      calendarEvents: Array.isArray(input?.calendarEvents) ? input.calendarEvents : [],
      corrective: input?.corrective || { fiber: [], equipment: [], other: [] },
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

  async syncFromCloud() {
    if (!window.FirebaseSync?.loadCloudState) {
      return this.getState();
    }

    try {
      const cloudState = await window.FirebaseSync.loadCloudState();
      if (!cloudState) {
        return this.getState();
      }

      const normalized = this.normalizeState(cloudState);
      this.saveState(normalized, { skipCloudSync: true });
      return normalized;
    } catch (error) {
      console.warn("Cloud sync (read) failed, using local state:", error);
      return this.getState();
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

    localStorage.setItem(this.KEY, JSON.stringify(state));
    localStorage.setItem(this.LEGACY_ALERT_KEY, JSON.stringify(state.alerts));

    if (!options.skipCloudSync && window.FirebaseSync?.saveCloudState) {
      window.FirebaseSync.saveCloudState(state).catch((error) => {
        console.warn("Cloud sync (write) failed:", error);
      });
    }
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

  getCalendarEvents() {
    return this.getState().calendarEvents;
  },

  saveCalendarEvents(calendarEvents) {
    const current = this.getState();
    this.saveState({ ...current, calendarEvents });
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