// GPRO server synchronization: guarded writes, offline recovery and periodic refresh.
(() => {
  const DATA = 'gpro-command-center';
  const KEY = 'gpro-server-admin-key';
  const API = './api/state.php';
  const DRAFT = 'gpro-command-unsynced-draft';
  const BASE = 'gpro-command-last-server-state';
  const rawSet = Storage.prototype.setItem;
  const badge = document.createElement('span');
  badge.className = 'sync-status';
  badge.setAttribute('role', 'status');
  let revision = null, lastSaved = null, timer = null, busy = false, dirty = false, blocked = false, polling = false, started = false;
  const secret = () => localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || '';
  const snapshot = () => localStorage.getItem(DATA);
  const rememberServer = value => { if (value) rawSet.call(localStorage, BASE, value); };
  const same = (a,b) => { try { return JSON.stringify(parse(a)) === JSON.stringify(parse(b)); } catch { return a === b; } };
  const status = (message, kind = '') => { badge.textContent = message; badge.dataset.status = kind; };
  const valid = value => value && Array.isArray(value.projects);
  const parse = value => { try { return JSON.parse(value || 'null'); } catch { return null; } };
  const keepDraft = value => { if (value && valid(parse(value))) { rawSet.call(localStorage, DRAFT, JSON.stringify({at:new Date().toISOString(),state:parse(value)})); window.dispatchEvent(new Event('gpro-draft-changed')); } };
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

  // Three-way merge: only non-overlapping edits are merged automatically.
  // Conflicting edits/deletions remain local and require explicit resolution.
  const ABSENT = Symbol('absent');
  const equal = (a,b) => a === ABSENT || b === ABSENT ? a === b : JSON.stringify(a) === JSON.stringify(b);
  const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  function merge3(base,local,remote,path = '') {
    if (equal(local,remote)) return {value:local,conflicts:[]};
    if (equal(local,base)) return {value:remote,conflicts:[]};
    if (equal(remote,base)) return {value:local,conflicts:[]};
    if (plain(base) && plain(local) && plain(remote)) {
      const out = {}, conflicts = [];
      for (const k of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])) {
        const b = Object.hasOwn(base,k) ? base[k] : ABSENT;
        const l = Object.hasOwn(local,k) ? local[k] : ABSENT;
        const rr = Object.hasOwn(remote,k) ? remote[k] : ABSENT;
        const result = merge3(b,l,rr,path + '/' + k);
        conflicts.push(...result.conflicts);
        if (result.value !== ABSENT) out[k] = result.value;
      }
      return {value:out,conflicts};
    }
    if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
      const keyed = [base,local,remote].every(arr => arr.every(item => plain(item) && (typeof item.id === 'string' || typeof item.id === 'number') && item.id !== ''));
      if (keyed) {
        const ids = arr => new Set(arr.map(x => String(x.id)));
        if ([base,local,remote].some(arr => ids(arr).size !== arr.length)) return {value:local,conflicts:[path]};
        const b = new Map(base.map(x=>[String(x.id),x]));
        const l = new Map(local.map(x=>[String(x.id),x]));
        const rr = new Map(remote.map(x=>[String(x.id),x]));
        const out=[],conflicts=[];
        for (const id of new Set([...rr.keys(),...l.keys(),...b.keys()])) {
          const result=merge3(b.get(id) ?? ABSENT,l.get(id) ?? ABSENT,rr.get(id) ?? ABSENT,path + '/' + id);
          conflicts.push(...result.conflicts);
          if (result.value !== ABSENT) out.push(result.value);
        }
        return {value:out,conflicts};
      }
      // Legacy arrays without IDs cannot be merged safely: identical items may be distinct records.
      // Require an explicit choice rather than silently dropping duplicates.
      return {value:local,conflicts:[path || '/']};
    }
    return {value:local,conflicts:[path || '/']};
  }

  // Conflict review never writes to the server until the user confirms.
  function reviewConflicts(base, local, remote, serverRevision) {
    const merged = merge3(base, local, remote);
    if (!merged.conflicts.length) return Promise.resolve(merged.value);
    return new Promise(resolve => {
      const backdrop = document.createElement('div');
      backdrop.className = 'gpro-conflict-overlay';
      const dialog = document.createElement('section');
      dialog.className = 'gpro-conflict-dialog';
      dialog.setAttribute('role','dialog');
      dialog.setAttribute('aria-modal','true');
      dialog.setAttribute('aria-label','Разрешение конфликтов синхронизации');
      const heading = document.createElement('h2');
      heading.textContent = 'Разрешение конфликтов · ' + merged.conflicts.length;
      const intro = document.createElement('p');
      intro.textContent = 'Для каждого различия выбери, какие данные оставить. Пока ты не нажмёшь «Сохранить выбор», сервер не изменится.';
      dialog.append(heading,intro);
      const choices = [];
      for (const path of merged.conflicts) {
        const segments = path.split('/').filter(Boolean);
        const get = (obj) => segments.reduce((v,k) => {
          if (Array.isArray(v)) return v.find(x=>x && String(x.id) === k) ?? ABSENT;
          return v && v !== ABSENT && Object.hasOwn(v,k) ? v[k] : ABSENT;
        },obj);
        const ours = get(local), theirs = get(remote);
        const item = document.createElement('div');
        item.className = 'gpro-conflict-item';
        const label = document.createElement('strong');
        label.textContent = segments.join(' → ') || 'Общие данные';
        const choice = document.createElement('select');
        const a = document.createElement('option'); a.value = 'local'; a.textContent = 'Оставить данные этого устройства';
        const b = document.createElement('option'); b.value = 'server'; b.textContent = 'Взять данные с сервера';
        choice.append(a,b);
        const previews = document.createElement('div');
        previews.className = 'gpro-conflict-previews';
        const fmt = value => value === ABSENT ? '(удалено)' : JSON.stringify(value,null,2);
        for (const [name,value] of [['На устройстве',ours],['На сервере',theirs]]) {
          const pane = document.createElement('div');
          const title = document.createElement('b'); title.textContent = name;
          const pre = document.createElement('pre'); pre.textContent = fmt(value);
          pane.append(title,pre); previews.append(pane);
        }
        item.append(label,choice,previews); dialog.append(item);
        choices.push({segments,choice,ours,theirs});
      }
      const actions = document.createElement('div'); actions.className = 'gpro-conflict-actions';
      const cancel = document.createElement('button'); cancel.textContent = 'Отмена · сохранить локальную копию';
      const apply = document.createElement('button'); apply.textContent = 'Сохранить выбор'; apply.className = 'primary';
      actions.append(cancel,apply); dialog.append(actions); backdrop.append(dialog); document.body.append(backdrop);
      const close = value => { backdrop.remove(); resolve(value); };
      cancel.onclick = () => { keepDraft(snapshot()); close(null); };
      apply.onclick = () => {
        // Construct a resolution by recursively choosing conflicting leaf paths.
        const decisions = new Map(choices.map(x=>['/'+x.segments.join('/'),x.choice.value]));
        function resolveNode(b,l,rr,path='') {
          if (decisions.has(path)) return decisions.get(path) === 'server' ? rr : l;
          if (equal(l,rr)) return l;
          if (equal(l,b)) return rr;
          if (equal(rr,b)) return l;
          if (plain(b) && plain(l) && plain(rr)) {
            const obj = {};
            for (const k of new Set([...Object.keys(b),...Object.keys(l),...Object.keys(rr)])) {
              const value = resolveNode(Object.hasOwn(b,k)?b[k]:ABSENT,Object.hasOwn(l,k)?l[k]:ABSENT,Object.hasOwn(rr,k)?rr[k]:ABSENT,path+'/'+k);
              if (value !== ABSENT) obj[k]=value;
            }
            return obj;
          }
          if (Array.isArray(b) && Array.isArray(l) && Array.isArray(rr)) {
            const keyed=[b,l,rr].every(arr=>arr.every(x=>plain(x) && x.id != null));
            if (keyed) {
              const mb=new Map(b.map(x=>[String(x.id),x])), ml=new Map(l.map(x=>[String(x.id),x])), mr=new Map(rr.map(x=>[String(x.id),x]));
              const out=[];
              for (const id of new Set([...mr.keys(),...ml.keys(),...mb.keys()])) {
                const v=resolveNode(mb.get(id)??ABSENT,ml.get(id)??ABSENT,mr.get(id)??ABSENT,path+'/'+id);
                if (v !== ABSENT) out.push(v);
              }
              return out;
            }
            // No stable IDs: use the explicit conflict decision for the entire array.
            return l;
          }
          return l;
        }
        close(resolveNode(base,local,remote));
      };
    });
  }
  async function commitReviewed(base, localRaw, remote) {
    if (!valid(base) || !valid(parse(localRaw)) || !valid(remote.state)) return false;
    const selected = await reviewConflicts(base,parse(localRaw),remote.state,remote.revision);
    if (!selected) return false;
    if (!same(snapshot(),localRaw)) { keepDraft(snapshot()); status('⚠ Пока выбирали, данные изменились · повторите', 'error'); return false; }
    try {
      const response=await request('PUT',{revision:remote.revision,state:selected});
      const raw=JSON.stringify(selected);
      rawSet.call(localStorage,DATA,raw);
      rememberServer(raw); lastSaved=raw; revision=response.revision;
      dirty=false; blocked=false;
      localStorage.removeItem(DRAFT);
      window.dispatchEvent(new Event('gpro-draft-changed'));
      status('☁ Конфликт разрешён · данные сохранены','ok');
      location.reload();
      return true;
    } catch(e) {
      keepDraft(localRaw);
      status('⚠ Сервер изменился · повторите разрешение конфликта','error');
      return false;
    }
  }
  async function reconcile() {
    const base = parse(localStorage.getItem(BASE));
    const localRaw = snapshot();
    const local = parse(localRaw);
    if (!valid(base) || !valid(local)) return false;
    const latest = await request('GET');
    if (!valid(latest.state)) return false;
    const merged = merge3(base,local,latest.state);
    if (merged.conflicts.length) {
      keepDraft(localRaw);
      return await commitReviewed(base,localRaw,latest);
    }
    // Another local edit during the GET means we must retry with a fresh snapshot.
    if (!same(snapshot(),localRaw)) return false;
    const result = await request('PUT',{revision:latest.revision,state:merged.value});
    const mergedRaw = JSON.stringify(merged.value);
    revision = result.revision;
    rememberServer(mergedRaw);
    lastSaved = mergedRaw;
    rawSet.call(localStorage,DATA,mergedRaw);
    dirty = false;
    blocked = false;
    localStorage.removeItem(DRAFT);
    window.dispatchEvent(new Event('gpro-draft-changed'));
    status('☁ Изменения объединены и сохранены', 'ok');
    location.reload();
    return true;
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
      rememberServer(raw);
      dirty = !same(snapshot(), raw);
      if (dirty) schedule();
      else { localStorage.removeItem(DRAFT); window.dispatchEvent(new Event('gpro-draft-changed')); status('☁ Сохранено на сервере', 'ok'); }
    } catch (error) {
      keepDraft(snapshot());
      dirty = true;
      if (error.code === 409) {
        try { if (await reconcile()) return; } catch (_) { /* keep the local draft */ }
        pause('Конфликт версий · локальная копия сохранена');
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
      const base = localStorage.getItem(BASE);
      const unsynced = localStorage.getItem(DRAFT);
      const localChanged = !!local && !!base && !same(local, base);
      const draftState = parse(unsynced)?.state;
      const draftChanged = !!base && valid(draftState) && !same(JSON.stringify(draftState), base);
      if (remoteRaw && local && !same(local, remoteRaw)) {
        if (localChanged && base && valid(parse(base))) {
          const merged = merge3(parse(base),parse(local),remote.state);
          if (!merged.conflicts.length) {
            // A safe merge will be committed with the server's current revision.
            try {
              const response = await request('PUT',{revision:remote.revision,state:merged.value});
              const mergedRaw = JSON.stringify(merged.value);
              rawSet.call(localStorage,DATA,mergedRaw);
              rememberServer(mergedRaw);
              lastSaved = mergedRaw;
              revision = response.revision;
              blocked = false; dirty = false;
              localStorage.removeItem(DRAFT);
              window.dispatchEvent(new Event('gpro-draft-changed'));
              status('☁ Изменения объединены и сохранены', 'ok');
              return true;
            } catch (error) {
              keepDraft(local);
              pause('Не удалось объединить · локальная копия сохранена');
              return false;
            }
          }
        }
        if (localChanged && base && valid(parse(base))) {
          keepDraft(local);
          return await commitReviewed(parse(base),local,remote);
        }
        // A new device, changed server state or a conflict: never overwrite silently.
        if (localChanged || draftChanged || blocked || (interactive && !base)) {
          const useServer = confirm('Данные на устройстве отличаются от серверных.\n\nOK — скачать резервную копию локальных данных и загрузить серверную версию.\nОтмена — оставить локальные данные без отправки на сервер.\n\nДля безопасного объединения изменений понадобится отдельная проверка.');
          if (!useServer) { keepDraft(local); pause('Локальные изменения сохранены · требуется решение'); return false; }
          download(local, 'before-server-load');
        } else if (started && !blocked && !dirty) {
          // Previously synced device or fresh device with seed data: use the server version.
          if (!base) keepDraft(local);
        } else {
          keepDraft(local);
          pause('Есть локальные изменения · нажми «Синхронизация»');
          return false;
        }
      }
      if (remoteRaw) {
        rawSet.call(localStorage, DATA, remoteRaw);
        lastSaved = remoteRaw;
        rememberServer(remoteRaw);
        if (!localChanged) { localStorage.removeItem(DRAFT); window.dispatchEvent(new Event('gpro-draft-changed')); }
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
          rememberServer(lastSaved);
          localStorage.removeItem(DRAFT);
          window.dispatchEvent(new Event('gpro-draft-changed'));
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
        if (blocked && valid(parse(localStorage.getItem(BASE)))) {
          try { const remote=await request('GET'); if (await commitReviewed(parse(localStorage.getItem(BASE)),snapshot(),remote)) return; }
          catch(e) { status('⚠ '+e.message,'error'); }
          return;
        }
        if (await connect(true)) location.reload();
      };
      header.appendChild(button);
      const recovery = document.createElement('button');
      recovery.type = 'button';
      recovery.className = 'sync-recovery';
      recovery.textContent = '↓ Несохранённая копия';
      recovery.title = 'Скачать последнюю локальную копию на случай конфликта';
      recovery.onclick = () => {
        const entry = parse(localStorage.getItem(DRAFT));
        if (!entry?.state || !valid(entry.state)) { alert('Локальная копия не найдена.'); return; }
        download(JSON.stringify(entry.state), 'recovery');
      };
      header.appendChild(recovery);
      const updateRecovery = () => { recovery.hidden = !localStorage.getItem(DRAFT); };
      updateRecovery();
      window.addEventListener('storage', updateRecovery);
      window.addEventListener('gpro-draft-changed', updateRecovery);
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
    if (this === localStorage && k === DATA && !same(v, lastSaved)) {
      if (revision !== null || localStorage.getItem(BASE)) keepDraft(v);
      if (revision !== null && !blocked) schedule();
    }
    return result;
  };
})();
