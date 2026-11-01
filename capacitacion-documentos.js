export function createTrainingDocuments({notify}){
 const root='./documentos-capacitacion/';
 const plan='PLAN_CAPACITACION.pdf';
 const $=id=>document.getElementById(id);
 const fileDay=n=>'DIA_'+String(n).padStart(2,'0')+'.pdf';
 let lastPlanCheck=0;
 function url(name){return root+encodeURIComponent(name);}
 function readyMessage(){const e=$('planPdfStatus');if(e)e.textContent='El plan PDF todavía no está publicado en el repositorio.';}
 async function isAvailable(name){
  try{const response=await fetch(url(name),{method:'HEAD',cache:'no-store'});return response.ok&&(response.headers.get('content-type')||'').includes('pdf');}catch(e){return false;}
 }
 async function downloadFile(name){
  if(!await isAvailable(name))throw Error('Este PDF todavía no está publicado en el repositorio.');
  const a=document.createElement('a');a.href=url(name);a.download=name;document.body.appendChild(a);a.click();a.remove();
 }
 async function downloadDay(value){
  const day=Number(value);
  if(!Number.isInteger(day)||day<1||day>10)throw Error('Día inválido.');
  return downloadFile(fileDay(day));
 }
 async function downloadPlan(){return downloadFile(plan);}
 async function activate(){
  const iframe=$('planPdfFrame');
  if(!iframe)return;
  if(iframe.getAttribute('data-loaded')==='true')return;
  const ok=await isAvailable(plan);
  const current=$('planPdfFrame');
  if(!current)return;
  if(ok){
   current.src=url(plan);current.hidden=false;current.setAttribute('data-loaded','true');
   const status=$('planPdfStatus');if(status)status.textContent='';
  }else{
   current.hidden=true;readyMessage();
  }
 }
 function onNavigateAway(){}
 function showError(error){
  const msg=error?.message||String(error);
  const status=$('planPdfStatus');if(status)status.textContent=msg;
  notify?.(msg);
 }
 return {downloadDay,downloadPlan,activate,onNavigateAway,showError};
}