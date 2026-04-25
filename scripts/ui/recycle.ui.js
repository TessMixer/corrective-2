// scripts/ui/recycle.ui.js

const RecycleUI = (function () {
  let filterIncident = "";
  let filterCID = "";
  let filterDate = "";

  function calculateTotalDownTime(startTime) {
    if (!startTime) return "-";
    const mins = window.DateUtils ? window.DateUtils.getDurationMinutes(startTime) : 0;
    return window.DateUtils ? window.DateUtils.formatDuration(mins) : `${mins}m`;
  }

  function triggerRefresh() {
    if (window.Store) Store.dispatch(s => ({ ...s }));
  }

  function renderFilterBar() {
    const bar = document.createElement("div");
    bar.className = "panel p-4 flex flex-wrap gap-4 items-end";
    bar.innerHTML = `
      <div class="flex-1 min-w-[150px]">
        <label class="block text-[10px] font-black uppercase tracking-widest mb-1" style="color:var(--ink-muted)">Incident Number</label>
        <div class="relative">
          <i data-lucide="search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style="color:var(--ink-muted)"></i>
          <input id="filter-recycle-incident" type="text" value="${filterIncident}" class="form-input w-full pl-9" placeholder="Search Incident...">
        </div>
      </div>
      <div class="flex-1 min-w-[150px]">
        <label class="block text-[10px] font-black uppercase tracking-widest mb-1" style="color:var(--ink-muted)">Symphony CID</label>
        <div class="relative">
          <i data-lucide="hash" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style="color:var(--ink-muted)"></i>
          <input id="filter-recycle-cid" type="text" value="${filterCID}" class="form-input w-full pl-9" placeholder="Search CID...">
        </div>
      </div>
      <div class="flex-1 min-w-[150px]">
        <label class="block text-[10px] font-black uppercase tracking-widest mb-1" style="color:var(--ink-muted)">Date Selection</label>
        <div class="relative">
          <i data-lucide="calendar" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style="color:var(--ink-muted)"></i>
          <input id="filter-recycle-date" type="date" value="${filterDate}" class="form-input w-full pl-9">
        </div>
      </div>
      <button id="btn-clear-trash" class="btn px-5 py-2.5 flex items-center gap-2" style="background:var(--sev-dn);color:#fff;border-color:var(--sev-dn)">
        <i data-lucide="trash-2" class="w-4 h-4"></i> ล้างถังขยะ
      </button>
    `;
    bar.querySelector("#filter-recycle-incident").oninput = (e) => { filterIncident = e.target.value; triggerRefresh(); };
    bar.querySelector("#filter-recycle-cid").oninput = (e) => { filterCID = e.target.value; triggerRefresh(); };
    bar.querySelector("#filter-recycle-date").onchange = (e) => { filterDate = e.target.value; triggerRefresh(); };
    bar.querySelector("#btn-clear-trash").onclick = () => {
      if (confirm("ยืนยันการล้างถังขยะทั้งหมด? ข้อมูลจะหายไปถาวร")) {
        const items = window.Selectors ? window.Selectors.getRecycleBin(Store.getState()) : [];
        items.forEach(async (item) => {
          const id = item.incidentId || item.id || item.incident;
          if (id && window.AlertService) await window.AlertService.deleteIncident(id);
        });
      }
    };
    return bar;
  }

  function render(state) {
    const container = document.createElement("div");
    container.className = "max-w-full mx-auto space-y-4 slide-up";

    const allItems = window.Selectors ? Selectors.getRecycleBin(state) : [];

    // Header — title only, no KPI cards
    const header = document.createElement("div");
    header.innerHTML = `
      <div class="panel px-5 py-4 flex items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-black tracking-tight" style="color:var(--ink)">Recycle Bin</h1>
          <p class="text-[10px] font-bold uppercase tracking-widest mt-0.5" style="color:var(--ink-muted)">รายการที่ถูกยกเลิก · Cancelled incidents</p>
        </div>
        <span class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold" style="border:1.5px solid var(--hair);color:var(--ink-muted)">🗑 Total · ${allItems.length}</span>
      </div>
    `;
    container.appendChild(header);

    // Filter bar
    container.appendChild(renderFilterBar());

    // Apply filters
    let incidents = allItems.slice();
    if (filterIncident) {
      incidents = incidents.filter(i => (i.id || i.incidentId || i.incident || "").toLowerCase().includes(filterIncident.toLowerCase()));
    }
    if (filterCID) {
      incidents = incidents.filter(i => (i.cid || i.tickets?.[0]?.cid || "").toLowerCase().includes(filterCID.toLowerCase()));
    }
    if (filterDate) {
      incidents = incidents.filter(i => (i.downTime || i.createdAt || "").includes(filterDate));
    }

    // Table
    const tableWrap = document.createElement("div");

    if (incidents.length === 0) {
      tableWrap.innerHTML = `
        <div class="py-16 text-center rounded-3xl" style="border:1px dashed var(--hair)">
          <i data-lucide="inbox" class="mx-auto mb-4" style="width:40px;height:40px;color:var(--ink-dim)"></i>
          <p class="font-bold uppercase text-[10px] tracking-widest" style="color:var(--ink-muted)">No matching items in trash</p>
        </div>`;
    } else {
      const rows = incidents.map(i => {
        const id = i.incidentId || i.id || i.incident || "-";
        const startTime = i.downTime || i.createdAt;
        const cid = i.tickets?.[0]?.cid || i.cid || "-";
        const node = i.node || i.tickets?.[0]?.originate || "-";
        const alarm = i.alarm || i.tickets?.[0]?.alarm || "-";
        const type = i.type || "Other";
        const totalDownTime = calculateTotalDownTime(startTime);
        const isDn  = i.alertClass === "Dn";
        const isInf = i.alertClass === "Inf";
        const borderColor = isDn ? "#f87171" : isInf ? "#fb923c" : "#e2e8f0";
        const badge = isDn
          ? `<span class="tag dn" style="font-size:9px;padding:1px 5px">DN</span>`
          : isInf ? `<span class="tag inf" style="font-size:9px;padding:1px 5px">INF</span>` : "";
        return `
          <tr class="hover:bg-red-50 transition-colors" style="border-bottom:1px solid var(--hair-soft)">
            <td class="py-2.5 pl-0 pr-3" style="border-left:3px solid ${borderColor}">
              <div class="flex items-center gap-1.5 pl-3">
                <span class="text-xs font-black" style="color:var(--ink)">${id}</span>
                ${badge}
              </div>
            </td>
            <td class="px-3 py-2.5">
              <span class="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider" style="background:var(--surface-2);color:var(--ink-muted)">${type}</span>
            </td>
            <td class="px-3 py-2.5 text-xs font-semibold" style="color:var(--ink)">${node}</td>
            <td class="px-3 py-2.5 text-xs font-mono" style="color:var(--ink-muted)">${cid}</td>
            <td class="px-3 py-2.5 text-xs" style="color:var(--sev-dn)">${alarm}</td>
            <td class="px-3 py-2.5 text-xs font-bold" style="color:var(--sev-dn)">${totalDownTime}</td>
            <td class="px-3 py-2.5">
              <div class="flex items-center gap-1.5">
                <button class="recycle-restore btn btn-sm btn-ghost" data-id="${id}" style="color:#0d9488;border-color:#ccfbf1" title="Restore">
                  <i data-lucide="rotate-ccw" class="w-3 h-3 pointer-events-none"></i>
                </button>
                <button class="recycle-delete btn btn-sm btn-ghost" data-id="${id}" style="color:#dc2626;border-color:#fee2e2" title="Delete">
                  <i data-lucide="trash-2" class="w-3 h-3 pointer-events-none"></i>
                </button>
                <button class="recycle-detail btn btn-sm btn-ghost" data-id="${id}" style="font-size:10px;padding:3px 8px">Details</button>
              </div>
            </td>
          </tr>`;
      }).join("");

      tableWrap.innerHTML = `
        <div class="panel overflow-hidden">
          <table class="w-full">
            <thead>
              <tr style="background:var(--surface-2);border-bottom:1px solid var(--hair)">
                <th class="py-2.5 pl-3 pr-3 text-left text-[10px] font-black uppercase tracking-widest" style="color:var(--ink-muted)">Incident</th>
                <th class="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest" style="color:var(--ink-muted)">Type</th>
                <th class="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest" style="color:var(--ink-muted)">Node</th>
                <th class="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest" style="color:var(--ink-muted)">CID</th>
                <th class="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest" style="color:var(--ink-muted)">Alarm</th>
                <th class="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest" style="color:var(--ink-muted)">Down Time</th>
                <th class="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest" style="color:var(--ink-muted)">Actions</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;

      // Wire up buttons after DOM insert
      setTimeout(() => {
        tableWrap.querySelectorAll(".recycle-restore").forEach(btn => {
          btn.onclick = (e) => {
            e.stopPropagation();
            if (window.AlertService?.restoreAlert) AlertService.restoreAlert(btn.dataset.id);
          };
        });
        tableWrap.querySelectorAll(".recycle-delete").forEach(btn => {
          btn.onclick = (e) => {
            e.stopPropagation();
            if (window.AlertService?.deleteIncident) AlertService.deleteIncident(btn.dataset.id);
          };
        });
        tableWrap.querySelectorAll(".recycle-detail").forEach(btn => {
          btn.onclick = (e) => {
            e.stopPropagation();
            const item = incidents.find(x => (x.incidentId || x.id || x.incident) === btn.dataset.id);
            if (item) Store.dispatch(s => ({
              ...s,
              ui: { ...s.ui, currentView: "alert-detail", selectedIncident: item, alertDetailReturnView: "recycle" }
            }));
          };
        });
      }, 0);
    }

    container.appendChild(tableWrap);

    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 0);

    return container;
  }

  return { render };
})();

window.RecycleUI = RecycleUI;
