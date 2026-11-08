import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resumenSesion,cargarInformeSesion} from '../sabor-informe-sesion.js';
import {createFlavorSessionReport} from '../analisis-sabor-sesion-pdf.js';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),{jsPDF}=require('../vendor/jspdf.umd.min.js'),{autoTable}=require('../vendor/jspdf.plugin.autotable.min.js');
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

test('PDF compacto coloca ranking en página 2, dos muestras por página y normaliza la nota indicada',()=>{
 const evaluated=samples.flatMap(sample=>people.slice(0,3).map(p=>({sampleId:sample.id,inspectorUid:p.uid,observations:'Le dio combustible leve'}))),before=JSON.stringify(evaluated),tables=[];
 const wrapped=(pdf,opts)=>{tables.push(opts);return autoTable(pdf,opts);};
 const {pdf}=createFlavorSessionReport({jsPDF,autoTable:wrapped,logoData:'data:image/png;base64,'+readFileSync(new URL('../logoexpalsa.png',import.meta.url)).toString('base64'),session:{name:'Prueba',date:'2026-11-07',status:'closed'},samples:samples.map((s,i)=>({...s,blindLetter:String.fromCharCode(65+i)})),inspectors:people,evaluations:evaluated});
 assert.equal(pdf.getNumberOfPages(),4);
 const contents=page=>pdf.internal.pages[page].join('\n');
 assert.match(contents(2),/Discrepancias y conformidades por inspector/);assert.match(contents(3),/Muestra A/);assert.match(contents(3),/Muestra B/);assert.doesNotMatch(contents(3),/Muestra C/);assert.match(contents(4),/Muestra C/);assert.match(contents(4),/Muestra D/);
 const detail=tables.find(t=>t.head[0][0]==='INSPECTOR / MUESTRA A');assert.equal(detail.body[0][2],'Combustible leve');assert.equal(JSON.stringify(evaluated),before);
});
