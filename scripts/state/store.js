// scripts/state/store.js

/**
 * Global Application State (Single Source of Truth)
 * เปลี่ยน state ได้ผ่าน dispatch เท่านั้น
 */

const Store = (function () {

  // ===== PRIVATE STATE =====
    let state = {
      user: {
        id: 'u-001',
        name: 'Operator',
        role: 'noc'
      },

      alerts: [],
      calendarEvents: [],

      corrective: { 
        fiber: [],
        equipment: [],
        other: []
      },

      ui: {
        currentView: 'alert',
        selectedDate: null,
        activeCorrectiveTab: 'fiber',
        activeHistoryTab: 'fiber',
        historyPage: 1,
        calendarMode: 'month',
        calendarFocusDate: new Date().toISOString(),
        calendarFilter: 'all',
        dashboardSubView: 'main',
        dashboardSheetName: 'Dashboard (3 Hrs.)',
        dashboardSlaHours: 3,
        dashboardDetailsSheetName: 'Details',
        dashboardDetailsSubView: 'data-sheet',
        alertDetailReturnView: 'alert',
        modal: null,
        dashboardDetailsPage: 1,
        searchIncidentPage: 1
      }

    };

  // ผู้ฟังการเปลี่ยนแปลง state
  const listeners = [];
  const dispatchQueue = [];
  let isDispatching = false;

  // ===== CORE METHODS =====

  function getState() {
    // ป้องกันการแก้ไข state ตรงๆ
    return structuredClone(state);
  }

  function setState(newState) {
    state = newState;
    notify();
  }

  function dispatch(reducer) {
    // ถ้ากำลัง dispatch อยู่ให้เข้าคิวก่อน ป้องกัน re-entrancy ทำให้ state ทับกัน
    if (isDispatching) {
      dispatchQueue.push(reducer);
      return;
    }
    isDispatching = true;
    try {
      const current = getState();
      const updated = reducer(current);
      setState(updated);
    } finally {
      isDispatching = false;
      if (dispatchQueue.length > 0) {
        dispatch(dispatchQueue.shift());
      }
    }
  }

  function subscribe(fn) {
    listeners.push(fn);
  }

  function notify() {
    listeners.forEach(fn => fn(getState()));
  }

  // ===== PUBLIC API =====
  return {
    getState,
    dispatch,
    subscribe
  };
})();

/**
 * SELECTORS: Helper functions to extract derived data from state
 */
const Selectors = {
  getAllIncidents: (state) => state.alerts || [],

  getActiveIncidents: (state) => (state.alerts || []).filter(i => {
    const s = (i.status || '').toLowerCase();
    return s !== 'closed' && s !== 'cancel' && s !== 'cancelled' && s !== 'deleted';
  }),

  getClosedIncidents: (state) => (state.alerts || []).filter(i => {
    const s = (i.status || '').toLowerCase();
    return s === 'closed' || s === 'resolved';
  }),

  getRecycleBin: (state) => {
    const CANCEL_STATUSES = ["CANCEL", "CANCELLED"];

    // 1. Alerts ที่ถูก cancel
    const cancelledAlerts = (state.alerts || [])
      .filter(a => CANCEL_STATUSES.includes((a.status || "").toUpperCase()))
      .map(a => ({ ...a, _recycleSource: "alert" }));

    // 2. Corrective items ที่ถูก cancel (fiber/equipment/other)
    const corrective = state.corrective || {};
    const cancelledCorrective = [
      ...(corrective.fiber || []),
      ...(corrective.equipment || []),
      ...(corrective.other || []),
    ]
      .filter(item => CANCEL_STATUSES.includes((item.status || "").toUpperCase()))
      .map(item => ({ ...item, _recycleSource: "corrective" }));

    return [...cancelledAlerts, ...cancelledCorrective];
  }
};

window.Store = Store;
window.Selectors = Selectors;
