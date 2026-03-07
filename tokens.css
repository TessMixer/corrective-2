// scripts/ui/recycle.ui.js

const RecycleUI = (function () {

  function renderTable(incidents) {
    const table = document.createElement('table');
    table.className = 'data-table';

    table.innerHTML = `
      <thead>
        <tr>
          <th>ID</th>
          <th>Type</th>
          <th>Restore</th>
        </tr>
      </thead>
      <tbody>
        ${incidents.map(i => `
          <tr>
            <td>${i.id}</td>
            <td>${i.type}</td>
            <td>
              <button data-id="${i.id}">Restore</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    `;

    table.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        IncidentService.restore(btn.dataset.id);
      };
    });

    return table;
  }

  function render(state) {
    const container = document.createElement('div');
    const deleted = Selectors.getRecycleBin(state);

    container.appendChild(renderTable(deleted));
    return container;
  }

  return { render };

})();