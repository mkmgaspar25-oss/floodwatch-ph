'use strict';
/* FloodWatch PH front-end. Sections: utilities · state · map · data loaders · renderers · route planner · reports · settings · boot */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

// ---------- icons (inline SVG, one consistent style) ----------
const ICONS = {
  'cloud-rain':'<line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/><line x1="12" y1="15" x2="12" y2="23"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>',
  pin:'<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  search:'<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  bell:'<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  moon:'<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  sun:'<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
  sliders:'<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  alert:'<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  navigation:'<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  flag:'<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  target:'<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  swap:'<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  x:'<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  layers:'<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  clock:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  droplet:'<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
  wind:'<path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>',
  eye:'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  link:'<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  check:'<polyline points="20 6 9 17 4 12"/>',
  info:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
};
const icon = (n, c = '') => `<svg class="ic ${c}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;
$$('[data-i]').forEach(el => el.innerHTML = icon(el.dataset.i));

// ---------- constants / helpers ----------
const COL = {low:'#16a34a', moderate:'#f59e0b', high:'#f97316', severe:'#ef4444', none:'#94a3b8'};
const LVN = {Low:'Low', Moderate:'Moderate', High:'High', Severe:'Critical'};      // data says "Severe"; UI says "Critical"
const lvName = l => LVN[cap(String(l))] || l;
const lvKey = l => { const k = String(l || '').toLowerCase(); return !k || k.startsWith('insuff') ? 'none' : k; };
const lvl = l => `<span class="lvl lv-${lvKey(l)}">${esc(lvName(l))}</span>`;
const WX = {0:'Clear',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Rime fog',51:'Light drizzle',53:'Drizzle',55:'Dense drizzle',61:'Light rain',63:'Moderate rain',65:'Heavy rain',66:'Freezing rain',67:'Freezing rain',80:'Light showers',81:'Showers',82:'Violent showers',95:'Thunderstorm',96:'Thunderstorm, hail',99:'Thunderstorm, heavy hail'};
const wxi = c => c === 0 ? '☀️' : c === 1 ? '🌤️' : c === 2 ? '⛅' : c === 3 ? '☁️' : (c === 45 || c === 48) ? '🌫️' : c >= 95 ? '⛈️' : (c >= 51 && c <= 57) || c === 80 || c === 81 ? '🌦️' : c >= 61 ? '🌧️' : '🌥️';
const DIRS = ['N','NE','E','SE','S','SW','W','NW'];
const rainCat = mm => mm > 30 ? 'Torrential' : mm >= 15 ? 'Intense' : mm >= 7.5 ? 'Heavy' : mm >= 2.5 ? 'Moderate' : mm >= .1 ? 'Light' : 'None';
const fmt = (iso, o = {}) => iso ? new Date(iso).toLocaleString('en-PH', {timeZone:'Asia/Manila', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', ...o}) : '—';
const hav = (a, b, c, d) => { const r = x => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
const coordLabel = ll => `${ll[0].toFixed(5)}, ${ll[1].toFixed(5)}`;
const skel = h => `<div class="skel" style="height:${h}px"></div>`;
const inflight = {};
function api(path, opts) {
  if (!opts && inflight[path]) return inflight[path];                         // de-duplicate identical GETs
  const p = fetch(path, opts).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.detail?.[0]?.msg || j.detail || r.statusText); return j; }).finally(() => delete inflight[path]);
  if (!opts) inflight[path] = p; return p;
}
function toast(t, sev = 'high') { const d = document.createElement('div'); d.className = 'toast'; d.style.borderLeftColor = COL[sev] || COL.high; d.textContent = t; $('#toasts').append(d); setTimeout(() => d.remove(), 7000); }

// ---------- state / prefs ----------
const prefs = {minSev:0, mon:null, notify:false, motion:true, legend:true, theme:'auto', ...JSON.parse(localStorage.fwPrefs || '{}')};
const savePrefs = () => localStorage.fwPrefs = JSON.stringify(prefs);
const S = {loc:{name:'Manila', lat:14.5995, lon:120.9842}, pick:null, areas:[], areaById:{}, reports:[], alerts:[], w:null, wErr:null, risk:null, riskErr:null, hist:null, pagasa:null, charts:{},
  route:{list:[], sel:0}, rpt:null, rptName:null, alertF:{sev:'all', st:'active'}};
const isAdmin = () => !!sessionStorage.adm;

// ---------- weather-responsive background (visual layer only; follows the weather code of the selected location) ----------
const BG = $('.bg');
BG.innerHTML = ['clear', 'partly', 'cloudy', 'fog', 'drizzle', 'rain', 'storm'].map(k => `<i class="sky s-${k}"></i>`).join('') + '<i class="veil"></i><i class="sun"></i>'
  + [1, 2, 3, 4, 5].map(n => `<i class="cloud c${n}"></i>`).join('') + '<i class="fog f1"></i><i class="fog f2"></i><i class="drops d1"></i><i class="drops d2"></i><i class="bolt"></i>';
BG.dataset.wx = 'none'; BG.dataset.heavy = '0';                      // neutral look until real weather arrives
const wxKind = c => c === 0 || c === 1 ? 'clear' : c === 2 ? 'partly' : c === 45 || c === 48 ? 'fog' : c >= 51 && c <= 57 ? 'drizzle'
  : (c >= 61 && c <= 67) || (c >= 80 && c <= 82) ? 'rain' : c >= 95 ? 'storm' : 'cloudy';                // WMO codes from the weather API; anything else = cloudy
function setWeatherBg(code) {
  if (typeof code !== 'number') return;                              // no data: keep the last valid background
  BG.dataset.wx = wxKind(code); BG.dataset.heavy = [65, 67, 82, 95, 96, 99].includes(code) ? '1' : '0';
}

// ---------- Open-Meteo direct fallback ----------
// The free weather API limits requests per IP address, and shared hosting IPs can hit that limit (HTTP 429). When our server is refused,
// the visitor's browser asks Open-Meteo itself, and our server only validates/analyses that forecast for that one response (nothing stored or shared).
const OM = 'https://api.open-meteo.com/v1/forecast';
const OM_Q = 'timezone=Asia%2FManila&past_days=1&forecast_days=7&wind_speed_unit=kmh&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m'
  + '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,visibility&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max';
const g1 = v => Math.round(v * 10) / 10, rawCache = {};
function omRaw(points) {                                              // points: [[lat, lon], ...] → Promise of one raw forecast per point
  const key = points.join(';'), hit = rawCache[key]; if (hit && Date.now() - hit.t < 10 * 60e3) return hit.p;
  const p = fetch(`${OM}?latitude=${points.map(q => q[0]).join(',')}&longitude=${points.map(q => q[1]).join(',')}&${OM_Q}`)
    .then(async r => { if (!r.ok) throw new Error(`Open-Meteo answered ${r.status}`); const j = await r.json(); return Array.isArray(j) ? j : [j]; });
  rawCache[key] = {t:Date.now(), p}; p.catch(() => delete rawCache[key]); return p;
}
const post = (path, body) => api(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});

function applyTheme() {
  const t = prefs.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : prefs.theme;
  document.documentElement.dataset.theme = t;
  $('#theme').innerHTML = icon(t === 'dark' ? 'sun' : 'moon');
  const cs = getComputedStyle(document.documentElement);
  Chart.defaults.color = cs.getPropertyValue('--muted').trim() || '#587083'; Chart.defaults.borderColor = cs.getPropertyValue('--line').trim() || 'rgba(0,0,0,.1)';
  if (S.w) drawForecastCharts(); if (S.hist) drawHistCharts();
}
const applyMotion = () => document.body.classList.toggle('nomotion', !prefs.motion);

// ---------- map ----------
const map = L.map('map').setView([S.loc.lat, S.loc.lon], 12);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'© OpenStreetMap contributors'}).addTo(map);
const G = {areas:L.markerClusterGroup({maxClusterRadius:45}), reports:L.markerClusterGroup({maxClusterRadius:45}), closures:L.layerGroup(), warnings:L.layerGroup(), radar:null,
  sel:L.layerGroup().addTo(map), route:L.layerGroup().addTo(map), routeHz:L.layerGroup().addTo(map), ep:L.layerGroup().addTo(map), rep:L.layerGroup().addTo(map)};
['areas', 'reports', 'warnings'].forEach(k => map.addLayer(G[k]));
const LAYERS = [['radar','cloud-rain','Radar',false],['areas','droplet','Flood-prone',true],['reports','flag','Reports',true],['warnings','alert','Warnings',true],['closures','x','Closures',false],
  ['stations','layers','River stations',null,'No data source is connected'],['evac','pin','Evacuation centers',null,'No reliable dataset is configured']];
$('#layers').innerHTML = LAYERS.map(([k, ic, n, on, why]) => `<button class="chip" data-l="${k}" aria-pressed="${!!on}" ${on === null ? `disabled title="${esc(why)}"` : ''}>${icon(ic)}${n}</button>`).join('');
$('#layers').onclick = async e => {
  const b = e.target.closest('[data-l]'); if (!b || b.disabled) return;
  const k = b.dataset.l, on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on);
  if (k === 'radar') { if (on) await loadRadar(); else if (G.radar) map.removeLayer(G.radar); return; }
  on ? map.addLayer(G[k]) : map.removeLayer(G[k]);
};
function renderLegend() {
  const L_ = $('#legend'); L_.hidden = !prefs.legend;
  L_.innerHTML = `<details open><summary>Legend</summary>
   <div><span class="sw" style="background:${COL.low}"></span>Low estimated risk</div><div><span class="sw" style="background:${COL.moderate}"></span>Moderate</div>
   <div><span class="sw" style="background:${COL.high}"></span>High</div><div><span class="sw" style="background:${COL.severe}"></span>Critical / official warning</div>
   <div><span class="sw" style="background:${COL.none}"></span>Insufficient data</div>
   <div>${icon('droplet')} Teardrop pin: historically flood-prone area (not necessarily flooded now)</div><div>◆ Diamond: community report (colour = review status)</div>
   <div><span class="sw" style="background:#2563eb"></span>Route · A origin · B destination</div></details>`;
}
const pinIcon = (color, glyph, cls = '', round = false) => L.divIcon({className:'', html:`<div class="pin ${cls}" style="--c:${color}"><span>${glyph}</span></div>`,
  iconSize:round ? [24, 24] : [30, 30], iconAnchor:round ? [12, 12] : [15, 36], popupAnchor:round ? [0, -12] : [0, -34]});
async function loadRadar() {
  try { const r = await api('/api/radar'); if (G.radar) map.removeLayer(G.radar);
    G.radar = L.tileLayer(r.tile_url, {opacity:.6, attribution:r.attribution, maxNativeZoom:7}).addTo(map); toast('Radar frame time: ' + fmt(r.frame_time), 'low');
  } catch (e) { toast('Radar unavailable: ' + e.message, 'moderate'); $('[data-l=radar]').setAttribute('aria-pressed', 'false'); }
}

// ---------- pick mode (origin / destination / report) ----------
const PICKMSG = {o:'Click the map to choose your origin', d:'Click the map to choose your destination', r:'Click the map where flooding is seen'};
function setPick(k) {
  S.pick = k; $('#map').classList.toggle('picking', !!k); $('#pickbar').hidden = !k; $('#pickMsg').textContent = PICKMSG[k] || '';
  $('#cardO').classList.toggle('active', k === 'o'); $('#cardD').classList.toggle('active', k === 'd');
  if (k) { map.closePopup(); if (innerWidth <= 1000) $('#mapwrap').scrollIntoView({behavior:'smooth', block:'center'}); }
}
$('#pickCancel').onclick = () => setPick(null);
addEventListener('keydown', e => { if (e.key === 'Escape') setPick(null); });
map.on('click', e => {
  const ll = [e.latlng.lat, e.latlng.lng], k = S.pick;
  if (!k) return pickLoc(ll[0], ll[1]);
  setPick(null);                                             // exit picking automatically; only the active field changes
  if (k === 'o' || k === 'd') { setEndpoint(k, ll, coordLabel(ll), null, true); if (innerWidth <= 1000) $('#card' + k.toUpperCase()).scrollIntoView({behavior:'smooth', block:'center'}); }
  else setReportPoint(ll);
});

// ---------- location ----------
function pickLoc(lat, lon, name) { selectLocation({name:name || `Pinned ${lat.toFixed(3)}, ${lon.toFixed(3)}`, lat, lon}); }
async function selectLocation(loc) {
  S.loc = loc; $('#locName').textContent = loc.name; map.flyTo([loc.lat, loc.lon], Math.max(map.getZoom(), 12));
  G.sel.clearLayers(); L.marker([loc.lat, loc.lon], {icon:L.divIcon({className:'', html:'<div class="selring"></div>', iconSize:[22, 22], iconAnchor:[11, 11]}), interactive:false}).addTo(G.sel);
  S.w = S.risk = null; S.wErr = S.riskErr = null; renderRisk();
  await Promise.allSettled([loadWeather(), loadRisk(), loadHistory()]);
}

// ---------- map data ----------
const popRow = (k, v) => v ? `<li><b>${k}:</b> ${esc(v)}</li>` : '';
async function areasViaBrowser(rows, bad) {
  const cell = a => `${g1(a.lat)},${g1(a.lon)}`, cells = {}; bad.forEach(a => cells[cell(a)] = null);
  const keys = Object.keys(cells), raws = await omRaw(keys.map(k => k.split(',').map(Number))); keys.forEach((k, i) => cells[k] = raws[i]);
  const res = await post('/api/offload/areas', {cells, items:bad.map(a => ({id:a.id, cell:cell(a)}))}), by = Object.fromEntries(res.map(x => [x.id, x.risk]));
  return rows.map(a => by[a.id] ? {...a, risk:by[a.id]} : a);
}
async function loadAreas() {
  try {
    let rows = await api('/api/flood-areas?with_risk=true'); G.areas.clearLayers();
    const bad = rows.filter(a => a.risk.level === 'Insufficient data');
    // server was refused by the weather API for some areas: fill them in using the visitor's own connection
    if (bad.length) rows = await areasViaBrowser(rows, bad).catch(() => rows);
    S.areas = rows; S.areaById = Object.fromEntries(rows.map(a => [a.id, a]));
    rows.forEach(a => {
      const k = lvKey(a.risk.level), hot = k === 'high' || k === 'severe';
      const m = L.marker([a.lat, a.lon], {icon:pinIcon(COL[k], icon('droplet'), hot ? 'sev' : ''), title:a.name});
      m.bindPopup(() => `<div class="pop"><h4>${esc(a.name)}</h4><div class="muted">${esc(a.city || '')}</div>
        <p class="fine">Historical flood-prone location — not necessarily flooded now.</p><div>Current estimate: ${lvl(a.risk.level)}</div>
        <ul class="plain fine">${popRow('Frequency', a.frequency)}${popRow('Known causes', a.causes)}${popRow('Last reported event', a.last_event || 'not recorded')}${popRow('Source', a.source)}${popRow('Verification', `${a.verification}${a.verified_on ? ' (' + a.verified_on + ')' : ' (never verified)'}`)}</ul>
        <button class="btn primary sm" data-act="sel-loc" data-lat="${a.lat}" data-lon="${a.lon}" data-name="${esc(a.name)}">View weather here</button>
        ${isAdmin() ? `<button class="btn ghost sm" data-act="edit-area" data-id="${a.id}">Edit (admin)</button>` : ''}</div>`, {maxWidth:280});
      G.areas.addLayer(m);
    });
    renderRisk();
  } catch (e) { toast('Flood-prone areas failed to load: ' + e.message, 'moderate'); }
}
const RS = {Unverified:'#64748b', 'Under Review':'#0ea5e9', Verified:'#ef4444', Resolved:'#16a34a'};
const statusTag = s => `<span class="tag ${s === 'Verified' ? 'ver' : s === 'Resolved' ? 'ver' : 'unv'}">${esc(s)}${s === 'Verified' || s === 'Resolved' ? '' : ' · not confirmed'}</span>`;
async function loadReports() {
  try {
    const rows = await api('/api/reports?limit=100'); G.reports.clearLayers(); G.closures.clearLayers(); S.reports = rows;
    rows.filter(r => r.status !== 'Resolved').forEach(r => {
      const m = L.marker([r.lat, r.lon], {icon:pinIcon(RS[r.status] || RS.Unverified, '!', 'diamond', true)});
      m.bindPopup(`<div class="pop"><h4>Flood report #${r.id}</h4>${statusTag(r.status)}<p>${esc(r.description)}</p><div class="fine">Depth: ${r.depth_cm ?? 'unknown'} cm · ${esc(r.passable)}<br>Submitted ${fmt(r.created_at)}</div>
        ${r.photo ? `<img src="/uploads/${esc(r.photo)}" style="max-width:100%;border-radius:10px;margin-top:6px" alt="Report photo">` : ''}
        <p class="fine">${r.status === 'Verified' ? 'Verified by an administrator.' : 'User-submitted and not confirmed.'}</p></div>`, {maxWidth:270});
      G.reports.addLayer(m);
      if (r.status === 'Verified' && r.passable === 'Not passable') L.circle([r.lat, r.lon], {radius:120, color:'#ef4444', fillOpacity:.25}).bindPopup('Road reported not passable (verified)').addTo(G.closures);
    });
    renderReportList(); renderAlerts();
  } catch (e) { $('#repList').innerHTML = `<div class="msg err">Reports unavailable: ${esc(e.message)}</div>`; }
}
function drawWarnings() {
  G.warnings.clearLayers();
  S.alerts.filter(a => a.kind === 'official' && a.active && a.lat != null && a.radius_km).forEach(a =>
    L.circle([a.lat, a.lon], {radius:a.radius_km * 1000, color:COL[a.severity] || COL.high, weight:2, fillOpacity:.08, className:'warn-pulse'}).bindPopup(`<div class="pop"><h4>${esc(a.title)}</h4>${esc(a.source)}</div>`).addTo(G.warnings));
}

// ---------- weather / risk / history ----------
async function loadWeather() {
  const loc = S.loc, {lat, lon} = loc; S.wErr = null; let w = null, direct = false;
  try { w = await api(`/api/weather?lat=${lat}&lon=${lon}`); }
  catch (e1) {
    try { w = await post('/api/offload/weather', {raw:(await omRaw([[g1(lat), g1(lon)]]))[0]}); direct = true; }
    catch (e2) { if (loc !== S.loc) return; S.wErr = e1.message; S.w = null; }
  }
  if (loc !== S.loc) return;                                          // a newer location was selected while this request was in flight: ignore it
  if (w) S.w = w;
  if (S.w) {
    const note = S.w.stale ? 'Provider unreachable — showing cached data fetched ' + fmt(S.w.fetched_at) : direct ? 'Our server is being rate-limited by the weather provider, so your browser loaded this forecast directly.' : '';
    $('#updated').textContent = `Model time ${fmt(S.w.model_time)} · fetched ${fmt(S.w.fetched_at)}`;
    $('#stale').classList.toggle('on', !!note); $('#stale').textContent = note;
    $('#rainwin').textContent = S.w.rain_window.note;
    setWeatherBg(S.w.current.code);
  }
  renderRisk(); drawForecastCharts();
}
async function loadRisk() {
  const loc = S.loc, {lat, lon} = loc; S.riskErr = null; let r = null, r0 = null, err = null;
  try { r0 = await api(`/api/risk?lat=${lat}&lon=${lon}`); r = r0.level === 'Insufficient data' ? null : r0; } catch (e) { err = e; }
  if (!r) {
    try { r = await post('/api/offload/risk', {lat, lon, raw:(await omRaw([[g1(lat), g1(lon)]]))[0]}); }
    catch { r = r0; if (!r) S.riskErr = err ? err.message : 'Risk estimate unavailable'; }
  }
  if (loc !== S.loc) return;
  S.risk = r; renderRisk();
}
async function loadHistory() {
  const loc = S.loc, {lat, lon} = loc, days = $('#days').value; let h = null;
  try { h = await api(`/api/history?lat=${lat}&lon=${lon}&days=${days}`); }
  catch (e) {
    try {
      const r = await fetch(`${OM}?latitude=${g1(lat)}&longitude=${g1(lon)}&timezone=Asia%2FManila&past_days=${days}&forecast_days=1&daily=precipitation_sum`); if (!r.ok) throw new Error(r.status);
      const j = await r.json(); h = {rain:{time:j.daily.time, precip_sum:j.daily.precipitation_sum, source:'Open-Meteo model estimate (loaded directly by your browser)'}, alerts_by_day:[], reports_by_day:[], gauge_data:'Unavailable: no official water-level gauge feed is configured.'};
    } catch { if (loc === S.loc) $('#histNote').textContent = 'Historical data unavailable: ' + e.message; return; }
  }
  if (loc !== S.loc) return;
  S.hist = h; drawHistCharts();
}
function draw(id, cfg) {
  S.charts[id]?.destroy();
  cfg.type = cfg.type || 'bar'; cfg.options = {responsive:true, maintainAspectRatio:false, interaction:{mode:'index', intersect:false}, ...(cfg.options || {})};
  S.charts[id] = new Chart($('#' + id), cfg);
}
function drawForecastCharts() {
  const w = S.w; if (!w) return;
  const h = w.hourly.slice(w.now_index, w.now_index + 24), lab = h.map(x => fmt(x.time, {month:undefined, day:undefined, minute:undefined}));
  draw('chRain', {data:{labels:lab, datasets:[{type:'bar', label:'Precipitation (mm/h, forecast)', data:h.map(x => x.precip), backgroundColor:'#22d3ee', yAxisID:'y'}, {type:'line', label:'Rain probability (%)', data:h.map(x => x.prob), borderColor:'#6366f1', yAxisID:'y1', pointRadius:0, tension:.3}]},
    options:{scales:{y:{title:{display:true, text:'mm/h'}}, y1:{position:'right', min:0, max:100, grid:{drawOnChartArea:false}}}}});
  draw('chTemp', {type:'line', data:{labels:lab, datasets:[{label:'Temperature (°C)', data:h.map(x => x.temp), borderColor:'#14b8a6', pointRadius:0, tension:.3, yAxisID:'y'}, {label:'Wind (km/h)', data:h.map(x => x.wind), borderColor:'#94a3b8', pointRadius:0, tension:.3, yAxisID:'y1'}]},
    options:{scales:{y1:{position:'right', grid:{drawOnChartArea:false}}}}});
}
function drawHistCharts() {
  const h = S.hist; if (!h) return; const r = h.rain;
  draw('chHist', {data:{labels:r.time, datasets:[{label:'Daily rainfall (mm, modelled estimate)', data:r.precip_sum, backgroundColor:'#14b8a6'}]}});
  const ds = {}; h.alerts_by_day.forEach(a => ds[a.d] = (ds[a.d] || 0) + a.n); const rp = Object.fromEntries(h.reports_by_day.map(x => [x.d, x.n]));
  draw('chAl', {data:{labels:r.time, datasets:[{label:'Alerts issued', data:r.time.map(t => ds[t] || 0), backgroundColor:'#f59e0b'}, {label:'Flood reports', data:r.time.map(t => rp[t] || 0), backgroundColor:'#6366f1'}]}});
  $('#histNote').textContent = `${r.source}. ${h.gauge_data} Alert and report counts only cover the time this server has been running.`;
}
$('#days').onchange = loadHistory;

// ---------- Risk tab ----------
const activeOfficials = () => S.alerts.filter(a => a.kind === 'official' && a.active).length + (S.pagasa?.thunderstorm && !S.pagasa.thunderstorm.possibly_expired ? 1 : 0);
function renderRisk() {
  const w = S.w, c = w && w.current, r = S.risk; let h = '';
  if (S.wErr) h += `<div class="card"><div class="card-title">${icon('alert')} Weather data unavailable</div><p class="muted">${esc(S.wErr)}. FloodWatch shows no reading rather than a guessed one.</p><button class="btn ghost sm" data-act="retry">Retry</button></div>`;
  else if (!c) h += skel(200);
  else {
    const rw = w.rain_window, dir = DIRS[Math.round(c.wind_dir / 45) % 8];
    const note = rw.rain_expected ? (rw.ongoing ? `Rain in the model now, ending around ${fmt(rw.end)}.` : `Rain forecast to begin about ${fmt(rw.start)} and end about ${fmt(rw.end)}.`) : 'No measurable rain forecast for the next 24 hours.';
    h += `<div class="hero"><div class="hero-top"><span>${icon('pin')} ${esc(S.loc.name)}</span><span>${icon('clock')} ${fmt(w.model_time)}</span></div>
      <div class="hero-main"><div class="hero-ico" aria-hidden="true">${wxi(c.code)}</div><div><div class="hero-temp">${Math.round(c.temp)}°</div><div class="hero-cond">${esc(WX[c.code] || 'Code ' + c.code)} · feels like ${Math.round(c.feels)}°</div></div></div>
      <div class="hero-chips"><span>${icon('droplet')} ${c.prob == null ? 'N/A' : c.prob + '%'} rain chance</span><span>${icon('wind')} ${Math.round(c.wind)} km/h ${dir}</span></div>
      <p class="hero-note">${esc(note)} Timing is a model estimate and can shift by hours.</p></div>`;
  }
  if (S.riskErr) h += `<div class="card"><b>Risk estimate unavailable</b><p class="muted">${esc(S.riskErr)}</p></div>`;
  else if (!r) h += skel(170);
  else {
    const k = lvKey(r.level), lit = ['low', 'moderate', 'high', 'severe'].indexOf(k) + 1;
    const offs = (r.officials || []).map(o => `<div class="note warn"><b>OFFICIAL: ${esc(o.title)}</b> · ${esc(o.source)} · issued ${fmt(o.issued_at)} ${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener">source</a>` : ''}</div>`).join('');
    h += `<div class="card risk lv-${k}"><div class="risk-head"><div><span class="eyebrow">Flood risk estimate</span><div class="risk-level">${esc(r.level === 'Insufficient data' ? 'Insufficient data' : lvName(r.level))}</div></div><span style="font-size:34px;color:${COL[k]}">${icon('shield')}</span></div>
      <div class="meter" role="img" aria-label="Risk level meter: ${esc(lvName(r.level))}">${[1, 2, 3, 4].map(i => `<i class="${i <= lit ? 'on' : ''}"></i>`).join('')}</div>
      <div class="meter-labels"><span>Low</span><span>Moderate</span><span>High</span><span>Critical</span></div>${offs}
      <details open><summary>Why this level</summary><ul>${(r.factors || []).map(f => `<li>${esc(f)}</li>`).join('') || '<li>No factors could be computed.</li>'}</ul></details>
      <details><summary>Missing information (lowers confidence)</summary><ul>${(r.missing || []).map(f => `<li>${esc(f)}</li>`).join('')}</ul></details>
      <p class="fine">${icon('info')} ${esc(r.disclaimer)} Assessed ${fmt(r.assessed_at)} · ${(r.sources || []).map(s => `${esc(s.name)} (fetched ${fmt(s.fetched_at)}${s.stale ? ', STALE' : ''})`).join('; ') || 'no data source available'}</p></div>`;
  }
  if (c) {
    const cat = rainCat(c.precip), n = activeOfficials(), vis = c.visibility == null ? 'N/A' : (c.visibility / 1000).toFixed(1) + ' km';
    const st = [['droplet', 'Rain now', `${c.precip} mm/h`, cat === 'None' ? 'No rain' : cat], ['cloud-rain', 'Rain chance', c.prob == null ? 'N/A' : c.prob + '%', 'This hour'], ['droplet', 'Humidity', c.humidity + '%', ''],
      ['wind', 'Wind', `${Math.round(c.wind)} km/h`, DIRS[Math.round(c.wind_dir / 45) % 8]], ['eye', 'Visibility', vis, ''], ['alert', 'Official warnings', n ? n + ' active' : 'None entered', n ? 'See Alerts tab' : 'Check PAGASA']];
    h += `<div class="stats">${st.map(([i, a, b, d], x) => `<div class="stat ${a === 'Official warnings' && n ? 'alert-on' : ''}" style="animation-delay:${x * 40}ms"><small>${icon(i)}${a}</small><b>${esc(b)}</b><span>${esc(d)}</span></div>`).join('')}</div>`;
  }
  if (w) {
    h += `<div class="card"><div class="card-title">${icon('clock')} 7-day forecast</div><div class="strip">${w.daily.slice(1, 8).map((d, i) => { const mm = d.precip_sum ?? 0, lv = mm < 1 ? 0 : mm < 10 ? 1 : mm < 30 ? 2 : 3;
      return `<div class="dcard r${lv}"><div class="dd">${i === 0 ? 'Today' : fmt(d.date + 'T12:00:00+08:00', {hour:undefined, minute:undefined, month:undefined, day:undefined, weekday:'short'})}</div><div class="di" title="${esc(WX[d.code] || '')}">${wxi(d.code)}</div>
      <div><b>${Math.round(d.tmax)}°</b> / ${Math.round(d.tmin)}°</div><div>${mm} mm</div><div class="bar" title="Max rain probability"><i style="width:${d.prob_max ?? 0}%"></i></div><small>${d.prob_max ?? 'N/A'}% · ${Math.round(d.wind_max)} km/h</small></div>`; }).join('')}</div>
      <p class="fine">Card tint = forecast daily rain total (visual guide). Bar = maximum rain probability.</p></div>`;
  }
  const near = S.areas.map(a => ({a, d:hav(S.loc.lat, S.loc.lon, a.lat, a.lon)})).sort((x, y) => x.d - y.d).slice(0, 4);
  h += `<div class="card"><div class="card-title">${icon('droplet')} Flood-prone areas near ${esc(S.loc.name)}</div>${near.length ? near.map(({a, d}) => `<div class="near" role="button" tabindex="0" data-act="sel-loc" data-lat="${a.lat}" data-lon="${a.lon}" data-name="${esc(a.name)}">
      <span class="dot" style="--c:${COL[lvKey(a.risk.level)]}"></span><div style="flex:1;min-width:0"><b>${esc(a.name)}</b><small>${esc(a.city || '')} · ${d.toFixed(1)} km · ${esc(a.verification)}</small></div>${lvl(a.risk.level)}</div>`).join('') : '<div class="empty">Flood-prone areas are still loading…</div>'}
    <p class="fine">Historical locations, not current flooding. Levels are calculated estimates from forecast rainfall.</p></div>`;
  if (w) h += `<p class="fine">${icon('clock')} Updated ${fmt(w.fetched_at)} · Source: ${esc(w.source)}</p>`;
  $('#t-risk').innerHTML = h;
}

// ---------- Alerts tab ----------
async function loadPagasa() {
  try { S.pagasa = await api('/api/pagasa'); } catch (e) { S.pagasa = {error:e.message}; }
}
const SEVICON = {low:'info', moderate:'alert', high:'alert', severe:'alert'};
function pagasaCard() {
  const g = S.pagasa; if (!g) return '';
  if (g.error) return `<article class="alert-card"><div class="ac-ico">${icon('alert')}</div><div class="ac-body"><h4>PAGASA live status unavailable</h4><p class="muted">${esc(g.error)}</p></div></article>`;
  const ts = g.thunderstorm, live = ts && !ts.possibly_expired, sev = live ? 'moderate' : 'low';
  const rain = g.rainfall?.status === 'none' ? 'No Heavy Rainfall Warning is issued (per PAGASA\'s page).' : 'Could not confirm the rainfall warning status automatically. Check PAGASA directly.';
  return `<article class="alert-card sev-${sev}"><div class="ac-ico">${icon('shield')}</div><div class="ac-body"><div class="ac-top"><span class="tag official">Official · PAGASA</span></div><h4>PAGASA live status — ${esc(g.region)}</h4>
    <div class="ac-meta"><span>${icon('clock')} Fetched ${fmt(g.fetched_at)}${g.stale ? ' (STALE)' : ''}</span></div>
    <p><b>Rainfall:</b> ${esc(rain)}</p><p><b>Thunderstorm:</b> ${ts ? `${esc(ts.title)}${ts.possibly_expired ? ` — issued ${ts.age_minutes == null ? 'at an unknown time' : Math.round(ts.age_minutes / 60) + ' h ago'}, may no longer be in effect` : ''}<br>${esc(ts.text)}` : 'No thunderstorm advisory text found. This may mean none is in effect, or the page layout changed. Check PAGASA directly.'}</p>
    <p class="fine">Copied from PAGASA's public page; not generated by FloodWatch.</p><a href="${esc(g.source_url)}" target="_blank" rel="noopener">${icon('link')} Open PAGASA's page</a></div></article>`;
}
function alertCard(a) {
  const off = a.kind === 'official', desc = a.probability != null ? `Forecast rain probability up to ${a.probability}%.` : '';
  return `<article class="alert-card sev-${a.severity} ${a.active ? '' : 'expired'}"><div class="ac-ico">${icon(SEVICON[a.severity] || 'alert')}</div><div class="ac-body">
    <div class="ac-top">${lvl(a.severity)}<span class="tag ${off ? 'official' : 'est'}">${off ? 'Official advisory' : 'System estimate'}</span>${a.active ? '' : '<span class="tag">Expired</span>'}</div>
    <h4>${esc(a.title)}</h4><div class="ac-meta"><span>${icon('pin')} ${esc(a.area)}</span><span>${icon('clock')} Issued ${fmt(a.issued_at)}</span><span>${a.active ? 'Expires' : 'Expired'} ${fmt(a.expires_at)}</span></div>
    ${a.starts_at ? `<p>Expected ${fmt(a.starts_at)}${a.ends_at ? ' – ' + fmt(a.ends_at) : ''}. ${esc(desc)}</p>` : desc ? `<p>${esc(desc)}</p>` : ''}
    ${a.recommendation ? `<p><b>Precaution:</b> ${esc(a.recommendation)}</p>` : ''}
    <div class="fine">Source: ${esc(a.source)}${off ? '' : ' (not an official warning)'}</div>${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">${icon('link')} Official advisory</a>` : ''}</div></article>`;
}
const visibleAlerts = () => S.alerts.filter(a => a.kind === 'official' || !prefs.mon || prefs.mon.includes(a.location_key));
function renderAlerts() {
  const f = S.alertF, RANK = {low:0, moderate:1, high:2, severe:3};
  const list = visibleAlerts().filter(a => (f.st === 'all' || (f.st === 'active') === !!a.active) && (f.sev === 'all' || a.severity === f.sev))
    .sort((x, y) => RANK[y.severity] - RANK[x.severity] || (y.issued_at > x.issued_at ? 1 : -1));
  const off = list.filter(a => a.kind === 'official'), est = list.filter(a => a.kind !== 'official');
  const seg = (k, opts) => `<span class="seg" role="group">${opts.map(([v, t]) => `<button data-act="alert-f" data-k="${k}" data-v="${v}" aria-pressed="${f[k] === v}">${t}</button>`).join('')}</span>`;
  const rp = S.reports, ver = rp.filter(r => r.status === 'Verified').length, unv = rp.filter(r => r.status !== 'Verified' && r.status !== 'Resolved').length;
  $('#t-alerts').innerHTML = `<h2 class="pane-title">${icon('alert')} Alert center</h2>
    <div>${seg('st', [['active', 'Active'], ['expired', 'Expired'], ['all', 'All']])}${seg('sev', [['all', 'Any'], ['severe', 'Critical'], ['high', 'High'], ['moderate', 'Moderate'], ['low', 'Low']])}</div>
    ${pagasaCard()}
    ${off.length ? `<h3 class="sec-title">Official advisories</h3>${off.map(alertCard).join('')}` : ''}
    ${est.length ? `<h3 class="sec-title">System estimates</h3><p class="fine">Calculated by FloodWatch from forecast data. Not official warnings.</p>${est.map(alertCard).join('')}` : ''}
    ${!off.length && !est.length ? `<div class="empty">${icon('check')}<p>No ${f.st === 'all' ? '' : f.st} alerts match these filters.<br><small>This does not guarantee there is no flood risk. Check official sources.</small></p></div>` : ''}
    <h3 class="sec-title">Community reports</h3><div class="card"><p>${ver} verified · ${unv} unverified or under review</p><p class="fine">Community reports are not official confirmation.</p><button class="btn ghost sm" data-act="tab" data-tab="report">View reports</button></div>`;
}
async function loadAlerts(initial) {
  await loadPagasa();
  try {
    S.alerts = await api('/api/alerts'); const act = visibleAlerts().filter(a => a.active);
    $('#badge').hidden = !act.length; $('#badge').textContent = act.length;
    const seen = new Set(JSON.parse(localStorage.fwSeen || '[]')), SEV = ['low', 'moderate', 'high', 'severe'];
    if (!initial) act.filter(a => !seen.has(a.id) && SEV.indexOf(a.severity) >= +prefs.minSev).forEach(a => {
      toast(`${a.title} — ${a.area}`, a.severity);
      if (prefs.notify && 'Notification' in window && Notification.permission === 'granted') new Notification('FloodWatch PH: ' + a.title, {body:a.area + ' · ' + (a.recommendation || '')});
    });
    localStorage.fwSeen = JSON.stringify(act.map(a => a.id));
  } catch (e) { $('#t-alerts').innerHTML = `<div class="msg err">Alerts unavailable: ${esc(e.message)}</div>`; return; }
  renderAlerts(); renderRisk(); drawWarnings();
}

// ---------- place / landmark / address search (typeahead; Enter or the search button runs the deeper address search) ----------
const places = () => JSON.parse(localStorage.fwPlaces || '[]');
const parseBrgy = v => (String(v || '').match(/\b(?:barangay|brgy|bgy|brg)\.?\s*#?\s*(\w+)/i) || [])[1] || null;
const brgyLabel = r => !r ? null : r.typed ? `Brgy. ${r.typed} (as entered)` : r.brgy ? `Brgy/area from map data: ${r.brgy}` : null;
function placeSearch(inId, resId, onPick, btnId) {
  let t; const inp = $(inId), box = $(resId);
  const run = async address => {
    const q = inp.value.trim(); if (q.length < 2) { box.style.display = 'none'; return; }
    box.innerHTML = '<div style="padding:10px">Searching…</div>'; box.style.display = 'block';
    try {
      const saved = places().filter(p => p.name.toLowerCase().includes(q.toLowerCase()));
      const rs = [...saved, ...await api('/api/geocode?q=' + encodeURIComponent(q) + (address ? '&address=true' : `&lat=${S.loc.lat}&lon=${S.loc.lon}`))];
      const hint = address ? '' : '<div class="fine" style="padding:6px 12px">Landmark or street address? Press Enter or Go to search.</div>';
      box.innerHTML = (rs.map((r, i) => `<button type="button" data-i="${i}">${r.note === 'saved' ? '⭐ ' : ''}${esc(r.name)}${r.region ? ', ' + esc(r.region) : ''}${r.note && r.note !== 'saved' ? `<br><small>${esc(r.note)}</small>` : ''}${r.brgy ? `<br><small>📍 Brgy/area: ${esc(r.brgy)}</small>` : ''}</button>`).join('')
        || `<div style="padding:10px">No matches.${address ? ' Try street + city only (no house number), or use Pick on map.' : ''}</div>`) + hint;
      box.onclick = ev => { const b = ev.target.closest('button'); if (!b) return; const r = rs[+b.dataset.i]; box.style.display = 'none';
        inp.value = r.name + (r.region ? ', ' + r.region : ''); onPick([r.lat, r.lon], inp.value, {...r, typed:parseBrgy(q)}); };
    } catch (e) { box.innerHTML = `<div style="padding:10px">${esc(e.message)}</div>`; }
  };
  inp.oninput = () => { clearTimeout(t); t = setTimeout(() => run(false), 350); };
  inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(t); run(true); } };
  if (btnId) $(btnId).onclick = () => { clearTimeout(t); run(true); };
}
document.addEventListener('click', e => { $$('.results').forEach(b => { if (!b.parentElement.contains(e.target)) b.style.display = 'none'; }); });
placeSearch('#search', '#results', (ll, n) => { $('#search').value = ''; selectLocation({name:n.split(',').slice(0, 2).join(','), lat:ll[0], lon:ll[1]}); }, '#searchGo');

// ---------- Route planner: one source of truth per endpoint (coordinates + field + marker + label stay in sync) ----------
const EP = {o:{ll:null, name:'', br:null, mk:null, i:'#oIn', m:'#oBr', s:'#oState'}, d:{ll:null, name:'', br:null, mk:null, i:'#dIn', m:'#dBr', s:'#dState'}};
const epIcon = k => L.divIcon({className:'', html:`<div class="pin ${k === 'o' ? 'ep-a' : 'ep-b'}"><span>${k === 'o' ? 'A' : 'B'}</span></div>`, iconSize:[30, 30], iconAnchor:[15, 36], popupAnchor:[0, -34]});
function renderEp(k) {
  const e = EP[k]; $(e.s).textContent = e.ll ? 'Set ✓' : 'Not set'; $(e.s).classList.toggle('ok', !!e.ll);
  $(e.m).innerHTML = e.ll ? `${icon('pin')} ${esc(coordLabel(e.ll))}${e.br ? ' · 📍 ' + esc(e.br) : ''}` : '';
}
function placeEp(k) {
  const e = EP[k]; if (e.mk) { G.ep.removeLayer(e.mk); e.mk = null; }
  if (!e.ll) return;
  e.mk = L.marker(e.ll, {icon:epIcon(k), draggable:true, zIndexOffset:1000, title:(k === 'o' ? 'Origin' : 'Destination') + ' (drag to adjust)'}).addTo(G.ep);
  e.mk.on('dragend', ev => { const p = ev.target.getLatLng(), ll = [p.lat, p.lng]; setEndpoint(k, ll, coordLabel(ll), null, true, false); });
}
function clearRoute() { G.route.clearLayers(); G.routeHz.clearLayers(); S.route = {list:[], sel:0}; $('#routeOut').innerHTML = ''; }
function setEndpoint(k, ll, label, br = null, reverse = false, frame = true) {
  const e = EP[k]; e.ll = ll; e.name = label; e.br = br; $(e.i).value = label;
  renderEp(k); placeEp(k); clearRoute();                       // an old route no longer matches the new points
  if (frame) { if (EP.o.ll && EP.d.ll) map.fitBounds(L.latLngBounds([EP.o.ll, EP.d.ll]), {padding:[70, 70], maxZoom:16}); else map.flyTo(ll, Math.max(map.getZoom(), 15)); }
  if (reverse) reverseLabel(k, ll);
}
async function reverseLabel(k, ll) {
  const e = EP[k]; $(e.m).innerHTML = `${icon('pin')} ${esc(coordLabel(ll))} · looking up place name…`;
  try {
    const r = await api(`/api/reverse?lat=${ll[0]}&lon=${ll[1]}`); if (e.ll !== ll) return;      // user already chose something else
    if (r.name) { e.name = r.name; $(e.i).value = r.name; }
    e.br = r.brgy ? (/barangay|brgy/i.test(r.brgy) ? r.brgy : `Brgy/area from map data: ${r.brgy}`) : null; renderEp(k);
  } catch { if (e.ll === ll) renderEp(k); }
}
['o', 'd'].forEach(k => $(EP[k].i).addEventListener('input', () => {                      // typing invalidates the confirmed point
  const e = EP[k]; if (!e.ll || $(e.i).value === e.name) return; e.ll = null; e.br = null; placeEp(k); renderEp(k); clearRoute(); }));
placeSearch('#oIn', '#oRes', (ll, n, r) => setEndpoint('o', ll, n, brgyLabel(r)), '#goO');
placeSearch('#dIn', '#dRes', (ll, n, r) => setEndpoint('d', ll, n, brgyLabel(r)), '#goD');
$('#pickO').onclick = () => setPick('o'); $('#pickD').onclick = () => setPick('d');
const useSel = k => { const ll = [S.loc.lat, S.loc.lon]; setEndpoint(k, ll, S.loc.name, null, /^(Pinned|My location)/.test(S.loc.name)); };
$('#useO').onclick = () => useSel('o'); $('#useD').onclick = () => useSel('d');
$('#swap').onclick = () => {
  const a = EP.o, b = EP.d; [a.ll, b.ll] = [b.ll, a.ll]; [a.name, b.name] = [b.name, a.name]; [a.br, b.br] = [b.br, a.br];
  ['o', 'd'].forEach(k => { $(EP[k].i).value = EP[k].name; renderEp(k); placeEp(k); }); clearRoute();
  if (EP.o.ll && EP.d.ll) map.fitBounds(L.latLngBounds([EP.o.ll, EP.d.ll]), {padding:[70, 70], maxZoom:16});
};
$('#clrRoute').onclick = () => { setPick(null); ['o', 'd'].forEach(k => { const e = EP[k]; e.ll = null; e.name = ''; e.br = null; $(e.i).value = ''; renderEp(k); placeEp(k); }); clearRoute(); };

const hzColor = h => h.type === 'flood report' ? (h.status === 'Verified' ? '#ef4444' : '#64748b') : '#f59e0b';
function drawRoute() {
  G.route.clearLayers(); G.routeHz.clearLayers(); const {list, sel} = S.route; if (!list.length) return;
  list.forEach((rt, i) => { if (i !== sel) L.geoJSON(rt.geometry, {style:{color:'#64748b', weight:5, opacity:.7, dashArray:'8 8'}}).on('click', () => selectRoute(i)).addTo(G.route); });
  const rt = list[sel];
  L.geoJSON(rt.geometry, {style:{color:'#ffffff', weight:11, opacity:.95}, interactive:false}).addTo(G.route);
  const line = L.geoJSON(rt.geometry, {style:{color:'#2563eb', weight:6, opacity:1}}).addTo(G.route);
  rt.hazards.filter(h => h.type !== 'official warning area').forEach(h => L.circleMarker([h.lat, h.lon], {radius:8, color:'#fff', weight:2, fillColor:hzColor(h), fillOpacity:1})
    .bindPopup(`<div class="pop"><h4>${esc(h.name)}</h4>${h.type === 'flood report' ? statusTag(h.status) : '<span class="tag">Historical flood-prone area</span>'}<p class="fine">${h.distance_m} m from this route. ${esc(h.basis || '')}</p></div>`).addTo(G.routeHz));
  map.fitBounds(line.getBounds(), {padding:[60, 60]});
}
function selectRoute(i) { S.route.sel = i; drawRoute(); renderRoutes(); }
const hzLine = h => h.type === 'flood report' ? `${icon('flag')}<span><b>${esc(h.name)}</b> · ${h.distance_m} m away ${statusTag(h.status)}</span>`
  : h.type === 'official warning area' ? `${icon('alert')}<span><b>Inside warning area: ${esc(h.name)}</b> <span class="tag official">Official</span></span>`
  : `${icon('droplet')}<span><b>${esc(h.name)}</b> · ${h.distance_m} m away <span class="tag">Historical · estimate</span></span>`;
function renderRoutes() {
  const {list, sel, disclaimer} = S.route; if (!list.length) { $('#routeOut').innerHTML = ''; return; }
  const minD = Math.min(...list.map(r => r.distance_km)), minT = Math.min(...list.map(r => r.duration_min)), once = (k, m) => list.filter(r => r[k] === m).length === 1;
  $('#routeOut').innerHTML = `<h3 class="sec-title">${list.length} route${list.length > 1 ? 's' : ''} found</h3>` + list.map((rt, i) => {
    const tags = []; if (list.length > 1 && rt.distance_km === minD && once('distance_km', minD)) tags.push('Shortest'); if (list.length > 1 && rt.duration_min === minT && once('duration_min', minT)) tags.push('Fastest');
    const bad = rt.verified_flood_reports || rt.official_warnings, hz = rt.hazards;
    return `<article class="route-card ${i === sel ? 'sel' : ''}" data-i="${i}" tabindex="0" role="button" aria-pressed="${i === sel}">
      <div class="route-top"><b>Route ${i + 1}</b>${tags.map(t => `<span class="tag ver">${t}</span>`).join('')}${i === sel ? '<span class="tag">Showing on map</span>' : ''}</div>
      <div class="route-stats"><span>${icon('navigation')} ${rt.distance_km} km</span><span>${icon('clock')} ~${rt.duration_min} min (no live traffic)</span></div>
      <div class="note ${bad ? 'warn' : ''}">${icon(bad ? 'alert' : 'info')} ${esc(rt.warning)}</div>
      ${i === sel && hz.length ? `<ul class="hz">${hz.map(h => `<li>${hzLine(h)}</li>`).join('')}</ul>` : ''}
      ${rt.steps && rt.steps.length ? `<details><summary>Turn-by-turn directions (${rt.steps.length} steps)</summary><ol>${rt.steps.map(s => `<li>${esc(s.text)} <small>${s.distance_m >= 1000 ? (s.distance_m / 1000).toFixed(1) + ' km' : s.distance_m + ' m'}</small></li>`).join('')}</ol></details>` : ''}</article>`; }).join('')
    + `<p class="fine">${esc(disclaimer)}</p>`;
}
function setRouteBusy(b) { $('#goRoute').disabled = b; $('#goRouteTxt').innerHTML = b ? '<span class="spin" style="display:inline-block;vertical-align:middle;margin-right:6px"></span>Finding routes…' : 'Find routes'; }
$('#goRoute').onclick = async () => {
  if (!EP.o.ll || !EP.d.ll) { $('#routeOut').innerHTML = `<div class="msg err">Choose both an origin and a destination first. Pick a suggestion from the list, or use Pick on map.</div>`; return; }
  const o = EP.o.ll.slice(), d = EP.d.ll.slice(); setRouteBusy(true); $('#routeOut').innerHTML = skel(120) + skel(120);
  try {
    const r = await api(`/api/route-risk?o_lat=${o[0]}&o_lon=${o[1]}&d_lat=${d[0]}&d_lon=${d[1]}`);
    if (EP.o.ll?.[0] !== o[0] || EP.d.ll?.[0] !== d[0] || EP.o.ll?.[1] !== o[1] || EP.d.ll?.[1] !== d[1]) return;      // endpoints changed meanwhile: discard
    S.route = {list:r.routes, sel:0, disclaimer:r.disclaimer}; drawRoute(); renderRoutes();
  } catch (e) { $('#routeOut').innerHTML = `<div class="msg err">We couldn't calculate a route: ${esc(e.message)}. Check both points (they must be reachable by road) and try again.</div>`; }
  finally { setRouteBusy(false); }
};

// ---------- Reports ----------
function setReportPoint(ll) {
  S.rpt = ll; S.rptName = null; G.rep.clearLayers(); L.marker(ll, {icon:pinIcon('#ef4444', '!', '', false), interactive:false}).addTo(G.rep);
  $('#rTxt').innerHTML = `${icon('pin')} ${esc(coordLabel(ll))} · looking up place name…`;
  api(`/api/reverse?lat=${ll[0]}&lon=${ll[1]}`).then(r => { if (S.rpt !== ll) return; S.rptName = r.name; $('#rTxt').innerHTML = `${icon('pin')} <b>${esc(r.name || 'Selected point')}</b><br>${esc(coordLabel(ll))}${r.brgy ? ' · 📍 ' + esc(r.brgy) : ''}`; })
    .catch(() => { if (S.rpt === ll) $('#rTxt').innerHTML = `${icon('pin')} ${esc(coordLabel(ll))}`; });
}
$('#pickR').onclick = () => setPick('r');
$('#useR').onclick = () => setReportPoint([S.loc.lat, S.loc.lon]);
$('#rPhoto').onchange = e => { const f = e.target.files[0]; $('#rPhotoName').textContent = f ? `${f.name} (${(f.size / 1024).toFixed(0)} KB)` : 'Choose a photo'; };
function renderReportList() {
  const adm = isAdmin();
  $('#repList').innerHTML = S.reports.length ? S.reports.slice(0, 20).map(r => `<article class="rep s-${r.status.replace(' ', '-')}"><div class="rep-top">${statusTag(r.status)}<span class="tag">${esc(r.passable)}</span>${r.depth_cm != null ? `<span class="tag">${r.depth_cm} cm deep</span>` : ''}</div>
    <p>${esc(r.description)}</p><small>${icon('pin')} ${esc(coordLabel([r.lat, r.lon]))} · ${fmt(r.created_at)}</small>
    <div class="row" style="margin-top:6px"><button class="btn ghost sm" data-act="fly" data-lat="${r.lat}" data-lon="${r.lon}">Show on map</button>
    ${adm ? ['Under Review', 'Verified', 'Resolved', 'Rejected'].map(s => `<button class="btn ghost sm" data-act="set-status" data-id="${r.id}" data-v="${s}">${s}</button>`).join('') : ''}</div>
    ${r.photo ? `<img src="/uploads/${esc(r.photo)}" alt="Report photo" loading="lazy">` : ''}</article>`).join('')
    : `<div class="empty">${icon('flag')}<p>No reports yet.<br><small>Be the first to report flooding in your area.</small></p></div>`;
}
async function setStatus(id, status) {
  try { await api('/api/admin/reports/' + id, {method:'PATCH', headers:{'Content-Type':'application/json', 'X-Admin-Token':sessionStorage.adm}, body:JSON.stringify({status})}); loadReports(); }
  catch (e) { toast('Admin action failed: ' + e.message, 'severe'); }
}
$('#repForm').onsubmit = async e => {
  e.preventDefault(); const msg = $('#rMsg'); msg.innerHTML = '';
  if (!S.rpt) { msg.innerHTML = '<div class="msg err">Choose where the flooding is first: use Pick location on map.</div>'; return; }
  const file = $('#rPhoto').files[0];
  if (file && (file.size > 2 * 1024 * 1024 || !/^image\/(jpeg|png|webp)$/.test(file.type))) { msg.innerHTML = '<div class="msg err">The photo must be a JPEG, PNG or WebP image of 2 MB or less.</div>'; return; }
  const f = new FormData(); f.append('lat', S.rpt[0]); f.append('lon', S.rpt[1]); f.append('description', $('#rDesc').value); f.append('passable', $('#rPass').value); f.append('website', $('#rWeb').value);
  if ($('#rDepth').value) f.append('depth_cm', $('#rDepth').value); if (file) f.append('photo', file);
  $('#rSubmit').disabled = true; $('#rSubmitTxt').innerHTML = '<span class="spin" style="display:inline-block;vertical-align:middle;margin-right:6px"></span>Submitting…';
  try {
    const r = await api('/api/reports', {method:'POST', body:f}); msg.innerHTML = `<div class="msg ok">${icon('check')} ${esc(r.message)}</div>`;
    $('#repForm').reset(); S.rpt = null; G.rep.clearLayers(); $('#rTxt').textContent = 'No location chosen yet.'; $('#rPhotoName').textContent = 'Choose a photo'; loadReports();
  } catch (err) { msg.innerHTML = `<div class="msg err">Could not submit: ${esc(err.message)}</div>`; }
  finally { $('#rSubmit').disabled = false; $('#rSubmitTxt').textContent = 'Submit report'; }
};

// ---------- Settings ----------
function renderNotify() {
  const sup = 'Notification' in window, perm = sup ? Notification.permission : 'unsupported', t = $('#notifyToggle'), st = $('#notifyStatus');
  t.checked = prefs.notify && perm === 'granted'; t.disabled = !sup || perm === 'denied';
  if (!sup) { st.className = 'note warn'; st.textContent = 'This browser does not support notifications.'; }
  else if (perm === 'denied') { st.className = 'note warn'; st.textContent = 'Blocked by your browser. Allow notifications for this site in your browser\'s site settings to turn them on.'; }
  else if (t.checked) { st.className = 'note ok'; st.textContent = 'On: you will get a notification for new alerts at or above your minimum severity while this page is open.'; }
  else { st.className = 'note'; st.textContent = 'Off. Switch on and your browser will ask for permission.'; }
}
$('#notifyToggle').onchange = async e => {
  if (e.target.checked) { const p = await Notification.requestPermission(); prefs.notify = p === 'granted'; } else prefs.notify = false;
  savePrefs(); renderNotify();
};
$('#minSev').value = prefs.minSev; $('#minSev').onchange = e => { prefs.minSev = +e.target.value; savePrefs(); };
$('#themeSel').value = prefs.theme; $('#themeSel').onchange = e => { prefs.theme = e.target.value; savePrefs(); applyTheme(); };
$('#theme').onclick = () => { prefs.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; $('#themeSel').value = prefs.theme; savePrefs(); applyTheme(); };
$('#optMotion').checked = prefs.motion; $('#optMotion').onchange = e => { prefs.motion = e.target.checked; savePrefs(); applyMotion(); };
$('#optLegend').checked = prefs.legend; $('#optLegend').onchange = e => { prefs.legend = e.target.checked; savePrefs(); renderLegend(); };
api('/api/monitored').then(m => {
  $('#monList').innerHTML = m.map(x => `<label><input type="checkbox" value="${esc(x.name)}" ${!prefs.mon || prefs.mon.includes(x.name) ? 'checked' : ''}> ${esc(x.name)}</label>`).join('');
  $('#monList').onchange = () => { prefs.mon = $$('#monList input:checked').map(i => i.value); savePrefs(); renderAlerts(); };
}).catch(() => {});
function renderSaved() {
  $('#svList').innerHTML = places().map((p, i) => `<div class="row" style="justify-content:space-between"><span>⭐ ${esc(p.name)}</span><button class="btn ghost sm" data-act="rm-saved" data-i="${i}" aria-label="Remove ${esc(p.name)}">${icon('x')}</button></div>`).join('') || '<p class="fine">None yet. Select a point on the map, name it, and save.</p>';
}
$('#svBtn').onclick = () => { const n = $('#svName').value.trim(); if (!n) return toast('Type a name first (e.g. Home).', 'moderate');
  const l = places(); l.push({name:n, lat:S.loc.lat, lon:S.loc.lon, note:'saved'}); localStorage.fwPlaces = JSON.stringify(l); $('#svName').value = ''; renderSaved(); toast(`Saved "${n}" at the currently selected location.`, 'low'); };
$('#geo').onclick = () => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => pickLoc(p.coords.latitude, p.coords.longitude, 'My location'), () => toast('Location permission denied — search or click the map instead.', 'moderate')) : toast('Location is not supported by this browser.', 'moderate');

// ---------- Administrator tools ----------
$('#admTok').value = sessionStorage.adm || ''; $('#admBox').hidden = !sessionStorage.adm;
$('#admTok').oninput = e => { sessionStorage.adm = e.target.value; $('#admBox').hidden = !e.target.value; renderReportList(); };
const nowLocal = off => new Date(Date.now() + 8 * 3600e3 + off * 3600e3).toISOString().slice(0, 16);
$('#avIssued').value = nowLocal(0); $('#avExpires').value = nowLocal(6);
$('#advForm').onsubmit = async e => {
  e.preventDefault(); const iso = v => v + ':00+08:00';
  const body = {title:$('#avTitle').value, area:$('#avArea').value, severity:$('#avSev').value, source:$('#avSrc').value, url:$('#avUrl').value, issued_at:iso($('#avIssued').value), expires_at:iso($('#avExpires').value), recommendation:$('#avRec').value || null};
  if ($('#avGeo').checked) { body.lat = S.loc.lat; body.lon = S.loc.lon; body.radius_km = +$('#avRad').value; }
  try { await api('/api/admin/advisories', {method:'POST', headers:{'Content-Type':'application/json', 'X-Admin-Token':sessionStorage.adm}, body:JSON.stringify(body)}); toast('Official advisory published.', 'low'); await loadAlerts(true); loadRisk(); }
  catch (err) { toast('Could not publish: ' + err.message, 'severe'); }
};
function editArea(id) {
  const a = S.areaById[id]; if (!a) return; map.closePopup(); showTab('settings'); $('#admDetails').open = true; $('#admBox').hidden = false;
  $('#arId').value = a.id; $('#arName').value = a.name; $('#arCity').value = a.city || ''; $('#arFreq').value = a.frequency || ''; $('#arCauses').value = a.causes || '';
  $('#arLast').value = a.last_event || ''; $('#arSrc').value = a.source || ''; $('#arVer').value = a.verification === 'Verified' ? 'Verified' : 'Unverified starter data'; $('#arVerOn').value = a.verified_on || '';
  $('#arMove').checked = false; $('#arName').scrollIntoView({behavior:'smooth'});
}
const clearArea = () => { $('#areaForm').reset(); $('#arId').value = ''; $('#arMove').checked = true; };
$('#arClr').onclick = clearArea;
$('#areaForm').onsubmit = async e => {
  e.preventDefault(); const id = $('#arId').value, old = id ? S.areaById[id] : null, move = !old || $('#arMove').checked;
  const body = {name:$('#arName').value, city:$('#arCity').value || null, lat:move ? S.loc.lat : old.lat, lon:move ? S.loc.lon : old.lon, frequency:$('#arFreq').value || null, causes:$('#arCauses').value || null,
    last_event:$('#arLast').value || null, source:$('#arSrc').value || null, verification:$('#arVer').value, verified_on:$('#arVerOn').value || null};
  try { await api('/api/admin/areas' + (id ? '/' + id : ''), {method:id ? 'PUT' : 'POST', headers:{'Content-Type':'application/json', 'X-Admin-Token':sessionStorage.adm}, body:JSON.stringify(body)}); toast(id ? 'Area updated.' : 'Area added.', 'low'); clearArea(); loadAreas(); }
  catch (err) { toast('Could not save area: ' + err.message, 'severe'); }
};
$('#arDel').onclick = async () => { const id = $('#arId').value; if (!id) return toast('Load an area with "Edit (admin)" first.', 'moderate'); if (!confirm('Delete this flood-prone area?')) return;
  try { await api('/api/admin/areas/' + id, {method:'DELETE', headers:{'X-Admin-Token':sessionStorage.adm}}); toast('Area deleted.', 'low'); clearArea(); loadAreas(); }
  catch (err) { toast('Could not delete: ' + err.message, 'severe'); } };

// ---------- navigation + delegated actions ----------
function showTab(t) {
  $$('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.t === t)); $$('.tabpane').forEach(p => p.classList.toggle('on', p.id === 't-' + t));
  if (t !== 'route' && t !== 'report') setPick(null);
}
$$('#tabs button').forEach(b => b.onclick = () => { showTab(b.dataset.t); if (innerWidth <= 1000) $('.panes').scrollIntoView({behavior:'smooth', block:'start'}); });
$('#bell').onclick = () => { showTab('alerts'); $('.panes').scrollIntoView({behavior:'smooth', block:'start'}); }; $('#gear').onclick = () => { showTab('settings'); $('.panes').scrollIntoView({behavior:'smooth', block:'start'}); };
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('.route-card,.near')) e.target.click(); });
document.addEventListener('click', e => {
  const rc = e.target.closest('.route-card'); if (rc && !e.target.closest('details,a,button')) return selectRoute(+rc.dataset.i);
  const b = e.target.closest('[data-act]'); if (!b) return; const d = b.dataset;
  switch (d.act) {
    case 'retry': S.wErr = S.riskErr = null; renderRisk(); loadWeather(); loadRisk(); break;
    case 'tab': showTab(d.tab); break;
    case 'sel-loc': map.closePopup(); pickLoc(+d.lat, +d.lon, d.name); break;
    case 'fly': map.flyTo([+d.lat, +d.lon], 17); break;
    case 'alert-f': S.alertF[d.k] = d.v; renderAlerts(); break;
    case 'set-status': setStatus(d.id, d.v); break;
    case 'edit-area': editArea(+d.id); break;
    case 'rm-saved': { const l = places(); l.splice(+d.i, 1); localStorage.fwPlaces = JSON.stringify(l); renderSaved(); break; }
  }
});

// ---------- boot ----------
applyTheme(); applyMotion(); renderLegend(); renderNotify(); renderSaved(); renderRisk(); renderAlerts(); renderReportList();
addEventListener('online', () => $('#offline').classList.remove('on')); addEventListener('offline', () => $('#offline').classList.add('on')); $('#offline').classList.toggle('on', !navigator.onLine);
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => prefs.theme === 'auto' && applyTheme());
(async () => { await loadAlerts(true); selectLocation(S.loc); loadAreas(); loadReports(); })();
setInterval(() => { if (!document.hidden) { loadWeather(); loadRisk(); } }, 10 * 60e3);
setInterval(() => { if (!document.hidden) loadReports(); }, 60e3);
setInterval(async () => { if (!document.hidden) await loadAlerts(false); }, 60e3);
