export function createTrainingDocuments({notify}){
  const ZIP_PATH='./EXPALSA_DOCUMENTOS_CAPACITACION_2026.zip';
  const DB_NAME='expalsa-capacitacion-documentos-2026';
  const PLAN='PLAN_CAPACITACION.pdf';
  let archive=null,pending=null,planUrl=null,activated=false,unavailable=false,uploading=false,requestedDay=null;
  const $=id=>document.getElementById(id);
  function missing(){
    const e=new Error('Carga el paquete de documentos PDF para habilitar las descargas.');
    e.code='DOCUMENTS_MISSING';
    return e;
  }
  function openDB(){
    return new Promise((resolve,reject)=>{
      if(!('indexedDB' in window))return reject(Error('Almacenamiento local no disponible.'));
      const req=indexedDB.open(DB_NAME,1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('documents'))req.result.createObjectStore('documents');};
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||Error('No se pudo abrir almacenamiento.'));
    });
  }
  async function storedRead(){
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('documents','readonly');
      const req=tx.objectStore('documents').get('zip');
      req.onsuccess=()=>resolve(req.result||null);
      req.onerror=()=>reject(req.error);
      tx.oncomplete=()=>db.close();
      tx.onerror=()=>{db.close();reject(tx.error);};
    });
  }
  async function storedWrite(bytes){
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('documents','readwrite');
      tx.objectStore('documents').put(bytes,'zip');
      tx.oncomplete=()=>{db.close();resolve();};
      tx.onerror=()=>{db.close();reject(tx.error);};
      tx.onabort=()=>{db.close();reject(tx.error);};
    });
  }
  async function parse(bytes){
    const JSZip=window.JSZip||(await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
    const z=await JSZip.loadAsync(bytes);
    for(let day=1;day<=10;day++)if(!z.file('DIA_'+String(day).padStart(2,'0')+'.pdf'))throw Error('Falta el PDF del día '+day+' en el paquete.');
    if(!z.file(PLAN))throw Error('Falta el PDF del plan de capacitación en el paquete.');
    return z;
  }
  async function getArchive(){
    if(archive)return archive;
    if(pending)return pending;
    pending=(async()=>{
      if(!unavailable){
        try{
          const response=await fetch(ZIP_PATH,{cache:'no-store'});
          if(response.ok){
            archive=await parse(await response.arrayBuffer());
            return archive;
          }
          unavailable=true;
        }catch(e){unavailable=true;}
      }
      try{
        const saved=await storedRead();
        if(saved){archive=await parse(saved);return archive;}
      }catch(e){}
      throw missing();
    })();
    try{return await pending;}finally{pending=null;}
  }
  function status(message){
    const element=$('planPdfStatus');
    if(element)element.textContent=message||'';
  }
  function togglePrompt(visible){
    const box=$('planPdfUploadBox');
    if(box)box.hidden=!visible;
    const viewer=$('planPdfFrame');
    if(viewer)viewer.hidden=visible;
  }
  async function importZip(file){
    if(!file||uploading)return;
    if(file.size>30*1024*1024)throw Error('El paquete ZIP supera el tamaño permitido.');
    uploading=true;
    try{
      status('Abriendo documentos...');
      const bytes=await file.arrayBuffer();
      const parsed=await parse(bytes);
      archive=parsed;
      unavailable=true;
      if(planUrl){URL.revokeObjectURL(planUrl);planUrl=null;}
      activated=false;
      togglePrompt(false);
      const calendarPrompt=$('trainingDocsCalendarPrompt');
      if(calendarPrompt)calendarPrompt.hidden=true;
      try{await storedWrite(bytes);}catch(e){notify?.('Documentos cargados. Este navegador no permitió conservarlos para una próxima visita.');}
      status('');
      if($('planPdfFrame'))await activate();
      if(requestedDay!==null){const day=requestedDay;requestedDay=null;await downloadDay(day);}
      return true;
    }finally{uploading=false;}
  }
  async function asPdf(filename){
    const z=await getArchive();
    const entry=z.file(filename);
    if(!entry)throw Error('Documento no disponible.');
    const bytes=await entry.async('uint8array');
    return new Blob([bytes],{type:'application/pdf'});
  }
  async function download(filename,saveAs){
    const blob=await asPdf(filename);
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=saveAs;
    document.body.appendChild(a);
    a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  async function downloadDay(value){
    const day=Number(value);
    if(!Number.isInteger(day)||day<1||day>10)throw Error('Día inválido.');
    try{
      const code=String(day).padStart(2,'0');
      await download('DIA_'+code+'.pdf','EXPALSA_GUIA_CAPACITACION_DIA_'+code+'.pdf');
    }catch(e){
      if(e.code==='DOCUMENTS_MISSING'){
        requestedDay=day;
        showError(e);
        return;
      }
      throw e;
    }
  }
  async function downloadPlan(){
    try{
      await download(PLAN,'EXPALSA_PLAN_CAPACITACION_INSPECTORES_2026.pdf');
    }catch(e){
      if(e.code==='DOCUMENTS_MISSING'){
        showError(e);
        return;
      }
      throw e;
    }
  }
  function showError(error){
    if(error?.code==='DOCUMENTS_MISSING'){
      togglePrompt(true);
      const calendarPrompt=$('trainingDocsCalendarPrompt');
      if(calendarPrompt)calendarPrompt.hidden=false;
      status('Selecciona el paquete ZIP de capacitación para acceder a los once PDF.');
      return;
    }
    status(error?.message||String(error));
    notify?.(error?.message||String(error));
  }
  async function activate(){
    const frame=$('planPdfFrame');
    if(!frame||activated)return;
    if(planUrl){frame.src=planUrl;activated=true;togglePrompt(false);status('');return;}
    status('Cargando plan de capacitación...');
    try{
      const blob=await asPdf(PLAN);
      planUrl=URL.createObjectURL(blob);
      const active=$('planPdfFrame');
      if(active){active.src=planUrl;activated=true;}
      togglePrompt(false);status('');
    }catch(e){showError(e);}
  }
  function onNavigateAway(){activated=false;}
  document.addEventListener('change',async e=>{
    if(!['trainingDocsFile','trainingDocsQuickUpload'].includes(e.target?.id))return;
    const input=e.target,file=input.files?.[0];
    input.value='';
    if(!file)return;
    try{await importZip(file);}catch(err){showError(err);}
  });
  return {downloadDay,downloadPlan,activate,onNavigateAway,showError,importZip};
}
