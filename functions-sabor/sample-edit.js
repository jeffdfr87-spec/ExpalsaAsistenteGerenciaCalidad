'use strict';
const {createHash}=require('node:crypto');
const {HttpsError}=require('firebase-functions/v2/https');
const {FieldValue}=require('firebase-admin/firestore');
function canonical(value){
 if(value===null||typeof value!=='object')return value;
 if(typeof value.toMillis==='function')return value.toMillis();
 if(Array.isArray(value))return value.map(canonical);
 return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
}
function version(session,sample,votes,members){return createHash('sha256').update(JSON.stringify(canonical({session,sample,votes,members}))).digest('hex');}
async function sampleEdit({db,ref,user,data,id,sampleData,resultData,uniqueLetter}){
 if(user.admin!==true)throw new HttpsError('permission-denied','Acción exclusiva del administrador.');
 return db.runTransaction(async tx=>{
  const root=await tx.get(ref);
  if(!root.exists||root.data().deleted)throw new HttpsError('not-found','La sesión no está disponible.');
  const session=root.data(),sampleRef=ref.collection('samples').doc(id(data.sampleId)),snap=await tx.get(sampleRef);
  if(!snap.exists||snap.data().deleted)throw new HttpsError('not-found','La muestra no existe.');
  if(session.memberRemovalPending)throw new HttpsError('failed-precondition','Termina de eliminar inspectores antes de editar.');
  const votesSnap=await tx.get(sampleRef.collection('votes'));
  const members=session.membershipVersion===2?(await tx.get(ref.collection('inspectors'))).docs.filter(d=>!d.data().removing).map(d=>d.data()):(session.inspectors||(session.inspectorUids||[]).map(uid=>({uid})));
  const votes=votesSnap.docs.map(d=>({id:d.id,...d.data()})),token=version(session,snap.data(),votes,members);
  if(data.action==='prepareSampleEdit')return {sample:{id:snap.id,...snap.data()},evaluations:votes,inspectors:members,version:token};
  if(data.version!==token)throw new HttpsError('aborted','La muestra o la sesión cambió. Vuelve a abrir Editar muestra para cargar los datos actuales.');
  const sample=sampleData(data.sample);
  if(!sample.receivedDate)throw new HttpsError('invalid-argument','Ingresa la fecha de recepción.');
  await uniqueLetter(tx,ref,sample.blindLetter,sampleRef.id);
  if(!Array.isArray(data.evaluations)||data.evaluations.length>450)throw new HttpsError('invalid-argument','Demasiados resultados en una sola edición.');
  const seen=new Set(),changes=[];
  for(const edit of data.evaluations){
   const uid=id(edit.inspectorUid);
   if(seen.has(uid)||!members.some(p=>p.uid===uid))throw new HttpsError('invalid-argument','Inspector repetido o no asignado.');
   seen.add(uid);
   changes.push({uid,previous:votes.find(v=>v.id===uid),result:resultData(edit,sample.receiptFlavors)});
  }
  const now=Date.now(),audit={editedAtMs:now,editedBy:user.uid,editedByEmail:user.email};
  const history={...audit,previousSample:snap.data(),previousEvaluations:changes.filter(c=>c.previous).map(c=>c.previous)};
  if(Buffer.byteLength(JSON.stringify(history))>800000)throw new HttpsError('invalid-argument','Guarda los resultados en grupos más pequeños.');
  // Keep the original evaluation author, dates and photo subcollections. Only explicitly edited rows change.
  for(const {uid,previous,result} of changes){
   const voteRef=sampleRef.collection('votes').doc(uid);
   if(previous)tx.update(voteRef,{...result,...audit});
   else tx.create(voteRef,{...result,...audit,sampleId:sampleRef.id,inspectorUid:uid,inspectorEmail:members.find(p=>p.uid===uid).email||'',recordedBy:user.uid,recordedByEmail:user.email,entryMode:'laboratory',createdAtMs:now,createdAt:FieldValue.serverTimestamp()});
  }
  tx.create(sampleRef.collection('edits').doc(),history);
  tx.update(sampleRef,{...sample,...audit});
  // Reopening is confined to the editor: the correction commits atomically and retains the closed/finished state.
  tx.update(ref,{evaluationCount:session.evaluationCount+changes.filter(c=>!c.previous).length,updatedAt:FieldValue.serverTimestamp(),updatedBy:user.uid});
  return {saved:true};
 });
}
module.exports={sampleEdit};
