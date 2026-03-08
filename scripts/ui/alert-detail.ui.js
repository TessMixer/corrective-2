// scripts/ui/alert-detail.ui.js

const AlertDetailUI = (function () {
  function normalizeIncidentId(incidentId) {
    if (!incidentId || typeof incidentId !== "string") return "-";

    const match = incidentId.match(/^(I\d{4})-(\d+)$/);
    if (!match) return incidentId;

    return `${match[1]}-${match[2].padStart(6, "0")}`;
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return '-';

    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '-';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}`;
  }

  function getDurationMinutes(start, end) {
    if (!start) return null;

    const startDate = new Date(start);
    if (Number.isNaN(startDate.getTime())) return null;

    const endDate = end ? new Date(end) : new Date();
    if (Number.isNaN(endDate.getTime())) return null;

    const diff = Math.floor((endDate - startDate) / 60000);

    // กันค่าเวลาติดลบ (เช่น Down Time เป็นอนาคต)
    return Math.max(diff, 0);
  }

  function formatMinutes(totalMins) {
    if (totalMins === null || totalMins === undefined) return '-';

    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;

    if (hours > 0) {
      return `${hours} ชม. ${mins} นาที`;
    }

    return `${mins} นาที`;
  }

  function calculateDuration(start, end) {
    return formatMinutes(getDurationMinutes(start, end));
  }

  function getTicketNumber(ticket) {
    return ticket.symphonyTicket || ticket.ticket || '-';
  }

  function getStatusBadge(status) {
    const statusConfig = {
      active: { bg: 'bg-red-100', text: 'text-red-700', label: 'Active' },
      pending: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Pending' },
      resolved: { bg: 'bg-green-100', text: 'text-green-700', label: 'Resolved' },
      closed: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Closed' }
    };

    const config = statusConfig[status] || statusConfig.pending;
    return `<span class="${config.bg} ${config.text} px-3 py-1 rounded-full text-xs font-semibold">${config.label}</span>`;
  }

  function renderIncidentSummary(incident) {
    return `
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="bg-gradient-to-r from-slate-50 to-white px-6 py-4 border-b border-slate-100">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-4">
              <button id="btn-back-to-alert" class="p-2 hover:bg-slate-200 rounded-lg transition-colors" title="Back to Alert Monitor">
                <i data-lucide="arrow-left" class="w-5 h-5 text-slate-600"></i>
              </button>
              <div class="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                <i data-lucide="alert-triangle" class="w-6 h-6 text-indigo-600"></i>
              </div>
              <div>
                <h2 class="text-xl font-bold text-slate-800">Incident ${normalizeIncidentId(incident.id)}</h2>
                <p class="text-sm text-slate-500">${incident.alarm || 'Network Alert'}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              ${getStatusBadge(incident.status || 'active')}
              <button class="p-2 hover:bg-slate-100 rounded-lg transition-colors" title="Print">
                <i data-lucide="printer" class="w-5 h-5 text-slate-400"></i>
              </button>
              <button class="p-2 hover:bg-slate-100 rounded-lg transition-colors" title="Close">
                <i data-lucide="x" class="w-5 h-5 text-slate-400"></i>
              </button>
            </div>
          </div>
        </div>

        <div class="px-6 py-5">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Node</label>
              <div class="flex items-center gap-2">
                <i data-lucide="server" class="w-4 h-4 text-slate-400"></i>
                <span class="text-sm font-semibold text-slate-700">${incident.node || '-'}</span>
              </div>
            </div>

            <div class="space-y-1">
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">NOC Alert By</label>
              <div class="flex items-center gap-2">
                <div class="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                  ${(incident.nocBy || 'AN').substring(0, 2).toUpperCase()}
                </div>
                <span class="text-sm font-semibold text-slate-700">${incident.nocBy || 'Administrator'}</span>
              </div>
            </div>

            <div class="space-y-1">
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Created</label>
              <div class="flex items-center gap-2">
                <i data-lucide="calendar" class="w-4 h-4 text-slate-400"></i>
                <span class="text-sm font-semibold text-slate-700">${formatDateTime(incident.createdAt || incident.downTime)}</span>
              </div>
            </div>
          </div>

          <div class="mt-5 pt-5 border-t border-slate-100">
            <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Detail</label>
            <div class="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p class="text-sm text-slate-700 leading-relaxed">${incident.detail || 'No additional details available'}</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderTicketTable(incident) {
    const tickets = incident.tickets || [];
    const hasTickets = tickets.length > 0;

    return `
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 bg-orange-100 rounded-xl flex items-center justify-center">
                <i data-lucide="ticket" class="w-5 h-5 text-orange-600"></i>
              </div>
              <div>
                <h3 class="text-lg font-bold text-slate-800">Symphony Tickets</h3>
                <p class="text-xs text-slate-500">${tickets.length} ticket${tickets.length !== 1 ? 's' : ''} linked to this incident</p>
              </div>
            </div>
            <div class="text-right">
              <span class="text-xs text-slate-400">Total Downtime:</span>
              <span class="text-sm font-bold text-red-600">${calculateTotalDowntime(tickets)}</span>
            </div>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th class="px-4 py-3 text-left whitespace-nowrap bg-slate-100 sticky left-0 z-10 border-r border-slate-200">Symphony Ticket</th>
                <th class="px-4 py-3 text-left whitespace-nowrap">Symphony CID</th>
                <th class="px-4 py-3 text-left whitespace-nowrap">Port</th>
                <th class="px-4 py-3 text-left whitespace-nowrap">Down Time</th>
                <th class="px-4 py-3 text-left whitespace-nowrap">Clear Time</th>
                <th class="px-4 py-3 text-left whitespace-nowrap">Total</th>
                <th class="px-4 py-3 text-left whitespace-nowrap">Pending</th>
                <th class="px-4 py-3 text-left whitespace-nowrap">Actual Downtime</th>
                <th class="px-4 py-3 text-left whitespace-nowrap">Originate</th>
                <th class="px-4 py-3 text-left whitespace-nowrap">Terminate</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${hasTickets ? tickets.map((ticket, index) => renderTicketRow(ticket, index)).join('') : renderEmptyState()}
            </tbody>
            ${hasTickets ? `
              <tfoot>
                <tr class="bg-slate-50 border-t border-slate-200">
                  <td colspan="10" class="px-4 py-3 text-xs text-slate-500 text-right">
                    Showing ${tickets.length} ticket${tickets.length !== 1 ? 's' : ''}
                  </td>
                </tr>
              </tfoot>
            ` : ''}
          </table>
        </div>
      </div>
    `;
  }

  function renderTicketRow(ticket, index) {
    const isEven = index % 2 === 0;
    const rowClass = isEven ? 'bg-white' : 'bg-slate-50/50';

    const totalValue = ticket.total || calculateDuration(ticket.downTime, ticket.clearTime);
    const actualValue = ticket.actualDowntime || calculateDuration(ticket.downTime, ticket.clearTime);

    return `
      <tr class="${rowClass} hover:bg-indigo-50/50 transition-colors">
        <td class="px-4 py-3 whitespace-nowrap sticky left-0 ${rowClass} border-r border-slate-200 z-10">
          <div class="flex items-center gap-2">
            <span class="font-bold text-orange-600">${getTicketNumber(ticket)}</span>
            <button class="p-1 hover:bg-slate-200 rounded transition-colors" title="View Details">
              <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i>
            </button>
          </div>
        </td>
        <td class="px-4 py-3 whitespace-nowrap">
          <span class="text-sm font-medium text-slate-700">${ticket.cid || '-'}</span>
        </td>
        <td class="px-4 py-3 whitespace-nowrap">
          <code class="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600 font-mono">${ticket.port || '-'}</code>
        </td>
        <td class="px-4 py-3 whitespace-nowrap">
          <span class="text-sm text-slate-600">${formatDateTime(ticket.downTime)}</span>
        </td>
        <td class="px-4 py-3 whitespace-nowrap">
          ${ticket.clearTime
            ? `<span class="text-sm text-green-600">${formatDateTime(ticket.clearTime)}</span>`
            : '<span class="text-xs text-slate-400">-</span>'}
        </td>
        <td class="px-4 py-3 whitespace-nowrap">
          <span class="text-sm font-semibold text-slate-700">${totalValue}</span>
        </td>
        <td class="px-4 py-3 whitespace-nowrap">
          ${ticket.pending
            ? `<span class="text-sm text-orange-600">${ticket.pending}</span>`
            : '<span class="text-xs text-slate-400">-</span>'}
        </td>
        <td class="px-4 py-3 whitespace-nowrap">
          <span class="text-sm font-semibold text-red-600">${actualValue}</span>
        </td>
        <td class="px-4 py-3 whitespace-nowrap max-w-[200px]">
          <span class="text-sm text-slate-600 truncate block" title="${ticket.originate || ''}">${ticket.originate || '-'}</span>
        </td>
        <td class="px-4 py-3 whitespace-nowrap max-w-[200px]">
          <span class="text-sm text-slate-600 truncate block" title="${ticket.terminate || ''}">${ticket.terminate || '-'}</span>
        </td>
      </tr>
    `;
  }

  function renderEmptyState() {
    return `
      <tr>
        <td colspan="10" class="px-4 py-12 text-center">
          <div class="flex flex-col items-center gap-3">
            <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
              <i data-lucide="inbox" class="w-8 h-8 text-slate-300"></i>
            </div>
            <div>
              <p class="text-sm font-semibold text-slate-600">No Symphony Tickets Found</p>
              <p class="text-xs text-slate-400 mt-1">This incident has no linked Symphony tickets</p>
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  function calculateTotalDowntime(tickets) {
    if (!tickets || tickets.length === 0) return '-';

    const totalMins = tickets.reduce((sum, ticket) => {
      const mins = getDurationMinutes(ticket.downTime, ticket.clearTime);
      return sum + (mins || 0);
    }, 0);

    return formatMinutes(totalMins);
  }

  function render(incident) {
    const container = document.getElementById('view-alert-detail');
    if (!container) return;

    if (!incident) {
      container.innerHTML = `
        <div class="flex items-center justify-center h-96">
          <div class="text-center">
            <div class="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i data-lucide="alert-circle" class="w-10 h-10 text-slate-300"></i>
            </div>
            <p class="text-slate-500 font-medium">No incident data available</p>
          </div>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    container.innerHTML = `
      <div class="space-y-6">
        ${renderIncidentSummary(incident)}
        ${renderTicketTable(incident)}
      </div>
    `;

    lucide.createIcons();

    const backBtn = document.getElementById('btn-back-to-alert');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        Store.dispatch(state => ({
          ...state,
          ui: {
            ...state.ui,
            currentView: 'alert',
            selectedIncident: null
          }
        }));
      });
    }
  }

  return { render };
})();