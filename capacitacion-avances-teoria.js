import {esc as E,finite,percent} from './capacitacion-graficos.js?v=20261102-lineas-libres-3';
export function theoryRows(series){return series.map((s,order)=>({...s,order,value:s.theory[0]})).filter(s=>finite(s.value)).sort((a,b)=>a.value-b.value||a.order-b.order);}
const image=p=>typeof p==='string'&&(/^(data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+)$/.test(p)||p.startsWith('blob:'));
export function horizontalTheory(series){
 const rows=theoryRows(series);if(!rows.length)return '<div class="empty">Todavía no hay una evaluación integral calificada del plan de capacitación.</div>';
 const width=Math.max(960,rows.length*170+100),left=60,right=width-60,scale=v=>left+(right-left)*v/100;
 let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' 460" role="group" aria-label="Etapa única del plan. Escala horizontal de cero a cien. Inspectores de izquierda a derecha, de menor a mayor puntaje."><rect x="'+left+'" y="55" width="'+(right-left)+'" height="54" rx="15" fill="#e7eeee"/>';
 [0,25,50,70,85,100].forEach(v=>{svg+='<line x1="'+scale(v)+'" x2="'+scale(v)+'" y1="49" y2="115" stroke="'+(v===85?'#c69530':'#b7cacf')+'" stroke-dasharray="'+(v===85?'5 4':'none')+'"/><text x="'+scale(v)+'" y="35" text-anchor="middle" font-size="15" fill="#617688">'+v+'%</text>';});
 svg+='<text x="'+scale(85)+'" y="137" text-anchor="middle" font-size="12" fill="#8d671e">Meta 85%</text>';
 rows.forEach((s,i)=>{
  const x=left+(i+.5)*(right-left)/rows.length,sx=scale(s.value),name=String(s.person.name||'Inspector'),words=name.split(/\s+/),lines=[''];
  for(const word of words){if((lines.at(-1)+' '+word).trim().length>22&&lines.length<3)lines.push(word);else lines[lines.length-1]=(lines.at(-1)+' '+word).trim();}
  svg+='<g class="daily-profile" tabindex="0" role="button" data-curve-person="'+E(s.id)+'" data-curve-mode="theory" data-curve-index="0" aria-label="Ver radar de '+E(name)+' · '+percent(s.value)+'"><title>'+E(name)+' · '+percent(s.value)+'</title><circle cx="'+sx+'" cy="82" r="6" fill="'+s.color+'"/><path d="M'+sx+' 109V'+(155+i*3)+'L'+x+' 225V240" fill="none" stroke="'+s.color+'" stroke-width="2"/><rect class="daily-row-bg" x="'+(x-77)+'" y="242" width="154" height="200" rx="12" fill="#f5f9f9"/>';
  svg+='<svg x="'+(x-25)+'" y="252" width="50" height="50" viewBox="0 0 50 50"><defs><clipPath id="theory-profile-'+i+'"><circle cx="25" cy="25" r="25"/></clipPath></defs><circle cx="25" cy="25" r="25" fill="#e2ecef"/>';
  if(image(s.person.portrait))svg+='<image href="'+E(s.person.portrait)+'" width="50" height="50" preserveAspectRatio="xMidYMid slice" clip-path="url(#theory-profile-'+i+')"/>';
  else svg+='<text x="25" y="31" text-anchor="middle" font-size="14" fill="'+s.color+'">'+E(s.code)+'</text>';
  svg+='</svg>'+lines.map((line,j)=>'<text x="'+x+'" y="'+(325+j*18)+'" text-anchor="middle" font-size="12" fill="#19354a">'+E(line)+'</text>').join('')+'<text x="'+x+'" y="385" text-anchor="middle" font-size="11" fill="#617688">'+E(s.person.employeeCode||s.code)+'</text><text x="'+x+'" y="414" text-anchor="middle" font-size="23" font-weight="800" fill="'+s.color+'">'+percent(s.value)+'</text><text x="'+x+'" y="434" text-anchor="middle" font-size="10" fill="#617688">Ver radar individual</text></g>';
 });
 return svg+'</svg>';
}
export function theoryCards(series,selected,labels,simulated=false){
 const missing=series.filter(s=>!finite(s.theory[0]));
 return '<section class="daily-card"><h3>Etapa única · Evaluación integral de capacitación</h3><div class="daily-chart-scroll">'+horizontalTheory(series)+'</div><p class="note">Escala horizontal de izquierda a derecha. Inspectores ordenados de menor a mayor puntaje. Pulsa una foto o nombre para abrir el radar individual. '+(simulated?'Notas simuladas para demostración.':'Último intento integral calificado del plan; las comprobaciones por jornada no sustituyen este resultado.')+'</p>'+(missing.length?'<h4>Sin evaluación integral calificada</h4><div class="progress-legend">'+missing.map(s=>'<button type="button" class="progress-person" data-progress-person="'+E(s.id)+'" data-progress-mode="theory">'+E(s.person.name)+' · Sin nota</button>').join('')+'</div>':'')+'</section>';
}
