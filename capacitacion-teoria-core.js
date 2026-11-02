// Funciones puras tomadas de la plataforma de evaluacion de Calidad vigente.
// No contiene preguntas, respuestas oficiales ni operaciones de escritura.

const QUESTION_TYPES={choice:'Seleccionar',fill:'Completar',match:'Enlazar',order:'Ordenar',classify:'Encajar',text:'Escribir'};
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
const json=(value,fallback)=>{try{const x=JSON.parse(value);return x??fallback;}catch{return fallback;}};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ').replace(/,/g,'.');
const questionType=q=>q.type||'choice';
const emptyAnswer=q=>q.type?'':-1;
function decodeAnswers(attempt){
 const data=attempt?.bankSchema===2?json(attempt.answers,{}):attempt?.answers;
 if(!object(data))return{};
 return Object.fromEntries(Object.entries(data).filter(([k,v])=>/^[\w-]{1,80}$/.test(k)&&(attempt.bankSchema!==2||typeof v==='string'&&v.length<=1500)));
}
const calculationNumber=v=>{const t=String(v??'').trim().replace(',','.');return /^-?\d+(?:\.\d+)?$/.test(t)&&Number.isFinite(Number(t))?String(Number(t)):null;};
function calculationData(a){try{const v=JSON.parse(a);return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return{};}}
function calculationCanonical(q,a){const v=calculationData(a),values=q.calculation.fields.map((_,i)=>calculationNumber(v.values?.[i]));const result=calculationNumber(v.result);return JSON.stringify({formula:String(v.formula??''),values:values.map(x=>x??''),result:result===null?'':Number(result).toFixed(2)});}
function calculationComplete(q,a){const v=calculationData(a);return q.options.some(o=>o.id===v.formula)&&Array.isArray(v.values)&&v.values.length===q.calculation.fields.length&&v.values.every(x=>calculationNumber(x)!==null)&&calculationNumber(v.result)!==null;}
function calculationLabel(q,a){const v=calculationData(a);return 'Fórmula: '+(q.options.find(o=>o.id===v.formula)?.label||'Sin seleccionar')+' · '+q.calculation.fields.map((f,i)=>f.id+' = '+(v.values?.[i]||'Sin respuesta')).join('; ')+' · Resultado: '+(v.result||'Sin respuesta');}
function canonicalAnswer(q,value){
 if(q.calculation)return calculationCanonical(q,value);
 if(typeof value!=='string')return value;
 if(q.type==='match'||q.type==='classify'){
  const pairs=json(value,null);if(!object(pairs))return '';
  return JSON.stringify(Object.fromEntries(Object.entries(pairs).sort(([a],[b])=>a.localeCompare(b))));
 }
 if(q.type==='order'){const order=json(value,null);return Array.isArray(order)?JSON.stringify(order):'';}
 const normalized=normalize(value);
 if(q.type==='fill'&&['numeric','decimal'].includes(q.inputMode)&&/^-?\d+(\.\d+)?$/.test(normalized))return String(Number(normalized));
 return normalized;
}
const encodeAnswers=(answers,schema,bank)=>schema===2?JSON.stringify(answers):schema===3?Object.fromEntries((bank?.questions||[]).filter(q=>Object.hasOwn(answers,q.id)).map(q=>[q.id,canonicalAnswer(q,answers[q.id])])):{...answers};
function answerComplete(q,a){
 if(!q.type)return Number.isInteger(a)&&a>=0&&a<q.options.length;
 if(typeof a!=='string')return false;
 if(q.calculation)return calculationComplete(q,a);
 if(q.type==='choice')return q.options.some(o=>o.id===a);
 if(q.integerOnly)return /^\d{1,8}$/.test(a);
 if(q.type==='fill'||q.type==='text')return a.trim().length>=(q.minLength||1)&&a.length<=(q.maxLength||1500);
 const value=json(a,null);
 if(q.type==='order')return Array.isArray(value)&&value.length===q.items.length&&new Set(value).size===value.length&&value.every(id=>q.items.some(i=>i.id===id));
 if(!object(value))return false;
 const left=q.type==='match'?q.left:q.items,right=q.type==='match'?q.right:q.bins;
 return left.every(i=>own(value,i.id)&&right.some(t=>t.id===value[i.id]))&&(q.type!=='match'||new Set(left.map(i=>value[i.id])).size===left.length);
}
function questionPoints(q,answer,key,writtenScore){
 if(key?.canonical)return key.canonical.includes(canonicalAnswer(q,answer))?1:0;
 if(!q.type)return answer===key?1:0;
 if(q.type==='text')return typeof answer==='string'&&answer.trim()?Number.isFinite(writtenScore)&&writtenScore>=0&&writtenScore<=1?writtenScore:null:0;
 if(typeof answer!=='string'||!answer)return 0;
 if(q.type==='choice')return answer===key?.value?1:0;
 if(q.type==='fill'){const value=normalize(answer),numeric=['decimal','numeric'].includes(q.inputMode)&&/^-?\d+(\.\d+)?$/.test(value);return key?.accepted?.some(v=>normalize(v)===value||(numeric&&Math.abs(Number(normalize(v))-Number(value))<1e-9))?1:0;}
 const value=json(answer,null);
 if(q.type==='order')return Array.isArray(value)&&JSON.stringify(value)===JSON.stringify(key?.order)?1:0;
 if(!object(value)||!object(key?.pairs))return 0;
 const entries=Object.entries(key.pairs);
 return entries.filter(([id,target])=>own(value,id)&&value[id]===target).length/Math.max(1,entries.length);
}
function scoreTheory(attempt,bank,keys,writtenScores={}){
 const answers=decodeAnswers(attempt),rows=bank.questions.map(q=>({id:q.id,points:questionPoints(q,answers[q.id],keys?.[q.id],writtenScores[q.id])}));
 const pending=rows.filter(r=>r.points===null).map(r=>r.id),earned=rows.reduce((n,r)=>n+(r.points||0),0);
 return{correct:rows.filter(r=>r.points===1).length,total:rows.length,score:bank.schema===3?Math.round(earned/Math.max(1,rows.length)*10000)/100:Math.round(earned/Math.max(1,rows.length)*100),pending,earned,rows};
}
function answerLabel(q,a){
 if(a===undefined||a===null||a===''||a===-1)return'Sin respuesta';
 if(!q.type)return q.options[a]||'Sin respuesta';
 if(q.calculation)return calculationLabel(q,a);
 if(q.type==='choice')return q.options.find(o=>o.id===a)?.label||'Sin respuesta';
 if(q.type==='fill'||q.type==='text')return typeof a==='string'?a:'Sin respuesta';
 const v=json(a,null);
 if(q.type==='order')return Array.isArray(v)?v.map((id,n)=>`${n+1}. ${q.items.find(i=>i.id===id)?.label||'Sin respuesta'}`).join('\n'):'Sin respuesta';
 const left=q.type==='match'?q.left:q.items,right=q.type==='match'?q.right:q.bins;
 return left.map(i=>i.label+' → '+(right.find(r=>r.id===v?.[i.id])?.label||'Sin enlazar')).join('\n');
}
function keyLabel(q,key){
 if(!q.type)return q.options[key]||'Sin clave';
 if(q.calculation)return calculationLabel(q,key?.canonical?.[0]);
 if(q.type==='choice')return answerLabel(q,key?.value);
 if(q.type==='fill')return(key?.accepted||[]).join(' / ');
 if(q.type==='text')return key?.expected||'';
 return answerLabel(q,JSON.stringify(q.type==='order'?key?.order:key?.pairs));
}
const NAMES=Object.freeze({C1:'BPM, POES y EPP',C2:'Conocimiento del camarón y defectos',C3:'Muestreo Cuenta y Uniformidad',C4:'Balanzas, tara y peso neto',C5:'Ficha técnica, orden y laboratorio',C6:'Cadena de frío y flujo',C7:'HACCP y control específico del área',C8:'Contención, trazabilidad y cierre',C9:'Cobertura, relevo y comunicación',C10:'Registros e integridad de datos'});
const MAP=Object.freeze({
 'criterio-2026-etapa1-v2':['C1','C5','C1','C1','C5','C7','C1','C8','C1','C1','C1','C5','C8','C8','C1','C5','C3','C1','C2','C3','C10','C1','C1','C5','C8','C10','C2','C8','C8','C1'],
 'criterio-2026-etapa2-v2':['C5','C4','C4','C3','C4','C3','C4','C3','C4','C4','C4','C4','C4','C4','C3','C3','C4','C4','C4','C3','C4','C5','C4','C10','C3','C4','C4','C3','C5','C4'],
 'criterio-2026-etapa3-v2':['C6','C5','C8','C7','C7','C10','C7','C8','C7','C8','C7','C8','C7','C7','C5','C8','C8','C5','C8','C8','C6','C8','C8','C8','C5','C8','C8','C8','C7','C8']
});
function criterion(q,bank){if(String(q.id).startsWith('OP26Q')){const n=Number(q.id.slice(5));return n===1?'C6':n===2?'C5':n===3?'C2':n===4?'C8':n===5?'C1':[6,7,11,12,13,14,15,16,17,18].includes(n)?'C3':[8,19].includes(n)?'C4':n===9?'C2':n===10?'C10':'C7';}
 if(String(q?.id||'').startsWith('V2E')){const topic=String(q.topic||'');const k=topic.match(/^K[1-5]/)?.[0];if(k)return {K1:['C2','C5'],K2:['C1','C6','C7'],K3:['C3','C4'],K4:['C9','C10'],K5:['C8']}[k];const n=Number(topic.match(/^I(\d+)/)?.[1]);if(n)return {1:'C2',2:'C5',3:'C2',4:'C3',5:'C5',6:'C1',7:'C7',8:'C4',9:'C4',10:'C6',11:'C8',12:'C8'}[n];return /ASC|BAP|BASC|GlobalG|trazabilidad/i.test(topic)?'C8':/HACCP|BRCGS|IFS/.test(topic)?'C7':/Cocción/.test(topic)?'C2':/Sulfitos/.test(topic)?'C5':'C10';}
 if(Object.hasOwn(NAMES,q?.criterionId))return q.criterionId;
 if(Object.hasOwn(NAMES,q?.competencyId))return q.competencyId;
 const ids=String(q?.id||'').match(/^D([1-3])(\d{2})$/),map=MAP[bank?.version];
 if(map&&ids&&Number(ids[1])===bank.stage){const n=Number(ids[2]);if(n>=1&&n<=30){if(q.id==='D105')return ['C1','C5','C7'];if(q.id==='D206')return ['C3','C5'];if(q.id==='D229')return ['C3','C4','C5'];if(q.id==='D329')return 'C8';return map[n-1];}}
 const explicit=String(q?.topic||'').match(/\bC(?:10|[1-9])\b/g);return explicit?.length===1?explicit[0]:null;
}

export {decodeAnswers,answerLabel,keyLabel,questionPoints,scoreTheory,criterion};
