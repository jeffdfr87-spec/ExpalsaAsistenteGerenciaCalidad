const {test}=require('node:test');
const assert=require('node:assert/strict');
const {FieldValue}=require('firebase-admin/firestore');
const {handler,sampleData,resultData,date,sampleKey,participant,canTransition,identity}=require('./flavor');
const sample={lote:'L1',talla:'31/35',color:'A3',sabor:'Característico',destino:'España',codigo:'MP1',importador:'Empresa'};
const inspector={uid:'i1',email:'i1@example.test',admin:false};
test('exige los siete campos y rechaza campos adicionales',()=>{
 assert.deepEqual(sampleData(sample),sample);
 for(const k of Object.keys(sample))assert.throws(()=>sampleData({...sample,[k]:''}),{code:'invalid-argument'});
 assert.throws(()=>sampleData({...sample,createdBy:'otro'}),{code:'invalid-argument'});
});
test('no conforme exige observaciones y no permite categorías inventadas',()=>{
 assert.deepEqual(resultData({result:'conforme',observations:' '}),{result:'conforme',observations:''});
 assert.throws(()=>resultData({result:'no_conforme',observations:' '}),{code:'invalid-argument'});
 assert.throws(()=>resultData({result:'aprobado',observations:'ok'}),{code:'invalid-argument'});
 assert.throws(()=>resultData({result:'conforme',observations:'x'.repeat(2001)}),{code:'invalid-argument'});
});
test('códigos equivalentes producen una única muestra',()=>{
 assert.equal(sampleKey(' MP-01 '),sampleKey('mp-01'));
 assert.equal(sampleKey('ＭＰ-01'),sampleKey('MP-01'));
 assert.notEqual(sampleKey('MP-01'),sampleKey('MP-02'));
});
test('no acepta fechas imposibles',()=>{assert.equal(date('2028-02-29'),'2028-02-29');assert.throws(()=>date('2026-02-29'));assert.throws(()=>date('2026-11-31'));});
test('solo permite abrir borradores con muestras y cerrar sesiones completas',()=>{
 const s={status:'draft',sampleCount:2,evaluationCount:0,inspectorUids:['i1','i2']};
 canTransition(s,'open');assert.throws(()=>canTransition({...s,sampleCount:0},'open'));
 assert.throws(()=>canTransition({...s,status:'open',evaluationCount:3},'closed'));
 canTransition({...s,status:'open',evaluationCount:4},'closed');
 assert.throws(()=>canTransition({...s,status:'closed'},'open'));
});
test('rechaza inspectores ajenos y cuentas suspendidas',async()=>{
 assert.throws(()=>participant({inspectorUids:['i2']},inspector),{code:'permission-denied'});
 const db={doc:()=>({get:async()=>({exists:true,data:()=>({email:inspector.email,active:false})})})};
 await assert.rejects(identity(db,{auth:{uid:'i1',token:{email:inspector.email}}}),{code:'permission-denied'});
 await assert.rejects(identity(db,{}),{code:'unauthenticated'});
});
// Small transaction double exercises the real callable handler, including read ordering and writes.
function database(seed){
 const records=new Map(Object.entries(seed)),writes=[];
 function ref(path){return {path,id:path.split('/').at(-1),collection:n=>collection(path+'/'+n),get:async()=>snap(path)};}
 function collection(path,filters=[],after=null,maximum=Infinity){return {
  doc:k=>ref(path+'/'+(k||'new-id')),
  where:(key,op,value)=>collection(path,[...filters,[key,op,value]],after,maximum),
  orderBy:()=>collection(path,filters,after,maximum),startAfter:value=>collection(path,filters,value,maximum),limit:value=>collection(path,filters,after,value),
  get:async()=>{const docs=[...records.keys()].filter(key=>key.startsWith(path+'/')&&key.slice(path.length+1).indexOf('/')<0).sort().map(snap).filter(d=>(!after||d.id>after)&&filters.every(([key,op,value])=>op==='array-contains'?d.data()[key]?.includes(value):d.data()[key]===value)).slice(0,maximum);return {docs,size:docs.length};}
 };}
 function snap(path){return {exists:records.has(path),data:()=>records.get(path),id:path.split('/').at(-1),ref:ref(path)};}
 let queue=Promise.resolve();
 return {writes,records,doc:ref,collection,runTransaction:fn=>{
  const result=queue.then(async()=>{
   let writing=false;const pending=[];
   const stage=type=>(r,d)=>{writing=true;if(type==='create'&&records.has(r.path))throw Error('duplicate');pending.push([type,r.path,d]);};
   const tx={get:async r=>{assert.equal(writing,false,'All reads precede writes');return snap(r.path);},create:stage('create'),update:stage('update'),set:stage('set')};
   const value=await fn(tx);
   for(const [type,path,data] of pending){const next=type==='update'?{...records.get(path),...data}:{...data};for(const [key,v] of Object.entries(next))if(v?.isEqual?.(FieldValue.delete()))delete next[key];records.set(path,next);writes.push([type,path,data]);}
   return value;
  });queue=result.catch(()=>{});return result;
 }};
}
function seed(){return {'expalsa_calidad_accesos/i1':{active:true,email:inspector.email},'expalsa_sabor_sesiones/s1':{status:'open',sampleCount:1,evaluationCount:0,inspectorUids:['i1']},'expalsa_sabor_sesiones/s1/samples/m1':sample};}
const request=data=>({auth:{uid:'i1',token:{email:inspector.email}},data:{action:'evaluate',sessionId:'s1',sampleId:'m1',result:'conforme',observations:'',...data}});
test('la evaluación usa la cuenta autenticada e impide un segundo envío',async()=>{
 const db=database(seed()),call=handler(db);await call(request({inspectorUid:'i2'}));
 const vote=db.writes.find(w=>w[0]==='create')[2];assert.equal(vote.inspectorUid,'i1');
 assert.equal(db.writes.at(-1)[2].evaluationCount,1);
 await assert.rejects(call(request()),{code:'already-exists'});
});
test('no registra resultados en sesiones cerradas ni muestras inexistentes',async()=>{
 const initial=seed();initial['expalsa_sabor_sesiones/s1'].status='closed';
 const closed=database(initial);await assert.rejects(handler(closed)(request()),{code:'failed-precondition'});assert.equal(closed.writes.length,0);
 const missing=database(seed());await assert.rejects(handler(missing)(request({sampleId:'missing'})),{code:'not-found'});assert.equal(missing.writes.length,0);
});
test('un inspector no puede crear sesiones o agregar muestras',async()=>{
 const db=database(seed());await assert.rejects(handler(db)(request({action:'createSession'})),{code:'permission-denied'});
 await assert.rejects(handler(db)(request({action:'addSample',sample})),{code:'permission-denied'});assert.equal(db.writes.length,0);
});
function adminRequest(data={}){return {auth:{uid:'admin',token:{email:'jefferson@expalsaevaluations.com'}},data:{action:'recordEvaluation',sessionId:'s1',sampleId:'m1',inspectorUid:'i1',result:'conforme',observations:'',...data}};}
function labSeed(){const initial=seed();initial['expalsa_calidad_config/administrador']={uid:'admin',email:'jefferson@expalsaevaluations.com'};initial['expalsa_sabor_sesiones/s1'].inspectors=[{uid:'i1',email:inspector.email,name:'Inspector uno'}];return initial;}
test('el administrador registra para un inspector asignado y conserva la autoría real',async()=>{
 const db=database(labSeed()),call=handler(db);await call(adminRequest());
 const created=db.writes.find(w=>w[0]==='create');assert.equal(created[1],'expalsa_sabor_sesiones/s1/samples/m1/votes/i1');
 assert.equal(created[2].inspectorUid,'i1');assert.equal(created[2].inspectorEmail,inspector.email);assert.equal(created[2].recordedBy,'admin');assert.equal(created[2].entryMode,'laboratory');
 assert.equal(db.writes.at(-1)[2].evaluationCount,1);await assert.rejects(call(adminRequest()),{code:'already-exists'});
});
test('el registro de laboratorio rechaza inspectores ajenos, suspendidos y sesiones cerradas',async()=>{
 await assert.rejects(handler(database(labSeed()))(adminRequest({inspectorUid:'i2'})),{code:'permission-denied'});
 const disabled=labSeed();disabled['expalsa_calidad_accesos/i1'].active=false;
 await assert.rejects(handler(database(disabled))(adminRequest()),{code:'failed-precondition'});
 const closed=labSeed();closed['expalsa_sabor_sesiones/s1'].status='closed';
 await assert.rejects(handler(database(closed))(adminRequest()),{code:'failed-precondition'});
});
test('un inspector no puede registrar resultados de otro desde la acción administrativa',async()=>{
 const db=database(seed());await assert.rejects(handler(db)(request({action:'recordEvaluation',inspectorUid:'i2'})),{code:'permission-denied'});assert.equal(db.writes.length,0);
});
test('una sesión admite más de 200 inspectores sin guardar el padrón en el documento de sesión',async()=>{
 const initial=labSeed(),uids=Array.from({length:350},(_,i)=>'member'+i);
 for(const uid of uids)initial['expalsa_calidad_accesos/'+uid]={active:true,email:uid+'@example.test'};
 const db=database(initial),call=handler(db);
 const {id}=await call(adminRequest({action:'createSession',name:'Sesión extensa',date:'2026-11-05',inspectorUids:uids.slice(0,100)}));
 for(let i=100;i<uids.length;i+=100)await call(adminRequest({action:'addInspectors',sessionId:id,inspectorUids:uids.slice(i,i+100)}));
 const session=db.records.get('expalsa_sabor_sesiones/'+id);assert.equal(session.inspectorCount,350);assert.equal(session.inspectorUids,undefined);assert.equal(session.inspectors,undefined);
 assert.equal((await db.collection('expalsa_sabor_sesiones/'+id+'/inspectors').get()).size,350);
 const page1=await call(adminRequest({action:'listMembers',sessionId:id}));assert.equal(page1.inspectors.length,200);assert.ok(page1.cursor);
 const page2=await call(adminRequest({action:'listMembers',sessionId:id,cursor:page1.cursor}));assert.equal(page2.inspectors.length,150);assert.equal(page2.cursor,null);
 const repeat=await call(adminRequest({action:'addInspectors',sessionId:id,inspectorUids:uids.slice(0,100)}));assert.equal(repeat.added,0);assert.equal(db.records.get('expalsa_sabor_sesiones/'+id).inspectorCount,350);
});
test('agregar inspectores conserva los resultados anteriores y reabre una sesión finalizada',async()=>{
 const initial=labSeed();initial['expalsa_calidad_accesos/i2']={active:true,email:'i2@example.test'};
 initial['expalsa_sabor_sesiones/s1'].status='closed';initial['expalsa_sabor_sesiones/s1'].evaluationCount=1;
 initial['expalsa_sabor_sesiones/s1/samples/m1/votes/i1']={inspectorUid:'i1',result:'conforme'};
 const db=database(initial),call=handler(db);await call(adminRequest({action:'addInspectors',inspectorUids:['i2']}));
 const session=db.records.get('expalsa_sabor_sesiones/s1');assert.equal(session.status,'open');assert.equal(session.inspectorCount,2);assert.equal(session.evaluationCount,1);
 assert.equal(db.records.get('expalsa_sabor_sesiones/s1/samples/m1/votes/i1').result,'conforme');
 assert.throws(()=>canTransition(session,'closed'),{code:'failed-precondition'});
});
test('dos inspectores pueden analizar la misma muestra con resultados independientes',async()=>{
 const initial=labSeed();initial['expalsa_calidad_accesos/i2']={active:true,email:'i2@example.test'};
 const db=database(initial),call=handler(db);await call(adminRequest({action:'addInspectors',inspectorUids:['i2']}));
 await call(adminRequest());await call(adminRequest({inspectorUid:'i2',result:'no_conforme',observations:'Nota terrosa'}));
 assert.equal(db.records.get('expalsa_sabor_sesiones/s1/samples/m1/votes/i1').result,'conforme');
 assert.equal(db.records.get('expalsa_sabor_sesiones/s1/samples/m1/votes/i2').result,'no_conforme');
 assert.equal(db.records.get('expalsa_sabor_sesiones/s1').evaluationCount,2);
});
test('eliminar mueve a papelera, bloquea envíos y restaurar conserva todas las evaluaciones',async()=>{
 const db=database(labSeed()),call=handler(db);await call(adminRequest());
 await call(adminRequest({action:'deleteSession'}));assert.equal(db.records.get('expalsa_sabor_sesiones/s1').deleted,true);
 await assert.rejects(call(request()),{code:'not-found'});await assert.rejects(call(adminRequest({action:'detail'})),{code:'not-found'});
 const active=await call(adminRequest({action:'listSessions'}));assert.equal(active.sessions.length,0);
 const trash=await call(adminRequest({action:'listSessions',trash:true}));assert.equal(trash.sessions.length,1);
 await call(adminRequest({action:'restoreSession'}));assert.equal(db.records.get('expalsa_sabor_sesiones/s1').deleted,false);
 assert.equal(db.records.get('expalsa_sabor_sesiones/s1/samples/m1/votes/i1').result,'conforme');
});
test('un inspector no puede agregar participantes, eliminar, restaurar ni consultar papelera',async()=>{
 const db=database(seed()),call=handler(db);
 for(const action of ['addInspectors','deleteSession','restoreSession'])await assert.rejects(call(request({action,inspectorUids:['i2']})),{code:'permission-denied'});
 await assert.rejects(call(request({action:'listSessions',trash:true})),{code:'permission-denied'});
});
test('la asignación nueva permite al inspector encontrar la sesión y leer solo su evaluación',async()=>{
 const initial=labSeed();initial['expalsa_calidad_accesos/i2']={active:true,email:'i2@example.test'};
 const db=database(initial),call=handler(db);await call(adminRequest({action:'addInspectors',inspectorUids:['i2']}));await call(adminRequest());
 const asSecond=data=>({auth:{uid:'i2',token:{email:'i2@example.test'}},data});
 const list=await call(asSecond({action:'listSessions'}));assert.equal(list.sessions.length,1);assert.equal(list.sessions[0].inspectorCount,2);
 const detail=await call(asSecond({action:'detail',sessionId:'s1'}));assert.equal(detail.evaluations.length,0);assert.equal(detail.session.inspectors.length,1);assert.equal(detail.session.inspectors[0].uid,'i2');
});
test('dos altas simultáneas del mismo inspector no duplican el contador',async()=>{
 const initial=labSeed();initial['expalsa_calidad_accesos/i2']={active:true,email:'i2@example.test'};
 const db=database(initial),call=handler(db);
 const results=await Promise.all([call(adminRequest({action:'addInspectors',inspectorUids:['i2']})),call(adminRequest({action:'addInspectors',inspectorUids:['i2']}))]);
 assert.equal(results.reduce((sum,r)=>sum+r.added,0),1);assert.equal(db.records.get('expalsa_sabor_sesiones/s1').inspectorCount,2);
});
