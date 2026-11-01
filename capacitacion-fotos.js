export function createPhotoManager({fs,db,auth,getSession,getSaved,saveDraft,isSaving,notify}){
 const S='expalsa_capacitacion_2026_sesiones',MAX=15,LIMIT=170000;
 const cache=new Map(),pending=new Set();
 let busy=false,stream=null,targetCriterion='';
 const el=id=>document.getElementById(id),current=()=>getSession();
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const list=id=>cache.get(id)||[];
 function thumb(p,i,done,old=false){if(!p.jpeg?.startsWith('data:image/jpeg;base64,'))return '';
  return '<div class="photo-tile"><a href="'+esc(p.jpeg)+'" target="_blank" rel="noopener noreferrer"><img src="'+esc(p.jpeg)+'" alt="Evidencia '+(i+1)+'"></a><div class="photo-foot"><span>'+(old?'Anterior':p.origin==='camera'?'Cámara':'Galería')+' '+(i+1)+'</span>'+(done?'':old?'<button class="button sm danger" data-photo-old="1">Quitar</button>':'<button class="button sm danger" data-photo-del="'+esc(p.id)+'">Quitar</button>')+'</div></div>';
 }
 function grid(d){const old=d.evidenceImage?.startsWith('data:image/jpeg;base64,')?[{jpeg:d.evidenceImage}]:[];const base=list(d.id).filter(p=>!p.criterionId);return old.map((p,i)=>thumb(p,i,d.status==='done',true)).concat(base.map((p,i)=>thumb(p,i+old.length,d.status==='done'))).join('')||'<span class="small muted">Sin fotografías</span>';}
 function criterionGrid(d,c){if(!d)return '';const images=list(d.id).filter(p=>p.criterionId===c);return images.length?'<div class="photo-gallery criterion-gallery">'+images.map((p,i)=>thumb(p,i,d.status==='done')).join('')+'</div>':'';}
 function criterionHtml(d,c){return '<div class="criterion-evidence" data-criterion-list="'+c+'">'+criterionGrid(d,c)+'</div>';}
 function html(d){const count=list(d.id).filter(p=>!p.criterionId).length+(d.evidenceImage?1:0);return '<div class="form-field"><label>Evidencia fotográfica autorizada <span id="photoCounter" class="photo-count">'+count+' principal(es)</span></label><div class="photo-actions"><button type="button" class="button primary" data-photo="camera" '+(d.status==='done'?'disabled':'')+'>Tomar foto</button><button type="button" class="button" data-photo="gallery" '+(d.status==='done'?'disabled':'')+'>Seleccionar de galería</button><input type="file" id="evidenceGallery" accept="image/*" multiple hidden></div><div id="evidenceList" class="photo-gallery">'+grid(d)+'</div><p id="photoUploadStatus" class="photo-upload-status" role="status"></p></div>';}
 function status(s){if(el('photoUploadStatus'))el('photoUploadStatus').textContent=s;}
 function draw(id){if(current()?.id!==id)return;const d=current();if(el('evidenceList'))el('evidenceList').innerHTML=grid(d);if(el('photoCounter'))el('photoCounter').textContent=(list(id).filter(p=>!p.criterionId).length+(d.evidenceImage?1:0))+' principal(es)';document.querySelectorAll('[data-criterion-list]').forEach(node=>{const c=node.getAttribute('data-criterion-list');node.innerHTML=criterionGrid(d,c);});}
 async function load(id){if(cache.has(id)||pending.has(id))return;pending.add(id);try{const snap=await fs.getDocs(fs.collection(db,S,id,'fotos'));const rows=snap.docs.map(p=>({id:p.id,...p.data()})).filter(x=>x.jpeg?.startsWith('data:image/jpeg;base64,'));rows.sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0)||a.id.localeCompare(b.id));cache.set(id,rows);}catch(e){if(current()?.id===id)status(helpfulError(e));}finally{pending.delete(id);draw(id);}}
 function activate(){const d=current();const mount=el('photoMount');if(mount&&d)mount.outerHTML=html(d);if(d)void load(d.id);if(d)draw(d.id);}
 async function parent(id){if(current()?.id!==id||current().status==='done')throw Error('La jornada está cerrada.');let i=0;while(isSaving()&&i++<100)await new Promise(ok=>setTimeout(ok,50));if(isSaving())throw Error('Se está guardando la jornada.');if(!getSaved(id)){await saveDraft();i=0;while(isSaving()&&i++<100)await new Promise(ok=>setTimeout(ok,50));}if(!getSaved(id))throw Error('Guarda el borrador antes de subir fotografías.');}
 async function compressed(f,maxLen=LIMIT){if(!f?.type?.startsWith('image/'))throw Error('Archivo de imagen no válido.');if(f.size>15*1024*1024)throw Error('Fotografía superior a 15 MB.');
  const data=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>no(Error('Error al leer imagen.'));r.readAsDataURL(f);});
  const im=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>no(Error('Imagen no compatible.'));i.src=data;});
  if(!im.naturalWidth||!im.naturalHeight)throw Error('Fotografía vacía.');
  let c=document.createElement('canvas'),scale=Math.min(1,900/Math.max(im.naturalWidth,im.naturalHeight));
  c.width=Math.max(1,Math.round(im.naturalWidth*scale));c.height=Math.max(1,Math.round(im.naturalHeight*scale));c.getContext('2d',{alpha:false}).drawImage(im,0,0,c.width,c.height);
  let jpg='';for(let q=.78;q>=.26;q-=.09){jpg=c.toDataURL('image/jpeg',q);if(jpg.length<=maxLen)break;}
  if(jpg.length>maxLen){const small=document.createElement('canvas');small.width=Math.max(1,Math.round(c.width*.65));small.height=Math.max(1,Math.round(c.height*.65));small.getContext('2d').drawImage(c,0,0,small.width,small.height);c=small;jpg=c.toDataURL('image/jpeg',.45);}
  if(jpg.length>maxLen)throw Error('No fue posible reducir la imagen.');
  return {jpeg:jpg,width:c.width,height:c.height,size:Math.round((jpg.length-23)*.75)};
 }
 function permissionError(e){
  return e?.code==='permission-denied'||/Missing or insufficient permissions/i.test(e?.message||'');
 }
 function helpfulError(e){
  return permissionError(e)?'Falta activar el permiso de fotografías en Firestore. La jornada sí se puede guardar.':e?.message||String(e);
 }
 async function mainPhoto(file,id){
  const photo=await compressed(file,140000);
  if(!current()||current().id!==id)throw Error('Cambió la jornada.');
  const existing=current().evidenceImage||'';
  current().evidenceImage=photo.jpeg;
  await saveDraft();
  if(getSaved(id)?.evidenceImage!==photo.jpeg){
    if(current()?.id===id)current().evidenceImage=existing;
    throw Error('No se pudo guardar la fotografía principal. Revisa los permisos de la jornada.');
  }
  draw(id);
 }
 async function upload(files,origin,criterionId=''){
  const arr=Array.from(files||[]),d=current();
  if(!arr.length||!d)return;
  if(busy){notify('Hay otra carga de fotos en curso.');return;}
  busy=true;
  const id=d.id;let coverSaved=false,uploaded=0;
  try{
    await parent(id);
    if(!criterionId&&!current()?.evidenceImage&&arr.length){
      status('Guardando fotografía principal…');
      await mainPhoto(arr.shift(),id);
      coverSaved=true;
    }
    if(!arr.length){
      status('Fotografía principal guardada.');
      notify('Fotografía principal guardada correctamente.');
      return;
    }
    if(!cache.has(id)){
      const snap=await fs.getDocs(fs.collection(db,S,id,'fotos'));
      cache.set(id,snap.docs.map(x=>({id:x.id,...x.data()})));
    }
    const rows=cache.get(id),room=MAX-rows.length-(current()?.evidenceImage?1:0);
    if(arr.length>room)throw Error('Puedes subir '+Math.max(0,room)+' fotos adicionales.');
    for(const file of arr){
      if(current()?.id!==id||current()?.status==='done')throw Error('La jornada cambió durante la carga.');
      status('Guardando fotografía '+(uploaded+1)+'/'+arr.length+'…');
      const photo=await compressed(file);
      const photoId='FT_'+crypto.randomUUID().replace(/-/g,'');
      const obj={sessionId:id,personId:d.personId,day:d.day,...photo,origin,criterionId,createdBy:auth.currentUser.uid,createdAt:fs.serverTimestamp()};
      await fs.setDoc(fs.doc(db,S,id,'fotos',photoId),obj);
      rows.push({id:photoId,...obj});
      draw(id);
      uploaded++;
    }
    status((coverSaved?1:0)+uploaded+' fotografía(s) guardada(s).');
    notify('Fotografías guardadas correctamente.');
  }catch(e){
    const detail=helpfulError(e);
    status((coverSaved?'Fotografía principal guardada. ':'')+detail);
    notify((coverSaved?'Se guardó la principal. ':'')+detail);
  }finally{busy=false;draw(id);}
 }
 async function remove(id){const d=current();if(!d||d.status==='done'||busy)return;if(!list(d.id).some(p=>p.id===id)||!confirm('¿Eliminar esta fotografía?'))return;busy=true;try{await fs.deleteDoc(fs.doc(db,S,d.id,'fotos',id));cache.set(d.id,list(d.id).filter(x=>x.id!==id));draw(d.id);}catch(e){notify('No se pudo eliminar: '+helpfulError(e));}finally{busy=false;}}
 const dlg=document.createElement('dialog');dlg.id='evidenceCameraDialog';dlg.className='photo-camera-dialog';dlg.innerHTML='<h3>Tomar fotografía</h3><video id="evidenceCameraVideo" autoplay playsinline muted></video><div class="row"><button type="button" class="button primary" data-photo="capture">Capturar</button><button type="button" class="button" data-photo="close">Cancelar</button></div><input type="file" id="evidenceCameraFallback" accept="image/*" capture="environment" hidden>';document.body.appendChild(dlg);
 function close(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}el('evidenceCameraVideo').srcObject=null;if(dlg.open)dlg.close();}
 dlg.addEventListener('close',()=>{if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}el('evidenceCameraVideo').srcObject=null;});
 async function open(){if(current()?.status==='done'||busy)return;const id=current()?.id;if(!id)return;try{if(!navigator.mediaDevices?.getUserMedia)throw Error('Cámara no disponible');stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'}}});if(current()?.id!==id){close();return;}const video=el('evidenceCameraVideo');video.srcObject=stream;dlg.showModal();await video.play();}catch(e){close();el('evidenceCameraFallback').click();}}
 async function capture(){const video=el('evidenceCameraVideo');if(!stream||!video.videoWidth)return notify('La cámara aún no está lista.');const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);const blob=await new Promise((ok,no)=>canvas.toBlob(b=>b?ok(b):no(Error('Error de captura')),'image/jpeg',.9));close();await upload([new File([blob],'captura.jpg',{type:'image/jpeg'})],'camera',targetCriterion);targetCriterion='';}
 document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.photoDel){await remove(b.dataset.photoDel);return;}if(b.dataset.photoOld){const d=current();if(d?.status==='done'||!confirm('¿Eliminar fotografía anterior?'))return;d.evidenceImage='';await saveDraft();draw(d.id);return;}if(b.dataset.photoCriterion){targetCriterion=b.dataset.photoCriterion;await open();return;}if(!b.dataset.photo)return;switch(b.dataset.photo){case 'gallery':targetCriterion='';el('evidenceGallery')?.click();break;case 'camera':targetCriterion='';await open();break;case 'close':close();break;case 'capture':await capture();break;}});
 document.addEventListener('change',async e=>{if(e.target.id==='evidenceGallery'){const files=Array.from(e.target.files||[]);e.target.value='';await upload(files,'gallery');}if(e.target.id==='evidenceCameraFallback'){const files=Array.from(e.target.files||[]);e.target.value='';await upload(files,'camera',targetCriterion);targetCriterion='';}});
 async function getReportPhotos(d){
  if(!d)throw Error('No hay jornada seleccionada.');
  const snap=await fs.getDocs(fs.collection(db,S,d.id,'fotos'));
  const stored=snap.docs.map(x=>({id:x.id,...x.data()})).filter(x=>typeof x.jpeg==='string'&&x.jpeg.startsWith('data:image/jpeg;base64,'));
  stored.sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0)||a.id.localeCompare(b.id));
  cache.set(d.id,stored);
  draw(d.id);
  const legacy=d.evidenceImage?.startsWith('data:image/jpeg;base64,')?{jpeg:d.evidenceImage,origin:'legacy',criterionId:'',id:'legacy'}:null;
  const general=[...(legacy?[legacy]:[]),...stored.filter(x=>!x.criterionId)];
  const annexes=[...stored.filter(x=>x.criterionId),...general.slice(1)];
  return {main:general[0]||null,annexes,all:stored};
 }
 return {html,activate,criterionHtml,getReportPhotos,isBusy:()=>busy};
}