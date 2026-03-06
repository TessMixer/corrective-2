const CorrectiveUI = {
  render(state) {
    const tab = state.ui.activeCorrectiveTab;
    const incidents = state.corrective[tab] || [];

    const container = document.createElement("div");
    container.className = "space-y-4";

    if (!incidents.length) {
      container.innerHTML = `
        <div class="ops-panel p-12 text-center text-slate-400">
          ยังไม่มีงานในคิว ${tab}
        </div>
      `;
      return container;
    }

    incidents.forEach((incident) => {
      const card = document.createElement("article");
      card.className = "corrective-card";

      const etaText = incident.eta || "-";
      const totalTickets = incident.tickets?.length || 0;
      const workType = incident.workType || "Fiber";

      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div>
            <h3 class="incident-title text-orange-600">${incident.incidentId}</h3>
            <p class="incident-subtitle mt-1">${workType} - ${incident.node || "-"}</p>
          </div>
          <span class="eta-badge">${etaText}</span>
        </div>

        <div class="corrective-grid mt-3">
          <div>
            <p class="corrective-label">Node</p>
            <p class="corrective-value">${incident.node || "-"}</p>
          </div>
          <div>
            <p class="corrective-label">Alarm</p>
            <p class="corrective-value alarm-text">${incident.alarm || "-"}</p>
          </div>
          <div>
            <p class="corrective-label">Response</p>
            <p class="corrective-value metric-number">${etaText}</p>
          </div>
          <div>
            <p class="corrective-label">Total Tickets</p>
            <p class="corrective-value metric-number">${totalTickets}</p>
          </div>
        </div>

        <div class="corrective-footer">
          <div class="flex gap-2 flex-wrap">
            <button class="btn-action btn-action-primary btn-corrective-update" data-id="${incident.incidentId}">Update</button>
            <button class="btn-action btn-action-success btn-corrective-finish" data-id="${incident.incidentId}">NS Finish</button>
            <button class="btn-action btn-action-danger">Cancel</button>
          </div>
          <button class="btn-action btn-action-purple">View Detail</button>
        </div>
      `;

      container.appendChild(card);
    });

    return container;
  },
};