// GitHub Pages stays local-only; Beget attempts server sync before app loads.
if (location.hostname.endsWith('.beget.tech') && window.gproServerSync) {
  await window.gproServerSync.start();
}
await import('./portfolio.js');
