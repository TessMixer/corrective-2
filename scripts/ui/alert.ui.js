// scripts/ui/alert.ui.js

const AlertUI = (function () {
  function normalizeIncidentId(incidentId) {
    if (!incidentId || typeof incidentId !== "string") return "-";

    const match = incidentId.match(/^(I\d{4})-(\d+)$/);
    if (!match) return incidentId;

    return `${match[1]}-${match[2].padStart(6, "0")}`;
  }

  function formatDateTime(dateValue) {
    if (!dateValue) return "-";

    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return dateValue;

    return parsed.toLocaleString("th-TH", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function renderTable(alerts) {
    const wrapper = document.createElement("div");
    wrapper.className = "ops-panel overflow-hidden";

    wrapper.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-sm corrective-table">
          <thead>
            <tr>
              <th>Incident Number</th>
              <th>Work Type</th>
              <th>Node Name</th>
              <th>Alarm</th>
              <th>Down Time</th>
              <th>Total Tickets</th>
              <th class="text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            ${alerts
              .map(
                (alert) => `
              <tr data-detail="${alert.incidentId}" class="cursor-pointer">
                <td class="font-bold text-orange-600">${normalizeIncidentId(alert.incidentId)}</td>
                <td>${alert.workType || "-"}</td>
                <td>${alert.node || "-"}</td>
                <td class="max-w-[380px] truncate" title="${alert.alarm || "-"}">${alert.alarm || "-"}</td>
                <td>${formatDateTime(alert.tickets?.[0]?.downTime)}</td>
                <td class="text-center">${alert.tickets ? alert.tickets.length : 0}</td>
                <td>
                  <div class="flex items-center justify-center gap-2">
                    <button class="btn-response btn-action btn-action-primary" data-id="${alert.incidentId}">Response</button>
                    <button class="btn-action btn-action-danger" data-cancel="${alert.incidentId}">Cancel</button>
                  </div>
                </td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    setTimeout(() => {
      wrapper.querySelectorAll("[data-cancel]").forEach((button) => {
        button.onclick = () => {
          AlertService.cancelAlert(button.dataset.cancel);
        };
      });

      wrapper.querySelectorAll("[data-detail]").forEach((row) => {
        row.onclick = (event) => {
          if (event.target.closest("button")) {
            return;
          }

          const alert = Store.getState().alerts.find((a) => a.incidentId === row.dataset.detail);
          if (!alert) return;

          const incident = {
            id: alert.incidentId,
            node: alert.node,
            alarm: alert.alarm || "Network Alert",
            detail: alert.detail || "No details available",
            nocBy: alert.nocBy || "System",
            downTime: alert.downTime || alert.actionDate,
            severity: alert.severity || "Medium",
            type: alert.type || "Network",
            status: alert.status === "PROCESS" ? "active" : "resolved",
            createdAt: alert.actionDate || new Date().toISOString(),
            tickets: alert.tickets && alert.tickets.length > 0 ? alert.tickets : getSampleTickets(alert.incidentId),
          };

          Store.dispatch((state) => ({
            ...state,
            ui: {
              ...state.ui,
              currentView: "alert-detail",
              selectedIncident: incident,
            },
          }));
        };
      });
    });

    return wrapper;
  }

  function render(state) {
    const container = document.createElement("div");
    container.className = "space-y-5";

    const alerts = state.alerts || [];

    if (!alerts.length) {
      container.innerHTML = `
        <div class="ops-panel p-12 text-center text-slate-400">
          ไม่มี Alert ในระบบ
        </div>
      `;
      return container;
    }

    container.appendChild(renderTable(alerts));
    return container;
  }

  function getSampleTickets() {
    const ticketCount = Math.floor(Math.random() * 3) + 1;
    const tickets = [];

    const companies = [
      "Symphony Communication Public Company Limited",
      "Pruksa Real Estate Public Company Limited",
      "ABC Corporation",
      "Another Customer Co., Ltd.",
      "Tech Solutions Ltd.",
    ];

    for (let i = 0; i < ticketCount; i++) {
      const baseTime = new Date();
      baseTime.setHours(baseTime.getHours() - Math.floor(Math.random() * 24));

      const downTime = baseTime.toISOString();
      const hasClear = Math.random() > 0.3;

      if (hasClear) {
        const clearTime = new Date(baseTime.getTime() + Math.random() * 3600000);
        tickets.push({
          ticket: `T${new Date().getFullYear().toString().slice(-2)}${String(Math.floor(Math.random() * 999) + 1).padStart(3, "0")}`,
          cid: `DI${Math.floor(Math.random() * 99999)}`,
          port: `GigabitEthernet0/5/${Math.floor(Math.random() * 10)}`,
          downTime,
          clearTime: clearTime.toISOString(),
          total: `${Math.floor((clearTime - baseTime) / 60000)} นาที`,
          pending: null,
          actualDowntime: `${Math.floor((clearTime - baseTime) / 60000)} นาที`,
          originate: companies[0],
          terminate: companies[Math.floor(Math.random() * companies.length) + 1],
        });
      } else {
        tickets.push({
          ticket: `T${new Date().getFullYear().toString().slice(-2)}${String(Math.floor(Math.random() * 999) + 1).padStart(3, "0")}`,
          cid: `DI${Math.floor(Math.random() * 99999)}`,
          port: `GigabitEthernet0/5/${Math.floor(Math.random() * 10)}`,
          downTime,
          clearTime: null,
          total: null,
          pending: "Waiting for ISP",
          actualDowntime: "รอดำเนินการ",
          originate: companies[0],
          terminate: companies[Math.floor(Math.random() * companies.length) + 1],
        });
      }
    }

    return tickets;
  }

  return { render };
})();