/**
 * Lightweight JavaScript Usability Tracker & Analytics Engine
 * Captures clicks, mouse movement, scroll depth and rage clicks, then
 * renders click / movement / scroll heatmaps on top of the page.
 *
 * Usage:  <script src="js/tracker.js"></script>
 *         UsabilityTracker.renderHeatmap('click');
 */
(function (global) {
  'use strict';

  const SESSION_ID = 'session_' + Math.random().toString(36).substring(2, 9);
  const MOVE_INTERVAL_MS = 250;      // throttle for mouse sampling
  const RAGE_CLICKS = 3;             // clicks needed to count as rage
  const RAGE_WINDOW_MS = 700;        // ...within this time
  const RAGE_RADIUS_PX = 40;         // ...and this distance
  const BANDS = 20;                  // scroll dwell resolution (5% each)

  const logs = [];
  const listeners = [];
  const state = {
    startedAt: performance.now(),
    clicks: 0, moves: 0, rageClicks: 0, maxScroll: 0,
    bands: new Array(BANDS).fill(0),
    targets: {}
  };

  // Elements marked data-tracker-ignore (e.g. the control dock) are not tracked.
  const ignored = (el) => el && el.closest && el.closest('[data-tracker-ignore]');

  function docSize() {
    const d = document.documentElement;
    return { w: Math.max(d.scrollWidth, d.clientWidth), h: Math.max(d.scrollHeight, d.clientHeight) };
  }

  // Normalise coordinates relative to the full document (needed for heatmaps)
  function getPageCoordinates(event) {
    const sx = window.pageXOffset || document.documentElement.scrollLeft;
    const sy = window.pageYOffset || document.documentElement.scrollTop;
    return {
      pageX: event.clientX + sx, pageY: event.clientY + sy,
      clientX: event.clientX, clientY: event.clientY,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight
    };
  }

  function push(entry) {
    logs.push(entry);
    listeners.forEach((fn) => { try { fn(entry, state); } catch (e) { console.error(e); } });
  }

  function describe(el) {
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\s+/)[0] : '';
    return el.tagName.toLowerCase() + id + cls;
  }

  // 1. Clicks (with rage-click detection)
  const recent = [];
  document.addEventListener('click', function (event) {
    if (ignored(event.target)) return;
    const c = getPageCoordinates(event);
    const el = event.target;
    const t = performance.now();

    const entry = {
      sessionId: SESSION_ID, eventType: 'click',
      timestamp: new Date().toISOString(), timeOffsetMs: Math.round(t),
      targetTag: el.tagName, targetId: el.id || null,
      targetClass: el.className || null,
      targetText: (el.innerText || '').substring(0, 30),
      x: c.pageX, y: c.pageY, viewportW: c.viewportWidth, viewportH: c.viewportHeight
    };

    recent.push({ t, x: c.pageX, y: c.pageY });
    while (recent.length && t - recent[0].t > RAGE_WINDOW_MS) recent.shift();
    const near = recent.filter((r) => Math.hypot(r.x - c.pageX, r.y - c.pageY) < RAGE_RADIUS_PX);
    if (near.length >= RAGE_CLICKS) { entry.rage = true; state.rageClicks++; recent.length = 0; }

    state.clicks++;
    const key = describe(el);
    state.targets[key] = (state.targets[key] || 0) + 1;
    push(entry);
  }, true);

  // 2. Mouse movement (throttled)
  let lastMove = 0;
  document.addEventListener('mousemove', function (event) {
    const now = performance.now();
    if (now - lastMove < MOVE_INTERVAL_MS || ignored(event.target)) return;
    lastMove = now;
    const c = getPageCoordinates(event);
    state.moves++;
    push({ sessionId: SESSION_ID, eventType: 'mousemove', timestamp: new Date().toISOString(), x: c.pageX, y: c.pageY });
  });

  // 3. Scroll depth + dwell time per page band
  function scrollPercent() {
    const { h } = docSize();
    return Math.min(100, Math.round(((window.pageYOffset + window.innerHeight) / h) * 100));
  }
  let lastScrollLog = 0;
  window.addEventListener('scroll', function () {
    const pct = scrollPercent();
    if (pct > state.maxScroll) state.maxScroll = pct;
    const now = performance.now();
    if (now - lastScrollLog < 400) return;
    lastScrollLog = now;
    push({ sessionId: SESSION_ID, eventType: 'scroll', timestamp: new Date().toISOString(), depthPercent: pct, y: window.pageYOffset });
  }, { passive: true });

  state.maxScroll = scrollPercent();
  setInterval(function () {            // dwell: which part of the page is on screen
    if (document.hidden) return;
    const { h } = docSize();
    const mid = (window.pageYOffset + window.innerHeight / 2) / h;
    state.bands[Math.max(0, Math.min(BANDS - 1, Math.floor(mid * BANDS)))] += 0.5;
  }, 500);

  // ---- Heatmap rendering ---------------------------------------------------
  let overlay = null;
  const palette = (function () {
    const c = document.createElement('canvas'); c.width = 1; c.height = 256;
    const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 256);
    [[0, '#2b3cff'], [0.3, '#9b2cff'], [0.55, '#ff3d6e'], [0.8, '#ff9f1c'], [1, '#ffe45e']]
      .forEach(([s, col]) => grad.addColorStop(s, col));
    g.fillStyle = grad; g.fillRect(0, 0, 1, 256);
    return g.getImageData(0, 0, 1, 256).data;
  })();

  function clearHeatmap() { if (overlay) { overlay.remove(); overlay = null; } }

  function makeOverlay() {
    clearHeatmap();
    const { w, h } = docSize();
    overlay = document.createElement('canvas');
    overlay.width = w; overlay.height = h;
    overlay.setAttribute('data-tracker-ignore', '');
    overlay.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:99990;';
    document.body.appendChild(overlay);
    return overlay;
  }

  function renderPointHeatmap(type) {
    const cv = makeOverlay(), ctx = cv.getContext('2d');
    const radius = type === 'click' ? 34 : 46, strength = type === 'click' ? 0.45 : 0.14;
    const brush = document.createElement('canvas'); brush.width = brush.height = radius * 2;
    const b = brush.getContext('2d'), rg = b.createRadialGradient(radius, radius, 0, radius, radius, radius);
    rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = rg; b.fillRect(0, 0, radius * 2, radius * 2);

    const wanted = type === 'click' ? 'click' : 'mousemove';
    const pts = logs.filter((e) => e.eventType === wanted);
    ctx.globalAlpha = strength;
    pts.forEach((p) => ctx.drawImage(brush, p.x - radius, p.y - radius));
    ctx.globalAlpha = 1;

    const img = ctx.getImageData(0, 0, cv.width, cv.height), d = img.data;
    for (let i = 3; i < d.length; i += 4) {
      const a = d[i];
      if (!a) continue;
      const p = a * 4;
      d[i - 3] = palette[p]; d[i - 2] = palette[p + 1]; d[i - 1] = palette[p + 2];
      d[i] = Math.min(235, a * 1.6);
    }
    ctx.putImageData(img, 0, 0);
    return pts.length;
  }

  function renderScrollHeatmap() {
    const cv = makeOverlay(), ctx = cv.getContext('2d');
    const max = Math.max.apply(null, state.bands) || 1, bh = cv.height / BANDS;
    state.bands.forEach((v, i) => {
      const p = Math.round((v / max) * 255) * 4;
      ctx.fillStyle = 'rgba(' + palette[p] + ',' + palette[p + 1] + ',' + palette[p + 2] + ',' + (0.12 + 0.38 * (v / max)) + ')';
      ctx.fillRect(0, i * bh, cv.width, bh);
    });
    return state.bands.filter(Boolean).length;
  }

  // ---- Public API ------------------------------------------------------------
  global.UsabilityTracker = {
    sessionId: SESSION_ID,
    getLogs: () => logs,
    getState: () => state,
    subscribe: (fn) => { listeners.push(fn); },
    elapsedMs: () => performance.now() - state.startedAt,

    exportJSON: () => JSON.stringify({ sessionId: SESSION_ID, summary: summary(), events: logs }, null, 2),
    exportCSV: function () {
      const cols = ['sessionId', 'eventType', 'timestamp', 'x', 'y', 'targetTag', 'targetId', 'targetText', 'depthPercent', 'rage'];
      const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      return [cols.join(',')].concat(logs.map((l) => cols.map((c) => esc(l[c])).join(','))).join('\n');
    },

    renderHeatmap: function (type) {
      if (type === 'scroll') return renderScrollHeatmap();
      return renderPointHeatmap(type === 'move' ? 'move' : 'click');
    },
    renderClickOverlay: () => renderPointHeatmap('click'),   // backwards compatible
    clearHeatmap: clearHeatmap,

    reset: function () {
      logs.length = 0; recent.length = 0;
      Object.assign(state, { clicks: 0, moves: 0, rageClicks: 0, maxScroll: scrollPercent(), targets: {} });
      state.bands.fill(0); clearHeatmap();
      listeners.forEach((fn) => fn(null, state));
    }
  };

  function summary() {
    return {
      durationSec: Math.round(global.UsabilityTracker.elapsedMs() / 1000),
      clicks: state.clicks, mouseSamples: state.moves,
      rageClicks: state.rageClicks, maxScrollDepthPercent: state.maxScroll,
      topTargets: state.targets
    };
  }
})(window);
