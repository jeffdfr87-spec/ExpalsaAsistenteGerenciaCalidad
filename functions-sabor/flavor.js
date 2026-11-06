'use strict';
const {HttpsError}=require('firebase-functions/v2/https');
const {FieldPath,FieldValue}=require('firebase-admin/firestore');
const {createHash}=require('node:crypto');
const {photoAction,imageData}=require('./photos');
const {normalizarPerfil,perfilMateriaPrima,coincidenPerfiles,fechaRecepcion}=require('./sensory');
const SERVICE_VERSION='20261105-readonly-viewers-1';
const VIEWERS=new Set(['fabio@expalsaevaluations.com','karina@expalsaevaluations.com']);
const canManage=user=>user.admin===true;
const canReadAll=user=>user.admin===true||user.viewer===true;
function requireReader(user){if(!canReadAll(user))fail('permission-denied','Acceso exclusivo para consulta de resultados.');}
const COLLECTION='expalsa_sabor_sesiones';
const ADMIN_EMAIL='jefferson@expalsaevaluations.com';
const PAGE_SIZE=20,INSPECTOR_BATCH_SIZE=100,MEMBER_PAGE_SIZE=200;
const FIELDS=['lote','talla','color','sabor','destino','codigo','importador'];
function fail(code,message){throw new HttpsError(code,message);}
function text(value,label,max=120){if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail('invalid-argument',`Revisa el campo ${label} (máximo ${max} caracteres).`);return value.trim();}
function id(value){if(typeof value!=='string'||!value||value.length>128||!/^[A-Za-z0-9_-]+$/.test(value))fail('invalid-argument','Identificador no válido.');return value;}
function sampleData(value){try{return {lote:text(value?.lote,'lote'),receivedDate:fechaRecepcion(value.receivedDate||''),receiptFlavors:normalizarPerfil(value.receiptFlavors)};}catch(e){fail('invalid-argument',e.message);}}
function resultData(data,baseline){try{const counterFlavors=normalizarPerfil(data.counterFlavors);if(!baseline)fail('failed-precondition','Completa el sabor de recepción de materia prima antes de evaluar.');if(typeof data.observations!=='string'||data.observations.length>2000)fail('invalid-argument','Revisa las observaciones.');return {counterFlavors,receiptSnapshot:baseline,result:coincidenPerfiles(baseline,counterFlavors)?'conforme':'discrepancia',observations:data.observations.trim()};}catch(e){if(e.code)throw e;fail('invalid-argument',e.message);}}
function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail('invalid-argument','Fecha no válida.');return value;}
function sampleKey(code){return createHash('sha256').update(code.normalize('NFKC').trim().toLocaleLowerCase('es')).digest('hex');}
function participant(session,user){if(!canManage(user)&&!session.inspectorUids.includes(user.uid))fail('permission-denied','No estás asignado a esta sesión.');}
function requireManager(user){if(!canManage(user))fail('permission-denied','Acción exclusiva de los responsables del laboratorio.');}
function requireAdmin(user){if(user.admin!==true)fail('permission-denied','Acción exclusiva del administrador.');}
const inspectorCount=session=>session.membershipVersion===2?session.inspectorCount:(session.inspectorUids||[]).length;
function canTransition(session,target){if(target==='open'){if(session.status!=='draft'||session.sampleCount<1||inspectorCount(session)<1)fail('failed-precondition','Solo puedes abrir un borrador con al menos una muestra y un inspector.');}else if(target==='closed'){if(session.status!=='open')fail('failed-precondition','La sesión no está abierta.');if(session.evaluationCount!==session.sampleCount*inspectorCount(session))fail('failed-precondition','Faltan evaluaciones por registrar.');}else fail('invalid-argument','Estado no válido.');}
function publicDoc(doc){const d=doc.data();return {id:doc.id,...Object.fromEntries(Object.entries(d).map(([k,v])=>[k,v&&typeof v.toMillis==='function'?v.toMillis():v]))};}
function publicSession(doc,user){const d=publicDoc(doc);d.inspectorCount=inspectorCount(d);d.inspectors=canReadAll(user)?(d.inspectors||[]):(d.inspectors||[]).filter(p=>p.uid===user.uid);d.inspectorUids=canReadAll(user)?(d.inspectorUids||[]):(d.inspectorUids||[]).filter(uid=>uid===user.uid);return d;}
function inspectorIds(value){if(!Array.isArray(value)||!value.length||value.length>INSPECTOR_BATCH_SIZE||new Set(value).size!==value.length)fail('invalid-argument','Selecciona inspectores sin repetir.');return value.map(id);}
const assignment=(db,uid,sessionId)=>db.doc(`expalsa_sabor_inspectores/${uid}/sesiones/${sessionId}`);
async function assignedInspector(ref,session,uid){
 if(session.membershipVersion===2){const snap=await ref.collection('inspectors').doc(uid).get();return snap.exists&&!snap.data().removing?snap.data():null;}
 return session.inspectorUids?.includes(uid)?session.inspectors?.find(p=>p.uid===uid)||{uid}:null;
}
async function checkParticipant(ref,session,user){if(!canReadAll(user)&&!await assignedInspector(ref,session,user.uid))fail('permission-denied','No estás asignado a esta sesión.');}
function live(session){if(session.deleted===true)fail('not-found','La sesión está en la papelera.');}
async function resolveInspectors(db,uids){const people=[];for(let i=0;i<uids.length;i+=20)people.push(...await Promise.all(uids.slice(i,i+20).map(uid=>inspector(db,uid))));return people;}
async function migrateMembers(db,ref,user){
 await db.runTransaction(async tx=>{
  const snap=await tx.get(ref);if(!snap.exists)fail('not-found','La sesión no existe.');const s=snap.data();live(s);if(s.membershipVersion===2)return;
  // Original sessions contain at most 200 members: migrate their existing snapshots atomically.
  const members=(s.inspectorUids||[]).map(uid=>s.inspectors?.find(p=>p.uid===uid)||{uid,email:'',name:uid});
  for(const person of members){tx.create(ref.collection('inspectors').doc(person.uid),{...person,addedBy:user.uid,addedAtMs:Date.now()});tx.set(assignment(db,person.uid,ref.id),{sessionId:ref.id});}
  tx.update(ref,{membershipVersion:2,inspectorCount:members.length,inspectors:FieldValue.delete(),inspectorUids:FieldValue.delete()});
 });
}
async function membersPage(ref,session,user,cursor){
 if(session.membershipVersion!==2)return {inspectors:canReadAll(user)?(session.inspectors||[]):(session.inspectors||[]).filter(p=>p.uid===user.uid),cursor:null};
 if(!canReadAll(user)){const p=await assignedInspector(ref,session,user.uid);return {inspectors:p?[p]:[],cursor:null};}
 let query=ref.collection('inspectors').orderBy(FieldPath.documentId());if(cursor)query=query.startAfter(id(cursor));
 const snap=await query.limit(MEMBER_PAGE_SIZE+1).get(),docs=snap.docs.slice(0,MEMBER_PAGE_SIZE);
 return {inspectors:docs.map(d=>d.data()),cursor:snap.size>MEMBER_PAGE_SIZE?docs.at(-1).id:null};
}
async function votesPage(sampleRef,cursor){let query=sampleRef.collection('votes').orderBy(FieldPath.documentId());if(cursor)query=query.startAfter(id(cursor));const snap=await query.limit(MEMBER_PAGE_SIZE+1).get(),docs=snap.docs.slice(0,MEMBER_PAGE_SIZE);return {evaluations:docs.map(publicDoc),cursor:snap.size>MEMBER_PAGE_SIZE?docs.at(-1).id:null};}
async function identity(db,request){
 if(!request.auth)fail('unauthenticated','Inicia sesión para continuar.');
 const uid=id(request.auth.uid),email=String(request.auth.token.email||'').trim().toLowerCase();
 if(email===ADMIN_EMAIL){const admin=await db.doc('expalsa_calidad_config/administrador').get();if(admin.exists&&admin.data().uid===uid&&admin.data().email===email)return {uid,email,admin:true};}
 const access=await db.doc(`expalsa_calidad_accesos/${uid}`).get();
 if(!access.exists||access.data().active!==true||access.data().deleted===true||access.data().email!==email)fail('permission-denied','La cuenta de inspector no está habilitada.');
 return {uid,email,admin:false,viewer:VIEWERS.has(email)};
}
async function inspector(db,uid){
 const [access,profile]=await Promise.all([db.doc(`expalsa_calidad_accesos/${id(uid)}`).get(),db.doc(`expalsa_calidad_identidades/${uid}`).get()]);
 if(!access.exists||access.data().active!==true||access.data().deleted===true||access.data().email===ADMIN_EMAIL)fail('failed-precondition','Uno de los inspectores ya no está habilitado. Actualiza la selección.');
 const p=profile.data()||{},a=access.data();return {uid,email:a.email,name:[p.firstNames,p.lastNames].filter(Boolean).join(' ')||a.email};
}
function handler(db){return async request=>{
 const data=request.data||{},action=data.action;
 if(action==='serviceInfo')return {version:SERVICE_VERSION};
 const user=await identity(db,request);
 if(user.viewer&&!['bootstrap','listSessions','detail','listMembers','listVotes','inspectorPhoto','listPhotos','authorizeComparisonReport'].includes(action))fail('permission-denied','Tu cuenta solo permite consultar y descargar PDF.');
 if(action==='bootstrap')return {admin:user.admin,manager:canManage(user),viewer:user.viewer===true,canReadResults:canReadAll(user),canDelete:user.admin===true,canViewComparisons:true,version:SERVICE_VERSION};
 if(action==='inspectors'){
  requireManager(user);const snap=await db.collection('expalsa_calidad_accesos').where('active','==',true).get();
  const people=snap.docs.filter(d=>d.data().deleted!==true&&d.data().email!==ADMIN_EMAIL);
  const inspectors=await resolveInspectors(db,people.map(d=>d.id));
  return {inspectors:inspectors.sort((a,b)=>a.name.localeCompare(b.name,'es'))};
 }
 const sessions=db.collection(COLLECTION);
 if(action==='listSessions'){
  if(data.trash)requireManager(user);
  const paginate=query=>{query=query.orderBy(FieldPath.documentId());if(data.cursor)query=query.startAfter(id(data.cursor));return query.limit(PAGE_SIZE+1).get();};
  let docs;
  if(canReadAll(user)){docs=(await paginate(sessions)).docs;}
  else{
   const [legacy,assigned]=await Promise.all([paginate(sessions.where('inspectorUids','array-contains',user.uid)),paginate(db.collection(`expalsa_sabor_inspectores/${user.uid}/sesiones`))]);
   const ids=[...new Set([...legacy.docs,...assigned.docs].map(d=>d.id))].sort().slice(0,PAGE_SIZE+1);
   docs=await Promise.all(ids.map(sid=>sessions.doc(sid).get()));
  }
  const page=docs.slice(0,PAGE_SIZE),visible=page.filter(d=>d.exists&&(d.data().deleted===true)===(data.trash===true));
  return {sessions:visible.map(d=>publicSession(d,user)),cursor:docs.length>PAGE_SIZE?page.at(-1).id:null};
 }
 if(action==='createSession'){
  requireManager(user);const name=text(data.name,'nombre de sesión'),analysisDate=date(data.date);
  const inspectors=await resolveInspectors(db,inspectorIds(data.inspectorUids));
  const ref=sessions.doc(),now=Date.now();
  await db.runTransaction(async tx=>{
   tx.create(ref,{name,date:analysisDate,membershipVersion:2,inspectorCount:inspectors.length,status:'draft',sampleCount:0,evaluationCount:0,deleted:false,createdBy:user.uid,createdAtMs:now,updatedAt:FieldValue.serverTimestamp()});
   for(const person of inspectors){tx.create(ref.collection('inspectors').doc(person.uid),{...person,addedBy:user.uid,addedAtMs:now});tx.set(assignment(db,person.uid,ref.id),{sessionId:ref.id});}
  });return {id:ref.id};
 }
 if(!['authorizeComparisonReport','updateSample','removeInspector','deletePhoto','replacePhoto','detail','listMembers','listVotes','addInspectors','deleteSession','restoreSession','addSample','openSession','closeSession','evaluate','recordEvaluation','inspectorPhoto','uploadPhoto','listPhotos'].includes(action))fail('invalid-argument','Acción no válida.');
 const sessionRef=sessions.doc(id(data.sessionId));
 if(action==='authorizeComparisonReport'){requireReader(user);const snap=await sessionRef.get();if(!snap.exists)fail('not-found','La sesión no existe.');live(snap.data());return {allowed:true};}
 if(action==='updateSample')requireManager(user);
 if(['inspectorPhoto','uploadPhoto','listPhotos','deletePhoto','replacePhoto'].includes(action)){const snap=await sessionRef.get();if(!snap.exists)fail('not-found','La sesión no existe.');live(snap.data());await checkParticipant(sessionRef,snap.data(),user);return photoAction({db,user,sessionRef,session:snap.data(),data,id,canManage:canReadAll,assignedInspector});}
 if(['detail','listMembers','listVotes'].includes(action)){
  const session=await sessionRef.get();if(!session.exists)fail('not-found','La sesión no existe.');live(session.data());await checkParticipant(sessionRef,session.data(),user);
  if(action==='listMembers')return membersPage(sessionRef,session.data(),user,data.cursor);
  if(action==='listVotes'){requireReader(user);return votesPage(sessionRef.collection('samples').doc(id(data.sampleId)),data.cursor);}
  let query=sessionRef.collection('samples').orderBy(FieldPath.documentId());if(data.cursor)query=query.startAfter(id(data.cursor));
  const page=await query.limit(PAGE_SIZE+1).get(),docs=page.docs.slice(0,PAGE_SIZE),evaluations=[],evaluationCursors={};
  for(const sample of docs){const votes=sample.ref.collection('votes');if(canReadAll(user)){const all=await votesPage(sample.ref);evaluations.push(...all.evaluations);if(all.cursor)evaluationCursors[sample.id]=all.cursor;}else{const own=await votes.doc(user.uid).get();if(own.exists)evaluations.push(publicDoc(own));}}
  const roster=await membersPage(sessionRef,session.data(),user);
  return {session:{...publicSession(session,user),inspectors:roster.inspectors,inspectorUids:roster.inspectors.map(p=>p.uid)},membersCursor:roster.cursor,samples:docs.map(publicDoc),evaluations,evaluationCursors,cursor:page.size>PAGE_SIZE?docs.at(-1).id:null};
 }
 if(action!=='evaluate')requireManager(user);
 if(action==='removeInspector'){
  requireAdmin(user);await migrateMembers(db,sessionRef,user);const uid=id(data.inspectorUid),memberRef=sessionRef.collection('inspectors').doc(uid);
  await db.runTransaction(async tx=>{const root=await tx.get(sessionRef),member=await tx.get(memberRef);live(root.data());if(member.exists&&!member.data().removing){tx.update(memberRef,{removing:true});tx.delete(assignment(db,uid,sessionRef.id));tx.update(sessionRef,{inspectorCount:root.data().inspectorCount-1,memberRemovalPending:(root.data().memberRemovalPending||0)+1});}});
  const member=await memberRef.get();if(!member.exists)return {done:true};
  let query=sessionRef.collection('samples').orderBy(FieldPath.documentId());if(member.data().removalCursor)query=query.startAfter(member.data().removalCursor);
  const page=await query.limit(20).get();
  for(const sample of page.docs){const vote=sample.ref.collection('votes').doc(uid);await db.runTransaction(async tx=>{const root=await tx.get(sessionRef),v=await tx.get(vote);if(v.exists){tx.delete(vote);tx.update(sessionRef,{evaluationCount:Math.max(0,root.data().evaluationCount-1)});}});await db.recursiveDelete(vote);}
  await db.runTransaction(async tx=>{const root=await tx.get(sessionRef),fresh=await tx.get(memberRef);if(!fresh.exists)return;if(page.size===20)tx.update(memberRef,{removalCursor:page.docs.at(-1).id});else{tx.delete(memberRef);tx.update(sessionRef,{memberRemovalPending:Math.max(0,(root.data().memberRemovalPending||0)-1)});}});
  return {done:page.size<20};
 }
 if(action==='addInspectors'){
  const inspectors=await resolveInspectors(db,inspectorIds(data.inspectorUids));await migrateMembers(db,sessionRef,user);
  return db.runTransaction(async tx=>{
   const snap=await tx.get(sessionRef);if(!snap.exists)fail('not-found','La sesión no existe.');const session=snap.data();live(session);
   const existing=await Promise.all(inspectors.map(p=>tx.get(sessionRef.collection('inspectors').doc(p.uid))));
   if(existing.some(d=>d.exists&&d.data().removing))fail('failed-precondition','Termina de eliminar al inspector antes de agregarlo nuevamente.');
   const added=inspectors.filter((p,i)=>!existing[i].exists),now=Date.now();
   for(const person of added){tx.create(sessionRef.collection('inspectors').doc(person.uid),{...person,addedBy:user.uid,addedAtMs:now});tx.set(assignment(db,person.uid,sessionRef.id),{sessionId:sessionRef.id});}
   if(added.length)tx.update(sessionRef,{inspectorCount:session.inspectorCount+added.length,...(session.status==='closed'?{status:'open',reopenedAtMs:now}:{}),updatedAt:FieldValue.serverTimestamp(),updatedBy:user.uid});
   return {added:added.length};
  });
 }
 return db.runTransaction(async tx=>{
  const snapshot=await tx.get(sessionRef);if(!snapshot.exists)fail('not-found','La sesión no existe.');
  const session=snapshot.data();const audit={updatedAt:FieldValue.serverTimestamp(),updatedBy:user.uid};
  if(action==='restoreSession'){if(session.deleted!==true)fail('failed-precondition','La sesión ya está activa.');tx.update(sessionRef,{deleted:false,restoredAtMs:Date.now(),...audit});return {restored:true};}
  live(session);
  if(action==='deleteSession'){requireAdmin(user);tx.update(sessionRef,{deleted:true,deletedAtMs:Date.now(),deletedBy:user.uid,...audit});return {deleted:true};}
  if(action==='addSample'){
   if(session.status!=='draft')fail('failed-precondition','Solo puedes agregar muestras a un borrador.');
   const sample=sampleData(data.sample),ref=sessionRef.collection('samples').doc();
   if((await tx.get(ref)).exists)fail('already-exists','El código de muestra ya está registrado en esta sesión.');
   tx.create(ref,{...sample,createdBy:user.uid,createdAtMs:Date.now()});tx.update(sessionRef,{sampleCount:session.sampleCount+1,...audit});return {id:ref.id};
  }
  if(action==='updateSample'){const ref=sessionRef.collection('samples').doc(id(data.sampleId)),old=await tx.get(ref);if(!old.exists)fail('not-found','La muestra no existe.');const update=data.receiptFlavors?sampleData({...old.data(),...data}):{receivedDate:fechaRecepcion(data.receivedDate||'')};tx.update(ref,update);return {saved:true};}
  if(action==='openSession'||action==='closeSession'){
   if(session.memberRemovalPending)fail('failed-precondition','Termina de eliminar los inspectores antes de cambiar el estado.');
   const status=action==='openSession'?'open':'closed';canTransition(session,status);tx.update(sessionRef,{status,[status+'AtMs']:Date.now(),...audit});return {status};
  }
  const targetUid=action==='recordEvaluation'?id(data.inspectorUid):user.uid;
  const member=session.membershipVersion===2?await tx.get(sessionRef.collection('inspectors').doc(targetUid)):null;
  const assigned=session.membershipVersion===2?(member.exists&&!member.data().removing?member.data():null):(session.inspectorUids?.includes(targetUid)?session.inspectors?.find(p=>p.uid===targetUid)||{uid:targetUid}:null);
  if(action==='recordEvaluation'){
   requireManager(user);
   if(!assigned)fail('permission-denied','El inspector no está asignado a esta sesión.');
   await inspector(db,targetUid);
  }else if(canManage(user)||!assigned)fail('permission-denied','Solo los inspectores asignados pueden evaluar.');
  if(session.status!=='open')fail('failed-precondition','La sesión no está abierta para evaluar.');
  const sampleRef=sessionRef.collection('samples').doc(id(data.sampleId)),vote=sampleRef.collection('votes').doc(targetUid);
  const [sample,previous]=await Promise.all([tx.get(sampleRef),tx.get(vote)]);
  if(!sample.exists)fail('not-found','La muestra no existe.');if(previous.exists)fail('already-exists','La evaluación de este inspector ya fue registrada. Actualiza la página.');
  const result=resultData(data,perfilMateriaPrima(sample.data()));
  const portraitSnap=await tx.get(db.doc(`expalsa_calidad_fotos_perfil/${targetUid}`));
  let portrait=null;try{if(portraitSnap.exists&&typeof portraitSnap.data().jpeg==='string')portrait=imageData('data:image/jpeg;base64,'+portraitSnap.data().jpeg);}catch{}
  if(portrait)tx.create(vote.collection('photos').doc('profile'),{...portrait,kind:'profile',origin:'profile',uploadedBy:user.uid,uploadedAtMs:Date.now()});
  tx.create(vote,{...result,sampleId:sampleRef.id,inspectorUid:targetUid,inspectorEmail:action==='recordEvaluation'?assigned?.email||'':user.email,recordedBy:user.uid,recordedByEmail:user.email,entryMode:action==='recordEvaluation'?'laboratory':'self',createdAtMs:Date.now(),createdAt:FieldValue.serverTimestamp()});
  tx.update(sessionRef,{evaluationCount:session.evaluationCount+1,...audit});return {saved:true};
 });
};}
module.exports={handler,sampleData,resultData,date,sampleKey,participant,canTransition,identity,inspectorCount,INSPECTOR_BATCH_SIZE,canManage,SERVICE_VERSION};
