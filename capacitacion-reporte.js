// EXPALSA · Informe PDF de capacitación individual
function clean(s){return String(s??'').replace(/[\u2013\u2014]/g,'-').replace(/\u2022/g,'-').replace(/\s+/g,' ').trim();}
function fitImage(pdf,picture,x,y,maxW,maxH){
  if(!picture?.jpeg?.startsWith('data:image/jpeg;base64,'))return false;
  const w=Number(picture.width)||4,h=Number(picture.height)||3;
  const scale=Math.min(maxW/w,maxH/h);
  const W=Math.max(1,w*scale),H=Math.max(1,h*scale);
  try{pdf.addImage(picture.jpeg,'JPEG',x+(maxW-W)/2,y+(maxH-H)/2,W,H,undefined,'FAST');return true;}
  catch(e){console.warn('Imagen PDF no disponible:',e);return false;}
}
export async function crearReporteCapacitacion({day,person,session,photos,score,stationName}){
  if(!day||!person||!session)throw Error('Selecciona un inspector y una jornada.');
  const {jsPDF}=await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm');
  if(typeof jsPDF!=='function')throw Error('No se pudo cargar el generador PDF.');
  const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
  const width=210,ink=[23,48,68],blue=[10,67,94],soft=[240,247,249],muted=[99,121,138],green=[16,119,99];
  pdf.setProperties({title:'EXPALSA - Reporte individual de capacitacion',subject:'Desempeno formativo - Dia '+day.day,author:'Departamento de Calidad EXPALSA'});
  const font=(size=10,style='normal',color=ink)=>{pdf.setFont('helvetica',style);pdf.setFontSize(size);pdf.setTextColor(...color);};
  const txt=(str,x,y,size=10,style='normal',color=ink)=>{font(size,style,color);pdf.text(clean(str),x,y);};
  const hline=(x,y,w,color=[215,227,235])=>{pdf.setDrawColor(...color);pdf.line(x,y,x+w,y);};
  const box=(x,y,w,h,color=soft)=>{pdf.setFillColor(...color);pdf.roundedRect(x,y,w,h,2.2,2.2,'F');};
  const labelLine=(label,value,x,y,max=83)=>{font(8,'bold',muted);pdf.text(clean(label).toUpperCase(),x,y);font(10,'normal',ink);const lines=pdf.splitTextToSize(clean(value||'-'),max);pdf.text(lines.slice(0,2),x,y+5);};
  const heading=(title,sub='')=>{
    pdf.setFillColor(...blue);pdf.rect(0,0,width,27,'F');
    txt('EXPALSA',16,12,15,'bold',[255,255,255]);
    txt('GERENCIA DE CALIDAD',16,19,8,'normal',[208,235,239]);
    txt(title,16,37,14,'bold');
    if(sub)txt(sub,16,44,8,'normal',muted);
  };
  heading('REPORTE INDIVIDUAL DE CAPACITACION','Programa de fortalecimiento tecnico · 2026');
  box(15,50,180,34);
  labelLine('Inspector',person.name,20,57,80);
  labelLine('Area',stationName||person.station,116,57,70);
  labelLine('Fecha',session.date,20,72,80);
  labelLine('Jornada / Duracion','Dia '+day.day+' de 10 · '+(session.minutes||0)+' minutos',116,72,70);
  txt(day.title,16,91,11,'bold');
  hline(16,94,178);
  pdf.setFillColor(232,241,244);pdf.rect(16,98,178,8,'F');
  txt('CRITERIO DE OBSERVACION',19,104,8,'bold');
  txt('NIVEL',178,104,8,'bold');
  let y=113;
  for(const c of day.checks){
    const v=session.ratings?.[c.id];
    const scoreLabel=v==='na'?'N/A':Number.isInteger(v)?v+'/4':'Pendiente';
    const lines=pdf.splitTextToSize(clean(c.c+' · '+c.label),150);
    font(9);pdf.text(lines.slice(0,2),19,y);
    txt(scoreLabel,182,y,9,'bold',Number.isInteger(v)&&v<3?[166,60,72]:ink);
    y+=Math.max(9,lines.length*4.4+3);
    hline(19,y-5,171,[231,237,241]);
  }
  box(16,y+1,178,11,[227,244,239]);
  txt('Resultado práctico',20,y+8,9,'bold');
  txt(score===null?'Sin calificar':score+'%',174,y+8,11,'bold',green);
  y+=15;
  const overflow=[];
  const section=(label,value)=>{
    txt(label,16,y,8.5,'bold');
    y+=4;
    font(8);
    const full=pdf.splitTextToSize(clean(value||'Sin observaciones registradas.'),176);
    pdf.text(full.slice(0,2),17,y);
    if(full.length>2)overflow.push({label,text:clean(value)});
    y+=Math.min(2,full.length)*3.8+4;
  };
  section('Hallazgos y evidencias observadas',session.notes);
  section('Refuerzo o seguimiento',session.followup||'No registrado.');
  const imageTop=Math.max(y+4,205);
  const imageH=Math.max(14,272-imageTop);
  hline(16,imageTop-7,178);
  txt('EVIDENCIA FOTOGRAFICA PRINCIPAL',16,imageTop-1,8,'bold',blue);
  const main=photos.main;
  if(!fitImage(pdf,main,17,imageTop+2,176,imageH-3)){
    box(17,imageTop+3,176,imageH-5,[247,249,250]);
    txt('Sin fotografia principal registrada',56,imageTop+imageH/2,9,'normal',muted);
  }
  if(overflow.length){
    pdf.addPage();
    heading('DETALLE DEL REGISTRO TECNICO','Inspector: '+person.name+' · Día '+day.day);
    let detailY=54;
    for(const entry of overflow){
      txt(entry.label,16,detailY,10,'bold');
      detailY+=8;
      font(9);
      const lines=pdf.splitTextToSize(entry.text,176);
      for(const line of lines){
        if(detailY>273){pdf.addPage();heading('DETALLE DEL REGISTRO TECNICO (CONT.)');detailY=54;font(9);}
        pdf.text(line,17,detailY);
        detailY+=5.2;
      }
      detailY+=9;
    }
  }
  const annexes=photos.annexes||[];
  for(let i=0;i<annexes.length;i+=2){
    pdf.addPage();
    heading('ANEXOS FOTOGRAFICOS','Inspector: '+person.name+' · Día '+day.day);
    const batch=annexes.slice(i,i+2);
    for(let j=0;j<batch.length;j++){
      const img=batch[j],start=j===0?55:166,criterion=day.checks.find(c=>c.id===img.criterionId);
      const title=criterion?criterion.c+' · '+criterion.label:'Evidencia adicional';
      txt('ANEXO '+(i+j+1),16,start,9,'bold',blue);
      const titleParts=pdf.splitTextToSize(clean(title),166);
      font(9,'normal');pdf.text(titleParts.slice(0,2),16,start+6);
      box(16,start+15,178,87,[248,251,252]);
      if(!fitImage(pdf,img,18,start+17,174,83)){
        txt('Imagen no disponible',74,start+61,8,'normal',muted);
      }
    }
  }
  const total=pdf.getNumberOfPages();
  for(let page=1;page<=total;page++){
    pdf.setPage(page);
    hline(16,283,178);
    txt('EXPALSA · Control de capacitacion · '+(session.status==='done'?'Finalizada':'Borrador'),16,289,7,'normal',muted);
    txt('Pagina '+page+' de '+total,171,289,7,'normal',muted);
  }
  const safe=(person.name||'inspector').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_').slice(0,55);
  pdf.save('EXPALSA_Capacitacion_D'+String(day.day).padStart(2,'0')+'_'+safe+'.pdf');
  return {pages:total,annexes:annexes.length};
}