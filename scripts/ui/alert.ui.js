// scripts/ui/alert.ui.js

const AlertUI = (function () {
  let currentPage = 1;
  let pageSize = 10;
  function normalizeIncidentId(incidentId) {
    if (!incidentId || typeof incidentId !== "string") return "-";

    const match = incidentId.match(/^(I\d{4})-(\d+)$/);
    if (!match) return incidentId;

    return `${match[1]}-${match[2].padStart(6, "0")}`;
  }

  function formatDateTime(dateValue) {
    if (!dateValue) return "-";

    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return dateValue;

    return parsed.toLocaleString("th-TH", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  function getAlertId(alert) {
    return alert.incident || alert.incidentId || alert.id || "";
  }

  function getAlertSortTime(alert) {
    return new Date(
      alert?.createdAt
      || alert?.actionDate
      || alert?.downTime
      || alert?.tickets?.[0]?.downTime
      || 0
    ).getTime() || 0;
  }

  function isHiddenAlertStatus(status) {
    const normalized = String(status || "").trim().toUpperCase();
    return ["CANCEL", "CANCELLED", "DELETED", "DELETE", "TRASH"].includes(normalized);
  }

  function renderAlertClassBadge(alertClass) {
    if (!alertClass) return "";
    if (alertClass === "Inf") {
      return `<span class="px-1.5 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded text-[9px] font-black uppercase tracking-wider shrink-0">Inf#</span>`;
    }
    return `<span class="px-1.5 py-0.5 bg-rose-100 text-rose-700 border border-rose-200 rounded text-[9px] font-black uppercase tracking-wider shrink-0">Dn</span>`;
  }

  function escapeHtml(value) {
    if (!value) return "-";
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderTable(alerts) {
    const wrapper = document.createElement("div");
    wrapper.className = "ops-panel overflow-hidden";
    
    try {
      wrapper.innerHTML = `
        <style>
          @media (max-width: 767px) {
            .responsive-desktop-view { display: none !important; }
            .responsive-mobile-view { display: flex !important; }
          }
          @media (min-width: 768px) {
            .responsive-mobile-view { display: none !important; }
            .responsive-desktop-view { display: block !important; }
          }
        </style>
        
        <div class="responsive-mobile-view flex-col gap-2 p-2 w-full max-w-full overflow-hidden">
          ${alerts
            .map((alert) => {
              const alertId = getAlertId(alert);
              return `
                <div data-detail="${alertId}" class="bg-white rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:shadow-md transition-all active:scale-[0.99] overflow-hidden group w-full">
                  <div class="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
                    <div class="w-1 self-stretch rounded-full bg-orange-500 shrink-0"></div>
                    <div class="flex-1 min-w-0">
                      <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Incident ID</p>
                      <h3 class="text-xs font-black text-orange-600 truncate">${normalizeIncidentId(alertId)}</h3>
                    </div>
                    ${renderAlertClassBadge(alert.alertClass)}
                    <span class="shrink-0 px-1.5 py-0.5 bg-slate-100 rounded-md text-[9px] font-bold text-slate-500">${formatDateTime(alert.tickets?.[0]?.downTime)}</span>
                  </div>
                  <div class="px-3 pb-2 space-y-1">
                    <div class="flex gap-1.5 items-start">
                      <span class="text-[9px] font-black text-slate-400 uppercase shrink-0 mt-0.5 w-8">Node</span>
                      <span class="text-[11px] font-bold text-slate-700 break-words leading-snug">${escapeHtml(alert.node)}</span>
                    </div>
                    <div class="flex gap-1.5 items-start">
                      <span class="text-[9px] font-black text-slate-400 uppercase shrink-0 mt-0.5 w-8">Alarm</span>
                      <span class="text-[11px] font-semibold text-rose-500 leading-snug break-words">${escapeHtml(alert.alarm)}</span>
                    </div>
                    ${alert.detail ? `<div class="flex gap-1.5 items-start">
                      <span class="text-[9px] font-black text-slate-400 uppercase shrink-0 mt-0.5 w-8">Detail</span>
                      <span class="text-[11px] text-slate-500 leading-snug line-clamp-1">${escapeHtml(alert.detail)}</span>
                    </div>` : ""}
                  </div>
                  <div class="flex items-center justify-between border-t border-slate-100 px-3 py-2 bg-slate-50/60">
                    <div class="flex items-center gap-1 shrink-0">
                      <span class="w-5 h-5 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600 font-bold text-[10px]">${alert.tickets ? alert.tickets.length : 0}</span>
                      <span class="text-[9px] font-bold text-slate-400 uppercase">Tickets</span>
                    </div>
                    <div class="flex gap-1.5 shrink-0">
                      <button class="btn-response px-3 py-1.5 bg-zinc-900 text-white hover:bg-black rounded-lg text-[10px] font-bold uppercase transition-colors shadow-sm" data-id="${alertId}">Response</button>
                      <button class="px-2.5 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-[10px] font-bold uppercase transition-colors" data-cancel="${alertId}">Cancel</button>
                    </div>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>

        <div class="responsive-desktop-view overflow-x-auto bg-white rounded-2xl shadow-sm border border-slate-100 mb-8 w-full">
          <table class="w-full text-sm text-left">
            <thead class="bg-gradient-to-r from-zinc-900 to-zinc-800 text-white font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th class="px-6 py-4 rounded-tl-xl whitespace-nowrap">ID</th>
                <th class="px-4 py-4 whitespace-nowrap text-center">Type</th>
                <th class="px-6 py-4 whitespace-nowrap">Node Name</th>
                <th class="px-6 py-4 whitespace-nowrap">Alarm</th>
                <th class="px-6 py-4">Detail</th>
                <th class="px-6 py-4 whitespace-nowrap">Down Time</th>
                <th class="px-6 py-4 text-center whitespace-nowrap">Tickets</th>
                <th class="px-6 py-4 text-center rounded-tr-xl">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100/80">
              ${alerts
                .map((alert) => {
                    const alertId = getAlertId(alert);
                    const isDn  = alert.alertClass === "Dn";
                    const isInf = alert.alertClass === "Inf";
                    const rowBg = isDn  ? "bg-rose-50/50 hover:bg-rose-50/80 border-l-[3px] border-l-rose-400"
                                : isInf ? "bg-amber-50/40 hover:bg-amber-50/70 border-l-[3px] border-l-amber-400"
                                        : "hover:bg-slate-50/80 border-l-[3px] border-l-transparent";
                    return `
                <tr data-detail="${alertId}" class="cursor-pointer ${rowBg} transition-all duration-150 group">
                  <td class="px-6 py-3.5">
                    <span class="font-black text-orange-600 group-hover:text-orange-500 transition-colors text-[13px]">${normalizeIncidentId(alertId)}</span>
                  </td>
                  <td class="px-4 py-3.5 text-center">${renderAlertClassBadge(alert.alertClass)}</td>
                  <td class="px-6 py-3.5 font-bold text-slate-800 whitespace-nowrap text-[13px]">${escapeHtml(alert.node)}</td>
                  <td class="px-6 py-3.5 whitespace-nowrap">
                    <span class="inline-block max-w-[160px] lg:max-w-[220px] xl:max-w-[300px] truncate font-semibold ${isDn ? "text-rose-600" : isInf ? "text-amber-600" : "text-rose-500"} text-[13px]" title="${escapeHtml(alert.alarm)}">${escapeHtml(alert.alarm)}</span>
                  </td>
                  <td class="px-6 py-3.5 max-w-0 w-full">
                    <span class="block truncate text-slate-500 text-xs leading-relaxed" title="${escapeHtml(alert.detail)}">${escapeHtml(alert.detail) || "-"}</span>
                  </td>
                  <td class="px-6 py-3.5 text-xs font-medium text-slate-500 whitespace-nowrap">${formatDateTime(alert.tickets?.[0]?.downTime)}</td>
                  <td class="px-6 py-3.5 text-center">
                    <span class="inline-flex items-center justify-center w-7 h-7 rounded-full ${isDn ? "bg-rose-100 text-rose-600 border border-rose-200" : "bg-orange-50 text-orange-600 border border-orange-100"} font-bold text-xs">${alert.tickets ? alert.tickets.length : 0}</span>
                  </td>
                  <td class="px-6 py-3.5">
                    <div class="flex items-center justify-center gap-2 opacity-70 group-hover:opacity-100 transition-opacity">
                      <button class="btn-response px-4 py-1.5 bg-zinc-900 text-white hover:bg-zinc-700 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors shadow-sm" data-id="${alertId}">Response</button>
                      <button class="px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors border border-rose-100" data-cancel="${alertId}">Cancel</button>
                    </div>
                  </td>
                </tr>
             `;
                  }
                ).join("")}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      wrapper.innerHTML = `<div class="p-8 text-rose-500 font-bold bg-rose-50 rounded-xl border border-rose-100">Error rendering Alert Table: ${err.message}</div>`;
      console.error(err);
    }

    setTimeout(() => {
      wrapper.querySelectorAll("[data-cancel]").forEach((button) => {
        button.onclick = () => {
          AlertService.cancelAlert(button.dataset.cancel);
        };
      });

      wrapper.querySelectorAll("[data-detail]").forEach((row) => {
        row.onclick = (event) => {
          if (event.target.closest("button")) {
            return;
          }

          const clickedId = row.dataset.detail;
          const allAlerts = Store.getState().alerts.filter(
            (a) => !isHiddenAlertStatus(a.status)
          );
          // Group all alerts with same incidentId
          const selectedAlerts = allAlerts.filter((a) => getAlertId(a) === clickedId);
          if (!selectedAlerts.length) return;

          Store.dispatch((state) => ({
            ...state,
            ui: {
              ...state.ui,
              currentView: "alert-detail",
              alertDetailReturnView: state.ui.currentView,
              selectedAlerts: selectedAlerts,
              selectedIncident: null,
            },
          }));
        };
      });
    });

    return wrapper;
  }

  function render(state) {
    const container = document.createElement("div");
    container.className = "space-y-5";

    const alerts = (state.alerts || [])
      .filter((alert) => !isHiddenAlertStatus(alert.status))
      .slice()
      .sort((a, b) => getAlertSortTime(b) - getAlertSortTime(a));

    if (!alerts.length) {
      container.innerHTML = `
        <div class="ops-panel p-12 text-center text-slate-400">
          No alerts in system
        </div>
      `;
      return container;
    }

    const size = pageSize === "all" ? alerts.length || 1 : Number(pageSize || 10);
    const totalPages = Math.max(1, Math.ceil(alerts.length / size));

    // If navigating from search, jump to the page containing the target item
    const jumpId = state.ui.highlightIncidentId;
    if (jumpId) {
      const idx = alerts.findIndex(a => (getAlertId(a) || "").toLowerCase() === jumpId.toLowerCase());
      if (idx !== -1) currentPage = Math.floor(idx / size) + 1;
    }

    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * size;
    const pagedAlerts = alerts.slice(start, start + size);

    const controls = document.createElement("div");
    controls.className = "bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 flex flex-wrap items-center justify-between gap-3";
    controls.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Showing <span class="text-slate-700 font-bold">${start + 1}–${Math.min(start + pagedAlerts.length, alerts.length)}</span> of <span class="text-slate-700 font-bold">${alerts.length}</span> alerts</div>
        <button class="alert-export-btn flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors shadow-sm shadow-emerald-200">
          <i data-lucide="download" class="w-3 h-3 pointer-events-none"></i> CSV
        </button>
      </div>
      <div class="flex items-center gap-2">
        <label class="text-xs text-slate-400 font-semibold uppercase tracking-wider">Per page</label>
        <select class="alert-page-size bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-300">
          <option value="10" ${String(pageSize) === "10" ? "selected" : ""}>10</option>
          <option value="20" ${String(pageSize) === "20" ? "selected" : ""}>20</option>
          <option value="50" ${String(pageSize) === "50" ? "selected" : ""}>50</option>
          <option value="100" ${String(pageSize) === "100" ? "selected" : ""}>100</option>
          <option value="all" ${String(pageSize) === "all" ? "selected" : ""}>All</option>
        </select>
        <button class="alert-page-prev px-4 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-600 transition-colors ${currentPage <= 1 ? "opacity-40 cursor-not-allowed" : ""}" ${currentPage <= 1 ? "disabled" : ""}>Prev</button>
        <span class="text-[10px] font-bold text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">${currentPage} / ${totalPages}</span>
        <button class="alert-page-next px-4 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-600 transition-colors ${currentPage >= totalPages ? "opacity-40 cursor-not-allowed" : ""}" ${currentPage >= totalPages ? "disabled" : ""}>Next</button>
      </div>
    `;
    container.appendChild(controls);
    container.appendChild(renderTable(pagedAlerts));

    const rerender = () => Store.dispatch((s) => ({ ...s }));

    controls.querySelector(".alert-export-btn")?.addEventListener("click", () => {
      if (window.ExportUtil) ExportUtil.exportAlerts(alerts);
    });

    controls.querySelector(".alert-page-size")?.addEventListener("change", (event) => {
      pageSize = event.target.value === "all" ? "all" : Number(event.target.value || 10);
      currentPage = 1;
      rerender();
    });
    controls.querySelector(".alert-page-prev")?.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage -= 1;
        rerender();
      }
    });
    controls.querySelector(".alert-page-next")?.addEventListener("click", () => {
      if (currentPage < totalPages) {
        currentPage += 1;
        rerender();
      }
    });

    return container;
  }

  function getAlertNode(alert) {
    return alert.node || alert.nodeName || alert.Node || "-";
  }

  return { render };

})();

window.AlertUI = AlertUI;
