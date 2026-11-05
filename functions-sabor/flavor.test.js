const {test}=require('node:test');
const assert=require('node:assert/strict');
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
 function collection(path){return {doc:k=>ref(path+'/'+(k||'new-id'))};}
 function snap(path){return {exists:records.has(path),data:()=>records.get(path),id:path.split('/').at(-1),ref:ref(path)};}
 return {writes,doc:ref,collection,runTransaction:async fn=>{
  let writing=false;const tx={get:async r=>{assert.equal(writing,false,'All reads precede writes');return snap(r.path);},create:(r,d)=>{writing=true;if(records.has(r.path))throw Error('duplicate');writes.push(['create',r.path,d]);records.set(r.path,d);},update:(r,d)=>{writing=true;writes.push(['update',r.path,d]);records.set(r.path,{...records.get(r.path),...d});}};
  return fn(tx);
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
