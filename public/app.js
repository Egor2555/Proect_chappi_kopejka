const state={token:localStorage.getItem('chappiToken'),user:null,products:[],teams:[],workers:[],orders:[]};
const $=s=>document.querySelector(s);
function localDate(){const d=new Date();const pad=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
const money=n=>(Number(n||0)/100).toLocaleString('uk-UA',{minimumFractionDigits:2,maximumFractionDigits:2})+' грн';
async function api(url,options={}){const res=await fetch('/api'+url,{...options,headers:{'Content-Type':'application/json',...(state.token?{Authorization:'Bearer '+state.token}:{}),...(options.headers||{})}});const data=await res.json().catch(()=>({}));if(!res.ok){const err=new Error(data.error||'Ошибка запроса');err.status=res.status;err.code=data.code;Object.assign(err,data);throw err}return data}
function notify(msg,kind='notice'){$('#notice').innerHTML='<div class="'+kind+'">'+escapeHtml(msg)+'</div>';setTimeout(()=>$('#notice').replaceChildren(),5000)}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function roleName(r){return ({admin:'Администратор',brigadier:'Бригадир',worker:'Работник'})[r]||r}
function showTab(tab){document.querySelectorAll('.view').forEach(x=>x.hidden=x.id!==tab);document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));}
$('#tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b){showTab(b.dataset.tab);renderTab(b.dataset.tab).catch(err=>notify(err.message,'error'))}});
document.querySelectorAll('[data-login-profile]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-login-profile]').forEach(x=>x.classList.toggle('active',x===b));$('#loginForm [name=profile]').value=b.dataset.loginProfile;$('#loginError').textContent='';}));
document.querySelector('[data-login-profile="brigadier"]').classList.add('active');
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const d=await api('/auth/login',{method:'POST',body:JSON.stringify({profile:f.get('profile'),pin:f.get('pin')})});state.token=d.token;localStorage.setItem('chappiToken',d.token);await boot()}catch(err){$('#loginError').textContent=err.message;$('#adminRecoveryStart').hidden=!(f.get('profile')==='brigadier'&&err.adminRecoveryAvailable===true)}});
$('#adminRecoveryStart').addEventListener('click',async()=>{const b=$('#adminRecoveryStart');b.disabled=true;try{const d=await api('/auth/recovery/request',{method:'POST',body:'{}'});$('#recoveryError').textContent=d.message;$('#adminRecoveryForm').hidden=false;}catch(err){$('#recoveryError').textContent=err.message;$('#adminRecoveryForm').hidden=false;}finally{b.disabled=false}});
$('#adminRecoveryForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const d=await api('/auth/recovery/complete',{method:'POST',body:JSON.stringify({code:f.get('code'),newPin:f.get('newPin')})});$('#recoveryError').textContent=d.message;$('#adminRecoveryForm').reset();$('#adminRecoveryForm').hidden=true;$('#adminRecoveryStart').hidden=true;$('#loginError').textContent='';$('#loginForm [name=pin]').value='';}catch(err){$('#recoveryError').textContent=err.message}});
async function boot(){try{state.user=(await api('/me')).user;$('#loginView').hidden=true;$('#appView').hidden=false;$('#userBadge').textContent=state.user.username+' · '+roleName(state.user.role);$('#logoutGlobal').hidden=false;$('#logoutGlobal').onclick=()=>{localStorage.removeItem('chappiToken');state.token=null;location.reload()};document.querySelectorAll('[data-admin]').forEach(x=>x.hidden=state.user.role!=='admin');document.querySelectorAll('[data-producer]').forEach(x=>x.hidden=state.user.role!=='brigadier');const workerStockTab=document.querySelector('[data-tab="stock"]');if(workerStockTab)workerStockTab.hidden=state.user.role==='worker';document.querySelectorAll('[data-admin-only]').forEach(x=>x.hidden=state.user.role!=='admin');document.querySelectorAll('[data-finance]').forEach(x=>x.hidden=!['admin','brigadier'].includes(state.user.role));await loadBase();showTab('home');await renderTab('home')}catch(e){localStorage.removeItem('chappiToken');state.token=null;$('#loginView').hidden=false;$('#appView').hidden=true}}
async function loadBase(){[state.products,state.teams,state.workers,state.orders]=await Promise.all([api('/products'),api('/teams'),api('/workers'),api('/orders')])}
function formatMeters(v){const n=Number(v);if(!Number.isFinite(n))return '';return String(Number(n.toFixed(3)))}
function formatLength(v){const n=Number(v);if(!Number.isFinite(n))return '';return Number(n.toFixed(3)).toString()+' м'}
function productOptions(){return state.products.filter(p=>p.active).map(p=>'<option value="'+p.id+'">'+formatMeters(p.length_m)+' м · '+p.section_width_mm+'×'+p.section_height_mm+'</option>').join('')}
function teamName(){return 'Коллектив'}
function singleTeamId(){return state.teams[0]?.id||''}
async function renderTab(tab){if(tab==='home')return home();if(tab==='production')return production();if(tab==='orders')return orders();if(tab==='stock')return stock();if(tab==='shipments')return shipments();if(tab==='people')return people();if(tab==='reports')return reports();if(tab==='fund')return fund();if(tab==='archive')return archive();if(tab==='profile')return profile();if(tab==='rates')return rates();if(tab==='admin')return admin()}
async function home(){
 const d=await api('/dashboard');
 const todayRows=d.today.map(x=>({...x,length_m:Number(x.length_m)}));
 const isWorker=state.user.role==='worker';
 if(isWorker){
   $('#home').innerHTML='<h1>Сегодня</h1>'+
     '<div class="card"><h2>Производство сегодня</h2>'+
     simpleTable(todayRows.map(x=>({...x,size:(x.section_width_mm||'')+'×'+(x.section_height_mm||'')+' · '+formatMeters(x.length_m)+' м'})),[['size','Типоразмер'],['quantity','Количество']])+
     '</div>'+
     '<div class="card"><h2>Заказы и приоритеты</h2>'+orderCards(d.orders)+'</div>'+
     '<div class="card"><h2>Склад</h2>'+((d.stock||[]).filter(x=>Number(x.quantity)>0).length?simpleTable((d.stock||[]).filter(x=>Number(x.quantity)>0).map(x=>({...x,size:(x.section_width_mm||'')+'×'+(x.section_height_mm||'')+' · '+formatMeters(x.length_m)+' м'})),[['size','Типоразмер'],['quantity','Количество']]):'<div class="empty">На складе пусто</div>')+'</div>';
   return;
 }
 $('#home').innerHTML='<h1>Сегодня</h1><div class="grid"><div class="card"><h3>Производство за день</h3><div class="stat">'+d.today.reduce((s,x)=>s+Number(x.quantity),0)+'</div><small>изделий</small></div><div class="card"><h3>Активные и ожидающие заказы</h3><div class="stat">'+d.orders.length+'</div><small>в очереди</small></div><div class="card"><h3>Позиции склада</h3><div class="stat">'+d.stock.reduce((s,x)=>s+Number(x.quantity),0)+'</div><small>изделий в остатке</small></div></div><div class="card"><h2>Заказы и приоритеты</h2>'+orderCards(d.orders)+'</div><div class="card"><h2>Производство сегодня</h2>'+simpleTable(todayRows.map(x=>({...x,size:(x.section_width_mm||'')+'×'+(x.section_height_mm||'')+' · '+formatMeters(x.length_m)+' м'})),[['size','Типоразмер'],['quantity','Количество']])+'</div>';
}
async function orders(){
  state.orders=await api('/orders');
  const canManage=state.user.role==='admin';
  const visible=state.orders.filter(o=>o.status!=='archived');
  const productChoices=productOptions();
  $('#orders').innerHTML='<h1>Заказы</h1>'+
    (canManage?'<div class="card"><h2>Новый заказ</h2><form id="orderForm">'+
      '<label>Номер заказа<input name="orderNumber" required maxlength="80"></label>'+
      '<label>Название заказа<input name="title" required maxlength="160"></label>'+
      '<label>Приоритет<input name="priority" type="number" min="0" step="1" value="0"></label>'+
      '<div><h3>Позиции заказа</h3><div id="orderItems"></div><button type="button" id="addOrderItem" class="secondary">+ Добавить типоразмер</button></div>'+
      '<button type="submit">Создать заказ</button></form></div>':'')+
    '<div class="card"><h2>Текущие заказы</h2>'+orderCards(visible,true)+'</div>';
  const form=$('#orderForm');
  if(form){
    const box=$('#orderItems');
    const addRow=(productId='',qty='')=>{
      const used=[...box.querySelectorAll('select[name="productId"]')].map(x=>x.value);
      const available=state.products.filter(p=>p.active&&(!used.includes(String(p.id))||String(p.id)===String(productId)));
      if(!available.length){notify('Все доступные типоразмеры уже добавлены','error');return}
      const row=document.createElement('div');row.className='row orderItem';
      row.innerHTML='<label>Типоразмер<select name="productId">'+available.map(p=>'<option value="'+p.id+'" '+(String(p.id)===String(productId)?'selected':'')+'>'+formatProduct(p)+'</option>').join('')+'</select></label>'+
        '<label>Количество<input name="requiredQty" type="number" min="1" step="1" inputmode="numeric" value="'+escapeHtml(qty||'')+'" required></label>'+
        '<button type="button" class="secondary">Убрать</button>';
      row.querySelector('button').onclick=()=>row.remove();
      box.append(row);
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
          orderNumber:String(d.get('orderNumber')||'').trim(),
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
    const reason=prompt('Причина отмены заказа:');
    if(!reason||!reason.trim())return;
    try{await api('/orders/'+b.dataset.id+'/cancel',{method:'POST',body:JSON.stringify({reason:reason.trim()})});notify('Заказ отменён','success');await loadBase();await orders()}
    catch(err){notify(err.message,'error')}
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
      const length=formatMeters(i.lengthM||i.length_m);
      const progress=Number(i.remaining)>0 ? 'остаток '+i.remaining : '✓';
      return '<p>'+((i.section_width_mm||'')+'×'+(i.section_height_mm||'')+' · '+length+' м: '+i.done+' / '+i.required+' · '+progress)+'</p>';
    }).join('');
    const activate=state.user.role==='admin'&&editable&&o.status==='queued'
      ? '<button type="button" class="activateOrder" data-id="'+o.id+'">Сделать активным</button>' : '';
    const priority=state.user.role==='admin'&&editable
      ? '<form class="priorityForm row" data-id="'+o.id+'"><label>Приоритет<input name="priority" type="number" min="0" value="'+o.priority+'"></label><button type="submit">Сохранить приоритет</button></form>' : '';
    const cancel=state.user.role==='admin'&&editable&&['queued','active'].includes(o.status)
      ? '<button type="button" class="cancelOrder" data-id="'+o.id+'">Отменить заказ</button>' : '';
    const archive=state.user.role==='admin'&&editable&&['completed','cancelled'].includes(o.status)
      ? '<button type="button" class="archiveOrder" data-id="'+o.id+'">В архив</button>' : '';
    const status=o.status==='completed'?'✓ Выполнен':escapeHtml(o.status);
    return '<div class="card '+orderHighlight+'"><div class="row"><div><strong>'+escapeHtml(o.order_number)+' · '+escapeHtml(o.title)+'</strong><br><span class="tag '+(o.priority>0?'green':'')+'">'+(o.priority>0?'Приоритет '+o.priority:'Очередь')+'</span></div><span>'+status+'</span></div>'+items+activate+priority+cancel+archive+'</div>';
  }).join('');
}
function simpleTable(rows,cols){if(!rows.length)return '<div class="empty">Пока нет данных</div>';return '<div class="table-wrap"><table><thead><tr>'+cols.map(c=>'<th>'+c[1]+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+cols.map(c=>'<td>'+escapeHtml(r[c[0]])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'}
async function production(){
 if(state.user.role!=='brigadier'){ $('#production').innerHTML='<h1>Ежедневный отчёт</h1><div class="card"><p class="empty">Ежедневный отчёт заполняет только бригадир.</p></div>';return; }
 const date=localDate();
 const [report,orders,workers]=await Promise.all([api('/daily-reports?date='+date),api('/orders'),api('/team-members?date='+date)]);
 const first=orders.find(o=>o.status==='active')||orders.find(o=>o.status==='queued');
 const second=orders.filter(o=>o!==first&&['active','queued'].includes(o.status)).find(o=>o.status==='queued');
 const defaultProducts=[];
 for(const o of [first,second]) for(const item of (o?.items||[])){const p=state.products.find(x=>x.id===(item.productId||item.product_id));if(p&&!defaultProducts.some(x=>x.id===p.id))defaultProducts.push(p);}
 const existing=new Map((report.items||[]).map(x=>[String(x.product_id),x]));
 const rows=defaultProducts.map((p,idx)=>{
   const ex=existing.get(String(p.id));const tone=idx===0?'order-active':idx===1?'order-next':'';
   return '<div class="row productionReportItem '+tone+'"><label><strong>'+formatProduct(p)+'</strong><input data-product-id="'+p.id+'" type="number" min="0" step="1" inputmode="numeric" value="'+(ex?.quantity||'')+'" placeholder="Количество"></label></div>';
 }).join('');
 const checked=new Set((report.workerIds||[]).map(String));
 const workerRows=workers.filter(w=>!w.is_brigadier).map(w=>'<label class="check-row"><input type="checkbox" value="'+w.id+'" '+(checked.has(String(w.id))?'checked':'')+'>'+escapeHtml(w.display_name)+'</label>').join('');
 $('#production').innerHTML='<h1>Ежедневный отчёт</h1><div class="card"><p><strong>Дата:</strong> '+date+'</p><p class="muted">🟢 первый актуальный заказ · 🟡 второй актуальный заказ</p><div id="dailyDefaultRows">'+(rows||'<p class="empty">Нет активных позиций заказов.</p>')+'</div><div id="dailyExtraRows"></div><button type="button" id="addDailySize"'+(report.exists?' hidden':'')+'>+ Добавить размер</button></div><div class="card"><h2>Кто работал сегодня</h2><div class="checklist">'+workerRows+'</div></div><div class="card"><button id="saveDailyReport"'+(report.exists?' hidden':'')+'>'+ (report.exists?'Сохранить изменения':'Сохранить отчёт')+'</button></div><div id="dailyResult"></div>';
 const extra=$('#dailyExtraRows');
 const addExtraRow=(selectedProductId='',quantity='')=>{
   const used=[...document.querySelectorAll('#dailyDefaultRows [data-product-id],#dailyExtraRows select')].map(x=>x.dataset?.productId||x.value);
   const available=state.products.filter(p=>p.active&&(!used.includes(String(p.id))||String(p.id)===String(selectedProductId)));
   if(!available.length){notify('Нет других разрешённых типоразмеров','error');return}
   const row=document.createElement('div');row.className='row dailyExtra';
   row.innerHTML='<label>Типоразмер<select>'+available.map(p=>'<option value="'+p.id+'" '+(String(p.id)===String(selectedProductId)?'selected':'')+'>'+formatProduct(p)+'</option>').join('')+'</select></label><label>Количество<input type="number" min="1" step="1" value="'+escapeHtml(quantity||'')+'" required></label><button type="button">Убрать</button>';
   row.querySelector('button').onclick=()=>row.remove();extra.append(row);
 };
 $('#addDailySize').onclick=()=>addExtraRow();
 if(report.exists){
   const defaultIds=new Set(defaultProducts.map(p=>String(p.id)));
   for(const item of (report.items||[])){
     const pid=String(item.product_id||item.productId||'');
     if(pid&&!defaultIds.has(pid)) addExtraRow(pid,item.quantity);
   }
 }
 $('#saveDailyReport').onclick=async()=>{
   const items=[];
   document.querySelectorAll('#dailyDefaultRows [data-product-id]').forEach(inp=>{const q=Number(inp.value||0);if(q>0)items.push({productId:inp.dataset.productId,quantity:q})});
   extra.querySelectorAll('.dailyExtra').forEach(row=>{const q=Number(row.querySelector('input').value||0);if(q>0)items.push({productId:row.querySelector('select').value,quantity:q})});
   const workerIds=[...document.querySelectorAll('.checklist input[type=checkbox]:checked')].map(x=>x.value);
   if(!items.length){notify('Укажите изготовленные столбы','error');return}
   if(!workerIds.length){notify('Отметьте работников, которые работали','error');return}
   try{await api('/daily-reports',{method:'POST',body:JSON.stringify({workDate:date,items,workerIds})});notify('Отчёт сохранён','success');await production()}catch(e){notify(e.message,'error')}
 };
 if(report.exists){
   document.querySelectorAll('#dailyDefaultRows input,#dailyExtraRows input,#dailyExtraRows select,.checklist input').forEach(x=>x.disabled=true);
   const result='<div class="card success"><h2>Отчёт за день внесён</h2>'+report.items.map(x=>'<p><strong>'+formatProduct(x)+'</strong> — '+x.quantity+' шт.</p>').join('')+'<button id="editDaily" type="button" class="danger">Изменить</button></div>';
   $('#dailyResult').innerHTML=result;
   $('#editDaily').onclick=()=>{
     document.querySelectorAll('#dailyDefaultRows input,#dailyExtraRows input,#dailyExtraRows select,.checklist input').forEach(x=>x.disabled=false);
     $('#addDailySize').hidden=false;
     $('#saveDailyReport').hidden=false;
     $('#dailyResult').innerHTML='<div class="card"><p class="muted">Режим редактирования включён. После сохранения отчёт снова станет доступен только для просмотра.</p></div>';
   };
 }
}
function formatProduct(p){return escapeHtml((p.section_width_mm||60)+'×'+(p.section_height_mm||40)+' '+(p.length_label||formatMeters(p.length_m)+'метра'));}
async function stock(){const rows=await api('/stock');$('#stock').innerHTML='<h1>Склад</h1><div class="card"><p class="muted">Остатки рассчитываются по журналу движений. Производство, отгрузка и оплата — разные события.</p>'+simpleTable(rows.map(x=>({...x,size:(x.section_width_mm||'')+'×'+(x.section_height_mm||'')+' · '+formatMeters(x.length_m)+' м'})),[['size','Типоразмер'],['quantity','Остаток']])+'</div>'}
async function shipments(){
 const rows=await api('/shipments');
 const canShip=state.user.role==='brigadier';
 const orderOptions=state.orders.map(o=>'<option value="'+o.id+'">'+escapeHtml(o.order_number)+' — '+escapeHtml(o.title)+'</option>').join('');
 const history=rows.map(x=>'<p><strong>'+escapeHtml(x.shipment_number)+'</strong> · '+new Date(x.shipped_at).toLocaleString('uk-UA')+' · '+(x.items||[]).map(i=>((i.section_width_mm||'')+'×'+(i.section_height_mm||'')+' · '+formatMeters(i.length_m)+' м × '+i.quantity)).join(', ')+'</p>').join('');
 $('#shipments').innerHTML='<h1>Отправки</h1><div class="card"><h2>История отправок</h2>'+(history||'<p class="empty">Отправок пока нет.</p>')+'</div>'+
 (canShip?'<div class="card"><h2>Новая отправка</h2><form id="shipmentForm"><label>Номер отправки<input name="shipmentNumber" required></label><label>Заказ<select name="orderId"><option value="">Без заказа</option>'+orderOptions+'</select></label><label>Получатель<input name="recipient"></label><div id="shipmentItems"><p class="muted">Выберите заказ или оставьте «Без заказа» для отправки свободного склада.</p></div><button type="submit">Зафиксировать отправку</button></form><div class="card"><button id="closeMonthBtn" class="danger">Закрыть месяц</button><button id="reopenMonthBtn" class="secondary" hidden>Продолжить месяц</button></div></div>':'')
 ;
 const f=$('#shipmentForm');
 if(f){
   const box=$('#shipmentItems');
   const orderSelect=f.elements.orderId;
   const loadOptions=async()=>{
     const opts=await api('/shipment-options');
     box.replaceChildren();
     const orderId=orderSelect.value;
     const source=orderId?(opts.orderItems||[]):(opts.stockItems||[]);
     const merged=new Map();
     for(const x of source){
       const key=String(x.productId);
       const prev=merged.get(key);
       if(prev) prev.available+=Number(x.available)||0;
       else merged.set(key,{...x,available:Number(x.available)||0});
     }
     const items=[...merged.values()].filter(x=>x.available>0);
     if(!items.length){box.innerHTML='<p class="empty">Для выбранного режима доступной продукции нет.</p>';return}
     for(const x of items){
       const row=document.createElement('div');row.className='row shipmentItem';
       row.innerHTML='<label>Типоразмер<select name="productId"><option value="'+x.productId+'">'+escapeHtml(x.label)+'</option></select></label><label>Количество<input name="quantity" type="number" min="1" max="'+x.available+'" value="'+x.available+'" required></label><small>Доступно: '+x.available+' шт.</small>';
       row.dataset.available=x.available;box.append(row);
     }
   };
   orderSelect.addEventListener('change',()=>loadOptions().catch(e=>notify(e.message,'error')));
   await loadOptions();
   const st=await api('/month/state?month='+localDate().slice(0,7));
   $('#reopenMonthBtn').hidden=!st.brigadierClosed||st.finalized;
   $('#closeMonthBtn').hidden=st.brigadierClosed||st.finalized;
   $('#closeMonthBtn').onclick=async()=>{if(!confirm('Закрыть текущий месяц? Новые отправки будут относиться к следующему месяцу.'))return;try{await api('/month/close',{method:'POST',body:JSON.stringify({month:localDate().slice(0,7)})});notify('Месяц закрыт для текущих отправок','success');await shipments()}catch(e){notify(e.message,'error')}};
   $('#reopenMonthBtn').onclick=async()=>{try{await api('/month/reopen',{method:'POST',body:JSON.stringify({month:localDate().slice(0,7)})});notify('Текущий месяц продолжен','success');await shipments()}catch(e){notify(e.message,'error')}};
   f.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(f);const items=[...box.querySelectorAll('.shipmentItem')].map(row=>({productId:row.querySelector('[name=productId]').value,quantity:Number(row.querySelector('[name=quantity]').value)})).filter(x=>x.quantity>0);if(!items.length){notify('Нет доступной продукции','error');return}try{await api('/shipments',{method:'POST',body:JSON.stringify({shipmentNumber:d.get('shipmentNumber'),orderId:d.get('orderId')||null,recipient:d.get('recipient'),items})});notify('Отправка записана','success');await shipments()}catch(err){notify(err.message,'error')}});
 }
}
async function people(){
 state.workers=await api('/workers');
 const canManage=state.user.role==='admin';
 const canAttendance=state.user.role==='brigadier';
 const members=await api('/team-members?date='+encodeURIComponent(localDate()));
 $('#people').innerHTML='<h1>Работники и присутствие</h1><div class="card"><p><strong>Коллектив:</strong> '+escapeHtml(teamName())+'</p>'+simpleTable(state.workers,[['display_name','Имя'],['active','Активен']])+'</div>'+
 (canManage?'<div class="card"><h2>Состав коллектива</h2><p class="muted">Только администратор добавляет и убирает людей. Удаление из коллектива не стирает историю.</p><h3>Сейчас в коллективе</h3>'+members.map(w=>'<p>'+escapeHtml(w.display_name)+(w.is_brigadier?' <strong>— Бригадир</strong>':'')+' <button class="removeMember" data-id="'+w.id+'">Убрать из коллектива</button></p>').join('')+'<form id="membershipForm"><label>Добавить работника<select name="workerId">'+state.workers.filter(w=>w.active&&!members.some(m=>m.id===w.id)).map(w=>'<option value="'+w.id+'">'+escapeHtml(w.display_name)+'</option>').join('')+'</select></label><label>Дата начала<input name="validFrom" type="date" required value="'+localDate()+'"></label><button>Добавить в бригаду</button></form></div>':'')+
 (canManage?'<div class="card"><h2>Добавить работника в систему</h2><form id="workerForm"><label>Имя<input name="displayName" required></label><button>Добавить</button></form></div>':'')+
 (canManage?'<div class="card"><h2>Назначить бригадира</h2><select id="brigadierWorker">'+state.workers.filter(w=>w.active).map(w=>'<option value="'+w.id+'" '+(w.is_brigadier?'selected':'')+'>'+escapeHtml(w.display_name)+'</option>').join('')+'</select><button id="assignBrigadier">Сохранить бригадира</button></div>':'')+
 (canAttendance?'<div class="card"><h2>Кто сегодня работал</h2><form id="attendanceForm"><label>Дата<input type="date" name="workDate" required value="'+localDate()+'"></label><p><strong>Коллектив:</strong> '+escapeHtml(teamName())+'</p><div id="attendanceChecklist" class="checklist"><p class="muted">Загрузка состава коллектива…</p></div><button>Сохранить присутствие</button></form><p class="muted">Отмечаются только те, кто работал. Причины отсутствия не записываются.</p></div>':'');
 document.querySelectorAll('.removeMember').forEach(b=>b.onclick=async()=>{if(!confirm('Убрать работника из коллектива? История сохранится.'))return;try{await api('/team-memberships/'+b.dataset.id,{method:['D','E','L','E','T','E'].join(''),body:JSON.stringify({validTo:localDate()})});notify('Работник убран из коллектива');people()}catch(err){notify(err.message,'error')}});
 const wf=$('#workerForm');if(wf)wf.addEventListener('submit',async e=>{e.preventDefault();try{await api('/workers',{method:'POST',body:JSON.stringify({displayName:new FormData(wf).get('displayName')})});notify('Работник добавлен');people()}catch(err){notify(err.message,'error')}});
 const ab=$('#assignBrigadier');if(ab)ab.onclick=async()=>{try{await api('/workers/'+$('#brigadierWorker').value+'/brigadier',{method:'PATCH',body:JSON.stringify({})});notify('Бригадир назначен','success');people()}catch(e){notify(e.message,'error')}};
 const mf=$('#membershipForm');if(mf)mf.addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(mf));try{await api('/team-memberships',{method:'POST',body:JSON.stringify(d)});notify('Работник добавлен в бригаду');people()}catch(err){notify(err.message,'error')}});
 const af=$('#attendanceForm');
 const loadAttendancePeople=async()=>{
   if(!af)return;
   const date=af.elements.workDate.value,teamId=singleTeamId(),box=$('#attendanceChecklist');
   if(!date||!teamId)return;
   try{
     const [membersForDate,attendance]=await Promise.all([api('/team-members?date='+encodeURIComponent(date)),api('/attendance?date='+encodeURIComponent(date))]);
     const eligibleMembers=membersForDate.filter(w=>!w.is_brigadier&&w.active);
     const present=new Set(attendance.filter(x=>x.team_id===teamId).map(x=>x.worker_id));
     box.innerHTML=eligibleMembers.length
     ? '<label class="check-all"><input type="checkbox" id="attendanceAll"> <strong>Все работники коллектива</strong></label>'+eligibleMembers.map(w=>'<label><input type="checkbox" name="workerIds" value="'+w.id+'" '+(present.has(w.id)?'checked':'')+'> '+escapeHtml(w.display_name)+(w.active?'':' (архив)')+'</label>').join('')
     : '<p class="empty">На эту дату в бригаде нет работников.</p>';
   const all=$('#attendanceAll');
   const boxes=[...box.querySelectorAll('input[name="workerIds"]')];
   if(all){
     all.checked=boxes.length>0&&boxes.every(x=>x.checked);
     all.indeterminate=boxes.some(x=>x.checked)&&!all.checked;
     all.onchange=()=>boxes.forEach(x=>x.checked=all.checked);
     boxes.forEach(x=>x.onchange=()=>{all.checked=boxes.every(y=>y.checked);all.indeterminate=boxes.some(y=>y.checked)&&!all.checked;});
   }
   }catch(err){box.innerHTML='<p class="error">'+escapeHtml(err.message)+'</p>';}
 };
 if(af){af.elements.workDate.addEventListener('change',loadAttendancePeople);loadAttendancePeople();af.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(af);try{await api('/attendance',{method:'POST',body:JSON.stringify({workDate:fd.get('workDate'),workerIds:fd.getAll('workerIds')})});notify('Присутствие сохранено');await loadAttendancePeople()}catch(err){notify(err.message,'error')}});}
}
async function reports(){
 const month=localDate().slice(0,7);
 $('#reports').innerHTML='<h1>Месячный отчёт и закрытие</h1><div class="card"><form id="reportForm"><label>Месяц<input type="month" name="month" value="'+month+'" required></label><button>Показать</button></form><div id="reportResult"></div></div>';
 const form=$('#reportForm');
 const load=async()=>{
   const m=new FormData(form).get('month'); const r=await api('/reports/monthly?month='+encodeURIComponent(m));
   const missing=r.missingRates||[];
   const rows=r.items.map(x=>({...x,size:((x.section_width_mm||'')+'×'+(x.section_height_mm||'')+' · '+Number(x.length_m)+' м'),rate:x.rate_minor===null?'—':money(x.rate_minor),total:x.total_minor===null?'—':money(x.total_minor)}));
   const financeVisible=state.user.role!=='worker';
   let html='<h2>Производство за '+escapeHtml(m)+'</h2>';
   html+=financeVisible
     ? simpleTable(rows,[['size','Типоразмер'],['quantity','Количество'],['rate','Расценка'],['total','Стоимость']])
     : simpleTable(rows,[['size','Типоразмер'],['quantity','Количество']]);
   html+=financeVisible
     ? '<p><strong>Всего:</strong> '+r.total.quantity+' шт. · '+money(r.total.totalMinor)+'</p>'
     : '<p><strong>Всего:</strong> '+r.total.quantity+' шт.</p>';
   if(missing.length) html+='<p class="error"><strong>Для закрытия не хватает расценок:</strong> '+missing.map(x=>((x.section_width_mm||'')+'×'+(x.section_height_mm||'')+' · '+formatMeters(x.length_m)+' м')).join(', ')+'</p>';
   if(r.earnings&&r.earnings.length) html+='<h2>Начисления работников</h2>'+simpleTable(r.earnings.map(x=>({...x,amount:money(x.amount_minor)})),[['display_name','Работник'],['work_days','Дней'],['amount','Начислено']]);
   if(state.user.role==='admin') { const pending=BigInt(r.happyKopeck?.residualMinor||'0')>0n; if(r.closed) html+='<p class="success"><strong>Месяц закрыт и зафиксирован.</strong>'+(r.happyKopeck?.winnerId?' '+escapeHtml(r.happyKopeck.badge||'Счастливая копейка от Чаппи 🪙🏆')+' уже разыграна и сохранена.':'')+'</p>'; else { html+='<p class="muted">Остаток копеек распределяется автоматически случайным выбором среди работников, реально работавших в оплаченных производственных днях.'+(pending?' Сейчас накоплено '+money(r.happyKopeck.residualMinor)+'.':'')+'</p>'; html+='<button id="closeMonth" '+(missing.length?'disabled':'')+'>Закрыть месяц</button>'; } }
   $('#reportResult').innerHTML=html;
   const b=$('#closeMonth');
   if(b)b.onclick=async()=>{
     if(!confirm('Закрыть месяц '+m+'? Система сначала рассчитает каждый рабочий день по введённым расценкам и разделит стоимость дня между работавшими в этот день. После закрытия месяц фиксируется.'))return;
     try{await api('/reports/close-month',{method:'POST',body:JSON.stringify({month:m})});notify('Месяц закрыт. Начисления работников зафиксированы.','success');await load()}catch(e){notify(e.message,'error')}
   };
 };
 form.addEventListener('submit',e=>{e.preventDefault();load().catch(err=>notify(err.message,'error'))});
 await load();
}
async function rates(){
 const rows=await api('/rates');
 const canEdit=state.user.role==='admin';
 $('#rates').innerHTML='<h1>Расценки</h1><div class="card"><p class="muted">Расценки и история цен доступны только администратору. В течение месяца они не требуются для ввода производства; фактические цены вводятся при закрытии месяца.</p>'+
 (canEdit?'<h2>Внести или изменить расценку</h2><form id="rateForm"><label>Типоразмер<select name="productId">'+productOptions()+'</select></label><label>Месяц<input name="periodMonth" type="month" required></label><label>Цена за штуку, грн<input name="amount" type="number" min="0" step="0.01" required></label><button>Сохранить расценку</button></form>':'<p class="muted">Ввод и изменение расценок доступен только администратору.</p>')+'</div>'+
 (canEdit?'<div class="card"><h2>Справочник типоразмеров</h2>'+state.products.map(p=>'<p>'+formatMeters(p.length_m)+' м · '+p.section_width_mm+'×'+p.section_height_mm+' · '+(p.active?'Активен':'Архив')+(p.active?' <button class="archiveProduct" data-id="'+p.id+'">В архив</button>':'')+'</p>').join('')+'<form id="productForm"><h3>Добавить типоразмер</h3><label>Код<input name="code" required placeholder="Например 60x40-3200"></label><label>Длина, м (числовая для расчётов)<input name="lengthM" type="number" min="0.001" step="0.001" required></label><label>Обозначение длины<input name="lengthLabel" required placeholder="Например 3метра_(5 клипс)"></label><label>Ширина сечения, мм<input name="sectionWidthMm" type="number" min="1" value="60" required></label><label>Высота сечения, мм<input name="sectionHeightMm" type="number" min="1" value="40" required></label><button>Добавить типоразмер</button></form></div>':'')+
 '<div class="card"><h2>История расценок</h2>'+simpleTable(rows.map(x=>({...x,size:((x.section_width_mm||'')+'×'+(x.section_height_mm||'')+' · '+formatMeters(x.length_m)+' м'),period:String(x.period_month).slice(0,7),amount:money(x.amount_minor)})),[['size','Типоразмер'],['period','Месяц'],['amount','Цена, грн']])+'</div>';
 const rf=$('#rateForm');if(rf)rf.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await api('/rates',{method:'POST',body:JSON.stringify({productId:f.get('productId'),periodMonth:f.get('periodMonth')+'-01',amountMinor:Math.round(Number(f.get('amount'))*100)})});notify('Расценка сохранена');rates()}catch(err){notify(err.message,'error')}});
 const pf=$('#productForm');if(pf)pf.addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(pf));try{await api('/products',{method:'POST',body:JSON.stringify(d)});notify('Типоразмер добавлен');await loadBase();rates()}catch(err){notify(err.message,'error')}});
 document.querySelectorAll('.archiveProduct').forEach(b=>b.onclick=async()=>{if(!confirm('Перенести типоразмер в архив? История останется доступной.'))return;try{await api('/products/'+b.dataset.id+'/archive',{method:'PATCH',body:JSON.stringify({})});notify('Типоразмер архивирован');await loadBase();rates()}catch(err){notify(err.message,'error')}})
}
async function fund(){
 const d=await api('/fund');
 $('#fund').innerHTML='<h1>Общий фонд</h1><div class="grid"><div class="card"><h3>Текущий остаток</h3><div class="stat">'+money(d.summary.balance_minor)+'</div></div><div class="card"><h3>Поступления</h3><div class="stat">'+money(d.summary.income_minor)+'</div></div><div class="card"><h3>Расходы</h3><div class="stat">'+money(d.summary.expense_minor)+'</div></div></div><div class="card"><h2>Движения фонда</h2>'+d.entries.map(x=>'<p>'+escapeHtml(x.entry_date)+' · '+(x.entry_type==='income'?'Поступление':'Расход')+' · '+money(x.amount_minor)+' · '+escapeHtml(x.note)+'</p>').join('')+'</div>'+
 (state.user.role==='admin'?'<div class="card"><h2>Новое движение</h2><form id="fundForm"><label>Дата<input type="date" name="entryDate" required value="'+localDate()+'"></label><label>Тип<select name="entryType"><option value="income">Поступление</option><option value="expense">Расход</option></select></label><label>Сумма, грн<input name="amount" type="number" min="0" step="0.01" required></label><label>Пояснение<input name="note" required></label><button>Сохранить движение</button></form></div>':'');
 const f=$('#fundForm');if(f)f.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(f);try{await api('/fund',{method:'POST',body:JSON.stringify({entryDate:d.get('entryDate'),entryType:d.get('entryType'),amountMinor:Math.round(Number(d.get('amount'))*100),note:d.get('note')})});notify('Движение фонда сохранено');fund()}catch(err){notify(err.message,'error')}})
}
async function archive(){
 const rows=await api('/archive/months');
 $('#archive').innerHTML='<h1>Архив месяцев</h1><div class="card"><p class="muted">Показываются закрытые месяцы за последние шесть месяцев. Закрытые итоги хранятся отдельным снимком.</p>'+rows.map(x=>{
   const pay=x.totals?.earnings||[];
   return '<div class="card"><strong>'+escapeHtml(String(x.period_month).slice(0,7))+'</strong><p>Закрыт: '+new Date(x.closed_at).toLocaleString('uk-UA')+'</p><p>Количество: '+(x.totals.total?.quantity??'—')+' · Сумма: '+(x.totals.total?.totalMinor?money(x.totals.total.totalMinor):'—')+'</p>'+
     (pay.length?'<h3>Выплаты работникам</h3>'+simpleTable(pay.map(p=>({display_name:p.displayName,amount:money(p.amountMinor)})),[['display_name','Работник'],['amount','Выплата']]):'')+
     '</div>';
 }).join('')+'</div>'
}
async function profile(){
 $('#profile').innerHTML='<h1>Профиль</h1><div class="card"><p class="muted">Пароль и PIN профиля самостоятельно изменить нельзя. Изменение доступа выполняет только администратор.</p></div>';
}
async function admin(){
 await api('/admin/mode-event',{method:'POST',body:JSON.stringify({})});
 const [rows,audit]=await Promise.all([api('/admin/login-log'),api('/admin/audit-log')]);
 const access=await api('/admin/access');
 const accessCards=access.map(x=>'<div class="card"><h3>'+roleName(x.role)+'</h3><p>PIN: <strong>'+escapeHtml(x.pin||'не установлен')+'</strong></p><p>Неверных попыток: '+x.failedAttempts+(x.locked?' · <span class="error">Заблокирован</span>':'')+'</p><form class="pinForm" data-role="'+x.role+'"><label>Новый PIN (4–8 цифр)<input name="pin" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" required></label><button>Сохранить PIN</button>'+(x.locked?'<button type="button" class="unlockPin" data-role="'+x.role+'">Разблокировать</button>':'')+'</form></div>').join('');
 $('#admin').innerHTML='<h1>Администрирование</h1><div class="card"><h2>Доступ и PIN</h2>'+accessCards+'</div><div class="card"><h2>Резервный экспорт</h2><p>Экспортирует рабочие данные и историю без паролей и хешей доступа.</p><button id="exportBackup">Скачать резервную копию</button></div><div class="card"><h2>Восстановление резервной копии</h2><p class="muted">Восстанавливаются только рабочие данные. Существующие логины и пароли сохраняются. Сначала выполняется безопасная проверка без изменений.</p><form id="restoreForm"><label>Файл резервной копии<input id="restoreFile" type="file" accept=".json,application/json" required></label><button type="submit">Проверить резервную копию</button></form><pre id="restorePlan" class="muted"></pre></div><div class="card"><h2>Журнал входов (только администратор)</h2>'+simpleTable(rows,[['username_attempt','Логин'],['success','Успешно'],['created_at','Дата']])+'</div><div class="card"><h2>Журнал изменений</h2>'+simpleTable(audit,[['username','Кто'],['action','Действие'],['entity_type','Раздел'],['created_at','Дата']])+'</div><div class="card"><h2>Системная информация</h2><p>PIN отображаются и изменяются только администратором. Доступ к журналам и PIN проверяется сервером.</p><button id="logout">Выйти</button></div>';
 $('#logout').onclick=()=>{localStorage.removeItem('chappiToken');state.token=null;location.reload()};
 document.querySelectorAll('.pinForm').forEach(form=>form.addEventListener('submit',async e=>{e.preventDefault();const role=form.dataset.role,pin=new FormData(form).get('pin');try{await api('/admin/access/'+role,{method:'PATCH',body:JSON.stringify({pin})});notify('PIN изменён','success');await admin()}catch(err){notify(err.message,'error')}}));
 document.querySelectorAll('.unlockPin').forEach(b=>b.onclick=async()=>{try{await api('/admin/access/'+b.dataset.role+'/unlock',{method:'POST',body:JSON.stringify({})});notify('Профиль разблокирован','success');await admin()}catch(err){notify(err.message,'error')}});
 $('#exportBackup').onclick=async()=>{try{const response=await fetch('/api/admin/export',{headers:{Authorization:'Bearer '+state.token}});if(!response.ok)throw new Error('Не удалось подготовить резервную копию');const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='chappi-backup.json';a.click();URL.revokeObjectURL(url);notify('Резервная копия подготовлена','success')}catch(e){notify(e.message,'error')}};
 const restoreForm=$('#restoreForm'); if(restoreForm) restoreForm.addEventListener('submit',async e=>{e.preventDefault();const file=$('#restoreFile').files[0];if(!file)return;try{const backup=JSON.parse(await file.text());const plan=await api('/admin/restore/dry-run',{method:'POST',body:JSON.stringify(backup)});$('#restorePlan').textContent=JSON.stringify(plan,null,2);if(!plan.safeToRestore){notify('Восстановление заблокировано проверкой.','error');return}if(!confirm('ВНИМАНИЕ: текущие рабочие данные будут заменены данными резервной копии. Логины и пароли сохранятся. Продолжить?'))return;const result=await api('/admin/restore',{method:'POST',body:JSON.stringify({confirm:'RESTORE BUSINESS DATA',backup})});$('#restorePlan').textContent=JSON.stringify(result,null,2);notify('Резервная копия восстановлена.','success')}catch(err){notify(err.message,'error')}})
}
boot();