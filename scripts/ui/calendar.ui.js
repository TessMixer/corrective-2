// scripts/ui/calendar.ui.js

const CalendarUI = (function () {
  const DAY_NAMES = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

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
    return d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" });
  }


  function formatDateHeader(date, mode) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "Calendar";

    if (mode === "month") {
      return d.toLocaleDateString("th-TH", { month: "long", year: "numeric" });
    }

    if (mode === "week") {
      const start = getWeekStart(d);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return `${start.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })} - ${end.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}`;
    }

    return d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
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
    if (mode === "month") {
      d.setMonth(d.getMonth() + direction);
      return d;
    }
    if (mode === "week") {
      d.setDate(d.getDate() + 7 * direction);
      return d;
    }
    d.setDate(d.getDate() + direction);
    return d;
  }

  function filterEvents(events, filter) {
    if (!filter || filter === "all") return events || [];
    return (events || []).filter((event) => String(event.workType || "").toLowerCase() === filter);
  }

  function getEventsByDate(events, dateStr, filter) {
    return filterEvents(events, filter).filter((event) => toDateOnly(event.startAt) === dateStr && event.status !== "CANCELLED");
  }

  function renderEventChip(event) {
    return `
      <button class="calendar-event-chip" data-calendar-action="open-event" data-event-id="${event.id}">
        ${formatTime(event.startAt)} ${event.incidentId}
      </button>
    `;
  }

  function renderMonthGrid(state, focusDate, filter) {
    const events = state.calendarEvents || [];
    const start = new Date(focusDate.getFullYear(), focusDate.getMonth(), 1);
    const end = new Date(focusDate.getFullYear(), focusDate.getMonth() + 1, 0);

    const startWeekday = start.getDay();
    const totalDays = end.getDate();
    const cells = [];

    for (let i = 0; i < startWeekday; i++) {
      cells.push('<div class="calendar-day-cell empty"></div>');
    }

    for (let day = 1; day <= totalDays; day++) {
      const current = new Date(focusDate.getFullYear(), focusDate.getMonth(), day);
      const dateStr = toDateOnly(current);
      const dayEvents = getEventsByDate(events, dateStr, filter).slice(0, 3);

      cells.push(`
        <div class="calendar-day-cell" data-calendar-action="pick-day" data-date="${dateStr}">
          <div class="calendar-day-number">${day}</div>
          <div class="space-y-1">
            ${dayEvents.map(renderEventChip).join("") || '<div class="text-[11px] text-slate-300">-</div>'}
          </div>
        </div>
      `);
    }

    return `
      <div class="calendar-weekday-row">
        ${DAY_NAMES.map((name) => `<div>${name}</div>`).join("")}
      </div>
      <div class="calendar-month-grid">
        ${cells.join("")}
      </div>
    `;
  }

  function renderWeekColumns(state, focusDate, filter) {
    const events = state.calendarEvents || [];
    const start = getWeekStart(focusDate);
    const columns = [];

    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const dateStr = toDateOnly(day);
      const dayEvents = getEventsByDate(events, dateStr, filter);

      columns.push(`
        <div class="calendar-week-col">
          <div class="calendar-week-col-header">${DAY_NAMES[day.getDay()]} ${day.getDate()}</div>
          <div class="space-y-2 mt-2">
            ${dayEvents.length
              ? dayEvents
                  .map(
                    (event) => `
                      <button class="calendar-week-event" data-calendar-action="open-event" data-event-id="${event.id}">
                        <div class="font-semibold">${formatTime(event.startAt)} ${event.incidentId}</div>
                        <div class="text-xs text-slate-500">${event.title || "-"}</div>
                      </button>
                    `
                  )
                  .join("")
              : '<div class="text-xs text-slate-300">ไม่มีงาน</div>'}
          </div>
        </div>
      `);
    }

    return `<div class="calendar-week-grid">${columns.join("")}</div>`;
  }

  function renderDayList(state, focusDate, filter) {
    const events = state.calendarEvents || [];
    const dateStr = toDateOnly(focusDate);
    const dayEvents = getEventsByDate(events, dateStr, filter);

    return `
      <div class="ops-panel p-4 space-y-3 min-h-[420px]">
        ${dayEvents.length
          ? dayEvents
              .map(
                (event) => `
                  <button class="calendar-day-event-card calendar-day-event-card-rich" data-calendar-action="open-event" data-event-id="${event.id}">
                    <div class="flex items-start justify-between gap-3">
                      <div>
                        <div class="text-3xl font-bold text-slate-800">${formatTime(event.startAt)}</div>
                        <div class="text-2xl font-semibold text-slate-900 mt-1">${event.title || "Interruption"}</div>
                        <div class="text-sm text-slate-500 mt-1">${event.incidentId}</div>
                      </div>
                      <span class="px-2 py-1 text-xs rounded-full bg-indigo-100 text-indigo-700">${event.status || "PROCESS"}</span>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4 text-slate-700 text-lg">
                      <div>👤 On site: ${event.onSiteStaff || "-"}</div>
                      <div>👤 รับเรื่อง: ${event.receiverStaff || "-"}</div>
                      <div>☎️ Contact: ${event.contact || "-"}</div>
                      <div>📅 วันที่: ${formatDate(event.startAt)}</div>
                    </div>
                  </button>
                `
              )
              .join("")
          : '<div class="text-slate-400 text-center py-10">ไม่มีงานในวันนี้</div>'}
      </div>
    `;
  }

  function render(state) {
    const ui = state.ui || {};
    const mode = ui.calendarMode || "month";
    const focusDate = new Date(ui.calendarFocusDate || new Date().toISOString());
    const filter = ui.calendarFilter || "all";
    const shell = document.createElement("div");
    shell.className = "space-y-4";

    let body = "";
    if (mode === "month") body = renderMonthGrid(state, focusDate, filter);
    if (mode === "week") body = renderWeekColumns(state, focusDate, filter);
    if (mode === "day") body = renderDayList(state, focusDate, filter);

    shell.innerHTML = `
      <div class="ops-panel p-4 md:p-6 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <button class="btn-action btn-action-primary" data-calendar-action="prev">◀</button>
            <h3 class="text-xl font-bold text-slate-800 min-w-[220px] text-center">${formatDateHeader(focusDate, mode)}</h3>
            <button class="btn-action btn-action-primary" data-calendar-action="next">▶</button>
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            <select class="px-3 py-2 rounded-lg border border-slate-200" data-calendar-action="set-filter">
              <option value="all" ${filter === "all" ? "selected" : ""}>งานทั้งหมด (All)</option>
              <option value="fiber" ${filter === "fiber" ? "selected" : ""}>Fiber</option>
              <option value="equipment" ${filter === "equipment" ? "selected" : ""}>Equipment</option>
              <option value="other" ${filter === "other" ? "selected" : ""}>Other</option>
            </select>
            <button class="btn-action ${mode === "month" ? "btn-action-purple" : "btn-action-primary"}" data-calendar-action="set-mode" data-mode="month">Month</button>
            <button class="btn-action ${mode === "week" ? "btn-action-purple" : "btn-action-primary"}" data-calendar-action="set-mode" data-mode="week">Week</button>
            <button class="btn-action ${mode === "day" ? "btn-action-purple" : "btn-action-primary"}" data-calendar-action="set-mode" data-mode="day">Day</button>
            <button class="btn-action btn-action-danger" data-calendar-action="open-create">Create</button>
          </div>
        </div>

        ${body}
      </div>
    `;

    return shell;
  }

  return { render, shiftDate, toDateOnly, formatTime, formatDate };
})();