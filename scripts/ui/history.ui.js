// scripts/ui/history.ui.js

const HistoryUI = (function () {
    const HISTORY_TYPES = [
    { key: "fiber", label: "Fiber" },
    { key: "equipment", label: "Equipment" },
    { key: "other", label: "Other" },
  ];
  const PAGE_SIZE = 10;

  function formatDateTime(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;

    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function getCompletedByType(state, typeKey) {
    return (state.corrective[typeKey] || [])
      .filter((item) => item.status === "COMPLETE")
      .sort((a, b) => {
        const aTime = new Date(a.completedAt || a.nsFinish?.times?.upTime || 0).getTime();
        const bTime = new Date(b.completedAt || b.nsFinish?.times?.upTime || 0).getTime();
        return bTime - aTime;
      });
  }

  function renderEmpty(typeLabel) {
    return `
        <div class="ops-panel p-10 text-center text-slate-400">
        ยังไม่มี Incident History ประเภท ${typeLabel}
      </div>
    `;
  }

  function renderCard(incident, typeLabel) {
    const finishedAt = incident.nsFinish?.times?.upTime || incident.completedAt || "-";
    const reason = incident.nsFinish?.details?.cause || incident.cause || "-";

    return `
      <article class="corrective-card">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h3 class="incident-title text-indigo-700">${incident.incidentId}</h3>
            <p class="incident-subtitle mt-1">${typeLabel} - ${incident.node || "-"}</p>
          </div>
          <span class="eta-badge bg-green-100 text-green-700">Closed</span>
        </div>

        <div class="corrective-grid mt-3">
          <div>
            <p class="corrective-label">Alarm</p>
            <p class="corrective-value alarm-text">${incident.alarm || "-"}</p>
          </div>
          <div>
            <p class="corrective-label">Cause</p>
            <p class="corrective-value">${reason}</p>
          </div>
          <div>
            <p class="corrective-label">Finished At</p>
            <p class="corrective-value">${formatDateTime(finishedAt)}</p>
          </div>
          <div>
            <p class="corrective-label">Updates</p>
            <p class="corrective-value metric-number">${(incident.updates || []).length}</p>
          </div>
        </div>

        <div class="corrective-footer">
          <div></div>
          <div class="flex gap-2">
            <button class="btn-action btn-action-purple btn-corrective-detail" data-id="${incident.incidentId}">View Detail</button>
            ${typeof window.renderReportButton === "function" ? window.renderReportButton(incident) : `<button class="btn-action btn-action-orange btn-corrective-report" data-id="${incident.incidentId}">Report</button>`}
          </div>
        </div>
      </article>
    `;
  }


  function renderTabs(activeTab) {
    return `
      <div class="flex flex-wrap gap-2">
        ${HISTORY_TYPES.map(
          (type) => `
            <button
              class="btn-history-tab px-4 py-2 rounded-lg text-sm font-semibold ${activeTab === type.key ? "bg-indigo-600 text-white" : "bg-white text-slate-700 border border-slate-200"}"
              data-history-tab="${type.key}">
              ${type.label}
            </button>
          `
        ).join("")}
      </div>
    `;
  }
  function renderPagination(totalItems, page) {
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

    return `
      <div class="flex items-center justify-between gap-3">
        <div class="text-sm text-slate-500">ทั้งหมด ${totalItems} งาน</div>
        <div class="flex items-center gap-2">
          <button class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm ${page <= 1 ? "opacity-40 cursor-not-allowed" : ""}" data-history-page="prev" ${page <= 1 ? "disabled" : ""}>ก่อนหน้า</button>
          <span class="text-sm text-slate-600">หน้า ${page} / ${totalPages}</span>
          <button class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm ${page >= totalPages ? "opacity-40 cursor-not-allowed" : ""}" data-history-page="next" ${page >= totalPages ? "disabled" : ""}>ถัดไป</button>
        </div>
      </div>
    `;
  }

  function render(state) {
    const container = document.createElement("div");
    container.className = "space-y-4";

    const activeTab = state.ui.activeHistoryTab || "fiber";
    const typeInfo = HISTORY_TYPES.find((item) => item.key === activeTab) || HISTORY_TYPES[0];
    const currentPage = Math.max(1, Number(state.ui.historyPage || 1));

    const allItems = getCompletedByType(state, typeInfo.key);
    const totalPages = Math.max(1, Math.ceil(allItems.length / PAGE_SIZE));
    const page = Math.min(currentPage, totalPages);

    const start = (page - 1) * PAGE_SIZE;
    const pageItems = allItems.slice(start, start + PAGE_SIZE);

    container.innerHTML = `
      ${renderTabs(typeInfo.key)}
      <div class="text-lg font-semibold text-slate-700">${typeInfo.label}</div>
      <div class="space-y-3">
        ${pageItems.length ? pageItems.map((item) => renderCard(item, typeInfo.label)).join("") : renderEmpty(typeInfo.label)}
      </div>
      ${renderPagination(allItems.length, page)}
    `;

    return container;
  }

  return { render };
})();