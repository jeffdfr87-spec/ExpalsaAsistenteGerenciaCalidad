import {perfilMateriaPrima,textoPerfil,mostrarFechaRecepcion,ordenarSabores,indexarComparaciones,compararContramuestra} from './sabor-modelo.js?v=20261105-workflow-2';
// EXPALSA - Resultados de una muestra, con jsPDF y jsPDF-AutoTable.
const COLORS={ink:[25,53,74],navy:[8,40,61],teal:[8,125,137],muted:[104,126,139],line:[220,229,234],soft:[243,248,250]};
const clean=value=>String(value??'').replace(/[\u2010-\u2015]/g,'-').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
const safeName=value=>String(value??'').normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu,'_').slice(0,80)||'sin-dato';
const dateTime=value=>new Intl.DateTimeFormat('es-EC',{timeZone:'America/Guayaquil',dateStyle:'short',timeStyle:'short'}).format(new Date(value));

export function createFlavorReport({jsPDF,autoTable,session,sample,inspectors,evaluations,logoData,samplePhotos=[],inspectorPhotos=[],generatedAt=Date.now()}){
 if(!sample||!session||!Array.isArray(inspectors)||!logoData)throw Error('No se pudo preparar el reporte de la muestra.');
 const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
 const votes=new Map(evaluations.filter(v=>v.sampleId===sample.id).map(v=>[v.inspectorUid,v]));
 const reception=ordenarSabores(perfilMateriaPrima(sample)||[]);
 const stats=indexarComparaciones([sample],evaluations,inspectors).get(sample.id);
 const rows=inspectors.map(person=>{
  const vote=votes.get(person.uid);
  const name=person.name||person.email||'Inspector';
  const identity=[name,person.email&&person.email!==name?person.email:'',vote?.createdAtMs?dateTime(vote.createdAtMs):''].filter(Boolean).join('\n');
  return [clean(identity),compararContramuestra(sample,vote).label,clean([vote?.counterFlavors?textoPerfil(vote.counterFlavors):'',vote?.observations||''].filter(Boolean).join('\n'))];
 });
 const received=stats.total,good=stats.good,bad=stats.bad,pending=stats.pending;
 const result=!received?'Sin resultados':[good?`Conformidad ${stats.goodPercent}%`:'',bad?`Discrepancia ${stats.badPercent}%`:'',stats.review?`Por revisar ${stats.reviewPercent}%`:''].filter(Boolean).join(' | ');
 const write=(value,x,y,size=9,style='normal',color=COLORS.ink,options={})=>{
  pdf.setFont('helvetica',style);pdf.setFontSize(size);pdf.setTextColor(...color);pdf.text(Array.isArray(value)?value.map(clean):clean(value),x,y,options);
 };
 pdf.setProperties({title:`EXPALSA - Resultados - Lote ${clean(sample.lote)}`,subject:'Análisis de sabor de materia prima',author:'Gerencia de Calidad - EXPALSA'});
 pdf.setFont('helvetica','bold');pdf.setFontSize(18);
 const heading=pdf.splitTextToSize(clean(`Lote ${sample.lote}`),182);
 const top=42+heading.length*7+5;
 const margin={left:14,right:14,top,bottom:20};
 const common={margin,styles:{font:'helvetica',fontSize:9,cellPadding:3,textColor:COLORS.ink,lineColor:COLORS.line,lineWidth:0.15,overflow:'linebreak'},tableWidth:182};
 autoTable(pdf,{
  ...common,startY:top,theme:'grid',body:[
   ['Sesión',clean(session.name),'Fecha',clean(session.date)],
   ['Lote',clean(sample.lote),'Fecha de recepción',clean(mostrarFechaRecepcion(sample.receivedDate))],
   ...((reception.length?reception:[{sabor:'Pendiente de completar',porcentaje:null}]).map((f,i)=>[i===0?{content:'Sabor de recepción de materia prima',rowSpan:Math.max(1,reception.length)}:null,{content:clean((f.porcentaje===null?'':'Sabor ')+f.sabor+(f.porcentaje===null?'':` · ${f.porcentaje}%`)),colSpan:3,styles:{fontStyle:i===0?'bold':'normal'}}].filter(Boolean)))
  ],
  columnStyles:{0:{cellWidth:27,fontStyle:'bold',fillColor:COLORS.soft,fontSize:8},1:{cellWidth:64},2:{cellWidth:27,fontStyle:'bold',fillColor:COLORS.soft,fontSize:8},3:{cellWidth:64}}
 });
 let y=pdf.lastAutoTable.finalY+9;
 const summary=`Evaluaciones: ${received} de ${inspectors.length}  |  Conformes: ${good}  |  Discrepancias: ${bad}  |  Por revisar: ${stats.review}  |  Pendientes: ${pending}`;
 pdf.setFont('helvetica','normal');pdf.setFontSize(9);
 const summaryLines=pdf.splitTextToSize(summary,182);
 if(y+summaryLines.length*5+18>277){pdf.addPage();y=top;}
 pdf.setFont('helvetica','bold');pdf.setFontSize(10);const resultLines=pdf.splitTextToSize(`${pending?'Resultado parcial':'Resultado'}: ${result}`,182);
 write(resultLines,14,y,10,'bold',COLORS.teal);y+=(resultLines.length-1)*5;
 write(summaryLines,14,y+6,8.5,'normal',COLORS.muted);
 // AutoTable handles long observations and repeats the table header on each page.
 autoTable(pdf,{
  ...common,startY:y+summaryLines.length*5+11,theme:'grid',
  head:[['INSPECTOR','RESULTADO','CONTRAMUESTRA / OBSERVACIONES']],body:rows,
  headStyles:{fillColor:COLORS.navy,textColor:[255,255,255],fontSize:8,fontStyle:'bold'},
  alternateRowStyles:{fillColor:[248,251,252]},
  columnStyles:{0:{cellWidth:62},1:{cellWidth:28},2:{cellWidth:92}},
  rowPageBreak:'avoid',showHead:'everyPage',
  didParseCell:cell=>{
   if(cell.section==='body'&&cell.column.index===1){const value=cell.cell.raw;cell.cell.styles.fontStyle='bold';cell.cell.styles.textColor=value==='Conforme'?[19,127,99]:value==='Discrepancia'?[172,60,80]:COLORS.muted;}
  }
 });
 const gallery=[];
 for(const [index,photo] of samplePhotos.entries())gallery.push({photo,label:`Fotografía de la muestra ${index+1}`,audit:photo.uploadedAtMs?`Registrada: ${dateTime(photo.uploadedAtMs)}`:''});
 for(const person of inspectorPhotos){
  if(person.profile?.dataUrl)gallery.push({photo:person.profile,label:`Foto de perfil - ${person.name}`,audit:''});
  for(const [index,photo] of (person.evidence||[]).entries())gallery.push({photo,label:`Evidencia del análisis ${index+1} - ${person.name}`,audit:[photo.capturedAtMs?`Tomada: ${dateTime(photo.capturedAtMs)}`:'',photo.uploadedAtMs?`Registrada: ${dateTime(photo.uploadedAtMs)}`:'',photo.uploadedByEmail?`Responsable: ${photo.uploadedByEmail}`:''].filter(Boolean).join('\n')});
 }
 if(gallery.length){
  const galleryPage=()=>{pdf.addPage();write(`Registro fotográfico - ${gallery.length} fotografías`,14,top,11,'bold',COLORS.navy);return top+7;};
  let photoY=galleryPage();
  for(let i=0;i<gallery.length;i+=2){
   const row=gallery.slice(i,i+2).map(entry=>{
    pdf.setFont('helvetica','normal');pdf.setFontSize(8);
    const caption=pdf.splitTextToSize(clean(entry.label)+(entry.audit?'\n'+clean(entry.audit):''),86);
    return {...entry,caption,height:Math.max(96,73+caption.length*3.5)};
   });
   const rowHeight=Math.max(...row.map(entry=>entry.height));
   if(photoY+rowHeight>277)photoY=galleryPage();
   row.forEach((entry,column)=>{
    const x=14+column*94;let properties;
    try{properties=pdf.getImageProperties(entry.photo.dataUrl);}catch{throw Error('No se pudo incorporar una de las fotografías al PDF. Vuelve a cargarla e intenta nuevamente.');}
    const scale=Math.min(88/properties.width,68/properties.height),w=properties.width*scale,h=properties.height*scale;
    pdf.setDrawColor(...COLORS.line);pdf.rect(x,photoY,88,68);
    pdf.addImage(entry.photo.dataUrl,'JPEG',x+(88-w)/2,photoY+(68-h)/2,w,h,`flavor-photo-${i+column}`,'FAST');
    write(entry.caption,x+1,photoY+73,8,'normal',COLORS.ink);
   });
   photoY+=rowHeight+5;
  }
 }
 const pages=pdf.getNumberOfPages(),logo=pdf.getImageProperties(logoData);
 const scale=Math.min(44/logo.width,17/logo.height);
 for(let page=1;page<=pages;page++){
  pdf.setPage(page);
  pdf.addImage(logoData,'PNG',14,12,logo.width*scale,logo.height*scale,'expalsa-logo','FAST');
  write('GERENCIA DE CALIDAD',196,18,8,'bold',COLORS.navy,{align:'right'});
  write('Análisis de sabor de materia prima',196,24,8,'normal',COLORS.muted,{align:'right'});
  pdf.setDrawColor(...COLORS.line);pdf.line(14,33,196,33);
  write(heading,14,43,18,'bold',COLORS.navy);
  pdf.setDrawColor(...COLORS.line);pdf.line(14,280,196,280);
  write(`Emitido: ${dateTime(generatedAt)}`,14,286,7,'normal',COLORS.muted);
  write(`Página ${page} de ${pages}`,196,286,7,'normal',COLORS.muted,{align:'right'});
 }
 return {pdf,filename:`EXPALSA-resultados-lote-${safeName(sample.lote)}.pdf`};
}

let librariesPromise;
function script(src){return new Promise((resolve,reject)=>{const el=document.createElement('script');el.src=src;el.onload=resolve;el.onerror=()=>{el.remove();reject(Error('No se pudo cargar el generador PDF. Revisa tu conexión e intenta nuevamente.'));};document.head.appendChild(el);});}
async function libraries(){
 if(!librariesPromise)librariesPromise=(async()=>{
  await script(new URL('./vendor/jspdf.umd.min.js?v=4.2.1',import.meta.url).href);
  await script(new URL('./vendor/jspdf.plugin.autotable.min.js?v=5.0.9',import.meta.url).href);
  if(typeof globalThis.jspdf?.jsPDF!=='function'||typeof globalThis.autoTable!=='function')throw Error('El generador PDF no está disponible.');
  return {jsPDF:globalThis.jspdf.jsPDF,autoTable:globalThis.autoTable};
 })().catch(error=>{librariesPromise=undefined;throw error;});
 return librariesPromise;
}
async function logo(){
 const response=await fetch(new URL('./logoexpalsa.png',import.meta.url));if(!response.ok)throw Error('No se pudo cargar el logo de EXPALSA.');
 const blob=await response.blob();
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('No se pudo preparar el logo de EXPALSA.'));reader.readAsDataURL(blob);});
}
export async function downloadFlavorResults(data){
 const [deps,logoData]=await Promise.all([libraries(),logo()]);
 const {pdf,filename}=createFlavorReport({...data,...deps,logoData});
 await pdf.save(filename,{returnPromise:true});
 return filename;
}
