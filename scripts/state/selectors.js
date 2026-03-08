// scripts/state/selectors.js

const Selectors = {

  getAllIncidents(state) {
    return state.incidents;
  },

  getActiveIncidents(state) {
    return state.incidents.filter(i => i.status !== 'closed' && i.status !== 'deleted');
  },

  getClosedIncidents(state) {
    return state.incidents.filter(i => i.status === 'closed');
  },

  getRecycleBin(state) {
    return state.incidents.filter(i => i.status === 'deleted');
  },

  getIncidentsByDate(state, date) {
    return state.incidents.filter(i => i.timeline.openedAt === date);
  }

};