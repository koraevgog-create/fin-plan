// GPRO Command Center: load the current dashboard module without stale browser cache.
const BUILD = '20261019-2';
try {
  if (location.hostname.endsWith('.beget.tech') && window.gproServerSync) {
    await window.gproServerSync.start();
  }
  await import('./portfolio.js?v=' + BUILD);
} catch (error) {
  console.error('GPRO dashboard startup failed', error);
  const app = document.getElementById('app');
  if (app) app.innerHTML = '<article class="card"><h2>Не удалось загрузить новую версию штаба</h2><p>Обнови страницу сочетанием Ctrl + Shift + R. Если ошибка повторится, пришли скриншот консоли браузера (F12 → Console).</p></article>';
}
