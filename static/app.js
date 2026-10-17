const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const COL = {low:'#22a559', moderate:'#e6b800', high:'#f08a24', severe:'#d92d2d', none:'#7b8794'};
const WX = {0:'Clear',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Rime fog',51:'Light drizzle',53:'Drizzle',55:'Dense drizzle',
  61:'Light rain',63:'Moderate rain',65:'Heavy rain',66:'Freezing rain',67:'Freezing rain',80:'Light showers',81:'Showers',82:'Violent showers',95:'Thunderstorm',96:'Thunderstorm, hail',99:'Thunderstorm, heavy hail'};
const SEVN = ['low','moderate','high','severe'];
const S = {loc:{name:'Manila', lat:14.5995, lon:120.9842}, mode:'select', o:null, d:null, rpt:null, alerts:[], prefs:JSON.parse(localStorage.fwPrefs||'{"minSev":0,"mon":null}'), charts:{}};
const fmt = (iso, o={}) => iso ? new Date(iso).toLocaleString('en-PH', {timeZone:'Asia/Manila', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', ...o}) : '—';
const key = l => (l||'none').toLowerCase().split(' ')[0].replace('insufficient','none');
const pill = l => `<span class="pill lvl-${key(l)}">${esc(l)}</span>`;
const inflight = {};
function api(path, opts) {
  if (!opts && inflight[path]) return inflight[path];            // de-duplicate identical GETs
  const p = fetch(path, opts).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.detail?.[0]?.msg || j.detail || r.statusText); return j; })
    .finally(() => delete inflight[path]);
  if (!opts) inflight[path] = p; return p;
}
const toast = (t, sev='high') => { const d = document.createElement('div'); d.className = 'toast'; d.style.borderLeftColor = COL[sev]; d.textContent = t; $('#toasts').append(d); setTimeout(() => d.remove(), 8000); };

// ---------- map ----------
const map = L.map('map', {zoomControl:true}).setView([S.loc.lat, S.loc.lon], 12);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'© OpenStreetMap contributors'}).addTo(map);
const G = {areas:L.markerClusterGroup(), reports:L.markerClusterGroup(), closures:L.layerGroup(), warnings:L.layerGroup(), radar:null, sel:L.layerGroup().addTo(map), route:L.layerGroup().addTo(map)};
const LAYERS = [['radar','Rainfall radar',false],['areas','Flood-prone areas (historical)',true],['reports','Flood reports',true],['warnings','Official warning areas',true],
  ['closures','Road closures (verified reports)',false],['stations','River/water-level stations (no data source)',null],['evac','Evacuation centers (no reliable dataset)',null]];
$('#layers').innerHTML = LAYERS.map(([k,n,on]) => `<label class="${on===null?'off':''}"><input type="checkbox" data-l="${k}" ${on?'checked':''} ${on===null?'disabled':''}>${n}</label>`).join('');
$('#layers').onchange = async e => {
  const k = e.target.dataset.l, on = e.target.checked;
  if (k === 'radar') { if (on) await loadRadar(); else if (G.radar) map.removeLayer(G.radar); return; }
  on ? map.addLayer(G[k]) : map.removeLayer(G[k]);
};
['areas','reports','warnings'].forEach(k => map.addLayer(G[k]));
$('#legend').innerHTML = `<b>Legend</b><div><span class="sw" style="background:${COL.low}"></span>Low estimated risk</div><div><span class="sw" style="background:${COL.moderate}"></span>Moderate</div>
 <div><span class="sw" style="background:${COL.high}"></span>High</div><div><span class="sw" style="background:${COL.severe}"></span>Severe / active official warning</div>
 <div><span class="sw" style="background:${COL.none}"></span>Insufficient data</div>
 <div>● round pin = historically flood-prone area (not necessarily flooded now)</div><div>◆ diamond = user flood report (colour = verification status)</div>
 <div>Blue overlay = rainfall radar · circles = official warning areas</div>`;
async function loadRadar() {
  try { const r = await api('/api/radar'); if (G.radar) map.removeLayer(G.radar);
    G.radar = L.tileLayer(r.tile_url, {opacity:.6, attribution:r.attribution, maxNativeZoom:7}).addTo(map);
    toast('Radar frame time: ' + fmt(r.frame_time), 'low');
  } catch (e) { toast('Radar unavailable: ' + e.message, 'moderate'); document.querySelector('[data-l=radar]').checked = false; }
}
const RS = {Unverified:'#8a94a0','Under Review':'#4c9bff', Verified:'#d92d2d', Resolved:'#22a559'};
async function loadAreas() {
  try {
    const rows = await api('/api/flood-areas?with_risk=true'); G.areas.clearLayers();
    rows.forEach(a => {
      const c = COL[key(a.risk.level)];
      const m = L.marker([a.lat, a.lon], {icon:L.divIcon({className:'', html:`<div class="pin-area" style="background:${c}"></div>`, iconSize:[18,18]}), title:a.name});
      m.bindPopup(() => `<b>${esc(a.name)}</b><br>${esc(a.city)}<br><small>Historical flood-prone location — not necessarily flooded now.</small><br>
        Frequency/severity: ${esc(a.frequency || 'unknown')}<br>Causes: ${esc(a.causes || 'unknown')}<br>Last reported event: ${esc(a.last_event || 'not recorded')}<br>
        Source: ${esc(a.source)}<br>Verification: ${esc(a.verification)} (${esc(a.verified_on || 'never verified')})<hr>
        Current estimate: ${pill(a.risk.level)}<br><small>${(a.risk.factors||[]).map(esc).join('<br>')}</small><br><button class="btn sm" onclick="pickLoc(${a.lat},${a.lon},'${esc(a.name).replace(/'/g,'')}')">Select</button>`);
      G.areas.addLayer(m);
    });
  } catch (e) { toast('Flood-prone areas failed to load: ' + e.message, 'moderate'); }
}
async function loadReports() {
  try {
    const rows = await api('/api/reports?limit=100'); G.reports.clearLayers(); G.closures.clearLayers(); S.reports = rows;
    rows.filter(r => r.status !== 'Resolved').forEach(r => {
      const m = L.marker([r.lat, r.lon], {icon:L.divIcon({className:'', html:`<div class="pin-report" style="background:${RS[r.status]}"></div>`, iconSize:[18,18]})});
      m.bindPopup(`<b>Flood report #${r.id}</b> — ${esc(r.status)}<br>${esc(r.description)}<br>Depth: ${r.depth_cm ?? 'unknown'} cm · ${esc(r.passable)}<br>Submitted ${fmt(r.created_at)}
        ${r.photo ? `<br><img src="/uploads/${esc(r.photo)}" style="max-width:200px" alt="Report photo">` : ''}<br><small>${r.status === 'Verified' ? 'Verified by an administrator.' : 'User-submitted and not confirmed.'}</small>`);
      G.reports.addLayer(m);
      if (r.status === 'Verified' && r.passable === 'Not passable') L.circle([r.lat, r.lon], {radius:120, color:'#d92d2d', fillOpacity:.25}).bindPopup('Road reported not passable (verified)').addTo(G.closures);
    });
    renderReportList();
  } catch (e) { $('#repList').textContent = 'Reports unavailable: ' + e.message; }
}
function renderReportList() {
  const adm = sessionStorage.adm;
  $('#repList').innerHTML = (S.reports || []).slice(0, 15).map(r => `<div class="alert"><b>#${r.id} ${esc(r.status)}</b> · ${fmt(r.created_at)}<br>${esc(r.description)}
    ${adm ? `<br>${['Under Review','Verified','Resolved','Rejected'].map(s => `<button class="btn sm alt" onclick="setStatus(${r.id},'${s}')">${s}</button>`).join('')}` : ''}</div>`).join('') || '<p class="muted">No reports yet.</p>';
}
window.setStatus = async (id, status) => {
  try { await api('/api/admin/reports/' + id, {method:'PATCH', headers:{'Content-Type':'application/json','X-Admin-Token':sessionStorage.adm}, body:JSON.stringify({status})}); loadReports(); }
  catch (e) { toast('Admin action failed: ' + e.message, 'severe'); }
};

// ---------- location ----------
window.pickLoc = (lat, lon, name) => { map.closePopup(); selectLocation({name:name || `Pinned ${lat.toFixed(3)}, ${lon.toFixed(3)}`, lat, lon}); };
map.on('click', e => {
  const {lat, lng} = e.latlng, ll = [lat, lng];
  if (S.mode === 'select') return pickLoc(lat, lng);
  if (S.mode === 'origin') { S.o = ll; S.oName = 'Pinned point'; $('#oIn').value = `Pinned ${lat.toFixed(4)}, ${lng.toFixed(4)}`; }
  if (S.mode === 'dest') { S.d = ll; S.dName = 'Pinned point'; $('#dIn').value = `Pinned ${lat.toFixed(4)}, ${lng.toFixed(4)}`; }
  if (S.mode === 'report') { S.rpt = ll; $('#rTxt').textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`; }
  setMode('select');
});
function setMode(m) { S.mode = m; $('#mapmode').textContent = {select:'Click the map to select a location.', origin:'Click the map to set the route origin…', dest:'Click the map to set the destination…', report:'Click the map where flooding is seen…'}[m]; }
// place-name search for route endpoints (reuses the debounced geocoder)
function placeSearch(inId, resId, onPick) {
  let t; const inp = $(inId), box = $(resId);
  inp.oninput = () => { clearTimeout(t); const q = inp.value.trim(); if (q.length < 2) { box.style.display = 'none'; return; }
    t = setTimeout(async () => { try { const rs = await api('/api/geocode?q=' + encodeURIComponent(q));
      box.innerHTML = rs.map((r, i) => `<button type="button" data-i="${i}">${esc(r.name)}${r.region ? ', ' + esc(r.region) : ''}</button>`).join('') || '<div style="padding:8px">No matches</div>';
      box.style.display = 'block';
      box.onclick = ev => { const i = ev.target.dataset.i; if (i == null) return; box.style.display = 'none'; inp.value = rs[i].name + (rs[i].region ? ', ' + rs[i].region : ''); onPick([rs[i].lat, rs[i].lon], inp.value); };
    } catch (e) { box.innerHTML = `<div style="padding:8px">${esc(e.message)}</div>`; box.style.display = 'block'; } }, 350); };
}
placeSearch('#oIn', '#oRes', (ll, n) => { S.o = ll; S.oName = n; });
placeSearch('#dIn', '#dRes', (ll, n) => { S.d = ll; S.dName = n; });
$('#useO').onclick = () => { S.o = [S.loc.lat, S.loc.lon]; S.oName = S.loc.name; $('#oIn').value = S.loc.name; };
$('#useD').onclick = () => { S.d = [S.loc.lat, S.loc.lon]; S.dName = S.loc.name; $('#dIn').value = S.loc.name; };
$('#pickO').onclick = () => setMode('origin'); $('#pickD').onclick = () => setMode('dest'); $('#pickR').onclick = () => setMode('report');
async function selectLocation(loc) {
  S.loc = loc; $('#locName').textContent = loc.name; map.flyTo([loc.lat, loc.lon], Math.max(map.getZoom(), 12));
  G.sel.clearLayers(); L.circleMarker([loc.lat, loc.lon], {radius:8, color:'#1d6fe0', fillOpacity:.3}).addTo(G.sel);
  $('#cards').innerHTML = Array(8).fill('<div class="card"><small class="skel">label</small><b class="skel">00</b></div>').join('');
  await Promise.allSettled([loadWeather(), loadRisk(), loadHistory()]);
}
async function loadWeather() {
  const {lat, lon} = S.loc;
  try {
    const w = await api(`/api/weather?lat=${lat}&lon=${lon}`), c = w.current, rw = w.rain_window;
    const cat = c.precip >= 30 ? 'Torrential' : c.precip >= 15 ? 'Intense' : c.precip >= 7.5 ? 'Heavy' : c.precip >= 2.5 ? 'Moderate' : c.precip >= .1 ? 'Light' : 'None';
    const dirs = ['N','NE','E','SE','S','SW','W','NW'], dir = dirs[Math.round(c.wind_dir / 45) % 8];
    const offs = S.alerts.filter(a => a.kind === 'official' && a.active).length;
    const cards = [['Temperature', `${c.temp}°C`, `Feels like ${c.feels}°C`], ['Condition', WX[c.code] || `Code ${c.code}`, 'Model value'], ['Chance of rain (this hour)', c.prob == null ? 'N/A' : c.prob + '%', 'Forecast provider'],
      ['Rain intensity now', `${c.precip} mm/h`, cat === 'None' ? 'No rain' : cat], ['Humidity', c.humidity + '%', ''], ['Wind', `${c.wind} km/h ${dir}`, ''], ['Visibility', c.visibility == null ? 'N/A' : (c.visibility / 1000).toFixed(1) + ' km', ''],
      ['Official warnings', offs ? offs + ' active' : 'None entered', offs ? 'See alert center' : 'Check PAGASA directly']];
    $('#cards').innerHTML = cards.map(([a,b,c2]) => `<div class="card"><small>${a}</small><b>${esc(b)}</b><small>${esc(c2)}</small></div>`).join('');
    $('#updated').textContent = `Model time ${fmt(w.model_time)} · fetched ${fmt(w.fetched_at)}`;
    $('#stale').classList.toggle('on', w.stale); $('#stale').textContent = w.stale ? 'Provider unreachable — showing cached data fetched ' + fmt(w.fetched_at) : '';
    $('#rainwin').textContent = (rw.rain_expected ? (rw.ongoing ? `Rain in the model now, until about ${fmt(rw.end)}. ` : `Rain forecast to begin about ${fmt(rw.start)} and end about ${fmt(rw.end)}. `) : '') + rw.note;
    const h = w.hourly.slice(w.now_index, w.now_index + 24), lab = h.map(x => fmt(x.time, {month:undefined, day:undefined, minute:undefined}));
    draw('chRain', {data:{labels:lab, datasets:[{type:'bar', label:'Precipitation (mm/h, forecast)', data:h.map(x => x.precip), backgroundColor:'#4c9bff', yAxisID:'y'}, {type:'line', label:'Rain probability (%)', data:h.map(x => x.prob), borderColor:'#f08a24', yAxisID:'y1', pointRadius:0}]},
      options:{scales:{y:{title:{display:true,text:'mm/h'}}, y1:{position:'right', min:0, max:100, grid:{drawOnChartArea:false}}}}});
    draw('chTemp', {type:'line', data:{labels:lab, datasets:[{label:'Temperature (°C)', data:h.map(x => x.temp), borderColor:'#d92d2d', pointRadius:0, yAxisID:'y'}, {label:'Wind (km/h)', data:h.map(x => x.wind), borderColor:'#1d6fe0', pointRadius:0, yAxisID:'y1'}]}, options:{scales:{y1:{position:'right', grid:{drawOnChartArea:false}}}}});
    $('#daily').innerHTML = w.daily.slice(1, 8).map(d => `<div class="card"><b style="font-size:14px">${fmt(d.date + 'T12:00:00+08:00', {hour:undefined, minute:undefined, weekday:'short'})}</b><br>${esc(WX[d.code] || '')}<br>${d.tmin}–${d.tmax}°C<br>Rain ${d.precip_sum} mm<br>Prob ≤${d.prob_max ?? 'N/A'}%</div>`).join('');
  } catch (e) {
    $('#cards').innerHTML = `<div class="card" style="grid-column:1/-1"><b>Weather data unavailable</b><small>${esc(e.message)}. No readings are shown rather than guessed values.</small> <button class="btn sm" onclick="loadWeather()">Retry</button></div>`;
  }
}
window.loadWeather = loadWeather;
function draw(id, cfg) {
  S.charts[id]?.destroy();
  cfg.type = cfg.type || 'bar'; cfg.options = {responsive:true, interaction:{mode:'index', intersect:false}, ...(cfg.options || {})};
  S.charts[id] = new Chart($('#' + id), cfg);
}
async function loadRisk() {
  const {lat, lon} = S.loc;
  try {
    const r = await api(`/api/risk?lat=${lat}&lon=${lon}`);
    const offs = (r.officials || []).map(o => `<div class="alert ${o.severity}"><b>OFFICIAL: ${esc(o.title)}</b><br>${esc(o.source)} · issued ${fmt(o.issued_at)}<br><a href="${esc(o.url)}" target="_blank" rel="noopener">Official bulletin</a></div>`).join('');
    $('#t-risk').innerHTML = `<h3 style="margin:0 0 6px">Flood risk estimate ${pill(r.level)}</h3>${offs}
      <p class="muted">${esc(r.disclaimer)}</p><b>Why this level</b><ul class="clean">${(r.factors || []).map(f => `<li>${esc(f)}</li>`).join('') || '<li>No factors could be computed.</li>'}</ul>
      <b>Missing information (reduces confidence)</b><ul class="clean">${(r.missing || []).map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      <p class="muted">Assessed ${fmt(r.assessed_at)} · Sources: ${(r.sources || []).map(s => `${esc(s.name)} (fetched ${fmt(s.fetched_at)}${s.stale ? ', STALE' : ''})`).join('; ') || 'none available'}</p>`;
  } catch (e) { $('#t-risk').innerHTML = `<b>Risk estimate unavailable</b><p class="muted">${esc(e.message)}</p>`; }
}
async function loadHistory() {
  const {lat, lon} = S.loc, days = $('#days').value;
  try {
    const h = await api(`/api/history?lat=${lat}&lon=${lon}&days=${days}`), r = h.rain;
    draw('chHist', {data:{labels:r.time, datasets:[{label:'Daily rainfall (mm, modelled estimate)', data:r.precip_sum, backgroundColor:'#4c9bff'}]}});
    const ds = {}; h.alerts_by_day.forEach(a => ds[a.d] = (ds[a.d] || 0) + a.n);
    const rp = Object.fromEntries(h.reports_by_day.map(x => [x.d, x.n]));
    draw('chAl', {data:{labels:r.time, datasets:[{label:'Alerts issued', data:r.time.map(t => ds[t] || 0), backgroundColor:'#f08a24'}, {label:'Flood reports', data:r.time.map(t => rp[t] || 0), backgroundColor:'#d92d2d'}]}});
    $('#histNote').textContent = `${r.source}. ${h.gauge_data} Alert/report counts only cover the time this server has been running.`;
  } catch (e) { $('#histNote').textContent = 'Historical data unavailable: ' + e.message; }
}
$('#days').onchange = loadHistory;

// ---------- search (debounced) ----------
let st; $('#search').oninput = e => {
  clearTimeout(st); const q = e.target.value.trim(); if (q.length < 2) { $('#results').style.display = 'none'; return; }
  st = setTimeout(async () => {
    try { const rs = await api('/api/geocode?q=' + encodeURIComponent(q)); const box = $('#results');
      box.innerHTML = rs.map((r, i) => `<button data-i="${i}">${esc(r.name)}${r.region ? ', ' + esc(r.region) : ''}</button>`).join('') || '<div style="padding:8px">No matches</div>';
      box.style.display = 'block'; box.onclick = ev => { const i = ev.target.dataset.i; if (i == null) return; box.style.display = 'none'; $('#search').value = ''; selectLocation(rs[i]); };
    } catch (err) { $('#results').innerHTML = `<div style="padding:8px">${esc(err.message)}</div>`; $('#results').style.display = 'block'; }
  }, 350);
};

// ---------- alerts ----------
async function loadAlerts(initial) {
  try {
    S.alerts = await api('/api/alerts');
    const mon = S.prefs.mon, vis = S.alerts.filter(a => a.kind === 'official' || !mon || mon.includes(a.location_key));
    const act = vis.filter(a => a.active);
    $('#badge').hidden = !act.length; $('#badge').textContent = act.length;
    const card = a => `<div class="alert ${a.severity} ${a.active ? '' : 'expired'}"><b>${esc(a.title)}</b> ${pill(a.severity[0].toUpperCase() + a.severity.slice(1))} ${a.kind === 'official' ? '<b>OFFICIAL</b>' : '<span class="muted">calculated</span>'}<br>
      Area: ${esc(a.area)}${a.starts_at ? `<br>Expected: ${fmt(a.starts_at)}${a.ends_at ? ' – ' + fmt(a.ends_at) : ''}` : ''}${a.probability != null ? `<br>Rain probability: ${a.probability}%` : ''}
      <br>Source: ${esc(a.source)}<br>Issued ${fmt(a.issued_at)} · ${a.active ? 'expires' : 'expired'} ${fmt(a.expires_at)}<br>${esc(a.recommendation || '')}${a.url ? `<br><a href="${esc(a.url)}" target="_blank" rel="noopener">Official advisory</a>` : ''}</div>`;
    const part = (t, l) => l.length ? `<h4>${t}</h4>${l.map(card).join('')}` : '';
    $('#t-alerts').innerHTML = (part('Official government warnings', act.filter(a => a.kind === 'official')) + part('Active alerts', act.filter(a => a.kind !== 'official')) + part('Recently expired (24 h)', vis.filter(a => !a.active)))
      || '<p class="muted">No alerts. This does not guarantee no flood risk — check official sources.</p>';
    const seen = new Set(JSON.parse(localStorage.fwSeen || '[]'));
    act.filter(a => !seen.has(a.id) && SEVN.indexOf(a.severity) >= +S.prefs.minSev).forEach(a => {
      if (!initial) { toast(`${a.title} — ${a.area}`, a.severity); if (Notification?.permission === 'granted') new Notification('FloodWatch PH: ' + a.title, {body:a.area + ' · ' + (a.recommendation || '')}); }
    });
    localStorage.fwSeen = JSON.stringify(act.map(a => a.id));
  } catch (e) { $('#t-alerts').innerHTML = `<p class="muted">Alerts unavailable: ${esc(e.message)}</p>`; }
}

// ---------- route ----------
$('#goRoute').onclick = async () => {
  if (!S.o || !S.d) return toast('Choose a place from the suggestions (or pick on the map) for both origin and destination.', 'moderate');
  $('#routeOut').innerHTML = '<div class="skel" style="height:60px">loading</div>';
  try {
    const r = await api(`/api/route-risk?o_lat=${S.o[0]}&o_lon=${S.o[1]}&d_lat=${S.d[0]}&d_lon=${S.d[1]}`); G.route.clearLayers();
    const lines = r.routes.map(rt => { const c = rt.verified_flood_reports ? COL.severe : rt.hazards.length ? COL.high : '#1d6fe0';
      return L.geoJSON(rt.geometry, {style:{color:c, weight:5, opacity:.8}}).addTo(G.route); });
    $('#routeOut').innerHTML = `<p><b>${esc(S.oName || 'Origin')}</b> → <b>${esc(S.dName || 'Destination')}</b></p>` + r.routes.map((rt, i) => `<div class="rt" data-i="${i}"><b>Route ${i + 1}</b>: ${rt.distance_km} km, ~${rt.duration_min} min (no live traffic)<br>${esc(rt.warning)}
      <ul class="clean">${rt.hazards.map(h => `<li>${esc(h.name)} (${h.distance_m} m away) — ${esc(h.type)}</li>`).join('')}</ul></div>`).join('') + `<p class="muted">${esc(r.disclaimer)}</p>`;
    $('#routeOut').onclick = e => { const el = e.target.closest('.rt'); if (!el) return; document.querySelectorAll('.rt').forEach(x => x.classList.remove('sel')); el.classList.add('sel'); map.fitBounds(lines[+el.dataset.i].getBounds()); };
    map.fitBounds(L.featureGroup(lines).getBounds());
  } catch (e) { $('#routeOut').innerHTML = `<p class="muted">Routing failed: ${esc(e.message)}</p>`; }
};
$('#clrRoute').onclick = () => { G.route.clearLayers(); S.o = S.d = null; S.oName = S.dName = null; $('#oIn').value = $('#dIn').value = ''; $('#routeOut').innerHTML = ''; };

// ---------- report form ----------
$('#repForm').onsubmit = async e => {
  e.preventDefault(); if (!S.rpt) return toast('Pick the flood location on the map first.', 'moderate');
  const f = new FormData(); f.append('lat', S.rpt[0]); f.append('lon', S.rpt[1]); f.append('description', $('#rDesc').value); f.append('passable', $('#rPass').value); f.append('website', $('#rWeb').value);
  if ($('#rDepth').value) f.append('depth_cm', $('#rDepth').value); if ($('#rPhoto').files[0]) f.append('photo', $('#rPhoto').files[0]);
  try { const r = await api('/api/reports', {method:'POST', body:f}); $('#rMsg').textContent = r.message; $('#repForm').reset(); S.rpt = null; $('#rTxt').textContent = 'not set'; loadReports(); }
  catch (err) { $('#rMsg').textContent = 'Failed: ' + err.message; }
};

// ---------- settings / chrome ----------
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => showTab(b.dataset.t));
function showTab(t) { document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.t === t)); document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('on', p.id === 't-' + t)); }
$('#bell').onclick = () => { showTab('alerts'); $('#t-alerts').scrollIntoView({behavior:'smooth'}); }; $('#gear').onclick = () => showTab('settings');
const setTheme = t => { document.documentElement.dataset.theme = t; localStorage.fwTheme = t; };
setTheme(localStorage.fwTheme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
$('#theme').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
const savePrefs = () => localStorage.fwPrefs = JSON.stringify(S.prefs);
$('#minSev').value = S.prefs.minSev; $('#minSev').onchange = e => { S.prefs.minSev = e.target.value; savePrefs(); };
api('/api/monitored').then(m => { $('#monList').innerHTML = m.map(x => `<label><input type="checkbox" value="${esc(x.name)}" ${!S.prefs.mon || S.prefs.mon.includes(x.name) ? 'checked' : ''}> ${esc(x.name)}</label>`).join('<br>');
  $('#monList').onchange = () => { S.prefs.mon = [...document.querySelectorAll('#monList input:checked')].map(i => i.value); savePrefs(); loadAlerts(true); }; }).catch(() => {});
$('#push').onclick = async () => { if (!('Notification' in window)) { $('#pushMsg').textContent = 'Not supported in this browser.'; return; } const p = await Notification.requestPermission(); $('#pushMsg').textContent = p === 'granted' ? 'Enabled while this page is open.' : 'Permission not granted.'; };
$('#geo').onclick = () => navigator.geolocation?.getCurrentPosition(p => { pickLoc(p.coords.latitude, p.coords.longitude, 'My location'); L.circleMarker([p.coords.latitude, p.coords.longitude], {radius:6, color:'#22a559'}).addTo(G.sel); }, () => toast('Location permission denied — search or click the map instead.', 'moderate'));
$('#admTok').value = sessionStorage.adm || ''; $('#admTok').oninput = e => { sessionStorage.adm = e.target.value; renderReportList(); };
const net = () => $('#offline').classList.toggle('on', !navigator.onLine); addEventListener('online', net); addEventListener('offline', net); net();

// ---------- boot ----------
function drawWarnings() { G.warnings.clearLayers(); S.alerts.filter(a => a.kind === 'official' && a.active && a.lat != null && a.radius_km).forEach(a => L.circle([a.lat, a.lon], {radius:a.radius_km * 1000, color:COL[a.severity], fillOpacity:.12}).bindPopup(`<b>${esc(a.title)}</b><br>${esc(a.source)}`).addTo(G.warnings)); }
(async () => { await loadAlerts(true); drawWarnings(); selectLocation(S.loc); loadAreas(); loadReports(); })();
setInterval(() => { loadWeather(); loadRisk(); loadReports(); }, 10 * 60e3);
setInterval(async () => { await loadAlerts(false); drawWarnings(); }, 5 * 60e3);
