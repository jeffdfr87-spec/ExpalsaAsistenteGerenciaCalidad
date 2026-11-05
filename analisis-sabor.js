import {downloadFlavorResults} from './analisis-sabor-pdf.js';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,setPersistence,browserSessionPersistence} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-functions.js';
const app=initializeApp(window.EXPALSA_FIREBASE_CONFIG,'analisis-sabor');
const auth=getAuth(app), callable=httpsCallable(getFunctions(app,'us-central1'),'manageFlavorAnalysis');
const root=document.querySelector('#app'),dialog=document.querySelector('#editor');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={user:null,admin:false,inspectors:[],sessions:[],session:null,samples:[],evaluations:[],sessionsCursor:null,samplesCursor:null,filter:'',trash:false,analysisMode:false,analysisSampleId:'',analysisInspectorUid:'',busy:false,generation:0};
const api=async(action,data={})=>(await callable({action,...data})).data;
const count=s=>s.inspectorCount??s.inspectorUids?.length??0;
const labels={draft:'Borrador',open:'En evaluación',closed:'Cerrada',conforme:'Conforme',no_conforme:'No conforme'};
const fields=[['lote','Lote'],['talla','Talla'],['color','Color'],['sabor','Sabor de referencia'],['destino','Destino'],['codigo','Código'],['importador','Importador']];
let noticeTimer;
function notify(message){const el=document.querySelector('#notice');el.textContent=message;el.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>el.hidden=true,6500);}
function message(error){if(error.code==='functions/not-found'||error.code==='functions/unavailable')return 'El servicio de análisis no está disponible. Intenta nuevamente en unos momentos.';return error.message||'No se pudo completar la operación.';}
const tag=(status,text=labels[status])=>`<span class="tag ${esc(status)}">${esc(text)}</span>`;
const localDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guayaquil',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const stamp=n=>n?new Intl.DateTimeFormat('es-EC',{dateStyle:'short',timeStyle:'short',timeZone:'America/Guayaquil'}).format(new Date(n)):'—';
function account(){document.querySelector('#account').innerHTML=state.user?`<span>${esc(state.user.email)}<small>${state.admin?'Administrador':'Inspector de laboratorio'}</small></span><button class="button" data-action="logout">Salir</button>`:'';}
function login(error=''){
 root.innerHTML=`<section class="panel login"><div class="panel-body"><span class="eyebrow">LABORATORIO DE CALIDAD</span><h2 style="margin-top:12px">Ingresa a tu laboratorio</h2><p class="hint">Usa tu cuenta de evaluaciones EXPALSA.</p><form id="login-form"><label class="field">Correo<input type="email" name="email" autocomplete="username" required></label><label class="field">Contraseña<input type="password" name="password" autocomplete="current-password" required></label><p class="error" role="alert">${esc(error)}</p><button class="button primary" type="submit">Iniciar sesión</button></form></div></section>`;
}
function renderSessions(){
 const rows=state.sessions.map(s=>`<tr><td><strong>${esc(s.name)}</strong><small>${esc(s.date)}</small></td><td>${tag(s.status)}</td><td>${s.sampleCount||0}</td><td>${count(s)}</td><td>${stamp(s.createdAtMs)}</td><td><div class="actions">${state.trash?`<button class="button" data-action="restore-session" data-id="${esc(s.id)}">Restaurar sesión</button>`:`<button class="button" data-action="detail" data-id="${esc(s.id)}">${state.admin?'Ver sesión':'Evaluar muestras'} →</button>${state.admin?`<button class="button danger" data-action="delete-session" data-id="${esc(s.id)}">Eliminar</button>`:''}`}</div></td></tr>`).join('');
 root.innerHTML=`<div class="intro"><div><h2>${state.trash?'Papelera de sesiones':'Sesiones de análisis'}</h2><p>${state.trash?'Restaura una sesión para volver a trabajar con sus muestras y resultados.':'Cada muestra puede ser analizada por todos los inspectores de la sesión.'}</p></div><div class="actions"><button class="button" data-action="refresh">↻ Actualizar</button>${state.admin?`<button class="button" data-action="toggle-trash">${state.trash?'Volver a sesiones':'Papelera'}</button>${state.trash?'':'<button class="button primary" data-action="new-session">＋ Nueva sesión</button>'}`:''}</div></div><section class="panel"><div class="panel-head"><h3>${state.trash?'Sesiones eliminadas':state.admin?'Registro del laboratorio':'Mis sesiones asignadas'}</h3><span class="muted hint">${state.sessions.length} sesiones cargadas</span></div>${rows?`<div class="table-wrap"><table><thead><tr><th>Sesión / Fecha</th><th>Estado</th><th>Muestras</th><th>Inspectores</th><th>Creada</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table></div>`:`<div class="empty"><strong>${state.trash?'La papelera está vacía':state.admin?'Tu laboratorio está listo':'Aún no tienes sesiones asignadas'}</strong>${state.trash?'':state.admin?'Crea una sesión y selecciona a los inspectores.':'Las sesiones aparecerán cuando el administrador te asigne.'}</div>`}${state.sessionsCursor?'<div class="load-more"><button class="button" data-action="more-sessions">Cargar más sesiones</button></div>':''}</section>`;
}
async function loadSessions(more=false){
 const generation=state.generation;let cursor=more?state.sessionsCursor:null,r;
 do{r=await api('listSessions',{cursor,trash:state.trash});cursor=r.cursor;}while(!r.sessions.length&&cursor);
 if(generation!==state.generation)return;state.session=null;state.sessions=more?[...state.sessions,...r.sessions]:r.sessions;state.sessionsCursor=r.cursor;renderSessions();
}
async function detailPage(sessionId,cursor=null,roster=true){
 const r=await api('detail',{sessionId,cursor});
 if(roster){let next=r.membersCursor;while(next){const page=await api('listMembers',{sessionId,cursor:next});r.session.inspectors.push(...page.inspectors);next=page.cursor;}r.session.inspectorUids=r.session.inspectors.map(p=>p.uid);}
 for(const [sampleId,first] of Object.entries(r.evaluationCursors||{})){let next=first;while(next){const page=await api('listVotes',{sessionId,sampleId,cursor:next});r.evaluations.push(...page.evaluations);next=page.cursor;}}
 return r;
}
async function loadDetail(id,more=false){const generation=state.generation;const r=await detailPage(id,more?state.samplesCursor:null);if(generation!==state.generation)return;state.session=r.session;state.samples=more?[...state.samples,...r.samples]:r.samples;state.evaluations=more?[...state.evaluations,...r.evaluations]:r.evaluations;state.samplesCursor=r.cursor;renderDetail();}

function sampleStats(id){const votes=state.evaluations.filter(e=>e.sampleId===id);const good=votes.filter(e=>e.result==='conforme').length,bad=votes.length-good;return {votes,good,bad};}
function resultTag(stats){if(!stats.votes.length)return tag('draft','Sin resultados');if(stats.good&&stats.bad)return tag('mixed','Discrepancia');return stats.bad?tag('bad','No conforme'):tag('good','Conforme');}
function analysisWorkbench(){
 const s=state.session;
 const sample=state.samples.find(m=>m.id===state.analysisSampleId)||state.samples[0];
 if(!sample)return '';
 state.analysisSampleId=sample.id;
 const votes=state.evaluations.filter(v=>v.sampleId===sample.id);
 const people=s.inspectors;
 const selected=people.find(p=>p.uid===state.analysisInspectorUid)||people.find(p=>!votes.some(v=>v.inspectorUid===p.uid))||people[0];
 state.analysisInspectorUid=selected?.uid||'';
 const vote=votes.find(v=>v.inspectorUid===selected?.uid);
 return `<section class="panel analysis-workbench" id="analysis-workbench" aria-labelledby="analysis-title">
  <div class="panel-head"><div><span class="eyebrow">REGISTRO EN LABORATORIO</span><h2 id="analysis-title">Analizar muestra</h2><p>Selecciona la muestra y el inspector para registrar su resultado.</p></div><button class="quiet" data-action="hide-analysis">Ocultar formulario</button></div>
  <div class="panel-body"><div class="form-grid">
   <label class="field">Muestra<select id="analysis-sample">${state.samples.map(m=>`<option value="${esc(m.id)}" ${m.id===sample.id?'selected':''}>${esc(m.codigo)} · Lote ${esc(m.lote)}</option>`).join('')}</select></label>
   <label class="field">Inspector que analiza<select id="analysis-inspector">${people.map(p=>`<option value="${esc(p.uid)}" ${p.uid===selected?.uid?'selected':''}>${esc(p.name||p.email)}${votes.some(v=>v.inspectorUid===p.uid)?' · Registrado':' · Pendiente'}</option>`).join('')}</select></label>
  </div><dl class="details analysis-details">${fields.map(([key,label])=>`<div><dt>${label}</dt><dd>${esc(sample[key])}</dd></div>`).join('')}</dl>
  ${vote?`<div class="saved-evaluation"><h3>Evaluación registrada</h3><p>${tag(vote.result==='conforme'?'good':'bad',labels[vote.result])}</p><p>${esc(vote.observations||'Sin observaciones.')}</p><p class="hint">${stamp(vote.createdAtMs)}${vote.entryMode==='laboratory'?' · Registrada en laboratorio por el administrador':''}</p></div>`:s.status!=='open'?'<p class="hint">Abre la evaluación para comenzar a registrar resultados.</p>':`<form id="lab-evaluation-form"><fieldset class="result-fieldset"><legend class="field">Resultado del inspector</legend><div class="radio-row"><label class="radio-card"><input type="radio" name="result" value="conforme" required> Conforme</label><label class="radio-card"><input type="radio" name="result" value="no_conforme" required> No conforme</label></div></fieldset><label class="field">Observaciones<textarea name="observations" maxlength="2000" placeholder="Describe el sabor o defecto identificado"></textarea><small>Obligatorias si el resultado es no conforme.</small></label><p class="hint">Se guardará el resultado de ${esc(selected?.name||selected?.email)} y tu cuenta como responsable del registro.</p><p class="error" role="alert"></p><button type="submit" class="button primary">Guardar evaluación del inspector</button></form>`}
  </div></section>`;
}
function renderDetail(){
 const s=state.session,admin=state.admin,filter=state.filter.toLocaleLowerCase('es');
 const mine=state.evaluations.filter(e=>e.inspectorUid===state.user.uid);
 const samples=state.samples.filter(m=>fields.some(([key])=>String(m[key]).toLocaleLowerCase('es').includes(filter)));
 const discrepancies=state.samples.filter(m=>{const r=sampleStats(m.id);return r.good&&r.bad;}).length;
 const rows=samples.map(m=>{
  const stats=sampleStats(m.id),my=mine.find(e=>e.sampleId===m.id),received=stats.votes.length,total=count(s);
  const action=admin?`${s.status==='open'?`<button class="button primary" data-action="begin-analysis" data-id="${esc(m.id)}">Analizar muestra</button>`:''}<button class="button" data-action="results" data-id="${esc(m.id)}">Ver resultados</button>`:`<button class="button" data-action="evaluate" data-id="${esc(m.id)}">${my?'Ver evaluación':s.status==='open'?'Evaluar':'Ver muestra'}</button>`;
  return `<tr><td><strong>${esc(m.codigo)}</strong><small>Lote ${esc(m.lote)}</small></td><td>${esc(m.talla)}<small>${esc(m.color)}</small></td><td>${esc(m.sabor)}</td><td>${esc(m.destino)}<small>${esc(m.importador)}</small></td><td>${admin?`${received} / ${total}<div class="progress"><span style="width:${Math.round(received/total*100)}%"></span></div>`:my?tag(my.result==='conforme'?'good':'bad',labels[my.result]):tag('draft','Pendiente')}</td><td>${admin?resultTag(stats):''}</td><td><div class="actions">${action}</div></td></tr>`;
 }).join('');
 root.innerHTML=`<a class="back" href="#" data-action="back">← Todas las sesiones</a>
 <section class="session-banner"><div>${tag(s.status)}<h2>${esc(s.name)}</h2><p>${esc(s.date)} · ${count(s)} inspectores asignados</p></div><div class="actions">
 ${admin&&s.status==='draft'?'<button class="button" data-action="open-session">Abrir evaluación →</button>':''}
 ${admin&&s.status==='open'?`<button class="button primary" data-action="begin-analysis">${state.analysisMode?'Continuar análisis':'Comenzar análisis'} →</button><button class="button" data-action="close-session">Finalizar análisis</button>`:''}</div></section>
 ${admin?'<div class="actions session-tools"><button class="button" data-action="add-inspectors">＋ Agregar inspectores</button><button class="button danger" data-action="delete-session" data-id="'+esc(s.id)+'">Eliminar sesión</button></div>':''}
 ${admin&&state.analysisMode?analysisWorkbench():''}
 <div class="cards"><div class="stat"><span>MUESTRAS REGISTRADAS</span><strong>${s.sampleCount}</strong><small>En esta sesión</small></div><div class="stat"><span>INSPECTORES</span><strong>${count(s)}</strong><small>Evaluación individual</small></div><div class="stat"><span>${admin?'EVALUACIONES RECIBIDAS':'MIS EVALUACIONES'}</span><strong>${admin?s.evaluationCount||0:mine.length}</strong><small>${admin?'De '+s.sampleCount*count(s)+' esperadas':'En las muestras cargadas'}</small></div><div class="stat"><span>${admin?'DISCREPANCIAS':'POR EVALUAR'}</span><strong>${admin?discrepancies:state.samples.length-mine.length}</strong><small>En las muestras cargadas</small></div></div>
 <section class="panel"><div class="panel-head"><div><h3>Muestras de materia prima</h3><p>${state.samples.length} de ${s.sampleCount} muestras cargadas</p></div><div class="actions">${admin?'<button class="button" data-action="export">↓ Exportar CSV</button>':''}${admin&&s.status==='draft'?'<button class="button primary" data-action="new-sample">＋ Agregar muestra</button>':''}</div></div><div class="panel-body filters"><label class="field" for="sample-filter">Buscar muestra</label><input id="sample-filter" type="search" placeholder="Código, lote, importador…" value="${esc(state.filter)}"><button class="button" data-action="refresh">↻ Actualizar</button></div>${rows?`<div class="table-wrap"><table><thead><tr><th>Código / Lote</th><th>Talla / Color</th><th>Sabor de referencia</th><th>Destino / Importador</th><th>${admin?'Avance':'Mi resultado'}</th><th>${admin?'Resultado parcial':''}</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table></div>`:`<div class="empty"><strong>${state.samples.length?'Sin coincidencias':'Sin muestras registradas'}</strong>${s.status==='draft'?'Agrega las muestras antes de abrir la evaluación.':'No hay muestras para mostrar.'}</div>`}${state.samplesCursor?'<div class="load-more"><button class="button" data-action="more-samples">Cargar más muestras</button></div>':''}</section>`;
}

function modal(title,body,submit='',formId='',headerActions=''){
 dialog.innerHTML=`<div class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2><div class="actions">${headerActions}<button type="button" data-action="dismiss" aria-label="Cerrar">×</button></div></div>${formId?`<form id="${formId}">`:''}<div class="dialog-body">${body}<p class="error" id="form-error" role="alert"></p></div><div class="dialog-foot"><button type="button" class="button" data-action="dismiss">${submit?'Cancelar':'Cerrar'}</button>${submit?`<button type="submit" class="button primary">${esc(submit)}</button>`:''}</div>${formId?'</form>':''}`;
 if(!dialog.open)dialog.showModal();
}
async function newSession(){
 const r=await api('inspectors');state.inspectors=r.inspectors;
 modal('Nueva sesión de análisis',`<div class="form-grid"><label class="field full">Nombre de la sesión<input name="name" maxlength="120" required placeholder="Ej. Recepción de materia prima · Turno mañana"></label><label class="field">Fecha<input type="date" name="date" value="${localDate()}" required></label><div class="field full"><span>Inspectores participantes</span><div class="inspector-list">${r.inspectors.length?r.inspectors.map(p=>`<label class="check"><input type="checkbox" name="inspector" value="${esc(p.uid)}"><span>${esc(p.name||p.email)}<small>${esc(p.email)}</small></span></label>`).join(''):'<p class="hint">No hay cuentas de inspectores habilitadas. Habilítalas desde Evaluaciones.</p>'}</div></div></div>`,'Crear sesión','session-form');
}
async function addInspectorBatches(sessionId,uids){
 if(!uids.length)return;
 let added=0;
 try{for(let i=0;i<uids.length;i+=100){const r=await api('addInspectors',{sessionId,inspectorUids:uids.slice(i,i+100)});added+=r.added;}}
 catch(error){throw Error(`${added?`Se agregaron ${added} inspectores. `:''}${message(error)} Puedes volver a intentar; los inspectores ya agregados no se duplicarán.`);}
}
async function addInspectorsDialog(){
 const r=await api('inspectors');const assigned=new Set(state.session.inspectorUids);
 const available=r.inspectors.filter(p=>!assigned.has(p.uid));
 modal('Agregar inspectores',`<p class="hint">Los inspectores agregados podrán analizar todas las muestras de esta sesión. No hay un límite fijo de participantes.</p>${state.session.status==='closed'?'<p class="hint">Esta sesión volverá a abrirse para recibir las nuevas evaluaciones.</p>':''}<div class="actions"><span class="hint">${assigned.size} asignados · ${available.length} disponibles</span>${available.length?'<button class="quiet" type="button" data-action="select-inspectors">Seleccionar todos</button>':''}</div><div class="inspector-list">${available.length?available.map(p=>`<label class="check"><input type="checkbox" name="inspector" value="${esc(p.uid)}"><span>${esc(p.name||p.email)}<small>${esc(p.email)}</small></span></label>`).join(''):'<p class="hint">Todos los inspectores habilitados ya están asignados a esta sesión.</p>'}</div>`,available.length?'Agregar a la sesión':'',available.length?'inspectors-form':'');
}

function newSample(){modal('Agregar muestra',`<div class="form-grid">${fields.map(([key,label])=>`<label class="field ${key==='sabor'?'full':''}">${label}<input name="${key}" maxlength="${key==='sabor'?200:120}" required>${key==='sabor'?'<small>Descripción de referencia; cada inspector registrará su propio resultado.</small>':''}</label>`).join('')}</div>`,'Guardar muestra','sample-form');}
function evaluate(id){const m=state.samples.find(m=>m.id===id);const vote=state.evaluations.find(e=>e.sampleId===id&&e.inspectorUid===state.user.uid);state.editSampleId=id;const canEvaluate=state.session.status==='open'&&!vote;
 modal(`Muestra ${m.codigo}`,`<dl class="details">${fields.map(([key,label])=>`<div><dt>${label}</dt><dd>${esc(m[key])}</dd></div>`).join('')}</dl>${vote?`<p>${tag(vote.result==='conforme'?'good':'bad',labels[vote.result])}</p><p>${esc(vote.observations||'Sin observaciones.')}</p><p class="hint">Registrada el ${stamp(vote.createdAtMs)}. La evaluación enviada no puede modificarse.</p>`:canEvaluate?'<fieldset style="border:0;padding:0;margin:0"><legend class="field">Resultado de sabor</legend><div class="radio-row"><label class="radio-card"><input type="radio" name="result" value="conforme" required> Conforme</label><label class="radio-card"><input type="radio" name="result" value="no_conforme" required> No conforme</label></div></fieldset><label class="field">Observaciones<textarea name="observations" maxlength="2000" placeholder="Describe el sabor o defecto identificado"></textarea><small>Obligatorias para un resultado no conforme.</small></label><p class="hint">Al enviar, tu evaluación quedará registrada con tu cuenta y no podrá modificarse.</p>':'<p class="hint">La sesión no está abierta para evaluar.</p>'}`,canEvaluate?'Enviar evaluación':'',canEvaluate?'evaluation-form':'');
}
function results(id){
 const m=state.samples.find(m=>m.id===id),stats=sampleStats(id);
 modal(`Resultados · Lote ${m.lote}`,
  `<dl class="details">${fields.map(([key,label])=>`<div><dt>${label}</dt><dd>${esc(m[key])}</dd></div>`).join('')}</dl>
  <div class="report">${resultTag(stats)}<span class="hint">${stats.votes.length} de ${count(state.session)} evaluaciones</span></div>
  <div class="table-wrap"><table><thead><tr><th>Inspector</th><th>Resultado</th><th>Observaciones</th></tr></thead><tbody>${state.session.inspectors.map(p=>{
   const v=stats.votes.find(v=>v.inspectorUid===p.uid);
   return `<tr><td>${esc(p.name||p.email)}${v?`<small>${stamp(v.createdAtMs)}</small>`:''}</td><td>${v?tag(v.result==='conforme'?'good':'bad',labels[v.result]):tag('draft','Pendiente')}</td><td style="white-space:pre-wrap;min-width:150px">${esc(v?.observations||'—')}</td></tr>`;
  }).join('')}</tbody></table></div>`,
  '','',`<button class="button primary" type="button" data-action="results-pdf" data-id="${esc(m.id)}" aria-label="Descargar PDF de resultados del lote ${esc(m.lote)}">↓ PDF</button>`);
}

function csvCell(value){let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
async function exportCsv(){
 const sessionId=state.session.id,session=state.session;let samples=[],evaluations=[],cursor=null;
 do{const r=await detailPage(sessionId,cursor,false);samples.push(...r.samples);evaluations.push(...r.evaluations);cursor=r.cursor;}while(cursor);
 const rows=[['Sesión','Fecha',...fields.map(f=>f[1]),'Inspector','Correo','Resultado','Observaciones','Fecha de evaluación']];
 for(const m of samples)for(const inspector of session.inspectors){const v=evaluations.find(e=>e.sampleId===m.id&&e.inspectorUid===inspector.uid);rows.push([session.name,session.date,...fields.map(([k])=>m[k]),inspector.name,inspector.email,labels[v?.result]||'Pendiente',v?.observations||'',stamp(v?.createdAtMs)]);}
 const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=`analisis-sabor-${session.date}-${session.id}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Exportación completa.');
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-action]');if(!b||state.busy)return;e.preventDefault();const action=b.dataset.action;
 if(action==='dismiss'){dialog.close();return;}
 state.busy=true;b.disabled=true;
 try{
  if(action==='logout')await signOut(auth);
  else if(action==='new-session')await newSession();
  else if(action==='toggle-trash'){state.trash=!state.trash;await loadSessions();}
  else if(action==='add-inspectors')await addInspectorsDialog();
  else if(action==='select-inspectors'){dialog.querySelectorAll('input[name=inspector]:not(:disabled)').forEach(input=>input.checked=true);}
  else if(action==='delete-session'){state.pendingSessionId=b.dataset.id;const session=state.session?.id===b.dataset.id?state.session:state.sessions.find(s=>s.id===b.dataset.id);modal('Eliminar sesión',`<p>¿Mover <strong>${esc(session?.name||'esta sesión')}</strong> a la papelera?</p><p class="hint">Dejará de aparecer en las sesiones activas y no se podrán registrar evaluaciones. Podrás restaurarla con sus muestras y resultados.</p>`,'Mover a la papelera','delete-session-form');}
  else if(action==='restore-session'){await api('restoreSession',{sessionId:b.dataset.id});await loadSessions();notify('Sesión restaurada.');}
  else if(action==='detail'){state.filter='';await loadDetail(b.dataset.id);}
  else if(action==='back'){state.analysisMode=false;await loadSessions();}
  else if(action==='refresh')await(state.session?loadDetail(state.session.id):loadSessions());
  else if(action==='more-sessions')await loadSessions(true);
  else if(action==='more-samples')await loadDetail(state.session.id,true);
  else if(action==='new-sample')newSample();
  else if(action==='evaluate')evaluate(b.dataset.id);
  else if(action==='results')results(b.dataset.id);
  else if(action==='results-pdf'){const sample=state.samples.find(m=>m.id===b.dataset.id);if(!sample)throw Error('La muestra ya no está disponible. Actualiza la sesión.');await downloadFlavorResults({session:state.session,sample,inspectors:state.session.inspectors,evaluations:state.evaluations});notify('PDF de resultados generado.');}
  else if(action==='begin-analysis'){state.analysisMode=true;state.analysisSampleId=b.dataset.id||state.analysisSampleId||state.samples[0]?.id||'';state.analysisInspectorUid='';renderDetail();document.querySelector('#analysis-workbench')?.scrollIntoView({behavior:'smooth',block:'start'});}
  else if(action==='hide-analysis'){state.analysisMode=false;renderDetail();}
  else if(action==='export')await exportCsv();
  else if(action==='open-session')modal('Abrir evaluación',`<p>Se habilitarán ${state.session.sampleCount} muestras para ${state.session.inspectorUids.length} inspectores. Después de abrir la sesión no se podrán agregar muestras.</p>`,'Abrir evaluación','open-form');
  else if(action==='close-session')modal('Cerrar sesión','<p>Los inspectores ya no podrán enviar evaluaciones. Solo se podrá cerrar cuando todas las muestras tengan sus evaluaciones completas.</p>','Cerrar sesión','close-form');
 }catch(error){notify(message(error));}finally{state.busy=false;b.disabled=false;}
});
document.addEventListener('change',e=>{if(e.target.id==='analysis-sample'){state.analysisSampleId=e.target.value;state.analysisInspectorUid='';renderDetail();}else if(e.target.id==='analysis-inspector'){state.analysisInspectorUid=e.target.value;renderDetail();}});
document.addEventListener('input',e=>{if(e.target.id==='sample-filter'){const start=e.target.selectionStart;state.filter=e.target.value;renderDetail();const input=document.querySelector('#sample-filter');input.focus();input.setSelectionRange(start,start);}});
document.addEventListener('submit',async e=>{
 const form=e.target;if(!['login-form','session-form','sample-form','evaluation-form','open-form','close-form','lab-evaluation-form','inspectors-form','delete-session-form'].includes(form.id))return;e.preventDefault();if(state.busy)return;state.busy=true;const button=form.querySelector('[type=submit]');button.disabled=true;const data=new FormData(form),errors=form.querySelector('.error');if(errors)errors.textContent='';
 try{
  if(form.id==='login-form'){await signInWithEmailAndPassword(auth,data.get('email').trim(),data.get('password'));return;}
  const id=state.session?.id;
  if(form.id==='session-form'){
   const uids=data.getAll('inspector');const r=await api('createSession',{name:data.get('name'),date:data.get('date'),inspectorUids:uids.slice(0,100)});
   let warning='';try{await addInspectorBatches(r.id,uids.slice(100));}catch(error){warning=message(error);}
   dialog.close();state.trash=false;await loadDetail(r.id);notify(warning||'Sesión creada. Agrega las muestras.');
  }
  else if(form.id==='inspectors-form'){const selected=data.getAll('inspector');if(!selected.length)throw Error('Selecciona al menos un inspector.');try{await addInspectorBatches(id,selected);}catch(error){await loadDetail(id);throw error;}dialog.close();await loadDetail(id);notify('Inspectores agregados. Cada uno puede analizar las mismas muestras.');}
  else if(form.id==='delete-session-form'){await api('deleteSession',{sessionId:state.pendingSessionId});dialog.close();state.analysisMode=false;await loadSessions();notify('Sesión movida a la papelera.');}
  else if(form.id==='sample-form'){await api('addSample',{sessionId:id,sample:Object.fromEntries(fields.map(([key])=>[key,data.get(key)]))});dialog.close();await loadDetail(id);notify('Muestra registrada.');}
  else if(form.id==='lab-evaluation-form'){const sampleId=state.analysisSampleId,inspectorUid=state.analysisInspectorUid;await api('recordEvaluation',{sessionId:id,sampleId,inspectorUid,result:data.get('result'),observations:data.get('observations')});await loadDetail(id);notify('Evaluación del inspector registrada.');document.querySelector('#analysis-workbench')?.scrollIntoView({block:'start'});}
  else if(form.id==='evaluation-form'){await api('evaluate',{sessionId:id,sampleId:state.editSampleId,result:data.get('result'),observations:data.get('observations')});dialog.close();await loadDetail(id);notify('Evaluación registrada.');}
  else if(form.id==='open-form'||form.id==='close-form'){await api(form.id==='open-form'?'openSession':'closeSession',{sessionId:id});dialog.close();await loadDetail(id);notify('Estado de la sesión actualizado.');}
 }catch(error){if(errors)errors.textContent=form.id==='login-form'?'No se pudo iniciar sesión. Revisa tus credenciales y tu conexión.':message(error);else notify(message(error));}finally{state.busy=false;button.disabled=false;}
});
try{await setPersistence(auth,browserSessionPersistence);onAuthStateChanged(auth,async user=>{
 state.generation++;const generation=state.generation;state.user=user;state.admin=false;state.trash=false;state.analysisMode=false;state.analysisSampleId='';state.analysisInspectorUid='';state.session=null;state.sessions=[];state.samples=[];state.evaluations=[];if(dialog.open)dialog.close();account();if(!user){login();return;}
 root.innerHTML='<div class="empty">Cargando tus sesiones…</div>';
 try{const r=await api('bootstrap');if(generation!==state.generation)return;state.admin=r.admin;account();await loadSessions();}catch(error){if(generation!==state.generation)return;root.innerHTML=`<section class="panel"><div class="empty"><strong>No pudimos cargar el laboratorio</strong><p>${esc(message(error))}</p><button class="button" data-action="logout">Volver al inicio de sesión</button></div></section>`;}
});}catch(error){login('No se pudo conectar con Firebase. Revisa tu conexión.');}
