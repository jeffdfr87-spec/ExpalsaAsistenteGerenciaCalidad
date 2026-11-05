'use strict';
const {HttpsError}=require('firebase-functions/v2/https');
const {createHash}=require('node:crypto');
const PHOTO_PAGE_SIZE=4,MAX_IMAGE_BYTES=220000;
function invalid(){throw new HttpsError('invalid-argument','La fotografía no es un JPEG válido o supera el tamaño permitido.');}
function imageData(dataUrl){
 if(typeof dataUrl!=='string'||dataUrl.length>300000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl))invalid();
 const bytes=Buffer.from(dataUrl.slice(23),'base64');
 if(bytes.length<20||bytes.length>MAX_IMAGE_BYTES||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)invalid();
 let width=0,height=0,offset=2;
 while(offset+4<bytes.length){
  if(bytes[offset]!==255)invalid();while(bytes[offset]===255)offset++;
  if(offset>=bytes.length)invalid();const marker=bytes[offset++];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;if(offset+2>bytes.length)invalid();
  const length=bytes.readUInt16BE(offset);if(length<2||offset+length>bytes.length)invalid();
  if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(length<8)invalid();height=bytes.readUInt16BE(offset+3);width=bytes.readUInt16BE(offset+5);break;}
  offset+=length;
 }
 if(!width||!height||width>1600||height>1600)invalid();
 return {dataUrl,width,height,size:bytes.length};
}
async function profilePhoto(db,uid){
 const snap=await db.doc(`expalsa_calidad_fotos_perfil/${uid}`).get();
 if(!snap.exists||typeof snap.data().jpeg!=='string')return null;
 try{return imageData('data:image/jpeg;base64,'+snap.data().jpeg);}catch{return null;}
}
async function photoAction({db,user,sessionRef,session,data,id,canManage,assignedInspector}){
 const sampleRef=sessionRef.collection('samples').doc(id(data.sampleId));
 if(!(await sampleRef.get()).exists)throw new HttpsError('not-found','La muestra no existe.');
 let targetUid='',voteRef;
 if(data.action==='inspectorPhoto'||data.kind==='evidence'){
  targetUid=id(data.inspectorUid);
  if(!canManage(user)&&targetUid!==user.uid)throw new HttpsError('permission-denied','Solo puedes consultar tus propias fotografías.');
  if(!await assignedInspector(sessionRef,session,targetUid))throw new HttpsError('permission-denied','El inspector no está asignado a esta sesión.');
  voteRef=sampleRef.collection('votes').doc(targetUid);
 }
 if(data.action==='inspectorPhoto'){
  const snapshot=await voteRef.collection('photos').doc('profile').get();
  return {photo:snapshot.exists?snapshot.data():await profilePhoto(db,targetUid)};
 }
 if(!['sample','evidence'].includes(data.kind))throw new HttpsError('invalid-argument','Tipo de fotografía no válido.');
 const photos=data.kind==='sample'?sampleRef.collection('photos'):voteRef.collection('photos');
 if(data.action==='listPhotos'){
  let query=photos.orderBy('__name__');if(data.cursor)query=query.startAfter(id(data.cursor));
  const snap=await query.limit(PHOTO_PAGE_SIZE+1).get(),docs=snap.docs.slice(0,PHOTO_PAGE_SIZE);
  return {photos:docs.filter(d=>d.data().kind!=='profile').map(d=>({id:d.id,...d.data()})),cursor:snap.size>PHOTO_PAGE_SIZE?docs.at(-1).id:null};
 }
 if(!canManage(user)&&data.kind==='sample')throw new HttpsError('permission-denied','Solo los responsables pueden agregar fotos de muestras.');
 if(data.kind==='evidence'&&data.photo?.origin!=='camera')throw new HttpsError('invalid-argument','La evidencia del análisis debe capturarse con la cámara.');
 const photo=imageData(data.photo?.dataUrl),photoId=id(data.photo?.id),origin=data.kind==='evidence'?'camera':data.photo?.origin;
 if(data.kind==='evidence'&&photoId==='profile')throw new HttpsError('invalid-argument','Identificador de fotografía reservado.');
 if(!['camera','gallery'].includes(origin))throw new HttpsError('invalid-argument','Origen de fotografía no válido.');
 const ref=photos.doc(photoId),digest=createHash('sha256').update(photo.dataUrl).digest('hex');
 return db.runTransaction(async tx=>{
  const fresh=await tx.get(sessionRef),sample=await tx.get(sampleRef),existing=await tx.get(ref);
  if(!fresh.exists||fresh.data().deleted===true||!sample.exists)throw new HttpsError('not-found','La sesión o la muestra ya no está disponible.');
  if(data.kind==='evidence'&&!(await tx.get(voteRef)).exists)throw new HttpsError('failed-precondition','Guarda primero la evaluación del inspector.');
  if(existing.exists){if(existing.data().digest!==digest)throw new HttpsError('already-exists','Esta fotografía ya fue registrada con otro contenido.');return {saved:true,id:ref.id};}
  const now=Date.now(),captured=Number(data.photo.capturedAtMs);
  tx.create(ref,{...photo,kind:data.kind,origin,digest,inspectorUid:targetUid,uploadedBy:user.uid,uploadedByEmail:user.email,uploadedAtMs:now,capturedAtMs:Number.isFinite(captured)&&captured>0&&captured<=now+300000?captured:now});
  return {saved:true,id:ref.id};
 });
}
module.exports={imageData,profilePhoto,photoAction,MAX_IMAGE_BYTES};
