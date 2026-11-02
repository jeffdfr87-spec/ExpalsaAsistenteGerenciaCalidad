export const SERIES_COLORS=['#1565c0','#a64b00','#00866a','#8e3ba3','#c43c48','#007c91','#6353b3','#875c28','#536e1f','#485b6b'];
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const finite=n=>Number.isFinite(n)&&n>=0&&n<=100;
export const mean=v=>{const a=v.filter(finite);return a.length?a.reduce((s,n)=>s+n,0)/a.length:null;};
export const percent=n=>finite(n)?n.toFixed(1)+'%':'Sin dato';
export function sessionScore(s){if(s?.status!=='done')return null;const v=Object.values(s.ratings||{}).filter(n=>Number.isInteger(n)&&n>=0&&n<=4);return v.length?v.reduce((s,n)=>s+n,0)/v.length/4*100:null;}
export function trainingBand(practice,theory,needs=false){if((finite(practice)&&practice<50)||(finite(theory)&&theory<50))return {key:'priority',label:'Brecha amplia · revisión prioritaria'};if(!finite(practice)||!finite(theory))return {key:'missing',label:'Evidencia incompleta'};if(practice<85||theory<85||needs)return {key:'reinforce',label:'Requiere refuerzo'};return {key:'target',label:'Meta formativa alcanzada'};}
export function progressModel(data){
  const people=(data.people||[]).filter(p=>p.active===true&&p.deleted!==true),ids=new Set(people.map(p=>p.id));
  const sessions=(data.sessions||[]).filter(s=>ids.has(s.personId));
  const keys=['1','1_2','2','2_2','3','3_2'].filter(k=>!k.endsWith('_2')||people.some(p=>data.theory?.[p.id]?.attempts.some(a=>String(a.key)===k)));
  const series=people.map((p,i)=>{const own=sessions.filter(s=>s.personId===p.id),practice=Array.from({length:10},(_,d)=>sessionScore(own.find(s=>s.day===d+1))),t=data.theory?.[p.id];const theory=keys.map(k=>{const a=t?.attempts.find(a=>String(a.key)===k);return a&&['submitted','graded'].includes(a.status)&&finite(a.score)?a.score:null;});const latest=[...practice].reverse().find(finite)??null;const pending=own.some(s=>s.followup?.trim()&&!s.followupResolved);return {id:p.id,person:p,code:'E'+(i+1),color:SERIES_COLORS[i%SERIES_COLORS.length],practice,theory,latest,theoryMean:t?.average??null,done:practice.filter(finite).length,band:trainingBand(latest,t?.average,pending||t?.needsReinforcement),theoryRecord:t};});
  const daily=Array.from({length:10},(_,i)=>{const values=series.map(s=>s.practice[i]).filter(finite);return {day:i+1,coverage:values.length,total:people.length,average:mean(values),maximum:values.filter(v=>v===100).length,target:values.filter(v=>v>=85).length,below:values.filter(v=>v<85).length};});
  return {people,sessions,series,daily,theoryKeys:keys,theoryLabels:keys.map(k=>'ET'+k.split('_')[0]+' I'+(k.endsWith('_2')?2:1))};
}
export function pointLabelPositions(items,minY,maxY,gap=36){
  const sorted=items.map(item=>({...item})).sort((a,b)=>a.py-b.py||a.order-b.order);
  for(let i=0;i<sorted.length;i++)sorted[i].labelY=Math.max(minY,sorted[i].py-20,i?sorted[i-1].labelY+gap:minY);
  if(sorted.length&&sorted.at(-1).labelY>maxY){sorted.at(-1).labelY=maxY;for(let i=sorted.length-2;i>=0;i--)sorted[i].labelY=Math.min(sorted[i].labelY,sorted[i+1].labelY-gap);}
  return sorted;
}
export function lineSvg(labels,series,{title='Evolución de resultados',height=270,interactive=false,mode='practice',pointLabels=false}={}){
  const labelWidth=Math.max(128,...series.map(s=>Math.min(210,Math.max(String(s.firstName||s.label||'').split(/\s+/)[0].length*7,String(s.employeeCode||'Sin código').length*6)+18)));
  const step=Math.max(164,labelWidth+32),left=48,right=pointLabels?labelWidth+30:26;
  const width=pointLabels?Math.max(960,left+Math.max(1,labels.length-1)*step+right):960;
  if(pointLabels)height=Math.max(height,460,series.length*36+150);
  const top=pointLabels?36:25,bottom=pointLabels?56:48,w=width-left-right,h=height-top-bottom;
  const x=i=>left+(labels.length>1?i*w/(labels.length-1):w/2),y=v=>top+(100-v)/100*h;
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ${pointLabels?`style="min-width:${width}px;width:100%;max-width:none"`:''} role="img" aria-label="${esc(title)}. Escala de cero a cien. Las interrupciones representan datos no disponibles."><rect width="${width}" height="${height}" fill="white"/>`;
  for(const v of [0,25,50,75,100])svg+=`<line x1="${left}" y1="${y(v)}" x2="${width-right}" y2="${y(v)}" stroke="#dce5ea"/><text x="${left-9}" y="${y(v)+4}" text-anchor="end" font-size="12" fill="#526575">${v}</text>`;
  svg+=`<line x1="${left}" y1="${y(85)}" x2="${width-right}" y2="${y(85)}" stroke="#536575" stroke-dasharray="5 5"/><text x="${width-right}" y="${y(85)-5}" text-anchor="end" font-size="11" fill="#536575">Meta 85%</text>`;
  labels.forEach((label,i)=>{svg+=`<text x="${x(i)}" y="${height-18}" text-anchor="middle" font-size="12" fill="#334f63">${esc(label)}</text>`;});
  series.forEach((s,idx)=>{let segment=[];const flush=()=>{if(segment.length>1)svg+=`<polyline fill="none" stroke="${s.color}" stroke-width="2.3" ${idx%3===1?'stroke-dasharray="7 3"':idx%3===2?'stroke-dasharray="2 3"':''} points="${segment.join(' ')}"/>`;segment=[];};s.values.forEach((v,i)=>{if(!finite(v)){flush();return;}segment.push(x(i)+','+y(v));});flush();s.values.forEach((v,i)=>{if(finite(v))svg+=`<circle ${interactive?`tabindex="${pointLabels?-1:0}" role="button" aria-label="${esc(s.label)} ${esc(labels[i])} ${percent(v)}" data-curve-person="${esc(s.id)}" data-curve-index="${i}" data-curve-mode="${esc(mode)}"`:''} cx="${x(i)}" cy="${y(v)}" r="3.4" fill="white" stroke="${s.color}" stroke-width="2"><title>${esc(s.label)} · ${esc(labels[i])} · ${percent(v)}</title></circle>`;});});
  if(pointLabels)for(let i=0;i<labels.length;i++){
    const points=series.flatMap((s,order)=>finite(s.values[i])?[{series:s,order,py:y(s.values[i])}]:[]);
    for(const point of pointLabelPositions(points,top+16,height-bottom-16)){
      const s=point.series,px=x(i),lx=px+12,ly=point.labelY;
      const firstName=String(s.firstName||s.label||'Inspector').trim().split(/\s+/)[0],code=String(s.employeeCode||'Sin código');
      svg+=`<g class="progress-point-label" data-label-person="${esc(s.id)}" data-curve-index="${i}" data-curve-mode="${esc(mode)}" ${interactive?`role="button" tabindex="0" aria-label="${esc(firstName)} ${esc(code)} · ${esc(labels[i])} · ${percent(s.values[i])}"`:''}><title>${esc(s.label)} · ${esc(code)} · ${esc(labels[i])} · ${percent(s.values[i])}</title><line x1="${px}" y1="${point.py}" x2="${lx}" y2="${ly}" stroke="${s.color}" stroke-width="1" opacity=".65"/><rect x="${lx}" y="${ly-16}" width="${labelWidth}" height="32" rx="4" fill="white" fill-opacity=".95" stroke="${s.color}" stroke-opacity=".45"/><text x="${lx+7}" y="${ly-3}" fill="${s.color}" font-family="Arial,sans-serif" font-size="12" font-weight="700">${esc(firstName)}</text><text x="${lx+7}" y="${ly+11}" fill="#334f63" font-family="Arial,sans-serif" font-size="11">${esc(code)}</text></g>`;
    }
  }
  return svg+'</svg>';
}
export function barsSvg(rows){const width=960,height=Math.max(110,rows.length*31+45),left=48,right=80,w=width-left-right;let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Comparación de práctica ponderada y promedio teórico por inspector. Azul práctica, naranja teoría."><rect width="${width}" height="${height}" fill="white"/>`;
  for(const n of [0,25,50,75,100])svg+=`<line x1="${left+w*n/100}" y1="15" x2="${left+w*n/100}" y2="${height-24}" stroke="#e1e8ec"/><text x="${left+w*n/100}" y="${height-6}" text-anchor="middle" font-size="11" fill="#526575">${n}</text>`;
  svg+=`<line x1="${left+w*.85}" y1="15" x2="${left+w*.85}" y2="${height-24}" stroke="#536575" stroke-dasharray="4 4"/>`;
  rows.forEach((r,i)=>{const y=18+i*31;svg+=`<text x="${left-10}" y="${y+14}" text-anchor="end" font-size="12" fill="#19354a">${esc(r.code)}</text>`;for(const [j,v]of [r.practice,r.theory].entries()){if(finite(v))svg+=`<rect x="${left}" y="${y+j*10}" width="${w*v/100}" height="8" rx="2" fill="${j?'#a64b00':'#1565c0'}"><title>${esc(r.name)} · ${j?'Teoría':'Práctica'} · ${percent(v)}</title></rect>`;}svg+=`<text x="${width-right+8}" y="${y+14}" font-size="11" fill="#334f63">${finite(r.practice)?r.practice.toFixed(0):'—'} / ${finite(r.theory)?r.theory.toFixed(0):'—'}</text>`;});return svg+'</svg>';
}
export function radarSvg(rows){const width=680,height=285,cx=340,cy=140,r=100,point=(i,v)=>[cx+Math.cos(-Math.PI/2+i*2*Math.PI/10)*r*v/100,cy+Math.sin(-Math.PI/2+i*2*Math.PI/10)*r*v/100];let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Perfil medio por competencia. Azul práctica, naranja teoría. Sin dato no equivale a cero."><rect width="${width}" height="${height}" fill="white"/>`;
  for(const n of [25,50,75,100])svg+=`<polygon points="${Array.from({length:10},(_,i)=>point(i,n).join(',')).join(' ')}" fill="none" stroke="#dce5ea"/>`;
  for(let i=0;i<10;i++){const p=point(i,100),l=point(i,123);svg+=`<line x1="${cx}" y1="${cy}" x2="${p[0]}" y2="${p[1]}" stroke="#e3e9ee"/><text x="${l[0]}" y="${l[1]+4}" text-anchor="middle" font-size="12" fill="#334f63">C${i+1}</text>`;}
  for(const [key,color]of [['practice','#1565c0'],['theory','#a64b00']]){const known=rows.map((row,i)=>({i,v:row[key]})).filter(p=>finite(p.v));for(let i=0;i<10;i++){const next=(i+1)%10;if(finite(rows[i]?.[key])&&finite(rows[next]?.[key])){const a=point(i,rows[i][key]),b=point(next,rows[next][key]);svg+=`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${color}" stroke-width="2.3"/>`;}}for(const p of known){const xy=point(p.i,p.v);svg+=`<circle cx="${xy[0]}" cy="${xy[1]}" r="3.5" fill="${color}"><title>C${p.i+1} · ${key==='practice'?'Práctica':'Teoría'} · ${percent(p.v)}</title></circle>`;}}
  return svg+'</svg>';
}
