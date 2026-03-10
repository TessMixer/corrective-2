// scripts/services/incident.service.js

const IncidentService = {

    validateCreateAlert(payload) {
        if (!payload.id) throw new Error('INCIDENT_ID_REQUIRED');
        if (!payload.type) throw new Error('TYPE_REQUIRED');
        if (!payload.severity) throw new Error('SEVERITY_REQUIRED');
        },
        async loadInitialData() {
            const data = await IncidentRepository.getAll();

            Store.dispatch(state => ({
                ...state,
                incidents: data
            }));
            },

  createAlert(payload) {
    this.validateCreateAlert(payload);
    Store.dispatch(state => {
      const newIncident = {
        id: payload.id,
        type: payload.type,
        severity: payload.severity,
        status: 'alert',

        timeline: {
          openedAt: payload.openedAt,
          respondedAt: null,
          resolvedAt: null
        },

        corrective: null,
        audit: [
          {
            time: new Date().toISOString(),
            actor: state.user.name,
            action: 'CREATE_ALERT'
          }
        ]
      };

      const updated = [...state.incidents, newIncident];
      IncidentRepository.save(updated);
      NotificationUI.show('Incident created', 'success');
      return { ...state, incidents: updated };
    });
  },

  assignCorrective(id, correctiveData) {
    Store.dispatch(state => {
      const updated = state.incidents.map(i => {
        if (i.id !== id) return i;

        return {
          ...i,
          status: 'corrective',
          corrective: correctiveData,
          timeline: {
            ...i.timeline,
            respondedAt: new Date().toISOString()
          },
          audit: [
            ...i.audit,
            {
              time: new Date().toISOString(),
              actor: state.user.name,
              action: 'ASSIGN_CORRECTIVE'
            }
          ]
        };
      });

      IncidentRepository.save(updated);
      return { ...state, incidents: updated };
    });
  },

  closeIncident(id) {
    Store.dispatch(state => {
      const updated = state.incidents.map(i => {
        if (i.id !== id) return i;

        return {
          ...i,
          status: 'closed',
          timeline: {
            ...i.timeline,
            resolvedAt: new Date().toISOString()
          },
          audit: [
            ...i.audit,
            {
              time: new Date().toISOString(),
              actor: state.user.name,
              action: 'CLOSE_INCIDENT'
            }
          ]
        };
      });

      IncidentRepository.save(updated);
      return { ...state, incidents: updated };
    });
  },

  softDelete(id) {
    Store.dispatch(state => {
      const updated = state.incidents.map(i =>
        i.id === id ? { ...i, status: 'deleted' } : i
      );
      IncidentRepository.save(updated);
      return { ...state, incidents: updated };
    });
  },

  restore(id) {
    Store.dispatch(state => {
      const updated = state.incidents.map(i =>
        i.id === id ? { ...i, status: 'alert' } : i
      );
      IncidentRepository.save(updated);
      return { ...state, incidents: updated };
    });
  }

};