// scripts/ui/dashboard.ui.js

const DashboardUI = (function () {
  let chartType       = null;
  let chartTrend      = null;
  let _hotspotMap     = null;
  let _hotspotClusters = [];
  let _currentYear    = new Date().getFullYear();
  let _currentMonth   = 0;
  let _minCount       = 2;

  const HOTSPOT_IMP_KEY = 'noc-hotspot-improvements';
  function loadHotspotImps() {
    try { return JSON.parse(localStorage.getItem(HOTSPOT_IMP_KEY) || '{}'); } catch { return {}; }
  }
  function saveHotspotImps(data) { localStorage.setItem(HOTSPOT_IMP_KEY, JSON.stringify(data)); }
  function isClusterImproved(centroid) {
    return Object.values(loadHotspotImps()).some(imp =>
      imp.status === 'finished' &&
      haversineKm(centroid.lat, centroid.lng, imp.lat, imp.lng) <= 0.5
    );
  }
  function getClusterImpStatus(centroid) {
    const imp = Object.values(loadHotspotImps()).find(i =>
      haversineKm(centroid.lat, centroid.lng, i.lat, i.lng) <= 0.5
    );
    return imp ? (imp.status || 'in_progress') : null;
  }
  function markHotspotImproved(cluster, actionNote, resolvedBy) {
    const key = `${cluster.centroid.lat.toFixed(5)}_${cluster.centroid.lng.toFixed(5)}`;
    const areas = cluster.incidents.map(i => i.nsFinish?.details?.area || '').filter(Boolean);
    const topArea = getMostCommon(areas) || `${cluster.centroid.lat.toFixed(4)}, ${cluster.centroid.lng.toFixed(4)}`;
    const imps = loadHotspotImps();
    imps[key] = {
      lat: cluster.centroid.lat, lng: cluster.centroid.lng,
      area: topArea, radiusKm: 1,
      incidentIds: cluster.incidents.map(i => i.incidentId || i.id || ''),
      incidentCount: cluster.incidents.length,
      actionNote: actionNote.trim(),
      resolvedBy: resolvedBy.trim() || 'NOC',
      resolvedAt: new Date().toISOString(),
      status: 'in_progress',
    };
    saveHotspotImps(imps);
  }

  const FINISH_STATUSES = ['NS_FINISH','COMPLETE','COMPLETED','FINISHED','CLOSED','RESOLVED','DONE'];
  const CANCEL_STATUSES  = ['CANCEL','CANCELLED'];

  // ── Utilities ────────────────────────────────────────────────────────────

  function destroyCharts() {
    if (chartType)  { try { chartType.destroy();  } catch (_) {} chartType  = null; }
    if (chartTrend) { try { chartTrend.destroy(); } catch (_) {} chartTrend = null; }
  }

  function destroyHotspotMap() {
    if (_hotspotMap) { try { _hotspotMap.remove(); } catch (_) {} _hotspotMap = null; }
  }

  function isActiveStatus(status) {
    const s = (status || '').toUpperCase();
    return !FINISH_STATUSES.includes(s) && !CANCEL_STATUSES.includes(s);
  }

  function isFinished(status) {
    return FINISH_STATUSES.includes((status || '').toUpperCase());
  }

  function isTodayIso(isoStr) {
    if (!isoStr) return false;
    const d = new Date(isoStr);
    if (isNaN(d)) return false;
    const now = new Date();
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth()    === now.getMonth()    &&
           d.getDate()     === now.getDate();
  }

  function inPeriod(isoStr, year, month) {
    if (!isoStr) return false;
    const d = new Date(isoStr);
    if (isNaN(d)) return false;
    if (d.getFullYear() !== year) return false;
    if (month !== 0 && d.getMonth() + 1 !== month) return false;
    return true;
  }

  function finishDate(item) {
    return item.nsFinish?.times?.upTime || item.completedAt || item.createdAt || '';
  }

  // ── Hotspot helpers ──────────────────────────────────────────────────────

  function parseLatlng(str) {
    const raw = String(str || '').trim();
    if (!raw) return null;
    const parts = raw.split(',').map(s => parseFloat(s.trim()));
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    if (Math.abs(parts[0]) > 90 || Math.abs(parts[1]) > 180) return null;
    return { lat: parts[0], lng: parts[1] };
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function getIncidentLatlng(inc) {
    const fromFinish = inc.nsFinish?.details?.latlng || '';
    if (fromFinish) return fromFinish;
    const updates = inc.updates || [];
    for (let i = updates.length - 1; i >= 0; i--) {
      if (updates[i]?.latlng) return updates[i].latlng;
    }
    return '';
  }

  function getMostCommon(arr) {
    if (!arr.length) return '';
    const freq = {};
    arr.forEach(v => { if (v) freq[v] = (freq[v] || 0) + 1; });
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }

  function formatDistance(raw) {
    const v = String(raw || '').trim();
    if (!v || v === '-') return '';
    const n = parseFloat(v.replace(/,/g, ''));
    if (!isFinite(n)) return v;
    return n >= 1000 ? `${(n / 1000).toFixed(2)} กม.` : `${n} ม.`;
  }

  function getSiteDistText(incidents) {
    const sites     = incidents.map(i => i.nsFinish?.details?.site     || '').filter(Boolean);
    const distances = incidents.map(i => i.nsFinish?.details?.distance || '').filter(Boolean);
    const topSite = getMostCommon(sites) || '';
    const topDist = getMostCommon(distances) || '';
    return { topSite, topDist, formatted: topSite ? `${topSite}${topDist ? ' ' + formatDistance(topDist) : ''}` : '' };
  }

  function clusterHotspots(incidents, radiusKm, minCount) {
    const clusters = [];
    incidents.forEach(inc => {
      // Strict: only use nsFinish.details.latlng — incidents without it have incomplete data
      const latlng = parseLatlng(inc.nsFinish?.details?.latlng || '');
      if (!latlng) return;

      let closest = null;
      let closestDist = Infinity;
      clusters.forEach(c => {
        const d = haversineKm(latlng.lat, latlng.lng, c.centroid.lat, c.centroid.lng);
        if (d <= radiusKm && d < closestDist) { closest = c; closestDist = d; }
      });

      if (closest) {
        closest.incidents.push(inc);
        const n = closest.incidents.length;
        closest.centroid.lat += (latlng.lat - closest.centroid.lat) / n;
        closest.centroid.lng += (latlng.lng - closest.centroid.lng) / n;
      } else {
        clusters.push({ centroid: { lat: latlng.lat, lng: latlng.lng }, incidents: [inc] });
      }
    });
    return clusters
      .filter(c => c.incidents.length >= minCount)
      .sort((a, b) => b.incidents.length - a.incidents.length);
  }

  function clusterColor(count) {
    if (count >= 10) return '#991b1b';
    if (count >= 6)  return '#ef4444';
    if (count >= 4)  return '#f97316';
    return '#fbbf24';
  }

  // ── KPI card ────────────────────────────────────────────────────────────

  function renderKPI(title, value, colorClass = 'text-orange-500', icon = 'activity', badge = '') {
    const card = document.createElement('div');
    card.className = 'panel p-3 md:p-6 flex items-center justify-between hover:shadow-md transition-all duration-200 relative overflow-hidden group';
    let iconBg = 'bg-slate-50', iconColor = 'text-slate-400';
    if (colorClass.includes('orange'))  { iconBg = 'bg-orange-50';  iconColor = 'text-orange-400'; }
    else if (colorClass.includes('rose'))    { iconBg = 'bg-rose-50';    iconColor = 'text-rose-400'; }
    else if (colorClass.includes('emerald')) { iconBg = 'bg-emerald-50'; iconColor = 'text-emerald-400'; }
    else if (colorClass.includes('sky'))     { iconBg = 'bg-sky-50';     iconColor = 'text-sky-400'; }
    const badgeHtml = badge
      ? `<span class="inline-block mt-0.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide" style="background:var(--surface-2);color:var(--ink-muted)">${badge}</span>`
      : '';
    card.innerHTML = `
      <div class="absolute top-0 right-0 w-16 h-16 md:w-24 md:h-24 ${iconBg} rounded-bl-[3rem] -mr-6 -mt-6 opacity-60 pointer-events-none group-hover:opacity-100 transition-opacity"></div>
      <div class="relative z-10">
        <p class="text-[9px] md:text-xs font-bold uppercase tracking-wider mb-0.5 md:mb-1" style="color:var(--ink-muted)">${title}</p>
        <h3 class="text-2xl md:text-3xl font-black ${colorClass}">${value}</h3>
        ${badgeHtml}
      </div>
      <div class="w-8 h-8 md:w-12 md:h-12 rounded-xl ${iconBg} flex items-center justify-center ${iconColor} relative z-10 border border-white/60">
        <i data-lucide="${icon}" class="w-4 h-4 md:w-6 md:h-6"></i>
      </div>
    `;
    return card;
  }

  // ── Chart helpers ────────────────────────────────────────────────────────

  function getMonthLabel(year, monthIndex) {
    return new Date(year, monthIndex, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }

  function buildChartData(state, year, month) {
    const fiberFinishedPeriod     = (state.corrective?.fiber     || []).filter(i => isFinished(i.status) && inPeriod(finishDate(i), year, month));
    const equipmentFinishedPeriod = (state.corrective?.equipment || []).filter(i => isFinished(i.status) && inPeriod(finishDate(i), year, month));

    const months = Array.from({ length: 12 }, (_, i) => ({
      label: getMonthLabel(year, i),
      monthNum: i + 1,
      count: 0,
    }));
    (state.corrective?.fiber || []).filter(i => isFinished(i.status)).forEach(i => {
      const d = new Date(finishDate(i));
      if (isNaN(d) || d.getFullYear() !== year) return;
      months[d.getMonth()].count++;
    });

    const displayMonths = month !== 0 ? months.filter(m => m.monthNum === month) : months;
    return {
      fiberCount:     fiberFinishedPeriod.length,
      equipmentCount: equipmentFinishedPeriod.length,
      months: displayMonths,
    };
  }

  function initCharts(state, year, month) {
    destroyCharts();
    if (typeof Chart === 'undefined') return;

    const { fiberCount, equipmentCount, months } = buildChartData(state, year, month);

    const ctxType = document.getElementById('dash-chart-type');
    if (ctxType && (fiberCount + equipmentCount) > 0) {
      chartType = new Chart(ctxType, {
        type: 'doughnut',
        data: {
          labels: ['Fiber', 'Equipment'],
          datasets: [{
            data: [fiberCount, equipmentCount],
            backgroundColor: ['#3b82f6', '#f59e0b'],
            borderColor: '#fff', borderWidth: 3, hoverOffset: 6,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '68%',
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11, weight: 'bold' }, padding: 16, usePointStyle: true } },
            tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} jobs` } },
          },
        },
      });
    }

    const ctxTrend = document.getElementById('dash-chart-trend');
    if (ctxTrend) {
      chartTrend = new Chart(ctxTrend, {
        type: 'bar',
        data: {
          labels: months.map(m => m.label),
          datasets: [{
            label: 'Fiber Closed',
            data: months.map(m => m.count),
            backgroundColor: months.map(m =>
              m.monthNum === new Date().getMonth() + 1 && year === new Date().getFullYear()
                ? '#f97316' : '#e2e8f0'),
            borderRadius: 8, borderSkipped: false,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} jobs` } } },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10, weight: '600' } } },
            y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } }, grid: { color: '#f1f5f9' } },
          },
        },
      });
    }
  }

  // ── Hotspot detail modal ─────────────────────────────────────────────────

  function showHotspotDetail(idx) {
    const cluster = _hotspotClusters[idx];
    if (!cluster) return;

    const count = cluster.incidents.length;
    const areas  = cluster.incidents.map(i => i.nsFinish?.details?.area || '').filter(Boolean);
    const topArea = getMostCommon(areas) || `${cluster.centroid.lat.toFixed(4)}, ${cluster.centroid.lng.toFixed(4)}`;
    const { topSite, topDist } = getSiteDistText(cluster.incidents);

    function fmtDate(iso) {
      if (!iso) return '-';
      const d = new Date(iso);
      return isNaN(d) ? '-' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
    }
    function fmtTime(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      return isNaN(d) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }
    function fmtDuration(downIso, upIso) {
      if (!downIso || !upIso) return '-';
      const ms = new Date(upIso) - new Date(downIso);
      if (ms <= 0 || isNaN(ms)) return '-';
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }

    const rows = cluster.incidents.map((inc, i) => {
      const d = inc.nsFinish?.details || {};
      const t = inc.nsFinish?.times   || {};
      const upTime   = t.upTime   || inc.completedAt || '';
      const downTime = inc.createdAt || '';
      const fcNo     = inc.incidentId || inc.id || '-';
      const tickets  = Array.isArray(inc.tickets) ? inc.tickets : [];
      const ticketNo = tickets[0]?.symphonyTicket || tickets[0]?.ticket || inc.ticketNo || '-';
      const cause    = d.cause   || '-';
      const area     = d.area    || '-';
      const site     = d.site    || '-';
      const dist     = d.distance ? formatDistance(d.distance) : '-';
      const latlng   = d.latlng  || getIncidentLatlng(inc);
      return `
        <tr style="border-bottom:1px solid var(--hair-soft)">
          <td class="px-3 py-2.5 text-center font-bold text-xs" style="color:var(--ink-muted)">${i + 1}</td>
          <td class="px-3 py-2.5">
            <div class="font-semibold text-xs" style="color:var(--ink)">${fmtDate(downTime)}</div>
            <div class="text-[10px]" style="color:var(--ink-muted)">${fmtTime(downTime)}</div>
          </td>
          <td class="px-3 py-2.5">
            <div class="text-xs font-mono" style="color:var(--accent)">${fcNo}</div>
            <div class="text-[10px]" style="color:var(--ink-muted)">${ticketNo !== '-' ? ticketNo : ''}</div>
          </td>
          <td class="px-3 py-2.5 text-xs max-w-[120px] truncate" style="color:var(--ink)" title="${area}">${area}</td>
          <td class="px-3 py-2.5">
            <div class="text-xs font-semibold" style="color:var(--ink)">${site}</div>
            <div class="text-xs font-bold" style="color:var(--sev-dn)">${dist !== '-' ? dist : ''}</div>
          </td>
          <td class="px-3 py-2.5 text-xs max-w-[120px] truncate" style="color:var(--ink)" title="${cause}">${cause}</td>
          <td class="px-3 py-2.5 text-xs whitespace-nowrap" style="color:var(--ink-muted)">${fmtDate(upTime)} ${fmtTime(upTime)}</td>
          <td class="px-3 py-2.5 text-center">
            <span class="text-xs font-bold" style="color:${fmtDuration(downTime, upTime) !== '-' ? '#3b82f6' : 'var(--ink-dim)'}">${fmtDuration(downTime, upTime)}</span>
          </td>
          <td class="px-3 py-2.5 text-[10px]" style="color:var(--ink-muted)">${latlng}</td>
        </tr>`;
    }).join('');

    const siteInfo = topSite
      ? `<span class="ml-3 text-xs" style="color:var(--ink-muted)">Site: <b style="color:var(--ink)">${topSite}</b>${topDist ? ` · <b style="color:var(--sev-dn)">${formatDistance(topDist)}</b>` : ''}</span>`
      : '';

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop flex items-center justify-center p-4';
    modal.style.zIndex = '200';
    modal.innerHTML = `
      <div class="rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[88vh] overflow-hidden" style="background:var(--surface)">
        <!-- Header -->
        <div class="px-6 py-4 flex items-start justify-between shrink-0" style="border-bottom:1px solid var(--hair-soft);background:var(--surface-2)">
          <div>
            <p class="text-[10px] font-bold uppercase tracking-widest mb-0.5" style="color:var(--ink-muted)">Hotspot Detail · #${idx + 1}</p>
            <h3 class="text-base font-black" style="color:var(--ink)">${topArea}</h3>
            <div class="flex items-center gap-2 mt-1">
              <span class="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full" style="background:rgba(220,38,38,.1);color:var(--sev-dn)">
                <span>${count} incidents</span>
              </span>
              ${siteInfo}
            </div>
          </div>
          <button id="hotspot-modal-close" class="icon-btn">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>
        <!-- Table -->
        <div class="overflow-auto flex-1">
          <table class="w-full text-sm">
            <thead class="sticky top-0 z-10" style="background:var(--surface-2)">
              <tr>
                <th class="px-3 py-2 text-center text-[10px] font-bold uppercase" style="color:var(--ink-muted)">#</th>
                <th class="px-3 py-2 text-left text-[10px] font-bold uppercase" style="color:var(--ink-muted)">Down Time</th>
                <th class="px-3 py-2 text-left text-[10px] font-bold uppercase" style="color:var(--ink-muted)">FC / Ticket</th>
                <th class="px-3 py-2 text-left text-[10px] font-bold uppercase" style="color:var(--ink-muted)">Area</th>
                <th class="px-3 py-2 text-left text-[10px] font-bold uppercase" style="color:var(--ink-muted)">Site → ระยะ</th>
                <th class="px-3 py-2 text-left text-[10px] font-bold uppercase" style="color:var(--ink-muted)">Cause</th>
                <th class="px-3 py-2 text-left text-[10px] font-bold uppercase" style="color:var(--ink-muted)">Up Time</th>
                <th class="px-3 py-2 text-center text-[10px] font-bold uppercase" style="color:var(--ink-muted)">Duration</th>
                <th class="px-3 py-2 text-left text-[10px] font-bold uppercase" style="color:var(--ink-muted)">Lat/Long</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <!-- Footer -->
        <div class="px-6 py-3 shrink-0 flex items-center justify-between" style="border-top:1px solid var(--hair-soft);background:var(--surface-2)">
          <span class="text-xs" style="color:var(--ink-muted)">Cluster centroid: ${cluster.centroid.lat.toFixed(5)}, ${cluster.centroid.lng.toFixed(5)} · radius 1 km</span>
          <button id="hotspot-mark-btn" class="btn btn-sm flex items-center gap-1.5" style="background:#22c55e;color:#fff;border-color:#22c55e">
            <i data-lucide="shield-check" class="w-3.5 h-3.5"></i> Mark as Improved
          </button>
        </div>
        <div id="hotspot-improve-form" class="hidden px-6 py-4 shrink-0" style="border-top:1px solid rgba(34,197,94,.2);background:rgba(34,197,94,.04)">
          <p class="text-xs font-bold uppercase tracking-wide mb-3" style="color:#16a34a">Mark Location as Improved</p>
          <div class="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label class="text-xs font-semibold block mb-1" style="color:var(--ink)">Action taken</label>
              <textarea id="hotspot-action-note" rows="2" class="form-input w-full resize-none" placeholder="เช่น ฝังสายใหม่, เปลี่ยนท่อร้อยสาย..."></textarea>
            </div>
            <div>
              <label class="text-xs font-semibold block mb-1" style="color:var(--ink)">Resolved by</label>
              <input id="hotspot-resolved-by" type="text" class="form-input w-full" placeholder="ชื่อผู้ดำเนินการ">
            </div>
          </div>
          <div class="flex gap-2 justify-end">
            <button id="hotspot-form-cancel" class="btn btn-sm btn-ghost">Cancel</button>
            <button id="hotspot-form-confirm" class="btn btn-sm" style="background:#22c55e;color:#fff;border-color:#22c55e">✓ Confirm Improvement</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    if (window.lucide) window.lucide.createIcons();

    const close = () => { try { document.body.removeChild(modal); } catch (_) {} };
    const innerCard = modal.querySelector('.rounded-2xl');
    innerCard?.addEventListener('click', e => e.stopPropagation());
    modal.addEventListener('click', close);
    modal.querySelector('#hotspot-modal-close').addEventListener('click', e => { e.stopPropagation(); close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });

    // Mark as Improved
    const markBtn  = modal.querySelector('#hotspot-mark-btn');
    const form     = modal.querySelector('#hotspot-improve-form');
    const cancelBtn  = modal.querySelector('#hotspot-form-cancel');
    const confirmBtn = modal.querySelector('#hotspot-form-confirm');
    markBtn?.addEventListener('click', e => {
      e.stopPropagation();
      form?.classList.toggle('hidden');
      markBtn.textContent = form?.classList.contains('hidden') ? 'Mark as Improved' : 'Cancel';
    });
    cancelBtn?.addEventListener('click', e => {
      e.stopPropagation();
      form?.classList.add('hidden');
      markBtn.innerHTML = '<i data-lucide="shield-check" class="w-3.5 h-3.5 inline-block mr-1"></i>Mark as Improved';
    });
    confirmBtn?.addEventListener('click', e => {
      e.stopPropagation();
      const note = modal.querySelector('#hotspot-action-note')?.value || '';
      const by   = modal.querySelector('#hotspot-resolved-by')?.value  || '';
      markHotspotImproved(cluster, note, by);
      close();
      // Re-render hotspot section to remove the resolved cluster
      const hotspotEl = document.getElementById('dash-hotspot-section');
      if (hotspotEl) {
        const state = window.Store?.getState();
        const y = _currentYear; const m = _currentMonth;
        if (state) renderHotspotsSection(hotspotEl.closest('.space-y-4, .space-y-6') || document.body, state, y, m, _minCount);
      }
    });
  }

  // ── Hotspot section ──────────────────────────────────────────────────────

  function initHotspotMap(clusters) {
    destroyHotspotMap();
    if (typeof L === 'undefined') return;
    const mapEl = document.getElementById('dash-hotspot-map');
    if (!mapEl) return;

    // Default center: Thailand
    const defaultCenter = [13.75, 100.52];
    _hotspotMap = L.map('dash-hotspot-map', { zoomControl: true, scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 18,
    }).addTo(_hotspotMap);

    if (!clusters.length) {
      _hotspotMap.setView(defaultCenter, 10);
      return;
    }

    const leafletMarkers = [];

    clusters.forEach((cluster, idx) => {
      const { lat, lng } = cluster.centroid;
      const count = cluster.incidents.length;
      const color = clusterColor(count);
      const areas = cluster.incidents.map(i => i.nsFinish?.details?.area || '').filter(Boolean);
      const topArea = getMostCommon(areas) || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      const causes  = cluster.incidents.map(i => i.nsFinish?.details?.cause || '').filter(Boolean);
      const topCause = getMostCommon(causes) || '-';
      const { topSite, topDist, formatted: siteDistFmt } = getSiteDistText(cluster.incidents);

      // Circle marker sized by count (800m–2000m visual radius)
      const circle = L.circle([lat, lng], {
        color,
        fillColor: color,
        fillOpacity: 0.35,
        weight: 2,
        radius: Math.min(2000, 800 + count * 120),
      }).addTo(_hotspotMap);

      // Number label
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:${color};color:#fff;font-weight:900;font-size:13px;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">${count}</div>`,
        iconSize: [28, 28], iconAnchor: [14, 14],
      });
      const marker = L.marker([lat, lng], { icon }).addTo(_hotspotMap);
      const siteRow = siteDistFmt
        ? `<tr><td style="color:#64748b;padding-right:6px;white-space:nowrap">ระยะจาก Site:</td><td><b>${topSite}</b>${topDist ? ` ระยะ <b>${formatDistance(topDist)}</b>` : ''}</td></tr>`
        : '';
      marker.bindPopup(`
        <b>#${idx + 1} ${topArea}</b>
        <table style="margin-top:4px;font-size:12px;border-collapse:collapse">
          <tr><td style="color:#64748b;padding-right:6px">เหตุการณ์:</td><td><b>${count} ครั้ง</b></td></tr>
          ${siteRow}
          <tr><td style="color:#64748b;padding-right:6px">สาเหตุหลัก:</td><td>${topCause}</td></tr>
          <tr><td style="color:#64748b;padding-right:6px;font-size:10px">พิกัด:</td><td style="font-size:10px">${lat.toFixed(5)}, ${lng.toFixed(5)}</td></tr>
        </table>
      `, { minWidth: 200 });

      leafletMarkers.push({ circle, marker, lat, lng });

      // Map marker click → flyTo + popup (row click handled via delegation below)
      marker.on('click', () => {
        _hotspotMap.flyTo([lat, lng], 14, { duration: 0.6 });
      });
    });

    // Fit map to all markers
    const bounds = L.latLngBounds(clusters.map(c => [c.centroid.lat, c.centroid.lng]));
    _hotspotMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
  }

  function renderHotspotsSection(container, state, y, m, minCount) {
    // Hotspot uses FINISHED fiber only — active incidents have no nsFinish.details
    const fiberInPeriod = (state.corrective?.fiber || []).filter(inc => {
      if (!isFinished(inc.status)) return false;
      return inPeriod(finishDate(inc), y, m);
    });

    const clustersRaw = clusterHotspots(fiberInPeriod, 1, minCount);
    const clusters = clustersRaw.filter(c => !isClusterImproved(c.centroid));
    _hotspotClusters = clusters;
    const hasLatlng = fiberInPeriod.some(i => !!parseLatlng(getIncidentLatlng(i)));
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const periodLabel = m !== 0 ? `${MONTH_NAMES[m - 1]} ${y}` : `${y}`;

    const hotspotEl = document.getElementById('dash-hotspot-section');
    if (!hotspotEl) return;

    if (!hasLatlng) {
      hotspotEl.innerHTML = `
        <div class="panel p-6 text-center" style="color:var(--ink-muted)">
          <i data-lucide="map-pin-off" class="w-10 h-10 mx-auto mb-3" style="color:var(--ink-dim)"></i>
          <p class="font-bold text-sm">No location data in this period</p>
          <p class="text-xs mt-1">Fill in Lat/Long during NS Finish to enable hotspot analysis</p>
        </div>`;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    const countBadge = count => {
      const cls = count >= 6 ? 'bg-red-600 text-white' : count >= 4 ? 'bg-red-100 text-red-700' : count >= 3 ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700';
      return `<span class="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black ${cls}">${count}</span>`;
    };

    hotspotEl.innerHTML = `
      <div class="panel overflow-hidden">
        <div class="flex items-center justify-between px-4 md:px-6 py-4" style="border-bottom:1px solid var(--hair-soft)">
          <div>
            <p class="text-[10px] font-bold uppercase tracking-widest" style="color:var(--ink-muted)">Hotspot Analysis · ${periodLabel} · radius 1 km</p>
            <h4 class="text-sm font-black" style="color:var(--ink)">Locations with Repeated Incidents</h4>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-xs font-semibold" style="color:var(--ink-muted)">Min. count</label>
            <select id="dash-hotspot-min" class="form-input text-sm font-semibold" style="height:32px;padding:0 8px">
              <option value="2" ${minCount === 2 ? 'selected' : ''}>≥ 2</option>
              <option value="3" ${minCount === 3 ? 'selected' : ''}>≥ 3</option>
              <option value="5" ${minCount === 5 ? 'selected' : ''}>≥ 5</option>
            </select>
            <div class="w-8 h-8 bg-rose-50 rounded-xl flex items-center justify-center">
              <i data-lucide="flame" class="w-4 h-4 text-rose-400"></i>
            </div>
          </div>
        </div>

        ${clusters.length === 0 ? `
          <div class="p-10 text-center" style="color:var(--ink-muted)">
            <i data-lucide="map-pin" class="w-10 h-10 mx-auto mb-3" style="color:var(--ink-dim)"></i>
            <p class="font-bold text-sm">No hotspots found</p>
            <p class="text-xs mt-1">No location has ≥ ${minCount} incidents within 1 km in this period</p>
          </div>` : `
        <div class="grid grid-cols-1 lg:grid-cols-5 min-h-[360px]">

          <!-- Table -->
          <div class="lg:col-span-2 overflow-auto" style="border-right:1px solid var(--hair-soft)">
            <table class="w-full text-sm">
              <thead class="sticky top-0 z-10" style="background:var(--surface-2)">
                <tr>
                  <th class="px-3 py-2 text-left text-[10px] font-bold uppercase" style="color:var(--ink-muted)">#</th>
                  <th class="px-3 py-2 text-left text-[10px] font-bold uppercase" style="color:var(--ink-muted)">Count</th>
                  <th class="px-3 py-2 text-left text-[10px] font-bold uppercase" style="color:var(--ink-muted)">Area</th>
                  <th class="px-3 py-2 text-left text-[10px] font-bold uppercase" style="color:var(--ink-muted)">Site → ระยะ</th>
                  <th class="px-3 py-2 text-left text-[10px] font-bold uppercase" style="color:var(--ink-muted)">Cause</th>
                  <th class="px-3 py-2 text-left text-[10px] font-bold uppercase" style="color:var(--ink-muted)">Last</th>
                </tr>
              </thead>
              <tbody>
                ${clusters.map((c, idx) => {
                  const areas  = c.incidents.map(i => i.nsFinish?.details?.area || '').filter(Boolean);
                  const causes = c.incidents.map(i => i.nsFinish?.details?.cause || '').filter(Boolean);
                  const topArea  = getMostCommon(areas)  || `${c.centroid.lat.toFixed(4)}, ${c.centroid.lng.toFixed(4)}`;
                  const topCause = getMostCommon(causes) || '-';
                  const dates = c.incidents.map(i => new Date(finishDate(i) || i.createdAt || '')).filter(d => !isNaN(d));
                  const lastDate = dates.length ? new Date(Math.max(...dates)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '-';
                  const { topSite: rowSite, topDist: rowDist, formatted: rowSiteDist } = getSiteDistText(c.incidents);
                  const siteCell = rowSite
                    ? `<div class="font-semibold truncate" style="color:var(--ink)">${rowSite}</div>${rowDist ? `<div class="font-bold" style="color:var(--sev-dn)">${formatDistance(rowDist)}</div>` : ''}`
                    : `<span style="color:var(--ink-dim)">-</span>`;
                  const impStatus = getClusterImpStatus(c.centroid);
                  const inProgressBadge = impStatus === 'in_progress'
                    ? `<span class="ml-1 text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">กำลังดำเนินการ</span>`
                    : '';
                  return `<tr id="hotspot-row-${idx}" class="hotspot-tr hover:bg-orange-50 transition-colors" style="border-bottom:1px solid var(--hair-soft)">
                    <td class="px-3 py-2.5 font-bold" style="color:var(--ink-muted)">${idx + 1}</td>
                    <td class="px-3 py-2.5">${countBadge(c.incidents.length)}</td>
                    <td class="px-3 py-2.5 font-semibold max-w-[120px]" style="color:var(--ink)" title="${topArea}"><span class="truncate block">${topArea}</span>${inProgressBadge}</td>
                    <td class="px-3 py-2.5 text-xs max-w-[120px]" title="${rowSiteDist}">${siteCell}</td>
                    <td class="px-3 py-2.5 text-xs max-w-[100px] truncate" style="color:var(--ink-muted)" title="${topCause}">${topCause}</td>
                    <td class="px-3 py-2.5 text-xs whitespace-nowrap" style="color:var(--ink-muted)">${lastDate}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>

          <!-- Map -->
          <div class="lg:col-span-3 relative">
            <div id="dash-hotspot-map" style="height:360px;width:100%;z-index:0;"></div>
          </div>
        </div>`}
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    // Event delegation on tbody — single listener, no duplicate risk
    const tbody = hotspotEl.querySelector('tbody');
    if (tbody) {
      tbody.addEventListener('click', e => {
        const row = e.target.closest('.hotspot-tr');
        if (!row) return;
        const idx = parseInt(row.id.replace('hotspot-row-', ''), 10);
        if (isNaN(idx)) return;
        document.querySelectorAll('.hotspot-tr').forEach(r => r.classList.remove('bg-orange-50'));
        row.classList.add('bg-orange-50');
        showHotspotDetail(idx);
      });
    }

    // Min count change → re-render hotspot section (clusters + map rebuild together)
    document.getElementById('dash-hotspot-min')?.addEventListener('change', e => {
      _minCount = Number(e.target.value);
      renderHotspotsSection(container, state, y, m, _minCount);
    });

    if (clusters.length) {
      setTimeout(() => initHotspotMap(clusters), 0);
    }
  }

  // ── Main render ──────────────────────────────────────────────────────────

  function render(state, year, month) {
    const y = year  || _currentYear;
    const m = month !== undefined ? month : _currentMonth;

    destroyCharts();
    destroyHotspotMap();

    const container = document.createElement('div');
    container.className = 'space-y-4 md:space-y-6 fade-in';

    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const periodLabel = m !== 0 ? `${MONTH_NAMES[m - 1]} ${y}` : `${y}`;

    // Period-filtered
    const fiberFinishedPeriod     = (state.corrective?.fiber     || []).filter(i => isFinished(i.status) && inPeriod(finishDate(i), y, m));
    const equipmentFinishedPeriod = (state.corrective?.equipment || []).filter(i => isFinished(i.status) && inPeriod(finishDate(i), y, m));

    // Live
    const allCorrective   = [...(state.corrective?.fiber || []), ...(state.corrective?.equipment || []), ...(state.corrective?.other || [])];
    const activeCorrective = allCorrective.filter(i => isActiveStatus(i.status));
    const activeFiber      = (state.corrective?.fiber || []).filter(i => isActiveStatus(i.status));

    const { fiberCount, equipmentCount } = buildChartData(state, y, m);
    const donutTotal = fiberCount + equipmentCount;

    // Years in data
    const yearsInData = new Set();
    const now = new Date();
    for (let i = 0; i <= 2; i++) yearsInData.add(now.getFullYear() - i);
    [...(state.corrective?.fiber || []), ...(state.corrective?.equipment || [])].forEach(i => {
      const d = new Date(finishDate(i));
      if (!isNaN(d)) yearsInData.add(d.getFullYear());
    });
    const years = [...yearsInData].sort((a, b) => b - a);

    // Filter bar
    const filterBar = document.createElement('div');
    filterBar.className = 'flex items-center gap-2 flex-wrap';
    filterBar.innerHTML = `
      <span class="text-xs font-bold uppercase tracking-wider" style="color:var(--ink-muted)">Period:</span>
      <select id="dash-filter-year" class="form-input text-sm font-semibold" style="height:34px;padding:0 10px">
        ${years.map(yr => `<option value="${yr}" ${yr === y ? 'selected' : ''}>${yr}</option>`).join('')}
      </select>
      <select id="dash-filter-month" class="form-input text-sm font-semibold" style="height:34px;padding:0 10px">
        <option value="0" ${m === 0 ? 'selected' : ''}>All Months</option>
        ${MONTH_NAMES.map((name, i) => `<option value="${i+1}" ${m === i+1 ? 'selected' : ''}>${name}</option>`).join('')}
      </select>
    `;
    container.appendChild(filterBar);

    // KPI row
    const kpiRow = document.createElement('div');
    kpiRow.className = 'grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4';
    kpiRow.appendChild(renderKPI('Fiber Closed',        fiberFinishedPeriod.length,     'text-emerald-500', 'check-circle-2',  periodLabel));
    kpiRow.appendChild(renderKPI('Equip Closed',        equipmentFinishedPeriod.length, 'text-sky-500',     'package-check',   periodLabel));
    kpiRow.appendChild(renderKPI('Active Corrective',   activeCorrective.length,        'text-orange-500',  'activity',        'Live'));
    kpiRow.appendChild(renderKPI('DN (Fiber)',           activeFiber.length,             'text-rose-500',    'alert-triangle',  'Live'));
    container.appendChild(kpiRow);

    // Charts row
    const chartsRow = document.createElement('div');
    chartsRow.className = 'grid grid-cols-1 md:grid-cols-2 gap-4';
    chartsRow.innerHTML = `
      <div class="panel p-4 md:p-6">
        <div class="flex items-center justify-between mb-4">
          <div>
            <p class="text-[10px] font-bold uppercase tracking-widest" style="color:var(--ink-muted)">Closed · ${periodLabel}</p>
            <h4 class="text-sm font-black" style="color:var(--ink)">Fiber vs Equipment</h4>
          </div>
          <div class="w-8 h-8 bg-orange-50 rounded-xl flex items-center justify-center">
            <i data-lucide="pie-chart" class="w-4 h-4 text-orange-400"></i>
          </div>
        </div>
        <div class="h-48 md:h-56 flex items-center justify-center">
          ${donutTotal === 0
            ? `<div class="text-center" style="color:var(--ink-dim)"><i data-lucide="inbox" class="w-10 h-10 mx-auto mb-2"></i><p class="text-xs font-bold">No data for this period</p></div>`
            : `<canvas id="dash-chart-type"></canvas>`}
        </div>
      </div>
      <div class="panel p-4 md:p-6">
        <div class="flex items-center justify-between mb-4">
          <div>
            <p class="text-[10px] font-bold uppercase tracking-widest" style="color:var(--ink-muted)">Trend · ${y}${m !== 0 ? ' · ' + MONTH_NAMES[m-1] : ''}</p>
            <h4 class="text-sm font-black" style="color:var(--ink)">Fiber Closed per Month</h4>
          </div>
          <div class="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center">
            <i data-lucide="bar-chart-2" class="w-4 h-4 text-emerald-400"></i>
          </div>
        </div>
        <div class="h-48 md:h-56">
          <canvas id="dash-chart-trend"></canvas>
        </div>
      </div>
    `;
    container.appendChild(chartsRow);

    // Hotspot section placeholder
    const hotspotWrapper = document.createElement('div');
    hotspotWrapper.id = 'dash-hotspot-section';
    container.appendChild(hotspotWrapper);

    setTimeout(() => {
      if (window.lucide) window.lucide.createIcons();
      initCharts(state, y, m);
      renderHotspotsSection(container, state, y, m, _minCount);

      const yearSel  = document.getElementById('dash-filter-year');
      const monthSel = document.getElementById('dash-filter-month');
      const onChange = () => {
        _currentYear  = Number(yearSel?.value  || new Date().getFullYear());
        _currentMonth = Number(monthSel?.value || 0);
        const viewEl = document.getElementById('view-dashboard');
        if (viewEl) {
          viewEl.innerHTML = '';
          viewEl.appendChild(DashboardUI.render(window.Store.getState(), _currentYear, _currentMonth));
        }
      };
      yearSel?.addEventListener('change', onChange);
      monthSel?.addEventListener('change', onChange);
    }, 0);

    return container;
  }

  return { render };

})();

window.DashboardUI = DashboardUI;
