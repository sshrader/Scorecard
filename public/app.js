'use strict';
// The page. Everything is built with textContent and DOM calls, never innerHTML, because token names are untrusted text.
(function () {
  var view = document.getElementById('view');
  var crumb = document.getElementById('crumb');
  var sampleTag = document.getElementById('sample');
  var SVGNS = 'http://www.w3.org/2000/svg';

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'style') el.setAttribute('style', attrs[k]);
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

  // ---------- Trending list ----------
  function renderList() {
    crumb.textContent = '';
    view.textContent = '';
    view.appendChild(h('p', { class: 'dim' }, 'Loading…'));
    get('/api/trending').then(function (res) {
      setSample(res.sample);
      var rows = res.tokens.map(function (t) {
        var c = t.devCounts || { Migrated: 0, Faded: 0, Rugged: 0 };
        return h('tr', { class: 'link', on: { click: function () { location.hash = '#/dev/' + encodeURIComponent(t.dev); } } },
          h('td', null, h('a', { href: '#/dev/' + encodeURIComponent(t.dev), style: 'color:inherit;text-decoration:none' }, h('b', null, t.name), ' ', h('span', { class: 'mono dim' }, t.ticker))),
          h('td', { class: 'r mono ' + (t.change1h < 0 ? 'tone-bad' : 'tone-good') }, signed(t.change1h)),
          h('td', { class: 'r mono' }, money(t.liquidityUsd)),
          h('td', { class: 'r mono' }, num(t.holders)),
          h('td', { class: 'r mono' }, t.padScore),
          h('td', null, t.devScore == null
            ? h('span', { class: 'dim' }, 'No data')
            : h('span', { class: 'chip bg-' + t.devTone }, h('b', { class: 'tone-' + t.devTone }, t.devScore), h('span', { class: 'tone-' + t.devTone }, t.lowConfidence ? 'Low data' : t.devVerdict.replace(' record', '')))),
          h('td', { style: 'min-width:200px' },
            h('div', { class: 'mini', role: 'img', 'aria-label': c.Migrated + ' migrated, ' + c.Faded + ' faded, ' + c.Rugged + ' rugged' },
              h('div', { class: 'fill-good', style: 'flex:' + c.Migrated + ' 1 0' }),
              h('div', { class: 'fill-warn', style: 'flex:' + c.Faded + ' 1 0' }),
              h('div', { class: 'fill-bad', style: 'flex:' + c.Rugged + ' 1 0' })),
            h('div', { class: 'dim', style: 'font-size:12px;margin-top:4px' }, c.Migrated + ' of ' + t.devFinished + ' migrated')));
      });
      view.textContent = '';
      view.appendChild(h('div', { class: 'col', style: 'gap:28px' },
        h('div', { class: 'col', style: 'gap:6px' },
          h('h1', null, 'Trending now'),
          h('div', { class: 'dim', style: 'max-width:64ch' }, 'Each row shows who launched the token and how that creator\'s past launches went. Select a row for the full scorecard.')),
        h('div', { class: 'scroll' },
          h('table', { style: 'min-width:880px' },
            h('thead', null, h('tr', null,
              h('th', null, 'TOKEN'), h('th', { class: 'r' }, '1H'), h('th', { class: 'r' }, 'LIQUIDITY'), h('th', { class: 'r' }, 'HOLDERS'), h('th', { class: 'r' }, 'PAD SCORE'), h('th', null, 'DEV'), h('th', null, 'DEV RECORD'))),
            h('tbody', null, rows))),
        h('div', { class: 'dim', style: 'font-size:13px;max-width:80ch' }, 'A score describes a wallet\'s past launches and does not predict a future one. Not financial advice.')));
    }).catch(function (e) { view.textContent = ''; view.appendChild(h('p', { class: 'tone-bad' }, e.message)); });
  }

  // ---------- One creator ----------
  function ring(score, tone) {
    var r = 54, circ = 2 * Math.PI * r;
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('width', '132'); svg.setAttribute('height', '132'); svg.setAttribute('viewBox', '0 0 132 132');
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Dev score ' + score + ' out of 100');
    function circle(stroke, dash) {
      var c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('cx', '66'); c.setAttribute('cy', '66'); c.setAttribute('r', String(r));
      c.setAttribute('fill', 'none'); c.setAttribute('stroke', stroke); c.setAttribute('stroke-width', '12');
      if (dash) { c.setAttribute('stroke-dasharray', dash); c.setAttribute('transform', 'rotate(-90 66 66)'); }
      return c;
    }
    var colour = { good: '#4cc38a', warn: '#e5b24a', bad: '#ef6b6b' }[tone];
    svg.appendChild(circle('#26303b'));
    svg.appendChild(circle(colour, (circ * score / 100).toFixed(1) + ' ' + circ.toFixed(1)));
    return h('div', { class: 'ring' }, svg, h('div', { class: 'c' }, h('div', { class: 'n' }, score), h('div', { class: 'o' }, 'OF 100')));
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
      var head = h('div', { class: 'row' },
        h('div', { class: 'col', style: 'flex:1 1 520px;justify-content:center;gap:16px' },
          h('div', { class: 'eyebrow' }, 'CREATOR WALLET'),
          h('div', { style: 'display:flex;align-items:center;gap:12px;flex-wrap:wrap' },
            h('div', { class: 'addr' }, d.short),
            h('button', { class: 'btn', type: 'button', on: { click: function (ev) { copy(d.short, ev.target); } } }, 'Copy address')),
          h('div', { class: 'tags' }, tags.map(function (t) { return h('div', { class: 'tag' }, t); })),
          h('a', { href: '#/' }, 'Back to trending')),
        h('div', { class: 'panel', style: 'flex:0 1 420px;min-width:280px;flex-direction:row;align-items:center;gap:24px;flex-wrap:wrap' },
          ring(d.total, d.tone),
          h('div', { class: 'col', style: 'flex:1 1 160px;gap:6px' },
            h('div', { class: 'tone-' + d.tone, style: 'font:700 22px var(--display)' }, d.verdict),
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

      var signals = h('div', { class: 'col' }, h('h2', null, 'Signals'),
        h('div', { class: 'signals' }, d.signals.map(function (s) {
          return h('div', { class: 'signal' }, h('div', { class: 'badge bg-' + s.tone + ' tone-' + s.tone }, s.label), h('div', { style: 'min-width:0' }, s.text));
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
      view.appendChild(h('div', { class: 'col', style: 'gap:32px' }, head, warn, h('div', { class: 'row' }, parts, outcomes), signals, history));
    }).catch(function (e) {
      view.textContent = '';
      view.appendChild(h('div', { class: 'col' }, h('p', { class: 'tone-bad' }, e.message), h('a', { href: '#/' }, 'Back to trending')));
    });
  }

  function verdictNote(tone) {
    return tone === 'good' ? 'Most launches reached a DEX and the creator rarely sold early.'
      : tone === 'warn' ? 'Results are mixed. Check the signals before relying on this wallet.'
      : 'Most launches ended with the creator selling almost at once.';
  }

  function copy(text, btn) {
    var old = btn.textContent;
    function done(ok) { btn.textContent = ok ? 'Copied' : 'Select and copy'; setTimeout(function () { btn.textContent = old; }, 1500); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    else done(false);
  }

  function route() {
    var m = /^#\/dev\/([A-Za-z0-9_-]{1,64})$/.exec(location.hash);
    if (m) renderDev(m[1]); else renderList();
  }
  window.addEventListener('hashchange', route);
  route();
})();
