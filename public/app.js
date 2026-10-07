const state={token:localStorage.getItem('chappiToken'),user:null,products:[],teams:[],workers:[],orders:[]};
const $=s=>document.querySelector(s);
function localDate(){const d=new Date();const pad=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function formatDateDMY(value,withTime=false){if(!value)return '';const d=new Date(value+'');if(Number.isNaN(d.getTime())){const m=String(value).match(/^(\\d{4})-(\\d{2})-(\\d{2})/);return m?m[3]+'.'+m[2]+'.'+m[1]:String(value)}const pad=n=>String(n).padStart(2,'0');const base=pad(d.getDate())+'.'+pad(d.getMonth()+1)+'.'+d.getFullYear();return withTime?base+' '+pad(d.getHours())+':'+pad(d.getMinutes()):base}
const money=n=>(Number(n||0)/100).toLocaleString('uk-UA',{minimumFractionDigits:2,maximumFractionDigits:2})+' грн';
async function api(url,options={}){const res=await fetch('/api'+url,{...options,headers:{'Content-Type':'application/json',...(state.token?{Authorization:'Bearer '+state.token}:{}),...(options.headers||{})}});const data=await res.json().catch(()=>({}));if(!res.ok){const err=new Error(data.error||'Ошибка запроса');err.status=res.status;err.code=data.code;Object.assign(err,data);throw err}return data}
function notify(msg,kind='notice'){$('#notice').innerHTML='<div class="'+kind+'">'+escapeHtml(msg)+'</div>';setTimeout(()=>$('#notice').replaceChildren(),5000)}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function roleName(r){return ({admin:'Администратор',brigadier:'Бригадир',worker:'Работник'})[r]||r}
function showTab(tab){document.querySelectorAll('.view').forEach(x=>x.hidden=x.id!==tab);document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));}
const tabsEl=$('#tabs');
if(tabsEl) tabsEl.addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b){showTab(b.dataset.tab);renderTab(b.dataset.tab).catch(err=>notify(err.message,'error'))}});
async function updateLoginProfile(profile){
  document.querySelectorAll('[data-login-profile]').forEach(x=>x.classList.toggle('active',x.dataset.loginProfile===profile));
  $('#loginForm [name=profile]').value=profile;
  $('#loginError').textContent='';
  const pinLabel=$('#pinLabel'), pinInput=$('#loginForm [name=pin]'), submit=$('#loginForm button[type=submit]');
  if(profile==='worker'){
    // Worker access may be open. Clear native required validation before the async status check
    // so a slow profile-status request cannot block the login button on an invisible PIN field.
    pinInput.required=false;
    pinInput.disabled=false;
    try{
      const status=await api('/auth/profile-status');
      const enabled=!!status.workerPinEnabled;
      pinLabel.hidden=!enabled;
      pinInput.required=enabled;
      pinInput.value='';
      submit.textContent='Войти';
      submit.classList.toggle('open-access',!enabled);
    }catch(err){
      pinLabel.hidden=false;
      pinInput.required=true;
      pinInput.value='';
      submit.textContent='Войти';
      submit.classList.remove('open-access');
    }
  }else{
    pinLabel.hidden=false;
    pinInput.required=true;
    pinInput.value='';
    submit.textContent='Войти';
    submit.classList.remove('open-access');
  }
}
document.addEventListener('submit',async e=>{
  const form=e.target;
  if(!form || form.id!=='loginForm') return;
  e.preventDefault();
  e.stopPropagation();
  const f=new FormData(form);
  const submit=form.querySelector('button[type="submit"]');
  const loginError=$('#loginError');
  if(submit) submit.disabled=true;
  if(loginError) loginError.textContent='';
  try{
    const d=await api('/auth/login',{method:'POST',body:JSON.stringify({profile:f.get('profile'),pin:f.get('pin')||''})});
    state.token=d.token;
    localStorage.setItem('chappiToken',d.token);
    await boot();
  }catch(err){
    if(loginError) loginError.textContent=err.message;
    const recovery=$('#adminRecoveryStart');
    if(recovery) recovery.hidden=!(f.get('profile')==='brigadier'&&err.adminRecoveryAvailable===true);
  }finally{
    if(submit) submit.disabled=false;
  }
},true);
document.querySelectorAll('[data-login-profile]').forEach(b=>b.addEventListener('click',()=>updateLoginProfile(b.dataset.loginProfile)));
updateLoginProfile('worker');
const recoveryStart=$('#adminRecoveryStart');
if(recoveryStart) recoveryStart.addEventListener('click',async()=>{
  recoveryStart.disabled=true;
  try{
    const d=await api('/auth/recovery/request',{method:'POST',body:'{}'});
    $('#recoveryError').textContent=d.message;
    $('#adminRecoveryForm').hidden=false;
  }catch(err){
    $('#recoveryError').textContent=err.message;
    $('#adminRecoveryForm').hidden=false;
  }finally{recoveryStart.disabled=false;}
});
const recoveryForm=$('#adminRecoveryForm');
if(recoveryForm) recoveryForm.addEventListener('submit',async e=>{
  e.preventDefault();
  const f=new FormData(e.currentTarget);
  try{
    const d=await api('/auth/recovery/complete',{method:'POST',body:JSON.stringify({code:f.get('code'),newPin:f.get('newPin')})});
    $('#recoveryError').textContent=d.message;
    recoveryForm.reset();
    recoveryForm.hidden=true;
    recoveryStart.hidden=true;
    $('#loginError').textContent='';
    $('#loginForm [name=pin]').value='';
  }catch(err){$('#recoveryError').textContent=err.message}
});
async function boot(){
  try{
    state.user=(await api('/me')).user;
  }catch(e){
    localStorage.removeItem('chappiToken');
    state.token=null;
    $('#loginView').hidden=false;
    $('#appView').hidden=true;
    $('#loginError').textContent=e.message||'Требуется вход в систему';
    return;
  }
  $('#loginView').hidden=true;
  $('#appView').hidden=false;
  $('#userBadge').textContent=roleName(state.user.role);
  $('#logoutGlobal').hidden=false;
  $('#logoutGlobal').onclick=()=>{localStorage.removeItem('chappiToken');state.token=null;location.reload()};
  document.querySelectorAll('[data-admin]').forEach(x=>x.hidden=state.user.role!=='admin');
  document.querySelectorAll('[data-producer]').forEach(x=>x.hidden=true);
  const stockTab=document.querySelector('[data-tab="stock"]');if(stockTab)stockTab.hidden=true;
  document.querySelectorAll('[data-admin-only]').forEach(x=>x.hidden=state.user.role!=='admin');
  document.querySelectorAll('[data-hide-admin]').forEach(x=>x.hidden=state.user.role==='admin');
  document.querySelectorAll('[data-hide-brigadier]').forEach(x=>x.hidden=state.user.role==='brigadier');
  document.querySelectorAll('[data-finance]').forEach(x=>x.hidden=!['admin','brigadier'].includes(state.user.role));
  try{
    await loadBase();
    showTab('home');
    await renderTab('home');
  }catch(e){
    console.error('Chappi boot data error',e);
    showTab('home');
    const notice=$('#notice');
    if(notice) notice.innerHTML='<div class="error">Не удалось загрузить данные приложения. Вход выполнен. Обновите страницу.</div>';
  }
}
async function loadBase(){[state.products,state.teams,state.workers,state.orders]=await Promise.all([api('/products'),api('/teams'),api('/workers'),api('/orders')])}
function formatMeters(v){const n=Number(v);if(!Number.isFinite(n))return '';return String(Number(n.toFixed(3)))}
function formatLength(v){const n=Number(v);if(!Number.isFinite(n))return '';const s=Number(n.toFixed(3)).toString().replace('.',',');return s+' '+(Math.abs(n-1)<1e-9?'метр':'метра')}
function normalizeLengthLabel(v){const s=String(v??'').trim();if(!s)return '';const m=s.match(/^([0-9]+(?:[.,][0-9]+)?)\s*(?:метр(?:а|ов)?|м)?$/i);if(m){const n=Number(String(m[1]).replace(',','.'));if(Number.isFinite(n)){const num=n.toFixed(3).replace(/0+$/,'').replace(/\.$/,'').replace('.',',');return num+' '+(Math.abs(n-1)<1e-9?'метр':'метра')}}return s.replace(/\s+/g,' ').trim()}
function productFeature(p){const raw=String(p?.length_label??'').trim();if(!raw)return '';const normalized=normalizeLengthLabel(raw);const meters=Number(p?.length_m);if(Number.isFinite(meters)&&normalized===formatLength(meters))return '';return raw.replace(/\s+/g,' ').trim()}function productLabel(p){const length=formatLength(p?.length_m);const feature=productFeature(p);return feature&&length?length+' · '+feature:(feature||length)}function formatProductLength(p){return escapeHtml(productLabel(p))}
function productOptions(){return state.products.filter(p=>p.active).map(p=>'<option value="'+p.id+'">'+formatProductLength(p)+' · '+p.section_width_mm+'×'+p.section_height_mm+'</option>').join('')}
function teamName(){return 'Коллектив'}
function singleTeamId(){return state.teams[0]?.id||''}
async function renderTab(tab){if(tab==='home')return home();if(tab==='production')return production();if(tab==='orders')return orders();if(tab==='stock')return stock();if(tab==='shipments')return shipments();if(tab==='people')return people();if(tab==='reports')return reports();if(tab==='archive')return archive();if(tab==='profile')return profile();if(tab==='products')return products();if(tab==='admin')return admin()}
function dailyProductionCard(report){
 const status=!report.exists?'missing':(report.dayOff?'day-off':(report.items?.length?'ready':'in-work'));
 const cls='daily-production-card '+status;
 if(status==='missing') return '<div class="'+cls+'"><h2>Произведено сегодня</h2><p class="daily-date">'+escapeHtml(formatDateDMY(report.workDate))+'</p><div class="daily-empty">⚠️<strong>Информации за текущий день ещё нет.</strong><span>Бригадир ещё не внёс данные.</span></div></div>';
 if(status==='day-off') return '<div class="'+cls+'"><h2>Произведено сегодня</h2><p class="daily-date">'+escapeHtml(formatDateDMY(report.workDate))+'</p><div class="daily-empty"><strong>ВЫХОДНОЙ ДЕНЬ</strong><span>Бригадир отметил выходной.</span></div></div>';
 const rows=(report.items||[]).map(x=>'<div class="daily-row"><span>'+formatProduct(x)+'</span><strong>'+Number(x.quantity||0)+' шт.</strong></div>').join('');
 const names=(report.workerIds||[]).map(id=>state.workers.find(w=>String(w.id)===String(id))?.display_name).filter(Boolean);
 return '<div class="'+cls+'"><h2>Произведено сегодня</h2><p class="daily-date">'+escapeHtml(formatDateDMY(report.workDate))+'</p>'+((report.items||[]).length?'<div class="daily-rows">'+rows+'</div>':'<div class="daily-empty"><strong>В РАБОТЕ</strong><span>Производства пока не было.</span></div>')+(names.length?'<div class="daily-workers"><span>Работали:</span> '+names.map(escapeHtml).join(', ')+'</div>':'')+'</div>';
}
async function home(){
 const d=await api('/dashboard');
 const isWorker=state.user.role==='worker';
 const isAdmin=state.user.role==='admin';
 let report=null;
 let daily='';
 if(isWorker||isAdmin){
   try{report=await api('/daily-reports?date='+localDate())}catch(e){report={exists:false,workDate:localDate()};}
   daily=dailyProductionCard(report);
 }
 if(isWorker){
   const monthRows=(d.month||[]).filter(x=>Number(x.quantity)>0);
   const monthTotal=monthRows.reduce((sum,x)=>sum+Number(x.quantity||0),0);
   const monthCard='<div class="card"><h2>Произведено за текущий месяц</h2>'+(monthRows.length
     ? simpleTable(monthRows.map(x=>({...x,size:(x.section_width_mm||'')+'×'+(x.section_height_mm||'')+' · '+(formatProductLength(x))})),[['size','Типоразмер'],['quantity','Количество']])+'<p><strong>Всего:</strong> '+monthTotal+' шт.</p>'
     : '<div class="empty">В этом месяце изделия ещё не произведены.</div>')+'</div>';
   $('#home').innerHTML='<h1>Сегодня</h1>'+daily+'<div class="card"><h2>Заказы и приоритеты</h2>'+orderCards(d.orders)+'</div>'+monthCard+'<div class="card"><h2>Склад</h2>'+((d.stock||[]).filter(x=>Number(x.quantity)>0).length?simpleTable((d.stock||[]).filter(x=>Number(x.quantity)>0).map(x=>({...x,size:(x.section_width_mm||'')+'×'+(x.section_height_mm||'')+' · '+(formatProductLength(x))})),[['size','Типоразмер'],['quantity','Количество']]):'<div class="empty">На складе пусто</div>')+'</div>';
   return;
 }
 const stock=(d.stock||[]).filter(x=>Number(x.quantity)>0);
 $('#home').innerHTML='<h1>Сегодня</h1>'+ (state.user.role==='admin'?daily:(state.user.role==='brigadier'?'<div id="dailyReportWindow"></div>':'')) +'<div class="card"><h2>Заказы и приоритеты</h2>'+orderCards(d.orders)+'</div><div class="card"><h2>Склад</h2>'+(stock.length?simpleTable(stock.map(x=>({...x,size:(x.section_width_mm||'')+'×'+(x.section_height_mm||'')+' · '+(formatProductLength(x))})),[['size','Типоразмер'],['quantity','Количество']]):'<div class="empty">На складе пусто</div>')+'</div>';
 if(state.user.role==='brigadier') await production('#dailyReportWindow');
}
async function orders(){
  state.orders=await api('/orders');
  const canManage=state.user.role==='admin';
  const visible=state.orders.filter(o=>o.status!=='archived');
  const productChoices=productOptions();
  $('#orders').innerHTML='<h1>Заказы</h1>'+
    (canManage?'<div class="card"><h2>Новый заказ</h2><form id="orderForm">'+
      ''+
      '<label>Название заказа<input name="title" required maxlength="160"></label>'+
      '<label>Приоритет<select name="priority"><option value="0">Без приоритета</option><option value="1">1 — первый</option><option value="2">2 — второй</option><option value="3">3 — третий</option><option value="4">4 — четвёртый</option><option value="5">5 — пятый</option></select></label>'+
      '<div><h3>Позиции заказа</h3><div id="orderItems"></div><button type="button" id="addOrderItem" class="secondary">+ Добавить типоразмер</button></div>'+
      '<button type="submit">Создать заказ</button></form></div>':'')+
    '<div class="card"><h2>Текущие заказы</h2>'+orderCards(visible,true)+'</div>';
    '';
  const form=$('#orderForm');
  if(form){
    const box=$('#orderItems');
    const addRow=(productId='',qty='')=>{
      const initial=state.products.find(p=>p.active&&String(p.id)===String(productId))||state.products.find(p=>p.active);
      if(!initial){notify('Нет доступных типоразмеров','error');return}
      const row=document.createElement('div');row.className='row orderItem';
      const diameters=[...new Map(state.products.filter(p=>p.active).map(p=>[p.section_width_mm+'×'+p.section_height_mm,{w:p.section_width_mm,h:p.section_height_mm}])).values()];
      row.innerHTML='<label>Диаметр<select name="section">'+diameters.map(d=>'<option value="'+d.w+'×'+d.h+'" '+(String(d.w+'×'+d.h)===String(initial.section_width_mm+'×'+initial.section_height_mm)?'selected':'')+'>'+d.w+'×'+d.h+'</option>').join('')+'</select></label>'+
        '<label>Длина<select name="length"></select></label>'+
        '<label>Количество<input name="requiredQty" type="number" min="1" step="1" inputmode="numeric" value="'+escapeHtml(qty||'')+'" required></label>'+
        '<button type="button" class="secondary">Убрать</button>';
      const section=row.querySelector('[name="section"]'), length=row.querySelector('[name="length"]');
      const syncLengths=()=>{
        const [w,h]=section.value.split('×');
        const used=[...box.querySelectorAll('.orderItem')].filter(x=>x!==row).map(x=>x.querySelector('[name="productId"]')?.value).filter(Boolean);
        const products=state.products.filter(p=>p.active&&String(p.section_width_mm)===w&&String(p.section_height_mm)===h);
        length.innerHTML=products.map(p=>'<option value="'+p.id+'">'+formatProductLength(p)+'</option>').join('');
        const match=products.find(p=>String(p.id)===String(productId));
        if(match)length.value=String(match.id);
        const hidden=row.querySelector('[name="productId"]')||document.createElement('input');
        hidden.type='hidden';hidden.name='productId';row.append(hidden);
        hidden.value=length.value;
      };
      length.addEventListener('change',()=>{row.querySelector('[name="productId"]').value=length.value});
      section.addEventListener('change',()=>{productId='';syncLengths()});
      row.querySelector('button').onclick=()=>row.remove();
      box.append(row);syncLengths();
    };
    $('#addOrderItem').onclick=()=>addRow();
    addRow();
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const d=new FormData(form);
      const items=[...box.querySelectorAll('.orderItem')].map(row=>({
        productId:row.querySelector('[name="productId"]').value,
        requiredQty:Number(row.querySelector('[name="requiredQty"]').value)
      })).filter(x=>x.requiredQty>0);
      if(!items.length){notify('Добавьте хотя бы одну позицию заказа','error');return}
      try{
        await api('/orders',{method:'POST',body:JSON.stringify({
          title:String(d.get('title')||'').trim(),
          priority:Number(d.get('priority')||0),
          items
        })});
        notify('Заказ создан','success');
        await loadBase();
        await orders();
      }catch(err){notify(err.message,'error')}
    });
  }
  document.querySelectorAll('.activateOrder').forEach(b=>b.onclick=async()=>{
    try{
      await api('/orders/'+b.dataset.id+'/activate',{method:'POST',body:JSON.stringify({})});
      notify('Заказ сделан активным','success');await loadBase();await orders();
    }catch(err){
      if(err.code==='ACTIVE_ORDER_UNFINISHED'){
        const r=confirm('Текущий активный заказ ещё не завершён. Сделать выбранный заказ активным?');
        if(!r)return;
        try{await api('/orders/'+b.dataset.id+'/activate',{method:'POST',body:JSON.stringify({force:true})});notify('Активный заказ переключён','success');await loadBase();await orders()}
        catch(e){notify(e.message,'error')}
      }else notify(err.message,'error')
    }
  });
  document.querySelectorAll('.priorityForm').forEach(f=>f.addEventListener('submit',async e=>{
    e.preventDefault();
    try{
      await api('/orders/'+f.dataset.id+'/priority',{method:'PATCH',body:JSON.stringify({priority:Number(f.elements.priority.value)})});
      notify('Приоритет сохранён','success');await loadBase();await orders();
    }catch(err){notify(err.message,'error')}
  }));
  document.querySelectorAll('.cancelOrder').forEach(b=>b.onclick=async()=>{
    try{
      await api('/orders/'+b.dataset.id+'/cancel',{method:'POST',body:'{}'});
      await api('/orders/'+b.dataset.id+'/archive',{method:'PATCH',body:'{}'});
      notify('Заказ удалён','success');
      await loadBase();
      await orders();
    }catch(err){notify(err.message,'error')}
  });
  document.querySelectorAll('.archiveOrder').forEach(b=>b.onclick=async()=>{
    if(!confirm('Перенести заказ в архив?'))return;
    try{await api('/orders/'+b.dataset.id+'/archive',{method:'PATCH',body:'{}'});notify('Заказ отправлен в архив','success');await loadBase();await orders()}
    catch(err){notify(err.message,'error')}
  });
}
function orderCards(rows,editable=false){
  if(!rows.length)return '<div class="empty">Активных заказов нет</div>';
  return rows.map((o,index)=>{
    const orderHighlight=o.status==='active'
      ? 'order-active'
      : (o.status==='queued' && !rows.slice(0,index).some(x=>x.status==='queued') ? 'order-next' : '');
    const items=(o.items||[]).map(i=>{
      const length=formatProductLength(i);
      const remaining=Number(i.remaining||0);
      const done=Number(i.done||0);
      return '<div class="order-item-row"><div class="order-size"><strong>'+((i.section_width_mm||'')+'×'+(i.section_height_mm||'')+' × '+length)+'</strong></div><div class="order-num"><span>Нужно</span><strong>'+Number(i.required||0)+'</strong></div><div class="order-num"><span>Сделано</span><strong>'+done+'</strong></div><div class="order-num"><span>Осталось</span><strong>'+(remaining>0?remaining:'✓')+'</strong></div></div>';
    }).join('');
    const activate=state.user.role==='admin'&&editable&&o.status==='queued'
      ? '<button type="button" class="activateOrder" data-id="'+o.id+'">Сделать активным</button>' : '';
    const priority=state.user.role==='admin'&&editable&&!['closed','archived'].includes(o.status)
      ? '<form class="priorityForm row" data-id="'+o.id+'"><label>Приоритет<select name="priority"><option value="0" '+(Number(o.priority)===0?'selected':'')+'>Без приоритета</option><option value="1" '+(Number(o.priority)===1?'selected':'')+'>1 — первый</option><option value="2" '+(Number(o.priority)===2?'selected':'')+'>2 — второй</option><option value="3" '+(Number(o.priority)===3?'selected':'')+'>3 — третий</option><option value="4" '+(Number(o.priority)===4?'selected':'')+'>4 — четвёртый</option><option value="5" '+(Number(o.priority)===5?'selected':'')+'>5 — пятый</option></select></label><button type="submit">Сохранить приоритет</button></form>' : '';
    const cancel=state.user.role==='admin'&&editable&&['queued','active'].includes(o.status)
      ? '<button type="button" class="cancelOrder" data-id="'+o.id+'">Удалить заказ</button>' : '';
    const archive=state.user.role==='admin'&&editable&&['completed','cancelled','closed'].includes(o.status)
      ? '<button type="button" class="archiveOrder" data-id="'+o.id+'">В архив</button>' : '';
    const status=o.status==='active'?'🟢 В РАБОТЕ':o.status==='queued'?(index===0?'🟡 СЛЕДУЮЩИЙ':''):o.status==='completed'?'✅ ВЫПОЛНЕН':o.status==='closed'?'🔒 ЗАКРЫТ':o.status==='cancelled'?'⛔ ОТМЕНЁН':o.status==='archived'?'📦 АРХИВ':escapeHtml(o.status);
    return '<div class="card '+orderHighlight+'"><div class="row"><div><strong>ЗАКАЗ: '+escapeHtml(o.title)+'</strong><br>'+(o.priority>0?'<span class="tag green">Приоритет '+o.priority+'</span>':'')+'</div><span>'+status+'</span></div><div class="order-table">'+items+'</div>'+activate+priority+cancel+archive+'</div>';
  }).join('');
}
function simpleTable(rows,cols){if(!rows.length)return '<div class="empty">Пока нет данных</div>';return '<div class="table-wrap"><table><thead><tr>'+cols.map(c=>'<th>'+c[1]+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+cols.map(c=>'<td>'+escapeHtml(r[c[0]])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'}
async function production(target='#production'){
 const targetEl=()=>$(target);
 if(state.user.role!=='brigadier'){targetEl().innerHTML='';return;}
 const date=localDate();
 const [report,orders,workers]=await Promise.all([
   api('/daily-reports?date='+date),
   api('/orders'),
   api('/team-members?date='+date)
 ]);
 const first=orders.find(o=>o.status==='active')||orders.find(o=>o.status==='queued');
 const defaultProducts=[];
 for(const item of (first?.items||[])){
   const p=state.products.find(x=>x.id===(item.productId||item.product_id));
   if(p&&!defaultProducts.some(x=>x.id===p.id))defaultProducts.push(p);
 }
 const existing=new Map((report.items||[]).map(x=>[String(x.product_id||x.productId),x]));
 const checked=new Set((report.workerIds||[]).map(String));
 const workerRows=workers.filter(w=>!w.is_brigadier&&w.active).map(w=>'<label class="daily-report-worker"><input type="checkbox" value="'+w.id+'" '+(checked.has(String(w.id))?'checked':'')+'><span>'+escapeHtml(w.display_name)+'</span></label>').join('');
 const defaultRows=defaultProducts.map(p=>{
   const ex=existing.get(String(p.id));
   return '<div class="daily-report-product"><span>'+formatProduct(p)+'</span><input data-product-id="'+p.id+'" type="number" min="0" step="1" inputmode="numeric" value="'+(ex?.quantity||'')+'" placeholder="Количество"></div>';
 }).join('');
 targetEl().innerHTML='<div class="card daily-report-window">'+
   '<div class="daily-report-head"><div><h2>Ежедневный отчёт</h2><p class="daily-report-date">'+escapeHtml(formatDateDMY(date))+'</p></div></div>'+
   '<div id="dailyReportWorkContent">'+
     '<div class="daily-report-section"><h3>Кто работал</h3><div class="daily-report-workers">'+(workerRows||'<div class="empty">Работники не добавлены.</div>')+'</div><label class="daily-report-worker daily-report-select-all"><input id="selectAllDailyWorkers" type="checkbox"><span>Выбрать всех</span></label></div>'+
     '<div class="daily-report-section"><h3>Произведено</h3>'+
       '<div id="dailyDefaultRows" class="daily-report-products">'+(defaultRows||'<div class="empty">Нет позиций активного заказа.</div>')+'</div>'+
       '<div id="dailyExtraRows" class="daily-report-products"></div>'+
       '<button type="button" id="addDailySize" class="secondary daily-add-size">+ Добавить типоразмер</button>'+
     '</div>'+
   '</div>'+
   '<div id="dailyReportSummary" class="daily-report-summary"></div>'+
   '<div class="daily-report-actions">'+
     '<button type="button" id="dailyDayOff" class="daily-dayoff">Выходной</button>'+
     '<button type="button" id="saveDailyReport" class="daily-save">Сохранить отчёт</button>'+
   '</div>'+
 '</div>';
 const workContent=$('#dailyReportWorkContent');
 const summary=$('#dailyReportSummary');
 const save=$('#saveDailyReport');
 const offBtn=$('#dailyDayOff');
 const extra=$('#dailyExtraRows');
 const addExtraRow=(selectedProductId='',quantity='')=>{
   const used=[...document.querySelectorAll('#dailyDefaultRows [data-product-id],#dailyExtraRows select')].map(x=>x.dataset?.productId||x.value);
   const available=state.products.filter(p=>p.active&&(!used.includes(String(p.id))||String(p.id)===String(selectedProductId)));
   if(!available.length){notify('Нет других доступных типоразмеров','error');return;}
   const row=document.createElement('div');row.className='daily-report-product daily-extra-row';
   row.innerHTML='<select aria-label="Типоразмер">'+available.map(p=>'<option value="'+p.id+'" '+(String(p.id)===String(selectedProductId)?'selected':'')+'>'+formatProduct(p)+'</option>').join('')+'</select><input type="number" min="0" step="1" inputmode="numeric" value="'+escapeHtml(quantity||'')+'" placeholder="Количество"><button type="button" class="secondary">Убрать</button>';
   row.querySelector('button').onclick=()=>row.remove();
   extra.append(row);
 };
 const setDayOff=async()=>{
   if(report.exists&&!report.dayOff)return;
   try{
     await api('/daily-reports',{method:'POST',body:JSON.stringify({workDate:date,items:[],workerIds:[],dayOff:true})});
     notify('День отмечен как выходной','success');
     await production(target);
   }catch(e){notify(e.message,'error')}
 };
 const showSummary=()=>{
   const dayOff=!!report.dayOff;
   const items=report.items||[];
   const names=(report.workerIds||[]).map(id=>workers.find(w=>String(w.id)===String(id))?.display_name).filter(Boolean);
   workContent.hidden=dayOff;
   offBtn.hidden=false;
   save.hidden=true;
   offBtn.disabled=true;
   summary.innerHTML=dayOff
     ? '<div><strong>ВЫХОДНОЙ ДЕНЬ</strong><span>Бригадир отметил выходной.</span></div>'
     : '<div><strong>Отчёт за день внесён</strong><span>'+(items.length?items.map(x=>escapeHtml(formatProduct(x))+' — '+Number(x.quantity||0)+' шт.').join('<br>'):'В РАБОТЕ — производства не было')+'</span>'+(names.length?'<span>Работали: '+names.map(escapeHtml).join(', ')+'</span>':'')+'</div>';
   const edit=document.createElement('button');edit.type='button';edit.className='secondary';edit.textContent='Изменить отчёт';
   summary.append(edit);
   edit.onclick=()=>{
     report.exists=false;
     workContent.hidden=false;
     offBtn.hidden=false;
     offBtn.disabled=false;
     save.hidden=false;
     summary.replaceChildren();
     document.querySelectorAll('#dailyDefaultRows input,#dailyExtraRows input,#dailyExtraRows select,.daily-report-workers input').forEach(x=>x.disabled=false);
   };
 };
 if(report.exists){
   const defaultIds=new Set(defaultProducts.map(p=>String(p.id)));
   for(const item of (report.items||[])){
     const pid=String(item.product_id||item.productId||'');
     if(pid&&!defaultIds.has(pid))addExtraRow(pid,item.quantity);
   }
   showSummary();
 }else{
   summary.replaceChildren();
   save.hidden=false;
 }
 const selectAll=$('#selectAllDailyWorkers');
 const workerCheckboxes=()=>[...document.querySelectorAll('.daily-report-workers input[type="checkbox"]')];
 const syncSelectAll=()=>{
   const boxes=workerCheckboxes();
   selectAll.checked=boxes.length>0&&boxes.every(x=>x.checked);
   selectAll.indeterminate=boxes.some(x=>x.checked)&&!selectAll.checked;
 };
 if(selectAll) selectAll.onchange=()=>workerCheckboxes().forEach(x=>x.checked=selectAll.checked);
 workerCheckboxes().forEach(x=>x.addEventListener('change',syncSelectAll));
 syncSelectAll();
 $('#addDailySize').onclick=()=>addExtraRow();
 offBtn.onclick=setDayOff;
 save.onclick=async()=>{
   const items=[];
   document.querySelectorAll('#dailyDefaultRows [data-product-id]').forEach(inp=>{const q=Number(inp.value||0);if(q>0)items.push({productId:inp.dataset.productId,quantity:q});});
   extra.querySelectorAll('.daily-extra-row').forEach(row=>{const q=Number(row.querySelector('input').value||0);if(q>0)items.push({productId:row.querySelector('select').value,quantity:q});});
   const workerIds=[...document.querySelectorAll('.daily-report-workers input[type=checkbox]:checked')].map(x=>x.value);
   if(!workerIds.length){notify('Отметьте работников, которые работали','error');return;}
   try{
     await api('/daily-reports',{method:'POST',body:JSON.stringify({workDate:date,items,workerIds})});
     notify('Отчёт сохранён','success');
     await production(target);
   }catch(e){notify(e.message,'error');}
 };
}

function formatProduct(p){return escapeHtml((p.section_width_mm||60)+'×'+(p.section_height_mm||40)+' '+(normalizeLengthLabel(p.length_label)||formatMeters(p.length_m)));}
async function stock(){const rows=await api('/stock');$('#stock').innerHTML='<h1>Склад</h1><div class="card"><p class="muted">Остатки рассчитываются по журналу движений. Производство, отгрузка и оплата — разные события.</p>'+simpleTable(rows.map(x=>({...x,size:(x.section_width_mm||'')+'×'+(x.section_height_mm||'')+' · '+productLabel(x)})),[['size','Типоразмер'],['quantity','Остаток']])+'</div>'}
async function shipments(){
 const rows=await api('/shipments');
 const canShip=state.user.role==='brigadier';
 const currentMonth=localDate().slice(0,7);
 const shippedTotals=new Map();
 for(const shipment of rows){
   const shippedMonth=String(shipment.shipped_at||'').slice(0,7);
   if(shippedMonth!==currentMonth) continue;
   for(const item of (shipment.items||[])){
     const productId=String(item.product_id||item.productId||'');
     if(!productId) continue;
     const current=shippedTotals.get(productId)||{productId,quantity:0,label:(item.section_width_mm||'')+'×'+(item.section_height_mm||'')+' · '+productLabel(item)};
     current.quantity+=Number(item.quantity||0);
     shippedTotals.set(productId,current);
   }
 }
 const shippedRows=[...shippedTotals.values()].sort((a,b)=>a.label.localeCompare(b.label,'uk'));
 const shippedTotal=shippedRows.reduce((sum,x)=>sum+Number(x.quantity||0),0);
 const shippedWindow=shippedRows.length
   ? '<div class="shipment-total-rows">'+shippedRows.map(x=>'<div class="shipment-total-row"><span>'+escapeHtml(x.label)+'</span><strong>'+Number(x.quantity||0)+' шт.</strong></div>').join('')+'</div><p><strong>Всего:</strong> '+shippedTotal+' шт.</p>'
   : '<div class="empty">В текущем месяце отправок ещё нет.</div>';
 const history=rows.map(x=>'<div class="shipment-history-entry"><h3>'+escapeHtml(x.items?.[0]?.order_number||'Со склада')+'</h3><p class="shipment-history-date">'+formatDateDMY(x.shipped_at)+'</p><div class="shipment-history-items">'+(x.items||[]).map(i=>'<div class="shipment-history-item"><span>'+(i.section_width_mm||'')+'×'+(i.section_height_mm||'')+' · '+productLabel(i)+'</span><strong>'+Number(i.quantity||0)+' шт.</strong></div>').join('')+'</div></div>').join('');
 $('#shipments').innerHTML='<h1>Отправки</h1>'+
   (canShip?'<div class="card"><h2>Новая отправка</h2><form id="shipmentForm"><div id="shipmentItems"><p class="muted">Загрузка доступной продукции…</p></div><button type="submit">Зафиксировать отправку</button></form></div>':'')+

   '<div class="card"><h2>Всего отправлено</h2><p class="muted">За текущий месяц · по сохранённым отгрузкам</p>'+shippedWindow+(canShip?'<div class="shipment-month-actions"><button id="closeMonthBtn" class="danger">Закрыть месяц</button><button id="reopenMonthBtn" class="secondary" hidden>Продолжить месяц</button></div>':'')+'</div>'+
   '<div class="card"><h2>История отправок</h2>'+(history||'<p class="empty">Отправок пока нет.</p>')+'</div>';
 const f=$('#shipmentForm');
 if(canShip){
   const monthState=await api('/month/state?month='+currentMonth);
   $('#closeMonthBtn').hidden=monthState.brigadierClosed||monthState.finalized;
   $('#reopenMonthBtn').hidden=!monthState.brigadierClosed||monthState.finalized;
   $('#closeMonthBtn').onclick=async()=>{if(!confirm('Закрыть текущий месяц? Новые отправки будут относиться к следующему месяцу.'))return;try{await api('/month/close',{method:'POST',body:JSON.stringify({month:currentMonth})});notify('Месяц закрыт для текущих отправок','success');await shipments()}catch(e){notify(e.message,'error')}};
   $('#reopenMonthBtn').onclick=async()=>{try{await api('/month/reopen',{method:'POST',body:JSON.stringify({month:currentMonth})});notify('Текущий месяц продолжен','success');await shipments()}catch(e){notify(e.message,'error')}};
 }
 if(f){
   const box=$('#shipmentItems');
   const loadOptions=async()=>{
     const opts=await api('/shipment-options');
     box.replaceChildren();
     const orderItems=(opts.orderItems||[]).filter(x=>Number(x.available)>0);
     const stockItems=(opts.stockItems||[]).filter(x=>Number(x.available)>0);
     if(!orderItems.length && !stockItems.length){box.innerHTML='<p class="empty">Нет продукции, доступной для отгрузки.</p>';return}
     if(orderItems.length){
       const section=document.createElement('div');section.className='shipment-source-section';
       section.innerHTML='<h3>Заказная продукция</h3><p class="muted">Количество объединено по всем готовым заказам. При сохранении система сама распределит отгрузку по очереди заказов.</p>';
       for(const x of orderItems){
         const row=document.createElement('div');row.className='row shipmentItem';row.dataset.source='orders';
         row.innerHTML='<label>Типоразмер<select name="productId"><option value="'+x.productId+'">'+escapeHtml(x.label)+'</option></select></label><label>Количество<input name="quantity" type="number" min="0" max="'+x.available+'" value="0" required></label><small>Доступно: '+x.available+' шт. · заказы распределятся автоматически</small>';
         section.append(row);
       }
       box.append(section);
     }
     if(stockItems.length){
       const warehouse=document.createElement('div');warehouse.className='shipment-source-section shipment-warehouse-section';
       warehouse.innerHTML='<h3>Дополнительно со склада</h3><p class="muted">Эти изделия не относятся к заказу и записываются в эту же отправку как складские.</p>';
       for(const x of stockItems){
         const row=document.createElement('div');row.className='row shipmentItem';row.dataset.source='warehouse';
         row.innerHTML='<label>Типоразмер<select name="productId"><option value="'+x.productId+'">'+escapeHtml(x.label)+'</option></select></label><label>Количество<input name="quantity" type="number" min="0" max="'+x.available+'" value="0" required></label><small>На складе: '+x.available+' шт.</small>';
         warehouse.append(row);
       }
       box.append(warehouse);
     }
   };
   await loadOptions();
   f.addEventListener('submit',async e=>{
     e.preventDefault();
     const items=[...box.querySelectorAll('.shipmentItem')].map(row=>({source:row.dataset.source,productId:row.querySelector('[name=productId]').value,quantity:Number(row.querySelector('[name=quantity]').value)})).filter(x=>x.quantity>0);
     if(!items.length){notify('Укажите, что реально погрузили в машину','error');return}
     try{
       await api('/shipments',{method:'POST',body:JSON.stringify({items})});
       notify('Отправка записана','success');await shipments();
     }catch(err){notify(err.message,'error')}
   });
 }
}

async function people(){
 state.workers=await api('/workers');
 const canManage=state.user.role==='admin';
 const activeWorkers=state.workers.filter(w=>w.active);
 const archivedWorkers=state.workers.filter(w=>!w.active);
 $('#people').innerHTML='<h1>Коллектив</h1>'+
 '<div class="card"><p class="muted">Администратор добавляет и убирает работников с коллектива.</p><div class="worker-list">'+
 activeWorkers.map(w=>'<div class="worker-list-row"><span><strong>'+escapeHtml(w.display_name)+'</strong>'+(w.is_brigadier?' <span class="worker-role-status">· Бригадир</span>':'')+'</span>'+(canManage?'<div class="worker-actions"><button type="button" class="worker-menu" data-id="'+w.id+'" aria-label="Действия">⋮</button><div class="worker-context-menu" data-menu-id="'+w.id+'" hidden>'+
 (w.is_brigadier?'<button type="button" class="worker-action" data-action="remove-brigadier" data-id="'+w.id+'">Снять с должности бригадира</button>':'<button type="button" class="worker-action" data-action="make-brigadier" data-id="'+w.id+'">Назначить бригадиром</button>')+
 '<button type="button" class="worker-action worker-dismiss" data-action="archive" data-id="'+w.id+'">Уволить</button>'+
 '</div></div>':'')+'</div>').join('')+
 (activeWorkers.length?'':'<p class="empty">В коллективе пока нет работников.</p>')+
 '</div></div>'+
 (canManage?'<div class="card"><h2>Добавить работника</h2><form id="workerForm"><label>Имя / фамилия<input name="displayName" required></label><button>Добавить в коллектив</button></form></div>':'')+
 (canManage?'<div class="card"><h2>Архив работников</h2><div class="worker-list">'+archivedWorkers.map(w=>'<div class="worker-list-row"><span>'+escapeHtml(w.display_name)+'</span></div>').join('')+(archivedWorkers.length?'':'<p class="empty">Архив пуст.</p>')+'</div></div>':'');
 document.querySelectorAll('.worker-menu').forEach(b=>b.onclick=e=>{
   e.stopPropagation();
   const menu=document.querySelector('[data-menu-id="'+b.dataset.id+'"]');
   document.querySelectorAll('.worker-context-menu').forEach(x=>{if(x!==menu)x.hidden=true});
   if(menu)menu.hidden=!menu.hidden;
 });
 document.querySelectorAll('.worker-action').forEach(b=>b.onclick=async e=>{
   e.stopPropagation();
   const id=b.dataset.id, action=b.dataset.action;
   const worker=state.workers.find(w=>String(w.id)===String(id));
   if(!worker)return;
   document.querySelectorAll('.worker-context-menu').forEach(x=>x.hidden=true);
   try{
     if(action==='make-brigadier'){
       await api('/workers/'+id+'/brigadier',{method:'PATCH',body:'{}'});
       notify(worker.display_name+' назначен бригадиром','success');
     }else if(action==='remove-brigadier'){
       await api('/workers/'+id+'/brigadier',{method:'DELETE'});
       notify('С '+worker.display_name+' снята должность бригадира','success');
     }else if(action==='archive'){
       if(!confirm('Уволить '+worker.display_name+'? Старые отчёты и история сохранятся.'))return;
       await api('/workers/'+id+'/archive',{method:'PATCH',body:'{}'});
       notify('Работник уволен','success');
     }
     await people();
   }catch(e){notify(e.message,'error')}
 });
 document.addEventListener('click',()=>document.querySelectorAll('.worker-context-menu').forEach(x=>x.hidden=true),{once:true});
 const wf=$('#workerForm');
 if(wf)wf.addEventListener('submit',async e=>{e.preventDefault();try{await api('/workers',{method:'POST',body:JSON.stringify({displayName:new FormData(wf).get('displayName')})});notify('Работник добавлен в коллектив');people()}catch(err){notify(err.message,'error')}});
}async function reports(){
 const month=localDate().slice(0,7);
 $('#reports').innerHTML='<h1>Месячный отчёт и закрытие</h1><div class="card"><form id="reportForm"><label>Месяц<input type="month" name="month" value="'+month+'" required></label><button>Показать</button></form><div id="reportResult"></div></div>';
 const form=$('#reportForm');
 const load=async()=>{
   const m=new FormData(form).get('month'); const r=await api('/reports/monthly?month='+encodeURIComponent(m));
   const missing=r.missingRates||[];
   const rows=r.items.map(x=>({...x,size:((x.section_width_mm||'')+'×'+(x.section_height_mm||'')+' · '+productLabel(x)),rate:x.rate_minor===null?'—':money(x.rate_minor),total:x.total_minor===null?'—':money(x.total_minor)}));
   const financeVisible=state.user.role!=='worker';
   let html='<h2>Отгружено и подлежит оплате за '+escapeHtml(m)+'</h2>';
   html+=financeVisible
     ? simpleTable(rows,[['size','Типоразмер'],['quantity','Количество'],['rate','Расценка'],['total','Стоимость']])
     : simpleTable(rows,[['size','Типоразмер'],['quantity','Количество']]);
   html+=financeVisible
     ? '<p><strong>Всего:</strong> '+r.total.quantity+' шт. · '+money(r.total.totalMinor)+'</p>'
     : '<p><strong>Всего:</strong> '+r.total.quantity+' шт.</p>';
   if(state.user.role==='admin' && !r.closed){
     const rateItems=r.items.filter(x=>x.rate_minor===null);
     if(rateItems.length){
       html+='<div class="card monthly-rates-card"><h2>Расценки для закрытия месяца</h2><p class="muted">Введите расценку по каждому типоразмеру, для которого она ещё не задана.</p><div id="monthlyRates">';
       html+=rateItems.map(x=>'<div class="card"><strong>'+escapeHtml((x.section_width_mm||'')+'×'+(x.section_height_mm||'')+' · '+(normalizeLengthLabel(x.length_label)||formatLength(x.length_m)))+'</strong><label>Расценка<input class="monthlyRateInput" data-product-id="'+x.product_id+'" type="number" min="0" step="0.01" inputmode="decimal" placeholder="грн/шт"></label><button type="button" class="saveMonthlyRate" data-product-id="'+x.product_id+'">Сохранить расценку</button></div>').join('');
       html+='</div></div>';
     }
   }
   if(missing.length) html+='<p class="error"><strong>Для закрытия не хватает расценок:</strong> '+missing.map(x=>((x.section_width_mm||'')+'×'+(x.section_height_mm||'')+' · '+(normalizeLengthLabel(x.length_label)||formatLength(x.length_m)))).join(', ')+'</p>';
   if(state.user.role==='admin' && !r.closed){
     const ready=!missing.length && r.brigadierClosed && !r.reopened;
     if(r.brigadierClosed && !r.reopened) html+='<p class="success"><strong>Бригадир закрыл месяц.</strong> Все дальнейшие действия готовы к финальному закрытию после ввода всех расценок.</p>';
     else html+='<p class="muted">Месяц ещё не закрыт бригадиром. После его закрытия здесь появится возможность окончательно зафиксировать месяц.</p>';
     const statusClass=ready?'close-month-ready':'close-month-not-ready';
     html+='<button id="closeMonth" class="'+statusClass+'">Закрыть месяц</button>';
   }
   if(r.closed) html+='<p class="success"><strong>Месяц закрыт и зафиксирован.</strong>'+(r.happyKopeck?.winnerId?' '+escapeHtml(r.happyKopeck.badge||'Счастливая копейка от Чаппи 🪙🏆')+' уже разыграна и сохранена.':'')+'</p>';
   if(r.earnings&&r.earnings.length) html+='<h2>Начисления работников</h2>'+simpleTable(r.earnings.map(x=>({...x,amount:money(x.amount_minor)})),[['display_name','Работник'],['work_days','Дней'],['amount','Начислено']]);
   if(state.user.role==='admin' && !r.closed){
     const pending=BigInt(r.happyKopeck?.residualMinor||'0')>0n;
     html+='<p class="muted">Остаток копеек распределяется автоматически случайным выбором среди работников, реально работавших в оплаченных производственных днях.'+(pending?' Сейчас накоплено '+money(r.happyKopeck.residualMinor)+'.':'')+'</p>';
   }
   $('#reportResult').innerHTML=html;
   document.querySelectorAll('.saveMonthlyRate').forEach(b=>b.onclick=async()=>{
     const input=document.querySelector('.monthlyRateInput[data-product-id="'+b.dataset.productId+'"]');
     const value=input?.value;
     if(value===''||Number(value)<0){notify('Введите расценку','error');return}
     try{await api('/rates',{method:'POST',body:JSON.stringify({productId:b.dataset.productId,periodMonth:m+'-01',amountMinor:Math.round(Number(value)*100)})});notify('Расценка сохранена','success');await load()}catch(e){notify(e.message,'error')}
   });
   const b=$('#closeMonth');
   if(b)b.onclick=async()=>{
     const currentMissing=r.missingRates||[];
     if(currentMissing.length){
       const list=currentMissing.map(x=>((x.section_width_mm||'')+'×'+(x.section_height_mm||'')+' · '+(normalizeLengthLabel(x.length_label)||formatLength(x.length_m)))).join('<br>');
       $('#notice').innerHTML='<div class="ios-info-panel"><strong>Не все расценки введены</strong><p>Для закрытия месяца сначала укажите расценку для каждого типоразмера.</p><p>'+list+'</p></div>';
       return;
     }
     if(!r.brigadierClosed || r.reopened){
       $('#notice').innerHTML='<div class="ios-info-panel"><strong>Месяц ещё не готов к закрытию</strong><p>Сначала бригадир должен закрыть месяц. После этого администратор сможет окончательно зафиксировать расчёт.</p></div>';
       return;
     }
     if(!confirm('Закрыть месяц '+m+'? Система сначала рассчитает каждый рабочий день по введённым расценкам и разделит стоимость дня между работавшими в этот день. После закрытия месяц фиксируется.'))return;
     try{await api('/reports/close-month',{method:'POST',body:JSON.stringify({month:m})});notify('Месяц закрыт. Начисления работников зафиксированы.','success');await load()}catch(e){notify(e.message,'error')}
   };
 };
 form.addEventListener('submit',e=>{e.preventDefault();load().catch(err=>notify(err.message,'error'))});
 await load();
}
async function products(){
 const canEdit=state.user.role==='admin';
 if(!canEdit){$('#products').innerHTML='<h1>Типоразмеры</h1><div class="card"><p class="muted">Раздел доступен только администратору.</p></div>';return;}
 const groups=[...new Map(state.products.map(p=>[String(p.section_width_mm)+'×'+String(p.section_height_mm),{w:p.section_width_mm,h:p.section_height_mm}])).values()]
   .sort((a,b)=>(Number(a.w)*1000+Number(a.h))-(Number(b.w)*1000+Number(b.h)));
 const sectionCards=groups.map(g=>{
   const rows=state.products.filter(p=>String(p.section_width_mm)===String(g.w)&&String(p.section_height_mm)===String(g.h))
     .sort((a,b)=>Number(a.length_m)-Number(b.length_m));
   return '<div class="product-section-card"><div class="product-section-title"><h2>'+g.w+'×'+g.h+'</h2><span class="muted">'+rows.length+' типоразмер'+(rows.length===1?'':'а')+'</span></div><div class="product-table-wrap"><table class="product-table"><thead><tr><th>Длина</th><th>Состояние</th><th></th></tr></thead><tbody>'+
     rows.map(p=>'<tr><td><strong>'+formatProductLength(p)+'</strong></td><td><span class="'+(p.active?'product-status-active':'product-status-archived')+'">'+(p.active?'Активен':'Архив')+'</span></td><td class="product-delete-cell">'+(p.active?'<button type="button" class="product-delete" data-id="'+p.id+'"><span class="product-trash" aria-hidden="true">🗑</span><span>Удалить</span></button>':'<button type="button" class="product-restore" data-id="'+p.id+'">Вернуть</button>')+'</td></tr>').join('')+
     '</tbody></table></div></div>';
 }).join('');
 $('#products').innerHTML='<h1>Типоразмеры</h1><div class="card product-directory"><h2>Справочник типоразмеров</h2><p class="muted">Типоразмеры сгруппированы по сечению.</p>'+sectionCards+'</div><div class="card"><h2>Добавить типоразмер</h2><form id="productForm"><div class="product-add-row"><label>Сечение<select name="section"><option value="60×40">60 × 40 мм</option><option value="60×60">60 × 60 мм</option><option value="60×80">60 × 80 мм</option></select></label><label>Длина<input name="lengthM" type="number" min="0.001" step="0.001" required placeholder="2,5"></label></div><label>Особенность<input name="lengthLabel" required placeholder="Например 4 клипсы"></label><button>Добавить</button></form></div>';
 const pf=$('#productForm');if(pf)pf.addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(pf));const [w,h]=String(d.section||'').split('×');d.sectionWidthMm=w;d.sectionHeightMm=h;delete d.section;try{await api('/products',{method:'POST',body:JSON.stringify(d)});notify('Типоразмер добавлен');await loadBase();products()}catch(err){notify(err.message,'error')}});
 document.querySelectorAll('.product-delete').forEach(b=>b.onclick=async()=>{if(!confirm('Удалить типоразмер? История останется доступной.'))return;try{await api('/products/'+b.dataset.id+'/archive',{method:'PATCH',body:JSON.stringify({})});notify('Типоразмер удалён','success');await loadBase();products()}catch(err){notify(err.message,'error')}}); document.querySelectorAll('.product-restore').forEach(b=>b.onclick=async()=>{if(!confirm('Вернуть типоразмер в производство?'))return;try{await api('/products/'+b.dataset.id+'/restore',{method:'PATCH',body:JSON.stringify({})});notify('Типоразмер возвращён в производство','success');await loadBase();products()}catch(err){notify(err.message,'error')}})
}
async function archive(){
 const rows=await api('/archive/months');
 $('#archive').innerHTML='<h1>Архив месяцев</h1><div class="card"><p class="muted">Показываются закрытые месяцы за последние шесть месяцев. Закрытые итоги хранятся отдельным снимком.</p>'+rows.map(x=>{
   const pay=x.totals?.earnings||[];
   return '<div class="card"><strong>'+escapeHtml(String(x.period_month).slice(0,7))+'</strong><p>Закрыт: '+formatDateDMY(x.closed_at,true)+'</p><p>Количество: '+(x.totals.total?.quantity??'—')+' · Сумма: '+(x.totals.total?.totalMinor?money(x.totals.total.totalMinor):'—')+'</p>'+
     (pay.length?'<h3>Выплаты работникам</h3>'+simpleTable(pay.map(p=>({display_name:p.displayName,amount:money(p.amountMinor)})),[['display_name','Работник'],['amount','Выплата']]):'')+
     '</div>';
 }).join('')+'</div>'
}
async function profile(){
 $('#profile').innerHTML='<h1>Профиль</h1><div class="card"><h2>Доступ к профилю</h2><p class="muted">Пароль и PIN самостоятельно изменить нельзя.</p><p>Изменение PIN и других параметров доступа выполняет только администратор.</p></div>';
}
async function admin(){
 await api('/admin/mode-event',{method:'POST',body:JSON.stringify({})});
 const [rows,audit]=await Promise.all([api('/admin/login-log'),api('/admin/audit-log')]);
 const access=await api('/admin/access');
 const accessCards=access.map(x=>'<div class="card"><h3>'+roleName(x.role)+'</h3><p>PIN: <strong>'+escapeHtml(x.pin||'не установлен')+'</strong></p><p>Неверных попыток: '+x.failedAttempts+(x.locked?' · <span class="error">Заблокирован</span>':'')+'</p><form class="pinForm" data-role="'+x.role+'"><label>Новый PIN (4–8 цифр)<input name="pin" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" required></label><button>Сохранить PIN</button>'+(x.locked?'<button type="button" class="unlockPin" data-role="'+x.role+'">Разблокировать</button>':'')+'</form></div>').join('');
 $('#admin').innerHTML='<h1>Администрирование</h1><div class="card admin-access"><h2>Доступ и PIN</h2>'+accessCards+'</div><div class="admin-columns"><div class="card admin-section"><h2>Резервная копия</h2><div class="admin-backup-actions"><div><h3>Резервный экспорт</h3><p>Рабочие данные и история без паролей.</p><button id="exportBackup">Скачать резервную копию</button></div><div><h3>Восстановление</h3><p class="muted">Сначала выполняется безопасная проверка без изменений.</p><form id="restoreForm"><label>Файл резервной копии<input id="restoreFile" type="file" accept=".json,application/json" required></label><button type="submit">Проверить резервную копию</button></form><pre id="restorePlan" class="muted"></pre></div></div></div><div class="card admin-section"><h2>Журналы</h2><div class="admin-log"><details><summary>Журнал входов <span class="muted">('+rows.length+')</span></summary>'+simpleTable(rows,[['username_attempt','Логин'],['success','Успешно'],['created_at','Дата']])+'</details><details><summary>Журнал изменений <span class="muted">('+audit.length+')</span></summary>'+simpleTable(audit,[['username','Кто'],['action','Действие'],['entity_type','Раздел'],['created_at','Дата']])+'</details></div></div><div class="card admin-system"><span>PIN и журналы доступны только администратору.</span><button id="logout">Выйти</button></div>';
 $('#logout').onclick=()=>{localStorage.removeItem('chappiToken');state.token=null;location.reload()};
 document.querySelectorAll('.pinForm').forEach(form=>form.addEventListener('submit',async e=>{e.preventDefault();const role=form.dataset.role,pin=new FormData(form).get('pin');try{await api('/admin/access/'+role,{method:'PATCH',body:JSON.stringify({pin})});notify('PIN изменён','success');await admin()}catch(err){notify(err.message,'error')}}));
 document.querySelectorAll('.unlockPin').forEach(b=>b.onclick=async()=>{try{await api('/admin/access/'+b.dataset.role+'/unlock',{method:'POST',body:JSON.stringify({})});notify('Профиль разблокирован','success');await admin()}catch(err){notify(err.message,'error')}});
 $('#exportBackup').onclick=async()=>{try{const response=await fetch('/api/admin/export',{headers:{Authorization:'Bearer '+state.token}});if(!response.ok)throw new Error('Не удалось подготовить резервную копию');const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='chappi-backup.json';a.click();URL.revokeObjectURL(url);notify('Резервная копия подготовлена','success')}catch(e){notify(e.message,'error')}};
 const restoreForm=$('#restoreForm'); if(restoreForm) restoreForm.addEventListener('submit',async e=>{e.preventDefault();const file=$('#restoreFile').files[0];if(!file)return;try{const backup=JSON.parse(await file.text());const plan=await api('/admin/restore/dry-run',{method:'POST',body:JSON.stringify(backup)});$('#restorePlan').textContent=JSON.stringify(plan,null,2);if(!plan.safeToRestore){notify('Восстановление заблокировано проверкой.','error');return}if(!confirm('ВНИМАНИЕ: текущие рабочие данные будут заменены данными резервной копии. Логины и пароли сохранятся. Продолжить?'))return;const result=await api('/admin/restore',{method:'POST',body:JSON.stringify({confirm:'RESTORE BUSINESS DATA',backup})});$('#restorePlan').textContent=JSON.stringify(result,null,2);notify('Резервная копия восстановлена.','success')}catch(err){notify(err.message,'error')}})
}
boot();
// Chappi: статус бригадира отображается рядом с фамилией.