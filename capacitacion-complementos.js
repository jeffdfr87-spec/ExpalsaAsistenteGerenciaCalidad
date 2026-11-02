export const COLLECTION='expalsa_capacitacion_2026_complementos';
export function periodFor(start){
  const d=new Date(start+'T12:00:00Z');
  if(!Number.isFinite(+d))throw Error('Fecha de inicio inválida.');
  const previous=new Date(d);previous.setUTCFullYear(d.getUTCFullYear()-1);
  if(previous.getUTCMonth()!==d.getUTCMonth())previous.setUTCDate(0);
  const end=new Date(d);end.setUTCDate(d.getUTCDate()-1);
  return {start:previous.toISOString().slice(0,10),end:end.toISOString().slice(0,10)};
}
const TEXT_MAX=3000;
export const SCHEMAS={
  periodo:[['programStart','Inicio del programa','date'],['reviewedBy','Revisado con Gerencia de Calidad'],['evidence','Referencia de la revisión o acta','textarea']],
  calibracion:[['date','Fecha de calibración','date'],['minutes','Duración real en minutos','number'],['sample','Identificación de la muestra'],['spec','Ficha técnica y versión'],['lead','Asistente de Gerencia de Calidad'],['shiftLead','Asistente de Aseguramiento de Calidad del turno'],['reference','Referencia aprobada de talla, cuenta, uniformidad, defectos y decisión','textarea'],['tolerance','Tolerancias y procedimiento aplicable','textarea'],['validatedBy','Validación de Gerencia de Calidad'],['agreements','Acuerdos técnicos','textarea'],['evidence','Referencia del acta y evidencias','textarea']],
  resultado:[['calibrationId','Acta de calibración','calibration'],['personId','Inspector','person'],['attendance','Asistencia','attendance'],['talla','Talla observada'],['cuenta','Cuenta y unidad'],['uniformidad','Uniformidad y método'],['defectos','Defectos identificados y clasificación','textarea'],['decision','Decisión según especificación','decision'],['discrepancy','Discrepancias frente a la referencia','textarea'],['reinforcement','Refuerzo aplicado','textarea'],['recheck','Fecha y resultado de la nueva comprobación','textarea'],['concordant','Concordancia final con la referencia aprobada','yesno'],['evidence','Referencia de hoja individual o evidencia','textarea']],
  reclamo:[['code','Código del reclamo sin datos del cliente'],['date','Fecha del reclamo','date'],['product','Producto y proceso'],['deviation','Desviación','textarea'],['requirement','Requisito incumplido','textarea'],['cause','Causa documentada o pendiente de confirmar','textarea'],['control','Control que falló o faltó o qué sucedió','textarea'],['action','Acción correctiva','textarea'],['topic','Tema de capacitación'],['competency','Competencias relacionadas C1–C10'],['day','Día de aplicación','day'],['priority','Prioridad por recurrencia e impacto','priority'],['rationale','Justificación de prioridad y relación con las funciones','textarea'],['evidence','Referencia de investigación y acciones','textarea']],
  aprendizaje:[['caseId','Reclamo seleccionado','case'],['personId','Inspector','person'],['date','Fecha del ejercicio','date'],['explanation','Qué ocurrió','textarea'],['requirement','Qué requisito aplica','textarea'],['detection','Cómo detectar la desviación','textarea'],['containment','Contención dentro de sus funciones','textarea'],['communication','Comunicación y escalamiento','textarea'],['verification','Evidencia que verifica la corrección','textarea'],['result','Resultado del ejercicio','result'],['reinforcement','Refuerzo requerido','textarea'],['resolved','Refuerzo comprobado','yesno'],['evidence','Referencia de evidencia formativa','textarea']]
};
export function validateRecord(type,p,records,people){
  if(!SCHEMAS[type])throw Error('Tipo no permitido.');
  for(const [key] of SCHEMAS[type])if(typeof p[key]!=='string'||p[key].length>TEXT_MAX)throw Error('Campo inválido: '+key);
  if(!['draft','done'].includes(p.status))throw Error('Estado inválido.');
  const find=(id,t)=>records.find(r=>r.id===id&&r.type===t);
  if(type==='periodo'){periodFor(p.programStart);if(!p.reviewedBy.trim()||!p.evidence.trim())throw Error('Registra la revisión y su evidencia.');}
  if(type==='resultado'&&!find(p.calibrationId,'calibracion'))throw Error('Selecciona un acta existente.');
  if(type==='aprendizaje'&&!find(p.caseId,'reclamo'))throw Error('Selecciona un reclamo existente.');
  if(['resultado','aprendizaje'].includes(type)&&!people.some(x=>x.id===p.personId))throw Error('Selecciona un inspector registrado.');
  if(type==='reclamo'){
    const period=records.find(r=>r.type==='periodo');if(!period)throw Error('Primero registra el período de reclamos.');
    const range=periodFor(period.payload.programStart);
    if(p.date<range.start||p.date>range.end)throw Error('El reclamo debe estar dentro del período de los últimos 12 meses.');
  }
  if(p.status!=='done')return;
  const optional=new Set(['discrepancy','reinforcement','recheck']);
  for(const [k,label] of SCHEMAS[type])if(!optional.has(k)&&!p[k].trim())throw Error('Completa: '+label);
  if(type==='calibracion'&&!(Number(p.minutes)>0&&Number(p.minutes)<=480))throw Error('Registra la duración real.');
  if(type==='resultado'){
    const act=find(p.calibrationId,'calibracion');
    if(act.payload.status!=='done')throw Error('Completa primero el acta y la referencia aprobada.');
    if(p.attendance!=='asistio'||p.concordant!=='si')throw Error('El cierre requiere asistencia y concordancia final.');
    if(p.discrepancy.trim()&&(!p.reinforcement.trim()||!p.recheck.trim()))throw Error('Documenta el refuerzo y la nueva comprobación.');
  }
  if(type==='aprendizaje'&&(p.result!=='demostrado'||(p.reinforcement.trim()&&p.resolved!=='si')))throw Error('Comprueba el aprendizaje y cierra el refuerzo antes de finalizar.');
}
export function createCompliance({context,notify}){
  let records=[],loaded=false,loading=false,error='',dirty=false,busy=false,editing=null;
  const titles={periodo:'Período y revisión de reclamos',calibracion:'6.1 Acta de calibración grupal',resultado:'6.1 Resultado individual',reclamo:'6.2 Matriz de reclamos',aprendizaje:'6.2 Aprendizaje por inspector'};
  const enc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const people=()=>context().people;
  const name=id=>people().find(p=>p.id===id)?.name||id;
  const list=t=>records.filter(r=>r.type===t);
  const complete=(type,key,id)=>list(type).filter(r=>r.payload[key]===id&&r.payload.status==='done');
  const host=()=>document.getElementById('complianceRoot');
  function summary(){
    const active=people().filter(p=>p.active!==false),ids=new Set(active.map(p=>p.id));
    const calibrated=new Set(list('resultado').filter(r=>r.payload.status==='done'&&ids.has(r.payload.personId)&&records.some(a=>a.id===r.payload.calibrationId&&a.payload.status==='done')).map(r=>r.payload.personId));
    const cases=list('reclamo');
    const used=cases.filter(c=>c.payload.status==='done'&&complete('aprendizaje','caseId',c.id).length);
    return `<section class="panel"><h2>Cumplimiento de los apartados 6.1 y 6.2</h2><p class="subhead">La calibración complementa las diez jornadas. Sus resultados se relacionan con C2, C3, C5 y C10 y conservan las ponderaciones de la evaluación individual. Los reclamos orientan los ejercicios y refuerzos.</p><div class="grid2"><div><b>6.1 Inspectores con concordancia comprobada</b><p>${calibrated.size}/10 · ${active.length} inspectores activos registrados</p></div><div><b>6.2 Reclamos priorizados con aprendizaje comprobado</b><p>${used.length}/${cases.length}${cases.length?'':' · Pendiente de revisión y selección'}</p></div></div><p class="note">La cobertura del 6.1 se cumple con 10 de 10 inspectores. El 6.2 requiere la revisión del período y evidencias de aplicación de todos los casos priorizados. Una ausencia o un refuerzo pendiente permanece en borrador.</p></section>`;
  }
  function rowLabel(r){const p=r.payload;return r.type==='calibracion'?`${p.date} · ${p.sample}`:r.type==='reclamo'?`${p.code} · Día ${p.day}`:r.type==='periodo'?`${periodFor(p.programStart).start} a ${periodFor(p.programStart).end}`:`${name(p.personId)} · ${r.type==='resultado'?'Calibración '+(records.find(a=>a.id===p.calibrationId)?.payload.date||''):'Reclamo '+(records.find(a=>a.id===p.caseId)?.payload.code||'')}`;}
  function table(type){const rows=list(type);return `<section class="panel"><div class="section-title"><h2>${titles[type]}</h2><button class="button sm" data-com-new="${type}">+ Registrar</button></div>${type==='calibracion'?'<p class="note">Día 10 · 60 minutos previstos: presentación 10, evaluación independiente 20, comparación 20 y nueva comprobación 10. Coordinar relevos sin interrumpir controles.</p>':''}${rows.length?`<div class="tablewrap"><table><thead><tr><th>Registro</th><th>Estado</th><th>Seguimiento</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td style="white-space:normal">${enc(rowLabel(r))}</td><td>${r.payload.status==='done'?'Completo':'Borrador'}</td><td>${type==='calibracion'?complete('resultado','calibrationId',r.id).length+' resultados completos':type==='reclamo'?complete('aprendizaje','caseId',r.id).length+' ejercicios completos':enc(r.payload.result||r.payload.concordant||'')}</td><td><button class="button sm" data-com-edit="${enc(r.id)}">Ver / editar</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">Sin registros.</p>'}</section>`;}
  function view(){return '<div id="complianceRoot" class="stack"></div>';}
  function draw(){const el=host();if(!el)return;el.innerHTML=`${summary()}<section class="panel"><div class="row no-print"><button class="button" data-com-refresh>Actualizar registros</button><button class="button" data-com-export>Exportar CSV</button><button class="button" data-com-print>Imprimir / PDF</button></div><p class="note" role="status">${enc(error||(loading?'Cargando registros…':'Guardado en Firestore con control de revisiones.'))}</p></section><div id="complianceEditor"></div>${Object.keys(titles).map(table).join('')}`;el.onclick=click;el.oninput=()=>{dirty=!!editing;};if(editing)form();}
  async function activate(){if(!loaded&&!loading)await reload();else draw();}
  async function reload(){const {fs,db,user}=context();if(!user)return;loading=true;error='';draw();try{const q=await fs.getDocs(fs.collection(db,COLLECTION));if(context().user?.uid!==user.uid)return;records=q.docs.map(d=>({id:d.id,...d.data()}));loaded=true;}catch(e){error='No se pudieron cargar los registros: '+e.message;}finally{loading=false;draw();}}
  function options(type){if(type==='person')return people().map(p=>[p.id,p.name+(p.active===false?' (inactivo)':'')]);if(type==='calibration')return list('calibracion').map(r=>[r.id,rowLabel(r)]);if(type==='case')return list('reclamo').map(r=>[r.id,rowLabel(r)]);return {attendance:[['asistio','Asistió'],['no_asistio','No asistió'],['reprogramado','Reprogramado']],decision:[['aceptar','Aceptar'],['rechazar','Rechazar']],yesno:[['si','Sí'],['no','No']],day:[2,3,4,5,6,8,9].map(d=>[String(d),'Día '+d]),priority:[['alta','Alta'],['media','Media'],['baja','Baja']],result:[['demostrado','Aprendizaje demostrado'],['refuerzo','Requiere refuerzo']]}[type];}
  function form(){const target=document.getElementById('complianceEditor');if(!target||!editing)return;const r=editing,p=r.payload;target.innerHTML=`<section class="panel"><h2>${titles[r.type]}</h2><p class="note">Registra referencias de actas y evidencias en el archivo interno autorizado. Evita nombres y datos del cliente. Guarda como borrador para continuar después.</p><form id="complianceForm"><div class="form-grid">${SCHEMAS[r.type].map(([key,label,type='text'])=>{const opts=options(type);let input=opts?`<select name="${key}"><option value="">Selecciona</option>${opts.map(([v,l])=>`<option value="${enc(v)}" ${p[key]===v?'selected':''}>${enc(l)}</option>`).join('')}</select>`:type==='textarea'?`<textarea name="${key}" maxlength="3000">${enc(p[key])}</textarea>`:`<input name="${key}" type="${type}" value="${enc(p[key])}" ${type==='number'?'min="1" max="480" step="1"':'maxlength="3000"'}>`;return `<div class="form-field"><label for="com_${key}">${label}</label>${input.replace(/name="/,`id="com_${key}" name="`)}</div>`;}).join('')}</div><div class="row no-print" style="margin-top:18px"><button class="button primary" type="submit" value="draft">Guardar borrador</button><button class="button good" type="submit" value="done">Guardar completo</button><button class="button" type="button" data-com-cancel>Cancelar</button></div><p id="complianceSaveStatus" role="status" class="note"></p></form></section>`;target.querySelector('form').onsubmit=save;target.scrollIntoView({block:'start',behavior:'smooth'});}
  function canLeave(){return !busy&&(!dirty||confirm('Hay cambios sin guardar en calibración y reclamos. ¿Descartarlos?'));}
  function reset(){records=[];loaded=false;editing=null;dirty=false;error='';}
  async function click(e){const b=e.target.closest('button');if(!b||busy)return;
    if(b.hasAttribute('data-com-new')){if(!canLeave())return;const type=b.dataset.comNew;const existing=type==='periodo'?list(type)[0]:null;editing=existing?structuredClone(existing):{id:type==='periodo'?'cp_periodo_2026':'cp_'+crypto.randomUUID().replace(/-/g,''),type,rev:0,payload:Object.fromEntries(SCHEMAS[type].map(([k])=>[k,'']))};if(type==='calibracion'&&!editing.payload.minutes)editing.payload.minutes='60';dirty=false;form();}
    if(b.dataset.comEdit){if(!canLeave())return;editing=structuredClone(records.find(r=>r.id===b.dataset.comEdit));dirty=false;form();}
    if(b.hasAttribute('data-com-cancel')){if(!canLeave())return;editing=null;dirty=false;draw();}
    if(b.hasAttribute('data-com-refresh')){if(!canLeave())return;editing=null;dirty=false;await reload();}
    if(b.hasAttribute('data-com-print'))window.print();
    if(b.hasAttribute('data-com-export')){const cols=['Tipo','Registro','Estado','Campo','Valor'];const rows=[cols];for(const r of records)for(const [k,v]of Object.entries(r.payload))rows.push([titles[r.type],rowLabel(r),r.payload.status,k,v]);const csv=rows.map(row=>row.map(v=>'"'+String(v??'').replace(/^[=+@\-]/,"'$&").replace(/"/g,'""')+'"').join(';')).join('\r\n');const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='EXPALSA_Cumplimiento_6_1_6_2.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }
  async function save(e){e.preventDefault();if(busy||!editing)return;const form=e.target;const p=Object.fromEntries(new FormData(form));p.status=e.submitter?.value||'draft';const record=structuredClone(editing);try{
    validateRecord(record.type,p,records,people());
    if(['resultado','aprendizaje'].includes(record.type)){const key=record.type==='resultado'?'calibrationId':'caseId';if(records.some(r=>r.id!==record.id&&r.type===record.type&&r.payload.personId===p.personId&&r.payload[key]===p[key]))throw Error('Ya existe un registro para este inspector y este caso o acta. Edita ese registro.');}
    if(record.type==='periodo'&&list('reclamo').some(r=>{const range=periodFor(p.programStart);return r.payload.date<range.start||r.payload.date>range.end;}))throw Error('El período excluiría reclamos ya registrados. Conserva el período del programa.');
    busy=true;form.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=true);document.getElementById('complianceSaveStatus').textContent='Guardando…';
    if(record.rev===0&&['resultado','aprendizaje'].includes(record.type))record.id=(record.type==='resultado'?'cp_res_':'cp_apr_')+(p.calibrationId||p.caseId)+'_'+p.personId;
    const {fs,db,user}=context(),ref=fs.doc(db,COLLECTION,record.id);
    await fs.runTransaction(db,async tx=>{const snap=await tx.get(ref);if((snap.exists()?snap.data().rev:0)!==record.rev)throw Error('Este registro cambió en otra ventana. Actualiza los registros antes de editar.');const data={id:record.id,type:record.type,payload:p,rev:record.rev+1,createdAt:snap.exists()?snap.data().createdAt:fs.serverTimestamp(),updatedAt:fs.serverTimestamp(),updatedBy:user.uid};tx.set(ref,data);});
    editing=null;dirty=false;notify('Registro guardado en Firestore.');await reload();
  }catch(err){notify(err.message);const status=document.getElementById('complianceSaveStatus');if(status)status.textContent='No guardado: '+err.message;}finally{busy=false;if(form.isConnected)form.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=false);}}
  function leave(){editing=null;dirty=false;}
  window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});
  return {view,activate,canLeave,leave,reset};
}
