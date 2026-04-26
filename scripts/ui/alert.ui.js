// scripts/ui/alert.ui.js

const AlertUI = (function () {
  let currentPage = 1;
  let pageSize = 10;
  let filterType = "all"; // "all" | "dn" | "inf"
  let _lastAlertHash = "";
  let _lastUpdateTime = Date.now();

  // ── Helpers ───────────────────────────────────────────────────────────────

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
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
  }

  function parseDate(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v.toDate === "function") return v.toDate();
    const secs = v.seconds ?? v._seconds;
    if (typeof secs === "number") return new Date(secs * 1000);
    if (window.DateUtils) return window.DateUtils.parseDate(v);
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatDownTime(dateValue) {
    if (!dateValue) return "-";
    const d = parseDate(dateValue);
    if (!d) return "-";
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}<br><span style="opacity:.7">${pad(d.getHours())}:${pad(d.getMinutes())}</span>`;
  }

  function formatElapsed(dateValue) {
    if (!dateValue) return "-";
    const start = parseDate(dateValue);
    if (!start) return "-";
    const totalMins = Math.max(0, Math.floor((Date.now() - start.getTime()) / 60000));
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function getAlertId(alert) {
    return alert.incident || alert.incidentId || alert.id || "";
  }

  function getAlertSortTime(alert) {
    return new Date(
      alert?.createdAt || alert?.actionDate || alert?.downTime || alert?.tickets?.[0]?.downTime || 0
    ).getTime() || 0;
  }

  function isHiddenAlertStatus(status) {
    const normalized = String(status || "").trim().toUpperCase();
    return ["CANCEL", "CANCELLED", "DELETED", "DELETE", "TRASH"].includes(normalized);
  }

  function escapeHtml(value) {
    if (!value) return "-";
    return String(value)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }

  function renderAlertClassBadge(alertClass) {
    if (!alertClass) return "";
    if (alertClass === "Inf") return `<span class="tag inf">Inf#</span>`;
    return `<span class="tag dn">Dn</span>`;
  }

  function sparklineSvg(color) {
    return `<svg width="56" height="24" viewBox="0 0 56 24" fill="none" aria-hidden="true">
      <path d="M1 16 Q7 5, 14 13 Q20 20, 27 9 Q33 2, 40 14 Q46 22, 55 7"
            stroke="${color}" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.6"/>
    </svg>`;
  }

  function updatedAgoText() {
    const secs = Math.floor((Date.now() - _lastUpdateTime) / 1000);
    if (secs < 5)  return "Updated just now";
    if (secs < 60) return `Updated ${secs}s ago`;
    return `Updated ${Math.floor(secs / 60)}m ago`;
  }

  // ── KPI Cards ─────────────────────────────────────────────────────────────

  function renderKPI(allAlerts) {
    const dn  = allAlerts.filter(a => a.alertClass === "Dn").length;
    const inf = allAlerts.filter(a => a.alertClass === "Inf").length;

    // Cleared today: COMPLETE status alerts with timestamp today
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const cleared = (window.Store ? window.Store.getState().alerts || [] : []).filter(a => {
      if (!["COMPLETE", "CLOSED"].includes(String(a.status || "").toUpperCase())) return false;
      const t = new Date(a.completedAt || a.updatedAt || a.createdAt || 0);
      return t >= todayStart;
    }).length;

    function kpiCard(icon, label, valueHtml, subLabel, borderColor, waveColor) {
      return `
        <div class="panel relative overflow-hidden" style="padding:0;border-top:2px solid ${borderColor}">
          <div class="p-4 md:p-5">
            <div class="flex items-start justify-between mb-2">
              <div class="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider" style="color:var(--ink-muted)">
                <i data-lucide="${icon}" class="w-3.5 h-3.5 shrink-0" style="color:${borderColor}"></i>
                ${label}
              </div>
              ${sparklineSvg(waveColor)}
            </div>
            <div class="text-3xl md:text-4xl font-black leading-none mt-1" style="color:var(--ink)">${valueHtml}</div>
            <div class="text-[11px] mt-2 font-semibold" style="color:var(--ink-muted)">${subLabel}</div>
          </div>
        </div>`;
    }

    return `
      <div class="grid grid-cols-3 gap-3 md:gap-4">
        ${kpiCard("alert-circle",   "Down Alerts",   dn,      dn  > 0 ? `<span style="color:var(--sev-dn)">↑ ${dn} active now</span>` : "No active alarms", "var(--sev-dn)",  "#dc2626")}
        ${kpiCard("alert-triangle", "Info Alerts",   inf,     inf > 0 ? `${inf} informational` : "Stable",                                                   "var(--sev-inf)", "#d97706")}
        ${kpiCard("check-circle-2", "Cleared Today", cleared, "resolved today",                                                                               "var(--ok)",      "#0d9488")}
      </div>`;
  }

  // ── Filter Bar ────────────────────────────────────────────────────────────

  function renderFilterBar(allAlerts) {
    const dn    = allAlerts.filter(a => a.alertClass === "Dn").length;
    const inf   = allAlerts.filter(a => a.alertClass === "Inf").length;
    const total = allAlerts.length;

    function chip(key, dotColor, label, count) {
      const isActive = filterType === key;
      return `<button class="am-filter-chip flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap"
        data-ftype="${key}"
        style="${isActive
          ? "background:var(--ink);color:var(--canvas)"
          : "background:var(--surface-2);color:var(--ink-muted);border:1px solid var(--hair-soft)"}">
        ${dotColor ? `<span class="w-2 h-2 rounded-full shrink-0" style="background:${dotColor}"></span>` : ""}
        ${label}
        <span class="font-black text-[10px] min-w-[16px] text-center" style="color:${isActive ? "rgba(255,255,255,.65)" : "var(--ink-muted)"}">${count}</span>
      </button>`;
    }

    return `
      <div class="panel px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2 flex-wrap">
          ${chip("all",  null,             "All",  total)}
          ${chip("dn",   "var(--sev-dn)",  "DN",   dn)}
          ${chip("inf",  "var(--sev-inf)", "INF",  inf)}
        </div>
        <div class="flex items-center gap-3">
          <span id="am-updated-text" class="text-[10px] font-semibold hidden md:block" style="color:var(--ink-dim)">${updatedAgoText()}</span>
          <button class="am-export-btn btn btn-sm" style="background:#10b981;border-color:#10b981;color:#fff;gap:4px">
            <i data-lucide="download" class="w-3 h-3 pointer-events-none"></i> CSV
          </button>
        </div>
      </div>`;
  }

  // ── Table ─────────────────────────────────────────────────────────────────

  function renderTable(alerts) {
    const wrapper = document.createElement("div");
    wrapper.className = "panel overflow-hidden";

    try {
      wrapper.innerHTML = `
        <style>
          @media (max-width: 767px) {
            .am-desktop { display: none !important; }
            .am-mobile  { display: flex !important; }
          }
          @media (min-width: 768px) {
            .am-mobile  { display: none !important; }
            .am-desktop { display: block !important; }
          }
          .am-arrow-btn:hover { background:var(--ink) !important; color:var(--canvas) !important; }
        </style>

        <!-- Mobile cards -->
        <div class="am-mobile flex-col gap-2 p-2 w-full">
          ${alerts.map((alert) => {
            const alertId = getAlertId(alert);
            const isDn  = alert.alertClass === "Dn";
            const isInf = alert.alertClass === "Inf";
            const accentColor = isDn ? "var(--sev-dn)" : isInf ? "var(--sev-inf)" : "var(--accent)";
            const mobileDownSrc = alert.tickets?.[0]?.downTime || alert.createdAt;
            const mobileDownTime = formatDownTime(mobileDownSrc);
            return `
              <div data-detail="${alertId}" class="corrective-card cursor-pointer active:scale-[0.99] overflow-hidden group w-full"
                   style="border-left:3px solid ${accentColor};padding:0">
                <div class="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
                  <div class="flex-1 min-w-0">
                    <p class="text-[9px] font-black uppercase tracking-wider" style="color:var(--ink-dim)">Incident ID</p>
                    <h3 class="text-xs font-black truncate font-mono" style="color:var(--accent)">${normalizeIncidentId(alertId)}</h3>
                  </div>
                  ${renderAlertClassBadge(alert.alertClass)}
                  <span class="text-[9px] font-bold px-1.5 py-0.5 rounded" style="background:var(--surface-2);color:var(--ink-muted)">${mobileDownTime.replace("<br>", " ")}</span>
                </div>
                <div class="px-3 pb-2 space-y-1">
                  <div class="flex gap-2">
                    <span class="text-[9px] font-black uppercase shrink-0 mt-0.5 w-8" style="color:var(--ink-dim)">Node</span>
                    <span class="text-[11px] font-bold" style="color:var(--ink)">${escapeHtml(alert.node)}</span>
                  </div>
                  <div class="flex gap-2">
                    <span class="text-[9px] font-black uppercase shrink-0 mt-0.5 w-8" style="color:var(--ink-dim)">Alarm</span>
                    <span class="text-[11px] font-semibold" style="color:var(--sev-dn)">${escapeHtml(alert.alarm)}</span>
                  </div>
                </div>
                <div class="flex items-center justify-between px-3 py-2" style="border-top:1px solid var(--hair-soft);background:var(--surface-2)">
                  <div class="flex items-center gap-1.5">
                    <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black" style="background:var(--accent-soft);border:1px solid rgba(234,88,12,.2);color:var(--accent)">${alert.tickets ? alert.tickets.length : 0}</span>
                    <span class="text-[9px] font-black uppercase" style="color:var(--ink-dim)">Tickets</span>
                  </div>
                  <div class="flex gap-2">
                    <button class="btn-response btn-action btn-action-purple" data-id="${alertId}">Response</button>
                    <button class="btn btn-danger btn-sm" data-cancel="${alertId}">Cancel</button>
                  </div>
                </div>
              </div>`;
          }).join("")}
        </div>

        <!-- Desktop table -->
        <div class="am-desktop overflow-x-auto">
          <table class="w-full" style="border-collapse:collapse">
            <thead>
              <tr style="background:var(--surface-2);border-bottom:1px solid var(--hair-soft)">
                <th class="px-5 py-3 text-left text-[10px] font-black uppercase tracking-wider" style="color:var(--ink-muted);white-space:nowrap">Incident</th>
                <th class="px-4 py-3 text-center text-[10px] font-black uppercase tracking-wider" style="color:var(--ink-muted);white-space:nowrap">Type</th>
                <th class="px-5 py-3 text-left text-[10px] font-black uppercase tracking-wider" style="color:var(--ink-muted);white-space:nowrap">Node Name</th>
                <th class="px-5 py-3 text-left text-[10px] font-black uppercase tracking-wider" style="color:var(--ink-muted);white-space:nowrap">Alarm</th>
                <th class="px-5 py-3 text-left text-[10px] font-black uppercase tracking-wider" style="color:var(--ink-muted)">Detail</th>
                <th class="px-4 py-3 text-center text-[10px] font-black uppercase tracking-wider" style="color:var(--ink-muted);white-space:nowrap">Down Time</th>
                <th class="px-4 py-3 text-center text-[10px] font-black uppercase tracking-wider" style="color:var(--ink-muted);white-space:nowrap">Tix</th>
                <th class="px-4 py-3 text-center text-[10px] font-black uppercase tracking-wider" style="color:var(--ink-muted)">Action</th>
              </tr>
            </thead>
            <tbody>
              ${alerts.map((alert) => {
                const alertId = getAlertId(alert);
                const isDn  = alert.alertClass === "Dn";
                const isInf = alert.alertClass === "Inf";
                const sideColor = isDn  ? "var(--sev-dn)"
                                : isInf ? "var(--sev-inf)"
                                        : "transparent";
                const downTimeSrc = alert.tickets?.[0]?.downTime || alert.createdAt;
                const downTimeDisplay = formatDownTime(downTimeSrc);
                const elapsedMs = (() => { const d = parseDate(downTimeSrc); return d ? Date.now() - d.getTime() : 0; })();
                const isLong = elapsedMs > 4 * 3600000;
                return `
                  <tr data-detail="${alertId}" class="cursor-pointer group"
                      style="border-bottom:1px solid var(--hair-soft);transition:background .12s">
                    <td class="py-3" style="padding-left:0">
                      <div class="flex items-center">
                        <div style="width:3px;min-height:46px;background:${sideColor};border-radius:0 2px 2px 0;margin-right:16px;flex-shrink:0"></div>
                        <span class="font-black font-mono text-[13px]" style="color:var(--accent)">${normalizeIncidentId(alertId)}</span>
                      </div>
                    </td>
                    <td class="px-4 py-3 text-center">${renderAlertClassBadge(alert.alertClass)}</td>
                    <td class="px-5 py-3 font-bold text-[13px] whitespace-nowrap" style="color:var(--ink)">${escapeHtml(alert.node)}</td>
                    <td class="px-5 py-3 whitespace-nowrap">
                      <span class="inline-block max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-[13px]"
                            style="color:${isDn ? "var(--sev-dn)" : isInf ? "var(--sev-inf)" : "var(--sev-dn)"}"
                            title="${escapeHtml(alert.alarm)}">${escapeHtml(alert.alarm)}</span>
                    </td>
                    <td class="px-5 py-3" style="max-width:0;width:100%">
                      <span class="block overflow-hidden text-ellipsis whitespace-nowrap text-xs" style="color:var(--ink-muted)"
                            title="${escapeHtml(alert.detail)}">${escapeHtml(alert.detail) || "-"}</span>
                    </td>
                    <td class="px-4 py-3 text-center whitespace-nowrap">
                      <span class="font-semibold text-[11px] leading-tight" style="color:${isLong ? "var(--sev-dn)" : "var(--ink-muted)"}">${downTimeDisplay}</span>
                    </td>
                    <td class="px-4 py-3 text-center">
                      <span class="inline-flex items-center justify-center w-7 h-7 rounded-full font-black text-xs"
                            style="background:${isDn ? "var(--sev-dn-soft)" : "var(--accent-soft)"};color:${isDn ? "var(--sev-dn)" : "var(--accent)"};border:1px solid ${isDn ? "rgba(220,38,38,.2)" : "rgba(234,88,12,.2)"}">
                        ${alert.tickets ? alert.tickets.length : 0}
                      </span>
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex items-center justify-center gap-2" style="opacity:.75;transition:opacity .15s" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity='.75'">
                        <button class="btn-response btn-action btn-action-purple" data-id="${alertId}" style="font-size:10px;letter-spacing:.04em">
                          ⚡ Response
                        </button>
                        <button class="am-arrow-btn" data-arrow-detail="${alertId}"
                          style="width:28px;height:28px;border-radius:50%;border:1px solid var(--hair);background:var(--surface-2);color:var(--ink-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;transition:all .15s;flex-shrink:0">
                          →
                        </button>
                      </div>
                    </td>
                  </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      wrapper.innerHTML = `<div style="padding:20px;color:var(--sev-dn)">Error: ${err.message}</div>`;
      console.error(err);
    }

    setTimeout(() => {
      // Cancel buttons
      wrapper.querySelectorAll("[data-cancel]").forEach((btn) => {
        btn.onclick = (e) => { e.stopPropagation(); AlertService.cancelAlert(btn.dataset.cancel); };
      });

      // Row / mobile-card click → detail
      const openDetail = (id) => {
        const all = Store.getState().alerts.filter((a) => !isHiddenAlertStatus(a.status));
        const selected = all.filter((a) => getAlertId(a) === id);
        if (!selected.length) return;
        Store.dispatch((s) => ({
          ...s, ui: { ...s.ui, currentView: "alert-detail", alertDetailReturnView: s.ui.currentView, selectedAlerts: selected, selectedIncident: null },
        }));
      };

      wrapper.querySelectorAll("tr[data-detail], div[data-detail]").forEach((row) => {
        row.onclick = (e) => { if (e.target.closest("button")) return; openDetail(row.dataset.detail); };
      });

      wrapper.querySelectorAll("[data-arrow-detail]").forEach((btn) => {
        btn.onclick = (e) => { e.stopPropagation(); openDetail(btn.dataset.arrowDetail); };
      });

      // Row hover
      wrapper.querySelectorAll("tr[data-detail]").forEach((row) => {
        const base = row.style.background;
        row.addEventListener("mouseenter", () => { row.style.background = "var(--surface-2)"; });
        row.addEventListener("mouseleave", () => { row.style.background = base || ""; });
      });
    });

    return wrapper;
  }

  // ── Main render ───────────────────────────────────────────────────────────

  function render(state) {
    const container = document.createElement("div");
    container.className = "space-y-3";

    const allAlerts = (state.alerts || [])
      .filter((a) => !isHiddenAlertStatus(a.status))
      .slice().sort((a, b) => getAlertSortTime(b) - getAlertSortTime(a));

    // Track data change time
    const hash = allAlerts.map(getAlertId).join(",");
    if (hash !== _lastAlertHash) { _lastAlertHash = hash; _lastUpdateTime = Date.now(); }

    // Page header
    container.insertAdjacentHTML("beforeend", `
      <div class="flex items-end justify-between gap-3 mb-1">
        <div>
          <div class="flex items-center gap-3">
            <h2 class="text-2xl font-black tracking-tight" style="color:var(--ink)">Alert Monitor</h2>
          </div>
          <p class="text-xs font-bold uppercase tracking-wider mt-0.5" style="color:var(--ink-muted)">
            ศูนย์รับเหตุแบบเรียลไทม์ · Real-time inbound
          </p>
        </div>
      </div>`);

    if (!allAlerts.length) {
      container.insertAdjacentHTML("beforeend", `
        <div class="panel p-16 text-center">
          <i data-lucide="inbox" class="w-12 h-12 mx-auto mb-4" style="color:var(--ink-dim)"></i>
          <p class="font-bold" style="color:var(--ink-muted)">No active alerts</p>
          <p class="text-sm mt-1" style="color:var(--ink-dim)">System is clear</p>
        </div>`);
      setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 0);
      return container;
    }

    // Type filter
    const filtered = filterType === "dn"  ? allAlerts.filter(a => a.alertClass === "Dn")
                   : filterType === "inf" ? allAlerts.filter(a => a.alertClass === "Inf")
                   : allAlerts;

    // KPI cards
    container.insertAdjacentHTML("beforeend", renderKPI(allAlerts));

    // Filter bar
    container.insertAdjacentHTML("beforeend", renderFilterBar(allAlerts));

    // Pagination
    const size = pageSize === "all" ? Math.max(filtered.length, 1) : Number(pageSize || 10);
    const totalPages = Math.max(1, Math.ceil(filtered.length / size));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * size;
    const pagedAlerts = filtered.slice(start, start + size);

    // Table
    container.appendChild(renderTable(pagedAlerts));

    // Pagination bar
    const pagBar = document.createElement("div");
    pagBar.className = "panel";
    pagBar.innerHTML = `
      <div class="panel-body" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px">
        <span class="text-xs font-semibold" style="color:var(--ink-muted);white-space:nowrap">
          Showing <strong style="color:var(--ink)">${start + 1}–${Math.min(start + pagedAlerts.length, filtered.length)}</strong>
          of <strong style="color:var(--ink)">${filtered.length}</strong> alerts
        </span>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:nowrap;white-space:nowrap">
          <label class="text-xs font-semibold" style="color:var(--ink-muted)">Per page</label>
          <select class="am-page-size form-input text-xs" style="height:32px;padding:0 8px;min-width:60px">
            ${["10","20","50","100","all"].map(v => `<option value="${v}" ${String(pageSize)===v?"selected":""}>${v==="all"?"All":v}</option>`).join("")}
          </select>
          <button class="am-prev btn btn-sm btn-ghost ${currentPage<=1?"opacity-40 cursor-not-allowed":""}" ${currentPage<=1?"disabled":""} style="white-space:nowrap">‹ Prev</button>
          <span class="text-xs font-black px-3 py-1 rounded-lg" style="background:var(--surface-2);border:1px solid var(--hair);color:var(--ink-muted);white-space:nowrap">${currentPage} / ${totalPages}</span>
          <button class="am-next btn btn-sm btn-ghost ${currentPage>=totalPages?"opacity-40 cursor-not-allowed":""}" ${currentPage>=totalPages?"disabled":""} style="white-space:nowrap">Next ›</button>
        </div>
      </div>`;
    container.appendChild(pagBar);

    // Wire filter chips
    container.querySelectorAll(".am-filter-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        filterType = chip.dataset.ftype;
        currentPage = 1;
        Store.dispatch(s => ({ ...s }));
      });
    });

    // Wire CSV
    container.querySelector(".am-export-btn")?.addEventListener("click", () => {
      if (window.ExportUtil) ExportUtil.exportAlerts(allAlerts);
    });

    // Wire pagination
    const rerender = () => Store.dispatch(s => ({ ...s }));
    container.querySelector(".am-page-size")?.addEventListener("change", e => {
      pageSize = e.target.value === "all" ? "all" : Number(e.target.value || 10);
      currentPage = 1; rerender();
    });
    container.querySelector(".am-prev")?.addEventListener("click", () => {
      if (currentPage > 1) { currentPage--; rerender(); }
    });
    container.querySelector(".am-next")?.addEventListener("click", () => {
      if (currentPage < totalPages) { currentPage++; rerender(); }
    });

    setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 0);

    return container;
  }

  return { render };
})();

window.AlertUI = AlertUI;
