// scripts/ui/history.ui.js

const HistoryUI = (function () {
  const HISTORY_TYPES = [
    { key: "fiber", label: "Fiber" },
    { key: "equipment", label: "Equipment" },
    { key: "improvement", label: "Improvement" },
  ];
  const PAGE_SIZE = 20;
  const SLA_HOURS = 3;
  let slaFilter = "all"; // "all" | "ok" | "breached"

  function calcMttrHrs(incident) {
    const down = incident.tickets?.[0]?.downTime || incident.downTime || incident.createdAt;
    const up   = incident.nsFinish?.times?.upTime || incident.completedAt;
    if (!down || !up) return null;
    const ms = new Date(up) - new Date(down);
    return ms > 0 ? ms / 3600000 : null;
  }

  function fmtMttr(hrs) {
    if (hrs === null || hrs === undefined) return "-";
    return hrs.toFixed(2) + " hrs";
  }

  function fmtClosedTime(incident) {
    const v = incident.nsFinish?.times?.upTime || incident.completedAt;
    if (!v) return "-";
    try { return new Date(v).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false }); }
    catch { return "-"; }
  }

  function getCause(incident) {
    return incident.nsFinish?.details?.cause || incident.cause
      || (incident.updates || []).slice(-1)[0]?.cause || "-";
  }

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
        <article class="corrective-card md:p-6 border-l-4 border-l-emerald-400 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group">
          <div class="flex items-start justify-between gap-2 pb-3 mb-3" style="border-bottom:1px solid var(--hair-soft)">
            <div class="min-w-0">
              <p class="text-[9px] font-bold uppercase tracking-widest mb-0.5" style="color:var(--ink-muted)">CID Improvement</p>
              <h3 class="text-base font-black transition-colors group-hover:text-orange-600" style="color:var(--ink)">${imp.cid}</h3>
            </div>
            <span class="tag ok shrink-0 inline-flex items-center gap-1">
              <i data-lucide="check-circle-2" class="w-3 h-3"></i> เสร็จสิ้น
            </span>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="p-3 rounded-xl" style="background:var(--surface-2);border:1px solid var(--hair-soft)">
              <p class="text-[9px] font-bold uppercase tracking-wider mb-0.5" style="color:var(--ink-muted)">Improvement Actions</p>
              <p class="text-sm font-bold" style="color:var(--ink)">${imp.items.length} รายการ</p>
            </div>
            <div class="p-3 rounded-xl" style="background:var(--surface-2);border:1px solid var(--hair-soft)">
              <p class="text-[9px] font-bold uppercase tracking-wider mb-0.5" style="color:var(--ink-muted)">Finished At</p>
              <p class="text-sm font-bold" style="color:var(--ink)">${date}</p>
            </div>
          </div>
          ${imp.items.length ? `
          <div class="mt-3 pt-3" style="border-top:1px solid var(--hair-soft)">
            <p class="text-[9px] font-bold uppercase tracking-wider mb-1.5" style="color:var(--ink-muted)">Actions</p>
            <ul class="space-y-1">
              ${imp.items.slice(0, 3).map((item, i) => `
                <li class="flex items-start gap-1.5 text-xs" style="color:var(--ink)">
                  <span class="w-4 h-4 rounded-full text-white text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5" style="background:#22c55e">${i + 1}</span>
                  <span class="line-clamp-1">${item}</span>
                </li>`).join("")}
              ${imp.items.length > 3 ? `<li class="text-[10px] pl-5" style="color:var(--ink-muted)">+${imp.items.length - 3} รายการ</li>` : ""}
            </ul>
          </div>` : ""}
          <div class="mt-3 pt-3 flex justify-end" style="border-top:1px solid var(--hair-soft)">
            <button onclick="Store.dispatch(s=>({...s,ui:{...s.ui,currentView:'improvement'}}));setTimeout(()=>window.ImprovementUI?.openDetail('${imp.cid}'),100)"
              class="btn btn-sm btn-ghost uppercase">Details</button>
          </div>
        </article>`;
    }

    // Location type
    return `
      <article class="corrective-card md:p-6 border-l-4 border-l-teal-400 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group">
        <div class="flex items-start justify-between gap-2 pb-3 mb-3" style="border-bottom:1px solid var(--hair-soft)">
          <div class="min-w-0">
            <p class="text-[9px] font-bold uppercase tracking-widest mb-0.5" style="color:var(--ink-muted)">Location Improvement</p>
            <h3 class="text-base font-black transition-colors group-hover:text-orange-600 truncate" style="color:var(--ink)">${imp.area}</h3>
            ${imp.lat ? `<p class="text-[10px] mt-0.5" style="color:var(--ink-muted)">${imp.lat.toFixed(4)}, ${imp.lng.toFixed(4)} · รัศมี ${imp.radiusKm} กม.</p>` : ""}
          </div>
          <span class="tag ok shrink-0 inline-flex items-center gap-1">
            <i data-lucide="check-circle-2" class="w-3 h-3"></i> เสร็จสิ้น
          </span>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="p-3 rounded-xl" style="background:var(--surface-2);border:1px solid var(--hair-soft)">
            <p class="text-[9px] font-bold uppercase tracking-wider mb-0.5" style="color:var(--ink-muted)">Incidents</p>
            <p class="text-sm font-bold" style="color:var(--ink)">${imp.incidentCount} เหตุการณ์</p>
          </div>
          <div class="p-3 rounded-xl" style="background:var(--surface-2);border:1px solid var(--hair-soft)">
            <p class="text-[9px] font-bold uppercase tracking-wider mb-0.5" style="color:var(--ink-muted)">Finished At</p>
            <p class="text-sm font-bold" style="color:var(--ink)">${date}</p>
          </div>
        </div>
        ${imp.actionNote ? `
        <div class="mt-3 pt-3" style="border-top:1px solid var(--hair-soft)">
          <p class="text-[9px] font-bold uppercase tracking-wider mb-1" style="color:var(--ink-muted)">การดำเนินการ</p>
          <p class="text-xs line-clamp-2" style="color:var(--ink)">${imp.actionNote}</p>
        </div>` : ""}
        <div class="mt-3 pt-3 flex items-center justify-between" style="border-top:1px solid var(--hair-soft)">
          <span class="text-[10px]" style="color:var(--ink-muted)">โดย: <b style="color:var(--ink)">${imp.resolvedBy}</b></span>
          <button onclick="Store.dispatch(s=>({...s,ui:{...s.ui,currentView:'improvement'}}));setTimeout(()=>window.ImprovementUI?.openLocationDetail('${imp.key}'),100)"
            class="btn btn-sm btn-ghost uppercase">Details</button>
        </div>
      </article>`;
  }

  function renderEmpty(typeLabel) {
    return `
        <div class="panel p-12 text-center mt-4">
            <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style="background:var(--surface-2);border:1px solid var(--hair-soft)">
                <i data-lucide="archive" class="w-8 h-8" style="color:var(--ink-dim)"></i>
            </div>
            <h4 class="text-lg font-bold" style="color:var(--ink)">No incident history</h4>
            <p class="text-sm mt-1" style="color:var(--ink-muted)">No ${typeLabel} incident history yet</p>
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
      <article class="corrective-card md:p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group ${borderAccent}" data-history-open-detail="${incidentKey}" data-history-incident-id="${incidentKey}">
        <div class="flex items-start justify-between gap-2 pb-2 mb-2 md:pb-4 md:mb-4" style="border-bottom:1px solid var(--hair-soft)">
          <div class="min-w-0">
            <h3 class="text-sm md:text-lg font-bold transition-colors group-hover:text-orange-600 flex items-center gap-1.5" style="color:var(--ink)"><i data-lucide="history" class="w-3.5 h-3.5 shrink-0" style="color:var(--ink-muted)"></i> ${incidentKey}</h3>
            <p class="text-[9px] md:text-[10px] font-bold uppercase tracking-widest" style="color:var(--ink-muted)">${typeLabel} - ${incident.node || "-"}</p>
          </div>
          <span class="tag ok shrink-0 inline-flex items-center gap-1"><i data-lucide="check-circle-2" class="w-3 h-3"></i> Closed</span>
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 py-1 md:py-2">
          <div class="p-2 md:p-4 rounded-xl md:rounded-2xl" style="background:var(--surface-2);border:1px solid var(--hair-soft)">
            <p class="text-[9px] font-bold uppercase tracking-wider mb-0.5" style="color:var(--ink-muted)">Alarm</p>
            <p class="text-xs md:text-sm font-bold truncate" style="color:var(--sev-dn)" title="${incident.alarm}">${incident.alarm || "-"}</p>
          </div>
          <div class="p-2 md:p-4 rounded-xl md:rounded-2xl" style="background:var(--surface-2);border:1px solid var(--hair-soft)">
            <p class="text-[9px] font-bold uppercase tracking-wider mb-0.5" style="color:var(--ink-muted)">Cause</p>
            <p class="text-xs md:text-sm font-bold truncate" style="color:var(--ink)" title="${reason}">${reason}</p>
          </div>
          <div class="p-2 md:p-4 rounded-xl md:rounded-2xl" style="background:var(--surface-2);border:1px solid var(--hair-soft)">
            <p class="text-[9px] font-bold uppercase tracking-wider mb-0.5" style="color:var(--ink-muted)">Finished At</p>
            <p class="text-xs md:text-sm font-bold" style="color:var(--ink)">${formatDateTime(finishedAt)}</p>
          </div>
          <div class="p-2 md:p-4 rounded-xl md:rounded-2xl flex items-center justify-between" style="background:var(--surface-2);border:1px solid var(--hair-soft)">
            <div>
              <p class="text-[9px] font-bold uppercase tracking-wider mb-0.5" style="color:var(--ink-muted)">Updates</p>
              <p class="text-base md:text-xl font-bold leading-none" style="color:var(--ink)">${(incident.updates || []).length}</p>
            </div>
            <div class="w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style="background:rgba(99,102,241,.1)">
               <i data-lucide="chevron-right" class="w-4 h-4" style="color:#6366f1"></i>
            </div>
          </div>
        </div>

        <div class="mt-2 pt-2 md:mt-4 md:pt-4 flex items-center justify-end gap-2" style="border-top:1px solid var(--hair-soft)">
          <button class="btn btn-sm btn-ghost uppercase relative z-10 btn-history-detail" data-id="${incidentKey}">Details</button>
          <button class="btn btn-sm relative z-10 btn-corrective-report" style="color:#6366f1" data-id="${incidentKey}">Report</button>
        </div>
      </article>
    `;
  }

  function renderTabs(activeTab) {
    return `
      <div class="flex flex-wrap gap-2 mb-2 p-1 rounded-2xl inline-flex w-full sm:w-auto" style="background:var(--surface-2)">
        ${HISTORY_TYPES.map(
      (type) => `
            <button
              class="btn-history-tab px-6 py-2.5 mx-0.5 rounded-xl text-xs font-bold transition-all uppercase tracking-wider ${activeTab === type.key ? "shadow-sm" : ""}"
              style="${activeTab === type.key ? `background:var(--surface);color:var(--ink)` : `background:transparent;color:var(--ink-muted)`}"
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
      <div class="panel flex items-center justify-between gap-3 p-3 mt-2">
        <div class="text-xs font-bold uppercase tracking-widest hidden md:block" style="color:var(--ink-muted)">Total: ${totalItems}</div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:nowrap">
          <button class="btn btn-sm btn-ghost ${page <= 1 ? "opacity-40 cursor-not-allowed" : ""}" data-history-page="prev" ${page <= 1 ? "disabled" : ""}>Prev</button>
          <span class="text-[10px] font-bold px-3 py-1.5 rounded-lg" style="color:var(--ink-muted);background:var(--surface-2);white-space:nowrap">${page} / ${totalPages}</span>
          <button class="btn btn-sm btn-ghost ${page >= totalPages ? "opacity-40 cursor-not-allowed" : ""}" data-history-page="next" ${page >= totalPages ? "disabled" : ""}>Next</button>
        </div>
      </div>
    `;
  }

  function renderPageHeader() {
    const wrap = document.createElement("div");
    wrap.className = "mb-1";
    wrap.innerHTML = `
      <div class="panel px-5 py-4 flex items-center gap-3">
        <div>
          <h1 class="text-xl font-black tracking-tight" style="color:var(--ink)">Incident History</h1>
          <p class="text-[10px] font-bold uppercase tracking-widest mt-0.5" style="color:var(--ink-muted)">Closed incidents · audit trail</p>
        </div>
      </div>
    `;
    return wrap;
  }

  function render(state) {
    const container = document.createElement("div");
    container.className = "space-y-4 fade-in";
    container.appendChild(renderPageHeader());

    const activeTab = state.ui.activeHistoryTab || "fiber";
    const typeInfo = HISTORY_TYPES.find((item) => item.key === activeTab) || HISTORY_TYPES[0];
    const currentPage = Math.max(1, Number(state.ui.historyPage || 1));

    const content = document.createElement("div");
    content.className = "space-y-4";
    container.appendChild(content);

    // Improvement tab has its own data source (localStorage)
    if (activeTab === "improvement") {
      const allItems = getFinishedImprovements();
      const totalPages = Math.max(1, Math.ceil(allItems.length / PAGE_SIZE));
      const page = Math.min(currentPage, totalPages);
      const start = (page - 1) * PAGE_SIZE;
      const pageItems = allItems.slice(start, start + PAGE_SIZE);

      content.innerHTML = `
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
          ${renderTabs("improvement")}
          <div class="text-[10px] font-bold uppercase flex items-center gap-2" style="color:var(--ink-muted)">
            <i data-lucide="trending-up" class="w-3.5 h-3.5"></i> Improvement History
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          ${pageItems.length
            ? pageItems.map((imp) => renderImprovementCard(imp)).join("")
            : `<div class="col-span-full panel p-12 text-center">
                <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style="background:var(--surface-2);border:1px solid var(--hair-soft)">
                  <i data-lucide="trending-up" class="w-8 h-8" style="color:var(--ink-dim)"></i>
                </div>
                <h4 class="text-lg font-bold" style="color:var(--ink)">ยังไม่มี Improvement ที่เสร็จสิ้น</h4>
                <p class="text-sm mt-1" style="color:var(--ink-muted)">กด Finish ใน Improvement เพื่อย้ายมาที่นี่</p>
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

    const tableRows = pageItems.map(item => {
      const key = getIncidentKey(item);
      const isDn  = item.alertClass === "Dn";
      const isInf = item.alertClass === "Inf";
      const borderColor = isDn ? "#f87171" : isInf ? "#fb923c" : "#e2e8f0";
      const badge = isDn ? `<span class="tag dn" style="font-size:9px;padding:1px 5px">DN</span>` : isInf ? `<span class="tag inf" style="font-size:9px;padding:1px 5px">INF</span>` : "";
      const finishedAt = item.nsFinish?.times?.upTime || item.completedAt;
      const updatesCount = (item.updates || []).length;
      return `
        <tr class="hist-row-nav hover:bg-orange-50 transition-colors cursor-pointer" data-id="${key}" style="border-bottom:1px solid var(--hair-soft)">
          <td class="py-2.5 pl-0 pr-3" style="border-left:3px solid ${borderColor}">
            <div class="flex items-center gap-1.5 pl-3">
              <span class="text-xs font-bold" style="color:var(--ink)">${key}</span>
              ${badge}
            </div>
          </td>
          <td class="px-3 py-2.5 text-xs font-semibold" style="color:var(--ink)">${item.node || "-"}</td>
          <td class="px-3 py-2.5 text-xs" style="color:var(--sev-dn)">${item.alarm || "-"}</td>
          <td class="px-3 py-2.5 text-xs" style="color:var(--ink-muted)">${getCause(item)}</td>
          <td class="px-3 py-2.5 text-xs font-semibold" style="color:var(--ink)">${formatDateTime(finishedAt)}</td>
          <td class="px-3 py-2.5 text-xs font-bold text-center" style="color:var(--ink)">${updatesCount}</td>
          <td class="px-3 py-2.5">
            <div class="flex items-center gap-1.5">
              <button class="hist-btn-detail btn btn-sm btn-ghost" data-id="${key}" style="font-size:10px;padding:3px 8px">Details</button>
              <button class="hist-btn-report btn btn-sm" data-id="${key}" style="font-size:10px;padding:3px 8px;color:#6366f1;border-color:#e0e7ff;background:#eef2ff">Report</button>
            </div>
          </td>
        </tr>`;
    }).join("");

    content.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-3">
        ${renderTabs(typeInfo.key)}
        <div class="flex items-center gap-2">
          <button id="btn-export-history" class="btn btn-sm" style="background:#22c55e;color:#fff;border-color:#22c55e">
            <i data-lucide="download" class="w-3.5 h-3.5 pointer-events-none"></i> CSV
          </button>
          <span class="text-[10px] font-bold" style="color:var(--ink-muted)">Showing ${pageItems.length} of ${allItems.length}</span>
        </div>
      </div>
      ${pageItems.length ? `
      <div class="panel overflow-hidden">
        <table class="w-full">
          <thead>
            <tr style="background:var(--surface-2);border-bottom:1px solid var(--hair)">
              <th class="py-2.5 pl-3 pr-3 text-left text-[10px] font-black uppercase tracking-widest" style="color:var(--ink-muted)">Incident</th>
              <th class="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest" style="color:var(--ink-muted)">Node</th>
              <th class="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest" style="color:var(--ink-muted)">Alarm</th>
              <th class="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest" style="color:var(--ink-muted)">Cause</th>
              <th class="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest" style="color:var(--ink-muted)">Finished At</th>
              <th class="px-3 py-2.5 text-center text-[10px] font-black uppercase tracking-widest" style="color:var(--ink-muted)">Updates</th>
              <th class="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest" style="color:var(--ink-muted)">Actions</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>` : `<div class="panel p-12 text-center" style="color:var(--ink-muted)">No ${typeInfo.label} history found</div>`}
      ${renderPagination(allItems.length, page)}
    `;

    setTimeout(() => {
      if (window.lucide) window.lucide.createIcons();
      const exportBtn = content.querySelector('#btn-export-history');
      if (exportBtn) exportBtn.onclick = () => { if (window.ExportUtil) ExportUtil.exportHistory(allItems, typeInfo.label); };

      content.querySelectorAll(".hist-row-nav").forEach(row => {
        const id = row.dataset.id;
        // Resolve item from closure — no secondary state lookup needed
        const item = pageItems.find(i => getIncidentKey(i) === id);
        if (!item) return;

        // Row click → alert-detail full page (picture 2)
        row.onclick = (e) => {
          if (e.target.closest("button")) return;
          const baseFields = {
            incident: getIncidentKey(item),
            incidentId: getIncidentKey(item),
            alarm: item.alarm || "Network Alert",
            detail: item.detail || item.latestUpdateMessage || "-",
            nocBy: item.nocBy || "System",
            createdAt: item.createdAt || new Date().toISOString(),
            status: item.status,
            workType: item.workType,
          };
          const nodeList = String(item.node || "").split(",").map(s => s.trim()).filter(Boolean);
          const allTickets = item.tickets || [];
          let selectedAlerts;
          if (Array.isArray(item.nodeDetails) && item.nodeDetails.length) {
            selectedAlerts = item.nodeDetails.map(nd => ({
              ...baseFields, node: nd.node || "-", alarm: nd.alarm || baseFields.alarm,
              detail: nd.detail || baseFields.detail, tickets: nd.tickets || [],
            }));
          } else {
            selectedAlerts = nodeList.length
              ? nodeList.map(nodeName => ({ ...baseFields, node: nodeName, tickets: allTickets }))
              : [{ ...baseFields, node: item.node || "-", tickets: allTickets }];
          }
          Store.dispatch(s => ({
            ...s,
            ui: { ...s.ui, currentView: "alert-detail", alertDetailReturnView: "history", selectedAlerts, selectedIncident: null }
          }));
        };

        // Details button → View Detail modal (TYPE, NODE, SUB CONTRACTOR, TIMELINE)
        const detailBtn = row.querySelector(".hist-btn-detail");
        if (detailBtn) detailBtn.onclick = (e) => {
          e.stopPropagation();
          if (window.openCorrectiveDetailModalDirect) {
            openCorrectiveDetailModalDirect(item, typeInfo.key);
          } else if (window.openCorrectiveDetailModal) {
            openCorrectiveDetailModal(id);
          }
        };

        // Report button → NS Finish Report popup modal
        const reportBtn = row.querySelector(".hist-btn-report");
        if (reportBtn) reportBtn.onclick = (e) => {
          e.stopPropagation();
          if (window.openNsFinishReportModal && window.buildNsReportInputFromIncident) {
            openNsFinishReportModal(buildNsReportInputFromIncident(item, typeInfo.key));
          }
        };
      });
    }, 0);

    return container;
  }

  return { render };
})();

window.HistoryUI = HistoryUI;
