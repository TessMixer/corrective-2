// scripts/ui/history.ui.js

const HistoryUI = (function () {

  function renderTable(incidents) {
    const table = document.createElement('table');
    table.className = 'data-table';

    table.innerHTML = `
      <thead>
        <tr>
          <th>ID</th>
          <th>Type</th>
          <th>Severity</th>
          <th>Resolved At</th>
        </tr>
      </thead>
      <tbody>
        ${incidents.map(i => `
          <tr>
            <td>${i.id}</td>
            <td>${i.type}</td>
            <td>${i.severity}</td>
            <td>${i.timeline.resolvedAt || '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    `;

    return table;
  }

  function render(state) {
    const container = document.createElement('div');

    const closed = Selectors.getClosedIncidents(state);
    container.appendChild(renderTable(closed));

    return container;
  }

  return { render };

})();