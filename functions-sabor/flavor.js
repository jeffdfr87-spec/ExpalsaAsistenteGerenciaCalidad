'use strict';
const {HttpsError}=require('firebase-functions/v2/https');
const {FieldPath,FieldValue}=require('firebase-admin/firestore');
const {createHash}=require('node:crypto');
const COLLECTION='expalsa_sabor_sesiones';
const ADMIN_EMAIL='jefferson@expalsaevaluations.com';
const PAGE_SIZE=20,MAX_INSPECTORS=200;
const FIELDS=['lote','talla','color','sabor','destino','codigo','importador'];
function fail(code,message){throw new HttpsError(code,message);}
function text(value,label,max=120){if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail('invalid-argument',`Revisa el campo ${label} (máximo ${max} caracteres).`);return value.trim();}
function id(value){if(typeof value!=='string'||!value||value.length>128||!/^[A-Za-z0-9_-]+$/.test(value))fail('invalid-argument','Identificador no válido.');return value;}
function sampleData(value){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!FIELDS.includes(k)))fail('invalid-argument','Muestra no válida.');return Object.fromEntries(FIELDS.map(k=>[k,text(value[k],k,k==='sabor'?200:120)]));}
function resultData(data){if(!['conforme','no_conforme'].includes(data.result))fail('invalid-argument','Selecciona conforme o no conforme.');if(typeof data.observations!=='string'||data.observations.length>2000)fail('invalid-argument','Las observaciones no pueden superar los 2000 caracteres.');const observations=data.observations.trim();if(data.result==='no_conforme'&&!observations)fail('invalid-argument','Describe la observación del resultado no conforme.');return {result:data.result,observations};}
function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail('invalid-argument','Fecha no válida.');return value;}
function sampleKey(code){return createHash('sha256').update(code.normalize('NFKC').trim().toLocaleLowerCase('es')).digest('hex');}
function participant(session,user){if(!user.admin&&!session.inspectorUids.includes(user.uid))fail('permission-denied','No estás asignado a esta sesión.');}
function requireAdmin(user){if(!user.admin)fail('permission-denied','Acción exclusiva del administrador.');}
function canTransition(session,target){if(target==='open'){if(session.status!=='draft'||session.sampleCount<1)fail('failed-precondition','Solo puedes abrir un borrador con al menos una muestra.');}else if(target==='closed'){if(session.status!=='open')fail('failed-precondition','La sesión no está abierta.');if(session.evaluationCount!==session.sampleCount*session.inspectorUids.length)fail('failed-precondition','Faltan evaluaciones por registrar.');}else fail('invalid-argument','Estado no válido.');}
function publicDoc(doc){const d=doc.data();return {id:doc.id,...Object.fromEntries(Object.entries(d).map(([k,v])=>[k,v&&typeof v.toMillis==='function'?v.toMillis():v]))};}
function publicSession(doc,user){const d=publicDoc(doc);if(!user.admin)d.inspectors=d.inspectors.filter(p=>p.uid===user.uid);return d;}
async function identity(db,request){
 if(!request.auth)fail('unauthenticated','Inicia sesión para continuar.');
 const uid=id(request.auth.uid),email=String(request.auth.token.email||'').trim().toLowerCase();
 if(email===ADMIN_EMAIL){const admin=await db.doc('expalsa_calidad_config/administrador').get();if(admin.exists&&admin.data().uid===uid&&admin.data().email===email)return {uid,email,admin:true};}
 const access=await db.doc(`expalsa_calidad_accesos/${uid}`).get();
 if(!access.exists||access.data().active!==true||access.data().deleted===true||access.data().email!==email)fail('permission-denied','La cuenta de inspector no está habilitada.');
 return {uid,email,admin:false};
}
async function inspector(db,uid){
 const [access,profile]=await Promise.all([db.doc(`expalsa_calidad_accesos/${id(uid)}`).get(),db.doc(`expalsa_calidad_identidades/${uid}`).get()]);
 if(!access.exists||access.data().active!==true||access.data().deleted===true||access.data().email===ADMIN_EMAIL)fail('failed-precondition','Uno de los inspectores ya no está habilitado. Actualiza la selección.');
 const p=profile.data()||{},a=access.data();return {uid,email:a.email,name:[p.firstNames,p.lastNames].filter(Boolean).join(' ')||a.email};
}
function handler(db){return async request=>{
 const user=await identity(db,request),data=request.data||{},action=data.action;
 if(action==='bootstrap')return {admin:user.admin};
 if(action==='inspectors'){
  requireAdmin(user);const snap=await db.collection('expalsa_calidad_accesos').where('active','==',true).get();
  const people=snap.docs.filter(d=>d.data().deleted!==true&&d.data().email!==ADMIN_EMAIL);
  const inspectors=[];
  // Bound parallel reads while retaining every eligible account.
  for(let i=0;i<people.length;i+=20)inspectors.push(...await Promise.all(people.slice(i,i+20).map(d=>inspector(db,d.id))));
  return {inspectors:inspectors.sort((a,b)=>a.name.localeCompare(b.name,'es'))};
 }
 const sessions=db.collection(COLLECTION);
 if(action==='listSessions'){
  let query=user.admin?sessions:sessions.where('inspectorUids','array-contains',user.uid);
  query=query.orderBy(FieldPath.documentId());if(data.cursor)query=query.startAfter(id(data.cursor));
  const result=await query.limit(PAGE_SIZE+1).get(),docs=result.docs.slice(0,PAGE_SIZE);
  return {sessions:docs.map(d=>publicSession(d,user)),cursor:result.size>PAGE_SIZE?docs.at(-1).id:null};
 }
 if(action==='createSession'){
  requireAdmin(user);const name=text(data.name,'nombre de sesión'),analysisDate=date(data.date);
  if(!Array.isArray(data.inspectorUids)||!data.inspectorUids.length||data.inspectorUids.length>MAX_INSPECTORS||new Set(data.inspectorUids).size!==data.inspectorUids.length)fail('invalid-argument',`Selecciona entre 1 y ${MAX_INSPECTORS} inspectores sin repetir.`);
  const inspectors=[];for(let i=0;i<data.inspectorUids.length;i+=20)inspectors.push(...await Promise.all(data.inspectorUids.slice(i,i+20).map(uid=>inspector(db,uid))));
  const ref=sessions.doc(),now=Date.now();await ref.create({name,date:analysisDate,inspectorUids:inspectors.map(p=>p.uid),inspectors,status:'draft',sampleCount:0,evaluationCount:0,createdBy:user.uid,createdAtMs:now,updatedAt:FieldValue.serverTimestamp()});return {id:ref.id};
 }
 if(!['detail','addSample','openSession','closeSession','evaluate'].includes(action))fail('invalid-argument','Acción no válida.');
 const sessionRef=sessions.doc(id(data.sessionId));
 if(action==='detail'){
  const session=await sessionRef.get();if(!session.exists)fail('not-found','La sesión no existe.');participant(session.data(),user);
  let query=sessionRef.collection('samples').orderBy(FieldPath.documentId());if(data.cursor)query=query.startAfter(id(data.cursor));
  const page=await query.limit(PAGE_SIZE+1).get(),docs=page.docs.slice(0,PAGE_SIZE),evaluations=[];
  for(const sample of docs){const votes=sample.ref.collection('votes');if(user.admin){const all=await votes.get();evaluations.push(...all.docs.map(publicDoc));}else{const own=await votes.doc(user.uid).get();if(own.exists)evaluations.push(publicDoc(own));}}
  return {session:publicSession(session,user),samples:docs.map(publicDoc),evaluations,cursor:page.size>PAGE_SIZE?docs.at(-1).id:null};
 }
 if(action!=='evaluate')requireAdmin(user);
 return db.runTransaction(async tx=>{
  const snapshot=await tx.get(sessionRef);if(!snapshot.exists)fail('not-found','La sesión no existe.');
  const session=snapshot.data();participant(session,user);const audit={updatedAt:FieldValue.serverTimestamp(),updatedBy:user.uid};
  if(action==='addSample'){
   if(session.status!=='draft')fail('failed-precondition','Solo puedes agregar muestras a un borrador.');
   const sample=sampleData(data.sample),ref=sessionRef.collection('samples').doc(sampleKey(sample.codigo));
   if((await tx.get(ref)).exists)fail('already-exists','El código de muestra ya está registrado en esta sesión.');
   tx.create(ref,{...sample,createdBy:user.uid,createdAtMs:Date.now()});tx.update(sessionRef,{sampleCount:session.sampleCount+1,...audit});return {id:ref.id};
  }
  if(action==='openSession'||action==='closeSession'){
   const status=action==='openSession'?'open':'closed';canTransition(session,status);tx.update(sessionRef,{status,[status+'AtMs']:Date.now(),...audit});return {status};
  }
  if(user.admin||!session.inspectorUids.includes(user.uid))fail('permission-denied','Solo los inspectores asignados pueden evaluar.');
  if(session.status!=='open')fail('failed-precondition','La sesión no está abierta para evaluar.');
  const result=resultData(data),sampleRef=sessionRef.collection('samples').doc(id(data.sampleId)),vote=sampleRef.collection('votes').doc(user.uid);
  const [sample,previous]=await Promise.all([tx.get(sampleRef),tx.get(vote)]);
  if(!sample.exists)fail('not-found','La muestra no existe.');if(previous.exists)fail('already-exists','Tu evaluación ya fue registrada. Actualiza la página.');
  tx.create(vote,{...result,sampleId:sampleRef.id,inspectorUid:user.uid,inspectorEmail:user.email,createdAtMs:Date.now(),createdAt:FieldValue.serverTimestamp()});
  tx.update(sessionRef,{evaluationCount:session.evaluationCount+1,...audit});return {saved:true};
 });
};}
module.exports={handler,sampleData,resultData,date,sampleKey,participant,canTransition,identity,MAX_INSPECTORS};
