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
  },
  pageSize: 10,
  _renderPageHeader(state) {
    const FINISH_STATUSES = new Set(["COMPLETE","CLOSED","FINISHED","RESOLVED","DONE","NS_FINISH","CANCEL","CANCELLED","COMPLETED"]);
    const isActive = inc => !FINISH_STATUSES.has(String(inc.status || "").trim().toUpperCase());
    const fiberActive    = (state.corrective.fiber     || []).filter(isActive);
    const equipActive    = (state.corrective.equipment || []).filter(isActive);
    const totalActive    = fiberActive.length + equipActive.length;

    const wave = (color) => `<svg style="position:absolute;right:12px;top:50%;transform:translateY(-50%);width:56px;height:32px;opacity:.18" viewBox="0 0 56 32" preserveAspectRatio="none"><path d="M1 24 Q8 8 14 16 Q20 24 28 12 Q36 2 42 14 Q48 24 55 8" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/></svg>`;

    const wrap = document.createElement("div");
    wrap.className = "space-y-3 mb-1";
    wrap.innerHTML = `
      <div class="panel px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-black tracking-tight" style="color:var(--ink)">Corrective Workbench</h1>
          <p class="text-[10px] font-bold uppercase tracking-widest mt-0.5" style="color:var(--ink-muted)">งานที่กำลังแก้ไข · In-progress jobs</p>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button onclick="Store.dispatch(s=>({...s,ui:{...s.ui,activeCorrectiveTab:'fiber'}}))" class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors hover:opacity-80" style="border:1.5px solid var(--hair);color:var(--ink-muted);background:transparent;cursor:pointer">🔧 Fiber · ${fiberActive.length}</button>
          <button onclick="Store.dispatch(s=>({...s,ui:{...s.ui,activeCorrectiveTab:'equipment'}}))" class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors hover:opacity-80" style="border:1.5px solid var(--hair);color:var(--ink-muted);background:transparent;cursor:pointer">📦 Equipment · ${equipActive.length}</button>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-3">
        <div class="panel p-5 overflow-hidden relative" style="border-top:2px solid #ea580c">
          ${wave("#ea580c")}
          <div class="text-4xl font-black leading-none mb-1" style="color:#ea580c">${totalActive}</div>
          <div class="text-[10px] font-bold uppercase tracking-widest mt-1" style="color:var(--ink-muted)">Active Jobs</div>
          <div class="text-[9px] mt-0.5" style="color:var(--ink-dim)">Fiber + Equipment</div>
        </div>
        <div class="panel p-5 overflow-hidden relative" style="border-top:2px solid #3b82f6">
          ${wave("#3b82f6")}
          <div class="text-4xl font-black leading-none mb-1" style="color:#3b82f6">${fiberActive.length}</div>
          <div class="text-[10px] font-bold uppercase tracking-widest mt-1" style="color:var(--ink-muted)">Fiber</div>
          <div class="text-[9px] mt-0.5" style="color:var(--ink-dim)">Active fiber jobs</div>
        </div>
        <div class="panel p-5 overflow-hidden relative" style="border-top:2px solid #8b5cf6">
          ${wave("#8b5cf6")}
          <div class="text-4xl font-black leading-none mb-1" style="color:#8b5cf6">${equipActive.length}</div>
          <div class="text-[10px] font-bold uppercase tracking-widest mt-1" style="color:var(--ink-muted)">Equipment</div>
          <div class="text-[9px] mt-0.5" style="color:var(--ink-dim)">Active equipment jobs</div>
        </div>
      </div>
    `;
    return wrap;
  },
  render(state) {
    const tab = state.ui.activeCorrectiveTab;

    // Collect primary incidents + cross-tab incidents where workTypes includes this tab
    const TAB_TYPE = { fiber: "Fiber", equipment: "Equipment" };
    const currentTabType = TAB_TYPE[tab] || tab;
    const seen = new Set();
    const allIncidents = [];
    (state.corrective[tab] || []).forEach(inc => {
      const id = getIncidentKey(inc);
      if (!seen.has(id)) { seen.add(id); allIncidents.push(inc); }
    });
    ["fiber", "equipment"].filter(t => t !== tab).forEach(otherTab => {
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
    container.appendChild(this._renderPageHeader(state));

    if (!incidents.length) {
      const empty = document.createElement("div");
      empty.className = "panel p-12 text-center";
      empty.style.color = "var(--ink-muted)";
      empty.textContent = `No jobs in ${tab} queue`;
      container.appendChild(empty);
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
    controls.className = "panel px-4 py-3 flex flex-wrap items-center justify-between gap-3";
    controls.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="text-xs font-semibold uppercase tracking-wider" style="color:var(--ink-muted)">Showing <span style="color:var(--ink);font-weight:700">${pageStart + 1}–${Math.min(pageStart + pagedIncidents.length, incidents.length)}</span> of <span style="color:var(--ink);font-weight:700">${incidents.length}</span> jobs</div>
        <button class="corrective-export-btn btn btn-sm" style="background:#22c55e;color:#fff;border-color:#22c55e">
          <i data-lucide="download" class="pointer-events-none"></i> CSV
        </button>
      </div>
      <div class="flex items-center gap-2">
        <label class="text-xs font-semibold uppercase tracking-wider" style="color:var(--ink-muted)">Per page</label>
        <select class="corrective-page-size form-input" style="height:28px;padding:0 8px;font-size:11.5px">
          <option value="10" ${String(this.pageSize) === "10" ? "selected" : ""}>10</option>
          <option value="20" ${String(this.pageSize) === "20" ? "selected" : ""}>20</option>
          <option value="50" ${String(this.pageSize) === "50" ? "selected" : ""}>50</option>
          <option value="100" ${String(this.pageSize) === "100" ? "selected" : ""}>100</option>
          <option value="all" ${String(this.pageSize) === "all" ? "selected" : ""}>All</option>
        </select>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:nowrap">
          <button class="corrective-page-prev btn btn-sm btn-ghost ${currentPage <= 1 ? "opacity-40 cursor-not-allowed" : ""}" ${currentPage <= 1 ? "disabled" : ""}>Prev</button>
          <span class="text-[10px] font-bold px-3 py-1.5 rounded-lg" style="color:var(--ink-muted);background:var(--surface-2);border:1px solid var(--hair-soft);white-space:nowrap">${currentPage} / ${totalPages}</span>
          <button class="corrective-page-next btn btn-sm btn-ghost ${currentPage >= totalPages ? "opacity-40 cursor-not-allowed" : ""}" ${currentPage >= totalPages ? "disabled" : ""}>Next</button>
        </div>
      </div>
    `;
    container.appendChild(controls);

    const STATUS_STYLE = {
      RESPONDED:   { label: "Responded",   dot: "#3b82f6", bg: "rgba(59,130,246,.1)",  color: "#3b82f6" },
      ASSIGN:      { label: "Assigned",    dot: "#8b5cf6", bg: "rgba(139,92,246,.1)",  color: "#8b5cf6" },
      ASSIGNED:    { label: "Assigned",    dot: "#8b5cf6", bg: "rgba(139,92,246,.1)",  color: "#8b5cf6" },
      IN_PROGRESS: { label: "In Progress", dot: "#f97316", bg: "rgba(249,115,22,.1)",  color: "#f97316" },
      CORRECTIVE:  { label: "In Progress", dot: "#f97316", bg: "rgba(249,115,22,.1)",  color: "#f97316" },
      PROCESS:     { label: "In Progress", dot: "#f97316", bg: "rgba(249,115,22,.1)",  color: "#f97316" },
      ACTION:      { label: "In Progress", dot: "#f97316", bg: "rgba(249,115,22,.1)",  color: "#f97316" },
      ON_SITE:     { label: "ON SITE",     dot: "#ea580c", bg: "rgba(234,88,12,.12)",  color: "#ea580c" },
      ONSITE:      { label: "ON SITE",     dot: "#ea580c", bg: "rgba(234,88,12,.12)",  color: "#ea580c" },
      FINALIZING:  { label: "FINALIZING",  dot: "#0d9488", bg: "rgba(13,148,136,.1)", color: "#0d9488" },
      FINALIZE:    { label: "FINALIZING",  dot: "#0d9488", bg: "rgba(13,148,136,.1)", color: "#0d9488" },
    };
    const PROGRESS_MAP = {
      RESPONDED: 25, ASSIGN: 30, ASSIGNED: 35,
      IN_PROGRESS: 50, PROCESS: 50, CORRECTIVE: 50, ACTION: 50,
      ON_SITE: 65, ONSITE: 65,
      FINALIZING: 80, FINALIZE: 80,
    };

    pagedIncidents.forEach((incident) => {
      const card = document.createElement("article");
      const incidentKey = getIncidentKey(incident);
      const isHighlighted = state.ui.highlightIncidentId === incidentKey;
      const isDn  = incident.alertClass === "Dn";
      const isInf = incident.alertClass === "Inf";
      const borderColor = isDn ? "#f87171" : isInf ? "#fb923c" : "#cbd5e1";
      card.className = "corrective-card hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 relative overflow-hidden" + (isHighlighted ? " corrective-card-highlight" : "");
      card.style.borderLeft = `4px solid ${borderColor}`;
      card.dataset.correctiveId = incidentKey;

      const etaText = incident.eta || "-";
      const totalTickets = incident.tickets?.length || 0;
      const workType = Array.isArray(incident.workTypes) && incident.workTypes.length > 1
        ? incident.workTypes.join(" + ")
        : (incident.workType || "Fiber");

      const startTime = incident?.tickets?.[0]?.downTime || incident?.downTime || incident?.createdAt;
      const totalDownTime = calculateTotalDownTime(startTime);
      const latestEtr = getLatestETR(incident);

      const statusKey = String(incident.status || "").toUpperCase();
      const ss = STATUS_STYLE[statusKey] || { label: statusKey || "Active", dot: "#94a3b8", bg: "rgba(148,163,184,.1)", color: "#64748b" };
      const progress = Number(incident.progress) || PROGRESS_MAP[statusKey] || 40;
      const progressColor = progress >= 75 ? "#0d9488" : progress >= 50 ? "#ea580c" : "#3b82f6";

      // Team name
      const updates = incident.updates || [];
      const lastUpd = updates[updates.length - 1] || {};
      const subArr = lastUpd.subcontractors || lastUpd.subs || incident.subcontractors || [];
      const firstSub = Array.isArray(subArr) ? subArr[0] : null;
      const teamName = (typeof firstSub === "string" ? firstSub : firstSub?.name || firstSub?.company)
        || lastUpd.subcontractor || lastUpd.team
        || incident.team || incident.subcontractor || "-";

      card.innerHTML = `
        <!-- Top row: ID + badges -->
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex items-center gap-2 flex-wrap min-w-0">
            <span class="font-black text-sm tracking-tight" style="color:var(--ink)">${incidentKey}</span>
            ${isDn ? `<span class="tag dn shrink-0">Dn</span>` : isInf ? `<span class="tag inf shrink-0">Inf#</span>` : ""}
            <span class="px-2 py-0.5 rounded text-[10px] font-bold" style="border:1px solid var(--hair);color:var(--ink-muted);background:var(--surface-2)">${workType}</span>
            <span class="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap" style="background:${ss.bg};color:${ss.color}">
              <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:${ss.dot}"></span>${ss.label}
            </span>
          </div>
          <div class="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            <span class="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap" style="background:#111827;color:#fff">
              <i data-lucide="clock" class="w-3 h-3"></i> ETA ${etaText}
            </span>
            ${latestEtr ? `<span class="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap" style="border:1.5px solid #d97706;color:#d97706;background:rgba(217,119,6,.06)">
              <i data-lucide="flag" class="w-3 h-3"></i> ETR ${latestEtr}
            </span>` : ""}
            <span class="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap realtime-downtime" style="background:rgba(220,38,38,.07);border:1.5px solid rgba(220,38,38,.2);color:#dc2626" data-start="${startTime}">
              <i data-lucide="arrow-down-circle" class="w-3 h-3"></i> Down ${totalDownTime}
            </span>
          </div>
        </div>

        <!-- Node + Alarm -->
        <div class="mb-4">
          <h3 class="text-base font-black leading-tight" style="color:var(--ink)">${incident.node || "-"}</h3>
          <p class="text-sm font-semibold mt-0.5" style="color:var(--sev-dn)">${incident.alarm || "-"}</p>
        </div>

        <!-- Info row -->
        <div class="flex items-end gap-6 pt-3 mb-4" style="border-top:1px solid var(--hair-soft)">
          <div class="shrink-0">
            <p class="text-[9px] font-bold uppercase tracking-widest mb-0.5" style="color:var(--ink-muted)">Team</p>
            <p class="text-sm font-bold" style="color:var(--ink)">${teamName}</p>
          </div>
          <div class="shrink-0">
            <p class="text-[9px] font-bold uppercase tracking-widest mb-0.5" style="color:var(--ink-muted)">Tickets</p>
            <p class="text-sm font-bold" style="color:var(--ink)">${totalTickets} linked</p>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-[9px] font-bold uppercase tracking-widest mb-1.5 flex items-center justify-between" style="color:var(--ink-muted)">
              <span>Progress</span><span style="color:var(--ink)">${progress}%</span>
            </p>
            <div class="h-1.5 rounded-full overflow-hidden" style="background:var(--surface-2)">
              <div class="h-full rounded-full" style="width:${progress}%;background:${progressColor};transition:width .4s ease"></div>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-between gap-2">
          <div class="flex gap-1.5 flex-wrap">
            <button class="btn btn-sm btn-ghost btn-corrective-update" data-id="${incidentKey}">
              <i data-lucide="refresh-cw" class="w-3 h-3 pointer-events-none"></i> Update
            </button>
            <button class="btn btn-sm btn-corrective-finish" style="background:#111827;color:#fff;border-color:#111827" data-id="${incidentKey}">
              <i data-lucide="check" class="w-3 h-3 pointer-events-none"></i> NS Finish
            </button>
            <button class="btn btn-sm btn-ghost btn-corrective-detail" data-id="${incidentKey}">
              <i data-lucide="eye" class="w-3 h-3 pointer-events-none"></i> Details
            </button>
            ${typeof window.renderReportButton === "function" ? window.renderReportButton(incident) : `<button class="btn btn-sm btn-ghost btn-corrective-report" data-id="${incidentKey}"><i data-lucide="file-text" class="w-3 h-3 pointer-events-none"></i> Report</button>`}
          </div>
          <button class="btn btn-sm btn-ghost btn-corrective-cancel" style="color:#dc2626;border-color:transparent" data-id="${incidentKey}">× Cancel</button>
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
          el.innerHTML = `<i data-lucide="arrow-down-circle" class="w-3 h-3"></i> Down ${newTime}`;
          if (window.lucide) window.lucide.createIcons();
        }
      });
    }, 60000); // Update every minute
  },
}
