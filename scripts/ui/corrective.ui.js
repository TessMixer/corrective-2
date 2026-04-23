function getIncidentKey(incident) {
  return incident?.incident || incident?.incidentId || incident?.id || "-";
}

function getSortTime(incident) {
  const timeStr = incident?.createdAt
    || incident?.openedAt
    || incident?.tickets?.[0]?.downTime
    || incident?.updates?.slice(-1)?.[0]?.actionDate
    || 0;

  const parsed = window.DateUtils ? window.DateUtils.parseDate(timeStr) : new Date(timeStr || 0);
  return parsed ? parsed.getTime() : 0;
}

function calculateTotalDownTime(startTime) {
  if (!startTime) return "-";
  const mins = window.DateUtils ? window.DateUtils.getDurationMinutes(startTime) : 0;
  return window.DateUtils ? window.DateUtils.formatDuration(mins) : `${mins}m`;
}
function getLatestETR(incident) {
  const updates = incident?.updates || [];
  if (updates.length) {
    for (let i = updates.length - 1; i >= 0; i--) {
      const up = updates[i];
      // Priority 1: If we have specific hour/min fields, use them formatted
      if (up.etrHour || up.etrMin) {
        const h = up.etrHour || "0";
        const m = up.etrMin || "00";
        return `${h}.${String(m).padStart(2, '0')} hrs`;
      }

      // Priority 2: Use existing etr/eta strings
      const etr = up.etr || up.eta;
      if (etr && etr !== "-") return etr;
    }
  }

  // 2. Fallback to top-level etr/eta
  return incident?.etr || incident?.eta || null;
}

const CorrectiveUI = {
  pageByTab: {
    fiber: 1,
    equipment: 1,
    other: 1,
  },
  pageSize: 10,
  render(state) {
    const tab = state.ui.activeCorrectiveTab;

    // Collect primary incidents + cross-tab incidents where workTypes includes this tab
    const TAB_TYPE = { fiber: "Fiber", equipment: "Equipment", other: "Other" };
    const currentTabType = TAB_TYPE[tab] || tab;
    const seen = new Set();
    const allIncidents = [];
    (state.corrective[tab] || []).forEach(inc => {
      const id = getIncidentKey(inc);
      if (!seen.has(id)) { seen.add(id); allIncidents.push(inc); }
    });
    ["fiber", "equipment", "other"].filter(t => t !== tab).forEach(otherTab => {
      (state.corrective[otherTab] || []).forEach(inc => {
        const id = getIncidentKey(inc);
        if (!seen.has(id) && Array.isArray(inc.workTypes) && inc.workTypes.includes(currentTabType)) {
          seen.add(id); allIncidents.push(inc);
        }
      });
    });

    const incidents = allIncidents
      .filter((incident) => {
        const s = String(incident.status || "").trim().toUpperCase();
        const isFinished = ["COMPLETE", "CLOSED", "FINISHED", "RESOLVED", "DONE", "NS_FINISH", "CANCEL", "CANCELLED", "COMPLETED"].includes(s);
        return !isFinished;
      })
      .slice()
      .sort((a, b) => getSortTime(b) - getSortTime(a));

    const container = document.createElement("div");
    container.className = "space-y-4";

    if (!incidents.length) {
      container.innerHTML = `
        <div class="ops-panel p-12 text-center text-slate-400">
          No jobs in ${tab} queue
        </div>
      `;
      return container;
    }

    const normalizedTab = String(tab || "fiber").toLowerCase();
    const size = this.pageSize === "all" ? incidents.length || 1 : Number(this.pageSize || 10);
    const totalPages = Math.max(1, Math.ceil(incidents.length / size));
    const currentPage = Math.min(this.pageByTab[normalizedTab] || 1, totalPages);
    this.pageByTab[normalizedTab] = currentPage;
    const pageStart = (currentPage - 1) * size;
    const pagedIncidents = incidents.slice(pageStart, pageStart + size);

    const controls = document.createElement("div");
    controls.className = "bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 flex flex-wrap items-center justify-between gap-3";
    controls.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Showing <span class="text-slate-700 font-bold">${pageStart + 1}–${Math.min(pageStart + pagedIncidents.length, incidents.length)}</span> of <span class="text-slate-700 font-bold">${incidents.length}</span> jobs</div>
        <button class="corrective-export-btn flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors shadow-sm shadow-emerald-200">
          <i data-lucide="download" class="w-3 h-3 pointer-events-none"></i> CSV
        </button>
      </div>
      <div class="flex items-center gap-2">
        <label class="text-xs text-slate-400 font-semibold uppercase tracking-wider">Per page</label>
        <select class="corrective-page-size bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-300">
          <option value="10" ${String(this.pageSize) === "10" ? "selected" : ""}>10</option>
          <option value="20" ${String(this.pageSize) === "20" ? "selected" : ""}>20</option>
          <option value="50" ${String(this.pageSize) === "50" ? "selected" : ""}>50</option>
          <option value="100" ${String(this.pageSize) === "100" ? "selected" : ""}>100</option>
          <option value="all" ${String(this.pageSize) === "all" ? "selected" : ""}>All</option>
        </select>
        <button class="corrective-page-prev px-4 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-600 transition-colors ${currentPage <= 1 ? "opacity-40 cursor-not-allowed" : ""}" ${currentPage <= 1 ? "disabled" : ""}>Prev</button>
        <span class="text-[10px] font-bold text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">${currentPage} / ${totalPages}</span>
        <button class="corrective-page-next px-4 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-600 transition-colors ${currentPage >= totalPages ? "opacity-40 cursor-not-allowed" : ""}" ${currentPage >= totalPages ? "disabled" : ""}>Next</button>
      </div>
    `;
    container.appendChild(controls);

    pagedIncidents.forEach((incident) => {
      const card = document.createElement("article");
      const incidentKey = getIncidentKey(incident);
      const isHighlighted = state.ui.highlightIncidentId === incidentKey;
      const isDn  = incident.alertClass === "Dn";
      const isInf = incident.alertClass === "Inf";
      const borderAccent = isDn  ? "border-l-4 border-l-rose-400"
                         : isInf ? "border-l-4 border-l-amber-400"
                                 : "border-l-4 border-l-slate-200";
      card.className = "bg-white rounded-2xl md:rounded-3xl p-3 md:p-6 shadow-sm border border-slate-200 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 relative overflow-hidden " + borderAccent + " " + (isHighlighted ? "ring-2 ring-orange-500 bg-orange-50/20" : "");
      card.dataset.correctiveId = incidentKey;

      const etaText = incident.eta || "-";
      const totalTickets = incident.tickets?.length || 0;
      const workType = Array.isArray(incident.workTypes) && incident.workTypes.length > 1
        ? incident.workTypes.join(" + ")
        : (incident.workType || "Fiber");

      const startTime = incident?.tickets?.[0]?.downTime || incident?.downTime || incident?.createdAt;
      const totalDownTime = calculateTotalDownTime(startTime);
      const latestEtr = getLatestETR(incident);

      card.innerHTML = `
        <div class="flex items-start justify-between gap-2 border-b border-slate-100 pb-2 mb-2 md:pb-4 md:mb-4">
          <div class="min-w-0 flex-1">
            <h3 class="text-sm md:text-lg font-bold text-orange-600 flex items-center gap-1.5"><i data-lucide="wrench" class="w-4 h-4 text-orange-400 shrink-0"></i> <span class="truncate">${incidentKey}</span>${incident.alertClass === "Inf" ? `<span class="px-1.5 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded text-[9px] font-black uppercase tracking-wider shrink-0">Inf#</span>` : incident.alertClass === "Dn" ? `<span class="px-1.5 py-0.5 bg-rose-100 text-rose-700 border border-rose-200 rounded text-[9px] font-black uppercase tracking-wider shrink-0">Dn</span>` : ""}</h3>
            <p class="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">${workType} - ${incident.node || "-"}</p>
          </div>
          <div class="flex flex-col items-end gap-1 shrink-0">
            <div class="flex gap-1 flex-wrap justify-end">
              ${latestEtr ? `<span class="px-2 py-0.5 bg-amber-500 text-white rounded-lg text-[9px] md:text-[10px] font-bold whitespace-nowrap">ETR: ${latestEtr}</span>` : ""}
              <span class="px-2 py-0.5 bg-zinc-900 text-white rounded-lg text-[9px] md:text-[10px] font-bold whitespace-nowrap">ETA: ${etaText}</span>
            </div>
            <div class="px-2 py-0.5 bg-rose-50 text-rose-600 rounded-lg text-[9px] md:text-[10px] font-bold border border-rose-100 flex items-center gap-0.5 realtime-downtime" data-start="${startTime}">
              <i data-lucide="clock" class="w-3 h-3"></i> Down: ${totalDownTime}
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 py-1 md:py-2">
          <div class="bg-slate-50/50 p-2 md:p-4 rounded-xl md:rounded-2xl border border-slate-100">
            <p class="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Node</p>
            <p class="text-xs md:text-sm font-bold text-slate-700 truncate" title="${incident.node}">${incident.node || "-"}</p>
          </div>
          <div class="bg-slate-50/50 p-2 md:p-4 rounded-xl md:rounded-2xl border border-slate-100">
            <p class="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Alarm</p>
            <p class="text-xs md:text-sm font-bold text-rose-500 truncate" title="${incident.alarm}">${incident.alarm || "-"}</p>
          </div>
          <div class="bg-slate-50/50 p-2 md:p-4 rounded-xl md:rounded-2xl border border-slate-100">
            <p class="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Detail</p>
            ${(() => {
              const detail = incident.detail || (incident.updates || []).slice().reverse().find(u => u.message)?.message || "-";
              return `<p class="text-xs md:text-sm text-slate-600 line-clamp-2 leading-snug" title="${detail}">${detail}</p>`;
            })()}
          </div>
          <div class="bg-slate-50/50 p-2 md:p-4 rounded-xl md:rounded-2xl border border-slate-100">
            <p class="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Tickets</p>
            <p class="text-base md:text-xl font-bold text-slate-800 leading-none">${totalTickets}</p>
          </div>
        </div>

        <div class="mt-2 pt-2 md:mt-4 md:pt-4 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div class="flex gap-1.5">
            <button class="px-3 py-1.5 md:px-5 md:py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] md:text-xs font-bold transition-colors btn-corrective-update" data-id="${incidentKey}">Update</button>
            <button class="px-3 py-1.5 md:px-5 md:py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 rounded-xl text-[10px] md:text-xs font-bold transition-all btn-corrective-finish" data-id="${incidentKey}">NS Finish</button>
            <button class="px-3 py-1.5 md:px-5 md:py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-[10px] md:text-xs font-bold transition-colors btn-corrective-cancel" data-id="${incidentKey}">Cancel</button>
          </div>
          <div class="flex gap-1.5">
            <button class="px-2 py-1 text-slate-500 hover:bg-slate-100 rounded-lg text-[9px] md:text-[10px] font-bold transition-colors uppercase btn-corrective-edit-type" data-id="${incidentKey}">Edit Type</button>
            <button class="px-2 py-1 text-orange-600 hover:bg-orange-50 rounded-lg text-[9px] md:text-[10px] font-bold transition-colors uppercase btn-corrective-detail" data-id="${incidentKey}">Details</button>
            ${typeof window.renderReportButton === "function" ? window.renderReportButton(incident) : `<button class="px-2 py-1 text-purple-600 hover:bg-purple-50 rounded-lg text-[9px] md:text-[10px] font-bold transition-colors uppercase btn-corrective-report" data-id="${incidentKey}">Report</button>`}
          </div>
        </div>
      `;

      container.appendChild(card);
    });

    const rerender = () => {
      Store.dispatch((s) => ({ ...s }));
    };

    controls.querySelector(".corrective-export-btn")?.addEventListener("click", () => {
      if (window.ExportUtil) ExportUtil.exportCorrective(incidents, currentTabType);
    });

    controls.querySelector(".corrective-page-size")?.addEventListener("change", (event) => {
      this.pageSize = event.target.value === "all" ? "all" : Number(event.target.value || 10);
      this.pageByTab[normalizedTab] = 1;
      rerender();
    });
    controls.querySelector(".corrective-page-prev")?.addEventListener("click", () => {
      if (this.pageByTab[normalizedTab] > 1) {
        this.pageByTab[normalizedTab] -= 1;
        rerender();
      }
    });
    controls.querySelector(".corrective-page-next")?.addEventListener("click", () => {
      if (this.pageByTab[normalizedTab] < totalPages) {
        this.pageByTab[normalizedTab] += 1;
        rerender();
      }
    });

    this.startTimer();

    return container;
  },
  startTimer() {
    if (this.timerInterval) return;
    this.timerInterval = setInterval(() => {
      document.querySelectorAll(".realtime-downtime").forEach((el) => {
        const startTime = el.dataset.start;
        if (startTime) {
          const newTime = calculateTotalDownTime(startTime);
          el.innerHTML = `<i data-lucide="clock" class="w-3 h-3"></i> Down: ${newTime}`;
          if (window.lucide) window.lucide.createIcons();
        }
      });
    }, 60000); // Update every minute
  },
}
