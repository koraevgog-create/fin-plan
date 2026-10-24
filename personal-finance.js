// GPRO Personal Finance: independent ledger stored inside the existing synced state.
// No example transactions are created and legacy project transactions are never imported implicitly.
(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;','\'':'&#39;'}[c]));
  const money = n => (Number(n)||0).toLocaleString('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:2})+' ₽';
  const today = () => {const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
  const month = () => today().slice(0,7);
  const uid = () => 'pf'+Date.now().toString(36)+Math.random().toString(36).slice(2,9);
  const defaults = {
    income:['Зарплата','Подработка','Перепродажа уценки DNS','Аренда колонок','Подарки','Другое'],
    expense:['Продукты','Жильё и коммунальные','Ипотека и кредиты: проценты','Транспорт','Связь и интернет','Здоровье','Дети и семья','Одежда','Образование','Развлечения','Кафе и доставка','Помощь близким','Налоги и комиссии','Бизнес: личные расходы','Личные расходы','Другое'],
    accounts:['Наличные','Основная карта','Накопительный счёт','Брокерский счёт']
  };
  const init = state => {
    if(!state.personalLedger || typeof state.personalLedger !== 'object')state.personalLedger={};
    const l=state.personalLedger;
    l.transactions=Array.isArray(l.transactions)?l.transactions:[];
    l.categories ||= {income:[...defaults.income],expense:[...defaults.expense]};
    for(const type of ['income','expense'])if(!Array.isArray(l.categories[type]))l.categories[type]=[...defaults[type]];
    // Preserve historical transactions while migrating obsolete income labels.
    const rename={'Доп доход 1':'Перепродажа уценки DNS','Доп доход 2':'Аренда колонок'};
    for(const t of l.transactions)if(t.type==='income'&&rename[t.category])t.category=rename[t.category];
    l.categories.income=[...new Set([...defaults.income,...l.categories.income.filter(c=>!['Доп доход 1','Доп доход 2','Аренда','Продажи','Дивиденды и проценты'].includes(c))])];
    l.categories.expense=[...new Set([...l.categories.expense.filter(c=>!['Закупка товаров для перепродажи','Логистика перепродажи','Расходы на аренду оборудования'].includes(c)||l.transactions.some(t=>t.type==='expense'&&t.category===c)),...defaults.expense])];
    l.inventory=Array.isArray(l.inventory)?l.inventory:[];
    l.accounts=Array.isArray(l.accounts)?l.accounts:[...defaults.accounts].map(name=>({id:uid(),name,opening:0}));
    l.budgets ||= {};
    l.assets=Array.isArray(l.assets)?l.assets:[];
    l.liabilities=Array.isArray(l.liabilities)?l.liabilities:[];
    return l;
  };
  let selectedMonth=month(),tab='dashboard',editing=null,quick=false,transferQuick=false;
  const kinds={income:'Доход',expense:'Расход',transfer:'Перевод',saving:'В накопления',debt_in:'Получение займа',debt_out:'Погашение долга'};
  const accountName=(l,id)=>l.accounts.find(a=>a.id===id)?.name||'Неизвестный счёт';
  const totals=(l,m)=>{const result=l.transactions.filter(t=>t.date?.slice(0,7)===m).reduce((a,t)=>{
    const amount=Number(t.amount)||0;
    if(t.type==='income')a.income+=amount;
    if(t.type==='expense')a.expense+=amount;
    if(t.type==='saving')a.saved+=amount;
    return a;
  },{income:0,expense:0,saved:0});for(const x of l.inventory||[]){if(x.soldAt?.slice(0,7)!==m)continue;const p=profit(x);if(p>=0)result.income+=p;else result.expense-=p;}return result;};
  const cost=x=>(Number(x.buyPrice)||0)+(Number(x.buyCosts)||0);
  const profit=x=>(Number(x.sellPrice)||0)-cost(x)-(Number(x.sellCosts)||0);
  const balances=l=>l.accounts.map(a=>{
    let balance=Number(a.opening)||0;
    for(const t of l.transactions){
      const n=Number(t.amount)||0;
      if(t.type==='income'||t.type==='debt_in'){if(t.account===a.id)balance+=n}
      else if(t.type==='expense'||t.type==='debt_out'){if(t.account===a.id)balance-=n}
      else if(t.type==='transfer'||t.type==='saving'){if(t.account===a.id)balance-=n;if(t.toAccount===a.id)balance+=n}
    }
    for(const x of l.inventory||[])if(x.account===a.id){balance-=cost(x);if(x.soldAt)balance+=(Number(x.sellPrice)||0)-(Number(x.sellCosts)||0)}
    return {...a,balance};
  });
  const opts=(items,chosen)=>items.map(x=>'<option value="'+esc(x.value)+'" '+(x.value===chosen?'selected':'')+'>'+esc(x.label)+'</option>').join('');
  const typeOptions=selected=>opts(Object.entries(kinds).map(([value,label])=>({value,label})),selected);
  const monthLabel=m=>{const [y,mm]=m.split('-').map(Number);return new Date(y,mm-1,1).toLocaleDateString('ru-RU',{month:'long',year:'numeric'})};
  const summary=(title,value,note)=>'<article class="card pf-stat"><div class="tiny">'+title+'</div><h2>'+money(value)+'</h2>'+(note?'<small>'+note+'</small>':'')+'</article>';
  function render(state){
    const l=init(state),current=totals(l,selectedMonth),prevDate=new Date(Number(selectedMonth.slice(0,4)),Number(selectedMonth.slice(5,7))-2,1),previous=totals(l,[prevDate.getFullYear(),String(prevDate.getMonth()+1).padStart(2,'0')].join('-'));
    const allBalances=balances(l),liquid=allBalances.reduce((a,b)=>a+b.balance,0),inventoryValue=l.inventory.filter(x=>!x.soldAt).reduce((a,x)=>a+cost(x),0),assets=l.assets.reduce((a,x)=>a+(Number(x.value)||0),0)+inventoryValue,debts=l.liabilities.reduce((a,x)=>a+(Number(x.balance)||0),0);
    const budget=l.budgets[selectedMonth]||{},spentByCategory={};
    for(const t of l.transactions)if(t.type==='expense'&&t.date?.slice(0,7)===selectedMonth)spentByCategory[t.category]=(spentByCategory[t.category]||0)+Number(t.amount||0);
    const monthly=l.transactions.filter(t=>t.date?.slice(0,7)===selectedMonth).slice().sort((a,b)=>b.date.localeCompare(a.date)||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    const cards='<div class="grid pf-kpis">'+summary('Доход за месяц',current.income,'Прошлый месяц: '+money(previous.income))+summary('Расход за месяц',current.expense,'Прошлый месяц: '+money(previous.expense))+summary('Денежный результат',current.income-current.expense,'Доходы минус расходы')+summary('Переведено в накопления',current.saved,'Не считается расходом')+'</div>';
    const period='<div class="row wrap pf-period"><button type="button" data-pf="prev">← Предыдущий</button><label>Месяц <input id="pfMonth" type="month" value="'+esc(selectedMonth)+'"></label><button type="button" data-pf="current">Текущий</button><button type="button" data-pf="next">Следующий →</button><button type="button" class="primary" data-pf="quick">+ Быстрая операция</button><button type="button" data-pf="transferQuick">⇄ Перевод между счетами</button></div>';
    const tabs='<div class="tabs pf-tabs">'+[['dashboard','Обзор'],['operations','Операции'],['budget','Бюджет'],['accounts','Счета'],['earnings','Мои заработки'],['inventory','Товары на перепродажу'],['wealth','Активы и долги'],['categories','Категории']].map(([v,t])=>'<button type="button" data-pf="tab:'+v+'" class="'+(tab===v?'active':'')+'">'+t+'</button>').join('')+'</div>';
    const history=()=>{
      const byMonth=new Map();for(const t of l.transactions){const m=t.date?.slice(0,7);if(m)byMonth.set(m,true)}
      for(let i=0;i<6;i++){const d=new Date(Number(selectedMonth.slice(0,4)),Number(selectedMonth.slice(5,7))-1-i,1);byMonth.set([d.getFullYear(),String(d.getMonth()+1).padStart(2,'0')].join('-'),true)}
      return [...byMonth.keys()].sort().reverse().slice(0,24).map(m=>{const x=totals(l,m);const max=Math.max(x.income,x.expense,1);return '<div class="pf-history"><div class="row"><b>'+esc(monthLabel(m))+'</b><span>'+money(x.income-x.expense)+'</span></div><div class="pf-bar"><i style="width:'+Math.min(100,x.income/max*100)+'%"></i></div><div class="pf-bar expense"><i style="width:'+Math.min(100,x.expense/max*100)+'%"></i></div><small>Доход '+money(x.income)+' · Расход '+money(x.expense)+'</small></div>'}).join('')
    };
    const ledgerTable=(items)=>'<div class="table pf-table"><table><thead><tr><th>Дата</th><th>Операция</th><th>Категория</th><th>Счёт</th><th>Сумма</th><th></th></tr></thead><tbody>'+items.map(t=>'<tr><td>'+esc(t.date)+'</td><td>'+esc(kinds[t.type]||t.type)+'</td><td>'+esc(t.category||'—')+(t.note?'<small>'+esc(t.note)+'</small>':'')+'</td><td>'+esc(accountName(l,t.account))+(t.toAccount?' → '+esc(accountName(l,t.toAccount)):'')+'</td><td class="'+(t.type==='expense'?'pf-negative':'')+'">'+(t.type==='expense'?'−':'')+money(t.amount)+'</td><td><button type="button" data-pf="edit:'+esc(t.id)+'">✎</button><button type="button" data-pf="delete:'+esc(t.id)+'">×</button></td></tr>').join('')+'</tbody></table></div>';
    const categoryOptions=(type,selected)=>opts((l.categories[type]||[]).map(v=>({value:v,label:v})),selected);
    const form=(compact=false)=>{
      const t=editing?l.transactions.find(x=>x.id===editing):null,type=t?.type||(transferQuick?'transfer':'expense');
      return '<form id="pfEntry" class="card pf-entry"><h3>'+(t?'Редактировать операцию':compact?'Быстрое внесение':'Новая операция')+'</h3><div class="formgrid"><label>Тип<select name="type" id="pfType">'+typeOptions(type)+'</select></label><label>Сумма, ₽<input name="amount" type="number" step="0.01" min="0.01" required inputmode="decimal" value="'+esc(t?.amount||'')+'"></label><label>Дата<input name="date" type="date" required value="'+esc(t?.date||today())+'"></label><label id="pfCategoryWrap">Категория<select name="category" id="pfCategory">'+categoryOptions(type==='income'?'income':'expense',t?.category)+'</select></label><label>Счёт<select name="account" id="pfAccount">'+opts(l.accounts.map(a=>({value:a.id,label:a.name})),t?.account||l.accounts[0]?.id)+'</select></label><label id="pfToWrap">Счёт назначения<select name="toAccount">'+opts(l.accounts.map(a=>({value:a.id,label:a.name})),t?.toAccount||l.accounts[1]?.id)+'</select></label></div><label>Комментарий<input name="note" maxlength="250" placeholder="Необязательно" value="'+esc(t?.note||'')+'"></label><div class="row wrap"><button type="submit" class="primary">✓ Учесть операцию</button><button type="button" data-pf="cancel">Отмена</button></div></form>';
    };
    let body='';
    if(tab==='dashboard'){
      body=cards+'<div class="two"><section>'+summary('Деньги на счетах',liquid)+summary('Чистый капитал',liquid+assets-debts,'Счета + товары + активы − обязательства')+'<article class="card"><h3>Счета</h3>'+allBalances.map(a=>'<div class="row"><span>'+esc(a.name)+'</span><b>'+money(a.balance)+'</b></div>').join('')+'</article></section><article class="card"><h3>Динамика по месяцам</h3><p class="tiny">Зелёный — доходы, красный — расходы</p>'+history()+'</article></div><article class="card"><h3>Последние операции месяца</h3>'+ledgerTable(monthly.slice(0,8))+'</article>';
    }else if(tab==='operations'){
      body='<article class="card"><h3>Журнал · '+esc(monthLabel(selectedMonth))+'</h3><p class="tiny">Доходы, расходы и внутренние перемещения учитываются раздельно.</p>'+ledgerTable(monthly)+'</article>';
    }else if(tab==='budget'){
      body='<article class="card"><h3>Бюджет по категориям · '+esc(monthLabel(selectedMonth))+'</h3><p class="tiny">Лимиты задаются отдельно для каждого месяца. Переводы и накопления в расход не включаются.</p><div class="table"><table><thead><tr><th>Категория</th><th>Лимит</th><th>Факт</th><th>Осталось</th></tr></thead><tbody>'+l.categories.expense.map(cat=>{const limit=Number(budget[cat]||0),fact=spentByCategory[cat]||0;return '<tr><td>'+esc(cat)+'</td><td><input type="number" min="0" step="0.01" data-pf-limit="'+esc(cat)+'" value="'+limit+'"></td><td>'+money(fact)+'</td><td class="'+(limit>0&&fact>limit?'pf-negative':'')+'">'+(limit?money(limit-fact):'—')+'</td></tr>'}).join('')+'</tbody></table></div></article>';
    }else if(tab==='earnings'){
      const names=['Перепродажа','JBL / Event'];
      const entries=names.map(name=>{const p=(state.projects||[]).find(x=>x.name===name);const tx=(p?.financialHistory||[]).filter(x=>x.date?.slice(0,7)===selectedMonth);const inc=tx.reduce((n,x)=>n+(x.type==='income'?Number(x.amount)||0:0),0),out=tx.reduce((n,x)=>n+(x.type==='expense'?Number(x.amount)||0:0),0);return {name,tx,inc,out,profit:inc-out}});
      const resale=l.inventory.filter(x=>x.soldAt?.slice(0,7)===selectedMonth),resaleProfit=resale.reduce((n,x)=>n+profit(x),0);
      body='<article class="card"><h3>Перепродажа товаров · '+esc(monthLabel(selectedMonth))+'</h3><p>Продано: '+resale.length+' · выручка '+money(resale.reduce((n,x)=>n+Number(x.sellPrice),0))+' · результат <b>'+money(resaleProfit)+'</b></p><p class="tiny">Показана прибыль по закрытым карточкам товаров; полная выручка не прибавляется к личному доходу.</p></article>'+'<div class="grid pf-kpis">'+summary('Выручка направлений',entries.reduce((n,x)=>n+x.inc,0))+summary('Прямые расходы',entries.reduce((n,x)=>n+x.out,0))+summary('Прибыль направлений',entries.reduce((n,x)=>n+x.profit,0))+'</div>'+entries.map(x=>'<article class="card"><h3>'+esc(x.name)+'</h3><div class="grid three">'+summary('Выручка',x.inc)+summary('Расходы',x.out)+summary('Прибыль',x.profit)+'</div><div class="table"><table><thead><tr><th>Дата</th><th>Операция</th><th>Комментарий</th><th>Сумма</th></tr></thead><tbody>'+x.tx.map(t=>'<tr><td>'+esc(t.date)+'</td><td>'+esc(t.type==='income'?'Доход':'Расход')+'</td><td>'+esc(t.note||t.category||'')+'</td><td>'+money(t.amount)+'</td></tr>').join('')+'</tbody></table></div></article>').join('')+'<p class="tiny">Здесь отображаются операции, привязанные к бизнес-проектам. Они уже учтены в личном журнале, повторно деньги не прибавляются.</p>';
    }else if(tab==='inventory'){
      const active=l.inventory.filter(x=>!x.soldAt),sold=l.inventory.filter(x=>x.soldAt),monthlySold=sold.filter(x=>x.soldAt.slice(0,7)===selectedMonth);
      body='<div class="grid pf-kpis">'+summary('Товарный остаток',active.reduce((n,x)=>n+cost(x),0))+summary('Выручка от продаж',monthlySold.reduce((n,x)=>n+Number(x.sellPrice),0))+summary('Прибыль / убыток',monthlySold.reduce((n,x)=>n+profit(x),0))+'</div><article class="card"><h3>Купить товар</h3><p class="tiny">Покупка уменьшит баланс карты, но не личный расход.</p><form id="pfInventoryAdd" class="formgrid"><label>Название<input name="name" required maxlength="120"></label><label>Дата покупки<input name="boughtAt" type="date" required value="'+today()+'"></label><label>Цена закупки<input name="buyPrice" type="number" min="0.01" step="0.01" required></label><label>Затраты на закупку<input name="buyCosts" type="number" min="0" step="0.01" value="0"></label><label>Карта оплаты<select name="account">'+opts(l.accounts.map(a=>({value:a.id,label:a.name})),l.accounts.find(a=>a.name==='Основная карта')?.id)+'</select></label><label>Описание<input name="note" maxlength="250"></label><button class="primary">+ Учесть товар</button></form></article><article class="card"><h3>В продаже · '+active.length+'</h3>'+active.map(x=>'<div class="card"><b>'+esc(x.name)+'</b><p>Себестоимость: '+money(cost(x))+' · '+esc(x.boughtAt)+'</p><p class="tiny">'+esc(x.note||'')+'</p><form data-pf-sell="'+esc(x.id)+'" class="formgrid"><label>Дата продажи<input name="soldAt" type="date" required value="'+today()+'"></label><label>Цена продажи<input name="sellPrice" type="number" min="0.01" step="0.01" required></label><label>Расходы на продажу<input name="sellCosts" type="number" min="0" step="0.01" value="0"></label><button class="primary">✓ Продать</button><button type="button" data-pf="removeInventory:'+esc(x.id)+'">Удалить ошибочную запись</button></form></div>').join('')+'</article><article class="card"><h3>Проданные товары</h3><div class="table"><table><thead><tr><th>Товар</th><th>Куплен</th><th>Продан</th><th>Себестоимость</th><th>Выручка</th><th>Результат</th></tr></thead><tbody>'+sold.slice().sort((a,b)=>b.soldAt.localeCompare(a.soldAt)).map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.boughtAt)+'</td><td>'+esc(x.soldAt)+'</td><td>'+money(cost(x))+'</td><td>'+money(x.sellPrice)+'</td><td>'+money(profit(x))+'</td></tr>').join('')+'</tbody></table></div></article><p class="tiny">Денежные остатки учитывают полную закупку и продажу. В доходы или расходы месяца попадает только итоговая прибыль либо убыток. Повторно в журнал сделки не вносите.</p>';
    }else if(tab==='accounts'){
      body='<div class="grid three">'+allBalances.map(a=>'<article class="card"><h3>'+esc(a.name)+'</h3><h2>'+money(a.balance)+'</h2><label>Начальный остаток<input type="number" step="0.01" data-pf-opening="'+esc(a.id)+'" value="'+(Number(a.opening)||0)+'"></label></article>').join('')+'</div><form class="card pf-simple" id="pfAccountForm"><h3>Добавить счёт</h3><input name="name" maxlength="70" required placeholder="Название счёта"><button class="primary">+ Добавить</button></form><p class="tiny">Начальные остатки вводятся один раз. Переводы между счетами не меняют суммарный капитал.</p>';
    }else if(tab==='wealth'){
      const collection=(key,title,placeholder)=>'<article class="card"><h3>'+title+'</h3>'+l[key].map(x=>'<div class="row wrap"><span>'+esc(x.name)+'</span><b>'+money(key==='assets'?x.value:x.balance)+'</b><button type="button" data-pf="remove:'+key+':'+esc(x.id)+'">×</button></div>').join('')+'<form class="pf-simple" data-pf-wealth="'+key+'"><input name="name" required maxlength="100" placeholder="'+placeholder+'"><input name="amount" required type="number" min="0" step="0.01" placeholder="Стоимость / остаток, ₽"><button class="primary">+ Добавить</button></form></article>';
      body='<div class="two">'+collection('assets','Прочие активы · '+money(assets-inventoryValue),'Например, автомобиль или оборудование')+collection('liabilities','Обязательства · '+money(debts),'Например, ипотека')+'</div><article class="card"><h3>Чистый капитал: '+money(liquid+assets-debts)+'</h3><p>Стоимость активов и остатки обязательств обновляются вручную. Получение займа и погашение тела долга не считаются заработком или потребительским расходом.</p></article>';
    }else if(tab==='categories'){
      body='<div class="two">'+['income','expense'].map(type=>'<article class="card"><h3>'+(type==='income'?'Категории доходов':'Категории расходов')+'</h3>'+l.categories[type].map(cat=>'<div class="row"><span>'+esc(cat)+'</span><button type="button" data-pf="removeCategory:'+type+':'+encodeURIComponent(cat)+'">×</button></div>').join('')+'<form class="pf-simple" data-pf-category="'+type+'"><input name="name" required maxlength="80" placeholder="Новая категория"><button class="primary">+ Добавить</button></form></article>').join('')+'</div>';
    }
    return '<div class="pf-root"><p class="tiny">ЛИЧНЫЕ ФИНАНСЫ / УЧЁТ ДЕНЕГ И КАПИТАЛА</p>'+period+tabs+(quick||editing?form(true):'')+body+'<p class="tiny">Личный журнал хранится отдельно от финансов проектов, но в общей резервной копии GPRO. Данные не дублируются автоматически.</p></div>';
  }
  function bind(state,save,rerender){
    const l=init(state),root=document.querySelector('.pf-root');if(!root)return;
    const refresh=()=>{save();rerender()};
    root.querySelectorAll('[data-pf]').forEach(el=>el.addEventListener('click',()=>{
      const action=el.dataset.pf;
      if(action==='prev'||action==='next'){const d=new Date(Number(selectedMonth.slice(0,4)),Number(selectedMonth.slice(5,7))-1+(action==='prev'?-1:1),1);selectedMonth=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0')].join('-')}
      else if(action==='current')selectedMonth=month();
      else if(action.startsWith('tab:')){tab=action.slice(4);quick=false;editing=null}
      else if(action==='quick'){quick=!quick;transferQuick=false;editing=null}
      else if(action==='transferQuick'){quick=true;transferQuick=true;editing=null}
      else if(action==='cancel'){quick=false;transferQuick=false;editing=null}
      else if(action.startsWith('edit:')){editing=action.slice(5);quick=true}
      else if(action.startsWith('delete:')){const id=action.slice(7),t=l.transactions.find(x=>x.id===id);if(!t||!confirm('Удалить операцию на '+money(t.amount)+'?'))return;l.transactions=l.transactions.filter(x=>x.id!==id)}
      else if(action.startsWith('removeInventory:')){const id=action.slice(16),x=l.inventory.find(v=>v.id===id);if(!x||x.soldAt||!confirm('Удалить покупку «'+x.name+'»?'))return;l.inventory=l.inventory.filter(v=>v.id!==id)}
      else if(action.startsWith('removeCategory:')){const [,type,encoded]=action.split(':'),cat=decodeURIComponent(encoded);if(l.transactions.some(t=>t.category===cat&&t.type===type)){alert('Категория используется в операциях. Сначала перенесите операции в другую категорию.');return}if(!confirm('Удалить категорию «'+cat+'»?'))return;l.categories[type]=l.categories[type].filter(x=>x!==cat)}
      else if(action.startsWith('remove:')){const [,key,id]=action.split(':');if(!['assets','liabilities'].includes(key)||!confirm('Удалить запись?'))return;l[key]=l[key].filter(x=>x.id!==id)}
      refresh();
    }));
    const m=root.querySelector('#pfMonth');if(m)m.onchange=()=>{if(/^\d{4}-\d{2}$/.test(m.value)){selectedMonth=m.value;rerender()}};
    root.querySelectorAll('[data-pf-limit]').forEach(el=>el.onchange=()=>{const n=Number(el.value);if(!Number.isFinite(n)||n<0)return;l.budgets[selectedMonth] ||= {};l.budgets[selectedMonth][el.dataset.pfLimit]=n;refresh()});
    root.querySelectorAll('[data-pf-opening]').forEach(el=>el.onchange=()=>{const a=l.accounts.find(x=>x.id===el.dataset.pfOpening),n=Number(el.value);if(a&&Number.isFinite(n)){a.opening=n;refresh()}});
    const entry=root.querySelector('#pfEntry');
    if(entry){
      const type=entry.querySelector('#pfType'),cat=entry.querySelector('#pfCategory'),categoryWrap=entry.querySelector('#pfCategoryWrap'),toWrap=entry.querySelector('#pfToWrap');
      const sync=()=>{const v=type.value,withCat=v==='income'||v==='expense',withTo=v==='transfer'||v==='saving';categoryWrap.hidden=!withCat;toWrap.hidden=!withTo;if(withCat){const options=l.categories[v];cat.innerHTML=opts(options.map(value=>({value,label:value})),cat.value)}};
      type.onchange=()=>{cat.value='';sync()};sync();
      entry.onsubmit=e=>{
        e.preventDefault();const data=new FormData(entry),type=data.get('type'),amount=Number(data.get('amount')),date=String(data.get('date')||''),account=String(data.get('account')||''),toAccount=String(data.get('toAccount')||''),category=String(data.get('category')||'');
        if(!kinds[type]||!Number.isFinite(amount)||amount<=0||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!l.accounts.some(a=>a.id===account)){alert('Проверьте тип, дату, сумму и счёт.');return}
        if((type==='transfer'||type==='saving')&&(!l.accounts.some(a=>a.id===toAccount)||toAccount===account)){alert('Для перевода выберите другой счёт.');return}
        if((type==='income'||type==='expense')&&!l.categories[type].includes(category)){alert('Выберите категорию.');return}
        const old=editing?l.transactions.find(t=>t.id===editing):null;
        const item={id:old?.id||uid(),createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),type,amount:Math.round(amount*100)/100,date,account,toAccount:type==='transfer'||type==='saving'?toAccount:'',category:type==='income'||type==='expense'?category:'',note:String(data.get('note')||'').trim().slice(0,250)};
        if(old)Object.assign(old,item);else l.transactions.push(item);
        editing=null;quick=false;transferQuick=false;selectedMonth=date.slice(0,7);tab='operations';refresh();
      };
    }
    const add=root.querySelector('#pfInventoryAdd');if(add)add.onsubmit=e=>{e.preventDefault();const d=new FormData(add),name=String(d.get('name')||'').trim(),boughtAt=String(d.get('boughtAt')||''),buyPrice=Number(d.get('buyPrice')),buyCosts=Number(d.get('buyCosts')),account=String(d.get('account')||'');if(!name||!/^\d{4}-\d{2}-\d{2}$/.test(boughtAt)||!(buyPrice>0)||!(buyCosts>=0)||!Number.isFinite(buyPrice+buyCosts)||!l.accounts.some(a=>a.id===account))return alert('Проверьте покупку');l.inventory.push({id:uid(),name,boughtAt,buyPrice,buyCosts,account,note:String(d.get('note')||''),soldAt:null,sellPrice:null,sellCosts:null});refresh()};
    root.querySelectorAll('[data-pf-sell]').forEach(form=>form.onsubmit=e=>{e.preventDefault();const x=l.inventory.find(v=>v.id===form.dataset.pfSell);if(!x||x.soldAt)return;const d=new FormData(form),soldAt=String(d.get('soldAt')||''),sellPrice=Number(d.get('sellPrice')),sellCosts=Number(d.get('sellCosts'));if(!/^\d{4}-\d{2}-\d{2}$/.test(soldAt)||soldAt<x.boughtAt||!(sellPrice>0)||!(sellCosts>=0)||!Number.isFinite(sellPrice+sellCosts))return alert('Проверьте продажу');if(!confirm('Продать «'+x.name+'»? Прибыль / убыток: '+money(sellPrice-cost(x)-sellCosts)))return;x.soldAt=soldAt;x.sellPrice=sellPrice;x.sellCosts=sellCosts;selectedMonth=soldAt.slice(0,7);refresh()});
    const accountForm=root.querySelector('#pfAccountForm');if(accountForm)accountForm.onsubmit=e=>{e.preventDefault();const name=accountForm.elements.name.value.trim();if(!name)return;l.accounts.push({id:uid(),name,opening:0});refresh()};
    root.querySelectorAll('[data-pf-wealth]').forEach(f=>f.onsubmit=e=>{e.preventDefault();const name=f.elements.name.value.trim(),amount=Number(f.elements.amount.value),key=f.dataset.pfWealth;if(!name||!Number.isFinite(amount)||amount<0)return;l[key].push({id:uid(),name,...(key==='assets'?{value:amount}:{balance:amount})});refresh()});
    root.querySelectorAll('[data-pf-category]').forEach(f=>f.onsubmit=e=>{e.preventDefault();const name=f.elements.name.value.trim(),type=f.dataset.pfCategory;if(!name||l.categories[type].includes(name))return;l.categories[type].push(name);refresh()});
  }
  window.gproPersonalFinance={init,render,bind,totals,balances};
})();
