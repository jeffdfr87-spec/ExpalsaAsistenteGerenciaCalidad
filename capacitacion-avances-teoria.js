import {esc as E,finite,percent} from './capacitacion-graficos.js?v=20261102-lineas-libres-3';
const portrait=p=>typeof p==='string'&&(/^(data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+)$/.test(p)||p.startsWith('blob:'));
export function theoryOverview(series,selected=0,labels=[]){
 const width=960,left=38,top=25,bottom=218,height=252,step=900/Math.max(labels.length,1),plotHeight=bottom-top;
 const y=v=>bottom-v*plotHeight/100;
 let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' '+height+'" role="group" aria-label="Resultados teóricos por etapa e intento. Meta vigente 85 por ciento. Selecciona una evaluación para ver sus inspectores.">';
 for(let day=0;day<labels.length;day++){
  const x=left+day*step,known=series.filter(s=>finite(s.theory[day]));
  svg+='<g class="daily-day" role="button" tabindex="0" data-progress-theory="'+day+'" aria-pressed="'+(day===selected)+'" aria-label="'+E(labels[day])+', '+known.length+' inspectores con nota'+(day===selected?', seleccionada':'')+'"><rect x="'+(x-5)+'" y="6" width="'+(step-4)+'" height="244" rx="10" fill="'+(day===selected?'#e7eeee':'transparent')+'"/>';
  const bw=Math.min(12,(step-12)/Math.max(series.length,1));
  series.forEach((s,i)=>{const v=s.theory[day];if(finite(v))svg+='<rect x="'+(x+i*bw)+'" y="'+y(v)+'" width="'+Math.max(.8,bw-1)+'" height="'+Math.max(1,v*plotHeight/100)+'" fill="'+s.color+'"><title>'+E(s.person.name)+' · '+E(labels[day])+' · '+percent(v)+'</title></rect>';});
  if(!known.length)svg+='<text x="'+(x+(step-12)/2)+'" y="203" text-anchor="middle" font-size="10" fill="#71868d">Sin datos</text>';
  svg+='<text x="'+(x+(step-12)/2)+'" y="241" text-anchor="middle" font-size="13" fill="#617688">'+E(labels[day])+'</text></g>';
 }
 svg+='<line x1="'+left+'" x2="939" y1="'+y(85)+'" y2="'+y(85)+'" stroke="#d7a13a" stroke-width="1.4" stroke-dasharray="6 5" pointer-events="none"/><text x="938" y="'+(y(85)-6)+'" text-anchor="end" font-size="11" fill="#795b18" pointer-events="none">Meta 85%</text></svg>';
 return svg;
}
export function theoryRows(series,day){
 return series.map((s,order)=>({...s,order,value:s.theory[day]})).filter(s=>finite(s.value)).sort((a,b)=>b.value-a.value||a.order-b.order);
}
export function theoryDetail(series,day,label){
 const rows=theoryRows(series,day);
 if(!rows.length)return '<div class="empty">Esta evaluación todavía no tiene notas teóricas calificadas.</div>';
 const height=Math.max(390,rows.length*48+60),top=35,bottom=height-35,scale=v=>bottom-(bottom-top)*v/100;
 let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 '+height+'" role="group" aria-label="Inspectores ordenados de mayor a menor nota en '+E(label)+'. Cada marca indica la nota mostrada; las filas se separan para evitar superposiciones."><rect x="62" y="'+top+'" width="90" height="'+(bottom-top)+'" rx="12" fill="#e7eeee"/>';
 [0,50,70,85,100].forEach(v=>{svg+='<text x="53" y="'+(scale(v)+5)+'" text-anchor="end" font-size="14" fill="#617688">'+v+'</text>';});
 rows.forEach((s,i)=>{
  const sy=scale(s.value),ry=top+20+i*48,name=String(s.person.name||'Inspector'),words=name.split(/\s+/),lines=[''];
  for(const word of words){if((lines.at(-1)+' '+word).trim().length>29&&lines.length<2)lines.push(word);else lines[lines.length-1]=(lines.at(-1)+' '+word).trim();}
  const subline=lines[1]||s.person.employeeCode||s.code;const second=subline.length>29?subline.slice(0,28)+'…':subline;
  svg+='<path d="M62 '+sy+'H152" stroke="'+s.color+'" stroke-width="4"/><path d="M152 '+sy+'H215L275 '+ry+'H302" fill="none" stroke="'+s.color+'" stroke-width="1.7"/>';
  svg+='<g class="daily-profile" tabindex="0" role="button" data-curve-person="'+E(s.id)+'" data-curve-mode="theory" data-curve-index="'+day+'" aria-label="Ver ficha de '+E(name)+' · '+E(label)+' · '+percent(s.value)+'"><title>'+E(name)+' · '+percent(s.value)+'</title><rect class="daily-row-bg" x="306" y="'+(ry-21)+'" width="490" height="43" rx="9" fill="#fff"/>';
  svg+='<svg x="312" y="'+(ry-17)+'" width="34" height="34" viewBox="0 0 34 34"><defs><clipPath id="theory-avatar-'+i+'"><circle cx="17" cy="17" r="17"/></clipPath></defs><circle cx="17" cy="17" r="17" fill="#eaf1f4"/>';
  if(portrait(s.person.portrait))svg+='<image href="'+E(s.person.portrait)+'" width="34" height="34" preserveAspectRatio="xMidYMid slice" clip-path="url(#theory-avatar-'+i+')"/>';
  else svg+='<text x="17" y="22" text-anchor="middle" font-size="11" font-weight="700" fill="'+s.color+'">'+E(name.split(/\s+/).slice(0,2).map(n=>n[0]).join(''))+'</text>';
  svg+='</svg><text x="360" y="'+(ry-2)+'" font-size="15" fill="#19354a">'+E(lines[0])+'</text><text x="360" y="'+(ry+14)+'" font-size="11" fill="#617688">'+E(second)+'</text><text x="780" y="'+(ry+6)+'" text-anchor="end" font-size="19" font-weight="800" fill="'+s.color+'">'+s.value.toFixed(1)+'%</text></g>';
 });
 return svg+'</svg>';
}

export function theoryCards(series,selected,labels,simulated=false){
 const note=simulated?'Notas simuladas para demostración.':'Solo se muestran intentos calificados; sin dato no equivale a cero.';
 return '<section class="daily-card"><h3>Todas las evaluaciones teóricas</h3><div class="daily-chart-scroll">'+theoryOverview(series,selected,labels)+'</div><p class="note">Un color por inspector. '+note+'</p></section><section class="daily-card"><div class="daily-days" role="group" aria-label="Seleccionar evaluación teórica">'+labels.map((label,i)=>'<button type="button" data-progress-theory="'+i+'" aria-pressed="'+(selected===i)+'" aria-controls="theoryDetailChart">'+E(label)+'</button>').join('')+'</div><h3>'+E(labels[selected]||'Evaluación teórica')+'</h3><div class="daily-chart-scroll" id="theoryDetailChart">'+theoryDetail(series,selected,labels[selected]||'Evaluación')+'</div><p class="note">Cada marca indica la nota '+(simulated?'simulada':'registrada')+' en la escala de 0 a 100%. Pulsa el nombre para abrir la ficha con la foto del inspector.</p></section>';
}
