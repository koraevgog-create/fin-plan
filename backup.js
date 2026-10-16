// Local-only backup control. Never uploads private data.
(() => {
  const DATA_KEY = 'gpro-command-center';
  const BACKUP_KEY = 'gpro-command-last-backup';
  const header = document.querySelector('.header-actions');
  if (!header || document.getElementById('gproBackupNow')) return;
  const button = document.createElement('button');
  button.id = 'gproBackupNow';
  button.type = 'button';
  button.textContent = '↓ Сохранить резервную копию';
  button.title = 'Скачать все текущие данные штаба в JSON';
  const status = document.createElement('span');
  status.id = 'gproBackupStatus';
  status.style.cssText = 'font-size:12px;opacity:.8;max-width:190px;line-height:1.35';
  status.setAttribute('role', 'status');
  header.append(button, status);
  const last = () => { try { return JSON.parse(localStorage.getItem(BACKUP_KEY) || 'null'); } catch { return null; } };
  function refresh() {
    const entry = last();
    if (!entry || !entry.at) { status.textContent = 'Резервная копия ещё не создана'; return; }
    const date = new Date(entry.at);
    const stamp = Number.isNaN(date.getTime()) ? 'неизвестно' : date.toLocaleString('ru-RU');
    const current = localStorage.getItem(DATA_KEY);
    status.textContent = current === entry.snapshot
      ? 'Копия создана: ' + stamp
      : 'Есть изменения после копии от ' + stamp;
  }
  button.addEventListener('click', () => {
    try {
      const raw = localStorage.getItem(DATA_KEY);
      if (!raw) { alert('Данные штаба ещё не найдены в этом браузере.'); return; }
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.projects)) throw new Error('Некорректные данные штаба');
      const now = new Date();
      const blob = new Blob([JSON.stringify(parsed, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gpro-command-backup-' + now.toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      localStorage.setItem(BACKUP_KEY, JSON.stringify({ at: now.toISOString(), snapshot: raw }));
      refresh();
    } catch (error) {
      alert('Не удалось подготовить резервную копию: ' + error.message);
    }
  });
  const originalSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    const result = originalSet.apply(this, arguments);
    if (this === localStorage && key === DATA_KEY) queueMicrotask(refresh);
    return result;
  };
  window.addEventListener('storage', e => { if (e.key === DATA_KEY || e.key === BACKUP_KEY) refresh(); });
  refresh();
})();
