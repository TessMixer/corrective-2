// scripts/ui/alert.monitor.ui.js

import { AlertService } from '../services/alert.service.js';
import { Store } from '../core/store.js';

/**
 * Main Render Function
 */
export function renderAlertMonitor() {
  const state = Store.getState();
  const alerts = state.alerts || [];

  const container = document.createElement('div');
  container.className = 'alert-monitor';

  container.appendChild(renderSummary(alerts));
  container.appendChild(renderFilterBar());
  container.appendChild(renderTable(alerts));

  bindEvents(container);

  return container;
}

/**
 * Summary Cards
 */
function renderSummary(alerts) {
  const wrapper = document.createElement('div');
  wrapper.className = 'alert-summary';

  const total = alerts.length;
  const open = alerts.filter(a => a.status === 'OPEN').length;
  const complete = alerts.filter(a => a.status === 'COMPLETE').length;
  const cancel = alerts.filter(a => a.status === 'CANCEL').length;

  wrapper.innerHTML = `
    <div class="card">
      <span>Total</span>
      <strong>${total}</strong>
    </div>
    <div class="card open">
      <span>Open</span>
      <strong>${open}</strong>
    </div>
    <div class="card complete">
      <span>Complete</span>
      <strong>${complete}</strong>
    </div>
    <div class="card cancel">
      <span>Cancel</span>
      <strong>${cancel}</strong>
    </div>
  `;

  return wrapper;
}

/**
 * Filter Bar
 */
function renderFilterBar() {
  const div = document.createElement('div');
  div.className = 'alert-filter';

  div.innerHTML = `
    <input type="text" placeholder="Search alert..." class="alert-search"/>
    <select class="alert-status-filter">
      <option value="">All Status</option>
      <option value="OPEN">Open</option>
      <option value="COMPLETE">Complete</option>
      <option value="CANCEL">Cancel</option>
    </select>
  `;

  return div;
}

/**
 * Alert Table
 */
function renderTable(alerts) {
  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'alert-table-wrapper';

  const table = document.createElement('table');
  table.className = 'alert-table';

  table.innerHTML = `
    <thead>
      <tr>
        <th>Job ID</th>
        <th>Title</th>
        <th>Priority</th>
        <th>Status</th>
        <th>Created</th>
        <th>Action</th>
      </tr>
    </thead>
    <tbody>
      ${alerts.map(a => `
        <tr>
          <td>${a.jobId}</td>
          <td>${a.title || '-'}</td>
          <td>
            <span class="priority ${a.priority?.toLowerCase()}">
              ${a.priority || '-'}
            </span>
          </td>
          <td>
            <span class="status ${a.status?.toLowerCase()}">
              ${a.status}
            </span>
          </td>
          <td>${a.createdAt || '-'}</td>
          <td>
            <button data-id="${a.jobId}" class="complete-btn">✓</button>
            <button data-id="${a.jobId}" class="cancel-btn">✕</button>
          </td>
        </tr>
      `).join('')}
    </tbody>
  `;

  tableWrapper.appendChild(table);
  return tableWrapper;
}

/**
 * Scoped Event Binding
 */
function bindEvents(container) {
  container.addEventListener('click', e => {
    if (e.target.classList.contains('complete-btn')) {
      const id = e.target.dataset.id;
      AlertService.completeAlert(id);
      refresh(container);
    }

    if (e.target.classList.contains('cancel-btn')) {
      const id = e.target.dataset.id;
      AlertService.cancelAlert(id);
      refresh(container);
    }
  });
}

/**
 * Re-render after state change
 */
function refresh(container) {
  const newView = renderAlertMonitor();
  container.replaceWith(newView);
}