const state={token:localStorage.getItem('chappiToken'),user:null,products:[],teams:[],workers:[],orders:[]};
const $=s=>document.querySelector(s);
function localDate(){const d=new Date();const pad=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
const money=n=>(Number(n||0)/100).toLocaleString('uk-UA',{minimumFractionDigits:2,maximumFractionDigits:2})+' грн';
async function api(url,options={}){const res=await fetch('/api'+url,{...options,headers:{'Content-Type':'application/json',...(state.token?{Authorization:'Bearer '+state.token}:{}),...(options.headers||{})}});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Ошибка запроса');return data}
function notify(msg,kind='notice'){$('#notice').innerHTML='<div class="'+kind+'">'+escapeHtml(msg)+'</div>';setTimeout(()=>$('#notice').replaceChildren(),5000)}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function roleName(r){return ({admin:'Администратор',brigadier:'Бригадир',worker:'Работник'})[r]||r}
function showTab(tab){document.querySelectorAll('.view').forEach(x=>x.hidden=x.id!==tab);document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));}
$('#tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b){showTab(b.dataset.tab);renderTab(b.dataset.tab).catch(err=>notify(err.message,'error'))}});
document.querySelectorAll('[data-login-profile]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-login-profile]').forEach(x=>x.classList.toggle('active',x===b));$('#loginForm [name=profile]').value=b.dataset.loginProfile;$('#loginError').textContent='';}));
document.querySelector('[data-login-profile="brigadier"]').classList.add('active');
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const d=await api('/auth/login',{method:'POST',body:JSON.stringify({profile:f.get('profile'),pin:f.get('pin')})});state.token=d.token;localStorage.setItem('chappiToken',d.token);await boot()}catch(err){$('#loginError').textContent=err.message}});
async function boot(){try{state.user=(await api('/me')).user;$('#loginView').hidden=true;$('#appView').hidden=false;$('#userBadge').textContent=state.user.username+' · '+roleName(state.user.role);$('#logoutGlobal').hidden=false;$('#logoutGlobal').onclick=()=>{localStorage.removeItem('chappiToken');state.token=null;location.reload()};document.querySelectorAll('[data-admin]').forEach(x=>x.hidden=state.user.role!=='admin');document.querySelectorAll('[data-producer]').forEach(x=>x.hidden=state.user.role==='worker');await loadBase();showTab('home');await renderTab('home')}catch(e){localStorage.removeItem('chappiToken');state.token=null;$('#loginView').hidden=false;$('#appView').hidden=true}}
async function loadBase(){[state.products,state.teams,state.workers,state.orders]=await Promise.all([api('/products'),api('/teams'),api('/workers'),api('/orders')])}
function productOptions(){return state.products.filter(p=>p.active).map(p=>'<option value="'+p.id+'">'+(p.length_mm/1000)+' м · '+p.section_width_mm+'×'+p.section_height_mm+'</option>').join('')}
function teamName(){return state.teams[0]?.name||'Бригада 1'}
function singleTeamId(){return state.teams[0]?.id||''}
async function renderTab(tab){if(tab==='home')return home();if(tab==='production')return production();if(tab==='orders')return orders();if(tab==='stock')return stock();if(tab==='shipments')return shipments();if(tab==='people')return people();if(tab==='reports')return reports();if(tab==='fund')return fund();if(tab==='archive')return archive();if(tab==='profile')return profile();if(tab==='rates')return rates();if(tab==='admin')return admin()}
async function home(){const d=await api('/dashboard');$('#home').innerHTML='<h1>Сегодня</h1><div class="grid"><div class="card"><h3>Производство за день</h3><div class="stat">'+d.today.reduce((s,x)=>s+Number(x.quantity),0)+'</div><small>изделий</small></div><div class="card"><h3>Активные и ожидающие заказы</h3><div class="stat">'+d.orders.length+'</div><small>в очереди</small></div><div class="card"><h3>Позиции склада</h3><div class="stat">'+d.stock.reduce((s,x)=>s+Number(x.quantity),0)+'</div><small>изделий в остатке</small></div></div><div class="card"><h2>Заказы и приоритеты</h2>'+orderCards(d.orders)+'</div><div class="card"><h2>Производство сегодня</h2>'+simpleTable(d.today,[['length_mm','Длина, мм'],['quantity','Количество']])+'</div>'}
function orderCards(rows,editable=false){
 if(!rows.length)return '<div class="empty">Активных заказов нет</div>';
 return rows.map(o=>{
   const warehouseForm=(['admin','brigadier'].includes(state.user.role)&&['queued','active'].includes(o.status))
    ? '<form class="warehouseAssignForm card" data-id="'+o.id+'"><strong>Выдать со склада в заказ</strong><div class="row"><label>Типоразмер<select name="productId">'+
      (o.items||[]).map(i=>'<option value="'+(i.productId||i.product_id)+'">'+((i.lengthMm||i.length_mm)/1000)+' м · '+i.remaining+' шт. осталось</option>').join('')+
      '</select></label><label>Количество<input name="quantity" type="number" min="1" step="1" required></label><button>Выдать со склада</button></div></form>' : '';
   return '<div class="card '+(o.priority>0?'priority':'')+'"><div class="row"><div><strong>'+escapeHtml(o.order_number)+' · '+escapeHtml(o.title)+'</strong><br><span class="tag '+(o.priority>0?'green':'')+'">'+(o.priority>0?'Приоритет '+o.priority:'Очередь')+'</span></div><span>'+(o.status==='completed'?'✓ Выполнен':escapeHtml(o.status))+'</span></div>'+
     ((o.items||[]).map(i=>'<p>'+((i.lengthMm||i.length_mm)/1000)+' м: '+i.done+' / '+i.required+' · '+(Number(i.remaining)>0?'остаток '+i.remaining:'✓')+'</p>').join(''))+
     warehouseForm+
     (state.user.role==='admin'&&editable?'<form class="priorityForm row" data-id="'+o.id+'"><label>Приоритет<input name="priority" type="number" min="0" value="'+o.priority+'"></label><button>Сохранить приоритет</button></form>':'')+
     (state.user.role==='admin'&&editable&&['completed','cancelled'].includes(o.status)?'<button class="archiveOrder" data-id="'+o.id+'">В архив</button>':'')+
     '</div>';
 }).join('');
}
function simpleTable(rows,cols){if(!rows.length)return '<div class="empty">Пока нет данных</div>';return '<div class="table-wrap"><table><thead><tr>'+cols.map(c=>'<th>'+c[1]+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+cols.map(c=>'<td>'+escapeHtml(r[c[0]])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'}
async function production(){
 const canEdit=['admin','brigadier'].includes(state.user.role);
 const activeOrder=state.orders.find(o=>o.status==='active')||null;
 const activeItems=activeOrder?.items||[];
 const activeIds=new Set(activeItems.map(i=>i.productId||i.product_id));
 const orderRows=activeItems.map(i=>{
   const product=state.products.find(p=>p.id===(i.productId||i.product_id));
   if(!product)return '';
   return '<div class="row productionItem"><label>'+((product.length_mm)/1000)+' м · '+product.section_width_mm+'×'+product.section_height_mm+
     '<input name="qty_'+product.id+'" type="number" min="0" step="1" inputmode="numeric" placeholder="Количество"></label></div>';
 }).join('');
 $('#production').innerHTML='<h1>Ежедневное производство</h1>'+
 '<div class="card"><p><strong>Бригада:</strong> '+escapeHtml(teamName())+'</p>'+
 (activeOrder?'<p><strong>Активный заказ:</strong> '+escapeHtml(activeOrder.order_number)+' — '+escapeHtml(activeOrder.title)+'</p>'+
 '<h3>Позиции активного заказа</h3>'+(orderRows||'<p class="empty">В заказе нет доступных позиций.</p>'):
 '<p class="empty">Сейчас активного заказа нет. Производство можно записать как дополнительный выпуск на склад.</p>')+
 '<div id="extraProductionRows"></div>'+
 '<button type="button" id="addExtraProduction">+ Добавить типоразмер</button></div>'+
 '<div class="card"><form id="productionForm">'+
 '<label>Дата<input name="workDate" type="date" required value="'+localDate()+'"></label>'+
 '<input type="hidden" name="activeOrderId" value="'+(activeOrder?.id||'')+'">'+
 '<div class="card"><h3>Дополнительные типоразмеры</h3><p class="muted">Сюда добавляй изделия не из активного заказа. Они автоматически пойдут следующему подходящему заказу, а если такого нет — на склад.</p></div>'+
 '<label>Примечание<textarea name="note" rows="2"></textarea></label>'+
 '<button type="submit" '+(!canEdit?'disabled':'')+'>Сохранить дневное производство</button></form></div>'+
 '<p class="muted">В основной части показываются только позиции активного заказа. Дополнительные типоразмеры добавляются отдельно.</p>';

 const extraBox=$('#extraProductionRows');
 const addExtra=()=>{
   const used=[...extraBox.querySelectorAll('select')].map(x=>x.value);
   const available=state.products.filter(p=>p.active&&!activeIds.has(p.id)&&!used.includes(p.id));
   if(!available.length){notify('Других активных типоразмеров для добавления нет','error');return}
   const row=document.createElement('div');row.className='row extraProductionRow';
   row.innerHTML='<label>Типоразмер<select name="extraProductId">'+available.map(p=>'<option value="'+p.id+'">'+(p.length_mm/1000)+' м · '+p.section_width_mm+'×'+p.section_height_mm+'</option>').join('')+
     '</select></label><label>Количество<input name="extraQuantity" type="number" min="1" step="1" inputmode="numeric" required></label><button type="button" class="removeExtra">Убрать</button>';
   row.querySelector('.removeExtra').onclick=()=>row.remove();extraBox.append(row);
 };
 $('#addExtraProduction').onclick=addExtra;

 $('#productionForm').addEventListener('submit',async e=>{
   e.preventDefault();const form=e.currentTarget;const data=new FormData(form);const payload=[];
   if(activeOrder){
     activeItems.forEach(i=>{
       const productId=i.productId||i.product_id;const qty=Number(data.get('qty_'+productId)||0);
       if(qty>0)payload.push({productId,quantity:qty,orderId:activeOrder.id});
     });
   }
   extraBox.querySelectorAll('.extraProductionRow').forEach(row=>{
     const productId=row.querySelector('[name="extraProductId"]').value;
     const quantity=Number(row.querySelector('[name="extraQuantity"]').value||0);
     if(quantity>0)payload.push({productId,quantity,orderId:null});
   });
   if(!payload.length){notify('Укажите количество хотя бы по одной позиции','error');return}
   const button=form.querySelector('button[type="submit"]');button.disabled=true;let saved=0;
   try{
     for(const item of payload){
       await api('/production',{method:'POST',body:JSON.stringify({workDate:data.get('workDate'),productId:item.productId,orderId:item.orderId,quantity:item.quantity,note:data.get('note')||''})});
       saved++;
     }
     notify('Сохранено позиций: '+saved,'success');await loadBase();production();
   }catch(err){notify('Сохранено позиций: '+saved+'. Ошибка: '+err.message,'error')}
   finally{button.disabled=false}
 });
 $('#productionForm [name="workDate"]').addEventListener('change',loadProductionHistory);
 await loadProductionHistory();
}
async function loadProductionHistory(){
 const view=$('#production');
 if(!['admin','brigadier'].includes(state.user.role))return;
 const date=view.querySelector('[name="workDate"]').value;
 const rows=await api('/production?date='+encodeURIComponent(date));
 let box=view.querySelector('#productionHistory');
 if(!box){box=document.createElement('div');box.id='productionHistory';box.className='card';view.append(box)}
 box.innerHTML='<h2>Записи за выбранный день</h2>'+rows.map(r=>'<div class="row"><div><strong>'+(r.length_mm/1000)+' м</strong> · '+r.quantity+' шт.<br><small>'+escapeHtml(r.team_name)+' · '+escapeHtml(r.order_number||'Без заказа')+' · '+escapeHtml(r.created_by_name)+'</small></div>'+(state.user.role==='admin'?'<button class="voidProduction" data-id="'+r.id+'">Исправить запись</button>':'')+'</div>').join('')+(rows.length?'':'<p class="empty">За этот день записей пока нет</p>');
 box.querySelectorAll('.voidProduction').forEach(b=>b.onclick=async()=>{const reason=prompt('Укажи причину отмены записи. После отмены введи правильное количество заново.');if(!reason)return;try{await api('/production/'+b.dataset.id+'/void',{method:'POST',body:JSON.stringify({reason})});notify('Запись отменена. Введи корректное производство заново.');await loadProductionHistory()}catch(err){notify(err.message,'error')}})
}
async function orders(){state.orders=await api('/orders');$('#orders').innerHTML='<h1>Заказы</h1>'+orderCards(state.orders,true)+(state.user.role==='admin'?'<div class="card"><h2>Новый заказ</h2><form id="orderForm"><label>Номер заказа<input name="orderNumber" required></label><label>Название<input name="title" required></label><label>Приоритет (0 — обычный)<input name="priority" type="number" min="0" value="0"></label><div id="orderItems"><div class="row"><label>Типоразмер<select name="productId">'+productOptions()+'</select></label><label>Количество<input name="requiredQty" type="number" min="1" value="1"></label></div></div><button type="button" id="addOrderItem">Добавить типоразмер</button><button type="submit">Создать заказ</button></form></div>':'');const form=$('#orderForm');if(form){
 $('#addOrderItem').onclick=()=>{const row=document.createElement('div');row.className='row orderItem';row.innerHTML='<label>Типоразмер<select name="productId">'+productOptions()+'</select></label><label>Количество<input name="requiredQty" type="number" min="1" value="1"></label><button type="button" class="removeOrderItem">Убрать</button>';row.querySelector('.removeOrderItem').onclick=()=>row.remove();$('#orderItems').append(row)};
 form.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(form);const products=f.getAll('productId'),quantities=f.getAll('requiredQty');try{await api('/orders',{method:'POST',body:JSON.stringify({orderNumber:f.get('orderNumber'),title:f.get('title'),priority:Number(f.get('priority')),items:products.map((productId,i)=>({productId,requiredQty:Number(quantities[i])}))})});notify('Заказ создан');await loadBase();orders()}catch(err){notify(err.message,'error')}});
}
 document.querySelectorAll('.warehouseAssignForm').forEach(form=>form.addEventListener('submit',async e=>{
   e.preventDefault();
   const d=new FormData(form);
   try{
     await api('/orders/'+form.dataset.id+'/warehouse-assign',{method:'POST',body:JSON.stringify({items:[{productId:d.get('productId'),quantity:Number(d.get('quantity'))}]})});
     notify('Складская продукция выдана в заказ','success');
     await loadBase();
     orders();
   }catch(err){notify(err.message,'error')}
 }));
 document.querySelectorAll('.priorityForm').forEach(pf=>pf.addEventListener('submit',async e=>{e.preventDefault();try{await api('/orders/'+pf.dataset.id+'/priority',{method:'PATCH',body:JSON.stringify({priority:Number(new FormData(pf).get('priority'))})});notify('Приоритет изменён');orders()}catch(err){notify(err.message,'error')}}));
 document.querySelectorAll('.archiveOrder').forEach(b=>b.onclick=async()=>{if(!confirm('Перенести завершённый заказ в архив? История останется.'))return;try{await api('/orders/'+b.dataset.id+'/archive',{method:'PATCH',body:JSON.stringify({})});notify('Заказ архивирован');orders()}catch(err){notify(err.message,'error')}})
}
async function stock(){const rows=await api('/stock');$('#stock').innerHTML='<h1>Склад</h1><div class="card"><p class="muted">Остатки рассчитываются по журналу движений. Производство, отгрузка и оплата — разные события.</p>'+simpleTable(rows,[['length_mm','Длина, мм'],['quantity','Остаток']])+'</div>'}
async function shipments(){
 const rows=await api('/shipments');
 const payments=state.user.role==='admin'?await api('/payments'):[];
 $('#shipments').innerHTML='<h1>Отгрузки</h1><div class="card"><h2>История отправок</h2>'+rows.map(x=>'<p><strong>'+escapeHtml(x.shipment_number)+'</strong> · '+new Date(x.shipped_at).toLocaleString('uk-UA')+' · '+(x.items||[]).map(i=>(i.lengthMm/1000)+' м × '+i.quantity).join(', ')+'</p>').join('')+'</div>'+
 (['admin','brigadier'].includes(state.user.role)?'<div class="card"><h2>Новая отгрузка</h2><form id="shipmentForm"><label>Номер отправки<input name="shipmentNumber" required></label><label>Заказ<select name="orderId"><option value="">Без заказа</option>'+state.orders.map(o=>'<option value="'+o.id+'">'+escapeHtml(o.order_number)+'</option>').join('')+'</select></label><label>Получатель<input name="recipient"></label><label>Типоразмер<select name="productId">'+productOptions()+'</select></label><label>Количество<input name="quantity" type="number" min="1" required></label><button>Зафиксировать отгрузку</button></form></div>':'')+
 (state.user.role==='admin'?'<div class="card"><h2>Зачесть оплату по отгрузке</h2><form id="paymentForm"><label>Отгрузка<select name="shipmentId">'+rows.map(x=>'<option value="'+x.id+'">'+escapeHtml(x.shipment_number)+'</option>').join('')+'</select></label><label>Сумма, грн<input name="amount" type="number" min="0" step="0.01" required></label><label>Примечание<input name="note"></label><button>Зачесть оплату</button></form><h3>История оплат</h3>'+simpleTable(payments.map(p=>({...p,amount:money(p.amount_minor)})),[['shipment_number','Отгрузка'],['amount','Сумма'],['credited_at','Дата']])+'</div>':'');
 const f=$('#shipmentForm');if(f)f.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(f);try{await api('/shipments',{method:'POST',body:JSON.stringify({shipmentNumber:d.get('shipmentNumber'),orderId:d.get('orderId')||null,recipient:d.get('recipient'),items:[{productId:d.get('productId'),quantity:Number(d.get('quantity'))}]})});notify('Отгрузка записана');shipments()}catch(err){notify(err.message,'error')}});
 const pf=$('#paymentForm');if(pf)pf.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(pf);try{await api('/payments',{method:'POST',body:JSON.stringify({shipmentId:d.get('shipmentId'),amountMinor:Math.round(Number(d.get('amount'))*100),note:d.get('note')})});notify('Оплата зачтена');shipments()}catch(err){notify(err.message,'error')}})
}
async function people(){
 state.workers=await api('/workers');
 const canManage=state.user.role==='admin';
 const canAttendance=['admin','brigadier'].includes(state.user.role);
 const members=await api('/team-members?date='+encodeURIComponent(localDate()));
 $('#people').innerHTML='<h1>Работники и присутствие</h1><div class="card"><p><strong>Единственная бригада:</strong> '+escapeHtml(teamName())+'</p>'+simpleTable(state.workers,[['display_name','Имя'],['active','Активен']])+'</div>'+
 (canManage?'<div class="card"><h2>Состав бригады</h2><p class="muted">Только администратор добавляет и убирает людей. Удаление из бригады не стирает историю.</p><h3>Сейчас в бригаде</h3>'+members.map(w=>'<p>'+escapeHtml(w.display_name)+' <button class="removeMember" data-id="'+w.id+'">Убрать из бригады</button></p>').join('')+'<form id="membershipForm"><label>Добавить работника<select name="workerId">'+state.workers.filter(w=>w.active&&!members.some(m=>m.id===w.id)).map(w=>'<option value="'+w.id+'">'+escapeHtml(w.display_name)+'</option>').join('')+'</select></label><label>Дата начала<input name="validFrom" type="date" required value="'+localDate()+'"></label><button>Добавить в бригаду</button></form></div>':'')+
 (canManage?'<div class="card"><h2>Добавить работника в систему</h2><form id="workerForm"><label>Имя<input name="displayName" required></label><button>Добавить</button></form></div>':'')+
 (canAttendance?'<div class="card"><h2>Кто сегодня работал</h2><form id="attendanceForm"><label>Дата<input type="date" name="workDate" required value="'+localDate()+'"></label><p><strong>Бригада:</strong> '+escapeHtml(teamName())+'</p><div id="attendanceChecklist" class="checklist"><p class="muted">Загрузка состава бригады…</p></div><button>Сохранить присутствие</button></form><p class="muted">Отмечаются только те, кто работал. Причины отсутствия не записываются.</p></div>':'');
 document.querySelectorAll('.removeMember').forEach(b=>b.onclick=async()=>{if(!confirm('Убрать работника из бригады? История сохранится.'))return;try{await api('/team-memberships/'+b.dataset.id,{method:['D','E','L','E','T','E'].join(''),body:JSON.stringify({validTo:localDate()})});notify('Работник убран из бригады');people()}catch(err){notify(err.message,'error')}});
 const wf=$('#workerForm');if(wf)wf.addEventListener('submit',async e=>{e.preventDefault();try{await api('/workers',{method:'POST',body:JSON.stringify({displayName:new FormData(wf).get('displayName')})});notify('Работник добавлен');people()}catch(err){notify(err.message,'error')}});
 const mf=$('#membershipForm');if(mf)mf.addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(mf));try{await api('/team-memberships',{method:'POST',body:JSON.stringify(d)});notify('Работник добавлен в бригаду');people()}catch(err){notify(err.message,'error')}});
 const af=$('#attendanceForm');
 const loadAttendancePeople=async()=>{
   if(!af)return;
   const date=af.elements.workDate.value,teamId=singleTeamId(),box=$('#attendanceChecklist');
   if(!date||!teamId)return;
   try{
     const [membersForDate,attendance]=await Promise.all([api('/team-members?date='+encodeURIComponent(date)),api('/attendance?date='+encodeURIComponent(date))]);
     const present=new Set(attendance.filter(x=>x.team_id===teamId).map(x=>x.worker_id));
     box.innerHTML=membersForDate.map(w=>'<label><input type="checkbox" name="workerIds" value="'+w.id+'" '+(present.has(w.id)?'checked':'')+'> '+escapeHtml(w.display_name)+(w.active?'':' (архив)')+'</label>').join('') || '<p class="empty">На эту дату в бригаде нет работников.</p>';
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
   const rows=r.items.map(x=>({...x,rate:x.rate_minor===null?'—':money(x.rate_minor),total:x.total_minor===null?'—':money(x.total_minor)}));
   let html='<h2>Производство за '+escapeHtml(m)+'</h2>'+simpleTable(rows,[['length_mm','Длина, мм'],['quantity','Количество'],['rate','Расценка'],['total','Стоимость']]);
   html+='<p><strong>Всего:</strong> '+r.total.quantity+' шт. · '+money(r.total.totalMinor)+'</p>';
   if(missing.length) html+='<p class="error"><strong>Для закрытия не хватает расценок:</strong> '+missing.map(x=>(x/1000)+' м').join(', ')+'</p>';
   if(r.earnings&&r.earnings.length) html+='<h2>Начисления работников</h2>'+simpleTable(r.earnings.map(x=>({...x,amount:money(x.amount_minor)})),[['display_name','Работник'],['work_days','Дней'],['amount','Начислено']]);
   if(state.user.role==='admin') { const eligible=r.eligibleHappyKopeckWorkers||[]; const pending=BigInt(r.happyKopeck?.residualMinor||'0')>0n; if(r.closed) html+='<p class="success"><strong>Месяц закрыт и зафиксирован.</strong>'+(r.happyKopeck?.winnerId?' «Счастливая копейка» назначена победителю.':'')+'</p>'; else { html+=pending?'<label>Победитель «Счастливой копейки»<select id="happyKopeckWinner">'+eligible.map(x=>'<option value="'+escapeHtml(x.worker_id)+'">'+escapeHtml(x.display_name)+'</option>').join('')+'</select></label>':''; html+='<button id="closeMonth" '+(missing.length||(pending&&!eligible.length)?'disabled':'')+'>Закрыть месяц</button>'; } }
   $('#reportResult').innerHTML=html;
   const b=$('#closeMonth');
   if(b)b.onclick=async()=>{
     if(!confirm('Закрыть месяц '+m+'? Система сначала рассчитает каждый рабочий день по введённым расценкам и разделит стоимость дня между работавшими в этот день. После закрытия месяц фиксируется.'))return;
     try{const winner=$('#happyKopeckWinner')?.value||null; await api('/reports/close-month',{method:'POST',body:JSON.stringify({month:m,happyKopeckWinnerId:winner})});notify('Месяц закрыт. Начисления работников зафиксированы.','success');await load()}catch(e){notify(e.message,'error')}
   };
 };
 form.addEventListener('submit',e=>{e.preventDefault();load().catch(err=>notify(err.message,'error'))});
 await load();
}
async function rates(){
 const rows=await api('/rates');
 const canEdit=state.user.role==='admin';
 $('#rates').innerHTML='<h1>Расценки</h1><div class="card"><p class="muted">Расценки видят все. В течение месяца они не требуются для ввода производства. Администратор в конце месяца вводит фактическую цену каждого произведённого типоразмера.</p>'+
 (canEdit?'<h2>Внести или изменить расценку</h2><form id="rateForm"><label>Типоразмер<select name="productId">'+productOptions()+'</select></label><label>Месяц<input name="periodMonth" type="month" required></label><label>Цена за штуку, грн<input name="amount" type="number" min="0" step="0.01" required></label><button>Сохранить расценку</button></form>':'<p class="muted">Ввод и изменение расценок доступен только администратору.</p>')+'</div>'+
 (canEdit?'<div class="card"><h2>Справочник типоразмеров</h2>'+state.products.map(p=>'<p>'+(p.length_mm/1000)+' м · '+p.section_width_mm+'×'+p.section_height_mm+' · '+(p.active?'Активен':'Архив')+(p.active?' <button class="archiveProduct" data-id="'+p.id+'">В архив</button>':'')+'</p>').join('')+'<form id="productForm"><h3>Добавить типоразмер</h3><label>Код<input name="code" required placeholder="Например 60x40-3200"></label><label>Длина, мм<input name="lengthMm" type="number" min="1" required></label><label>Ширина сечения, мм<input name="sectionWidthMm" type="number" min="1" value="60" required></label><label>Высота сечения, мм<input name="sectionHeightMm" type="number" min="1" value="40" required></label><button>Добавить типоразмер</button></form></div>':'')+
 '<div class="card"><h2>История расценок</h2>'+simpleTable(rows.map(x=>({...x,period:String(x.period_month).slice(0,7),amount:money(x.amount_minor)})),[['length_mm','Длина, мм'],['period','Месяц'],['amount','Цена, грн']])+'</div>';
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
 $('#archive').innerHTML='<h1>Архив месяцев</h1><div class="card"><p class="muted">Показываются закрытые месяцы за последние шесть месяцев. Закрытые итоги хранятся отдельным снимком.</p>'+rows.map(x=>'<div class="card"><strong>'+escapeHtml(String(x.period_month).slice(0,7))+'</strong><p>Закрыт: '+new Date(x.closed_at).toLocaleString('uk-UA')+'</p><p>Количество: '+(x.totals.total?.quantity??'—')+' · Сумма: '+(x.totals.total?.totalMinor?money(x.totals.total.totalMinor):'—')+'</p></div>').join('')+'</div>'
}
async function profile(){
 $('#profile').innerHTML='<h1>Профиль</h1><div class="card"><h2>Сменить пароль</h2><form id="passwordForm"><label>Текущий пароль<input type="password" name="currentPassword" required autocomplete="current-password"></label><label>Новый пароль (не менее 10 символов)<input type="password" name="newPassword" minlength="10" required autocomplete="new-password"></label><button>Сохранить новый пароль</button></form></div>';
 $('#passwordForm').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));try{await api('/auth/change-password',{method:'POST',body:JSON.stringify(d)});notify('Пароль изменён','success');e.currentTarget.reset()}catch(err){notify(err.message,'error')}})
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
