// scripts/ui/alert-detail.ui.js

const AlertDetailUI = (function () {
  function shouldHideResponse(incidentId, returnView) {
    const view = returnView !== undefined
      ? returnView
      : (window.Store ? window.Store.getState()?.ui?.alertDetailReturnView : null);
    if (view === "corrective" || view === "history") return true;
    if (view === "alert") return false;
    if (!window.Store) return false;
    const corrective = window.Store.getState()?.corrective || {};
    const id = String(incidentId || "").toLowerCase().replace(/^i/, "").replace(/-/g, "");
    if (!id) return false;
    return ["fiber", "equipment", "other"].some(tab =>
      (corrective[tab] || []).some(item => {
        const candidates = [item?.incident, item?.incidentId, item?.id, item?.tickets?.[0]?.symphonyTicket, item?.tickets?.[0]?.ticket];
        return candidates.some(c => {
          if (!c) return false;
          const k = String(c).toLowerCase().replace(/^i/, "").replace(/-/g, "");
          return k === id || k.endsWith(id) || id.endsWith(k);
        });
      })
    );
  }

  function normalizeIncidentId(id) {
    if (!id || typeof id !== "string") return "-";
    const match = id.match(/^(I\d{4})-(\d+)$/);
    if (!match) return id;
    return `${match[1]}-${match[2].padStart(6, "0")}`;
  }

  function formatDateTime(d) { return window.DateUtils ? window.DateUtils.formatDateTime(d) : String(d); }
  function getDurationMinutes(s, e) { return window.DateUtils ? window.DateUtils.getDurationMinutes(s, e) : null; }
  function formatMinutes(m) {
    if (m === null || m === undefined) return "-";
    return window.DateUtils ? window.DateUtils.formatDuration(m) : `${m}m`;
  }
  function calculateDuration(s, e) { return formatMinutes(getDurationMinutes(s, e)); }
  function getTicketNumber(ticket) { return ticket.symphonyTicket || ticket.ticket || "-"; }

  function renderIncidentSummary(incident, returnView) {
    const hideResp = shouldHideResponse(incident.id, returnView);
    return `
      <div class="panel">
        <div class="panel-head" style="background:var(--surface-2)">
          <button id="btn-back-to-alert" class="icon-btn" title="Back">
            <i data-lucide="arrow-left" class="w-4 h-4"></i>
          </button>
          <div style="width:40px;height:40px;background:var(--accent-soft);border-radius:10px;display:grid;place-items:center;flex-shrink:0">
            <i data-lucide="alert-triangle" style="width:20px;height:20px;color:var(--accent)"></i>
          </div>
          <div class="min-w-0 flex-1">
            <h2 style="margin:0;font-size:16px;font-weight:700;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              Incident ${normalizeIncidentId(incident.id)}
            </h2>
            <p style="margin:2px 0 0;font-size:12px;color:var(--ink-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${incident.alarm || "Network Alert"}</p>
          </div>
          ${hideResp
            ? `<span style="flex-shrink:0;display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:5px;background:#0d9488;color:#fff;font-size:10.5px;font-weight:700;letter-spacing:.02em"><i data-lucide="check-circle-2" class="w-3 h-3 pointer-events-none"></i> Responded</span>`
            : `<button class="btn-response btn btn-sm btn-action-purple" data-id="${incident.id}" style="flex-shrink:0;display:inline-flex;align-items:center;gap:6px">
                <i data-lucide="send" class="w-3 h-3 pointer-events-none"></i> Response
               </button>`
          }
        </div>
        <div class="panel-body">
          <div class="detail-meta">
            <div class="item">
              <div class="k">Node</div>
              <div class="v" style="display:flex;align-items:center;gap:6px">
                <i data-lucide="server" style="width:12px;height:12px;color:var(--ink-dim);flex-shrink:0"></i>
                <span>${incident.node || "-"}</span>
              </div>
            </div>
            <div class="item">
              <div class="k">NOC Alert By</div>
              <div class="v" style="display:flex;align-items:center;gap:6px">
                <div style="width:20px;height:20px;background:var(--accent);border-radius:999px;display:grid;place-items:center;color:#fff;font-weight:700;font-size:9px;flex-shrink:0">
                  ${(incident.nocBy || "AN").substring(0, 2).toUpperCase()}
                </div>
                <span>${incident.nocBy || "System"}</span>
              </div>
            </div>
            <div class="item">
              <div class="k">Created</div>
              <div class="v" style="display:flex;align-items:center;gap:6px">
                <i data-lucide="calendar" style="width:12px;height:12px;color:var(--ink-dim);flex-shrink:0"></i>
                <span>${formatDateTime(incident.createdAt || incident.downTime)}</span>
              </div>
            </div>
          </div>
          <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--hair)">
            <div class="form-label">Detail</div>
            <div style="margin-top:6px;padding:10px 14px;background:var(--surface-2);border-radius:8px;border:1px solid var(--hair);font-size:13px;color:var(--ink);line-height:1.6">
              ${incident.detail || "No additional details available"}
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
      <div class="panel">
        <div class="panel-head" style="background:var(--surface-2)">
          <div style="width:40px;height:40px;background:var(--accent-soft);border-radius:10px;display:grid;place-items:center;flex-shrink:0">
            <i data-lucide="ticket" style="width:18px;height:18px;color:var(--accent)"></i>
          </div>
          <div class="flex-1">
            <h3>Symphony Tickets</h3>
            <p class="hint">${tickets.length} ticket${tickets.length !== 1 ? "s" : ""} linked</p>
          </div>
          <div style="text-align:right">
            <span class="form-label" style="display:block;margin-bottom:2px">Total Downtime</span>
            <span class="tag dn" style="font-size:12px;padding:3px 10px">${calculateTotalDowntime(tickets)}</span>
          </div>
        </div>

        <!-- Mobile -->
        <div class="ticket-mobile-view" style="overflow-x:auto;-webkit-overflow-scrolling:touch">
          <table style="border-collapse:collapse;font-size:7px;line-height:1.3">
            <thead>
              <tr style="background:var(--surface-2);text-align:center;white-space:nowrap">
                <th style="padding:3px 5px;border:1px solid var(--hair);font-weight:700;color:var(--ink-muted)">Symphony Ticket</th>
                <th style="padding:3px 5px;border:1px solid var(--hair);font-weight:700;color:var(--ink-muted)">Symphony CID</th>
                <th style="padding:3px 5px;border:1px solid var(--hair);font-weight:700;color:var(--ink-muted)">Port</th>
                <th style="padding:3px 5px;border:1px solid var(--hair);font-weight:700;color:var(--ink-muted)">Down Time</th>
                <th style="padding:3px 5px;border:1px solid var(--hair);font-weight:700;color:var(--ink-muted)">Total</th>
                <th style="padding:3px 5px;border:1px solid var(--hair);font-weight:700;color:var(--ink-muted)">Originate</th>
                <th style="padding:3px 5px;border:1px solid var(--hair);font-weight:700;color:var(--ink-muted)">Terminate</th>
              </tr>
            </thead>
            <tbody>
              ${hasTickets ? tickets.map((t, i) => renderTicketRow(t, i)).join("") : `<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--ink-dim)">No Symphony Tickets Found</td></tr>`}
            </tbody>
          </table>
        </div>

        <!-- Desktop -->
        <div class="ticket-desktop-view" style="overflow-x:auto">
          <table class="w-full text-xs" style="border-collapse:collapse">
            <thead>
              <tr style="background:var(--sb-bg);color:var(--sb-ink-active);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.06em">
                <th class="px-4 py-3" style="text-align:left;white-space:nowrap">#</th>
                <th class="px-4 py-3" style="text-align:left;white-space:nowrap">Symphony Ticket</th>
                <th class="px-4 py-3" style="text-align:left;white-space:nowrap">Symphony CID</th>
                <th class="px-4 py-3" style="text-align:left;white-space:nowrap">Port</th>
                <th class="px-4 py-3" style="text-align:left;white-space:nowrap">Down Time</th>
                <th class="px-4 py-3" style="text-align:left;white-space:nowrap">Total</th>
                <th class="px-4 py-3" style="text-align:left">Originate</th>
                <th class="px-4 py-3" style="text-align:left">Terminate</th>
              </tr>
            </thead>
            <tbody>
              ${hasTickets ? tickets.map((t, i) => renderTicketRowDesktop(t, i)).join("")
                : `<tr><td colspan="8" class="px-4 py-10 text-center" style="color:var(--ink-dim)">No Symphony Tickets Found</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderTicketRow(ticket, index) {
    const bg = index % 2 === 0 ? "var(--surface)" : "var(--surface-2)";
    const totalValue = ticket.total || calculateDuration(ticket.downTime, ticket.clearTime);
    const td = `padding:3px 5px;border:1px solid var(--hair-soft);vertical-align:middle;text-align:center;white-space:nowrap;color:var(--ink)`;
    return `
      <tr style="background:${bg}">
        <td style="${td};font-weight:700;color:var(--accent)">${getTicketNumber(ticket)}</td>
        <td style="${td}">${ticket.cid || "-"}</td>
        <td style="${td};white-space:normal;word-break:break-all;max-width:60px">${ticket.port || "-"}</td>
        <td style="${td};white-space:normal;text-align:center;color:var(--ink-muted)">${formatDateTime(ticket.downTime).replace(" ", "<br>")}</td>
        <td style="${td}">${totalValue}</td>
        <td style="${td};text-align:left;white-space:normal;word-break:break-word;max-width:110px;color:var(--ink-muted)">${ticket.originate || "-"}</td>
        <td style="${td};text-align:left;white-space:normal;word-break:break-word;max-width:110px;color:var(--ink-muted)">${ticket.terminate || "-"}</td>
      </tr>
    `;
  }

  function renderTicketRowDesktop(ticket, index) {
    const bg = index % 2 === 0 ? "var(--surface)" : "var(--surface-2)";
    const totalValue = ticket.total || calculateDuration(ticket.downTime, ticket.clearTime);
    return `
      <tr style="background:${bg};border-bottom:1px solid var(--hair-soft)">
        <td class="px-4 py-3" style="color:var(--ink-dim);font-weight:700;font-size:11px">${index + 1}</td>
        <td class="px-4 py-3" style="font-weight:900;color:var(--accent);font-size:12px;word-break:break-word;max-width:130px">${getTicketNumber(ticket)}</td>
        <td class="px-4 py-3" style="color:var(--ink);font-weight:600;word-break:break-word;max-width:130px">${ticket.cid || "-"}</td>
        <td class="px-4 py-3" style="color:var(--ink-muted);white-space:nowrap;font-size:11px">${ticket.port || "-"}</td>
        <td class="px-4 py-3" style="color:var(--ink-muted);white-space:nowrap;font-weight:500">${formatDateTime(ticket.downTime)}</td>
        <td class="px-4 py-3" style="white-space:nowrap"><span class="tag dn" style="font-size:11px">${totalValue}</span></td>
        <td class="px-4 py-3" style="color:var(--ink-muted);word-break:break-word;max-width:200px;font-size:11px;line-height:1.5">${ticket.originate || "-"}</td>
        <td class="px-4 py-3" style="color:var(--ink-muted);word-break:break-word;max-width:200px;font-size:11px;line-height:1.5">${ticket.terminate || "-"}</td>
      </tr>
    `;
  }

  function calculateTotalDowntime(tickets) {
    if (!tickets || !tickets.length) return "-";
    const totalMins = tickets.reduce((sum, t) => sum + (getDurationMinutes(t.downTime, t.clearTime) || 0), 0);
    return formatMinutes(totalMins);
  }

  function render(incident, returnView) {
    const container = document.getElementById("view-alert-detail");
    if (!container) return;

    if (!incident) {
      container.innerHTML = `
        <div class="empty" style="height:320px;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <div style="width:72px;height:72px;border-radius:999px;background:var(--surface-2);display:grid;place-items:center;margin-bottom:16px">
            <i data-lucide="alert-circle" style="width:36px;height:36px;color:var(--ink-dim)"></i>
          </div>
          <p>No incident data available</p>
        </div>`;
      lucide.createIcons(); return;
    }

    container.innerHTML = `
      <div class="space-y-6">
        ${renderIncidentSummary(incident, returnView)}
        ${renderTicketTable(incident)}
      </div>
    `;
    lucide.createIcons();

    document.getElementById("btn-back-to-alert")?.addEventListener("click", () => {
      Store.dispatch(state => ({
        ...state,
        ui: { ...state.ui, currentView: state.ui.alertDetailReturnView || "alert", selectedIncident: null, selectedAlerts: null }
      }));
    });
  }

  function renderNodeTicketTable(tickets) {
    if (!tickets.length) return `<p style="font-size:12px;color:var(--ink-dim);padding:8px 0">ไม่มี Symphony Ticket</p>`;
    const thStyle = `padding:3px 5px;border:1px solid var(--hair);font-weight:700;color:var(--ink-muted);background:var(--surface-2)`;
    const rows = tickets.map((ticket, i) => {
      const bg = i % 2 === 0 ? "var(--surface)" : "var(--surface-2)";
      const td = `padding:3px 5px;border:1px solid var(--hair-soft);vertical-align:middle;text-align:center;white-space:nowrap;color:var(--ink)`;
      const totalValue = ticket.total || calculateDuration(ticket.downTime, ticket.clearTime);
      return `
        <tr style="background:${bg}">
          <td style="${td};font-weight:700;color:var(--accent)">${ticket.symphonyTicket || ticket.ticket || "-"}</td>
          <td style="${td}">${ticket.cid || "-"}</td>
          <td style="${td};white-space:normal;word-break:break-all;max-width:80px">${ticket.port || "-"}</td>
          <td style="${td};white-space:normal;color:var(--ink-muted)">${formatDateTime(ticket.downTime).replace(" ", "<br>")}</td>
          <td style="${td}">${totalValue}</td>
          <td style="${td};text-align:left;white-space:normal;word-break:break-word;max-width:110px;color:var(--ink-muted)">${ticket.originate || "-"}</td>
          <td style="${td};text-align:left;white-space:normal;word-break:break-word;max-width:110px;color:var(--ink-muted)">${ticket.terminate || "-"}</td>
        </tr>`;
    }).join("");
    return `
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
        <table style="border-collapse:collapse;font-size:7px;line-height:1.3;min-width:100%">
          <thead>
            <tr>
              <th style="${thStyle};white-space:nowrap">Symphony Ticket</th>
              <th style="${thStyle};white-space:nowrap">Symphony CID</th>
              <th style="${thStyle};white-space:nowrap">Port</th>
              <th style="${thStyle};white-space:nowrap">Down Time</th>
              <th style="${thStyle};white-space:nowrap">Total</th>
              <th style="${thStyle}">Originate</th>
              <th style="${thStyle}">Terminate</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderGrouped(alerts, returnView) {
    const container = document.getElementById("view-alert-detail");
    if (!container || !alerts.length) return;

    const first = alerts[0];
    const incidentId = first.incident || first.incidentId || first.id || "-";
    const alarm = first.alarm || "Network Alert";
    const nocBy = first.nocBy || "System";
    const createdAt = first.createdAt || first.actionDate || first.tickets?.[0]?.downTime;
    const hideResp = shouldHideResponse(incidentId, returnView);

    const grouped = {};
    alerts.forEach(alert => {
      const node = alert.node || "Unknown";
      if (!grouped[node]) grouped[node] = [];
      grouped[node].push(alert);
    });

    const nodesSections = Object.entries(grouped).map(([node, nodeAlerts]) => {
      const tickets = nodeAlerts.flatMap(a => a.tickets || []);
      return `
        <div class="panel">
          <div class="panel-head" style="background:var(--sb-bg)">
            <i data-lucide="server" style="width:14px;height:14px;color:var(--accent);flex-shrink:0"></i>
            <span style="font-size:13px;font-weight:700;color:var(--sb-ink-active)">${node}</span>
            <span class="tag" style="margin-left:auto;font-size:9px">${tickets.length} ticket${tickets.length !== 1 ? "s" : ""}</span>
          </div>
          <div class="panel-body">
            ${renderNodeTicketTable(tickets)}
          </div>
        </div>`;
    }).join("");

    container.innerHTML = `
      <div class="space-y-4 fade-in">
        <div class="panel">
          <div class="panel-head" style="background:var(--surface-2)">
            <button id="btn-back-to-alert" class="icon-btn">
              <i data-lucide="arrow-left" class="w-4 h-4"></i>
            </button>
            <div style="width:40px;height:40px;background:var(--accent-soft);border-radius:10px;display:grid;place-items:center;flex-shrink:0">
              <i data-lucide="alert-triangle" style="width:18px;height:18px;color:var(--accent)"></i>
            </div>
            <div class="min-w-0 flex-1">
              <h2 style="margin:0;font-size:16px;font-weight:700;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Incident ${normalizeIncidentId(incidentId)}</h2>
              <p style="margin:2px 0 0;font-size:12px;color:var(--ink-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${alarm}</p>
            </div>
            ${hideResp
              ? `<span style="flex-shrink:0;display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:5px;background:#0d9488;color:#fff;font-size:10.5px;font-weight:700;letter-spacing:.02em"><i data-lucide="check-circle-2" class="w-3 h-3 pointer-events-none"></i> Responded</span>`
              : `<button class="btn-response btn btn-sm btn-action-purple" data-id="${incidentId}" style="flex-shrink:0;display:inline-flex;align-items:center;gap:6px">
                  <i data-lucide="send" class="w-3 h-3 pointer-events-none"></i> Response
                 </button>`
            }
          </div>
          <div class="panel-body">
            <div class="detail-meta">
              <div class="item">
                <div class="k">Nodes Affected</div>
                <div class="v">${Object.keys(grouped).length} nodes</div>
              </div>
              <div class="item">
                <div class="k">NOC Alert By</div>
                <div class="v" style="display:flex;align-items:center;gap:6px">
                  <div style="width:20px;height:20px;background:var(--accent);border-radius:999px;display:grid;place-items:center;color:#fff;font-weight:700;font-size:9px;flex-shrink:0">${(nocBy).substring(0,2).toUpperCase()}</div>
                  <span>${nocBy}</span>
                </div>
              </div>
              <div class="item">
                <div class="k">Created</div>
                <div class="v" style="display:flex;align-items:center;gap:6px">
                  <i data-lucide="calendar" style="width:12px;height:12px;color:var(--ink-dim);flex-shrink:0"></i>
                  <span>${formatDateTime(createdAt)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        ${nodesSections}
      </div>
    `;

    lucide.createIcons();

    document.getElementById("btn-back-to-alert")?.addEventListener("click", () => {
      Store.dispatch(state => ({
        ...state,
        ui: { ...state.ui, currentView: state.ui.alertDetailReturnView || "alert", selectedIncident: null, selectedAlerts: null }
      }));
    });
  }

  return { render, renderGrouped };
})();

window.AlertDetailUI = AlertDetailUI;
