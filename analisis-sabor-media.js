import {savePhotoDraft,loadPhotoDraft} from './analisis-sabor-progreso.js?v=20261106-reception-1';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=c=>`${c.sessionId}/${c.sampleId}/${c.inspectorUid||''}`;
const jpeg=value=>typeof value==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
const uid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}_${Math.random().toString(36).slice(2)}`;
export async function compressPhoto(file,origin='gallery'){
 if(!file?.type?.startsWith('image/'))throw Error('Selecciona un archivo de imagen válido.');
 if(file.size>30*1024*1024)throw Error('La imagen original supera los 30 MB.');
 const url=URL.createObjectURL(file),image=new Image();
 try{
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('No se pudo leer la imagen. Usa JPEG o PNG.'));image.src=url;});
  let scale=Math.min(1,1280/Math.max(image.naturalWidth,image.naturalHeight));
  for(let attempt=0;attempt<5;attempt++){
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
   for(let quality=.8;quality>=.31;quality-=.1){const dataUrl=canvas.toDataURL('image/jpeg',quality);if(dataUrl.length<=240000)return {id:uid(),dataUrl,origin,capturedAtMs:Date.now()};}
   scale*=.72;
  }
  throw Error('No se pudo comprimir la fotografía. Intenta con otra imagen.');
 }finally{URL.revokeObjectURL(url);}
}
export function createFlavorMedia({api,getState,notify}){
 const pendingEvidence=new Map(),pendingSamples=new Map(),sampleCache=new Map(),evidenceCache=new Map(),sampleDrafts=new Map();
 let sampleDraft=[],draftSessionId='',processing=false,cameraStream=null,cameraContext=null,hydrateVersion=0;
 function persist(){const uid=getState().user?.uid;if(!uid)return;if(draftSessionId)sampleDrafts.set(draftSessionId,sampleDraft);void savePhotoDraft(uid,{drafts:[...sampleDrafts],pendingEvidence:[...pendingEvidence],pendingSamples:[...pendingSamples]}).catch(()=>notify('No se pudo conservar el borrador de fotos en este equipo.'));}
 const camera=document.createElement('dialog');camera.className='flavor-camera';camera.setAttribute('aria-label','Capturar evidencia del análisis');
 camera.innerHTML='<div class="dialog-head"><h2>Evidencia del análisis</h2><button type="button" data-media-action="close-camera" aria-label="Cerrar cámara">×</button></div><div class="dialog-body"><video id="flavor-camera-video" autoplay playsinline muted></video><p id="flavor-camera-status" class="hint">Preparando cámara trasera…</p></div><div class="dialog-foot"><button class="button" type="button" data-media-action="close-camera">Cancelar</button><button class="button primary" type="button" data-media-action="capture" disabled>Tomar foto</button></div>';
 document.body.appendChild(camera);
 const samplePicker=document.createElement('input');samplePicker.type='file';samplePicker.accept='image/*';samplePicker.multiple=true;samplePicker.hidden=true;document.body.appendChild(samplePicker);
 const context=()=>{const s=getState();return {sessionId:s.session?.id,sampleId:s.analysisSampleId,inspectorUid:s.analysisInspectorUid};};
 function validContext(c){return !!(c.sessionId&&c.sampleId);}
 const photosHtml=(photos,remove='')=>photos.map((p,i)=>jpeg(p.dataUrl)?`<figure class="flavor-photo"><img src="${esc(p.dataUrl)}" alt="Fotografía ${i+1}" loading="lazy"><figcaption>Fotografía ${i+1}${remove.startsWith('saved-')?`<div class="actions">${remove==='saved-sample'?`<button class="quiet" type="button" data-media-action="replace-gallery" data-id="${esc(p.id)}">Galería</button><button class="quiet" type="button" data-media-action="retake-sample" data-id="${esc(p.id)}">Volver a tomar</button>`:''}${getState().canDelete?`<button class="quiet danger" type="button" data-media-action="delete-photo" data-kind="${remove==='saved-sample'?'sample':'evidence'}" data-id="${esc(p.id)}">Eliminar</button>`:''}</div>`:remove?` <button type="button" class="quiet" data-media-action="${remove}" data-index="${i}">Quitar</button>${remove==='remove-sample-draft'?` <button type="button" class="quiet" data-media-action="replace-draft" data-index="${i}">Galería</button><button type="button" class="quiet" data-media-action="retake-draft" data-index="${i}">Volver a tomar</button>`:''}`:''}</figcaption></figure>`:'').join('');
 async function allPhotos(c,kind){let cursor=null,photos=[];do{const page=await api('listPhotos',{...c,kind,cursor});photos.push(...page.photos);cursor=page.cursor;}while(cursor);return photos;}
 function showPending(){
  persist();
  const c=context(),e=document.querySelector('#analysis-evidence'),p=document.querySelector('#sample-photo-pending');
  const pending=pendingEvidence.get(key(c))||[],saved=evidenceCache.get(key(c))||[];
  if(e)e.innerHTML=`<div class="flavor-photo-grid">${photosHtml(saved,'saved-evidence')}${photosHtml(pending,'remove-evidence')}</div>${pending.length?`<p class="hint">${pending.length} fotografías pendientes de guardar.</p>`:''}`;
  const vote=getState().evaluations?.find(v=>v.sampleId===c.sampleId&&v.inspectorUid===c.inspectorUid);
  const save=document.querySelector('#save-pending-evidence');if(save)save.hidden=!pending.length;
  const samplePending=pendingSamples.get(key({...c,inspectorUid:''}))||[];
  if(p)p.innerHTML=`${samplePending.length?`<p class="hint">${samplePending.length} fotos de muestra pendientes.</p><button type="button" class="button" data-media-action="retry-sample-photos">Guardar fotos pendientes</button>`:''}`;
 }
 async function hydrate(){
  const c=context();if(!validContext(c))return;
  const marker=key(c),area=document.querySelector('#inspector-photo-area'),version=++hydrateVersion;if(!area)return;area.dataset.context=marker;
  showPending();
  try{
   const [profile,photos,evidence]=await Promise.all([c.inspectorUid?api('inspectorPhoto',c):Promise.resolve({photo:null}),allPhotos(c,'sample'),c.inspectorUid?allPhotos(c,'evidence'):Promise.resolve([])]);
   if(version!==hydrateVersion)return;sampleCache.set(key({...c,inspectorUid:''}),photos);evidenceCache.set(marker,evidence);
   if(document.querySelector('#inspector-photo-area')?.dataset.context!==marker)return;
   area.innerHTML=jpeg(profile.photo?.dataUrl)?`<img class="inspector-portrait" src="${esc(profile.photo.dataUrl)}" alt="Foto de perfil del inspector seleccionado"><span class="hint">Foto de perfil</span>`:'<div class="portrait-empty">Sin foto de perfil</div>';
   const gallery=document.querySelector('#sample-photo-preview');if(gallery)gallery.innerHTML=photos.length?photosHtml(photos,'saved-sample'):'<p class="hint">Sin fotos de la muestra.</p>';
   showPending();
  }catch(error){if(area.dataset.context===marker){area.textContent='No se pudieron cargar las fotografías.';notify(error.message);}}
 }
 function stopCamera(){cameraStream?.getTracks().forEach(track=>track.stop());cameraStream=null;const video=camera.querySelector('video');video.srcObject=null;camera.querySelector('[data-media-action="capture"]').disabled=true;}
 function closeCamera(){if(camera.open)camera.close();stopCamera();}
 camera.addEventListener('close',stopCamera);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)closeCamera();});
 async function openCamera(options={}){
  const c=context();if(!options.draft&&(!validContext(c)||(options.kind!=='sample'&&!c.inspectorUid)))throw Error('Selecciona una muestra y un inspector.');
  if(!navigator.mediaDevices?.getUserMedia)throw Error('La cámara no está disponible en este navegador. Abre la página con HTTPS en tu teléfono.');
  cameraContext={...c,...options};camera.showModal();camera.querySelector('#flavor-camera-status').textContent='Preparando cámara trasera…';
  try{
   try{cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{exact:'environment'},width:{ideal:1280},height:{ideal:960}},audio:false});}
   catch(error){if(!['OverconstrainedError','NotFoundError'].includes(error.name))throw error;cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280}},audio:false});}
   if(!camera.open){stopCamera();return;}
   const video=camera.querySelector('video');video.srcObject=cameraStream;await video.play();
   camera.querySelector('#flavor-camera-status').textContent=cameraStream.getVideoTracks()[0]?.getSettings?.().facingMode==='environment'?'Cámara trasera lista.':'Cámara disponible en este equipo.';
   camera.querySelector('[data-media-action="capture"]').disabled=false;
  }catch(error){closeCamera();throw Error(error.name==='NotAllowedError'?'Permite el acceso a la cámara para tomar la evidencia.':'No se pudo abrir la cámara. Revisa los permisos y vuelve a intentarlo.');}
 }
 async function capture(){
  const video=camera.querySelector('video');if(!video.videoWidth)throw Error('Espera a que la cámara esté lista.');
  const c={...cameraContext},canvas=document.createElement('canvas');let scale=Math.min(1,1280/Math.max(video.videoWidth,video.videoHeight)),dataUrl='';
  for(let attempt=0;attempt<6;attempt++){canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);dataUrl=canvas.toDataURL('image/jpeg',.7);if(dataUrl.length<=240000)break;scale*=.72;}
  if(!jpeg(dataUrl)||dataUrl.length>240000)throw Error('No se pudo preparar la foto. Vuelve a intentarlo.');
  const photo={id:uid(),dataUrl,origin:'camera',capturedAtMs:Date.now()};closeCamera();
  if(c.draft){if(Number.isInteger(c.draftIndex))sampleDraft.splice(c.draftIndex,1,photo);else sampleDraft.push(photo);showSampleDraft();notify('Foto de muestra agregada.');return;}
  const map=c.kind==='sample'?pendingSamples:pendingEvidence,k=key(c.kind==='sample'?{...c,inspectorUid:''}:c),list=map.get(k)||[];list.push(photo);map.set(k,list);showPending();
  if(c.kind==='sample'){await saveSamplePhotos(c);if(c.replaceId)await api('replacePhoto',{...c,kind:'sample',oldPhotoId:c.replaceId,newPhotoId:photo.id});}else await uploadEvidence(c);
  await hydrate();notify('Foto capturada y guardada.');
 }
 async function upload(c,kind,map){
  const k=key(kind==='sample'?{...c,inspectorUid:''}:c),pending=map.get(k)||[];
  for(const photo of [...pending]){await api('uploadPhoto',{...c,kind,photo});const current=map.get(k)||[];map.set(k,current.filter(p=>p.id!==photo.id));}
 }
 async function uploadEvidence(c){await upload(c,'evidence',pendingEvidence);evidenceCache.delete(key(c));showPending();}
 async function saveSamplePhotos(c){await upload(c,'sample',pendingSamples);sampleCache.delete(key({...c,inspectorUid:''}));persist();}
 function showSampleDraft(){persist();const area=document.querySelector('#new-sample-photo-preview');if(area)area.innerHTML=photosHtml(sampleDraft,'remove-sample-draft');}
 document.addEventListener('change',async event=>{
  if(event.target.id!=='new-sample-photos')return;if(processing){notify('Espera a que terminen de prepararse las fotografías.');return;}
  processing=true;try{for(const file of event.target.files)sampleDraft.push(await compressPhoto(file));}catch(error){notify(error.message);}finally{showSampleDraft();event.target.value='';processing=false;}
 });
 samplePicker.addEventListener('change',async()=>{
  const c={...samplePicker.photoContext};if(processing)return;processing=true;
  try{if(c.draft){const photo=await compressPhoto(samplePicker.files[0]);sampleDraft.splice(c.index,1,photo);showSampleDraft();return;}const k=key({...c,inspectorUid:''}),pending=pendingSamples.get(k)||[];pendingSamples.set(k,pending);for(const file of samplePicker.files)pending.push(await compressPhoto(file));showPending();await saveSamplePhotos(c);if(c.replaceId){const photos=await allPhotos(c,'sample');const fresh=photos.find(p=>pending.some(n=>n.id===p.id));if(fresh)await api('replacePhoto',{...c,kind:'sample',oldPhotoId:c.replaceId,newPhotoId:fresh.id});}await hydrate();notify('Fotografías de la muestra guardadas.');}
  catch(error){showPending();notify('Hay fotos pendientes de guardar: '+error.message);}finally{processing=false;samplePicker.value='';}
 });
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-media-action]');if(!button)return;event.preventDefault();const action=button.dataset.mediaAction;
  if(action==='close-camera'){closeCamera();return;}
  if(processing||getState().busy){notify('Espera a que termine la operación actual.');return;}
  if(action==='replace-draft'){samplePicker.multiple=false;samplePicker.photoContext={draft:true,index:Number(button.dataset.index)};samplePicker.click();return;}
  if(action==='replace-gallery'){samplePicker.multiple=false;samplePicker.photoContext={...context(),replaceId:button.dataset.id};samplePicker.click();return;}
  if(action==='add-sample-photos'){samplePicker.multiple=true;samplePicker.photoContext=context();samplePicker.click();return;}
  processing=true;button.disabled=true;
  try{
   if(action==='open-camera')await openCamera();
   else if(action==='retake-draft')await openCamera({draft:true,kind:'sample',draftIndex:Number(button.dataset.index)});
   else if(action==='draft-camera')await openCamera({draft:true,kind:'sample'});
   else if(action==='sample-camera')await openCamera({kind:'sample'});
   else if(action==='retake-sample')await openCamera({kind:'sample',replaceId:button.dataset.id});
   else if(action==='delete-photo'){await api('deletePhoto',{...context(),kind:button.dataset.kind,photoId:button.dataset.id});await hydrate();notify('Fotografía eliminada.');}
   else if(action==='capture')await capture();
   else if(action==='remove-evidence'){const c=context(),list=pendingEvidence.get(key(c))||[];list.splice(Number(button.dataset.index),1);showPending();}
   else if(action==='remove-sample-draft'){sampleDraft.splice(Number(button.dataset.index),1);showSampleDraft();}
   else if(action==='save-evidence'){await uploadEvidence(context());await hydrate();notify('Evidencias guardadas.');}
   else if(action==='retry-sample-photos'){await saveSamplePhotos(context());await hydrate();notify('Fotos de la muestra guardadas.');}
  }catch(error){showPending();notify(error.message);}finally{processing=false;button.disabled=false;}
 });
 return {
  hydrate,closeCamera,showSampleDraft,
  async restore(){const uid=getState().user?.uid;let value;try{value=await loadPhotoDraft(uid);}catch{return;}if(!value||getState().user?.uid!==uid)return;for(const [k,v] of value.drafts||[])sampleDrafts.set(k,v);for(const [k,v] of value.pendingEvidence||[])pendingEvidence.set(k,v);for(const [k,v] of value.pendingSamples||[])pendingSamples.set(k,v);},
  async flushSample(c){await saveSamplePhotos(c);for(const [k,list] of pendingEvidence){if(k.startsWith(c.sessionId+'/'+c.sampleId+'/')&&list.length)await uploadEvidence({...c,inspectorUid:k.split('/')[2]});}},
  clear(){hydrateVersion++;closeCamera();sampleDraft=[];draftSessionId='';sampleDrafts.clear();pendingSamples.clear();pendingEvidence.clear();sampleCache.clear();evidenceCache.clear();},
  resetSampleDraft(sessionId=''){if(draftSessionId)sampleDrafts.set(draftSessionId,sampleDraft);draftSessionId=sessionId;sampleDraft=sampleDrafts.get(sessionId)||[];},
  assertReady(){if(processing)throw Error('Espera a que terminen de prepararse las fotografías.');},
  async saveNewSample(c){this.assertReady();const k=key({...c,inspectorUid:''});pendingSamples.set(k,[...(pendingSamples.get(k)||[]),...sampleDraft]);sampleDraft=[];sampleDrafts.delete(c.sessionId);draftSessionId='';persist();await saveSamplePhotos(c);},
  uploadEvidence,
  async forReport({session,sample,inspectors}){
   if(!getState().canReadResults)throw Error('No tienes acceso a este reporte.');
   if(session.memberRemovalPending)throw Error('Termina la eliminación de inspectores antes de generar el PDF.');
   const c={sessionId:session.id,sampleId:sample.id};
   if((pendingSamples.get(key({...c,inspectorUid:''}))||[]).length||inspectors.some(p=>(pendingEvidence.get(key({...c,inspectorUid:p.uid}))||[]).length))throw Error('Guarda las fotografías pendientes antes de generar el PDF.');
   const samplePhotos=await allPhotos(c,'sample'),inspectorPhotos=[];
   for(let start=0;start<inspectors.length;start+=4){const group=await Promise.all(inspectors.slice(start,start+4).map(async person=>{const ctx={...c,inspectorUid:person.uid};const [profile,evidence]=await Promise.all([api('inspectorPhoto',ctx),allPhotos(ctx,'evidence')]);return {uid:person.uid,name:person.name||person.email,profile:profile.photo,evidence};}));inspectorPhotos.push(...group);}
   return {samplePhotos,inspectorPhotos};
  }
 };
}
