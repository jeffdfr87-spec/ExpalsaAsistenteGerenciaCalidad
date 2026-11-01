export function createTrainingDocuments({getAuth,getAuthorized,notify}){
  const PREFIX='expalsa_capacitacion_privada_2026';
  const PLAN='PLAN_CAPACITACION.pdf';
  const FILES=Array.from({length:10},(_,i)=>'DIA_'+String(i+1).padStart(2,'0')+'.pdf');
  const MAX_BYTES=25*1024*1024;
  let firebaseStorage=null,storageMod=null,planObjectUrl=null,loading=null,version=0;
  const $=id=>document.getElementById(id);
  const allowed=file=>file===PLAN||FILES.includes(file);
  function errorText(error){
    const code=error?.code||'';
    if(code==='storage/unauthorized'||code==='storage/unauthenticated')return 'Acceso denegado. Verifica la cuenta administradora y las reglas de Firebase Storage.';
    if(code==='storage/object-not-found')return 'El PDF todavía no está cargado en Firebase Storage.';
    if(code==='storage/retry-limit-exceeded'||code==='storage/unknown')return 'No se pudo leer el PDF. Comprueba la conexión y la configuración CORS de Firebase Storage.';
    return error?.message||String(error);
  }
  async function getSdk(){
    if(!getAuthorized?.()||!getAuth?.()?.currentUser)throw Error('Acceso exclusivo del administrador de EXPALSA.');
    if(!storageMod)storageMod=await import('https://www.gstatic.com/firebasejs/13.0.0/firebase-storage.js');
    if(!firebaseStorage)firebaseStorage=storageMod.getStorage(getAuth().app);
    return storageMod;
  }
  async function getDocument(file){
    if(!allowed(file))throw Error('Documento no autorizado.');
    const start=version;
    const sdk=await getSdk();
    if(!getAuthorized?.())throw Error('Sesión no autorizada.');
    const blob=await sdk.getBlob(sdk.ref(firebaseStorage,PREFIX+'/'+file),MAX_BYTES);
    if(start!==version||!getAuthorized?.())throw Error('La sesión de administrador ha terminado.');
    if(blob.size===0)throw Error('El archivo PDF está vacío.');
    return blob.type==='application/pdf'?blob:new Blob([blob],{type:'application/pdf'});
  }
  function revokePlan(){
    if(planObjectUrl){URL.revokeObjectURL(planObjectUrl);planObjectUrl=null;}
  }
  function clear(){
    version++;
    revokePlan();
    loading=null;
    const viewer=$('planPdfFrame');
    if(viewer){viewer.removeAttribute('src');viewer.hidden=true;}
  }
  function showError(error){
    const msg=errorText(error);
    const notice=$('planPdfStatus');
    if(notice)notice.textContent=msg;
    notify?.(msg);
  }
  async function downloadFile(file){
    const blob=await getDocument(file);
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;
    anchor.download=file==='PLAN_CAPACITACION.pdf'?'EXPALSA_PLAN_CAPACITACION.pdf':file;
    document.body.appendChild(anchor);
    try{anchor.click();}finally{anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  }
  async function downloadDay(value){
    const day=Number(value);
    if(!Number.isInteger(day)||day<1||day>10)throw Error('Día inválido.');
    return downloadFile(FILES[day-1]);
  }
  async function downloadPlan(){return downloadFile(PLAN);}
  async function activate(){
    const frame=$('planPdfFrame');
    if(!frame)return;
    if(planObjectUrl){frame.src=planObjectUrl;frame.hidden=false;return;}
    if(loading)return loading;
    const start=version;
    const status=$('planPdfStatus');
    if(status)status.textContent='Abriendo documento…';
    loading=(async()=>{
      try{
        const pdf=await getDocument(PLAN);
        if(start!==version||!getAuthorized?.())return;
        const objectUrl=URL.createObjectURL(pdf);
        const target=$('planPdfFrame');
        if(!target||!getAuthorized?.()){URL.revokeObjectURL(objectUrl);return;}
        revokePlan();
        planObjectUrl=objectUrl;
        target.src=objectUrl;
        target.hidden=false;
        const note=$('planPdfStatus');
        if(note)note.textContent='';
      }catch(error){
        if(start===version){
          const target=$('planPdfFrame');
          if(target)target.hidden=true;
          showError(error);
        }
      }finally{if(start===version)loading=null;}
    })();
    return loading;
  }
  function onNavigateAway(){
    revokePlan();
    const viewer=$('planPdfFrame');
    if(viewer)viewer.removeAttribute('src');
  }
  return {activate,downloadDay,downloadPlan,showError,onNavigateAway,clear};
}
