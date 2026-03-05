// scripts/repositories/incident.repository.js

const IncidentRepository = (function () {

  // Mock Database
  let incidents = [
    {
      id: 'I2603-001',
      type: 'fiber',
      severity: 'critical',
      status: 'alert',

      timeline: {
        openedAt: '2026-03-01',
        respondedAt: null,
        resolvedAt: null
      },

      corrective: null,

      audit: []
    }
  ];

  async function getAll() {
    return new Promise(resolve => {
        setTimeout(() => {
        resolve(structuredClone(incidents));
        }, 500);
    });
    }

  function save(allIncidents) {
    incidents = structuredClone(allIncidents);
  }

  return {
    getAll,
    save
  };

})();