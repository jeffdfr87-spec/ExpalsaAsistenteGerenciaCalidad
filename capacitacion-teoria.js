import {decodeAnswers,answerLabel,keyLabel,scoreTheory,criterion} from './capacitacion-teoria-core.js?v=20261102-teoria-1';
export const THEORY_KEYS=Object.freeze(['1','1_2','2','2_2','3','3_2']);
const finite=n=>Number.isFinite(n)&&n>=0&&n<=100;
const delivered=a=>a&&['submitted','graded'].includes(a.status);
const mean=values=>values.length?values.reduce((s,n)=>s+n,0)/values.length:null;
const stageOf=key=>Number(String(key).split('_')[0]);
const numberOf=key=>String(key).endsWith('_2')?2:1;
const stable=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=n=>finite(n)?n.toFixed(2)+'%':'Pendiente de calificación';
export function millis(value){if(value?.toMillis)return value.toMillis();if(value?.toDate)return +value.toDate();if(value&&Number.isFinite(value.seconds))return value.seconds*1000+(value.nanoseconds||0)/1e6;if(typeof value==='string'||value instanceof Date){const t=+new Date(value);return Number.isFinite(t)?t:null;}return null;}
function dateLabel(value){const ms=millis(value);return ms===null?'Fecha no disponible':new Intl.DateTimeFormat('es-EC',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Guayaquil'}).format(new Date(ms));}
export function officialScore(attempt,automatic,uid,key){
  if(!delivered(attempt))return null;
  if(automatic){if(automatic.uid!==uid||automatic.stage!==stageOf(key)||!Number.isInteger(automatic.correctCount)||!Number.isInteger(automatic.total)||![12,28,30,43,44].includes(automatic.total)||automatic.correctCount<0||automatic.correctCount>automatic.total)throw Error('La autocalificación no corresponde con el inspector o con la etapa.');return automatic.correctCount*100/automatic.total;}
  return attempt.status==='graded'&&finite(attempt.score)?attempt.score:null;
}
export function buildAttemptReview({uid,key,attempt,automatic=null,bank=null,secret=null,historical=null}){
  const result={key:String(key),stage:stageOf(key),number:numberOf(key),status:attempt.status,date:dateLabel(attempt.submittedAt||automatic?.gradedAt||attempt.gradedAt),version:attempt.version||'',score:null,correctCount:null,total:null,verified:false,questions:[],competencies:[],topics:[],warnings:[]};
  try{if(attempt.uid!==uid||attempt.stage!==result.stage)throw Error('La entrega no corresponde con la cuenta o con la etapa.');result.score=officialScore(attempt,automatic,uid,key);}catch(e){result.warnings.push(e.message);return result;}
  if(automatic&&result.score!==null){result.correctCount=automatic.correctCount;result.total=automatic.total;}
  if(!delivered(attempt))return result;
  if(!bank||!secret?.keys||!Array.isArray(bank.questions)||bank.stage!==result.stage||bank.version!==attempt.version||secret.version!==bank.version){result.warnings.push('No se pudo verificar el banco y la clave originales. No se muestran preguntas de otra versión.');return result;}
  if(bank.questions.some(q=>!Object.hasOwn(secret.keys,q.id))){result.warnings.push('Faltan claves para verificar el banco original. No se reconstruyen respuestas correctas.');return result;}
  if(new Set(bank.questions.map(q=>q.id)).size!==bank.questions.length){result.warnings.push('El banco contiene identificadores repetidos.');return result;}
  try{
    const calculated=scoreTheory(attempt,bank,secret.keys,attempt.writtenScores||{}),answers=decodeAnswers(attempt),points=new Map(calculated.rows.map(r=>[r.id,r.points]));
    const verified=result.score!==null&&calculated.pending.length===0&&Math.abs(calculated.score-result.score)<=.011&&(!automatic||automatic.total===bank.questions.length);
    result.verified=verified;result.total=bank.questions.length;
    if(!automatic&&verified)result.correctCount=calculated.correct;
    if(!verified)result.warnings.push(result.score===null?'El intento no tiene calificación oficial disponible. El informe no lo recalifica.':'La revisión del banco no coincide con la nota oficial o tiene preguntas pendientes. Se conserva la nota oficial sin atribuir resultados por competencia.');
    const comp={},topics={};
    result.questions=bank.questions.map((q,index)=>{
      const expected=secret.keys[q.id],supplement=historical?.[q.id];let explanation=expected?.rubric||q.explanation||'';
      if(!explanation&&supplement&&supplement.text===q.text&&supplement.before===(q.before||'')&&supplement.after===(q.after||'')&&stable(supplement.key)===stable(expected))explanation=supplement.explanation||'';
      const assigned=criterion(q,bank),ids=Array.isArray(assigned)?assigned:assigned?[assigned]:[],point=points.get(q.id);
      const topic=String(q.topic||'Sin tema identificado');
      if(verified){for(const id of ids){const value=comp[id]||(comp[id]={earned:0,total:0});value.total++;value.earned+=point||0;}const t=topics[topic]||(topics[topic]={earned:0,total:0});t.total++;t.earned+=point||0;}
      return {number:index+1,id:q.id,topic,competencies:ids,text:String(q.text||'')+(q.before?'\nCaso: '+q.before+' ______ '+(q.after||''):''),answer:answerLabel(q,answers[q.id]),correct:keyLabel(q,expected),explanation:explanation||'Fundamento no disponible en la versión original verificada.',points:verified?point:null};
    });
    result.competencies=Object.entries(comp).map(([id,v])=>({id,score:v.earned/v.total*100,questions:v.total}));
    result.topics=Object.entries(topics).map(([topic,v])=>({topic,score:v.earned/v.total*100,questions:v.total}));
    if(result.questions.some(q=>q.competencies.length===0))result.warnings.push('Hay preguntas sin correspondencia documentada con C1–C10; no se les asigna una competencia por suposición.');
  }catch{result.verified=false;result.questions=[];result.competencies=[];result.topics=[];result.warnings.push('No fue posible interpretar el banco original. Se conserva la calificación oficial disponible.');}
  return result;
}
export function summarizeTheory(attempts,extra={}){
  const completed=attempts.filter(a=>delivered(a)&&finite(a.score));
  const points=Array.from({length:10},(_,i)=>{const id='C'+(i+1),values=completed.flatMap(a=>a.verified?a.competencies.filter(c=>c.id===id):[]);return {id,score:mean(values.map(c=>c.score)),attempts:values.length,questions:values.reduce((n,c)=>n+c.questions,0)};});
  const average=mean(completed.map(a=>a.score));
  return {...extra,attempts,average,completed:completed.length,verified:completed.filter(a=>a.verified).length,points,weak:points.filter(p=>p.score!==null&&p.score<75),strong:points.filter(p=>p.score!==null&&p.score>=75),needsReinforcement:(average!==null&&average<85)||points.some(p=>p.score!==null&&p.score<75),unavailable:attempts.filter(a=>delivered(a)&&(!finite(a.score)||!a.verified)).length};
}
export async function loadTheory({fs,db,user,people,scope='all',getUser=()=>user,progress=()=>{}}){
  people=people.filter(p=>p.active===true&&p.deleted!==true);
  const output={},cache=new Map();
  const guard=()=>{if(getUser()?.uid!==user.uid)throw Error('La sesión administrativa cambió.');};
  const read=(...path)=>{const id=path.join('/');if(!cache.has(id))cache.set(id,(async()=>{guard();const s=await fs.getDocFromServer(fs.doc(db,...path));guard();return s.exists()?s.data():null;})());return cache.get(id);};
  let next=0,done=0;
  async function worker(){while(next<people.length){const person=people[next++];guard();const uid=person.accountUid;
    if(!uid){output[person.id]=summarizeTheory([],{linkStatus:'unlinked',note:'El inspector no tiene una cuenta vinculada. No se buscan resultados por nombre ni por correo.'});done++;progress(done,people.length);continue;}
    try{const access=await read('expalsa_calidad_accesos',uid);if(access?.active!==true||access.deleted===true){output[person.id]=summarizeTheory([],{linkStatus:'inactive',note:'La cuenta vinculada no está activa en la plataforma de evaluación.'});continue;}
      const [attemptDocs,automaticDocs,summaryDocs]=await Promise.all([fs.getDocs(fs.collection(db,'expalsa_calidad_etapas',uid,'entregas')),fs.getDocs(fs.collection(db,'expalsa_calidad_autocalificaciones',uid,'etapas')),fs.getDocs(fs.collection(db,'expalsa_calidad_resultados',uid,'etapas'))]);guard();
      const byId=snap=>new Map(snap.docs.map(d=>[d.id,d.data()])),attempts=byId(attemptDocs),automatic=byId(automaticDocs),summaries=byId(summaryDocs),reviews=[];let omitted=0;
      for(const key of THEORY_KEYS){const original=attempts.get(key);const summary=summaries.get(key);if(!original&&!summary)continue;const attempt=original||summary;
        const submission=millis(attempt.submittedAt||automatic.get(key)?.gradedAt||attempt.gradedAt),enrollment=millis(person.createdAt);
        if(scope==='enrollment'&&(enrollment===null||submission===null||submission<enrollment)){omitted++;continue;}
        let bank=null,secret=null,historical=null,readError='';
        if(original&&delivered(attempt)){try{const dynamic=[2,3].includes(attempt.bankSchema);if(dynamic&&(!attempt.version||attempt.version.includes('/')))throw Error('Versión de banco inválida.');[bank,secret]=await Promise.all([dynamic?read('expalsa_calidad_bancos',attempt.version):read('expalsa_calidad_cuestionarios',key),dynamic?read('expalsa_calidad_soluciones',attempt.version):read('expalsa_calidad_claves',key)]);if(bank?.questions?.some(q=>!q.explanation&&!secret?.keys?.[q.id]?.rubric)){try{historical=(await read('expalsa_calidad_fundamentos','historicos_v2'))?.questions||null;}catch{readError='No se pudieron consultar los fundamentos históricos.';}}}catch(e){readError='No se pudo consultar el banco original: '+e.message;}}
        const review=buildAttemptReview({uid,key,attempt,automatic:automatic.get(key)||null,bank,secret,historical});if(!original)review.warnings.push('Solo está disponible el resumen oficial, sin la entrega original para revisar preguntas.');if(readError)review.warnings.push(readError);reviews.push(review);
      }
      output[person.id]=summarizeTheory(reviews,{linkStatus:'linked',scope,omitted,note:scope==='enrollment'?'Solo se incluyen entregas con fecha verificable desde la inscripción actual. Se omiten '+omitted+' registros anteriores o sin fecha verificable.':'Se consulta el expediente teórico completo de la cuenta, con fechas visibles. Los resultados históricos no se atribuyen automáticamente al período de capacitación actual.'});
    }catch(e){guard();output[person.id]=summarizeTheory([],{linkStatus:'error',note:'No se pudieron recuperar las evaluaciones teóricas: '+e.message});}finally{done++;progress(done,people.length);}
  }}
  await Promise.all(Array.from({length:Math.min(3,people.length)},worker));guard();return output;
}
function table(head,rows){return `<table><thead><tr>${head.map(s=>`<th>${E(s)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(s=>`<td>${s}</td>`).join('')}</tr>`).join('')}</tbody></table>`;}
export function theorySection(theory,{details=true,competencies=[]}={}){
  const label=id=>{const c=competencies.find(c=>c.id===id);return c?id+' '+c.label:id;};
  if(!theory)return '<h3>Evaluaciones teóricas de la plataforma de Calidad</h3><p>Sin consulta de resultados teóricos.</p>';
  let html=`<h3>Evaluaciones teóricas de la plataforma de Calidad</h3><p class="note">${E(theory.note||'')}</p><p><strong>Promedio teórico oficial disponible:</strong> ${pct(theory.average)} · <strong>Intentos calificados:</strong> ${theory.completed} · <strong>Bancos comprobados:</strong> ${theory.verified}</p>`;
  if(!theory.attempts.length)return html+'<p>No hay intentos disponibles dentro del alcance seleccionado. La ausencia de una nota no se convierte en cero.</p>';
  html+=table(['Etapa e intento','Fecha de entrega','Estado','Aciertos / preguntas','Nota oficial'],theory.attempts.map(a=>[`Etapa ${a.stage} · intento ${a.number}`,E(a.date),a.status==='graded'?'Calificada':a.status==='submitted'?'Entregada':'En curso',a.correctCount===null?'Sin conteo oficial':`${a.correctCount}/${a.total}`,pct(a.score)]));
  html+='<p class="note">El promedio mantiene todos los intentos calificados, incluidos los segundos intentos, igual que la plataforma de origen. No se conserva únicamente la nota mayor. La meta teórica del plan es 85%; la referencia del perfil por competencia de la plataforma es 75%. No se modifica ninguna nota oficial.</p>';
  const points=theory.points.filter(p=>p.score!==null);if(points.length)html+=table(['Competencia','Resultado teórico verificado','Preguntas / intentos'],points.map(p=>[E(label(p.id)),pct(p.score),`${p.questions} / ${p.attempts}`]));
  if(theory.strong.length)html+='<p><strong>Fortalezas teóricas según el perfil de la plataforma:</strong> '+theory.strong.map(p=>E(label(p.id))+' '+pct(p.score)).join('; ')+'.</p>';
  if(theory.weak.length)html+='<p><strong>Brechas teóricas por competencia:</strong> '+theory.weak.map(p=>E(label(p.id))+' '+pct(p.score)).join('; ')+'.</p>';
  for(const a of theory.attempts){html+=`<h4>Etapa ${a.stage} intento ${a.number} ${a.verified?'banco original comprobado':'verificación pendiente'}</h4><p><strong>Versión del banco:</strong> <span class="preserve">${E(a.version||'No disponible')}</span></p>`;
    if(a.warnings.length)html+='<ul>'+a.warnings.map(w=>`<li>${E(w)}</li>`).join('')+'</ul>';
    if(a.topics.length)html+=table(['Tema','Resultado verificado','Preguntas'],a.topics.map(t=>[E(t.topic),pct(t.score),String(t.questions)]));
    if(details)for(const q of a.questions)html+=`<article class="question-detail"><h4>Pregunta ${q.number} ${E(q.topic)}</h4><p class="preserve">${E(q.text)}</p><p><strong>Competencias:</strong> ${E(q.competencies.join(', ')||'Sin correspondencia verificada')}</p><p><strong>Respuesta del inspector:</strong> <span class="preserve">${E(q.answer)}</span></p><p><strong>Respuesta correcta o criterio esperado:</strong> <span class="preserve">${E(q.correct)}</span></p><p><strong>Fundamento:</strong> <span class="preserve">${E(q.explanation)}</span></p><p><strong>Puntos comprobados:</strong> ${q.points===null?'No verificables':q.points.toFixed(2)+' / 1'}</p></article>`;
  }
  return html;
}
export function exampleTheory(people){
  return Object.fromEntries(people.map((p,i)=>{
    const reviews=[];
    for(const key of i===0?['1','1_2','2','3']:['1','2','3']){
      const stage=stageOf(key),version='EJEMPLO-BANCO-'+key,questions=Array.from({length:30},(_,j)=>({id:'DEMO_C'+(j%10+1)+'_'+j,criterionId:'C'+(j%10+1),topic:'C'+(j%10+1)+' · Tema demostrativo',type:j%6===0?'fill':'choice',text:j%6===0?'Ejemplo de cálculo: ¿cuántas piezas hay en dos muestras de diez piezas?':'Pregunta demostrativa de criterio técnico '+(j+1),inputMode:j%6===0?'numeric':undefined,options:j%6===0?undefined:[{id:'A',label:'Aplicar y documentar el procedimiento vigente'},{id:'B',label:'Continuar sin comprobar el requisito'}],explanation:'Fundamento ficticio para revisar el diseño. No pertenece al banco oficial de EXPALSA.'}));
      const keys=Object.fromEntries(questions.map(q=>[q.id,q.type==='fill'?{accepted:['20']}:{value:'A'}]));
      const correct=i===0&&key==='1'?15:i===1?22:27;
      const missed=new Set(stage===1?[27,28,29]:stage===2?[24,25,26]:[20,21,22]);
      const answers=Object.fromEntries(questions.map((q,j)=>{const right=i<2?j<correct:!missed.has(j);return [q.id,q.type==='fill'?(right?'20':'10'):(right?'A':'B')];}));
      const attempt={uid:p.accountUid||'demo_uid_'+i,stage,status:'submitted',bankSchema:3,version,answers,submittedAt:'2026-11-'+String(stage*3+1).padStart(2,'0')+'T14:00:00Z'};
      reviews.push(buildAttemptReview({uid:attempt.uid,key,attempt,automatic:{uid:attempt.uid,stage,correctCount:correct,total:30},bank:{stage,schema:3,version,questions},secret:{stage,version,keys}}));
    }
    return [p.id,summarizeTheory(reviews,{linkStatus:'linked',note:'Simulación ficticia: tres etapas, banco de 30 preguntas por intento y un segundo intento demostrativo. No son exámenes ni notas reales.'})];
  }));
}
