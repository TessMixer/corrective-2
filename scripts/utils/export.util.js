// scripts/utils/export.util.js — CSV / Excel export helpers

const ExportUtil = (function () {

  function escapeCell(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    // Wrap in quotes if contains comma, newline, or quote
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function buildCSV(headers, rows) {
    const lines = [];
    lines.push(headers.map(escapeCell).join(','));
    rows.forEach(row => lines.push(row.map(escapeCell).join(',')));
    // BOM for Thai characters to display correctly in Excel
    return '\uFEFF' + lines.join('\r\n');
  }

  function downloadCSV(filename, csv) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  }

  function formatDt(value) {
    if (!value) return '-';
    try {
      return new Date(value).toLocaleString('th-TH', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      });
    } catch { return String(value); }
  }

  function getDurationText(startVal, endVal) {
    if (!startVal || !endVal) return '-';
    const ms = new Date(endVal).getTime() - new Date(startVal).getTime();
    if (isNaN(ms) || ms < 0) return '-';
    const h = Math.floor(ms / 3600000);
    const m = Math.round((ms % 3600000) / 60000);
    return h ? `${h}h ${m}m` : `${m}m`;
  }

  // ── Export: History (completed incidents) ────────────────────────────────

  function exportHistory(incidents, typeLabel) {
    const headers = [
      '#', 'Incident ID', 'Node', 'Alarm', 'Work Type',
      'Down Time', 'Finish Time', 'Duration', 'Cause', 'Method', 'Updates',
    ];

    const rows = incidents.map((inc, i) => {
      const downTime = inc.tickets?.[0]?.downTime || inc.downTime || inc.createdAt || '';
      const finishTime = inc.nsFinish?.times?.upTime || inc.completedAt || '';
      const cause = inc.nsFinish?.details?.cause || inc.cause || '-';
      const method = inc.nsFinish?.details?.method || inc.nsFinish?.details?.repairText || '-';
      return [
        i + 1,
        inc.incidentId || inc.incident || inc.id || '-',
        inc.node || '-',
        inc.alarm || '-',
        inc.workType || typeLabel,
        formatDt(downTime),
        formatDt(finishTime),
        getDurationText(downTime, finishTime),
        cause,
        method,
        (inc.updates || []).length,
      ];
    });

    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const csv = buildCSV(headers, rows);
    downloadCSV(`NOC_History_${typeLabel}_${stamp}.csv`, csv);
  }

  // ── Export: Active corrective jobs ───────────────────────────────────────

  function exportCorrective(incidents, typeLabel) {
    const headers = [
      '#', 'Incident ID', 'Node', 'Alarm', 'Work Type',
      'Status', 'Down Time', 'Elapsed', 'ETR', 'ETA', 'Tickets',
    ];

    const rows = incidents.map((inc, i) => {
      const downTime = inc.tickets?.[0]?.downTime || inc.downTime || inc.createdAt || '';
      const elapsed = getDurationText(downTime, new Date().toISOString());
      const updates = inc.updates || [];
      let etr = '-';
      for (let j = updates.length - 1; j >= 0; j--) {
        const u = updates[j];
        if (u.etrHour || u.etrMin) { etr = `${u.etrHour || 0}.${String(u.etrMin || '00').padStart(2,'0')} hrs`; break; }
        if (u.etr && u.etr !== '-') { etr = u.etr; break; }
      }
      return [
        i + 1,
        inc.incidentId || inc.incident || inc.id || '-',
        inc.node || '-',
        inc.alarm || '-',
        inc.workType || typeLabel,
        inc.status || '-',
        formatDt(downTime),
        elapsed,
        etr,
        inc.eta || '-',
        (inc.tickets || []).length,
      ];
    });

    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const csv = buildCSV(headers, rows);
    downloadCSV(`NOC_Active_${typeLabel}_${stamp}.csv`, csv);
  }

  // ── Export: Alerts ───────────────────────────────────────────────────────

  function exportAlerts(alerts) {
    const headers = [
      '#', 'Incident ID', 'Node', 'Alarm', 'Detail',
      'Alert Class', 'Status', 'Down Time', 'Tickets',
    ];

    const rows = alerts.map((a, i) => [
      i + 1,
      a.incidentId || a.incident || a.id || '-',
      a.node || '-',
      a.alarm || '-',
      a.detail || '-',
      a.alertClass || '-',
      a.status || '-',
      formatDt(a.tickets?.[0]?.downTime || a.createdAt),
      (a.tickets || []).length,
    ]);

    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const csv = buildCSV(headers, rows);
    downloadCSV(`NOC_Alerts_${stamp}.csv`, csv);
  }

  return { exportHistory, exportCorrective, exportAlerts };

})();

window.ExportUtil = ExportUtil;
