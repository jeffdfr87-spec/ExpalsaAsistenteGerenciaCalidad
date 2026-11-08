import {indexarComparaciones,porcentajeComparacion} from './sabor-modelo.js?v=20261107-partial-1';

export function resumenSesion(samples,evaluations,inspectors){
 const people=inspectors.filter(p=>!p.removing),index=indexarComparaciones(samples,evaluations,people);
 const totals={good:0,partial:0,bad:0,review:0,pending:0,total:0};
 for(const stats of index.values())for(const key of Object.keys(totals))totals[key]+=stats[key];
 const ranking=people.map(person=>{
  const row={...person,good:0,partial:0,bad:0,review:0,pending:0,total:0};
  for(const stats of index.values()){
   const entry=stats.byInspector.get(person.uid);
   if(!entry){row.pending++;continue;}
   row.total++;
   row[entry.status==='conforme'?'good':entry.status==='parcial'?'partial':entry.status==='discrepancia'?'bad':'review']++;
  }
  row.goodPercent=porcentajeComparacion(row.good,row.total);
  return row;
 }).sort((a,b)=>b.good-a.good||a.bad-b.bad||b.partial-a.partial||a.review-b.review||(a.name||a.email||a.uid).localeCompare(b.name||b.email||b.uid,'es')||a.uid.localeCompare(b.uid));
 return {index,totals,ranking,inspectors:people,goodPercent:porcentajeComparacion(totals.good,totals.total),partialPercent:porcentajeComparacion(totals.partial,totals.total),badPercent:porcentajeComparacion(totals.bad,totals.total)};
}

export async function cargarInformeSesion({sessionId,api,detailPage,media,onProgress=()=>{}}){
 await api('authorizeComparisonReport',{sessionId});media.assertReady();
 const first=await detailPage(sessionId),session=first.session;
 if(session.memberRemovalPending)throw Error('Termina la eliminación de inspectores antes de generar el PDF.');
 const samples=[...first.samples],evaluations=[...first.evaluations];let cursor=first.cursor;
 while(cursor){const page=await detailPage(sessionId,cursor,false);samples.push(...page.samples);evaluations.push(...page.evaluations);cursor=page.cursor;}
 const unique=[...new Map(samples.map(s=>[s.id,s])).values()].filter(s=>!s.deleted).sort((a,b)=>(a.sequence??a.createdAtMs??0)-(b.sequence??b.createdAtMs??0)||a.id.localeCompare(b.id));
 if(!unique.length)throw Error('No hay muestras para generar el informe.');
 if(unique.length!==session.sampleCount)throw Error('La sesión cambió mientras se cargaba. Actualiza e intenta de nuevo.');
 const inspectors=session.inspectors.filter(p=>!p.removing),photos=[];
 for(const [i,sample] of unique.entries()){
  onProgress(i+1,unique.length);
  photos.push({sampleId:sample.id,...await media.forReport({session,sample,inspectors})});
 }
 const fresh=(await api('detail',{sessionId})).session;
 const keys=['sampleCount','inspectorCount','evaluationCount','membershipRevision','updatedAt','status','memberRemovalPending'];
 if(keys.some(k=>fresh[k]!==session[k]))throw Error('La sesión cambió durante la preparación. Vuelve a generar el informe.');
 return {session,samples:unique,evaluations,inspectors,photos};
}
