// === MODULE SETUP (use globals from script tags, with safe fallbacks) ===
const finishLocalIncidentFlow = window.finishIncident || function () { console.warn("finishIncident not available"); };
const upsertActiveIncident = (window.IncidentServiceLocal && window.IncidentServiceLocal.upsertActiveIncident) || function () { console.warn("upsertActiveIncident not available"); };

// Firebase init — safe, uses FirebaseSync global set by firebase.service.js script tag  
function initFirebase() {
  if (window.FirebaseSync) return Promise.resolve({ app: null, db: null, analytics: null });
  // Try dynamic import as backup
  return import("./services/firebase.service.js")
    .then(mod => mod.initFirebase ? mod.initFirebase() : null)
    .catch(e => { console.warn("Firebase init skipped:", e); return null; });
}

const firebaseReady = initFirebase();


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
// ===== CORE UI HELPERS =====
/**
 * Performs an atomic DOM update to prevent flickering.
 * Handles table elements correctly by using specific wrappers.
 */
function atomicHTMLUpdate(container, html) {
  if (!container) return;
  const isTableContent = /^\s*<tr|^\s*<td|^\s*<tbody|^\s*<thead/.test(html);

  if (isTableContent) {
    // Use a template for table fragments to preserve structural tags
    const template = document.createElement('template');
    template.innerHTML = html;
    container.replaceChildren(...template.content.childNodes);
  } else {
    const temp = document.createElement("div");
    temp.innerHTML = html;
    container.replaceChildren(...temp.childNodes);
  }

  if (window.lucide) lucide.createIcons();
}

function getIncidentKey(item) {
  return item?.incident || item?.incidentId || item?.id || "";
}
function normalizeSheetText(value = "") {
  return String(value || "").trim().toLowerCase();
}

function inferSlaHoursFromName(name = "") {
  const text = String(name || "");
  const match = text.match(/(\d+)\s*hrs?/i) || text.match(/(\d+)\s*hr/i);
  return match ? Number(match[1]) : 3;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function resolveRowValue(row, candidates = []) {
  const rowEntries = Object.entries(row || {});
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeSheetText(candidate).replaceAll("_", " ");
    const exact = rowEntries.find(([key]) => normalizeSheetText(key).replaceAll("_", " ") === normalizedCandidate);
    if (exact) return exact[1];
  }

  for (const [key, value] of rowEntries) {
    const normalizedKey = normalizeSheetText(key).replaceAll("_", " ");
    if (candidates.some((candidate) => normalizedKey.includes(normalizeSheetText(candidate).replaceAll("_", " ")))) {
      return value;
    }
  }
  return "";
}
function pickRowValue(row = {}, candidates = []) {
  for (const key of candidates) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") return row[key];
  }
  return resolveRowValue(row, candidates);
}
function normalizeNodesForLocalFlow(incident) {
  const finishDetails = incident?.nsFinish?.details || {};
  const finishTimes = incident?.nsFinish?.times || {};
  const subContractors = Array.isArray(incident?.nsFinish?.subcontractors) ? incident.nsFinish.subcontractors : [];
  const explicitNodes = Array.isArray(incident?.nodes)
    ? incident.nodes
      .map((item) => ({
        node: item?.node || item?.name || "",
        alarm: item?.alarm || incident?.alarm || "Unknown",
        symphonyTicket: item?.symphonyTicket || item?.ticket || "",
        cid: item?.cid || "",
        startTime: item?.startTime || item?.downTime || incident?.createdAt || "",
        responseTime: item?.responseTime || incident?.respondedAt || incident?.timeline?.respondedAt || finishTimes.nsResponse || null,
        detail: item?.detail || finishDetails.repairText || "",
        causeOfIncident: item?.causeOfIncident || finishDetails.cause || "",
        hopRoad: item?.hopRoad || finishDetails.area || "",
        latLong: item?.latLong || finishDetails.latlng || "",
        subContractors,
        delayBy: item?.delayBy || finishDetails.delayBy || incident?.delayReason || "",
        customerTrunk: item?.customerTrunk || finishDetails.customerTrunk || incident?.customerTrunk || "",
        controlStatus: item?.controlStatus || finishDetails.controlStatus || "",
        team: item?.team || finishDetails.team || "",
        mainCause: item?.mainCause || finishDetails.mainCause || "",
        rootCauseFromSymc: item?.rootCauseFromSymc || finishDetails.rootCauseFromSymc || "",
        rootCauseFromSub: item?.rootCauseFromSub || finishDetails.rootCauseFromSub || "",
        rootCauseFromCustomer: item?.rootCauseFromCustomer || finishDetails.rootCauseFromCustomer || "",
        rootCauseFromUncontrol: item?.rootCauseFromUncontrol || finishDetails.rootCauseFromUncontrol || "",
        prevention: item?.prevention || finishDetails.prevention || "",

      }))
      .filter((item) => item.node)
    : [];
  const ticketNodes = Array.isArray(incident?.tickets)
    ? incident.tickets
      .map((ticket, index) => ({
        node: ticket?.node || incident?.node || incident?.region || `Node_${index + 1}`,
        alarm: ticket?.alarm || incident?.alarm || "Unknown",
        symphonyTicket: ticket?.symphonyTicket || ticket?.ticket || "",
        cid: ticket?.cid || "",
        startTime: ticket?.downTime || incident?.createdAt || finishTimes.downTime || "",
        responseTime: incident?.respondedAt || incident?.timeline?.respondedAt || finishTimes.nsResponse || null,
        detail: finishDetails.repairText || "",
        causeOfIncident: finishDetails.cause || "",
        hopRoad: finishDetails.area || "",
        latLong: finishDetails.latlng || "",
        subContractors,
        delayBy: ticket?.delayBy || finishDetails.delayBy || incident?.delayReason || "",
        customerTrunk: ticket?.customerTrunk || incident?.customerTrunk || incident?.customerTrunk || "",
        controlStatus: ticket?.controlStatus || finishDetails.controlStatus || "",
        team: ticket?.team || finishDetails.team || "",
        mainCause: ticket?.mainCause || finishDetails.mainCause || "",
        rootCauseFromSymc: ticket?.rootCauseFromSymc || finishDetails.rootCauseFromSymc || "",
        rootCauseFromSub: ticket?.rootCauseFromSub || finishDetails.rootCauseFromSub || "",
        rootCauseFromCustomer: ticket?.rootCauseFromCustomer || finishDetails.rootCauseFromCustomer || "",
        rootCauseFromUncontrol: ticket?.rootCauseFromUncontrol || finishDetails.rootCauseFromUncontrol || "",
        prevention: ticket?.prevention || finishDetails.prevention || "",
      }))
      .filter((item) => item.node)
    : [];

  if (ticketNodes.length) return ticketNodes;
  if (explicitNodes.length) return explicitNodes;

  const fallbackNode = incident?.node || incident?.region || "Unknown_Node";
  return [
    {
      node: fallbackNode,
      alarm: incident?.alarm || "Unknown",
      symphonyTicket: "",
      cid: "",
      startTime: incident?.createdAt || incident?.openedAt || incident?.timeline?.openedAt || incident?.tickets?.[0]?.downTime || new Date().toISOString(),
      responseTime: incident?.respondedAt || incident?.timeline?.respondedAt || finishTimes.nsResponse || null,
      detail: finishDetails.repairText || "",
      causeOfIncident: finishDetails.cause || "",
      hopRoad: finishDetails.area || "",
      latLong: finishDetails.latlng || "",
      subContractors,
      delayBy: finishDetails.delayBy || incident?.delayReason || "",
      customerTrunk: finishDetails.customerTrunk || incident?.customerTrunk || "",
      controlStatus: finishDetails.controlStatus || "",
      team: finishDetails.team || "",
      mainCause: finishDetails.mainCause || "",
      rootCauseFromSymc: finishDetails.rootCauseFromSymc || "",
      rootCauseFromSub: finishDetails.rootCauseFromSub || "",
      rootCauseFromCustomer: finishDetails.rootCauseFromCustomer || "",
      rootCauseFromUncontrol: finishDetails.rootCauseFromUncontrol || "",
      prevention: finishDetails.prevention || "",
    },
  ];
}

function syncIncidentToLocalFlowActive(incident) {
  const incidentNumber = getIncidentKey(incident);
  if (!incidentNumber) return;

  const activePayload = {
    incidentNumber,
    startTime: incident?.createdAt || incident?.openedAt || incident?.timeline?.openedAt || incident?.tickets?.[0]?.downTime || new Date().toISOString(),
    responseTime: incident?.respondedAt || incident?.timeline?.respondedAt || null,
    nodes: normalizeNodesForLocalFlow(incident),
  };

  upsertActiveIncident(activePayload);
}

function applyFinishToLocalFlow(incident) {
  const incidentNumber = getIncidentKey(incident);
  if (!incidentNumber) return;
  try {
    syncIncidentToLocalFlowActive(incident);
    finishLocalIncidentFlow(incidentNumber);
  } catch (error) {
    console.warn("Local finish flow skipped due to invalid payload:", error);
  }
}
function toMonthShort(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-US", { month: "short" });
}

function toWeekOfMonthLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstDayOffset = firstDay.getDay();
  const weekIndex = Math.ceil((date.getDate() + firstDayOffset) / 7);
  return `W${Math.max(1, weekIndex)}`;
}

function minutesBetween(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "-";
  return `${Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))} min`;
}

function toPeriodHoursLabel(downtimeMinutes) {
  const mins = Number(downtimeMinutes);
  if (!Number.isFinite(mins) || mins <= 0) return "0 Hrs.";
  const hours = Math.max(1, Math.floor(mins / 60));
  return `${hours} Hrs.`;
}


function excelSerialToDate(serial) {
  const value = Number(serial);
  if (!Number.isFinite(value)) return null;
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + value * 86400000);
}

function parseDateValue(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    const d = excelSerialToDate(value);
    return d && !Number.isNaN(d.getTime()) ? d : null;
  }
  const text = String(value).trim();
  if (!text) return null;
  const asNumber = Number(text);
  if (Number.isFinite(asNumber) && /^\d+(\.\d+)?$/.test(text)) {
    const d = excelSerialToDate(asNumber);
    if (d && !Number.isNaN(d.getTime())) return d;
  }
  const normalized = text.replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1").replace(" ", "T");
  const d = new Date(normalized);
  if (!Number.isNaN(d.getTime())) return d;
  const d2 = new Date(text);
  return Number.isNaN(d2.getTime()) ? null : d2;
}
function formatDateTimeDisplay(value) {
  const date = parseDateValue(value);
  if (!date || Number.isNaN(date.getTime())) return String(value ?? "");
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`;
}

function formatDetailsCellValue(columnName, rawValue, row = {}) {
  if (columnName === "Down Time" || columnName === "Up time") {
    return formatDateTimeDisplay(rawValue);
  }

  if (columnName === "Down Time (Hrs.)") {
    const upTimeValue = row["Up time"] || row["Finish Time"] || rawValue;
    return formatDateTimeDisplay(upTimeValue);
  }

  return String(rawValue ?? "");
}


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

(function bootstrapApp() {
  const firebaseReady = initFirebase();
  const createAlertModal = document.getElementById("modal-create-alert");
  const dashboardSubmenu = document.getElementById("dashboard-submenu");
  const detailsSubmenu = document.getElementById("details-submenu");

  function bindDynamicNavHandlers(scope = document) {
    scope.querySelectorAll("[data-view]").forEach((el) => {
      if (el.dataset.boundClick === "true") return;
      el.dataset.boundClick = "true";
      el.addEventListener("click", () => {
        const dashboardSubview = el.dataset.dashboardSubview;
        const dashboardSheetName = el.dataset.dashboardSheetName;
        const dashboardSlaHours = Number(el.dataset.dashboardSlaHours || 3);
        const dashboardDetailsSheetName = el.dataset.dashboardDetailsSheetName;
        const dashboardDetailsSubView = el.dataset.dashboardDetailsSubview;
        Store.dispatch((state) => ({
          ...state,
          ui: {
            ...state.ui,
            currentView: el.dataset.view,
            ...(dashboardSubview ? { dashboardSubView: dashboardSubview } : {}),
            ...(dashboardSheetName ? { dashboardSheetName } : {}),
            ...(dashboardSlaHours ? { dashboardSlaHours } : {}),
            ...(dashboardDetailsSheetName ? { dashboardDetailsSheetName } : {}),
            ...(dashboardDetailsSubView ? { dashboardDetailsSubView } : {}),
          },
        }));
      });
    });
  }

  // ===== MOBILE SIDEBAR =====
  const sidebarToggleBtn = document.getElementById("btn-toggle-sidebar");
  const sidebarToggleIcon = document.getElementById("sidebar-toggle-icon");
  const sidebarToggleLabel = document.getElementById("sidebar-toggle-label");
  const sidebarCloseMobileBtn = document.getElementById("btn-close-sidebar-mobile");
  const sidebarOverlay = document.getElementById("sidebar-overlay");

  const mobileBreakpoint = 1024;

  function setSidebarDesktopCollapsed(isCollapsed) {
    document.body.classList.toggle("sidebar-collapsed", isCollapsed)
    updateSidebarToggleHint();
  }

  function setSidebarMobileOpen(isOpen) {
    document.body.classList.toggle("sidebar-open", isOpen);
    updateSidebarToggleHint();
  }

  function isMobileViewport() {
    return window.innerWidth <= mobileBreakpoint;
  }

  function updateSidebarToggleHint() {
    if (!sidebarToggleBtn) return;
    const mobile = isMobileViewport();
    const isMobileOpen = document.body.classList.contains("sidebar-open");
    const isDesktopCollapsed = document.body.classList.contains("sidebar-collapsed");
    const isOpen = mobile ? isMobileOpen : !isDesktopCollapsed;
    const iconText = "☰";
    const labelText = isOpen ? "Close menu" : "Open menu";

    if (sidebarToggleIcon) sidebarToggleIcon.textContent = iconText;
    if (sidebarToggleLabel) sidebarToggleLabel.textContent = labelText;
    sidebarToggleBtn.setAttribute("aria-label", labelText);
    sidebarToggleBtn.setAttribute("title", labelText);
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
  if (sidebarCloseMobileBtn) {
    sidebarCloseMobileBtn.addEventListener("click", () => setSidebarMobileOpen(false));
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setSidebarMobileOpen(false);
    }
  });

  document.addEventListener("click", (event) => {
    const navTarget = event.target.closest("[data-view]");
    if (!navTarget) return;
    if (isMobileViewport()) {
      setSidebarMobileOpen(false);
    }
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
    updateSidebarToggleHint();
  });
  updateSidebarToggleHint();

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

      const tickets = buildTicketsFromForm();

      // Symphony Ticket ซ้ำกันไม่ได้ — ตรวจสอบก่อน submit
      const newTicketNos = tickets.map(t => t.symphonyTicket).filter(Boolean);
      if (newTicketNos.length > 0) {
        const existingAlerts = Store.getState().alerts || [];
        const usedTicketNos = existingAlerts.flatMap(a =>
          (a.tickets || []).map(t => t.symphonyTicket || t.ticket || "").filter(Boolean)
        );
        const duplicates = newTicketNos.filter(no => usedTicketNos.includes(no));
        if (duplicates.length > 0) {
          const errEl = document.getElementById("f-ticket-error");
          if (errEl) {
            errEl.textContent = `Symphony Ticket ซ้ำ: ${duplicates.join(", ")} — มีอยู่ในระบบแล้ว`;
            errEl.style.display = "block";
          } else {
            alert(`Symphony Ticket ซ้ำ: ${duplicates.join(", ")} — มีอยู่ในระบบแล้ว`);
          }
          return;
        }
      }

      // ซ่อน error เดิม (ถ้ามี)
      const errEl = document.getElementById("f-ticket-error");
      if (errEl) errEl.style.display = "none";

      const enteredId = document.getElementById("f-incidentId")?.value?.trim();
      const data = {
        incidentId: enteredId || generateIncidentId(),
        workType: "",
        node: document.getElementById("f-node").value,
        alarm: document.getElementById("f-alarm").value,
        detail: document.getElementById("f-detail").value,
        nocBy: "System",
        severity: "Medium",
        status: "ACTIVE",
        tickets,
      };

      AlertService.createAlert(data);
      closeModal(createAlertModal);
      resetCreateTicketForm();
    });
  }

  // ===== NAVIGATION =====
  bindDynamicNavHandlers(document);
})();


// ===== RENDER =====
function getCalendarTodayCount(calendarEvents) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return (calendarEvents || []).reduce((count, event) => {
    if (String(event?.status || "").toUpperCase() === "CANCELLED") return count;
    const startAt = new Date(event?.startAt || event?.createdAt || event?.actionDate || 0);
    if (Number.isNaN(startAt.getTime())) return count;
    if (startAt >= today && startAt < tomorrow) return count + 1;
    return count;
  }, 0);
}

function getCalendarMonthCount(calendarEvents) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return (calendarEvents || []).reduce((count, event) => {
    if (String(event?.status || "").toUpperCase() === "CANCELLED") return count;
    const startAt = new Date(event?.startAt || event?.createdAt || event?.actionDate || 0);
    if (Number.isNaN(startAt.getTime())) return count;
    if (startAt >= monthStart && startAt < monthEnd) return count + 1;
    return count;
  }, 0);
}

function updateCalendarTodayBell(state) {
  const bell = document.getElementById("nav-calendar-today-bell");
  const badge = document.getElementById("nav-calendar-month-count");
  const hasTodayJobs = getCalendarTodayCount(state?.calendarEvents) > 0;
  const monthCount = getCalendarMonthCount(state?.calendarEvents);
  if (bell) bell.classList.toggle("hidden", !hasTodayJobs);
  if (badge) {
    badge.textContent = monthCount;
    badge.classList.toggle("hidden", monthCount === 0);
  }
}

function renderCalendarView(container, state) {
  if (window.CalendarUI) {
    container.replaceChildren(CalendarUI.render(state));
    if (window.lucide) lucide.createIcons();
  }
}

function renderHistoryView(container, state) {
  if (window.HistoryUI) {
    container.replaceChildren(HistoryUI.render(state));
  }
}


const TOPBAR_META = {
  "alert":            { crumb: "Alert Monitor",           title: "Alert Monitor" },
  "alert-detail":     { crumb: "Alert Monitor",           title: "Incident Detail" },
  "corrective":       { crumb: "Operations · Workbench",  title: "Corrective" },
  "calendar":         { crumb: "Operations",              title: "Calendar" },
  "improvement":      { crumb: "Operations",              title: "Improvement" },
  "history":          { crumb: "Reports · Archive",       title: "History" },
  "search":           { crumb: "Reports · Archive",       title: "Global Search" },
  "dashboard":        { crumb: "Reports · Archive",       title: "Dashboard" },
  "dashboard-details":{ crumb: "Reports · Archive",       title: "Details" },
  "subcontractor":    { crumb: "Reports · Archive",       title: "Subcontractor" },
  "recycle":          { crumb: "System · Trash",          title: "Recycle Bin" },
  "settings":         { crumb: "System",                  title: "Settings" },
};

function updateTopbarBreadcrumb(view) {
  const meta = TOPBAR_META[view] || { crumb: "", title: "" };
  const crumbEl = document.getElementById("topbar-crumb-text");
  const titleEl = document.getElementById("topbar-page-title");
  if (crumbEl) crumbEl.textContent = meta.crumb;
  if (titleEl) titleEl.textContent = meta.title;
}

const FINISHED_STATUSES = new Set(["COMPLETE","CLOSED","FINISHED","RESOLVED","DONE","NS_FINISH","CANCEL","CANCELLED","COMPLETED"]);

function updateSidebarBadges(state) {
  const alertCount = (state.alerts || []).filter(
    a => !["CANCEL","CANCELLED","DELETED"].includes(String(a.status||"").toUpperCase())
  ).length;

  const isActive = inc => !FINISHED_STATUSES.has(String(inc.status||"").trim().toUpperCase());
  const fiberCount  = (state.corrective?.fiber     || []).filter(isActive).length;
  const equipCount  = (state.corrective?.equipment || []).filter(isActive).length;
  const totalCount  = fiberCount + equipCount;

  function setBadge(id, n) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = n;
    el.classList.toggle("hidden", n === 0);
  }

  setBadge("nav-badge-alert",      alertCount);
  setBadge("nav-badge-corrective", totalCount);
  setBadge("nav-badge-fiber",      fiberCount);
  setBadge("nav-badge-equipment",  equipCount);
}

function render(state) {
  updateCalendarTodayBell(state);
  updateSidebarBadges(state);
  updateTopbarBreadcrumb(state.ui.currentView);
  if (window.updateNotifBadge) window.updateNotifBadge();
  document.querySelectorAll(".view-content").forEach((view) => {
    view.classList.add("hidden");
    view.style.display = "none";
  });
  if (!["dashboard", "dashboard-details"].includes(state.ui.currentView)) {
    destroyAllDashboardCharts();
  }

  if (state.ui.currentView === "dashboard") {
    try {
      _renderDashboardViewInternal(state);
    } catch (error) {
      console.error("Dashboard render failed:", error);
      const container = document.getElementById("view-dashboard");
      if (container) {
        atomicHTMLUpdate(container, `<div class="glass-card p-8 text-center text-rose-500 font-semibold">Dashboard render error</div>`);
      }
    }
  }
  if (state.ui.currentView === "dashboard-details") {
    try {
      if (state.ui.dashboardDetailsSubView === "search-incident") {
        renderSearchIncidentView(state);
      } else {
        renderDashboardDetailsView(state);
      }
    } catch (error) {
      console.error("Dashboard details render failed:", error);
      const container = document.getElementById("view-dashboard-details");
      if (container) {
        atomicHTMLUpdate(container, `<div class="glass-card p-8 text-center text-rose-500 font-semibold">Details render error</div>`);
      }
    }

  }

  if (state.ui.currentView === "alert") {
    const container = document.getElementById("alert-table-container");
    if (container) {
      container.replaceChildren(AlertUI.render(state));
    }
  }

  if (state.ui.currentView === "alert-detail") {
    const container = document.getElementById("view-alert-detail");
    if (container) {
      const selectedAlerts = state.ui.selectedAlerts;
      const alertReturnView = state.ui.alertDetailReturnView;
      if (selectedAlerts && selectedAlerts.length > 0) {
        AlertDetailUI.renderGrouped(selectedAlerts, alertReturnView);
      } else {
        const incident = state.ui.selectedIncident || getSampleIncidentData();
        AlertDetailUI.render(incident, alertReturnView);
      }
    }
  }

  if (state.ui.currentView === "corrective") {
    const container = document.getElementById("corrective-container");
    if (container) {
      container.replaceChildren(CorrectiveUI.render(state));
      if (window.lucide) lucide.createIcons();
    }
  }

  if (state.ui.currentView === "calendar") {
    const container = document.getElementById("calendar-container");
    if (container) {
      renderCalendarView(container, state);
    }
  }


  if (state.ui.currentView === "history") {
    const container = document.getElementById("history-grid");
    if (container) {
      renderHistoryView(container, state);
    }
  }

  if (state.ui.currentView === "recycle") {
    _renderRecycleViewInternal(state);
  }

  if (state.ui.currentView === "subcontractor") {
    renderSubcontractorView(state);
  }

  if (state.ui.currentView === "search") {
    // Search view logic handled independently during input
  }

  if (state.ui.currentView === "improvement") {
    if (window.ImprovementUI) window.ImprovementUI.render();
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
    const sub = document.querySelector(`#dashboard-submenu [data-dashboard-sheet-name="${CSS.escape(state.ui.dashboardSheetName || "")}"]`)
      || document.querySelector(`#dashboard-submenu [data-dashboard-subview="${state.ui.dashboardSubView || "main"}"]`);
    if (sub) sub.classList.add("active");
  } else if (state.ui.currentView === "dashboard-details") {
    const parent = document.getElementById("menu-details");
    if (parent) parent.classList.add("active");
    const sub = document.querySelector(`#details-submenu [data-dashboard-details-subview="${CSS.escape(state.ui.dashboardDetailsSubView || "data-sheet")}"]`)
      || document.querySelector(`#details-submenu [data-dashboard-details-sheet-name="${CSS.escape(state.ui.dashboardDetailsSheetName || "")}"]`)
      || document.querySelector("#details-submenu [data-view='dashboard-details']");

    if (sub) sub.classList.add("active");
  } else if (state.ui.currentView === "corrective") {
    const parent = document.getElementById("menu-corrective");
    if (parent) parent.classList.add("active");

    const tabs = document.querySelectorAll("#corrective-submenu [data-corrective-tab]");
    tabs.forEach(tab => {
      if (tab.dataset.correctiveTab === state.ui.activeCorrectiveTab) {
        tab.classList.add("active");
      }
    });
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
  region: null,
  subcontractor: null,
  overdue: null,
  summaryMttr: null,
  summaryCause: null,
  summaryCauseBar: null,
  summaryTeam: null,
  summaryTeamCompare: null,
  summaryDelay: null,
  regionWeekly: null,
  regionMttr: null,
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
  if (!(canvas instanceof HTMLCanvasElement) || !canvas.isConnected) return null;

  const context2d = canvas.getContext("2d");
  if (!context2d) return null;

  try {
    return new Chart(context2d, config);
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
        grace: "5%",
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
      meta: item.cancelReason || item.detail || "Job cancelled",
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
        meta: item.cancelReason || item.latestUpdateMessage || item.detail || "Job cancelled",
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
      meta: item.cancelReason || item.description || "Job cancelled",
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

async function restoreRecycleItem(recycleKey) {
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

    try {
      await fetch("/.netlify/functions/restore-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json",
              "x-api-key": window.NOC_API_KEY || "" },
        body: JSON.stringify({ incident_number: incidentId }),
      });
    } catch (error) {
      console.warn("Failed to sync restore status to cloud:", error);
    }
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
    Store.dispatch((state) => ({
      ...state,
      corrective: nextCorrective,
      ui: {
        ...state.ui,
        currentView: "corrective",
        activeCorrectiveTab: tab,
        highlightIncidentId: incidentId,
      },
    }));
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
    .filter((item) => item?.source === "alert" || item?.source === "corrective" || item?.source === "calendar")
    .map((item) => ({
      incident: item.id || item.incidentId,
      node: item.node || item.title || "-"
    }))
    .filter((item) => item.incident);

  if (!payloadItems.length) return;

  try {
    await fetch("/.netlify/functions/purge-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json",
              "x-api-key": window.NOC_API_KEY || "" },
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

function _renderRecycleViewInternal(state) {
  const container = document.getElementById("view-recycle");
  if (!container) return;

  if (window.RecycleUI && typeof RecycleUI.render === "function") {
    container.replaceChildren(RecycleUI.render(state));
  } else {
    atomicHTMLUpdate(container, `<div class="p-8 text-center text-slate-400 font-bold">Loading recycle bin...</div>`);
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

function buildSummaryMonthlyRows(completed, slaHours = 3) {
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
    if (hrs <= slaHours) rows[monthIndex].meet += 1;
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

function buildCauseRows(completed, slaHours = 3) {
  const bucket = {};
  completed.forEach((incident) => {
    const cause = incident.nsFinish?.details?.cause || incident.updates?.[0]?.cause || incident.alarm || "Unknown";
    const hrs = toMttrHours(incident);
    if (!Number.isFinite(hrs)) return;
    if (!bucket[cause]) {
      bucket[cause] = { cause, meet: 0, fail: 0, total: 0, mttr: "0.00%" };
    }
    bucket[cause].total += 1;
    if (hrs <= slaHours) bucket[cause].meet += 1;
    else bucket[cause].fail += 1;
  });

  const rows = Object.values(bucket).sort((a, b) => b.total - a.total);
  rows.forEach((row) => {
    row.mttr = row.total ? `${((row.meet / row.total) * 100).toFixed(2)}%` : "0.00%";
  });
  return rows;
}

function buildRegionWeeklyRows(completed, slaHours = 3) {
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
      if (hrs <= slaHours) week[weekIndex].meet += 1;
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

function computeDashboardData(state, slaHours = 3) {
  // Dashboard เก็บแค่งาน Fiber เท่านั้น (live data mode)
  const corrective = state.corrective?.fiber || [];

  const FINISH_STATUSES = ["NS_FINISH", "COMPLETE", "FINISHED", "CLOSED", "RESOLVED", "DONE"];
  const ACTIVE_STATUSES = ["RESPONDED", "CORRECTIVE", "ACTION", "IN_PROGRESS", "PROCESS", "ASSIGN", "ASSIGNED"];
  const CANCEL_STATUSES = ["CANCEL", "CANCELLED"];

  const getSubs = (item) => [
    ...(item.nsFinish?.subcontractors || []),
    ...(item.updates || []).flatMap((u) => u.subcontractors || []),
  ].filter(Boolean);

  const stats = {
    // New Job = Fiber หลัง Response ยังไม่ assign sub
    newJob: corrective.filter((x) => ACTIVE_STATUSES.includes((x.status || "").toUpperCase()) && getSubs(x).length === 0).length,
    // Inprocess = Update แล้ว (มี updates อย่างน้อย 1 รายการ)
    inprocess: corrective.filter((x) => ACTIVE_STATUSES.includes((x.status || "").toUpperCase()) && (x.updates || []).length > 0).length,
    // Assign Job = เลือก sub แล้วแต่ยังไม่มี update
    assign: corrective.filter((x) => ACTIVE_STATUSES.includes((x.status || "").toUpperCase()) && getSubs(x).length > 0 && (x.updates || []).length === 0).length,
    // Finish = ทุก finish status
    finish: corrective.filter((x) => FINISH_STATUSES.includes((x.status || "").toUpperCase())).length,
    // Job Cancel = Assign sub แล้วแต่ OFC ปกติ → ค่าเร่งด่วน
    cancel: corrective.filter((x) => CANCEL_STATUSES.includes((x.status || "").toUpperCase()) && getSubs(x).length > 0).length,
    mttr: 0,
    overMttr: 0,
    sla3Rate: 0,
    sla4Rate: 0,
    avgMttrHours: 0,
    overdue: 0,
    onTime: 0,
  };

  // คำนวณ duration (ลบ pending time) สำหรับ MTTR
  function getIncidentDurationHrs(incident) {
    const down = incident.tickets?.[0]?.downTime || incident.createdAt;
    const up = incident.nsFinish?.times?.upTime || incident.completedAt;
    const d1 = new Date(down);
    const d2 = new Date(up);
    if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime()) || d2 <= d1) return null;
    const totalMs = d2 - d1;
    const ft = incident.nsFinish?.times || {};
    const logs = incident.clockStartStopLogs;
    let pendingMs = 0;
    if (Array.isArray(logs) && logs.length) {
      pendingMs = calculatePendingTime(logs);
    } else if (ft.stopClock && ft.startClock) {
      pendingMs = calculatePendingTime([{ stop: ft.stopClock, start: ft.startClock }]);
    }
    return Math.max(0, totalMs - pendingMs) / 3600000;
  }

  const completed = corrective.filter((x) => FINISH_STATUSES.includes((x.status || "").toUpperCase()));
  completed.forEach((incident) => {
    const hrs = getIncidentDurationHrs(incident);
    if (hrs === null) return;
    if (hrs <= slaHours) stats.mttr += 1;
    else stats.overMttr += 1;
  });
  const mttrHours = completed
    .map(getIncidentDurationHrs)
    .filter((value) => Number.isFinite(value));

  const totalClosed = mttrHours.length;
  const sla3Count = mttrHours.filter((value) => value <= slaHours).length;
  const sla4Count = mttrHours.filter((value) => value <= 4).length;
  stats.onTime = sla3Count;
  stats.overdue = mttrHours.filter((value) => value > slaHours).length;
  stats.sla3Rate = totalClosed ? Number(((sla3Count / totalClosed) * 100).toFixed(1)) : 0;
  stats.sla4Rate = totalClosed ? Number(((sla4Count / totalClosed) * 100).toFixed(1)) : 0;
  stats.avgMttrHours = totalClosed
    ? Number((mttrHours.reduce((acc, value) => acc + value, 0) / totalClosed).toFixed(2))
    : 0;


  const statusChart = {
    labels: ["New", "Process", "Assign", "Finish", "Cancel"],
    values: [stats.newJob, stats.inprocess, stats.assign, stats.finish, stats.cancel],
  };

  const zoneCount = { "Zone 1": 0, "Zone 2": 0, "Zone 3": 0, "Zone 4": 0, Unknown: 0 };
  corrective.forEach((item) => {
    const zone = inferZoneFromNode(item.node);
    zoneCount[zone] = (zoneCount[zone] || 0) + 1;
  });
  const subcontractorCount = {};
  corrective.forEach((incident) => {
    const finishSubs = incident.nsFinish?.subcontractors || [];
    const updateSubs = (incident.updates || []).flatMap((item) => item.subcontractors || []);
    const teams = [...new Set([...finishSubs, ...updateSubs].filter(Boolean))];
    if (!teams.length) {
      subcontractorCount.Unassigned = (subcontractorCount.Unassigned || 0) + 1;
      return;
    }
    teams.forEach((team) => {
      subcontractorCount[team] = (subcontractorCount[team] || 0) + 1;
    });
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
      const hrs = getIncidentDurationHrs(incident);
      if (hrs === null) return;
      total += 1;
      if (hrs <= slaHours) meet += 1;
    });
    return total ? Number(((meet / total) * 100).toFixed(1)) : 0;
  });

  return {
    stats,
    statusChart,
    zoneCount,
    subcontractorCount,
    overdueSplit: { labels: ["On-time", "Overdue"], values: [stats.onTime, stats.overdue] },
    mttrTrend: { labels: dayLabel, values: dayValue },
    corrective,
    completed,
  };
}
function renderDashboardRegion(container, data, slaHours = 3) {
  const zoneRows = buildRegionWeeklyRows(data.completed, slaHours);

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

  atomicHTMLUpdate(container, `
      <div class="space-y-6">
        <div class="glass-card p-5 overflow-auto">
          <h3 class="font-bold mb-3">Region MTTR performance ${slaHours} Hrs. (Weekly by Zone)</h3>
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-slate-50">
                <th class="px-3 py-2 text-left">Zone</th>
                <th class="px-3 py-2 text-center">W1 (Meet/Fail)</th>
                <th class="px-3 py-2 text-center">W2</th>
                <th class="px-3 py-2 text-center">W3</th>
                <th class="px-3 py-2 text-center">W4</th>
                <th class="px-3 py-2 text-center">W5</th>
                <th class="px-3 py-2 text-center text-green-700">Meet</th>
                <th class="px-3 py-2 text-center text-amber-700">Fail</th>
                <th class="px-3 py-2 text-center">Total</th>
                <th class="px-3 py-2 text-center">MTTR</th>
              </tr>
            </thead>
            <tbody>${tableBody}</tbody>
          </table>
        </div>
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div class="glass-card p-5 dashboard-chart-card">
            <h4 class="font-bold mb-3">Performance by Zone (Meet/Fail)</h4>
            <div class="chart-shell chart-shell--wide"><canvas id="dash-region-weekly"></canvas></div>
          </div>
          <div class="glass-card p-5 dashboard-chart-card">
            <h4 class="font-bold mb-3">MTTR % by Zone</h4>
            <div class="chart-shell chart-shell--wide"><canvas id="dash-region-mttr"></canvas></div>
          </div>
        </div>
      </div>
    `);

  if (!window.Chart) return;
  destroyDashboardChart("regionWeekly");
  destroyDashboardChart("regionMttr");
  dashboardCharts.regionWeekly = createChartInstance("dash-region-weekly", {
    type: "bar",
    data: {
      labels: zoneRows.map((row) => row.zone),
      datasets: [
        { label: "Meet", data: zoneRows.map((row) => row.meet), backgroundColor: "#16a34a", borderRadius: 8, maxBarThickness: 34 },
        { label: "Fail", data: zoneRows.map((row) => row.fail), backgroundColor: "#f97316", borderRadius: 8, maxBarThickness: 34 },
      ],
    },
    options: buildCartesianOptions({
      scales: {
        y: { beginAtZero: true },
        y1: { beginAtZero: true, max: 110, position: "right", grid: { drawOnChartArea: false }, ticks: { stepSize: 10, callback: (value) => value <= 100 ? `${value}%` : '', font: { size: getChartFontSize() } } },
      },
    }),
  });
}

function renderDashboardReport(container, data, slaHours = 3) {
  const meet = data.stats.mttr;
  const fail = data.stats.overMttr;
  const total = meet + fail;
  const mttrPct = total ? ((meet / total) * 100).toFixed(2) : 0;

  // Build last-6-months Meet/Fail bar data from completed incidents
  const monthBuckets = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (5 - i));
    return {
      label: d.toLocaleDateString("th-TH", { month: "short", year: "2-digit" }),
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      meet: 0, fail: 0,
    };
  });
  data.completed.forEach((incident) => {
    const up = incident.nsFinish?.times?.upTime || incident.completedAt;
    if (!up) return;
    const key = String(up).substring(0, 7);
    const bucket = monthBuckets.find(b => b.key === key);
    if (!bucket) return;
    const down = incident.tickets?.[0]?.downTime || incident.createdAt;
    const durationMs = up && down ? (new Date(up) - new Date(down)) : null;
    const hrs = durationMs > 0 ? durationMs / 3600000 : null;
    if (hrs === null) return;
    if (hrs <= slaHours) bucket.meet++; else bucket.fail++;
  });

  atomicHTMLUpdate(container, `
      <div class="space-y-6">
        <div class="bg-red-700 text-white rounded-xl p-4 grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
          <div><div class="text-xs font-medium opacity-80">All Case</div><div class="text-3xl font-bold">${data.completed.length}</div></div>
          <div><div class="text-xs font-medium opacity-80">Meet ≤${slaHours}Hrs</div><div class="text-3xl font-bold">${meet}</div></div>
          <div><div class="text-xs font-medium opacity-80">Fail</div><div class="text-3xl font-bold">${fail}</div></div>
          <div><div class="text-xs font-medium opacity-80">Total (มี MTTR)</div><div class="text-3xl font-bold">${total}</div></div>
          <div><div class="text-xs font-medium opacity-80">MTTR Rate</div><div class="text-3xl font-bold">${mttrPct}%</div></div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="glass-card p-5 dashboard-chart-card">
            <h4 class="font-bold mb-1">Meet / Fail รายเดือน</h4>
            <p class="text-xs text-slate-400 mb-3">งาน Fiber Finish ที่ทัน vs ไม่ทัน SLA ${slaHours} ชม.</p>
            <div class="chart-shell chart-shell--wide"><canvas id="dash-report-main"></canvas></div>
          </div>
          <div class="glass-card p-5 dashboard-chart-card">
            <h4 class="font-bold mb-1">สัดส่วน Meet / Fail</h4>
            <p class="text-xs text-slate-400 mb-3">ภาพรวมทั้งหมด</p>
            <div class="chart-shell chart-shell--donut"><canvas id="dash-report-incident"></canvas></div>
          </div>
          <div class="glass-card p-5 dashboard-chart-card"><h4 class="font-bold mb-3">Cause of Incident</h4><div class="chart-shell chart-shell--wide"><canvas id="dash-report-cause"></canvas></div></div>
          <div class="glass-card p-5 dashboard-chart-card"><h4 class="font-bold mb-3">Delayed by</h4><div class="chart-shell chart-shell--donut"><canvas id="dash-report-delay"></canvas></div></div>
        </div>
      </div>
    `);

  if (!window.Chart) return;
  destroyDashboardChart("reportMain");
  destroyDashboardChart("reportIncident");
  destroyDashboardChart("reportCause");
  destroyDashboardChart("reportDelayed");

  dashboardCharts.reportMain = createChartInstance("dash-report-main", {
    type: "bar",
    data: {
      labels: monthBuckets.map(b => b.label),
      datasets: [
        { label: "Meet", data: monthBuckets.map(b => b.meet), backgroundColor: "#65a30d", borderRadius: 6, maxBarThickness: 32 },
        { label: "Fail", data: monthBuckets.map(b => b.fail), backgroundColor: "#f97316", borderRadius: 6, maxBarThickness: 32 },
      ],
    },
    options: buildCartesianOptions({ scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } } }),
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
    options: buildCartesianOptions({ indexAxis: "y" }),
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

function _renderDashboardViewInternal(state) {
  const container = document.getElementById("view-dashboard");
  if (!container) return;

  const subView   = state.ui.dashboardSubView || "main";
  const slaHours  = Number(state.ui.dashboardSlaHours || 3);

  if (subView === "main") {
    const el = window.DashboardUI?.render(state);
    if (el) { container.innerHTML = ""; container.appendChild(el); }
    return;
  }
  if (subView === "report-main") {
    renderDashboardMain(container, state, slaHours);
    return;
  }
  if (subView === "summary") {
    renderDashboardSummary(container, state, slaHours);
    return;
  }
  if (subView === "region") {
    const data = computeDashboardData(state, slaHours);
    renderDashboardRegion(container, data, slaHours);
    return;
  }
  // default: live MTTR report
  const data = computeDashboardData(state, slaHours);
  renderDashboardReport(container, data, slaHours);
}

function buildDashboardSectionStats(rows, slaHours) {
  const statusKey = slaHours >= 4 ? "MTTR 4Hrs." : "MTTR 3Hrs.";
  let meet = 0, fail = 0, uncontrol = 0, mttrSum = 0, mttrCount = 0;
  rows.forEach(row => {
    const status = normalizeSheetText(pickRowValue(row, [statusKey]));
    if (status.includes("meet")) meet++;
    if (status.includes("fail")) fail++;
    const ctrl = normalizeSheetText(pickRowValue(row, ["Control / Uncontrol"]));
    if (ctrl.includes("uncontrol")) uncontrol++;
    const hrs = parseFloat(String(pickRowValue(row, ["Down Time (Hrs.)"])).replace(/[^0-9.]/g, ""));
    if (Number.isFinite(hrs) && hrs > 0) { mttrSum += hrs; mttrCount++; }
  });
  const total = meet + fail;
  const withoutTotal = Math.max(0, total - uncontrol);
  return {
    allCase: rows.length, meet, fail, total, uncontrol,
    withoutUncontrolTotal: withoutTotal,
    mttr: mttrCount ? (mttrSum / mttrCount).toFixed(2) : "0.00",
    mttrRate: total ? ((meet / total) * 100).toFixed(2) : "0.00",
    withoutRate: withoutTotal ? ((meet / withoutTotal) * 100).toFixed(2) : "0.00",
  };
}

function buildDashboardReportPayload(rows, slaHours) {
  const stats = buildDashboardSectionStats(rows, slaHours);
  const statusKey = slaHours >= 4 ? "MTTR 4Hrs." : "MTTR 3Hrs.";
  const monthOrder = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthMap = Object.fromEntries(monthOrder.map(m => [m, { meet:0, fail:0, total:0, without:0 }]));
  rows.forEach(row => {
    const month = String(pickRowValue(row, ["Month"])||"").slice(0,3);
    if (!monthMap[month]) return;
    const status = normalizeSheetText(pickRowValue(row, [statusKey]));
    const ctrl = normalizeSheetText(pickRowValue(row, ["Control / Uncontrol"]));
    if (status.includes("meet")) monthMap[month].meet++;
    if (status.includes("fail")) monthMap[month].fail++;
    monthMap[month].total += (status.includes("meet")||status.includes("fail")) ? 1 : 0;
    if (!ctrl.includes("uncontrol") && (status.includes("meet")||status.includes("fail"))) monthMap[month].without++;
  });
  const monthly = monthOrder.map(m => {
    const r = monthMap[m];
    return { month: m, meet: r.meet, fail: r.fail, total: r.total,
      mttrPct: r.total ? Number(((r.meet/r.total)*100).toFixed(2)) : 0,
      withoutPct: r.without ? Number(((r.meet/r.without)*100).toFixed(2)) : 0 };
  });
  const delayed = { "Sub-Contractor":0,"MEA/PEA":0,"SYMC-NOC":0,"SYMC-Region":0,"Building":0,"Natural disaster":0,"Customer":0,"Partner/Off-net":0 };
  const causes = {};
  rows.forEach(row => {
    const d = String(pickRowValue(row,["Delay by"])||"Sub-Contractor").trim()||"Sub-Contractor";
    if (delayed[d] === undefined) delayed[d] = 0; delayed[d]++;
    const c = String(pickRowValue(row,["Cause of incident"])||"Unknown").trim()||"Unknown";
    const status = normalizeSheetText(pickRowValue(row,[statusKey]));
    if (!causes[c]) causes[c] = { meet:0, fail:0 };
    if (status.includes("meet")) causes[c].meet++;
    if (status.includes("fail")) causes[c].fail++;
  });
  const causeRows = Object.entries(causes)
    .map(([cause,v]) => ({ cause, meet:v.meet, fail:v.fail, total:v.meet+v.fail }))
    .sort((a,b) => b.total-a.total).slice(0,12);
  return { stats, monthly, delayed, causes: causeRows };
}

function renderDashboardMain(container, state, slaHours) {
  const allRows = buildDataSheetRows(state);
  const accessRows = allRows.filter(r => normalizeSheetText(pickRowValue(r,["Backbone/Access"])).includes("access"));
  const backboneRows = allRows.filter(r => normalizeSheetText(pickRowValue(r,["Backbone/Access"])).includes("backbone"));

  const sections = [
    { key:"overall", title:`Report MTTR ${slaHours} Hrs.`, color:"#b80000", rows: allRows },
    { key:"access",  title:`Report MTTR ${slaHours} Hrs.(Access)`,   color:"#05a84b", rows: accessRows },
    { key:"backbone",title:`Report MTTR ${slaHours} Hrs.(Backbone)`, color:"#2f5597", rows: backboneRows },
  ];

  const selectedKey = document.getElementById("dash-report-segment")?.value || "overall";
  const currentSection = sections.find(s => s.key === selectedKey) || sections[0];

  // Year/Month filter
  const selYear  = Number(document.getElementById("dash-report-year")?.value  || new Date().getFullYear());
  const selMonth = Number(document.getElementById("dash-report-month")?.value || 0);
  const monthNames = ["All","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const years = [];
  for (let i = 0; i <= 2; i++) years.push(new Date().getFullYear() - i);

  const filteredRows = currentSection.rows.filter(row => {
    const dateStr = String(pickRowValue(row,["Up time","Down Time"])||"");
    if (!dateStr) return selMonth === 0;
    const d = new Date(dateStr);
    if (isNaN(d)) return selMonth === 0;
    if (d.getFullYear() !== selYear) return false;
    if (selMonth !== 0 && d.getMonth()+1 !== selMonth) return false;
    return true;
  });

  const payload = buildDashboardReportPayload(filteredRows, slaHours);
  const stats = payload.stats;

  atomicHTMLUpdate(container, `
    <div class="space-y-4">
      <div class="flex gap-2 flex-wrap">
        ${sections.map(s => `<button class="dash-report-tab px-4 py-2 rounded-md text-white font-semibold text-sm" style="background:${s.color};opacity:${s.key===selectedKey?"1":"0.7"}" data-segment="${s.key}">${s.title}</button>`).join("")}
        <input id="dash-report-segment" type="hidden" value="${selectedKey}">
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Period:</span>
        <select id="dash-report-year" class="text-sm font-semibold bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none">
          ${years.map(y => `<option value="${y}" ${y===selYear?"selected":""}>${y}</option>`).join("")}
        </select>
        <select id="dash-report-month" class="text-sm font-semibold bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none">
          ${monthNames.map((n,i) => `<option value="${i}" ${i===selMonth?"selected":""}>${n}</option>`).join("")}
        </select>
      </div>
      <div class="glass-card overflow-hidden border border-slate-300">
        <div class="text-white px-4 py-3" style="background:${currentSection.color}">
          <div class="text-center font-bold text-xl underline mb-2">${currentSection.title}</div>
          <div class="grid grid-cols-3 md:grid-cols-6 gap-2 text-center font-semibold">
            <div><div class="text-xs opacity-80">All Case</div><div class="text-2xl">${stats.allCase}</div></div>
            <div><div class="text-xs opacity-80">Meet</div><div class="text-2xl">${stats.meet}<br><span class="text-sm">${stats.withoutUncontrolTotal}</span></div></div>
            <div><div class="text-xs opacity-80">Fail</div><div class="text-2xl">${stats.fail}<br><span class="text-sm">${stats.uncontrol}</span></div></div>
            <div><div class="text-xs opacity-80">Total</div><div class="text-2xl">${stats.total}<br><span class="text-sm">${stats.withoutUncontrolTotal}</span></div></div>
            <div><div class="text-xs opacity-80">MTTR (Hrs)</div><div class="text-2xl">${stats.mttr}</div></div>
            <div><div class="text-xs opacity-80">Rate</div><div class="text-2xl">${stats.mttrRate}%<br><span class="text-sm">${stats.withoutRate}%</span></div></div>
          </div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-0 border-t border-slate-300">
          <div class="lg:col-span-2 p-4 border-r border-slate-300"><div class="chart-shell chart-shell--wide"><canvas id="dash-report-main"></canvas></div></div>
          <div class="p-4"><div class="chart-shell chart-shell--donut"><canvas id="dash-report-incident"></canvas></div></div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-0 border-t border-slate-300">
          <div class="lg:col-span-2 p-4 border-r border-slate-300"><div class="chart-shell chart-shell--wide"><canvas id="dash-report-cause"></canvas></div></div>
          <div class="p-4"><div class="chart-shell chart-shell--donut"><canvas id="dash-report-delay"></canvas></div></div>
        </div>
      </div>
    </div>
  `);

  // Tab click
  container.querySelectorAll(".dash-report-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const h = document.getElementById("dash-report-segment");
      if (h) h.value = btn.dataset.segment;
      renderDashboardMain(container, state, slaHours);
    });
  });
  // Year/Month change
  ["dash-report-year","dash-report-month"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", () => renderDashboardMain(container, state, slaHours));
  });

  if (!window.Chart) return;
  destroyDashboardChart("reportMain"); destroyDashboardChart("reportIncident");
  destroyDashboardChart("reportCause"); destroyDashboardChart("reportDelayed");

  const monthlyLabels = [...payload.monthly.map(r=>r.month), "SUM"];
  const meetData  = [...payload.monthly.map(r=>r.meet),  stats.meet];
  const failData  = [...payload.monthly.map(r=>r.fail),  stats.fail];
  const totalData = [...payload.monthly.map(r=>r.total), stats.total];
  const cap100 = v => Math.min(Number(v) || 0, 100);
  const mttrPctData    = [...payload.monthly.map(r=>cap100(r.mttrPct)),    cap100(Number(stats.mttrRate))];
  const withoutPctData = [...payload.monthly.map(r=>cap100(r.withoutPct)), cap100(Number(stats.withoutRate))];

  dashboardCharts.reportMain = createChartInstance("dash-report-main", {
    type:"bar",
    data: { labels: monthlyLabels, datasets: [
      { label:"Meet",  data: meetData,  backgroundColor:"#3b82f6" },
      { label:"Fail",  data: failData,  backgroundColor:"#f97316" },
      { label:"Total", data: totalData, backgroundColor:"#9ca3af" },
      { type:"line", label:"MTTR",             data: mttrPctData,    borderColor:"#eab308", yAxisID:"y1", tension:0, pointRadius: 3, borderWidth:2 },
      { type:"line", label:"Without Uncontrol",data: withoutPctData, borderColor:"#1d4ed8", yAxisID:"y1", tension:0, pointRadius: 3, borderWidth:2 },
    ]},
    options: buildCartesianOptions({ scales: {
      y:  { beginAtZero:true, ticks:{ precision:0 } },
      y1: { position:"right", min:0, max:110, grid:{ drawOnChartArea:false }, ticks:{ stepSize:10, callback: v => v<=100 ? `${v}%` : '' } },
    }}),
  });
  dashboardCharts.reportIncident = createChartInstance("dash-report-incident", {
    type:"pie",
    data: { labels:["Meet","Control","Uncontrol"],
      datasets:[{ data:[stats.meet, stats.fail, stats.uncontrol], backgroundColor:["#70ad47","#ed7d31","#facc15"] }] },
    options: buildBaseChartOptions({ plugins:{ legend: createLegend("top") } }),
  });
  dashboardCharts.reportCause = createChartInstance("dash-report-cause", {
    type:"bar",
    data: { labels: payload.causes.map(r=>r.cause), datasets:[
      { label:"Meet", data:payload.causes.map(r=>r.meet), backgroundColor:"#4472c4", borderRadius:6, maxBarThickness:22 },
      { label:"Fail", data:payload.causes.map(r=>r.fail), backgroundColor:"#ed7d31", borderRadius:6, maxBarThickness:22 },
    ]},
    options: buildCartesianOptions({ indexAxis:"y" }),
  });
  dashboardCharts.reportDelayed = createChartInstance("dash-report-delay", {
    type:"pie",
    data: { labels: Object.keys(payload.delayed),
      datasets:[{ data:Object.values(payload.delayed), backgroundColor:["#a8550f","#16a34a","#3b82f6","#f97316","#06b6d4","#facc15","#9ca3af","#d946ef"] }] },
    options: buildBaseChartOptions({ plugins:{ legend: createLegend("top") } }),
  });
}

function renderDashboardSummary(container, state, slaHours) {
  const rows = buildDataSheetRows(state);
  const statusKey = slaHours >= 4 ? "MTTR 4Hrs." : "MTTR 3Hrs.";
  const monthOrder = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const weekOrder  = ["W1","W2","W3","W4","W5"];
  const monthState = document.getElementById("summary-month-select")?.value || "Jan";
  const initMetric = () => ({ meet:0, fail:0, total:0, uncontrol:0, controlFail:0 });
  const monthlyMap = Object.fromEntries(monthOrder.map(m=>[m,initMetric()]));
  const causeMap = {}, delayWeekly = {}, teamMap = {};

  rows.forEach(row => {
    const status   = normalizeSheetText(pickRowValue(row,[statusKey]));
    const isMeet   = status.includes("meet");
    const isFail   = status.includes("fail");
    if (!isMeet && !isFail) return;
    const month      = String(pickRowValue(row,["Month"])||"").slice(0,3);
    const week       = String(pickRowValue(row,["Week"])||"").trim();
    const isUncontrol= normalizeSheetText(pickRowValue(row,["Control / Uncontrol"])).includes("uncontrol");
    const cause      = String(pickRowValue(row,["Cause of incident"])||"Unknown").trim()||"Unknown";
    const delayBy    = String(pickRowValue(row,["Delay by"])||"Sub-Contractor").trim()||"Sub-Contractor";
    const team       = String(pickRowValue(row,["Team"])||"Unknown").trim()||"Unknown";
    if (!monthlyMap[month]) monthlyMap[month] = initMetric();
    monthlyMap[month].total++; if(isMeet)monthlyMap[month].meet++; if(isFail)monthlyMap[month].fail++;
    if(isUncontrol)monthlyMap[month].uncontrol++; if(isFail&&!isUncontrol)monthlyMap[month].controlFail++;
    if (!causeMap[cause]) causeMap[cause] = initMetric();
    causeMap[cause].total++; if(isMeet)causeMap[cause].meet++; if(isFail)causeMap[cause].fail++;
    if(isUncontrol)causeMap[cause].uncontrol++; if(isFail&&!isUncontrol)causeMap[cause].controlFail++;
    if (!delayWeekly[delayBy]) delayWeekly[delayBy] = { ...Object.fromEntries(weekOrder.map(w=>[w,0])), total:0 };
    if (weekOrder.includes(week)) { delayWeekly[delayBy][week]++; } delayWeekly[delayBy].total++;
    if (!teamMap[team]) teamMap[team] = initMetric();
    teamMap[team].total++; if(isMeet)teamMap[team].meet++; if(isFail)teamMap[team].fail++;
    if(isUncontrol)teamMap[team].uncontrol++; if(isFail&&!isUncontrol)teamMap[team].controlFail++;
  });

  const buildRate = (meet,total) => total ? `${((meet/total)*100).toFixed(2)}%` : "0.00%";
  const monthlyRows = monthOrder.map(month => {
    const r = monthlyMap[month]||initMetric();
    const withoutTotal = Math.max(0,r.total-r.uncontrol);
    return { month, meet:r.meet, fail:r.fail, total:r.total, mttr:buildRate(r.meet,r.total), controlFail:r.controlFail, withoutTotal, withoutRate:buildRate(r.meet,withoutTotal) };
  });
  const sumMonthly = monthlyRows.reduce((acc,r)=>({ meet:acc.meet+r.meet, fail:acc.fail+r.fail, total:acc.total+r.total, controlFail:acc.controlFail+r.controlFail, withoutTotal:acc.withoutTotal+r.withoutTotal }), {meet:0,fail:0,total:0,controlFail:0,withoutTotal:0});
  sumMonthly.mttr = buildRate(sumMonthly.meet,sumMonthly.total);
  sumMonthly.withoutRate = buildRate(sumMonthly.meet,sumMonthly.withoutTotal);

  const causeRows = Object.entries(causeMap).map(([cause,r])=>{
    const withoutTotal=Math.max(0,r.total-r.uncontrol);
    return { cause, meet:r.meet, fail:r.fail, total:r.total, mttr:buildRate(r.meet,r.total), controlFail:r.controlFail, withoutTotal, withoutRate:buildRate(r.meet,withoutTotal) };
  }).sort((a,b)=>b.total-a.total);
  const sumCause = causeRows.reduce((acc,r)=>({ meet:acc.meet+r.meet, fail:acc.fail+r.fail, total:acc.total+r.total, controlFail:acc.controlFail+r.controlFail, withoutTotal:acc.withoutTotal+r.withoutTotal }),{meet:0,fail:0,total:0,controlFail:0,withoutTotal:0});
  sumCause.mttr = buildRate(sumCause.meet,sumCause.total); sumCause.withoutRate = buildRate(sumCause.meet,sumCause.withoutTotal);

  const selectedMonthRows = rows.filter(r => String(pickRowValue(r,["Month"])||"").slice(0,3)===monthState);
  const summaryWeekly = weekOrder.map(week=>{
    const wr = rows.filter(r=>String(pickRowValue(r,["Week"])||"")=== week);
    const s = buildDashboardSectionStats(wr,slaHours);
    return { week, meet:s.meet, fail:s.fail, total:s.total, mttr:`${s.mttrRate}%` };
  });
  const teamOrder = (window.NocSettings?.get()?.teams?.list?.length
    ? window.NocSettings.get().teams.list
    : ["Keng","Jin","Ball"]);
  const teamRows = teamOrder.map(team=>{
    const s = teamMap[team]||initMetric(); const withoutTotal=Math.max(0,s.total-s.uncontrol);
    return { team, meet:s.meet, fail:s.fail, total:s.total, mttr:buildRate(s.meet,s.total), controlFail:s.controlFail, withoutTotal, withoutRate:buildRate(s.meet,withoutTotal) };
  });

  const thRow = `<th class="px-2 py-1">Month</th><th class="px-2 py-1 text-green-700">Meet</th><th class="px-2 py-1 text-amber-700">Fail</th><th class="px-2 py-1">Total</th><th class="px-2 py-1">MTTR</th><th class="px-2 py-1">Fail(Ctrl)</th><th class="px-2 py-1">W/o Total</th><th class="px-2 py-1">W/o Uncontrol</th>`;
  const tdRow = r => `<td class="px-2 py-1">${r.month||r.cause||r.team||""}</td><td class="px-2 py-1 text-center">${r.meet}</td><td class="px-2 py-1 text-center">${r.fail}</td><td class="px-2 py-1 text-center">${r.total}</td><td class="px-2 py-1 text-center">${r.mttr}</td><td class="px-2 py-1 text-center">${r.controlFail}</td><td class="px-2 py-1 text-center">${r.withoutTotal}</td><td class="px-2 py-1 text-center">${r.withoutRate}</td>`;

  atomicHTMLUpdate(container, `
    <div class="space-y-6">
      <div class="glass-card p-4 overflow-auto">
        <h3 class="font-bold mb-3">1) Summary MTTR ${slaHours} Hrs.</h3>
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <table class="w-full text-sm border border-slate-200"><thead class="bg-slate-100"><tr>${thRow}</tr></thead>
            <tbody>${monthlyRows.map(r=>`<tr>${tdRow(r)}</tr>`).join("")}<tr class="bg-slate-100 font-semibold"><td class="px-2 py-1">SUM</td><td class="px-2 py-1 text-center">${sumMonthly.meet}</td><td class="px-2 py-1 text-center">${sumMonthly.fail}</td><td class="px-2 py-1 text-center">${sumMonthly.total}</td><td class="px-2 py-1 text-center">${sumMonthly.mttr}</td><td class="px-2 py-1 text-center">${sumMonthly.controlFail}</td><td class="px-2 py-1 text-center">${sumMonthly.withoutTotal}</td><td class="px-2 py-1 text-center">${sumMonthly.withoutRate}</td></tr></tbody>
          </table>
          <table class="w-full text-sm border border-slate-200"><thead class="bg-slate-100"><tr><th class="px-2 py-1 text-left">Cause of incident</th><th class="px-2 py-1 text-green-700">Meet</th><th class="px-2 py-1 text-amber-700">Fail</th><th class="px-2 py-1">Total</th><th class="px-2 py-1">MTTR</th><th class="px-2 py-1">Fail(Ctrl)</th><th class="px-2 py-1">W/o Total</th><th class="px-2 py-1">W/o Uncontrol</th></tr></thead>
            <tbody>${causeRows.map(r=>`<tr><td class="px-2 py-1">${escapeHtml(r.cause)}</td><td class="px-2 py-1 text-center">${r.meet}</td><td class="px-2 py-1 text-center">${r.fail}</td><td class="px-2 py-1 text-center">${r.total}</td><td class="px-2 py-1 text-center">${r.mttr}</td><td class="px-2 py-1 text-center">${r.controlFail}</td><td class="px-2 py-1 text-center">${r.withoutTotal}</td><td class="px-2 py-1 text-center">${r.withoutRate}</td></tr>`).join("")}<tr class="bg-slate-100 font-semibold"><td class="px-2 py-1">SUM</td><td class="px-2 py-1 text-center">${sumCause.meet}</td><td class="px-2 py-1 text-center">${sumCause.fail}</td><td class="px-2 py-1 text-center">${sumCause.total}</td><td class="px-2 py-1 text-center">${sumCause.mttr}</td><td class="px-2 py-1 text-center">${sumCause.controlFail}</td><td class="px-2 py-1 text-center">${sumCause.withoutTotal}</td><td class="px-2 py-1 text-center">${sumCause.withoutRate}</td></tr></tbody>
          </table>
        </div>
      </div>
      <div class="glass-card p-4">
        <h3 class="font-bold mb-3">2) Chart Summary</h3>
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div class="dashboard-chart-card"><div class="chart-shell chart-shell--wide"><canvas id="dash-summary-mttr"></canvas></div></div>
          <div class="dashboard-chart-card"><div class="chart-shell chart-shell--donut"><canvas id="dash-summary-cause"></canvas></div></div>
          <div class="dashboard-chart-card"><div class="chart-shell chart-shell--wide"><canvas id="dash-summary-cause-bar"></canvas></div></div>
        </div>
      </div>
      <div class="glass-card p-4 overflow-auto">
        <h3 class="font-bold mb-3">3) Weekly Summary + Performance Team (${teamOrder.join(" / ")})</h3>
        <div class="mb-3 flex items-center gap-2 text-sm">
          <label for="summary-month-select" class="font-medium">Month:</label>
          <select id="summary-month-select" class="bg-slate-100 rounded px-2 py-1">${monthOrder.map(m=>`<option value="${m}" ${m===monthState?"selected":""}>${m}</option>`).join("")}</select>
        </div>
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <table class="w-full text-sm border border-slate-200"><thead class="bg-slate-100"><tr><th class="px-2 py-1">Summary</th><th class="px-2 py-1">Meet</th><th class="px-2 py-1">Fail</th><th class="px-2 py-1">Total</th><th class="px-2 py-1">MTTR</th></tr></thead><tbody>${summaryWeekly.map(r=>`<tr><td class="px-2 py-1">${r.week}</td><td class="px-2 py-1 text-center">${r.meet}</td><td class="px-2 py-1 text-center">${r.fail}</td><td class="px-2 py-1 text-center">${r.total}</td><td class="px-2 py-1 text-center">${r.mttr}</td></tr>`).join("")}</tbody></table>
          <table class="w-full text-sm border border-slate-200"><thead class="bg-slate-100"><tr><th class="px-2 py-1 text-left">Delayed by</th>${weekOrder.map(w=>`<th class="px-2 py-1">${w}</th>`).join("")}<th class="px-2 py-1">Total</th></tr></thead><tbody>${Object.entries(delayWeekly).map(([k,v])=>`<tr><td class="px-2 py-1">${escapeHtml(k)}</td>${weekOrder.map(w=>`<td class="px-2 py-1 text-center">${v[w]}</td>`).join("")}<td class="px-2 py-1 text-center">${v.total}</td></tr>`).join("")}</tbody></table>
        </div>
        <div class="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
          <table class="w-full text-sm border border-slate-200"><thead class="bg-slate-100"><tr><th class="px-2 py-1">Team</th><th class="px-2 py-1">Meet</th><th class="px-2 py-1">Fail</th><th class="px-2 py-1">Total</th><th class="px-2 py-1">MTTR</th><th class="px-2 py-1">Ctrl Fail</th><th class="px-2 py-1">W/o Total</th><th class="px-2 py-1">W/o Uncontrol</th></tr></thead><tbody>${teamRows.map(r=>`<tr><td class="px-2 py-1">${r.team}</td><td class="px-2 py-1 text-center">${r.meet}</td><td class="px-2 py-1 text-center">${r.fail}</td><td class="px-2 py-1 text-center">${r.total}</td><td class="px-2 py-1 text-center">${r.mttr}</td><td class="px-2 py-1 text-center">${r.controlFail}</td><td class="px-2 py-1 text-center">${r.withoutTotal}</td><td class="px-2 py-1 text-center">${r.withoutRate}</td></tr>`).join("")}</tbody></table>
        </div>
        <div class="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div class="dashboard-chart-card"><div class="chart-shell chart-shell--wide"><canvas id="dash-summary-team"></canvas></div></div>
          <div class="dashboard-chart-card"><div class="chart-shell chart-shell--wide"><canvas id="dash-summary-team-compare"></canvas></div></div>
        </div>
      </div>
    </div>
  `);

  document.getElementById("summary-month-select")?.addEventListener("change", ()=>renderDashboardSummary(container,state,slaHours));
  if (!window.Chart) return;
  destroyDashboardChart("summaryMttr"); destroyDashboardChart("summaryCause");
  destroyDashboardChart("summaryCauseBar"); destroyDashboardChart("summaryTeam"); destroyDashboardChart("summaryTeamCompare");

  const monthlyLabels = [...monthOrder,"SUM"];
  dashboardCharts.summaryMttr = createChartInstance("dash-summary-mttr",{type:"bar",data:{labels:monthlyLabels,datasets:[
    {label:"Meet",data:[...monthlyRows.map(r=>r.meet),sumMonthly.meet],backgroundColor:"#4472c4"},
    {label:"Fail",data:[...monthlyRows.map(r=>r.fail),sumMonthly.fail],backgroundColor:"#ed7d31"},
    {label:"Total",data:[...monthlyRows.map(r=>r.total),sumMonthly.total],backgroundColor:"#a3a3a3"},
    {type:"line",label:"MTTR",data:[...monthlyRows.map(r=>Math.min(Number(r.mttr.replace("%","")),100)),Math.min(Number(sumMonthly.mttr.replace("%","")),100)],borderColor:"#eab308",yAxisID:"y1",tension:0,pointRadius:3,borderWidth:2},
  ]},options:buildCartesianOptions({scales:{y:{beginAtZero:true},y1:{position:"right",min:0,max:110,grid:{drawOnChartArea:false},ticks:{stepSize:10,callback:v=>v<=100?`${v}%`:''}}}})});
  dashboardCharts.summaryCause = createChartInstance("dash-summary-cause",{type:"pie",data:{labels:["Meet","Control","Uncontrol"],datasets:[{data:[sumMonthly.meet,sumMonthly.controlFail,Math.max(0,sumMonthly.fail-sumMonthly.controlFail)],backgroundColor:["#70ad47","#ed7d31","#facc15"]}]},options:buildBaseChartOptions({plugins:{legend:createLegend("top")}})});
  dashboardCharts.summaryCauseBar = createChartInstance("dash-summary-cause-bar",{type:"bar",data:{labels:causeRows.map(r=>r.cause),datasets:[
    {label:"Meet",data:causeRows.map(r=>r.meet),backgroundColor:"#4472c4",borderRadius:6,maxBarThickness:22},
    {label:"Fail",data:causeRows.map(r=>r.fail),backgroundColor:"#ed7d31",borderRadius:6,maxBarThickness:22},
  ]},options:buildCartesianOptions({indexAxis:"y"})});
  dashboardCharts.summaryTeam = createChartInstance("dash-summary-team",{type:"bar",data:{labels:[...teamRows.map(r=>r.team),"SUM"],datasets:[
    {label:"Meet",data:[...teamRows.map(r=>r.meet),sumMonthly.meet],backgroundColor:"#4472c4"},
    {label:"Fail",data:[...teamRows.map(r=>r.fail),sumMonthly.fail],backgroundColor:"#ed7d31"},
    {type:"line",label:"MTTR",data:[...teamRows.map(r=>Math.min(Number(r.mttr.replace("%","")),100)),Math.min(Number(sumMonthly.mttr.replace("%","")),100)],borderColor:"#eab308",yAxisID:"y1",tension:0,pointRadius:3,borderWidth:2},
  ]},options:buildCartesianOptions({scales:{y:{beginAtZero:true},y1:{position:"right",min:0,max:110,grid:{drawOnChartArea:false},ticks:{stepSize:10,callback:v=>v<=100?`${v}%`:''}}}})});
}

// ── Data Sheet columns (live Firestore data) ────────────────────────────────
const DATA_SHEET_COLUMNS = [
  "Month", "FC No.", "Ticket No.", "Week",
  "Down Time", "Up time", "Down Time (Hrs.)",
  "NOC Alert", "NS Respond",
  "MTTR 4Hrs.", "MTTR 3Hrs.",
  "Number of Circuits", "Backbone/Access", "Within 3 Hrs.",
  "Delay by", "CID", "Customer/Trunk", "Detail", "Area",
  "Control / Uncontrol",
  "Sub-contractor Team 1", "Sub-contractor Team 2",
  "Sub-contractor Team 3", "Sub-contractor Team 4",
  "Cause of incident", "Prevention (แนวทางแก้ไข/ป้องกัน)",
  "Hop/Road", "Lat/Long", "Team", "สาเหตุหลัก",
];

function buildDataSheetRows(state) {
  const FINISH_STATUSES = ["NS_FINISH", "COMPLETE", "COMPLETED", "FINISHED", "CLOSED", "RESOLVED", "DONE"];
  // Also include items from corrective.other that have fiber workType (in case workType was missing on save)
  const allFiberSources = [
    ...(state.corrective?.fiber || []),
    ...(state.corrective?.other || []).filter(i => {
      const t = (i.workType || i.work_type || i.type || "").toLowerCase();
      return t.includes("fiber");
    }),
  ];
  const fiberFinished = allFiberSources.filter(
    inc => FINISH_STATUSES.includes((inc.status || "").toUpperCase())
  );

  function minsLabel(ms) {
    if (!ms || ms <= 0) return "-";
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins} Mins`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h} Hrs. ${m} Mins` : `${h} Hrs.`;
  }

  function toMonthShort(iso) {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short" });
  }

  function toWeek(iso) {
    const d = new Date(iso);
    return isNaN(d) ? "" : `W${Math.ceil(d.getDate() / 7)}`;
  }

  const rows = [];

  fiberFinished.forEach(incident => {
    const finishTimes = incident.nsFinish?.times || {};
    const finishDetails = incident.nsFinish?.details || {};
    const subs = Array.isArray(incident.nsFinish?.subcontractors) ? incident.nsFinish.subcontractors : [];

    const upTime = finishTimes.upTime || incident.completedAt || "";
    const createdAt = incident.createdAt || "";
    const respondedAt = incident.respondedAt || incident.timeline?.respondedAt || finishTimes.nsResponse || "";
    const networkType = incident.networkType || finishDetails.networkType || "";
    const delayBy = finishDetails.delayBy || incident.delayReason || "";
    const cause = finishDetails.cause || [...(incident.updates || [])].reverse().find(u => u.cause)?.cause || "";
    const area = finishDetails.area || [...(incident.updates || [])].reverse().find(u => u.area)?.area || "";
    const latlng = finishDetails.latlng || [...(incident.updates || [])].reverse().find(u => u.latlng)?.latlng || "";

    // Pending time: try array of logs first, then single stop/start pair from nsFinish.times
    const logs = incident.clockStartStopLogs;
    let pendingMs = 0;
    if (Array.isArray(logs) && logs.length) {
      pendingMs = calculatePendingTime(logs);
    } else if (finishTimes.stopClock && finishTimes.startClock) {
      pendingMs = calculatePendingTime([{ stop: finishTimes.stopClock, start: finishTimes.startClock }]);
    }

    const tickets = (Array.isArray(incident.tickets) && incident.tickets.length)
      ? incident.tickets
      : [{ symphonyTicket: "", cid: "", downTime: createdAt, originate: "", terminate: "" }];
    const numCircuits = tickets.length;

    tickets.forEach(ticket => {
      const downTime = ticket.downTime || createdAt;
      const downMs = downTime ? new Date(downTime).getTime() : 0;
      const upMs = upTime ? new Date(upTime).getTime() : 0;
      const totalMs = (upMs > downMs && downMs > 0) ? (upMs - downMs) : 0;
      const durationMs = Math.max(0, totalMs - pendingMs);
      const durationHrs = durationMs / 3600000;

      const createdMs = createdAt ? new Date(createdAt).getTime() : 0;
      const nocAlertMs = (createdMs > 0 && downMs > 0 && createdMs >= downMs) ? (createdMs - downMs) : 0;

      const respondMs = respondedAt ? new Date(respondedAt).getTime() : 0;
      const nsRespondMs = (respondMs > 0 && downMs > 0 && respondMs >= downMs) ? (respondMs - downMs) : 0;

      const hasUp = Boolean(upTime);
      const mttr4 = hasUp ? (durationHrs <= 4 ? "MTTR 4Hrs. Meet" : "MTTR 4Hrs. Fail") : "";
      const mttr3 = hasUp ? (durationHrs <= 3 ? "MTTR 3Hrs. Meet" : "MTTR 3Hrs. Fail") : "";
      const within3 = hasUp ? (durationHrs <= 3 ? "Within 3 Hrs." : "") : "";
      const controlUncontrol = delayBy
        ? (delayBy === "Noc Alert ช้า" ? "Control" : "Uncontrol")
        : (durationHrs <= 3 ? "Control" : "Uncontrol");

      rows.push({
        "Month": toMonthShort(downTime),
        "FC No.": incident.incidentId || incident.id || "",
        "Ticket No.": ticket.symphonyTicket || ticket.ticket || "",
        "Week": toWeek(downTime),
        "Down Time": downTime,
        "Up time": upTime,
        "Down Time (Hrs.)": durationMs > 0 ? minsLabel(durationMs) : "-",
        "NOC Alert": nocAlertMs > 0 ? minsLabel(nocAlertMs) : "-",
        "NS Respond": nsRespondMs > 0 ? minsLabel(nsRespondMs) : "-",
        "MTTR 4Hrs.": mttr4,
        "MTTR 3Hrs.": mttr3,
        "Number of Circuits": String(numCircuits),
        "Backbone/Access": networkType,
        "Within 3 Hrs.": within3,
        "Delay by": delayBy,
        "CID": ticket.cid || "",
        "Customer/Trunk": ticket.originate || ticket.terminate || "",
        "Detail": finishDetails.repairText || "",
        "Area": area,
        "Control / Uncontrol": controlUncontrol,
        "Sub-contractor Team 1": subs[0] || "",
        "Sub-contractor Team 2": subs[1] || "",
        "Sub-contractor Team 3": subs[2] || "",
        "Sub-contractor Team 4": subs[3] || "",
        "Cause of incident": cause,
        "Prevention (แนวทางแก้ไข/ป้องกัน)": finishDetails.prevention || "",
        "Hop/Road": area,
        "Lat/Long": latlng,
        "Team": "",
        "สาเหตุหลัก": cause,
      });
    });
  });

  rows.sort((a, b) => new Date(b["Down Time"]) - new Date(a["Down Time"]));
  return rows;
}

function renderDashboardDetailsView(state) {
  const container = document.getElementById("view-dashboard-details");
  if (!container) return;

  const rows = buildDataSheetRows(state);
  if (!rows.length) {
    container.innerHTML = `<div class="glass-card p-8 text-center text-slate-500">No data found</div>`;
    return;
  }

  const search = normalizeSheetText(document.getElementById("details-search")?.value || "");
  const region = document.getElementById("details-filter-region")?.value || "all";
  const contractor = document.getElementById("details-filter-contractor")?.value || "all";
  const slaGroup = document.getElementById("details-filter-sla")?.value || "all";
  const sortMode = document.getElementById("details-sort-mttr")?.value || "asc";
  const page = state.ui?.dashboardDetailsPage || 1;
  const pageSize = 10;

  const mapped = rows.map((row) => {
    const teams = [
      pickRowValue(row, ["Sub-contractor Team 1"]),
      pickRowValue(row, ["Sub-contractor Team 2"]),
      pickRowValue(row, ["Sub-contractor Team 3"]),
      pickRowValue(row, ["Sub-contractor Team 4"]),
    ].filter((x) => String(x || "").trim());
    return {
      incidentId: pickRowValue(row, ["FC No.", "Incident ID", "incidentId"]),
      region: pickRowValue(row, ["Area", "Region", "region"]),
      contractor: teams.join(", ") || pickRowValue(row, ["Contractor", "contractor"]),
      networkType: pickRowValue(row, ["Backbone/Access", "Network Type", "networkType"]),
      slaGroup: pickRowValue(row, ["Within 3 Hrs.", "SLA Group", "slaGroup"]),
      startTime: pickRowValue(row, ["Down Time", "Start Time", "startTime"]),
      finishTime: pickRowValue(row, ["Up time", "Finish Time", "finishTime"]),
      mttr: pickRowValue(row, ["Down Time (Hrs.)", "MTTR", "mttr"]),
      status: pickRowValue(row, ["MTTR 3Hrs.", "Status", "status3", "status"]),
      raw: row,
    };
  });

  const allColumns = DATA_SHEET_COLUMNS;


  const regionOpts = [...new Set(mapped.map((item) => String(item.region || "-").trim() || "-"))];
  const sortMttrSafe = (value) => {
    if (typeof toSortableMttr === "function") {
      return toSortableMttr(value);
    }
    const parsed = Number(String(value || "").replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
  };

  const filtered = mapped
    .filter((item) => (region === "all" ? true : String(item.region || "-") === region))
    .filter((item) => (contractor === "all" ? true : String(item.contractor || "-") === contractor))
    .filter((item) => (slaGroup === "all" ? true : String(item.slaGroup || "-") === slaGroup))
    .filter((item) => {
      if (!search) return true;
      return normalizeSheetText(Object.values(item).join(" ")).includes(search);
    })
    .sort((a, b) => {
      const delta = sortMttrSafe(a.mttr) - sortMttrSafe(b.mttr);
      return sortMode === "desc" ? -delta : delta;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  atomicHTMLUpdate(container, `
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <h2 class="text-2xl font-bold text-slate-800">Details</h2>
        <div class="text-sm text-slate-500">Total: ${filtered.length} items</div>
      </div>
      <div class="glass-card p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <input id="details-search" class="bg-slate-100 rounded-lg px-3 py-2 text-sm" placeholder="Search..." value="${escapeHtml(document.getElementById("details-search")?.value || "")}">
        <select id="details-filter-region" class="bg-slate-100 rounded-lg px-3 py-2 text-sm">
          <option value="all">All Regions</option>
          ${regionOpts.map((item) => `<option value="${escapeHtml(item)}" ${item === region ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
        </select>
        <select id="details-filter-contractor" class="bg-slate-100 rounded-lg px-3 py-2 text-sm">
          <option value="all">All Contractors</option>
          ${[...new Set(mapped.map(m => m.contractor).filter(Boolean))].map((item) => `<option value="${escapeHtml(item)}" ${item === contractor ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
        </select>
        <select id="details-filter-sla" class="bg-slate-100 rounded-lg px-3 py-2 text-sm">
          <option value="all">All SLA Groups</option>
          ${[...new Set(mapped.map(m => m.slaGroup).filter(Boolean))].map((item) => `<option value="${escapeHtml(item)}" ${item === slaGroup ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
        </select>
        <select id="details-sort-mttr" class="bg-slate-100 rounded-lg px-3 py-2 text-sm">
          <option value="asc" ${sortMode === "asc" ? "selected" : ""}>MTTR Low to High</option>
          <option value="desc" ${sortMode === "desc" ? "selected" : ""}>MTTR High to Low</option>
        </select>
      </div>
      <div class="glass-card overflow-auto">
        <table class="w-full text-sm text-left min-w-[2200px]">
          <thead class="bg-slate-50 text-slate-500 uppercase text-[10px]"><tr>
            ${allColumns.map((col) => `<th class="px-4 py-3 whitespace-nowrap">${escapeHtml(col)}</th>`).join("")}
          </tr></thead>
          <tbody class="divide-y divide-slate-100 bg-white">
            ${pageRows.map((item) => `<tr>${allColumns.map((col) => `<td class="px-4 py-3 whitespace-nowrap align-top">${escapeHtml(formatDetailsCellValue(col, item.raw?.[col], item.raw || {}))}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${allColumns.length || 1}" class="px-4 py-5 text-center text-slate-400">No data found</td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="flex items-center justify-end gap-2 p-4">
        <button id="details-prev" class="px-3 py-2 rounded-lg bg-slate-100 text-sm" ${safePage <= 1 ? "disabled" : ""}>Prev</button>
        <span class="text-sm text-slate-500">Page ${safePage}/${totalPages}</span>
        <button id="details-next" class="px-3 py-2 rounded-lg bg-slate-100 text-sm" ${safePage >= totalPages ? "disabled" : ""}>Next</button>
        <input id="details-page" type="hidden" value="${safePage}">
      </div>
    `);

  ["details-search", "details-filter-region", "details-filter-contractor", "details-filter-sla", "details-sort-mttr"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", () => renderDashboardDetailsView(Store.getState()));
    if (el) el.addEventListener("change", () => renderDashboardDetailsView(Store.getState()));
  });
  const prev = document.getElementById("details-prev");
  if (prev) prev.addEventListener("click", () => { Store.dispatch(s => ({ ...s, ui: { ...s.ui, dashboardDetailsPage: Math.max(1, safePage - 1) } })); renderDashboardDetailsView(Store.getState()); });
  const next = document.getElementById("details-next");
  if (next) next.addEventListener("click", () => { Store.dispatch(s => ({ ...s, ui: { ...s.ui, dashboardDetailsPage: Math.min(totalPages, safePage + 1) } })); renderDashboardDetailsView(Store.getState()); });

}
function renderSearchIncidentView(state) {
  const container = document.getElementById("view-dashboard-details");
  if (!container) return;

  const rows = buildDataSheetRows(state);

  const filters = {
    incidentNumber: (document.getElementById("incident-filter-number")?.value || "").trim(),
    customerName: (document.getElementById("incident-filter-customer")?.value || "").trim(),
    ticketNo: (document.getElementById("incident-filter-ticket")?.value || "").trim(),
    cid: (document.getElementById("incident-filter-cid")?.value || "").trim(),
    fromDate: (document.getElementById("incident-filter-from")?.value || "").trim(),
    toDate: (document.getElementById("incident-filter-to")?.value || "").trim(),
    status: document.getElementById("incident-filter-status")?.value || "all",
    createdBy: (document.getElementById("incident-filter-created-by")?.value || "").trim(),
    tableSearch: (document.getElementById("incident-table-search")?.value || "").trim(),
    page: Store.getState().ui?.searchIncidentPage || 1,
    editTicketNo: (document.getElementById("incident-edit-ticket")?.value || "").trim(),

  };
  const statusOptions = ["New", "Open", "Assigned", "In Progress", "Pending", "Resolve", "Close"];
  const parseDateValue = (value) => {
    if (!value) return null;
    const isoLike = String(value).replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1");
    const parsed = new Date(isoLike);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const mapStatus = (raw = "") => {
    const text = String(raw || "").trim();
    if (!text) return "Open";
    const norm = normalizeSheetText(text);
    if (norm.includes("new")) return "New";
    if (norm.includes("assign")) return "Assigned";
    if (norm.includes("progress")) return "In Progress";
    if (norm.includes("pending")) return "Pending";
    if (norm.includes("resolve")) return "Resolve";
    if (norm.includes("close") || norm.includes("complete") || norm.includes("meet")) return "Close";
    if (norm.includes("open")) return "Open";
    return text;
  };
  const mapped = rows.map((row) => {
    const downTime = pickRowValue(row, ["Down Time", "Start Time", "downTime"]);
    const upTime = pickRowValue(row, ["Up time", "Finish Time", "upTime"]);
    const status = mapStatus(pickRowValue(row, ["Ticket Status", "STATUS", "Status", "MTTR 3Hrs.", "MTTR 4Hrs."]));
    const incidentDate = parseDateValue(downTime) || parseDateValue(upTime);
    const ticketNo = pickRowValue(row, ["Ticket No.", "ticketNo"]);
    const incidentNumber = pickRowValue(row, ["FC No.", "Incident Number", "incidentId"]);

    return {
      type: "INCIDENT",
      actionLabel: "Edit",
      ticketNo,
      incidentNumber,
      cid: pickRowValue(row, ["CID", "cid"]),
      slaEffect: pickRowValue(row, ["Within 3 Hrs.", "MTTR 3Hrs.", "SLA Effect"]),
      bandwidth: pickRowValue(row, ["Number of Circuits", "Bandwidth", "bandwidth"]),
      node: pickRowValue(row, ["Column T", "Node", "nodeEffect"]),
      port: pickRowValue(row, ["Port", "port"]),
      customerName: pickRowValue(row, ["Customer/Trunk", "Customer", "customerName"]),
      siteEffect: pickRowValue(row, ["Area", "siteEffect"]),
      status,
      downTime,
      upTime,
      totalDowntime: pickRowValue(row, ["Down Time (Hrs.)", "Total Downtime", "totalDowntime"]),
      pendingStart: pickRowValue(row, ["Pending Start", "pendingStart"]),
      pendingStop: pickRowValue(row, ["Pending Stop", "pendingStop"]),
      pendingTime: pickRowValue(row, ["Pending Time", "pendingTime"]),
      durationTime: pickRowValue(row, ["Period Time", "Duration Time", "durationTime"]),
      createdBy: pickRowValue(row, ["Sub-contractor Team 1", "Team", "createdBy"]),
      modifyBy: pickRowValue(row, ["Sub-contractor Team 2", "modifyBy"]),
      openBy: pickRowValue(row, ["Open By", "openBy"]),
      closeBy: pickRowValue(row, ["Close By", "closeBy"]),
      incidentDate,
    };
  });
  const fromDate = parseDateValue(filters.fromDate);
  const toDate = parseDateValue(filters.toDate);
  const filtered = mapped
    .filter((item) => !filters.incidentNumber || normalizeSheetText(item.incidentNumber).includes(normalizeSheetText(filters.incidentNumber)))
    .filter((item) => !filters.customerName || normalizeSheetText(item.customerName).includes(normalizeSheetText(filters.customerName)))
    .filter((item) => !filters.ticketNo || normalizeSheetText(item.ticketNo).includes(normalizeSheetText(filters.ticketNo)))
    .filter((item) => !filters.cid || normalizeSheetText(item.cid).includes(normalizeSheetText(filters.cid)))
    .filter((item) => !filters.createdBy || normalizeSheetText(item.createdBy).includes(normalizeSheetText(filters.createdBy)))
    .filter((item) => (filters.status === "all" ? true : normalizeSheetText(item.status) === normalizeSheetText(filters.status)))
    .filter((item) => {
      if (!fromDate && !toDate) return true;
      if (!item.incidentDate) return false;
      if (fromDate && item.incidentDate < fromDate) return false;
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        if (item.incidentDate > end) return false;
      }
      return true;
    })
    .filter((item) => !filters.tableSearch || normalizeSheetText(Object.values(item).join(" ")).includes(normalizeSheetText(filters.tableSearch)));


  const pageSize = 15;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, Number.isFinite(filters.page) ? filters.page : 1), totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pageRows = filtered.slice(startIndex, startIndex + pageSize);
  const showingFrom = filtered.length ? startIndex + 1 : 0;
  const showingTo = filtered.length ? Math.min(startIndex + pageRows.length, filtered.length) : 0;

  const selectedItem = filtered.find((item) => String(item.ticketNo || "") === String(filters.editTicketNo || "")) || null;

  // โหลด remark ที่บันทึกไว้ก่อนหน้า
  const REMARK_STORE_KEY = "noc-search-remarks";
  const savedRemarks = (() => { try { return JSON.parse(localStorage.getItem(REMARK_STORE_KEY) || "{}"); } catch { return {}; } })();

  const renderEditPanel = (item) => {
    if (!item) return "";
    const savedRemark = savedRemarks[item.ticketNo || ""] || "";
    return `
        <div class="mt-4 border border-slate-200 rounded-xl bg-white overflow-hidden" id="search-edit-panel">
          <div class="p-4 md:p-5 border-b border-slate-200 bg-slate-50">
            <div class="text-3xl font-semibold text-slate-700">INCIDENT NUMBER . ${escapeHtml(item.incidentNumber || "-")}</div>
            <div class="text-lg text-slate-600 mt-1">TICKET NO : ${escapeHtml(item.ticketNo || "-")}</div>
            <div class="text-xs text-slate-500 mt-1">CUSTOMER NAME : ${escapeHtml(item.customerName || "-")}</div>
          </div>
          <div class="p-4 md:p-5 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div><label class="block text-slate-500 mb-1">CID:</label><input id="edit-panel-cid" class="w-full border border-slate-300 rounded px-2 py-2" value="${escapeHtml(item.cid || "")}"></div>
            <div><label class="block text-slate-500 mb-1">ORIGINATE SITE:</label><input id="edit-panel-originate" class="w-full border border-slate-300 rounded px-2 py-2" value="${escapeHtml(item.node || "")}"></div>
            <div><label class="block text-slate-500 mb-1">TERMINATE SITE:</label><input id="edit-panel-terminate" class="w-full border border-slate-300 rounded px-2 py-2" value="${escapeHtml(item.siteEffect || "")}"></div>
            <div><label class="block text-slate-500 mb-1">DOWNTIME</label><input id="edit-panel-downtime" class="w-full border border-slate-300 rounded px-2 py-2" value="${escapeHtml(item.downTime || "")}"></div>
            <div><label class="block text-slate-500 mb-1">UPTIME</label><input id="edit-panel-uptime" class="w-full border border-slate-300 rounded px-2 py-2" value="${escapeHtml(item.upTime || "")}"></div>
            <div><label class="block text-slate-500 mb-1">ALARM TYPE:</label><input id="edit-panel-alarm" class="w-full border border-slate-300 rounded px-2 py-2" value="${escapeHtml(item.status || "")}"></div>
            <div><label class="block text-slate-500 mb-1">PLAN TYPE:</label><input id="edit-panel-plan" class="w-full border border-slate-300 rounded px-2 py-2" value="New"></div>
            <div><label class="block text-slate-500 mb-1">STATUS:</label><input id="edit-panel-status" class="w-full border border-slate-300 rounded px-2 py-2" value="Actual"></div>
            <div><label class="block text-slate-500 mb-1">BANDWITH:</label><input id="edit-panel-bandwidth" class="w-full border border-slate-300 rounded px-2 py-2" value="${escapeHtml(item.bandwidth || "")}"></div>
          </div>
          <div class="px-4 md:px-5 pb-5">
            <label class="block text-xs text-slate-500 mb-1">REMARK:</label>
            <textarea id="edit-panel-remark" class="w-full border border-slate-300 rounded px-2 py-2 h-20">${escapeHtml(savedRemark)}</textarea>
            <div class="flex justify-end mt-3">
              <button id="btn-edit-panel-save" data-ticket-no="${escapeHtml(item.ticketNo || "")}" class="rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2">Save Data</button>
            </div>
          </div>
        </div>
      `;
  };
  const pageButtons = Array.from({ length: totalPages }, (_, i) => i + 1)
    .map((pageNo) => `<button data-page="${pageNo}" class="incident-page-btn rounded border px-2 py-0.5 ${pageNo === safePage ? "border-indigo-500 text-indigo-600 bg-indigo-50" : "border-slate-200 text-slate-500"}">${pageNo}</button>`)
    .join("");

  atomicHTMLUpdate(container, `
      <div class="glass-card p-4 md:p-5">
        <div class="flex items-center justify-between gap-3 flex-wrap border-b border-slate-200 pb-3">

          <div>
            <h2 class="text-base md:text-lg font-semibold text-slate-700 tracking-wide">SEARCH INCIDENT</h2>
            <p class="text-[11px] text-slate-500 mt-0.5">Search incident data, tracking, troubleshooting and inquiries</p>
          </div>
          <div class="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1 text-[11px] font-semibold text-slate-600">
            <span class="px-2.5 py-1 rounded-md bg-white shadow-sm">TICKET</span>
            <span class="px-2.5 py-1 rounded-md">INCIDENT</span>
          </div>
        </div>

        <div class="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2.5">
          <div><label class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Incident Number:</label><input id="incident-filter-number" class="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs" value="${escapeHtml(filters.incidentNumber)}"></div>
          <div><label class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Customer Name:</label><input id="incident-filter-customer" class="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs" value="${escapeHtml(filters.customerName)}"></div>
          <div><label class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Ticket No:</label><input id="incident-filter-ticket" class="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs" value="${escapeHtml(filters.ticketNo)}"></div>
          <div><label class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">CID:</label><input id="incident-filter-cid" class="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs" value="${escapeHtml(filters.cid)}"></div>
        </div>

        <div class="mt-2.5 grid grid-cols-1 md:grid-cols-8 gap-2.5 items-end">
          <div class="md:col-span-2"><label class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">From Date:</label><input id="incident-filter-from" type="date" class="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs" value="${escapeHtml(filters.fromDate)}"></div>
          <div class="md:col-span-2"><label class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">To Date:</label><input id="incident-filter-to" type="date" class="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs" value="${escapeHtml(filters.toDate)}"></div>
          <div class="md:col-span-2"><label class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Ticket Status:</label><select id="incident-filter-status" class="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs"><option value="all" ${filters.status === "all" ? "selected" : ""}>All</option>${statusOptions.map((status) => `<option value="${escapeHtml(status)}" ${filters.status === status ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}</select></div>
          <div class="md:col-span-2"><label class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Created By:</label><input id="incident-filter-created-by" class="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs" value="${escapeHtml(filters.createdBy)}"></div>
        </div>

        <div class="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <div class="text-xs text-slate-500">Total: ${filtered.length} items</div>
          <button id="incident-search-btn" class="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition">Search Ticket</button>
        </div>
        ${renderEditPanel(selectedItem)}
        <div class="mt-4 rounded-xl border border-slate-200 overflow-hidden bg-white">
          <div class="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50/80">
            <div class="flex items-center gap-2 text-xs text-slate-500"><span>Show</span><span class="rounded border border-slate-200 px-2 py-0.5 bg-white">15</span><span>entries</span></div>
            <div class="flex items-center gap-2 text-xs"><span class="text-slate-500">Search:</span><input id="incident-table-search" class="rounded-md border border-slate-200 px-2 py-1 text-xs" value="${escapeHtml(filters.tableSearch)}" placeholder="Search in table"></div>
          </div>
          <div class="overflow-auto">
           <table class="w-full text-xs text-left min-w-[2350px]">
              <thead class="bg-slate-100 text-slate-600 uppercase tracking-wide"><tr>
                <th class="px-3 py-2 whitespace-nowrap">Action</th>
                <th class="px-3 py-2 whitespace-nowrap">Type</th>
                <th class="px-3 py-2 whitespace-nowrap">SLA</th>
                <th class="px-3 py-2 whitespace-nowrap">Incident</th>
                <th class="px-3 py-2 whitespace-nowrap">Ticket No</th>
                <th class="px-3 py-2 whitespace-nowrap">CID</th>
                <th class="px-3 py-2 whitespace-nowrap">SLA Effect</th>
                <th class="px-3 py-2 whitespace-nowrap">Bandwidth</th>
                <th class="px-3 py-2 whitespace-nowrap">Node</th>
                <th class="px-3 py-2 whitespace-nowrap">Port</th>
                <th class="px-3 py-2 whitespace-nowrap">Customer Name</th>
                <th class="px-3 py-2 whitespace-nowrap">Site Effect</th>
                <th class="px-3 py-2 whitespace-nowrap">Status</th>
                <th class="px-3 py-2 whitespace-nowrap">Downtime</th>
                <th class="px-3 py-2 whitespace-nowrap">Uptime</th>
                <th class="px-3 py-2 whitespace-nowrap">Total Downtime</th>
                <th class="px-3 py-2 whitespace-nowrap">Pending Start</th>
                <th class="px-3 py-2 whitespace-nowrap">Pending Stop</th>
                <th class="px-3 py-2 whitespace-nowrap">Pending Time</th>
                <th class="px-3 py-2 whitespace-nowrap">Duration Time</th>
                <th class="px-3 py-2 whitespace-nowrap">By</th>
                <th class="px-3 py-2 whitespace-nowrap">Modify By</th>
                <th class="px-3 py-2 whitespace-nowrap">Open By</th>
                <th class="px-3 py-2 whitespace-nowrap">Close By</th>
              </tr></thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                ${pageRows.map((item) => `
                  <tr class="${item.status === "Close" || item.status === "Resolve" ? "bg-emerald-100/70" : "bg-white"} hover:bg-indigo-50/40 transition-colors">
                    <td class="px-3 py-2 whitespace-nowrap"><button class="incident-edit-btn inline-flex items-center text-sky-700 hover:text-sky-900 text-xs font-semibold" data-ticket-no="${escapeHtml(item.ticketNo || "")}">✎ Edit</button></td>
                    <td class="px-3 py-2 whitespace-nowrap"><span class="inline-flex rounded bg-blue-600 text-white px-2 py-0.5 text-[10px] font-semibold">${escapeHtml(item.type || "INCIDENT")}</span></td>
                    <td class="px-3 py-2 whitespace-nowrap ${item.slaEffect ? "bg-rose-100/60" : ""}">${escapeHtml(item.slaEffect ? "Yes" : "")}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(item.incidentNumber || "-")}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(item.ticketNo || "-")}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(item.cid || "-")}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(item.slaEffect || "-")}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(item.bandwidth || "-")}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(item.node || "-")}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(item.port || "-")}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(item.customerName || "-")}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(item.siteEffect || "-")}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(item.status || "Open")}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(item.downTime || "-")}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(item.upTime || "-")}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(item.totalDowntime || "-")}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(item.pendingStart || "-")}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(item.pendingStop || "-")}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(item.pendingTime || "-")}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(item.durationTime || "-")}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(item.createdBy || "-")}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(item.modifyBy || "-")}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(item.openBy || "-")}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(item.closeBy || "-")}</td>
                    </tr>
                `).join("") || `<tr><td colspan="24" class="px-4 py-5 text-center text-slate-400">No data found</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="flex items-center justify-between px-3 py-2 border-t border-slate-100 text-[10px] text-slate-500 bg-white">
           <span>Showing ${showingFrom} to ${showingTo} of ${filtered.length} entries</span>
            <div class="inline-flex items-center gap-1">
              <button id="incident-prev" class="rounded border border-slate-200 px-2 py-0.5 text-slate-500" ${safePage <= 1 ? "disabled" : ""}>Previous</button>
              ${pageButtons}
              <button id="incident-next" class="rounded border border-slate-200 px-2 py-0.5 text-slate-500" ${safePage >= totalPages ? "disabled" : ""}>Next</button>
            </div>
          </div>
        </div>
        <input id="incident-page" type="hidden" value="${safePage}">
        <input id="incident-edit-ticket" type="hidden" value="${escapeHtml(filters.editTicketNo)}">
      </div>
    `);
  const rerenderAndResetPage = () => {
    Store.dispatch(s => ({ ...s, ui: { ...s.ui, searchIncidentPage: 1 } }));
    renderSearchIncidentView(Store.getState());
  };

  [
    "incident-filter-number",
    "incident-filter-customer",
    "incident-filter-ticket",
    "incident-filter-cid",
    "incident-filter-from",
    "incident-filter-to",
    "incident-filter-status",
    "incident-filter-created-by",
    "incident-table-search",
  ].forEach((id) => {

    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", rerenderAndResetPage);
    el.addEventListener("change", rerenderAndResetPage);
  });
  const searchBtn = document.getElementById("incident-search-btn");
  if (searchBtn) searchBtn.addEventListener("click", rerenderAndResetPage);

  const prevBtn = document.getElementById("incident-prev");
  if (prevBtn) prevBtn.addEventListener("click", () => {
    Store.dispatch(s => ({ ...s, ui: { ...s.ui, searchIncidentPage: Math.max(1, safePage - 1) } }));
    renderSearchIncidentView(Store.getState());
  });

  const nextBtn = document.getElementById("incident-next");
  if (nextBtn) nextBtn.addEventListener("click", () => {
    Store.dispatch(s => ({ ...s, ui: { ...s.ui, searchIncidentPage: Math.min(totalPages, safePage + 1) } }));
    renderSearchIncidentView(Store.getState());
  });

  container.querySelectorAll(".incident-page-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pageNo = Number(btn.dataset.page || 1);
      Store.dispatch(s => ({ ...s, ui: { ...s.ui, searchIncidentPage: pageNo } }));
      renderSearchIncidentView(Store.getState());
    });
  });

  container.querySelectorAll(".incident-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ticket = btn.dataset.ticketNo || "";
      const editEl = document.getElementById("incident-edit-ticket");
      if (editEl) editEl.value = ticket;
      renderSearchIncidentView(Store.getState());
    });
  });

  const saveEditPanelBtn = document.getElementById("btn-edit-panel-save");
  if (saveEditPanelBtn) {
    saveEditPanelBtn.addEventListener("click", () => {
      const ticketNo = saveEditPanelBtn.dataset.ticketNo || "";
      if (!ticketNo) return;
      const remarks = (() => { try { return JSON.parse(localStorage.getItem(REMARK_STORE_KEY) || "{}"); } catch { return {}; } })();
      remarks[ticketNo] = document.getElementById("edit-panel-remark")?.value || "";
      localStorage.setItem(REMARK_STORE_KEY, JSON.stringify(remarks));
      if (window.NotificationUI) {
        NotificationUI.show("Remark saved", "success");
      } else {
        alert("Remark saved");
      }
    });
  }
}

function getAllCorrectiveIncidents(state) {
  return [
    ...(state.corrective.fiber || []),
    ...(state.corrective.equipment || []),
    ...(state.corrective.other || []),
  ];
}

function getZoneByTeam(team) {
  // ดึงจาก Settings ก่อน (subcontractors มี zone field)
  const subs = window.NocSettings?.get()?.teams?.subcontractors || [];
  const found = subs.find(s => s.name === team);
  if (found?.zone) return found.zone;

  // fallback hardcode
  const zoneMap = {
    "TAS (Zone1)": "Zone 1",
    BAN: "Zone 1",
    "TAS (Zone2)": "Zone 2",
    JL: "Zone 2",
    ATG: "Zone 3",
    TP: "Zone 3",
    NPY: "Zone 4",
    "JJ&A": "Zone 4",
  };

  return zoneMap[team] || "-";
}

// ===== SUBCONTRACTOR PERIOD FILTER =====
window._subPeriod = window._subPeriod || "monthly";
window._subDailyDate = window._subDailyDate || new Date().toISOString().slice(0, 10);
window._subWeek = window._subWeek || Math.ceil(new Date().getDate() / 7);
window._subMonth = window._subMonth !== undefined ? window._subMonth : new Date().getMonth();
window._subYear = window._subYear || new Date().getFullYear();

function getSubPeriodRange() {
  const now = new Date();
  const p = window._subPeriod;
  if (p === "daily") {
    const d = new Date(window._subDailyDate + "T00:00:00");
    const end = new Date(d); end.setDate(end.getDate() + 1);
    return { start: d, end };
  }
  if (p === "weekly") {
    // W1-W4 of current month
    const w = window._subWeek; // 1-4
    const year = now.getFullYear(), month = now.getMonth();
    const dayStart = (w - 1) * 7 + 1;
    const start = new Date(year, month, dayStart, 0, 0, 0);
    const end = new Date(year, month, dayStart + 7, 0, 0, 0);
    return { start, end };
  }
  if (p === "monthly") {
    const m = window._subMonth;
    const y = now.getFullYear();
    return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
  }
  if (p === "yearly") {
    const y = window._subYear;
    return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
  }
  return null;
}

function filterIncidentsByPeriod(incidents) {
  const range = getSubPeriodRange();
  if (!range) return incidents;
  return incidents.filter((inc) => {
    const raw = inc.createdAt || inc.tickets?.[0]?.downTime || inc.actionDate || inc.updatedAt;
    if (!raw) return false;
    const t = new Date(raw).getTime();
    return t >= range.start.getTime() && t < range.end.getTime();
  });
}

function computeSubcontractorStats(state) {
  // Subcontractor Hub tracks Fiber workType jobs only
  const allFiber = filterIncidentsByPeriod(state.corrective?.fiber || []);

  // Helper: collect all subcontractors from updates + nsFinish
  const getSubs = (item) => [
    ...(item.nsFinish?.subcontractors || []),
    ...(item.updates || []).flatMap((u) => u.subcontractors || []),
  ].filter(Boolean);

  const ACTIVE_STATUSES = ["RESPONDED", "CORRECTIVE", "ACTION", "IN_PROGRESS", "PROCESS", "ASSIGN", "ASSIGNED"];
  const FINISH_STATUSES = ["NS_FINISH", "COMPLETE", "FINISHED", "CLOSED", "RESOLVED", "DONE"];
  const CANCEL_STATUSES = ["CANCEL", "CANCELLED"];

  // New Job = Fiber หลัง Response, ยังไม่ได้เลือก subcontractor
  const newJob = allFiber.filter((item) => {
    const status = (item.status || "").toUpperCase();
    return ACTIVE_STATUSES.includes(status) && getSubs(item).length === 0;
  }).length;

  // Assign Job = เลือก subcontractor แล้ว, ยังไม่มี update
  const assignJob = allFiber.filter((item) => {
    const status = (item.status || "").toUpperCase();
    return ACTIVE_STATUSES.includes(status) && getSubs(item).length > 0 && (item.updates || []).length === 0;
  }).length;

  // Inprocess = Update แล้ว (มี update อย่างน้อย 1 รายการ) ยังไม่เสร็จ
  const inProcess = allFiber.filter((item) => {
    const status = (item.status || "").toUpperCase();
    return ACTIVE_STATUSES.includes(status) && (item.updates || []).length > 0;
  }).length;

  // Finish = งานที่ Finish แล้ว (NS_FINISH, COMPLETE, ฯลฯ)
  const finish = allFiber.filter((item) => FINISH_STATUSES.includes((item.status || "").toUpperCase())).length;

  // Job Cancel = Assign Sub แล้วแต่ OFC ปกติ → ค่าเร่งด่วน
  const jobCancel = allFiber.filter((item) => {
    const status = (item.status || "").toUpperCase();
    return CANCEL_STATUSES.includes(status) && getSubs(item).length > 0;
  }).length;

  // MTTR: นับจาก Down Time ถึง Up Time ของ Finish items
  const completed = allFiber.filter((item) => FINISH_STATUSES.includes((item.status || "").toUpperCase()));
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
  const allFiber = filterIncidentsByPeriod(state.corrective?.fiber || []);
  const FINISH_STATUSES = ["NS_FINISH", "COMPLETE", "FINISHED", "CLOSED", "RESOLVED", "DONE"];
  const bucket = {};

  allFiber.forEach((incident) => {
    const finishSubs = incident.nsFinish?.subcontractors || [];
    const updateSubs = (incident.updates || []).flatMap((item) => item.subcontractors || []);
    const teams = [...new Set([...finishSubs, ...updateSubs].filter(Boolean))];

    teams.forEach((team) => {
      if (!bucket[team]) {
        bucket[team] = { name: team, totalJobs: 0, finish: 0, zone: getZoneByTeam(team) };
      }
      bucket[team].totalJobs += 1;
      if (FINISH_STATUSES.includes((incident.status || "").toUpperCase())) bucket[team].finish += 1;
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
      { label: "New Job", value: stats.newJob, sub: "Incoming jobs", accent: "tile-accent-blue" },
      { label: "Inprocess", value: stats.inProcess, sub: "In progress", accent: "tile-accent-orange" },
      { label: "Assign Job", value: stats.assignJob, sub: "Pending assignment", accent: "tile-accent-purple" },
      { label: "Finish", value: stats.finish, sub: "Completed", accent: "tile-accent-green" },
      { label: "Job Cancel", value: stats.jobCancel, sub: "Cancelled", accent: "tile-accent-purple" },
      { label: "MTTR", value: stats.mttr, sub: "Finished within 3 hrs", accent: "tile-accent-green" },
      { label: "Over MTTR", value: stats.overMttr, sub: "Finished over 3 hrs", accent: "tile-accent-orange" },
    ];

    statsGrid.className = "grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3 md:gap-6";
    atomicHTMLUpdate(statsGrid, cards
      .map(
        (card) => `
            <div class="glass-card p-3 md:p-6 ${card.accent}">
              <div class="text-[9px] md:text-xs font-bold uppercase text-slate-500 tracking-widest">${card.label}</div>
              <div class="mt-1 md:mt-2 text-slate-800" style="font-size:clamp(1.25rem,4vw,2rem);font-weight:900;line-height:1;font-variant-numeric:lining-nums tabular-nums;letter-spacing:-0.5px">${card.value}</div>
              <div class="text-[9px] md:text-xs text-slate-400 mt-1 md:mt-2 font-medium">${card.sub}</div>
            </div>
          `
      )
      .join(""));
  }

  // Pie chart: Meet / Control / Uncontrol
  const chartCanvas = document.getElementById("chartStatusSub");
  if (chartCanvas) {
    const meet = stats.mttr;
    const control = stats.inProcess + stats.assignJob + stats.newJob;
    const uncontrol = stats.overMttr;
    const total = meet + control + uncontrol;

    if (window._subPieChart) {
      window._subPieChart.destroy();
      window._subPieChart = null;
    }

    const wrap = chartCanvas.closest(".glass-card");
    if (wrap) {
      wrap.innerHTML = `<h4 class="font-bold mb-4">KPI Overview</h4><div class="h-64"><canvas id="chartStatusSub"></canvas></div>`;
    }

    const newCanvas = document.getElementById("chartStatusSub");
    if (newCanvas && total > 0) {
      window._subPieChart = new Chart(newCanvas, {
        type: "pie",
        data: {
          labels: ["Meet", "Control", "Uncontrol"],
          datasets: [{
            data: [meet, control, uncontrol],
            backgroundColor: ["#4CAF50", "#FF9800", "#FFC107"],
            borderWidth: 1,
            borderColor: "#fff",
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "top", labels: { font: { size: 12 } } },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.label}: ${ctx.raw} (${total ? Math.round(ctx.raw / total * 100) : 0}%)`,
              },
            },
          },
        },
      });
    } else if (newCanvas) {
      newCanvas.closest(".glass-card") && (newCanvas.closest(".glass-card").innerHTML += `<div class="text-center text-slate-400 text-sm mt-4">No data available</div>`);
    }
  }

  // Workload bar chart by subcontractor
  const chartWorkloadWrap = document.getElementById("chartWorkload")?.closest(".panel-body, .glass-card");
  if (chartWorkloadWrap) {
    if (window._subBarChart) {
      window._subBarChart.destroy();
      window._subBarChart = null;
    }
    chartWorkloadWrap.innerHTML = `<div class="chart-shell"><canvas id="chartWorkload"></canvas></div>`;
    const barCanvas = document.getElementById("chartWorkload");
    if (barCanvas && summary.length > 0) {
      window._subBarChart = new Chart(barCanvas, {
        type: "bar",
        data: {
          labels: summary.map(s => s.name),
          datasets: [
            { label: "Total", data: summary.map(s => s.totalJobs), backgroundColor: "#94a3b8" },
            { label: "Finish", data: summary.map(s => s.finish), backgroundColor: "#4CAF50" },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "top" } },
          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
        },
      });
    } else if (barCanvas) {
      chartWorkloadWrap.innerHTML += `<div class="text-center text-slate-400 text-sm mt-4">No data available</div>`;
    }
  }

  const tableBody = document.getElementById("sub-table-body");
  if (tableBody) {
    atomicHTMLUpdate(tableBody, summary.length
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
      : `<tr><td colspan="4" class="px-6 py-6 text-center text-slate-400">No subcontractor data yet</td></tr>`);
  }

  // ---- Period filter bar ----
  const periodBar = document.getElementById("sub-period-bar");
  const subSel = document.getElementById("sub-period-sub");

  const selectCls = "border-2 border-orange-300 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 bg-white focus:outline-none focus:border-orange-500 cursor-pointer";

  function renderSubSelector() {
    if (!subSel) return;
    const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const curYear = new Date().getFullYear();
    const years = Array.from({length: 6}, (_, i) => curYear - 2 + i);

    if (window._subPeriod === "daily") {
      subSel.innerHTML = `<input type="date" id="sub-daily-date" value="${window._subDailyDate}" class="${selectCls}">`;
      subSel.querySelector("#sub-daily-date")?.addEventListener("change", (e) => { window._subDailyDate = e.target.value; Store.dispatch(s => ({...s})); });
    } else if (window._subPeriod === "weekly") {
      subSel.innerHTML = `<select id="sub-week-sel" class="${selectCls}">
        ${[1,2,3,4].map(w => `<option value="${w}" ${window._subWeek===w?"selected":""}>Week ${w} (W${w})</option>`).join("")}
      </select>`;
      subSel.querySelector("#sub-week-sel")?.addEventListener("change", (e) => { window._subWeek = Number(e.target.value); Store.dispatch(s => ({...s})); });
    } else if (window._subPeriod === "monthly") {
      subSel.innerHTML = `<select id="sub-month-sel" class="${selectCls}">
        ${MONTHS.map((m, i) => `<option value="${i}" ${window._subMonth===i?"selected":""}>${m}</option>`).join("")}
      </select>`;
      subSel.querySelector("#sub-month-sel")?.addEventListener("change", (e) => { window._subMonth = Number(e.target.value); Store.dispatch(s => ({...s})); });
    } else if (window._subPeriod === "yearly") {
      subSel.innerHTML = `<select id="sub-year-sel" class="${selectCls}">
        ${years.map(y => `<option value="${y}" ${window._subYear===y?"selected":""}>${y}</option>`).join("")}
      </select>`;
      subSel.querySelector("#sub-year-sel")?.addEventListener("change", (e) => { window._subYear = Number(e.target.value); Store.dispatch(s => ({...s})); });
    } else {
      subSel.innerHTML = "";
    }
  }

  if (periodBar && !periodBar.dataset.bound) {
    periodBar.dataset.bound = "1";
    periodBar.querySelectorAll(".sub-period-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        window._subPeriod = btn.dataset.subPeriod;
        periodBar.querySelectorAll(".sub-period-btn").forEach((b) => {
          b.classList.remove("border-orange-400", "bg-orange-50");
          b.classList.add("border-slate-200", "bg-white");
          const divs = b.querySelectorAll("div");
          divs[0]?.classList.replace("text-orange-600", "text-slate-700");
          divs[1]?.classList.replace("text-orange-400", "text-slate-400");
        });
        btn.classList.add("border-orange-400", "bg-orange-50");
        btn.classList.remove("border-slate-200", "bg-white");
        const divs = btn.querySelectorAll("div");
        divs[0]?.classList.replace("text-slate-700", "text-orange-600");
        divs[1]?.classList.replace("text-slate-400", "text-orange-400");
        renderSubSelector();
        Store.dispatch(s => ({...s}));
      });
    });
  }
  renderSubSelector();
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
  const teamSel = document.getElementById("response-assigned-team");
  if (teamSel) teamSel.value = "";
  const noteEl = document.getElementById("response-note");
  if (noteEl) noteEl.value = "";
  openModal(responseModal);
});

if (cancelResponse) {
  cancelResponse.addEventListener("click", () => closeModal(responseModal));
}

if (saveResponse) {
  saveResponse.addEventListener("click", () => {
    const eta = document.querySelector('input[name="eta"]:checked');
    if (!eta) {
      alert("Please select ETA");
      return;
    }
    if (!responseWorkType?.value) {
      alert("Please select Work Type");
      return;
    }

    if (!responseIncidentId) {
      alert("Incident not found");
      return;
    }

    const workType = responseWorkType.value;
    const assignedTeam = document.getElementById("response-assigned-team")?.value || "";
    const responseNote = document.getElementById("response-note")?.value?.trim() || "";
    AlertService.responseAlert(responseIncidentId, eta.value, workType, assignedTeam, responseNote);
    closeModal(responseModal);

    // Navigate to corrective card
    const typeMap = { "Fiber": "fiber", "Equipment": "equipment" };
    const correctiveTab = typeMap[workType] || "other";
    Store.dispatch(state => ({
      ...state,
      ui: {
        ...state.ui,
        currentView: "corrective",
        activeCorrectiveTab: correctiveTab,
        selectedIncident: null,
        selectedAlerts: null,
      }
    }));
  });
}

// ===== CORRECTIVE MENU =====␊
document.querySelectorAll("#corrective-submenu [data-corrective-tab]").forEach((menu) => {
  menu.onclick = () => {
    const type = menu.dataset.correctiveTab;

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
  if (pageButton) {
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
    return;
  }

  const historyTarget = event.target.closest("[data-history-open-detail]");
  if (!historyTarget) return;

  if (event.target.closest(".btn-corrective-detail") || event.target.closest(".btn-corrective-report") || event.target.closest(".btn-history-detail")) {
    return;
  }
  openHistoryIncidentDetail(historyTarget.dataset.historyOpenDetail);
});

document.addEventListener("click", (event) => {
  const target = event.target.closest(".btn-history-detail");
  if (!target) return;
  openCorrectiveDetailModal(target.dataset.id);
});

function ensureCalendarCreateModal() {
  if (document.getElementById("modal-calendar-create")) return;

  document.body.insertAdjacentHTML("beforeend", `
      <div id="modal-calendar-create" class="modal-backdrop hidden">
        <div class="bg-white rounded-2xl w-full max-w-2xl p-6 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold text-slate-800">Create Calendar Job</h3>
            <button id="btn-close-calendar-create" class="px-3 py-1 bg-slate-100 rounded-lg">Close</button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="text-sm text-slate-600">Incident Number</label>
              <select id="calendar-incident-select" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2"></select>
            </div>
            <div>
              <label class="text-sm text-slate-600">Title</label>
              <input id="calendar-title" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2" placeholder="e.g. Site inspection">
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
              <label class="text-sm text-slate-600">👤 On-site Staff</label>
              <input id="calendar-onsite" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2" placeholder="e.g. Somchai, Nattapon">
            </div>
            <div>
              <label class="text-sm text-slate-600">👤 Receiver Staff</label>
              <input id="calendar-receiver" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2" placeholder="e.g. NOC Level 2">
            </div>
            <div class="md:col-span-2">
              <label class="text-sm text-slate-600">☎️ Contact</label>
              <input id="calendar-contact" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2" placeholder="e.g. 08x-xxx-xxxx">
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
            <button id="btn-close-calendar-detail" class="px-3 py-1 bg-slate-100 rounded-lg">Close</button>
          </div>
          <div id="calendar-detail-body" class="space-y-2 text-slate-700"></div>
          <div class="pt-3 border-t">
            <div class="text-sm font-semibold text-slate-700 mb-2">Manage Job</div>
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
          <h3 class="text-lg font-bold text-slate-800">Cancel Calendar Job</h3>
          <div>
            <label class="text-sm text-slate-600">Cancelled by</label>
            <select id="calendar-cancel-reporter" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2">
              <option value="NOC">NOC</option>
              <option value="On Site">On Site</option>
              <option value="Customer">Customer</option>
            </select>
          </div>
          <div>
            <label class="text-sm text-slate-600">Cancellation reason</label>
            <textarea id="calendar-cancel-reason" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2" rows="3" placeholder="Enter reason..."></textarea>
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
  const FINISHED = ["COMPLETE", "CLOSED", "FINISHED", "RESOLVED", "DONE", "NS_FINISH", "CANCEL", "CANCELLED", "COMPLETED"];

  // Active corrective incidents (any tab, not finished)
  const seen = new Set();
  const corrective = [
    ...(state.corrective.fiber || []),
    ...(state.corrective.equipment || []),
    ...(state.corrective.other || []),
  ].filter((item) => {
    const id = getIncidentKey(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return !FINISHED.includes(String(item.status || "").trim().toUpperCase());
  });

  // Active alert monitor incidents
  const alerts = (state.alerts || []).filter((item) => {
    const id = getIncidentKey(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return !FINISHED.includes(String(item.status || "").trim().toUpperCase());
  });

  return [...corrective, ...alerts];
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
    : '<option value="">No active incidents</option>';

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
      alert("No incident in PROCESS status");
      return;
    }

    const startAt = document.getElementById("calendar-start").value;
    const endAt = document.getElementById("calendar-end").value;
    if (!startAt || !endAt) {
      alert("Please select Start/End date and time");
      return;
    }

    if (new Date(endAt) <= new Date(startAt)) {
      alert("End time must be after Start time");
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
    alert(eventToEdit ? "Calendar job updated" : "Calendar job saved");
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
      <div><b>👤 On-site Staff :</b> ${eventData.onSiteStaff || "-"}</div>
      <div><b>👤 Receiver Staff :</b> ${eventData.receiverStaff || "-"}</div>
      <div><b>☎️ Contact :</b> ${eventData.contact || "-"}</div>
    `;

  document.getElementById("btn-calendar-action-open").onclick = () => {
    const found = getCorrectiveIncidentById(eventData.incidentId);
    closeModal(document.getElementById("modal-calendar-detail"));
    if (!found) {
      alert("Incident not found in Corrective");
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

  if (action === "set-filter") {
    const value = target.dataset.value || target.value || "all";
    Store.dispatch((state) => ({
      ...state,
      ui: { ...state.ui, calendarFilter: value },
    }));
    return;
  }

  if (action === "today") {
    Store.dispatch((state) => ({
      ...state,
      ui: { ...state.ui, calendarFocusDate: new Date().toISOString() },
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
  alert("Job cancelled successfully");
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

  const inc = found.incident;
  const baseFields = {
    incident: getIncidentKey(inc),
    incidentId: getIncidentKey(inc),
    alarm: inc.alarm || "Network Alert",
    detail: inc.detail || inc.latestUpdateMessage || "-",
    nocBy: inc.nocBy || "System",
    createdAt: inc.createdAt || new Date().toISOString(),
    status: inc.status,
    workType: inc.workType,
  };

  // Use nodeDetails (per-node ticket mapping saved at response time) if available.
  // Otherwise fall back to splitting the comma-joined node string with all tickets.
  let selectedAlerts;
  if (Array.isArray(inc.nodeDetails) && inc.nodeDetails.length) {
    selectedAlerts = inc.nodeDetails.map((nd) => ({
      ...baseFields,
      node: nd.node || "-",
      alarm: nd.alarm || baseFields.alarm,
      detail: nd.detail || baseFields.detail,
      tickets: nd.tickets || [],
    }));
  } else {
    const nodeList = String(inc.node || "").split(",").map(s => s.trim()).filter(Boolean);
    const allTickets = inc.tickets || [];
    if (nodeList.length > 1 && allTickets.length === nodeList.length) {
      // 1 ticket per node (most common OFC case) — distribute by index
      selectedAlerts = nodeList.map((nodeName, i) => ({
        ...baseFields, node: nodeName, tickets: [allTickets[i]],
      }));
    } else if (nodeList.length > 1 && allTickets.length > nodeList.length) {
      // More tickets than nodes — try to split evenly
      const perNode = Math.ceil(allTickets.length / nodeList.length);
      selectedAlerts = nodeList.map((nodeName, i) => ({
        ...baseFields, node: nodeName, tickets: allTickets.slice(i * perNode, (i + 1) * perNode),
      }));
    } else {
      selectedAlerts = nodeList.length
        ? nodeList.map((nodeName) => ({ ...baseFields, node: nodeName, tickets: allTickets }))
        : [{ ...baseFields, node: inc.node || "-", tickets: allTickets }];
    }
  }

  Store.dispatch((state) => ({
    ...state,
    ui: {
      ...state.ui,
      currentView: "alert-detail",
      alertDetailReturnView: state.ui.currentView,
      selectedAlerts,
      selectedIncident: null,
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
          <div>
            <h3 class="text-lg font-bold text-slate-800">Edit Work Type</h3>
            <p class="text-sm text-slate-400 mt-0.5">Select one or more types, e.g. Fiber + Equipment</p>
          </div>
          <div class="space-y-2">
            <label class="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-blue-50 transition-colors has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50">
              <input type="checkbox" id="wt-fiber" value="Fiber" class="w-4 h-4 accent-blue-600 shrink-0">
              <span class="text-sm font-semibold text-slate-700">🔵 Fiber</span>
            </label>
            <label class="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-orange-50 transition-colors has-[:checked]:border-orange-400 has-[:checked]:bg-orange-50">
              <input type="checkbox" id="wt-equipment" value="Equipment" class="w-4 h-4 accent-orange-600 shrink-0">
              <span class="text-sm font-semibold text-slate-700">🟠 Equipment</span>
            </label>
          </div>
          <p id="wt-error" class="text-sm text-red-500 hidden">Please select at least 1 type</p>
          <div class="flex justify-end gap-2 pt-1">
            <button id="btn-cancel-edit-worktype" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold transition-colors">Cancel</button>
            <button id="btn-save-edit-worktype" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-colors">Save</button>
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

  // Pre-check based on existing workTypes (array) or workType (string, backward compat)
  const existing = Array.isArray(found.incident.workTypes) && found.incident.workTypes.length
    ? found.incident.workTypes
    : [found.incident.workType || "Fiber"];
  const existingLower = existing.map(t => t.toLowerCase());
  document.getElementById("wt-fiber").checked     = existingLower.includes("fiber");
  document.getElementById("wt-equipment").checked  = existingLower.includes("equipment");
  document.getElementById("wt-error").classList.add("hidden");

  document.getElementById("btn-save-edit-worktype").onclick = () => {
    const selected = [];
    if (document.getElementById("wt-fiber").checked)     selected.push("Fiber");
    if (document.getElementById("wt-equipment").checked)  selected.push("Equipment");

    if (!selected.length) {
      document.getElementById("wt-error").classList.remove("hidden");
      return;
    }
    document.getElementById("wt-error").classList.add("hidden");

    const primaryType = selected[0];
    const targetTab   = mapWorkTypeToTab(primaryType);

    const current = Store.getState();
    const nextCorrective = {
      fiber:     [...(current.corrective.fiber     || [])],
      equipment: [...(current.corrective.equipment || [])],
      other:     [...(current.corrective.other     || [])],
    };

    let movedIncident = null;
    ["fiber", "equipment", "other"].forEach((tab) => {
      const idx = nextCorrective[tab].findIndex((item) => getIncidentKey(item) === editingWorkTypeIncidentId);
      if (idx !== -1) {
        movedIncident = {
          ...nextCorrective[tab][idx],
          workType:  primaryType,
          workTypes: selected,
          updatedAt: new Date().toISOString(),
        };
        nextCorrective[tab].splice(idx, 1);
      }
    });

    if (!movedIncident) return;
    nextCorrective[targetTab].push(movedIncident);

    AlertService.markRecentWrite(getIncidentKey(movedIncident));
    LocalDB.saveState({ corrective: nextCorrective }, { skipCloudSync: true });
    Store.dispatch((state) => ({
      ...state,
      corrective: nextCorrective,
      ui: {
        ...state.ui,
        activeCorrectiveTab: targetTab,
        highlightIncidentId: movedIncident.incidentId,
      },
    }));

    if (window.FirebaseSync?.saveIncidentToCloud) {
      window.FirebaseSync.saveIncidentToCloud(movedIncident)
        .catch((e) => console.warn("Edit WorkType cloud sync failed:", e));
    }

    closeModal(modal);
    alert(`Work Type updated to ${selected.join(" + ")}`);
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
function mapCorrectiveIncidentToAlertDetail(incident) {
  if (!incident) return null;
  const statusText = String(incident.status || "").toUpperCase();
  const downTime = incident.downTime || incident.createdAt || incident.tickets?.[0]?.downTime || "";
  const detailText = incident.detail
    || incident.nsFinish?.details?.repairText
    || incident.updates?.slice(-1)?.[0]?.message
    || "No details available";

  return {
    id: getIncidentKey(incident),
    node: incident.node || "-",
    alarm: incident.alarm || "Network Alert",
    detail: detailText,
    nocBy: incident.nocBy || "System",
    downTime,
    severity: incident.severity || "Medium",
    type: incident.type || incident.workType || "Network",
    status: ["COMPLETE", "CLOSED", "RESOLVED"].includes(statusText) ? "resolved" : "active",
    createdAt: incident.createdAt || downTime || new Date().toISOString(),
    tickets: Array.isArray(incident.tickets) && incident.tickets.length ? incident.tickets : [],
  };
}
function openHistoryIncidentDetail(incidentId) {
  if (!incidentId) return;

  const found = getCorrectiveIncidentById(incidentId);
  if (!found?.incident) return;

  const inc = found.incident;
  const baseFields = {
    incident: getIncidentKey(inc),
    incidentId: getIncidentKey(inc),
    alarm: inc.alarm || "Network Alert",
    detail: inc.detail || inc.latestUpdateMessage || "-",
    nocBy: inc.nocBy || "System",
    createdAt: inc.createdAt || new Date().toISOString(),
    status: inc.status,
    workType: inc.workType,
  };

  let selectedAlerts;
  if (Array.isArray(inc.nodeDetails) && inc.nodeDetails.length) {
    selectedAlerts = inc.nodeDetails.map((nd) => ({
      ...baseFields,
      node: nd.node || "-",
      alarm: nd.alarm || baseFields.alarm,
      detail: nd.detail || baseFields.detail,
      tickets: nd.tickets || [],
    }));
  } else {
    const nodeList = String(inc.node || "").split(",").map(s => s.trim()).filter(Boolean);
    const allTickets = inc.tickets || [];
    if (nodeList.length > 1 && allTickets.length === nodeList.length) {
      selectedAlerts = nodeList.map((nodeName, i) => ({
        ...baseFields, node: nodeName, tickets: [allTickets[i]],
      }));
    } else if (nodeList.length > 1 && allTickets.length > nodeList.length) {
      const perNode = Math.ceil(allTickets.length / nodeList.length);
      selectedAlerts = nodeList.map((nodeName, i) => ({
        ...baseFields, node: nodeName, tickets: allTickets.slice(i * perNode, (i + 1) * perNode),
      }));
    } else {
      selectedAlerts = nodeList.length
        ? nodeList.map((nodeName) => ({ ...baseFields, node: nodeName, tickets: allTickets }))
        : [{ ...baseFields, node: inc.node || "-", tickets: allTickets }];
    }
  }

  Store.dispatch((state) => ({
    ...state,
    ui: {
      ...state.ui,
      currentView: "alert-detail",
      alertDetailReturnView: "history",
      selectedAlerts,
      selectedIncident: null,
    },
  }));
}


function openCorrectiveIncidentDetail(incidentId) {
  if (!incidentId) return;

  const found = getCorrectiveIncidentById(incidentId);
  if (!found?.incident) return;

  const inc = found.incident;
  const baseFields = {
    incident: getIncidentKey(inc),
    incidentId: getIncidentKey(inc),
    alarm: inc.alarm || "Network Alert",
    detail: inc.detail || inc.latestUpdateMessage || "-",
    nocBy: inc.nocBy || "System",
    createdAt: inc.createdAt || new Date().toISOString(),
    status: inc.status,
    workType: inc.workType,
  };

  let selectedAlerts;
  if (Array.isArray(inc.nodeDetails) && inc.nodeDetails.length) {
    selectedAlerts = inc.nodeDetails.map((nd) => ({
      ...baseFields,
      node: nd.node || "-",
      alarm: nd.alarm || baseFields.alarm,
      detail: nd.detail || baseFields.detail,
      tickets: nd.tickets || [],
    }));
  } else {
    const nodeList = String(inc.node || "").split(",").map(s => s.trim()).filter(Boolean);
    const allTickets = inc.tickets || [];
    if (nodeList.length > 1 && allTickets.length === nodeList.length) {
      selectedAlerts = nodeList.map((nodeName, i) => ({
        ...baseFields, node: nodeName, tickets: [allTickets[i]],
      }));
    } else if (nodeList.length > 1 && allTickets.length > nodeList.length) {
      const perNode = Math.ceil(allTickets.length / nodeList.length);
      selectedAlerts = nodeList.map((nodeName, i) => ({
        ...baseFields, node: nodeName, tickets: allTickets.slice(i * perNode, (i + 1) * perNode),
      }));
    } else {
      selectedAlerts = nodeList.length
        ? nodeList.map((nodeName) => ({ ...baseFields, node: nodeName, tickets: allTickets }))
        : [{ ...baseFields, node: inc.node || "-", tickets: allTickets }];
    }
  }

  Store.dispatch((state) => ({
    ...state,
    ui: {
      ...state.ui,
      currentView: "alert-detail",
      alertDetailReturnView: "corrective",
      selectedAlerts,
      selectedIncident: null,
    },
  }));
}

function formatTimelineDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDuration(ms) {
  const safe = Number(ms);
  if (!Number.isFinite(safe) || safe <= 0) return "0 Hrs 0 Mins";
  const mins = Math.floor(safe / 60000);
  const days = Math.floor(mins / 1440);
  const hrs = Math.floor((mins % 1440) / 60);
  const rem = mins % 60;
  const parts = [];
  if (days > 0) parts.push(`${days} Day`);
  parts.push(`${hrs} Hrs`);
  parts.push(`${rem} Mins`);
  return parts.join(" ").trim();
}
function formatDateTimeThai(value) {
  const text = formatDateTime(value);
  return text === "-" ? "-" : `${text} น.`;
}

function toPointList(baseValue, extraRows = [], key = "", valueFormatter = null) {
  const lines = [];
  const formatValue = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const next = typeof valueFormatter === "function" ? valueFormatter(raw) : raw;
    return String(next || "").trim();
  };
  const base = formatValue(baseValue);

  if (base) lines.push(`จุดที่ 1 ${base}`);
  (Array.isArray(extraRows) ? extraRows : []).forEach((row, idx) => {
    const value = formatValue(row?.[key]);
    if (!value) return;
    lines.push(`จุดที่ ${idx + 2} ${value}`);
  });
  return lines;
}
function formatDistanceWithUnits(rawDistance) {
  const value = String(rawDistance || "").trim();
  if (!value) return "";
  const normalized = value.replace(/,/g, "");
  const numericDistance = Number(normalized);
  if (!Number.isFinite(numericDistance)) return value;

  const hasDecimal = normalized.includes(".");
  const hasKmUnit = /(?:กม|กิโล|km)/i.test(value);
  const hasMeterUnit = /(?:เมตร|m)/i.test(value) && !hasKmUnit;
  const formatNumber = (num, maxDecimals = 3) => Number(num).toLocaleString("th-TH", {
    maximumFractionDigits: maxDecimals,
    minimumFractionDigits: 0,
    useGrouping: false,
  });

  if (hasKmUnit || hasDecimal) {
    return `${formatNumber(numericDistance)} กิโลเมตร`;
  }
  const meters = numericDistance;
  if (hasMeterUnit || meters < 1000) {
    return `${formatNumber(meters)} เมตร`;
  }
  return `${formatNumber(meters / 1000)} กิโลเมตร`;

}

function parseLatLngText(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const [lat = "", lng = ""] = raw.split(",").map((part) => String(part || "").trim());
  return [lat, lng].filter(Boolean).join(", ");
}

function calculateTotalDownTime(downTime, upTime) {
  const start = new Date(downTime).getTime();
  const end = new Date(upTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

function calculatePendingTime(clockStartStopLogs) {
  return (clockStartStopLogs || []).reduce((sum, log) => {
    const start = new Date(log?.start || log?.startTime || log?.startClock || log?.startAt || 0).getTime();
    const stop = new Date(log?.stop || log?.stopTime || log?.stopClock || log?.stopAt || 0).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(stop) || stop < start) return sum;
    return sum + (stop - start);
  }, 0);
}

function calculateDurationTime(totalMs, pendingMs) {
  const total = Number(totalMs) || 0;
  const pending = Number(pendingMs) || 0;
  return Math.max(0, total - pending);
}
function buildConnectorText(connectorOption, connectorCount) {
  const option = String(connectorOption || "").trim();
  if (option === "ใช้หัวต่อ") {
    return `ใช้หัวต่อ ${String(connectorCount || "-").trim() || "-"} หัว`;
  }
  if (option === "ไม่ใช้หัวต่อ") return "ไม่ใช้หัวต่อ";
  return "-";
}

function buildUrgentText(urgentOption, urgentReason, includeReason = false) {
  const option = String(urgentOption || "").trim();
  if (option === "มีค่าเร่งด่วน") {
    if (!includeReason) return "ค่า Stand By เร่งด่วน";

    return `ค่า Stand By เร่งด่วน (${String(urgentReason || "-").trim() || "-"})`;
  }
  if (option === "ไม่มีค่าเร่งด่วน") return "ไม่มีค่าเร่งด่วน";
  return "-";
}

function buildCoreShiftDetailReport(coreShiftDetails = {}) {
  const mappings = Array.isArray(coreShiftDetails?.mappings) ? coreShiftDetails.mappings : [];
  if (!mappings.length) return "";

  const grouped = mappings.reduce((acc, item) => {
    const key = String(item?.location || "-").trim() || "-";
    if (!acc[key]) acc[key] = [];
    acc[key].push(`  - C.${String(item?.oldCore || "-").trim() || "-"} (เดิม) โยกไป C.${String(item?.newCore || "-").trim() || "-"} (ใหม่)`);
    return acc;
  }, {});

  const lines = [
    `ข้อมูลโยก Core (รวม ${String(coreShiftDetails?.totalPoints || Object.keys(grouped).length || "-").trim() || "-"} จุด)`,
    `Path: ${String(coreShiftDetails?.pathStart || "-").trim() || "-"} -> ${String(coreShiftDetails?.pathEnd || "-").trim() || "-"}`,
    "",
    "-----------------------------------",
    `ลูกค้า: ${String(coreShiftDetails?.customerCode || "-").trim() || "-"} ${String(coreShiftDetails?.customerName || "-").trim() || "-"}`.trim(),
  ];

  Object.entries(grouped).forEach(([location, mapLines]) => {
    lines.push(`${location}:`);
    lines.push(...mapLines);
  });

  return lines.join("\n").trim();
}


function buildLineSolution(line, allLines = []) {
  const clean = (v) => String(v || "").trim();
  if (!line || typeof line !== "object") return "-";
  const method = clean(line.method);
  const connectorText = buildConnectorText(line.useConnectors || line.connectorOption, line.connectors || line.connectorCount);
  const urgentText = buildUrgentText(line.urgent || line.urgentOption, line.urgentReason, false);
  const spliceText = clean(line.cutPoints) ? `ตัดต่อใหม่ ${clean(line.cutPoints)} จุด (จุดละ ${clean(line.corePerPoint) || clean(line.coreCount) || "-"} Core)` : "";

  let text = "-";
  if (method === "ลากคร่อม") {
    text = `ใช้สาย OFC ${clean(line.type) || "-"} ลากคร่อม ${clean(line.distance) || "-"} เมตร ${spliceText || ""} ${connectorText}`;
  } else if (method === "ร่นลูป") {
    text = `ร่นลูป ${clean(line.distance) || "-"} เมตร ${spliceText || ""} ${connectorText}`;

  } else if (method === "โยก Core") {
    text = `โยก Core ที่ จุดที่ 1 ${clean(line.pointA) || "-"} กับ จุดที่ 2 ${clean(line.pointB) || "-"} ${spliceText || ""} ${connectorText}`;
  } else if (method === "ตัดต่อใหม่") {
    text = `${spliceText || `ตัดต่อใหม่ - จุด (จุดละ ${clean(line.corePerPoint) || clean(line.coreCount) || "-"} Core)`} ${connectorText}`;
  } else if (method === "ฝาก Core") {
    const target = clean(line.depositTarget) || clean(line.depositToLine) || "-";
    text = `ฝาก Core ${clean(line.depositCore) || "-"} กับ ${target} Core ${clean(line.depositTargetCore) || "-"}`;
    if (spliceText) text = `${clean(line.type) || "-"} ${text} ${spliceText} ${connectorText}`;

  }
  const dedup = [...new Set(text.split(/\s+/).filter(Boolean))].join(" ").replace(/\s+\)/g, ")").trim();
  const lineHeader = `เส้นที่ ${clean(line.lineNo) || "-"}: ${clean(line.type) || "-"}`;
  const note = clean(line.note) ? ` (${clean(line.note)})` : "";
  return `${lineHeader} ${dedup} + ${urgentText}${note}`.replace(/\s+/g, " ").trim();

}

function buildMultiLineSolution(data = {}) {
  const lines = (data.selectedOfcLines || []).filter(Boolean).sort((a, b) => Number(a?.lineNo || 9999) - Number(b?.lineNo || 9999));
  if (!lines.length) return String(data.solutionText || "-").trim() || "-";
  return lines.map((line) => buildLineSolution(line, lines)).map((x) => x.trim()).filter(Boolean).join("\n").trim() || "-";
}
function buildSingleLineSolution(data = {}) {
  const method = String(data.method || "").trim();
  const connectorText = buildConnectorText(data.connectorOption, data.connectorCount);
  const urgentText = buildUrgentText(data.urgentOption, data.urgentReason, method === "ค่าเร่งด่วน");
  const spliceText = `ตัดต่อใหม่ ${String(data.cutPoints || "-").trim() || "-"} จุด (จุดละ ${String(data.corePerPoint || "-").trim() || "-"} Core)`;

  if (method === "ลากคร่อม") {
    return `ใช้สาย OFC ${String(data.ofcType || "-").trim() || "-"} ลากคร่อม ${String(data.distance || "-").trim() || "-"} เมตร ${spliceText} ${connectorText} + ${urgentText}`.replace(/\s+/g, " ").trim();
  }
  if (method === "ร่นลูป") {
    return `ร่นลูป ${String(data.distance || "-").trim() || "-"} เมตร ${spliceText} ${connectorText} + ${urgentText}`.replace(/\s+/g, " ").trim();
  }
  if (method === "โยก Core") {
    const coreText = `โยก Core ที่ จุดที่ 1 ${String(data.pointA || "-").trim() || "-"} กับ จุดที่ 2 ${String(data.pointB || "-").trim() || "-"} ${spliceText} ${connectorText} + ${urgentText}`;
    const shift = buildCoreShiftDetailReport(data.coreShiftDetails || {});
    return [coreText.replace(/\s+/g, " ").trim(), shift].filter(Boolean).join("\n").trim();
  }
  if (method === "ตัดต่อใหม่") {
    return `${spliceText} ${connectorText} + ${urgentText}`.replace(/\s+/g, " ").trim();
  }
  if (method === "ฝาก Core") {
    const depositTarget = String(data.depositTarget || data.depositToLine || "-").trim() || "-";
    const base = `ฝาก Core ${String(data.depositCore || "-").trim() || "-"} กับ ${depositTarget}`;
    const enrich = data.cutPoints ? `${spliceText} ${connectorText}` : "";
    return `${base} ${enrich} + ${urgentText}`.replace(/\s+/g, " ").trim();
  }
  if (method === "ค่าเร่งด่วน") {
    return urgentText;
  }

  return String(data.solutionText || "-").trim() || "-";
}

function createAutoSolutionDescription(data = {}) {
  const isMulti = Boolean(data.isUsingMultipleLines);
  const solution = isMulti ? buildMultiLineSolution(data) : buildSingleLineSolution(data);
  return String(solution || "-").trim() || "-";
}


function buildMainNsFinishReport(data = {}) {
  const totalMs = calculateTotalDownTime(data.downTime, data.upTime);
  const pendingMs = calculatePendingTime(data.clockStartStopLogs);
  const durationMs = calculateDurationTime(totalMs, pendingMs);
  const callSubTime = data.responseTime ? new Date(new Date(data.responseTime).getTime() + (5 * 60000)).toISOString() : "";
  const subArrivalTime = callSubTime ? new Date(new Date(callSubTime).getTime() + (60 * 60000)).toISOString() : "";
  const repairStartTime = data.clockStartRepairTime || (subArrivalTime ? new Date(new Date(subArrivalTime).getTime() + (10 * 60000)).toISOString() : "");
  const connectorCollectTime = data.upTime ? new Date(new Date(data.upTime).getTime() + (10 * 60000)).toISOString() : "";
  const solutionText = createAutoSolutionDescription(data);
  const multiPointDetails = Array.isArray(data.multiPointDetails) ? data.multiPointDetails : [];
  const reportOfcTypeText = data.isUsingMultipleLines
    ? (summarizeMultiOfcData(data.ofcMultipleLinesData || {}).join(", ").trim() || String(data.ofcType || "-").trim() || "-")
    : (String(data.ofcType || "-").trim() || "-");
  const ofcTypeLines = toPointList(reportOfcTypeText, multiPointDetails, "ofcType");
  const distanceLines = toPointList(String(data.siteDistance || "-").trim() || "-", multiPointDetails, "distance", formatDistanceWithUnits);
  const areaLines = toPointList(String(data.area || "-").trim() || "-", multiPointDetails, "area");
  const latLngLines = toPointList(parseLatLngText(`${String(data.latitude || "").trim()}, ${String(data.longitude || "").trim()}`), multiPointDetails.map((row) => ({
    ...row,
    latlng: parseLatLngText(row?.latlng || ""),
  })), "latlng");

  const overSla = totalMs > (3 * 60 * 60 * 1000) || durationMs > (3 * 60 * 60 * 1000);
  const delay = overSla ? (String(data.delayReason || "").trim() || "เกิน SLA") : "-";

  const alertClassPrefix = data.alertClass === "Inf" ? "Inf# " : "";

  const lines = [
    `รายละเอียดงานซ่อม : ${solutionText}`,
    "",
    `${alertClassPrefix}ปิดงาน: ${formatDateTime(data.downTime)} - ${formatDateTime(data.upTime)}`,
    `${String(data.incidentNumber || "-").trim() || "-"} ${String(data.nodeName || "-").trim() || "-"} ${String(data.symphonyCid || "-").trim() || "-"} ${String(data.circuitSide || "-").trim() || "-"}`.trim(),
    "",
    `1. Sub : ${Array.isArray(data.subContractors) && data.subContractors.length ? data.subContractors.join(", ") : "-"}`,
    `2. Down : ${formatDateTimeThai(data.downTime)}`,
    `3. Noc Alert : ${formatDateTimeThai(data.alertTime)}`,
    `4. NS Res. : ${formatDateTimeThai(data.responseTime)}`,
    `5. เรียก sub : ${formatDateTimeThai(callSubTime)}`,
    `6. Sub มาถึง : ${formatDateTimeThai(subArrivalTime)}`,
    `7. เริ่มแก้ไข : ${formatDateTimeThai(repairStartTime)}`,
    `8. Up time : ${formatDateTimeThai(data.upTime)}`,
    `9. Total Down time : ${formatDuration(totalMs)}`,
    pendingMs > 0 ? `Pending time : ${formatDuration(pendingMs)}` : "",
    pendingMs > 0 ? `Duration time : ${formatDuration(durationMs)}` : "",
    `10. เก็บหัวต่อ : ${formatDateTimeThai(connectorCollectTime)}`,
    `11. OFC type : ${ofcTypeLines.length ? ofcTypeLines.join("\n") : "-"}`,
    `12. ระยะ : ห่างจาก Site ${String(data.siteName || "-").trim() || "-"} ระยะ${distanceLines.length ? `\n${distanceLines.join("\n")}` : " -"}`,
    `13. สาเหตุ : ${String(data.cause || "-").trim() || "-"}`,
    `14. บริเวณ : ${areaLines.length ? `\n${areaLines.join("\n")}` : "-"}`,
    `15. longitude latitude : ${latLngLines.length ? `\n${latLngLines.join("\n")}` : "-"}`,
    `16. แก้ไขอย่างไร : ${solutionText}`,
    `17. ปรับ/ไม่ปรับ : ${String(data.adjustmentStatus || "-").trim() || "-"}`,
    `18. ล่าช้า : ${delay}`,
  ];
  return lines.filter((line) => String(line || "").trim()).join("\n").trim();
}

function buildEquipmentNsFinishReport(data = {}) {
  const snPairs = Array.isArray(data.snPairs) ? data.snPairs : [];
  const oldSnText = snPairs.length ? snPairs.map((pair) => pair?.oldSn).filter(Boolean).join(" ,") : (String(data.oldSn || "-").trim() || "-");
  const newSnText = snPairs.length ? snPairs.map((pair) => pair?.newSn).filter(Boolean).join(" ,") : (String(data.newSn || "-").trim() || "-");
  const damagedPartsText = Array.isArray(data.damagedParts) && data.damagedParts.length
    ? data.damagedParts.join(" ,")
    : (String(data.damagedPart || "-").trim() || "-");
  const finishTime = data.nsFinishTime || data.upTime || "";
  const summaryText = String(data.summary || "").trim();

  const lines = [
    `Response Work Type : Equipment`,
    `Incident Number : ${String(data.incidentNumber || "-").trim() || "-"}`,
    `Circuit ID + Customer : ${String(data.circuitCustomer || "-").trim() || "-"}`,
    `Device Type : ${String(data.deviceType || "-").trim() || "-"}`,
    `Alarm/Problem : ${String(data.problem || "-").trim() || "-"}`,
    `Down Time : ${formatDateTimeThai(data.downTime)}`,
    `NS Response : ${formatDateTimeThai(data.responseTime)}`,
    `Arrival Time : ${formatDateTimeThai(data.arrivalTime)}`,
    `Cause : ${String(data.cause || "-").trim() || "-"}`,
    `Damaged Parts : ${damagedPartsText}`,
    `Fix Action : ${String(data.fixAction || "-").trim() || "-"}`,
    `S/N เดิม : ${oldSnText}`,
    `S/N ใหม่ : ${newSnText}`,
    summaryText && summaryText !== "-" ? `สรุปการแก้ไข : ${summaryText}` : "",
    `NS Finish : ${formatDateTimeThai(finishTime)}`,
  ];
  return lines.filter((line) => String(line || "").trim()).join("\n").trim();
}

function buildSubAssignmentReport(data = {}) {
  const subs = Array.isArray(data.subContractors) ? data.subContractors.filter((x) => String(x || "").trim()) : [];
  if (subs.length <= 1) return "";

  const assignments = Array.isArray(data.multiSubAssignments) ? data.multiSubAssignments : [];
  const lines = (data.selectedOfcLines || []).filter(Boolean);
  const sections = ["ข้อมูล Sub", ""];

  subs.forEach((sub) => {
    const subName = String(sub || "").trim();
    const mine = assignments.filter((item) => {
      const names = [item?.subName, item?.sub, ...(Array.isArray(item?.subNames) ? item.subNames : []), ...(Array.isArray(item?.subs) ? item.subs : [])]
        .map((x) => String(x || "").trim())
        .filter(Boolean);
      return names.includes(subName);
    }).sort((a, b) => Number(a?.lineNo || 9999) - Number(b?.lineNo || 9999));

    sections.push(`[${subName || "-"}]`);
    if (!mine.length) {

      sections.push("-");
    } else {
      mine.forEach((item, idx) => {
        const lineNo = Number(item?.lineNo || 0);
        const line = lines.find((x) => Number(x?.lineNo) === lineNo);
        if (line) {
          sections.push(buildLineSolution(line, lines));
        } else {
          const task = String(item?.task || item?.text || item?.description || item?.detail || `งานที่ ${idx + 1}`).trim() || "-";
          sections.push(task);
        }

      });
    }
    sections.push("");
  });

  return sections.join("\n").trim();
}

function buildFullNsFinishReport(data = {}) {
  if (String(data.reportType || "").trim() === "equipment") {
    return buildEquipmentNsFinishReport(data);
  }
  const main = buildMainNsFinishReport(data);
  const sub = buildSubAssignmentReport(data);
  const hasYoke = String(data.method || "").trim() === "โยก Core" || (data.selectedOfcLines || []).some((line) => String(line?.method || "").trim() === "โยก Core");
  const shift = hasYoke ? buildCoreShiftDetailReport(data.coreShiftDetails || {}) : "";
  return [main, sub, shift].filter((part) => String(part || "").trim()).join("\n\n").trim();

}

function ensureNsFinishReportModal() {
  if (!document.getElementById("modal-ns-finish-report")) {
    document.body.insertAdjacentHTML("beforeend", `
        <div id="modal-ns-finish-report" class="modal-backdrop hidden fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-[1200] p-4">
          <div class="bg-white/95 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl w-full max-w-4xl flex flex-col overflow-hidden transform transition-all">
            <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-orange-50 to-white">
              <h3 class="text-xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                 <span class="w-1.5 h-6 rounded-full bg-orange-500"></span> 
                 NS Finish Report
              </h3>
              <button id="btn-close-ns-report" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors text-lg font-bold">✕</button>
            </div>
            <div class="p-6 bg-slate-50/50 flex-1">
              <textarea id="ns-report-preview" class="w-full min-h-[380px] p-5 bg-white border border-slate-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-orange-100 focus:border-orange-500 transition-all resize-y text-slate-700 text-sm leading-relaxed outline-none font-mono" readonly></textarea>
            </div>
            <div class="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-white">
              <button id="btn-close-ns-report-footer" class="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors">Close</button>
              <button id="btn-copy-ns-report" class="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-orange-400 hover:from-orange-600 hover:to-orange-500 text-white font-bold rounded-xl shadow-[0_4px_15px_-3px_rgba(249,115,22,0.4)] transform hover:-translate-y-0.5 transition-all outline-none flex items-center gap-2">
                <i data-lucide="copy" class="w-4 h-4 pointer-events-none"></i> Copy Report
              </button>
            </div>
          </div>
        </div>
      `);
  }

  if (!document.getElementById("ns-report-style")) {
    document.head.insertAdjacentHTML("beforeend", `
        <style id="ns-report-style">
          /* Legacy CSS placeholder to prevent duplicate logic */
        </style>
      `);
  }

  const modal = document.getElementById("modal-ns-finish-report");
  if (modal && !modal.dataset.bound) {
    document.getElementById("btn-close-ns-report")?.addEventListener("click", closeNsFinishReportModal);
    document.getElementById("btn-close-ns-report-footer")?.addEventListener("click", closeNsFinishReportModal);
    document.getElementById("btn-copy-ns-report")?.addEventListener("click", copyNsFinishReport);
    modal.dataset.bound = "true";
  }
}

function openNsFinishReportModal(data = {}) {
  ensureNsFinishReportModal();
  const report = buildFullNsFinishReport(data);
  const modal = document.getElementById("modal-ns-finish-report");
  const preview = document.getElementById("ns-report-preview");
  if (preview) preview.value = report.trim() || "-";
  if (modal) modal.classList.remove("hidden");
}

function closeNsFinishReportModal() {
  document.getElementById("modal-ns-finish-report")?.classList.add("hidden");
}

async function copyNsFinishReport() {
  const text = document.getElementById("ns-report-preview")?.value?.trim() || "-";
  try {
    await navigator.clipboard.writeText(text);
    alert("คัดลอกรายงานแล้ว");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    alert("คัดลอกรายงานแล้ว");
  }
}

function validateNsFinishReportData(data = {}) {
  const errors = [];
  if (!data.incidentNumber) errors.push("missing incidentNumber");
  return { valid: true, errors };
}

function handleSaveAndShowReport(data = {}) {
  const result = validateNsFinishReportData(data);
  if (!result.valid) return;
  openNsFinishReportModal({
    ...data,
    solutionText: createAutoSolutionDescription(data),
  });

}

function renderReportButton(item = {}) {
  const incidentId = getIncidentKey(item) || "";
  return `<button class="btn-action btn-action-orange btn-corrective-report" data-id="${incidentId}">Report</button>`;
}
window.renderReportButton = renderReportButton;
window.openNsFinishReportModal = openNsFinishReportModal;
window.buildNsReportInputFromIncident = buildNsReportInputFromIncident;

function buildNsReportInputFromIncident(incident = {}, tab = "") {
  const firstTicket = (incident.tickets || [])[0] || {};
  const updates = incident.updates || [];
  const latestUpdate = updates[updates.length - 1] || {};
  const finish = incident.nsFinish || {};
  const details = finish.details || {};
  const times = finish.times || {};
  if (tab === "equipment") {
    return {
      reportType: "equipment",
      incidentNumber: finish.incidentNumber || incident.incidentId || "-",
      circuitCustomer: details.node || latestUpdate.originate || latestUpdate.terminate || "-",
      deviceType: details.deviceType || "-",
      problem: details.problem || incident.alarm || "-",
      downTime: times.downTime || firstTicket.downTime || incident.downTime || incident.createdAt || "",
      responseTime: times.nsResponse || incident.respondedAt || incident.createdAt || "",
      arrivalTime: times.arrivalTime || "",
      upTime: times.upTime || "",
      cause: details.cause || "-",
      damagedPart: details.damagedPart || "-",
      damagedParts: details.damagedParts || [],
      fixAction: details.fixAction || "-",
      oldSn: details.oldSn || "-",
      newSn: details.newSn || "-",
      snPairs: details.snPairs || [],
      summary: details.summary || "-",
      nsFinishTime: times.upTime || incident.completedAt || "",
    };
  }

  return {
    incidentNumber: finish.incidentNumber || incident.incidentId || "-",
    alertClass: incident.alertClass || null,
    nodeName: latestUpdate.site || incident.node || "-",
    symphonyCid: firstTicket.cid || "-",
    circuitSide: firstTicket.port || "-",
    subContractors: finish.subcontractors || latestUpdate.subcontractors || [],
    downTime: times.downTime || firstTicket.downTime || incident.downTime || incident.createdAt || "",
    alertTime: times.nocAlert || incident.createdAt || "",
    responseTime: times.nsResponse || incident.respondedAt || incident.createdAt || "",
    upTime: times.upTime || "",
    clockStartStopLogs: incident.clockStartStopLogs || [],
    clockStartRepairTime: times.startFix || "",
    ofcType: details.ofcType || latestUpdate.ofcType || "-",
    siteName: details.site || latestUpdate.site || "-",
    siteDistance: details.distance || latestUpdate.distance || "-",
    cause: details.cause || latestUpdate.cause || "-",
    area: details.area || latestUpdate.area || "-",
    latitude: String(details.latlng || latestUpdate.latlng || "").split(",")[0]?.trim() || "-",
    longitude: String(details.latlng || latestUpdate.latlng || "").split(",")[1]?.trim() || "-",
    solutionText: details.repairText || "-",
    method: details.method || latestUpdate.workCase || "",
    distance: details.methodDistance || "",
    cutPoints: details.cutPoint || "",
    corePerPoint: details.corePoint || "",
    connectorOption: details.connectorChoice || "",
    connectorCount: details.headJoint || "",
    urgentOption: details.urgentLevel || "",
    urgentReason: details.urgentReason || "",
    pointA: details.siteA || "",
    pointB: details.siteB || "",
    coreShiftDetails: details.coreShiftDetails || {},

    adjustmentStatus: details.patchStatus || "-",
    delayReason: details.delayBy || details.delayReason || incident.delayReason || "",
    multiSubAssignments: details.multiSubAssignments || [],
    selectedOfcLines: details.multiRepairDetails || [],
    isUsingMultipleLines: details.ofcType === "หลายเส้น",
    ofcMultipleLinesData: details.multiOfcDetails || latestUpdate.multiOfcDetails || {},
    multiPointDetails: details.multiPointDetails || [],
  };
}

function bindNsFinishReportEvents() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest(".btn-corrective-report");
    if (!target) return;
    const found = getCorrectiveIncidentById(target.dataset.id);
    if (!found) return;
    openNsFinishReportModal(buildNsReportInputFromIncident(found.incident, found.tab));
  });
}

function fileToDataURL(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result || "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

// Compress image to JPEG, max 1024px on longest side, quality 0.65
// Non-image files pass through as-is (name+type only, no binary stored in Firestore)
function compressImageToDataURL(file, maxDim = 1024, quality = 0.65) {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(""); // non-image: don't embed binary
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => resolve("");
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => resolve("");
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) { height = Math.round(height * maxDim / width); width = maxDim; }
          else { width = Math.round(width * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function buildAttachmentPayload(cameraFiles = [], attachFiles = []) {
  const selectedFiles = [...Array.from(cameraFiles || []), ...Array.from(attachFiles || [])];
  return Promise.all(selectedFiles.map(async (file) => ({
    name: file.name,
    type: file.type || "",
    url: await compressImageToDataURL(file),
  })));
}

function buildWhatWhereHowText(update = {}, finish = {}) {
  const who = (update.subcontractors || finish.subcontractors || []).join(", ") || "-";
  const what = finish.details?.repairText || update.message || "-";
  const where = finish.details?.area || update.area || update.site || "-";
  const how = finish.details?.repairText || update.initialFix || finish.details?.method || update.workCase || "-";
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

  const imageItems = normalized.filter((item) => item.url && item.url.startsWith("data:image/"));
  const fileItems = normalized.filter((item) => item.url && !item.url.startsWith("data:image/"));
  const noUrlItems = normalized.filter((item) => !item.url);

  return `
      <div class="mt-2 space-y-2">
        ${imageItems.length
        ? `<div class="flex flex-wrap gap-2">${imageItems
          .map((item) => `
            <button type="button" data-attachment-image-url="${item.url}" data-attachment-image-name="${item.name}" title="เปิดรูป ${item.name}" class="group block timeline-image-open">
              <img data-src="${item.url}" alt="${item.name}" class="lazy-attach w-20 h-20 object-cover rounded border border-slate-200 group-hover:border-indigo-400 transition-colors cursor-zoom-in bg-slate-100" />
            </button>
          `).join("")}</div>`
        : ""}
        ${(noUrlItems.length || fileItems.length)
        ? `<div class="flex flex-wrap gap-1">
            ${noUrlItems.map((item) => `<span class="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded text-xs text-slate-600"><svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>${item.name}</span>`).join("")}
            ${fileItems.map((item) => `<a href="${item.url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-xs text-slate-600"><svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>${item.name}</a>`).join("")}
          </div>`
        : ""}
      </div>
    `;
}
function ensureAttachmentPreviewModal() {
  if (document.getElementById("modal-attachment-preview")) return;
  document.body.insertAdjacentHTML("beforeend", `
      <div id="modal-attachment-preview" class="modal-backdrop hidden">
        <div class="bg-black/90 rounded-2xl w-full max-w-5xl p-4">
          <div class="flex items-center justify-between mb-3">
            <div id="attachment-preview-title" class="text-sm text-slate-200 font-semibold truncate pr-4">Attachment Preview</div>
            <button id="btn-close-attachment-preview" type="button" class="px-3 py-1 rounded bg-slate-200 text-slate-800">ปิด</button>
          </div>
          <div class="max-h-[80vh] overflow-auto flex justify-center">
            <img id="attachment-preview-image" src="" alt="Attachment preview" class="max-w-full max-h-[76vh] object-contain rounded" />
          </div>
        </div>
      </div>
    `);
  document.getElementById("btn-close-attachment-preview").onclick = () => closeModal(document.getElementById("modal-attachment-preview"));
}

function openAttachmentPreview(imageUrl, imageName = "Attachment") {
  if (!imageUrl) return;
  ensureAttachmentPreviewModal();
  const modal = document.getElementById("modal-attachment-preview");
  const image = document.getElementById("attachment-preview-image");
  const title = document.getElementById("attachment-preview-title");
  if (image) {
    image.src = imageUrl;
    image.alt = imageName || "Attachment";
  }
  if (title) {
    title.textContent = imageName || "Attachment";
  }
  openModal(modal);
}

function exportCorrectiveDetailPDF() {
  const data = window._corrDetailData;
  if (!data) return;
  const { incident, tab } = data;
  const finish = incident.nsFinish || {};
  const finishTimes = finish.times || {};
  const finishDetails = finish.details || {};
  const updates = incident.updates || [];
  const title = `View Detail (${incident.incidentId || "-"})`;

  const fmtDate = (v) => {
    if (!v) return "-";
    try { return new Date(v).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }); } catch { return v; }
  };
  const esc = (s) => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

  const pdfAttachments = (attachments = []) => {
    const imgs = attachments.filter(a => (a.url || "").startsWith("data:image/"));
    const files = attachments.filter(a => a.url && !a.url.startsWith("data:image/"));
    const noUrl = attachments.filter(a => !a.url);
    let html = "";
    if (imgs.length) {
      html += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">${imgs.map(a =>
        `<img src="${a.url}" alt="${esc(a.name)}" style="width:120px;height:120px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0;">`
      ).join("")}</div>`;
    }
    const chips = [...files, ...noUrl].map(a => `<span style="font-size:10px;background:#fff7ed;color:#ea580c;border:1px solid #fed7aa;border-radius:20px;padding:2px 8px;">${esc(a.name)}</span>`).join("");
    if (chips) html += `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">${chips}</div>`;
    return html;
  };

  const card = (label, value) =>
    `<div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;break-inside:avoid;">
       <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin-bottom:3px;">${esc(label)}</div>
       <div style="font-weight:700;font-size:13px;color:#1e293b;word-break:break-word;">${esc(value) || "-"}</div>
     </div>`;

  const timeRow = (label, value) => value
    ? `<tr><td style="padding:3px 8px;color:#64748b;font-size:11px;white-space:nowrap;">${esc(label)}</td><td style="padding:3px 8px;font-weight:600;font-size:11px;">${fmtDate(value)}</td></tr>`
    : "";

  const detailRow = (label, value) => value
    ? `<tr><td style="padding:3px 8px;color:#64748b;font-size:11px;white-space:nowrap;vertical-align:top;">${esc(label)}</td><td style="padding:3px 8px;font-size:11px;">${esc(value)}</td></tr>`
    : "";

  const latestUpdate = updates.slice(-1)[0] || {};
  const subContractor = (latestUpdate.subcontractors || finish.subcontractors || []).join(", ") || "-";
  const where = finishDetails.area || latestUpdate.area || latestUpdate.site || "-";
  const how = finishDetails.repairText || latestUpdate.initialFix || finishDetails.method || "-";

  const finishTimesTable = [
    timeRow("Down Time", finishTimes.downTime),
    timeRow("NOC Alert", finishTimes.nocAlert),
    timeRow("NS Response", finishTimes.nsResponse),
    timeRow("Call Sub", finishTimes.callSub),
    timeRow("Sub Arrive", finishTimes.subArrive),
    timeRow("Start Fix", finishTimes.startFix),
    timeRow("Up Time / แก้ไขเสร็จ", finishTimes.upTime),
    timeRow("เก็บหัวต่อ", finishTimes.storeConnector),
  ].filter(Boolean).join("");

  const finishDetailTable = [
    detailRow("วิธีการ", finishDetails.method),
    detailRow("บริเวณ", finishDetails.area),
    detailRow("พิกัด", finishDetails.latlng),
    detailRow("ระยะ", finishDetails.distance ? `${finishDetails.distance} เมตร` : ""),
    detailRow("สาเหตุ", finishDetails.cause || latestUpdate.cause),
    detailRow("Sub Contractor", subContractor),
    detailRow("สรุปการแก้ไข", finishDetails.repairText),
  ].filter(Boolean).join("");

  // Group finish photos by category — each group keeps label + images together
  const finishPhotosByCategory = {};
  (finish.attachments || []).forEach((a) => {
    const cat = a.category || "รูปภาพ";
    if (!finishPhotosByCategory[cat]) finishPhotosByCategory[cat] = [];
    finishPhotosByCategory[cat].push(a);
  });
  const finishPhotos = Object.entries(finishPhotosByCategory).length
    ? `<div style="margin-top:12px;border-top:1px solid #f1f5f9;padding-top:10px;">
        <div style="font-size:11px;font-weight:800;color:#1e293b;margin-bottom:8px;letter-spacing:.03em;">รูปภาพประกอบ</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">
          ${Object.entries(finishPhotosByCategory).map(([cat, items]) => {
            const imgs = items.filter(a => (a.url || "").startsWith("data:image/"));
            return `<div style="break-inside:avoid;border:1px solid #e2e8f0;border-radius:8px;padding:8px;background:#fafafa;">
              <div style="font-size:10px;font-weight:700;color:#ea580c;margin-bottom:6px;">${esc(cat)}</div>
              <div style="display:flex;flex-wrap:wrap;gap:4px;">
                ${imgs.map(a => `<img src="${a.url}" alt="${esc(a.name)}" style="width:90px;height:90px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;">`).join("")}
                ${imgs.length === 0 ? `<span style="font-size:10px;color:#94a3b8;">ไม่มีรูป</span>` : ""}
              </div>
            </div>`;
          }).join("")}
        </div>
       </div>`
    : "";

  const updateItems = updates.map((item, i) => `
    <div style="position:relative;background:#fff;border:1px solid #f1f5f9;border-radius:10px;padding:12px;margin-bottom:10px;break-inside:avoid;">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
        <span style="font-size:12px;font-weight:700;color:#ea580c;">NS Update #${i + 1}</span>
        <span style="font-size:10px;font-weight:600;color:#94a3b8;background:#f8fafc;padding:2px 6px;border-radius:5px;">${fmtDate(item.at)}</span>
      </div>
      <div style="font-size:12px;color:#334155;line-height:1.6;">${esc(item.message || "-")}</div>
      ${pdfAttachments(item.attachments || [])}
    </div>`).join("");

  const finishBlock = finishTimes.upTime || finishDetails.repairText ? `
    <div style="background:#fff;border:1px solid #fed7aa;border-radius:10px;padding:14px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #fed7aa;">
        <span style="font-size:13px;font-weight:800;color:#ea580c;">NS Finish</span>
        <span style="font-size:10px;font-weight:600;color:#94a3b8;background:#fff7ed;padding:3px 8px;border-radius:5px;">${fmtDate(finishTimes.upTime || incident.completedAt)}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:4px;">
        ${finishTimesTable ? `<div style="break-inside:avoid;"><div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em;">ตารางเวลา</div><table style="border-collapse:collapse;width:100%;"><tbody>${finishTimesTable}</tbody></table></div>` : ""}
        ${finishDetailTable ? `<div style="break-inside:avoid;"><div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em;">รายละเอียด</div><table style="border-collapse:collapse;width:100%;"><tbody>${finishDetailTable}</tbody></table></div>` : ""}
      </div>
      ${finishPhotos}
    </div>` : "";

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Sarabun','Segoe UI',sans-serif; font-size: 13px; color: #1e293b; background: #fff; padding: 20px 24px; }
    h1 { font-size: 17px; font-weight: 900; color: #ea580c; margin-bottom: 12px; border-bottom: 2px solid #fed7aa; padding-bottom: 8px; }
    h2 { font-size: 12px; font-weight: 800; color: #1e293b; margin: 14px 0 8px; text-transform: uppercase; letter-spacing:.05em; }
    .info-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 7px; margin-bottom: 12px; }
    .timeline { border-left: 2px solid #fed7aa; margin-left: 8px; padding-left: 14px; }
    tr:nth-child(even) td { background: #fafafa; }
    td { border-bottom: 1px solid #f1f5f9; }
    @media print { body { padding: 10px 14px; } }`;

  const html = `<!DOCTYPE html>
<html lang="th"><head><meta charset="UTF-8"><title>${esc(title)}</title><style>${css}</style></head>
<body>
  <h1>${esc(title)}</h1>
  <div class="info-grid">
    ${card("Type", tab)}
    ${card("Node", incident.node || incident.nodes || "-")}
    ${card(tab === "equipment" ? "Circuit ID + Customer" : "Sub Contractor", subContractor)}
    <div style="grid-column:span 3;">${card("บริเวณจุดเกิดเหตุ", where)}</div>
    <div style="grid-column:span 3;">${card("สรุปการแก้ไข", how)}</div>
  </div>
  <h2>Timeline</h2>
  <div class="timeline">
    ${updateItems}
    ${finishBlock}
  </div>
  <script>window.onload = function(){ window.print(); };<\/script>
</body></html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { alert("กรุณาอนุญาต Popup เพื่อส่งออก PDF"); return; }
  win.document.write(html);
  win.document.close();
}

function openCorrectiveDetailModalDirect(incident, tab) {
  if (!incident) return;
  _renderCorrectiveDetailModal(incident, tab || incident.workType?.toLowerCase() || "fiber");
}
window.openCorrectiveDetailModalDirect = openCorrectiveDetailModalDirect;

function openCorrectiveDetailModal(incidentId) {
  const found = getCorrectiveIncidentById(incidentId);
  if (!found) {
    // Try searching in completed history items as fallback
    const state = Store.getState();
    for (const tab of ["fiber", "equipment", "other"]) {
      const inc = (state.corrective[tab] || []).find(i =>
        (i.incident || i.incidentId || i.id || "") === incidentId
      );
      if (inc) { _renderCorrectiveDetailModal(inc, tab); return; }
    }
    alert("Warning: Incident ID [ " + incidentId + " ] details not found.");
    return;
  }

  const { incident, tab } = found;
  _renderCorrectiveDetailModal(incident, tab);
}

function _renderCorrectiveDetailModal(incident, tab) {
  window._corrDetailData = { incident, tab }; // stored for PDF export
  const latestUpdate = (incident.updates || []).slice(-1)[0] || {};
  const finish = incident.nsFinish || {};
  const summary = buildWhatWhereHowText(latestUpdate, finish);
  const equipmentCircuitCustomer = (() => {
    const originate = String(latestUpdate.originate || "").trim();
    const terminate = String(latestUpdate.terminate || "").trim();
    if (originate && terminate) return originate === terminate ? originate : `${originate} - ${terminate}`;
    if (originate || terminate) return originate || terminate;
    const firstTicket = (incident.tickets || [])[0] || {};
    return `${firstTicket.cid || ""} ${firstTicket.port || ""}`.trim() || "-";
  })();
  const summaryWhoLabel = tab === "equipment" ? "Circuit ID + Customer" : "Sub Contractor";
  const summaryWhoValue = tab === "equipment" ? equipmentCircuitCustomer : summary.who;
  const summaryWhereLabel = tab === "equipment" ? "สาเหตุ:" : "บริเวณจุดเกิดเหตุ";
  const summaryWhereValue = tab === "equipment" ? (finish.details?.cause || latestUpdate.cause || "-") : summary.where;
  const equipmentSnPairs = finish.details?.snPairs || [];
  const legacySnPairs = (finish.details?.oldSn || finish.details?.newSn)
    ? [{ oldSn: finish.details.oldSn || "", newSn: finish.details.newSn || "" }]
    : [];
  const snPairs = (equipmentSnPairs.length ? equipmentSnPairs : legacySnPairs).filter((pair) => pair.oldSn || pair.newSn);
  const damagedParts = finish.details?.damagedParts?.length
    ? finish.details.damagedParts
    : (finish.details?.damagedPart ? String(finish.details.damagedPart).split(",").map((part) => part.trim()).filter(Boolean) : []);
  const equipmentFixSummary = (() => {
    const fixAction = finish.details?.fixAction || "-";
    const damagedText = damagedParts.length ? damagedParts.join(" ,") : "-";
    const oldSnText = snPairs.length ? snPairs.map((pair) => pair.oldSn).filter(Boolean).join(" ,") : "-";
    const newSnText = snPairs.length ? snPairs.map((pair) => pair.newSn).filter(Boolean).join(" ,") : "-";
    return `แก้ไข [${fixAction}<br>${damagedText}<br>S/N เดิม: ${oldSnText}<br>S/N ใหม่: ${newSnText}<br>]`;
  })();

  const summaryHowLabel = tab === "equipment" ? "สรุปการแก้ไข" : "แก้ไขอย่างไร";
  const summaryHowValue = tab === "equipment"
    ? equipmentFixSummary
    : summary.how;

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
      detail: tab === "equipment" ? (finish.details?.summary || "-") : (finish.details?.repairText || "-"),
      attachments: finish.attachments || [],
    } : null,
  ].filter(Boolean);

  const modal = document.getElementById("modal-corrective-detail") || (() => {
    document.body.insertAdjacentHTML("beforeend", `
        <div id="modal-corrective-detail" class="modal-backdrop hidden fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 p-4">
          <div class="bg-white/95 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden transform transition-all">
            <div class="p-3 md:p-6 pb-3 md:pb-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-orange-50 to-white">
              <h3 id="detail-title" class="text-base md:text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                 <span class="w-1.5 h-8 rounded-full bg-orange-500"></span> 
                 <span id="detail-title-text">View Detail</span>
              </h3>
              <div class="flex items-center gap-2">
                <button id="btn-export-corrective-pdf" class="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-sm" title="Export PDF">📄 PDF</button>
                <button id="btn-close-corrective-detail" class="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer text-lg font-bold">✕</button>
              </div>
            </div>
            <div id="corrective-detail-body" class="p-3 md:p-6 overflow-y-auto custom-scrollbar flex-1"></div>
          </div>
        </div>
      `);
    document.getElementById("btn-close-corrective-detail").onclick = () => closeModal(document.getElementById("modal-corrective-detail"));
    document.getElementById("btn-export-corrective-pdf").onclick = () => exportCorrectiveDetailPDF();
    return document.getElementById("modal-corrective-detail");
  })();

  document.getElementById("detail-title-text").textContent = `View Detail (${incident.incidentId})`;
  document.getElementById("corrective-detail-body").innerHTML = `
      <div class="space-y-8 pb-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div class="p-5 bg-white border border-slate-200 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] rounded-2xl hover:border-orange-300 transition-colors group relative overflow-hidden">
            <div class="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-orange-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-3xl"></div>
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Type</div>
            <div class="font-bold text-slate-800 text-sm md:text-lg relative z-10">${tab}</div>
          </div>
          <div class="p-5 bg-white border border-slate-200 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] rounded-2xl hover:border-orange-300 transition-colors group relative overflow-hidden">
            <div class="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-orange-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-3xl"></div>
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Node</div>
            <div class="font-bold text-slate-800 text-sm md:text-lg relative z-10 truncate">${incident.node || "-"}</div>
          </div>
          <div class="p-5 bg-white border border-slate-200 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] rounded-2xl hover:border-orange-300 transition-colors group relative overflow-hidden">
            <div class="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-orange-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-3xl"></div>
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">${summaryWhoLabel}</div>
            <div class="font-bold text-slate-800 text-sm md:text-lg relative z-10">${summaryWhoValue}</div>
          </div>
          <div class="p-5 bg-white border border-slate-200 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] rounded-2xl hover:border-orange-300 transition-colors group relative overflow-hidden sm:col-span-2 lg:col-span-3">
            <div class="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-orange-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-3xl"></div>
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Update Timeline</div>
            <div class="font-medium text-slate-700 leading-relaxed relative z-10">${summary.what}</div>
          </div>
          <div class="p-5 bg-white border border-slate-200 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] rounded-2xl hover:border-orange-300 transition-colors group relative overflow-hidden sm:col-span-1 lg:col-span-1">
            <div class="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-orange-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-3xl"></div>
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">${summaryWhereLabel}</div>
            <div class="font-bold text-slate-800 relative z-10">${summaryWhereValue}</div>
          </div>
          <div class="p-5 bg-white border border-slate-200 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] rounded-2xl hover:border-orange-300 transition-colors group relative overflow-hidden sm:col-span-1 lg:col-span-2">
            <div class="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-orange-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-3xl"></div>
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">${summaryHowLabel}</div>
            <div class="font-bold text-slate-800 relative z-10">${summaryHowValue}</div>
          </div>
        </div>

        <div>
          <h4 class="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
            <i data-lucide="activity" class="w-5 h-5 text-orange-500"></i>
            Timeline
          </h4>
          <div class="space-y-4 border-l-2 border-orange-200 ml-3 pl-5 py-1 relative">
            ${timeline.length ? timeline.map((item) => `
              <div class="relative bg-white border border-slate-100 shadow-sm rounded-2xl p-4 hover:shadow-md transition-shadow">
                <div class="absolute -left-[1.65rem] top-5 w-3 h-3 bg-orange-500 border-2 border-white rounded-full"></div>
                <div class="flex items-center justify-between mb-2">
                  <div class="text-sm font-bold text-orange-600">${item.title}</div>
                  <div class="text-xs font-semibold text-slate-400 bg-slate-50 px-2 py-1 rounded-md">${formatTimelineDate(item.at)}</div>
                </div>
                <div class="text-sm text-slate-700 leading-relaxed mb-1">${item.detail}</div>
                ${renderTimelineAttachments(item.attachments)}
              </div>
            `).join("") : '<div class="text-slate-400 italic">ยังไม่มี timeline</div>'}
          </div>
        </div>
      </div>
    `;
  document.querySelectorAll(".timeline-image-open").forEach((button) => {
    button.onclick = () => openAttachmentPreview(button.dataset.attachmentImageUrl, button.dataset.attachmentImageName);
  });

  // Stagger base64 image decoding to prevent UI freeze (30ms gap between each)
  const lazyImgs = Array.from(document.querySelectorAll("img.lazy-attach[data-src]"));
  lazyImgs.forEach((img, i) => {
    setTimeout(() => {
      img.src = img.dataset.src;
      img.removeAttribute("data-src");
    }, i * 30);
  });


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
function formatUpdateDistanceText(rawDistance) {
  const value = String(rawDistance || "").trim();
  if (!value) return "";
  const numericDistance = Number(value);
  if (!Number.isFinite(numericDistance)) return value;
  if (value.includes(".")) {
    return `${numericDistance} กิโลเมตร`;
  }
  if (numericDistance >= 1000) {
    return `${(numericDistance / 1000).toFixed(3).replace(/\.?0+$/, "")} กิโลเมตร`;
  }
  return `${numericDistance} เมตร`;
}
function formatUpdateEtrText(rawHour, rawMin) {
  const hourValue = String(rawHour ?? "").trim();
  const minValue = String(rawMin ?? "").trim();
  const hasHour = hourValue !== "";
  const hasMin = minValue !== "";
  if (!hasHour && !hasMin) return "";

  const parsedHour = Number(hourValue || "0");
  const parsedMin = Number(minValue || "0");
  const safeHour = Number.isFinite(parsedHour) ? Math.max(0, parsedHour) : 0;
  const safeMin = Number.isFinite(parsedMin) ? Math.max(0, parsedMin) : 0;

  if (safeHour <= 0 && safeMin > 0) {
    return `${safeMin} นาที`;
  }

  return `${safeHour}.${String(Math.floor(safeMin)).padStart(2, "0")} ชั่วโมง`;
}
function normalizeSiteEntry(entry) {
  return {
    site: String(entry?.site || "").trim(),
    distance: String(entry?.distance || "").trim(),
    area: String(entry?.area || "").trim(),
    latlng: String(entry?.latlng || "").trim(),
  };
}

function isSiteEntryEmpty(entry) {
  return !entry.site && !entry.distance && !entry.area && !entry.latlng;
}

function createUpdateSiteRowHtml(entry = {}, isPrimary = false) {
  const normalized = normalizeSiteEntry(entry);
  const removeBtn = isPrimary
    ? ""
    : `<button type="button" class="btn-remove-site-row px-2 py-1 text-xs bg-slate-200 text-slate-700 rounded-lg">ลบ</button>`;
  return `
      <div class="upd-site-row grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 p-3 border border-slate-200 rounded-xl bg-white">
        <div class="flex flex-col">
          <div class="flex items-center justify-between h-5 mb-1.5">
            <label class="text-xs font-bold text-slate-600">ชื่อ Site:</label>
            ${removeBtn}
          </div>
          <input ${isPrimary ? 'id="upd-site"' : ""} data-field="site" value="${escapeHtml(normalized.site)}" class="w-full h-10 bg-slate-50 border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all rounded-lg px-3 text-sm outline-none" placeholder="เช่น PKD">
        </div>
        <div class="flex flex-col">
          <div class="flex items-center justify-between h-5 mb-1.5">
            <label class="text-xs font-bold text-slate-600">ระยะห่าง (เมตร):</label>
          </div>
          <input ${isPrimary ? 'id="upd-distance"' : ""} data-field="distance" value="${escapeHtml(normalized.distance)}" class="w-full h-10 bg-slate-50 border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all rounded-lg px-3 text-sm outline-none" placeholder="เช่น 1.2 (กม.), 540">
        </div>
        <div class="flex flex-col">
          <div class="flex items-center justify-between h-5 mb-1.5">
            <label class="text-xs font-bold text-slate-600">บริเวณ:</label>
          </div>
          <input ${isPrimary ? 'id="upd-area"' : ""} data-field="area" value="${escapeHtml(normalized.area)}" class="w-full h-10 bg-slate-50 border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all rounded-lg px-3 text-sm outline-none" placeholder="เช่น หน้าซอยสุขุมวิท 50">
        </div>
        <div class="flex flex-col">
          <div class="flex items-center justify-between h-5 mb-1.5">
            <label class="text-xs font-bold text-slate-600">พิกัด (Lat, Long):</label>
          </div>
          <input ${isPrimary ? 'id="upd-latlng"' : ""} data-field="latlng" value="${escapeHtml(normalized.latlng)}" class="w-full h-10 bg-slate-50 border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all rounded-lg px-3 text-sm outline-none" placeholder="เช่น 13.705, 100.502">
          ${isPrimary ? `<button id="btn-get-pin" type="button" class="mt-2 w-full px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold transition-colors">📍 กดได้และดึงข้อมูล</button>` : ""}
        </div>
      </div>`;
}

function renderUpdateSiteRows(containerEl, entries = []) {
  const normalizedEntries = (Array.isArray(entries) ? entries : [])
    .map((entry) => normalizeSiteEntry(entry))
    .filter((entry, index) => index === 0 || !isSiteEntryEmpty(entry));

  const seed = normalizedEntries.length ? normalizedEntries : [normalizeSiteEntry({})];
  containerEl.innerHTML = seed
    .map((entry, index) => createUpdateSiteRowHtml(entry, index === 0))
    .join("");
}

function collectUpdateSiteEntries(containerEl) {
  return Array.from(containerEl.querySelectorAll(".upd-site-row"))
    .map((row) => normalizeSiteEntry({
      site: row.querySelector('[data-field="site"]')?.value,
      distance: row.querySelector('[data-field="distance"]')?.value,
      area: row.querySelector('[data-field="area"]')?.value,
      latlng: row.querySelector('[data-field="latlng"]')?.value,
    }))
    .filter((entry, index) => index === 0 || !isSiteEntryEmpty(entry));
}

function populateSelectFromCatalog(selectId, catalogKey, placeholder, extraOptions) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const cats = window.NocSettings?.getAll()?.catalogs;
  const items = (cats && Array.isArray(cats[catalogKey]) && cats[catalogKey].length)
    ? cats[catalogKey]
    : [];
  const base = `<option value="">${placeholder || '— เลือก —'}</option>`;
  const opts = items.map(v => `<option value="${v}">${v}</option>`).join('');
  const extra = (extraOptions || []).map(o => `<option value="${o.v}">${o.t}</option>`).join('');
  sel.innerHTML = base + opts + extra;
}

function populateSubCheckboxGrid(gridId, inputClass, labelClass) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  const subs = window.NocSettings?.getAll()?.teams?.subcontractors;
  const list = (subs && subs.length) ? subs : [
    { name: 'TAS (Zone1)' }, { name: 'BAN' }, { name: 'TAS (Zone2)' }, { name: 'JL' },
    { name: 'ATG' }, { name: 'TP' }, { name: 'NPY' }, { name: 'JJ&A' }
  ];
  grid.innerHTML = list.map(s =>
    `<label class="${labelClass}"><input type="checkbox" class="${inputClass}" value="${s.name}"> ${s.name}</label>`
  ).join('');
}

function ensureUpdateModal() {
  if (document.getElementById("modal-corrective-update")) return;

  document.body.insertAdjacentHTML(
    "beforeend",
    `
      <div id="modal-corrective-update" class="modal-backdrop hidden">
        <style>
          #modal-corrective-update .upd-shell{background:var(--surface);border-radius:16px;width:100%;max-width:820px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:var(--sh-lg)}
          #modal-corrective-update .upd-hdr{padding:14px 20px;border-bottom:1px solid var(--hair);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;gap:12px}
          #modal-corrective-update .upd-body{display:grid;grid-template-columns:1fr 1fr;flex:1;min-height:0;overflow:hidden}
          #modal-corrective-update .upd-col{padding:18px;overflow-y:auto}
          #modal-corrective-update .upd-col-l{border-right:1px solid var(--hair)}
          #modal-corrective-update .upd-sec-label{display:flex;align-items:center;gap:6px;margin-bottom:14px}
          #modal-corrective-update .upd-sec-label span{font-size:10px;font-weight:700;color:var(--ink-dim);text-transform:uppercase;letter-spacing:.08em}
          #modal-corrective-update .upd-fl{font-size:10px;font-weight:600;color:var(--ink-muted);margin-bottom:4px;display:block;text-transform:uppercase;letter-spacing:.04em}
          #modal-corrective-update .upd-fl .req{color:var(--sev-dn);margin-left:2px}
          #modal-corrective-update .upd-sel,#modal-corrective-update .upd-inp{width:100%;background:var(--surface-2);border:1px solid var(--hair);border-radius:8px;padding:7px 10px;font-size:12px;color:var(--ink);outline:none;transition:border-color .15s;font-family:inherit}
          #modal-corrective-update .upd-sel:focus,#modal-corrective-update .upd-inp:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(234,88,12,.1)}
          #modal-corrective-update .upd-sub-label{display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:8px;border:1px solid var(--hair);font-size:11px;font-weight:500;color:var(--ink-muted);cursor:pointer;transition:all .15s;user-select:none}
          #modal-corrective-update .upd-sub-label:has(input:checked){background:var(--ink);color:var(--canvas);border-color:var(--ink)}
          #modal-corrective-update .upd-sub-label input{display:none}
          #modal-corrective-update .upd-sub-label:has(input:checked)::before{content:"✓";font-size:10px;font-weight:900;margin-right:2px}
          #modal-corrective-update .upd-ftr{padding:11px 20px;border-top:1px solid var(--hair);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;background:var(--surface-2)}
          #modal-corrective-update .upd-clock-badge{display:flex;align-items:center;gap:6px;padding:5px 12px;border-radius:20px;border:1px solid rgba(13,148,136,.25);background:var(--ok-soft)}
          #modal-corrective-update .upd-clock-badge.stopped{border-color:rgba(220,38,38,.25);background:var(--sev-dn-soft)}
          #modal-corrective-update .upd-clock-dot{width:7px;height:7px;border-radius:50%;background:var(--ok);flex-shrink:0}
          #modal-corrective-update .upd-clock-badge.stopped .upd-clock-dot{background:var(--sev-dn)}
          #modal-corrective-update .upd-clock-text{font-size:11px;font-weight:700;color:var(--ok)}
          #modal-corrective-update .upd-clock-badge.stopped .upd-clock-text{color:var(--sev-dn)}
          #modal-corrective-update .upd-dropzone{border:1.5px dashed var(--hair);border-radius:10px;padding:14px;text-align:center;cursor:pointer;transition:border-color .15s}
          #modal-corrective-update .upd-dropzone:hover{border-color:var(--ink-dim)}
          @media(max-width:640px){#modal-corrective-update .upd-body{grid-template-columns:1fr}#modal-corrective-update .upd-col-l{border-right:none;border-bottom:1px solid var(--hair)}}
        </style>
        <div class="upd-shell">

          <!-- ─── Header ─── -->
          <div class="upd-hdr">
            <div style="display:flex;align-items:center;gap:10px;min-width:0">
              <div style="width:38px;height:38px;background:var(--accent);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <i data-lucide="wrench" style="width:18px;height:18px;color:#fff;pointer-events:none"></i>
              </div>
              <div style="min-width:0">
                <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
                  <h2 style="font-size:17px;font-weight:800;color:var(--ink);margin:0;white-space:nowrap">NS Update</h2>
                  <span id="corrective-update-title" style="font-size:11px;font-weight:700;padding:2px 9px;border-radius:6px;background:var(--surface-2);color:var(--ink-muted);font-family:var(--f-mono);white-space:nowrap"></span>
                  <span id="corrective-update-type-badge" style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:var(--accent-soft);color:var(--accent);white-space:nowrap">NS UPDATE</span>
                </div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
              <div id="upd-clock-badge-wrap" class="upd-clock-badge">
                <span class="upd-clock-dot"></span>
                <span class="upd-clock-text">Clock <b id="upd-clock-status" style="font-weight:900">STARTED</b> · <span id="upd-clock-elapsed" style="font-family:var(--f-mono)">00:00:00</span></span>
              </div>
              <button id="btn-close-corrective-update" style="width:30px;height:30px;border-radius:8px;border:1px solid var(--hair);background:transparent;color:var(--ink-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0" title="ปิด">
                <i data-lucide="x" style="width:15px;height:15px;pointer-events:none"></i>
              </button>
            </div>
          </div>

          <!-- ─── Two-column Body ─── -->
          <div class="upd-body">

            <!-- LEFT: ข้อมูลจุดเสีย -->
            <div class="upd-col upd-col-l">
              <div class="upd-sec-label">
                <i data-lucide="map-pin" style="width:13px;height:13px;color:var(--ink-dim);flex-shrink:0"></i>
                <span>ข้อมูลจุดเสีย · FAILURE POINT</span>
              </div>

              <!-- OFC / Network / Cause -->
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
                <div>
                  <label class="upd-fl">OFC Type<span class="req">*</span></label>
                  <select id="upd-ofc-type" class="upd-sel">
                    <option value="">เลือกประเภท</option>
                    <option>หลายเส้น</option>
                    <option>Flat type 2 Core</option><option>4 Core ADSS</option><option>12 Core ADSS</option><option>24 Core ADSS</option>
                    <option>48 Core ADSS</option><option>60 Core ADSS</option><option>144 Core ADSS</option><option>216 Core ADSS</option>
                    <option>312 Core ADSS</option><option>12 Core Armour</option><option>48 Core Armour</option><option>60 Core Armour</option><option>144 Core Armour</option>
                  </select>
                  <div class="mt-2 p-2 rounded-lg hidden" id="upd-multi-ofc-summary-wrap" style="border:1px solid rgba(13,148,136,.3);background:var(--ok-soft)">
                    <div style="font-size:11px;font-weight:700;color:var(--ok)">OFC ที่เลือก:</div>
                    <div id="upd-multi-ofc-summary" style="font-size:11px;color:var(--ok-ink)"></div>
                  </div>
                </div>
                <div>
                  <label class="upd-fl">Network Type</label>
                  <select id="upd-network-type" class="upd-sel">
                    <option value="">-</option>
                    <option value="Backbone">Backbone</option>
                    <option value="Access">Access</option>
                  </select>
                </div>
                <div>
                  <label class="upd-fl">สาเหตุ · Cause</label>
                  <select id="upd-cause" class="upd-sel">
                    <option value="">เลือกสาเหตุ</option>
                    <option>Animal gnawing</option><option>High loss/Crack</option><option>Cut by Unknown agency</option><option>Cut trees</option><option>Cut by MEA/PEA agency</option><option>Car accident</option><option>Electrical Surge</option><option>Electrical pole was broken by accident</option><option>Electrical pole was broken by Natural Disaster</option><option>Electric Authority remove pole</option><option>Road Construction</option><option>BTS Construction</option><option>Fire damanged</option><option>Natural Disaster</option><option>Equipment at Node</option><option>Equipment at customer</option><option>Bullet</option>
                  </select>
                </div>
              </div>

              <!-- Circuit ID -->
              <div style="margin-bottom:12px">
                <label class="upd-fl">Circuit ID + Customer <span style="font-weight:500;text-transform:none;letter-spacing:0">(ไม่บังคับ)</span></label>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                  <select id="upd-originate" class="upd-sel"></select>
                  <select id="upd-terminate" class="upd-sel"></select>
                </div>
              </div>

              <!-- Site rows -->
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <span style="font-size:10px;font-weight:700;color:var(--ink-muted);text-transform:uppercase;letter-spacing:.04em">ข้อมูลจุดเสีย <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--ink-dim)">(Site / Distance / Area / Lat,Long)</span></span>
                <button id="btn-add-site-row" type="button" style="display:flex;align-items:center;gap:4px;padding:4px 10px;border-radius:7px;background:var(--surface-2);border:1px solid var(--hair);font-size:11px;font-weight:600;color:var(--ink-muted);cursor:pointer">
                  <i data-lucide="plus" style="width:12px;height:12px;pointer-events:none"></i>
                </button>
              </div>
              <div id="upd-site-rows" style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px"></div>

              <!-- Sub Contractor -->
              <div>
                <label class="upd-fl">Sub Contractor <span style="font-weight:500;text-transform:none;letter-spacing:0">(เลือกได้หลายเจ้า)</span></label>
                <div id="upd-sub-grid" style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-top:6px"></div>
              </div>
            </div>

            <!-- RIGHT: รูปภาพ & การดำเนินงาน -->
            <div class="upd-col">
              <div class="upd-sec-label">
                <i data-lucide="camera" style="width:13px;height:13px;color:var(--ink-dim);flex-shrink:0"></i>
                <span>รูปภาพ & การดำเนินงาน</span>
              </div>

              <input id="upd-camera-input" type="file" accept="image/*" capture="environment" class="hidden">
              <input id="upd-file-input" type="file" multiple accept="image/*,.pdf,.doc,.docx" class="hidden">

              <!-- Photo / Attach buttons -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
                <label for="upd-camera-input" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;border-radius:9px;background:var(--ink);color:var(--canvas);font-size:12px;font-weight:600;cursor:pointer;transition:opacity .15s" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
                  <i data-lucide="camera" style="width:14px;height:14px;pointer-events:none"></i> ถ่ายภาพ
                </label>
                <label for="upd-file-input" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;border-radius:9px;background:transparent;border:1.5px solid var(--hair);color:var(--ink-muted);font-size:12px;font-weight:600;cursor:pointer;transition:all .15s" onmouseover="this.style.borderColor='var(--ink-dim)';this.style.color='var(--ink)'" onmouseout="this.style.borderColor='var(--hair)';this.style.color='var(--ink-muted)'">
                  <i data-lucide="paperclip" style="width:14px;height:14px;pointer-events:none"></i> แนบไฟล์
                </label>
              </div>

              <!-- Dropzone -->
              <label for="upd-file-input" class="upd-dropzone" style="display:block;margin-bottom:10px">
                <i data-lucide="upload-cloud" style="width:20px;height:20px;color:var(--ink-dim);margin:0 auto 6px;display:block"></i>
                <p style="font-size:11px;color:var(--ink-muted);margin:0">ลากวางหรือคลิกเพื่อแนบไฟล์</p>
                <p style="font-size:10px;color:var(--ink-dim);margin:3px 0 0">JPG, PNG, PDF — สูงสุด 20 MB</p>
              </label>

              <!-- Attachment preview -->
              <div id="upd-attachments-preview" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;min-height:10px"></div>

              <!-- Clock section -->
              <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;background:var(--surface-2);border:1px solid var(--hair);margin-bottom:10px">
                <span style="font-size:10px;font-weight:700;color:var(--ink-dim);text-transform:uppercase;letter-spacing:.06em;flex-shrink:0">Clock</span>
                <span style="font-size:11px;font-weight:700;color:var(--ok);background:var(--ok-soft);padding:2px 8px;border-radius:20px;letter-spacing:.04em">STARTED</span>
                <div style="flex:1"></div>
                <button id="upd-start" style="display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:7px;background:#10b981;color:#fff;font-size:11px;font-weight:700;border:none;cursor:pointer;flex-shrink:0">
                  <i data-lucide="play" style="width:11px;height:11px;pointer-events:none"></i> Start
                </button>
                <button id="upd-stop" style="display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:7px;background:transparent;color:var(--sev-dn);border:1.5px solid var(--sev-dn);font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0">
                  <i data-lucide="square" style="width:10px;height:10px;pointer-events:none"></i> Stop
                </button>
              </div>

              <!-- Stop reason -->
              <div style="margin-bottom:10px">
                <label class="upd-fl">เหตุผลกรณีกด Stop</label>
                <select id="upd-stop-reason" class="upd-sel">
                  <option value="">— เลือกเหตุผล —</option>
                  <option>เนื่องจากรอเจ้าหน้าที่การไฟฟ้าให้เข้าดำเนินการแก้ไข</option>
                  <option>เนื่องจากเพลิงยังลุกไหม้อยู่</option>
                  <option>เนื่องจากรอเจ้าหน้าที่ปักเสาไฟฟ้าใหม่</option>
                  <option>เนื่องจากรอเจ้าหน้าที่อนุญาตให้เข้าพื้นที่</option>
                  <option>ตรวจสอบพบ OFC มีปัญหาในพื้นที่ลูกค้า</option>
                  <option>ตรวจสอบพบ OFC มีปัญหาในพื้นอาคาร</option>
                  <option value="__other__">อื่นๆ (กรอกเอง)</option>
                </select>
                <input id="upd-stop-reason-custom" class="upd-inp hidden" style="margin-top:6px" placeholder="ระบุเหตุผล Stop เพิ่มเติม">
              </div>

              <!-- Initial fix + ETR -->
              <div id="upd-initial-fix-wrap" style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end;margin-bottom:12px">
                <div>
                  <label class="upd-fl">การแก้ไขเบื้องต้น</label>
                  <select id="upd-initial-fix" class="upd-sel">
                    <option value="">ลากคร่อม</option>
                    <option value="ลากคร่อม">ลากคร่อม</option>
                    <option value="ร่นลูป">ร่นลูป</option>
                    <option value="โยก Core">โยก Core</option>
                    <option value="ตัดต่อใหม่">ตัดต่อใหม่</option>
                    <option value="ค่าเร่งด่วน">ค่าเร่งด่วน</option>
                  </select>
                </div>
                <div>
                  <label class="upd-fl">ETR · Estimated Time to Restore</label>
                  <div style="display:flex;align-items:center;gap:4px">
                    <input id="upd-etr-hour" type="number" min="0" class="upd-inp" style="width:52px;text-align:center" placeholder="0">
                    <span style="font-size:11px;font-weight:600;color:var(--ink-muted)">HR</span>
                    <input id="upd-etr-min" type="number" min="0" max="59" class="upd-inp" style="width:52px;text-align:center" placeholder="0">
                    <span style="font-size:11px;font-weight:600;color:var(--ink-muted)">MIN</span>
                  </div>
                </div>
              </div>

              <!-- Generate button -->
              <button id="btn-generate-update" style="width:100%;padding:11px;border-radius:10px;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:13px;font-weight:800;border:none;cursor:pointer;box-shadow:0 4px 14px -3px rgba(234,88,12,.4);transition:all .15s;margin-bottom:10px" onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 6px 18px -3px rgba(234,88,12,.5)'" onmouseout="this.style.transform='';this.style.boxShadow='0 4px 14px -3px rgba(234,88,12,.4)'">
                ✨ สร้างสรุป Update
              </button>

              <!-- Message textarea -->
              <div style="position:relative">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
                  <label class="upd-fl" style="margin:0">ข้อความ Update <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--ink-dim)">(สร้างอัตโนมัติ)</span></label>
                  <button id="btn-upd-copy-msg" type="button" style="display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:var(--surface-2);border:1px solid var(--hair);font-size:10px;font-weight:600;color:var(--ink-muted);cursor:pointer">
                    <i data-lucide="copy" style="width:11px;height:11px;pointer-events:none"></i> COPY
                  </button>
                </div>
                <textarea id="upd-message" class="upd-inp" style="height:90px;resize:none;line-height:1.5" placeholder="ข้อความอัปเดต (จะถูกสร้างอัตโนมัติ)"></textarea>
              </div>
            </div>
          </div>

          <!-- ─── Footer ─── -->
          <div class="upd-ftr">
            <div style="display:flex;align-items:center;gap:10px">
              <i data-lucide="user-circle" style="width:14px;height:14px;color:var(--ink-dim)"></i>
              <span id="upd-footer-user" style="font-size:11px;font-weight:600;color:var(--ink-muted)">—</span>
              <span style="color:var(--hair);font-size:12px">·</span>
              <i data-lucide="clock" style="width:13px;height:13px;color:var(--ink-dim)"></i>
              <span id="upd-footer-ts" style="font-size:11px;color:var(--ink-dim)">—</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <button id="btn-cancel-corrective-update" style="padding:7px 18px;border-radius:9px;background:transparent;border:1.5px solid var(--hair);color:var(--ink-muted);font-size:12px;font-weight:600;cursor:pointer;transition:all .15s" onmouseover="this.style.borderColor='var(--ink-dim)';this.style.color='var(--ink)'" onmouseout="this.style.borderColor='var(--hair)';this.style.color='var(--ink-muted)'">ยกเลิก</button>
              <button id="btn-save-corrective-update" style="display:flex;align-items:center;gap:6px;padding:7px 18px;border-radius:9px;background:var(--ink);color:var(--canvas);font-size:12px;font-weight:700;border:none;cursor:pointer;transition:opacity .15s" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
                <i data-lucide="save" style="width:13px;height:13px;pointer-events:none"></i> บันทึก Update
              </button>
            </div>
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
  const siteRows = document.getElementById("upd-site-rows");
  const addSiteRowBtn = document.getElementById("btn-add-site-row");
  const ofcTypeSelect = document.getElementById("upd-ofc-type");
  const multiOfcSummaryWrap = document.getElementById("upd-multi-ofc-summary-wrap");
  const multiOfcSummary = document.getElementById("upd-multi-ofc-summary");
  const multiOfcModal = document.getElementById("modal-multi-ofc");
  const multiOfcInputs = document.getElementById("multi-ofc-inputs");
  renderUpdateSiteRows(siteRows, []);

  addSiteRowBtn.onclick = () => {
    siteRows.insertAdjacentHTML("beforeend", createUpdateSiteRowHtml({}, false));
  };

  siteRows.addEventListener("click", (event) => {
    const removeBtn = event.target.closest(".btn-remove-site-row");
    if (!removeBtn) return;
    removeBtn.closest(".upd-site-row")?.remove();
  });

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
  const stopReasonSelect = document.getElementById("upd-stop-reason");
  const stopReasonCustomInput = document.getElementById("upd-stop-reason-custom");
  const stopReasonOptions = Array.from(stopReasonSelect.options).map((option) => option.value || option.textContent.trim());
  const OTHER_STOP_REASON_VALUE = "__other__";

  function syncStopReasonCustomInput() {
    const isOtherSelected = stopReasonSelect.value === OTHER_STOP_REASON_VALUE;
    stopReasonCustomInput.classList.toggle("hidden", !isOtherSelected);
    if (!isOtherSelected) {
      stopReasonCustomInput.value = "";
    }
  }

  stopReasonSelect.onchange = syncStopReasonCustomInput;
  syncStopReasonCustomInput();

  function updClockElapsed(startIso, stopIso) {
    const s = new Date(startIso).getTime();
    const e = stopIso ? new Date(stopIso).getTime() : Date.now();
    if (!s || isNaN(s)) return "00:00:00";
    const tot = Math.max(0, Math.floor((e - s) / 1000));
    const hh = String(Math.floor(tot / 3600)).padStart(2, "0");
    const mm = String(Math.floor((tot % 3600) / 60)).padStart(2, "0");
    const ss = String(tot % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function updSetClockUI(status) {
    const badge = document.getElementById("upd-clock-badge-wrap");
    const statusEl = document.getElementById("upd-clock-status");
    const isStopped = status === "STOPPED";
    if (statusEl) statusEl.textContent = status;
    if (badge) badge.classList.toggle("stopped", isStopped);
  }

  function updStartTimer() {
    if (window._updClockInterval) clearInterval(window._updClockInterval);
    window._updClockInterval = setInterval(() => {
      const el = document.getElementById("upd-clock-elapsed");
      if (!el) { clearInterval(window._updClockInterval); return; }
      const m = document.getElementById("modal-corrective-update");
      if (!m || m.classList.contains("hidden")) { clearInterval(window._updClockInterval); return; }
      el.textContent = updClockElapsed(m.dataset.startClockAt, "");
    }, 1000);
  }

  document.getElementById("upd-start").onclick = () => {
    modal.dataset.startClockAt = new Date().toISOString();
    modal.dataset.stopClockAt = "";
    updSetClockUI("STARTED");
    updStartTimer();
  };

  document.getElementById("upd-stop").onclick = () => {
    const selectedReason = stopReasonSelect.value.trim();
    const stopReason = selectedReason === OTHER_STOP_REASON_VALUE
      ? stopReasonCustomInput.value.trim()
      : selectedReason;
    if (!stopReason) {
      alert("กรุณาเลือกเหตุผลกรณีกด Stop");
      return;
    }
    const stopAt = new Date().toISOString();
    modal.dataset.stopClockAt = stopAt;
    modal.dataset.stopReason = stopReason;
    updSetClockUI("STOPPED");
    if (window._updClockInterval) clearInterval(window._updClockInterval);
    const el = document.getElementById("upd-clock-elapsed");
    if (el) el.textContent = updClockElapsed(modal.dataset.startClockAt, stopAt);
  };

  document.getElementById("btn-upd-copy-msg")?.addEventListener("click", () => {
    const txt = document.getElementById("upd-message")?.value || "";
    if (txt) navigator.clipboard?.writeText(txt).catch(() => {});
    const btn = document.getElementById("btn-upd-copy-msg");
    if (btn) { btn.textContent = "✓ Copied"; setTimeout(() => { btn.innerHTML = '<i data-lucide="copy" style="width:11px;height:11px;pointer-events:none"></i> COPY'; if (window.lucide) lucide.createIcons({ nodes: [btn] }); }, 1500); }
  });

  const cameraInput = document.getElementById("upd-camera-input");
  const fileInput = document.getElementById("upd-file-input");
  const preview = document.getElementById("upd-attachments-preview");

  // Accumulate files across multiple selections (window scope so save handler can access)
  window._updSelectedFiles = window._updSelectedFiles || [];

  function renderAttachmentPreview() {
    preview.innerHTML = window._updSelectedFiles.length === 0
      ? `<span class="text-xs text-slate-400">ยังไม่ได้เลือกไฟล์</span>`
      : window._updSelectedFiles.map((file, idx) => {
          const isImage = file.type.startsWith("image/");
          const objUrl = isImage ? URL.createObjectURL(file) : "";
          return `<div class="relative group inline-block">
            ${isImage
              ? `<img src="${objUrl}" class="w-20 h-20 object-cover rounded-lg border border-slate-200" alt="${file.name}">`
              : `<div class="w-20 h-20 flex items-center justify-center bg-slate-100 rounded-lg border border-slate-200 text-xs text-center p-1 break-all">${file.name}</div>`}
            <button type="button" data-idx="${idx}" class="upd-remove-file absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
          </div>`;
        }).join("");
    // Bind remove buttons
    preview.querySelectorAll(".upd-remove-file").forEach((btn) => {
      btn.onclick = () => {
        window._updSelectedFiles.splice(Number(btn.dataset.idx), 1);
        renderAttachmentPreview();
      };
    });
  }

  function addFiles(files) {
    const newFiles = Array.from(files || []);
    const existingNames = new Set(window._updSelectedFiles.map((f) => f.name));
    newFiles.forEach((f) => { if (!existingNames.has(f.name)) window._updSelectedFiles.push(f); });
    renderAttachmentPreview();
  }

  cameraInput.onchange = () => addFiles(cameraInput.files);
  fileInput.onchange = () => addFiles(fileInput.files);
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

  // Event delegation — btn-get-pin is inside dynamically rendered site rows
  const updateModal = document.getElementById("modal-corrective-update");
  if (updateModal && !updateModal.dataset.pinBound) {
    updateModal.dataset.pinBound = "1";
    updateModal.addEventListener("click", (e) => {
      if (!e.target.closest("#btn-get-pin")) return;
      if (!navigator.geolocation) return alert("อุปกรณ์ไม่รองรับ geolocation");
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const latlng = `${lat}, ${lon}`;
        const latlngEl = document.getElementById("upd-latlng");
        if (latlngEl) latlngEl.value = latlng;
        const place = await reverseGeocode(lat, lon);
        if (place) {
          const areaEl = document.getElementById("upd-area");
          if (areaEl) areaEl.value = place;
        }
      }, (err) => {
        alert("ไม่สามารถดึงพิกัดได้: " + err.message);
      });
    });
  }
}
function ensureEquipmentUpdateModal() {
  if (document.getElementById("modal-corrective-update-equipment")) return;

  document.body.insertAdjacentHTML("beforeend", `
    <style id="style-eq-upd-modal">
    #modal-corrective-update-equipment{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);z-index:1100;padding:16px}
    #modal-corrective-update-equipment.hidden{display:none}
    #modal-corrective-update-equipment .equ-card{background:var(--canvas);border-radius:24px;width:100%;max-width:600px;display:flex;flex-direction:column;max-height:95vh;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.28)}
    #modal-corrective-update-equipment .equ-body{flex:1;overflow-y:auto;padding:20px 24px;display:flex;flex-direction:column;gap:16px}
    #modal-corrective-update-equipment .equ-slabel{font-size:10px;font-weight:700;color:var(--ink-muted);text-transform:uppercase;letter-spacing:.08em;display:flex;align-items:center;gap:6px;margin-bottom:8px}
    #modal-corrective-update-equipment .equ-flabel{font-size:10px;font-weight:700;color:var(--ink-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;display:flex;align-items:center;gap:4px}
    #modal-corrective-update-equipment .equ-inp{width:100%;height:40px;padding:0 12px;background:var(--surface-2,#f5f5f4);border:1px solid var(--hair);border-radius:8px;font-size:13px;color:var(--ink);outline:none;transition:border-color .15s}
    #modal-corrective-update-equipment .equ-inp:focus{border-color:var(--ok,#10b981)}
    #modal-corrective-update-equipment .equ-btn-cam{display:flex;align-items:center;justify-content:center;gap:6px;flex:1;height:40px;background:var(--ink);color:var(--canvas);border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}
    #modal-corrective-update-equipment .equ-btn-file{display:flex;align-items:center;justify-content:center;gap:6px;flex:1;height:40px;background:transparent;color:var(--ink);border:1px solid var(--hair);border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}
    #modal-corrective-update-equipment .equ-dropzone{border:2px dashed var(--hair);border-radius:10px;padding:16px;text-align:center;color:var(--ink-muted);background:var(--surface-2)}
    #modal-corrective-update-equipment .equ-btn-gen{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:12px;background:var(--warn,#f97316);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;transition:opacity .15s}
    #modal-corrective-update-equipment .equ-btn-gen:hover{opacity:.88}
    #modal-corrective-update-equipment .equ-btn-ghost{padding:8px 20px;background:transparent;border:1px solid var(--hair);border-radius:10px;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer}
    #modal-corrective-update-equipment .equ-btn-ghost:hover{background:var(--surface-2)}
    #modal-corrective-update-equipment .equ-btn-save{display:flex;align-items:center;gap:6px;padding:8px 22px;background:var(--ink);color:var(--canvas);border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;transition:opacity .15s}
    #modal-corrective-update-equipment .equ-btn-save:hover{opacity:.8}
    </style>
    <div id="modal-corrective-update-equipment" class="hidden">
      <div class="equ-card">

        <!-- HEADER -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 22px;border-bottom:1px solid var(--hair);flex-shrink:0">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:40px;height:40px;background:var(--ink);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <i data-lucide="server" style="width:20px;height:20px;color:var(--canvas)"></i>
            </div>
            <div>
              <p style="font-size:10px;font-weight:700;color:var(--warn,#f97316);text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px">NS UPDATE · EQUIPMENT</p>
              <div style="display:flex;align-items:center;gap:8px">
                <h2 id="equipment-update-title" style="font-size:18px;font-weight:900;color:var(--ink);line-height:1">NS Update</h2>
                <span id="eq-upd-incident-badge" style="padding:2px 10px;background:var(--surface-2);border:1px solid var(--hair);border-radius:6px;font-size:12px;font-weight:600;color:var(--ink-muted)"></span>
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span id="eq-upd-status-badge" style="display:none;align-items:center;gap:5px;padding:5px 12px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);border-radius:20px;font-size:12px;font-weight:700;color:#059669">
              <span style="width:7px;height:7px;border-radius:50%;background:#059669;display:inline-block"></span>
              <span id="eq-upd-status-badge-text"></span>
            </span>
            <button id="btn-close-equipment-update" style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:1px solid var(--hair);border-radius:8px;background:transparent;cursor:pointer">
              <i data-lucide="x" style="width:16px;height:16px;color:var(--ink-muted)"></i>
            </button>
          </div>
        </div>

        <!-- BODY -->
        <div class="equ-body">

          <!-- Section label -->
          <p class="equ-slabel"><i data-lucide="activity" style="width:12px;height:12px"></i> รายละเอียด UPDATE (EQUIPMENT)</p>

          <!-- Status + Finding -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <p class="equ-flabel">สถานะปัจจุบัน <span style="color:#ef4444;font-size:11px">*</span></p>
              <select id="eq-upd-status" class="equ-inp" style="padding:0 10px">
                <option value="">— เลือกสถานะ —</option>
                <option>Investigating</option>
                <option>เดินทางถึงลูกค้าแล้ว</option>
                <option>ตรวจสอบพบ</option>
                <option>กำลังแก้ไข</option>
                <option>รอ Spare</option>
                <option>แก้ไขเสร็จ</option>
              </select>
            </div>
            <div>
              <p class="equ-flabel">สิ่งที่ตรวจสอบพบ <span style="color:#ef4444;font-size:11px">*</span></p>
              <select id="eq-upd-finding" class="equ-inp" style="padding:0 10px">
                <option value="">— เลือกสิ่งที่ตรวจพบ —</option>
                <option>อุปกรณ์ Hang</option><option>SFP Hang/เสีย</option><option>Rectifier Fail</option>
                <option>พัดลมเสีย/ดัง</option><option>Card Fail</option><option>Port เสีย</option>
                <option>Config มีปัญหา</option><option>Adapter เสีย</option><option>UPS มีปัญหา</option>
                <option>สาย LAN หลวม</option><option>Patch Cord มีปัญหา</option><option>สายไฟหลวม</option>
                <option>สาย Fiber หลวม</option><option>ระบบไฟฟ้าที่ลูกค้ามีปัญหา</option><option>อื่นๆ</option>
              </select>
              <div id="eq-upd-finding-other-wrap" class="hidden" style="margin-top:5px">
                <input id="eq-upd-finding-other" class="equ-inp" placeholder="ระบุสิ่งที่ตรวจสอบพบ">
              </div>
            </div>
          </div>

          <!-- Circuit ID -->
          <div>
            <p class="equ-flabel">Circuit ID + Customer <span style="font-size:9px;font-weight:400;text-transform:none;opacity:.6">(ไม่บังคับ)</span></p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <select id="eq-upd-originate" class="equ-inp" style="padding:0 10px"></select>
              <select id="eq-upd-terminate" class="equ-inp" style="padding:0 10px"></select>
            </div>
          </div>

          <!-- Photos -->
          <div>
            <p class="equ-slabel"><i data-lucide="image" style="width:12px;height:12px"></i> รูปภาพประกอบ</p>
            <input id="eq-upd-camera-input" type="file" accept="image/*" capture="environment" class="hidden">
            <input id="eq-upd-file-input" type="file" multiple class="hidden">
            <div style="display:flex;gap:8px;margin-bottom:10px">
              <label for="eq-upd-camera-input" class="equ-btn-cam" style="cursor:pointer">
                <i data-lucide="camera" style="width:15px;height:15px"></i> ถ่ายภาพ
              </label>
              <label for="eq-upd-file-input" class="equ-btn-file" style="cursor:pointer">
                <i data-lucide="paperclip" style="width:14px;height:14px"></i> แนบไฟล์
              </label>
            </div>
            <div class="equ-dropzone">
              <i data-lucide="upload-cloud" style="width:22px;height:22px;margin:0 auto 6px;color:var(--ink-dim)"></i>
              <p style="font-size:12px;font-weight:600;color:var(--ink-muted)">ลากวางหรือคลิกเพื่อแนบไฟล์</p>
              <p style="font-size:10px;color:var(--ink-dim);margin-top:2px">JPG, PNG, PDF — สูงสุด 20 MB</p>
            </div>
            <div id="eq-upd-attachments-preview" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;min-height:0"></div>
          </div>

          <!-- Generate -->
          <button id="btn-generate-eq-update" class="equ-btn-gen">
            <i data-lucide="sparkles" style="width:15px;height:15px"></i> สร้างสรุป Update
          </button>

          <!-- Message -->
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <p class="equ-flabel" style="margin-bottom:0">ข้อความอัปเดต <span style="font-size:9px;font-weight:400;text-transform:none;opacity:.6">(สรุปปรากฏการณ์)</span></p>
              <button id="btn-eq-upd-copy" style="font-size:9px;font-weight:700;color:var(--ink-muted);background:var(--surface-2);border:1px solid var(--hair);border-radius:5px;padding:2px 8px;cursor:pointer">COPY</button>
            </div>
            <textarea id="eq-upd-message" rows="4" style="width:100%;padding:8px 10px;background:var(--canvas);border:1px solid var(--hair);border-radius:8px;font-size:12px;color:var(--ink);resize:vertical;outline:none" placeholder="สรุปปรากฏการณ์..."></textarea>
          </div>

        </div><!-- /equ-body -->

        <!-- FOOTER -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 22px;border-top:1px solid var(--hair);flex-shrink:0">
          <div style="display:flex;align-items:center;gap:6px;color:var(--ink-muted);font-size:12px">
            <i data-lucide="user" style="width:13px;height:13px"></i>
            <span id="eq-upd-footer-user" style="font-weight:600">—</span>
            <span style="opacity:.35">·</span>
            <i data-lucide="clock" style="width:12px;height:12px"></i>
            <span id="eq-upd-footer-time" style="color:var(--ink-dim)">—</span>
          </div>
          <div style="display:flex;gap:8px">
            <button id="btn-cancel-equipment-update" class="equ-btn-ghost">ยกเลิก</button>
            <button id="btn-save-equipment-update" class="equ-btn-save">
              <i data-lucide="save" style="width:14px;height:14px"></i> บันทึก
            </button>
          </div>
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
    const files = [
      ...Array.from(camInput.files || []),
      ...Array.from(fileInput.files || []),
    ];
    if (!files.length) { preview.innerHTML = ""; return; }
    preview.innerHTML = files.map(f => {
      const isImg = f.type.startsWith("image/");
      const url = isImg ? URL.createObjectURL(f) : "";
      return isImg
        ? `<div style="width:56px;height:56px;border-radius:8px;overflow:hidden;border:1px solid var(--hair)"><img src="${url}" style="width:100%;height:100%;object-fit:cover"></div>`
        : `<div style="width:56px;height:56px;border-radius:8px;background:var(--surface-2);border:1px solid var(--hair);display:flex;align-items:center;justify-content:center;font-size:20px">📄</div>`;
    }).join("");
  }

  camInput.onchange = renderPreview;
  fileInput.onchange = renderPreview;

  document.getElementById("btn-eq-upd-copy")?.addEventListener("click", () => {
    const txt = document.getElementById("eq-upd-message")?.value || "";
    if (txt) navigator.clipboard.writeText(txt).catch(() => {});
  });

  const findingSelect = document.getElementById("eq-upd-finding");
  const otherWrap = document.getElementById("eq-upd-finding-other-wrap");
  const otherInput = document.getElementById("eq-upd-finding-other");
  findingSelect.onchange = () => {
    const isOther = findingSelect.value === "อื่นๆ";
    otherWrap.classList.toggle("hidden", !isOther);
    if (!isOther) otherInput.value = "";
  };

  if (window.lucide) lucide.createIcons();
}

function openEquipmentUpdateModal(incidentId) {
  const found = getCorrectiveIncidentById(incidentId);
  if (!found) return;

  ensureEquipmentUpdateModal();
  populateSelectFromCatalog('eq-upd-status',  'eqStatuses', '— เลือกสถานะ —');
  populateSelectFromCatalog('eq-upd-finding', 'eqFindings', '— เลือกสิ่งที่ตรวจพบ —');
  const modal = document.getElementById("modal-corrective-update-equipment");
  const { incident, tab } = found;

  const equBadge = document.getElementById("eq-upd-incident-badge");
  if (equBadge) equBadge.textContent = incident.incidentId || "";
  const equFooterUser = document.getElementById("eq-upd-footer-user");
  if (equFooterUser) equFooterUser.textContent = incident.respondedBy || incident.createdBy || "—";
  const equFooterTime = document.getElementById("eq-upd-footer-time");
  if (equFooterTime) {
    const now = new Date();
    equFooterTime.textContent = `${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")} · ${now.getDate().toString().padStart(2,"0")} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][now.getMonth()]} ${now.getFullYear()}`;
  }
  const curStatus = String(incident.status || "").toUpperCase();
  const equStatusBadge = document.getElementById("eq-upd-status-badge");
  const equStatusText = document.getElementById("eq-upd-status-badge-text");
  if (equStatusBadge && equStatusText && curStatus) {
    equStatusText.textContent = `Status ${curStatus}`;
    equStatusBadge.style.display = "flex";
  }

  const firstTicket = getFirstSymphonyTicket(incident);

  renderCircuitCustomerSelectors({
    originSelectId: "eq-upd-originate",
    terminateSelectId: "eq-upd-terminate",
    firstTicket,
  });

  document.getElementById("eq-upd-status").value = "";
  document.getElementById("eq-upd-finding").value = "";
  document.getElementById("eq-upd-finding-other").value = "";
  document.getElementById("eq-upd-finding-other-wrap").classList.add("hidden");
  document.getElementById("eq-upd-message").value = "";
  document.getElementById("eq-upd-camera-input").value = "";
  document.getElementById("eq-upd-file-input").value = "";
  const prevEl = document.getElementById("eq-upd-attachments-preview");
  if (prevEl) prevEl.innerHTML = "";
  document.getElementById("btn-generate-eq-update").onclick = () => {
    const updateNo = ((incident.updates || []).length || 0) + 1;
    const status = document.getElementById("eq-upd-status").value || "";
    const findingRaw = document.getElementById("eq-upd-finding").value || "";
    const findingOther = document.getElementById("eq-upd-finding-other").value.trim();
    const finding = findingRaw === "อื่นๆ" ? (findingOther || "อื่นๆ") : findingRaw;

    const incidentAlarm = incident.alarm || "Equipment";
    const node = incident.node || incident.incidentId || "-";
    if (status === "Investigating") {
      document.getElementById("eq-upd-message").value = `Update#${updateNo}: Equipment ${incidentAlarm} at ${node} · Investigating · Engineer dispatched ETA 30 min`;
      return;
    }
    if (status === "เดินทางถึงลูกค้าแล้ว") {
      document.getElementById("eq-upd-message").value = `Update#${updateNo} เดินทางถึงแล้วครับ`;
      return;
    }
    if (status === "ตรวจสอบพบ") {
      const findingText = finding || "-";
      document.getElementById("eq-upd-message").value = `Update#${updateNo} ตรวจสอบพบ ${findingText} กำลังเร่งดำเนินการแก้ไข`;
      return;
    }
    if (status === "รอ Spare") {
      document.getElementById("eq-upd-message").value = `Update#${updateNo} รอ Spare อุปกรณ์ ${finding || incidentAlarm} · กำลังดำเนินการจัดหา`;
      return;
    }
    if (status === "แก้ไขเสร็จ") {
      document.getElementById("eq-upd-message").value = `Update#${updateNo} แก้ไขเสร็จเรียบร้อย · ${finding || incidentAlarm} · ระบบกลับมาปกติแล้ว`;
      return;
    }
    document.getElementById("eq-upd-message").value = `Update#${updateNo} กำลังเร่งดำเนินการแก้ไข`;

  };

  document.getElementById("btn-save-equipment-update").onclick = async () => {
  try {
    const current = Store.getState();
    const selectedOrigin = document.getElementById("eq-upd-originate").value;
    const selectedTerminate = document.getElementById("eq-upd-terminate").value;
    const circuitSelection = resolveCircuitCustomerSelection({
      firstTicket,
      selectedOrigin,
      selectedTerminate,
    });
    const findingRaw = document.getElementById("eq-upd-finding").value || "";
    const findingOther = document.getElementById("eq-upd-finding-other").value.trim();
    const resolvedFinding = findingRaw === "อื่นๆ" ? (findingOther || "อื่นๆ") : findingRaw;

    // Collect files and upload (same as Fiber update)
    const allFiles = [
      ...Array.from(document.getElementById("eq-upd-camera-input").files || []),
      ...Array.from(document.getElementById("eq-upd-file-input").files || []),
    ];
    const attachmentPayload = allFiles.length && typeof buildAttachmentPayload === "function"
      ? await buildAttachmentPayload(allFiles, [])
      : [];

    const updatePayload = {
      at: new Date().toISOString(),
      equipmentStatus: document.getElementById("eq-upd-status").value,
      equipmentFinding: resolvedFinding,
      originate: circuitSelection.originate,
      terminate: circuitSelection.terminate,
      message: document.getElementById("eq-upd-message").value,
      attachments: attachmentPayload,
    };

    const nextCorrective = { ...current.corrective };
    nextCorrective[tab] = (nextCorrective[tab] || []).map((item) =>
      getIncidentKey(item) === incidentId
        ? { ...item, updates: [...(item.updates || []), updatePayload], latestUpdateMessage: updatePayload.message }
        : item
    );

    LocalDB.saveState({ alerts: current.alerts, corrective: nextCorrective, calendarEvents: current.calendarEvents }, { skipCloudSync: true });
    Store.dispatch((state) => ({
      ...state,
      corrective: nextCorrective,
      ui: {
        ...state.ui,
        currentView: "corrective",
        activeCorrectiveTab: found.tab,
        highlightIncidentId: updateIncidentId,
      },
    }));
    closeModal(modal);
    alert("บันทึก Update Equipment เรียบร้อย");

    // LINE notification first, then cloud sync (LINE must not be delayed by Firestore write)
    const updatedEquip = (nextCorrective[tab] || []).find((item) => getIncidentKey(item) === incidentId);
    if (updatedEquip) {
      try { AlertService.markRecentWrite(incidentId); } catch (_) {}

      // LINE notification — send before Firestore write to avoid realtime listener interference
      try {
        const updateNo = updatedEquip.updates?.length || 1;
        const imageUrls = window.StorageService
          ? await window.StorageService.uploadImagesToStorage(attachmentPayload)
          : [];
        const lineBody = {
          incidentId,
          node: updatedEquip.node || "-",
          workType: updatedEquip.workType || "Equipment",
          updateNo,
          message: updatePayload.message || "",
          etr: "",
          subcontractors: [],
          cause: updatePayload.equipmentFinding || "",
          imageUrls,
        };
        console.log("[Equipment Update] LINE payload:", JSON.stringify(lineBody));
        const lineRes = await fetch("/.netlify/functions/notify-line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(lineBody),
        });
        const lineResText = await lineRes.text();
        console.log(`[Equipment Update] LINE response: ${lineRes.status}`, lineResText);
      } catch (e) {
        console.error("[Equipment Update] LINE notify failed:", e);
      }

      // Cloud sync after LINE (non-blocking)
      if (window.FirebaseSync?.saveIncidentToCloud) {
        window.FirebaseSync.saveIncidentToCloud(stripBase64FromIncident(updatedEquip))
          .catch((e) => console.warn("Equipment update cloud sync failed:", e));
      }
    }
  } catch (err) {
    console.error("[Equipment Update] Save failed:", err);
    alert("เกิดข้อผิดพลาด บันทึกไม่สำเร็จ: " + err.message);
  }
  };

  openModal(modal);
}

function ensureEquipmentFinishModal() {
  if (document.getElementById("modal-corrective-finish-equipment")) return;

  document.body.insertAdjacentHTML("beforeend", `
    <style id="style-eq-finish-modal">
    #modal-corrective-finish-equipment{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);z-index:1100;padding:16px}
    #modal-corrective-finish-equipment.hidden{display:none}
    #modal-corrective-finish-equipment .eqf-card{background:var(--canvas);border-radius:24px;width:100%;max-width:680px;display:flex;flex-direction:column;max-height:95vh;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.28)}
    #modal-corrective-finish-equipment .eqf-body{flex:1;overflow-y:auto;padding:20px 24px;display:flex;flex-direction:column;gap:16px}
    #modal-corrective-finish-equipment .eqf-slabel{font-size:10px;font-weight:700;color:var(--ink-muted);text-transform:uppercase;letter-spacing:.08em;display:flex;align-items:center;gap:6px;margin-bottom:8px}
    #modal-corrective-finish-equipment .eqf-flabel{font-size:10px;font-weight:700;color:var(--ink-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;display:flex;align-items:center;gap:4px}
    #modal-corrective-finish-equipment .eqf-inp{width:100%;height:36px;padding:0 10px;background:var(--surface-2,#f5f5f4);border:1px solid var(--hair);border-radius:8px;font-size:13px;color:var(--ink);outline:none;transition:border-color .15s}
    #modal-corrective-finish-equipment .eqf-inp:focus{border-color:var(--ok,#10b981)}
    #modal-corrective-finish-equipment .eqf-time-inp{width:100%;height:36px;padding:0 8px;background:var(--canvas);border:1px solid var(--hair);border-radius:8px;font-size:12px;color:var(--ink);outline:none}
    #modal-corrective-finish-equipment .eqf-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;display:inline-block}
    #modal-corrective-finish-equipment .eqf-dmg-lbl{display:flex;align-items:center;gap:7px;padding:5px 12px;border:1px solid var(--hair);border-radius:8px;cursor:pointer;background:var(--canvas);color:var(--ink);font-size:12px;font-weight:500;transition:all .15s;user-select:none}
    #modal-corrective-finish-equipment .eqf-dmg-lbl:has(input:checked){background:var(--ink);color:var(--canvas);border-color:var(--ink)}
    #modal-corrective-finish-equipment .eqf-dmg-lbl input{width:13px;height:13px;accent-color:var(--canvas);pointer-events:none;flex-shrink:0}
    #modal-corrective-finish-equipment .eqf-btn-ghost{padding:8px 20px;background:transparent;border:1px solid var(--hair);border-radius:10px;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer}
    #modal-corrective-finish-equipment .eqf-btn-ghost:hover{background:var(--surface-2)}
    #modal-corrective-finish-equipment .eqf-btn-save{display:flex;align-items:center;gap:6px;padding:8px 22px;background:var(--ok,#10b981);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;transition:opacity .15s}
    #modal-corrective-finish-equipment .eqf-btn-save:hover{opacity:.88}
    </style>
    <div id="modal-corrective-finish-equipment" class="hidden">
      <div class="eqf-card">

        <!-- HEADER -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 22px;border-bottom:1px solid var(--hair);flex-shrink:0">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:40px;height:40px;background:var(--ok,#10b981);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <i data-lucide="check" style="width:20px;height:20px;color:#fff;stroke-width:3"></i>
            </div>
            <div>
              <p style="font-size:10px;font-weight:700;color:var(--warn,#f97316);text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px">NS FINISH · EQUIPMENT</p>
              <div style="display:flex;align-items:center;gap:8px">
                <h2 id="equipment-finish-title" style="font-size:18px;font-weight:900;color:var(--ink);line-height:1">NS Finish Equipment</h2>
                <span id="eq-finish-incident-badge" style="padding:2px 10px;background:var(--surface-2);border:1px solid var(--hair);border-radius:6px;font-size:12px;font-weight:600;color:var(--ink-muted)"></span>
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span id="eq-finish-mttr-badge" style="display:none;align-items:center;gap:5px;padding:5px 12px;background:rgba(13,148,136,.1);border:1px solid rgba(13,148,136,.3);border-radius:20px;font-size:12px;font-weight:700;color:#0d9488">
              <i data-lucide="clock" style="width:13px;height:13px"></i>
              <span id="eq-finish-mttr-text"></span>
            </span>
            <button id="btn-close-equipment-finish" style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:1px solid var(--hair);border-radius:8px;background:transparent;cursor:pointer">
              <i data-lucide="x" style="width:16px;height:16px;color:var(--ink-muted)"></i>
            </button>
          </div>
        </div>

        <!-- BODY -->
        <div class="eqf-body">

          <!-- Incident + Circuit + Device + Alarm -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <p class="eqf-flabel">Incident Number</p>
              <input id="eq-finish-incident" class="eqf-inp" readonly>
            </div>
            <div>
              <p class="eqf-flabel">Circuit ID · Customer</p>
              <input id="eq-finish-node" class="eqf-inp" readonly>
            </div>
            <div>
              <p class="eqf-flabel">Device Type <span style="color:#ef4444;font-size:11px">*</span></p>
              <select id="eq-finish-device" class="eqf-inp" style="padding:0 8px">
                <option value="">เลือกประเภท</option>
                <option>Router</option><option>Switch</option><option>OLT</option><option>ONT/CPE</option>
                <option>Media Converter</option><option>UPS</option><option>Server</option><option>Other</option>
              </select>
            </div>
            <div>
              <p class="eqf-flabel">Alarm / Problem <span style="color:#ef4444;font-size:11px">*</span></p>
              <input id="eq-finish-problem" class="eqf-inp" placeholder="เช่น Charger unmanage">
            </div>
          </div>

          <!-- Timeline -->
          <div style="border-top:1px solid var(--hair);padding-top:14px">
            <p class="eqf-slabel"><i data-lucide="clock" style="width:12px;height:12px"></i> เวลาต่างๆ · TIMELINE</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div>
                <p class="eqf-flabel" style="display:flex;align-items:center;gap:5px"><span class="eqf-dot" style="background:#ef4444"></span> Down time</p>
                <input id="eq-finish-down" type="datetime-local" class="eqf-time-inp">
              </div>
              <div>
                <p class="eqf-flabel" style="display:flex;align-items:center;gap:5px"><span class="eqf-dot" style="background:#f59e0b"></span> NS response</p>
                <input id="eq-finish-response" type="datetime-local" class="eqf-time-inp">
              </div>
              <div>
                <p class="eqf-flabel" style="display:flex;align-items:center;gap:5px"><span class="eqf-dot" style="background:#6366f1"></span> Arrival time</p>
                <input id="eq-finish-arrive" type="datetime-local" class="eqf-time-inp">
              </div>
              <div>
                <p class="eqf-flabel" style="display:flex;align-items:center;gap:5px"><span class="eqf-dot" style="background:var(--hair)"></span> Up time</p>
                <input id="eq-finish-up" type="datetime-local" class="eqf-time-inp">
              </div>
            </div>
          </div>

          <!-- Cause & Details -->
          <div style="border-top:1px solid var(--hair);padding-top:14px">
            <p class="eqf-slabel"><i data-lucide="wrench" style="width:12px;height:12px"></i> สาเหตุและรายละเอียด</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
              <div>
                <p class="eqf-flabel">สาเหตุ</p>
                <select id="eq-finish-cause" class="eqf-inp" style="padding:0 8px">
                  <option value="">เลือกสาเหตุ</option>
                  <option>Hardware failure</option><option>Software/Config Issue</option>
                  <option>Power Issue (Internal)</option><option>Power Issue (External)</option><option>Unknown</option>
                </select>
              </div>
              <div>
                <p class="eqf-flabel">การแก้ไข</p>
                <select id="eq-finish-fix" class="eqf-inp" style="padding:0 8px">
                  <option value="">เลือกการแก้ไข</option>
                  <option>เปลี่ยนอุปกรณ์</option><option>Reboot</option><option>Replace</option>
                  <option>Reseat</option><option>Config Change</option><option>Firmware Upgrade</option>
                </select>
              </div>
            </div>
            <div>
              <p class="eqf-flabel" style="margin-bottom:8px">ส่วนที่เสีย <span style="font-size:9px;font-weight:400;text-transform:none;opacity:.6">(เลือกได้หลายชิ้น)</span></p>
              <div id="eq-finish-damaged-wrap" style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px">
                <label class="eqf-dmg-lbl"><input type="checkbox" class="eq-finish-damaged-item" value="Router"> Router</label>
                <label class="eqf-dmg-lbl"><input type="checkbox" class="eq-finish-damaged-item" value="Switch"> Switch</label>
                <label class="eqf-dmg-lbl"><input type="checkbox" class="eq-finish-damaged-item" value="SFP/Transceiver"> SFP/Transceiver</label>
                <label class="eqf-dmg-lbl"><input type="checkbox" class="eq-finish-damaged-item" value="Rectifier/Power Supply"> Power Supply</label>
                <label class="eqf-dmg-lbl"><input type="checkbox" class="eq-finish-damaged-item" value="Fan"> Fan</label>
                <label class="eqf-dmg-lbl"><input type="checkbox" class="eq-finish-damaged-item" value="Card/Module"> Card/Module</label>
                <label class="eqf-dmg-lbl"><input type="checkbox" class="eq-finish-damaged-item" value="UPS"> UPS</label>
                <label class="eqf-dmg-lbl"><input type="checkbox" class="eq-finish-damaged-item" value="Controller"> Controller</label>
                <label class="eqf-dmg-lbl"><input type="checkbox" class="eq-finish-damaged-item" value="Adapter"> Adapter</label>
              </div>
            </div>
          </div>

          <!-- Summary -->
          <div style="border-top:1px solid var(--hair);padding-top:14px">
            <p class="eqf-flabel" style="margin-bottom:6px">สรุปการดำเนินการเพิ่มเติม</p>
            <textarea id="eq-finish-summary" rows="3" style="width:100%;padding:8px 10px;background:var(--canvas);border:1px solid var(--hair);border-radius:8px;font-size:12px;color:var(--ink);resize:vertical;outline:none" placeholder="เช่น ตรวจสอบพบ SFP Hang แก้ไขโดยการ Reset SFP ใหม่..."></textarea>
          </div>

          <!-- S/N Section -->
          <div style="border-top:1px solid var(--hair);padding-top:14px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
              <p class="eqf-slabel" style="margin-bottom:0"><i data-lucide="arrow-right-left" style="width:12px;height:12px"></i> เปลี่ยนอุปกรณ์ (S/N เดิม → S/N ใหม่)</p>
              <button id="btn-eq-add-sn-row" type="button" style="display:flex;align-items:center;gap:4px;padding:4px 10px;background:var(--surface-2);border:1px solid var(--hair);border-radius:7px;font-size:11px;font-weight:700;color:var(--ink-muted);cursor:pointer">
                <i data-lucide="plus" style="width:11px;height:11px"></i> เพิ่ม
              </button>
            </div>
            <div id="eq-finish-sn-rows" style="display:flex;flex-direction:column;gap:8px">
              <div class="eq-finish-sn-row" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <input class="eq-finish-old-sn eqf-inp" placeholder="S/N เดิม">
                <input class="eq-finish-new-sn eqf-inp" placeholder="S/N ใหม่">
              </div>
            </div>
          </div>

        </div><!-- /eqf-body -->

        <!-- FOOTER -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 22px;border-top:1px solid var(--hair);flex-shrink:0">
          <div style="display:flex;align-items:center;gap:6px;color:var(--ink-muted);font-size:12px">
            <i data-lucide="user" style="width:13px;height:13px"></i>
            <span id="eq-finish-footer-user" style="font-weight:600">—</span>
            <span style="opacity:.35">·</span>
            <i data-lucide="clock" style="width:12px;height:12px"></i>
            <span id="eq-finish-footer-time" style="color:var(--ink-dim)">—</span>
          </div>
          <div style="display:flex;gap:8px">
            <button id="btn-cancel-equipment-finish" class="eqf-btn-ghost">ยกเลิก</button>
            <button id="btn-save-equipment-finish" class="eqf-btn-save">
              <i data-lucide="check-circle" style="width:15px;height:15px"></i> ปิดงาน (NS Finish)
            </button>
          </div>
        </div>

      </div>
    </div>
  `);

  const modal = document.getElementById("modal-corrective-finish-equipment");
  document.getElementById("btn-close-equipment-finish").onclick = () => closeModal(modal);
  document.getElementById("btn-cancel-equipment-finish").onclick = () => closeModal(modal);
  document.getElementById("btn-eq-add-sn-row").onclick = () => {
    const rows = document.getElementById("eq-finish-sn-rows");
    rows.insertAdjacentHTML(
      "beforeend",
      `<div class="eq-finish-sn-row" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <input class="eq-finish-old-sn eqf-inp" placeholder="S/N เดิม">
          <input class="eq-finish-new-sn eqf-inp" placeholder="S/N ใหม่">
        </div>`
    );
  };
  if (window.lucide) lucide.createIcons();
}

function openEquipmentFinishModal(incidentId) {
  const found = getCorrectiveIncidentById(incidentId);
  if (!found) return;

  ensureEquipmentFinishModal();
  populateSelectFromCatalog('eq-finish-cause', 'eqCauses', 'เลือกสาเหตุ');
  const { incident, tab } = found;
  const modal = document.getElementById("modal-corrective-finish-equipment");

  const eqBadge = document.getElementById("eq-finish-incident-badge");
  if (eqBadge) eqBadge.textContent = incident.incidentId || "";
  const eqFooterUser = document.getElementById("eq-finish-footer-user");
  if (eqFooterUser) eqFooterUser.textContent = incident.respondedBy || incident.createdBy || "—";
  const eqFooterTime = document.getElementById("eq-finish-footer-time");
  if (eqFooterTime) {
    const now = new Date();
    eqFooterTime.textContent = `${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")} · ${now.getDate().toString().padStart(2,"0")} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][now.getMonth()]} ${now.getFullYear()}`;
  }
  document.getElementById("eq-finish-incident").value = incident.incidentId || "";
  document.getElementById("eq-finish-node").value = incident.node || "";
  document.getElementById("eq-finish-problem").value = incident.alarm || "";

  const firstTicket = (incident.tickets || [])[0] || {};
  const _updates = incident.updates || [];
  const latestUpdate = _updates[_updates.length - 1] || {};
  const latestArriveUpdate = [...(incident.updates || [])]
    .reverse()
    .find((upd) => String(upd?.message || "").includes("เดินทางถึงแล้วครับ"));
  const circuitCustomer = (() => {
    const originate = String(latestUpdate.originate || "").trim();
    const terminate = String(latestUpdate.terminate || "").trim();
    if (originate && terminate) return originate === terminate ? originate : `${originate} - ${terminate}`;
    return originate || terminate || `${firstTicket.cid || ""} ${firstTicket.port || ""}`.trim();
  })();

  const _eqSet = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  _eqSet("eq-finish-down", formatDateTimeInput(firstTicket.downTime || incident.downTime || incident.createdAt));
  _eqSet("eq-finish-response", formatDateTimeInput(incident.respondedAt || incident.createdAt));
  _eqSet("eq-finish-arrive", formatDateTimeInput(latestArriveUpdate?.at || incident.nsFinish?.times?.arrivalTime || ""));
  _eqSet("eq-finish-node", circuitCustomer);

  const snRows = document.getElementById("eq-finish-sn-rows");
  if (snRows) {
    const savedPairs = incident.nsFinish?.details?.snPairs || [];
    const fallbackPair = incident.nsFinish?.details
      ? [{ oldSn: incident.nsFinish.details.oldSn || "", newSn: incident.nsFinish.details.newSn || "" }]
      : [];
    const pairs = (savedPairs.length ? savedPairs : fallbackPair).filter((pair) => pair.oldSn || pair.newSn);
    const rowsToRender = pairs.length ? pairs : [{ oldSn: "", newSn: "" }];
    snRows.innerHTML = rowsToRender
      .map(
        (pair) => `<div class="eq-finish-sn-row" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <input class="eq-finish-old-sn eqf-inp" placeholder="S/N เดิม" value="${pair.oldSn || ""}">
            <input class="eq-finish-new-sn eqf-inp" placeholder="S/N ใหม่" value="${pair.newSn || ""}">
          </div>`
      )
      .join("");
  }
  const savedDamagedParts = incident.nsFinish?.details?.damagedParts || [];
  const fallbackDamaged = incident.nsFinish?.details?.damagedPart ? [incident.nsFinish.details.damagedPart] : [];
  const selectedDamagedParts = savedDamagedParts.length ? savedDamagedParts : fallbackDamaged;
  document.querySelectorAll(".eq-finish-damaged-item").forEach((el) => {
    el.checked = selectedDamagedParts.includes(el.value);
  });

  function _calcEqMttr() {
    const downVal = document.getElementById("eq-finish-down")?.value;
    const upVal = document.getElementById("eq-finish-up")?.value;
    const badge = document.getElementById("eq-finish-mttr-badge");
    const text = document.getElementById("eq-finish-mttr-text");
    if (!badge || !text || !downVal || !upVal) { if (badge) badge.style.display = "none"; return; }
    const diffMs = new Date(upVal) - new Date(downVal);
    if (diffMs <= 0) { badge.style.display = "none"; return; }
    const totalMin = Math.floor(diffMs / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const slaOk = h < 3 || (h === 3 && m === 0);
    text.textContent = `MTTR ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")} · ${slaOk ? "SLA met" : "SLA miss"}`;
    badge.style.background = slaOk ? "rgba(13,148,136,.1)" : "rgba(239,68,68,.1)";
    badge.style.border = slaOk ? "1px solid rgba(13,148,136,.3)" : "1px solid rgba(239,68,68,.3)";
    badge.style.color = slaOk ? "#0d9488" : "#ef4444";
    badge.style.display = "flex";
  }
  document.getElementById("eq-finish-down")?.addEventListener("change", _calcEqMttr);
  document.getElementById("eq-finish-up")?.addEventListener("change", _calcEqMttr);
  _calcEqMttr();
  if (window.lucide) lucide.createIcons();
  openModal(modal);

  document.getElementById("btn-save-equipment-finish").onclick = async () => {
    const current = Store.getState();
    const snPairs = Array.from(document.querySelectorAll(".eq-finish-sn-row"))
      .map((row) => ({
        oldSn: row.querySelector(".eq-finish-old-sn")?.value?.trim() || "",
        newSn: row.querySelector(".eq-finish-new-sn")?.value?.trim() || "",
      }))
      .filter((pair) => pair.oldSn || pair.newSn);
    const damagedParts = Array.from(document.querySelectorAll(".eq-finish-damaged-item:checked")).map((el) => el.value);
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
        damagedPart: damagedParts.join(", "),
        damagedParts,
        fixAction: document.getElementById("eq-finish-fix").value,
        summary: document.getElementById("eq-finish-summary").value,
        oldSn: snPairs[0]?.oldSn || "",
        newSn: snPairs[0]?.newSn || "",
        snPairs,
      },
    };
    const completedAt = new Date().toISOString();
    const nextCorrective = { ...current.corrective };
    nextCorrective[tab] = (nextCorrective[tab] || []).map((item) =>
      getIncidentKey(item) === incidentId ? { ...item, nsFinish: payload, status: "COMPLETE", completedAt: new Date().toISOString() } : item
    );
    const finishedIncident = (nextCorrective[tab] || []).find((item) => getIncidentKey(item) === incidentId);
    if (finishedIncident) {
      applyFinishToLocalFlow(finishedIncident);
    }

    LocalDB.saveState({ alerts: current.alerts, corrective: nextCorrective });
    Store.dispatch((state) => ({ ...state, corrective: nextCorrective }));
    if (finishedIncident && window.FirebaseSync?.saveIncidentToCloud) {
      window.FirebaseSync.saveIncidentToCloud(stripBase64FromIncident(finishedIncident))
        .catch(e => console.warn("Cloud Sync (equipment finish) failed:", e));
    }
    syncFinishedIncidentToCloud(incidentId, payload, completedAt).catch(() => {});
    closeModal(modal);
    handleSaveAndShowReport({
      reportType: "equipment",
      incidentNumber: payload.incidentNumber || incident.incidentId || "-",
      circuitCustomer: payload.details.node || "-",
      deviceType: payload.details.deviceType || "-",
      problem: payload.details.problem || "-",
      downTime: payload.times.downTime,
      responseTime: payload.times.nsResponse,
      arrivalTime: payload.times.arrivalTime,
      upTime: payload.times.upTime,
      cause: payload.details.cause || "-",
      damagedPart: payload.details.damagedPart || "-",
      damagedParts: payload.details.damagedParts || [],
      fixAction: payload.details.fixAction || "-",
      oldSn: payload.details.oldSn || "-",
      newSn: payload.details.newSn || "-",
      snPairs: payload.details.snPairs || [],
      summary: payload.details.summary || "-",
      nsFinishTime: completedAt,
    });

    alert("บันทึก NS Finish Equipment เรียบร้อย");

    // LINE notification — Equipment Finish
    try {
      if (finishedIncident) {
        const reportData = buildNsReportInputFromIncident(finishedIncident, tab);
        const reportText = buildFullNsFinishReport(reportData);
        fetch("/.netlify/functions/notify-line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            incidentId: payload.incidentNumber || incidentId,
            node: finishedIncident?.node || "-",
            workType: "Equipment",
            updateNo: null,
            message: reportText,
            etr: "",
            subcontractors: [],
            cause: payload.details?.cause || "",
            imageUrls: [],
            isFinish: true,
          }),
        }).catch((e) => console.warn("LINE equipment finish notify failed:", e));
      }
    } catch (e) {
      console.warn("LINE equipment finish notify build failed:", e);
    }
  };

  openModal(modal);
}

let updateIncidentId = null;
function getFirstSymphonyTicket(incident) {
  const tickets = Array.isArray(incident?.tickets) ? incident.tickets : [];
  return tickets[0] || {};
}
async function syncFinishedIncidentToCloud(incidentId, payload, completedAt) {
  try {
    await fetch("/.netlify/functions/finish-incident", {
      method: "POST",
      headers: { "Content-Type": "application/json",
              "x-api-key": window.NOC_API_KEY || "" },
      body: JSON.stringify({
        incidentId,
        incident_number: incidentId,
        status: "COMPLETE",
        completedAt,
        nsFinish: payload,
      }),
    });
  } catch (error) {
    console.warn("finish-incident sync failed:", error);
  }
}

function buildCircuitCustomerOption(cid = "", side = "") {
  const cleanCid = String(cid || "").trim();
  const cleanSide = String(side || "").trim();
  if (!cleanSide) return "";
  return cleanCid ? `${cleanCid} ${cleanSide}` : cleanSide;
}

function renderCircuitCustomerSelectors({ originSelectId, terminateSelectId, firstTicket }) {
  const originSel = document.getElementById(originSelectId);
  const termSel = document.getElementById(terminateSelectId);
  if (!originSel || !termSel) return;

  const originOption = buildCircuitCustomerOption(firstTicket?.cid, firstTicket?.originate);
  const terminateOption = buildCircuitCustomerOption(firstTicket?.cid, firstTicket?.terminate);

  originSel.innerHTML = `<option value="">-- เลือก Originate --</option>${originOption ? `<option>${originOption}</option>` : ""}`;
  termSel.innerHTML = `<option value="">-- เลือก Terminate --</option>${terminateOption ? `<option>${terminateOption}</option>` : ""}`;
}

function resolveCircuitCustomerSelection({ firstTicket, selectedOrigin = "", selectedTerminate = "" }) {
  const cid = String(firstTicket?.cid || "").trim();
  const originate = String(selectedOrigin || "").trim();
  const terminate = String(selectedTerminate || "").trim();

  if (!cid && originate && terminate) {
    const trunkValue = `Trunk ${originate} - ${terminate}`;
    return { originate: trunkValue, terminate: trunkValue };
  }

  return { originate, terminate };
}

// Prepare incident for Firestore: images already compressed at capture time (≤100KB each)
// Only strip base64 from non-image files (PDFs etc.) which can't be compressed
function stripBase64FromIncident(incident) {
  if (!incident) return incident;
  const cleanAttachments = (arr) => (arr || []).map((a) => {
    if (typeof a !== "object") return { name: String(a), type: "" };
    // Keep compressed image base64 (small), strip non-image binary
    if (a.url && a.url.startsWith("data:image/")) return a;
    return { name: a.name || "", type: a.type || "" };
  });
  return {
    ...incident,
    updates: (incident.updates || []).map((u) => ({ ...u, attachments: cleanAttachments(u.attachments) })),
    nsFinish: incident.nsFinish ? {
      ...incident.nsFinish,
      attachments: cleanAttachments(incident.nsFinish.attachments),
    } : incident.nsFinish,
  };
}

function openCorrectiveUpdateModal(incidentId) {
  const found = getCorrectiveIncidentById(incidentId);
  if (!found) return;

  // Only use specialized equipment modal if it's actually an equipment incident
  const isEquipment = found.tab === "equipment" || String(found.incident.workType || "").toLowerCase().includes("equipment");
  
  if (isEquipment && typeof openEquipmentUpdateModal === "function") {
    openEquipmentUpdateModal(incidentId);
    return;
  }

  updateIncidentId = incidentId;
  const { incident } = found;
  window._updSelectedFiles = []; // reset attachment list for this modal open
  ensureUpdateModal();
  populateSubCheckboxGrid('upd-sub-grid', 'upd-sub', 'upd-sub-label');
  populateSelectFromCatalog('upd-ofc-type',   'ofcTypes',    'เลือกประเภท');
  populateSelectFromCatalog('upd-cause',      'causes',      'เลือกสาเหตุ');
  populateSelectFromCatalog('upd-initial-fix','fixMethods',  '— เลือกวิธีแก้เบื้องต้น —');
  populateSelectFromCatalog('upd-stop-reason','stopReasons', '— เลือกเหตุผล —', [{ v:'__other__', t:'อื่นๆ (กรอกเอง)' }]);
  populateSelectFromCatalog('upd-network-type','networkTypes','—');

  const modal = document.getElementById("modal-corrective-update");
  const stopReasonSelectEl = document.getElementById("upd-stop-reason");
  const stopReasonCustomInputEl = document.getElementById("upd-stop-reason-custom");
  const stopReasonValues = Array.from(stopReasonSelectEl?.options || []).map((option) => option.value || option.textContent.trim());
  const OTHER_STOP_REASON_VALUE = "__other__";
  const syncStopReasonFields = () => {
    const isOtherSelected = stopReasonSelectEl?.value === OTHER_STOP_REASON_VALUE;
    stopReasonCustomInputEl?.classList.toggle("hidden", !isOtherSelected);
    if (!isOtherSelected && stopReasonCustomInputEl) {
      stopReasonCustomInputEl.value = "";
    }
  };
  if (stopReasonSelectEl) {
    stopReasonSelectEl.onchange = syncStopReasonFields;
  }

  const titleEl = document.getElementById("corrective-update-title");
  if (titleEl) titleEl.textContent = incident.incidentId || "";
  const typeBadge = document.getElementById("corrective-update-type-badge");
  if (typeBadge) typeBadge.textContent = `NS UPDATE · ${String(incident.workType || "FIBER").toUpperCase()}`;
  const footerUser = document.getElementById("upd-footer-user");
  if (footerUser) footerUser.textContent = incident.respondedBy || incident.createdBy || "—";
  const footerTs = document.getElementById("upd-footer-ts");
  if (footerTs) {
    const d = new Date(incident.respondedAt || incident.createdAt || Date.now());
    footerTs.textContent = isNaN(d.getTime()) ? "—" : d.toLocaleString("en-GB", { hour:"2-digit", minute:"2-digit", day:"2-digit", month:"short", year:"numeric" });
  }
  const firstTicket = getFirstSymphonyTicket(incident);
  renderCircuitCustomerSelectors({
    originSelectId: "upd-originate",
    terminateSelectId: "upd-terminate",
    firstTicket,
  });

  const latestUpdate = (incident.updates || []).slice(-1)[0] || {};
  const lastClockStatus = String(latestUpdate.clockStatus || "STARTED").trim();
  const isStopped = lastClockStatus === "STOPPED";
  if (typeof updSetClockUI === "function") updSetClockUI(isStopped ? "STOPPED" : "STARTED");
  else {
    document.getElementById("upd-clock-status").textContent = isStopped ? "STOPPED" : "STARTED";
  }

  document.getElementById("upd-ofc-type").value = latestUpdate.ofcType || "";
  document.getElementById("upd-network-type").value = latestUpdate.networkType || "";
  document.getElementById("upd-cause").value = latestUpdate.cause || "";
  const siteRows = document.getElementById("upd-site-rows");
  renderUpdateSiteRows(siteRows, latestUpdate.siteEntries?.length ? latestUpdate.siteEntries : [{
    site: latestUpdate.site || "",
    distance: latestUpdate.distance || "",
    area: latestUpdate.area || "",
    latlng: latestUpdate.latlng || "",
  }]);
  // upd-workcase removed
  const latestStopReason = String(latestUpdate.stopReason || "").trim();
  if (latestStopReason && !stopReasonValues.includes(latestStopReason)) {
    stopReasonSelectEl.value = OTHER_STOP_REASON_VALUE;
    stopReasonCustomInputEl.value = latestStopReason;
  } else {
    stopReasonSelectEl.value = latestStopReason;
    stopReasonCustomInputEl.value = "";
  }
  syncStopReasonFields();
  document.getElementById("upd-etr-hour").value = latestUpdate.etrHour || "";
  document.getElementById("upd-etr-min").value = latestUpdate.etrMin || "";
  document.getElementById("upd-message").value = latestUpdate.message || "";
  document.getElementById("upd-initial-fix").value = latestUpdate.initialFix || "";
  document.getElementById("upd-camera-input").value = "";
  document.getElementById("upd-file-input").value = "";
  document.querySelectorAll(".upd-sub").forEach((el) => {
    el.checked = (latestUpdate.subcontractors || []).includes(el.value);
  });
  document.getElementById("upd-attachments-preview").textContent = "ยังไม่ได้เลือกไฟล์";
  modal.dataset.startClockAt = latestUpdate.startClockAt || "";
  modal.dataset.stopClockAt = latestUpdate.stopClockAt || "";
  modal.dataset.stopReason = latestUpdate.stopReason || "";

  // Update elapsed display + start live ticker if clock is running
  const elapsedEl = document.getElementById("upd-clock-elapsed");
  if (elapsedEl) elapsedEl.textContent = typeof updClockElapsed === "function"
    ? updClockElapsed(modal.dataset.startClockAt, modal.dataset.stopClockAt || "")
    : "00:00:00";
  if (!isStopped && modal.dataset.startClockAt && typeof updStartTimer === "function") updStartTimer();
  modal.dataset.parsedMethod = latestUpdate.parsedMethod || "";
  modal.dataset.parsedMethodDistance = latestUpdate.parsedMethodDistance || "";
  modal.dataset.parsedCutPoint = latestUpdate.parsedCutPoint || "";
  modal.dataset.parsedCorePoint = latestUpdate.parsedCorePoint || "";
  modal.dataset.parsedHeadJoint = latestUpdate.parsedHeadJoint || "";
  modal.dataset.parsedConnectorChoice = latestUpdate.parsedConnectorChoice || "ไม่ใช้หัวต่อ";
  const latestMultiOfcData = normalizeMultiOfcData(latestUpdate.multiOfcDetails || {});
  modal.dataset.multiOfcDetails = JSON.stringify(latestMultiOfcData);
  renderOfcSummaryBox(document.getElementById("upd-multi-ofc-summary"), latestMultiOfcData);
  document.getElementById("upd-multi-ofc-summary-wrap").classList.toggle("hidden", summarizeMultiOfcData(latestMultiOfcData).length === 0);

  document.getElementById("btn-generate-update").onclick = () => {
    const latest = getCorrectiveIncidentById(updateIncidentId)?.incident;
    const updateNo = ((latest?.updates || []).length || 0) + 1;

    const ofcType = document.getElementById("upd-ofc-type").value || "OFC";
    const multiOfcDetails = readMultiOfcFromModalDataset(modal);
    const multiOfcSummary = summarizeMultiOfcData(multiOfcDetails);
    const cause = document.getElementById("upd-cause").value.trim();
    const siteEntries = collectUpdateSiteEntries(siteRows);
    const primarySiteEntry = siteEntries[0] || normalizeSiteEntry({});
    const site = primarySiteEntry.site;
    const distanceM = primarySiteEntry.distance;
    const area = primarySiteEntry.area;
    const etrHour = document.getElementById("upd-etr-hour").value.trim();
    const etrMin = document.getElementById("upd-etr-min").value.trim();
    const initialFix = document.getElementById("upd-initial-fix").value.trim();
    const subcontractors = Array.from(document.querySelectorAll(".upd-sub:checked")).map((el) => el.value);
    const workCase = "";
    const isStarted = (document.getElementById("upd-clock-status").textContent || "").trim() === "STARTED";
    let summaryHeadline = `Update#${updateNo}: ขณะนี้เจ้าหน้าที่สามารถเข้าพื้นที่แก้ไขได้แล้ว กำลังเร่งดำเนินการแก้ไข.`;
    if (!isStarted || !modal.dataset.startClockAt) {
      const summaryParts = [`Update#${updateNo}: ตรวจสอบพบ OFC ${ofcType}`];
      if (site && distanceM) {
        const distanceText = formatUpdateDistanceText(distanceM);
        summaryParts.push(distanceText ? `มีปัญหาห่างจาก Site ${site} ระยะ ${distanceText}` : `มีปัญหาห่างจาก Site ${site}`);
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
      summaryHeadline = `${summaryParts.join(" ")}.`;
      if (isStarted) {
        summaryHeadline = `${summaryHeadline} กำลังเร่งดำเนินการแก้ไข.`;
      }
    }
    if (workCase === "OFC ปกติ") {
      summaryHeadline = `Update#${updateNo}: ตรวจสอบพบ OFC ตอนนอกปกติ`;
    }
    const lines = [summaryHeadline];
    if (initialFix) {
      lines.push(`การแก้ไขเบื้องต้น : ${initialFix}`);
    }
    if (multiOfcSummary.length) {
      lines.push(`OFC : ${multiOfcSummary.join(", ")}`);
    }
    if (etrHour || etrMin) {
      lines.push(`ETR : ${formatUpdateEtrText(etrHour, etrMin)}`);
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

    const parsedRepair = parseRepairTextToFinishFields(initialFix || lines.join(" "));
    modal.dataset.parsedMethod = parsedRepair.method || "";
    modal.dataset.parsedMethodDistance = parsedRepair.methodDistance || "";
    modal.dataset.parsedCutPoint = parsedRepair.cutPoint || "";
    modal.dataset.parsedCorePoint = parsedRepair.corePoint || "";
    modal.dataset.parsedHeadJoint = parsedRepair.headJoint || "";
    modal.dataset.parsedConnectorChoice = parsedRepair.connectorChoice || "ไม่ใช้หัวต่อ";
  };

  document.getElementById("btn-save-corrective-update").onclick = async () => {
  try {
    // Require at least one photo or file attachment
    if (!window._updSelectedFiles || window._updSelectedFiles.length === 0) {
      alert("กรุณาถ่ายภาพ 📷 หรือแนบไฟล์ 📎 อย่างน้อย 1 รายการก่อนบันทึก");
      return;
    }

    const current = Store.getState();
    const siteEntries = collectUpdateSiteEntries(siteRows);
    const primarySiteEntry = siteEntries[0] || normalizeSiteEntry({});
    // Convert accumulated files to base64 for local storage (images only compressed)
    const attachmentPayload = await buildAttachmentPayload(window._updSelectedFiles || [], []);
    const parsedOnSave = parseRepairTextToFinishFields(
      document.getElementById("upd-initial-fix").value || document.getElementById("upd-message").value || ""
    );

    const selectedOrigin = document.getElementById("upd-originate").value;
    const selectedTerminate = document.getElementById("upd-terminate").value;
    const circuitSelection = resolveCircuitCustomerSelection({
      firstTicket,
      selectedOrigin,
      selectedTerminate,
    });

    const updatePayload = {
      siteEntries,
      at: new Date().toISOString(),
      ofcType: document.getElementById("upd-ofc-type").value,
      networkType: document.getElementById("upd-network-type").value,
      multiOfcDetails: readMultiOfcFromModalDataset(modal),
      cause: document.getElementById("upd-cause").value,
      originate: circuitSelection.originate,
      terminate: circuitSelection.terminate,
      site: primarySiteEntry.site,
      distance: primarySiteEntry.distance,
      area: primarySiteEntry.area,
      latlng: primarySiteEntry.latlng,
      subcontractors: Array.from(document.querySelectorAll(".upd-sub:checked")).map((el) => el.value),
      clockStatus: document.getElementById("upd-clock-status").textContent,
      startClockAt: modal.dataset.startClockAt || "",
      stopClockAt: modal.dataset.stopClockAt || "",
      stopReason: modal.dataset.stopReason || document.getElementById("upd-stop-reason").value || "",
      workCase: "",
      initialFix: document.getElementById("upd-initial-fix").value,
      etrHour: document.getElementById("upd-etr-hour").value,
      etrMin: document.getElementById("upd-etr-min").value,
      message: document.getElementById("upd-message").value,
      parsedMethod: modal.dataset.parsedMethod || parsedOnSave.method || "",
      parsedMethodDistance: modal.dataset.parsedMethodDistance || parsedOnSave.methodDistance || "",
      parsedCutPoint: modal.dataset.parsedCutPoint || parsedOnSave.cutPoint || "",
      parsedCorePoint: modal.dataset.parsedCorePoint || parsedOnSave.corePoint || "",
      parsedHeadJoint: modal.dataset.parsedHeadJoint || parsedOnSave.headJoint || "",
      parsedConnectorChoice: modal.dataset.parsedConnectorChoice || parsedOnSave.connectorChoice || "ไม่ใช้หัวต่อ",
      attachments: attachmentPayload,
    };

    const nextCorrective = {
      fiber: (current.corrective.fiber || []).map((item) => getIncidentKey(item) === updateIncidentId ? { ...item, ...(updatePayload.networkType ? { networkType: updatePayload.networkType } : {}), updates: [...(item.updates || []), updatePayload], latestUpdateMessage: updatePayload.message } : item),
      equipment: (current.corrective.equipment || []).map((item) => getIncidentKey(item) === updateIncidentId ? { ...item, ...(updatePayload.networkType ? { networkType: updatePayload.networkType } : {}), updates: [...(item.updates || []), updatePayload], latestUpdateMessage: updatePayload.message } : item),
      other: (current.corrective.other || []).map((item) => getIncidentKey(item) === updateIncidentId ? { ...item, ...(updatePayload.networkType ? { networkType: updatePayload.networkType } : {}), updates: [...(item.updates || []), updatePayload], latestUpdateMessage: updatePayload.message } : item),
    };

    LocalDB.saveState({ alerts: current.alerts, corrective: nextCorrective }, { skipCloudSync: true });
    Store.dispatch((state) => ({
      ...state,
      corrective: nextCorrective,
      ui: {
        ...state.ui,
        currentView: "corrective",
        activeCorrectiveTab: found.tab,
        highlightIncidentId: updateIncidentId,
      },
    }));
    closeModal(modal);
    alert("บันทึก Update เรียบร้อย");

    // Cloud sync — strip ALL base64 from every update to stay within Firestore 1MB limit
    const updatedIncident = [...(nextCorrective.fiber||[]), ...(nextCorrective.equipment||[]), ...(nextCorrective.other||[])]
      .find((item) => getIncidentKey(item) === updateIncidentId);
    if (updatedIncident) {
      AlertService.markRecentWrite(updateIncidentId);
      if (window.FirebaseSync?.saveIncidentToCloud) {
        window.FirebaseSync.saveIncidentToCloud(stripBase64FromIncident(updatedIncident))
          .catch((e) => console.warn("Update cloud sync failed:", e));
      }

      // LINE notification
      const updateNo = updatedIncident.updates?.length || 1;
      const etrH = updatePayload.etrHour || "";
      const etrM = updatePayload.etrMin || "";
      const etrText = etrH ? `${etrH}.${String(etrM).padStart(2, "0")} hrs` : (updatePayload.message?.match(/ETR\s*:\s*([^\n]+)/i)?.[1] || "");
      const imageUrls = window.StorageService ? await window.StorageService.uploadImagesToStorage(attachmentPayload) : [];
      fetch("/.netlify/functions/notify-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId: updateIncidentId,
          node: updatedIncident.node || "-",
          workType: updatedIncident.workType || "-",
          updateNo,
          message: updatePayload.message || "",
          etr: etrText,
          subcontractors: updatePayload.subcontractors || [],
          cause: updatePayload.cause || "",
          imageUrls,
        }),
      }).catch((e) => console.warn("LINE notify failed:", e));
    }
  } catch (err) {
    console.error("[Corrective Update] Save failed:", err);
    alert("เกิดข้อผิดพลาด บันทึกไม่สำเร็จ: " + err.message);
  }
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
  const d = parseDateValue(value) || new Date(value);
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
function setFieldValue(id, value = "") {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function parseRepairTextToFinishFields(rawText = "") {
  const text = String(rawText || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return {
      method: "",
      methodDistance: "",
      cutPoint: "",
      corePoint: "",
      headJoint: "",
      connectorChoice: "ไม่ใช้หัวต่อ",
    };
  }

  const pickNumber = (value) => {
    const match = String(value || "").match(/(\d+(?:\.\d+)?)/);
    return match ? match[1] : "";
  };

  const methodKeywords = ["ลากคร่อม", "ร่นลูป", "โยก Core", "ตัดต่อใหม่", "ค่าเร่งด่วน"];
  const method = methodKeywords.find((keyword) => text.includes(keyword)) || "";

  const distanceMatch = text.match(/(?:ลากคร่อม|ร่นลูป|ระยะ)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:เมตร|m\b)/i);
  const cutPointMatch = text.match(/ตัดต่อใหม่\s*([0-9]+(?:\.[0-9]+)?)\s*จุด/i);
  const corePointMatch = text.match(/(?:จุดละ|จุดล[ะ่])\s*([0-9]+(?:\.[0-9]+)?)/i);
  const headJointMatch =
    text.match(/(?:ใช้)?หัวต่อ(?:ใหม่)?\s*([0-9]+(?:\.[0-9]+)?)\s*หัว/i) ||
    text.match(/ตัดต่อใหม่\s*([0-9]+(?:\.[0-9]+)?)\s*หัว/i);
  const noConnector = /ไม่ใช้หัวต่อ|ไม่ใช้หัว/i.test(text);

  return {
    method,
    methodDistance: pickNumber(distanceMatch?.[1]),
    cutPoint: pickNumber(cutPointMatch?.[1]),
    corePoint: pickNumber(corePointMatch?.[1]),
    headJoint: pickNumber(headJointMatch?.[1]),
    connectorChoice: noConnector ? "ไม่ใช้หัวต่อ" : (headJointMatch ? "ใช้หัวต่อ" : "ไม่ใช้หัวต่อ"),
  };
}

function ensureFinishModal() {
  if (document.getElementById("modal-corrective-finish")) return;

  document.body.insertAdjacentHTML("beforeend", `
    <style id="style-finish-modal">
    #modal-corrective-finish{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);z-index:1100;padding:16px}
    #modal-corrective-finish.hidden{display:none}
    #modal-corrective-finish .fin-card{background:var(--canvas);border-radius:24px;width:100%;max-width:1060px;display:flex;flex-direction:column;max-height:95vh;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.28)}
    #modal-corrective-finish .fin-body{flex:1;overflow-y:auto;display:grid;grid-template-columns:1fr 1fr;min-height:0}
    #modal-corrective-finish .fin-left{padding:20px 22px;border-right:1px solid var(--hair);display:flex;flex-direction:column;gap:16px}
    #modal-corrective-finish .fin-right{padding:20px 22px;display:flex;flex-direction:column;gap:14px;overflow-y:auto}
    #modal-corrective-finish .fin-slabel{font-size:10px;font-weight:700;color:var(--ink-muted);text-transform:uppercase;letter-spacing:.08em;display:flex;align-items:center;gap:6px;margin-bottom:8px}
    #modal-corrective-finish .fin-flabel{font-size:10px;font-weight:700;color:var(--ink-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;display:block}
    #modal-corrective-finish .fin-inp{width:100%;height:36px;padding:0 10px;background:var(--surface-2,#f5f5f4);border:1px solid var(--hair);border-radius:8px;font-size:13px;color:var(--ink);outline:none;transition:border-color .15s}
    #modal-corrective-finish .fin-inp:focus{border-color:var(--ok,#10b981)}
    #modal-corrective-finish .fin-sub-lbl{display:flex;align-items:center;gap:7px;padding:5px 11px;border:1px solid var(--hair);border-radius:8px;cursor:pointer;background:var(--canvas);color:var(--ink);font-size:12px;font-weight:500;transition:all .15s;user-select:none}
    #modal-corrective-finish .fin-sub-lbl:has(input:checked){background:var(--ink);color:var(--canvas);border-color:var(--ink)}
    #modal-corrective-finish .fin-sub-lbl input{width:13px;height:13px;accent-color:var(--canvas);pointer-events:none;flex-shrink:0}
    #modal-corrective-finish .fin-time-inp{width:100%;height:36px;padding:0 8px;background:var(--canvas);border:1px solid var(--hair);border-radius:8px;font-size:12px;color:var(--ink);outline:none}
    #modal-corrective-finish .fin-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;display:inline-block}
    #modal-corrective-finish .fin-gps{padding:0 14px;height:36px;background:var(--warn,#f97316);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:5px}
    #modal-corrective-finish .fin-btn-gen{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:10px;background:var(--warn,#f97316);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;transition:opacity .15s}
    #modal-corrective-finish .fin-btn-gen:hover{opacity:.88}
    #modal-corrective-finish .fin-btn-ghost{padding:8px 20px;background:transparent;border:1px solid var(--hair);border-radius:10px;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer}
    #modal-corrective-finish .fin-btn-ghost:hover{background:var(--surface-2)}
    #modal-corrective-finish .fin-btn-save{display:flex;align-items:center;gap:6px;padding:8px 20px;background:var(--ok,#10b981);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;transition:opacity .15s}
    #modal-corrective-finish .fin-btn-save:hover{opacity:.88}
    </style>
    <div id="modal-corrective-finish" class="hidden">
      <div class="fin-card">

        <!-- HEADER -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 22px;border-bottom:1px solid var(--hair);flex-shrink:0">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:40px;height:40px;background:var(--ok,#10b981);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <i data-lucide="check" style="width:20px;height:20px;color:#fff;stroke-width:3"></i>
            </div>
            <div>
              <p style="font-size:10px;font-weight:700;color:var(--ink-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px">NS FINISH · CLOSE INCIDENT</p>
              <div style="display:flex;align-items:center;gap:8px">
                <h2 id="finish-title" style="font-size:20px;font-weight:900;color:var(--ink);line-height:1">NS Finish</h2>
                <span id="finish-incident-id-badge" style="padding:2px 10px;background:var(--surface-2);border:1px solid var(--hair);border-radius:6px;font-size:12px;font-weight:600;color:var(--ink-muted)"></span>
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span id="finish-mttr-badge" style="display:none;align-items:center;gap:5px;padding:5px 12px;background:rgba(13,148,136,.1);border:1px solid rgba(13,148,136,.3);border-radius:20px;font-size:12px;font-weight:700;color:#0d9488">
              <i data-lucide="clock" style="width:13px;height:13px"></i>
              <span id="finish-mttr-text"></span>
            </span>
            <button id="btn-close-finish" style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:1px solid var(--hair);border-radius:8px;background:transparent;cursor:pointer">
              <i data-lucide="x" style="width:16px;height:16px;color:var(--ink-muted)"></i>
            </button>
          </div>
        </div>

        <!-- BODY -->
        <div class="fin-body">

          <!-- LEFT COLUMN -->
          <div class="fin-left">

            <!-- Incident + Circuit -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div>
                <span class="fin-flabel">Incident Number</span>
                <input id="finish-incident" class="fin-inp" placeholder="I2604-000000">
              </div>
              <div>
                <span class="fin-flabel">Circuit ID · Customer</span>
                <input id="finish-circuit" class="fin-inp" placeholder="ML43907 GigabitEthernet6/0/16">
              </div>
            </div>

            <!-- Sub Contractor -->
            <div>
              <p class="fin-slabel"><i data-lucide="users" style="width:12px;height:12px"></i> Sub Contractor <span style="font-size:9px;font-weight:400;text-transform:none;letter-spacing:0;opacity:.65">(เลือกได้หลายเจ้า)</span></p>
              <div id="finish-sub-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px"></div>
            </div>

            <!-- Timeline -->
            <div>
              <p class="fin-slabel"><i data-lucide="clock" style="width:12px;height:12px"></i> เวลาต่างๆ · TIMELINE</p>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div>
                  <span class="fin-flabel" style="display:flex;align-items:center;gap:5px"><span class="fin-dot" style="background:#ef4444"></span> Down time</span>
                  <input id="finish-down-time" type="datetime-local" class="fin-time-inp">
                </div>
                <div>
                  <span class="fin-flabel" style="display:flex;align-items:center;gap:5px"><span class="fin-dot" style="background:#f59e0b"></span> NOC alert</span>
                  <input id="finish-noc-alert" type="datetime-local" class="fin-time-inp">
                </div>
                <div>
                  <span class="fin-flabel" style="display:flex;align-items:center;gap:5px"><span class="fin-dot" style="background:#3b82f6"></span> NS response</span>
                  <input id="finish-ns-response" type="datetime-local" class="fin-time-inp">
                </div>
                <div>
                  <span class="fin-flabel" style="display:flex;align-items:center;gap:5px"><span class="fin-dot" style="background:#f59e0b"></span> เรียก SUB</span>
                  <input id="finish-call-sub" type="datetime-local" class="fin-time-inp">
                </div>
                <div>
                  <span class="fin-flabel" style="display:flex;align-items:center;gap:5px"><span class="fin-dot" style="background:#6366f1"></span> SUB มาถึง</span>
                  <input id="finish-sub-arrive" type="datetime-local" class="fin-time-inp">
                </div>
                <div>
                  <span class="fin-flabel" style="display:flex;align-items:center;gap:5px"><span class="fin-dot" style="background:#10b981"></span> เริ่มแก้ไข</span>
                  <input id="finish-start-fix" type="datetime-local" class="fin-time-inp">
                </div>
                <div>
                  <span class="fin-flabel" style="display:flex;align-items:center;gap:5px"><span class="fin-dot" style="background:var(--hair)"></span> Up time</span>
                  <input id="finish-up-time" type="datetime-local" class="fin-time-inp">
                </div>
                <div>
                  <span class="fin-flabel" style="display:flex;align-items:center;gap:5px"><span class="fin-dot" style="background:var(--hair)"></span> เก็บหัวต่อ</span>
                  <input id="finish-store-connector" type="datetime-local" class="fin-time-inp">
                </div>
              </div>
            </div>

            <!-- Stop/Start Clock (hidden) -->
            <div id="finish-clock-section" class="hidden" style="border-top:1px solid var(--hair);padding-top:12px">
              <p class="fin-slabel">Stop clock · Start clock</p>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div><span class="fin-flabel">Stop Clock</span><input id="finish-stop-clock" type="datetime-local" class="fin-time-inp"></div>
                <div><span class="fin-flabel">Start Clock</span><input id="finish-start-clock" type="datetime-local" class="fin-time-inp"></div>
              </div>
            </div>

            <!-- Photos -->
            <div>
              <p class="fin-slabel"><i data-lucide="image" style="width:12px;height:12px"></i> รูปภาพประกอบ <span style="font-size:9px;font-weight:400;text-transform:none;letter-spacing:0;opacity:.65">(บังคับ)</span></p>
              <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px">
                ${[
                  { id: "finish-photo-before",    label: "รูปก่อน<br>ดำเนินการ" },
                  { id: "finish-photo-damage",     label: "รูปแผล" },
                  { id: "finish-photo-unable",     label: "รูปปฏิบัติ<br>ไม่ได้" },
                  { id: "finish-photo-connector",  label: "รูปเก็บ<br>หัวต่อ" },
                  { id: "finish-photo-sticker",    label: "รูปติด<br>สติกเกอร์" },
                ].map(p => `
                  <div style="border:1px solid var(--hair);border-radius:10px;padding:7px 5px;background:var(--canvas);display:flex;flex-direction:column;align-items:center;gap:5px">
                    <p style="font-size:9px;font-weight:600;color:var(--ink);text-align:center;line-height:1.35">${p.label}</p>
                    <input id="${p.id}-file" type="file" accept="image/*,.pdf" multiple class="hidden">
                    <label for="${p.id}-file" style="cursor:pointer;display:flex;align-items:center;gap:3px;background:var(--surface-2);border:1px solid var(--hair);border-radius:6px;padding:4px 5px;font-size:9px;font-weight:600;color:var(--ink-muted);width:100%;justify-content:center">
                      <i data-lucide="camera" style="width:10px;height:10px"></i> ถ่าย / แนบรูป
                    </label>
                    <div id="${p.id}-preview" style="display:flex;flex-wrap:wrap;gap:2px;justify-content:center;min-height:14px">
                      <span style="font-size:8px;color:var(--ink-dim)">ยังไม่มีรูป</span>
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>

          </div><!-- /fin-left -->

          <!-- RIGHT COLUMN -->
          <div class="fin-right">

            <!-- JOB DETAILS -->
            <div>
              <p class="fin-slabel"><i data-lucide="clipboard-list" style="width:12px;height:12px"></i> รายละเอียดงาน · JOB DETAILS</p>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
                <div>
                  <span class="fin-flabel">OFC Type</span>
                  <select id="finish-ofc-type" class="fin-inp" style="padding:0 8px">
                    <option value="">เลือกประเภท</option>
                    <option>หลายเส้น</option><option>Flat type 2 Core</option><option>4 Core ADSS</option><option>12 Core ADSS</option><option>24 Core ADSS</option><option>48 Core ADSS</option><option>60 Core ADSS</option><option>144 Core ADSS</option><option>216 Core ADSS</option><option>312 Core ADSS</option><option>12 Core Armour</option><option>48 Core Armour</option><option>60 Core Armour</option><option>144 Core Armour</option>
                  </select>
                  <div id="finish-multi-ofc-summary-wrap" class="hidden" style="margin-top:5px;padding:7px;border-radius:7px;border:1px solid var(--warn,#f97316);background:rgba(249,115,22,.05)">
                    <p style="font-size:10px;font-weight:700;color:var(--ink)">ข้อมูล OFC ที่เลือก:</p>
                    <div id="finish-multi-ofc-summary" style="font-size:11px;color:var(--warn,#f97316);margin-top:3px"></div>
                  </div>
                </div>
                <div>
                  <span class="fin-flabel">Network Type</span>
                  <select id="finish-network-type" class="fin-inp" style="padding:0 8px">
                    <option value="">-</option><option value="Backbone">Backbone</option><option value="Access">Access</option>
                  </select>
                </div>
                <div>
                  <span class="fin-flabel">ระยะห่างจาก Site (เมตร)</span>
                  <input id="finish-distance" class="fin-inp" placeholder="เช่น 120">
                </div>
                <div>
                  <span class="fin-flabel">ชื่อ Site</span>
                  <input id="finish-site" class="fin-inp" placeholder="เช่น CHM-N04">
                </div>
                <div>
                  <span class="fin-flabel">สาเหตุ</span>
                  <select id="finish-cause" class="fin-inp" style="padding:0 8px">
                    <option value="">เลือกสาเหตุ</option><option>Animal gnawing</option><option>High loss/Crack</option><option>Cut by Unknown agency</option><option>Cut trees</option><option>Cut by MEA/PEA agency</option><option>Car accident</option><option>Electrical Surge</option><option>Electrical pole was broken by accident</option><option>Electrical pole was broken by Natural Disaster</option><option>Electric Authority remove pole</option><option>Road Construction</option><option>BTS Construction</option><option>Fire damanged</option><option>Natural Disaster</option><option>Equipment at Node</option><option>Equipment at customer</option><option>Bullet</option>
                  </select>
                </div>
                <div>
                  <span class="fin-flabel">บริเวณ</span>
                  <div style="display:flex;gap:5px">
                    <input id="finish-area" class="fin-inp" placeholder="เช่น หน้าซอย 12" style="flex:1">
                    <button id="btn-finish-map" style="padding:0 10px;height:36px;background:var(--surface-2);border:1px solid var(--hair);border-radius:8px;cursor:pointer;font-size:14px">🗺️</button>
                  </div>
                </div>
                <div style="grid-column:1/-1">
                  <span class="fin-flabel">พิกัด (Lat, Long)</span>
                  <div style="display:flex;gap:5px">
                    <input id="finish-latlng" class="fin-inp" placeholder="13.7054778, 100.5026162" style="flex:1">
                    <button id="btn-finish-gps" class="fin-gps"><i data-lucide="map-pin" style="width:13px;height:13px"></i> GPS</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- METHOD -->
            <div style="border-top:1px solid var(--hair);padding-top:14px">
              <p class="fin-slabel"><i data-lucide="wrench" style="width:12px;height:12px"></i> วิธีการแก้ไข · METHOD</p>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">

                <div id="finish-method-row" style="grid-column:1/-1">
                  <span class="fin-flabel">วิธีการ</span>
                  <select id="finish-method" class="fin-inp" style="padding:0 8px">
                    <option value="">เลือกวิธีการ</option>
                    <option value="ลากคร่อม">ลากคร่อม</option>
                    <option value="ร่นลูป">ร่นลูป</option>
                    <option value="โยก Core">โยก Core</option>
                    <option value="ตัดต่อใหม่">ตัดต่อใหม่</option>
                    <option value="ค่าเร่งด่วน">ค่าเร่งด่วน</option>
                  </select>
                </div>

                <div id="finish-distance-row" style="grid-column:1/-1">
                  <span class="fin-flabel">ระยะ</span>
                  <div style="display:flex;gap:6px;align-items:center">
                    <input id="finish-method-distance" class="fin-inp" placeholder="เมตร" style="flex:1">
                    <span style="font-size:12px;color:var(--ink-muted)">ม.</span>
                  </div>
                </div>

                <div id="finish-cut-core-row" style="grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:8px">
                  <div>
                    <span class="fin-flabel">ตัดต่อใหม่</span>
                    <input id="finish-cutpoint" class="fin-inp" placeholder="จุด">
                  </div>
                  <div>
                    <span class="fin-flabel">จุดละ</span>
                    <input id="finish-core-point" class="fin-inp" placeholder="Core">
                  </div>
                  <div id="finish-multi-point-wrap" class="hidden" style="grid-column:1/-1;border:1px solid var(--hair);border-radius:10px;padding:10px;background:var(--surface-2)">
                    <p style="font-weight:700;color:var(--ink);font-size:12px;margin-bottom:8px">รายละเอียดแต่ละจุด</p>
                    <div id="finish-multi-point-rows" style="display:flex;flex-direction:column;gap:8px"></div>
                  </div>
                </div>

                <div id="finish-connector-wrap">
                  <span class="fin-flabel">ตัวเลือก: หัวต่อ</span>
                  <select id="finish-connector-choice" class="fin-inp" style="padding:0 8px">
                    <option>ใช้หัวต่อ</option>
                    <option>ไม่ใช้หัวต่อ</option>
                  </select>
                </div>

                <div id="finish-head-joint-wrap">
                  <span class="fin-flabel">หัวต่อ</span>
                  <input id="finish-head-joint" class="fin-inp" placeholder="หัว">
                </div>

                <div id="finish-method-yoke-detail" class="hidden" style="grid-column:1/-1;border:1px solid rgba(13,148,136,.4);border-radius:10px;padding:12px;background:rgba(13,148,136,.05)">
                  <p style="font-size:13px;font-weight:800;color:#0d9488;margin-bottom:10px">📝 รายละเอียดการโยก Core</p>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
                    <div><span class="fin-flabel" style="color:#0d9488">จุดที่ 1</span><input id="finish-yoke-loc-a" class="fin-inp" placeholder="ชื่อจุดที่ด้านบน..."></div>
                    <div><span class="fin-flabel" style="color:#0d9488">จุดที่ 2</span><input id="finish-yoke-loc-b" class="fin-inp" placeholder="ชื่อจุดที่ด้านบน..."></div>
                  </div>
                  <div id="finish-yoke-circuit-rows" style="display:flex;flex-direction:column;gap:8px"></div>
                  <button id="btn-add-yoke-circuit" style="width:100%;margin-top:8px;padding:8px;background:#0d9488;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">+ เพิ่มลูกค้า/Circuit</button>
                </div>

                <div id="finish-urgent-row">
                  <span class="fin-flabel">ค่าเร่งด่วน</span>
                  <select id="finish-urgent-level" class="fin-inp" style="padding:0 8px">
                    <option>มีค่าเร่งด่วน</option>
                    <option>ไม่มีค่าเร่งด่วน</option>
                  </select>
                </div>
                <div>
                  <span class="fin-flabel">ปรับ / ไม่ปรับ</span>
                  <select id="finish-patch-status" class="fin-inp" style="padding:0 8px">
                    <option>ไม่ปรับ</option>
                    <option>ปรับ</option>
                  </select>
                </div>

                <div style="grid-column:1/-1">
                  <button id="btn-generate-repair" class="fin-btn-gen">
                    <i data-lucide="sparkles" style="width:14px;height:14px"></i> สร้างคำอธิบายอัตโนมัติ
                  </button>
                </div>

                <div id="finish-multi-repair-wrap" class="hidden" style="grid-column:1/-1;border:1px solid var(--hair);border-radius:10px;padding:10px;background:var(--surface-2)">
                  <p style="font-weight:700;color:var(--ink);font-size:12px;margin-bottom:8px">🧩 รายละเอียดการแก้ไขแต่ละเส้น</p>
                  <div id="finish-multi-repair-rows" style="display:flex;flex-direction:column;gap:8px"></div>
                </div>

                <div style="grid-column:1/-1">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
                    <span class="fin-flabel" style="margin-bottom:0">คำอธิบายงาน <span style="font-size:9px;font-weight:400;text-transform:none;letter-spacing:0;opacity:.6">(สร้างอัตโนมัติ หรือใส่เอง)</span></span>
                    <button id="btn-finish-copy-solution" style="font-size:9px;font-weight:700;color:var(--ink-muted);background:var(--surface-2);border:1px solid var(--hair);border-radius:5px;padding:2px 8px;cursor:pointer">COPY</button>
                  </div>
                  <textarea id="solution" style="width:100%;min-height:80px;padding:8px 10px;background:var(--canvas);border:1px solid var(--hair);border-radius:8px;font-size:12px;color:var(--ink);resize:vertical;outline:none" placeholder="คำอธิบายจะสร้างอัตโนมัติ หรือใส่ข้อมูลเอง"></textarea>
                </div>

              </div>
            </div>

          </div><!-- /fin-right -->
        </div><!-- /fin-body -->

        <!-- FOOTER -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 22px;border-top:1px solid var(--hair);flex-shrink:0">
          <div style="display:flex;align-items:center;gap:6px;color:var(--ink-muted);font-size:12px">
            <i data-lucide="user" style="width:13px;height:13px"></i>
            <span id="finish-footer-user" style="font-weight:600">—</span>
            <span style="opacity:.35">·</span>
            <i data-lucide="clock" style="width:12px;height:12px"></i>
            <span id="finish-footer-time" style="color:var(--ink-dim)">—</span>
          </div>
          <div style="display:flex;gap:8px">
            <button id="btn-cancel-finish" class="fin-btn-ghost">ยกเลิก</button>
            <button id="btn-save-finish" class="fin-btn-save">
              <i data-lucide="check-circle" style="width:15px;height:15px"></i> บันทึก &amp; ปิดเคส
            </button>
          </div>
        </div>

      </div>
    </div>
  `);

  let modal = document.getElementById("modal-corrective-finish");
  if (!document.getElementById("finish-connector-choice") || !document.getElementById("finish-head-joint")) {
    modal?.remove();
    ensureFinishModal();
    modal = document.getElementById("modal-corrective-finish");
  }

  document.getElementById("btn-close-finish").onclick = () => closeModal(modal);
  document.getElementById("btn-cancel-finish").onclick = () => closeModal(modal);

  document.getElementById("btn-finish-copy-solution")?.addEventListener("click", () => {
    const txt = document.getElementById("solution")?.value || "";
    if (txt) navigator.clipboard.writeText(txt).catch(() => {});
  });

  window._updateFinishMttr = function _updateFinishMttr() {
    const downVal = document.getElementById("finish-down-time")?.value;
    const upVal = document.getElementById("finish-up-time")?.value;
    const badge = document.getElementById("finish-mttr-badge");
    const text = document.getElementById("finish-mttr-text");
    if (!badge || !text) return;
    if (!downVal || !upVal) { badge.style.display = "none"; return; }
    const diffMs = new Date(upVal) - new Date(downVal);
    if (diffMs <= 0) { badge.style.display = "none"; return; }
    const totalMin = Math.floor(diffMs / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const mttrStr = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
    const slaOk = h < 3 || (h === 3 && m === 0);
    text.textContent = `MTTR ${mttrStr} · ${slaOk ? "SLA met" : "SLA miss"}`;
    badge.style.background = slaOk ? "rgba(13,148,136,.1)" : "rgba(239,68,68,.1)";
    badge.style.border = slaOk ? "1px solid rgba(13,148,136,.3)" : "1px solid rgba(239,68,68,.3)";
    badge.style.color = slaOk ? "#0d9488" : "#ef4444";
    badge.style.display = "flex";
  }
  document.getElementById("finish-up-time")?.addEventListener("change", () => {
    const up = document.getElementById("finish-up-time")?.value;
    if (!up) return;
    const storeEl = document.getElementById("finish-store-connector");
    if (storeEl) storeEl.value = formatDateTimeInput(addMinutes(up, 10));
    window._updateFinishMttr();
  });
  document.getElementById("finish-down-time")?.addEventListener("change", () => window._updateFinishMttr());

  document.getElementById("finish-method")?.addEventListener("change", (e) => {
    toggleSolutionFields(e.target.value);
  });
  document.getElementById("finish-cutpoint")?.addEventListener("input", () => {
    renderFinishMultiPointRows();
  });
  const addYokeCircuitBtn = document.getElementById("btn-add-yoke-circuit");
  if (addYokeCircuitBtn) addYokeCircuitBtn.onclick = () => addYokeCircuitRow();

  const finishMapBtn = document.getElementById("btn-finish-map");
  if (finishMapBtn) finishMapBtn.onclick = () => {

    const q = document.getElementById("finish-latlng").value || document.getElementById("finish-area").value;
    if (!q) return;
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`, "_blank");
  };

  const finishGpsBtn = document.getElementById("btn-finish-gps");
  if (finishGpsBtn) finishGpsBtn.onclick = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      document.getElementById("finish-latlng").value = `${pos.coords.latitude}, ${pos.coords.longitude}`;
    });
  };

  // Photo listeners for 5 required photo categories
  ["finish-photo-before", "finish-photo-damage", "finish-photo-unable", "finish-photo-connector", "finish-photo-sticker"].forEach((id) => {
    const input = document.getElementById(`${id}-file`);
    if (!input) return;
    input.addEventListener("change", () => {
      const newFiles = Array.from(input.files || []);
      if (!newFiles.length) return;
      if (!window.finishPhotoFiles) window.finishPhotoFiles = {};
      if (!window.finishPhotoFiles[id]) window.finishPhotoFiles[id] = [];
      window.finishPhotoFiles[id].push(...newFiles);
      input.value = ""; // reset so same file can be re-added
      renderFinishPhotoThumbnails(id);
      const modal = document.getElementById("modal-corrective-finish");
      if (modal) modal.dataset[id.replace(/-/g, "_")] = "1";
    });
  });
  // Toggle หัวต่อ input based on connector choice
  function applyConnectorToggle() {
    const choice = document.getElementById("finish-connector-choice")?.value;
    const wrap = document.getElementById("finish-head-joint-wrap");
    const connectorWrap = document.getElementById("finish-connector-wrap");
    const useJoint = choice === "ใช้หัวต่อ";
    if (wrap) wrap.classList.toggle("hidden", !useJoint);
    if (connectorWrap) connectorWrap.style.gridColumn = !useJoint ? "1/-1" : "";
  }
  document.getElementById("finish-connector-choice")?.addEventListener("change", applyConnectorToggle);
  applyConnectorToggle();

  document.getElementById("finish-site-a")?.addEventListener("input", (event) => {
    document.getElementById("finish-yoke-loc-a").value = event.target.value;
  });
  document.getElementById("finish-site-b")?.addEventListener("input", (event) => {
    document.getElementById("finish-yoke-loc-b").value = event.target.value;
  });
  document.getElementById("finish-yoke-loc-a")?.addEventListener("input", (event) => {
    document.getElementById("finish-site-a").value = event.target.value;
  });
  document.getElementById("finish-yoke-loc-b")?.addEventListener("input", (event) => {
    document.getElementById("finish-site-b").value = event.target.value;
  });

  document.getElementById("finish-ofc-type")?.addEventListener("change", () => {
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

  if (window.lucide) lucide.createIcons();
}

function toggleSolutionFields(selectedMethod = "") {
  const method = selectedMethod || document.getElementById("finish-method")?.value || "";
  const isYoke = method === "โยก Core";
  const isUrgentOnly = method === "ค่าเร่งด่วน";
  const useDistance = method === "ลากคร่อม" || method === "ร่นลูป";
  const isMultiOfcFinish = document.getElementById("finish-ofc-type")?.value === "หลายเส้น";
  const toggleHidden = (id, hidden) => document.getElementById(id)?.classList.toggle("hidden", hidden);
  toggleHidden("finish-method-row", isMultiOfcFinish);
  toggleHidden("finish-distance-row", isMultiOfcFinish || !useDistance);
  toggleHidden("finish-cut-core-row", isMultiOfcFinish || isUrgentOnly);
  toggleHidden("finish-method-yoke", isMultiOfcFinish || !isYoke);
  toggleHidden("finish-method-yoke-detail", isMultiOfcFinish || !isYoke);
  toggleHidden("finish-urgent-row", isMultiOfcFinish || isUrgentOnly);
  renderFinishMultiPointRows();
  const solutionEl = document.getElementById("solution");
  if (!isMultiOfcFinish && isUrgentOnly && solutionEl && !solutionEl.value.trim()) {
    solutionEl.value = "ค่า Stand By เร่งด่วน (เรียกเร่งด่วนเนื่องจาก Interface Down หลังตรวจสอบพบ F/O ปกติ)";
  }
}

function renderFinishMultiPointRows() {
  const wrap = document.getElementById("finish-multi-point-wrap");
  const rows = document.getElementById("finish-multi-point-rows");
  if (!wrap || !rows) return;

  const method = document.getElementById("finish-method")?.value || "";
  const cutPoints = Number(document.getElementById("finish-cutpoint")?.value || 0);
  const shouldShow = ["ตัดต่อใหม่", "โยก Core"].includes(method) && cutPoints > 1;
  wrap.classList.toggle("hidden", !shouldShow);

  if (!shouldShow) {
    rows.innerHTML = "";
    return;
  }

  const defaultOfcType = document.getElementById("finish-ofc-type")?.value || "";
  const defaultDistance = document.getElementById("finish-distance")?.value || "";
  const defaultArea = document.getElementById("finish-area")?.value || "";
  const defaultLatlng = document.getElementById("finish-latlng")?.value || "";

  const existing = Array.from(rows.querySelectorAll(".finish-multi-point-card")).map((card) => ({
    ofcType: card.querySelector(".finish-multi-point-ofc")?.value || "",
    distance: card.querySelector(".finish-multi-point-distance")?.value || "",
    area: card.querySelector(".finish-multi-point-area")?.value || "",
    latlng: card.querySelector(".finish-multi-point-latlng")?.value || "",
  }));
  const modal = document.getElementById("modal-corrective-finish");
  const seeded = (() => {
    try {
      return JSON.parse(modal?.dataset?.multiPointDetails || "[]");
    } catch {
      return [];
    }
  })();

  rows.innerHTML = Array.from({ length: cutPoints - 1 }, (_, idx) => {
    const pointNo = idx + 2;
    const seed = existing[idx] || seeded[idx] || {};
    return `
        <div class="finish-multi-point-card border rounded-lg p-3 bg-slate-50 space-y-2">
          <div class="font-semibold text-slate-700">จุดที่ ${pointNo}</div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label class="text-sm text-slate-700">OFC Type:</label>
              <input class="finish-multi-point-ofc mt-1 w-full bg-white border border-slate-300 rounded-lg px-3 py-2" placeholder="เช่น 4 Core ADSS" value="${seed.ofcType || defaultOfcType}">
            </div>
            <div>
              <label class="text-sm text-slate-700">ระยะห่างจาก Site (เมตร):</label>
              <input class="finish-multi-point-distance mt-1 w-full bg-white border border-slate-300 rounded-lg px-3 py-2" placeholder="เมตร" value="${seed.distance || defaultDistance}">
            </div>
            <div>
              <label class="text-sm text-slate-700">บริเวณ:</label>
              <input class="finish-multi-point-area mt-1 w-full bg-white border border-slate-300 rounded-lg px-3 py-2" placeholder="เช่น ถ.กัลปพฤกษ์" value="${seed.area || defaultArea}">
            </div>
            <div>
              <label class="text-sm text-slate-700">พิกัด (Lat, Long):</label>
              <input class="finish-multi-point-latlng mt-1 w-full bg-white border border-slate-300 rounded-lg px-3 py-2" placeholder="13.7054778, 100.5026162" value="${seed.latlng || defaultLatlng}">
            </div>
          </div>
        </div>
      `;
  }).join("");
}

function collectFinishMultiPointDetails() {
  return Array.from(document.querySelectorAll(".finish-multi-point-card")).map((card, idx) => ({
    pointNo: idx + 2,
    ofcType: card.querySelector(".finish-multi-point-ofc")?.value || "",
    distance: card.querySelector(".finish-multi-point-distance")?.value || "",
    area: card.querySelector(".finish-multi-point-area")?.value || "",
    latlng: card.querySelector(".finish-multi-point-latlng")?.value || "",
  }));
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
function buildFinishMultiLineSolution(lines = window.selectedOfcLines || []) {
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



function collectAutoSolutionData() {
  const ofcType = document.getElementById("finish-ofc-type")?.value || "-";
  return {
    isUsingMultipleLines: ofcType === "หลายเส้น",
    selectedOfcLines: window.selectedOfcLines || [],
    ofcMultipleLinesData: window.ofcMultipleLinesData || {},
    solutionText: document.getElementById("solution")?.value || "",
    ofcType,
    method: document.getElementById("finish-method")?.value || "",
    distance: document.getElementById("finish-method-distance")?.value || "",
    cutPoints: document.getElementById("finish-cutpoint")?.value || "",
    corePerPoint: document.getElementById("finish-core-point")?.value || "",
    connectorOption: document.getElementById("finish-connector-choice")?.value || "",
    connectorCount: document.getElementById("finish-head-joint")?.value || "",
    urgentOption: document.getElementById("finish-urgent-level")?.value || "",
    urgentReason: document.getElementById("finish-urgent-reason")?.value || "เรียกเร่งด่วนเนื่องจาก Interface Down หลังตรวจสอบพบ F/O ปกติ",
    pointA: document.getElementById("finish-site-a")?.value || document.getElementById("finish-yoke-loc-a")?.value || "",
    pointB: document.getElementById("finish-site-b")?.value || document.getElementById("finish-yoke-loc-b")?.value || "",
    coreShiftDetails: {
      pathStart: document.getElementById("finish-site-a")?.value || document.getElementById("finish-yoke-loc-a")?.value || "",
      pathEnd: document.getElementById("finish-site-b")?.value || document.getElementById("finish-yoke-loc-b")?.value || "",
    },
  };
}


function buildSolution() {
  const generated = createAutoSolutionDescription(collectAutoSolutionData());
  document.getElementById("solution").value = generated || "-";
}


function bindAutoSolutionGenerator() {
  const btn = document.getElementById("btn-generate-repair");
  if (!btn || btn.dataset.boundAutoSolution) return;
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    buildSolution();
  });
  btn.dataset.boundAutoSolution = "true";

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

const DELAY_REASON_OPTIONS = [
  "Noc Alert ช้า",
  "เนื่องจากการจราจรติดขัด",
  "เนื่องจากรอเจ้าหน้าที่การไฟฟ้าอนุญาตให้เข้าแก้ไข",
  "รอลูกค้าอนุญาตให้เข้าพื้นที่",
  "เนื่องจากหน่วยงานมีฝนตก",
  "เจ้าหน้าที่ตำรวจไม่อนุญาตให้เข้าแก้ไขเนื่องจากกีดขวางการจราจร",
  "เคเบิลมีปัญหา 2 จุด",
  "เคเบิลมีปัญหามากกว่า 2 จุด",
  "รอ Spare Cable",
];

function showDelayReasonPopup(durationLabel) {
  return new Promise((resolve) => {
    const id = "modal-delay-reason-prompt";
    document.getElementById(id)?.remove();
    document.body.insertAdjacentHTML("beforeend", `
      <div id="${id}" class="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-[2000] p-4">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
          <div class="text-center">
            <div class="text-3xl mb-2">⚠️</div>
            <h3 class="text-lg font-bold text-slate-800">เกิดความล่าช้า</h3>
            <p class="text-sm text-slate-500 mt-1">กรุณาระบุสาเหตุที่ใช้เวลาเกิน 3 ชั่วโมง<br><span class="font-semibold text-orange-600">(${durationLabel})</span></p>
          </div>
          <div>
            <label class="text-sm font-semibold text-slate-700 block mb-1">สาเหตุการล่าช้า:</label>
            <select id="delay-reason-select" class="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400">
              <option value="">เลือกสาเหตุ</option>
              ${DELAY_REASON_OPTIONS.map((o) => `<option value="${o}">${o}</option>`).join("")}
            </select>
          </div>
          <div class="flex gap-3 pt-1">
            <button id="delay-reason-skip" class="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors text-sm">ข้าม</button>
            <button id="delay-reason-confirm" class="flex-1 py-2.5 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl transition-colors text-sm">ยืนยัน</button>
          </div>
        </div>
      </div>
    `);
    const cleanup = () => document.getElementById(id)?.remove();
    document.getElementById("delay-reason-skip").onclick = () => { cleanup(); resolve(""); };
    document.getElementById("delay-reason-confirm").onclick = () => {
      const val = document.getElementById("delay-reason-select")?.value || "";
      cleanup(); resolve(val);
    };
  });
}

function showMultiSubDetailsPopup(subs, existing = [], defaultText = "") {
  return new Promise((resolve) => {
    const id = "modal-sub-detail-prompt";
    document.getElementById(id)?.remove();
    const rows = subs.map((sub) => {
      const prev = existing.find((a) => (a.subName || a.sub || "") === sub);
      const val = prev?.task || prev?.text || defaultText;
      return `
        <div class="space-y-1">
          <label class="text-xs font-bold text-orange-600 uppercase tracking-wide">[${sub}]</label>
          <textarea data-sub="${sub}" rows="2"
            class="sub-detail-textarea w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-orange-400"
            placeholder="รายละเอียดงานของ ${sub} (ไม่บังคับ)">${val}</textarea>
        </div>`;
    }).join("");
    document.body.insertAdjacentHTML("beforeend", `
      <div id="${id}" class="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-[2000] p-4">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
          <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 class="text-base font-bold text-slate-800">รายละเอียดงานแต่ละ Sub</h3>
            <button id="sub-detail-close" class="text-slate-400 hover:text-slate-700 text-lg font-bold">✕</button>
          </div>
          <div class="p-5 space-y-4 overflow-y-auto flex-1">${rows}</div>
          <div class="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-white rounded-b-2xl">
            <button id="sub-detail-skip" class="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition-colors">ข้าม</button>
            <button id="sub-detail-confirm" class="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-sm transition-colors">ยืนยัน</button>
          </div>
        </div>
      </div>
    `);
    const cleanup = () => document.getElementById(id)?.remove();
    const collect = () => Array.from(document.querySelectorAll(".sub-detail-textarea")).map((el) => ({
      subName: el.dataset.sub,
      task: el.value.trim() || "-",
    }));
    document.getElementById("sub-detail-close").onclick = () => { cleanup(); resolve(null); };
    document.getElementById("sub-detail-skip").onclick = () => { cleanup(); resolve([]); };
    document.getElementById("sub-detail-confirm").onclick = () => { const r = collect(); cleanup(); resolve(r); };
  });
}

function renderFinishPhotoThumbnails(id) {
  const preview = document.getElementById(`${id}-preview`);
  if (!preview) return;
  const files = (window.finishPhotoFiles || {})[id] || [];
  if (!files.length) {
    preview.innerHTML = '<span class="text-[9px] text-slate-400">ยังไม่มีรูป</span>';
    return;
  }
  preview.innerHTML = files.map((f, i) => {
    const isImage = f.type.startsWith("image/");
    const url = isImage ? URL.createObjectURL(f) : "";
    return `<button type="button" onclick="window.openFinishPhotoViewer('${id}',${i})" class="relative group flex-shrink-0">
      ${isImage
        ? `<img src="${url}" alt="${f.name}" class="w-12 h-12 object-cover rounded border border-slate-200 group-hover:border-orange-400 transition-colors">`
        : `<div class="w-12 h-12 flex items-center justify-center bg-slate-100 rounded border border-slate-200 text-xl">📄</div>`
      }
    </button>`;
  }).join("");
}

function ensureFinishPhotoViewer() {
  if (document.getElementById("finish-photo-viewer")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div id="finish-photo-viewer" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.92);align-items:center;justify-content:center;">
      <button id="fpv-close" style="position:absolute;top:16px;right:16px;color:#fff;font-size:28px;width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:50%;cursor:pointer;background:transparent;border:none;line-height:1;" onclick="document.getElementById('finish-photo-viewer').style.display='none'">✕</button>
      <button id="fpv-prev" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);color:#fff;font-size:48px;width:56px;height:56px;display:flex;align-items:center;justify-content:center;border-radius:50%;cursor:pointer;background:transparent;border:none;line-height:1;user-select:none;" onclick="window.navigateFinishPhotoViewer(-1)">‹</button>
      <button id="fpv-next" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);color:#fff;font-size:48px;width:56px;height:56px;display:flex;align-items:center;justify-content:center;border-radius:50%;cursor:pointer;background:transparent;border:none;line-height:1;user-select:none;" onclick="window.navigateFinishPhotoViewer(1)">›</button>
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:0 64px;width:100%;">
        <img id="fpv-image" src="" style="max-height:80vh;max-width:90vw;border-radius:12px;object-fit:contain;box-shadow:0 25px 50px rgba(0,0,0,0.5);">
        <div id="fpv-name" style="color:rgba(255,255,255,0.7);font-size:12px;text-align:center;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></div>
        <div id="fpv-counter" style="color:rgba(255,255,255,0.5);font-size:12px;"></div>
      </div>
    </div>
  `);
  document.addEventListener("keydown", (e) => {
    const viewer = document.getElementById("finish-photo-viewer");
    if (!viewer || viewer.style.display === "none") return;
    if (e.key === "ArrowLeft") window.navigateFinishPhotoViewer(-1);
    else if (e.key === "ArrowRight") window.navigateFinishPhotoViewer(1);
    else if (e.key === "Escape") viewer.style.display = "none";
  });
}

window.openFinishPhotoViewer = function(categoryId, index) {
  ensureFinishPhotoViewer();
  window._fpvState = { id: categoryId, index };
  _updateFinishPhotoViewer();
  const viewer = document.getElementById("finish-photo-viewer");
  viewer.style.display = "flex";
};

window.navigateFinishPhotoViewer = function(dir) {
  const state = window._fpvState || {};
  const files = (window.finishPhotoFiles || {})[state.id] || [];
  if (!files.length) return;
  state.index = (state.index + dir + files.length) % files.length;
  _updateFinishPhotoViewer();
};

function _updateFinishPhotoViewer() {
  const state = window._fpvState || {};
  const files = (window.finishPhotoFiles || {})[state.id] || [];
  const file = files[state.index];
  if (!file) return;
  const img = document.getElementById("fpv-image");
  const name = document.getElementById("fpv-name");
  const counter = document.getElementById("fpv-counter");
  if (img) img.src = file.type.startsWith("image/") ? URL.createObjectURL(file) : "";
  if (name) name.textContent = file.name;
  if (counter) counter.textContent = `${state.index + 1} / ${files.length}`;
  // hide prev/next if only 1 photo
  const prev = document.getElementById("fpv-prev");
  const next = document.getElementById("fpv-next");
  if (prev) prev.style.display = files.length > 1 ? "flex" : "none";
  if (next) next.style.display = files.length > 1 ? "flex" : "none";
}

function openCorrectiveFinishModal(incidentId) {
  const found = getCorrectiveIncidentById(incidentId);
  if (!found) return;
  if (found.tab === "equipment") {
    openEquipmentFinishModal(incidentId);
    return;
  }
  const { incident, tab } = found;
  // Reset photo files for fresh open
  window.finishPhotoFiles = {};
  ensureFinishModal();
  populateSubCheckboxGrid('finish-sub-grid', 'finish-sub', 'fin-sub-lbl');
  populateSelectFromCatalog('finish-cause',  'causes',      'เลือกสาเหตุ');
  populateSelectFromCatalog('finish-method', 'fixMethods',  'เลือกวิธีการ');
  const modal = document.getElementById("modal-corrective-finish");
  // Reset all photo previews to empty state
  ["finish-photo-before","finish-photo-damage","finish-photo-unable","finish-photo-connector","finish-photo-sticker"].forEach((id) => {
    const prev = document.getElementById(`${id}-preview`);
    if (prev) prev.innerHTML = '<span class="text-[9px] text-slate-400">ยังไม่มีรูป</span>';
    delete modal?.dataset[id.replace(/-/g, "_")];
  });
  const finIdBadge = document.getElementById("finish-incident-id-badge");
  if (finIdBadge) finIdBadge.textContent = incident.incidentId || "";
  const finFooterUser = document.getElementById("finish-footer-user");
  if (finFooterUser) finFooterUser.textContent = incident.respondedBy || incident.createdBy || "—";
  const finFooterTime = document.getElementById("finish-footer-time");
  if (finFooterTime) {
    const now = new Date();
    finFooterTime.textContent = `${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")} · ${now.getDate().toString().padStart(2,"0")} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][now.getMonth()]} ${now.getFullYear()}`;
  }
  const _updArr = incident.updates || [];
  const latestUpdate = _updArr[_updArr.length - 1] || {};
  const firstTicket = (incident.tickets || [])[0] || {};

  const formatCircuitCustomerFromUpdate = () => {
    const originate = String(latestUpdate.originate || "").trim();
    const terminate = String(latestUpdate.terminate || "").trim();
    if (originate && terminate) {
      return originate === terminate ? originate : `${originate} - ${terminate}`;
    }
    if (originate || terminate) return originate || terminate;
    return `${firstTicket.cid || ""} ${firstTicket.port || ""}`.trim();
  };

  setFieldValue("finish-incident", incident.incidentId || "");
  setFieldValue("finish-circuit", formatCircuitCustomerFromUpdate());

  setFieldValue("finish-ofc-type", latestUpdate.ofcType || "");
  setFieldValue("finish-network-type", latestUpdate.networkType || "");
  const latestMultiOfc = normalizeMultiOfcData(latestUpdate.multiOfcDetails || {});
  modal.dataset.latestMultiOfc = JSON.stringify(latestMultiOfc);
  const savedMultiRepair = incident.nsFinish?.details?.multiRepairDetails || [];
  renderOfcSummaryBox(document.getElementById("finish-multi-ofc-summary"), latestMultiOfc);
  renderFinishMultiRepairRows(latestMultiOfc, savedMultiRepair);
  document.getElementById("finish-multi-ofc-summary-wrap").classList.toggle(
    "hidden",
    !(document.getElementById("finish-ofc-type").value === "หลายเส้น" && summarizeMultiOfcData(latestMultiOfc).length)
  );
  setFieldValue("finish-distance", latestUpdate.distance || "");
  setFieldValue("finish-site", latestUpdate.site || "");
  setFieldValue("finish-cause", latestUpdate.cause || "");
  setFieldValue("finish-area", latestUpdate.area || "");
  setFieldValue("finish-latlng", latestUpdate.latlng || "");
  setFieldValue("finish-stop-clock", formatDateTimeInput(latestUpdate.stopClockAt));
  setFieldValue("finish-start-clock", formatDateTimeInput(latestUpdate.startClockAt));
  const clockSection = document.getElementById("finish-clock-section");
  if (clockSection) clockSection.classList.toggle("hidden", !latestUpdate.stopClockAt && !latestUpdate.startClockAt);
  const parsedFallback = parseRepairTextToFinishFields(latestUpdate.initialFix || latestUpdate.message || "");
  const parsedFromUpdate = {
    method: latestUpdate.parsedMethod || parsedFallback.method || "",
    methodDistance: latestUpdate.parsedMethodDistance || parsedFallback.methodDistance || "",
    cutPoint: latestUpdate.parsedCutPoint || parsedFallback.cutPoint || "",
    corePoint: latestUpdate.parsedCorePoint || parsedFallback.corePoint || "",
    headJoint: latestUpdate.parsedHeadJoint || parsedFallback.headJoint || "",
    connectorChoice: latestUpdate.parsedConnectorChoice || parsedFallback.connectorChoice || "ไม่ใช้หัวต่อ",
  };
  setFieldValue("finish-method", parsedFromUpdate.method || latestUpdate.workCase || "");
  document.getElementById("finish-method")?.dispatchEvent(new Event("change"));
  setFieldValue("finish-method-distance", parsedFromUpdate.methodDistance || "");
  setFieldValue("finish-cutpoint", parsedFromUpdate.cutPoint || "");
  setFieldValue("finish-core-point", parsedFromUpdate.corePoint || "");
  setFieldValue("finish-site-a", "");
  setFieldValue("finish-site-b", "");
  const savedFinishRepairText = incident.nsFinish?.details?.repairText || "";
  modal.dataset.multiPointDetails = JSON.stringify(incident.nsFinish?.details?.multiPointDetails || []);
  setFieldValue("solution", savedFinishRepairText || latestUpdate.initialFix || "");
  setFieldValue("finish-head-joint", parsedFromUpdate.headJoint || "");
  setFieldValue("finish-connector-choice", parsedFromUpdate.connectorChoice || "ไม่ใช้หัวต่อ");
  setFieldValue("finish-yoke-loc-a", latestUpdate.siteA || "");
  setFieldValue("finish-yoke-loc-b", latestUpdate.siteB || "");
  const yokeRows = document.getElementById("finish-yoke-circuit-rows");
  if (yokeRows) yokeRows.innerHTML = "";
  const savedCircuits = String(latestUpdate.circuitList || "").split("\n").map((line) => line.trim()).filter(Boolean);
  if (savedCircuits.length) {
    savedCircuits.forEach((line) => addYokeCircuitRow({ customer: line }));
  }
  toggleSolutionFields(document.getElementById("finish-method")?.value || "");
  syncMultiLineYokeSectionState();
  document.querySelectorAll(".finish-sub").forEach((el) => {
    el.checked = (latestUpdate.subcontractors || []).includes(el.value);
  });

  const _createdAt = incident.createdAt || incident.created_at || "";
  const down = firstTicket.downTime || incident.downTime || _createdAt;
  const noc = _createdAt || down;
  const responseAt = incident.respondedAt || incident.responded_at || _createdAt;

  const savedTimes = incident.nsFinish?.times || {};
  const defaultCallSub = addMinutes(responseAt, 5);
  const defaultSubArrive = addMinutes(defaultCallSub, 60);
  const defaultStartFix = addMinutes(defaultSubArrive, 10);
  setFieldValue("finish-down-time", formatDateTimeInput(savedTimes.downTime || down));
  setFieldValue("finish-noc-alert", formatDateTimeInput(savedTimes.nocAlert || noc));
  setFieldValue("finish-ns-response", formatDateTimeInput(savedTimes.nsResponse || responseAt));
  setFieldValue("finish-call-sub", formatDateTimeInput(savedTimes.callSub || defaultCallSub));
  setFieldValue("finish-sub-arrive", formatDateTimeInput(savedTimes.subArrive || defaultSubArrive));
  setFieldValue("finish-start-fix", formatDateTimeInput(savedTimes.startFix || defaultStartFix));
  setFieldValue("finish-up-time", formatDateTimeInput(savedTimes.upTime));
  setFieldValue("finish-store-connector", formatDateTimeInput(savedTimes.storeConnector));
  if (typeof window._updateFinishMttr === "function") window._updateFinishMttr();
  bindAutoSolutionGenerator();

  document.getElementById("btn-save-finish").onclick = async () => {
  try {
    // ── 0. บังคับรูปภาพครบ 5 หมวด ──
    const PHOTO_CATEGORIES = [
      { id: "finish-photo-before",    label: "รูปก่อนดำเนินการ" },
      { id: "finish-photo-damage",    label: "รูปแผล" },
      { id: "finish-photo-unable",    label: "รูปกรณีปฏิบัติไม่ได้" },
      { id: "finish-photo-connector", label: "รูปเก็บหัวต่อ" },
      { id: "finish-photo-sticker",   label: "รูปติดสติกเกอร์" },
    ];
    const missing = PHOTO_CATEGORIES.filter((p) => !((window.finishPhotoFiles || {})[p.id] || []).length);
    if (missing.length) {
      alert(`กรุณาแนบรูปให้ครบทุกหมวด:\n${missing.map((p) => `• ${p.label}`).join("\n")}`);
      return;
    }

    const current = Store.getState();
    const completedAt = new Date().toISOString();
    const getFieldValue = (id) => document.getElementById(id)?.value || "";

    // ── 1. คำนวณ Duration time (หัก Pending) ──
    const downStr = getFieldValue("finish-down-time");
    const upStr = getFieldValue("finish-up-time");
    const stopStr = getFieldValue("finish-stop-clock");
    const startStr = getFieldValue("finish-start-clock");
    let durationMs = 0;
    if (downStr && upStr) {
      const totalMs = new Date(upStr).getTime() - new Date(downStr).getTime();
      let pendingMs = 0;
      if (stopStr && startStr) {
        const p = new Date(startStr).getTime() - new Date(stopStr).getTime();
        if (p > 0) pendingMs = p;
      }
      durationMs = Math.max(0, totalMs - pendingMs);
    }

    // ── 2. Delay Reason popup (ถ้าเกิน 3 ชม.) ──
    let delayBy = "";
    if (durationMs > 3 * 60 * 60 * 1000) {
      const hrs = Math.floor(durationMs / 3600000);
      const mins = Math.round((durationMs % 3600000) / 60000);
      const label = stopStr && startStr ? `Duration time ${hrs} Hrs ${mins} Mins` : `Total Down time ${hrs} Hrs ${mins} Mins`;
      delayBy = await showDelayReasonPopup(label);
    }

    // ── 3. Multi-Sub detail popup (ถ้ามีหลาย Sub) ──
    const checkedSubs = Array.from(document.querySelectorAll(".finish-sub:checked")).map((el) => el.value);
    let multiSubAssignments = incident.nsFinish?.details?.multiSubAssignments || [];
    if (checkedSubs.length > 1) {
      const solutionText = document.getElementById("solution")?.value?.trim() || "";
      const result = await showMultiSubDetailsPopup(checkedSubs, multiSubAssignments, solutionText);
      if (result === null) return; // user closed
      if (result.length > 0) multiSubAssignments = result;
    }

    // ── 4. Convert finish photo files to base64 attachments ──
    const PHOTO_CATS = [
      { id: "finish-photo-before",    label: "รูปก่อนดำเนินการ" },
      { id: "finish-photo-damage",    label: "รูปแผล" },
      { id: "finish-photo-unable",    label: "รูปกรณีปฏิบัติไม่ได้" },
      { id: "finish-photo-connector", label: "รูปเก็บหัวต่อ" },
      { id: "finish-photo-sticker",   label: "รูปติดสติกเกอร์" },
    ];
    const allPhotoFiles = [];
    for (const cat of PHOTO_CATS) {
      const files = (window.finishPhotoFiles || {})[cat.id] || [];
      for (const file of files) {
        allPhotoFiles.push({ file, category: cat.label });
      }
    }
    const finishAttachments = await Promise.all(allPhotoFiles.map(async ({ file, category }) => ({
      name: file.name,
      type: file.type || "",
      category,
      url: await compressImageToDataURL(file),
    })));

    const parsedFromSolution = parseRepairTextToFinishFields(getFieldValue("solution"));
    const payload = {
      incidentNumber: getFieldValue("finish-incident"),
      circuitCustomer: getFieldValue("finish-circuit"),
      subcontractors: checkedSubs,
      attachments: finishAttachments,
      times: {
        downTime: getFieldValue("finish-down-time"),
        nocAlert: getFieldValue("finish-noc-alert"),
        nsResponse: getFieldValue("finish-ns-response"),
        callSub: getFieldValue("finish-call-sub"),
        subArrive: getFieldValue("finish-sub-arrive"),
        startFix: getFieldValue("finish-start-fix"),
        upTime: getFieldValue("finish-up-time"),
        storeConnector: getFieldValue("finish-store-connector"),
        stopClock: getFieldValue("finish-stop-clock"),
        startClock: getFieldValue("finish-start-clock"),
      },
      details: {
        ofcType: getFieldValue("finish-ofc-type"),
        networkType: getFieldValue("finish-network-type"),
        multiOfcDetails: latestMultiOfc,
        distance: getFieldValue("finish-distance"),
        site: getFieldValue("finish-site"),
        cause: getFieldValue("finish-cause"),
        area: getFieldValue("finish-area"),
        latlng: getFieldValue("finish-latlng"),
        method: getFieldValue("finish-method") || parsedFromSolution.method || "",
        methodDistance: getFieldValue("finish-method-distance") || parsedFromSolution.methodDistance || "",
        cutPoint: getFieldValue("finish-cutpoint") || parsedFromSolution.cutPoint || "",
        corePoint: getFieldValue("finish-core-point") || parsedFromSolution.corePoint || "",
        siteA: getFieldValue("finish-site-a"),
        siteB: getFieldValue("finish-site-b"),
        circuitList: collectYokeCircuitList(),
        urgentLevel: getFieldValue("finish-urgent-level"),
        headJoint: getFieldValue("finish-head-joint") || parsedFromSolution.headJoint || "",
        connectorChoice: getFieldValue("finish-connector-choice") || parsedFromSolution.connectorChoice || "ไม่ใช้หัวต่อ",
        repairText: getFieldValue("solution"),
        multiRepairDetails: collectFinishMultiRepairDetails(),
        multiPointDetails: collectFinishMultiPointDetails(),
        patchStatus: getFieldValue("finish-patch-status"),
        delayBy,
        multiSubAssignments,
      },
    };

    const nextCorrective = { ...current.corrective };
    nextCorrective[tab] = (nextCorrective[tab] || []).map((item) =>
      getIncidentKey(item) === incidentId ? { ...item, ...(payload.details?.networkType ? { networkType: payload.details.networkType } : {}), nsFinish: payload, status: "COMPLETE", completedAt } : item
    );
    const finishedIncident = (nextCorrective[tab] || []).find((item) => getIncidentKey(item) === incidentId);
    if (finishedIncident) {
      applyFinishToLocalFlow(finishedIncident);
    }

    AlertService.markRecentWrite(incidentId);
    LocalDB.saveState({ alerts: current.alerts, corrective: nextCorrective }, { skipCloudSync: true });
    Store.dispatch((state) => ({ ...state, corrective: nextCorrective }));
    closeModal(modal);
    alert("บันทึก NS Finish เรียบร้อย");

    // Cloud sync via Firebase client SDK — strip ALL base64 to stay under Firestore 1MB limit
    if (finishedIncident && window.FirebaseSync?.saveIncidentToCloud) {
      window.FirebaseSync.saveIncidentToCloud(stripBase64FromIncident(finishedIncident))
        .catch((e) => console.warn("Finish cloud sync failed:", e));
    }
    // Also call Netlify function in background (non-blocking)
    syncFinishedIncidentToCloud(incidentId, payload, completedAt).catch(() => {});

    // LINE notification — ใช้ buildNsReportInputFromIncident เหมือน Report button
    try {
      if (finishedIncident) {
        const reportData = buildNsReportInputFromIncident(finishedIncident, tab);
        const reportText = buildFullNsFinishReport(reportData);
        fetch("/.netlify/functions/notify-line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            incidentId: payload.incidentNumber || incidentId,
            node: finishedIncident?.node || "-",
            workType: finishedIncident?.workType || "Fiber",
            updateNo: null,
            message: reportText,
            etr: "",
            subcontractors: payload.subcontractors || [],
            cause: payload.details?.cause || "",
            imageUrls: [],
            isFinish: true,
          }),
        }).catch((e) => console.warn("LINE finish notify failed:", e));
      }
    } catch (e) {
      console.warn("LINE finish notify build failed:", e);
    }
  } catch (err) {
    console.error("[NS Finish] Save failed:", err);
    alert("เกิดข้อผิดพลาด บันทึก NS Finish ไม่สำเร็จ: " + err.message);
  }
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
  openCorrectiveIncidentDetail(target.dataset.id);
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

  LocalDB.saveState({ alerts: current.alerts, corrective: nextCorrective, calendarEvents: current.calendarEvents }, { skipCloudSync: true });
  Store.dispatch((state) => ({ ...state, corrective: nextCorrective }));

  // Granular cloud sync for the cancelled item
  const cancelledItem = [...nextCorrective.fiber, ...nextCorrective.equipment, ...nextCorrective.other]
    .find(item => getIncidentKey(item) === incidentId);
  if (cancelledItem && window.FirebaseSync?.saveIncidentToCloud) {
    window.FirebaseSync.saveIncidentToCloud(cancelledItem).catch(e => console.warn("Cloud Sync failed:", e));
  }
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
// ===== GLOBAL SEARCH (LIVE) =====
function executeGlobalSearch(keyword) {
  const container = document.getElementById("search-results-container");
  if (!container) return;

  if (!keyword || keyword.trim() === "") {
    atomicHTMLUpdate(container, '<div class="col-span-full text-center text-slate-400 py-10">พิมพ์ค้นหาจากช่องด้านบนเพื่อดูผลลัพธ์</div>');
    return;
  }

  const kw = keyword.toLowerCase().trim();
  const state = Store.getState();
  const results = [];

  const isMatch = (str) => str ? String(str).toLowerCase().includes(kw) : false;
  const matchIncident = (item) => {
    try {
      // High performance deep search across all nested properties
      return JSON.stringify(item).toLowerCase().includes(kw);
    } catch (e) {
      // Fallback
      const inc = item.incident || item;
      const t = item.tickets?.[0] || {};
      return isMatch(inc.id) || isMatch(inc.ticketId) || isMatch(t.cid) || isMatch(t.originate) || isMatch(t.terminate) || isMatch(inc.node) || isMatch(inc.detail);
    }
  };

  // 1. Alerts
  (state.alerts || []).forEach(item => {
    if (matchIncident(item)) {
      let source = "Alert Monitor";
      if (item.status === "DELETED") source = "Recycle Bin";
      else if (item.status === "COMPLETE") source = "Incident History";
      const targetId = item.incident || item.incidentId || item.id || "";
      results.push({ item, source, type: "alert", id: targetId });
    }
  });

  // 2. Corrective
  ["fiber", "equipment", "other"].forEach(q => {
    (state.corrective?.[q] || []).forEach(item => {
      if (matchIncident(item)) {
        let source = `Corrective (${q.charAt(0).toUpperCase() + q.slice(1)})`;
        if (item.status === "DELETED") source = "Recycle Bin";
        else if (item.status === "COMPLETE") source = "Incident History";
        const targetId = item.incident || item.incidentId || item.id || "";
        results.push({ item, source, type: "corrective", queue: q, id: targetId });
      }
    });
  });

  // 3. Calendar
  (state.calendarEvents || []).forEach(ev => {
    if (isMatch(ev.id) || isMatch(ev.title) || isMatch(ev.node) || isMatch(ev.detail) || isMatch(ev.contact)) {
      results.push({ item: ev, source: "Calendar", type: "calendar", id: ev.id });
    }
  });

  // Render results
  if (results.length === 0) {
    atomicHTMLUpdate(container, '<div class="col-span-full text-center text-slate-400 py-10">ไม่พบข้อมูลที่ตรงกับคำค้นหา "' + keyword + '"</div>');
    return;
  }

  // ── Month/Year filter ──────────────────────────────────────────────────────
  const filterMonth = (document.getElementById("search-filter-month")?.value || "").trim();
  const filterYear  = (document.getElementById("search-filter-year")?.value  || "").trim();

  function getDownTime(res) {
    const base = res.item || {};
    const t1 = base.tickets?.[0] || {};
    return base.createdAt || base.downTime || t1.downTime || base.startTime || "";
  }

  const filtered = results.filter(res => {
    if (!filterMonth && !filterYear) return true;
    const dt = getDownTime(res);
    if (!dt) return false;
    try {
      const d = new Date(dt);
      if (isNaN(d.getTime())) return false;
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = String(d.getFullYear());
      if (filterMonth && mm !== filterMonth) return false;
      if (filterYear  && yyyy !== filterYear)  return false;
      return true;
    } catch { return false; }
  });

  // Populate year dropdown from all results (on first keyword result)
  const yearSel = document.getElementById("search-filter-year");
  if (yearSel) {
    const years = [...new Set(results.map(r => {
      const dt = getDownTime(r);
      if (!dt) return null;
      try { const d = new Date(dt); return isNaN(d) ? null : String(d.getFullYear()); } catch { return null; }
    }).filter(Boolean))].sort((a,b) => b-a);
    const curYear = yearSel.value;
    yearSel.innerHTML = `<option value="">ทุกปี</option>` + years.map(y => `<option value="${y}" ${y===curYear?"selected":""}>${y}</option>`).join("");
  }

  const countEl = document.getElementById("search-filter-count");
  if (countEl) countEl.textContent = filtered.length ? `แสดง ${filtered.length} รายการ` : "";

  if (filtered.length === 0) {
    atomicHTMLUpdate(container, '<div class="col-span-full text-center text-slate-400 py-10">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</div>');
    if (window.lucide) lucide.createIcons();
    return;
  }

  function fmtDownTime(dt) {
    if (!dt) return "-";
    try {
      const d = new Date(dt);
      if (isNaN(d.getTime())) return dt;
      return d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
    } catch { return dt; }
  }

  const tableRows = filtered.map(res => {
    const base = res.item || {};
    const t1 = base.tickets?.[0] || {};
    const n1 = base.nodes?.[0] || {};

    const rawTitle = res.id || base.incidentId || base.incident ||
      base.title || t1.ticket || t1.symphonyTicket || "No Title assigned";
    const title = String(rawTitle).split("__")[0].toUpperCase();

    let node = base.node || t1.node || n1.node || n1.name || "-";
    let cid = base.cid || t1.cid || n1.cid || "-";
    let alarm = base.alarm || base.detail || t1.detail || "-";
    const downTime = fmtDownTime(getDownTime(res));

    if (node === "-" && Array.isArray(base.nodes)) {
      node = base.nodes.map(n => n.node || n.name).filter(Boolean).join(", ") || "-";
    }

    let sourceBg = "#64748b", sourceLabel = res.source;
    if (res.source.startsWith("Corrective")) sourceBg = "#3b82f6";
    else if (res.type === "alert") sourceBg = "#ea580c";
    else if (res.type === "calendar") sourceBg = "#8b5cf6";
    if (res.source === "Recycle Bin") sourceBg = "#dc2626";
    else if (res.source === "Incident History") sourceBg = "#0d9488";

    const isDn  = base.alertClass === "Dn";
    const isInf = base.alertClass === "Inf";
    const borderColor = isDn ? "#f87171" : isInf ? "#fb923c" : "#e2e8f0";
    const badge = isDn
      ? `<span class="tag dn" style="font-size:9px;padding:1px 5px">DN</span>`
      : isInf ? `<span class="tag inf" style="font-size:9px;padding:1px 5px">INF</span>` : "";

    const isSelected = window._searchSelected?.has(res.id);
    return `
      <tr class="search-result-card hover:bg-orange-50 transition-colors cursor-pointer ${isSelected ? "bg-orange-50" : ""}"
          data-search-type="${res.type}" data-search-id="${res.id}" data-search-queue="${res.queue || ""}" data-search-source="${res.source}"
          style="border-bottom:1px solid var(--hair-soft)">
        <td class="py-2.5 px-3" style="width:36px" onclick="event.stopPropagation()">
          <input type="checkbox" class="search-card-checkbox w-4 h-4 cursor-pointer rounded" style="accent-color:#ea580c"
            data-select-id="${res.id}" ${isSelected ? "checked" : ""}>
        </td>
        <td class="py-2.5 pl-0 pr-2" style="border-left:3px solid ${borderColor}">
          <div class="flex items-center gap-1.5 pl-3">
            <span class="text-xs font-black" style="color:var(--ink)">${title}</span>
            ${badge}
          </div>
        </td>
        <td class="px-3 py-2.5 text-xs font-semibold" style="color:var(--ink)">${node}</td>
        <td class="px-3 py-2.5 text-xs" style="color:var(--sev-dn)">${alarm}</td>
        <td class="px-3 py-2.5 text-xs font-mono" style="color:var(--ink-muted)">${cid}</td>
        <td class="px-3 py-2.5 text-xs font-semibold" style="color:var(--ink)">${downTime}</td>
        <td class="px-3 py-2.5">
          <span class="px-2 py-0.5 rounded text-[9px] font-black text-white uppercase tracking-wider" style="background:${sourceBg}">${sourceLabel}</span>
        </td>
      </tr>`;
  }).join("");

  atomicHTMLUpdate(container, `
    <div class="panel overflow-hidden">
      <table class="w-full">
        <thead>
          <tr style="background:var(--surface-2);border-bottom:1px solid var(--hair)">
            <th class="py-2.5 pl-3" style="width:36px"></th>
            <th class="py-2.5 pl-3 pr-3 text-left text-[10px] font-black uppercase tracking-widest" style="color:var(--ink-muted)">Incident</th>
            <th class="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest" style="color:var(--ink-muted)">Node</th>
            <th class="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest" style="color:var(--ink-muted)">Alarm</th>
            <th class="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest" style="color:var(--ink-muted)">CID</th>
            <th class="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest" style="color:var(--ink-muted)">Down Time</th>
            <th class="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest" style="color:var(--ink-muted)">Source</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `);

  if (window.lucide) lucide.createIcons();
  renderSearchMapSection(filtered);
}

function _parseSearchLatlng(str) {
  if (!str) return null;
  const parts = String(str).split(',');
  if (parts.length < 2) return null;
  const lat = parseFloat(parts[0].trim());
  const lng = parseFloat(parts[1].trim());
  return (isNaN(lat) || isNaN(lng)) ? null : { lat, lng };
}

function renderSearchMapSection(filtered) {
  const section = document.getElementById('search-map-section');
  if (!section) return;

  const geoResults = filtered.reduce((acc, res) => {
    const base = res.item || {};
    const latlngStr = base.nsFinish?.details?.latlng || '';
    const coords = _parseSearchLatlng(latlngStr);
    if (!coords) return acc;

    const t1 = base.tickets?.[0] || {};
    const rawTitle = res.id || base.incidentId || base.incident || base.title || t1.ticket || 'No ID';
    const title = String(rawTitle).split('__')[0].toUpperCase();
    const downTime = base.createdAt || base.downTime || t1.downTime || base.startTime || '';
    const cause = base.nsFinish?.details?.cause || base.updates?.[0]?.cause || base.alarm || '-';
    const area = base.nsFinish?.details?.area || '-';
    const upTime = base.nsFinish?.times?.upTime || base.completedAt || '';
    let durationStr = '-';
    if (downTime && upTime) {
      const d1 = new Date(downTime), d2 = new Date(upTime);
      if (!isNaN(d1) && !isNaN(d2)) {
        const hrs = Math.round((d2 - d1) / 36000) / 100;
        durationStr = `${hrs} hrs`;
      }
    }
    const fmtDate = dt => dt ? new Date(dt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-';
    acc.push({ ...coords, title, downTime, fmtDown: fmtDate(downTime), cause, area, durationStr });
    return acc;
  }, []);

  if (geoResults.length === 0) { section.innerHTML = ''; return; }

  section.innerHTML = `
    <div class="bg-white border-2 border-slate-200 rounded-3xl overflow-hidden shadow-sm">
      <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div class="flex items-center gap-3">
          <span class="w-8 h-8 rounded-xl bg-orange-500 flex items-center justify-center shadow-md shadow-orange-500/30">
            <i data-lucide="map-pin" class="w-4 h-4 text-white"></i>
          </span>
          <div>
            <h3 class="font-black text-slate-800 text-base">Down Location Map</h3>
            <p class="text-xs text-slate-400 font-semibold">${geoResults.length} incident(s) with location data</p>
          </div>
        </div>
        <button id="search-map-toggle" onclick="toggleSearchMap()"
          class="px-4 py-2 text-sm font-black bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-all shadow-md shadow-orange-500/30 flex items-center gap-2">
          <i data-lucide="map" class="w-4 h-4"></i>
          <span id="search-map-toggle-label">Show Map</span>
        </button>
      </div>
      <div id="search-map-collapse" class="hidden">
        <div id="search-leaflet-map" style="height:380px;"></div>
        <div class="overflow-x-auto border-t border-slate-100">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-slate-50 border-b border-slate-200">
                <th class="text-left px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Incident ID</th>
                <th class="text-left px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Date</th>
                <th class="text-left px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Area</th>
                <th class="text-left px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Cause</th>
                <th class="text-left px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Duration</th>
                <th class="text-left px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Coordinates</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${geoResults.map((g, i) => `
                <tr class="hover:bg-orange-50/50 cursor-pointer transition-colors" onclick="focusSearchMapMarker(${i})">
                  <td class="px-4 py-3 font-black text-slate-700 text-xs">${g.title}</td>
                  <td class="px-4 py-3 text-slate-500 text-xs">${g.fmtDown}</td>
                  <td class="px-4 py-3 text-slate-500 text-xs">${g.area}</td>
                  <td class="px-4 py-3 text-slate-600 font-semibold text-xs">${g.cause}</td>
                  <td class="px-4 py-3 text-slate-500 text-xs">${g.durationStr}</td>
                  <td class="px-4 py-3 text-slate-400 text-xs font-mono">${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

  window._searchGeoResults = geoResults;
  window._searchMapInitialized = false;
  if (window.lucide) lucide.createIcons();
}

function toggleSearchMap() {
  const collapse = document.getElementById('search-map-collapse');
  const label = document.getElementById('search-map-toggle-label');
  if (!collapse) return;
  const isHidden = collapse.classList.contains('hidden');
  if (isHidden) {
    collapse.classList.remove('hidden');
    if (label) label.textContent = 'Hide Map';
    if (!window._searchMapInitialized) {
      initSearchLeafletMap(window._searchGeoResults || []);
      window._searchMapInitialized = true;
    }
  } else {
    collapse.classList.add('hidden');
    if (label) label.textContent = 'Show Map';
  }
}

function initSearchLeafletMap(geoResults) {
  if (typeof L === 'undefined') return;
  const mapEl = document.getElementById('search-leaflet-map');
  if (!mapEl) return;
  if (window._searchLeafletMap) { window._searchLeafletMap.remove(); window._searchLeafletMap = null; }

  const map = L.map('search-leaflet-map');
  window._searchLeafletMap = map;
  window._searchLeafletMarkers = [];

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors', maxZoom: 19
  }).addTo(map);

  if (geoResults.length === 0) { map.setView([13.75, 100.5], 10); return; }

  const bounds = [];
  geoResults.forEach((g, i) => {
    const marker = L.circleMarker([g.lat, g.lng], {
      radius: 9, fillColor: '#f97316', color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.85
    }).addTo(map);
    marker.bindPopup(`
      <div style="font-family:sans-serif;min-width:180px">
        <div style="font-weight:800;font-size:13px;color:#1e293b;margin-bottom:4px">${g.title}</div>
        <div style="font-size:11px;color:#64748b;margin-bottom:2px">📅 ${g.fmtDown}</div>
        <div style="font-size:11px;color:#64748b;margin-bottom:2px">📍 ${g.area}</div>
        <div style="font-size:11px;color:#475569;font-weight:600;margin-bottom:2px">⚡ ${g.cause}</div>
        <div style="font-size:11px;color:#64748b">⏱ ${g.durationStr}</div>
      </div>`);
    window._searchLeafletMarkers.push(marker);
    bounds.push([g.lat, g.lng]);
  });

  bounds.length === 1 ? map.setView(bounds[0], 14) : map.fitBounds(bounds, { padding: [40, 40] });
}

function focusSearchMapMarker(index) {
  const collapse = document.getElementById('search-map-collapse');
  if (collapse?.classList.contains('hidden')) {
    toggleSearchMap();
    setTimeout(() => focusSearchMapMarker(index), 300);
    return;
  }
  const marker = (window._searchLeafletMarkers || [])[index];
  if (!marker || !window._searchLeafletMap) return;
  window._searchLeafletMap.setView(marker.getLatLng(), 15, { animate: true });
  marker.openPopup();
}

function bindGlobalSearchEvents() {
  const inputNav = document.getElementById("global-search");
  const inputView = document.getElementById("view-search-input");

  let debounceTimer;

  const handleSearchInput = (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const val = e.target.value;

      // Sync the other input field
      if (inputNav && inputNav !== e.target) inputNav.value = val;
      if (inputView && inputView !== e.target) inputView.value = val;

      const state = Store.getState();
      const currentView = state.ui.currentView;

      if (val.trim().length > 0 && currentView !== "search") {
        // Save current view before switching to search
        Store.dispatch(s => ({ ...s, ui: { ...s.ui, currentView: "search", searchReturnView: currentView } }));
      } else if (val.trim().length === 0 && currentView === "search") {
        // Clear search → return to previous view
        const returnTo = state.ui.searchReturnView || "alert";
        Store.dispatch(s => ({ ...s, ui: { ...s.ui, currentView: returnTo } }));
        return;
      }

      executeGlobalSearch(val);
    }, 300);
  };

  if (inputNav) inputNav.addEventListener("input", handleSearchInput);
  if (inputView) inputView.addEventListener("input", handleSearchInput);

  // Month/Year filter change → re-run search
  const rerunSearch = () => {
    const kw = (inputView || inputNav)?.value || "";
    executeGlobalSearch(kw);
  };
  const monthSel = document.getElementById("search-filter-month");
  const yearSel2 = document.getElementById("search-filter-year");
  const clearBtn = document.getElementById("search-filter-clear");
  if (monthSel) monthSel.addEventListener("change", rerunSearch);
  if (yearSel2)  yearSel2.addEventListener("change", rerunSearch);
  if (clearBtn) clearBtn.addEventListener("click", () => {
    if (monthSel) monthSel.value = "";
    if (yearSel2)  yearSel2.value = "";
    rerunSearch();
  });

  // ── Search card selection ──────────────────────────────────────────────────
  if (!window._searchSelected) window._searchSelected = new Set();

  function updateSearchActionBar() {
    const bar = document.getElementById("search-action-bar");
    if (!bar) return;
    const count = window._searchSelected.size;
    bar.style.display = count > 0 ? "flex" : "none";
    const countEl = document.getElementById("search-select-count");
    if (countEl) countEl.textContent = `เลือก ${count} รายการ`;
  }

  // Inject floating action bar once
  if (!document.getElementById("search-action-bar")) {
    document.body.insertAdjacentHTML("beforeend", `
      <div id="search-action-bar" style="display:none;position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:9999;"
           class="bg-slate-800 text-white rounded-2xl px-6 py-3 shadow-2xl flex items-center gap-4 border border-slate-700">
        <span id="search-select-count" class="font-bold text-sm whitespace-nowrap"></span>
        <button id="btn-add-to-improvement"
          class="bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors whitespace-nowrap">
          เพิ่มใน Improvement
        </button>
        <button id="btn-search-clear-selection" class="text-slate-400 hover:text-white text-xs transition-colors">ยกเลิก</button>
      </div>`);

    document.getElementById("btn-search-clear-selection").addEventListener("click", () => {
      window._searchSelected.clear();
      document.querySelectorAll(".search-card-checkbox").forEach(cb => { cb.checked = false; });
      updateSearchActionBar();
    });

    document.getElementById("btn-add-to-improvement").addEventListener("click", () => {
      const state = Store.getState();
      const allItems = [
        ...(state.alerts || []),
        ...(state.corrective?.fiber || []),
        ...(state.corrective?.equipment || []),
        ...(state.corrective?.other || []),
      ];
      const manualData = (() => {
        try { return JSON.parse(localStorage.getItem("noc-improvement-manual") || "{}"); } catch { return {}; }
      })();

      window._searchSelected.forEach(selId => {
        const item = allItems.find(i => {
          const key = String(i.incidentId || i.incident || i.id || "").split("__")[0].toLowerCase();
          return key === selId.toLowerCase();
        });
        if (!item) return;
        const cid = (item.cid || item.tickets?.[0]?.cid || "").trim();
        if (!cid) return;
        if (!manualData[cid]) manualData[cid] = { cid, incidentIds: [], addedAt: new Date().toISOString() };
        const incId = String(item.incidentId || item.incident || item.id || "").split("__")[0];
        if (!manualData[cid].incidentIds.includes(incId)) manualData[cid].incidentIds.push(incId);
      });

      localStorage.setItem("noc-improvement-manual", JSON.stringify(manualData));
      window._searchSelected.clear();
      updateSearchActionBar();
      document.querySelectorAll(".search-card-checkbox").forEach(cb => { cb.checked = false; });

      // Navigate to Improvement
      Store.dispatch(s => ({ ...s, ui: { ...s.ui, currentView: "improvement" } }));
      const impView = document.getElementById("view-improvement");
      if (impView) {
        document.querySelectorAll(".view-content").forEach(v => { v.classList.add("hidden"); v.style.display = "none"; });
        impView.classList.remove("hidden");
        impView.style.display = "";
      }
      if (window.ImprovementUI) window.ImprovementUI.render();
    });
  }

  // Checkbox toggle on cards
  document.addEventListener("change", (e) => {
    const cb = e.target.closest(".search-card-checkbox");
    if (!cb) return;
    const id = cb.dataset.selectId;
    if (cb.checked) window._searchSelected.add(id);
    else window._searchSelected.delete(id);
    updateSearchActionBar();
  });

  // Handle "Search View" activation from sidebar click
  document.addEventListener("click", (e) => {
    const searchMenu = e.target.closest("[data-view='search']");
    if (searchMenu) {
      if (inputView) {
        inputView.focus();
        executeGlobalSearch(inputView.value);
      } else if (inputNav) {
        inputNav.focus();
        executeGlobalSearch(inputNav.value);
      }
    }
  });

  // Handle clicking a search result card
  document.addEventListener("click", (e) => {
    const card = e.target.closest(".search-result-card");
    if (!card) return;

    const type = card.dataset.searchType;
    const id = card.dataset.searchId;
    const source = card.dataset.searchSource;

    const scrollAndHighlight = () => {
      setTimeout(() => {
        // Include 'i' flag to make attribute selector case-insensitive
        const el = document.querySelector(`[data-corrective-id="${id}" i], [data-detail="${id}" i], [data-history-open-detail="${id}" i]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // <tr> doesn't support outline — use background animation instead
          const isRow = el.tagName === 'TR';
          const cls = isRow ? 'search-jump-highlight-row' : 'search-jump-highlight';
          el.classList.remove('search-jump-highlight', 'search-jump-highlight-row');
          void el.offsetWidth; // force reflow so animation restarts cleanly
          el.classList.add(cls);
          // 4 pulses × 0.75s = 3s total, then clean up
          setTimeout(() => el.classList.remove(cls), 3200);
        }
      }, 300);
    };

    if (source === "Recycle Bin") {
      Store.dispatch(s => ({ ...s, ui: { ...s.ui, currentView: "recycle" } }));
    } else if (source === "Incident History") {
      // Find which history tab contains this incident and which page
      const queueFromCard = card.dataset.searchQueue;
      let historyTab = queueFromCard || "fiber";
      let historyPage = 1;
      const HISTORY_PAGE_SIZE = 10;
      const COMPLETE_STATUSES = ["COMPLETE","CLOSED","FINISHED","RESOLVED","DONE","NS_FINISH","COMPLETED"];
      if (!queueFromCard) {
        // Scan corrective tabs to find the correct one
        const st = Store.getState();
        for (const tab of ["fiber", "equipment", "other"]) {
          const found = (st.corrective[tab] || []).some(item =>
            (item.incident || item.incidentId || item.id || "").toLowerCase() === id.toLowerCase()
          );
          if (found) { historyTab = tab; break; }
        }
      }
      // Calculate which page the item is on
      const stNow = Store.getState();
      const tabItems = (stNow.corrective[historyTab] || []).filter(item => {
        const s = String(item.status || "").trim().toUpperCase();
        return COMPLETE_STATUSES.includes(s) || Boolean(item?.completedAt || item?.nsFinish?.times?.upTime || item.nsFinishTime);
      }).sort((a, b) => new Date(b.completedAt || b.nsFinish?.times?.upTime || 0) - new Date(a.completedAt || a.nsFinish?.times?.upTime || 0));
      const itemIdx = tabItems.findIndex(item =>
        (item.incident || item.incidentId || item.id || "").toLowerCase() === id.toLowerCase()
      );
      if (itemIdx !== -1) historyPage = Math.floor(itemIdx / HISTORY_PAGE_SIZE) + 1;

      Store.dispatch(s => ({ ...s, ui: { ...s.ui, currentView: "history", activeHistoryTab: historyTab, historyPage } }));
      scrollAndHighlight();
    } else if (type === "alert") {
      Store.dispatch(s => ({ ...s, ui: { ...s.ui, currentView: "alert", highlightIncidentId: id } }));
      scrollAndHighlight();
    } else if (type === "corrective") {
      Store.dispatch(s => ({ ...s, ui: { ...s.ui, currentView: "corrective", activeCorrectiveTab: card.dataset.searchQueue, highlightIncidentId: id } }));
      scrollAndHighlight();
    } else if (type === "calendar") {
      Store.dispatch(s => ({ ...s, ui: { ...s.ui, currentView: "calendar" } }));
      scrollAndHighlight();
    }
  });
}

bindGlobalSearchEvents();
bindNsFinishReportEvents();
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

  let _lastRefresh = Date.now();
  const MIN_REFRESH_INTERVAL_MS = 30 * 1000; // throttle: at least 30s between polls

  const refreshAlerts = async () => {
    const now = Date.now();
    if (now - _lastRefresh < MIN_REFRESH_INTERVAL_MS) return;
    _lastRefresh = now;
    const currentView = Store.getState()?.ui?.currentView;
    if (["dashboard", "dashboard-details"].includes(currentView)) return;
    try {
      await AlertService.loadFromLocal();
    } catch (error) {
      console.warn("Auto refresh alerts failed:", error);
    }
  };

  // Start Firebase real-time listener for instant updates (primary)
  let realtimeActive = false;
  if (window.FirebaseSync?.startRealtimeListener) {
    try {
      window.FirebaseSync.startRealtimeListener();
      realtimeActive = true;
    } catch (e) {
      console.warn("Realtime listener failed to start, falling back to poll:", e);
    }
  }

  // Fallback poll — only if realtime listener not available, every 2 min
  if (!realtimeActive) {
    setInterval(refreshAlerts, 2 * 60 * 1000);
    window.addEventListener("focus", refreshAlerts);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshAlerts();
    });
  }
  // await AlertService.loadFromEmail();

  // CONNECT RENDERING TO STORE
  if (window.Store) {
    // Web Push: detect new alerts and trigger push notification
    let _prevAlertIds = new Set();
    Store.subscribe((state) => {
      const activeAlerts = (state.alerts || []).filter(
        (a) => !["CANCEL", "CANCELLED", "DELETED"].includes(String(a.status || "").toUpperCase())
      );
      const currentIds = new Set(activeAlerts.map((a) => a.incident || a.incidentId || a.id));
      const newIds = [...currentIds].filter((id) => !_prevAlertIds.has(id));

      if (_prevAlertIds.size > 0 && newIds.length > 0) {
        newIds.forEach((id) => {
          const alert = activeAlerts.find((a) => (a.incident || a.incidentId || a.id) === id);
          fetch("/.netlify/functions/send-push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: `🔔 New Alert: ${id}`,
              body: `Node: ${alert?.node || "-"} — ${alert?.alarm || alert?.alarmType || "-"}`,
              incidentId: String(id),
              type: "new-alert",
            }),
          }).catch((e) => console.warn("[Push] send-push failed:", e));
        });
      }

      _prevAlertIds = currentIds;

      // อัปเดต Live · N active ใน sidebar
      const sbCount = document.getElementById("sb-active-count");
      if (sbCount) sbCount.textContent = activeAlerts.length;
    });

    Store.subscribe(render);
    // Initial render to default view (usually Alert Monitor)
    render(Store.getState());
  }

  window.toggleSearchMap = toggleSearchMap;
  window.focusSearchMapMarker = focusSearchMapMarker;
})();