import {esc as E,percent,finite,mean} from './capacitacion-graficos.js?v=20261103-puntos-1';
const BANKS='expalsa_capacitacion_2026_bancos',ATTEMPTS='expalsa_capacitacion_2026_evaluaciones',VERSION='cap-plan-20261103-v1';
export const questionsFor=(bank,scope)=>bank.questions.filter(q=>scope===0||q.day===scope);
export function evaluateTraining(bank,attempt){
 const questions=questionsFor(bank,attempt.scope),answers=JSON.parse(attempt.answers||'{}'),marks=JSON.parse(attempt.marks||'{}');
 const rows=questions.map(q=>{
  const answer=answers[q.id],answered=q.type==='choice'?Number.isInteger(answer)&&answer>=0&&answer<4:typeof answer==='string'&&answer.trim().length>0;
  const reviewed=q.type==='choice'||Number.isInteger(marks[q.id])&&marks[q.id]>=0&&marks[q.id]<=4;
  const points=q.type==='choice'?(answered&&answer===q.answer?1:0):(reviewed?marks[q.id]/4:null);
  return {q,answer,answered,reviewed,points};
 });
 const auto=rows.filter(r=>r.q.type==='choice'),pending=rows.filter(r=>!r.reviewed).length;
 return {rows,pending,answered:rows.filter(r=>r.answered).length,total:rows.length,automatic:auto.length?auto.reduce((n,r)=>n+r.points,0)/auto.length*100:null,score:pending?null:rows.reduce((n,r)=>n+r.points,0)/rows.length*100,days:Array.from({length:10},(_,i)=>{
  const own=rows.filter(r=>r.q.day===i+1);return {day:i+1,total:own.length,answered:own.filter(r=>r.answered).length,pending:own.filter(r=>!r.reviewed).length,score:own.length&&own.every(r=>r.reviewed)?own.reduce((n,r)=>n+r.points,0)/own.length*100:null};
 }).filter(d=>d.total)};
}
export function createTrainingEvaluation({context,notify}){
 let bank=null,records=[],current=null,answers={},marks={},dirty=false,pendingSave=null,debounce=null,timer=null,ticket=0,error='',busy=false,preview=false,showBank=false,focusDay=1;
 const root=()=>document.getElementById('trainingEvaluationRoot');
 const people=()=>context().people().filter(p=>p.name);
 const person=uid=>people().find(p=>p.accountUid===uid);
 const teamRecords=()=>records.filter(r=>!!person(r.accountUid));
 const date=t=>t?.toDate?t.toDate().toLocaleString('es-EC',{timeZone:'America/Guayaquil'}):'—';
 const clock=()=>Date.now();
 const expiry=r=>r.startedAt?.toMillis?.()+r.durationMinutes*60000;
 function view(){return '<div id="trainingEvaluationRoot" class="stack"><p role="status">Consultando evaluaciones de capacitación…</p></div>';}
 function avatar(p){const src=p?.portrait;return typeof src==='string'&&/^(data:image\/(jpeg|png);base64,|blob:|https:\/\/firebasestorage.googleapis.com\/)/.test(src)?'<img class="avatar" src="'+E(src)+'" alt="Foto de '+E(p.name)+'">':'<span class="avatar avatar-fallback">'+E((p?.name||'?').split(/\s+/).slice(0,2).map(s=>s[0]).join(''))+'</span>';}
 function status(r){return r.status==='active'?'En curso':r.status==='submitted'?'Pendiente de revisión':'Calificada';}
 function draw(){
  const el=root();if(!el)return;
  if(!bank){el.innerHTML='<section class="panel"><h2>Evaluación de capacitación</h2><p role="alert">'+E(error||'Consultando banco…')+'</p><button class="button" data-ce="reload">Reintentar</button></section>';el.onclick=click;return;}
  const roster=people();
  if(!roster.length){el.innerHTML='<section class="panel"><h2>Evaluación de capacitación</h2><div class="empty">Sin inspectores asignados.</div></section>';return;}
  el.innerHTML='<style>#trainingEvaluationRoot,#trainingEvaluationRoot>.panel{min-width:0;max-width:100%;width:100%}#trainingEvaluationRoot .form-field{min-width:0}#trainingEvaluationRoot select{min-width:0;max-width:100%}#trainingEvaluationRoot .tablewrap{min-width:0;max-width:100%}#trainingEvaluationRoot .section-title{flex-wrap:wrap;gap:10px}#trainingEvaluationRoot .exam-question{border:1px solid #dce5ea;border-radius:12px;padding:18px;margin:12px 0;background:#fff}#trainingEvaluationRoot .exam-question label{display:flex;gap:10px;align-items:flex-start;padding:10px;border-radius:8px;cursor:pointer}#trainingEvaluationRoot .exam-question input[type=radio]{width:18px;height:18px;flex:none;margin-top:3px}#trainingEvaluationRoot textarea{width:100%;min-height:100px}#trainingEvaluationRoot .exam-time{font-variant-numeric:tabular-nums;font-size:1.2rem;font-weight:800}#trainingEvaluationRoot .exam-days{display:flex;gap:7px;flex-wrap:wrap}#trainingEvaluationRoot .exam-days [aria-pressed=true]{background:#397e88;color:#fff}#trainingEvaluationRoot .exam-note{padding:12px;background:#f0f7f8;border-radius:10px;line-height:1.6}#trainingEvaluationRoot .exam-bad{color:#a53945}#trainingEvaluationRoot .exam-summary{display:flex;gap:12px;flex-wrap:wrap}#trainingEvaluationRoot .exam-summary>div{padding:14px;background:#f2f7f8;border-radius:12px;flex:1;min-width:140px}#trainingEvaluationRoot .exam-summary b{display:block;font-size:1.5rem}#trainingEvaluationRoot .exam-answer{white-space:pre-wrap;overflow-wrap:anywhere}#trainingEvaluationRoot table{min-width:720px}#trainingEvaluationRoot .exam-question:focus{outline:2px solid #397e88}</style>'+
   '<section class="panel"><div class="section-title"><h2>Evaluación del aprendizaje</h2><span class="tag '+(preview?'warn':'good')+'">'+(preview?'PRUEBA SIN GUARDAR':'PLAN DE CAPACITACIÓN')+'</span></div><div class="row"><button class="button" data-ce="bank" '+(current?.status==='active'?'disabled':'')+'>'+(showBank?'Ocultar banco':'Consultar banco y rúbricas')+'</button><button class="button" data-ce="reload" '+(busy?'disabled':'')+'>Actualizar resultados</button></div><p id="trainingExamStatus" role="status">'+E(error)+'</p></section>'+
   (showBank?bankView():current?attemptView():dashboard(roster));
  el.onclick=click;el.oninput=input;el.onchange=input;
  updateTimer();
 }
 function bankView(){
  return '<section class="panel"><h3>Banco exclusivo del plan · versión '+E(bank.version)+'</h3><p>Seis preguntas por jornada. Los valores numéricos de los ejercicios son didácticos; los límites operativos se consultan en los procedimientos y fichas vigentes.</p>'+Array.from({length:10},(_,i)=>'<details><summary>D'+String(i+1).padStart(2,'0')+' · '+E(context().days[i]?.title||'Jornada')+' · 6 preguntas</summary>'+questionsFor(bank,i+1).map(q=>'<article class="exam-question"><b>'+E(q.id)+' · '+E(q.competency)+'</b><p>'+E(q.text)+'</p>'+(q.type==='choice'?'<ol type="A">'+q.options.map((o,j)=>'<li>'+E(o)+(q.answer===j?' <strong>✓ Correcta</strong>':'')+'</li>').join('')+'</ol>':'<ul>'+q.rubric.map(r=>'<li>'+E(r)+'</li>').join('')+'</ul>')+'<p class="note">'+E(q.explanation)+'</p><small>'+E(q.source)+'</small></article>').join('')+'</details>').join('')+'</section>';
 }
 function dashboard(roster){
  return '<section class="panel"><h3>Preparar evaluación</h3><div class="form-grid"><div class="form-field"><label for="capExamPerson">Inspector</label><select id="capExamPerson">'+roster.map(p=>'<option value="'+E(p.accountUid)+'">'+E(p.name)+'</option>').join('')+'</select></div><div class="form-field"><label for="capExamScope">Contenido</label><select id="capExamScope"><option value="0">Plan completo · 60 preguntas</option>'+context().days.map(d=>'<option value="'+d.day+'">D'+String(d.day).padStart(2,'0')+' · '+E(d.title)+' · 6 preguntas</option>').join('')+'</select></div><div class="form-field"><label for="capExamPurpose">Momento</label><select id="capExamPurpose"><option value="inicial">Diagnóstico inicial</option><option value="final">Cierre de capacitación</option><option value="refuerzo">Comprobación de refuerzo</option></select></div><div class="form-field"><label for="capExamMinutes">Tiempo (minutos)</label><input id="capExamMinutes" type="number" min="5" max="180" value="60"></div></div><div class="row"><button class="button primary" data-ce="start" '+(!roster.length||busy?'disabled':'')+'>Iniciar evaluación</button><button class="button" data-ce="preview" '+(!roster.length||busy?'disabled':'')+'>Probar sin guardar</button></div><p class="note">Meta: 85%.</p></section>'+
  '<section class="panel"><h3>Inspectores y resultados de capacitación</h3><div class="tablewrap"><table><thead><tr><th>Inspector</th><th>Resultado integral</th><th>Evaluación en curso</th><th>Historial</th></tr></thead><tbody>'+roster.map(p=>{const own=records.filter(r=>r.accountUid===p.accountUid),last=own.find(r=>r.status==='graded'&&r.scope===0),open=own.find(r=>r.status==='active');return '<tr><td><div class="inspector-identity">'+avatar(p)+'<b>'+E(p.name)+'</b></div></td><td>'+(last?percent(evaluateTraining(bank,last).score)+' · '+E(last.purpose)+'<br><small>'+date(last.submittedAt)+'</small>':'Sin evaluación calificada')+'</td><td>'+(open?'<button class="button sm" data-ce-open="'+E(open.id)+'">Continuar</button>':'Sin evaluación en curso')+'</td><td>'+own.length+' intento(s)<br>'+own.slice(0,5).map(r=>'<button class="button sm" data-ce-open="'+E(r.id)+'">'+E(r.purpose)+' · '+(r.scope?'D'+r.scope:'Plan completo')+' · '+status(r)+'</button>').join(' ')+'</td></tr>';}).join('')+'</tbody></table></div>'+(roster.length?'':'<p class="empty">No hay inspectores activos con nombre registrado.</p>')+'</section>'+
  '<section class="panel"><h3>Historial del grupo</h3>'+teamRecords().map(r=>'<p><button class="button sm" data-ce-open="'+E(r.id)+'">'+E(person(r.accountUid)?.name||'Inspector no activo')+' · '+date(r.startedAt)+' · '+E(r.purpose)+' · '+status(r)+'</button></p>').join('')+(teamRecords().length?'':'<p>Sin evaluaciones guardadas.</p>')+'</section>';
 }
 function attemptView(){
  const p=person(current.accountUid),qs=questionsFor(bank,current.scope),selected=qs.filter(q=>q.day===focusDay),active=current.status==='active',result=evaluateTraining(bank,{...current,answers:JSON.stringify(answers),marks:JSON.stringify(marks)});
  return '<section class="panel"><div class="section-title"><div class="inspector-identity">'+avatar(p)+'<div><h3>'+E(p?.name||'Inspector no activo')+'</h3><span>'+E(current.purpose)+' · '+(current.scope?'Jornada '+current.scope:'Plan completo')+' · '+status(current)+'</span></div></div><button class="button" data-ce="back">Volver al historial</button></div>'+(preview?'<p class="alert">Prueba de funcionamiento: ninguna respuesta ni resultado se guarda en Firebase.</p>':'')+
   (active?'<div class="spread"><span class="exam-time" id="capExamClock"></span><span id="capExamSaved" role="status">'+(dirty?'Respuestas pendientes':'Respuestas guardadas')+'</span></div>':'<p>Entrega: '+date(current.submittedAt)+' · '+(current.submissionKind==='expired'?'Tiempo agotado':'Entrega manual')+'</p>')+
   '<div class="exam-summary"><div><b>'+result.answered+'/'+result.total+'</b>Respondidas</div><div><b>'+percent(result.automatic)+'</b>Selección automática'+(active?' · provisional':'')+'</div><div><b>'+result.pending+'</b>Casos por revisar</div><div><b>'+(active?'En curso':result.pending?'Pendiente':percent(result.score))+'</b>Nota final</div></div>'+
   '<div class="exam-days" style="margin:20px 0" role="group" aria-label="Jornada de la evaluación">'+[...new Set(qs.map(q=>q.day))].map(day=>'<button class="button sm" data-ce-day="'+day+'" aria-pressed="'+(focusDay===day)+'">D'+String(day).padStart(2,'0')+'</button>').join('')+'</div><h3>D'+String(focusDay).padStart(2,'0')+' · '+E(context().days[focusDay-1]?.title||'')+'</h3>'+
   selected.map(q=>questionView(q,qs.indexOf(q)+1,active,result.rows.find(r=>r.q.id===q.id))).join('')+
   (active?'<div class="row"><button class="button" data-ce="save" '+(busy?'disabled':'')+'>Guardar respuestas</button><button class="button primary" data-ce="submit" '+(busy?'disabled':'')+'>Entregar evaluación</button></div><p class="note">Las preguntas sin responder cuentan como cero. Al entregar se bloquean las respuestas y comienza la revisión de casos.</p>':current.status==='submitted'?'<button class="button primary" data-ce="grade" '+(busy?'disabled':'')+'>Guardar revisión y calificar</button>':'')+'</section>'+
   (!active?resultView(result):'');
 }
 function questionView(q,n,active,row){
  const answer=answers[q.id];
  return '<article class="exam-question"><b>'+n+'. '+E(q.competency)+' · '+(q.type==='case'?'Caso de aplicación':'Selección única')+'</b><p>'+E(q.text)+'</p>'+
   (active?q.type==='choice'?q.options.map((o,i)=>'<label><input type="radio" name="'+q.id+'" data-ce-answer="'+q.id+'" value="'+i+'" '+(answer===i?'checked':'')+'><span>'+E(o)+'</span></label>').join(''):'<label for="answer-'+q.id+'">Respuesta del inspector</label><textarea id="answer-'+q.id+'" data-ce-answer="'+q.id+'" maxlength="3000">'+E(answer||'')+'</textarea>':
   '<div class="exam-answer"><b>Respuesta:</b> '+E(q.type==='choice'?(q.options[answer]||'Sin responder'):(answer||'Sin responder'))+'</div>'+
   (q.type==='choice'?'<p class="'+(row.points?'':'exam-bad')+'"><b>'+(row.points?'Correcta':'Incorrecta o sin responder')+'</b> · Respuesta esperada: '+E(q.options[q.answer])+'</p><p class="note">'+E(q.explanation)+'</p>':
   '<p><b>Rúbrica: un punto por indicador demostrado, de 0 a 4.</b></p><ul>'+q.rubric.map(r=>'<li>'+E(r)+'</li>').join('')+'</ul><label for="mark-'+q.id+'">Nivel de cumplimiento (0 a 4)</label><select id="mark-'+q.id+'" data-ce-mark="'+q.id+'" '+(current.status==='graded'?'disabled':'')+'><option value="">Pendiente de revisión</option>'+[0,1,2,3,4].map(v=>'<option value="'+v+'" '+(marks[q.id]===v?'selected':'')+'>'+v+'/4</option>').join('')+'</select>'))+'</article>';
 }
 function resultView(result){
  const graded=current.status==='graded';
  const own=records.filter(r=>r.accountUid===current.accountUid&&r.scope===current.scope&&r.status==='graded'&&r.bankId===current.bankId);
  const initial=own.filter(r=>r.purpose==='inicial').at(-1),baseline=initial?evaluateTraining(bank,initial).score:null;
  return '<section class="panel"><h3>Qué aprendió y qué necesita refuerzo</h3><p>'+(!graded?'Resultado pendiente de revisión de casos.':finite(result.score)&&result.score>=85?'Meta formativa alcanzada.':'Requiere refuerzo en los temas indicados.')+'</p>'+(graded&&current.purpose!=='inicial'&&finite(baseline)?'<p>Diagnóstico inicial comparable: '+percent(baseline)+' · cambio: '+(result.score-baseline).toFixed(1)+' puntos porcentuales.</p>':'')+'<div class="tablewrap"><table><thead><tr><th>Jornada</th><th>Respondidas</th><th>Casos pendientes</th><th>Resultado</th><th>Seguimiento</th></tr></thead><tbody>'+result.days.map(d=>'<tr><td>D'+d.day+' · '+E(context().days[d.day-1]?.title||'')+'</td><td>'+d.answered+'/'+d.total+'</td><td>'+d.pending+'</td><td>'+percent(d.score)+'</td><td>'+(!finite(d.score)?'Completar revisión':d.score>=85?'Aprendizaje demostrado en esta prueba':'Repasar y volver a comprobar')+'</td></tr>').join('')+'</tbody></table></div><h4>Preguntas que requieren atención</h4>'+result.rows.filter(r=>r.reviewed&&r.points<1).map(r=>'<p><b>'+E(r.q.id)+' · '+E(r.q.topic)+'</b>: '+E(r.q.text)+'<br><span class="note">'+E(r.q.explanation)+'</span></p>').join('')+'<p class="note">Esta evaluación comprueba comprensión del plan. La ejecución práctica se comprueba en Capacitación. Los resultados no sustituyen las calificaciones de la plataforma de Calidad.</p></section>';
 }
 function input(e){if(e.target.id==='capExamScope'){const minutes=root()?.querySelector('#capExamMinutes');if(minutes)minutes.value=Number(e.target.value)===0?'60':'15';}
  if(e.target.dataset.ceAnswer&&current?.status==='active'){
   const q=bank.questions.find(q=>q.id===e.target.dataset.ceAnswer);answers[q.id]=q.type==='choice'?Number(e.target.value):e.target.value.slice(0,3000);dirty=true;clearTimeout(debounce);debounce=setTimeout(()=>flush().catch(err=>report(err)),650);
   const el=document.getElementById('capExamSaved');if(el)el.textContent='Respuestas pendientes…';
  }
  if(e.target.dataset.ceMark&&current?.status==='submitted'){const id=e.target.dataset.ceMark;if(e.target.value==='')delete marks[id];else marks[id]=Number(e.target.value);dirty=true;}
 }
 function report(err){error=err.message||String(err);notify(error);const el=document.getElementById('trainingExamStatus');if(el)el.textContent=error;}
 async function updateRecord(change){
  if(preview){current={...current,...change(current)};return;}
  const {fs,db,user}=context(),expected=current.rev,ref=fs.doc(db,ATTEMPTS,current.id);
  const result=await fs.runTransaction(db,async tx=>{
   const snap=await tx.get(ref);if(!snap.exists())throw Error('No existe el intento.');
   const old=snap.data();if(old.rev!==expected)throw Error('El intento cambió en otra pestaña. Actualiza los resultados para continuar.');
   const changes=change(old);tx.update(ref,{...changes,rev:old.rev+1,updatedAt:fs.serverTimestamp(),updatedBy:user.uid});return {...old,...changes,rev:old.rev+1};
  });current=result;
 }
 async function flush(){
  clearTimeout(debounce);
  if(pendingSave)await pendingSave;
  if(!dirty||!current)return;
  if(current.status!=='active')return;
  const serialized=JSON.stringify(answers);
  pendingSave=updateRecord(old=>{if(old.status!=='active')throw Error('El intento ya fue entregado.');return {answers:serialized};});
  try{await pendingSave;dirty=JSON.stringify(answers)!==serialized;const el=document.getElementById('capExamSaved');if(el)el.textContent=dirty?'Respuestas pendientes…':preview?'Prueba sin guardar':'Respuestas guardadas';}finally{pendingSave=null;}
 }
 async function load(){
  const turn=++ticket,{fs,db,user}=context();if(!user)return;
  try{const [b,r]=await Promise.all([fs.getDoc(fs.doc(db,BANKS,VERSION)),fs.getDocs(fs.collection(db,ATTEMPTS))]);if(turn!==ticket||context().user?.uid!==user.uid)return;if(!b.exists())throw Error('El banco de capacitación todavía no está disponible.');bank=b.data();records=r.docs.map(x=>({id:x.id,...x.data()})).sort((a,b)=>(b.startedAt?.toMillis?.()||0)-(a.startedAt?.toMillis?.()||0));error='';draw();}
  catch(err){if(turn===ticket){error='No se pudieron consultar las evaluaciones: '+err.message;draw();}}
 }
 async function start(demo){
  const uid=root().querySelector('#capExamPerson').value,scope=Number(root().querySelector('#capExamScope').value),purpose=root().querySelector('#capExamPurpose').value,durationMinutes=Number(root().querySelector('#capExamMinutes').value);
  if(!person(uid))throw Error('El inspector no pertenece al grupo de capacitación.');
  if(!Number.isInteger(durationMinutes)||durationMinutes<5||durationMinutes>180)throw Error('El tiempo debe ser un entero de 5 a 180 minutos.');
  const open=records.find(r=>r.accountUid===uid&&r.status==='active');if(open&&!demo){await openRecord(open.id);return;}
  const {fs,db,user}=context();preview=demo;answers={};marks={};dirty=false;focusDay=scope||1;
  if(demo){current={id:'preview',accountUid:uid,scope,purpose,durationMinutes,bankId:VERSION,status:'active',answers:'{}',marks:'{}',startedAt:{toMillis:()=>clock(),toDate:()=>new Date()},rev:1};const started=clock();current.startedAt={toMillis:()=>started,toDate:()=>new Date(started)};}
  else{
   const ref=fs.doc(fs.collection(db,ATTEMPTS));await fs.setDoc(ref,{id:ref.id,accountUid:uid,scope,purpose,durationMinutes,bankId:VERSION,status:'active',answers:'{}',marks:'{}',startedAt:fs.serverTimestamp(),createdAt:fs.serverTimestamp(),updatedAt:fs.serverTimestamp(),submittedAt:null,gradedAt:null,submissionKind:'',createdBy:user.uid,updatedBy:user.uid,rev:1});
   current={id:ref.id,...(await fs.getDoc(ref)).data()};
  }startTimer();draw();
 }
 async function openRecord(id){
  const {fs,db}=context();preview=false;const snap=await fs.getDoc(fs.doc(db,ATTEMPTS,id));if(!snap.exists())throw Error('Intento no encontrado.');const record={id,...snap.data()};if(!person(record.accountUid))throw Error('El inspector no pertenece al grupo de capacitación.');current=record;answers=JSON.parse(current.answers);marks=JSON.parse(current.marks);dirty=false;focusDay=current.scope||1;showBank=false;startTimer();draw();
 }
 function startTimer(){clearInterval(timer);if(current?.status==='active')timer=setInterval(()=>{updateTimer();if(!busy&&clock()>=expiry(current))submit(true).catch(report);},1000);}
 function updateTimer(){const el=document.getElementById('capExamClock');if(el&&current){const sec=Math.max(0,Math.ceil((expiry(current)-clock())/1000));el.textContent='Tiempo restante · '+Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');}}
 async function submit(expired=false){
  if(!current||current.status!=='active'||busy)return;
  busy=true;try{
   expired=expired||clock()>=expiry(current);if(!expired)await flush();else{clearTimeout(debounce);if(pendingSave){try{await pendingSave;}catch{}}if(!preview){const {fs,db}=context();const stored=await fs.getDoc(fs.doc(db,ATTEMPTS,current.id));current={id:current.id,...stored.data()};}answers=JSON.parse(current.answers);}
   const {fs}=context();
   await updateRecord(old=>({status:'submitted',answers:old.answers,submittedAt:preview?{toDate:()=>new Date()}:fs.serverTimestamp(),submissionKind:expired?'expired':'manual'}));
   dirty=false;clearInterval(timer);if(!preview){await refreshRecords();current=records.find(r=>r.id===current.id)||current;}draw();
  }finally{busy=false;draw();}
 }
 async function grade(){
  const result=evaluateTraining(bank,{...current,marks:JSON.stringify(marks)});if(result.rows.some(r=>r.q.type==='case'&&!r.answered&&r.points>0))throw Error('Un caso sin responder debe calificarse con cero.');if(result.pending)throw Error('Revisa los '+result.pending+' casos pendientes antes de calificar.');
  const {fs}=context();await updateRecord(()=>({status:'graded',marks:JSON.stringify(marks),gradedAt:preview?{toDate:()=>new Date()}:fs.serverTimestamp()}));dirty=false;if(!preview)await refreshRecords();draw();
 }
 async function refreshRecords(){const {fs,db}=context();const r=await fs.getDocs(fs.collection(db,ATTEMPTS));records=r.docs.map(x=>({id:x.id,...x.data()})).sort((a,b)=>(b.startedAt?.toMillis?.()||0)-(a.startedAt?.toMillis?.()||0));}
 async function click(e){
  const b=e.target.closest('button');if(!b||busy)return;
  try{
   if(b.dataset.ceDay){await flush();focusDay=Number(b.dataset.ceDay);draw();return;}
   if(b.dataset.ceOpen){await openRecord(b.dataset.ceOpen);return;}
   const action=b.dataset.ce;
   if(action==='start'||action==='preview'){busy=true;try{await start(action==='preview');}finally{busy=false;draw();}return;}
   if(action==='save'){await flush();return;}
   if(action==='submit'){if(confirm('¿Entregar la evaluación? Las respuestas quedarán bloqueadas. Las preguntas sin responder cuentan como cero.'))await submit();return;}
   if(action==='grade'){await grade();return;}
   if(action==='back'){if(current?.status==='submitted'&&dirty){if(!confirm('Hay una revisión de casos sin guardar. ¿Volver sin calificar?'))return;}await flush();clearInterval(timer);current=null;dirty=false;preview=false;draw();return;}
   if(action==='bank'){if(current?.status==='active')throw Error('Entrega la evaluación antes de consultar las respuestas del banco.');await flush();showBank=!showBank;draw();return;}
   if(action==='reload'){await beforeLeave();current=null;preview=false;showBank=false;await load();}
  }catch(err){report(err);}
 }
 async function beforeLeave(){await flush();if(current?.status==='submitted'&&dirty)throw Error('Guarda la revisión y califica, o vuelve al historial descartando esa revisión.');}
 function stop(){clearInterval(timer);clearTimeout(debounce);}
 function clear(){ticket++;stop();bank=null;records=[];current=null;answers={};marks={};dirty=false;preview=false;showBank=false;error='';}
 async function activate(){if(bank){draw();startTimer();}else await load();}
 return {view,activate,beforeLeave,stop,clear};
}


