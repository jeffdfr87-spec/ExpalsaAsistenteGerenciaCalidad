export function createTrainingDocuments({notify}){
  const archivePath='./EXPALSA_DOCUMENTOS_CAPACITACION_2026.zip';
  const planFile='PLAN_CAPACITACION.pdf';
  let archive=null;
  let pending=null;
  let planObjectUrl=null;
  let activated=false;
  const $=id=>document.getElementById(id);
  async function getArchive(){
    if(archive)return archive;
    if(pending)return pending;
    pending=(async()=>{
      const response=await fetch(archivePath,{cache:'no-store'});
      if(!response.ok)throw Error('No se encuentra el paquete de documentos en el repositorio.');
      const bytes=await response.arrayBuffer();
      const JSZip=window.JSZip||(await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
      const loaded=await JSZip.loadAsync(bytes);
      for(let i=1;i<=10;i++)if(!loaded.file('DIA_'+String(i).padStart(2,'0')+'.pdf'))throw Error('Falta el PDF del día '+i+'.');
      if(!loaded.file(planFile))throw Error('Falta el PDF del plan de capacitación.');
      archive=loaded;
      return archive;
    })();
    try{return await pending;}finally{pending=null;}
  }
  async function pdfBlob(filename){
    const z=await getArchive(),item=z.file(filename);
    if(!item)throw Error('Documento no disponible.');
    const data=await item.async('uint8array');
    return new Blob([data],{type:'application/pdf'});
  }
  async function download(filename,saveAs){
    const blob=await pdfBlob(filename);
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download=saveAs;anchor.style.display='none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  async function downloadDay(n){
    const day=Number(n);
    if(!Number.isInteger(day)||day<1||day>10)throw Error('Día inválido.');
    const code=String(day).padStart(2,'0');
    return download('DIA_'+code+'.pdf','EXPALSA_GUIA_CAPACITACION_DIA_'+code+'.pdf');
  }
  async function downloadPlan(){
    return download(planFile,'EXPALSA_PLAN_CAPACITACION_INSPECTORES_2026.pdf');
  }
  function showError(error){
    const panel=$('planPdfStatus');
    if(panel)panel.textContent=error?.message||String(error);
    notify?.(error?.message||String(error));
  }
  async function activate(){
    const frame=$('planPdfFrame');
    if(!frame||activated)return;
    if(planObjectUrl){
      frame.src=planObjectUrl;
      activated=true;
      return;
    }
    const status=$('planPdfStatus');
    if(status)status.textContent='Cargando documento...';
    try{
      const blob=await pdfBlob(planFile);
      planObjectUrl=URL.createObjectURL(blob);
      if($('planPdfFrame'))$('planPdfFrame').src=planObjectUrl;
      if($('planPdfStatus'))$('planPdfStatus').textContent='';
      activated=!!$('planPdfFrame');
    }catch(error){showError(error);}
  }
  function onNavigateAway(){
    activated=false;
  }
  return {downloadDay,downloadPlan,activate,onNavigateAway,showError};
}
