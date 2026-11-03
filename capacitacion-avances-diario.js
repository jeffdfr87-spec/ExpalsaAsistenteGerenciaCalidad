import {esc as E,finite,percent} from './capacitacion-graficos.js?v=20261102-lineas-libres-3';
const dayLabel=i=>'D'+String(i+1).padStart(2,'0');
const portrait=p=>typeof p==='string'&&(/^(data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+)$/.test(p)||p.startsWith('blob:'));
export const dailyChartStyles="#progressGraphsRoot .daily-card{background:#fff;border:1px solid #d8e4e3;border-radius:16px;padding:22px;color:#10303f;min-width:0} .daily-card h2{font-size:1.15rem;margin:0 0 16px}.daily-card h3{font-size:1.1rem;margin:18px 0 12px}.daily-chart-scroll{overflow-x:auto;max-width:100%}.daily-chart-scroll svg{display:block;width:100%;min-width:640px;height:auto;font-family:inherit}.daily-days{display:flex;gap:7px;flex-wrap:wrap}.daily-days button{border:1px solid #d8e4e3;border-radius:10px;padding:10px 14px;background:#fff;color:#19354a;font:inherit;font-weight:700;cursor:pointer}.daily-days button[aria-pressed=true]{background:#498e91;border-color:#498e91;color:#fff}.daily-days button:focus-visible,.daily-day:focus-visible,.daily-profile:focus-visible{outline:3px solid #0f8b8d;outline-offset:3px}.daily-day{cursor:pointer}.daily-day:focus rect:first-child{stroke:#0f8b8d;stroke-width:2}.daily-profile{cursor:pointer}.daily-profile:focus rect{stroke:#0f8b8d;stroke-width:2}.daily-card .empty{padding:28px;border:1px dashed #d8e4e3;border-radius:10px;color:#617688;text-align:center}.daily-card .note{color:#617688;line-height:1.6}.daily-profile:hover .daily-row-bg{fill:#f1f7f7}@media(max-width:650px){#progressGraphsRoot .daily-card{padding:14px}.daily-days{gap:5px}.daily-days button{padding:9px 11px}.daily-chart-scroll svg{min-width:600px}}";
export function dailyOverview(series,selected=0){
 const width=960,left=38,top=25,bottom=218,height=252,step=90,plotHeight=bottom-top;
 const y=v=>bottom-v*plotHeight/100;
 let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' '+height+'" role="group" aria-label="Resultados prácticos por jornada. Meta vigente 85 por ciento. Selecciona una jornada para ver sus inspectores.">';
 for(let day=0;day<10;day++){
  const x=left+day*step,known=series.filter(s=>finite(s.practice[day]));
  svg+='<g class="daily-day" role="button" tabindex="0" data-progress-day="'+day+'" aria-pressed="'+(day===selected)+'" aria-label="'+dayLabel(day)+', '+known.length+' inspectores con nota'+(day===selected?', seleccionada':'')+'"><rect x="'+(x-5)+'" y="6" width="86" height="244" rx="10" fill="'+(day===selected?'#e7eeee':'transparent')+'"/>';
  const bw=Math.min(12,74/Math.max(series.length,1));
  series.forEach((s,i)=>{const v=s.practice[day];if(finite(v))svg+='<rect x="'+(x+i*bw)+'" y="'+y(v)+'" width="'+Math.max(.8,bw-1)+'" height="'+Math.max(1,v*plotHeight/100)+'" fill="'+s.color+'"><title>'+E(s.person.name)+' · '+dayLabel(day)+' · '+percent(v)+'</title></rect>';});
  if(!known.length)svg+='<text x="'+(x+36)+'" y="203" text-anchor="middle" font-size="10" fill="#71868d">Sin datos</text>';
  svg+='<text x="'+(x+36)+'" y="241" text-anchor="middle" font-size="13" fill="#617688">'+dayLabel(day)+'</text></g>';
 }
 svg+='<line x1="'+left+'" x2="939" y1="'+y(85)+'" y2="'+y(85)+'" stroke="#d7a13a" stroke-width="1.4" stroke-dasharray="6 5" pointer-events="none"/><text x="938" y="'+(y(85)-6)+'" text-anchor="end" font-size="11" fill="#795b18" pointer-events="none">Meta 85%</text></svg>';
 return svg;
}
export function dailyRows(series,day){
 return series.map((s,order)=>({...s,order,value:s.practice[day]})).filter(s=>finite(s.value)).sort((a,b)=>b.value-a.value||a.order-b.order);
}
export function dailyDetail(series,day){
 const rows=dailyRows(series,day);
 if(!rows.length)return '<div class="empty">Esta jornada todavía no tiene evaluaciones prácticas completas.</div>';
 const height=Math.max(390,rows.length*48+60),top=35,bottom=height-35,scale=v=>bottom-(bottom-top)*v/100;
 let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 '+height+'" role="group" aria-label="Inspectores ordenados de mayor a menor nota en '+dayLabel(day)+'. Cada marca indica la nota real; las filas se separan para evitar superposiciones."><rect x="62" y="'+top+'" width="90" height="'+(bottom-top)+'" rx="12" fill="#e7eeee"/>';
 [0,50,70,85,100].forEach(v=>{svg+='<text x="53" y="'+(scale(v)+5)+'" text-anchor="end" font-size="14" fill="#617688">'+v+'</text>';});
 rows.forEach((s,i)=>{
  const sy=scale(s.value),ry=top+20+i*48,name=String(s.person.name||'Inspector'),words=name.split(/\s+/),lines=[''];
  for(const word of words){if((lines.at(-1)+' '+word).trim().length>29&&lines.length<2)lines.push(word);else lines[lines.length-1]=(lines.at(-1)+' '+word).trim();}
  const subline=lines[1]||s.person.employeeCode||s.code;const second=subline.length>29?subline.slice(0,28)+'…':subline;
  svg+='<path d="M62 '+sy+'H152" stroke="'+s.color+'" stroke-width="4"/><path d="M152 '+sy+'H215L275 '+ry+'H302" fill="none" stroke="'+s.color+'" stroke-width="1.7"/>';
  svg+='<g class="daily-profile" tabindex="0" role="button" data-curve-person="'+E(s.id)+'" data-curve-mode="practice" data-curve-index="'+day+'" aria-label="Ver ficha de '+E(name)+' · '+dayLabel(day)+' · '+percent(s.value)+'"><title>'+E(name)+' · '+percent(s.value)+'</title><rect class="daily-row-bg" x="306" y="'+(ry-21)+'" width="490" height="43" rx="9" fill="#fff"/>';
  svg+='<svg x="312" y="'+(ry-17)+'" width="34" height="34" viewBox="0 0 34 34"><defs><clipPath id="daily-avatar-'+i+'"><circle cx="17" cy="17" r="17"/></clipPath></defs><circle cx="17" cy="17" r="17" fill="#eaf1f4"/>';
  if(portrait(s.person.portrait))svg+='<image href="'+E(s.person.portrait)+'" width="34" height="34" preserveAspectRatio="xMidYMid slice" clip-path="url(#daily-avatar-'+i+')"/>';
  else svg+='<text x="17" y="22" text-anchor="middle" font-size="11" font-weight="700" fill="'+s.color+'">'+E(name.split(/\s+/).slice(0,2).map(n=>n[0]).join(''))+'</text>';
  svg+='</svg><text x="360" y="'+(ry-2)+'" font-size="15" fill="#19354a">'+E(lines[0])+'</text><text x="360" y="'+(ry+14)+'" font-size="11" fill="#617688">'+E(second)+'</text><text x="780" y="'+(ry+6)+'" text-anchor="end" font-size="19" font-weight="800" fill="'+s.color+'">'+s.value.toFixed(1)+'%</text></g>';
 });
 return svg+'</svg>';
}
export function dailyCards(series,selected,days){
 const day=days.find(d=>Number(d.day??d.id)===selected+1)||days[selected];
 const title=typeof day==='string'?day:(day?.title||day?.name||day?.topic||'Jornada '+(selected+1));
 return '<section class="daily-card"><h2>Todas las jornadas</h2><div class="daily-chart-scroll">'+dailyOverview(series,selected)+'</div><p class="note">Un color por inspector. Solo se muestran jornadas completas; sin dato no equivale a cero.</p></section><section class="daily-card"><div class="daily-days" role="group" aria-label="Seleccionar jornada">'+Array.from({length:10},(_,i)=>'<button type="button" data-progress-day="'+i+'" aria-pressed="'+(selected===i)+'" aria-controls="dailyDetailChart">'+dayLabel(i)+'</button>').join('')+'</div><h3>'+dayLabel(selected)+' · '+E(title)+'</h3><div class="daily-chart-scroll" id="dailyDetailChart">'+dailyDetail(series,selected)+'</div><p class="note">Cada marca señala la nota real del inspector en la escala de 0 a 100%. Pulsa su nombre para abrir la ficha.</p></section>';
}
