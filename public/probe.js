'use strict';
(function () {
  var out = document.getElementById('out'), go = document.getElementById('go'), card = document.getElementById('card');
  function row(k, v) {
    var d = document.createElement('div'); d.style.cssText = 'display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap';
    var a = document.createElement('span'); a.className = 'dim'; a.textContent = k;
    var b = document.createElement('span'); b.className = 'mono'; b.style.cssText = 'overflow-wrap:anywhere;text-align:right'; b.textContent = v;
    d.appendChild(a); d.appendChild(b); return d;
  }
  function show(j) {
    card.textContent = '';
    if (j && j.mint && !j.error) {
      var q = document.createElement('div'); q.className = 'panel'; q.style.gap = '10px';
      var hh = document.createElement('h2'); hh.textContent = 'Coin info'; q.appendChild(hh);
      var f = function (n, d) { return n == null ? 'n/a' : n.toFixed(d == null ? 1 : d); };
      q.appendChild(row('Coin', j.mint));
      q.appendChild(row('Created by', j.creator || 'n/a'));
      q.appendChild(row('Migrated to a DEX', j.migrated ? 'Yes' : 'No'));
      q.appendChild(row('Curve progress', f(j.curveProgressPct) + '%'));
      q.appendChild(row('Market cap', j.marketCapSol == null ? 'n/a' : f(j.marketCapSol, 1) + ' SOL'));
      q.appendChild(row('SOL in curve', f(j.solInCurve, 2)));
      q.appendChild(row('Holders', j.holders == null ? 'n/a' : j.holders + (j.holdersIsMinimum ? '+' : '')));
      q.appendChild(row('Top 10 holders own', j.top10Pct == null ? 'n/a' : f(j.top10Pct) + '%'));
      q.appendChild(row('Creator still holds', j.creatorHoldsPct == null ? 'n/a' : f(j.creatorHoldsPct) + '%'));
      card.appendChild(q);
      return;
    }
    if (!j || j.error || !j.wallet) return;
    var p = document.createElement('div'); p.className = 'panel'; p.style.gap = '10px';
    var h = document.createElement('h2'); h.textContent = 'Dev info'; p.appendChild(h);
    p.appendChild(row('Wallet', j.wallet));
    p.appendChild(row('Wallet age', j.ageDays == null ? 'unknown' : j.ageDays + ' days' + (j.ageIsMinimum ? ' or more' : '')));
    p.appendChild(row('First seen', j.firstSeen || 'unknown'));
    p.appendChild(row('First funded by', j.fundedBy || 'not found'));
    p.appendChild(row('Transactions seen', j.totalSignaturesSeen + (j.historyComplete ? '' : '+')));
    if (j.launches) p.appendChild(row('Launches found', String(j.launchesFound)));
    card.appendChild(p);
  }
  go.addEventListener('click', function () {
    var w = document.getElementById('w').value.trim(), t = document.getElementById('tok').value, c = document.getElementById('c').value.trim();
    var full = document.getElementById('full').checked;
    out.textContent = 'Running…'; card.textContent = '';
    go.disabled = true;
    fetch('/api/probe?' + (c ? 'coin=' + encodeURIComponent(c) : 'wallet=' + encodeURIComponent(w) + (full ? '&mode=full' : '')), { headers: { 'x-probe-token': t } })
      .then(function (r) { return r.json(); })
      .then(function (j) { show(j); out.textContent = JSON.stringify(j, null, 2); })
      .catch(function (e) { out.textContent = 'Failed: ' + e.message; })
      .then(function () { go.disabled = false; });
  });
  document.getElementById('cp').addEventListener('click', function (ev) {
    var b = ev.target, old = b.textContent;
    function done(ok) { b.textContent = ok ? 'Copied' : 'Select and copy'; setTimeout(function () { b.textContent = old; }, 1500); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(out.textContent).then(function () { done(true); }, function () { done(false); }); else done(false);
  });
})();
