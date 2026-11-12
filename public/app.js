'use strict';
// The page. Everything is built with textContent and DOM calls, never innerHTML, because token names are untrusted text.
(function () {
  var view = document.getElementById('view');
  var crumb = document.getElementById('crumb');
  var sampleTag = document.getElementById('sample');
  var SVGNS = 'http://www.w3.org/2000/svg';

  // ---------- tiny DOM helpers ----------
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'style') el.style.cssText = attrs[k]; // CSSOM, so it works under the strict CSP
      else if (k === 'on') Object.keys(attrs.on).forEach(function (ev) { el.addEventListener(ev, attrs.on[ev]); });
      else el.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(el, x); });
    else el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  function s(tag, attrs) {
    var el = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    for (var i = 2; i < arguments.length; i++) if (arguments[i]) el.appendChild(arguments[i]);
    return el;
  }

  function money(n) {
    if (n == null) return 'n/a';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function minutes(m) {
    if (m == null) return 'n/a';
    var t = Math.round(m);
    return Math.floor(t / 60) + 'h ' + String(t % 60).padStart(2, '0') + 'm';
  }
  function pct(n) { return n == null ? 'n/a' : Math.round(n) + '%'; }
  function num(n) { return n == null ? 'n/a' : Number(n).toLocaleString('en-US'); }
  function signed(n) { return (n > 0 ? '+' : '') + n + '%'; }

  var OUT = { Migrated: 'good', Faded: 'warn', Rugged: 'bad', Active: 'info' };
  var FUNDING = { exchange: 'Funded by exchange', fresh: 'Funded by a fresh wallet', shared: 'Funding shared with other wallets', unknown: 'Funding source unknown' };

  function get(url) {
    return fetch(url).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; });
    });
  }
  function setSample(on) { sampleTag.hidden = !on; }

  // ---------- small stored preferences (watchlist, theme). Storage can be blocked, so every call is guarded. ----------
  function load(key, fallback) { try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; } }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ } }
  var watch = load('sc.watch', []).filter(function (x) { return typeof x === 'string'; });
  function isWatched(id) { return watch.indexOf(id) >= 0; }
  function toggleWatch(id) {
    watch = isWatched(id) ? watch.filter(function (x) { return x !== id; }) : watch.concat(id);
    save('sc.watch', watch);
  }

  // ---------- theme switcher ----------
  var THEMES = [['neon', 'Neon'], ['arcade', 'Arcade'], ['classic', 'Classic']];
  function drawThemes() {
    var box = document.getElementById('themes');
    var cur = document.documentElement.getAttribute('data-theme');
    box.textContent = '';
    THEMES.forEach(function (t) {
      box.appendChild(h('button', { type: 'button', 'aria-pressed': String(cur === t[0]), on: { click: function () {
        document.documentElement.setAttribute('data-theme', t[0]);
        try { localStorage.setItem('sc.theme', t[0]); } catch (e) { /* ignore */ }
        drawThemes();
      } } }, t[1]));
    });
  }
  drawThemes();

  // ---------- reusable pieces ----------
  function badgeRow(list) {
    if (!list || !list.length) return null;
    return h('div', { class: 'badges' }, list.map(function (b) {
      return h('span', { class: 'bdg tone-' + b.tone, title: b.why }, b.label);
    }));
  }

  function star(id, onChange) {
    var b = h('button', { class: 'star', type: 'button', 'aria-pressed': String(isWatched(id)), 'aria-label': 'Watch this creator', title: 'Watch this creator', on: { click: function (ev) {
      ev.stopPropagation();
      toggleWatch(id);
      b.setAttribute('aria-pressed', String(isWatched(id)));
      if (onChange) onChange();
    } } }, '★');
    return b;
  }

  function spark(vals, up) {
    var w = 96, hh = 28, lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), span = hi - lo || 1;
    var d = vals.map(function (v, i) {
      return (i ? 'L' : 'M') + (i * w / (vals.length - 1)).toFixed(1) + ' ' + (hh - 3 - (v - lo) / span * (hh - 6)).toFixed(1);
    }).join(' ');
    return s('svg', { class: 'spark ' + (up ? 'up' : 'down'), viewBox: '0 0 ' + w + ' ' + hh, role: 'img', 'aria-label': 'Price over the last 24 hours, ' + (up ? 'rising' : 'falling') }, s('path', { d: d }));
  }

  function ring(score, tone) {
    var r = 54, circ = 2 * Math.PI * r;
    var svg = s('svg', { width: '132', height: '132', viewBox: '0 0 132 132', role: 'img', 'aria-label': 'Dev score ' + score + ' out of 100' },
      s('circle', { class: 'trk', cx: '66', cy: '66', r: String(r), fill: 'none', 'stroke-width': '12' }),
      s('circle', { class: 'val ' + tone, cx: '66', cy: '66', r: String(r), fill: 'none', 'stroke-width': '12', 'stroke-dasharray': (circ * score / 100).toFixed(1) + ' ' + circ.toFixed(1), transform: 'rotate(-90 66 66)' }));
    return h('div', { class: 'ring' }, svg, h('div', { class: 'c' }, h('div', { class: 'n' }, score), h('div', { class: 'o' }, 'OF 100')));
  }

  // Peak market cap per finished launch, oldest on the left. Colour shows the outcome.
  function peakChart(launches) {
    var list = launches.slice(0, 14).reverse();
    var W = 640, H = 190, pad = { l: 44, r: 8, t: 10, b: 24 };
    var max = Math.max.apply(null, list.map(function (l) { return l.peakMcapUsd; })) || 1;
    var bw = (W - pad.l - pad.r) / list.length;
    var svg = s('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Peak market cap of each launch, oldest to newest' });
    [0, 0.5, 1].forEach(function (f) {
      var y = H - pad.b - f * (H - pad.t - pad.b);
      svg.appendChild(s('line', { class: 'ax', x1: pad.l, x2: W - pad.r, y1: y, y2: y }));
      var t = s('text', { x: pad.l - 6, y: y + 3, 'text-anchor': 'end' }); t.textContent = money(max * f); svg.appendChild(t);
    });
    list.forEach(function (l, i) {
      var hgt = Math.max(2, l.peakMcapUsd / max * (H - pad.t - pad.b));
      var x = pad.l + i * bw + bw * 0.15;
      var bar = s('rect', { class: 'f-' + OUT[l.outcome], x: x.toFixed(1), y: (H - pad.b - hgt).toFixed(1), width: (bw * 0.7).toFixed(1), height: hgt.toFixed(1) });
      var tip = s('title'); tip.textContent = l.name + ' ' + l.ticker + ': ' + money(l.peakMcapUsd) + ' peak, ' + l.outcome;
      bar.appendChild(tip); svg.appendChild(bar);
      if (list.length <= 10 || i % 2 === 0) {
        var lab = s('text', { x: (x + bw * 0.35).toFixed(1), y: H - 8, 'text-anchor': 'middle' }); lab.textContent = l.ticker.replace('$', ''); svg.appendChild(lab);
      }
    });
    return svg;
  }

  // ---------- Trending list ----------
  var state = { q: '', verdict: 'all', onlyWatch: false, sort: null, dir: 'desc', cmp: [], data: null };
  var COLS = [['name', 'TOKEN', ''], ['change1h', '1H', 'r'], [null, '24H', ''], ['liquidityUsd', 'LIQUIDITY', 'r'], ['holders', 'HOLDERS', 'r'], ['padScore', 'PAD SCORE', 'r'], ['devScore', 'DEV', ''], [null, 'DEV RECORD', '']];

  function verdictOf(t) { return t.devScore == null || t.lowConfidence ? 'low' : t.devTone === 'good' ? 'strong' : t.devTone === 'warn' ? 'mixed' : 'risk'; }

  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    var rows = state.data.tokens.filter(function (t) {
      if (q && (t.name + ' ' + t.ticker + ' ' + t.dev + ' ' + (t.devShort || '')).toLowerCase().indexOf(q) < 0) return false;
      if (state.verdict !== 'all' && verdictOf(t) !== state.verdict) return false;
      if (state.onlyWatch && !isWatched(t.dev)) return false;
      return true;
    });
    if (state.sort) {
      var k = state.sort, dir = state.dir === 'asc' ? 1 : -1;
      rows = rows.slice().sort(function (a, b) {
        var x = a[k], y = b[k];
        if (x == null) return 1; if (y == null) return -1;
        return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir;
      });
    }
    return rows;
  }

  function renderList() {
    crumb.textContent = '';
    view.textContent = '';
    view.appendChild(h('p', { class: 'dim' }, 'Loading…'));
    get('/api/trending').then(function (res) {
      setSample(res.sample);
      state.data = res;
      drawList();
    }).catch(function (e) { view.textContent = ''; view.appendChild(h('p', { class: 'tone-bad' }, e.message)); });
  }

  function drawList() {
    var tableHost = h('div'), dockHost = h('div');
    var FILTERS = [['all', 'All'], ['strong', 'Strong'], ['mixed', 'Mixed'], ['risk', 'High risk'], ['low', 'Low data']];

    function fillTable() {
      var rows = visibleRows();
      tableHost.textContent = '';
      var head = COLS.map(function (c) {
        var th = h('th', { class: (c[2] || '') + (c[0] ? ' sort' : ''), scope: 'col', 'aria-sort': state.sort && state.sort === c[0] ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none' }, c[1]);
        if (c[0]) {
          th.tabIndex = 0;
          var go = function () { if (state.sort === c[0]) state.dir = state.dir === 'desc' ? 'asc' : 'desc'; else { state.sort = c[0]; state.dir = c[0] === 'name' ? 'asc' : 'desc'; } fillTable(); };
          th.addEventListener('click', go);
          th.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
        }
        return th;
      });
      if (!rows.length) {
        tableHost.appendChild(h('div', { class: 'scroll' }, h('div', { class: 'empty' }, state.onlyWatch && !watch.length ? 'Nothing watched yet. Tap the star on a row to keep a creator here.' : 'No tokens match. Clear the search or pick another filter.')));
        return;
      }
      tableHost.appendChild(h('div', { class: 'scroll' }, h('table', { style: 'min-width:1040px' },
        h('thead', null, h('tr', null, h('th', { class: 'k' }, h('span', { class: 'dim', title: 'Watch' }, '★')), h('th', { class: 'k' }, 'VS'), head)),
        h('tbody', null, rows.map(rowFor)))));
    }

    function rowFor(t) {
      var c = t.devCounts || { Migrated: 0, Faded: 0, Rugged: 0 };
      var picked = state.cmp.indexOf(t.dev) >= 0;
      var cb = h('input', { class: 'cmp', type: 'checkbox', 'aria-label': 'Compare ' + t.name + ' creator', on: { click: function (ev) { ev.stopPropagation(); }, change: function () {
        if (cb.checked) { if (state.cmp.length >= 2) state.cmp.shift(); state.cmp.push(t.dev); } else state.cmp = state.cmp.filter(function (x) { return x !== t.dev; });
        fillTable(); drawDock();
      } } });
      if (picked) cb.checked = true;
      return h('tr', { class: 'link', on: { click: function () { location.hash = '#/dev/' + encodeURIComponent(t.dev); } } },
        h('td', { class: 'k' }, star(t.dev, function () { if (state.onlyWatch) fillTable(); })),
        h('td', { class: 'k' }, cb),
        h('td', null, h('a', { href: '#/dev/' + encodeURIComponent(t.dev), style: 'color:inherit;text-decoration:none' }, h('b', null, t.name), ' ', h('span', { class: 'mono dim' }, t.ticker))),
        h('td', { class: 'r mono ' + (t.change1h < 0 ? 'tone-bad' : 'tone-good') }, signed(t.change1h)),
        h('td', null, t.spark ? spark(t.spark, t.change1h >= 0) : null),
        h('td', { class: 'r mono' }, money(t.liquidityUsd)),
        h('td', { class: 'r mono' }, num(t.holders)),
        h('td', { class: 'r mono' }, t.padScore),
        h('td', null, t.devScore == null
          ? h('span', { class: 'dim' }, 'No data')
          : h('span', { class: 'chip bg-' + t.devTone }, h('b', { class: 'tone-' + t.devTone }, t.devScore), h('span', { class: 'tone-' + t.devTone }, t.lowConfidence ? 'Low data' : t.devVerdict.replace(' record', '')))),
        h('td', { style: 'min-width:190px' },
          h('div', { class: 'mini', role: 'img', 'aria-label': c.Migrated + ' migrated, ' + c.Faded + ' faded, ' + c.Rugged + ' rugged' },
            h('div', { class: 'fill-good', style: 'flex:' + c.Migrated + ' 1 0' }),
            h('div', { class: 'fill-warn', style: 'flex:' + c.Faded + ' 1 0' }),
            h('div', { class: 'fill-bad', style: 'flex:' + c.Rugged + ' 1 0' })),
          h('div', { class: 'dim', style: 'font-size:12px;margin-top:4px' }, c.Migrated + ' of ' + t.devFinished + ' migrated')));
    }

    function drawDock() {
      dockHost.textContent = '';
      if (!state.cmp.length) return;
      dockHost.appendChild(h('div', { class: 'dock' },
        h('div', null, state.cmp.length === 1 ? 'Pick one more creator to compare.' : 'Ready to compare 2 creators.'),
        h('div', { style: 'display:flex;gap:8px' },
          h('button', { class: 'btn', type: 'button', on: { click: function () { state.cmp = []; fillTable(); drawDock(); } } }, 'Clear'),
          h('button', { class: 'btn primary', type: 'button', on: { click: function () { location.hash = '#/compare/' + encodeURIComponent(state.cmp[0]) + '/' + encodeURIComponent(state.cmp[1]); } } }, 'Compare'))));
      if (state.cmp.length < 2) dockHost.firstChild.querySelector('.primary').setAttribute('disabled', 'disabled'); else dockHost.firstChild.querySelector('.primary').removeAttribute('disabled');
    }

    var search = h('input', { class: 'search', type: 'search', placeholder: 'Search token, ticker or wallet', 'aria-label': 'Search', value: state.q, on: { input: function () { state.q = search.value; fillTable(); } } });
    var chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by dev verdict' });
    function drawChips() {
      chips.textContent = '';
      FILTERS.forEach(function (f) { chips.appendChild(h('button', { class: 'fchip', type: 'button', 'aria-pressed': String(state.verdict === f[0]), on: { click: function () { state.verdict = f[0]; drawChips(); fillTable(); } } }, f[1])); });
      chips.appendChild(h('button', { class: 'fchip', type: 'button', 'aria-pressed': String(state.onlyWatch), on: { click: function () { state.onlyWatch = !state.onlyWatch; drawChips(); fillTable(); } } }, '★ Watchlist (' + watch.length + ')'));
    }
    drawChips(); fillTable(); drawDock();

    view.textContent = '';
    view.appendChild(h('div', { class: 'col', style: 'gap:24px' },
      h('div', { class: 'col', style: 'gap:6px' },
        h('h1', null, 'Trending now'),
        h('div', { class: 'dim', style: 'max-width:64ch' }, 'Each row shows who launched the token and how that creator\'s past launches went. Select a row for the full scorecard, or tick two rows to compare creators.')),
      h('div', { class: 'toolbar' }, search, chips),
      tableHost, dockHost,
      h('div', { class: 'dim', style: 'font-size:13px;max-width:80ch' }, 'A score describes a wallet\'s past launches and does not predict a future one. Not financial advice.')));
  }

  // ---------- One creator ----------
  function verdictNote(tone) {
    return tone === 'good' ? 'Most launches reached a DEX and the creator rarely sold early.'
      : tone === 'warn' ? 'Results are mixed. Check the signals before relying on this wallet.'
      : 'Most launches ended with the creator selling almost at once.';
  }

  function renderDev(id) {
    view.textContent = '';
    view.appendChild(h('p', { class: 'dim' }, 'Loading…'));
    get('/api/dev/' + encodeURIComponent(id)).then(function (res) {
      setSample(res.sample);
      var d = res.dev;
      crumb.textContent = 'Research / Creator wallets / ' + d.short;
      var m = d.medians;
      var colours = { Migrated: 'good', Faded: 'warn', Rugged: 'bad' };
      var finished = ['Migrated', 'Faded', 'Rugged'];
      var rugCount = d.counts.Rugged;

      var tags = [d.ageDays + ' days old', d.finished + ' finished launches', FUNDING[d.funding] || FUNDING.unknown, d.linkedWallets + ' linked wallets'];
      var shareHost = h('div');
      var head = h('div', { class: 'row' },
        h('div', { class: 'col', style: 'flex:1 1 520px;justify-content:center;gap:16px' },
          h('div', { class: 'eyebrow' }, 'CREATOR WALLET'),
          h('div', { style: 'display:flex;align-items:center;gap:12px;flex-wrap:wrap' },
            h('div', { class: 'addr' }, d.short),
            h('button', { class: 'btn', type: 'button', on: { click: function (ev) { copy(d.short, ev.target); } } }, 'Copy address'),
            star(d.id)),
          badgeRow(d.badges),
          h('div', { class: 'tags' }, tags.map(function (t) { return h('div', { class: 'tag' }, t); })),
          h('div', { style: 'display:flex;gap:16px;align-items:center;flex-wrap:wrap' },
            h('a', { href: '#/' }, 'Back to trending'),
            h('button', { class: 'btn', type: 'button', on: { click: function () { toggleShare(shareHost, d, res.sample); } } }, 'Share card'))),
        h('div', { class: 'panel', style: 'flex:0 1 420px;min-width:280px;flex-direction:row;align-items:center;gap:24px;flex-wrap:wrap' },
          ring(d.total, d.tone),
          h('div', { class: 'col', style: 'flex:1 1 160px;gap:6px' },
            h('div', { class: 'tone-' + d.tone, style: 'font:700 20px var(--display)' }, d.verdict),
            h('div', { class: 'dim', style: 'font-size:14px' }, d.lowConfidence ? 'Too few finished launches for a confident score.' : verdictNote(d.tone)))));

      var warn = d.tone === 'bad' && !d.lowConfidence ? h('div', { class: 'warnbox' },
        h('div', { class: 'badge bg-bad tone-bad' }, 'WARNING'),
        h('div', { style: 'flex:1 1 360px;min-width:0' }, rugCount + ' of ' + d.finished + ' finished launches saw this creator sell over half their supply within an hour.')) : null;

      var parts = h('div', { class: 'panel', style: 'flex:1 1 520px' },
        h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap' }, h('h2', null, 'Score breakdown'), h('div', { class: 'dim', style: 'font-size:13px' }, 'Weight in the total')),
        d.parts.map(function (p) {
          return h('div', { class: 'part' },
            h('div', { class: 'h' }, h('div', { style: 'font-weight:500' }, p.label), h('div', { class: 'mono dim', style: 'font-size:13px' }, p.weight + '% · ', h('span', { class: 'tone-' + p.tone }, p.score))),
            h('div', { class: 'bar' }, h('div', { class: 'fill-' + p.tone, style: 'width:' + p.score + '%' })),
            h('div', { class: 'dim', style: 'font-size:13px' }, p.detail));
        }));

      var outcomes = h('div', { class: 'panel', style: 'flex:1 1 420px' },
        h('h2', null, 'What happened to their ' + d.finished + ' finished launches'),
        h('div', { class: 'stack' }, finished.map(function (k) { return d.counts[k] ? h('div', { class: 'fill-' + colours[k], style: 'flex:' + d.counts[k] + ' 1 0;min-width:4px' }) : null; })),
        h('div', { class: 'legend' }, finished.map(function (k) { return h('div', null, h('i', { class: 'fill-' + colours[k] }), k + ' ', h('span', { class: 'mono dim' }, d.counts[k])); })),
        h('div', { class: 'meds' }, [
          ['Median peak market cap', money(m.peakMcapUsd)], ['Median time to peak', minutes(m.timeToPeakMin)],
          ['Median dev sold in 1 hour', pct(m.devSoldPct1h)], ['Median holders at 24 hours', num(m.holders24h == null ? null : Math.round(m.holders24h))]
        ].map(function (x) { return h('div', { style: 'min-width:0' }, h('div', { class: 'dim', style: 'font-size:13px' }, x[0]), h('div', { class: 'v' }, x[1])); })));

      var chart = d.launches.length ? h('div', { class: 'panel' },
        h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap' }, h('h2', null, 'Peak market cap by launch'), h('div', { class: 'legend dim', style: 'font-size:12px' }, ['Migrated', 'Faded', 'Rugged', 'Active'].map(function (k) { return h('div', null, h('i', { class: 'fill-' + OUT[k] }), k); }))),
        peakChart(d.launches)) : null;

      var signals = h('div', { class: 'col' }, h('h2', null, 'Signals'),
        h('div', { class: 'signals' }, d.signals.map(function (sg) {
          return h('div', { class: 'signal' }, h('div', { class: 'badge bg-' + sg.tone + ' tone-' + sg.tone }, sg.label), h('div', { style: 'min-width:0' }, sg.text));
        })));

      var shown = d.launches.slice(0, 8);
      var history = h('div', { class: 'col' },
        h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap' }, h('h2', null, 'Launch history'), h('div', { class: 'dim', style: 'font-size:13px' }, 'Showing ' + shown.length + ' of ' + d.launches.length + ', newest first')),
        h('div', { class: 'scroll' }, h('table', null,
          h('thead', null, h('tr', null, h('th', null, 'TOKEN'), h('th', null, 'LAUNCHED'), h('th', null, 'OUTCOME'), h('th', { class: 'r' }, 'PEAK MCAP'), h('th', { class: 'r' }, 'TIME TO PEAK'), h('th', { class: 'r' }, 'DEV SOLD IN 1H'), h('th', { class: 'r' }, 'HOLDERS AT 24H'))),
          h('tbody', null, shown.map(function (l) {
            var t = OUT[l.outcome];
            return h('tr', null,
              h('td', null, h('b', null, l.name), ' ', h('span', { class: 'mono dim', style: 'font-size:13px' }, l.ticker)),
              h('td', { style: 'color:var(--soft)' }, l.launchedAt),
              h('td', null, h('span', { class: 'out bg-' + t + ' tone-' + t }, l.outcome)),
              h('td', { class: 'r mono' }, money(l.peakMcapUsd)),
              h('td', { class: 'r mono' }, minutes(l.timeToPeakMin)),
              h('td', { class: 'r mono ' + (l.devSoldPct1h >= 50 ? 'tone-bad' : '') }, pct(l.devSoldPct1h)),
              h('td', { class: 'r mono' }, l.active ? 'n/a' : num(l.holders24h)));
          })))),
        h('div', { class: 'dim', style: 'font-size:13px;max-width:80ch' }, 'A score describes a wallet\'s past launches and does not predict a future one. Not financial advice.'));

      view.textContent = '';
      view.appendChild(h('div', { class: 'col', style: 'gap:32px' }, head, shareHost, warn, h('div', { class: 'row' }, parts, outcomes), chart, signals, history));
    }).catch(function (e) {
      view.textContent = '';
      view.appendChild(h('div', { class: 'col' }, h('p', { class: 'tone-bad' }, e.message), h('a', { href: '#/' }, 'Back to trending')));
    });
  }

  // ---------- Share card: drawn on a canvas in the current theme, saved as a PNG ----------
  function toggleShare(host, d, isSample) {
    if (host.firstChild) { host.textContent = ''; return; }
    var cv = h('canvas', { width: '1200', height: '630', role: 'img', 'aria-label': 'Share card for ' + d.short + ', score ' + d.total });
    var dl = h('button', { class: 'btn primary', type: 'button', on: { click: function () {
      cv.toBlob(function (blob) {
        if (!blob) return;
        var url = URL.createObjectURL(blob);
        var a = h('a', { href: url, download: 'scorecard-' + d.id + '.png' });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      }, 'image/png');
    } } }, 'Download PNG');
    host.appendChild(h('div', { class: 'panel sharewrap' }, h('h2', null, 'Share card'), cv, h('div', null, dl), h('div', { class: 'dim', style: 'font-size:13px' }, 'Redraws in whichever theme is active when you open it.')));
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () { drawCard(cv, d, isSample); });
  }

  function drawCard(cv, d, isSample) {
    var cs = getComputedStyle(document.documentElement);
    var v = function (n) { return cs.getPropertyValue(n).trim(); };
    var display = v('--display'), mono = v('--mono');
    var tone = v('--' + d.tone);
    var x = cv.getContext('2d');
    x.fillStyle = v('--bg'); x.fillRect(0, 0, 1200, 630);
    x.strokeStyle = v('--line2'); x.lineWidth = 4; x.strokeRect(24, 24, 1152, 582);
    x.fillStyle = v('--accent'); x.font = '700 28px ' + display; x.textBaseline = 'alphabetic';
    x.fillText('SCORECARD', 64, 84);
    x.fillStyle = v('--dim'); x.font = '22px ' + mono;
    x.fillText('CREATOR WALLET', 64, 150);
    x.fillStyle = v('--fg'); x.font = '700 56px ' + display;
    x.fillText(d.short, 64, 220);
    // ring
    var cx = 960, cy = 230, r = 120;
    x.lineWidth = 26; x.strokeStyle = v('--line');
    x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = tone; x.lineCap = 'butt';
    x.beginPath(); x.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * d.total / 100); x.stroke();
    x.fillStyle = v('--fg'); x.textAlign = 'center'; x.font = '700 84px ' + display; x.fillText(String(d.total), cx, cy + 28);
    x.fillStyle = v('--dim'); x.font = '20px ' + mono; x.fillText('OF 100', cx, cy + 66);
    x.fillStyle = tone; x.font = '700 34px ' + display; x.fillText(d.verdict, cx, cy + 190);
    x.textAlign = 'left';
    // stats
    var m = d.medians;
    var stats = [['Migrated', d.counts.Migrated + ' of ' + d.finished], ['Rugged', d.counts.Rugged + ' of ' + d.finished], ['Median peak', money(m.peakMcapUsd)]];
    stats.forEach(function (st, i) {
      var sx = 64 + i * 270;
      x.fillStyle = v('--dim'); x.font = '20px ' + mono; x.fillText(st[0].toUpperCase(), sx, 330);
      x.fillStyle = v('--fg'); x.font = '700 38px ' + display; x.fillText(st[1], sx, 380);
    });
    // badges
    var bx = 64, by = 450;
    x.font = '500 22px ' + mono;
    (d.badges || []).slice(0, 5).forEach(function (b) {
      var w = x.measureText(b.label).width + 32;
      if (bx + w > 1136) return;
      x.strokeStyle = v('--' + b.tone); x.lineWidth = 2; x.strokeRect(bx, by, w, 40);
      x.fillStyle = v('--' + b.tone); x.fillText(b.label, bx + 16, by + 28);
      bx += w + 12;
    });
    x.fillStyle = v('--dim'); x.font = '18px ' + mono;
    x.fillText((isSample ? 'SAMPLE DATA. ' : '') + 'A score describes past launches and does not predict a future one. Not financial advice.', 64, 566);
  }

  // ---------- Compare two creators ----------
  function renderCompare(a, b) {
    view.textContent = '';
    view.appendChild(h('p', { class: 'dim' }, 'Loading…'));
    Promise.all([get('/api/dev/' + encodeURIComponent(a)), get('/api/dev/' + encodeURIComponent(b))]).then(function (rs) {
      setSample(rs[0].sample);
      var A = rs[0].dev, B = rs[1].dev;
      crumb.textContent = 'Research / Compare / ' + A.short + ' vs ' + B.short;
      var topWin = A.total === B.total ? null : A.total > B.total ? 0 : 1;
      function side(d, i) {
        return h('div', { class: 'panel' + (topWin === i ? ' win' : ''), style: 'align-items:flex-start' },
          h('div', { class: 'eyebrow' }, topWin === i ? 'HIGHER SCORE' : 'CREATOR WALLET'),
          h('a', { href: '#/dev/' + encodeURIComponent(d.id), class: 'addr', style: 'color:inherit;text-decoration:none' }, d.short),
          h('div', { style: 'display:flex;gap:20px;align-items:center;flex-wrap:wrap' }, ring(d.total, d.tone),
            h('div', null, h('div', { class: 'tone-' + d.tone, style: 'font:700 18px var(--display)' }, d.verdict), h('div', { class: 'dim', style: 'font-size:13px' }, d.finished + ' finished launches'))),
          badgeRow(d.badges));
      }
      var partRows = A.parts.map(function (p, i) {
        var q = B.parts[i];
        function cell(pp) { return h('div', { class: 'part' },
          h('div', { class: 'h' }, h('span', { class: 'dim', style: 'font-size:13px' }, p.label), h('span', { class: 'mono tone-' + pp.tone }, pp.score)),
          h('div', { class: 'bar' }, h('div', { class: 'fill-' + pp.tone, style: 'width:' + pp.score + '%' }))); }
        return h('div', { class: 'cmprow' }, cell(p), cell(q));
      });
      var mrow = function (label, f) { return h('div', { class: 'cmprow' }, h('div', null, h('div', { class: 'dim', style: 'font-size:12px' }, label), h('div', { class: 'mono' }, f(A))), h('div', null, h('div', { class: 'dim', style: 'font-size:12px' }, label), h('div', { class: 'mono' }, f(B)))); };
      view.textContent = '';
      view.appendChild(h('div', { class: 'col', style: 'gap:28px' },
        h('div', null, h('h1', null, 'Compare creators'), h('div', { style: 'margin-top:8px' }, h('a', { href: '#/' }, 'Back to trending'))),
        h('div', { class: 'cmpgrid' }, side(A, 0), side(B, 1)),
        h('div', { class: 'panel' }, h('h2', null, 'Score parts'), partRows),
        h('div', { class: 'panel' }, h('h2', null, 'Key numbers'),
          mrow('Migrated', function (d) { return d.counts.Migrated + ' of ' + d.finished; }),
          mrow('Rugged', function (d) { return d.counts.Rugged + ' of ' + d.finished; }),
          mrow('Median peak market cap', function (d) { return money(d.medians.peakMcapUsd); }),
          mrow('Median dev sold in 1 hour', function (d) { return pct(d.medians.devSoldPct1h); }),
          mrow('Wallet age', function (d) { return d.ageDays + ' days'; }),
          mrow('Funding', function (d) { return FUNDING[d.funding] || FUNDING.unknown; })),
        h('div', { class: 'dim', style: 'font-size:13px;max-width:80ch' }, 'A score describes a wallet\'s past launches and does not predict a future one. Not financial advice.')));
    }).catch(function (e) {
      view.textContent = '';
      view.appendChild(h('div', { class: 'col' }, h('p', { class: 'tone-bad' }, e.message), h('a', { href: '#/' }, 'Back to trending')));
    });
  }

  function copy(text, btn) {
    var old = btn.textContent;
    function done(ok) { btn.textContent = ok ? 'Copied' : 'Select and copy'; setTimeout(function () { btn.textContent = old; }, 1500); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    else done(false);
  }

  function route() {
    var dev = /^#\/dev\/([A-Za-z0-9_-]{1,64})$/.exec(location.hash);
    var cmp = /^#\/compare\/([A-Za-z0-9_-]{1,64})\/([A-Za-z0-9_-]{1,64})$/.exec(location.hash);
    if (dev) renderDev(dev[1]); else if (cmp) renderCompare(cmp[1], cmp[2]); else renderList();
  }
  window.addEventListener('hashchange', route);
  route();
})();
