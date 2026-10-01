/**
 * UI layer: live stats, event stream, hero cursor trail and dock controls.
 * Depends on tracker.js (window.UsabilityTracker).
 */
(function () {
  'use strict';
  const T = window.UsabilityTracker;
  const $ = (id) => document.getElementById(id);
  const fmtTime = (ms) => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  $('sid').textContent = T.sessionId;

  // ---- Live stats ----------------------------------------------------------
  const els = { clicks: $('sClicks'), moves: $('sMoves'), scroll: $('sScroll'), rage: $('sRage') };
  const last = {};
  function setStat(key, value) {
    if (last[key] === value) return;
    last[key] = value;
    els[key].textContent = value;
    els[key].classList.add('bump');
    setTimeout(() => els[key].classList.remove('bump'), 250);
  }

  function renderTargets(state) {
    const rows = Object.entries(state.targets).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const list = $('targets');
    if (!rows.length) { list.innerHTML = '<li class="empty">No clicks yet. Click anything on the page.</li>'; return; }
    const top = rows[0][1];
    list.innerHTML = rows.map(([name, n]) =>
      '<li><div class="row"><span>' + name.replace(/</g, '&lt;') + '</span><span>' + n + '</span></div>' +
      '<div class="bar"><i style="width:' + Math.round((n / top) * 100) + '%"></i></div></li>').join('');
  }

  function addStream(entry) {
    const ul = $('stream');
    const empty = ul.querySelector('.empty'); if (empty) empty.remove();
    const li = document.createElement('li');
    const detail = entry.eventType === 'click'
      ? (entry.targetTag.toLowerCase() + ' at ' + Math.round(entry.x) + ', ' + Math.round(entry.y) + (entry.rage ? '  rage click' : ''))
      : entry.eventType === 'scroll' ? 'depth ' + entry.depthPercent + '%'
      : 'cursor at ' + Math.round(entry.x) + ', ' + Math.round(entry.y);
    li.innerHTML = '<span class="t">' + fmtTime(T.elapsedMs()) + '</span><span class="k k-' + entry.eventType + '">' + entry.eventType + '</span><span>' + detail + '</span>';
    if (entry.rage) li.classList.add('rage');
    ul.prepend(li);
    while (ul.children.length > 40) ul.lastChild.remove();
  }

  function sync(entry, state) {
    setStat('clicks', state.clicks);
    setStat('moves', state.moves);
    setStat('scroll', state.maxScroll + '%');
    setStat('rage', state.rageClicks);
    $('heroMoves').textContent = state.moves;
    if (!entry) {                                   // reset
      $('stream').innerHTML = '<li class="empty">Waiting for activity.</li>';
      renderTargets(state); return;
    }
    if (entry.eventType === 'click') renderTargets(state);
    addStream(entry);
  }
  T.subscribe(sync);
  sync(null, T.getState());
  setInterval(() => { $('sTime').textContent = fmtTime(T.elapsedMs()); }, 1000);

  // ---- Dock: heatmap modes + export ----------------------------------------
  const toast = $('toast');
  let toastTimer;
  function say(msg) {
    toast.textContent = msg; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function setMode(mode) {
    document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.show === mode));
    if (mode === 'off') { T.clearHeatmap(); return; }
    const n = T.renderHeatmap(mode);
    const label = { click: 'clicks', move: 'cursor samples', scroll: 'scroll zones' }[mode];
    if (!n) { say('Nothing recorded yet. Use the page, then try again.'); return; }
    say('Showing ' + n + ' ' + label);
  }
  document.querySelectorAll('[data-show]').forEach((b) =>
    b.addEventListener('click', () => setMode(b.dataset.show)));

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    say('Downloaded ' + name);
  }
  $('expJson').addEventListener('click', () => download(T.sessionId + '.json', T.exportJSON(), 'application/json'));
  $('expCsv').addEventListener('click', () => download(T.sessionId + '.csv', T.exportCSV(), 'text/csv'));
  $('reset').addEventListener('click', () => { T.reset(); setMode('off'); say('Session cleared'); });

  // Fake sign-up action so clicks have a visible outcome
  $('createBtn').addEventListener('click', () => {
    const v = $('email').value.trim();
    $('createHint').textContent = /\S+@\S+\.\S+/.test(v)
      ? 'Account created for ' + v + ' (demo only, nothing was sent).'
      : 'Enter a valid email address to continue.';
  });

  // Keep the overlay aligned if the layout changes
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => {
    const on = document.querySelector('.seg button.on'); if (on && on.dataset.show !== 'off') setMode(on.dataset.show);
  }, 300); });

  // ---- Hero: live cursor trail -------------------------------------------
  const cv = $('trail'), ctx = cv.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const blobs = [];
  function fit() { cv.width = cv.offsetWidth; cv.height = cv.offsetHeight; }
  fit(); window.addEventListener('resize', fit);

  $('hero').addEventListener('mousemove', (e) => {
    const r = cv.getBoundingClientRect();
    blobs.push({ x: e.clientX - r.left, y: e.clientY - r.top, life: 1 });
    if (blobs.length > 220) blobs.shift();
  });

  const stops = ['255,228,94', '255,159,28', '255,61,110', '155,44,255', '43,60,255'];
  (function frame() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = blobs.length - 1; i >= 0; i--) {
      const b = blobs[i];
      b.life -= reduce ? 0.08 : 0.011;
      if (b.life <= 0) { blobs.splice(i, 1); continue; }
      const c = stops[Math.min(4, Math.floor((1 - b.life) * 5))], rad = 30 + b.life * 70;
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, rad);
      g.addColorStop(0, 'rgba(' + c + ',' + (0.22 * b.life) + ')');
      g.addColorStop(1, 'rgba(' + c + ',0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, rad, 0, 6.2832); ctx.fill();
    }
    requestAnimationFrame(frame);
  })();
})();
