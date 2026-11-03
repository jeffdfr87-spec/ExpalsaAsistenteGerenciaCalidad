import {evaluateTraining} from './capacitacion-evaluacion.js?v=20261103-puntos-1';
import {progressModel as baseModel,esc as E,finite,mean,percent} from './capacitacion-graficos.js?v=20261103-puntos-1';
export const PLAN_ATTEMPTS='expalsa_capacitacion_2026_evaluaciones';
const stamp=t=>t?.toMillis?.()??(t?.seconds? t.seconds*1000:0);
export function selectPlanAttempt(records,person){
 return records.filter(r=>r.accountUid===person.accountUid&&r.scope===0&&r.status==='graded'&&(!stamp(person.createdAt)||stamp(r.startedAt)>=stamp(person.createdAt))).sort((a,b)=>stamp(b.startedAt)-stamp(a.startedAt)||String(b.id).localeCompare(String(a.id)))[0]||null;
}
export function summarizeTheory(attempts=[],extra={}){
 const a=attempts.filter(a=>a.key==='1'&&a.stage===1&&a.status==='graded'&&finite(a.score)).slice(-1),selected=a[0];
 const points=Array.from({length:10},(_,i)=>{const id='C'+(i+1);return {id,score:selected?.competencies?.find(c=>c.id===id)?.score??null,attempts:selected?1:0,questions:selected?.competencies?.find(c=>c.id===id)?.questions||0};});
 return {attempts:a,average:selected?.score??null,completed:a.length,verified:a.length,points,weak:points.filter(p=>finite(p.score)&&p.score<85),strong:points.filter(p=>finite(p.score)&&p.score>=85),needsReinforcement:finite(selected?.score)&&selected.score<85,unavailable:0,linkStatus:'linked',note:selected?'Último intento integral calificado de la etapa única de capacitación.':'Sin evaluación integral calificada del plan.',...extra};
}
export function trainingTheory(bank,record){
 const result=evaluateTraining(bank,record);
 if(result.pending||!finite(result.score))return summarizeTheory([],{note:'La evaluación del plan tiene casos pendientes de calificación.'});
 const competencies=Array.from({length:10},(_,i)=>{const id='C'+(i+1),rows=result.rows.filter(r=>r.q.competency===id);return {id,score:rows.length?mean(rows.map(r=>r.points*100)):null,questions:rows.length};});
 const date=record.submittedAt?.toDate?.().toLocaleString('es-EC',{timeZone:'America/Guayaquil'})||'';
 return summarizeTheory([{key:'1',stage:1,number:1,status:'graded',score:result.score,verified:true,competencies,date,recordId:record.id,version:record.bankId,questions:result.rows.map(r=>({number:result.rows.indexOf(r)+1,day:r.q.day,text:r.q.text,answer:r.q.type==='choice'?(r.q.options[r.answer]||'Sin responder'):(r.answer||'Sin responder'),expected:r.q.type==='choice'?r.q.options[r.q.answer]:r.q.rubric.join(' '),explanation:r.q.explanation,points:r.points,competency:r.q.competency}))}]);
}
export async function loadTheory({fs,db,user,people,getUser=()=>user}){
 const snapshot=await fs.getDocs(fs.collection(db,PLAN_ATTEMPTS)),records=snapshot.docs.map(d=>({id:d.id,...d.data()})),banks=new Map(),out={};
 for(const person of people){
  if(getUser()?.uid!==user.uid)throw Error('La sesión cambió.');
  const record=selectPlanAttempt(records,person);
  if(!record){out[person.id]=summarizeTheory([]);continue;}
  if(!banks.has(record.bankId)){const doc=await fs.getDoc(fs.doc(db,'expalsa_capacitacion_2026_bancos',record.bankId));banks.set(record.bankId,doc.exists()?doc.data():null);}
  const bank=banks.get(record.bankId);
  out[person.id]=bank?trainingTheory(bank,record):summarizeTheory([],{unavailable:1,note:'No se pudo verificar el banco de capacitación del intento.'});
 }
 return out;
}
export function progressModel(data){
 const model=baseModel(data);
 return {...model,theoryKeys:['1'],theoryLabels:['Etapa única · Evaluación del plan'],series:model.series.map(s=>({...s,theory:[s.theoryMean]}))};
}
export function exampleTheory(people){
 return Object.fromEntries(people.map((p,i)=>{const score=Math.min(100,48+i*4.5);return [p.id,summarizeTheory([{key:'1',stage:1,number:1,status:'graded',verified:true,score,competencies:Array.from({length:10},(_,j)=>({id:'C'+(j+1),score:Math.min(100,Math.max(15,score+(j%3-1)*8)),questions:1})),questions:[],date:'Ejemplo simulado'}])];}));
}
export function theorySection(theory,{details=true,competencies=[]}={}){
 let html='<h3>Evaluación del plan · etapa única</h3><p>'+E(theory.note)+'</p><p><strong>Resultado integral:</strong> '+percent(theory.average)+'</p><p>La medición corresponde al último intento integral calificado en Evaluación de capacitación. La meta formativa es 85%.</p>';
 if(theory.points.some(p=>finite(p.score)))html+='<table><thead><tr><th>Competencia</th><th>Resultado</th></tr></thead><tbody>'+theory.points.map(p=>'<tr><td>'+E(p.id+' · '+(competencies.find(c=>c.id===p.id)?.label||''))+'</td><td>'+percent(p.score)+'</td></tr>').join('')+'</tbody></table>';
 if(details)for(const a of theory.attempts)for(const q of a.questions||[])html+='<article><h4>Jornada '+q.day+' · '+E(q.competency)+'</h4><p>'+E(q.text)+'</p><p>Respuesta: '+E(q.answer)+'</p><p>Esperado: '+E(q.expected)+'</p><p>'+E(q.explanation)+' · '+q.points.toFixed(2)+'/1</p></article>';
 return html;
}

