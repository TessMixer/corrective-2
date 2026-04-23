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

  function renderFilterBar() {
    const bar = document.createElement("div");
    bar.className = "bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-wrap gap-4 items-end";
    
    bar.innerHTML = `
      <div class="flex-1 min-w-[150px]">
        <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Incident Number</label>
        <div class="relative">
          <i data-lucide="search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input id="filter-recycle-incident" type="text" value="${filterIncident}" class="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-50" placeholder="Search Incident...">
        </div>
      </div>
      <div class="flex-1 min-w-[150px]">
        <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Symphony CID</label>
        <div class="relative">
          <i data-lucide="hash" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input id="filter-recycle-cid" type="text" value="${filterCID}" class="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-50" placeholder="Search CID...">
        </div>
      </div>
      <div class="flex-1 min-w-[150px]">
        <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Date Selection</label>
        <div class="relative">
          <i data-lucide="calendar" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input id="filter-recycle-date" type="date" value="${filterDate}" class="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-50">
        </div>
      </div>
      <button id="btn-clear-trash" class="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-black shadow-lg shadow-rose-200 transition-all flex items-center gap-2">
        <i data-lucide="trash-2" class="w-4 h-4"></i> ล้างถังขยะ
      </button>
    `;

    bar.querySelector("#filter-recycle-incident").oninput = (e) => { filterIncident = e.target.value; triggerRefresh(); };
    bar.querySelector("#filter-recycle-cid").oninput = (e) => { filterCID = e.target.value; triggerRefresh(); };
    bar.querySelector("#filter-recycle-date").onchange = (e) => { filterDate = e.target.value; triggerRefresh(); };
    bar.querySelector("#btn-clear-trash").onclick = () => {
        if(confirm("ยืนยันการล้างถังขยะทั้งหมด? ข้อมูลจะหายไปถาวร")) {
            const items = window.Selectors ? window.Selectors.getRecycleBin(Store.getState()) : [];
            items.forEach(async (item) => {
                const id = item.incidentId || item.id || item.incident;
                if(id && window.AlertService) await window.AlertService.deleteIncident(id);
            });
        }
    };

    return bar;
  }

  function triggerRefresh() {
    if (window.Store) {
        Store.dispatch(s => ({ ...s }));
    }
  }

  function renderCard(i) {
    const id = i.incidentId || i.id || i.incident || "-";
    const startTime = i.downTime || i.createdAt;
    const cid = (i.tickets && i.tickets[0]?.cid) || i.cid || "-";
    const node = i.node || (i.tickets && i.tickets[0]?.originate) || "-";
    const alarm = i.alarm || (i.tickets && i.tickets[0]?.alarm) || "-";
    const type = i.type || "Other";
    const totalDownTime = calculateTotalDownTime(startTime);

    const card = document.createElement("div");
    card.className = "bg-white rounded-2xl p-4 shadow-sm border border-slate-200 hover:border-rose-300 transition-all group fade-in flex flex-col md:flex-row items-center gap-4";
    card.innerHTML = `
      <div class="flex-shrink-0 w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100 group-hover:bg-rose-50 transition-colors">
        <i data-lucide="archive" class="w-6 h-6 text-slate-400 group-hover:text-rose-500"></i>
      </div>

      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-black uppercase tracking-wider">${type}</span>
          <h3 class="text-sm font-black text-slate-800 truncate">${id}</h3>
        </div>
        <div class="text-[11px] font-bold text-slate-500 flex items-center gap-3">
          <span class="flex items-center gap-1"><i data-lucide="hash" class="w-3 h-3 text-slate-400"></i> ${cid}</span>
          <span class="flex items-center gap-1"><i data-lucide="map-pin" class="w-3 h-3 text-slate-400"></i> ${node}</span>
        </div>
      </div>

      <div class="flex-1 min-w-0 hidden lg:block">
        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Alarm Details</p>
        <p class="text-[11px] text-slate-600 truncate font-medium max-w-xs" title="${alarm}">${alarm}</p>
      </div>

      <div class="flex-shrink-0 text-right mr-4">
        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Down Time</p>
        <p class="text-sm font-black text-rose-600">${totalDownTime}</p>
      </div>

      <div class="flex items-center gap-2 ml-auto">
         <button class="btn-restore-item p-2 bg-slate-50 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 rounded-xl transition-all border border-slate-100" data-id="${id}" title="Restore">
           <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
         </button>
         <button class="btn-delete-perm p-2 bg-slate-50 text-slate-500 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all border border-slate-100" data-id="${id}" title="Delete Permanently">
           <i data-lucide="trash-2" class="w-4 h-4"></i>
         </button>
         <div class="w-px h-8 bg-slate-100 mx-1"></div>
         <button class="btn-recycle-details px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-[11px] font-bold transition-all shadow-sm" data-id="${id}">Details</button>
      </div>
    `;

    const restoreBtn = card.querySelector(".btn-restore-item");
    if(restoreBtn) {
        restoreBtn.onclick = (e) => {
            e.stopPropagation();
            if(window.AlertService && AlertService.restoreAlert) AlertService.restoreAlert(id);
        };
    }
    
    const deleteBtn = card.querySelector(".btn-delete-perm");
    if(deleteBtn) {
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if(window.AlertService && AlertService.deleteIncident) AlertService.deleteIncident(id);
        };
    }

    const detailsBtn = card.querySelector(".btn-recycle-details");
    if(detailsBtn) {
        detailsBtn.onclick = (e) => {
            e.stopPropagation();
            Store.dispatch(s => ({
              ...s,
              ui: { ...s.ui, currentView: 'alert-detail', selectedIncident: i, alertDetailReturnView: 'recycle' }
            }));
        };
    }

    return card;
  }

  function render(state) {
    const container = document.createElement("div");
    container.className = "max-w-full mx-auto space-y-4 slide-up";

    // Header section
    const header = document.createElement("div");
    header.className = "flex items-center gap-4 mb-6";
    header.innerHTML = `
      <div class="w-12 h-12 bg-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-rose-200">
        <i data-lucide="trash-2" class="w-6 h-6 text-white"></i>
      </div>
      <div>
        <h2 class="text-2xl font-black text-slate-800 tracking-tight">Recycle Bin</h2>
        <p class="text-slate-400 font-bold uppercase text-[9px] tracking-[0.2em] mt-0.5">Management of canceled incidents</p>
      </div>
    `;
    container.appendChild(header);

    // Filter Bar
    container.appendChild(renderFilterBar());

    // Content list
    let incidents = window.Selectors ? Selectors.getRecycleBin(state) : [];
    
    // Apply Filters
    if (filterIncident) {
      incidents = incidents.filter(i => (i.id || i.incidentId || i.incident || "").toLowerCase().includes(filterIncident.toLowerCase()));
    }
    if (filterCID) {
      incidents = incidents.filter(i => {
          const cidText = (i.cid || (i.tickets && i.tickets[0]?.cid) || "").toLowerCase();
          return cidText.includes(filterCID.toLowerCase());
      });
    }
    if (filterDate) {
        incidents = incidents.filter(i => {
           const d = i.downTime || i.createdAt || "";
           return d.includes(filterDate);
        });
    }

    const list = document.createElement("div");
    list.className = "space-y-3";

    if (incidents.length === 0) {
      list.innerHTML = `
        <div class="py-16 text-center bg-white rounded-3xl border border-dotted border-slate-300">
          <i data-lucide="inbox" class="mx-auto text-slate-200 mb-4" style="width: 40px; height: 40px;"></i>
          <p class="text-slate-400 font-bold uppercase text-[10px] tracking-widest">No matching items in trash</p>
        </div>
      `;
    } else {
      incidents.forEach((i) => {
        list.appendChild(renderCard(i));
      });
    }

    container.appendChild(list);

    setTimeout(() => {
      if (window.lucide) window.lucide.createIcons();
    }, 0);

    return container;
  }

  return { render };
})();

window.RecycleUI = RecycleUI;