import {esc as E,finite,mean,percent} from './capacitacion-graficos.js?v=20261102-lineas-libres-3';
const labels=['BPM y POES','Defectos','Muestreo','Pesos y equipos','Fichas y laboratorio','Cadena de frío','HACCP','Trazabilidad y cierre','Comunicación','Registros y etiquetas'];
export function competencyValues(model,personId,days,competencies,kind,index){
 if(kind==='theory'){
  const attempt=model.series.find(s=>s.id===personId)?.theoryRecord?.attempts?.find(a=>String(a.key)===model.theoryKeys[index]);
  return competencies.map(c=>attempt?.verified?attempt.competencies?.find(p=>p.id===c.id)?.score??null:null);
 }
 return competencies.map(c=>{
  const values=[];
  for(const session of model.sessions.filter(s=>s.personId===personId&&s.status==='done')){
   const day=days.find(d=>Number(d.day)===session.day);
   for(const check of day?.checks||[]){const v=session.ratings?.[check.id];if(check.c===c.id&&Number.isInteger(v)&&v>=0&&v<=4)values.push(v*25);}
  }
  return mean(values);
 });
}
export function radarProfile(model,series,days,competencies,kind,index){
 const own=competencyValues(model,series.id,days,competencies,kind,index);
 const group=competencies.map((c,i)=>mean(model.series.map(s=>competencyValues(model,s.id,days,competencies,kind,index)[i])));
 const count=competencies.length,cx=330,cy=260,r=175;
 const point=(i,v)=>{const angle=-Math.PI/2+i*Math.PI*2/count;return [cx+Math.cos(angle)*r*v/100,cy+Math.sin(angle)*r*v/100];};
 const points=values=>values.map((v,i)=>point(i,v).join(',')).join(' ');
 let svg='<svg viewBox="0 0 660 530" role="img" aria-label="Radar individual de competencias, '+(kind==='theory'?'evaluación teórica del plan en etapa única':'práctica acumulada')+'. Línea sólida inspector, punteada promedio del grupo.">';
 for(const v of [25,50,75,100])svg+='<polygon points="'+points(competencies.map(()=>v))+'" fill="none" stroke="#dce5e7" stroke-width="1.5"/>';
 competencies.forEach((c,i)=>{const p=point(i,100),l=point(i,122);svg+='<path d="M'+cx+' '+cy+'L'+p.join(' ')+'" stroke="#dce5e7"/><text x="'+l[0]+'" y="'+l[1]+'" text-anchor="'+(l[0]<cx-5?'end':l[0]>cx+5?'start':'middle')+'" font-size="12" fill="#617688">'+E(labels[i]||c.id)+'<title>'+E(c.label)+'</title></text>';});
 for(const [values,color,dash] of [[group,'#718590','6 5'],[own,'#498e91','']]){
  if(values.every(finite))svg+='<polygon points="'+points(values)+'" fill="'+(dash?'none':'#498e9133')+'" stroke="'+color+'" stroke-width="'+(dash?2:3)+'" stroke-dasharray="'+dash+'"/>';
  else for(let i=0;i<count;i++){const next=(i+1)%count;if(finite(values[i])&&finite(values[next]))svg+='<path d="M'+point(i,values[i]).join(' ')+'L'+point(next,values[next]).join(' ')+'" fill="none" stroke="'+color+'" stroke-width="3" stroke-dasharray="'+dash+'"/>';}
  values.forEach((v,i)=>{if(finite(v)){const p=point(i,v);svg+='<circle cx="'+p[0]+'" cy="'+p[1]+'" r="'+(dash?3:5)+'" fill="'+color+'"><title>'+E(competencies[i].label)+' · '+percent(v)+(dash?' · grupo':' · inspector')+'</title></circle>';}});
 }
 svg+='</svg>';
 const known=own.map((value,i)=>({value,label:labels[i]||competencies[i].label})).filter(p=>finite(p.value)).sort((a,b)=>b.value-a.value);
 const missing=own.map((v,i)=>finite(v)?null:competencies[i].id).filter(Boolean);
 const summary='<dt>Jornadas</dt><dd>'+series.done+'/10</dd><dt>Promedio del radar</dt><dd>'+percent(mean(own))+(missing.length?' · parcial':'')+'</dd><dt>Mayor resultado</dt><dd>'+(known.length?E(known[0].label)+' ('+percent(known[0].value)+')':'Sin evidencia')+'</dd><dt>Menor resultado</dt><dd>'+(known.length?E(known.at(-1).label)+' ('+percent(known.at(-1).value)+')':'Sin evidencia')+'</dd>';
 return {summary,html:'<div class="inspector-radar"><h4>Competencias como inspector · '+(kind==='theory'?'etapa única del plan':'práctica acumulada')+'</h4>'+svg+'<p class="note">Línea sólida: inspector. Línea punteada: promedio del grupo completo.</p><p class="note">'+(missing.length?'Sin evidencia en '+E(missing.join(', '))+'. Los valores pendientes no se dibujan como cero.':'Escala de 0 a 100%.')+'</p></div>'};
}
