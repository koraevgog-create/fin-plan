// GPRO Command Center: load the current dashboard module without stale browser cache.
// Production deployment is managed by the allowlisted FTPS workflow.
const BUILD = '20261024-5';
try {
  if (location.hostname.endsWith('.beget.tech') && window.gproServerSync) {
    await window.gproServerSync.start();
  }
  await import('./personal-finance.js?v=' + BUILD);
  await import('./portfolio.js?v=' + BUILD);
} catch (error) {
  console.error('GPRO dashboard startup failed', error);
  const app = document.getElementById('app');
  if (app) { const card=document.createElement('article');card.className='card';const h=document.createElement('h2');h.textContent='Ошибка загрузки планировщика';const p=document.createElement('p');p.textContent=String(error?.message||error);card.append(h,p);app.replaceChildren(card); }
}
