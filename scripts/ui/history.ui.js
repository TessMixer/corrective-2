// scripts/ui/history.ui.js

const HistoryUI = (function () {
  const HISTORY_TYPES = [
    { key: "fiber", label: "Fiber" },
    { key: "equipment", label: "Equipment" },
    { key: "improvement", label: "Improvement" },
  ];
  const PAGE_SIZE = 10;

  function formatDateTime(value) {
    return window.DateUtils ? window.DateUtils.formatDateTime(value) : String(value || "-");
  }

  function getIncidentKey(incident) {
    return incident?.incident || incident?.incidentId || incident?.id || "-";
  }

  function getCompletedByType(state, typeKey) {
    // Include completed incidents from other tabs where workTypes includes this typeKey
    const TAB_TYPE = { fiber: "Fiber", equipment: "Equipment", other: "Other" };
    const currentTabType = TAB_TYPE[typeKey] || typeKey;
    const seen = new Set();
    const list = [];
    (state.corrective[typeKey] || []).forEach(item => {
      const id = item?.incident || item?.incidentId || item?.id;
      if (!seen.has(id)) { seen.add(id); list.push(item); }
    });
    ["fiber", "equipment", "other"].filter(t => t !== typeKey).forEach(otherTab => {
      (state.corrective[otherTab] || []).forEach(item => {
        const id = item?.incident || item?.incidentId || item?.id;
        if (!seen.has(id) && Array.isArray(item.workTypes) && item.workTypes.includes(currentTabType)) {
          seen.add(id); list.push(item);
        }
      });
    });
    return list
      .filter((item) => {
        const status = String(item.status || "").trim().toUpperCase();
        const hasFinishTime = Boolean(item?.completedAt || item?.nsFinish?.times?.upTime || item.nsFinishTime || item.completed_at);
        const isFinished = ["COMPLETE", "CLOSED", "FINISHED", "RESOLVED", "DONE", "NS_FINISH", "COMPLETED"].includes(status);
        return isFinished || hasFinishTime;
      })
      .sort((a, b) => {
        const aParsed = window.DateUtils ? window.DateUtils.parseDate(a.completedAt || a.nsFinish?.times?.upTime || 0) : new Date(a.completedAt || a.nsFinish?.times?.upTime || 0);
        const bParsed = window.DateUtils ? window.DateUtils.parseDate(b.completedAt || b.nsFinish?.times?.upTime || 0) : new Date(b.completedAt || b.nsFinish?.times?.upTime || 0);
        const aTime = aParsed ? aParsed.getTime() : 0;
        const bTime = bParsed ? bParsed.getTime() : 0;
        return bTime - aTime;
      });
  }

  function getFinishedImprovements() {
    const results = [];

    // CID-based improvements
    try {
      const notes = JSON.parse(localStorage.getItem("noc-improvements") || "{}");
      Object.entries(notes).forEach(([cid, data]) => {
        if (data.status === "finished") {
          results.push({
            _type: "cid",
            cid,
            finishedAt: data.finishedAt || null,
            items: data.items || [],
          });
        }
      });
    } catch { /* ignore */ }

    // Location improvements
    try {
      const locs = JSON.parse(localStorage.getItem("noc-hotspot-improvements") || "{}");
      Object.entries(locs).forEach(([key, imp]) => {
        if (imp.status === "finished") {
          results.push({
            _type: "location",
            key,
            area: imp.area || "Unknown area",
            lat: imp.lat,
            lng: imp.lng,
            radiusKm: imp.radiusKm,
            incidentCount: imp.incidentCount || 0,
            resolvedBy: imp.resolvedBy || "NOC",
            actionNote: imp.actionNote || "",
            finishedAt: imp.finishedAt || imp.resolvedAt || null,
          });
        }
      });
    } catch { /* ignore */ }

    return results.sort((a, b) => {
      const ta = a.finishedAt ? new Date(a.finishedAt).getTime() : 0;
      const tb = b.finishedAt ? new Date(b.finishedAt).getTime() : 0;
      return tb - ta;
    });
  }

  function renderImprovementCard(imp) {
    const date = imp.finishedAt ? formatDateTime(imp.finishedAt) : "-";

    if (imp._type === "cid") {
      return `
        <article class="bg-white rounded-2xl md:rounded-3xl p-4 md:p-6 shadow-sm border border-emerald-200 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group border-l-4 border-l-emerald-400">
          <div class="flex items-start justify-between gap-2 border-b border-slate-100 pb-3 mb-3">
            <div class="min-w-0">
              <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">CID Improvement</p>
              <h3 class="text-base font-black text-slate-800 group-hover:text-orange-600 transition-colors">${imp.cid}</h3>
            </div>
            <span class="px-2 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg text-[9px] font-bold whitespace-nowrap inline-flex items-center gap-1 shrink-0">
              <i data-lucide="check-circle-2" class="w-3 h-3"></i> เสร็จสิ้น
            </span>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="bg-slate-50/50 p-3 rounded-xl border border-slate-100">
              <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Improvement Actions</p>
              <p class="text-sm font-bold text-slate-800">${imp.items.length} รายการ</p>
            </div>
            <div class="bg-slate-50/50 p-3 rounded-xl border border-slate-100">
              <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Finished At</p>
              <p class="text-sm font-bold text-slate-800">${date}</p>
            </div>
          </div>
          ${imp.items.length ? `
          <div class="mt-3 pt-3 border-t border-slate-100">
            <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Actions</p>
            <ul class="space-y-1">
              ${imp.items.slice(0, 3).map((item, i) => `
                <li class="flex items-start gap-1.5 text-xs text-slate-600">
                  <span class="w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">${i + 1}</span>
                  <span class="line-clamp-1">${item}</span>
                </li>`).join("")}
              ${imp.items.length > 3 ? `<li class="text-[10px] text-slate-400 pl-5">+${imp.items.length - 3} รายการ</li>` : ""}
            </ul>
          </div>` : ""}
          <div class="mt-3 pt-3 border-t border-slate-100 flex justify-end">
            <button onclick="Store.dispatch(s=>({...s,ui:{...s.ui,currentView:'improvement'}}));setTimeout(()=>window.ImprovementUI?.openDetail('${imp.cid}'),100)"
              class="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-bold transition-colors uppercase">Details</button>
          </div>
        </article>`;
    }

    // Location type
    return `
      <article class="bg-white rounded-2xl md:rounded-3xl p-4 md:p-6 shadow-sm border border-emerald-200 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group border-l-4 border-l-teal-400">
        <div class="flex items-start justify-between gap-2 border-b border-slate-100 pb-3 mb-3">
          <div class="min-w-0">
            <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Location Improvement</p>
            <h3 class="text-base font-black text-slate-800 group-hover:text-orange-600 transition-colors truncate">${imp.area}</h3>
            ${imp.lat ? `<p class="text-[10px] text-slate-400 mt-0.5">${imp.lat.toFixed(4)}, ${imp.lng.toFixed(4)} · รัศมี ${imp.radiusKm} กม.</p>` : ""}
          </div>
          <span class="px-2 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg text-[9px] font-bold whitespace-nowrap inline-flex items-center gap-1 shrink-0">
            <i data-lucide="check-circle-2" class="w-3 h-3"></i> เสร็จสิ้น
          </span>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-slate-50/50 p-3 rounded-xl border border-slate-100">
            <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Incidents</p>
            <p class="text-sm font-bold text-slate-800">${imp.incidentCount} เหตุการณ์</p>
          </div>
          <div class="bg-slate-50/50 p-3 rounded-xl border border-slate-100">
            <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Finished At</p>
            <p class="text-sm font-bold text-slate-800">${date}</p>
          </div>
        </div>
        ${imp.actionNote ? `
        <div class="mt-3 pt-3 border-t border-slate-100">
          <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">การดำเนินการ</p>
          <p class="text-xs text-slate-600 line-clamp-2">${imp.actionNote}</p>
        </div>` : ""}
        <div class="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
          <span class="text-[10px] text-slate-400">โดย: <b class="text-slate-600">${imp.resolvedBy}</b></span>
          <button onclick="Store.dispatch(s=>({...s,ui:{...s.ui,currentView:'improvement'}}));setTimeout(()=>window.ImprovementUI?.openLocationDetail('${imp.key}'),100)"
            class="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-bold transition-colors uppercase">Details</button>
        </div>
      </article>`;
  }

  function renderEmpty(typeLabel) {
    return `
        <div class="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm mt-4">
            <div class="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                <i data-lucide="archive" class="w-8 h-8 text-slate-300"></i>
            </div>
            <h4 class="text-lg font-bold text-slate-700">No incident history</h4>
            <p class="text-sm text-slate-400 mt-1">No ${typeLabel} incident history yet</p>
        </div>
    `;
  }

  function renderCard(incident, typeLabel) {
    const incidentKey = getIncidentKey(incident);
    const finishedAt = incident.nsFinish?.times?.upTime || incident.completedAt || "-";
    const reason = incident.nsFinish?.details?.cause || incident.cause || "-";
    const isDn  = incident.alertClass === "Dn";
    const isInf = incident.alertClass === "Inf";
    const borderAccent = isDn  ? "border-l-4 border-l-rose-400"
                       : isInf ? "border-l-4 border-l-amber-400"
                               : "border-l-4 border-l-emerald-300";

    return `
      <article class="bg-white rounded-2xl md:rounded-3xl p-3 md:p-6 shadow-sm border border-slate-200 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group ${borderAccent}" data-history-open-detail="${incidentKey}" data-history-incident-id="${incidentKey}">
        <div class="flex items-start justify-between gap-2 border-b border-slate-100 pb-2 mb-2 md:pb-4 md:mb-4">
          <div class="min-w-0">
            <h3 class="text-sm md:text-lg font-bold text-slate-800 group-hover:text-orange-600 transition-colors flex items-center gap-1.5"><i data-lucide="history" class="w-3.5 h-3.5 text-slate-400 shrink-0"></i> ${incidentKey}</h3>
            <p class="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">${typeLabel} - ${incident.node || "-"}</p>
          </div>
          <span class="px-2 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg text-[9px] font-bold whitespace-nowrap inline-flex items-center gap-1"><i data-lucide="check-circle-2" class="w-3 h-3"></i> Closed</span>
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 py-1 md:py-2">
          <div class="bg-slate-50/50 p-2 md:p-4 rounded-xl md:rounded-2xl border border-slate-100">
            <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Alarm</p>
            <p class="text-xs md:text-sm font-bold text-rose-500 truncate" title="${incident.alarm}">${incident.alarm || "-"}</p>
          </div>
          <div class="bg-slate-50/50 p-2 md:p-4 rounded-xl md:rounded-2xl border border-slate-100">
            <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Cause</p>
            <p class="text-xs md:text-sm font-bold text-slate-700 truncate" title="${reason}">${reason}</p>
          </div>
          <div class="bg-slate-50/50 p-2 md:p-4 rounded-xl md:rounded-2xl border border-slate-100">
            <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Finished At</p>
            <p class="text-xs md:text-sm font-bold text-slate-800">${formatDateTime(finishedAt)}</p>
          </div>
          <div class="bg-slate-50/50 p-2 md:p-4 rounded-xl md:rounded-2xl border border-slate-100 flex items-center justify-between">
            <div>
              <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Updates</p>
              <p class="text-base md:text-xl font-bold text-slate-800 leading-none">${(incident.updates || []).length}</p>
            </div>
            <div class="w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
               <i data-lucide="chevron-right" class="w-4 h-4 text-indigo-500"></i>
            </div>
          </div>
        </div>

        <div class="mt-2 pt-2 md:mt-4 md:pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button class="px-3 py-1.5 md:px-5 md:py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-bold transition-colors uppercase relative z-10 btn-history-detail" data-id="${incidentKey}">Details</button>
          <button class="px-3 py-1.5 md:px-5 md:py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-[10px] font-bold transition-colors uppercase relative z-10 btn-corrective-report" data-id="${incidentKey}">Report</button>
        </div>
      </article>
    `;
  }

  function renderTabs(activeTab) {
    return `
      <div class="flex flex-wrap gap-2 mb-2 p-1 bg-slate-100/70 rounded-2xl inline-flex w-full sm:w-auto shadow-inner">
        ${HISTORY_TYPES.map(
      (type) => `
            <button
              class="btn-history-tab px-6 py-2.5 mx-0.5 rounded-xl text-xs font-bold transition-all uppercase tracking-wider ${activeTab === type.key ? "bg-white text-zinc-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}"
              data-history-tab="${type.key}">
              ${type.label}
            </button>
          `
    ).join("")}
      </div>
    `;
  }

  function renderPagination(totalItems, page) {
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

    return `
      <div class="flex items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm mt-4">
        <div class="text-xs font-bold text-slate-400 uppercase tracking-widest hidden md:block">Total: ${totalItems} jobs</div>
        <div class="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
          <button class="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-600 transition-colors ${page <= 1 ? "opacity-40 cursor-not-allowed" : ""}" data-history-page="prev" ${page <= 1 ? "disabled" : ""}>Prev</button>
          <span class="text-[10px] font-bold text-slate-400 bg-slate-50 px-3 py-2 rounded-lg">Page ${page} / ${totalPages}</span>
          <button class="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-600 transition-colors ${page >= totalPages ? "opacity-40 cursor-not-allowed" : ""}" data-history-page="next" ${page >= totalPages ? "disabled" : ""}>Next</button>
        </div>
      </div>
    `;
  }

  function render(state) {
    const container = document.createElement("div");
    container.className = "space-y-4 fade-in";

    const activeTab = state.ui.activeHistoryTab || "fiber";
    const typeInfo = HISTORY_TYPES.find((item) => item.key === activeTab) || HISTORY_TYPES[0];
    const currentPage = Math.max(1, Number(state.ui.historyPage || 1));

    // Improvement tab has its own data source (localStorage)
    if (activeTab === "improvement") {
      const allItems = getFinishedImprovements();
      const totalPages = Math.max(1, Math.ceil(allItems.length / PAGE_SIZE));
      const page = Math.min(currentPage, totalPages);
      const start = (page - 1) * PAGE_SIZE;
      const pageItems = allItems.slice(start, start + PAGE_SIZE);

      container.innerHTML = `
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
          ${renderTabs("improvement")}
          <div class="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-2">
            <i data-lucide="trending-up" class="w-3.5 h-3.5"></i> Improvement History
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          ${pageItems.length
            ? pageItems.map((imp) => renderImprovementCard(imp)).join("")
            : `<div class="col-span-full bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm">
                <div class="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                  <i data-lucide="trending-up" class="w-8 h-8 text-slate-300"></i>
                </div>
                <h4 class="text-lg font-bold text-slate-700">ยังไม่มี Improvement ที่เสร็จสิ้น</h4>
                <p class="text-sm text-slate-400 mt-1">กด Finish ใน Improvement เพื่อย้ายมาที่นี่</p>
              </div>`
          }
        </div>
        ${renderPagination(allItems.length, page)}
      `;
      setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 0);
      return container;
    }

    const allItems = getCompletedByType(state, typeInfo.key);
    const totalPages = Math.max(1, Math.ceil(allItems.length / PAGE_SIZE));
    const page = Math.min(currentPage, totalPages);

    const start = (page - 1) * PAGE_SIZE;
    const pageItems = allItems.slice(start, start + PAGE_SIZE);

    container.innerHTML = `
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
          ${renderTabs(typeInfo.key)}
          <div class="flex items-center gap-2">
            <button id="btn-export-history" class="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors shadow-sm shadow-emerald-200">
              <i data-lucide="download" class="w-3 h-3"></i> Export CSV
            </button>
            <div class="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-2">
               <i data-lucide="archive" class="w-3.5 h-3.5"></i> ${typeInfo.label} History
            </div>
          </div>
      </div>
      <div class="space-y-4">
        ${pageItems.length ? pageItems.map((item) => renderCard(item, typeInfo.label)).join("") : renderEmpty(typeInfo.label)}
      </div>
      ${renderPagination(allItems.length, page)}
    `;

    setTimeout(() => {
      if (window.lucide) window.lucide.createIcons();

      const exportBtn = container.querySelector('#btn-export-history');
      if (exportBtn) {
        exportBtn.onclick = () => {
          if (window.ExportUtil) {
            ExportUtil.exportHistory(allItems, typeInfo.label);
          }
        };
      }
    }, 0);

    return container;
  }

  return { render };
})();

window.HistoryUI = HistoryUI;
