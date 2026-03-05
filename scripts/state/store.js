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

      incidents: [],
      alerts: [],

      corrective: { 
        fiber: [],
        equipment: [],
        other: []
      },

      ui: {
        currentView: 'dashboard',
        selectedDate: null,
        activeCorrectiveTab: 'fiber',
        modal: null
      }
    };

  // ผู้ฟังการเปลี่ยนแปลง state
  const listeners = [];

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
    const current = getState();
    const updated = reducer(current);
    setState(updated);
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