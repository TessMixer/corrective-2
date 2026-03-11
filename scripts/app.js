import { initFirebase } from "./services/firebase.service.js";

// ===== VIEW SWITCHER =====
function showView(view) {
  document.querySelectorAll(".view-content").forEach((section) => {
    section.classList.add("hidden");
    section.style.display = "none";
  });

  const targetView = document.getElementById(`view-${view}`);
  if (targetView) {
    targetView.classList.remove("hidden");
    targetView.style.display = "block";
  }
}
function getIncidentKey(item) {
  return item?.incident || item?.incidentId || item?.id || "";
}

(function bootstrapApp() {
  const firebaseReady = initFirebase();
  const createAlertModal = document.getElementById("modal-create-alert");

  function openModal(modalEl) {
    if (modalEl) {
      modalEl.classList.remove("hidden");
    }
  }

  function closeModal(modalEl) {
    if (modalEl) {
      modalEl.classList.add("hidden");
    }
  }



  // ===== MOBILE SIDEBAR =====
  const sidebarToggleBtn = document.getElementById("btn-toggle-sidebar");
  const sidebarOverlay = document.getElementById("sidebar-overlay");

  const mobileBreakpoint = 1024;

  function setSidebarDesktopCollapsed(isCollapsed) {
    document.body.classList.toggle("sidebar-collapsed", isCollapsed);
  }

  function setSidebarMobileOpen(isOpen) {
    document.body.classList.toggle("sidebar-open", isOpen);
  }

  function isMobileViewport() {
    return window.innerWidth <= mobileBreakpoint;
  }


  if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener("click", () => {
      if (isMobileViewport()) {
        const nextState = !document.body.classList.contains("sidebar-open");
        setSidebarMobileOpen(nextState);
        return;
      }

      setSidebarMobileOpen(false);

      const nextState = !document.body.classList.contains("sidebar-collapsed");
      setSidebarDesktopCollapsed(nextState);
    });
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", () => setSidebarMobileOpen(false));
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setSidebarMobileOpen(false);
    }
  });

  document.querySelectorAll(".nav-item, .sub-nav-item").forEach((item) => {
    item.addEventListener("click", () => {
       if (isMobileViewport()) {
        setSidebarMobileOpen(false);
      }
    });
  });
  
    window.addEventListener("resize", () => {
  
      if (window.innerWidth <= 1024) {
        document.body.classList.remove("sidebar-collapsed");
      } else {
        document.body.classList.remove("sidebar-open");
      }
      if (typeof currentZoom !== "undefined") {
        applyAppZoom(currentZoom);
      }
    });

  // ===== APP LAYOUT (NO ZOOM CONTROLS) =====
  const appShell = document.getElementById("app-shell");
  if (appShell) {
    appShell.style.zoom = "";
    appShell.style.width = "";
    appShell.style.height = "";
    appShell.style.transformOrigin = "";
  }

  // ===== CREATE ALERT BUTTONS =====
  const btnCreate = document.getElementById("btn-create-alert");
  if (btnCreate) {
    btnCreate.addEventListener("click", () => openModal(createAlertModal));
  }


  const btnClose = document.getElementById("btn-close-create-alert");
  if (btnClose) {
    btnClose.addEventListener("click", () => {
      closeModal(createAlertModal);
      resetCreateTicketForm();
    });
  }

  const btnDiscard = document.getElementById("btn-discard-create-alert");
  if (btnDiscard) {
    btnDiscard.addEventListener("click", () => {
      closeModal(createAlertModal);
      resetCreateTicketForm();
    });
  }

  // ===== CREATE INCIDENT FORM =====␊
  const incidentForm = document.getElementById("create-incident-form");

  function generateIncidentId() {
    const now = new Date();
    const year = now.getFullYear().toString().slice(2);
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const random = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");

    return `I${year}${month}-${random}`;
  }

  function buildTicketsFromForm() {
    const ticketItems = document.querySelectorAll("#ticket-container .ticket-item");

    return Array.from(ticketItems)
      .map((item) => {
        const fields = item.querySelectorAll("input");

        return {
          symphonyTicket: fields[0]?.value?.trim() || "",
          cid: fields[1]?.value?.trim() || "",
          port: fields[2]?.value?.trim() || "",
          downTime: fields[3]?.value || "",
          clearTime: fields[4]?.value || "",
          total: "",
          pending: fields[5]?.value?.trim() || "",
          actualDowntime: "",
          originate: fields[6]?.value?.trim() || "",
          terminate: fields[7]?.value?.trim() || "",
        };
      })
      .filter((ticket) => Object.values(ticket).some((value) => value));
  }

  if (incidentForm) {
    incidentForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const data = {
        incidentId: generateIncidentId(),
        workType: "",
        node: document.getElementById("f-node").value,
        alarm: document.getElementById("f-alarm").value,
        detail: document.getElementById("f-detail").value,
        nocBy: "System",
        severity: "Medium",
        status: "ACTIVE",
        tickets: buildTicketsFromForm(),
      };

        AlertService.createAlert(data);
      closeModal(createAlertModal);
      resetCreateTicketForm();
    });
  }

  // ===== NAVIGATION =====␊
  document.querySelectorAll("[data-view]").forEach((el) => {
    el.addEventListener("click", () => {
      const dashboardSubview = el.dataset.dashboardSubview;
      Store.dispatch((state) => ({
        ...state,
        ui: {
          ...state.ui,
          currentView: el.dataset.view,
          ...(dashboardSubview ? { dashboardSubView: dashboardSubview } : {}),
        },
      }));
    });
  });

  // ===== RENDER =====␊
  function render(state) {
    document.querySelectorAll(".view-content").forEach((view) => {
      view.classList.add("hidden");
      view.style.display = "none";
    });
    if (state.ui.currentView !== "dashboard") {
      destroyAllDashboardCharts();
    }

    if (state.ui.currentView === "dashboard") {
      renderDashboardView(state);
    }
    if (state.ui.currentView === "alert") {
      const container = document.getElementById("alert-table-container");
      if (container) {
        container.innerHTML = "";
        container.appendChild(AlertUI.render(state));
      }
    }

    if (state.ui.currentView === "alert-detail") {
      const container = document.getElementById("view-alert-detail");
      if (container) {
        const incident = state.ui.selectedIncident || getSampleIncidentData();
        AlertDetailUI.render(incident);
      }
    }

    if (state.ui.currentView === "corrective") {
      const container = document.getElementById("corrective-container");
      if (container) {
        container.innerHTML = "";
        container.appendChild(CorrectiveUI.render(state));
      }
    }

    if (state.ui.currentView === "calendar") {
      const container = document.getElementById("calendar-container");
      if (container) {
        container.innerHTML = "";
        container.appendChild(CalendarUI.render(state));
      }
    }


    if (state.ui.currentView === "history") {
      const container = document.getElementById("history-grid");
      if (container) {
        container.innerHTML = "";
        container.appendChild(HistoryUI.render(state));
      }
    }

    if (state.ui.currentView === "recycle") {
      renderRecycleView(state);
    }

    if (state.ui.currentView === "subcontractor") {
      renderSubcontractorView(state);
    }
    const activeView = document.getElementById(`view-${state.ui.currentView}`);
    if (activeView) {
      activeView.classList.remove("hidden");
      activeView.style.display = "block";
    }

    document.querySelectorAll(".nav-item, .sub-nav-item").forEach((nav) => {
      nav.classList.remove("active");
    });

    if (state.ui.currentView === "dashboard") {
      const parent = document.getElementById("menu-dashboard");
      if (parent) parent.classList.add("active");
      const sub = document.querySelector(`#dashboard-submenu [data-dashboard-subview="${state.ui.dashboardSubView || "main"}"]`);
      if (sub) sub.classList.add("active");
    } else {
      const activeNav = document.querySelector(`[data-view="${state.ui.currentView}"]`);
      if (activeNav) {
        activeNav.classList.add("active");
      }
    }
  }

  const dashboardCharts = {
    status: null,
    mttrTrend: null,
    workType: null,
    zone: null,
    summaryMttr: null,
    summaryCause: null,
    regionWeekly: null,
    reportMain: null,
    reportIncident: null,
    reportCause: null,
    reportDelayed: null,
  };

  function destroyDashboardChart(key) {
    if (dashboardCharts[key]) {
      dashboardCharts[key].destroy();
      dashboardCharts[key] = null;
    }
  }

  function destroyAllDashboardCharts() {
    Object.keys(dashboardCharts).forEach((key) => destroyDashboardChart(key));
  }

  function createChartInstance(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return null;
    try {
      return new Chart(canvas, config);
    } catch (error) {
      console.warn(`Chart render skipped for ${canvasId}:`, error);
      return null;
    }
  }

  function getChartFontSize() {
    if (window.innerWidth <= 640) return 10;
    if (window.innerWidth <= 1280) return 11;
    return 12;
  }

  function createLegend(position = "top") {
    return {
      position,
      align: "end",
      labels: {
        usePointStyle: true,
        boxWidth: 10,
        boxHeight: 10,
        padding: 14,
        font: { size: getChartFontSize() },
      },
    };
  }

  function buildBaseChartOptions(overrides = {}) {
    const fontSize = getChartFontSize();
    return {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 120,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: createLegend(),
        tooltip: {
          padding: 10,
          bodyFont: { size: fontSize },
          titleFont: { size: fontSize },
        },
      },
      ...overrides,
    };
  }

  function buildCartesianOptions(overrides = {}) {
    const fontSize = getChartFontSize();
    return buildBaseChartOptions({
      scales: {
        x: {
          ticks: { autoSkip: true, maxRotation: 0, minRotation: 0, font: { size: fontSize } },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          grace: "10%",
          ticks: { precision: 0, font: { size: fontSize } },
        },
      },
      ...overrides,
    });
  }

  const doughnutValuePlugin = {
    id: "doughnutValuePlugin",
    afterDatasetsDraw(chart, args, pluginOptions) {
      if (!pluginOptions?.enabled) return;
      if (!["doughnut", "pie"].includes(chart.config.type)) return;

      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      const dataset = chart.data.datasets?.[0];
      if (!meta?.data?.length || !dataset) return;

      ctx.save();
      meta.data.forEach((arc, index) => {
        const rawValue = Number(dataset.data?.[index] || 0);
        if (!rawValue) return;

        const pos = arc.tooltipPosition();
        const outerRadius = arc.outerRadius || 0;
        const innerRadius = arc.innerRadius || 0;
        const fontSize = Math.max(11, Math.min(18, (outerRadius - innerRadius) * 0.42));

        ctx.font = `700 ${fontSize}px Inter, Sarabun, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(15, 23, 42, 0.28)";
        ctx.fillStyle = "#ffffff";
        ctx.strokeText(String(rawValue), pos.x, pos.y);
        ctx.fillText(String(rawValue), pos.x, pos.y);
      });
      ctx.restore();
    },
  };

  if (window.Chart && !window.__nocDoughnutValuePluginRegistered) {
    Chart.register(doughnutValuePlugin);
    window.__nocDoughnutValuePluginRegistered = true;
  }

  function normalizeRecycleStatus(status = "") {
    return String(status || "").trim().toUpperCase();
  }

  function isRecycleStatus(status = "") {
    return ["CANCEL", "CANCELLED", "DELETED", "DELETE", "TRASH"].includes(normalizeRecycleStatus(status));
  }

  function formatRecycleTimestamp(item) {
    const value = item.deletedAt || item.cancelledAt || item.updatedAt || item.completedAt || item.createdAt || item.respondedAt;
    if (!value) return "-";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  }

  function getRecycleBinItems(state) {
    const items = [];

    (state.alerts || []).forEach((item) => {
      if (!isRecycleStatus(item.status)) return;
      items.push({
        recycleKey: `alert:${getIncidentKey(item)}`,
        source: "alert",
        typeLabel: "Alert",
        id: getIncidentKey(item),
        title: item.node || item.alarm || getIncidentKey(item),
        status: item.status,
        meta: item.cancelReason || item.detail || "งานถูกยกเลิก",
        timestamp: formatRecycleTimestamp(item),
        sortValue: new Date(item.deletedAt || item.cancelledAt || item.updatedAt || item.completedAt || item.createdAt || item.respondedAt || 0).getTime(),
      });
    });

    Object.entries(state.corrective || {}).forEach(([bucket, list]) => {
      (list || []).forEach((item) => {
        if (!isRecycleStatus(item.status)) return;
        items.push({
          recycleKey: `corrective:${bucket}:${item.incidentId}`,
          source: "corrective",
          bucket,
          typeLabel: `Corrective / ${item.workType || bucket}`,
          id: getIncidentKey(item),
          title: item.node || item.alarm || getIncidentKey(item),
          status: item.status,
          meta: item.cancelReason || item.latestUpdateMessage || item.detail || "งานถูกยกเลิก",
          timestamp: formatRecycleTimestamp(item),
          sortValue: new Date(item.deletedAt || item.cancelledAt || item.updatedAt || item.completedAt || item.createdAt || item.respondedAt || 0).getTime(),
        });
      });
    });

    (state.calendarEvents || []).forEach((item) => {
      if (!isRecycleStatus(item.status)) return;
      items.push({
        recycleKey: `calendar:${item.id}`,
        source: "calendar",
        id: item.id,
        typeLabel: "Calendar Job",
        title: item.title || item.node || item.id,
        status: item.status,
        meta: item.cancelReason || item.description || "งานถูกยกเลิก",
        timestamp: formatRecycleTimestamp(item),
        sortValue: new Date(item.deletedAt || item.cancelledAt || item.updatedAt || item.completedAt || item.createdAt || item.respondedAt || 0).getTime(),
      });
    });

    return items.sort((a, b) => {
      const da = new Date(a.timestamp).getTime();
      const db = new Date(b.timestamp).getTime();
      if (Number.isNaN(da) || Number.isNaN(db)) return String(b.id).localeCompare(String(a.id));
      return db - da;
    });
  }

  function restoreRecycleItem(recycleKey) {
    const current = Store.getState();
    const [source, bucket, id] = String(recycleKey || "").split(":");

    if (source === "alert") {
      const incidentId = bucket;
      const nextAlerts = (current.alerts || []).map((item) =>
        getIncidentKey(item) === incidentId
          ? {
              ...item,
              status: item.previousStatus || "ACTIVE",
              previousStatus: undefined,
              cancelReason: undefined,
              cancelledAt: undefined,
              deletedAt: undefined,
            }
          : item
      );
      LocalDB.saveState({ alerts: nextAlerts, corrective: current.corrective, calendarEvents: current.calendarEvents });
      Store.dispatch((state) => ({ ...state, alerts: nextAlerts }));
      return;
    }

    if (source === "corrective") {
      const nextCorrective = { ...current.corrective };
      nextCorrective[bucket] = (nextCorrective[bucket] || []).map((item) =>
          getIncidentKey(item) === id
          ? {
              ...item,
              status: item.previousStatus || (item.respondedAt ? "PROCESS" : "ASSIGN"),
              previousStatus: undefined,
              cancelReason: undefined,
              cancelledAt: undefined,
              deletedAt: undefined,
            }
          : item
      );
      LocalDB.saveState({ alerts: current.alerts, corrective: nextCorrective, calendarEvents: current.calendarEvents });
      Store.dispatch((state) => ({ ...state, corrective: nextCorrective }));
      return;
    }

    if (source === "calendar") {
      const calendarId = bucket;
      const nextCalendarEvents = (current.calendarEvents || []).map((item) =>
        String(item.id) === String(calendarId)
          ? {
              ...item,
              status: item.previousStatus || "SCHEDULED",
              previousStatus: undefined,
              cancelReason: undefined,
              cancelledAt: undefined,
              deletedAt: undefined,
            }
          : item
      );
      LocalDB.saveState({ alerts: current.alerts, corrective: current.corrective, calendarEvents: nextCalendarEvents });
      Store.dispatch((state) => ({ ...state, calendarEvents: nextCalendarEvents }));
    }
  }

  async function purgeAlertsFromCloud(items = []) {
    const payloadItems = items
      .filter((item) => item?.source === "alert")
      .map((item) => ({ incident: item.id, node: item.node || "-" }))
      .filter((item) => item.incident);

    if (!payloadItems.length) return;

    try {
      await fetch("/.netlify/functions/purge-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payloadItems }),
      });
    } catch (error) {
      console.warn("Failed to purge alerts from cloud:", error);
    }
  }

  async function clearRecycleBin() {
    const current = Store.getState();
    const recycleItems = getRecycleBinItems(current);
    const nextAlerts = (current.alerts || []).filter((item) => !isRecycleStatus(item.status));
    const nextCorrective = Object.fromEntries(
      Object.entries(current.corrective || {}).map(([bucket, list]) => [bucket, (list || []).filter((item) => !isRecycleStatus(item.status))])
    );
    const nextCalendarEvents = (current.calendarEvents || []).filter((item) => !isRecycleStatus(item.status));

    LocalDB.saveState({ alerts: nextAlerts, corrective: nextCorrective, calendarEvents: nextCalendarEvents });
    Store.dispatch((state) => ({
      ...state,
      alerts: nextAlerts,
      corrective: nextCorrective,
      calendarEvents: nextCalendarEvents,
    }));
    await purgeAlertsFromCloud(recycleItems);
    await AlertService.loadFromLocal();
  }

  function renderRecycleView(state) {
    const recycleGrid = document.getElementById("recycle-grid");
    const clearButton = document.getElementById("btn-clear-recycle");
    if (!recycleGrid) return;

    const items = getRecycleBinItems(state);
    if (clearButton) {
      clearButton.disabled = items.length === 0;
      clearButton.classList.toggle("opacity-40", items.length === 0);
      clearButton.classList.toggle("cursor-not-allowed", items.length === 0);
    }

    recycleGrid.className = "grid grid-cols-1 gap-4";
    recycleGrid.innerHTML = items.length
      ? items
          .map(
            (item) => `
              <article class="glass-card recycle-card p-5 md:p-6">
                <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div class="min-w-0 space-y-2">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="recycle-badge">${item.typeLabel}</span>
                      <span class="recycle-status">${item.status}</span>
                    </div>
                    <h3 class="text-lg font-bold text-slate-800 break-all">${item.id}</h3>
                    <p class="text-sm text-slate-600">${item.title || "-"}</p>
                    <p class="text-xs text-slate-400">${item.meta || "-"}</p>
                    <p class="text-xs text-slate-400">วันที่: ${item.timestamp}</p>
                  </div>
                  <div class="flex items-center justify-end">
                    <button type="button" class="btn-restore-recycle inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100" data-recycle-restore="${item.recycleKey}">
                      <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
                      <span>กู้คืน</span>
                    </button>
                  </div>
                </div>
              </article>
            `
          )
          .join("")
      : `
        <div class="glass-card p-10 text-center text-slate-400">
          ยังไม่มีงานในถังขยะ
        </div>
      `;

    if (window.lucide?.createIcons) {
      window.lucide.createIcons();
    }
  }

  function inferZoneFromNode(node = "") {
    const base = String(node || "NO_NODE");
    const sum = [...base].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return `Zone ${((sum % 4) + 1)}`;
  }

  function toMttrHours(incident) {
    const down = incident.tickets?.[0]?.downTime || incident.createdAt;
    const up = incident.nsFinish?.times?.upTime || incident.completedAt;
    const d1 = new Date(down);
    const d2 = new Date(up);
    if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return null;
    return (d2 - d1) / 3600000;
  }

  function buildSummaryMonthlyRows(completed) {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const rows = monthNames.map((label, idx) => ({
      month: label,
      meet: 0,
      fail: 0,
      total: 0,
      mttr: "0.00%",
      uncontrolled: 0,
    }));

    completed.forEach((incident) => {
      const up = incident.nsFinish?.times?.upTime || incident.completedAt;
      const upDate = new Date(up);
      if (Number.isNaN(upDate.getTime())) return;
      const monthIndex = upDate.getMonth();
      const hrs = toMttrHours(incident);
      if (!Number.isFinite(hrs)) return;
      rows[monthIndex].total += 1;
      if (hrs <= 3) rows[monthIndex].meet += 1;
      else rows[monthIndex].fail += 1;

      const delay = incident.nsFinish?.details?.delayBy || "";
      const uncontrolledSet = ["Customer", "Building", "Natural disaster", "MEA/PEA"];
      if (uncontrolledSet.includes(delay)) rows[monthIndex].uncontrolled += 1;
    });

    rows.forEach((row) => {
      row.mttr = row.total ? `${((row.meet / row.total) * 100).toFixed(2)}%` : "0.00%";
    });

    return rows;
  }

  function buildCauseRows(completed) {
    const bucket = {};
    completed.forEach((incident) => {
      const cause = incident.nsFinish?.details?.cause || incident.updates?.[0]?.cause || incident.alarm || "Unknown";
      const hrs = toMttrHours(incident);
      if (!Number.isFinite(hrs)) return;
      if (!bucket[cause]) {
        bucket[cause] = { cause, meet: 0, fail: 0, total: 0, mttr: "0.00%" };
      }
      bucket[cause].total += 1;
      if (hrs <= 3) bucket[cause].meet += 1;
      else bucket[cause].fail += 1;
    });

    const rows = Object.values(bucket).sort((a, b) => b.total - a.total);
    rows.forEach((row) => {
      row.mttr = row.total ? `${((row.meet / row.total) * 100).toFixed(2)}%` : "0.00%";
    });
    return rows;
  }

  function buildRegionWeeklyRows(completed) {
    const zones = ["Zone 1", "Zone 2", "Zone 3", "Zone 4"];
    return zones.map((zone) => {
      const week = [0, 0, 0, 0, 0].map(() => ({ meet: 0, fail: 0, total: 0 }));
      completed.forEach((incident) => {
        if (inferZoneFromNode(incident.node) !== zone) return;
        const up = incident.nsFinish?.times?.upTime || incident.completedAt;
        const upDate = new Date(up);
        if (Number.isNaN(upDate.getTime())) return;
        const day = upDate.getDate();
        const weekIndex = Math.min(4, Math.floor((day - 1) / 7));
        const hrs = toMttrHours(incident);
        if (!Number.isFinite(hrs)) return;
        week[weekIndex].total += 1;
        if (hrs <= 3) week[weekIndex].meet += 1;
        else week[weekIndex].fail += 1;
      });

      const meet = week.reduce((acc, item) => acc + item.meet, 0);
      const fail = week.reduce((acc, item) => acc + item.fail, 0);
      const total = meet + fail;
      return {
        zone,
        week,
        meet,
        fail,
        total,
        mttr: total ? `${((meet / total) * 100).toFixed(2)}%` : "0.00%",
      };
    });
  }

  function computeDashboardData(state) {
    const alerts = state.alerts || [];
    const corrective = [
      ...(state.corrective.fiber || []),
      ...(state.corrective.equipment || []),
      ...(state.corrective.other || []),
    ];

    const stats = {
      newJob: alerts.filter((x) => x.status === "ACTIVE").length,
      inprocess: corrective.filter((x) => !["COMPLETE", "CANCELLED"].includes(x.status)).length,
      assign: corrective.filter((x) => Boolean(x.respondedAt)).length,
      finish: corrective.filter((x) => x.status === "COMPLETE").length,
      cancel: alerts.filter((x) => x.status === "CANCEL").length + corrective.filter((x) => x.status === "CANCELLED").length,
      mttr: 0,
      overMttr: 0,
    };

    const completed = corrective.filter((x) => x.status === "COMPLETE");
    completed.forEach((incident) => {
      const down = incident.tickets?.[0]?.downTime || incident.createdAt;
      const up = incident.nsFinish?.times?.upTime || incident.completedAt;
      const d1 = new Date(down);
      const d2 = new Date(up);
      if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return;
      const hrs = (d2 - d1) / 3600000;
      if (hrs <= 3) stats.mttr += 1;
      else stats.overMttr += 1;
    });

    const statusChart = {
      labels: ["New", "Process", "Assign", "Finish", "Cancel"],
      values: [stats.newJob, stats.inprocess, stats.assign, stats.finish, stats.cancel],
    };

    const typeCount = {
      Fiber: corrective.filter((x) => String(x.workType).toLowerCase() === "fiber").length,
      Equipment: corrective.filter((x) => String(x.workType).toLowerCase() === "equipment").length,
      Other: corrective.filter((x) => String(x.workType).toLowerCase() !== "fiber" && String(x.workType).toLowerCase() !== "equipment").length,
    };

    const zoneCount = { "Zone 1": 0, "Zone 2": 0, "Zone 3": 0, "Zone 4": 0 };
    corrective.forEach((item) => {
      const zone = inferZoneFromNode(item.node);
      zoneCount[zone] = (zoneCount[zone] || 0) + 1;
    });

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    const dayLabel = days.map((d) => d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit" }));
    const dayValue = days.map((d) => {
      const key = d.toISOString().slice(0, 10);
      let total = 0;
      let meet = 0;
      completed.forEach((incident) => {
        const up = incident.nsFinish?.times?.upTime || incident.completedAt;
        if (!up || !String(up).startsWith(key)) return;
        const down = incident.tickets?.[0]?.downTime || incident.createdAt;
        const d1 = new Date(down);
        const d2 = new Date(up);
        if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return;
        total += 1;
        if ((d2 - d1) / 3600000 <= 3) meet += 1;
      });
      return total ? Number(((meet / total) * 100).toFixed(1)) : 0;
    });

    return {
      stats,
      statusChart,
      typeCount,
      zoneCount,
      mttrTrend: { labels: dayLabel, values: dayValue },
      corrective,
      completed,
    };
  }

  function renderDashboardMain(container, data) {
    container.innerHTML = `
      <div class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          ${[
            ["New Job", data.stats.newJob, "งานเข้าใหม่", "tile-accent-blue"],
            ["Inprocess", data.stats.inprocess, "กำลังดำเนินการ", "tile-accent-orange"],
            ["Assign Job", data.stats.assign, "รอมอบหมาย", "tile-accent-purple"],
            ["Finish", data.stats.finish, "ปิดงานแล้ว", "tile-accent-green"],
            ["Job Cancel", data.stats.cancel, "งานถูกยกเลิก", "tile-accent-rose"],
            ["MTTR", data.stats.mttr, "งานที่ Finish ไม่เกิน 3 ชม.", "tile-accent-green"],
            ["Over MTTR", data.stats.overMttr, "งานที่ Finish เกิน 3 ชม.", "tile-accent-orange"],
          ].map(([title, value, sub, accent]) => `
            <div class="glass-card p-5 ${accent}">
              <div class="text-xs font-bold uppercase text-slate-500">${title}</div>
              <div class="text-4xl font-black text-slate-800 mt-1">${value}</div>
              <div class="text-xs text-slate-400">${sub}</div>
            </div>
          `).join("")}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="glass-card p-5 dashboard-chart-card"><h4 class="font-bold mb-3">ปริมาณงานแยกตามสถานะ</h4><div class="chart-shell chart-shell--donut"><canvas id="dash-chart-status"></canvas></div></div>
          <div class="glass-card p-5 dashboard-chart-card"><h4 class="font-bold mb-3">แนวโน้ม MTTR งานรายวัน</h4><div class="chart-shell chart-shell--wide"><canvas id="dash-chart-mttr"></canvas></div></div>
          <div class="glass-card p-5 dashboard-chart-card"><h4 class="font-bold mb-3">ประเภทงาน (Fiber / Equipment / Other)</h4><div class="chart-shell chart-shell--compact"><canvas id="dash-chart-type"></canvas></div></div>
          <div class="glass-card p-5 dashboard-chart-card"><h4 class="font-bold mb-3">Cess Zone (Zone 1-4)</h4><div class="chart-shell chart-shell--compact"><canvas id="dash-chart-zone"></canvas></div></div>
        </div>
      </div>
    `;

    if (!window.Chart) return;

    destroyDashboardChart("status");
    destroyDashboardChart("mttrTrend");
    destroyDashboardChart("workType");
    destroyDashboardChart("zone");

    dashboardCharts.status = createChartInstance("dash-chart-status", {
      type: "doughnut",
      data: { labels: data.statusChart.labels, datasets: [{ data: data.statusChart.values, backgroundColor: ["#3b82f6", "#f59e0b", "#8b5cf6", "#22c55e", "#ef4444"], borderWidth: 3, borderColor: "#ffffff", hoverOffset: 8, spacing: 2 }] },
      options: buildBaseChartOptions({
        cutout: "58%",
        plugins: { legend: createLegend("bottom"), doughnutValuePlugin: { enabled: true } },
      }),
    });

    dashboardCharts.mttrTrend = createChartInstance("dash-chart-mttr", {
      type: "line",
      data: { labels: data.mttrTrend.labels, datasets: [{ label: "MTTR <= 3hrs (%)", data: data.mttrTrend.values, borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,.2)", fill: true, tension: 0.3, pointRadius: 3, pointHoverRadius: 4 }] },
      options: buildCartesianOptions({ scales: { y: { min: 0, max: 100, ticks: { callback: (value) => `${value}%`, font: { size: getChartFontSize() } } } } }),
    });

    dashboardCharts.workType = createChartInstance("dash-chart-type", {
      type: "bar",
      data: { labels: Object.keys(data.typeCount), datasets: [{ label: "Count", data: Object.values(data.typeCount), backgroundColor: "#8b5cf6", borderRadius: 8, maxBarThickness: 48 }] },
      options: buildCartesianOptions(),
    });

    dashboardCharts.zone = createChartInstance("dash-chart-zone", {
      type: "bar",
      data: { labels: Object.keys(data.zoneCount), datasets: [{ label: "Count", data: Object.values(data.zoneCount), backgroundColor: "#ec4899", borderRadius: 8, maxBarThickness: 48 }] },
      options: buildCartesianOptions(),
    });
  }

  function renderDashboardSummary(container, data) {
    const monthlyRows = buildSummaryMonthlyRows(data.completed);
    const causeRows = buildCauseRows(data.completed);

    const summaryBody = monthlyRows.map((row) => `
      <tr>
        <td class="px-3 py-2 font-medium">${row.month}</td>
        <td class="px-3 py-2 text-center text-green-700">${row.meet}</td>
        <td class="px-3 py-2 text-center text-amber-700">${row.fail}</td>
        <td class="px-3 py-2 text-center">${row.total}</td>
        <td class="px-3 py-2 text-center font-semibold">${row.mttr}</td>
        <td class="px-3 py-2 text-center">${row.uncontrolled}</td>
      </tr>
    `).join("");

    const causeBody = causeRows.map((row) => `
      <tr>
        <td class="px-3 py-2">${row.cause}</td>
        <td class="px-3 py-2 text-center text-green-700">${row.meet}</td>
        <td class="px-3 py-2 text-center text-amber-700">${row.fail}</td>
        <td class="px-3 py-2 text-center">${row.total}</td>
        <td class="px-3 py-2 text-center font-semibold">${row.mttr}</td>
      </tr>
    `).join("");

    container.innerHTML = `
      <div class="space-y-6">
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div class="glass-card p-5 overflow-auto">
            <h3 class="font-bold mb-3">Summary MTTR 3 Hrs. (Monthly)</h3>
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-slate-50">
                  <th class="px-3 py-2 text-left">Month</th>
                  <th class="px-3 py-2 text-center">Meet</th>
                  <th class="px-3 py-2 text-center">Fail</th>
                  <th class="px-3 py-2 text-center">Total</th>
                  <th class="px-3 py-2 text-center">MTTR</th>
                  <th class="px-3 py-2 text-center">Without Uncontrol</th>
                </tr>
              </thead>
              <tbody>${summaryBody}</tbody>
            </table>
          </div>
          <div class="glass-card p-5 overflow-auto">
            <h3 class="font-bold mb-3">Cause of incident</h3>
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-slate-50">
                  <th class="px-3 py-2 text-left">Cause</th>
                  <th class="px-3 py-2 text-center">Meet</th>
                  <th class="px-3 py-2 text-center">Fail</th>
                  <th class="px-3 py-2 text-center">Total</th>
                  <th class="px-3 py-2 text-center">MTTR</th>
                </tr>
              </thead>
              <tbody>${causeBody || '<tr><td colspan="5" class="px-3 py-6 text-center text-slate-400">ยังไม่มีข้อมูล</td></tr>'}</tbody>
            </table>
          </div>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div class="glass-card p-5 dashboard-chart-card"><h4 class="font-bold mb-3">MTTR 3 Hrs. (Monthly Trend)</h4><div class="chart-shell chart-shell--wide"><canvas id="dash-summary-mttr"></canvas></div></div>
          <div class="glass-card p-5 dashboard-chart-card"><h4 class="font-bold mb-3">Cause Distribution</h4><div class="chart-shell chart-shell--wide"><canvas id="dash-summary-cause"></canvas></div></div>
        </div>
      </div>
    `;

    if (!window.Chart) return;
    destroyDashboardChart("summaryMttr");
    destroyDashboardChart("summaryCause");

    dashboardCharts.summaryMttr = createChartInstance("dash-summary-mttr", {
      type: "line",
      data: {
        labels: monthlyRows.map((row) => row.month),
        datasets: [
          { label: "Meet", data: monthlyRows.map((row) => row.meet), borderColor: "#16a34a", tension: 0.25 },
          { label: "Fail", data: monthlyRows.map((row) => row.fail), borderColor: "#f59e0b", tension: 0.25 },
          { label: "MTTR %", data: monthlyRows.map((row) => Number(row.mttr.replace("%", ""))), borderColor: "#2563eb", yAxisID: "y1", tension: 0.25 },
        ],
      },
      options: buildCartesianOptions({
        scales: {
          y: { beginAtZero: true },
          y1: { beginAtZero: true, max: 100, position: "right", grid: { drawOnChartArea: false }, ticks: { callback: (value) => `${value}%`, font: { size: getChartFontSize() } } },
        },
      }),
    });

    const topCauses = causeRows.slice(0, 8);
    dashboardCharts.summaryCause = createChartInstance("dash-summary-cause", {
      type: "bar",
      data: {
        labels: topCauses.map((row) => row.cause),
        datasets: [
          { label: "Meet", data: topCauses.map((row) => row.meet), backgroundColor: "#16a34a" },
          { label: "Fail", data: topCauses.map((row) => row.fail), backgroundColor: "#f97316" },
        ],
      },
      options: buildCartesianOptions({
        indexAxis: "y",
        scales: {
          x: { beginAtZero: true, grace: "10%", ticks: { precision: 0, font: { size: getChartFontSize() } } },
          y: { ticks: { font: { size: getChartFontSize() } }, grid: { display: false } },
        },
      }),
    });
  }

  function renderDashboardRegion(container, data) {
    const zoneRows = buildRegionWeeklyRows(data.completed);

    const tableBody = zoneRows.map((row) => `
      <tr>
        <td class="px-3 py-2 font-medium">${row.zone}</td>
        ${row.week.map((w) => `<td class="px-3 py-2 text-center">${w.meet}/${w.fail}</td>`).join("")}
        <td class="px-3 py-2 text-center text-green-700">${row.meet}</td>
        <td class="px-3 py-2 text-center text-amber-700">${row.fail}</td>
        <td class="px-3 py-2 text-center">${row.total}</td>
        <td class="px-3 py-2 text-center font-semibold">${row.mttr}</td>
      </tr>
    `).join("");

    container.innerHTML = `
      <div class="space-y-6">
        <div class="glass-card p-5 overflow-auto">
          <h3 class="font-bold mb-3">Region MTTR performance 3 Hrs. (Weekly by Zone)</h3>
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-slate-50">
                <th class="px-3 py-2 text-left">Zone</th>
                <th class="px-3 py-2 text-center">W1 (Meet/Fail)</th>
                <th class="px-3 py-2 text-center">W2</th>
                <th class="px-3 py-2 text-center">W3</th>
                <th class="px-3 py-2 text-center">W4</th>
                <th class="px-3 py-2 text-center">W5</th>
                <th class="px-3 py-2 text-center">Meet</th>
                <th class="px-3 py-2 text-center">Fail</th>
                <th class="px-3 py-2 text-center">Total</th>
                <th class="px-3 py-2 text-center">MTTR</th>
              </tr>
            </thead>
            <tbody>${tableBody}</tbody>
          </table>
        </div>
        <div class="glass-card p-5 dashboard-chart-card">
          <h4 class="font-bold mb-3">Performance by Zone</h4>
          <div class="chart-shell chart-shell--wide"><canvas id="dash-region-weekly"></canvas></div>
        </div>
      </div>
    `;

    if (!window.Chart) return;
    destroyDashboardChart("regionWeekly");

    dashboardCharts.regionWeekly = createChartInstance("dash-region-weekly", {
      type: "bar",
      data: {
        labels: zoneRows.map((row) => row.zone),
        datasets: [
          { label: "Meet", data: zoneRows.map((row) => row.meet), backgroundColor: "#16a34a" },
          { label: "Fail", data: zoneRows.map((row) => row.fail), backgroundColor: "#f97316" },
          { label: "MTTR %", data: zoneRows.map((row) => Number(row.mttr.replace("%", ""))), type: "line", borderColor: "#1d4ed8", yAxisID: "y1" },
        ],
      },
      options: buildCartesianOptions({
        scales: {
          y: { beginAtZero: true },
          y1: { beginAtZero: true, max: 100, position: "right", grid: { drawOnChartArea: false }, ticks: { callback: (value) => `${value}%`, font: { size: getChartFontSize() } } },
        },
      }),
    });
  }

  function renderDashboardReport(container, data) {
    container.innerHTML = `
      <div class="space-y-6">
        <div class="bg-red-700 text-white rounded-xl p-4 grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
          <div><div class="text-xs">All Case</div><div class="text-3xl font-bold">${data.completed.length}</div></div>
          <div><div class="text-xs">Meet</div><div class="text-3xl font-bold">${data.stats.mttr}</div></div>
          <div><div class="text-xs">Fail</div><div class="text-3xl font-bold">${data.stats.overMttr}</div></div>
          <div><div class="text-xs">Total</div><div class="text-3xl font-bold">${data.stats.mttr + data.stats.overMttr}</div></div>
          <div><div class="text-xs">MTTR</div><div class="text-3xl font-bold">${(data.stats.mttr + data.stats.overMttr) ? ((data.stats.mttr/(data.stats.mttr+data.stats.overMttr))*100).toFixed(2) : 0}%</div></div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="glass-card p-5 dashboard-chart-card"><h4 class="font-bold mb-3">MTTR 3 Hrs. 2026</h4><div class="chart-shell chart-shell--wide"><canvas id="dash-report-main"></canvas></div></div>
          <div class="glass-card p-5 dashboard-chart-card"><h4 class="font-bold mb-3">MTTR 3 Hrs.</h4><div class="chart-shell chart-shell--donut"><canvas id="dash-report-incident"></canvas></div></div>
          <div class="glass-card p-5 dashboard-chart-card"><h4 class="font-bold mb-3">Cause of Incident</h4><div class="chart-shell chart-shell--wide"><canvas id="dash-report-cause"></canvas></div></div>
          <div class="glass-card p-5 dashboard-chart-card"><h4 class="font-bold mb-3">Delayed by</h4><div class="chart-shell chart-shell--donut"><canvas id="dash-report-delay"></canvas></div></div>
        </div>
      </div>
    `;

    if (!window.Chart) return;
    destroyDashboardChart("reportMain");
    destroyDashboardChart("reportIncident");
    destroyDashboardChart("reportCause");
    destroyDashboardChart("reportDelayed");

    dashboardCharts.reportMain = createChartInstance("dash-report-main", {
      type: "line",
      data: {
        labels: data.mttrTrend.labels,
        datasets: [
          { label: "Meet", data: data.mttrTrend.values, borderColor: "#2563eb", tension: .3 },
          { label: "Target", data: data.mttrTrend.labels.map(() => 85), borderColor: "#f59e0b", borderDash: [6, 4], tension: 0 },
        ],
      },
      options: buildCartesianOptions({ scales: { y: { min: 0, max: 100, ticks: { callback: (value) => `${value}%`, font: { size: getChartFontSize() } } } } }),
    });

    dashboardCharts.reportIncident = createChartInstance("dash-report-incident", {
      type: "doughnut",
      data: { labels: ["Meet", "Fail"], datasets: [{ data: [data.stats.mttr, data.stats.overMttr], backgroundColor: ["#65a30d", "#f59e0b"], borderWidth: 2, borderColor: "#ffffff", hoverOffset: 8 }] },
      options: buildBaseChartOptions({ cutout: "62%", plugins: { legend: createLegend("top"), doughnutValuePlugin: { enabled: true } } }),
    });

    const causes = {};
    data.completed.forEach((item) => {
      const cause = item.nsFinish?.details?.cause || item.updates?.[0]?.cause || item.alarm || "Unknown";
      causes[cause] = (causes[cause] || 0) + 1;
    });
    destroyDashboardChart("reportCause");
    dashboardCharts.reportCause = createChartInstance("dash-report-cause", {
      type: "bar",
      data: { labels: Object.keys(causes), datasets: [{ label: "Count", data: Object.values(causes), backgroundColor: "#3b82f6", borderRadius: 8, maxBarThickness: 28 }] },
      options: buildCartesianOptions({
        indexAxis: "y",
        scales: {
          x: { beginAtZero: true, grace: "10%", ticks: { precision: 0, font: { size: getChartFontSize() } } },
          y: { ticks: { font: { size: getChartFontSize() } }, grid: { display: false } },
        },
      }),
    });

    const delay = { "SYMC-NOC": 0, "SYMC-Region": 0, "Sub-Contractor": 0, Customer: 0, Building: 0, "Natural disaster": 0 };
    data.completed.forEach((item) => {
      const d = item.nsFinish?.details?.delayBy || "Sub-Contractor";
      if (delay[d] === undefined) delay[d] = 0;
      delay[d] += 1;
    });
    dashboardCharts.reportDelayed = createChartInstance("dash-report-delay", {
      type: "doughnut",
      data: { labels: Object.keys(delay), datasets: [{ data: Object.values(delay), backgroundColor: ["#3b82f6", "#f97316", "#a3a3a3", "#16a34a", "#facc15", "#06b6d4"], borderWidth: 2, borderColor: "#ffffff", hoverOffset: 8 }] },
      options: buildBaseChartOptions({ cutout: "60%", plugins: { legend: createLegend("top"), doughnutValuePlugin: { enabled: true } } }),
    });
  }

  function renderDashboardView(state) {
    const container = document.getElementById("view-dashboard");
    if (!container) return;

    const data = computeDashboardData(state);
    const subView = state.ui.dashboardSubView || "main";

    if (subView === "summary") {
      renderDashboardSummary(container, data);
      return;
    }

    if (subView === "region") {
      renderDashboardRegion(container, data);
      return;
    }

    if (subView === "report") {
      renderDashboardReport(container, data);
      return;
    }

    renderDashboardMain(container, data);
  }

  function getAllCorrectiveIncidents(state) {
    return [
      ...(state.corrective.fiber || []),
      ...(state.corrective.equipment || []),
      ...(state.corrective.other || []),
    ];
  }

  function getZoneByTeam(team) {
    const zoneMap = {
      TAS: "Zone 1, Zone 2",
      BAN: "Zone 1",
      JL: "Zone 2",
      ATG: "Zone 3",
      TP: "Zone 3",
      NPY: "Zone 4",
      "JJ&A": "Zone 4",
    };

    return zoneMap[team] || "-";
  }

  function computeSubcontractorStats(state) {
    const allCorrective = getAllCorrectiveIncidents(state);
    const allAlerts = state.alerts || [];

    const newJob = allAlerts.filter((item) => item.status === "ACTIVE").length;
    const inProcess = allCorrective.filter((item) => item.status === "PROCESS").length;
    const assignJob = allCorrective.filter((item) => item.status === "ASSIGN").length;
    const finish = allCorrective.filter((item) => item.status === "COMPLETE").length;
    const jobCancel = allAlerts.filter((item) => item.status === "CANCEL").length + allCorrective.filter((item) => item.status === "CANCELLED").length;

    const completed = allCorrective.filter((item) => item.status === "COMPLETE");

    let mttr = 0;
    let overMttr = 0;

    completed.forEach((incident) => {
      const down = incident.tickets?.[0]?.downTime || incident.createdAt;
      const up = incident.nsFinish?.times?.upTime || incident.completedAt;
      const downDate = new Date(down);
      const upDate = new Date(up);
      if (Number.isNaN(downDate.getTime()) || Number.isNaN(upDate.getTime())) return;

      const hours = (upDate - downDate) / (1000 * 60 * 60);
      if (hours <= 3) mttr += 1;
      else overMttr += 1;
    });

    return { newJob, inProcess, assignJob, finish, jobCancel, mttr, overMttr };
  }

  function buildSubcontractorSummary(state) {
    const allCorrective = getAllCorrectiveIncidents(state);
    const bucket = {};

    allCorrective.forEach((incident) => {
      const finishSubs = incident.nsFinish?.subcontractors || [];
      const updateSubs = (incident.updates || []).flatMap((item) => item.subcontractors || []);
      const teams = [...new Set([...finishSubs, ...updateSubs].filter(Boolean))];

      teams.forEach((team) => {
        if (!bucket[team]) {
          bucket[team] = { name: team, totalJobs: 0, finish: 0, zone: getZoneByTeam(team) };
        }
        bucket[team].totalJobs += 1;
        if (incident.status === "COMPLETE") bucket[team].finish += 1;
      });
    });

    return Object.values(bucket).sort((a, b) => b.totalJobs - a.totalJobs);
  }

  function renderSubcontractorView(state) {
    const stats = computeSubcontractorStats(state);
    const summary = buildSubcontractorSummary(state);

    const statsGrid = document.getElementById("sub-stats-grid");
    if (statsGrid) {
      const cards = [
        { label: "New Job", value: stats.newJob, sub: "งานเข้าใหม่", accent: "tile-accent-blue" },
        { label: "Inprocess", value: stats.inProcess, sub: "กำลังดำเนินการ", accent: "tile-accent-orange" },
        { label: "Assign Job", value: stats.assignJob, sub: "รอมอบหมาย", accent: "tile-accent-purple" },
        { label: "Finish", value: stats.finish, sub: "ปิดงานแล้ว", accent: "tile-accent-green" },
        { label: "Job Cancel", value: stats.jobCancel, sub: "งานถูกยกเลิก", accent: "tile-accent-purple" },
        { label: "MTTR", value: stats.mttr, sub: "งานที่ Finish ไม่เกิน 3 ชม.", accent: "tile-accent-green" },
        { label: "Over MTTR", value: stats.overMttr, sub: "งานที่ Finish เกิน 3 ชม.", accent: "tile-accent-orange" },
      ];

      statsGrid.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6";
      statsGrid.innerHTML = cards
        .map(
          (card) => `
            <div class="glass-card p-6 ${card.accent}">
              <div class="text-xs font-bold uppercase text-slate-500">${card.label}</div>
              <div class="text-4xl font-black text-slate-800 mt-2">${card.value}</div>
              <div class="text-xs text-slate-400 mt-1">${card.sub}</div>
            </div>
          `
        )
        .join("");
    }

    const chartStatusWrap = document.getElementById("chartStatusSub")?.closest(".glass-card");
    const chartWorkloadWrap = document.getElementById("chartWorkload")?.closest(".glass-card");
    if (chartStatusWrap) {
      chartStatusWrap.innerHTML = `<div class="p-8 text-center text-slate-400">Summary view is focused on KPI + Performance Table.</div>`;
    }
    if (chartWorkloadWrap) {
      chartWorkloadWrap.innerHTML = `<div class="p-8 text-center text-slate-400">Zone / Team information is shown in the table below.</div>`;
    }

    const tableBody = document.getElementById("sub-table-body");
    if (tableBody) {
      tableBody.innerHTML = summary.length
        ? summary
            .map(
              (item) => `
                <tr>
                  <td class="px-6 py-4 font-semibold text-slate-800">${item.name}</td>
                  <td class="px-6 py-4 text-center">${item.totalJobs}</td>
                  <td class="px-6 py-4 text-center text-green-600 font-bold">${item.finish}</td>
                  <td class="px-6 py-4 text-center">${item.zone}</td>
                </tr>
              `
            )
            .join("")
        : `<tr><td colspan="4" class="px-6 py-6 text-center text-slate-400">ยังไม่มีข้อมูลผู้รับเหมา</td></tr>`;
    }
  }

  function getSampleIncidentData() {
    return {
      id: "I2602-000891",
      node: "Phahol9_02_M8",
      alarm: "Interface Down (at distributed switch)",
      detail:
        "We are observing alarm interface last mile down, require NS for investigating the cable.",
      downTime: "2026-02-08T23:52:00",
      nocBy: "Administrator",
      severity: "Critical",
      type: "Network",
      status: "active",
      createdAt: "2026-02-08T23:52:00",
      tickets: [
        {
          ticket: "T2602-001544",
          cid: "DI41155",
          port: "GigabitEthernet0/5/3",
          downTime: "2026-02-08T23:52:00",
          clearTime: "2026-02-09T00:16:00",
          total: "24 นาที",
          pending: null,
          actualDowntime: "24 นาที",
          originate: "Symphony Communication Public Company Limited",
          terminate: "Pruksa Real Estate Public Company Limited",
        },
        {
          ticket: "T2602-001545",
          cid: "DI41156",
          port: "GigabitEthernet0/5/4",
          downTime: "2026-02-08T23:55:00",
          clearTime: null,
          total: null,
          pending: "Waiting for ISP",
          actualDowntime: "รอดำเนินการ",
          originate: "Symphony Communication Public Company Limited",
          terminate: "Another Customer Co., Ltd.",
        },
        {
          ticket: "T2602-001546",
          cid: "DI41157",
          port: "GigabitEthernet0/5/5",
          downTime: "2026-02-09T01:00:00",
          clearTime: "2026-02-09T01:45:00",
          total: "45 นาที",
          pending: null,
          actualDowntime: "45 นาที",
          originate: "Symphony Communication Public Company Limited",
          terminate: "ABC Corporation",
        },
      ],
    };
  }

  Store.subscribe(render);
  render(Store.getState());

  // ===== ADD TICKET BUTTON =====
  const ticketContainer = document.getElementById("ticket-container");
  const addTicketBtn = document.getElementById("btn-add-ticket");
  const defaultTicketFieldsMarkup = ticketContainer ? ticketContainer.innerHTML : "";

  function resetCreateTicketForm() {
    incidentForm?.reset();
    if (ticketContainer) {
      ticketContainer.innerHTML = defaultTicketFieldsMarkup;
    }
  }

    if (addTicketBtn && ticketContainer) {
    addTicketBtn.addEventListener("click", () => {
      const ticketHTML = `␊
        <div class="ticket-item grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 p-3 rounded-xl border border-slate-200 bg-slate-50/60">
          <input placeholder="Symphony Ticket" class="ticket-field w-full bg-white rounded-lg px-3 py-2 border border-slate-200">
          <input placeholder="Symphony CID" class="ticket-field w-full bg-white rounded-lg px-3 py-2 border border-slate-200">
          <input placeholder="Port" class="ticket-field w-full bg-white rounded-lg px-3 py-2 border border-slate-200">
          <input type="datetime-local" class="ticket-field w-full bg-white rounded-lg px-3 py-2 border border-slate-200">
          <input type="datetime-local" class="ticket-field w-full bg-white rounded-lg px-3 py-2 border border-slate-200">
          <input placeholder="Pending" class="ticket-field w-full bg-white rounded-lg px-3 py-2 border border-slate-200">
          <input placeholder="Originate" class="ticket-field w-full bg-white rounded-lg px-3 py-2 border border-slate-200">
          <input placeholder="Terminate" class="ticket-field w-full bg-white rounded-lg px-3 py-2 border border-slate-200">
        </div>
      `;


      ticketContainer.insertAdjacentHTML("beforeend", ticketHTML);
    });
  }

  // ===== RESPONSE MODAL =====␊
  const responseModal = document.getElementById("modal-response");
  const cancelResponse = document.getElementById("btn-cancel-response");
  const saveResponse = document.getElementById("btn-save-response");
  const responseWorkType = document.getElementById("response-work-type");
  let responseIncidentId = null;

  document.addEventListener("click", (event) => {
    if (!event.target.classList.contains("btn-response")) {
      return;
    }

    responseIncidentId = event.target.dataset.id || null;
    if (responseWorkType) {
      const alert = Store.getState().alerts.find((item) => getIncidentKey(item) === responseIncidentId);
      responseWorkType.value = alert?.workType || "";
    }
    document.querySelectorAll('input[name="eta"]').forEach((el) => { el.checked = false; });
    openModal(responseModal);
  });

  if (cancelResponse) {
    cancelResponse.addEventListener("click", () => closeModal(responseModal));
  }

  if (saveResponse) {
    saveResponse.addEventListener("click", () => {
      const eta = document.querySelector('input[name="eta"]:checked');
      if (!eta) {
        alert("กรุณาเลือก ETA");
        return;
      }
      if (!responseWorkType?.value) {
        alert("กรุณาเลือก Work Type");
        return;
      }

      if (!responseIncidentId) {
        alert("ไม่พบ Incident ที่ต้องการตอบรับ");
        return;
      }

      AlertService.responseAlert(responseIncidentId, eta.value, responseWorkType.value);
      closeModal(responseModal);
    });
  }

  // ===== CORRECTIVE MENU =====␊
  document.querySelectorAll("#corrective-submenu div").forEach((menu) => {
    menu.onclick = () => {
      const type = menu.innerText.toLowerCase();

      Store.dispatch((state) => ({
        ...state,
        ui: {
          ...state.ui,
          currentView: "corrective",
          activeCorrectiveTab: type,
        },
      }));
    };
  });

  document.addEventListener("click", (event) => {
    const tabButton = event.target.closest("[data-history-tab]");
    if (tabButton) {
      Store.dispatch((state) => ({
        ...state,
        ui: {
          ...state.ui,
          activeHistoryTab: tabButton.dataset.historyTab,
          historyPage: 1,
        },
      }));
      return;
    }

    const pageButton = event.target.closest("[data-history-page]");
    if (!pageButton) return;

    const direction = pageButton.dataset.historyPage;
    Store.dispatch((state) => {
      const currentPage = Number(state.ui.historyPage || 1);
      const nextPage = direction === "prev" ? currentPage - 1 : currentPage + 1;

      return {
        ...state,
        ui: {
          ...state.ui,
          historyPage: Math.max(1, nextPage),
        },
      };
    });
  });

  function ensureCalendarCreateModal() {
    if (document.getElementById("modal-calendar-create")) return;

    document.body.insertAdjacentHTML("beforeend", `
      <div id="modal-calendar-create" class="modal-backdrop hidden">
        <div class="bg-white rounded-2xl w-full max-w-2xl p-6 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold text-slate-800">Create Calendar Job</h3>
            <button id="btn-close-calendar-create" class="px-3 py-1 bg-slate-100 rounded-lg">ปิด</button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="text-sm text-slate-600">Incident Number</label>
              <select id="calendar-incident-select" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2"></select>
            </div>
            <div>
              <label class="text-sm text-slate-600">Title</label>
              <input id="calendar-title" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2" placeholder="เช่น ตรวจสอบหน้างาน">
            </div>
            <div>
              <label class="text-sm text-slate-600">Start time</label>
              <input id="calendar-start" type="datetime-local" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2">
            </div>
            <div>
              <label class="text-sm text-slate-600">End time</label>
              <input id="calendar-end" type="datetime-local" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2">
            </div>
            <div>
              <label class="text-sm text-slate-600">👤 เจ้าหน้าที่ On site</label>
              <input id="calendar-onsite" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2" placeholder="เช่น Somchai, Nattapon">
            </div>
            <div>
              <label class="text-sm text-slate-600">👤 เจ้าหน้าที่รับเรื่อง</label>
              <input id="calendar-receiver" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2" placeholder="เช่น NOC Level 2">
            </div>
            <div class="md:col-span-2">
              <label class="text-sm text-slate-600">☎️ Contact</label>
              <input id="calendar-contact" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2" placeholder="เช่น 08x-xxx-xxxx">
            </div>
          </div>

          <div class="flex justify-end gap-2">
            <button id="btn-cancel-calendar-create" class="px-4 py-2 bg-slate-100 rounded-lg">Cancel</button>
            <button id="btn-save-calendar-create" class="px-4 py-2 bg-indigo-600 text-white rounded-lg">Save</button>
          </div>
        </div>
      </div>
    `);

    document.getElementById("btn-close-calendar-create").onclick = () => closeModal(document.getElementById("modal-calendar-create"));
    document.getElementById("btn-cancel-calendar-create").onclick = () => closeModal(document.getElementById("modal-calendar-create"));
  }

  function ensureCalendarEventDetailModal() {
    if (document.getElementById("modal-calendar-detail")) return;

    document.body.insertAdjacentHTML("beforeend", `
      <div id="modal-calendar-detail" class="modal-backdrop hidden">
        <div class="bg-white rounded-2xl w-full max-w-2xl p-6 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold text-slate-800">Interruption Plan Detail</h3>
            <button id="btn-close-calendar-detail" class="px-3 py-1 bg-slate-100 rounded-lg">ปิด</button>
          </div>
          <div id="calendar-detail-body" class="space-y-2 text-slate-700"></div>
          <div class="pt-3 border-t">
            <div class="text-sm font-semibold text-slate-700 mb-2">จัดการงาน (Actions)</div>
            <div class="flex gap-2 flex-wrap">
              <button id="btn-calendar-action-open" class="px-3 py-2 rounded-lg bg-indigo-600 text-white">Actions</button>
              <button id="btn-calendar-action-cancel" class="px-3 py-2 rounded-lg bg-rose-500 text-white">Cancel Job</button>
              <button id="btn-calendar-action-edit" class="px-3 py-2 rounded-lg bg-slate-700 text-white">Edit</button>
            </div>
          </div>
        </div>
      </div>
    `);

    document.getElementById("btn-close-calendar-detail").onclick = () => closeModal(document.getElementById("modal-calendar-detail"));
  }

  function ensureCalendarCancelModal() {
    if (document.getElementById("modal-calendar-cancel")) return;

    document.body.insertAdjacentHTML("beforeend", `
      <div id="modal-calendar-cancel" class="modal-backdrop hidden">
        <div class="bg-white rounded-2xl w-full max-w-lg p-6 space-y-4">
          <h3 class="text-lg font-bold text-slate-800">ยกเลิกงาน Calendar</h3>
          <div>
            <label class="text-sm text-slate-600">ผู้แจ้งยกเลิก</label>
            <select id="calendar-cancel-reporter" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2">
              <option value="NOC">NOC</option>
              <option value="On Site">On Site</option>
              <option value="Customer">Customer</option>
            </select>
          </div>
          <div>
            <label class="text-sm text-slate-600">สาเหตุการยกเลิก</label>
            <textarea id="calendar-cancel-reason" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2" rows="3" placeholder="ระบุสาเหตุ..."></textarea>
          </div>
          <div class="flex justify-end gap-2">
            <button id="btn-calendar-cancel-close" class="px-4 py-2 bg-slate-100 rounded-lg">Cancel</button>
            <button id="btn-calendar-cancel-ok" class="px-4 py-2 bg-rose-600 text-white rounded-lg">OK</button>
          </div>
        </div>
      </div>
    `);

    document.getElementById("btn-calendar-cancel-close").onclick = () => closeModal(document.getElementById("modal-calendar-cancel"));
  }


  function getOnProcessIncidents() {
    const state = Store.getState();
    return [
      ...(state.corrective.fiber || []),
      ...(state.corrective.equipment || []),
      ...(state.corrective.other || []),
    ].filter((item) => item.status === "PROCESS");
  }

  function toLocalInputValue(date) {
    if (!date) return "";
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function saveCalendarEvents(calendarEvents) {
    LocalDB.saveState({ calendarEvents });
    Store.dispatch((state) => ({ ...state, calendarEvents }));
  }

  function openCalendarCreateModal(eventToEdit = null) {
    ensureCalendarCreateModal();

    const modal = document.getElementById("modal-calendar-create");
    const select = document.getElementById("calendar-incident-select");
    const incidents = getOnProcessIncidents();

    select.innerHTML = incidents.length
      ? incidents.map((item) => { const incidentKey = getIncidentKey(item); return `<option value="${incidentKey}">${incidentKey} - ${item.node || "-"}</option>`; }).join("")
      : '<option value="">ไม่มีงาน PROCESS</option>';

    const now = new Date();
    const after1h = new Date(now.getTime() + 60 * 60000);
    document.getElementById("calendar-start").value = toLocalInputValue(eventToEdit?.startAt || now);
    document.getElementById("calendar-end").value = toLocalInputValue(eventToEdit?.endAt || after1h);
    document.getElementById("calendar-title").value = eventToEdit?.title || "";
    document.getElementById("calendar-onsite").value = eventToEdit?.onSiteStaff || "";
    document.getElementById("calendar-receiver").value = eventToEdit?.receiverStaff || "";
    document.getElementById("calendar-contact").value = eventToEdit?.contact || "";
    if (eventToEdit?.incidentId) {
      select.value = eventToEdit.incidentId;
    }

    document.getElementById("btn-save-calendar-create").onclick = () => {
      const incidentId = select.value;
      if (!incidentId) {
        alert("ยังไม่มี Incident ที่เป็น PROCESS");
        return;
      }

      const startAt = document.getElementById("calendar-start").value;
      const endAt = document.getElementById("calendar-end").value;
      if (!startAt || !endAt) {
        alert("กรุณาเลือกวันเวลา Start/End");
        return;
      }

      if (new Date(endAt) <= new Date(startAt)) {
        alert("End time ต้องมากกว่า Start time");
        return;
      }

      const source = incidents.find((item) => getIncidentKey(item) === incidentId);
      const title = document.getElementById("calendar-title").value.trim() || source?.alarm || "Scheduled corrective";
      const nextEvent = {
        id: eventToEdit?.id || `cal-${Date.now()}`,
        incidentId,
        title,
        startAt,
        endAt,
        node: source?.node || eventToEdit?.node || "-",
        workType: String(source?.workType || eventToEdit?.workType || "other").toLowerCase(),
        status: eventToEdit?.status || source?.status || "PROCESS",
        onSiteStaff: document.getElementById("calendar-onsite").value.trim(),
        receiverStaff: document.getElementById("calendar-receiver").value.trim(),
        contact: document.getElementById("calendar-contact").value.trim(),
      };
      const current = Store.getState();
      const calendarEvents = eventToEdit
        ? (current.calendarEvents || []).map((item) => (item.id === eventToEdit.id ? nextEvent : item))
        : [...(current.calendarEvents || []), nextEvent];

      saveCalendarEvents(calendarEvents);
      closeModal(modal);
      alert(eventToEdit ? "แก้ไขตารางงานเรียบร้อย" : "บันทึกตารางงานเรียบร้อย");
    };

    openModal(modal);
  }
    let activeCalendarEventId = null;

  function openCalendarEventCard(eventId) {
    ensureCalendarEventDetailModal();
    const current = Store.getState();
    const eventData = (current.calendarEvents || []).find((item) => item.id === eventId);
    if (!eventData) return;

    activeCalendarEventId = eventId;

    const body = document.getElementById("calendar-detail-body");
    body.innerHTML = `
      <div><b>Incident Number :</b> ${eventData.incidentId || "-"}</div>
      <div><b>📝 Description :</b> ${eventData.title || "-"}</div>
      <div><b>📅 Action Date :</b> ${CalendarUI.formatDate(eventData.startAt)}</div>
      <div><b>⏰ Time :</b> ${CalendarUI.formatTime(eventData.startAt)} - ${CalendarUI.formatTime(eventData.endAt)}</div>
      <div><b>👤 เจ้าหน้าที่ On site :</b> ${eventData.onSiteStaff || "-"}</div>
      <div><b>👤 เจ้าหน้าที่รับเรื่อง :</b> ${eventData.receiverStaff || "-"}</div>
      <div><b>☎️ Contact :</b> ${eventData.contact || "-"}</div>
    `;

    document.getElementById("btn-calendar-action-open").onclick = () => {
      const found = getCorrectiveIncidentById(eventData.incidentId);
      closeModal(document.getElementById("modal-calendar-detail"));
      if (!found) {
        alert("ไม่พบงานใน Corrective");
        return;
      }

      Store.dispatch((state) => ({
        ...state,
        ui: {
          ...state.ui,
          currentView: "corrective",
          activeCorrectiveTab: found.tab,
          highlightIncidentId: eventData.incidentId,
        },
      }));
    };

    document.getElementById("btn-calendar-action-edit").onclick = () => {
      closeModal(document.getElementById("modal-calendar-detail"));
      openCalendarCreateModal(eventData);
    };

    document.getElementById("btn-calendar-action-cancel").onclick = () => {
      ensureCalendarCancelModal();
      openModal(document.getElementById("modal-calendar-cancel"));
    };

    openModal(document.getElementById("modal-calendar-detail"));
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-calendar-action]");
    if (!target) return;

    const action = target.dataset.calendarAction;
    const current = Store.getState();
    const mode = current.ui.calendarMode || "month";
    const focusDate = new Date(current.ui.calendarFocusDate || new Date().toISOString());

    if (action === "open-create") {
      openCalendarCreateModal();
      return;
    }

    if (action === "open-event") {
      openCalendarEventCard(target.dataset.eventId);
      return;
    }

    if (action === "set-mode") {
      Store.dispatch((state) => ({
        ...state,
        ui: { ...state.ui, calendarMode: target.dataset.mode || "month" },
      }));
      return;
    }

    if (action === "prev" || action === "next") {
      const next = CalendarUI.shiftDate(focusDate, mode, action === "next" ? 1 : -1);
      Store.dispatch((state) => ({
        ...state,
        ui: { ...state.ui, calendarFocusDate: next.toISOString() },
      }));
      return;
    }

    if (action === "pick-day") {
      const value = target.dataset.date;
      if (!value) return;
      Store.dispatch((state) => ({
        ...state,
        ui: { ...state.ui, calendarFocusDate: new Date(`${value}T00:00:00`).toISOString(), calendarMode: "day" },
      }));
    }
  });
  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!target?.matches("[data-calendar-action=\"set-filter\"]")) return;

    Store.dispatch((state) => ({
      ...state,
      ui: { ...state.ui, calendarFilter: target.value || "all" },
    }));
  });

  document.addEventListener("click", (event) => {
    if (event.target.id !== "btn-calendar-cancel-ok") return;
    if (!activeCalendarEventId) return;

    const reporter = document.getElementById("calendar-cancel-reporter")?.value || "-";
    const reason = document.getElementById("calendar-cancel-reason")?.value?.trim() || "-";
    const current = Store.getState();

    const calendarEvents = (current.calendarEvents || []).map((item) =>
      item.id === activeCalendarEventId
        ? { ...item, previousStatus: item.status, status: "CANCELLED", cancelReporter: reporter, cancelReason: reason, cancelledAt: new Date().toISOString() }
        : item
    );

    saveCalendarEvents(calendarEvents);
    closeModal(document.getElementById("modal-calendar-cancel"));
    closeModal(document.getElementById("modal-calendar-detail"));
    alert("ยกเลิกงานเรียบร้อย");
  });
  function buildAlertDetailIncidentFromCorrective(incident) {
    if (!incident) return null;

    return {
      id: getIncidentKey(incident),
      node: incident.node || "-",
      alarm: incident.alarm || "Network Alert",
      detail: incident.detail || incident.latestUpdateMessage || "-",
      nocBy: incident.nocBy || "System",
      downTime: incident.tickets?.[0]?.downTime || incident.createdAt || new Date().toISOString(),
      severity: incident.severity || "Medium",
      type: incident.workType || "Network",
      status: incident.status === "COMPLETE" ? "resolved" : "active",
      createdAt: incident.createdAt || new Date().toISOString(),
      tickets: incident.tickets || [],
    };
  }

  document.addEventListener("click", (event) => {
    const card = event.target.closest("[data-corrective-id]");
    if (!card) return;
    if (event.target.closest("button")) return;

    const found = getCorrectiveIncidentById(card.dataset.correctiveId);
    if (!found) return;

    const incidentForDetail = buildAlertDetailIncidentFromCorrective(found.incident);
    Store.dispatch((state) => ({
      ...state,
      ui: {
        ...state.ui,
        currentView: "alert-detail",
        selectedIncident: incidentForDetail,
      },
    }));
  });

  function mapWorkTypeToTab(type) {
    if (type === "Fiber") return "fiber";
    if (type === "Equipment") return "equipment";
    return "other";
  }

  function ensureEditWorkTypeModal() {
    if (document.getElementById("modal-edit-worktype")) return;

    document.body.insertAdjacentHTML("beforeend", `
      <div id="modal-edit-worktype" class="modal-backdrop hidden">
        <div class="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
          <h3 class="text-lg font-bold text-slate-800">Edit Work Type</h3>
          <select id="edit-worktype-select" class="w-full bg-slate-100 rounded-lg px-3 py-2">
            <option value="Fiber">Fiber</option>
            <option value="Equipment">Equipment</option>
            <option value="Other">Other</option>
          </select>
          <div class="flex justify-end gap-2">
            <button id="btn-cancel-edit-worktype" class="px-4 py-2 bg-slate-100 rounded-lg">Cancel</button>
            <button id="btn-save-edit-worktype" class="px-4 py-2 bg-indigo-600 text-white rounded-lg">Save</button>
          </div>
        </div>
      </div>
    `);

    document.getElementById("btn-cancel-edit-worktype").onclick = () => closeModal(document.getElementById("modal-edit-worktype"));
  }

  let editingWorkTypeIncidentId = null;

  function openEditWorkTypeModal(incidentId) {
    const found = getCorrectiveIncidentById(incidentId);
    if (!found) return;

    ensureEditWorkTypeModal();
    editingWorkTypeIncidentId = incidentId;

    const modal = document.getElementById("modal-edit-worktype");
    const select = document.getElementById("edit-worktype-select");
    select.value = found.incident.workType || "Other";

    document.getElementById("btn-save-edit-worktype").onclick = () => {
      const selectedType = select.value;
      const targetTab = mapWorkTypeToTab(selectedType);

      const current = Store.getState();
      const nextCorrective = {
        fiber: [...(current.corrective.fiber || [])],
        equipment: [...(current.corrective.equipment || [])],
        other: [...(current.corrective.other || [])],
      };

      let movedIncident = null;
      ["fiber", "equipment", "other"].forEach((tab) => {
        const idx = nextCorrective[tab].findIndex((item) => getIncidentKey(item) === editingWorkTypeIncidentId);
        if (idx !== -1) {
          movedIncident = { ...nextCorrective[tab][idx], workType: selectedType };
          nextCorrective[tab].splice(idx, 1);
        }
      });

      if (!movedIncident) return;
      nextCorrective[targetTab].push(movedIncident);

      LocalDB.saveState({ corrective: nextCorrective });
      Store.dispatch((state) => ({
        ...state,
        corrective: nextCorrective,
        ui: {
          ...state.ui,
          activeCorrectiveTab: targetTab,
          highlightIncidentId: movedIncident.incidentId,
        },
      }));

      closeModal(modal);
      alert("แก้ไข Work Type เรียบร้อย");
    };

    openModal(modal);
  }

  function getCorrectiveIncidentById(incidentId) {
    const state = Store.getState();
    const tabs = ["fiber", "equipment", "other"];

    for (const tab of tabs) {
      const incident = (state.corrective[tab] || []).find((item) => getIncidentKey(item) === incidentId);
      if (incident) return { incident, tab };
    }


    return null;
  }

  function formatTimelineDate(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function fileToDataURL(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result || "");
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  }

  async function buildAttachmentPayload(cameraFiles = [], attachFiles = []) {
    const selectedFiles = [...Array.from(cameraFiles || []), ...Array.from(attachFiles || [])];
    return Promise.all(selectedFiles.map(async (file) => ({
      name: file.name,
      type: file.type || "",
      url: await fileToDataURL(file),
    })));
  }

  function buildWhatWhereHowText(update = {}, finish = {}) {
    const who = (update.subcontractors || finish.subcontractors || []).join(", ") || "-";
    const what = finish.details?.repairText || update.message || "-";
    const where = finish.details?.area || update.area || update.site || "-";
    const how = finish.details?.method || update.workCase || "-";

    return { who, what, where, how };
  }
  function normalizeAttachmentItem(attachment) {
    if (!attachment) return null;
    if (typeof attachment === "string") {
      return { name: attachment, type: "", url: "" };
    }
    return {
      name: attachment.name || "ไฟล์แนบ",
      type: attachment.type || "",
      url: attachment.url || "",
    };
  }

  function renderTimelineAttachments(attachments = []) {
    const normalized = attachments.map(normalizeAttachmentItem).filter(Boolean);
    if (!normalized.length) return "";

    const imageItems = normalized.filter((item) => item.url && (item.type.startsWith("image/") || item.url.startsWith("data:image/")));
    const fileNames = normalized.map((item) => item.name).join(", ");

    return `
      <div class="text-xs text-slate-600 mt-2">ไฟล์แนบ: ${fileNames}</div>
      ${imageItems.length ? `<div class="mt-2 flex flex-wrap gap-2">${imageItems.map((item) => `<img src="${item.url}" alt="${item.name}" class="w-28 h-28 object-cover rounded border border-slate-200" />`).join("")}</div>` : ""}
    `;
  }

  function openCorrectiveDetailModal(incidentId) {
    const found = getCorrectiveIncidentById(incidentId);
    if (!found) return;

    const { incident, tab } = found;
    const latestUpdate = (incident.updates || []).slice(-1)[0] || {};
    const finish = incident.nsFinish || {};
    const summary = buildWhatWhereHowText(latestUpdate, finish);

    const timeline = [
      ...(incident.updates || []).map((item) => ({
        title: "NS Update",
        at: item.at,
        detail: item.message || "-",
        attachments: item.attachments || [],
      })),
      finish.times ? {
        title: "NS Finish",
        at: finish.times.upTime || incident.completedAt,
        detail: finish.details?.repairText || "-",
        attachments: finish.attachments || [],
      } : null,
    ].filter(Boolean);

    const modal = document.getElementById("modal-corrective-detail") || (() => {
      document.body.insertAdjacentHTML("beforeend", `
        <div id="modal-corrective-detail" class="modal-backdrop hidden">
          <div class="bg-white rounded-2xl w-full max-w-5xl p-6 max-h-[90vh] overflow-y-auto">
            <div class="flex items-center justify-between mb-4">
              <h3 id="detail-title" class="text-xl font-bold text-slate-800">View Detail</h3>
              <button id="btn-close-corrective-detail" class="px-4 py-2 bg-slate-100 rounded-lg">ปิด</button>
            </div>
            <div id="corrective-detail-body"></div>
          </div>
        </div>
      `);
      document.getElementById("btn-close-corrective-detail").onclick = () => closeModal(document.getElementById("modal-corrective-detail"));
      return document.getElementById("modal-corrective-detail");
    })();

    document.getElementById("detail-title").textContent = `View Detail (${incident.incidentId})`;
    document.getElementById("corrective-detail-body").innerHTML = `
      <div class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="ops-panel p-4"><div class="text-xs text-slate-500">Type</div><div class="font-semibold">${tab}</div></div>
          <div class="ops-panel p-4"><div class="text-xs text-slate-500">Node</div><div class="font-semibold">${incident.node || "-"}</div></div>
          <div class="ops-panel p-4"><div class="text-xs text-slate-500">Sub Contractor</div><div class="font-semibold">${summary.who}</div></div>
          <div class="ops-panel p-4"><div class="text-xs text-slate-500">Update Timeline</div><div class="font-semibold">${summary.what}</div></div>
          <div class="ops-panel p-4"><div class="text-xs text-slate-500">บริเวณจุดเกิดเหตุ</div><div class="font-semibold">${summary.where}</div></div>
          <div class="ops-panel p-4"><div class="text-xs text-slate-500">แก้ไขอย่างไร</div><div class="font-semibold">${summary.how}</div></div>
        </div>

        <div class="ops-panel p-4">
          <div class="text-sm font-semibold text-slate-700 mb-2">Timeline</div>
          <div class="space-y-2">
            ${timeline.length ? timeline.map((item) => `
              <div class="border rounded-lg p-3">
                <div class="text-sm font-semibold text-slate-700">${item.title}</div>
                <div class="text-xs text-slate-500">${formatTimelineDate(item.at)}</div>
                <div class="text-sm mt-1">${item.detail}</div>
                ${renderTimelineAttachments(item.attachments)}
              </div>
            `).join("") : '<div class="text-slate-400">ยังไม่มี timeline</div>'}
          </div>
        </div>
      </div>
    `;

    openModal(modal);
  }

    const ofcTypeOptions = [
    "Flat type 2 Core",
    "4 Core ADSS",
    "12 Core ADSS",
    "24 Core ADSS",
    "48 Core ADSS",
    "60 Core ADSS",
    "144 Core ADSS",
    "216 Core ADSS",
    "312 Core ADSS",
    "12 Core Armour",
    "48 Core Armour",
    "60 Core Armour",
    "144 Core Armour",
  ];

  function normalizeMultiOfcData(rawData) {
    const normalized = {};
    Object.entries(rawData || {}).forEach(([type, qty]) => {
      const amount = Number.parseInt(qty, 10);
      if (Number.isFinite(amount) && amount > 0) {
        normalized[type] = amount;
      }
    });
    return normalized;
  }
  window.ofcMultipleLinesData = window.ofcMultipleLinesData || {};
  window.selectedOfcLines = window.selectedOfcLines || [];
  window.isUsingMultipleLines = window.isUsingMultipleLines || false;

  function parseCoreCountFromType(ofcType = "") {
    const match = String(ofcType).match(/(\d+)\s*Core/i);
    return match ? Number(match[1]) : "";
  }

  function buildSelectedLineList(multiOfcDetails = {}) {
    const lines = [];
    Object.entries(normalizeMultiOfcData(multiOfcDetails)).forEach(([type, qty]) => {
      for (let i = 0; i < qty; i += 1) {
        lines.push({
          lineNo: lines.length + 1,
          type,
          coreCount: parseCoreCountFromType(type),
          method: "",
          distance: "",
          cutPoints: "",
          corePerPoint: "",
          connectors: "",
          useConnectors: "ไม่ใช้หัวต่อ",
          depositToLine: "",
          depositCore: "",
          depositTargetCore: "",
          note: "",
        });
      }
    });
    return lines;
  }


  function summarizeMultiOfcData(rawData) {
    const normalized = normalizeMultiOfcData(rawData);
    return Object.entries(normalized).map(([type, qty]) => `${type} ${qty} เส้น`);
  }

  function renderOfcSummaryBox(boxEl, rawData) {
    if (!boxEl) return;
    const summaryList = summarizeMultiOfcData(rawData);
    if (!summaryList.length) {
      boxEl.classList.add("hidden");
      boxEl.textContent = "";
      return;
    }

    boxEl.classList.remove("hidden");
    boxEl.textContent = summaryList.join(", ");
  }

  function readMultiOfcFromModalDataset(modalEl) {
    try {
      return normalizeMultiOfcData(JSON.parse(modalEl?.dataset?.multiOfcDetails || "{}"));
    } catch {
      return {};
    }
  }

  function ensureUpdateModal() {
    if (document.getElementById("modal-corrective-update")) return;

    document.body.insertAdjacentHTML(
      "beforeend",
      `
      <div id="modal-corrective-update" class="modal-backdrop hidden">
        <div class="bg-white rounded-2xl w-full max-w-6xl p-5 md:p-6 max-h-[92vh] overflow-y-auto">
              <div class="flex items-center justify-between mb-4">
            <h3 id="corrective-update-title" class="text-xl font-bold text-slate-800">NS Update</h3>
            <button id="btn-close-corrective-update" class="px-3 py-1 bg-slate-100 rounded-lg">ปิด</button>
          </div>

          <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div class="border rounded-xl p-4 md:p-5 space-y-4 bg-slate-50/40">
              <h4 class="font-semibold text-slate-700">📍 ข้อมูลจุดเสีย</h4>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label class="text-sm text-slate-600">OFC Type:</label>
                  <select id="upd-ofc-type" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2">
                    <option value="">เลือกประเภท</option>
                    <option>หลายเส้น</option>
                    <option>Flat type 2 Core</option><option>4 Core ADSS</option><option>12 Core ADSS</option><option>24 Core ADSS</option>
                    <option>48 Core ADSS</option><option>60 Core ADSS</option><option>144 Core ADSS</option><option>216 Core ADSS</option>
                    <option>312 Core ADSS</option><option>12 Core Armour</option><option>48 Core Armour</option><option>60 Core Armour</option><option>144 Core Armour</option>
                  </select>
                  <div class="mt-2 p-3 rounded-lg border border-emerald-300 bg-emerald-50 hidden" id="upd-multi-ofc-summary-wrap">
                    <div class="font-semibold text-slate-800">ข้อมูล OFC ที่เลือก:</div>
                    <div id="upd-multi-ofc-summary" class="text-emerald-800"></div>
                  </div>
                </div>
                <div>
                  <label class="text-sm text-slate-600">สาเหตุ:</label>
                  <select id="upd-cause" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2">
                    <option value="">เลือกสาเหตุ</option>
                    <option>Animal gnawing</option><option>High loss/Crack</option><option>Cut by Unknown agency</option><option>Cut trees</option><option>Cut by MEA/PEA agency</option><option>Car accident</option><option>Electrical Surge</option><option>Electrical pole was broken by accident</option><option>Electrical pole was broken by Natural Disaster</option><option>Electric Authority remove pole</option><option>Road Construction</option><option>BTS Construction</option><option>Fire damanged</option><option>Natural Disaster</option><option>Equipment at Node</option><option>Equipment at customer</option><option>Bullet</option>
                  </select>
                </div>
              </div>

              <div>
                <label class="text-sm text-slate-600">Circuit ID + Customer (ไม่บังคับ):</label>
                <div class="grid grid-cols-1 gap-2 mt-1">
                  <select id="upd-originate" class="w-full bg-slate-100 rounded-lg px-3 py-2"></select>
                  <select id="upd-terminate" class="w-full bg-slate-100 rounded-lg px-3 py-2"></select>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <div>
                  <label class="text-xs text-slate-600">ชื่อ Site:</label>
                  <input id="upd-site" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2" placeholder="เช่น PKD">
                </div>
                <div>
                  <label class="text-xs text-slate-600">ระยะห่าง (เมตร):</label>
                  <input id="upd-distance" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2" placeholder="เช่น 8797">
                </div>
                <div>
                  <label class="text-xs text-slate-600">บริเวณ:</label>
                  <input id="upd-area" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2" placeholder="เช่น หน้าซอยสุขุมวิท 50">
                </div>
                <div>
                  <label class="text-xs text-slate-600">พิกัด (Lat, Long):</label>
                  <input id="upd-latlng" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2" placeholder="เช่น 13.7054778, 100.5026162">
                </div>
              </div>

              <div>
                <label class="text-sm text-slate-600">Sub Contractor (เลือกได้หลายเจ้า):</label>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                  <label class="flex items-center gap-2 px-3 py-2 bg-slate-50 border rounded-lg"><input type="checkbox" class="upd-sub" value="TAS"> TAS</label>
                  <label class="flex items-center gap-2 px-3 py-2 bg-slate-50 border rounded-lg"><input type="checkbox" class="upd-sub" value="ATG"> ATG</label>
                  <label class="flex items-center gap-2 px-3 py-2 bg-slate-50 border rounded-lg"><input type="checkbox" class="upd-sub" value="NPY"> NPY</label>
                  <label class="flex items-center gap-2 px-3 py-2 bg-slate-50 border rounded-lg"><input type="checkbox" class="upd-sub" value="JJ&A"> JJ&A</label>
                  <label class="flex items-center gap-2 px-3 py-2 bg-slate-50 border rounded-lg"><input type="checkbox" class="upd-sub" value="TP"> TP</label>
                  <label class="flex items-center gap-2 px-3 py-2 bg-slate-50 border rounded-lg"><input type="checkbox" class="upd-sub" value="JL"> JL</label>
                </div>
              </div>

              <div class="flex flex-wrap gap-2">
                <button id="btn-open-map" class="px-3 py-2 bg-red-500 text-white rounded-lg">🗺️ กดได้และดึงข้อมูล</button>
                <button id="btn-get-pin" class="px-3 py-2 bg-red-500 text-white rounded-lg">📍 กดได้และดึงข้อมูล</button>
              </div>
            </div>
            <div class="border rounded-xl p-4 md:p-5 space-y-3 bg-slate-50/40">
              <h4 class="font-semibold text-slate-700">🖼️ รูปภาพ / การดำเนินงาน</h4>

              <input id="upd-camera-input" type="file" accept="image/*" capture="environment" class="hidden">
              <input id="upd-file-input" type="file" multiple class="hidden">

              <div class="grid grid-cols-2 gap-2">
                <button id="btn-capture-photo" type="button" class="bg-slate-100 rounded-lg px-3 py-2">📷 ถ่ายภาพ</button>
                <button id="btn-attach-file" type="button" class="bg-slate-100 rounded-lg px-3 py-2">📎 แนบไฟล์</button>
              </div>

              <div id="upd-attachments-preview" class="text-xs text-slate-500 min-h-[20px]"></div>

              <div class="flex items-center gap-2">
                <span>Clock Status: <b id="upd-clock-status" class="text-green-600">STARTED</b></span>
                <button id="upd-start" class="px-2 py-1 bg-green-200 rounded">Start</button>
                <button id="upd-stop" class="px-2 py-1 bg-red-400 text-white rounded">Stop</button>
              </div>
              <div>
                <label class="text-sm text-slate-600">เหตุผลกรณีกด Stop:</label>
                <select id="upd-stop-reason" class="w-full bg-slate-100 rounded-lg px-3 py-2 mt-1">
                  <option value="">-- เลือกเหตุผล --</option>
                  <option>เนื่องจากรอเจ้าหน้าที่การไฟฟ้าให้เข้าดำเนินการแก้ไข</option>
                  <option>เนื่องจากเพลิงยังลุกไหม้อยู่</option>
                  <option>เนื่องจากรอเจ้าหน้าที่ปักเสาไฟฟ้าใหม่</option>
                  <option>เนื่องจากรอเจ้าหน้าที่อนุญาตให้เข้าพื้นที่</option>
                  <option>ตรวจสอบพบ OFC มีปัญหาในพื้นที่ลูกค้า</option>
                  <option>ตรวจสอบพบ OFC มีปัญหาในพื้นอาคาร</option>
                </select>
              </div>

              <div>
                <label class="text-sm text-slate-600">กรณีการดำเนินงาน:</label>
                <select id="upd-workcase" class="w-full bg-slate-100 rounded-lg px-3 py-2 mt-1">
                  <option>-- เลือกกรณี --</option>
                  <option>OFC ปกติ</option>
                  <option>กรณ์ OFC ตอนนอกปกติ</option>
                </select>
              </div>

              <div>
                <label class="text-sm text-slate-600">ETR:</label>
                <div class="grid grid-cols-2 gap-3 mt-1">
                  <input id="upd-etr-hour" type="number" min="0" class="bg-slate-100 rounded-lg px-3 py-2" placeholder="ชั่วโมง">
                  <input id="upd-etr-min" type="number" min="0" max="59" class="bg-slate-100 rounded-lg px-3 py-2" placeholder="นาที">
                </div>
              </div>

              <button id="btn-generate-update" class="w-full px-3 py-2 bg-blue-500 text-white rounded-lg">⚙️ สร้างสรุป Update</button>
              <textarea id="upd-message" class="w-full bg-slate-100 rounded-lg px-3 py-2 h-32" placeholder="ข้อความอัปเดต (จะถูกสร้างอัตโนมัติ)"></textarea>
            </div>
          </div>

          <div class="flex justify-end gap-2 mt-4">
            <button id="btn-cancel-corrective-update" class="px-4 py-2 bg-slate-200 rounded-lg">ยกเลิก</button>
            <button id="btn-save-corrective-update" class="px-4 py-2 bg-indigo-600 text-white rounded-lg">บันทึก</button>
          </div>
        </div>
      </div>

      <div id="modal-multi-ofc" class="modal-backdrop hidden">
        <div class="bg-white rounded-2xl w-full max-w-xl p-5 max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between">
            <h4 class="text-2xl font-bold text-slate-800">🔌 หลายเส้น</h4>
          </div>
          <p class="text-sm text-slate-600 mt-2 mb-4">กรุณาระบุจำนวนเส้นสำหรับแต่ละประเภท</p>
          <div id="multi-ofc-inputs" class="space-y-2"></div>
          <div class="flex justify-end gap-2 mt-5">
            <button id="btn-cancel-multi-ofc" class="px-4 py-2 bg-slate-200 rounded-lg">ยกเลิก</button>
            <button id="btn-confirm-multi-ofc" class="px-4 py-2 bg-emerald-500 text-white rounded-lg">ยืนยัน</button>
          </div>
        </div>
      </div>`
    );

    const modal = document.getElementById("modal-corrective-update");
    const ofcTypeSelect = document.getElementById("upd-ofc-type");
    const multiOfcSummaryWrap = document.getElementById("upd-multi-ofc-summary-wrap");
    const multiOfcSummary = document.getElementById("upd-multi-ofc-summary");
    const multiOfcModal = document.getElementById("modal-multi-ofc");
    const multiOfcInputs = document.getElementById("multi-ofc-inputs");

    multiOfcInputs.innerHTML = ofcTypeOptions
      .map(
        (type) => `
          <div class="grid grid-cols-3 gap-2 items-center">
            <label class="col-span-2 text-slate-700">${type}:</label>
            <input type="number" min="0" data-type="${type}" class="multi-ofc-input w-full bg-slate-50 border rounded-lg px-3 py-2" placeholder="เส้น">
          </div>`
      )
      .join("");

    function readMultiOfcFromPopup() {
      const raw = {};
      multiOfcInputs.querySelectorAll(".multi-ofc-input").forEach((input) => {
        raw[input.dataset.type] = input.value;
      });
      return normalizeMultiOfcData(raw);
    }

    function renderUpdateMultiOfcSummary(rawData) {
      renderOfcSummaryBox(multiOfcSummary, rawData);
      const hasData = summarizeMultiOfcData(rawData).length > 0;
      multiOfcSummaryWrap.classList.toggle("hidden", !hasData);
    }

    function setPopupValues(rawData) {
      const normalized = normalizeMultiOfcData(rawData);
      multiOfcInputs.querySelectorAll(".multi-ofc-input").forEach((input) => {
        input.value = normalized[input.dataset.type] || "";
      });
    }

    function getStoredMultiOfcData() {
      try {
        return JSON.parse(modal.dataset.multiOfcDetails || "{}");
      } catch {
        return {};
      }
    }

    function setStoredMultiOfcData(rawData) {
      const normalized = normalizeMultiOfcData(rawData);
      modal.dataset.multiOfcDetails = JSON.stringify(normalized);
      renderUpdateMultiOfcSummary(normalized);
    }

    document.getElementById("btn-close-corrective-update").onclick = () => closeModal(modal);
    document.getElementById("btn-cancel-corrective-update").onclick = () => closeModal(modal);

    ofcTypeSelect.onchange = () => {
      if (ofcTypeSelect.value === "หลายเส้น") {
        setPopupValues(getStoredMultiOfcData());
        openModal(multiOfcModal);
      } else {
        setStoredMultiOfcData({});
      }
    };

    document.getElementById("btn-cancel-multi-ofc").onclick = () => {
      closeModal(multiOfcModal);
      if (!summarizeMultiOfcData(getStoredMultiOfcData()).length) {
        ofcTypeSelect.value = "";
      }
    };

    document.getElementById("btn-confirm-multi-ofc").onclick = () => {
      const data = readMultiOfcFromPopup();
      setStoredMultiOfcData(data);
      closeModal(multiOfcModal);
    };

    document.getElementById("upd-start").onclick = () => {
      document.getElementById("upd-clock-status").textContent = "STARTED";
      document.getElementById("upd-clock-status").className = "text-green-600";
      modal.dataset.startClockAt = new Date().toISOString();
    };

    document.getElementById("upd-stop").onclick = () => {
      const stopReason = document.getElementById("upd-stop-reason").value.trim();
      if (!stopReason) {
        alert("กรุณาเลือกเหตุผลกรณีกด Stop");
        return;
      }
      document.getElementById("upd-clock-status").textContent = "STOPPED";
      document.getElementById("upd-clock-status").className = "text-red-600";
      modal.dataset.stopClockAt = new Date().toISOString();
      modal.dataset.stopReason = stopReason;
    };

    const cameraInput = document.getElementById("upd-camera-input");
    const fileInput = document.getElementById("upd-file-input");
    const preview = document.getElementById("upd-attachments-preview");

    function renderAttachmentPreview() {
      const cameraFiles = Array.from(cameraInput.files || []);
      const attachFiles = Array.from(fileInput.files || []);
      const names = [...cameraFiles, ...attachFiles].map((file) => file.name);
      preview.textContent = names.length ? `ไฟล์ที่เลือก: ${names.join(", ")}` : "ยังไม่ได้เลือกไฟล์";
    }

    document.getElementById("btn-capture-photo").onclick = () => cameraInput.click();
    document.getElementById("btn-attach-file").onclick = () => fileInput.click();
    cameraInput.onchange = renderAttachmentPreview;
    fileInput.onchange = renderAttachmentPreview;
    renderAttachmentPreview();

    async function reverseGeocode(lat, lon) {
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=th`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("reverse geocode failed");

        const data = await response.json();
        const name =
          data.name ||
          data.address?.amenity ||
          data.address?.shop ||
          data.address?.road ||
          data.address?.suburb ||
          data.display_name?.split(",")?.[0] ||
          "";

        return name;
      } catch {
        return "";
      }
    }

    document.getElementById("btn-get-pin").onclick = () => {
      if (!navigator.geolocation) return alert("อุปกรณ์ไม่รองรับ geolocation");

      navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const latlng = `${lat}, ${lon}`;

        document.getElementById("upd-latlng").value = latlng;

        const place = await reverseGeocode(lat, lon);
        if (place) {
          document.getElementById("upd-area").value = place;
        }
      });
    };

    document.getElementById("btn-open-map").onclick = () => {
      const latlng = document.getElementById("upd-latlng").value.trim();
      const query = latlng || document.getElementById("upd-area").value.trim();
      if (!query) return alert("กรุณากรอกบริเวณหรือพิกัดก่อน");
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, "_blank");
    };
  }
  function ensureEquipmentUpdateModal() {
    if (document.getElementById("modal-corrective-update-equipment")) return;

    document.body.insertAdjacentHTML("beforeend", `
      <div id="modal-corrective-update-equipment" class="modal-backdrop hidden">
        <div class="bg-white rounded-2xl w-full max-w-3xl p-6 max-h-[92vh] overflow-y-auto space-y-4">
          <div class="flex items-center justify-between">
            <h3 id="equipment-update-title" class="text-4 font-bold text-slate-800">NS Update Equipment</h3>
            <button id="btn-close-equipment-update" class="px-3 py-2 bg-slate-100 rounded-lg">ปิด</button>
          </div>

          <div class="text-slate-700 font-semibold">รายละเอียด Update (Equipment)</div>

          <div class="space-y-2">
            <label class="text-sm font-semibold text-slate-700">สถานะปัจจุบัน:</label>
            <select id="eq-upd-status" class="w-full bg-slate-100 rounded-lg px-3 py-2">
              <option value="">-- เลือกสถานะ --</option>
              <option>เดินทางถึงลูกค้าแล้ว</option>
              <option>ตรวจสอบพบ</option>
            </select>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-semibold text-slate-700">สิ่งที่ตรวจสอบพบ:</label>
            <select id="eq-upd-finding" class="w-full bg-slate-100 rounded-lg px-3 py-2">
              <option value="">-- เลือกสิ่งที่ตรวจพบ --</option>
              <option>อุปกรณ์ Hang</option>
              <option>SFP Hang/เสีย</option>
              <option>Rectifier Fail</option>
              <option>พัดลมเสีย/ดัง</option>
              <option>Card Fail</option>
              <option>Port เสีย</option>
              <option>Config มีปัญหา</option>
              <option>Adapter เสีย</option>
              <option>UPS มีปัญหา</option>
              <option>สาย LAN หลวม</option>
              <option>Patch Cord มีปัญหา</option>
              <option>สายไฟหลวม</option>
              <option>สาย Fiber หลวม</option>
              <option>ระบบไฟฟ้าที่ลูกค้ามีปัญหา</option>
              <option>อื่นๆ</option>
            </select>
          </div>

          <div>
            <label class="text-sm text-slate-600">Circuit ID + Customer (ไม่บังคับ):</label>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
              <select id="eq-upd-originate" class="w-full bg-slate-100 rounded-lg px-3 py-2"></select>
              <select id="eq-upd-terminate" class="w-full bg-slate-100 rounded-lg px-3 py-2"></select>
            </div>
          </div>

          <div class="border rounded-xl p-3 bg-slate-50">
            <div class="font-semibold text-violet-600 mb-2">📷 รูปภาพประกอบ</div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <button id="btn-eq-capture" class="px-3 py-2 bg-slate-100 rounded-lg">📸 ถ่ายภาพ</button>
              <button id="btn-eq-attach" class="px-3 py-2 bg-slate-100 rounded-lg">📎 แนบไฟล์</button>
            </div>
            <input id="eq-upd-camera-input" type="file" accept="image/*" capture="environment" class="hidden">
            <input id="eq-upd-file-input" type="file" multiple class="hidden">
            <div id="eq-upd-attachments-preview" class="text-xs text-slate-500 mt-2">ยังไม่ได้เลือกไฟล์</div>
          </div>

          <button id="btn-generate-eq-update" class="w-full px-4 py-2 bg-indigo-500 text-white rounded-lg font-semibold">⚙️ สร้างสรุป Update</button>

          <div>
            <label class="text-sm font-semibold text-slate-700">ข้อความอัปเดต:</label>
            <textarea id="eq-upd-message" rows="5" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2" placeholder="สรุปปรากฏการณ์..."></textarea>
          </div>

          <div class="flex justify-end gap-2">
            <button id="btn-cancel-equipment-update" class="px-4 py-2 bg-slate-100 rounded-lg">ยกเลิก</button>
            <button id="btn-save-equipment-update" class="px-4 py-2 bg-indigo-600 text-white rounded-lg">บันทึก</button>
          </div>
        </div>
      </div>
    `);

    const modal = document.getElementById("modal-corrective-update-equipment");
    document.getElementById("btn-close-equipment-update").onclick = () => closeModal(modal);
    document.getElementById("btn-cancel-equipment-update").onclick = () => closeModal(modal);

    const camInput = document.getElementById("eq-upd-camera-input");
    const fileInput = document.getElementById("eq-upd-file-input");
    const preview = document.getElementById("eq-upd-attachments-preview");

    function renderPreview() {
      const names = [
        ...Array.from(camInput.files || []).map((f) => f.name),
        ...Array.from(fileInput.files || []).map((f) => f.name),
      ];
      preview.textContent = names.length ? `ไฟล์ที่เลือก: ${names.join(", ")}` : "ยังไม่ได้เลือกไฟล์";
    }

    document.getElementById("btn-eq-capture").onclick = () => camInput.click();
    document.getElementById("btn-eq-attach").onclick = () => fileInput.click();
    camInput.onchange = renderPreview;
    fileInput.onchange = renderPreview;
  }

  function openEquipmentUpdateModal(incidentId) {
    const found = getCorrectiveIncidentById(incidentId);
    if (!found) return;

    ensureEquipmentUpdateModal();
    const modal = document.getElementById("modal-corrective-update-equipment");
    const { incident, tab } = found;

    document.getElementById("equipment-update-title").textContent = `NS Update ${incident.incidentId}`;

    const tickets = incident.tickets || [];
    const origins = [...new Set(tickets.map((t) => t.originate).filter(Boolean))];
    const terms = [...new Set(tickets.map((t) => t.terminate).filter(Boolean))];
    document.getElementById("eq-upd-originate").innerHTML = `<option value="">-- เลือก Originate --</option>${origins.map((o) => `<option>${o}</option>`).join("")}`;
    document.getElementById("eq-upd-terminate").innerHTML = `<option value="">-- เลือก Terminate --</option>${terms.map((t) => `<option>${t}</option>`).join("")}`;

    document.getElementById("eq-upd-status").value = "";
    document.getElementById("eq-upd-finding").value = "";
    document.getElementById("eq-upd-message").value = "";
    document.getElementById("eq-upd-camera-input").value = "";
    document.getElementById("eq-upd-file-input").value = "";
    document.getElementById("eq-upd-attachments-preview").textContent = "ยังไม่ได้เลือกไฟล์";

    document.getElementById("btn-generate-eq-update").onclick = () => {
      const status = document.getElementById("eq-upd-status").value || "-";
      const finding = document.getElementById("eq-upd-finding").value || "-";
      document.getElementById("eq-upd-message").value = `สถานะปัจจุบัน: ${status}
สิ่งที่ตรวจสอบพบ: ${finding}
กำลังเร่งดำเนินการแก้ไข`; 
    };

    document.getElementById("btn-save-equipment-update").onclick = () => {
      const current = Store.getState();
      const updatePayload = {
        at: new Date().toISOString(),
        equipmentStatus: document.getElementById("eq-upd-status").value,
        equipmentFinding: document.getElementById("eq-upd-finding").value,
        originate: document.getElementById("eq-upd-originate").value,
        terminate: document.getElementById("eq-upd-terminate").value,
        message: document.getElementById("eq-upd-message").value,
        attachments: [
          ...Array.from(document.getElementById("eq-upd-camera-input").files || []).map((f) => f.name),
          ...Array.from(document.getElementById("eq-upd-file-input").files || []).map((f) => f.name),
        ],
      };

      const nextCorrective = { ...current.corrective };
      nextCorrective[tab] = (nextCorrective[tab] || []).map((item) =>
        getIncidentKey(item) === incidentId
          ? { ...item, updates: [...(item.updates || []), updatePayload], latestUpdateMessage: updatePayload.message }
          : item
      );

      LocalDB.saveState({ alerts: current.alerts, corrective: nextCorrective });
      Store.dispatch((state) => ({ ...state, corrective: nextCorrective }));
      closeModal(modal);
      alert("บันทึก Update Equipment เรียบร้อย");
    };

    openModal(modal);
  }

  function ensureEquipmentFinishModal() {
    if (document.getElementById("modal-corrective-finish-equipment")) return;

    document.body.insertAdjacentHTML("beforeend", `
      <div id="modal-corrective-finish-equipment" class="modal-backdrop hidden">
        <div class="bg-white rounded-2xl w-full max-w-3xl p-6 max-h-[92vh] overflow-y-auto space-y-4">
          <div class="flex items-center justify-between">
            <h3 id="equipment-finish-title" class="text-2xl font-bold text-slate-800">NS Finish Equipment</h3>
            <button id="btn-close-equipment-finish" class="px-3 py-2 bg-slate-100 rounded-lg">ปิด</button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label class="text-sm">Incident Number:</label><input id="eq-finish-incident" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2"></div>
            <div><label class="text-sm">Node:</label><input id="eq-finish-node" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2"></div>
            <div class="md:col-span-2"><label class="text-sm">Device Type:</label><input id="eq-finish-device" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2" placeholder="เช่น Router"></div>
            <div class="md:col-span-2"><label class="text-sm">Alarm/Problem:</label><textarea id="eq-finish-problem" rows="2" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2"></textarea></div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label class="text-sm">Down Time:</label><input id="eq-finish-down" type="datetime-local" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2"></div>
            <div><label class="text-sm">Up Time:</label><input id="eq-finish-up" type="datetime-local" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2"></div>
            <div><label class="text-sm">NS Response:</label><input id="eq-finish-response" type="datetime-local" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2"></div>
            <div><label class="text-sm">Arrival Time:</label><input id="eq-finish-arrive" type="datetime-local" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2"></div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="text-sm">สาเหตุ:</label>
              <select id="eq-finish-cause" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2">
                <option value="">เลือกสาเหตุ</option>
                <option>Hardware Failure</option>
                <option>Software/Config Issue</option>
                <option>Power Issue (Internal)</option>
                <option>Power Issue (External)</option>
                <option>Unknown</option>
              </select>
            </div>
            <div>
              <label class="text-sm">ส่วนที่เสีย:</label>
              <select id="eq-finish-damaged" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2">
                <option value="">เลือกส่วนที่เสีย</option>
                <option>Router</option><option>Switch</option><option>SFP/Transceiver</option><option>Rectifier/Power Supply</option>
                <option>Fan</option><option>Card/Module</option><option>UPS</option><option>Controller</option><option>Adapter</option>
              </select>
            </div>
            <div class="md:col-span-2">
              <label class="text-sm">การแก้ไข:</label>
              <select id="eq-finish-fix" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2">
                <option value="">เลือกการแก้ไข</option>
                <option>Reboot</option><option>Replace</option><option>Reseat</option><option>Config Change</option><option>Firmware Upgrade</option>
              </select>
            </div>
          </div>

          <div>
            <label class="text-sm">สรุปการดำเนินการเพิ่มเติม:</label>
            <textarea id="eq-finish-summary" rows="3" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2" placeholder="เช่น ตรวจสอบพบ SFP Hang แก้ไขโดยการ Reset SFP ใหม่..."></textarea>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label class="text-sm">S/N เดิม:</label><input id="eq-finish-old-sn" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2"></div>
            <div><label class="text-sm">S/N ใหม่:</label><input id="eq-finish-new-sn" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2"></div>
          </div>

          <button id="btn-save-equipment-finish" class="w-full px-4 py-3 rounded-lg text-white font-semibold" style="background: linear-gradient(90deg,#0ea5a4,#059669);">✅ ปิดงาน (NS Finish)</button>

          <div class="flex justify-end">
            <button id="btn-cancel-equipment-finish" class="px-4 py-2 bg-slate-100 rounded-lg">ยกเลิก</button>
          </div>
        </div>
      </div>
    `);

    const modal = document.getElementById("modal-corrective-finish-equipment");
    document.getElementById("btn-close-equipment-finish").onclick = () => closeModal(modal);
    document.getElementById("btn-cancel-equipment-finish").onclick = () => closeModal(modal);
  }

  function openEquipmentFinishModal(incidentId) {
    const found = getCorrectiveIncidentById(incidentId);
    if (!found) return;

    ensureEquipmentFinishModal();
    const { incident, tab } = found;
    const modal = document.getElementById("modal-corrective-finish-equipment");

    document.getElementById("equipment-finish-title").textContent = `NS Finish Equipment ${incident.incidentId}`;
    document.getElementById("eq-finish-incident").value = incident.incidentId || "";
    document.getElementById("eq-finish-node").value = incident.node || "";
    document.getElementById("eq-finish-problem").value = incident.alarm || "";

    const firstTicket = (incident.tickets || [])[0] || {};
    document.getElementById("eq-finish-down").value = formatDateTimeInput(firstTicket.downTime || incident.downTime || incident.createdAt);
    document.getElementById("eq-finish-response").value = formatDateTimeInput(incident.respondedAt || incident.createdAt);

    document.getElementById("btn-save-equipment-finish").onclick = () => {
      const current = Store.getState();
      const payload = {
        incidentNumber: document.getElementById("eq-finish-incident").value,
        times: {
          downTime: document.getElementById("eq-finish-down").value,
          upTime: document.getElementById("eq-finish-up").value,
          nsResponse: document.getElementById("eq-finish-response").value,
          arrivalTime: document.getElementById("eq-finish-arrive").value,
        },
        details: {
          node: document.getElementById("eq-finish-node").value,
          deviceType: document.getElementById("eq-finish-device").value,
          problem: document.getElementById("eq-finish-problem").value,
          cause: document.getElementById("eq-finish-cause").value,
          damagedPart: document.getElementById("eq-finish-damaged").value,
          fixAction: document.getElementById("eq-finish-fix").value,
          summary: document.getElementById("eq-finish-summary").value,
          oldSn: document.getElementById("eq-finish-old-sn").value,
          newSn: document.getElementById("eq-finish-new-sn").value,
        },
      };

      const nextCorrective = { ...current.corrective };
      nextCorrective[tab] = (nextCorrective[tab] || []).map((item) =>
        getIncidentKey(item) === incidentId ? { ...item, nsFinish: payload, status: "COMPLETE", completedAt: new Date().toISOString() } : item
      );

      LocalDB.saveState({ alerts: current.alerts, corrective: nextCorrective });
      Store.dispatch((state) => ({ ...state, corrective: nextCorrective }));
      closeModal(modal);
      alert("บันทึก NS Finish Equipment เรียบร้อย");
    };

    openModal(modal);
  }


  let updateIncidentId = null;

  function openCorrectiveUpdateModal(incidentId) {
    const found = getCorrectiveIncidentById(incidentId);
    if (!found) return;

    if (found.tab === "equipment") {
      openEquipmentUpdateModal(incidentId);
      return;
    }

    updateIncidentId = incidentId;
    const { incident } = found;
    ensureUpdateModal();

    const modal = document.getElementById("modal-corrective-update");
    document.getElementById("corrective-update-title").textContent = `NS Update (${incident.incidentId})`;

    const tickets = incident.tickets || [];
    const origins = [...new Set(tickets.map((t) => t.originate).filter(Boolean))];
    const terms = [...new Set(tickets.map((t) => t.terminate).filter(Boolean))];

    const originSel = document.getElementById("upd-originate");
    const termSel = document.getElementById("upd-terminate");
    originSel.innerHTML = `<option value="">-- เลือก Originate --</option>${origins.map((o) => `<option>${o}</option>`).join("")}`;
    termSel.innerHTML = `<option value="">-- เลือก Terminate --</option>${terms.map((t) => `<option>${t}</option>`).join("")}`;

    document.getElementById("upd-ofc-type").value = "";
    document.getElementById("upd-cause").value = "";
    document.getElementById("upd-site").value = "";
    document.getElementById("upd-distance").value = "";
    document.getElementById("upd-area").value = "";
    document.getElementById("upd-latlng").value = "";
    document.getElementById("upd-workcase").value = "-- เลือกกรณี --";
    document.getElementById("upd-stop-reason").value = "";
    document.getElementById("upd-etr-hour").value = "";
    document.getElementById("upd-etr-min").value = "";
    document.getElementById("upd-message").value = "";
    document.getElementById("upd-camera-input").value = "";
    document.getElementById("upd-file-input").value = "";
    document.querySelectorAll(".upd-sub").forEach((el) => { el.checked = false; });
    document.getElementById("upd-attachments-preview").textContent = "ยังไม่ได้เลือกไฟล์";
    modal.dataset.startClockAt = "";
    modal.dataset.stopClockAt = "";
    modal.dataset.stopReason = "";
    modal.dataset.multiOfcDetails = "{}";
    renderOfcSummaryBox(document.getElementById("upd-multi-ofc-summary"), {});
    document.getElementById("upd-multi-ofc-summary-wrap").classList.add("hidden");

    document.getElementById("btn-generate-update").onclick = () => {
      const latest = getCorrectiveIncidentById(updateIncidentId)?.incident;
      const updateNo = ((latest?.updates || []).length || 0) + 1;

      const ofcType = document.getElementById("upd-ofc-type").value || "OFC";
      const multiOfcDetails = readMultiOfcFromModalDataset(modal);
      const multiOfcSummary = summarizeMultiOfcData(multiOfcDetails);
      const cause = document.getElementById("upd-cause").value.trim();
      const site = document.getElementById("upd-site").value.trim();
      const distanceM = document.getElementById("upd-distance").value.trim();
      const area = document.getElementById("upd-area").value.trim();
      const etrHour = document.getElementById("upd-etr-hour").value.trim();
      const etrMin = document.getElementById("upd-etr-min").value.trim();
      const subcontractors = Array.from(document.querySelectorAll(".upd-sub:checked")).map((el) => el.value);

      const isStarted = (document.getElementById("upd-clock-status").textContent || "").trim() === "STARTED";
      let headline = `Update#${updateNo}: ขณะนี้เจ้าหน้าที่สามารถเข้าพื้นที่แก้ไขได้แล้ว กำลังเร่งดำเนินการแก้ไข.`;
      if (!isStarted || !modal.dataset.startClockAt) {
        const summaryParts = [`Update#${updateNo}: ตรวจสอบพบ OFC ${ofcType}`];
        if (site && distanceM) {
          const numericDistance = Number(distanceM);
          if (Number.isFinite(numericDistance)) {
            const km = (numericDistance / 1000).toFixed(3);
            summaryParts.push(`มีปัญหาห่างจาก Site ${site} ${km} km`);
          } else {
            summaryParts.push(`มีปัญหาห่างจาก Site ${site}`);
          }
        } else if (site) {
          summaryParts.push(`มีปัญหาที่ Site ${site}`);
        } else {
          summaryParts.push("มีปัญหา");
        }

        if (area) {
          summaryParts.push(`บริเวณ ${area}`);
        }
        if (cause) {
          summaryParts.push(`สาเหตุ ${cause}`);
        }
        headline = `${summaryParts.join(" ")}. กำลังเร่งดำเนินการแก้ไข.`;
      }

      const lines = [headline];
      if (multiOfcSummary.length) {
        lines.push(`OFC : ${multiOfcSummary.join(", ")}`);
      }
      if (etrHour || etrMin) {
        lines.push(`ETR : ${etrHour || "0"}.${String(etrMin || "0").padStart(2, "0")} ชั่วโมง`);
      }
      if (subcontractors.length) {
        lines.push(`Sub Contractor : ${subcontractors.join(", ")}`);
      }
      if (modal.dataset.stopClockAt) {
        const stopClockText = new Date(modal.dataset.stopClockAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false });
        lines.push(`Stop clock : ${stopClockText}`);
        if (modal.dataset.stopReason) {
          lines.push(`เหตุผล Stop : ${modal.dataset.stopReason}`);
        }
      }
      if (modal.dataset.startClockAt) {
        const startClockText = new Date(modal.dataset.startClockAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false });
        lines.push(`Start Clock : ${startClockText}`);
      }
      document.getElementById("upd-message").value = lines.join("\n");
    };

    document.getElementById("btn-save-corrective-update").onclick = async () => {
      const current = Store.getState();
      const attachmentPayload = await buildAttachmentPayload(document.getElementById("upd-camera-input").files, document.getElementById("upd-file-input").files);
      const updatePayload = {
        at: new Date().toISOString(),
        ofcType: document.getElementById("upd-ofc-type").value,
        multiOfcDetails: readMultiOfcFromModalDataset(modal),
        cause: document.getElementById("upd-cause").value,
        originate: document.getElementById("upd-originate").value,
        terminate: document.getElementById("upd-terminate").value,
        site: document.getElementById("upd-site").value,
        distance: document.getElementById("upd-distance").value,
        area: document.getElementById("upd-area").value,
        latlng: document.getElementById("upd-latlng").value,
        subcontractors: Array.from(document.querySelectorAll(".upd-sub:checked")).map((el) => el.value),
        clockStatus: document.getElementById("upd-clock-status").textContent,
        startClockAt: modal.dataset.startClockAt || "",
        stopClockAt: modal.dataset.stopClockAt || "",
        stopReason: modal.dataset.stopReason || document.getElementById("upd-stop-reason").value || "",
        workCase: document.getElementById("upd-workcase").value,
        etrHour: document.getElementById("upd-etr-hour").value,
        etrMin: document.getElementById("upd-etr-min").value,
        message: document.getElementById("upd-message").value,
        attachments: attachmentPayload,
      };

      const nextCorrective = {
        fiber: (current.corrective.fiber || []).map((item) => getIncidentKey(item) === updateIncidentId ? { ...item, updates: [...(item.updates || []), updatePayload], latestUpdateMessage: updatePayload.message } : item),
        equipment: (current.corrective.equipment || []).map((item) => getIncidentKey(item) === updateIncidentId ? { ...item, updates: [...(item.updates || []), updatePayload], latestUpdateMessage: updatePayload.message } : item),
        other: (current.corrective.other || []).map((item) => getIncidentKey(item) === updateIncidentId ? { ...item, updates: [...(item.updates || []), updatePayload], latestUpdateMessage: updatePayload.message } : item),
      };

      LocalDB.saveState({ alerts: current.alerts, corrective: nextCorrective });
      Store.dispatch((state) => ({ ...state, corrective: nextCorrective }));
      closeModal(modal);
      alert("บันทึก Update เรียบร้อย");
    };

    openModal(modal);
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest(".btn-corrective-update");
    if (!target) return;
    openCorrectiveUpdateModal(target.dataset.id);
  });


  function formatDateTimeInput(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function addMinutes(dateInput, minutes) {
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return "";
    d.setMinutes(d.getMinutes() + minutes);
    return d.toISOString();
  }

  function ensureFinishModal() {
    if (document.getElementById("modal-corrective-finish")) return;

    document.body.insertAdjacentHTML("beforeend", `
      <div id="modal-corrective-finish" class="modal-backdrop hidden">
        <div class="bg-white rounded-2xl w-full max-w-6xl p-6 max-h-[92vh] overflow-y-auto">
          <div class="flex items-center justify-between mb-4">
            <h3 id="finish-title" class="text-2xl font-bold text-slate-800">NS Finish</h3>
            <button id="btn-close-finish" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg">ปิด</button>
          </div>

          <div class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="text-sm font-semibold text-slate-700">Incident Number:</label>
                <input id="finish-incident" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              </div>
              <div>
                <label class="text-sm font-semibold text-slate-700">Circuit ID + Customer:</label>
                <input id="finish-circuit" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              </div>
            </div>

            <div class="border rounded-xl p-3 bg-slate-50/60">
              <label class="text-sm font-semibold text-slate-700">Sub Contractor (เลือกได้หลายเจ้า):</label>
              <div class="grid grid-cols-2 md:grid-cols-6 gap-2 mt-2">
                <label class="finish-sub-card"><input type="checkbox" class="finish-sub" value="TAS"> TAS</label>
                <label class="finish-sub-card"><input type="checkbox" class="finish-sub" value="ATG"> ATG</label>
                <label class="finish-sub-card"><input type="checkbox" class="finish-sub" value="NPY"> NPY</label>
                <label class="finish-sub-card"><input type="checkbox" class="finish-sub" value="JJ&A"> JJ&A</label>
                <label class="finish-sub-card"><input type="checkbox" class="finish-sub" value="TP"> TP</label>
                <label class="finish-sub-card"><input type="checkbox" class="finish-sub" value="JL"> JL</label>
              </div>
            </div>

            <div class="border-t pt-3">
              <h4 class="font-bold text-slate-800 mb-2">เวลาต่างๆ</h4>
              <button id="btn-auto-times" class="w-full bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 mb-3">⚡ ตั้งเวลาอัตโนมัติ</button>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><label class="text-sm text-slate-700">Down Time:</label><input id="finish-down-time" type="datetime-local" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"></div>
                <div><label class="text-sm text-slate-700">NOC Alert:</label><input id="finish-noc-alert" type="datetime-local" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"></div>
                <div><label class="text-sm text-slate-700">NS Response:</label><input id="finish-ns-response" type="datetime-local" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"></div>
                <div><label class="text-sm text-slate-700">เรียก Sub:</label><input id="finish-call-sub" type="datetime-local" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"></div>
                <div><label class="text-sm text-slate-700">Sub มาถึง:</label><input id="finish-sub-arrive" type="datetime-local" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"></div>
                <div><label class="text-sm text-slate-700">เริ่มแก้ไข:</label><input id="finish-start-fix" type="datetime-local" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"></div>
                <div><label class="text-sm text-slate-700">Up Time:</label><input id="finish-up-time" type="datetime-local" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"></div>
                <div><label class="text-sm text-slate-700">เก็บหัวต่อ:</label><input id="finish-store-connector" type="datetime-local" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"></div>
              </div>
            </div>

            <div class="border-t pt-3">
              <h4 class="font-bold text-slate-800 mb-2">Stop clock - Start clock</h4>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><label class="text-sm text-slate-700">Stop Clock:</label><input id="finish-stop-clock" type="datetime-local" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"></div>
                <div><label class="text-sm text-slate-700">Start Clock:</label><input id="finish-start-clock" type="datetime-local" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"></div>
              </div>
            </div>

            <div class="border-t pt-3">
              <h4 class="font-bold text-slate-800 mb-2">รายละเอียดงาน</h4>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                  <label class="text-sm text-slate-700">OFC Type:</label>
                  <select id="finish-ofc-type" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"><option value="">เลือกประเภท</option><option>หลายเส้น</option><option>Flat type 2 Core</option><option>4 Core ADSS</option><option>12 Core ADSS</option><option>24 Core ADSS</option><option>48 Core ADSS</option><option>60 Core ADSS</option><option>144 Core ADSS</option><option>216 Core ADSS</option><option>312 Core ADSS</option><option>12 Core Armour</option><option>48 Core Armour</option><option>60 Core Armour</option><option>144 Core Armour</option></select>
                  <div id="finish-multi-ofc-summary-wrap" class="hidden mt-2 p-3 rounded-lg border border-emerald-300 bg-emerald-50">
                    <div class="font-semibold text-slate-800">ข้อมูล OFC ที่เลือก:</div>
                    <div id="finish-multi-ofc-summary" class="text-emerald-800"></div>
                  </div>
                </div>
                <div><label class="text-sm text-slate-700">ระยะห่างจาก Site (เมตร):</label><input id="finish-distance" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2" placeholder="เช่น 90"></div>
                <div><label class="text-sm text-slate-700">ชื่อ Site:</label><input id="finish-site" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2" placeholder="เช่น BTS Tower"></div>
                <div><label class="text-sm text-slate-700">สาเหตุ:</label><select id="finish-cause" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"><option value="">เลือกสาเหตุ</option><option>Animal gnawing</option><option>High loss/Crack</option><option>Cut by Unknown agency</option><option>Cut trees</option><option>Cut by MEA/PEA agency</option><option>Car accident</option><option>Electrical Surge</option><option>Electrical pole was broken by accident</option><option>Electrical pole was broken by Natural Disaster</option><option>Electric Authority remove pole</option><option>Road Construction</option><option>BTS Construction</option><option>Fire damanged</option><option>Natural Disaster</option><option>Equipment at Node</option><option>Equipment at customer</option><option>Bullet</option></select></div>
                <div>
                  <label class="text-sm text-slate-700">บริเวณ:</label>
                  <div class="mt-1 flex gap-2">
                    <input id="finish-area" class="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2" placeholder="เช่น ถ.กัลปพฤกษ์">
                    <button id="btn-finish-map" class="px-3 py-2 bg-red-500 text-white rounded-lg">🗺️ ดึงที่อยู่</button>
                  </div>
                </div>
                <div>
                  <label class="text-sm text-slate-700">พิกัด (Lat, Long):</label>
                  <div class="mt-1 flex gap-2">
                    <input id="finish-latlng" class="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2" placeholder="13.7054778, 100.5026162">
                    <button id="btn-finish-gps" class="px-3 py-2 bg-red-500 text-white rounded-lg">📍 GPS</button>
                  </div>
                </div>
              </div>
            </div>

            <div class="border rounded-xl p-3 bg-slate-100 space-y-3 solution-builder">
              <div class="flex flex-wrap gap-2 items-center">
                <button id="btn-generate-repair" class="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold">🪄 สร้างคำอธิบายอัตโนมัติ</button>
              </div>

              <div id="finish-method-row" class="grid grid-cols-1 md:grid-cols-5 gap-2 items-start">
                <label class="text-sm text-slate-700">วิธีการ:</label>

                <select id="finish-method"
                  class="md:col-span-2 w-full bg-white border border-teal-500 rounded-lg px-3 py-2">
                  <option value="">เลือกวิธีการ</option>
                  <option value="ลากคร่อม">ลากคร่อม</option>
                  <option value="ร่นลูป">ร่นลูป</option>
                  <option value="โยก Core">โยก Core</option>
                  <option value="ตัดต่อใหม่">ตัดต่อใหม่</option>
                  <option value="ค่าเร่งด่วน">ค่าเร่งด่วน</option>
                </select>
              </div>

              <div id="finish-distance-row" class="grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
                <label class="text-sm text-slate-700">ระยะ:</label>
                <input id="finish-method-distance" class="md:col-span-2 w-full bg-white border border-slate-300 rounded-lg px-3 py-2" placeholder="เมตร">
                <span class="text-sm text-slate-700">เมตร</span>
              </div>

              <div id="finish-cut-core-row" class="grid grid-cols-1 md:grid-cols-6 gap-2 items-center">
                <label class="text-sm text-slate-700">ตัดต่อใหม่:</label>
                <input id="finish-cutpoint" class="md:col-span-2 w-full bg-white border border-slate-300 rounded-lg px-3 py-2" placeholder="จุด">
                <label class="text-sm text-slate-700">จุดละ:</label>
                <input id="finish-core-point" class="md:col-span-2 w-full bg-white border border-slate-300 rounded-lg px-3 py-2" placeholder="Core">
              </div>

              <div id="finish-method-yoke" class="hidden border rounded-lg p-3 bg-slate-200 space-y-2">
                <div class="grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
                  <label class="text-sm text-slate-700">จุดที่ 1 (Site/BJ/S/):</label>
                  <input id="finish-site-a" class="md:col-span-4 w-full bg-white border border-slate-300 rounded-lg px-3 py-2" placeholder="ระบุชื่อจุดที่ 1">
                  <label class="text-sm text-slate-700">จุดที่ 2 (Site/BJ/S/):</label>
                  <input id="finish-site-b" class="md:col-span-4 w-full bg-white border border-slate-300 rounded-lg px-3 py-2" placeholder="ระบุชื่อจุดที่ 2">
                </div>
              </div>

              <div id="finish-method-yoke-detail" class="hidden border rounded-xl p-4 bg-teal-50 border-teal-400 space-y-3">
                <div class="font-bold text-teal-900 text-xl">📝 รายละเอียดการโยก Core</div>
                <div class="grid grid-cols-1 md:grid-cols-6 gap-2 items-center">
                  <label class="text-teal-900 font-semibold">จุดที่ 1:</label>
                  <input id="finish-yoke-loc-a" class="md:col-span-2 w-full bg-lime-50 border border-lime-300 rounded-lg px-3 py-2" placeholder="ใส่ชื่อจุดที่ด้านบน...">
                  <label class="text-teal-900 font-semibold">จุดที่ 2:</label>
                  <input id="finish-yoke-loc-b" class="md:col-span-2 w-full bg-lime-50 border border-lime-300 rounded-lg px-3 py-2" placeholder="ใส่ชื่อจุดที่ด้านบน...">
                </div>
                <div id="finish-yoke-circuit-rows" class="space-y-3"></div>
                <button id="btn-add-yoke-circuit" class="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold">+ เพิ่มลูกค้า/Circuit</button>
              </div>

              <div id="finish-urgent-row" class="grid grid-cols-1 md:grid-cols-6 gap-2 items-center">
                <label class="text-sm text-slate-700">ค่าเร่งด่วน:</label>
                <select id="finish-urgent-level" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2"><option>มีค่าเร่งด่วน</option><option>ไม่มีค่าเร่งด่วน</option></select>
                <label class="text-sm text-slate-700">หัวต่อ:</label>
                <input id="finish-head-joint" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2" placeholder="หัว">
                <label class="text-sm text-slate-700">ตัวเลือก:</label>
                <select id="finish-connector-choice" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2"><option>ใช้หัวต่อ</option><option>ไม่ใช้หัวต่อ</option></select>
              </div>
              <div id="finish-multi-repair-wrap" class="hidden border rounded-xl p-4 bg-cyan-50 border-cyan-300 space-y-3">
                <div class="font-bold text-cyan-900">🧩 รายละเอียดการแก้ไขแต่ละเส้น</div>
                <div id="finish-multi-repair-rows" class="space-y-3"></div>
              </div>
              <textarea id="solution" class="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 h-24" placeholder="คำอธิบายจะสร้างอัตโนมัติ หรือใส่ข้อมูลเอง"></textarea>
              <div>
                <label class="text-slate-700">ปรับ/ไม่ปรับ:</label>
                <select id="finish-patch-status" class="mt-1 w-full bg-white border border-slate-300 rounded-xl px-3 py-2"><option>ไม่ปรับ</option><option>ปรับ</option></select>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2 mt-4">
            <button id="btn-cancel-finish" class="px-4 py-2 bg-slate-200 rounded-lg">ยกเลิก</button>
            <button id="btn-save-finish" class="px-4 py-2 bg-indigo-600 text-white rounded-lg">บันทึก</button>
          </div>
        </div>
      </div>
    `);

    const modal = document.getElementById("modal-corrective-finish");
    document.getElementById("btn-close-finish").onclick = () => closeModal(modal);
    document.getElementById("btn-cancel-finish").onclick = () => closeModal(modal);

    document.querySelectorAll(".finish-sub-card").forEach((el) => {
      el.classList.add("flex", "items-center", "gap-2", "px-3", "py-2", "bg-white", "border", "rounded-lg");
    });

    document.getElementById("finish-up-time").addEventListener("change", () => {
      const up = document.getElementById("finish-up-time").value;
      if (!up) return;
      document.getElementById("finish-store-connector").value = formatDateTimeInput(addMinutes(up, 10));
    });

    document.getElementById("finish-method").addEventListener("change", (e) => {
      toggleSolutionFields(e.target.value);
    });
    document.getElementById("btn-add-yoke-circuit").onclick = () => addYokeCircuitRow();

    document.getElementById("btn-finish-map").onclick = () => {
      const q = document.getElementById("finish-latlng").value || document.getElementById("finish-area").value;
      if (!q) return;
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`, "_blank");
    };

    document.getElementById("btn-finish-gps").onclick = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition((pos) => {
        document.getElementById("finish-latlng").value = `${pos.coords.latitude}, ${pos.coords.longitude}`;
      });
    };
    document.getElementById("finish-site-a").addEventListener("input", (event) => {
      document.getElementById("finish-yoke-loc-a").value = event.target.value;
    });
    document.getElementById("finish-site-b").addEventListener("input", (event) => {
      document.getElementById("finish-yoke-loc-b").value = event.target.value;
    });
    document.getElementById("finish-yoke-loc-a").addEventListener("input", (event) => {
      document.getElementById("finish-site-a").value = event.target.value;
    });
    document.getElementById("finish-yoke-loc-b").addEventListener("input", (event) => {
      document.getElementById("finish-site-b").value = event.target.value;
    });

    document.getElementById("finish-ofc-type").addEventListener("change", () => {
      const modalEl = document.getElementById("modal-corrective-finish");
      if (document.getElementById("finish-ofc-type").value !== "หลายเส้น") {
        renderOfcSummaryBox(document.getElementById("finish-multi-ofc-summary"), {});
        document.getElementById("finish-multi-ofc-summary-wrap").classList.add("hidden");
      }
      const details = normalizeMultiOfcData(JSON.parse(modalEl?.dataset?.latestMultiOfc || "{}"));
      renderFinishMultiRepairRows(details, []);
      toggleSolutionFields();
      syncMultiLineYokeSectionState();
    });
  }

  function toggleSolutionFields(selectedMethod = "") {
    const method = selectedMethod || document.getElementById("finish-method").value || "";
    const isYoke = method === "โยก Core";
    const isUrgentOnly = method === "ค่าเร่งด่วน";
    const useDistance = method === "ลากคร่อม" || method === "ร่นลูป";
    const isMultiOfcFinish = document.getElementById("finish-ofc-type")?.value === "หลายเส้น";
    document.getElementById("finish-method-row").classList.toggle("hidden", isMultiOfcFinish);
    document.getElementById("finish-distance-row").classList.toggle("hidden", isMultiOfcFinish || !useDistance);
    document.getElementById("finish-cut-core-row").classList.toggle("hidden", isMultiOfcFinish || isUrgentOnly);
    document.getElementById("finish-method-yoke").classList.toggle("hidden", isMultiOfcFinish || !isYoke);
    document.getElementById("finish-method-yoke-detail").classList.toggle("hidden", isMultiOfcFinish || !isYoke);
    document.getElementById("finish-urgent-row").classList.toggle("hidden", isMultiOfcFinish || isUrgentOnly);


    if (!isMultiOfcFinish && isUrgentOnly && !document.getElementById("solution").value.trim()) {
      document.getElementById("solution").value = "ค่า Stand By เร่งด่วน (เรียกเร่งด่วนเนื่องจาก Interface Down หลังตรวจสอบพบ F/O ปกติ)";
    }
  }
  function syncMultiLineYokeSectionState() {
    if (!window.isUsingMultipleLines) return;
    const hasYokeMethod = (window.selectedOfcLines || []).some((line) => line.method === "โยก Core");
    document.getElementById("finish-method-yoke")?.classList.toggle("hidden", !hasYokeMethod);
    document.getElementById("finish-method-yoke-detail")?.classList.toggle("hidden", !hasYokeMethod);
  }

  function addYokeCircuitRow(data = {}) {
    const container = document.getElementById("finish-yoke-circuit-rows");
    if (!container) return;
    const index = container.querySelectorAll(".finish-yoke-circuit-card").length + 1;
    const card = document.createElement("div");
    card.className = "finish-yoke-circuit-card bg-white border border-slate-300 rounded-lg p-3 space-y-2";
    card.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="font-semibold">ลูกค้า/Circuit ที่ ${index}</div>
        <button type="button" class="px-2 py-1 rounded bg-rose-100 text-rose-700 text-sm">ลบ</button>
      </div>
      <input class="finish-yoke-customer w-full bg-white border border-slate-300 rounded-lg px-3 py-2" placeholder="ชื่อลูกค้า / CID (เช่น ML25574...)" value="${data.customer || ""}">
      <div class="border border-dashed rounded-lg p-2 space-y-2">
        <div class="font-semibold text-teal-900">ข้อมูล ณ จุดที่ 1:</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input class="finish-yoke-a-old bg-white border border-slate-300 rounded-lg px-3 py-2" placeholder="Core เดิม (ต่อ) เช่น 25" value="${data.aOld || ""}">
          <input class="finish-yoke-a-new bg-white border border-slate-300 rounded-lg px-3 py-2" placeholder="Core ใหม่ (ต่อ) เช่น 32" value="${data.aNew || ""}">
        </div>
      </div>
      <div class="border border-dashed rounded-lg p-2 space-y-2">
        <div class="font-semibold text-teal-900">ข้อมูล ณ จุดที่ 2:</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input class="finish-yoke-b-old bg-white border border-slate-300 rounded-lg px-3 py-2" placeholder="Core เดิม (ต่อ) เช่น 25" value="${data.bOld || ""}">
          <input class="finish-yoke-b-new bg-white border border-slate-300 rounded-lg px-3 py-2" placeholder="Core ใหม่ (ต่อ) เช่น 32" value="${data.bNew || ""}">
        </div>
      </div>
    `;
    card.querySelector("button").onclick = () => card.remove();
    container.appendChild(card);
  }
  function populateDepositLineOptions(cardEl, currentLineNo) {
    if (!cardEl) return;
    const lineNoSelect = cardEl.querySelector(".finish-multi-line-deposit-line-no");
    const lineTypeSelect = cardEl.querySelector(".finish-multi-line-deposit-line-type");
    if (!lineNoSelect || !lineTypeSelect) return;

    const candidates = (window.selectedOfcLines || []).filter((line) => Number(line.lineNo) !== Number(currentLineNo));
    lineNoSelect.innerHTML = ['<option value="">เลือกเส้น</option>', ...candidates.map((line) => `<option value="${line.lineNo}">${line.lineNo}</option>`)].join("");
    lineTypeSelect.innerHTML = '<option value="">เลือกประเภท</option>';

    const syncTypeOptions = () => {
      const selectedLineNo = Number(lineNoSelect.value || 0);
      const targetLine = candidates.find((line) => Number(line.lineNo) === selectedLineNo);
      lineTypeSelect.innerHTML = '<option value="">เลือกประเภท</option>';
      if (targetLine) {
        lineTypeSelect.innerHTML += `<option value="${targetLine.type}">${targetLine.type}</option>`;
        lineTypeSelect.value = targetLine.type;
      }
    };

    lineNoSelect.addEventListener("change", syncTypeOptions);
    syncTypeOptions();
  }


  function createMultiLineSolutionInputs(multiOfcDetails = {}, savedRows = []) {
    const container = document.getElementById("finish-multi-repair-rows");
    if (!container) return;


    const savedByLineNo = new Map((savedRows || []).map((item) => [Number(item.lineNo || 0), item]));
    window.selectedOfcLines = buildSelectedLineList(multiOfcDetails).map((line) => {
      const saved = savedByLineNo.get(line.lineNo) || {};
      return {
        ...line,
        method: saved.method || "",
        distance: saved.distance || "",
        cutPoints: saved.cutPoints || saved.cutPoint || "",
        corePerPoint: saved.corePerPoint || saved.corePoint || "",
        connectors: saved.connectors || saved.headJoint || "",
        useConnectors: saved.useConnectors || saved.connectorChoice || "ไม่ใช้หัวต่อ",
        depositToLine: saved.depositToLine || saved.depositLine || "",
        depositCore: saved.depositCore || saved.depositCoreFrom || "",
        depositTargetCore: saved.depositTargetCore || saved.depositCoreTo || "",
        note: saved.note || "",
      };
    });
    container.innerHTML = (window.selectedOfcLines || []).map((line) => {
      const isDepositCore = line.method === "ฝาก Core";
      const useDistance = line.method === "ลากคร่อม" || line.method === "ร่นลูป";

      return `
        <div class="bg-white border border-cyan-200 rounded-lg p-3 space-y-2" data-line-no="${line.lineNo}">
          <div class="font-semibold text-slate-800">เส้นที่ ${line.lineNo}: ${line.type}</div>

          <div class="grid grid-cols-1 md:grid-cols-6 gap-2 items-center">
            <select class="finish-multi-line-method md:col-span-2 bg-white border border-slate-300 rounded-lg px-3 py-2">
              <option value="">เลือกวิธีการ</option>
              <option value="ลากคร่อม" ${line.method === "ลากคร่อม" ? "selected" : ""}>ลากคร่อม</option>
              <option value="ร่นลูป" ${line.method === "ร่นลูป" ? "selected" : ""}>ร่นลูป</option>
              <option value="โยก Core" ${line.method === "โยก Core" ? "selected" : ""}>โยก Core</option>
              <option value="ตัดต่อใหม่" ${line.method === "ตัดต่อใหม่" ? "selected" : ""}>ตัดต่อใหม่</option>
              <option value="ฝาก Core" ${line.method === "ฝาก Core" ? "selected" : ""}>ฝาก Core</option>
            </select>
            <input class="finish-multi-line-distance finish-multi-line-distance-wrap md:col-span-1 bg-white border border-slate-300 rounded-lg px-3 py-2 ${(!useDistance || isDepositCore) ? "hidden" : ""}" placeholder="ระยะ (เมตร)" value="${line.distance || ""}">
            <input class="finish-multi-line-cutpoint finish-multi-line-cutpoint-wrap md:col-span-1 bg-white border border-slate-300 rounded-lg px-3 py-2 ${isDepositCore ? "hidden" : ""}" placeholder="ตัดต่อ (จุด)" value="${line.cutPoints || ""}">
            <input class="finish-multi-line-corepoint finish-multi-line-corepoint-wrap md:col-span-1 bg-white border border-slate-300 rounded-lg px-3 py-2 ${isDepositCore ? "hidden" : ""}" placeholder="จุดละ (Core)" value="${line.corePerPoint || ""}">
            <input class="finish-multi-line-head finish-multi-line-head-wrap md:col-span-1 bg-white border border-slate-300 rounded-lg px-3 py-2 ${isDepositCore ? "hidden" : ""}" placeholder="หัวต่อ" value="${line.connectors || ""}">
            <select class="finish-multi-line-connector finish-multi-line-connector-wrap md:col-span-2 bg-white border border-slate-300 rounded-lg px-3 py-2 ${isDepositCore ? "hidden" : ""}">
              <option value="ใช้หัวต่อ" ${line.useConnectors === "ใช้หัวต่อ" ? "selected" : ""}>ใช้หัวต่อ</option>
              <option value="ไม่ใช้หัวต่อ" ${line.useConnectors !== "ใช้หัวต่อ" ? "selected" : ""}>ไม่ใช้หัวต่อ</option>
            </select>



          </div>

          <div class="finish-multi-line-deposit-fields ${isDepositCore ? "" : "hidden"}">
           <div class="flex flex-wrap items-center gap-2">
              <label class="text-sm text-slate-700">เส้นที่ฝาก:</label>
              <span class="text-sm text-slate-700">เส้นที่</span>
              <select class="finish-multi-line-deposit-line-no bg-white border border-slate-300 rounded-lg px-3 py-2"></select>
              <span class="text-sm text-slate-700">:</span>
              <select class="finish-multi-line-deposit-line-type bg-white border border-slate-300 rounded-lg px-3 py-2"></select>
              <span class="text-sm text-slate-700 ml-2">Core:</span>
              <input class="finish-multi-line-deposit-core-from bg-white border border-slate-300 rounded-lg px-3 py-2 w-32" placeholder="เช่น 1-12" value="${line.depositCore || ""}">
              <span class="text-sm text-slate-700">กับ Core:</span>
              <input class="finish-multi-line-deposit-core-to bg-white border border-slate-300 rounded-lg px-3 py-2 w-32" placeholder="เช่น 132-144" value="${line.depositTargetCore || ""}">
            </div>
          </div>

          <input class="finish-multi-line-note w-full bg-white border border-slate-300 rounded-lg px-3 py-2" placeholder="หมายเหตุเพิ่มเติม" value="${line.note || ""}">

        </div>
      `;
    }).join("");

    const updateLineValue = (lineNo, key, value) => {
      const target = (window.selectedOfcLines || []).find((line) => Number(line.lineNo) === Number(lineNo));
      if (!target) return;
      target[key] = String(value || "").trim();
    };

    container.querySelectorAll("#finish-multi-repair-rows > div").forEach((card) => {
      const lineNo = Number(card.dataset.lineNo || 0);
      const methodEl = card.querySelector(".finish-multi-line-method");
      const distanceEl = card.querySelector(".finish-multi-line-distance");
      const cutPointEl = card.querySelector(".finish-multi-line-cutpoint");
      const corePointEl = card.querySelector(".finish-multi-line-corepoint");
      const headEl = card.querySelector(".finish-multi-line-head");
      const connectorEl = card.querySelector(".finish-multi-line-connector");
      const depositLineNoEl = card.querySelector(".finish-multi-line-deposit-line-no");
      const depositCoreFromEl = card.querySelector(".finish-multi-line-deposit-core-from");
      const depositCoreToEl = card.querySelector(".finish-multi-line-deposit-core-to");
      const noteEl = card.querySelector(".finish-multi-line-note");
      const toggleMethodFields = () => {
        const method = methodEl?.value || "";
        const isDepositCore = method === "ฝาก Core";
        const useDistance = method === "ลากคร่อม" || method === "ร่นลูป";

        card.querySelector(".finish-multi-line-deposit-fields")?.classList.toggle("hidden", !isDepositCore);
        card.querySelector(".finish-multi-line-distance-wrap")?.classList.toggle("hidden", !useDistance || isDepositCore);
        card.querySelector(".finish-multi-line-cutpoint-wrap")?.classList.toggle("hidden", isDepositCore);
        card.querySelector(".finish-multi-line-corepoint-wrap")?.classList.toggle("hidden", isDepositCore);
        card.querySelector(".finish-multi-line-head-wrap")?.classList.toggle("hidden", isDepositCore);
        card.querySelector(".finish-multi-line-connector-wrap")?.classList.toggle("hidden", isDepositCore);

        if (!useDistance || isDepositCore) {
          if (distanceEl) distanceEl.value = "";
          updateLineValue(lineNo, "distance", "");
        }
      };


      populateDepositLineOptions(card, lineNo);
      const savedTarget = (window.selectedOfcLines || []).find((line) => line.lineNo === lineNo)?.depositToLine || "";
      const savedNoMatch = String(savedTarget).match(/^เส้นที่\s*(\d+)/);
      if (savedNoMatch && depositLineNoEl) {
        depositLineNoEl.value = savedNoMatch[1];
        depositLineNoEl.dispatchEvent(new Event("change"));
      }

      methodEl?.addEventListener("change", () => {
        updateLineValue(lineNo, "method", methodEl.value);
        toggleMethodFields();
        syncMultiLineYokeSectionState();


      });

      distanceEl?.addEventListener("input", () => updateLineValue(lineNo, "distance", distanceEl.value));
      cutPointEl?.addEventListener("input", () => updateLineValue(lineNo, "cutPoints", cutPointEl.value));
      corePointEl?.addEventListener("input", () => updateLineValue(lineNo, "corePerPoint", corePointEl.value));
      headEl?.addEventListener("input", () => updateLineValue(lineNo, "connectors", headEl.value));
      connectorEl?.addEventListener("change", () => updateLineValue(lineNo, "useConnectors", connectorEl.value));
      noteEl?.addEventListener("input", () => updateLineValue(lineNo, "note", noteEl.value));
      depositLineNoEl?.addEventListener("change", () => {
        const targetLine = (window.selectedOfcLines || []).find((line) => Number(line.lineNo) === Number(depositLineNoEl.value || 0));
        updateLineValue(lineNo, "depositToLine", targetLine ? `เส้นที่ ${targetLine.lineNo}: ${targetLine.type}` : "");
      });
      depositCoreFromEl?.addEventListener("input", () => updateLineValue(lineNo, "depositCore", depositCoreFromEl.value));
      depositCoreToEl?.addEventListener("input", () => updateLineValue(lineNo, "depositTargetCore", depositCoreToEl.value));

      toggleMethodFields();

    });
      syncMultiLineYokeSectionState();
  }

  function renderFinishMultiRepairRows(multiOfcDetails = {}, savedRows = []) {
    const wrap = document.getElementById("finish-multi-repair-wrap");
    const container = document.getElementById("finish-multi-repair-rows");
    if (!wrap || !container) return;
    window.ofcMultipleLinesData = normalizeMultiOfcData(multiOfcDetails);
    window.isUsingMultipleLines = document.getElementById("finish-ofc-type")?.value === "หลายเส้น";

    if (!Object.keys(window.ofcMultipleLinesData).length || !window.isUsingMultipleLines) {
      wrap.classList.add("hidden");
      container.innerHTML = "";
      window.selectedOfcLines = [];
      return;
    }

    createMultiLineSolutionInputs(window.ofcMultipleLinesData, savedRows);
    wrap.classList.remove("hidden");
    syncMultiLineYokeSectionState();
  }

  function collectFinishMultiRepairDetails() {
    return (window.selectedOfcLines || []).map((line) => ({
      lineNo: line.lineNo,
      ofcType: line.type,
      quantity: 1,
      coreCount: line.coreCount,
      method: line.method || "",
      distance: line.distance || "",
      cutPoint: line.cutPoints || "",
      corePoint: line.corePerPoint || "",
      headJoint: line.connectors || "",
      connectorChoice: line.useConnectors || "ไม่ใช้หัวต่อ",
      depositLine: line.depositToLine || "",
      depositCoreFrom: line.depositCore || "",
      depositCoreTo: line.depositTargetCore || "",
      note: line.note || "",

    })).filter((item) => item.ofcType);
  }
  function buildMultiLineSolution(lines = window.selectedOfcLines || []) {
    const clean = (value) => String(value || "").trim();

    const details = lines.map((line) => {
      const method = clean(line.method);
      const parts = [];
      if (method === "ฝาก Core") {
        const toLine = clean(line.depositToLine) || "-";
        const coreFrom = clean(line.depositCore) || "-";
        const coreTo = clean(line.depositTargetCore) || "-";
        parts.push(`ฝาก Core ${coreFrom} กับ ${toLine} Core ${coreTo}`);
      } else if (method === "ตัดต่อใหม่") {
        parts.push(`ตัดต่อใหม่ ${clean(line.cutPoints) || "-"} จุด จุดละ ${clean(line.corePerPoint) || line.coreCount || "-"} Core`);
      } else if (method === "โยก Core") {
        parts.push(buildYokeCoreText().split("\n")[0]);

      } else if (method) {
        parts.push(method);
        if (clean(line.distance)) {
          parts.push(`${clean(line.distance)} เมตร`);
        }
      }

      const shouldUseConnector = clean(line.useConnectors) === "ใช้หัวต่อ";
      if (shouldUseConnector && clean(line.connectors)) {
        parts.push(`ใช้หัวต่อ ${clean(line.connectors)} หัว`);
      }

      const uniqueParts = [...new Set(parts.map((part) => clean(part)).filter(Boolean))];
      const note = clean(line.note);
      return `เส้นที่ ${line.lineNo}: ${line.type} ${uniqueParts.join(" ")}${note ? ` (${note})` : ""}`.trim();
    }).filter(Boolean);

    return details.join("\n").trim();
  }
  function buildYokeCoreText() {
    const locA = document.getElementById("finish-site-a").value || document.getElementById("finish-yoke-loc-a").value || "-";
    const locB = document.getElementById("finish-site-b").value || document.getElementById("finish-yoke-loc-b").value || "-";
    const cards = Array.from(document.querySelectorAll(".finish-yoke-circuit-card"));
    const lines = cards.map((card, idx) => {
      const customer = card.querySelector(".finish-yoke-customer")?.value || "-";
      const aOld = card.querySelector(".finish-yoke-a-old")?.value || "-";
      const aNew = card.querySelector(".finish-yoke-a-new")?.value || "-";
      const bOld = card.querySelector(".finish-yoke-b-old")?.value || "-";
      const bNew = card.querySelector(".finish-yoke-b-new")?.value || "-";
      return `${idx + 1}) ${customer} | จุด1: ${aOld}->${aNew} | จุด2: ${bOld}->${bNew}`;
    });
    return [`โยก Core ${locA} ไป ${locB}`, ...lines].join("\n").trim();
  }


  function buildSolution() {
    const multiRepairDetails = collectFinishMultiRepairDetails();
    if (document.getElementById("finish-ofc-type").value === "หลายเส้น" && multiRepairDetails.length) {
      document.getElementById("solution").value = buildMultiLineSolution(window.selectedOfcLines);
      return;
    }

    const method = document.getElementById("finish-method").value || "";
    const distance = document.getElementById("finish-method-distance").value || "-";
    const cutPoint = document.getElementById("finish-cutpoint").value || "-";
    const corePoint = document.getElementById("finish-core-point").value || "-";
    const urgentLevel = document.getElementById("finish-urgent-level").value || "มีค่าเร่งด่วน";
    const headJoint = document.getElementById("finish-head-joint").value || "";
    const connectorChoice = document.getElementById("finish-connector-choice").value || "ไม่ใช้หัวต่อ";

    const connectorText = connectorChoice === "ใช้หัวต่อ"
      ? ` ใช้หัวต่อ ${headJoint || "-"} หัว`
      : " ไม่ใช้หัวต่อ";

    let result = "";
    if (method === "ลากคร่อม" || method === "ร่นลูป") {
      result = `${method} ${distance} เมตร${connectorText}`;
    } else if (method === "ตัดต่อใหม่") {
      result = `ตัดต่อใหม่ ${cutPoint} จุด จุดละ ${corePoint} Core${connectorText}`;
    } else if (method === "โยก Core") {
      result = buildYokeCoreText();
    } else if (method === "ค่าเร่งด่วน") {
      result = "ค่า Stand By เร่งด่วน (เรียกเร่งด่วนเนื่องจาก Interface Down หลังตรวจสอบพบ F/O ปกติ)";
    }

    if (!result && urgentLevel) {
      result = urgentLevel;
    }

    if (result) {
      document.getElementById("solution").value = result;
    }
  }

  function collectYokeCircuitList() {
    return Array.from(document.querySelectorAll(".finish-yoke-circuit-card")).map((card, idx) => {
      const customer = card.querySelector(".finish-yoke-customer")?.value || "-";
      const aOld = card.querySelector(".finish-yoke-a-old")?.value || "-";
      const aNew = card.querySelector(".finish-yoke-a-new")?.value || "-";
      const bOld = card.querySelector(".finish-yoke-b-old")?.value || "-";
      const bNew = card.querySelector(".finish-yoke-b-new")?.value || "-";
      return `${idx + 1}) ${customer} | จุด1: ${aOld}->${aNew} | จุด2: ${bOld}->${bNew}`;
    }).join("\n")
  }

  function openCorrectiveFinishModal(incidentId) {
    const found = getCorrectiveIncidentById(incidentId);
    if (!found) return;
    if (found.tab === "equipment") {
      openEquipmentFinishModal(incidentId);
      return;
    }
    const { incident, tab } = found;
    ensureFinishModal();
    const modal = document.getElementById("modal-corrective-finish");
    document.getElementById("finish-title").textContent = `NS Finish (${incident.incidentId})`;

    const latestUpdate = (incident.updates || [])[incident.updates.length - 1] || {};
    const firstTicket = (incident.tickets || [])[0] || {};

    document.getElementById("finish-incident").value = incident.incidentId || "";
    document.getElementById("finish-circuit").value = `${firstTicket.cid || ""} ${firstTicket.port || ""}`.trim();

    document.getElementById("finish-ofc-type").value = latestUpdate.ofcType || "";
    const latestMultiOfc = normalizeMultiOfcData(latestUpdate.multiOfcDetails || {});
    modal.dataset.latestMultiOfc = JSON.stringify(latestMultiOfc);
    const savedMultiRepair = incident.nsFinish?.details?.multiRepairDetails || [];
    renderOfcSummaryBox(document.getElementById("finish-multi-ofc-summary"), latestMultiOfc);
    renderFinishMultiRepairRows(latestMultiOfc, savedMultiRepair);
    document.getElementById("finish-multi-ofc-summary-wrap").classList.toggle(
      "hidden",
      !(document.getElementById("finish-ofc-type").value === "หลายเส้น" && summarizeMultiOfcData(latestMultiOfc).length)
    );
    document.getElementById("finish-distance").value = latestUpdate.distance || "";
    document.getElementById("finish-site").value = latestUpdate.site || "";
    document.getElementById("finish-cause").value = latestUpdate.cause || "";
    document.getElementById("finish-area").value = latestUpdate.area || "";
    document.getElementById("finish-latlng").value = latestUpdate.latlng || "";
    document.getElementById("finish-stop-clock").value = formatDateTimeInput(latestUpdate.stopClockAt);
    document.getElementById("finish-start-clock").value = formatDateTimeInput(latestUpdate.startClockAt);

    document.getElementById("finish-method").value = latestUpdate.workCase || "";
    document.getElementById("finish-method").dispatchEvent(new Event("change"));
    document.getElementById("finish-method-distance").value = "";
    document.getElementById("finish-cutpoint").value = "";
    document.getElementById("finish-core-point").value = "";
    document.getElementById("finish-site-a").value = "";
    document.getElementById("finish-site-b").value = "";
    document.getElementById("solution").value = "";
    document.getElementById("finish-head-joint").value = "";
    document.getElementById("finish-yoke-loc-a").value = latestUpdate.siteA || "";
    document.getElementById("finish-yoke-loc-b").value = latestUpdate.siteB || "";
    document.getElementById("finish-yoke-circuit-rows").innerHTML = "";
    const savedCircuits = String(latestUpdate.circuitList || "").split("\n").map((line) => line.trim()).filter(Boolean);
    if (savedCircuits.length) {
      savedCircuits.forEach((line) => addYokeCircuitRow({ customer: line }));
    }
    toggleSolutionFields(document.getElementById("finish-method").value);
    syncMultiLineYokeSectionState();
    document.querySelectorAll(".finish-sub").forEach((el) => {
      el.checked = (latestUpdate.subcontractors || []).includes(el.value);
    });

    const down = firstTicket.downTime || incident.downTime || incident.createdAt;
    const noc = incident.createdAt || down;
    const responseAt = incident.respondedAt || incident.createdAt;

    function fillAutoTimes() {
      const callSub = addMinutes(responseAt, 5);
      const subArrive = addMinutes(callSub, 60);
      const startFix = addMinutes(subArrive, 10);

      document.getElementById("finish-down-time").value = formatDateTimeInput(down);
      document.getElementById("finish-noc-alert").value = formatDateTimeInput(noc);
      document.getElementById("finish-ns-response").value = formatDateTimeInput(responseAt);
      document.getElementById("finish-call-sub").value = formatDateTimeInput(callSub);
      document.getElementById("finish-sub-arrive").value = formatDateTimeInput(subArrive);
      document.getElementById("finish-start-fix").value = formatDateTimeInput(startFix);
    }

    fillAutoTimes();
    document.getElementById("btn-auto-times").onclick = fillAutoTimes;
    document.getElementById("btn-generate-repair").onclick = buildSolution;

    document.getElementById("btn-save-finish").onclick = () => {
      const current = Store.getState();
      const payload = {
        incidentNumber: document.getElementById("finish-incident").value,
        circuitCustomer: document.getElementById("finish-circuit").value,
        subcontractors: Array.from(document.querySelectorAll(".finish-sub:checked")).map((el) => el.value),
        times: {
          downTime: document.getElementById("finish-down-time").value,
          nocAlert: document.getElementById("finish-noc-alert").value,
          nsResponse: document.getElementById("finish-ns-response").value,
          callSub: document.getElementById("finish-call-sub").value,
          subArrive: document.getElementById("finish-sub-arrive").value,
          startFix: document.getElementById("finish-start-fix").value,
          upTime: document.getElementById("finish-up-time").value,
          storeConnector: document.getElementById("finish-store-connector").value,
          stopClock: document.getElementById("finish-stop-clock").value,
          startClock: document.getElementById("finish-start-clock").value,
        },
        details: {
          ofcType: document.getElementById("finish-ofc-type").value,
          multiOfcDetails: latestMultiOfc,
          distance: document.getElementById("finish-distance").value,
          site: document.getElementById("finish-site").value,
          cause: document.getElementById("finish-cause").value,
          area: document.getElementById("finish-area").value,
          latlng: document.getElementById("finish-latlng").value,
          method: document.getElementById("finish-method").value,
          methodDistance: document.getElementById("finish-method-distance").value,
          cutPoint: document.getElementById("finish-cutpoint").value,
          corePoint: document.getElementById("finish-core-point").value,
          siteA: document.getElementById("finish-site-a").value,
          siteB: document.getElementById("finish-site-b").value,
          circuitList: collectYokeCircuitList(),
          urgentLevel: document.getElementById("finish-urgent-level").value,
          headJoint: document.getElementById("finish-head-joint").value,
          connectorChoice: document.getElementById("finish-connector-choice").value,
          repairText: document.getElementById("solution").value,
          multiRepairDetails: collectFinishMultiRepairDetails(),
          patchStatus: document.getElementById("finish-patch-status").value,
        },
      };

      const nextCorrective = { ...current.corrective };
      nextCorrective[tab] = (nextCorrective[tab] || []).map((item) =>
        getIncidentKey(item) === incidentId ? { ...item, nsFinish: payload, status: "COMPLETE", completedAt: new Date().toISOString() } : item
      );

      LocalDB.saveState({ alerts: current.alerts, corrective: nextCorrective });
      Store.dispatch((state) => ({ ...state, corrective: nextCorrective }));
      closeModal(modal);
      alert("บันทึก NS Finish เรียบร้อย");
    };

    openModal(modal);
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest(".btn-corrective-finish");
    if (!target) return;
    openCorrectiveFinishModal(target.dataset.id);
  });

  document.addEventListener("click", (event) => {
    const target = event.target.closest(".btn-corrective-edit-type");
    if (!target) return;
    openEditWorkTypeModal(target.dataset.id);
  });

  document.addEventListener("click", (event) => {
    const target = event.target.closest(".btn-corrective-detail");
    if (!target) return;
    openCorrectiveDetailModal(target.dataset.id);
  });

  document.addEventListener("click", (event) => {
    const target = event.target.closest(".btn-corrective-cancel");
    if (!target) return;

    const incidentId = target.dataset.id;
    if (!incidentId) return;

    const current = Store.getState();
    const cancelAt = new Date().toISOString();
    const reason = "Cancelled from corrective queue";

    const nextCorrective = {
      fiber: (current.corrective.fiber || []).map((item) =>
        getIncidentKey(item) === incidentId
          ? { ...item, previousStatus: item.status, status: "CANCELLED", cancelReason: reason, cancelledAt: cancelAt }
          : item
      ),
      equipment: (current.corrective.equipment || []).map((item) =>
        getIncidentKey(item) === incidentId
          ? { ...item, previousStatus: item.status, status: "CANCELLED", cancelReason: reason, cancelledAt: cancelAt }
          : item
      ),
      other: (current.corrective.other || []).map((item) =>
        getIncidentKey(item) === incidentId
          ? { ...item, previousStatus: item.status, status: "CANCELLED", cancelReason: reason, cancelledAt: cancelAt }
          : item
      ),
    };

    LocalDB.saveState({ alerts: current.alerts, corrective: nextCorrective, calendarEvents: current.calendarEvents });
    Store.dispatch((state) => ({ ...state, corrective: nextCorrective }));
  });
  document.addEventListener("click", (event) => {
    const restoreButton = event.target.closest("[data-recycle-restore]");
    if (restoreButton) {
      restoreRecycleItem(restoreButton.dataset.recycleRestore);
      return;
    }

    if (event.target.id === "btn-clear-recycle") {
      clearRecycleBin();
    }
  });

  // ===== INITIAL LOAD =====
  (async function init() {
      try {
      await firebaseReady;
    } catch (error) {
      console.warn("Firebase init failed, fallback to local data only:", error);
    }
    const persistedState = await LocalDB.syncFromCloud();
    Store.dispatch((state) => ({
      ...state,
      alerts: persistedState.alerts || [],
      corrective: persistedState.corrective || { fiber: [], equipment: [], other: [] },
      calendarEvents: persistedState.calendarEvents || [],
    }));

    await AlertService.loadFromLocal();

    const refreshAlerts = async () => {
      try {
        await AlertService.loadFromLocal();
      } catch (error) {
        console.warn("Auto refresh alerts failed:", error);
      }
    };

    setInterval(refreshAlerts, 30000);
    window.addEventListener("focus", refreshAlerts);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        refreshAlerts();
      }
    });
    // await AlertService.loadFromEmail();
  })();
})();