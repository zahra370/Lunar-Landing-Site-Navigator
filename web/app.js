console.log('SoloHorizon Tech build v3');

/* ================= State ================= */
let DATA = null, VIEW = null, playTimer = null, LAST_POLAR = null;
const R = { markers: [], labels: [], realSurface: false, lastK: 0 };
const COLORS = ['#e8890c', '#2f80ed', '#8e44c9', '#d6336c', '#0f9d8a'];
const MAX_SITES = 5;
const GOOD = '#1e9e5a';
const FONT = { family: 'Inter, sans-serif', color: '#1f2a44' };
const GRID = 'rgba(15,30,60,0.10)';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const KM_PER_DEG = 1737.4 * Math.PI / 180; // km per degree on the Moon's surface (about 30.3)
const $ = id => document.getElementById(id);

/* ================= Load data ================= */
fetch('data/positions.json')
  .then(r => r.json())
  .then(d => {
    DATA = d;
    const box = $('sites');
    Object.keys(d.sites).forEach((n, i) => {
      const label = document.createElement('label');
      label.className = 'chip';
      label.innerHTML = `<input type="checkbox" value="${n}" ${i < 2 ? 'checked' : ''}><span>${n}</span>`;
      box.appendChild(label);
    });
    box.addEventListener('change', e => {
      if (box.querySelectorAll('input:checked').length > MAX_SITES) {
        e.target.checked = false;
        alert(`Please select up to ${MAX_SITES} sites.`);
      }
    });
    initMoon();
    run();
  })
  .catch(err => {
    console.error(err);
    $('reco').innerHTML = '<div class="panel error">Could not start the app: ' + err.message +
      '<br>Open this page through the local server (http://localhost:8000) and check data/positions.json exists.</div>';
  });

/* ================= Helpers ================= */
function fmtDate(iso, withTime) {
  const d = new Date(iso);
  let s = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (withTime) s += `, ${String(d.getUTCHours()).padStart(2, '0')}:00 UTC`;
  return s;
}

function fmtDur(h) {
  return h < 48 ? `${h} h` : `${(h / 24).toFixed(1)} days`;
}

function pct(arr, cond) {
  return 100 * arr.filter(cond).length / arr.length;
}

function longestRun(arr, cond) {
  let best = 0, cur = 0;
  arr.forEach(v => { cur = cond(v) ? cur + 1 : 0; best = Math.max(best, cur); });
  return best;
}

function baseLayout(extra) {
  return Object.assign({
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: FONT,
    margin: { l: 56, r: 20, t: 20, b: 48 },
    legend: { orientation: 'h', y: -0.2 }
  }, extra);
}

/* ================= Analysis ================= */
function analyze(name, idx) {
  const site = DATA.sites[name];
  const sun = idx.map(i => site.sun_alt[i]);
  const earth = idx.map(i => site.earth_alt[i]);
  const n = idx.length;
  const both = sun.map((v, k) => v > 0 && earth[k] > 0);

  // continuous windows where Sun and Earth are both above the horizon
  const windows = [];
  let start = -1;
  for (let k = 0; k < n; k++) {
    if (both[k] && start < 0) start = k;
    if (start >= 0 && (!both[k] || k === n - 1)) {
      windows.push([start, both[k] ? k : k - 1]);
      start = -1;
    }
  }
  let longest = null;
  windows.forEach(w => { if (!longest || (w[1] - w[0]) > (longest[1] - longest[0])) longest = w; });

  // best single moment: highest value of min(sun, earth)
  let bestK = 0, bestVal = -Infinity;
  for (let k = 0; k < n; k++) {
    const m = Math.min(sun[k], earth[k]);
    if (m > bestVal) { bestVal = m; bestK = k; }
  }

  return {
    name, sun, earth, windows, longest, bestK, bestVal,
    sunPct: pct(sun, v => v > 0),
    earthPct: pct(earth, v => v > 0),
    bothPct: 100 * both.filter(Boolean).length / n,
    darkest: longestRun(sun, v => v <= 0),
    blackout: longestRun(earth, v => v <= 0)
  };
}

/* ================= Recommendation panel ================= */
function renderReco(sorted) {
  const { idx, colorOf } = VIEW;
  const times = idx.map(i => DATA.times[i]);
  const best = sorted[0];
  const el = $('reco');

  if (best.bothPct === 0) {
    el.innerHTML = `<div class="panel reco warn">
      <span class="reco-badge">No good window</span>
      <h2 class="reco-title">Sun and Earth are never visible together in these dates</h2>
      <p class="reco-text">For the selected sites and dates there is no time when both solar power and a direct Earth link are available. Try a longer date range or different sites.</p>
    </div>`;
    return;
  }

  const w = best.longest;
  const days = ((w[1] - w[0] + 1) / 24).toFixed(1);
  const rows = sorted.map((r, rank) => `
    <div class="rank-row ${rank === 0 ? 'top' : ''}">
      <div class="rank-n">${rank + 1}</div>
      <div class="rank-body">
        <div class="rank-head"><span class="dot" style="background:${colorOf[r.name]}"></span><b>${r.name}</b>
          <span class="rank-pct">${r.bothPct.toFixed(1)}% good time</span></div>
        <div class="bar"><i style="width:${r.bothPct}%; background:${GOOD}"></i></div>
        <small>Sun visible ${r.sunPct.toFixed(0)}% &middot; Earth visible ${r.earthPct.toFixed(0)}% &middot;
          Longest darkness ${fmtDur(r.darkest)} &middot; Longest radio blackout ${fmtDur(r.blackout)}</small>
      </div>
    </div>`).join('');

  const intro = sorted.length > 1
    ? `Among your selected sites, <b>${best.name}</b> has the most time when both the Sun (for power) and Earth (for radio contact) are above the horizon.`
    : `At <b>${best.name}</b>, here is how often the Sun (for power) and Earth (for radio contact) are above the horizon together.`;

  el.innerHTML = `<div class="panel reco">
    <span class="reco-badge">${sorted.length > 1 ? 'Recommended site' : 'Selected site'}</span>
    <h2 class="reco-title">${best.name}</h2>
    <p class="reco-text">${intro}</p>
    <div class="facts">
      <div class="fact"><span>Good time overall</span><b>${best.bothPct.toFixed(1)}%</b><small>of the selected dates</small></div>
      <div class="fact"><span>Best window to land</span><b>${fmtDate(times[w[0]])} to ${fmtDate(times[w[1]])}</b>
        <small>${days} days in a row with Sun and Earth both visible</small></div>
      <div class="fact"><span>Best single moment</span><b>${fmtDate(times[best.bestK], true)}</b>
        <small>Sun ${best.sun[best.bestK].toFixed(1)} deg, Earth ${best.earth[best.bestK].toFixed(1)} deg above the horizon</small></div>
    </div>
    <p class="how">How we decide: a time is "good" when the Sun and Earth are both above the horizon. The site with the most good time ranks first.</p>
    ${rows}
  </div>`;
}

/* ================= South pole map (2D top view) ================= */
// Looking down at the south pole: 0 deg longitude at the top, east longitude increases clockwise.
function polarXY(lat, lon) {
  const rho = (90 - Math.abs(lat)) * KM_PER_DEG;
  const a = lon * Math.PI / 180;
  return [rho * Math.sin(a), rho * Math.cos(a)];
}

function drawPolarMap() {
  const { chosen, colorOf, best } = VIEW;
  const entries = Object.entries(DATA.sites);
  const others = entries.filter(([n]) => !chosen.includes(n));
  const tip = (n, s) => `${n}<br>Lat ${s.lat} deg, Lon ${s.lon} deg`;
  const POS = ['middle right', 'middle left', 'top center', 'bottom center', 'middle right'];
  const DEG = '\u00b0';

  const traces = [
    { // 0: sites not selected
      type: 'scatter', mode: 'markers+text', name: 'Other sites',
      x: others.map(([, s]) => polarXY(s.lat, s.lon)[0]),
      y: others.map(([, s]) => polarXY(s.lat, s.lon)[1]),
      text: others.map(([n]) => n), textposition: 'top center', textfont: { size: 11, color: '#8d98ad' },
      hovertext: others.map(([n, s]) => tip(n, s)), hoverinfo: 'text',
      marker: { size: 9, color: '#b4bccb' }
    },
    { // 1: selected sites
      type: 'scatter', mode: 'markers+text', name: 'Selected sites',
      x: chosen.map(n => polarXY(DATA.sites[n].lat, DATA.sites[n].lon)[0]),
      y: chosen.map(n => polarXY(DATA.sites[n].lat, DATA.sites[n].lon)[1]),
      text: chosen, textposition: chosen.map((n, k) => POS[k % POS.length]),
      textfont: { size: 13, color: '#16213a' },
      hovertext: chosen.map(n => tip(n, DATA.sites[n])), hoverinfo: 'text',
      marker: { size: 14, color: chosen.map(n => colorOf[n]), line: { color: '#ffffff', width: 2 } }
    },
    { // 2: ring around the recommended site
      type: 'scatter', mode: 'markers', name: 'Recommended', hoverinfo: 'skip',
      x: best.bothPct > 0 ? [polarXY(DATA.sites[best.name].lat, DATA.sites[best.name].lon)[0]] : [],
      y: best.bothPct > 0 ? [polarXY(DATA.sites[best.name].lat, DATA.sites[best.name].lon)[1]] : [],
      marker: { symbol: 'circle-open', size: 28, color: GOOD, line: { color: GOOD, width: 3 } }
    },
    { // 3: Sun direction (updated with the slider)
      type: 'scatter', mode: 'markers+text', name: 'Sun direction', x: [0], y: [190],
      text: ['Sun'], textposition: 'top center', hoverinfo: 'skip',
      marker: { size: 18, color: '#ffb300', line: { color: '#ffffff', width: 2 } }
    },
    { // 4: Earth direction (updated with the slider)
      type: 'scatter', mode: 'markers+text', name: 'Earth direction', x: [0], y: [190],
      text: ['Earth'], textposition: 'bottom center', hoverinfo: 'skip',
      marker: { size: 14, color: '#2f80ed', line: { color: '#ffffff', width: 2 } }
    },
    { // 5: the pole itself
      type: 'scatter', mode: 'markers+text', name: 'South pole', x: [0], y: [0],
      text: ['South pole'], textposition: 'bottom center', textfont: { size: 11, color: '#667391' }, hoverinfo: 'skip',
      marker: { symbol: 'x', size: 9, color: '#667391' }
    }
  ];

  const shapes = [], annotations = [];
  [88, 86, 84].forEach(lat => {
    const r = (90 - lat) * KM_PER_DEG;
    shapes.push({ type: 'circle', xref: 'x', yref: 'y', x0: -r, x1: r, y0: -r, y1: r,
      line: { color: 'rgba(15,30,60,0.22)', width: 1, dash: 'dot' } });
    annotations.push({ x: r * 0.7071, y: -r * 0.7071, xref: 'x', yref: 'y', showarrow: false,
      text: `${lat}${DEG}S (${r.toFixed(0)} km)`, font: { size: 10, color: '#667391' }, bgcolor: 'rgba(255,255,255,0.8)' });
  });
  [[`0${DEG} E (Earth side)`, 0, 206], [`90${DEG} E`, 204, 0], [`180${DEG}`, 0, -206], [`90${DEG} W`, -204, 0]].forEach(([t, x, y]) => {
    annotations.push({ x, y, xref: 'x', yref: 'y', text: t, showarrow: false, font: { size: 11, color: '#44557a' } });
  });

  Plotly.newPlot('polarmap', traces, baseLayout({
    margin: { l: 10, r: 10, t: 10, b: 10 },
    showlegend: false,
    xaxis: { range: [-225, 225], visible: false, constrain: 'domain' },
    yaxis: { range: [-225, 225], visible: false, scaleanchor: 'x', scaleratio: 1, constrain: 'domain' },
    shapes, annotations
  }), { responsive: true, displaylogo: false });
}

/* ================= Timeline chart ================= */
function drawTimeline() {
  const { idx, results, colorOf, best } = VIEW;
  const times = idx.map(i => DATA.times[i]);
  const traces = [];

  results.forEach(r => {
    const c = colorOf[r.name];
    traces.push({ x: times, y: r.sun, name: r.name + ' (Sun)', mode: 'lines', line: { color: c, width: 2 } });
    traces.push({ x: times, y: r.earth, name: r.name + ' (Earth)', mode: 'lines', line: { color: c, width: 2, dash: 'dot' } });
  });

  // shapes[0] = horizon, shapes[1] = "now" line, then green windows
  const shapes = [
    { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 0, y1: 0, line: { color: '#44557a', dash: 'dash', width: 1 } },
    { type: 'line', xref: 'x', yref: 'paper', x0: times[0], x1: times[0], y0: 0, y1: 1, line: { color: '#16213a', width: 2 } }
  ];
  const annotations = [];

  if (best.bothPct > 0) {
    best.windows.forEach(w => shapes.push({
      type: 'rect', xref: 'x', yref: 'paper', x0: times[w[0]], x1: times[w[1]], y0: 0, y1: 1,
      fillcolor: w === best.longest ? 'rgba(30,158,90,0.32)' : 'rgba(30,158,90,0.14)',
      line: { width: 0 }, layer: 'below'
    }));
    annotations.push({
      x: times[best.longest[0]], xref: 'x', y: 1, yref: 'paper', text: 'Best window',
      showarrow: false, xanchor: 'left', yanchor: 'top', font: { color: GOOD, size: 12 }, bgcolor: 'rgba(255,255,255,0.85)'
    });
    traces.push({
      x: [times[best.bestK]], y: [best.bestVal], mode: 'markers+text', name: 'Best moment',
      text: ['Best moment'], textposition: 'top center',
      marker: { symbol: 'star', size: 16, color: GOOD, line: { color: '#ffffff', width: 1 } }
    });
  }

  Plotly.newPlot('timeline', traces, baseLayout({
    xaxis: { title: 'Date (UTC)', gridcolor: GRID, zeroline: false },
    yaxis: { title: 'Elevation above horizon (deg)', gridcolor: GRID, zeroline: false },
    shapes, annotations
  }), { responsive: true, displaylogo: false });
}

/* ================= Sky dome (advanced) ================= */
function buildPolar() {
  const { idx, results, colorOf } = VIEW;
  const traces = [];
  results.forEach(r => {
    const site = DATA.sites[r.name];
    const c = colorOf[r.name];
    const up = idx.filter(i => site.sun_alt[i] > 0);
    traces.push({
      type: 'scatterpolar', mode: 'markers', name: r.name + ' (Sun)',
      theta: up.map(i => site.sun_az[i]), r: up.map(i => 90 - site.sun_alt[i]), marker: { size: 5, color: c }
    });
    const upE = idx.filter(i => site.earth_alt[i] > 0);
    traces.push({
      type: 'scatterpolar', mode: 'markers', name: r.name + ' (Earth)',
      theta: upE.map(i => site.earth_az[i]), r: upE.map(i => 90 - site.earth_alt[i]),
      marker: { size: 5, color: c, symbol: 'diamond-open' }
    });
  });
  LAST_POLAR = traces;
}

function drawDome() {
  if (!LAST_POLAR) return;
  Plotly.newPlot('skydome', LAST_POLAR, baseLayout({
    margin: { l: 40, r: 40, t: 20, b: 40 },
    polar: {
      bgcolor: 'rgba(15,30,60,0.03)',
      radialaxis: { range: [0, 90], gridcolor: GRID, linecolor: GRID, tickfont: { size: 10 } },
      angularaxis: { direction: 'clockwise', rotation: 90, gridcolor: GRID, linecolor: GRID }
    }
  }), { responsive: true, displaylogo: false });
}
$('domeBox').addEventListener('toggle', () => { if ($('domeBox').open) drawDome(); });

/* ================= 3D Moon ================= */
// Moon-fixed frame (x = prime meridian, y = 90E, z = north) -> three.js (x, y = up, z)
const toWorld = (x, y, z) => new THREE.Vector3(x, z, -y);
function sitePos(lat, lon) {
  const p = lat * Math.PI / 180, l = lon * Math.PI / 180;
  return toWorld(Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p));
}

const MOON_VERT = `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const MOON_FRAG = `
  uniform vec3 sunDir;
  uniform sampler2D moonMap;
  uniform float useMap;
  varying vec3 vPos;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec3(1.7);
      a *= 0.5;
    }
    return v;
  }
  float crater(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    float d = 10.0;
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        for (int z = -1; z <= 1; z++) {
          vec3 g = vec3(float(x), float(y), float(z));
          vec3 o = vec3(hash(i + g), hash(i + g + vec3(5.2, 1.3, 8.1)), hash(i + g + vec3(2.7, 9.4, 3.3)));
          d = min(d, length(g + o - f));
        }
      }
    }
    return d;
  }
  float height(vec3 p) {
    return fbm(p * 6.0) * 0.5 + smoothstep(0.0, 0.4, crater(p * 8.0)) * 0.5;
  }

  void main() {
    vec3 N = normalize(vPos);
    vec3 S = normalize(sunDir);

    // Illustrative procedural surface (used when no NASA texture is available)
    float base = fbm(N * 3.0);
    float maria = smoothstep(0.50, 0.62, fbm(N * 1.3 + vec3(3.0)));
    float c = crater(N * 8.0);
    float floorC = 1.0 - smoothstep(0.0, 0.30, c);
    float rim = smoothstep(0.26, 0.32, c) * (1.0 - smoothstep(0.32, 0.40, c));

    float albedo = 0.52 + 0.30 * (base - 0.5);
    albedo *= mix(1.0, 0.55, maria);
    albedo *= 1.0 - 0.12 * floorC;
    albedo += 0.08 * rim;
    vec3 color = vec3(albedo);

    float e = 0.01;
    float h0 = height(N);
    vec3 g = vec3(height(N + vec3(e, 0.0, 0.0)) - h0,
                  height(N + vec3(0.0, e, 0.0)) - h0,
                  height(N + vec3(0.0, 0.0, e)) - h0) / e;
    g -= N * dot(g, N);
    vec3 n = normalize(N - 0.03 * g);

    // Real NASA LROC color map (equirectangular, centered on 0 deg longitude)
    if (useMap > 0.5) {
      float lon = atan(-N.z, N.x);
      float lat = asin(clamp(N.y, -1.0, 1.0));
      vec2 uv = vec2(0.5 + lon / 6.2831853, 0.5 + lat / 3.1415927);
      color = pow(texture2D(moonMap, uv).rgb, vec3(2.2)) * 1.6;
      n = N;
    }

    float diff = max(dot(n, S), 0.0);
    float lit = smoothstep(-0.02, 0.10, dot(N, S));
    float light = 0.035 + 1.15 * diff * lit;

    vec3 col = color * light;
    col = pow(col, vec3(1.0 / 2.2));
    gl_FragColor = vec4(col, 1.0);
  }`;

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Text label as a sprite. The canvas is sized to the text so anchoring works at both ends.
function makeLabel(text, bg, fg, width) {
  const FONT_SPEC = '600 40px Inter, Arial, sans-serif';
  const m = document.createElement('canvas').getContext('2d');
  m.font = FONT_SPEC;
  const tw = Math.ceil(m.measureText(text).width) + 36;
  const c = document.createElement('canvas');
  c.width = tw + 8;
  c.height = 96;
  const g = c.getContext('2d');
  g.font = FONT_SPEC;
  g.fillStyle = bg;
  roundRect(g, 4, 8, tw, 80, 18);
  g.fill();
  g.fillStyle = fg;
  g.textBaseline = 'middle';
  g.fillText(text, 22, 49);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  sp.center.set(0, 0.5);
  sp.userData.upp = (width || 0.4) / 512; // world units per canvas pixel
  sp.userData.cw = c.width;
  sp.scale.set(c.width * sp.userData.upp, 96 * sp.userData.upp, 1);
  return sp;
}

function glowTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner);
  gr.addColorStop(0.25, inner);
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function earthTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#2a6fd6';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#3f9b57';
  for (let i = 0; i < 14; i++) {
    g.beginPath();
    g.ellipse(Math.random() * 256, 20 + Math.random() * 88, 8 + Math.random() * 22, 6 + Math.random() * 14, Math.random() * 3, 0, 6.28);
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.65)';
  for (let i = 0; i < 18; i++) {
    g.beginPath();
    g.ellipse(Math.random() * 256, Math.random() * 128, 10 + Math.random() * 24, 3 + Math.random() * 5, Math.random() * 3, 0, 6.28);
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}

// Markers and labels keep a constant size on screen: they shrink as the camera gets closer.
function setMarkerScale(k) {
  R.markers.forEach(m => m.scale.setScalar(k));
  R.labels.forEach(l => l.scale.set(l.userData.cw * l.userData.upp * k, 96 * l.userData.upp * k, 1));
}

function initMoon() {
  const el = $('moon3d');
  if (typeof THREE === 'undefined' || !THREE.OrbitControls) {
    el.innerHTML = '<div style="color:#fff;padding:20px">3D view could not load. Check your internet connection and refresh.</div>';
    return;
  }
  const w = el.clientWidth, h = el.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.setClearColor(0x05070f);
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, w / h, 0.02, 200);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 1.1;
  controls.maxDistance = 9;

  // Moon (procedural by default, NASA LROC texture if data/moon_color.jpg exists)
  const dummy = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, THREE.RGBAFormat);
  dummy.needsUpdate = true;
  R.moonMat = new THREE.ShaderMaterial({
    uniforms: {
      sunDir: { value: new THREE.Vector3(1, 0, 0) },
      moonMap: { value: dummy },
      useMap: { value: 0 }
    },
    vertexShader: MOON_VERT,
    fragmentShader: MOON_FRAG
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), R.moonMat));

  new THREE.TextureLoader().load('data/moon_color.jpg', tex => {
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    R.moonMat.uniforms.moonMap.value = tex;
    R.moonMat.uniforms.useMap.value = 1;
    R.realSurface = true;
    if (VIEW) drawAt(parseInt($('timeSlider').value));
  }, undefined, () => { /* no texture file: keep the illustrative surface */ });

  // Stars
  const sp = [];
  for (let i = 0; i < 900; i++) {
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(40);
    sp.push(v.x, v.y, v.z);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.14 })));

  // Sun
  R.sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,240,170,1)', 'rgba(255,190,50,0)'), transparent: true, depthWrite: false
  }));
  R.sun.scale.set(0.9, 0.9, 1);
  R.sunLabel = makeLabel('Sun', 'rgba(255,255,255,0.92)', '#8a5a00', 0.4);
  scene.add(R.sun, R.sunLabel);

  // Earth
  R.earth = new THREE.Mesh(new THREE.SphereGeometry(0.14, 32, 24), new THREE.MeshBasicMaterial({ map: earthTexture() }));
  R.earthLabel = makeLabel('Earth', 'rgba(255,255,255,0.92)', '#134a9c', 0.4);
  scene.add(R.earth, R.earthLabel);

  R.sites = new THREE.Group();
  scene.add(R.sites);
  R.renderer = renderer; R.scene = scene; R.camera = camera; R.controls = controls;

  setView('pole');
  window.addEventListener('resize', () => {
    const W = el.clientWidth, H = el.clientHeight;
    renderer.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  });
  (function loop() {
    requestAnimationFrame(loop);
    controls.update();
    const k = Math.min(1, Math.max(0.05, camera.position.distanceTo(controls.target) / 3.4));
    if (Math.abs(k - R.lastK) > 0.002) { R.lastK = k; setMarkerScale(k); }
    renderer.render(scene, camera);
  })();
}

function setView(kind) {
  if (!R.camera) return;
  R.controls.target.set(0, 0, 0);
  R.controls.minDistance = 1.1;
  if (kind === 'pole') R.camera.position.set(1.9, -2.8, 0.0);
  else R.camera.position.set(0.3, 1.0, 5.2);
  R.controls.update();
}

// Fly the camera close to one landing site. Drag to rotate around it, scroll to zoom.
function focusSite(name) {
  if (!R.camera || !DATA) return;
  const s = DATA.sites[name];
  const p = sitePos(s.lat, s.lon);                                   // unit vector to the site
  const north = new THREE.Vector3(0, 1, 0);
  const tangent = north.clone().sub(p.clone().multiplyScalar(north.dot(p))).normalize();
  R.controls.minDistance = 0.12;
  R.controls.target.copy(p);
  R.camera.position.copy(p).multiplyScalar(1.55).add(tangent.multiplyScalar(-0.25));
  R.controls.update();
}

function buildMarkers() {
  if (!R.sites) return;
  const { chosen, colorOf, best } = VIEW;
  while (R.sites.children.length) R.sites.remove(R.sites.children[0]);
  R.markers = [];
  R.labels = [];
  const bestName = best.bothPct > 0 ? best.name : null;
  // label anchors: right, left, above, below (so nearby labels do not sit on each other)
  const anchors = [[0, 0.5], [1, 0.5], [0.5, 0], [0.5, 1], [0, 0.5]];

  Object.entries(DATA.sites).forEach(([name, s]) => {
    const p = sitePos(s.lat, s.lon);
    const sel = chosen.includes(name);
    if (sel) {
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      halo.position.copy(p).multiplyScalar(1.003);
      R.sites.add(halo);
      R.markers.push(halo);
    }
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(sel ? 0.016 : 0.009, 16, 12),
      new THREE.MeshBasicMaterial({ color: sel ? colorOf[name] : 0x9aa4b8 })
    );
    m.position.copy(p).multiplyScalar(1.006);
    R.sites.add(m);
    R.markers.push(m);

    if (sel) {
      const lab = makeLabel(name, 'rgba(255,255,255,0.93)', '#16213a', 0.4);
      const a = anchors[chosen.indexOf(name) % anchors.length];
      lab.center.set(a[0], a[1]);
      lab.position.copy(p).multiplyScalar(1.02);
      R.sites.add(lab);
      R.labels.push(lab);
    }
    if (name === bestName) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.038, 40), new THREE.MeshBasicMaterial({ color: 0x1e9e5a, side: THREE.DoubleSide }));
      ring.position.copy(p).multiplyScalar(1.008);
      ring.lookAt(p.clone().multiplyScalar(2));
      R.sites.add(ring);
      R.markers.push(ring);
    }
  });
  R.lastK = 0; // force the render loop to re-apply the current marker size
}

function updateMoon(i) {
  if (!R.moonMat) return;
  const sd = DATA.sun_dir, ed = DATA.earth_dir;
  const s = toWorld(sd.x[i], sd.y[i], sd.z[i]);
  const e = toWorld(ed.x[i], ed.y[i], ed.z[i]);
  R.moonMat.uniforms.sunDir.value.copy(s);
  R.sun.position.copy(s).multiplyScalar(2.2);
  R.sunLabel.position.copy(R.sun.position).add(new THREE.Vector3(0.15, 0, 0));
  R.earth.position.copy(e).multiplyScalar(1.9);
  R.earthLabel.position.copy(R.earth.position).add(new THREE.Vector3(0.18, 0, 0));
}

function updateStatus(i) {
  $('status').innerHTML = VIEW.chosen.map(n => {
    const s = DATA.sites[n];
    const sa = s.sun_alt[i], ea = s.earth_alt[i];
    const good = sa > 0 && ea > 0;
    return `<div class="stat ${good ? 'good' : ''}" style="--c:${VIEW.colorOf[n]}">
      <div class="stat-name"><span class="dot"></span>${n}</div>
      <div class="pill ${sa > 0 ? 'on' : 'off'}">${sa > 0 ? 'Sun visible: solar power available' : 'Sun hidden: dark, no solar power'} (${sa.toFixed(1)} deg)</div>
      <div class="pill ${ea > 0 ? 'on' : 'off'}">${ea > 0 ? 'Earth visible: direct radio link possible' : 'Earth hidden: no direct radio link'} (${ea.toFixed(1)} deg)</div>
      <div class="verdict">${good ? 'Good conditions right now' : 'Not ideal right now'}</div>
    </div>`;
  }).join('');
}

function drawAt(k) {
  const i = VIEW.idx[k];
  const label = fmtDate(DATA.times[i], true);
  $('timeLabel').textContent = label;
  $('hud').textContent = label + (R.realSurface ? '  |  Surface: NASA LROC' : '');
  updateMoon(i);
  updateStatus(i);

  const t = DATA.times[i];
  Plotly.relayout('timeline', { 'shapes[1].x0': t, 'shapes[1].x1': t });

  // Sun and Earth directions on the south pole map (their longitude seen from the pole)
  const sd = DATA.sun_dir, ed = DATA.earth_dir, RR = 190;
  const sl = Math.atan2(sd.y[i], sd.x[i]), el = Math.atan2(ed.y[i], ed.x[i]);
  Plotly.restyle('polarmap', {
    x: [[RR * Math.sin(sl)], [RR * Math.sin(el)]],
    y: [[RR * Math.cos(sl)], [RR * Math.cos(el)]]
  }, [3, 4]);
}

/* ================= Controls ================= */
function stopPlay() {
  clearInterval(playTimer);
  playTimer = null;
  $('play').textContent = 'Play';
}

$('play').onclick = () => {
  if (!VIEW) return;
  if (playTimer) { stopPlay(); return; }
  $('play').textContent = 'Pause';
  playTimer = setInterval(() => {
    const sl = $('timeSlider');
    let v = parseInt(sl.value) + 4;
    if (v > parseInt(sl.max)) v = 0;
    sl.value = v;
    drawAt(v);
  }, 90);
};
$('timeSlider').oninput = e => { if (VIEW) drawAt(parseInt(e.target.value)); };
$('jumpBest').onclick = () => {
  if (!VIEW) return;
  stopPlay();
  $('timeSlider').value = VIEW.best.bestK;
  drawAt(VIEW.best.bestK);
};
$('viewPole').onclick = () => setView('pole');
$('viewWhole').onclick = () => setView('whole');

function buildZoomButtons() {
  const row = document.querySelector('.view-buttons');
  row.querySelectorAll('.zoom-site').forEach(b => b.remove());
  VIEW.chosen.forEach(n => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-ghost btn-small zoom-site';
    b.textContent = 'Zoom: ' + n;
    b.onclick = () => focusSite(n);
    row.appendChild(b);
  });
}

/* ================= Main ================= */
function run() {
  const chosen = [...$('sites').querySelectorAll('input:checked')].map(i => i.value);
  if (chosen.length === 0) { alert('Please select at least one site.'); return; }

  const s = new Date($('start').value);
  const e = new Date($('end').value);
  if (!(e > s)) { alert('End date must be after the start date.'); return; }

  stopPlay();

  const idx = [];
  DATA.times.forEach((t, i) => { const d = new Date(t); if (d >= s && d <= e) idx.push(i); });
  if (idx.length < 24) { alert('Please choose a longer date range.'); return; }

  const colorOf = {};
  chosen.forEach((n, k) => { colorOf[n] = COLORS[k % COLORS.length]; });

  const results = chosen.map(n => analyze(n, idx));
  const sorted = [...results].sort((a, b) => (b.bothPct - a.bothPct) || (b.sunPct - a.sunPct));
  const best = sorted[0];
  VIEW = { idx, chosen, colorOf, results, best };

  renderReco(sorted);
  drawPolarMap();
  drawTimeline();
  buildPolar();
  if ($('domeBox').open) drawDome();
  buildMarkers();
  buildZoomButtons();

  const slider = $('timeSlider');
  slider.max = idx.length - 1;
  slider.value = best.bothPct > 0 ? best.bestK : 0; // start at the best moment
  drawAt(parseInt(slider.value));
}

$('go').onclick = run;