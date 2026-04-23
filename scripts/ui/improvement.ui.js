/* improvement.ui.js — CID-based Improvement tracking */

(function () {
  const STORAGE_KEY = "noc-improvements";
  const TRIGGER_COUNT = 3; // more than N in one month

  // ── Helpers ──────────────────────────────────────────────────────────────

  function loadNotes() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
  }
  function saveNotes(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function fmtDate(v) {
    if (!v) return "-";
    try {
      return new Date(v).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
    } catch { return v; }
  }

  function fmtDateShort(v) {
    if (!v) return "-";
    try { return new Date(v).toLocaleDateString("th-TH", { dateStyle: "short" }); } catch { return v; }
  }

  function durationMs(inc) {
    const down = inc.nsFinish?.times?.downTime || inc.createdAt || inc.downTime || "";
    const up   = inc.nsFinish?.times?.upTime   || inc.completedAt || "";
    if (!down || !up) return null;
    const ms = new Date(up).getTime() - new Date(down).getTime();
    return ms > 0 ? ms : null;
  }

  function fmtDuration(ms) {
    if (!ms) return "-";
    const h = Math.floor(ms / 3600000);
    const m = Math.round((ms % 3600000) / 60000);
    return h ? `${h} ชม. ${m} นาที` : `${m} นาที`;
  }

  function getMonthKey(inc) {
    const d = inc.completedAt || inc.createdAt || "";
    if (!d) return "unknown";
    try { return d.substring(0, 7); } catch { return "unknown"; }
  }

  function getCause(inc) {
    return inc.nsFinish?.details?.cause
      || (inc.updates || []).slice(-1)[0]?.cause
      || inc.cause
      || "-";
  }

  function getCustomer(inc) {
    const t = (inc.tickets || [])[0] || {};
    const orig = String(t.originate || "").trim();
    const term = String(t.terminate || "").trim();
    if (orig && term && orig !== term) return `${orig} – ${term}`;
    return orig || term || "-";
  }

  // ── Manual groups (added from Global Search) ──────────────────────────────

  const MANUAL_KEY = "noc-improvement-manual";

  function loadManualGroups() {
    try { return JSON.parse(localStorage.getItem(MANUAL_KEY) || "{}"); } catch { return {}; }
  }
  function saveManualGroups(data) { localStorage.setItem(MANUAL_KEY, JSON.stringify(data)); }

  const HOTSPOT_IMP_KEY = 'noc-hotspot-improvements';
  function loadHotspotImps() {
    try { return JSON.parse(localStorage.getItem(HOTSPOT_IMP_KEY) || '{}'); } catch { return {}; }
  }
  function deleteHotspotImp(key) {
    const data = loadHotspotImps();
    delete data[key];
    localStorage.setItem(HOTSPOT_IMP_KEY, JSON.stringify(data));
  }
  function finishHotspotImp(key) {
    const data = loadHotspotImps();
    if (data[key]) {
      data[key].status = 'finished';
      data[key].finishedAt = new Date().toISOString();
      localStorage.setItem(HOTSPOT_IMP_KEY, JSON.stringify(data));
    }
  }

  function removeManualGroup(cid) {
    const data = loadManualGroups();
    delete data[cid];
    saveManualGroups(data);
  }

  // ── Finish / Reopen CID group ─────────────────────────────────────────────

  function finishGroup(cid) {
    const notes = loadNotes();
    if (!notes[cid]) notes[cid] = { items: [] };
    notes[cid].status = 'finished';
    notes[cid].finishedAt = new Date().toISOString();
    saveNotes(notes);
    render();
  }

  function reopenGroup(cid) {
    const notes = loadNotes();
    if (!notes[cid]) return;
    delete notes[cid].status;
    delete notes[cid].finishedAt;
    saveNotes(notes);
    render();
  }

  function buildManualGroups() {
    const state = Store.getState();
    const allItems = [
      ...(state.alerts || []),
      ...(state.corrective?.fiber || []),
      ...(state.corrective?.equipment || []),
      ...(state.corrective?.other || []),
    ];
    const manualData = loadManualGroups();
    return Object.values(manualData).map(entry => {
      const incidents = entry.incidentIds.map(id => {
        return allItems.find(i => String(i.incidentId || i.incident || i.id || "").split("__")[0].toLowerCase() === id.toLowerCase());
      }).filter(Boolean);
      return {
        cid: entry.cid,
        customer: getCustomer(incidents[0] || {}),
        incidents,
        monthCounts: {},
        worstMonth: null,
        isManual: true,
        addedAt: entry.addedAt,
      };
    }).filter(g => g.incidents.length > 0);
  }

  // ── Core computation ──────────────────────────────────────────────────────

  function computeImprovementGroups() {
    const state = Store.getState();
    const HISTORY_STATUSES = ["COMPLETE","FINISHED","CLOSED","RESOLVED","DONE","NS_FINISH"];

    const allHistory = [
      ...(state.corrective.fiber || []),
      ...(state.corrective.equipment || []),
      ...(state.corrective.other || []),
    ].filter(inc => HISTORY_STATUSES.includes((inc.status || "").toUpperCase()));

    // cidMap[cid] = { cid, customer, incidents: [], monthCounts: {} }
    const cidMap = {};

    // Extract all CIDs from an incident (same fallback chain as Global Search)
    function getCIDs(inc) {
      const direct = (inc.cid || "").trim();
      if (direct) return [direct];
      const fromTickets = (inc.tickets || []).map(t => (t.cid || "").trim()).filter(Boolean);
      if (fromTickets.length) return [...new Set(fromTickets)];
      const fromNodes = (inc.nodes || []).map(n => (n.cid || "").trim()).filter(Boolean);
      return [...new Set(fromNodes)];
    }

    allHistory.forEach(inc => {
      const cids = getCIDs(inc);
      if (!cids.length) return;

      cids.forEach(cid => {
        if (!cidMap[cid]) {
          cidMap[cid] = {
            cid,
            customer: getCustomer(inc),
            incidents: [],
            monthCounts: {},
          };
        }
        const entry = cidMap[cid];
        // deduplicate by incidentId — count once per incident, not per ticket
        const incKey = inc.incidentId || inc.incident || inc.id || "";
        if (!entry.incidents.find(i => (i.incidentId || i.incident || i.id) === incKey)) {
          entry.incidents.push(inc);
          const mk = getMonthKey(inc);
          entry.monthCounts[mk] = (entry.monthCounts[mk] || 0) + 1;
        }
        // update customer name from latest
        if (!entry.customer || entry.customer === "-") entry.customer = getCustomer(inc);
      });
    });

    // Keep only CIDs where any month exceeds threshold
    return Object.values(cidMap)
      .filter(g => Object.values(g.monthCounts).some(c => c > TRIGGER_COUNT))
      .map(g => {
        const worstMonth = Object.entries(g.monthCounts).sort((a,b) => b[1]-a[1])[0];
        g.incidents.sort((a,b) => {
          const ta = new Date(a.completedAt || a.createdAt || 0).getTime();
          const tb = new Date(b.completedAt || b.createdAt || 0).getTime();
          return tb - ta; // newest first
        });
        g.worstMonth = worstMonth ? { month: worstMonth[0], count: worstMonth[1] } : null;
        return g;
      })
      .sort((a,b) => (b.worstMonth?.count || 0) - (a.worstMonth?.count || 0));
  }

  function detectPatterns(incidents) {
    // Count causes
    const causeCounts = {};
    incidents.forEach(inc => {
      const c = getCause(inc);
      if (c && c !== "-") causeCounts[c] = (causeCounts[c] || 0) + 1;
    });
    return Object.entries(causeCounts)
      .filter(([,v]) => v >= 2)
      .sort((a,b) => b[1]-a[1])
      .map(([cause, count]) => ({ cause, count }));
  }

  // ── Location Improvements (from Hotspot) ─────────────────────────────────

  function renderLocationImprovements() {
    const imps = loadHotspotImps();
    const entries = Object.entries(imps);
    if (!entries.length) return '';

    const cards = entries.map(([key, imp]) => {
      const date = imp.resolvedAt
        ? new Date(imp.resolvedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
        : '-';
      const isFinished = imp.status === 'finished';
      const statusBadge = isFinished
        ? `<span class="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">✓ เสร็จสิ้น</span>`
        : `<span class="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200">กำลังดำเนินการ</span>`;
      const borderColor = isFinished ? 'border-emerald-200' : 'border-amber-200';
      const hoverBorder = isFinished ? 'hover:border-emerald-400' : 'hover:border-amber-400';
      const gradientColor = isFinished ? 'from-emerald-50/60' : 'from-amber-50/60';
      return `
        <div class="bg-white border ${borderColor} ${hoverBorder} rounded-2xl p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer relative overflow-hidden group"
             onclick="window.ImprovementUI.openLocationDetail('${key}')">
          <div class="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl ${gradientColor} to-transparent rounded-bl-[3rem] pointer-events-none"></div>
          <div class="flex items-start justify-between mb-3">
            <div class="flex-1 min-w-0">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Location Improvement</span>
              <div class="font-black text-slate-800 text-sm truncate mt-0.5 group-hover:text-orange-600 transition-colors">${imp.area || 'Unknown area'}</div>
              <div class="text-[10px] text-slate-400 mt-0.5">${imp.lat?.toFixed(5)}, ${imp.lng?.toFixed(5)} · รัศมี ${imp.radiusKm} กม.</div>
            </div>
            <div class="flex flex-col items-end gap-1 ml-2 relative z-10">
              <span class="${isFinished ? 'bg-emerald-500' : 'bg-amber-500'} text-white text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">${imp.incidentCount} เหตุการณ์</span>
              ${statusBadge}
            </div>
          </div>
          ${imp.actionNote ? `
          <div class="bg-slate-50 border border-slate-100 rounded-xl p-3 mb-3 text-xs text-slate-700">
            <span class="font-bold text-slate-500">การดำเนินการ: </span>${imp.actionNote}
          </div>` : ''}
          <div class="text-[10px] text-slate-400 pt-2 border-t border-slate-50">
            โดย: <b class="text-slate-600">${imp.resolvedBy || 'NOC'}</b> · ${date}
          </div>
        </div>`;
    }).join('');

    return `
      <div class="mt-8">
        <div class="flex items-center gap-3 mb-4">
          <h3 class="text-base font-black text-slate-800">Location Improvements</h3>
          <span class="bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full">${entries.length} locations</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          ${cards}
        </div>
      </div>`;
  }

  // ── Location Notes helpers ────────────────────────────────────────────────

  function loadLocNotes(key) {
    const imps = loadHotspotImps();
    return imps[key]?.notes || [];
  }
  function saveLocNotesToStorage(key, notes) {
    const imps = loadHotspotImps();
    if (imps[key]) { imps[key].notes = notes; localStorage.setItem(HOTSPOT_IMP_KEY, JSON.stringify(imps)); }
  }
  function getIncidentCID(inc) {
    const direct = (inc.cid || '').trim();
    if (direct) return direct;
    const fromTickets = (inc.tickets || []).map(t => (t.cid || '').trim()).filter(Boolean);
    if (fromTickets.length) return fromTickets[0];
    return (inc.nodes || []).map(n => (n.cid || '').trim()).filter(Boolean)[0] || '';
  }

  // ── Render: Location Detail ───────────────────────────────────────────────

  function renderLocationDetail(key) {
    const container = document.getElementById("improvement-container");
    if (!container) return;
    const imps = loadHotspotImps();
    const imp = imps[key];
    if (!imp) { renderList(computeImprovementGroups()); return; }

    const state = Store.getState();
    const allItems = [
      ...(state.corrective?.fiber || []),
      ...(state.corrective?.equipment || []),
      ...(state.corrective?.other || []),
      ...(state.alerts || []),
    ];
    const incidents = (imp.incidentIds || []).map(id =>
      allItems.find(i => String(i.incidentId || i.incident || i.id || '').split('__')[0] === id)
    ).filter(Boolean);

    const isFinished = imp.status === 'finished';
    const date = imp.resolvedAt
      ? new Date(imp.resolvedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
      : '-';

    // Pattern analysis
    const causeCounts = {};
    incidents.forEach(inc => {
      const c = getCause(inc);
      if (c && c !== '-') causeCounts[c] = (causeCounts[c] || 0) + 1;
    });
    const patterns = Object.entries(causeCounts).filter(([,v]) => v >= 2).sort((a,b) => b[1]-a[1]);

    // Unique CIDs
    const cidSet = new Set(incidents.map(getIncidentCID).filter(Boolean));
    const cids = [...cidSet];

    // Incident rows
    const incRows = incidents.map((inc, i) => {
      const d = inc.nsFinish?.details || {};
      const t = inc.nsFinish?.times   || {};
      const downTime = inc.createdAt || '';
      const upTime   = t.upTime || inc.completedAt || '';
      const ms = downTime && upTime ? Math.max(0, new Date(upTime) - new Date(downTime)) : 0;
      const duration = ms > 0 ? fmtDuration(ms) : '-';
      const cause  = d.cause  || getCause(inc);
      const method = d.method || d.repairText || inc.nsFinish?.details?.method || '-';
      const cid    = getIncidentCID(inc);
      return `
        <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-orange-50 transition-colors">
          <td class="px-3 py-2 text-xs font-bold text-slate-400">${i + 1}</td>
          <td class="px-3 py-2 text-xs text-slate-700">${fmtDateShort(downTime)}</td>
          <td class="px-3 py-2 text-xs font-mono text-orange-600">${inc.incidentId || inc.id || '-'}</td>
          <td class="px-3 py-2 text-xs font-semibold text-blue-600">${cid || '-'}</td>
          <td class="px-3 py-2 text-xs text-slate-600 max-w-[120px] truncate" title="${d.area || ''}">${d.area || '-'}</td>
          <td class="px-3 py-2 text-xs">
            <div class="font-semibold text-slate-700">${d.site || '-'}</div>
            ${d.distance ? `<div class="text-rose-500 font-bold text-[10px]">${d.distance}</div>` : ''}
          </td>
          <td class="px-3 py-2 text-xs text-slate-600">${cause}</td>
          <td class="px-3 py-2 text-xs font-bold ${ms > 4 * 3600000 ? 'text-red-600' : 'text-slate-700'}">${duration}</td>
          <td class="px-3 py-2 text-xs text-slate-500">${method}</td>
        </tr>`;
    }).join('');

    // Notes
    const notes = loadLocNotes(key);
    const noteItems = notes.length
      ? notes.map((item, i) => `
          <div class="flex items-start gap-2 group" id="loc-note-${i}">
            <span class="mt-1 w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0">${i+1}</span>
            <input type="text" value="${item.replace(/"/g,'&quot;')}"
              class="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:border-orange-400 focus:outline-none"
              data-loc-note-index="${i}">
            <button onclick="window.ImprovementUI.removeLocNote('${key}', ${i})"
              class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all text-lg leading-none mt-1">×</button>
          </div>`).join('')
      : `<div class="text-slate-400 text-sm italic">ยังไม่มี Improvement action</div>`;

    const patternHtml = patterns.length ? `
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
        <div class="font-bold text-amber-800 text-sm mb-2">⚠️ Pattern ที่พบซ้ำ</div>
        <div class="space-y-1">
          ${patterns.map(([cause, count]) => `
            <div class="flex items-center gap-2">
              <span class="w-6 h-6 rounded-full bg-amber-400 text-white text-xs font-black flex items-center justify-center">${count}</span>
              <span class="text-sm text-amber-900">${cause}</span>
            </div>`).join('')}
        </div>
      </div>` : `<div class="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 text-sm text-green-700">✅ ไม่พบ Pattern สาเหตุซ้ำ</div>`;

    container.innerHTML = `
      <!-- Header -->
      <div class="mb-5 flex items-center gap-3 flex-wrap">
        <button onclick="window.ImprovementUI.render()" class="text-slate-500 hover:text-slate-800 transition-colors p-1.5 hover:bg-slate-100 rounded-lg shrink-0">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h2 class="text-xl font-black text-slate-800">${imp.area || 'Unknown area'}</h2>
            <span class="${isFinished ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'} text-xs font-bold px-2 py-0.5 rounded-full border">
              ${isFinished ? '✓ เสร็จสิ้น' : 'กำลังดำเนินการ'}
            </span>
          </div>
          <p class="text-sm text-slate-400 mt-0.5">${imp.lat?.toFixed(5)}, ${imp.lng?.toFixed(5)} · รัศมี ${imp.radiusKm} กม.</p>
        </div>
        <div class="flex gap-2 shrink-0">
          ${isFinished
            ? `<button onclick="window.ImprovementUI.reopenHotspot('${key}')"
                class="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-bold rounded-xl transition-colors">↩ เปิดใหม่</button>`
            : `<button onclick="window.ImprovementUI.finishHotspotAndDetail('${key}')"
                class="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-xl transition-colors shadow-sm">✓ ดำเนินการเสร็จสิ้น</button>`
          }
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <div class="text-3xl font-black text-rose-500">${incidents.length}</div>
          <div class="text-xs text-slate-500 mt-1">รวม Incident</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <div class="text-3xl font-black text-amber-500">${patterns.length}</div>
          <div class="text-xs text-slate-500 mt-1">Pattern ซ้ำที่พบ</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <div class="text-3xl font-black text-blue-500">${cids.length}</div>
          <div class="text-xs text-slate-500 mt-1">CID ที่เกี่ยวข้อง</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <div class="text-sm font-black text-slate-700">${imp.resolvedBy || 'NOC'}</div>
          <div class="text-[10px] text-slate-400 mt-0.5">${date}</div>
          <div class="text-xs text-slate-500 mt-1">ดำเนินการโดย</div>
        </div>
      </div>

      <!-- CID list -->
      ${cids.length ? `
      <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex items-start gap-3">
        <div class="font-bold text-blue-700 text-sm whitespace-nowrap">CID ที่เกี่ยวข้อง</div>
        <div class="flex flex-wrap gap-2">
          ${cids.map(c => `<span class="bg-white border border-blue-200 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-lg">${c}</span>`).join('')}
        </div>
      </div>` : ''}

      <!-- Pattern -->
      ${patternHtml}

      <!-- การดำเนินการ (combined: initial actionNote + saved notes) -->
      ${(imp.actionNote || notes.length) ? `
      <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 mb-4">
        <div class="font-bold text-emerald-700 text-sm mb-3 flex items-center gap-2"><span>💡</span> การดำเนินการ</div>
        <div class="space-y-2">
          ${imp.actionNote ? `
          <div class="flex items-start gap-2">
            <span class="mt-0.5 w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center shrink-0">1</span>
            <span class="text-sm text-emerald-900">${imp.actionNote}</span>
          </div>` : ''}
          ${notes.map((note, i) => `
          <div class="flex items-start gap-2">
            <span class="mt-0.5 w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center shrink-0">${imp.actionNote ? i + 2 : i + 1}</span>
            <span class="text-sm text-emerald-900">${note}</span>
          </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Incident table -->
      <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mb-6">
        <div class="px-4 py-3 border-b border-slate-100 font-bold text-slate-700 text-sm flex items-center gap-2">
          <span>📋</span> ประวัติ Incident ในพื้นที่
        </div>
        ${incidents.length ? `
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="bg-slate-50 text-left">
                <th class="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">#</th>
                <th class="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">วันที่</th>
                <th class="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">Incident ID</th>
                <th class="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">CID</th>
                <th class="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">พื้นที่</th>
                <th class="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">Site → ระยะ</th>
                <th class="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">สาเหตุ</th>
                <th class="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">ระยะเวลา Down</th>
                <th class="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">วิธีแก้ไข</th>
              </tr>
            </thead>
            <tbody>${incRows}</tbody>
          </table>
        </div>` : `
        <div class="p-8 text-center text-slate-400 text-sm">ไม่พบข้อมูล Incident</div>`}
      </div>

      <!-- Improvement / Action notes -->
      <div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div class="flex items-center justify-between mb-4">
          <div class="font-bold text-slate-700 flex items-center gap-2"><span>💡</span> Improvement / Action</div>
          <button onclick="window.ImprovementUI.addLocNote('${key}')"
            class="flex items-center gap-1 px-3 py-1.5 bg-orange-100 hover:bg-orange-200 text-orange-700 text-xs font-bold rounded-lg transition-colors">
            + เพิ่มรายการ
          </button>
        </div>
        <div id="loc-notes-list" class="space-y-2">${noteItems}</div>
        <div class="mt-3 text-right">
          <button onclick="window.ImprovementUI.saveLocNotes('${key}')"
            class="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold rounded-xl transition-colors">
            💾 บันทึก
          </button>
        </div>
      </div>`;

    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 0);
  }

  // ── Render: List ──────────────────────────────────────────────────────────

  function renderList(groups) {
    const notes = loadNotes();
    const container = document.getElementById("improvement-container");
    if (!container) return;

    const manualGroups = buildManualGroups();
    // Merge: auto groups first, then manual-only groups (not already in auto)
    const autoCids = new Set(groups.map(g => g.cid));
    const manualOnly = manualGroups.filter(g => !autoCids.has(g.cid));
    const allGroups = [...groups, ...manualOnly];

    if (!allGroups.length) {
      container.innerHTML = `
        <div class="bg-white rounded-3xl border border-slate-100 shadow-sm p-12 text-center max-w-lg mx-auto mt-6">
          <div class="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-emerald-100">
            <i data-lucide="shield-check" class="w-8 h-8 text-emerald-500"></i>
          </div>
          <h3 class="text-lg font-black text-slate-800 mb-1">ระบบปกติ</h3>
          <p class="text-sm font-semibold text-slate-500 mb-1">ยังไม่มี CID ที่ Down เกิน <span class="text-orange-600 font-black">${TRIGGER_COUNT} ครั้ง</span>/เดือน</p>
          <p class="text-xs text-slate-400 mt-3 leading-relaxed">เลือก Incident จาก Global Search<br>แล้วกด <span class="font-bold text-orange-500">"เพิ่มใน Improvement"</span> เพื่อติดตามแบบ Manual</p>
          <div class="mt-6 flex items-center justify-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <i data-lucide="info" class="w-3 h-3"></i>
            <span>ระบบจะแสดงข้อมูลอัตโนมัติเมื่อพบ Pattern</span>
          </div>
        </div>
        ${renderLocationImprovements()}`;
      setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 0);
      return;
    }

    const renderCard = (g) => {
      const hasNotes = !!(notes[g.cid]?.items?.length);
      const isFinished = notes[g.cid]?.status === 'finished';
      const patterns = detectPatterns(g.incidents);
      const repeatLabel = patterns.length ? `⚠️ Pattern ซ้ำ: ${patterns[0].cause} (${patterns[0].count}×)` : "";
      const worstLabel = g.worstMonth ? `${g.worstMonth.count} ครั้ง ในเดือน ${g.worstMonth.month}` : "";
      const manualBadge = g.isManual
        ? `<span class="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">Manual</span>` : "";
      const removeBtn = g.isManual
        ? `<button onclick="event.stopPropagation();window.ImprovementUI.removeManualGroup('${g.cid}')" class="text-slate-300 hover:text-red-400 text-base leading-none ml-1 transition-colors" title="ลบ">×</button>` : "";
      const borderColor = isFinished ? 'border-emerald-200 hover:border-emerald-400' : 'border-slate-200 hover:border-orange-200';
      const gradientColor = isFinished ? 'from-emerald-50/60' : (g.isManual ? 'from-blue-50/60' : 'from-rose-50/60');
      return `
        <div class="bg-white border ${borderColor} rounded-2xl p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group relative overflow-hidden"
             onclick="window.ImprovementUI.openDetail('${g.cid}')">
          <div class="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl ${gradientColor} to-transparent rounded-bl-[3rem] pointer-events-none"></div>
          <div class="flex items-start justify-between mb-3">
            <div class="flex-1 min-w-0">
              <div class="font-black text-slate-800 text-sm truncate group-hover:text-orange-600 transition-colors">${g.cid}</div>
              <div class="text-xs text-slate-400 truncate mt-0.5">${g.customer}</div>
            </div>
            <div class="flex flex-col items-end gap-1 ml-2 relative z-10">
              <div class="flex items-center gap-1">
                <span class="${g.isManual ? "bg-blue-500" : "bg-rose-500"} text-white text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">${g.incidents.length} incidents</span>
                ${removeBtn}
              </div>
              ${manualBadge}
              ${isFinished
                ? `<span class="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">✓ เสร็จสิ้น</span>`
                : hasNotes
                  ? `<span class="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200">มี Action</span>`
                  : `<span class="bg-slate-100 text-slate-400 text-[10px] px-2 py-0.5 rounded-full">ยังไม่มี Action</span>`
              }
            </div>
          </div>
          ${worstLabel ? `<div class="text-xs font-semibold text-rose-600 mb-1 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>${worstLabel}</div>` : ""}
          ${repeatLabel ? `<div class="text-xs text-amber-600 mb-1 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>${repeatLabel.replace("⚠️ ", "")}</div>` : ""}
          <div class="flex items-center justify-between mt-2 pt-2 border-t border-slate-50">
            <span class="text-[10px] text-slate-400">ล่าสุด: ${fmtDateShort(g.incidents[0]?.completedAt || g.incidents[0]?.createdAt)}</span>
            ${isFinished
              ? `<button onclick="event.stopPropagation();window.ImprovementUI.reopenGroup('${g.cid}')"
                  class="text-[10px] font-bold text-slate-400 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors">↩ เปิดใหม่</button>`
              : `<button onclick="event.stopPropagation();window.ImprovementUI.finishGroup('${g.cid}')"
                  class="text-[10px] font-bold text-emerald-600 hover:text-white px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-500 border border-emerald-200 transition-colors">✓ Finish</button>`
            }
          </div>
        </div>`;
    };

    container.innerHTML = `
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h2 class="text-xl font-black text-slate-800">Improvement</h2>
          <p class="text-sm text-slate-500 mt-0.5">CID ที่ Down มากกว่า ${TRIGGER_COUNT} ครั้งใน 1 เดือน หรือเพิ่มด้วยตนเอง</p>
        </div>
        <span class="bg-red-100 text-red-700 text-xs font-bold px-3 py-1.5 rounded-full">${allGroups.length} CID</span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        ${allGroups.map(renderCard).join("")}
      </div>
      ${renderLocationImprovements()}`;
  }

  // ── Render: Detail ────────────────────────────────────────────────────────

  function renderDetail(cid) {
    const groups = computeImprovementGroups();
    const manualGroups = buildManualGroups();
    const g = groups.find(x => x.cid === cid) || manualGroups.find(x => x.cid === cid);
    if (!g) return;

    const notes = loadNotes();
    const saved = notes[cid] || { items: [] };
    const patterns = detectPatterns(g.incidents);
    const container = document.getElementById("improvement-container");
    if (!container) return;

    // Build incident rows
    const incRows = g.incidents.map((inc, i) => {
      const ms = durationMs(inc);
      const cause = getCause(inc);
      const method = inc.nsFinish?.details?.method || inc.nsFinish?.details?.repairText || "-";
      return `
        <tr class="${i % 2 === 0 ? "bg-white" : "bg-slate-50"} hover:bg-orange-50 transition-colors">
          <td class="px-3 py-2 text-xs font-mono text-slate-600">${i + 1}</td>
          <td class="px-3 py-2 text-xs text-slate-700">${fmtDateShort(inc.completedAt || inc.createdAt)}</td>
          <td class="px-3 py-2 text-xs font-semibold text-orange-700">${inc.incidentId || inc.id || "-"}</td>
          <td class="px-3 py-2 text-xs text-slate-700">${cause}</td>
          <td class="px-3 py-2 text-xs ${ms && ms > 4*3600000 ? "text-red-600 font-bold" : "text-slate-700"}">${fmtDuration(ms)}</td>
          <td class="px-3 py-2 text-xs text-slate-600">${method}</td>
        </tr>`;
    }).join("");

    // Pattern analysis
    const patternHtml = patterns.length ? `
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
        <div class="font-bold text-amber-800 text-sm mb-2">⚠️ Pattern ที่พบซ้ำ</div>
        <div class="space-y-1">
          ${patterns.map(p => `
            <div class="flex items-center gap-2">
              <span class="w-6 h-6 rounded-full bg-amber-400 text-white text-xs font-black flex items-center justify-center">${p.count}</span>
              <span class="text-sm text-amber-900">${p.cause}</span>
            </div>`).join("")}
        </div>
      </div>` : `<div class="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 text-sm text-green-700">✅ ไม่พบ Pattern สาเหตุซ้ำ</div>`;

    // Improvement notes
    const noteItems = saved.items.length
      ? saved.items.map((item, i) => `
          <div class="flex items-start gap-2 group" id="imp-item-${i}">
            <span class="mt-1 w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0">${i+1}</span>
            <input type="text" value="${item.replace(/"/g,'&quot;')}"
              class="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:border-orange-400 focus:outline-none"
              data-note-index="${i}" onchange="window.ImprovementUI.updateNote('${cid}', ${i}, this.value)">
            <button onclick="window.ImprovementUI.removeNote('${cid}', ${i})" class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all text-lg leading-none mt-1">×</button>
          </div>`).join("")
      : `<div class="text-slate-400 text-sm italic" id="imp-empty">ยังไม่มี Improvement action</div>`;

    container.innerHTML = `
      <div class="mb-5 flex items-center gap-3">
        <button onclick="window.ImprovementUI.render()" class="text-slate-500 hover:text-slate-800 transition-colors p-1.5 hover:bg-slate-100 rounded-lg">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div>
          <h2 class="text-xl font-black text-slate-800">${cid}</h2>
          <p class="text-sm text-slate-500">${g.customer}</p>
        </div>
        <div class="ml-auto flex gap-2 flex-wrap">
          ${saved.status === 'finished'
            ? `<button onclick="window.ImprovementUI.reopenGroup('${cid}')"
                class="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold rounded-xl transition-colors">
                ↩ เปิดใหม่
              </button>
              <span class="flex items-center gap-1.5 px-4 py-2 bg-emerald-100 text-emerald-700 text-sm font-bold rounded-xl border border-emerald-200">
                ✓ เสร็จสิ้น · ${fmtDateShort(saved.finishedAt)}
              </span>`
            : `<button onclick="window.ImprovementUI.finishGroup('${cid}')"
                class="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-xl transition-colors shadow-sm shadow-emerald-200">
                ✓ Finish
              </button>`
          }
          <button onclick="window.ImprovementUI.exportExcel('${cid}')"
            class="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm">
            📊 Excel
          </button>
          <button id="btn-pptx-${cid}" onclick="window.ImprovementUI.exportPPTX('${cid}', this)"
            class="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm">
            📊 PowerPoint
          </button>
          <button onclick="window.ImprovementUI.exportPDF('${cid}')"
            class="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-xl transition-colors shadow-sm">
            📄 PDF
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div class="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <div class="text-3xl font-black text-red-500">${g.incidents.length}</div>
          <div class="text-xs text-slate-500 mt-1">รวม Incidents</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <div class="text-3xl font-black text-orange-500">${g.worstMonth?.count || "-"}</div>
          <div class="text-xs text-slate-500 mt-1">สูงสุด/เดือน (${g.worstMonth?.month || ""})</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <div class="text-3xl font-black text-amber-500">${patterns.length}</div>
          <div class="text-xs text-slate-500 mt-1">Pattern ซ้ำที่พบ</div>
        </div>
      </div>

      ${patternHtml}

      <!-- Incident Table -->
      <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mb-6">
        <div class="px-4 py-3 border-b border-slate-100 font-bold text-slate-700 text-sm flex items-center gap-2">
          <span>📋</span> ประวัติ Incident
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="bg-slate-50 text-left">
                <th class="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">#</th>
                <th class="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">วันที่</th>
                <th class="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Incident ID</th>
                <th class="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">สาเหตุ</th>
                <th class="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">ระยะเวลา Down</th>
                <th class="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">วิธีแก้ไข</th>
              </tr>
            </thead>
            <tbody>${incRows}</tbody>
          </table>
        </div>
      </div>

      <!-- Improvement Notes -->
      <div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div class="flex items-center justify-between mb-4">
          <div class="font-bold text-slate-700 flex items-center gap-2"><span>💡</span> Improvement / Action</div>
          <button onclick="window.ImprovementUI.addNote('${cid}')"
            class="flex items-center gap-1 px-3 py-1.5 bg-orange-100 hover:bg-orange-200 text-orange-700 text-xs font-bold rounded-lg transition-colors">
            + เพิ่มรายการ
          </button>
        </div>
        <div id="improvement-notes-list" class="space-y-2">
          ${noteItems}
        </div>
        <div class="mt-3 text-right">
          <button onclick="window.ImprovementUI.saveAll('${cid}')"
            class="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold rounded-xl transition-colors">
            💾 บันทึก
          </button>
        </div>
      </div>`;
  }

  // ── Note Actions ─────────────────────────────────────────────────────────

  function addNote(cid) {
    const notes = loadNotes();
    if (!notes[cid]) notes[cid] = { items: [] };
    notes[cid].items.push("");
    saveNotes(notes);
    renderDetail(cid);
    // Focus last input
    setTimeout(() => {
      const inputs = document.querySelectorAll("#improvement-notes-list input");
      if (inputs.length) inputs[inputs.length - 1].focus();
    }, 50);
  }

  function updateNote(cid, index, value) {
    const notes = loadNotes();
    if (!notes[cid]) notes[cid] = { items: [] };
    notes[cid].items[index] = value;
    saveNotes(notes);
  }

  function removeNote(cid, index) {
    const notes = loadNotes();
    if (!notes[cid]) return;
    notes[cid].items.splice(index, 1);
    saveNotes(notes);
    renderDetail(cid);
  }

  function saveAll(cid) {
    const inputs = document.querySelectorAll("#improvement-notes-list input");
    const notes = loadNotes();
    if (!notes[cid]) notes[cid] = { items: [] };
    notes[cid].items = Array.from(inputs).map(i => i.value.trim()).filter(Boolean);
    notes[cid].updatedAt = new Date().toISOString();
    saveNotes(notes);
    const btn = document.querySelector(`button[onclick="window.ImprovementUI.saveAll('${cid}')"]`);
    if (btn) { btn.textContent = "✓ บันทึกแล้ว"; setTimeout(() => { btn.textContent = "💾 บันทึก"; }, 1500); }
  }

  // ── PDF Export ────────────────────────────────────────────────────────────

  function exportPDF(cid) {
    const groups = computeImprovementGroups();
    const manualGroups = buildManualGroups();
    const g = groups.find(x => x.cid === cid) || manualGroups.find(x => x.cid === cid);
    if (!g) return;

    const notes = loadNotes();
    const saved = notes[cid] || { items: [] };
    const patterns = detectPatterns(g.incidents);
    const esc = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

    // ── Helpers ──
    function hm(v) {
      if (!v) return "-";
      try { const d = new Date(v); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; } catch { return "-"; }
    }
    function diffMs(a, b) {
      if (!a || !b) return 0;
      return Math.max(0, new Date(b).getTime() - new Date(a).getTime());
    }
    function fmtElapsed(ms) {
      if (!ms) return "0 min";
      const h = Math.floor(ms / 3600000);
      const m = Math.round((ms % 3600000) / 60000);
      return h ? `${h} hr\n${m} min` : `${m} min`;
    }
    function fmtElapsedInline(ms) {
      if (!ms) return "0 min";
      const h = Math.floor(ms / 3600000);
      const m = Math.round((ms % 3600000) / 60000);
      return h ? `${h} hr ${m} min` : `${m} min`;
    }

    // ── Timeline generator per incident ──
    function buildTimeline(inc) {
      const downT  = inc.nsFinish?.times?.downTime  || inc.createdAt || "";
      const alertT = inc.createdAt || downT;
      const resT   = inc.respondedAt || inc.nsFinish?.times?.nsResponse || "";
      const upT    = inc.nsFinish?.times?.upTime || inc.completedAt || "";
      const updates = (inc.updates || []).filter(u => u.at);

      const milestones = [];
      if (downT)  milestones.push({ label: "Down",  time: downT,  type: "down",   desc: "" });
      if (alertT && alertT !== downT)
                  milestones.push({ label: "Alert",  time: alertT, type: "alert",  desc: "NS รับเรื่อง" });
      if (resT && resT !== alertT)
                  milestones.push({ label: "Res",    time: resT,   type: "res",    desc: "ออกเดินทาง" });
      updates.slice(0, 5).forEach((u) => {
        const msg = (u.message || "").replace(/<[^>]*>/g,"").substring(0, 50);
        milestones.push({ label: hm(u.at), time: u.at, type: "update", desc: msg });
      });
      if (upT)    milestones.push({ label: "Up",     time: upT,    type: "up",     desc: "" });

      if (milestones.length < 2) return "";

      const totalMs = diffMs(milestones[0].time, milestones[milestones.length-1].time);

      const CIRCLE_COLORS = {
        down:   { bg:"#fee2e2", border:"#f87171", fg:"#dc2626", shadow:"rgba(220,38,38,.18)" },
        alert:  { bg:"#dbeafe", border:"#60a5fa", fg:"#1d4ed8", shadow:"rgba(29,78,216,.15)" },
        res:    { bg:"#fef9c3", border:"#fde047", fg:"#92400e", shadow:"rgba(146,64,14,.13)" },
        update: { bg:"#ffedd5", border:"#fb923c", fg:"#c2410c", shadow:"rgba(194,65,12,.15)" },
        up:     { bg:"#dcfce7", border:"#4ade80", fg:"#15803d", shadow:"rgba(21,128,61,.15)" },
      };

      const bottomLabels = milestones.slice(1).map(m => {
        const elapsed = fmtElapsedInline(diffMs(milestones[0].time, m.time));
        return `<span style="margin-right:16px;white-space:nowrap;"><b>${esc(m.label)} : ${esc(hm(m.time))}</b> <span style="color:#94a3b8;">(${esc(elapsed)})</span></span>`;
      }).join("");

      const circlesHtml = milestones.map((m, idx) => {
        const col = CIRCLE_COLORS[m.type] || CIRCLE_COLORS.update;
        const fromDown = diffMs(milestones[0].time, m.time);
        const insideText = idx === 0 ? esc(hm(m.time)) : esc(fmtElapsed(fromDown)).replace("\n","<br>");
        const isFirst = idx === 0;
        const isLast  = idx === milestones.length - 1;
        const sz = isLast ? "60px" : isFirst ? "56px" : "52px";
        const stepDiff = idx > 0 ? esc(fmtElapsedInline(diffMs(milestones[idx-1].time, m.time))) : "";
        return `
          <div style="display:flex;flex-direction:column;align-items:center;flex:${isFirst||isLast?"0 0 72px":"1"};min-width:0;position:relative;">
            <div style="font-size:7.5px;color:#94a3b8;margin-bottom:3px;text-align:center;white-space:nowrap;min-height:12px;">${stepDiff}</div>
            <div style="width:${sz};height:${sz};border-radius:50%;background:${col.bg};border:2px solid ${col.border};color:${col.fg};display:flex;align-items:center;justify-content:center;font-size:${isFirst?"10px":"8.5px"};font-weight:900;text-align:center;line-height:1.25;position:relative;z-index:1;box-shadow:0 2px 8px ${col.shadow};">
              ${insideText}
            </div>
            <div style="font-size:8.5px;font-weight:800;color:${col.fg};margin-top:5px;white-space:nowrap;">${isFirst ? `Down : ${esc(hm(m.time))}` : isLast ? `Up : ${esc(hm(m.time))}` : esc(m.label)}</div>
            ${m.desc ? `<div style="font-size:7px;color:#94a3b8;text-align:center;max-width:72px;line-height:1.3;margin-top:1px;">${esc(m.desc)}</div>` : ""}
          </div>`;
      }).join(`<div style="align-self:flex-start;margin-top:28px;height:2px;background:linear-gradient(90deg,#e2e8f0,#cbd5e1);flex:1;min-width:8px;"></div>`);

      // ── Collect images: finish attachments + update attachments ──
      const finishImgs = (inc.nsFinish?.attachments || [])
        .filter(a => (a.url||"").startsWith("data:image/"))
        .map(a => ({ url: a.url, label: a.category || a.name || "" }));

      const updateImgs = [];
      (inc.updates || []).forEach(u => {
        (u.attachments || []).forEach(a => {
          if ((a.url||"").startsWith("data:image/"))
            updateImgs.push({ url: a.url, label: a.name || "" });
        });
      });

      const allImgs = [...finishImgs, ...updateImgs].slice(0, 10);

      const photosHtml = allImgs.length ? `
        <div style="margin-top:10px;border-top:1px dashed #e2e8f0;padding-top:8px;">
          <div style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">รูปภาพประกอบ</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${allImgs.map(img => `
              <div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
                <img src="${img.url}" alt="${esc(img.label)}" style="width:88px;height:88px;object-fit:cover;border-radius:8px;border:1.5px solid #e2e8f0;box-shadow:0 1px 4px rgba(0,0,0,.08);">
                ${img.label ? `<div style="font-size:6.5px;color:#94a3b8;text-align:center;max-width:88px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(img.label)}</div>` : ""}
              </div>`).join("")}
          </div>
        </div>` : "";

      return `
        <div style="margin-bottom:10px;border-radius:10px;border:1px solid #e2e8f0;overflow:hidden;page-break-inside:avoid;box-shadow:0 1px 4px rgba(0,0,0,.05);">
          <!-- Incident header bar -->
          <div style="background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:8px 14px;display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="width:4px;height:18px;background:#ea580c;border-radius:2px;"></div>
              <span style="font-size:12px;font-weight:900;color:#ea580c;">${esc(inc.incidentId||inc.id)}</span>
              <span style="font-size:10px;color:#64748b;">${esc(inc.node||inc.cid||"")}</span>
            </div>
            <div style="display:flex;align-items:center;gap:12px;">
              <span style="font-size:10px;color:#475569;">${esc(getCause(inc))}</span>
              <span style="font-size:10px;font-weight:700;color:#1e293b;background:#e2e8f0;padding:2px 8px;border-radius:20px;">⏱ ${esc(fmtElapsedInline(totalMs))}</span>
            </div>
          </div>
          <!-- Timeline -->
          <div style="padding:12px 14px 10px;background:#fff;">
            <div style="position:relative;">
              <div style="position:absolute;top:40px;left:36px;right:36px;height:2px;background:linear-gradient(90deg,#fca5a5,#93c5fd,#fde047,#fb923c,#4ade80);opacity:.4;z-index:0;"></div>
              <div style="display:flex;align-items:flex-start;gap:0;position:relative;">
                ${circlesHtml}
              </div>
            </div>
            <div style="margin-top:10px;font-size:8.5px;color:#475569;border-top:1px solid #f1f5f9;padding-top:6px;line-height:1.8;">
              ${bottomLabels}
            </div>
            ${photosHtml}
            ${updates.length ? `
            <div style="margin-top:10px;border-top:1px dashed #e2e8f0;padding-top:8px;">
              <div style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Updates ทั้งหมด (${updates.length})</div>
              ${updates.map((u, i) => {
                const msg = (u.message || "").replace(/<[^>]*>/g, "").trim();
                const elapsed = fmtElapsedInline(diffMs(downT || alertT, u.at));
                return `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:5px;padding:6px 8px;background:#f8fafc;border-radius:6px;border-left:3px solid #fb923c;">
                  <div style="min-width:20px;height:20px;border-radius:50%;background:#ffedd5;border:1.5px solid #fb923c;color:#c2410c;font-size:9px;font-weight:900;display:flex;align-items:center;justify-content:center;">${i+1}</div>
                  <div style="flex:1;min-width:0;">
                    <div style="font-size:8.5px;color:#64748b;margin-bottom:2px;"><b>${esc(hm(u.at))}</b> <span style="color:#94a3b8;">(+${esc(elapsed)})</span></div>
                    <div style="font-size:10px;color:#1e293b;line-height:1.5;">${esc(msg) || "-"}</div>
                  </div>
                </div>`;
              }).join("")}
            </div>` : ""}
          </div>
        </div>`;
    }

    // ── Build all timelines ──
    const timelinesHtml = g.incidents.map(inc => buildTimeline(inc)).join("");

    // ── Improvement notes ──
    const noteRows = saved.items.map((item, i) => `
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">
        <div style="min-width:22px;height:22px;border-radius:50%;background:#ea580c;color:#fff;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;">${i+1}</div>
        <div style="font-size:13px;color:#1e293b;line-height:1.6;">${esc(item)}</div>
      </div>`).join("");

    // ── Pattern rows ──
    const patternRows = patterns.map((p, i) => `
      <tr style="${i%2?"background:#fafafa":""}">
        <td style="font-weight:700;color:#d97706;width:60px;">${p.count}×</td>
        <td>${esc(p.cause)}</td>
      </tr>`).join("");

    const css = `
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:'Sarabun','Segoe UI',sans-serif;font-size:13px;color:#1e293b;background:#f8fafc;}
      .page{padding:22px 26px;max-width:980px;margin:0 auto;}
      .page-break{page-break-before:always;}
      .header-bar{background:linear-gradient(135deg,#1e293b 0%,#334155 100%);color:#fff;padding:16px 22px;border-radius:12px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 4px 16px rgba(30,41,59,.3);}
      .header-bar .title{font-size:18px;font-weight:900;color:#fb923c;letter-spacing:.02em;}
      .header-bar .sub{font-size:11px;color:#94a3b8;margin-top:3px;}
      .header-bar .sub2{font-size:10px;color:#64748b;margin-top:1px;}
      .stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px;}
      .stat{border:1px solid #e2e8f0;border-radius:12px;padding:14px 12px;text-align:center;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.05);}
      .stat .num{font-size:32px;font-weight:900;color:#ea580c;line-height:1;}
      .stat .lbl{font-size:10px;color:#94a3b8;margin-top:4px;font-weight:600;letter-spacing:.03em;}
      .section-title{font-size:11px;font-weight:900;color:#1e293b;text-transform:uppercase;letter-spacing:.07em;margin:18px 0 10px;padding:6px 10px;background:#f1f5f9;border-left:4px solid #ea580c;border-radius:0 6px 6px 0;}
      table{width:100%;border-collapse:collapse;margin-bottom:16px;}
      th{background:#f8fafc;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;padding:7px 10px;text-align:left;border-bottom:2px solid #e2e8f0;}
      td{padding:6px 10px;font-size:11px;border-bottom:1px solid #f8fafc;vertical-align:top;}
      .pattern-box{background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:14px;margin-bottom:16px;}
      .notes-box{border:1px solid #e2e8f0;border-radius:12px;padding:18px;background:#fff;}
      @media print{
        body{background:#fff;}
        .page{padding:12px 14px;}
        .page-break{page-break-before:always;}
        *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}
      }`;

    const html = `<!DOCTYPE html>
<html lang="th"><head><meta charset="UTF-8">
<title>Time line (${cid})</title>
<style>${css}</style></head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header-bar">
    <div>
      <div class="title">Time line : ${esc(cid)}</div>
      <div class="sub">${esc(g.customer)}</div>
      ${g.incidents[0]?.node ? `<div class="sub2">${esc(g.incidents[0].node)}</div>` : ""}
    </div>
    <div style="text-align:right;">
      <div style="font-size:10px;color:#64748b;">สร้างเมื่อ</div>
      <div style="font-size:11px;color:#94a3b8;font-weight:600;">${new Date().toLocaleString("th-TH")}</div>
    </div>
  </div>

  <!-- Stats -->
  <div class="stat-grid">
    <div class="stat">
      <div class="num">${g.incidents.length}</div>
      <div class="lbl">รวม Incidents</div>
    </div>
    <div class="stat">
      <div class="num" style="color:#f59e0b;">${g.worstMonth?.count||"-"}</div>
      <div class="lbl">สูงสุด/เดือน</div>
      <div style="font-size:9px;color:#cbd5e1;margin-top:2px;">${esc(g.worstMonth?.month||"")}</div>
    </div>
    <div class="stat">
      <div class="num" style="color:#d97706;">${patterns.length}</div>
      <div class="lbl">Pattern ซ้ำ</div>
    </div>
  </div>

  <!-- Timelines per incident -->
  <div class="section-title">Time line รายการ Incident</div>
  ${timelinesHtml || '<div style="color:#94a3b8;font-style:italic;font-size:12px;padding:8px;">ไม่มีข้อมูล Timeline</div>'}

  <!-- Pattern -->
  ${patterns.length ? `
  <div class="section-title">Pattern ที่พบซ้ำ</div>
  <div class="pattern-box">
    <table>
      <thead><tr><th>จำนวน</th><th>สาเหตุ</th></tr></thead>
      <tbody>${patternRows}</tbody>
    </table>
  </div>` : ""}

</div>

<!-- Improvement page -->
<div class="page page-break">
  <div class="header-bar">
    <div>
      <div class="title">Improvement : (${esc(cid)})</div>
      <div class="sub">${esc(g.customer)}</div>
    </div>
  </div>

  <div class="section-title">Improvement / Action</div>
  <div class="notes-box">
    ${noteRows || '<div style="color:#94a3b8;font-style:italic;font-size:12px;">ยังไม่มี Improvement action</div>'}
  </div>
</div>

<script>window.onload=function(){window.print();};<\/script>
</body></html>`;

    const win = window.open("", "_blank", "width=1000,height=750");
    if (!win) { alert("กรุณาอนุญาต Popup เพื่อส่งออก PDF"); return; }
    win.document.write(html);
    win.document.close();
  }

  // ── Excel Export ─────────────────────────────────────────────────────────

  function exportExcel(cid) {
    const groups = computeImprovementGroups();
    const manualGroups = buildManualGroups();
    const g = groups.find(x => x.cid === cid) || manualGroups.find(x => x.cid === cid);
    if (!g) return;

    const notes = loadNotes();
    const saved = notes[cid] || { items: [] };
    const patterns = detectPatterns(g.incidents);

    // ── Helpers ──
    function fmtIso(v) {
      if (!v) return "";
      try { return new Date(v).toLocaleString("th-TH", { hour12: false }); } catch { return v; }
    }
    function hmOnly(v) {
      if (!v) return "";
      try { const d = new Date(v); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; } catch { return ""; }
    }
    function stripHtml(s) { return String(s||"").replace(/<[^>]*>/g,"").trim(); }
    function diffMsX(a, b) { if (!a||!b) return 0; return Math.max(0, new Date(b)-new Date(a)); }
    function msToHM(ms) {
      if (!ms||ms<=0) return "-";
      const h = Math.floor(ms/3600000);
      const m = Math.round((ms%3600000)/60000);
      return h ? `${h} hr ${m} min` : `${m} min`;
    }
    const e = v => String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

    // ── Style constants ──
    const S = {
      hdr:    "background:#1e293b;color:#fb923c;font-weight:900;font-size:14pt;padding:10px 14px;",
      sub:    "background:#1e293b;color:#94a3b8;font-size:10pt;padding:2px 14px 8px;",
      stat:   "border:1px solid #e2e8f0;text-align:center;padding:10px;font-size:11pt;",
      statN:  "color:#ea580c;font-weight:900;font-size:18pt;",
      statL:  "color:#94a3b8;font-size:8pt;",
      secHdr: "background:#f1f5f9;color:#1e293b;font-weight:900;font-size:9pt;text-transform:uppercase;letter-spacing:.05em;padding:5px 10px;border-left:4px solid #ea580c;",
      incHdr: "background:#fff7ed;color:#c2410c;font-weight:900;font-size:10pt;padding:6px 10px;border:1px solid #fed7aa;border-bottom:none;",
      incSub: "background:#fff7ed;color:#64748b;font-size:8.5pt;padding:2px 10px 6px;border:1px solid #fed7aa;border-top:none;",
      tlHdr:  "background:#f8fafc;color:#94a3b8;font-weight:700;font-size:8pt;text-align:center;border:1px solid #e2e8f0;padding:4px 8px;text-transform:uppercase;",
      tlDown: "background:#fee2e2;color:#dc2626;font-weight:900;font-size:10pt;text-align:center;border:2px solid #fca5a5;padding:8px;",
      tlAlert:"background:#dbeafe;color:#1d4ed8;font-weight:900;font-size:10pt;text-align:center;border:2px solid #93c5fd;padding:8px;",
      tlRes:  "background:#fef9c3;color:#92400e;font-weight:900;font-size:10pt;text-align:center;border:2px solid #fde047;padding:8px;",
      tlUpd:  "background:#ffedd5;color:#c2410c;font-weight:900;font-size:10pt;text-align:center;border:2px solid #fb923c;padding:8px;",
      tlUp:   "background:#dcfce7;color:#15803d;font-weight:900;font-size:10pt;text-align:center;border:2px solid #4ade80;padding:8px;",
      tlLbl:  "font-weight:700;font-size:8pt;text-align:center;color:#64748b;border:1px solid #f1f5f9;padding:2px;",
      updHdr: "background:#fff7ed;color:#c2410c;font-weight:700;font-size:8.5pt;padding:4px 8px;border:1px solid #fed7aa;",
      updRow: "color:#1e293b;font-size:9pt;padding:4px 8px;border:1px solid #f1f5f9;vertical-align:top;",
      updNum: "background:#ffedd5;color:#c2410c;font-weight:900;font-size:9pt;text-align:center;border:1px solid #fb923c;padding:4px;",
      blank:  "border:none;background:#f8fafc;",
      patHdr: "background:#fffbeb;color:#92400e;font-weight:700;font-size:9pt;padding:4px 8px;border:1px solid #fcd34d;",
      patRow: "color:#1e293b;font-size:9pt;padding:4px 8px;border:1px solid #fef9c3;",
      patN:   "color:#d97706;font-weight:900;font-size:10pt;text-align:center;border:1px solid #fcd34d;padding:4px 8px;",
      impHdr: "background:#1e293b;color:#fb923c;font-weight:900;font-size:10pt;padding:6px 10px;",
      impNum: "background:#ea580c;color:#fff;font-weight:900;font-size:9pt;text-align:center;border-radius:50%;padding:4px 8px;",
      impTxt: "color:#1e293b;font-size:10pt;padding:6px 10px;border-bottom:1px solid #f1f5f9;",
    };

    // ── Build rows ──
    const rows = [];
    const td = (content, style="", colspan=1, rowspan=1) =>
      `<td${colspan>1?` colspan="${colspan}"`:""}${rowspan>1?` rowspan="${rowspan}"`:""}` +
      ` style="${style}">${e(content)}</td>`;
    const tdRaw = (content, style="", colspan=1) =>
      `<td${colspan>1?` colspan="${colspan}"`:""}` +
      ` style="${style}">${content}</td>`;
    const row = (...cells) => `<tr>${cells.join("")}</tr>`;

    // Find max update count to set column count
    const maxUpdates = Math.max(0, ...g.incidents.map(inc => (inc.updates||[]).filter(u=>u.at).length));
    // Columns: Down | Alert | Res | Update1..N | Up  (min 5 cols)
    const timelineCols = 3 + maxUpdates + 1; // down+alert+res + updates + up

    // ── HEADER ──
    rows.push(row(tdRaw(`<b style="color:#fb923c;font-size:14pt;">Time line : ${e(cid)}</b>`, S.hdr, timelineCols)));
    rows.push(row(tdRaw(e(g.customer), S.sub, timelineCols)));
    rows.push(row(td("", S.blank, timelineCols)));

    // ── STATS ──
    const statCols = Math.max(3, timelineCols);
    rows.push(row(
      tdRaw(`<div style="${S.statN}">${g.incidents.length}</div><div style="${S.statL}">รวม Incidents</div>`, S.stat),
      tdRaw(`<div style="${S.statN};color:#f59e0b;">${g.worstMonth?.count||"-"}</div><div style="${S.statL}">สูงสุด/เดือน (${e(g.worstMonth?.month||"")})</div>`, S.stat, Math.max(1, timelineCols-2)),
      tdRaw(`<div style="${S.statN};color:#d97706;">${patterns.length}</div><div style="${S.statL}">Pattern ซ้ำ</div>`, S.stat),
    ));
    rows.push(row(td("", S.blank, timelineCols)));

    // ── SECTION: TIMELINE ──
    rows.push(row(tdRaw(`<b>TIME LINE รายการ INCIDENT</b>`, S.secHdr, timelineCols)));
    rows.push(row(td("", S.blank, timelineCols)));

    // ── Per-incident blocks ──
    g.incidents.forEach(inc => {
      const downT  = inc.nsFinish?.times?.downTime  || inc.createdAt || "";
      const alertT = inc.createdAt || downT;
      const resT   = inc.respondedAt || inc.nsFinish?.times?.nsResponse || "";
      const upT    = inc.nsFinish?.times?.upTime || inc.completedAt || "";
      const totalMs = diffMsX(downT, upT);
      const incUpdates = (inc.updates||[]).filter(u=>u.at);

      // Incident header
      rows.push(row(
        tdRaw(`<b style="color:#c2410c;">${e(inc.incidentId||inc.id)}</b> &nbsp; <span style="color:#64748b;">${e(inc.node||"")}</span>`, S.incHdr, timelineCols - 2),
        tdRaw(`${e(getCause(inc))}`, S.incHdr),
        tdRaw(`⏱ <b>${e(msToHM(totalMs))}</b>`, S.incHdr),
      ));

      // Timeline label row
      const tlHeaderCells = [
        td("Down", S.tlHdr),
        td("Alert", S.tlHdr),
        td("Res", S.tlHdr),
        ...incUpdates.map((_,i) => td(`Update ${i+1}`, S.tlHdr)),
        ...Array(maxUpdates - incUpdates.length).fill(td("", S.blank)),
        td("Up", S.tlHdr),
      ];
      rows.push(row(...tlHeaderCells));

      // Timeline time row
      const tlTimeCells = [
        tdRaw(`<b>${e(hmOnly(downT))}</b>`, S.tlDown),
        tdRaw(`<b>${e(hmOnly(alertT))}</b><br><span style="font-size:8pt;">(+${e(msToHM(diffMsX(downT,alertT)))})</span>`, S.tlAlert),
        tdRaw(resT ? `<b>${e(hmOnly(resT))}</b><br><span style="font-size:8pt;">(+${e(msToHM(diffMsX(downT,resT)))})</span>` : "-", S.tlRes),
        ...incUpdates.map(u => tdRaw(`<b>${e(hmOnly(u.at))}</b><br><span style="font-size:8pt;">(+${e(msToHM(diffMsX(downT,u.at)))})</span>`, S.tlUpd)),
        ...Array(maxUpdates - incUpdates.length).fill(td("", S.blank)),
        tdRaw(upT ? `<b>${e(hmOnly(upT))}</b><br><span style="font-size:8pt;">${e(msToHM(totalMs))}</span>` : "-", S.tlUp),
      ];
      rows.push(row(...tlTimeCells));

      // Updates detail rows
      if (incUpdates.length) {
        rows.push(row(
          tdRaw(`<b>Updates ทั้งหมด (${incUpdates.length})</b>`, S.updHdr, timelineCols),
        ));
        incUpdates.forEach((u, i) => {
          const msg = stripHtml(u.message);
          const elapsed = msToHM(diffMsX(downT||alertT, u.at));
          rows.push(row(
            tdRaw(`${i+1}`, S.updNum),
            tdRaw(`<b>${e(hmOnly(u.at))}</b> <span style="color:#94a3b8;">(+${e(elapsed)})</span>`, S.updRow),
            tdRaw(e(msg), S.updRow, timelineCols - 2),
          ));
        });
      }

      rows.push(row(td("", S.blank, timelineCols)));
    });

    // ── SECTION: PATTERN ──
    if (patterns.length) {
      rows.push(row(tdRaw(`<b>PATTERN ที่พบซ้ำ</b>`, S.secHdr, timelineCols)));
      rows.push(row(
        tdRaw(`<b>จำนวน</b>`, S.patHdr),
        tdRaw(`<b>สาเหตุ</b>`, S.patHdr, timelineCols - 1),
      ));
      patterns.forEach(p => {
        rows.push(row(
          tdRaw(`${p.count}×`, S.patN),
          tdRaw(e(p.cause), S.patRow, timelineCols - 1),
        ));
      });
      rows.push(row(td("", S.blank, timelineCols)));
    }

    // ── SECTION: IMPROVEMENT ──
    rows.push(row(tdRaw(`<b>IMPROVEMENT / ACTION</b>`, S.impHdr, timelineCols)));
    if (saved.items.length) {
      saved.items.forEach((item, i) => {
        rows.push(row(
          tdRaw(`${i+1}`, S.impNum),
          tdRaw(e(item), S.impTxt, timelineCols - 1),
        ));
      });
    } else {
      rows.push(row(tdRaw(`<span style="color:#94a3b8;font-style:italic;">ยังไม่มี Improvement action</span>`, S.impTxt, timelineCols)));
    }

    // ── Assemble HTML ──
    const BOM = "\ufeff";
    const htmlExcel = `<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:x='urn:schemas-microsoft-com:office:excel'
      xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset="UTF-8">
<style>
  body { font-family: 'Sarabun', 'Tahoma', sans-serif; font-size: 10pt; }
  table { border-collapse: collapse; width: 100%; }
  td { vertical-align: middle; white-space: pre-wrap; word-break: break-word; }
</style>
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>
  <x:ExcelWorksheet><x:Name>Timeline ${e(cid)}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>
</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
</head><body>
<table>${rows.join("\n")}</table>
</body></html>`;

    const blob = new Blob([BOM + htmlExcel], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Timeline_${cid}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── PowerPoint Export ────────────────────────────────────────────────────

  function exportPPTX(cid, btnEl) {
    const groups = computeImprovementGroups();
    const manualGroups = buildManualGroups();
    const g = groups.find(x => x.cid === cid) || manualGroups.find(x => x.cid === cid);
    if (!g) return;

    function setBtn(txt) { if (btnEl) btnEl.textContent = txt; }

    function doExport() {
      setBtn("⏳ กำลังสร้าง...");
      try {
        const pptx = new window.PptxGenJS();
        pptx.layout = "LAYOUT_WIDE"; // 13.33 × 7.5 in

        const notes = loadNotes();
        const saved = notes[cid] || { items: [] };
        const patterns = detectPatterns(g.incidents);
        const W = 13.33, FONT = "Tahoma";

        // helpers
        function hm(v) {
          if (!v) return "-";
          try { const d=new Date(v); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; } catch { return "-"; }
        }
        function dMs(a,b) { if(!a||!b) return 0; return Math.max(0,new Date(b)-new Date(a)); }
        function fMs(ms) {
          if(!ms||ms<=0) return "0m";
          const h=Math.floor(ms/3600000), m=Math.round((ms%3600000)/60000);
          return h ? `${h}h ${m}m` : `${m}m`;
        }
        function sh(s) { return String(s||"").replace(/<[^>]*>/g,"").trim(); }

        const COL = {
          down:  {fill:"fee2e2",line:"f87171",text:"dc2626"},
          alert: {fill:"dbeafe",line:"60a5fa",text:"1d4ed8"},
          res:   {fill:"fef9c3",line:"fde047",text:"92400e"},
          update:{fill:"ffedd5",line:"fb923c",text:"c2410c"},
          up:    {fill:"dcfce7",line:"4ade80",text:"15803d"},
        };

        // ── Slide 1 : Summary ────────────────────────────────────────────────
        const s1 = pptx.addSlide();
        // dark header
        s1.addShape("rect", {x:0,y:0,w:W,h:1.1,fill:{color:"1e293b"},line:{color:"1e293b"}});
        s1.addText(`Time line : ${cid}`, {x:0.3,y:0.1,w:10,h:0.55,fontSize:22,bold:true,color:"fb923c",fontFace:FONT});
        s1.addText(g.customer, {x:0.3,y:0.68,w:12.5,h:0.35,fontSize:11,color:"94a3b8",fontFace:FONT});
        s1.addText(`สร้างเมื่อ ${new Date().toLocaleString("th-TH",{hour12:false})}`, {x:10.5,y:0.12,w:2.7,h:0.3,fontSize:9,color:"64748b",align:"right",fontFace:FONT});

        // stat boxes
        [
          {num:String(g.incidents.length),lbl:"รวม Incidents",col:"ea580c"},
          {num:String(g.worstMonth?.count||"-"),lbl:`สูงสุด/เดือน\n(${g.worstMonth?.month||""})`,col:"f59e0b"},
          {num:String(patterns.length),lbl:"Pattern ซ้ำ",col:"d97706"},
        ].forEach((st,i) => {
          const x = 0.3+i*4.3;
          s1.addShape("rect",{x,y:1.25,w:4.0,h:1.4,fill:{color:"ffffff"},line:{color:"e2e8f0",width:1}});
          s1.addText(st.num,{x,y:1.3,w:4.0,h:0.75,fontSize:40,bold:true,color:st.col,align:"center",fontFace:FONT});
          s1.addText(st.lbl,{x,y:2.05,w:4.0,h:0.55,fontSize:9,color:"94a3b8",align:"center",fontFace:FONT});
        });

        // pattern section
        if (patterns.length) {
          s1.addShape("rect",{x:0.3,y:2.85,w:12.7,h:0.32,fill:{color:"f1f5f9"},line:{color:"ea580c",width:3}});
          s1.addText("PATTERN ที่พบซ้ำ",{x:0.5,y:2.86,w:12.5,h:0.3,fontSize:9,bold:true,color:"1e293b",fontFace:FONT});
          patterns.forEach((p,i) => {
            const y=3.28+i*0.38;
            s1.addShape("rect",{x:0.3,y,w:1.2,h:0.33,fill:{color:"fffbeb"},line:{color:"fcd34d",width:1}});
            s1.addText(`${p.count}×`,{x:0.3,y,w:1.2,h:0.33,fontSize:12,bold:true,color:"d97706",align:"center",fontFace:FONT});
            s1.addShape("rect",{x:1.6,y,w:11.4,h:0.33,fill:{color:"fffbeb"},line:{color:"fef9c3",width:1}});
            s1.addText(p.cause,{x:1.7,y,w:11.1,h:0.33,fontSize:11,color:"1e293b",fontFace:FONT});
          });
        }

        // ── Slides: per Incident ─────────────────────────────────────────────
        g.incidents.forEach(inc => {
          const sl = pptx.addSlide();

          const downT  = inc.nsFinish?.times?.downTime || inc.createdAt || "";
          const alertT = inc.createdAt || downT;
          const resT   = inc.respondedAt || inc.nsFinish?.times?.nsResponse || "";
          const upT    = inc.nsFinish?.times?.upTime || inc.completedAt || "";
          const allUpd = (inc.updates||[]).filter(u=>u.at);
          const totalMs = dMs(downT, upT);

          const finishImgs = (inc.nsFinish?.attachments||[]).filter(a=>(a.url||"").startsWith("data:image/"));
          const updImgs = [];
          allUpd.forEach(u=>(u.attachments||[]).forEach(a=>{ if((a.url||"").startsWith("data:image/")) updImgs.push({url:a.url,label:a.name||""}); }));
          const allImgs = [...finishImgs.map(a=>({url:a.url,label:a.category||a.name||""})), ...updImgs].slice(0,6);

          // milestones
          const MS = [];
          if (downT) MS.push({label:"Down",time:downT,type:"down"});
          if (alertT && alertT!==downT) MS.push({label:"Alert",time:alertT,type:"alert"});
          if (resT && resT!==alertT) MS.push({label:"Res",time:resT,type:"res"});
          allUpd.forEach(u=>MS.push({label:hm(u.at),time:u.at,type:"update"}));
          if (upT) MS.push({label:"Up",time:upT,type:"up"});

          // incident header bar
          sl.addShape("rect",{x:0,y:0,w:W,h:0.65,fill:{color:"fff7ed"},line:{color:"fed7aa",width:1}});
          sl.addShape("rect",{x:0,y:0,w:0.07,h:0.65,fill:{color:"ea580c"},line:{color:"ea580c"}});
          sl.addText(`${inc.incidentId||inc.id}`,{x:0.18,y:0.05,w:5.5,h:0.36,fontSize:16,bold:true,color:"c2410c",fontFace:FONT});
          sl.addText(inc.node||"",{x:0.18,y:0.41,w:5.5,h:0.22,fontSize:9,color:"64748b",fontFace:FONT});
          sl.addText(getCause(inc),{x:6.0,y:0.14,w:6.0,h:0.34,fontSize:11,color:"475569",fontFace:FONT});
          sl.addShape("rect",{x:11.5,y:0.12,w:1.68,h:0.38,fill:{color:"e2e8f0"},line:{color:"d1d5db",width:1}});
          sl.addText(`⏱ ${fMs(totalMs)}`,{x:11.5,y:0.12,w:1.68,h:0.38,fontSize:10,bold:true,color:"1e293b",align:"center",fontFace:FONT});

          // timeline
          if (MS.length >= 2) {
            const TY=1.42, CW=0.72, MX=0.4, AW=W-MX*2;
            const SP=(AW-MS.length*CW)/(MS.length-1);
            // connecting line
            sl.addShape("rect",{x:MX+CW/2,y:TY+CW/2-0.015,w:AW-CW,h:0.03,fill:{color:"e2e8f0"},line:{color:"e2e8f0"}});

            MS.forEach((m,i) => {
              const c=COL[m.type]||COL.update;
              const cx=MX+i*(CW+SP);
              sl.addShape("ellipse",{x:cx,y:TY,w:CW,h:CW,fill:{color:c.fill},line:{color:c.line,width:2}});
              const inside = i===0 ? hm(m.time) : fMs(dMs(MS[0].time,m.time));
              sl.addText(inside,{x:cx,y:TY+0.08,w:CW,h:CW-0.16,fontSize:i===0?11:9,bold:true,color:c.text,align:"center",valign:"middle",fontFace:FONT});
              const lbl = i===0 ? `Down\n${hm(m.time)}` : i===MS.length-1 ? `Up\n${hm(m.time)}` : m.label;
              sl.addText(lbl,{x:cx-0.1,y:TY+CW+0.06,w:CW+0.2,h:0.42,fontSize:8,bold:true,color:c.text,align:"center",fontFace:FONT});
              if (i>0) {
                const px=MX+(i-1)*(CW+SP);
                sl.addText(fMs(dMs(MS[i-1].time,m.time)),{x:px+CW+0.05,y:TY-0.28,w:SP-0.1,h:0.25,fontSize:7.5,color:"94a3b8",align:"center",fontFace:FONT});
              }
            });
          }

          // updates
          const hasImgs = allImgs.length>0;
          const maxUp = hasImgs ? 4 : Math.min(allUpd.length,8);
          const UY = 2.82;
          if (allUpd.length) {
            sl.addShape("rect",{x:0.3,y:UY,w:12.7,h:0.3,fill:{color:"f8fafc"},line:{color:"fed7aa",width:1}});
            sl.addText(`Updates ทั้งหมด (${allUpd.length})`,{x:0.45,y:UY+0.02,w:12.4,h:0.26,fontSize:8.5,bold:true,color:"64748b",fontFace:FONT});
            allUpd.slice(0,maxUp).forEach((u,i) => {
              const uy=UY+0.36+i*0.4;
              sl.addShape("ellipse",{x:0.3,y:uy+0.02,w:0.3,h:0.3,fill:{color:"ffedd5"},line:{color:"fb923c",width:1.5}});
              sl.addText(String(i+1),{x:0.3,y:uy+0.02,w:0.3,h:0.3,fontSize:8,bold:true,color:"c2410c",align:"center",valign:"middle",fontFace:FONT});
              sl.addText(`${hm(u.at)} (+${fMs(dMs(downT||alertT,u.at))})`,{x:0.67,y:uy+0.04,w:1.85,h:0.28,fontSize:8.5,bold:true,color:"64748b",fontFace:FONT});
              sl.addText(sh(u.message).substring(0,160),{x:2.6,y:uy+0.04,w:10.4,h:0.28,fontSize:8.5,color:"1e293b",fontFace:FONT});
            });
            if (allUpd.length>maxUp) {
              const my=UY+0.36+maxUp*0.4;
              sl.addText(`...และอีก ${allUpd.length-maxUp} update`,{x:0.67,y:my,w:12.3,h:0.28,fontSize:8.5,color:"94a3b8",italic:true,fontFace:FONT});
            }
          }

          // photos
          if (hasImgs) {
            const pyBase = UY+0.36+maxUp*0.4+(allUpd.length>maxUp?0.35:0.1);
            const PS = Math.min(1.1,(W-0.6-allImgs.length*0.12)/allImgs.length);
            allImgs.forEach((img,i) => {
              try {
                sl.addImage({data:img.url, x:0.3+i*(PS+0.12), y:pyBase, w:PS, h:PS});
                if (img.label) sl.addText(img.label.substring(0,20),{x:0.3+i*(PS+0.12),y:pyBase+PS+0.03,w:PS,h:0.2,fontSize:7,color:"94a3b8",align:"center",fontFace:FONT});
              } catch(_) {}
            });
          }
        });

        // ── Slide: Improvement ───────────────────────────────────────────────
        const sI = pptx.addSlide();
        sI.addShape("rect",{x:0,y:0,w:W,h:1.0,fill:{color:"1e293b"},line:{color:"1e293b"}});
        sI.addText(`Improvement : ${cid}`,{x:0.3,y:0.1,w:10,h:0.5,fontSize:20,bold:true,color:"fb923c",fontFace:FONT});
        sI.addText(g.customer,{x:0.3,y:0.62,w:12.5,h:0.33,fontSize:11,color:"94a3b8",fontFace:FONT});
        sI.addShape("rect",{x:0.3,y:1.18,w:12.7,h:0.32,fill:{color:"f1f5f9"},line:{color:"ea580c",width:3}});
        sI.addText("IMPROVEMENT / ACTION",{x:0.5,y:1.19,w:12.5,h:0.3,fontSize:10,bold:true,color:"1e293b",fontFace:FONT});
        if (saved.items.length) {
          saved.items.forEach((item,i) => {
            const y=1.7+i*0.58;
            sI.addShape("ellipse",{x:0.3,y,w:0.42,h:0.42,fill:{color:"ea580c"},line:{color:"ea580c"}});
            sI.addText(String(i+1),{x:0.3,y,w:0.42,h:0.42,fontSize:12,bold:true,color:"ffffff",align:"center",valign:"middle",fontFace:FONT});
            sI.addText(item,{x:0.85,y:y+0.05,w:12.1,h:0.42,fontSize:13,color:"1e293b",fontFace:FONT});
          });
        } else {
          sI.addText("ยังไม่มี Improvement action",{x:0.3,y:1.8,w:12.7,h:0.4,fontSize:12,color:"94a3b8",italic:true,fontFace:FONT});
        }

        pptx.writeFile({fileName:`Timeline_${cid}.pptx`})
          .then(()=>setBtn("📊 PowerPoint"))
          .catch(()=>setBtn("📊 PowerPoint"));

      } catch(err) {
        console.error("PPTX error:", err);
        alert("เกิดข้อผิดพลาดในการสร้าง PowerPoint: " + err.message);
        setBtn("📊 PowerPoint");
      }
    }

    if (window.PptxGenJS) {
      doExport();
    } else {
      setBtn("⏳ โหลด library...");
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js";
      s.onload = doExport;
      s.onerror = () => { alert("ไม่สามารถโหลด PptxGenJS ได้"); setBtn("📊 PowerPoint"); };
      document.head.appendChild(s);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  window.ImprovementUI = {
    render() {
      const groups = computeImprovementGroups();
      renderList(groups);
    },
    openDetail(cid) {
      renderDetail(cid);
    },
    removeManualGroup(cid) {
      removeManualGroup(cid);
      const groups = computeImprovementGroups();
      renderList(groups);
    },
    addNote,
    updateNote,
    removeNote,
    saveAll,
    exportPDF,
    exportExcel,
    exportPPTX,
    finishGroup,
    reopenGroup,
    reopenHotspot: (key) => { deleteHotspotImp(key); renderList(computeImprovementGroups()); },
    finishHotspot: (key) => { finishHotspotImp(key); renderList(computeImprovementGroups()); },
    openLocationDetail: (key) => { renderLocationDetail(key); },
    finishHotspotAndDetail: (key) => { finishHotspotImp(key); renderLocationDetail(key); },
    addLocNote(key) {
      const notes = loadLocNotes(key); notes.push(''); saveLocNotesToStorage(key, notes); renderLocationDetail(key);
      setTimeout(() => { const inputs = document.querySelectorAll('#loc-notes-list input'); if (inputs.length) inputs[inputs.length-1].focus(); }, 50);
    },
    removeLocNote(key, index) {
      const notes = loadLocNotes(key); notes.splice(index, 1); saveLocNotesToStorage(key, notes); renderLocationDetail(key);
    },
    saveLocNotes(key) {
      const inputs = document.querySelectorAll('#loc-notes-list input');
      const notes = Array.from(inputs).map(i => i.value.trim()).filter(Boolean);
      saveLocNotesToStorage(key, notes);
      renderLocationDetail(key);
      // flash success on re-rendered button
      setTimeout(() => {
        const btn = document.querySelector(`button[onclick="window.ImprovementUI.saveLocNotes('${key}')"]`);
        if (btn) { btn.textContent = '✓ บันทึกแล้ว'; btn.classList.add('bg-emerald-700'); setTimeout(() => { btn.textContent = '💾 บันทึก'; btn.classList.remove('bg-emerald-700'); }, 1500); }
      }, 50);
    },
  };

})();
