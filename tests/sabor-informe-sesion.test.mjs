import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resumenSesion,cargarInformeSesion} from '../sabor-informe-sesion.js';
const normal=[{sabor:'Normal',porcentaje:100}],baseline=[{sabor:'Combustible Leve',porcentaje:60},{sabor:'Normal',porcentaje:40}];
const samples=Array.from({length:4},(_,i)=>({id:'m'+i,sequence:i,lote:'L'+i,receiptFlavors:baseline}));
const people=[{uid:'a',name:'Ana'},{uid:'b',name:'Beatriz'},{uid:'c',name:'Carla'},{uid:'removed',name:'Retirada',removing:true}];
const vote=(sample,uid,sabor)=>({sampleId:sample.id,inspectorUid:uid,counterFlavors:[{sabor,porcentaje:100}]});
test('ranking separa parcial, discrepancia, revisión y pendientes y desempata con menos discrepancias',()=>{
 const votes=[vote(samples[0],'a','Combustible Leve'),vote(samples[1],'a','Tierra Leve'),vote(samples[2],'a','Combustible Medio'),vote(samples[0],'b','Combustible Leve'),vote(samples[1],'b','Combustible Medio'),vote(samples[2],'b','Combustible Medio'),vote(samples[0],'c','Combustible Leve'),vote(samples[1],'c','Combustible Leve'),{sampleId:'m2',inspectorUid:'c',observations:'No es normal'},vote(samples[0],'removed','Normal')];
 votes.push(votes[0]);
 const r=resumenSesion(samples,votes,people);
 assert.deepEqual(r.ranking.map(p=>p.uid),['c','b','a']);assert.equal(r.totals.total,9);assert.equal(r.totals.good,4);assert.equal(r.totals.partial,3);assert.equal(r.totals.bad,1);assert.equal(r.totals.review,1);assert.equal(r.totals.pending,3);assert.equal(r.ranking[0].goodPercent,'66.67');
 assert.equal(r.totals.good+r.totals.partial+r.totals.bad+r.totals.review,r.totals.total);
});
test('informe recorre todas las páginas, autoriza consulta y carga fotos de todas las muestras',async()=>{
 const session={id:'s1',sampleCount:4,inspectorCount:3,evaluationCount:0,inspectors:people.slice(0,3),status:'closed'},calls=[],photos=[];
 const api=async(action)=>{calls.push(action);return action==='detail'?{session}:{allowed:true};};
 const detailPage=async(id,cursor,roster)=>cursor?{session,samples:samples.slice(2),evaluations:[],cursor:null}:{session,samples:samples.slice(0,2),evaluations:[],cursor:'next'};
 const media={assertReady(){},async forReport({sample}){photos.push(sample.id);return {samplePhotos:[],inspectorPhotos:[]};}};
 const result=await cargarInformeSesion({sessionId:'s1',api,detailPage,media});
 assert.equal(result.samples.length,4);assert.deepEqual(photos,['m0','m1','m2','m3']);assert.equal(calls[0],'authorizeComparisonReport');assert.equal(result.photos.length,4);
});
test('no genera un informe con fotos pendientes, permiso denegado o sesión modificada',async()=>{
 const session={id:'s1',sampleCount:1,inspectorCount:1,evaluationCount:0,inspectors:people.slice(0,1),status:'open'};
 const opts={sessionId:'s1',detailPage:async()=>({session,samples:[samples[0]],evaluations:[],cursor:null}),api:async action=>action==='detail'?{session:{...session,evaluationCount:1}}:{allowed:true},media:{assertReady(){},async forReport(){return {};}}};
 await assert.rejects(cargarInformeSesion(opts),/cambió/);
 await assert.rejects(cargarInformeSesion({...opts,api:async()=>{throw Error('Permiso denegado');}}),/Permiso denegado/);
 await assert.rejects(cargarInformeSesion({...opts,media:{assertReady(){},async forReport(){throw Error('Fotos pendientes');}}}),/Fotos pendientes/);
});
