// Server-backed sync. This module is loaded before the app entry point.
(() => {
  const DATA = 'gpro-command-center';
  const KEY = 'gpro-server-admin-key';
  const API = './api/state.php';
  const rawSet = Storage.prototype.setItem;
  const badge = document.createElement('span');
  badge.style.cssText = 'font-size:12px;opacity:.85';
  let revision = null, syncing = false, pending = false, timer = null, lastSaved = null;
  const status = text => { badge.textContent = text; };
  const read = () => { try { return JSON.parse(localStorage.getItem(DATA) || 'null'); } catch { return null; } };
  const secret = () => localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || '';
  async function request(method, data) {
    const res = await fetch(API, {method, cache:'no-store', headers:{'X-GPRO-Key':secret(), ...(data ? {'Content-Type':'application/json'} : {})}, body:data ? JSON.stringify(data) : undefined});
    const json = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(json.error || 'Ошибка сервера (' + res.status + ')');
    return json;
  }
  async function save() {
    if (syncing || revision === null) { pending = true; return; }
    syncing = true;
    try {
      const snapshot = localStorage.getItem(DATA);
      const state = JSON.parse(snapshot || 'null');
      if (!state?.projects) return;
      const response = await request('PUT', {revision, state});
      revision = response.revision;
      lastSaved = snapshot;
      status('☁ Сохранено на сервере');
      if (snapshot !== localStorage.getItem(DATA)) pending = true;
    } catch(e) {
      status('⚠ Не сохранено: ' + e.message);
      pending = false; // never overwrite server data after conflict
      revision = null;
    } finally {
      syncing = false;
      if (pending && revision !== null) { pending = false; schedule(); }
    }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(save, 900); }
  async function connect() {
    try {
      const remote = await request('GET');
      const local = read();
      if (remote.state) {
        if (local && JSON.stringify(local) !== JSON.stringify(remote.state)) {
          const upload = confirm('На этом устройстве есть локальные данные, отличающиеся от серверных.\n\nOK — заменить данные на сервере данными этого устройства.\nОтмена — загрузить серверные данные на это устройство.\n\nПеред выбором рекомендуем скачать резервную копию.');
          if (upload) {
            revision = remote.revision;
            await save();
            if (revision === null) return false;
          } else {
            rawSet.call(localStorage, DATA, JSON.stringify(remote.state));
            revision = remote.revision;
          }
        } else {
          rawSet.call(localStorage, DATA, JSON.stringify(remote.state));
          revision = remote.revision;
        }
      } else {
        revision = remote.revision;
        if (local) await save();
      }
      status('☁ Сервер подключён · автосохранение включено');
      return true;
    } catch(e) { status('⚠ ' + e.message); return false; }
  }
  window.gproServerSync = {start: async () => {
    const header = document.querySelector('.header-actions');
    if (header) {
      header.appendChild(badge);
      const button = document.createElement('button');
      button.textContent = '☁ Подключение / обновить';
      button.type = 'button';
      button.onclick = async () => {
        const key = prompt('Первое подключение устройства: введите ключ администратора GPRO (будет сохранён на этом устройстве):', secret());
        if (!key) return;
        localStorage.setItem(KEY, key);
        if (await connect()) location.reload();
      };
      header.appendChild(button);
    }
    if (!secret()) { status('○ Устройство не подключено · нажми «Подключение» один раз'); return; }
    status('☁ Подключаемся к серверу…');
    await connect();
  }};
  Storage.prototype.setItem = function(k,v) {
    const result = rawSet.apply(this,arguments);
    if (this === localStorage && k === DATA && revision !== null && v !== lastSaved) schedule();
    return result;
  };
})();
