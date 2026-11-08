const {test}=require('node:test');
const assert=require('node:assert/strict');
const {FieldValue}=require('firebase-admin/firestore');
const {imageData}=require('./photos');
const JPEG=require('./photo-fixture.test');
const {handler,sampleData,resultData,date,sampleKey,participant,canTransition,identity}=require('./flavor');
const normal=[{sabor:'Normal',porcentaje:100}];
const sample={lote:'L1',receivedDate:'2026-11-05',receiptFlavors:normal,receptionAnalyst:'',blindLetter:''};
const inspector={uid:'i1',email:'i1@example.test',admin:false};
test('muestra completa Normal sin alterar sabores ingresados y conserva metadatos',()=>{assert.deepEqual(sampleData(sample),sample);assert.deepEqual(sampleData({...sample,receiptFlavors:[{sabor:'Tierra Leve',porcentaje:30}]}).receiptFlavors,[{sabor:'Tierra Leve',porcentaje:30},{sabor:'Normal',porcentaje:70}]);assert.equal(sampleData({...sample,receivedDate:''}).receivedDate,'');});
test('resultado compara sabores e intensidades e ignora porcentajes',()=>{
 const baseline=[{sabor:'Tierra Medio',porcentaje:20},{sabor:'Tierra Leve',porcentaje:30},{sabor:'Normal',porcentaje:50}];
 assert.equal(resultData({counterFlavors:[{sabor:'Normal',porcentaje:20},{sabor:'Tierra Leve',porcentaje:70},{sabor:'Tierra Medio',porcentaje:10}],observations:''},baseline).result,'conforme');
 assert.equal(resultData({counterFlavors:normal,observations:'',result:'conforme'},baseline).result,'discrepancia');
 assert.equal(resultData({counterFlavors:[{sabor:'Normal',porcentaje:99}],observations:''},baseline).counterFlavors[0].porcentaje,100);
});

test('resultados nuevos guardan parcial por intensidad e ignoran Normal en recepciones con otro sabor',()=>{
 const baseline=[{sabor:'Combustible Leve',porcentaje:60},{sabor:'Normal',porcentaje:40}];
 assert.equal(resultData({counterFlavors:[{sabor:'Combustible Leve',porcentaje:100}],observations:''},baseline).result,'conforme');
 assert.equal(resultData({counterFlavors:[{sabor:'Combustible Medio',porcentaje:100}],observations:''},baseline).result,'parcial');
 assert.equal(resultData({counterFlavors:[{sabor:'Tierra Leve',porcentaje:10}],observations:''},baseline).result,'discrepancia');
 assert.equal(resultData({counterFlavors:[{sabor:'Le dio normal',porcentaje:100}],observations:'Le dio normal'},normal).observations,'Normal');
 assert.equal(resultData({counterFlavors:[{sabor:'Normal',porcentaje:90},{sabor:'Tierra Leve',porcentaje:10}],observations:''},normal).result,'discrepancia');
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
 canTransition({...s,status:'open',evaluationCount:4,finishedSampleCount:2},'closed');
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
 function ref(path){return {path,id:path.split('/').at(-1),collection:n=>collection(path+'/'+n),get:async()=>snap(path),update:async data=>records.set(path,{...records.get(path),...data})};}
 function collection(path,filters=[],after=null,maximum=Infinity){return {
  doc:function(...args){if(args.length&&args[0]===undefined)throw Error('Firestore doc(undefined) is invalid');return ref(path+'/'+(args[0]||'new-id'));},
  where:(key,op,value)=>collection(path,[...filters,[key,op,value]],after,maximum),
  orderBy:()=>collection(path,filters,after,maximum),startAfter:value=>collection(path,filters,value,maximum),limit:value=>collection(path,filters,after,value),
  get:async()=>{const docs=[...records.keys()].filter(key=>key.startsWith(path+'/')&&key.slice(path.length+1).indexOf('/')<0).sort().map(snap).filter(d=>(!after||d.id>after)&&filters.every(([key,op,value])=>op==='array-contains'?d.data()[key]?.includes(value):d.data()[key]===value)).slice(0,maximum);return {docs,size:docs.length};}
 };}
 function snap(path){return {exists:records.has(path),data:()=>records.get(path),id:path.split('/').at(-1),ref:ref(path)};}
 let queue=Promise.resolve();
 return {writes,records,recursiveDelete:async r=>{for(const path of [...records.keys()])if(path===r.path||path.startsWith(r.path+'/'))records.delete(path);},doc:ref,collection,runTransaction:fn=>{
  const result=queue.then(async()=>{
   let writing=false;const pending=[];
   const stage=type=>(r,d)=>{writing=true;if(type==='create'&&records.has(r.path))throw Error('duplicate');pending.push([type,r.path,d]);};
   const tx={get:async r=>{assert.equal(writing,false,'All reads precede writes');return r.path?snap(r.path):r.get();},create:stage('create'),update:stage('update'),set:stage('set'),delete:stage('delete')};
   const value=await fn(tx);
   for(const [type,path,data] of pending){if(type==='delete'){records.delete(path);continue;}const next=type==='update'?{...records.get(path),...data}:{...data};for(const [key,v] of Object.entries(next))if(v?.isEqual?.(FieldValue.delete()))delete next[key];records.set(path,next);writes.push([type,path,data]);}
   return value;
  });queue=result.catch(()=>{});return result;
 }};
}
function seed(){return {'expalsa_calidad_accesos/i1':{active:true,email:inspector.email},'expalsa_sabor_sesiones/s1':{status:'open',activeSampleId:'m1',sampleCount:1,evaluationCount:0,inspectorUids:['i1']},'expalsa_sabor_sesiones/s1/samples/m1':{...sample}};}
const request=data=>({auth:{uid:'i1',token:{email:inspector.email}},data:{action:'evaluate',sessionId:'s1',sampleId:'m1',result:'conforme',counterFlavors:normal,observations:'',...data}});
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
function adminRequest(data={}){return {auth:{uid:'admin',token:{email:'jefferson@expalsaevaluations.com'}},data:{action:'recordEvaluation',sessionId:'s1',sampleId:'m1',inspectorUid:'i1',result:'conforme',counterFlavors:normal,observations:'',...data}};}
function labSeed(){const initial=seed();initial['expalsa_calidad_config/administrador']={uid:'admin',email:'jefferson@expalsaevaluations.com'};initial['expalsa_sabor_sesiones/s1'].inspectors=[{uid:'i1',email:inspector.email,name:'Inspector uno'}];return initial;}

test('lectura de votos antiguos muestra Normal sin alterar observaciones históricas ni fechas',async()=>{
 const initial=labSeed(),path='expalsa_sabor_sesiones/s1/samples/m1/votes/i1';
 initial[path]={sampleId:'m1',inspectorUid:'i1',result:'discrepancia',observations:'Le dio normal',createdAtMs:123, counterFlavors:[{sabor:'Le dio normal',porcentaje:100}]};
 const db=database(initial),response=await handler(db)(adminRequest({action:'detail'}));
 assert.equal(response.evaluations[0].observations,'Normal');assert.equal(response.evaluations[0].counterFlavors[0].sabor,'Normal');assert.equal(response.evaluations[0].createdAtMs,123);assert.equal(response.evaluations[0].result,'conforme');
 const own=await handler(db)(request({action:'detail'}));assert.equal(own.evaluations[0].result,'conforme');assert.equal(own.evaluations[0].receiptSnapshot,undefined);
 assert.equal(db.records.get(path).observations,'Le dio normal');assert.equal(db.writes.length,0);
});

test('editar muestra cerrada guarda datos y resultados sin reabrir la sesión ni duplicar contadores',async()=>{
 const initial=labSeed(),base='expalsa_sabor_sesiones/s1';
 Object.assign(initial[base],{status:'closed',activeSampleId:'',workflowVersion:1,membershipRevision:0,finishedSampleCount:1,evaluationCount:1});
 initial[base+'/samples/m1'].finishedRevision=0;
 const previous={sampleId:'m1',inspectorUid:'i1',counterFlavors:normal,observations:'Original',result:'conforme',createdAtMs:100,recordedBy:'i1'};
 initial[base+'/samples/m1/votes/i1']=previous;
 initial[base+'/samples/m1/votes/i1/photos/evidence']={jpeg:'conservada'};
 const db=database(initial),call=handler(db),draft=await call(adminRequest({action:'prepareSampleEdit'}));
 await call(adminRequest({action:'saveSampleEdit',version:draft.version,sample:{...sample,lote:'Corregido'},evaluations:[{inspectorUid:'i1',counterFlavors:[{sabor:'Tierra Medio',porcentaje:100}],observations:'Corrección'}]}));
 assert.equal(db.records.get(base+'/samples/m1').lote,'Corregido');
 assert.equal(db.records.get(base+'/samples/m1').finishedRevision,0);
 assert.equal(db.records.get(base).status,'closed');assert.equal(db.records.get(base).evaluationCount,1);assert.equal(db.records.get(base).finishedSampleCount,1);
 const vote=db.records.get(base+'/samples/m1/votes/i1');
 assert.equal(vote.result,'discrepancia');assert.equal(vote.observations,'Corrección');assert.equal(vote.recordedBy,'i1');assert.equal(vote.createdAtMs,100);assert.equal(vote.editedBy,'admin');
 assert.equal(db.records.get(base+'/samples/m1/votes/i1/photos/evidence').jpeg,'conservada');
 assert.deepEqual(db.records.get(base+'/samples/m1/edits/new-id').previousEvaluations[0],{id:'i1',...previous});
 await assert.rejects(call(adminRequest({action:'saveSampleEdit',version:draft.version,sample,evaluations:[]})),{code:'aborted'});
});

test('edición administrativa rechaza lectores e inspectores en ambas acciones',async()=>{
 for(const action of ['prepareSampleEdit','saveSampleEdit']){
  const db=database(labSeed());await assert.rejects(handler(db)(request({action})),{code:'permission-denied'});assert.equal(db.writes.length,0);
  const initial=labSeed();initial['expalsa_calidad_accesos/viewer']={active:true,email:'fabio@expalsaevaluations.com'};
  const viewer=database(initial);await assert.rejects(handler(viewer)({auth:{uid:'viewer',token:{email:'fabio@expalsaevaluations.com'}},data:{action,sessionId:'s1',sampleId:'m1'}}),{code:'permission-denied'});assert.equal(viewer.writes.length,0);
 }
});

test('edición valida todo antes de escribir y conserva votos históricos no seleccionados',async()=>{
 const initial=labSeed(),base='expalsa_sabor_sesiones/s1';initial[base+'/samples/m1/votes/i1']={inspectorUid:'i1',result:'conforme',observations:'Dato histórico'};
 initial[base].evaluationCount=1;
 const db=database(initial),call=handler(db),draft=await call(adminRequest({action:'prepareSampleEdit'}));
 await assert.rejects(call(adminRequest({action:'saveSampleEdit',version:draft.version,sample,evaluations:[{inspectorUid:'otro',counterFlavors:normal,observations:''}]})),{code:'invalid-argument'});assert.equal(db.writes.length,0);
 await assert.rejects(call(adminRequest({action:'saveSampleEdit',version:draft.version,sample,evaluations:[{inspectorUid:'i1',counterFlavors:[{sabor:'Normal',porcentaje:120}],observations:''}]})),{code:'invalid-argument'});assert.equal(db.writes.length,0);
 await call(adminRequest({action:'saveSampleEdit',version:draft.version,sample:{...sample,receptionAnalyst:'Analista corregida'},evaluations:[]}));
 assert.deepEqual(db.records.get(base+'/samples/m1/votes/i1'),initial[base+'/samples/m1/votes/i1']);assert.equal(db.records.get(base).activeSampleId,'m1');
});

test('editar registra un pendiente una sola vez y detecta cambios concurrentes',async()=>{
 const db=database(labSeed()),call=handler(db),draft=await call(adminRequest({action:'prepareSampleEdit'}));
 await call(adminRequest());
 await assert.rejects(call(adminRequest({action:'saveSampleEdit',version:draft.version,sample,evaluations:[]})),{code:'aborted'});
 const empty=database(labSeed()),save=handler(empty),current=await save(adminRequest({action:'prepareSampleEdit'}));
 await save(adminRequest({action:'saveSampleEdit',version:current.version,sample,evaluations:[{inspectorUid:'i1',counterFlavors:normal,observations:'Pendiente completado'}]}));
 assert.equal(empty.records.get('expalsa_sabor_sesiones/s1').evaluationCount,1);
});
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
 const db=database(initial),call=handler(db);await call(adminRequest({action:'addInspectors',inspectorUids:['i2']}));await call(adminRequest({action:'startSample'}));
 await call(adminRequest());await call(adminRequest({inspectorUid:'i2',counterFlavors:[{sabor:'Tierra Leve',porcentaje:100}],observations:'Nota terrosa'}));
 assert.equal(db.records.get('expalsa_sabor_sesiones/s1/samples/m1/votes/i1').result,'conforme');
 assert.equal(db.records.get('expalsa_sabor_sesiones/s1/samples/m1/votes/i2').result,'discrepancia');
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
 const db=database(initial),call=handler(db);await call(adminRequest({action:'addInspectors',inspectorUids:['i2']}));await call(adminRequest({action:'startSample'}));await call(adminRequest());
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
test('la foto de perfil queda asociada a la evaluación al guardar',async()=>{
 const initial=labSeed();initial['expalsa_calidad_fotos_perfil/i1']={jpeg:JPEG.slice(23)};
 const db=database(initial);await handler(db)(adminRequest());
 const portrait=db.records.get('expalsa_sabor_sesiones/s1/samples/m1/votes/i1/photos/profile');assert.equal(portrait.kind,'profile');assert.equal(portrait.dataUrl,JPEG);
});
test('se guardan varias fotos de muestra y evidencia sin duplicarlas al reintentar',async()=>{
 const db=database(labSeed()),call=handler(db);await call(adminRequest());
 for(const photoId of ['sample1','sample2'])await call(adminRequest({action:'uploadPhoto',kind:'sample',photo:{id:photoId,dataUrl:JPEG,origin:'gallery'}}));
 const data={action:'uploadPhoto',kind:'evidence',photo:{id:'capture1',dataUrl:JPEG,origin:'camera',capturedAtMs:Date.now()}};
 await call(adminRequest(data));await call(adminRequest(data));
 assert.equal((await db.collection('expalsa_sabor_sesiones/s1/samples/m1/photos').get()).size,2);
 assert.equal((await db.collection('expalsa_sabor_sesiones/s1/samples/m1/votes/i1/photos').get()).size,1);
 const saved=db.records.get('expalsa_sabor_sesiones/s1/samples/m1/votes/i1/photos/capture1');assert.equal(saved.uploadedBy,'admin');assert.equal(saved.origin,'camera');
});
test('las evidencias exigen cámara y se guardan antes de evaluar; las fotos rechazan contenido inválido',async()=>{
 const call=handler(database(labSeed()));
 await assert.rejects(call(adminRequest({action:'uploadPhoto',kind:'evidence',photo:{id:'c1',dataUrl:JPEG,origin:'gallery'}})),{code:'invalid-argument'});
 await call(adminRequest({action:'uploadPhoto',kind:'evidence',photo:{id:'c1',dataUrl:JPEG,origin:'camera'}}));
 assert.equal(imageData(JPEG).width,240);assert.throws(()=>imageData('data:image/jpeg;base64,AAAA'),{code:'invalid-argument'});
});
test('no se pueden cargar fotos en sesiones eliminadas ni consultar evidencia de otro inspector',async()=>{
 const initial=labSeed(),db=database(initial),call=handler(db);await call(adminRequest({action:'deleteSession'}));
 await assert.rejects(call(adminRequest({action:'uploadPhoto',kind:'sample',photo:{id:'s1',dataUrl:JPEG,origin:'gallery'}})),{code:'not-found'});
 const ownCall=handler(database(labSeed()));await assert.rejects(ownCall(request({action:'inspectorPhoto',inspectorUid:'i2'})),{code:'permission-denied'});
});
test('la versión pública permite verificar que la función publicada está actualizada',async()=>{
 const version=await handler(database({}))({data:{action:'serviceInfo'}});assert.equal(version.version,'20261106-reception-1');
});

test('eliminar inspector borra resultados y fotos en todas las páginas y conserva otros inspectores',async()=>{
 const initial=labSeed();initial['expalsa_sabor_sesiones/s1'].sampleCount=25;initial['expalsa_sabor_sesiones/s1'].evaluationCount=25;
 for(let i=0;i<25;i++){const base='expalsa_sabor_sesiones/s1/samples/m'+String(i).padStart(2,'0');initial[base]=sample;initial[base+'/votes/i1']={sampleId:'m'+i,inspectorUid:'i1'};initial[base+'/votes/i1/photos/p']={kind:'evidence'};initial[base+'/votes/other']={inspectorUid:'other'};}
 const db=database(initial),call=handler(db);let done=false,passes=0;while(!done){done=(await call(adminRequest({action:'removeInspector',inspectorUid:'i1'}))).done;passes++;}
 assert.equal(passes,2);assert.equal(db.records.get('expalsa_sabor_sesiones/s1').evaluationCount,0);assert.equal(db.records.get('expalsa_sabor_sesiones/s1').inspectorCount,0);
 assert.equal([...db.records.keys()].filter(p=>p.includes('/votes/i1')).length,0);assert.equal([...db.records.keys()].filter(p=>p.endsWith('/votes/other')).length,25);
 await call(adminRequest({action:'removeInspector',inspectorUid:'i1'}));assert.equal(db.records.get('expalsa_sabor_sesiones/s1').evaluationCount,0);
});
test('fotos reemplazadas y eliminadas desaparecen de consultas; managers no pueden eliminar',async()=>{
 const db=database(labSeed()),call=handler(db);for(const id of ['a','b'])await call(adminRequest({action:'uploadPhoto',kind:'sample',photo:{id,dataUrl:JPEG,origin:'gallery'}}));
 await call(adminRequest({action:'replacePhoto',kind:'sample',oldPhotoId:'a',newPhotoId:'b'}));assert.deepEqual((await call(adminRequest({action:'listPhotos',kind:'sample'}))).photos.map(p=>p.id),['b']);
 await call(adminRequest({action:'deletePhoto',kind:'sample',photoId:'b'}));assert.equal((await call(adminRequest({action:'listPhotos',kind:'sample'}))).photos.length,0);
});

test('editar fotos de muestra y evidencias conserva carga inicial, captura, autor y estado cerrado',async()=>{
 const bytes=Buffer.from(JPEG.slice(23),'base64'),replacement='data:image/jpeg;base64,'+Buffer.concat([bytes.subarray(0,2),Buffer.from([255,254,0,5,65,66,67]),bytes.subarray(2)]).toString('base64');
 for(const kind of ['sample','evidence']){
  const db=database(labSeed()),call=handler(db),base='expalsa_sabor_sesiones/s1';await call(adminRequest());
  await call(adminRequest({action:'uploadPhoto',kind,photo:{id:'photo',dataUrl:JPEG,origin:kind==='evidence'?'camera':'gallery'}}));
  const path=base+'/samples/m1/'+(kind==='sample'?'photos':'votes/i1/photos')+'/photo',original={...db.records.get(path),uploadedAtMs:1000,capturedAtMs:900,uploadedBy:'original',uploadedByEmail:'original@example.test'};
  db.records.set(path,original);db.records.get(base).status='closed';
  await call(adminRequest({action:'editPhoto',kind,photoId:'photo',expectedDigest:original.digest,expectedEditedAtMs:0,photo:{dataUrl:replacement,origin:'gallery'}}));
  const updated=db.records.get(path);assert.equal(updated.dataUrl,replacement);assert.equal(updated.uploadedAtMs,1000);assert.equal(updated.capturedAtMs,900);assert.equal(updated.uploadedBy,'original');assert.equal(updated.uploadedByEmail,'original@example.test');assert.equal(updated.editedBy,'admin');assert.ok(updated.editedAtMs>1000);assert.equal(db.records.get(base).status,'closed');
  assert.deepEqual(db.records.get(path+'/edits/new-id').previousPhoto,original);
  const writes=db.writes.length;
  await assert.rejects(call(adminRequest({action:'editPhoto',kind,photoId:'photo',expectedDigest:original.digest,expectedEditedAtMs:0,photo:{dataUrl:JPEG,origin:'gallery'}})),{code:'aborted'});assert.equal(db.writes.length,writes);
 }
});

test('edición de fotos rechaza inspectores, lectores, perfiles, imágenes inválidas y fotos eliminadas',async()=>{
 const db=database(labSeed()),call=handler(db);
 await call(adminRequest({action:'uploadPhoto',kind:'sample',photo:{id:'photo',dataUrl:JPEG,origin:'gallery'}}));
 const change={action:'editPhoto',kind:'sample',photoId:'photo',expectedDigest:'',expectedEditedAtMs:0,photo:{dataUrl:JPEG,origin:'gallery'}};
 const before=db.writes.length;
 await assert.rejects(call(request(change)),{code:'permission-denied'});
 for(const who of ['fabio','karina']){
  db.records.set('expalsa_calidad_accesos/'+who,{active:true,email:who+'@expalsaevaluations.com'});
  await assert.rejects(call({auth:{uid:who,token:{email:who+'@expalsaevaluations.com'}},data:{...change,sessionId:'s1',sampleId:'m1'}}),{code:'permission-denied'});
 }
 await assert.rejects(call(adminRequest({...change,kind:'evidence',photoId:'profile'})),{code:'invalid-argument'});
 await assert.rejects(call(adminRequest({...change,photo:{dataUrl:'invalid',origin:'gallery'}})),{code:'invalid-argument'});assert.equal(db.writes.length,before);
 db.records.get('expalsa_sabor_sesiones/s1/samples/m1/photos/photo').deleted=true;
 await assert.rejects(call(adminRequest(change)),{code:'not-found'});assert.equal(db.writes.length,before);
});

test('reemplazos antiguos encadenados mantienen la fecha de la primera carga',async()=>{
 const db=database(labSeed()),call=handler(db),base='expalsa_sabor_sesiones/s1/samples/m1/photos/';
 for(const id of ['a','b','c'])await call(adminRequest({action:'uploadPhoto',kind:'sample',photo:{id,dataUrl:JPEG,origin:'gallery'}}));
 Object.assign(db.records.get(base+'a'),{uploadedAtMs:1000,capturedAtMs:900,uploadedBy:'original'});
 await call(adminRequest({action:'replacePhoto',kind:'sample',oldPhotoId:'a',newPhotoId:'b'}));
 await call(adminRequest({action:'replacePhoto',kind:'sample',oldPhotoId:'b',newPhotoId:'c'}));
 assert.equal(db.records.get(base+'c').uploadedAtMs,1000);assert.equal(db.records.get(base+'c').capturedAtMs,900);assert.equal(db.records.get(base+'c').uploadedBy,'original');assert.equal(db.records.get(base+'c').editedBy,'admin');
});

test('Fabio y Karina solo consultan resultados y PDF; todas las escrituras se rechazan sin cambiar datos',async()=>{
 for(const uid of ['fabio','karina']){
  const initial=labSeed();initial['expalsa_calidad_accesos/'+uid]={active:true,email:uid+'@expalsaevaluations.com'};
  const db=database(initial),call=handler(db),reader=data=>({auth:{uid,token:{email:uid+'@expalsaevaluations.com'}},data:{sessionId:'s1',sampleId:'m1',inspectorUid:'i1',...data}});
  await call(adminRequest());const writesBefore=db.writes.length;
  const access=await call(reader({action:'bootstrap'}));assert.equal(access.viewer,true);assert.equal(access.manager,false);assert.equal(access.canReadResults,true);assert.equal(access.canDelete,false);
  assert.equal((await call(reader({action:'listSessions'}))).sessions.length,1);
  assert.equal((await call(reader({action:'detail'}))).evaluations.length,1);
  assert.equal((await call(reader({action:'listMembers'}))).inspectors.length,1);
  assert.equal((await call(reader({action:'listVotes'}))).evaluations.length,1);
  assert.equal((await call(reader({action:'authorizeComparisonReport'}))).allowed,true);
  await call(reader({action:'listPhotos',kind:'sample'}));await call(reader({action:'listPhotos',kind:'evidence'}));await call(reader({action:'inspectorPhoto'}));
  for(const action of ['deleteSample','createSession','inspectors','addInspectors','addSample','updateSample','openSession','closeSession','evaluate','recordEvaluation','uploadPhoto','replacePhoto','deletePhoto','deleteSession','restoreSession','removeInspector','startSample','finishSample','saveProgress','loadProgress'])await assert.rejects(call(reader({action,kind:'sample',photoId:'photo'})),{code:'permission-denied'},action);
  assert.equal(db.writes.length,writesBefore);
 }
});

test('flujo secuencial: no finalizar incompleta ni cambiar de muestra; finalizar todas habilita cerrar',async()=>{
 const initial=labSeed();initial['expalsa_sabor_sesiones/s1'].sampleCount=2;initial['expalsa_sabor_sesiones/s1'].activeSampleId='';initial['expalsa_sabor_sesiones/s1/samples/m2']=sample;
 const db=database(initial),call=handler(db);
 await assert.rejects(call(adminRequest()),{code:'failed-precondition'});
 await call(adminRequest({action:'startSample'}));
 await assert.rejects(call(adminRequest({action:'finishSample'})),{code:'failed-precondition'});
 await assert.rejects(call(adminRequest({action:'startSample',sampleId:'m2'})),{code:'failed-precondition'});
 await call(adminRequest());await call(adminRequest({action:'finishSample'}));await call(adminRequest({action:'finishSample'}));
 assert.equal(db.records.get('expalsa_sabor_sesiones/s1').finishedSampleCount,1);
 await assert.rejects(call(adminRequest({action:'closeSession'})),{code:'failed-precondition'});
 await call(adminRequest({action:'startSample',sampleId:'m2'}));await call(adminRequest({sampleId:'m2'}));await call(adminRequest({action:'finishSample',sampleId:'m2'}));
 await call(adminRequest({action:'closeSession'}));assert.equal(db.records.get('expalsa_sabor_sesiones/s1').status,'closed');
 assert.equal(db.records.get('expalsa_sabor_sesiones/s1/samples/m1/votes/i1').observations,'');
});
test('nuevos inspectores invalidan la finalización sin borrar resultados; fecha sola no la invalida',async()=>{
 const initial=labSeed();initial['expalsa_calidad_accesos/i2']={active:true,email:'i2@example.test'};
 const db=database(initial),call=handler(db);await call(adminRequest());await call(adminRequest({action:'finishSample'}));
 await call(adminRequest({action:'updateSample',receivedDate:'2026-11-05'}));assert.equal(db.records.get('expalsa_sabor_sesiones/s1').finishedSampleCount,1);
 await call(adminRequest({action:'addInspectors',inspectorUids:['i2']}));assert.equal(db.records.get('expalsa_sabor_sesiones/s1').finishedSampleCount,0);
 assert.ok(db.records.get('expalsa_sabor_sesiones/s1/samples/m1/votes/i1'));
 await call(adminRequest({action:'startSample'}));await assert.rejects(call(adminRequest({action:'finishSample'})),{code:'failed-precondition'});
});
test('autoguardado conserva borradores y rechaza sobrescrituras anteriores y acceso de lectores',async()=>{
 const db=database(labSeed()),call=handler(db);const draft={updatedAtMs:100,values:{name:'Sesión pendiente'},flavors:[{sabor:'Tierra Medio',porcentaje:'30'}]};
 await call(adminRequest({action:'saveProgress',key:'new-session',draft}));await call(adminRequest({action:'saveProgress',key:'new-session',draft:{updatedAtMs:99}}));
 assert.deepEqual((await call(adminRequest({action:'loadProgress',key:'new-session'}))).draft,draft);
 await assert.rejects(call(request({action:'saveProgress',key:'workspace',draft})),{code:'permission-denied'});
 const initial=labSeed();initial['expalsa_calidad_accesos/fabio']={active:true,email:'fabio@expalsaevaluations.com'};
 await assert.rejects(handler(database(initial))({auth:{uid:'fabio',token:{email:'fabio@expalsaevaluations.com'}},data:{action:'saveProgress',key:'workspace',draft}}),{code:'permission-denied'});
});
test('crear muestra con identificador de solicitud permite reintentar sin duplicar',async()=>{
 const initial=labSeed();initial['expalsa_sabor_sesiones/s1'].status='draft';const db=database(initial),call=handler(db);
 const request=adminRequest({action:'addSample',sample,requestId:'stable-request'});const first=await call(request),second=await call(request);assert.equal(first.id,second.id);assert.equal(db.records.get('expalsa_sabor_sesiones/s1').sampleCount,2);
});

test('inicio requiere inspectores y la creación sin requestId usa un ID automático válido',async()=>{
 const initial=labSeed();initial['expalsa_sabor_sesiones/s1'].inspectorUids=[];const call=handler(database(initial));await assert.rejects(call(adminRequest({action:'startSample'})),{code:'failed-precondition'});
 const draft=labSeed();draft['expalsa_sabor_sesiones/s1'].status='draft';const db=database(draft);await handler(db)(adminRequest({action:'addSample',sample}));assert.equal(db.records.get('expalsa_sabor_sesiones/s1').sampleCount,2);
});

test('letras únicas por sesión, fecha real, nombre y Normal automático en cualquier etapa',async()=>{
 for(const status of ['draft','open','closed']){
  const initial=labSeed();initial['expalsa_sabor_sesiones/s1'].status=status;
  const db=database(initial),call=handler(db);
  const input={...sample,blindLetter:'A',receptionAnalyst:'Ana Recepción',receivedDate:'05/11/2026',receiptFlavors:[{sabor:'Tierra Leve',porcentaje:30}]};
  await call(adminRequest({action:'addSample',requestId:'new-letter',sample:input}));
  const saved=db.records.get('expalsa_sabor_sesiones/s1/samples/new-letter');assert.equal(saved.receivedDate,'2026-11-05');assert.equal(saved.blindLetter,'A');assert.equal(saved.receptionAnalyst,'Ana Recepción');assert.deepEqual(saved.receiptFlavors,[{sabor:'Tierra Leve',porcentaje:30},{sabor:'Normal',porcentaje:70}]);
  assert.equal(db.records.get('expalsa_sabor_sesiones/s1').status,status==='closed'?'open':status);
  await assert.rejects(call(adminRequest({action:'addSample',requestId:'duplicate',sample:input})),{code:'already-exists'});
  await assert.rejects(call(adminRequest({action:'updateSample',sampleId:'m1',...input})),{code:'already-exists'});
  await assert.rejects(call(adminRequest({action:'addSample',sample:{...input,receivedDate:''}})),{code:'invalid-argument'});
  await assert.rejects(call(adminRequest({action:'addSample',sample:{...input,blindLetter:'AA'}})),{code:'invalid-argument'});
  await assert.rejects(call(adminRequest({action:'addSample',sample:{...input,blindLetter:'B',receiptFlavors:[{sabor:'Tierra Leve',porcentaje:110}]}})),{code:'invalid-argument'});
 }
});

test('eliminar muestra es idempotente, conserva otras evaluaciones y cuenta correctamente al retirar inspectores',async()=>{
 const initial=labSeed(),root='expalsa_sabor_sesiones/s1';
 Object.assign(initial[root],{membershipRevision:0,finishedSampleCount:1,sampleCount:2,evaluationCount:2});
 initial[root+'/samples/m1'].finishedRevision=0;
 initial[root+'/samples/m1/votes/i1']={sampleId:'m1',inspectorUid:'i1',counterFlavors:normal,observations:'Original uno'};
 initial[root+'/samples/m2']={...sample,lote:'OTRO'};
 initial[root+'/samples/m2/votes/i1']={sampleId:'m2',inspectorUid:'i1',counterFlavors:normal,observations:'Original dos'};
 const db=database(initial),call=handler(db),other=JSON.stringify(initial[root+'/samples/m2/votes/i1']);
 await call(adminRequest({action:'deleteSample'}));await call(adminRequest({action:'deleteSample'}));
 assert.equal(db.records.get(root).sampleCount,1);assert.equal(db.records.get(root).evaluationCount,1);assert.equal(db.records.get(root).finishedSampleCount,0);assert.equal(db.records.get(root).activeSampleId,'');
 assert.equal(JSON.stringify(db.records.get(root+'/samples/m2/votes/i1')),other);
 assert.equal((await call(adminRequest({action:'detail'}))).samples.length,1);
 for(const action of ['startSample','updateSample','listVotes','listPhotos'])await assert.rejects(call(adminRequest({action,kind:'sample',...sample})),{code:'not-found'});
 await call(adminRequest({action:'removeInspector'}));assert.equal(db.records.get(root).evaluationCount,0);
 assert.ok(db.records.has(root+'/samples/m1/votes/i1'),'El registro archivado se conserva y no se descuenta dos veces');
});

test('los inspectores reciben la letra sin revelar lote ni composición de recepción',async()=>{
 const initial=labSeed();initial['expalsa_sabor_sesiones/s1/samples/m1']={...sample,blindLetter:'B',receptionAnalyst:'Privado'};
 const db=database(initial);await handler(db)(request());const result=await handler(db)(request({action:'detail'}));
 assert.equal(result.samples[0].blindLetter,'B');assert.equal(result.samples[0].lote,undefined);assert.equal(result.samples[0].receiptFlavors,undefined);assert.equal(result.evaluations[0].receiptSnapshot,undefined);
});
