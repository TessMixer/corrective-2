// scripts/ui/calendar.ui.js

const CalendarUI = (function () {

  function renderCalendarGrid(state) {
    const grid = document.createElement('div');
    grid.className = 'calendar-grid';

    // ตัวอย่าง calendar 1–30 (mock)
    for (let day = 1; day <= 30; day++) {
      const cell = document.createElement('div');
      cell.className = 'day';

      const date = `2026-03-${String(day).padStart(2, '0')}`;
      const incidents = Selectors.getIncidentsByDate(state, date);

      if (incidents.length > 0) {
        cell.classList.add('has-event');
      }

      cell.innerHTML = `<strong>${day}</strong>`;

      cell.onclick = () => {
        Store.dispatch(s => ({
          ...s,
          ui: { ...s.ui, selectedDate: date }
        }));
      };

      grid.appendChild(cell);
    }

    return grid;
  }

  function renderIncidentList(state) {
    if (!state.ui.selectedDate) return document.createElement('div');

    const list = document.createElement('div');
    list.innerHTML = `<h4>Incidents on ${state.ui.selectedDate}</h4>`;

    const incidents = Selectors.getIncidentsByDate(state, state.ui.selectedDate);

    incidents.forEach(i => {
      const row = document.createElement('div');
      row.textContent = `${i.id} (${i.status})`;
      list.appendChild(row);
    });

    return list;
  }

  function render(state) {
    const container = document.createElement('div');

    container.appendChild(renderCalendarGrid(state));
    container.appendChild(renderIncidentList(state));

    return container;
  }

  return { render };

})();