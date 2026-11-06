'use strict';
const {HttpsError}=require('firebase-functions/v2/https');
const {createHash}=require('node:crypto');
const revision=s=>s.membershipRevision||0;
const finished=(sample,session)=>sample.finishedRevision===revision(session);
function error(message){throw new HttpsError('failed-precondition',message);}
async function progressAction(db,user,data){
 if(!user.admin)throw new HttpsError('permission-denied','El autoguardado de gestión es exclusivo del administrador.');
 if(typeof data.key!=='string'||!data.key||data.key.length>400)throw new HttpsError('invalid-argument','Borrador no válido.');
 const ref=db.doc(`expalsa_sabor_progreso/${user.uid}/drafts/${createHash('sha256').update(data.key).digest('hex')}`);
 if(data.action==='loadProgress'){const snap=await ref.get();return {draft:snap.exists?snap.data().draft:null};}
 let serialized;try{serialized=JSON.stringify(data.draft);}catch{}
 if(!serialized||serialized.length>100000||!data.draft||typeof data.draft!=='object'||Array.isArray(data.draft)||!Number.isFinite(data.draft.updatedAtMs))throw new HttpsError('invalid-argument','El borrador supera el tamaño permitido.');
 await db.runTransaction(async tx=>{const old=await tx.get(ref);if(old.exists&&old.data().draft.updatedAtMs>data.draft.updatedAtMs)return;tx.set(ref,{key:data.key,draft:data.draft,savedAtMs:Date.now()});});return {saved:true};
}
async function workflowAction(db,ref,user,data,id){
 if(!user.admin)throw new HttpsError('permission-denied','Acción exclusiva del administrador.');
 return db.runTransaction(async tx=>{
  const root=await tx.get(ref);if(!root.exists||root.data().deleted)throw new HttpsError('not-found','La sesión no está disponible.');
  const session=root.data();if(session.status!=='open'||session.memberRemovalPending)error('La sesión no está disponible para analizar muestras.');
  const sampleRef=ref.collection('samples').doc(id(data.sampleId)),snap=await tx.get(sampleRef);if(!snap.exists||snap.data().deleted)throw new HttpsError('not-found','La muestra no existe.');const sample=snap.data();
  if(data.action==='startSample'){
   if(!(session.membershipVersion===2?session.inspectorCount:session.inspectorUids?.length))error('Agrega inspectores antes de comenzar el análisis.');
   if(finished(sample,session))error('Esta muestra ya está finalizada.');
   if(session.activeSampleId&&session.activeSampleId!==sampleRef.id)error('Termina la muestra activa antes de comenzar otra.');
   tx.update(ref,{workflowVersion:1,activeSampleId:sampleRef.id,workflowUpdatedAtMs:Date.now()});return {activeSampleId:sampleRef.id};
  }
  if(finished(sample,session))return {finished:true};
  if(session.activeSampleId!==sampleRef.id)error('Comienza el análisis de esta muestra antes de finalizarla.');
  const votes=await tx.get(sampleRef.collection('votes'));
  const members=session.membershipVersion===2?(await tx.get(ref.collection('inspectors'))).docs.filter(d=>!d.data().removing).map(d=>d.id):(session.inspectorUids||[]);
  const received=new Set(votes.docs.map(v=>v.id));if(!members.length||members.some(uid=>!received.has(uid)))error('Faltan resultados de inspectores para finalizar esta muestra.');
  const now=Date.now();tx.update(sampleRef,{finishedRevision:revision(session),finishedAtMs:now,finishedBy:user.uid});tx.update(ref,{workflowVersion:1,finishedSampleCount:(session.finishedSampleCount||0)+1,activeSampleId:'',workflowUpdatedAtMs:now});return {finished:true};
 });
}
module.exports={workflowAction,progressAction,finished,revision};
