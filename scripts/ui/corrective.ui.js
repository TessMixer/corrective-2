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
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-2xl md:text-3xl font-extrabold text-orange-600 leading-tight">${incident.incidentId}</h3>
            <p class="text-slate-500 text-base md:text-xl mt-1.5">${workType} - ${incident.node || "-"}</p>
          </div>
          <span class="eta-badge" style="font-size:12px;padding:5px 10px">${etaText}</span>
        </div>

        <div class="corrective-grid mt-5 md:mt-6">
          <div>
            <p class="corrective-label">Node</p>
            <p class="corrective-value" style="font-size:clamp(1rem,2.4vw,1.75rem);line-height:1.35">${incident.node || "-"}</p>
          </div>
          <div>
            <p class="corrective-label">Alarm</p>
            <p class="corrective-value" style="font-size:clamp(1rem,2.4vw,1.75rem);line-height:1.35">${incident.alarm || "-"}</p>
          </div>
          <div>
            <p class="corrective-label">Response</p>
            <p class="corrective-value" style="font-size:clamp(1rem,2.4vw,1.75rem);line-height:1.35">${etaText}</p>
          </div>
          <div>
            <p class="corrective-label">Total Tickets</p>
            <p class="corrective-value" style="font-size:clamp(1rem,2.4vw,1.75rem);line-height:1.35">${totalTickets}</p>
          </div>
        </div>

        <div class="corrective-footer mt-5">
          <div class="flex gap-3 flex-wrap">
            <button class="btn-action btn-action-primary btn-corrective-update" data-id="${incident.incidentId}" style="font-size:12px;padding:6px 10px">Update</button>
            <button class="btn-action btn-action-success btn-corrective-finish" data-id="${incident.incidentId}" style="font-size:12px;padding:6px 10px">NS Finish</button>
            <button class="btn-action btn-action-danger" style="font-size:12px;padding:6px 10px">Cancel</button>
          </div>
          <button class="btn-action btn-action-purple" style="font-size:12px;padding:6px 10px">View Detail</button>
        </div>
      `;

      container.appendChild(card);
    });

    return container;
  },
};