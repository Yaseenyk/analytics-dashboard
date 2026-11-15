/**
 * The browser script, served by the Worker at /p.js. One <script> tag per site:
 *   <script defer src="https://pulse.yaseenyk.workers.dev/p.js" data-site="calc.streamerosai.com"></script>
 * Optional: data-exclude="/studio,/card" stops all tracking on those path prefixes.
 *
 * Written as plain ES5 inside String.raw so it can be sent as-is. It must not contain a backtick or a dollar-brace.
 *
 * What it sends, and what it never sends:
 *  - Sends: the page path (no query string), where the visitor came from, three utm values, screen size, language,
 *    scroll depth, seconds of real activity, whether a real person acted (human), and for each click the kind of
 *    thing clicked, its label, its position and the page section.
 *  - Never: input or textarea values, anything typed, cookies, a stored id (the tab id lives in sessionStorage and
 *    dies with the tab), IP addresses (the Worker never writes them).
 *  - Does nothing when Do Not Track or Global Privacy Control is on, or on localhost.
 */
export const TRACKER = String.raw`(function () {
  'use strict';
  var d = document, w = window, n = navigator;
  var s = d.currentScript;
  if (!s || w.__pulse) return;
  w.__pulse = 1;
  if (n.doNotTrack === '1' || w.doNotTrack === '1' || n.globalPrivacyControl) return;
  if (/^(localhost|127\.|\[::1\])/.test(location.hostname)) return;

  var site = s.getAttribute('data-site') || location.hostname;
  var endpoint = s.getAttribute('data-endpoint') || (new URL(s.src).origin + '/e');
  var exclude = (s.getAttribute('data-exclude') || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);

  function rid() {
    var a = new Uint8Array(8), o = '';
    (w.crypto || w.msCrypto).getRandomValues(a);
    for (var i = 0; i < a.length; i++) o += (a[i] % 36).toString(36);
    return o + Date.now().toString(36).slice(-3);
  }
  var sid;
  try { sid = sessionStorage.getItem('_ps'); if (!sid) { sid = rid(); sessionStorage.setItem('_ps', sid); } } catch (e) { sid = rid(); }

  var h = null, dirty = false, lastAct = 0, moves = 0, lastClicks = [], seq = 0;
  function tabHuman() { try { return !n.webdriver && sessionStorage.getItem('_ph') === '1'; } catch (e) { return false; } }

  function utm() {
    var p = new URLSearchParams(location.search), o = [];
    ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (k) { o.push((p.get(k) || '').slice(0, 40)); });
    return o.join('|');
  }

  function start(path, ref) {
    h = null;
    for (var i = 0; i < exclude.length; i++) if (path.indexOf(exclude[i]) === 0) return;
    h = { i: rid(), p: path.slice(0, 120), t0: Date.now(), r: (ref || '').slice(0, 200), m: utm(), hu: tabHuman() ? 1 : 0, a: 0, sc: 0, nc: 0, q: [] };
    moves = 0; lastClicks = []; seq = 0; dirty = true;
    setTimeout(function () { if (h && h.i === cur) send(); }, 2000);
    var cur = h.i;
  }

  function payload() {
    var o = {
      v: 1, s: site, i: h.i, u: sid, p: h.p, r: h.r, m: h.m,
      w: w.innerWidth || 0, h: w.innerHeight || 0, l: (n.language || '').slice(0, 12),
      hu: h.hu, a: h.a, sc: h.sc, nc: h.nc, c: h.q.splice(0, 30)
    };
    if (n.webdriver) o.wd = 1;
    return JSON.stringify(o);
  }

  function send() {
    if (!h) return;
    var body = payload();
    dirty = false;
    try {
      if (n.sendBeacon && n.sendBeacon(endpoint, new Blob([body], { type: 'text/plain' }))) return;
    } catch (e) {}
    try { fetch(endpoint, { method: 'POST', body: body, keepalive: true, mode: 'no-cors', headers: { 'content-type': 'text/plain' } }); } catch (e) {}
  }

  function act(e) {
    if (!h || !e.isTrusted) return;
    lastAct = Date.now();
    if (e.type === 'pointermove') {
      if (e.pointerType !== 'mouse') return;
      moves++;
      if (moves < 3) return;
    }
    if (!h.hu && !n.webdriver && d.visibilityState === 'visible' && lastAct - h.t0 > 800) {
      h.hu = 1; dirty = true; send();
      try { sessionStorage.setItem('_ph', '1'); } catch (e) {}
    }
  }
  ['pointerdown', 'keydown', 'touchstart', 'touchmove', 'wheel', 'pointermove'].forEach(function (ev) {
    d.addEventListener(ev, act, { passive: true, capture: true });
  });

  var raf = 0;
  w.addEventListener('scroll', function () {
    if (!h || raf) return;
    raf = w.requestAnimationFrame(function () {
      raf = 0;
      var el = d.documentElement, total = Math.max(el.scrollHeight, 1);
      var pct = Math.min(100, Math.round(100 * ((w.scrollY || el.scrollTop) + (w.innerHeight || 0)) / total));
      if (pct > h.sc) { h.sc = pct; dirty = true; }
    });
  }, { passive: true });

  setInterval(function () {
    if (!h || d.hidden) return;
    if (Date.now() - lastAct < 10000) { h.a++; dirty = true; }
  }, 1000);
  setInterval(function () { if (h && !d.hidden) send(); }, 15000);

  function label(el, strict, toolish) {
    var a = el.getAttribute('data-pulse-label') || el.getAttribute('aria-label') || el.getAttribute('title');
    if (a) return a.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (strict) return (el.id || el.getAttribute('name') || el.tagName.toLowerCase()).slice(0, 30);
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return (el.type || 'text') + (el.id ? '#' + el.id : '');
    var t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (toolish && (t.length > 24 || /\d/.test(t))) return el.tagName.toLowerCase();
    return t.slice(0, 40);
  }

  function section(el) {
    var landmark = el.closest('header,nav,footer,main,aside,dialog');
    var named = el.parentElement && el.parentElement.closest('[id]');
    var g = landmark ? landmark.tagName.toLowerCase() : '';
    if (named && named.id && named.id.length <= 30) g += '#' + named.id;
    return g.slice(0, 40);
  }

  function onClick(e) {
    if (!h || !e.isTrusted) return;
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('[data-pulse=off]')) return;
    var el = t.closest('a[href],button,summary,[role=button],[role=tab],[role=link],input,textarea,label,select');
    var strict = !!t.closest('input,textarea,select,[contenteditable],pre,code,[data-pulse=private]');
    var toolish = !!t.closest('.tool');
    var k = 'other', lb = '', hr = '';
    if (el) {
      var tag = el.tagName;
      lb = label(el, strict, toolish);
      if (tag === 'A') {
        var raw = el.getAttribute('href') || '';
        try {
          if (/^mailto:/i.test(raw)) { k = 'mail'; hr = 'mailto'; }
          else if (/^tel:/i.test(raw)) { k = 'tel'; hr = 'tel'; }
          else {
            var u = new URL(el.href, location.href);
            if (u.origin === location.origin) { k = 'link'; hr = u.pathname.slice(0, 100); }
            else {
              k = 'out';
              hr = /wa\.me|whatsapp/.test(u.host) ? u.host : (u.host + u.pathname.split('/').slice(0, 2).join('/')).slice(0, 60);
            }
          }
        } catch (er) { k = 'link'; }
      } else if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'LABEL') k = 'input';
      else if (el.getAttribute('role') === 'tab') k = 'tab';
      else k = 'btn';
    } else {
      lb = t.tagName ? t.tagName.toLowerCase() : '';
    }
    var el0 = d.documentElement;
    var x = Math.round(100 * (e.pageX || 0) / Math.max(el0.scrollWidth, 1));
    var y = Math.round(e.pageY || 0);
    var now = Date.now(), z = 0;
    lastClicks = lastClicks.filter(function (c) { return now - c.t < 700; });
    lastClicks.push({ t: now, x: x, y: y });
    if (lastClicks.length >= 3) {
      var near = lastClicks.filter(function (c) { return Math.abs(c.y - y) < 40 && Math.abs(c.x - x) < 4; });
      if (near.length >= 3) z = 1;
    }
    h.nc++; dirty = true;
    if (h.q.length < 30) h.q.push({ n: ++seq, t: now - h.t0, k: k, l: lb, h: hr, x: x, y: y, g: section(t), z: z });
    if (k === 'out' || k === 'mail' || k === 'tel') send();
  }
  d.addEventListener('click', onClick, true);

  function flush() { if (h && (dirty || h.q.length)) send(); }
  d.addEventListener('visibilitychange', function () { if (d.visibilityState === 'hidden') flush(); });
  w.addEventListener('pagehide', flush);

  var prevPath = location.pathname;
  function route() {
    var p = location.pathname;
    if (p === prevPath) return;
    flush();
    var from = location.origin + prevPath;
    prevPath = p;
    start(p, from);
  }
  ['pushState', 'replaceState'].forEach(function (fn) {
    var orig = history[fn];
    history[fn] = function () { var r = orig.apply(this, arguments); route(); return r; };
  });
  w.addEventListener('popstate', route);

  start(location.pathname, d.referrer);
})();
`;
