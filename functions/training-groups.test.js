const test = require('node:test');
const assert = require('node:assert/strict');
const {validateAssignment,validateResponsible,handler} = require('./training-groups');
const person = {name:'Ana María Pérez',station:'M02',email:'ana@example.com',accountUid:'ana',active:true,groupNumber:1};
const candidate = {...person,name:'Luis Vera',station:'M05',email:'luis@example.com',accountUid:'luis'};
const group = {number:2,name:'Asistente Dos',rev:0};
test('rejects another group using the same account, email or normalized full name', () => {
  for (const patch of [{accountUid:'ana'},{email:'ANA@example.com'},{name:'  Ana Maria  Perez '}]) {
    assert.throws(() => validateAssignment({...candidate,...patch},[person],group), /Grupo 1/);
  }
});
test('a retired inspector can be assigned again; areas can repeat across groups', () => {
  validateAssignment({...person},[{...person,active:false}],group);
  validateAssignment({...candidate,station:'M02'},[person],group);
});
test('requires a responsible, limits each group to 10, rejects occupied areas', () => {
  assert.throws(() => validateAssignment(candidate,[],{number:2,name:''}), /responsable/);
  assert.throws(() => validateAssignment(candidate,[{...person,groupNumber:2,station:'M05'}],group), /ocupada/);
  assert.throws(() => validateAssignment(candidate,Array.from({length:10},()=>({...person,groupNumber:2})),group), /10 inspectores/);
});
test('validates the responsible and photo size/type', () => {
  validateResponsible('Asistente Uno','');
  assert.throws(() => validateResponsible('A',''), /nombre completo/);
  assert.throws(() => validateResponsible('Asistente Uno','https://example.com/photo'), /fotografía/);
});
// Transaction double executes serially, including a second call made while the
// first is pending. Reads observe committed documents, as after a Firestore retry.
function database(seed) {
  const docs = new Map(Object.entries(seed));let tail=Promise.resolve(),id=0;
  const doc = path => ({path,id:path.split('/').at(-1)});
  const db = {doc,collection:path=>({path,doc:key=>doc(path+'/'+(key||String(++id)))})};
  db.runTransaction = callback => {
    const result = tail.then(async()=>{
      const writes=[];
      const snap=ref=>({ref,id:ref.id,exists:docs.has(ref.path),data:()=>docs.get(ref.path)});
      const tx={get:async ref=>ref.id?snap(ref):{docs:[...docs.keys()].filter(k=>k.startsWith(ref.path+'/')&&!k.slice(ref.path.length+1).includes('/')).map(k=>snap(doc(k)))},set:(ref,d)=>writes.push(()=>docs.set(ref.path,d)),create:(ref,d)=>writes.push(()=>docs.set(ref.path,d)),update:(ref,d)=>writes.push(()=>docs.set(ref.path,{...docs.get(ref.path),...d}))};
      const value=await callback(tx);writes.forEach(w=>w());return value;
    });
    tail=result.catch(()=>{});return result;
  };
  db.docs=docs;return db;
}
test('legacy team stays Group 1 and retains responsible and participants', async()=>{
  const db=database({'expalsa_capacitacion_2026_equipo/responsable':{name:'Asistente Uno',jpeg:'',rev:3},'expalsa_capacitacion_2026_participantes/old':person});
  const invoke=handler(db,async()=>({uid:'admin'}));
  const result=await invoke({data:{action:'list'}});
  assert.equal(result.groups[0].number,1);assert.equal(result.groups[0].name,'Asistente Uno');
  assert.equal(db.docs.get('expalsa_capacitacion_2026_participantes/old'),person);
});
test('concurrent assignment: one wins; removal permits reassignment to another responsible', async()=>{
  const db=database({'expalsa_capacitacion_2026_equipo/responsable':{name:'Asistente Uno',jpeg:'',rev:1},'expalsa_capacitacion_2026_grupos/2':group});
  const invoke=handler(db,async()=>({uid:'admin'}));
  const payload={action:'add',...candidate,accountUid:'',groupNumber:1};
  const results=await Promise.allSettled([invoke({data:payload}),invoke({data:{...payload,groupNumber:2}})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected').length,1);
  const assigned=[...db.docs].find(([k])=>k.startsWith('expalsa_capacitacion_2026_participantes/'));
  await invoke({data:{action:'remove',personId:assigned[1].id,groupNumber:1}});
  await invoke({data:{...payload,groupNumber:2}});
  const active=[...db.docs].filter(([k,v])=>k.startsWith('expalsa_capacitacion_2026_participantes/')&&v.active);
  assert.equal(active.length,1);assert.equal(active[0][1].groupNumber,2);
});
test('responsible revision rejects a stale save; unauthorized requests stop before reads',async()=>{
  const db=database({'expalsa_capacitacion_2026_grupos/2':group});
  const invoke=handler(db,async()=>({uid:'admin'}));
  await invoke({data:{action:'saveResponsible',groupNumber:2,name:'Nuevo asistente',jpeg:'',rev:0}});
  await assert.rejects(invoke({data:{action:'saveResponsible',groupNumber:2,name:'Otro asistente',jpeg:'',rev:0}}), /otra ventana/);
  await assert.rejects(handler(db,async()=>{throw Error('Sin autorización');})({data:{action:'list'}}), /autorización/);
});
test('assistants are created independently, then assigned to a chosen group number',async()=>{
  const db=database({}),invoke=handler(db,async()=>({uid:'admin'}));
  const created=await invoke({data:{action:'saveAssistant',name:'Asistente Nuevo',jpeg:''}});
  let list=await invoke({data:{action:'list'}});
  assert.equal(list.assistants.length,1);assert.equal(list.groups[0].name,'');
  await invoke({data:{action:'assignGroup',groupNumber:7,assistantId:created.assistantId,rev:0}});
  list=await invoke({data:{action:'list'}});
  assert.equal(list.groups.find(g=>g.number===7).name,'Asistente Nuevo');
  await assert.rejects(invoke({data:{action:'saveAssistant',name:'  asistente nuevo ',jpeg:''}}),/Ya existe/);
  await assert.rejects(invoke({data:{action:'assignGroup',groupNumber:7,assistantId:created.assistantId,rev:0}}),/otra ventana/);
});
test('legacy photograph and name survive registry creation and editing',async()=>{
  const jpeg='data:image/jpeg;base64,AA==';
  const db=database({'expalsa_capacitacion_2026_equipo/responsable':{name:'Asistente Anterior',jpeg,rev:3}}),invoke=handler(db,async()=>({uid:'admin'}));
  let list=await invoke({data:{action:'list'}}),assistant=list.assistants[0];
  assert.equal(list.groups[0].jpeg,jpeg);assert.equal(assistant.jpeg,jpeg);
  await invoke({data:{action:'saveAssistant',assistantId:assistant.id,name:'Asistente Actualizado',jpeg,rev:0}});
  list=await invoke({data:{action:'list'}});
  assert.equal(list.assistants.length,1);assert.equal(list.groups[0].assistantId,assistant.id);
  assert.equal(list.groups[0].name,'Asistente Actualizado');assert.equal(list.groups[0].jpeg,jpeg);
  await assert.rejects(invoke({data:{action:'saveAssistant',assistantId:assistant.id,name:'Cambio obsoleto',jpeg,rev:0}}),/otra ventana/);
});
test('inspector assignment rejects a mismatched assistant and preserves a single responsible',async()=>{
  const db=database({}),invoke=handler(db,async()=>({uid:'admin'}));
  const first=await invoke({data:{action:'saveAssistant',name:'Asistente Primero',jpeg:''}});
  const second=await invoke({data:{action:'saveAssistant',name:'Asistente Segundo',jpeg:''}});
  await invoke({data:{action:'assignGroup',groupNumber:1,assistantId:first.assistantId,rev:0}});
  const data={action:'add',...candidate,accountUid:'',groupNumber:1,assistantId:second.assistantId};
  await assert.rejects(invoke({data}),/no es responsable/);
  await invoke({data:{...data,assistantId:first.assistantId}});
  await invoke({data:{action:'assignGroup',groupNumber:1,assistantId:second.assistantId,rev:1}});
  const list=await invoke({data:{action:'list'}});
  assert.equal(list.groups[0].assistantId,second.assistantId);
  assert.equal([...db.docs].filter(([k,v])=>k.startsWith('expalsa_capacitacion_2026_participantes/')&&v.active).length,1);
});
