export function createRecovery({api,loginForm,signupButton}){
 const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 const call=async data=>(await api(data)).data;
 const recovery=node('section',undefined,'quiz-card');recovery.hidden=true;
 const forgot=node('button','Olvidé mi contraseña','button secondary');forgot.type='button';signupButton.after(forgot,recovery);
 const username=node('input');username.placeholder='Usuario';username.autocomplete='username';username.maxLength=80;
 const code=node('input');code.placeholder='Clave temporal';code.autocomplete='one-time-code';code.maxLength=100;
 const password=node('input');password.type='password';password.placeholder='Nueva contraseña (mínimo 12 caracteres)';password.autocomplete='new-password';password.minLength=12;password.maxLength=128;
 const confirm=node('input');confirm.type='password';confirm.placeholder='Confirmar contraseña';confirm.autocomplete='new-password';
 const status=node('p');status.setAttribute('role','status');
 const request=node('button','Solicitar recuperación','button'),complete=node('button','Guardar nueva contraseña','button'),back=node('button','Volver al login','button secondary');
 for(const b of [request,complete,back])b.type='button';
 for(const [input,label]of [[username,'Usuario'],[code,'Clave temporal'],[password,'Nueva contraseña'],[confirm,'Confirmar contraseña']]){const wrap=node('label',label);wrap.append(input);recovery.append(wrap);}
 recovery.append(request,complete,status,back);
 forgot.onclick=()=>{recovery.hidden=false;loginForm.hidden=true;signupButton.hidden=true;forgot.hidden=true;};
 back.onclick=()=>{recovery.hidden=true;loginForm.hidden=false;signupButton.hidden=false;forgot.hidden=false;code.value=password.value=confirm.value='';status.textContent='';};
 request.onclick=async()=>{request.disabled=true;try{const result=await call({action:'request',username:username.value});status.textContent=result.message;}catch(e){status.textContent=e.message;}finally{request.disabled=false;}};
 complete.onclick=async()=>{if(password.value!==confirm.value){status.textContent='Las contraseñas no coinciden.';return;}complete.disabled=true;try{await call({action:'complete',username:username.value,code:code.value,password:password.value});code.value=password.value=confirm.value='';status.textContent='Contraseña actualizada. Vuelve al login para ingresar.';}catch(e){status.textContent=e.message;}finally{complete.disabled=false;}};
 async function renderAdmin(host){
  host.replaceChildren(node('h2','U & C'));
  const refresh=node('button','Actualizar','button secondary'),search=node('input'),message=node('p'),list=node('div',undefined,'tablewrap');search.type='search';search.placeholder='Buscar usuario o nombre';search.setAttribute('aria-label','Buscar usuario o nombre');host.append(refresh,search,message,list);let users=[];
  const showKey=(user,result)=>{const dialog=node('dialog',undefined,'v2-dialog'),title=node('h2','Clave temporal · '+(user.name||user.email)),value=node('input'),note=node('p','Válida durante 30 minutos y para un solo cambio de contraseña.'),close=node('button','Cerrar','button');value.value=result.code;value.readOnly=true;value.setAttribute('aria-label','Clave temporal');close.type='button';close.onclick=()=>{value.value='';dialog.close();dialog.remove();};dialog.append(title,value,note,close);document.body.append(dialog);dialog.showModal();value.select();};
  function draw(){
   list.replaceChildren();const table=node('table');table.className='inspector-ranking';const head=node('tr');for(const t of ['Usuario','Nombre','Rol','Recuperación','Acciones'])head.append(node('th',t));const thead=node('thead');thead.append(head);table.append(thead);const body=node('tbody');table.append(body);
   const query=search.value.trim().toLowerCase();for(const user of users.filter(u=>(u.email+' '+u.name).toLowerCase().includes(query))){const tr=node('tr'),actions=node('td');const issue=node('button','Generar clave temporal','button');issue.type='button';issue.disabled=user.disabled;issue.onclick=async()=>{if(!window.confirm('¿Verificaste la identidad de '+(user.name||user.email)+' y deseas generar su clave temporal?'))return;issue.disabled=true;try{const result=await call({action:'issue',uid:user.uid});showKey(user,result);await load();}catch(e){message.textContent=e.message;}finally{issue.disabled=false;}};
    actions.append(issue);if(['pending','issued'].includes(user.recovery)){const reject=node('button','Rechazar solicitud','button warn');reject.type='button';reject.onclick=async()=>{reject.disabled=true;try{await call({action:'reject',uid:user.uid});await load();}catch(e){message.textContent=e.message;reject.disabled=false;}};actions.append(reject);}
    const labels={pending:'Pendiente',issued:'Clave emitida',processing:'Procesando',completed:'Completada',rejected:'Rechazada',failed:'Requiere nueva clave'};tr.append(node('td',user.email),node('td',user.name||'—'),node('td',user.role+(user.deleted?' · Retirado':'')),node('td',labels[user.recovery]||'—'),actions);body.append(tr);
   }list.append(table);
  }
  async function load(){refresh.disabled=true;message.textContent='Consultando cuentas…';try{users=[];let pageToken='';do{const result=await call({action:'list',pageToken});users.push(...result.users);pageToken=result.pageToken;}while(pageToken);users.sort((a,b)=>(a.recovery==='pending'?-1:0)-(b.recovery==='pending'?-1:0)||a.email.localeCompare(b.email));draw();message.textContent='';}catch(e){message.textContent=e.message;}finally{refresh.disabled=false;}}
  refresh.onclick=load;search.oninput=draw;await load();
 }
 return {renderAdmin};
}
