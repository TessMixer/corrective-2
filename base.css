// scripts/ui/dashboard.ui.js

const DashboardUI = (function () {

  function renderKPI(title, value) {
    const card = document.createElement('div');
    card.className = 'kpi-card';

    card.innerHTML = `
      <div class="kpi-title">${title}</div>
      <div class="kpi-value">${value}</div>
    `;

    return card;
  }

  function renderTable(incidents) {
    const table = document.createElement('table');
    table.className = 'data-table';

    table.innerHTML = `
      <thead>
        <tr>
          <th>ID</th>
          <th>Type</th>
          <th>Status</th>
          <th>Severity</th>
        </tr>
      </thead>
      <tbody>
        ${incidents.map(i => `
          <tr>
            <td>${i.id}</td>
            <td>${i.type}</td>
            <td>
            ${i.status}
            ${isOverResponseSLA(i) ? '<span style="color:red;">(Over SLA)</span>' : ''}
            </td>
            <td>${i.severity}</td>
          </tr>
        `).join('')}
      </tbody>
    `;

    return table;
  }

  function render(state) {
    const container = document.createElement('div');

    // ===== KPI Section =====
    const kpiRow = document.createElement('div');
    kpiRow.style.display = 'grid';
    kpiRow.style.gridTemplateColumns = 'repeat(4, 1fr)';
    kpiRow.style.gap = '16px';

    const all = Selectors.getAllIncidents(state);
    const active = Selectors.getActiveIncidents(state);
    const closed = Selectors.getClosedIncidents(state);

    kpiRow.appendChild(renderKPI('Total', all.length));
    kpiRow.appendChild(renderKPI('Active', active.length));
    kpiRow.appendChild(renderKPI('Closed', closed.length));
    kpiRow.appendChild(renderKPI('Critical',
      active.filter(i => i.severity === 'critical').length
    ));

    // ===== Table Section =====
    const tableSection = document.createElement('div');
    tableSection.style.marginTop = '24px';
    tableSection.appendChild(renderTable(active));

    container.appendChild(kpiRow);
    container.appendChild(tableSection);

    return container;
  }

  return {
    render
  };

})();