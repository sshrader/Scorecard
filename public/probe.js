'use strict';
(function () {
  var out = document.getElementById('out'), go = document.getElementById('go');
  document.getElementById('home').setAttribute('href', '/');
  go.addEventListener('click', function () {
    var w = document.getElementById('w').value.trim(), t = document.getElementById('tok').value;
    out.textContent = 'Running…';
    go.disabled = true;
    fetch('/api/probe?wallet=' + encodeURIComponent(w), { headers: { 'x-probe-token': t } })
      .then(function (r) { return r.json(); })
      .then(function (j) { out.textContent = JSON.stringify(j, null, 2); })
      .catch(function (e) { out.textContent = 'Failed: ' + e.message; })
      .then(function () { go.disabled = false; });
  });
  document.getElementById('cp').addEventListener('click', function (ev) {
    var b = ev.target, old = b.textContent;
    function done(ok) { b.textContent = ok ? 'Copied' : 'Select and copy'; setTimeout(function () { b.textContent = old; }, 1500); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(out.textContent).then(function () { done(true); }, function () { done(false); }); else done(false);
  });
})();
