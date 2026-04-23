// scripts/repositories/incident.repository.js

const IncidentRepository = (function () {
  async function getAll() {
    if (window.LocalDB) {
      return window.LocalDB.getAlerts();
    }
    return [];
  }

  function save(allIncidents) {
    if (window.LocalDB) {
      window.LocalDB.saveAlerts(allIncidents);
    }
  }

  return {
    getAll,
    save
  };
})();