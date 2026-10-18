// GPRO server synchronization: guarded writes, offline recovery and periodic refresh.
(() => {
  const DATA = 'gpro-command-center';
  const KEY = 'gpro-server-admin-key';
  const API = './api/state.php';
  const DRAFT = 'gpro-command-unsynced-draft';
  const rawSet = Storage.prototype.setItem;
  const badge = document.createElement('span');
  badge.className = 'sync-status';
  badge.setAttribute('role', 'status');
  let revision = null, lastSaved = null, timer = null, busy = false, dirty = false, blocked = false, polling = false, started = false;
  const secret = () => localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || '';
  const snapshot = () => localStorage.getItem(DATA);
  const status = (message, kind = '') => { badge.textContent = message; badge.dataset.status = kind; };
  const valid = value => value && Array.isArray(value.projects);
  const parse = value => { try { return JSON.parse(value || 'null'); } catch { return null; } };
  const keepDraft = value => { if (value && valid(parse(value))) rawSet.call(localStorage, DRAFT, JSON.stringify({at:new Date().toISOString(),state:parse(value)})); };
  function download(value, label = 'local') {
    const state = parse(value);
    if (!valid(state)) return;
    const a = document.createElement('a');
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], {type:'application/json'}));
    a.href = url;
    a.download = 'gpro-command-' + label + '-' + new Date().toISOString().replace(/[:.]/g,'-') + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function request(method, data) {
    const res = await fetch(API, {method,cache:'no-store',headers:{'X-GPRO-Key':secret(),...(data ? {'Content-Type':'application/json'} : {})},body:data ? JSON.stringify(data) : undefined});
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(body.error || 'Ошибка сервера (' + res.status + ')'); e.code = res.status; throw e; }
    return body;
  }
  const pause = (message) => { blocked = true; revision = null; status('⚠ ' + message, 'error'); };
  function schedule() {
    if (!secret() || blocked) return;
    dirty = true;
    status(navigator.onLine ? '◌ Есть несохранённые изменения' : '⚠ Нет интернета · изменения на устройстве', 'pending');
    clearTimeout(timer);
    timer = setTimeout(save, 1100);
  }
  async function save() {
    if (busy || blocked || revision === null || !secret() || !dirty) return;
    const raw = snapshot();
    if (!valid(parse(raw))) return;
    busy = true;
    status('☁ Сохраняем…', 'pending');
    try {
      const response = await request('PUT', {revision,state:parse(raw)});
      revision = response.revision;
      lastSaved = raw;
      dirty = snapshot() !== raw;
      if (dirty) schedule();
      else { localStorage.removeItem(DRAFT); status('☁ Сохранено на сервере', 'ok'); }
    } catch (error) {
      keepDraft(snapshot());
      dirty = true;
      if (error.code === 409) {
        pause('Конфликт версий · нажми «Синхронизация»');
      } else if (error.code === 403) {
        pause('Неверный ключ · переподключись');
      } else {
        status('⚠ Не сохранено · повторим при подключении', 'error');
      }
    } finally { busy = false; }
  }
  async function connect(interactive = false) {
    if (busy) return false;
    busy = true;
    status('☁ Подключаемся…', 'pending');
    try {
      const remote = await request('GET');
      const local = snapshot();
      const remoteRaw = remote.state ? JSON.stringify(remote.state) : null;
      const unsynced = localStorage.getItem(DRAFT);
      if (remoteRaw && local && local !== remoteRaw) {
        // A new device, changed server state or a conflict: never overwrite silently.
        if (interactive || unsynced || blocked) {
          const useServer = confirm('Данные на устройстве отличаются от серверных.\n\nOK — скачать резервную копию локальных данных и загрузить серверную версию.\nОтмена — оставить локальные данные без отправки на сервер.\n\nДля безопасного объединения изменений понадобится отдельная проверка.');
          if (!useServer) { keepDraft(local); pause('Локальные изменения сохранены · требуется решение'); return false; }
          download(local, 'before-server-load');
        } else if (started && !blocked && !dirty) {
          // Fresh page load: server is authoritative; retain a local recovery draft.
          keepDraft(local);
        } else {
          keepDraft(local);
          pause('Есть локальные изменения · нажми «Синхронизация»');
          return false;
        }
      }
      if (remoteRaw) {
        rawSet.call(localStorage, DATA, remoteRaw);
        lastSaved = remoteRaw;
      } else {
        lastSaved = local;
      }
      revision = remote.revision;
      blocked = false;
      dirty = !remoteRaw && !!local;
      status('☁ Сервер подключён · автосохранение', 'ok');
      if (dirty) setTimeout(schedule, 0);
      return true;
    } catch (error) {
      status('⚠ Подключение: ' + error.message, 'error');
      return false;
    } finally { busy = false; }
  }
  async function refresh() {
    if (polling || busy || blocked || dirty || revision === null || !secret() || document.hidden) return;
    polling = true;
    try {
      const remote = await request('GET');
      if (remote.revision !== revision) {
        const current = snapshot();
        if (current !== lastSaved) {
          keepDraft(current);
          pause('Новые данные на сервере · проверь изменения');
        } else if (remote.state && valid(remote.state)) {
          rawSet.call(localStorage, DATA, JSON.stringify(remote.state));
          lastSaved = snapshot();
          revision = remote.revision;
          status('☁ Данные обновлены · перезагрузка…', 'ok');
          location.reload();
        }
      }
    } catch { status('⚠ Связь с сервером прервана', 'error'); }
    finally { polling = false; }
  }
  window.gproServerSync = {start: async () => {
    const header = document.querySelector('.header-actions');
    if (header) {
      header.appendChild(badge);
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'sync-button'; button.textContent = '☁ Синхронизация';
      button.onclick = async () => {
        if (!secret() || badge.textContent.includes('Неверный ключ')) {
          const key = prompt('Ключ администратора GPRO (сохранится на этом устройстве):', secret());
          if (!key) return;
          localStorage.setItem(KEY, key);
        }
        if (dirty && !blocked) { await save(); return; }
        if (await connect(true)) location.reload();
      };
      header.appendChild(button);
    }
    started = true;
    if (!secret()) { status('○ Локальный режим · подключи устройство'); return; }
    await connect(false);
    window.addEventListener('online', () => { if (dirty && !blocked) save(); else refresh(); });
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    setInterval(refresh, 20000);
    setInterval(() => { if (dirty && !busy && !blocked && navigator.onLine) save(); }, 12000);
  }};
  Storage.prototype.setItem = function(k, v) {
    const result = rawSet.apply(this, arguments);
    if (this === localStorage && k === DATA && v !== lastSaved) {
      keepDraft(v);
      if (revision !== null && !blocked) schedule();
    }
    return result;
  };
})();
