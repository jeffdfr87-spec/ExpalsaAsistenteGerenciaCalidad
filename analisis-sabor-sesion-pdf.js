import {perfilMateriaPrima,textoPerfil,mostrarFechaRecepcion,normalizarObservaciones,compararContramuestra} from './sabor-modelo.js?v=20261107-partial-1';
import {resumenSesion} from './sabor-informe-sesion.js?v=20261107-session-pdf-1';
import {loadFlavorPdfResources} from './analisis-sabor-pdf.js?v=20261107-session-pdf-1';

const C={navy:[8,40,61],ink:[25,53,74],teal:[8,125,137],muted:[104,126,139],line:[220,229,234],soft:[243,248,250],good:[19,127,99],partial:[52,95,147],bad:[172,60,80]};
const clean=v=>String(v??'').replace(/[\u2010-\u2015]/g,'-').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
const stamp=v=>v?new Intl.DateTimeFormat('es-EC',{timeZone:'America/Guayaquil',dateStyle:'short',timeStyle:'short'}).format(new Date(v)):'Sin fecha registrada';
const fileName=v=>String(v||'sesion').normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu,'_').slice(0,70);

export function createFlavorSessionReport({jsPDF,autoTable,logoData,session,samples,inspectors,evaluations,photos=[],generatedAt=Date.now()}){
 if(!session||!samples?.length||!logoData)throw Error('No se pudo preparar el informe de la sesión.');
 const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
 const summary=resumenSesion(samples,evaluations,inspectors),photoIndex=new Map(photos.map(p=>[p.sampleId,p]));
 const people=summary.inspectors;
 let y=43,section='Resumen ejecutivo';
 const write=(text,x,at,size=8,style='normal',color=C.ink,options={})=>{pdf.setFont('helvetica',style);pdf.setFontSize(size);pdf.setTextColor(...color);pdf.text(Array.isArray(text)?text.map(clean):clean(text),x,at,options);};
 const lines=(text,width,size=8)=>{pdf.setFont('helvetica','normal');pdf.setFontSize(size);return pdf.splitTextToSize(clean(text),width);};
 const addPage=()=>{pdf.addPage();y=43;};
 const ensure=height=>{if(y+height>272)addPage();};
 const paragraph=(text,size=8,color=C.ink)=>{const wrapped=lines(text,182,size),height=wrapped.length*4;ensure(height+3);write(wrapped,14,y,size,'normal',color);y+=height+3;};
 const heading=(text,subtitle='')=>{const wrapped=lines(text,182,12);ensure(wrapped.length*5.5+11);write(wrapped,14,y,12,'bold',C.navy);y+=wrapped.length*5.5+.5;if(subtitle)paragraph(subtitle,8,C.muted);else y+=2;};
 const table=options=>{
  autoTable(pdf,{startY:y,margin:{left:14,right:14,top:43,bottom:23},tableWidth:182,theme:'grid',styles:{font:'helvetica',fontSize:7.5,cellPadding:2.5,textColor:C.ink,lineColor:C.line,lineWidth:.15,overflow:'linebreak'},headStyles:{fillColor:C.navy,textColor:[255,255,255],fontStyle:'bold',fontSize:7},alternateRowStyles:{fillColor:[248,251,252]},rowPageBreak:'avoid',showHead:'everyPage',...options});
  y=pdf.lastAutoTable.finalY+7;
 };
 const placeImage=(photo,x,at,width,height,alias)=>{
  let properties;try{properties=pdf.getImageProperties(photo.dataUrl);}catch{throw Error('No se pudo incorporar una fotografía. Revisa las imágenes y vuelve a generar el informe.');}
  const scale=Math.min(width/properties.width,height/properties.height),w=properties.width*scale,h=properties.height*scale;
  pdf.addImage(photo.dataUrl,'JPEG',x+(width-w)/2,at+(height-h)/2,w,h,alias,'FAST');
 };
 pdf.setProperties({title:`EXPALSA - Informe gerencial - ${clean(session.name)}`,subject:'Análisis sensorial consolidado de la sesión',author:'Gerencia de Calidad - EXPALSA'});
 heading('Informe gerencial de análisis de sabor',session.name);
 paragraph(`Fecha de sesión: ${session.date}  |  Estado: ${{draft:'Borrador',open:'En evaluación',closed:'Cerrada'}[session.status]||session.status}  |  Alcance: todas las muestras de esta sesión.`,8,C.muted);
 const kpis=[['MUESTRAS',samples.length],['INSPECTORES',people.length],['EVALUACIONES',`${summary.totals.total} / ${samples.length*people.length}`],['CONFORMIDAD',`${summary.goodPercent}%`]];
 ensure(22);kpis.forEach(([label,value],i)=>{const x=14+i*46.5;pdf.setFillColor(...C.soft);pdf.roundedRect(x,y,42.5,20,2,2,'F');write(label,x+3,y+6,6.5,'bold',C.muted);write(value,x+3,y+15,15,'bold',C.navy);});y+=28;
 paragraph(`Conformes: ${summary.totals.good} (${summary.goodPercent}%)  |  Parciales: ${summary.totals.partial} (${summary.partialPercent}%)  |  Discrepancias: ${summary.totals.bad} (${summary.badPercent}%)  |  Por revisar: ${summary.totals.review}  |  Pendientes: ${summary.totals.pending}.`);
 const samplePhotoCount=photos.reduce((n,p)=>n+(p.samplePhotos||[]).length,0),evidenceCount=photos.reduce((n,p)=>n+(p.inspectorPhotos||[]).reduce((m,i)=>m+(i.evidence||[]).length,0),0);
 paragraph(`Registro incluido: ${samplePhotoCount} fotos de muestras y ${evidenceCount} evidencias, además de los perfiles disponibles de los inspectores.`,7.5,C.muted);
 heading('Consolidado de muestras');
 table({head:[['MUESTRA / LOTE','RECEPCIÓN DE MATERIA PRIMA','EVAL.','CONF.','PARC.','DISCR.']],body:samples.map(sample=>{const s=summary.index.get(sample.id);return [clean(`${sample.blindLetter||'-'} / ${sample.lote}`),clean(textoPerfil(perfilMateriaPrima(sample)||[])||'Por completar'),`${s.total}/${people.length}${s.review?`\n${s.review} por revisar`:''}`,String(s.good),String(s.partial),String(s.bad)];}),columnStyles:{0:{cellWidth:27,fontStyle:'bold'},1:{cellWidth:77},2:{cellWidth:24},3:{cellWidth:18,halign:'center'},4:{cellWidth:18,halign:'center'},5:{cellWidth:18,halign:'center'}}});
 paragraph('Criterio: en mezclas con otros sabores se excluye Normal. Mismos sabores e intensidades: Conforme; mismos sabores y distinta intensidad: Conformidad parcial; otros sabores: Discrepancia. Recepción Normal 100% exige contramuestra Normal 100%. Los porcentajes de composición no modifican la comparación de otros sabores.',7.5,C.muted);

 for(const [sampleNumber,sample] of samples.entries()){
  section=`Muestra ${sample.blindLetter||sampleNumber+1} - Lote ${sample.lote}`;
  ensure(65);
  const stats=summary.index.get(sample.id),bundle=photoIndex.get(sample.id)||{},portraits=new Map((bundle.inspectorPhotos||[]).filter(p=>p.profile?.dataUrl).map(p=>[p.uid,p.profile]));
  heading(section);
  paragraph(`Recepción: ${mostrarFechaRecepcion(sample.receivedDate)}  |  Analista: ${sample.receptionAnalyst||'Sin registrar'}`,7.5,C.muted);
  paragraph(`Perfil de recepción: ${textoPerfil(perfilMateriaPrima(sample)||[])||'Pendiente de completar'}`,8);
  paragraph(`Conformes ${stats.good}  |  Parciales ${stats.partial}  |  Discrepancias ${stats.bad}  |  Por revisar ${stats.review}  |  Pendientes ${stats.pending}`,7.5,C.muted);
  table({head:[[clean('INSPECTOR / MUESTRA '+(sample.blindLetter||sampleNumber+1)),'RESULTADO','CONTRAMUESTRA / OBSERVACIONES']],body:people.map(p=>{const entry=stats.byInspector.get(p.uid),vote=entry?.vote;return [clean([p.name||p.email||p.uid,vote?.createdAtMs?stamp(vote.createdAtMs):''].filter(Boolean).join('\n')),entry?.label||'Pendiente',clean([vote?.counterFlavors?textoPerfil(vote.counterFlavors):'',normalizarObservaciones(vote?.observations)].filter(Boolean).join('\n')||'-')];}),columnStyles:{0:{cellWidth:53},1:{cellWidth:32},2:{cellWidth:97}},didParseCell:cell=>{
   if(cell.section!=='body')return;
   if(cell.column.index===1){cell.cell.styles.fontStyle='bold';cell.cell.styles.textColor=cell.cell.raw==='Conforme'?C.good:cell.cell.raw==='Conformidad parcial'?C.partial:cell.cell.raw==='Discrepancia'?C.bad:C.muted;}
   if(cell.column.index===2&&portraits.has(people[cell.row.index]?.uid)){cell.cell.styles.cellPadding={top:2.5,bottom:2.5,left:2.5,right:22};cell.cell.styles.minCellHeight=23;}
  },didDrawCell:cell=>{if(cell.section==='body'&&cell.column.index===2){const portrait=portraits.get(people[cell.row.index]?.uid);if(portrait)placeImage(portrait,cell.cell.x+cell.cell.width-20,cell.cell.y+(cell.cell.height-18)/2,17,18,`session-profile-${sampleNumber}-${cell.row.index}`);}}});
  const gallery=[];
  for(const [i,photo] of (bundle.samplePhotos||[]).entries())gallery.push({photo,title:`Muestra - Foto ${i+1}`,audit:`Carga original: ${stamp(photo.uploadedAtMs)}`});
  for(const person of bundle.inspectorPhotos||[])for(const [i,photo] of (person.evidence||[]).entries())gallery.push({photo,title:`Evidencia ${i+1} - ${person.name||person.uid}`,audit:`Captura: ${stamp(photo.capturedAtMs)}\nCarga: ${stamp(photo.uploadedAtMs)}`});
  if(gallery.length){
   ensure(68);write('Registro fotográfico',14,y,9,'bold',C.navy);y+=5;
   for(let offset=0;offset<gallery.length;offset+=4){
    const row=gallery.slice(offset,offset+4).map(entry=>({...entry,caption:lines(entry.title+'\n'+entry.audit,42,6.5)}));
    const rowHeight=34+Math.max(...row.map(p=>p.caption.length))*3+6;
    if(y+rowHeight>272){addPage();write(section+' - fotografías',14,y,9,'bold',C.navy);y+=6;}
    row.forEach((entry,i)=>{const x=14+i*46;pdf.setDrawColor(...C.line);pdf.rect(x,y,44,32);placeImage(entry.photo,x+1,y+1,42,30,`session-photo-${sampleNumber}-${offset+i}`);write(entry.caption,x+1,y+36,6.5,'normal',C.muted);});
    y+=rowHeight;
   }
  }else paragraph('Sin fotografías de muestra ni evidencias registradas.',7.5,C.muted);
  y+=5;
 }

 section='Comparativo final de inspectores';addPage();
 heading('Discrepancias y conformidades por inspector');
 paragraph('Orden de mayor a menor número de conformidades. Desempate: menos discrepancias, más conformidades parciales, menos casos por revisar y nombre. Los pendientes no se incluyen en el porcentaje de conformidad.',7.5,C.muted);
 table({head:[['N.','INSPECTOR','CONF.','PARC.','DISCR.','REVISAR','PEND.','CONF. %']],body:summary.ranking.map((p,i)=>[String(i+1),clean(`${p.name||p.email||p.uid}\n${p.email||''}\n${p.total} de ${samples.length} muestras evaluadas`),String(p.good),String(p.partial),String(p.bad),String(p.review),String(p.pending),`${p.goodPercent}%`]),columnStyles:{0:{cellWidth:9,halign:'center'},1:{cellWidth:65},2:{cellWidth:16,halign:'center',fontStyle:'bold',textColor:C.good},3:{cellWidth:18,halign:'center',textColor:C.partial},4:{cellWidth:18,halign:'center',textColor:C.bad},5:{cellWidth:18,halign:'center'},6:{cellWidth:18,halign:'center'},7:{cellWidth:20,halign:'center',fontStyle:'bold'}}});
 paragraph(`Base de comparación: ${samples.length} muestras, ${people.length} inspectores y ${summary.totals.total} evaluaciones recibidas. Conformidad por inspector = conformidades / evaluaciones recibidas del inspector x 100. Los resultados parciales y por revisar se contabilizan por separado.`,7.5,C.muted);
 const pages=pdf.getNumberOfPages(),logo=pdf.getImageProperties(logoData),logoScale=Math.min(39/logo.width,14/logo.height);
 for(let p=1;p<=pages;p++){
  pdf.setPage(p);pdf.addImage(logoData,'PNG',14,11,logo.width*logoScale,logo.height*logoScale,'session-expalsa-logo','FAST');
  write('GERENCIA DE CALIDAD',196,16,8,'bold',C.navy,{align:'right'});write('Informe técnico de análisis sensorial',196,22,7.5,'normal',C.muted,{align:'right'});
  pdf.setDrawColor(...C.line);pdf.line(14,29,196,29);
  write(lines(session.name,125,7).slice(0,1),14,35,7,'normal',C.muted);write(session.date,196,35,7,'normal',C.muted,{align:'right'});
  pdf.line(14,279,196,279);write(`Emitido: ${stamp(generatedAt)}`,14,285,6.5,'normal',C.muted);write(`Página ${p} de ${pages}`,196,285,6.5,'normal',C.muted,{align:'right'});
 }
 return {pdf,summary,filename:`EXPALSA-informe-gerencial-${fileName(session.name)}-${session.date}.pdf`};
}

export async function downloadFlavorSessionReport(data){
 const resources=await loadFlavorPdfResources();
 const {pdf,filename}=createFlavorSessionReport({...data,...resources});
 await pdf.save(filename,{returnPromise:true});return filename;
}
