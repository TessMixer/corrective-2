// scripts/ui/calendar.ui.js

const CalendarUI = (function () {
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function toDateOnly(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function formatTime(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function formatDate(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function formatDateHeader(date, mode) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "Calendar";
    if (mode === "month") return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (mode === "week") {
      const start = getWeekStart(d);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return `${start.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })} – ${end.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}`;
    }
    return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function shiftDate(baseDate, mode, direction) {
    const d = new Date(baseDate);
    if (mode === "month") { d.setMonth(d.getMonth() + direction); return d; }
    if (mode === "week") { d.setDate(d.getDate() + 7 * direction); return d; }
    d.setDate(d.getDate() + direction);
    return d;
  }

  function getEventSortTime(event) {
    return new Date(event?.createdAt || event?.actionDate || event?.startAt || 0).getTime() || 0;
  }

  function filterEvents(events, filter) {
    const filtered = (!filter || filter === "all")
      ? (events || [])
      : (events || []).filter((event) => String(event.workType || "").toLowerCase() === filter);
    return filtered.slice().sort((a, b) => getEventSortTime(b) - getEventSortTime(a));
  }

  function getEventsByDate(events, dateStr, filter) {
    return filterEvents(events, filter).filter((event) => toDateOnly(event.startAt) === dateStr && event.status !== "CANCELLED");
  }

  function isToday(dateStr) {
    return toDateOnly(new Date()) === dateStr;
  }

  // Gradient color per workType — solid colored blocks
  function getEventGradient(event) {
    const wt = String(event.workType || "").toLowerCase();
    if (wt === "fiber") return { bg: "bg-gradient-to-br from-blue-500 to-blue-600", text: "text-white", pill: "bg-blue-400/30 text-white", border: "border-blue-400" };
    if (wt === "equipment") return { bg: "bg-gradient-to-br from-amber-400 to-orange-500", text: "text-white", pill: "bg-amber-300/30 text-white", border: "border-amber-400" };
    return { bg: "bg-gradient-to-br from-violet-500 to-purple-600", text: "text-white", pill: "bg-violet-400/30 text-white", border: "border-violet-400" };
  }

  // Pastel color for month chips (workType-coded, intentional)
  function getEventChipStyle(event) {
    const wt = String(event.workType || "").toLowerCase();
    if (wt === "fiber") return "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100";
    if (wt === "equipment") return "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100";
    return "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100";
  }

  // ── Month View ──────────────────────────────────────────────────────────────
  function renderMonthGrid(state, focusDate, filter) {
    const events = state.calendarEvents || [];
    const start = new Date(focusDate.getFullYear(), focusDate.getMonth(), 1);
    const end = new Date(focusDate.getFullYear(), focusDate.getMonth() + 1, 0);
    const startWeekday = start.getDay();
    const totalDays = end.getDate();
    const todayStr = toDateOnly(new Date());
    const cells = [];

    for (let i = 0; i < startWeekday; i++) {
      cells.push('<div class="min-h-[80px] md:min-h-[100px] rounded-xl" style="background:var(--surface-2)"></div>');
    }

    for (let day = 1; day <= totalDays; day++) {
      const current = new Date(focusDate.getFullYear(), focusDate.getMonth(), day);
      const dateStr = toDateOnly(current);
      const dayEvents = getEventsByDate(events, dateStr, filter).slice(0, 3);
      const today = dateStr === todayStr;

      cells.push(`
        <div class="min-h-[80px] md:min-h-[100px] rounded-xl p-1.5 cursor-pointer transition-all group"
             style="${today
               ? "border:1px solid #fdba74;background:rgba(249,115,22,.06)"
               : "border:1px solid var(--hair-soft);background:var(--surface)"}"
             data-calendar-action="pick-day" data-date="${dateStr}">
          <div class="flex items-center justify-between mb-1">
            <span class="text-[10px] md:text-xs font-bold uppercase hidden md:block" style="color:${today ? "#f97316" : "var(--ink-muted)"}">
              ${DAY_NAMES[current.getDay()]}
            </span>
            <span class="w-6 h-6 md:w-7 md:h-7 flex items-center justify-center rounded-full text-xs md:text-sm font-black"
              style="${today ? "background:#f97316;color:#fff" : "color:var(--ink)"}">
              ${day}
            </span>
          </div>
          <div class="space-y-0.5">
            ${dayEvents.map((event) => {
              const chipCls = getEventChipStyle(event);
              return `<button class="w-full text-left px-1.5 py-0.5 rounded-md border text-[9px] md:text-[10px] font-semibold truncate ${chipCls} transition-colors"
                        data-calendar-action="open-event" data-event-id="${event.id}">
                        <span class="opacity-60">${formatTime(event.startAt)}</span> ${event.incidentId}
                      </button>`;
            }).join("") || `<div class="text-[9px] px-1" style="color:var(--hair)">-</div>`}
            ${getEventsByDate(events, dateStr, filter).length > 3
              ? `<div class="text-[9px] font-semibold px-1" style="color:var(--ink-muted)">+${getEventsByDate(events, dateStr, filter).length - 3} more</div>`
              : ""}
          </div>
        </div>
      `);
    }

    return `
      <div class="grid grid-cols-7 gap-1 mb-1">
        ${DAY_NAMES.map((name, i) => {
          const todayDay = new Date().getDay() === i;
          return `<div class="text-center text-[9px] md:text-[10px] font-black uppercase py-1.5"
            style="color:${todayDay ? "#f97316" : "var(--ink-muted)"}">${name}</div>`;
        }).join("")}
      </div>
      <div class="grid grid-cols-7 gap-1">
        ${cells.join("")}
      </div>
    `;
  }

  // ── Week View ───────────────────────────────────────────────────────────────
  function renderWeekColumns(state, focusDate, filter) {
    const events = state.calendarEvents || [];
    const start = getWeekStart(focusDate);
    const todayStr = toDateOnly(new Date());
    const columns = [];

    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const dateStr = toDateOnly(day);
      const dayEvents = getEventsByDate(events, dateStr, filter);
      const today = dateStr === todayStr;

      columns.push(`
        <div class="flex-1 min-w-0">
          <!-- Column header -->
          <div class="flex flex-col items-center pb-3 mb-3" style="border-bottom:1px solid ${today ? "#fed7aa" : "var(--hair-soft)"}">
            <span class="text-[9px] md:text-[10px] font-black uppercase mb-1" style="color:${today ? "#fb923c" : "var(--ink-muted)"}">
              ${DAY_NAMES[day.getDay()]}
            </span>
            <span class="w-7 h-7 md:w-9 md:h-9 flex items-center justify-center rounded-full text-sm md:text-base font-black"
              style="${today ? "background:#f97316;color:#fff;box-shadow:0 2px 8px rgba(249,115,22,.3)" : "color:var(--ink)"}">
              ${day.getDate()}
            </span>
            ${dayEvents.length > 0
              ? `<span class="mt-1 text-[8px] font-bold px-1.5 py-0.5 rounded-full" style="${today ? "background:#fed7aa;color:#ea580c" : "background:var(--surface-2);color:var(--ink-muted)"}">${dayEvents.length}</span>`
              : '<span class="mt-1 h-4"></span>'}
          </div>

          <!-- Events -->
          <div class="space-y-2 px-0.5">
            ${dayEvents.length
              ? dayEvents.map((event) => {
                  const g = getEventGradient(event);
                  const node = event.node || event.incidentId || "-";
                  const title = event.title || event.workType || "Job";
                  const staff = event.onSiteStaff || event.subcontractors?.[0] || "";
                  return `
                    <button class="w-full text-left rounded-xl md:rounded-2xl p-2 md:p-3 ${g.bg} ${g.text} shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                            data-calendar-action="open-event" data-event-id="${event.id}">
                      <div class="text-[9px] md:text-[10px] font-bold opacity-80 mb-0.5">${formatTime(event.startAt)}</div>
                      <div class="text-[10px] md:text-xs font-black leading-snug truncate">${node}</div>
                      <div class="text-[9px] md:text-[10px] opacity-75 truncate mt-0.5">${title}</div>
                      ${staff ? `<div class="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ${g.pill} text-[8px] md:text-[9px] font-bold">
                        <i data-lucide="user" class="w-2.5 h-2.5 shrink-0"></i>${staff}
                      </div>` : ""}
                    </button>`;
                }).join("")
              : `<div class="text-center py-4 text-[10px] font-semibold" style="color:var(--hair)">—</div>`}
          </div>
        </div>
      `);
    }

    return `<div class="flex gap-2 md:gap-3 overflow-x-auto pb-2">${columns.join("")}</div>`;
  }

  // ── Day View ────────────────────────────────────────────────────────────────
  function renderDayList(state, focusDate, filter) {
    const events = state.calendarEvents || [];
    const dateStr = toDateOnly(focusDate);
    const dayEvents = getEventsByDate(events, dateStr, filter);
    const today = isToday(dateStr);

    return `
      <div class="space-y-2 min-h-[200px]">
        ${dayEvents.length
          ? dayEvents.map((event) => {
              const g = getEventGradient(event);
              const badgeCls = String(event.workType || "").toLowerCase() === "fiber"
                ? "bg-blue-100 text-blue-700"
                : String(event.workType || "").toLowerCase() === "equipment"
                ? "bg-amber-100 text-amber-700"
                : "bg-violet-100 text-violet-700";
              return `
                <button class="w-full text-left rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex"
                        style="background:var(--surface);border:1px solid var(--hair-soft)"
                        data-calendar-action="open-event" data-event-id="${event.id}">
                  <!-- Colored side bar -->
                  <div class="w-1.5 md:w-2 shrink-0 ${g.bg}"></div>
                  <!-- Content -->
                  <div class="flex-1 p-3 md:p-4">
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <div class="text-2xl md:text-3xl font-black leading-none" style="color:var(--ink)">${formatTime(event.startAt)}</div>
                        <div class="text-sm md:text-lg font-bold mt-1" style="color:var(--ink)">${event.title || "Interruption"}</div>
                        <div class="text-xs mt-0.5" style="color:var(--ink-muted)">${event.incidentId}</div>
                      </div>
                      <div class="flex flex-col items-end gap-1.5 shrink-0">
                        <span class="px-2 py-0.5 text-[10px] rounded-full ${badgeCls} font-bold">${event.workType || "General"}</span>
                        <span class="px-2 py-0.5 text-[10px] rounded-full font-bold ${
                          event.status === "COMPLETE" ? "bg-emerald-100 text-emerald-700"
                          : event.status === "CANCELLED" ? "bg-rose-100 text-rose-600"
                          : ""
                        }" style="${!(event.status === "COMPLETE" || event.status === "CANCELLED") ? "background:var(--surface-2);color:var(--ink-muted)" : ""}">${event.status || "PROCESS"}</span>
                      </div>
                    </div>
                    <div class="grid grid-cols-2 gap-1.5 mt-3 text-xs" style="color:var(--ink-muted)">
                      <div class="flex items-center gap-1.5"><i data-lucide="map-pin" class="w-3 h-3 shrink-0"></i><span class="truncate">${event.node || "-"}</span></div>
                      <div class="flex items-center gap-1.5"><i data-lucide="user" class="w-3 h-3 shrink-0"></i><span class="truncate">${event.onSiteStaff || "-"}</span></div>
                      <div class="flex items-center gap-1.5"><i data-lucide="user-check" class="w-3 h-3 shrink-0"></i><span class="truncate">${event.receiverStaff || "-"}</span></div>
                      <div class="flex items-center gap-1.5"><i data-lucide="phone" class="w-3 h-3 shrink-0"></i><span class="truncate">${event.contact || "-"}</span></div>
                    </div>
                  </div>
                </button>`;
            }).join("")
          : `<div class="flex flex-col items-center justify-center py-16" style="color:var(--ink-dim)">
               <i data-lucide="calendar-x" class="w-12 h-12 mb-3"></i>
               <div class="text-sm font-bold">No jobs ${today ? "today" : "on this day"}</div>
             </div>`}
      </div>
    `;
  }

  // ── Stats ───────────────────────────────────────────────────────────────────
  function renderStatCard(label, value, subtitle, accentColor) {
    const isEmpty = value === 0;
    const icons = { "Today": "calendar-check", "This Week": "calendar-days", "This Month": "bar-chart-2" };
    const iconName = icons[label] || "activity";
    const accent = accentColor || "#f97316";
    return `
      <div class="panel relative overflow-hidden hover:shadow-md transition-shadow" style="padding:0">
        <div class="absolute top-0 left-0 right-0 h-0.5" style="background:${isEmpty ? "var(--hair)" : accent}"></div>
        <div class="p-3 md:p-5 pt-4">
          <div class="flex items-start justify-between">
            <div>
              <div class="text-[9px] md:text-[10px] font-black uppercase tracking-widest" style="color:var(--ink-muted)">${label}</div>
              <div class="text-2xl md:text-4xl font-black mt-1" style="color:${isEmpty ? "var(--ink-dim)" : accent}">${value}</div>
              ${subtitle ? `<div class="text-[9px] mt-0.5 hidden md:block" style="color:var(--ink-muted)">${subtitle}</div>` : ""}
            </div>
            <div class="w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0" style="${isEmpty ? "background:var(--surface-2)" : `background:${accent}1a`}">
              <i data-lucide="${iconName}" class="w-4 h-4 md:w-5 md:h-5" style="color:${isEmpty ? "var(--ink-dim)" : accent}"></i>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ── Main render ─────────────────────────────────────────────────────────────
  function render(state) {
    const ui = state.ui || {};
    const mode = ui.calendarMode || "month";
    const focusDate = new Date(ui.calendarFocusDate || new Date().toISOString());
    const filter = ui.calendarFilter || "all";
    const shell = document.createElement("div");
    shell.className = "space-y-4";
    const stats = getCalendarOverviewStats(state, filter);

    let body = "";
    if (mode === "month") body = renderMonthGrid(state, focusDate, filter);
    if (mode === "week") body = renderWeekColumns(state, focusDate, filter);
    if (mode === "day") body = renderDayList(state, focusDate, filter);

    // Count events per type for filter chips
    const allEvents = (state.calendarEvents || []).filter(e => e.status !== "CANCELLED");
    const typeCount = {
      all: allEvents.length,
      fiber: allEvents.filter(e => String(e.workType||"").toLowerCase() === "fiber").length,
      equipment: allEvents.filter(e => String(e.workType||"").toLowerCase() === "equipment").length,
    };

    const chipColors = {
      all:       { active: "#f97316", bg: "#fff7ed", text: "#ea580c" },
      fiber:     { active: "#3b82f6", bg: "#eff6ff", text: "#2563eb" },
      equipment: { active: "#f59e0b", bg: "#fffbeb", text: "#d97706" },
    };

    function filterChip(key, label) {
      const c = chipColors[key];
      const isActive = filter === key;
      return `<button class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold transition-all whitespace-nowrap"
        style="${isActive
          ? `background:${c.active};color:#fff;box-shadow:0 1px 4px ${c.active}40`
          : `background:var(--surface-2);color:var(--ink-muted);border:1px solid var(--hair-soft)`}"
        data-calendar-action="set-filter" data-value="${key}">
        ${label}
        <span class="px-1.5 py-0.5 rounded-full text-[9px] font-black" style="${isActive ? "background:rgba(255,255,255,.25);color:#fff" : `background:${c.bg};color:${c.text}`}">${typeCount[key]}</span>
      </button>`;
    }

    shell.innerHTML = `
      <!-- Stats row -->
      <div class="grid grid-cols-3 gap-2 md:gap-4">
        ${renderStatCard("Today",      stats.today, "jobs scheduled",  "#f97316")}
        ${renderStatCard("This Week",  stats.week,  "jobs this week",  "#3b82f6")}
        ${renderStatCard("This Month", stats.month, "jobs this month", "#8b5cf6")}
      </div>

      <!-- Calendar panel -->
      <div class="panel overflow-hidden">

        <!-- Header bar -->
        <div class="px-4 py-3 md:px-6 md:py-4 flex flex-wrap items-center justify-between gap-3" style="border-bottom:1px solid var(--hair-soft);background:linear-gradient(to right,rgba(249,115,22,.04),var(--surface))">
          <!-- Nav -->
          <div class="flex items-center gap-1">
            <button class="w-8 h-8 flex items-center justify-center rounded-xl transition-all" style="color:var(--ink-muted)" onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background=''" data-calendar-action="prev">
              <i data-lucide="chevron-left" class="w-4 h-4 pointer-events-none"></i>
            </button>
            <h3 class="text-sm md:text-base font-black min-w-[110px] md:min-w-[200px] text-center px-2" style="color:var(--ink)">
              ${formatDateHeader(focusDate, mode)}
            </h3>
            <button class="w-8 h-8 flex items-center justify-center rounded-xl transition-all" style="color:var(--ink-muted)" onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background=''" data-calendar-action="next">
              <i data-lucide="chevron-right" class="w-4 h-4 pointer-events-none"></i>
            </button>
            <button class="ml-1 px-2.5 py-1 text-[10px] font-bold rounded-lg transition-colors hidden md:block" style="color:#f97316" data-calendar-action="today">
              Today
            </button>
          </div>

          <!-- Right controls -->
          <div class="flex items-center gap-2 flex-wrap">
            <button class="btn btn-accent flex items-center gap-1.5" data-calendar-action="open-create">
              <i data-lucide="plus" class="pointer-events-none"></i>New Job
            </button>
            <div class="flex p-0.5 rounded-xl" style="background:var(--surface-2)">
              <button class="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${mode === "month" ? "shadow-sm" : ""}"
                style="${mode === "month" ? "background:var(--surface);color:var(--ink)" : "background:transparent;color:var(--ink-muted)"}"
                data-calendar-action="set-mode" data-mode="month">Month</button>
              <button class="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${mode === "week" ? "shadow-sm" : ""}"
                style="${mode === "week" ? "background:var(--surface);color:var(--ink)" : "background:transparent;color:var(--ink-muted)"}"
                data-calendar-action="set-mode" data-mode="week">Week</button>
              <button class="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${mode === "day" ? "shadow-sm" : ""}"
                style="${mode === "day" ? "background:var(--surface);color:var(--ink)" : "background:transparent;color:var(--ink-muted)"}"
                data-calendar-action="set-mode" data-mode="day">Day</button>
            </div>
          </div>
        </div>

        <!-- Filter chips -->
        <div class="px-4 md:px-6 py-2.5 flex gap-2 flex-wrap" style="border-bottom:1px solid var(--hair-soft);background:var(--surface-2)">
          ${filterChip("all", "All types")}
          ${filterChip("fiber", "Fiber")}
          ${filterChip("equipment", "Equipment")}
        </div>

        <!-- Calendar body -->
        <div class="p-3 md:p-5">
          ${body}
        </div>
      </div>
    `;

    return shell;
  }

  // ── Stats helpers ───────────────────────────────────────────────────────────
  function toStartOfDay(date) {
    const d = new Date(date); d.setHours(0, 0, 0, 0); return d;
  }

  function getCalendarOverviewStats(state, filter) {
    const now = new Date();
    const todayStart = toStartOfDay(now);
    const nextDay = new Date(todayStart); nextDay.setDate(nextDay.getDate() + 1);
    const weekStart = getWeekStart(now);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const events = filterEvents(state.calendarEvents || [], filter).filter((event) => {
      if (event.status === "CANCELLED") return false;
      const startAt = new Date(event.startAt || event.createdAt || event.actionDate || 0);
      return !Number.isNaN(startAt.getTime());
    });

    let today = 0, week = 0, month = 0;
    events.forEach((event) => {
      const startAt = new Date(event.startAt || event.createdAt || event.actionDate);
      if (startAt >= todayStart && startAt < nextDay) today += 1;
      if (startAt >= weekStart && startAt < weekEnd) week += 1;
      if (startAt >= monthStart && startAt < monthEnd) month += 1;
    });

    return { today, week, month };
  }

  return { render, shiftDate, toDateOnly, formatTime, formatDate };
})();

window.CalendarUI = CalendarUI;
