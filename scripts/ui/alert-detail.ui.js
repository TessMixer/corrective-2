// scripts/ui/alert-detail.ui.js

const AlertDetailUI = (function () {
  function shouldHideResponse(incidentId, returnView) {
    // returnView is passed explicitly from the render loop (most reliable)
    // Falls back to reading Store only if not provided
    const view = returnView !== undefined
      ? returnView
      : (window.Store ? window.Store.getState()?.ui?.alertDetailReturnView : null);

    // WHITELIST: only show Response button when opened directly from Alert Monitor ("alert")
    // Any other known context → always hide
    if (view === "corrective" || view === "history") return true;

    // If opened from Alert Monitor explicitly → always show
    if (view === "alert") return false;

    // Unknown context (view is null/undefined) → check corrective store as fallback
    if (!window.Store) return false;
    const corrective = window.Store.getState()?.corrective || {};
    const id = String(incidentId || "").toLowerCase().replace(/^i/, "").replace(/-/g, "");
    if (!id) return false;

    return ["fiber", "equipment", "other"].some(tab =>
      (corrective[tab] || []).some(item => {
        const candidates = [
          item?.incident, item?.incidentId, item?.id,
          item?.tickets?.[0]?.symphonyTicket, item?.tickets?.[0]?.ticket,
        ];
        return candidates.some(c => {
          if (!c) return false;
          const k = String(c).toLowerCase().replace(/^i/, "").replace(/-/g, "");
          return k === id || k.endsWith(id) || id.endsWith(k);
        });
      })
    );
  }

  function normalizeIncidentId(incidentId) {
    if (!incidentId || typeof incidentId !== "string") return "-";

    const match = incidentId.match(/^(I\d{4})-(\d+)$/);
    if (!match) return incidentId;

    return `${match[1]}-${match[2].padStart(6, "0")}`;
  }

  function formatDateTime(dateStr) {
    return window.DateUtils ? window.DateUtils.formatDateTime(dateStr) : String(dateStr);
  }

  function getDurationMinutes(start, end) {
    return window.DateUtils ? window.DateUtils.getDurationMinutes(start, end) : null;
  }

  function formatMinutes(totalMins) {
    if (totalMins === null || totalMins === undefined) return '-';
    return window.DateUtils ? window.DateUtils.formatDuration(totalMins) : `${totalMins}m`;
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

  function renderIncidentSummary(incident, returnView) {
    return `
      <div class="bg-white rounded-xl md:rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="bg-gradient-to-r from-slate-50 to-white px-3 py-3 md:px-6 md:py-4 border-b border-slate-100">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-2 md:gap-4 min-w-0">
              <button id="btn-back-to-alert" class="p-1.5 md:p-2 hover:bg-slate-200 rounded-lg transition-colors shrink-0" title="Back to Alert Monitor">
                <i data-lucide="arrow-left" class="w-4 h-4 text-slate-600"></i>
              </button>
              <div class="w-8 h-8 md:w-12 md:h-12 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                <i data-lucide="alert-triangle" class="w-4 h-4 md:w-6 md:h-6 text-orange-600"></i>
              </div>
              <div class="min-w-0">
                <h2 class="text-base md:text-xl font-bold text-slate-800 truncate">Incident ${normalizeIncidentId(incident.id)}</h2>
                <p class="text-xs md:text-sm text-slate-500 truncate">${incident.alarm || 'Network Alert'}</p>
              </div>
            </div>
            ${shouldHideResponse(incident.id, returnView) ? `
              <span class="shrink-0 px-3 py-1.5 md:px-4 md:py-2 bg-emerald-100 text-emerald-700 rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <i data-lucide="check-circle-2" class="w-3 h-3 pointer-events-none"></i>
                Responded
              </span>` : `
              <button class="btn-response shrink-0 px-3 py-1.5 md:px-4 md:py-2 bg-zinc-900 hover:bg-black text-white rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-wider transition-colors shadow-sm flex items-center gap-1.5" data-id="${incident.id}">
                <i data-lucide="send" class="w-3 h-3 pointer-events-none"></i>
                Response
              </button>`}
          </div>
        </div>

        <div class="px-3 py-3 md:px-6 md:py-5">
          <div class="grid grid-cols-3 gap-2 md:gap-4">
            <div class="space-y-0.5">
              <label class="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Node</label>
              <div class="flex items-center gap-1.5">
                <i data-lucide="server" class="w-3 h-3 text-slate-400 shrink-0"></i>
                <span class="text-xs md:text-sm font-semibold text-slate-700 truncate">${incident.node || '-'}</span>
              </div>
            </div>

            <div class="space-y-0.5">
              <label class="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider">NOC Alert By</label>
              <div class="flex items-center gap-1.5">
                <div class="w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                  ${(incident.nocBy || 'AN').substring(0, 2).toUpperCase()}
                </div>
                <span class="text-xs md:text-sm font-semibold text-slate-700 truncate">${incident.nocBy || 'System'}</span>
              </div>
            </div>

            <div class="space-y-0.5">
              <label class="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Created</label>
              <div class="flex items-center gap-1.5">
                <i data-lucide="calendar" class="w-3 h-3 text-slate-400 shrink-0"></i>
                <span class="text-xs md:text-sm font-semibold text-slate-700">${formatDateTime(incident.createdAt || incident.downTime)}</span>
              </div>
            </div>
          </div>

          <div class="mt-3 pt-3 border-t border-slate-100">
            <label class="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Detail</label>
            <div class="mt-1.5 p-2 md:p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p class="text-xs md:text-sm text-slate-700 leading-relaxed">${incident.detail || 'No additional details available'}</p>
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
      <div class="bg-white rounded-xl md:rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="px-3 py-3 md:px-6 md:py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 md:gap-3">
              <div class="w-8 h-8 md:w-11 md:h-11 bg-orange-100 rounded-xl flex items-center justify-center shrink-0 shadow-sm shadow-orange-100">
                <i data-lucide="ticket" class="w-4 h-4 md:w-5 md:h-5 text-orange-600"></i>
              </div>
              <div>
                <h3 class="text-sm md:text-base font-bold text-slate-800">Symphony Tickets</h3>
                <p class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">${tickets.length} ticket${tickets.length !== 1 ? 's' : ''} linked</p>
              </div>
            </div>
            <div class="text-right">
              <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Total Downtime</span>
              <span class="px-3 py-1 bg-rose-50 text-rose-600 rounded-xl font-black text-xs md:text-sm border border-rose-100">${calculateTotalDowntime(tickets)}</span>
            </div>
          </div>
        </div>

        <!-- Mobile -->
        <div class="ticket-mobile-view" style="overflow-x:auto; -webkit-overflow-scrolling:touch;">
          <table style="border-collapse:collapse; font-size:7px; line-height:1.3;">
            <thead>
              <tr style="background:#f1f5f9; text-align:center; white-space:nowrap;">
                <th style="padding:3px 5px; border:1px solid #cbd5e1; font-weight:700; color:#475569;">Symphony Ticket</th>
                <th style="padding:3px 5px; border:1px solid #cbd5e1; font-weight:700; color:#475569;">Symphony CID</th>
                <th style="padding:3px 5px; border:1px solid #cbd5e1; font-weight:700; color:#475569;">Port</th>
                <th style="padding:3px 5px; border:1px solid #cbd5e1; font-weight:700; color:#475569;">Down Time</th>
                <th style="padding:3px 5px; border:1px solid #cbd5e1; font-weight:700; color:#475569;">Total</th>
                <th style="padding:3px 5px; border:1px solid #cbd5e1; font-weight:700; color:#475569;">Originate</th>
                <th style="padding:3px 5px; border:1px solid #cbd5e1; font-weight:700; color:#475569;">Terminate</th>
              </tr>
            </thead>
            <tbody>
              ${hasTickets ? tickets.map((ticket, index) => renderTicketRow(ticket, index)).join('') : `
                <tr><td colspan="7" style="padding:20px; text-align:center; color:#94a3b8;">No Symphony Tickets Found</td></tr>
              `}
            </tbody>
          </table>
        </div>
        <!-- Desktop -->
        <div class="ticket-desktop-view" style="overflow-x:auto;">
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="bg-gradient-to-r from-zinc-900 to-zinc-800 text-white font-bold uppercase text-[10px] tracking-wider">
                <th class="px-4 py-3 text-left whitespace-nowrap w-[130px] rounded-tl-none">#</th>
                <th class="px-4 py-3 text-left whitespace-nowrap w-[130px]">Symphony Ticket</th>
                <th class="px-4 py-3 text-left whitespace-nowrap w-[130px]">Symphony CID</th>
                <th class="px-4 py-3 text-left whitespace-nowrap">Port</th>
                <th class="px-4 py-3 text-left whitespace-nowrap">Down Time</th>
                <th class="px-4 py-3 text-left whitespace-nowrap">Total</th>
                <th class="px-4 py-3 text-left">Originate</th>
                <th class="px-4 py-3 text-left">Terminate</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${hasTickets ? tickets.map((ticket, index) => renderTicketRowDesktop(ticket, index)).join('') : `
                <tr><td colspan="8" class="px-4 py-10 text-center text-slate-400 text-sm">No Symphony Tickets Found</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderTicketRow(ticket, index) {
    const bg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
    const totalValue = ticket.total || calculateDuration(ticket.downTime, ticket.clearTime);
    const actualValue = ticket.actualDowntime || calculateDuration(ticket.downTime, ticket.clearTime);
    const td = 'padding:3px 5px; border:1px solid #e2e8f0; vertical-align:middle; text-align:center; white-space:nowrap;';

    return `
      <tr style="background:${bg};">
        <td style="${td} font-weight:700; color:#ea580c;">${getTicketNumber(ticket)}</td>
        <td style="${td} color:#334155;">${ticket.cid || '-'}</td>
        <td style="${td} color:#475569; white-space:normal; word-break:break-all; max-width:60px;">${ticket.port || '-'}</td>
        <td style="${td} color:#475569; white-space:normal; text-align:center;">${formatDateTime(ticket.downTime).replace(' ', '<br>')}</td>
        <td style="${td} color:#334155;">${totalValue}</td>
        <td style="${td} text-align:left; white-space:normal; word-break:break-word; max-width:110px; color:#475569;">${ticket.originate || '-'}</td>
        <td style="${td} text-align:left; white-space:normal; word-break:break-word; max-width:110px; color:#475569;">${ticket.terminate || '-'}</td>
      </tr>
    `;
  }

  function renderTicketRowDesktop(ticket, index) {
    const rowClass = index % 2 === 0 ? 'bg-white' : 'bg-slate-50/40';
    const totalValue = ticket.total || calculateDuration(ticket.downTime, ticket.clearTime);

    return `
      <tr class="${rowClass} hover:bg-orange-50/40 transition-colors duration-100 group">
        <td class="px-4 py-3 text-slate-400 font-bold text-[11px]">${index + 1}</td>
        <td class="px-4 py-3 font-black text-orange-600 group-hover:text-orange-500 break-words max-w-[130px] text-[12px]">${getTicketNumber(ticket)}</td>
        <td class="px-4 py-3 text-slate-700 font-semibold break-words max-w-[130px]">${ticket.cid || '-'}</td>
        <td class="px-4 py-3 text-slate-500 whitespace-nowrap text-[11px]">${ticket.port || '-'}</td>
        <td class="px-4 py-3 text-slate-600 whitespace-nowrap font-medium">${formatDateTime(ticket.downTime)}</td>
        <td class="px-4 py-3 whitespace-nowrap"><span class="px-2 py-0.5 bg-rose-50 text-rose-600 rounded-lg font-bold text-[11px] border border-rose-100">${totalValue}</span></td>
        <td class="px-4 py-3 text-slate-500 break-words max-w-[200px] text-[11px] leading-relaxed">${ticket.originate || '-'}</td>
        <td class="px-4 py-3 text-slate-500 break-words max-w-[200px] text-[11px] leading-relaxed">${ticket.terminate || '-'}</td>
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

  function render(incident, returnView) {
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
      return
    }

    container.innerHTML = `
      <div class="space-y-6">
        ${renderIncidentSummary(incident, returnView)}
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
            currentView: state.ui.alertDetailReturnView || 'alert',
            selectedIncident: null,
            selectedAlerts: null,
          }
        }));
      });
    }
  }

  function renderNodeTicketTable(tickets) {
    if (!tickets.length) {
      return '<p class="text-xs text-slate-400 py-2">ไม่มี Symphony Ticket</p>';
    }
    const thStyle = 'padding:3px 5px; border:1px solid #cbd5e1; font-weight:700; color:#475569; background:#f1f5f9;';
    const rows = tickets.map((ticket, i) => {
      const bg = i % 2 === 0 ? '#fff' : '#f8fafc';
      const td = 'padding:3px 5px; border:1px solid #e2e8f0; vertical-align:middle; text-align:center; white-space:nowrap;';
      const totalValue = ticket.total || calculateDuration(ticket.downTime, ticket.clearTime);
      return `
        <tr style="background:${bg};">
          <td style="${td} font-weight:700; color:#ea580c;">${ticket.symphonyTicket || ticket.ticket || '-'}</td>
          <td style="${td} color:#334155;">${ticket.cid || '-'}</td>
          <td style="${td} color:#475569; white-space:normal; word-break:break-all; max-width:80px;">${ticket.port || '-'}</td>
          <td style="${td} color:#475569; white-space:normal;">${formatDateTime(ticket.downTime).replace(' ', '<br>')}</td>
          <td style="${td} color:#334155;">${totalValue}</td>
          <td style="${td} text-align:left; white-space:normal; word-break:break-word; max-width:110px; color:#475569;">${ticket.originate || '-'}</td>
          <td style="${td} text-align:left; white-space:normal; word-break:break-word; max-width:110px; color:#475569;">${ticket.terminate || '-'}</td>
        </tr>`;
    }).join('');

    return `
      <div style="overflow-x:auto; -webkit-overflow-scrolling:touch;">
        <table style="border-collapse:collapse; font-size:7px; line-height:1.3; min-width:100%;">
          <thead>
            <tr>
              <th style="${thStyle} white-space:nowrap;">Symphony Ticket</th>
              <th style="${thStyle} white-space:nowrap;">Symphony CID</th>
              <th style="${thStyle} white-space:nowrap;">Port</th>
              <th style="${thStyle} white-space:nowrap;">Down Time</th>
              <th style="${thStyle} white-space:nowrap;">Total</th>
              <th style="${thStyle}">Originate</th>
              <th style="${thStyle}">Terminate</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderGrouped(alerts, returnView) {
    const container = document.getElementById('view-alert-detail');
    if (!container || !alerts.length) return;

    const first = alerts[0];
    const incidentId = first.incident || first.incidentId || first.id || '-';
    const alarm = first.alarm || first.title || 'Network Alert';
    const nocBy = first.nocBy || 'System';
    const createdAt = first.createdAt || first.actionDate || first.tickets?.[0]?.downTime;

    // Group by node
    const grouped = {};
    alerts.forEach(alert => {
      const node = alert.node || 'Unknown';
      if (!grouped[node]) grouped[node] = [];
      grouped[node].push(alert);
    });

    const nodesSections = Object.entries(grouped).map(([node, nodeAlerts]) => {
      const tickets = nodeAlerts.flatMap(a => a.tickets || []);
      return `
        <div class="bg-white rounded-xl md:rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div class="px-3 py-2 md:px-4 md:py-3 bg-slate-800 flex items-center gap-2">
            <i data-lucide="server" class="w-3.5 h-3.5 text-orange-400 shrink-0"></i>
            <span class="text-xs md:text-sm font-bold text-white">${node}</span>
            <span class="ml-auto text-[9px] font-bold text-slate-400 bg-slate-700 px-2 py-0.5 rounded-full">${tickets.length} ticket${tickets.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="p-2 md:p-3">
            ${renderNodeTicketTable(tickets)}
          </div>
        </div>`;
    }).join('');

    container.innerHTML = `
      <div class="space-y-3 md:space-y-4 fade-in">
        <div class="bg-white rounded-xl md:rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div class="bg-gradient-to-r from-slate-50 to-white px-3 py-3 md:px-6 md:py-4 border-b border-slate-100">
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-2 md:gap-4 min-w-0">
                <button id="btn-back-to-alert" class="p-1.5 md:p-2 hover:bg-slate-200 rounded-lg transition-colors shrink-0">
                  <i data-lucide="arrow-left" class="w-4 h-4 text-slate-600"></i>
                </button>
                <div class="w-8 h-8 md:w-12 md:h-12 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                  <i data-lucide="alert-triangle" class="w-4 h-4 md:w-6 md:h-6 text-orange-600"></i>
                </div>
                <div class="min-w-0">
                  <h2 class="text-base md:text-xl font-bold text-slate-800 truncate">Incident ${normalizeIncidentId(incidentId)}</h2>
                  <p class="text-xs md:text-sm text-slate-500 truncate">${alarm}</p>
                </div>
              </div>
              ${shouldHideResponse(incidentId, returnView) ? `
                <span class="shrink-0 px-3 py-1.5 md:px-4 md:py-2 bg-emerald-100 text-emerald-700 rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <i data-lucide="check-circle-2" class="w-3 h-3 pointer-events-none"></i>
                  Responded
                </span>` : `
                <button class="btn-response shrink-0 px-3 py-1.5 md:px-4 md:py-2 bg-zinc-900 hover:bg-black text-white rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-wider transition-colors shadow-sm flex items-center gap-1.5" data-id="${incidentId}">
                  <i data-lucide="send" class="w-3 h-3 pointer-events-none"></i>
                  Response
                </button>`}
            </div>
          </div>
          <div class="px-3 py-3 md:px-6 md:py-4">
            <div class="grid grid-cols-3 gap-2 md:gap-4">
              <div class="space-y-0.5">
                <label class="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nodes Affected</label>
                <div class="text-xs md:text-sm font-bold text-slate-700">${Object.keys(grouped).length} nodes</div>
              </div>
              <div class="space-y-0.5">
                <label class="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider">NOC Alert By</label>
                <div class="flex items-center gap-1.5">
                  <div class="w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0">${(nocBy).substring(0,2).toUpperCase()}</div>
                  <span class="text-xs md:text-sm font-semibold text-slate-700 truncate">${nocBy}</span>
                </div>
              </div>
              <div class="space-y-0.5">
                <label class="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Created</label>
                <div class="flex items-center gap-1.5">
                  <i data-lucide="calendar" class="w-3 h-3 text-slate-400 shrink-0"></i>
                  <span class="text-xs md:text-sm font-semibold text-slate-700">${formatDateTime(createdAt)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        ${nodesSections}
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
            currentView: state.ui.alertDetailReturnView || 'alert',
            selectedIncident: null,
            selectedAlerts: null,
          }
        }));
      });
    }
  }

  return { render, renderGrouped };
})();

window.AlertDetailUI = AlertDetailUI;
