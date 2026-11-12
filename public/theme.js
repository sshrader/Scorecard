'use strict';
// Runs before the page paints so the chosen theme never flashes.
(function () {
  var saved = null;
  try { saved = localStorage.getItem('sc.theme'); } catch (e) { /* storage blocked: use default */ }
  document.documentElement.setAttribute('data-theme', ['neon', 'arcade', 'classic'].indexOf(saved) >= 0 ? saved : 'neon');
})();
