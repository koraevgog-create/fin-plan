// GPRO Command Center: load the current dashboard module without stale browser cache.
// Production deployment is managed by the allowlisted FTPS workflow.
const BUILD = '20261024-10';
try {
  if (location.hostname.endsWith('.beget.tech') && window.gproServerSync) {
    await window.gproServerSync.start();
  }
  // Approved one-time October 19–23 import. Persisted through the normal revision-aware server sync.
  // Inventory captures gross purchases/sales; personal income records realized margin only.
  function importApprovedOctober() {
    const key='gpro-command-center',raw=localStorage.getItem(key);
    if(!raw)return;
    const state=JSON.parse(raw),l=state.personalLedger;
    if(!l||!Array.isArray(state.projects))return;
    l.transactions ||= [];l.inventory ||= [];
    const account=l.accounts?.find(a=>a.name==='Основная карта');
    if(!account)return;
    const existing=new Set(l.transactions.map(t=>t.id));
    const inventoryIds=new Set(l.inventory.map(t=>t.id));
    const rows=[["19",150,"Транспорт","Каршеринг"],["19",140,"Транспорт","Каршеринг"],["19",477,"Продукты","Пятёрочка"],["19",1500,"Продукты","Продукты"],["19",2720,"Дети и семья","Материалы для игрушек, Мегастрой"],["20",500,"Транспорт","Поездка в Елабугу"],["20",500,"Продукты","Продукты"],["20",250,"Транспорт","Каршеринг"],["21",300,"Транспорт","Каршеринг"],["21",3000,"Продукты","Продукты"],["21",1500,"Дети и семья","Продукты детям"],["22",1300,"Продукты","Продукты"],["22",190,"Продукты","Продукты"],["22",360,"Транспорт","Каршеринг"],["22",1000,"Личные расходы","Личные расходы"],["22",1800,"Продукты","Продукты"]];
    let changed=false;
    const addTx=(id,date,type,amount,category,note)=>{
      if(existing.has(id))return;
      l.transactions.push({id,date,type,amount,category,note,account:account.id,toAccount:'',createdAt:date+'T12:00:00.000Z',updatedAt:new Date().toISOString()});
      existing.add(id);changed=true;
    };
    rows.forEach(([day,amount,category,note],i)=>addTx('gpro-oct26-personal-'+String(i+1).padStart(2,'0'),'2026-10-'+day,'expense',amount,category,note));
    const goods=[
      {id:'gpro-oct26-printer-1',name:'Принтер №1',boughtAt:'2026-10-21',buyPrice:20500,buyCosts:750,soldAt:'2026-10-21',sellPrice:30500,sellCosts:1500},
      {id:'gpro-oct26-printer-2',name:'Принтер №2',boughtAt:'2026-10-21',buyPrice:16500,buyCosts:750,soldAt:'2026-10-21',sellPrice:20000,sellCosts:1500}
    ];
    for(const x of goods)if(!inventoryIds.has(x.id)){l.inventory.push({...x,account:account.id,note:'Перепродажа DNS · распределены расходы на получение 1 500 ₽ поровну'});changed=true;}
    addTx('gpro-oct26-jbl-net','2026-10-23','income',14700,'Аренда колонок','Чистый результат аренды JBL: 15 600 ₽ выручка минус 900 ₽ расходы');
    const histories={
      'Перепродажа':[
        ['printer1buy','expense',20500,'Закупка','Принтер №1'],['printer2buy','expense',16500,'Закупка','Принтер №2'],
        ['printer1sale','income',30500,'Продажа','Принтер №1'],['printer2sale','income',20000,'Продажа','Принтер №2'],
        ['pickup','expense',1500,'Логистика','Получение двух принтеров'],['delivery1','expense',1500,'Логистика','Доставка принтера №1'],['delivery2','expense',1500,'Логистика','Доставка принтера №2']],
      'JBL / Event':[
        ['rental520','income',7600,'Аренда','PartyBox 520, 2 суток и 2 микрофона'],['rental320','income',4000,'Аренда','PartyBox 320, 2 суток'],['rental310','income',4000,'Аренда','PartyBox 310, 2 суток'],
        ['batteries','expense',500,'Расходы','Батарейки'],['delivery','expense',400,'Расходы','Доставка']]
    };
    for(const [name,rows] of Object.entries(histories)){
      const p=state.projects.find(x=>x.name===name);if(!p)continue;
      p.financialHistory ||= [];
      const ids=new Set(p.financialHistory.map(x=>x.id));
      for(const [suffix,type,amount,category,note] of rows){
        const id='gpro-oct26-'+suffix;
        if(ids.has(id))continue;
        p.financialHistory.push({id,date:name==='Перепродажа'?'2026-10-21':'2026-10-23',type,amount,category,note});
        if(type==='income')p.revenue=(Number(p.revenue)||0)+amount;else p.cost=(Number(p.cost)||0)+amount;
        changed=true;
      }
    }
    if(changed){state.gproOctoberImportVersion=1;localStorage.setItem(key,JSON.stringify(state));}
  }
  importApprovedOctober();
  await import('./personal-finance.js?v=' + BUILD);
  await import('./portfolio.js?v=' + BUILD);
} catch (error) {
  console.error('GPRO dashboard startup failed', error);
  const app = document.getElementById('app');
  if (app) { const card=document.createElement('article');card.className='card';const h=document.createElement('h2');h.textContent='Ошибка загрузки планировщика';const p=document.createElement('p');p.textContent=String(error?.message||error);card.append(h,p);app.replaceChildren(card); }
}
