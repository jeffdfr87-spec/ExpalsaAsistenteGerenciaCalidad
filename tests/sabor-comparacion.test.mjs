import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compararContramuestra,indexarComparaciones,saboresContramuestra} from '../sabor-modelo.js';
const sample={id:'m',receiptFlavors:[{sabor:'Tierra Medio',porcentaje:100}]};
const people=['a','b','c'].map(uid=>({uid}));
const vote=(uid,observations,result='no_conforme')=>({sampleId:'m',inspectorUid:uid,observations,result});
test('tres coincidencias son 100%, independientemente de las categorías manuales antiguas',()=>{
 const r=indexarComparaciones([sample],people.map(p=>vote(p.uid,'Tierra Medio')),people).get('m');
 assert.equal(r.goodPercent,'100');assert.equal(r.bad,0);
});
test('el resultado mixto presenta ambos porcentajes redondeados a dos decimales',()=>{
 const r=indexarComparaciones([sample],[vote('a','Tierra Medio'),vote('b','Tierra medio'),vote('c','Tierra leve','conforme')],people).get('m');
 assert.equal(r.goodPercent,'66.67');assert.equal(r.badPercent,'33.33');assert.equal(r.review,0);
});
test('interpreta afirmaciones explícitas antiguas sin inventar porcentajes de composición',()=>{
 assert.deepEqual(saboresContramuestra(vote('a','Le dio sabor normal')),['Normal']);
 assert.deepEqual(saboresContramuestra(vote('a','Normal, reproceso')),['Normal']);
 assert.deepEqual(saboresContramuestra(vote('a','Combustible medio 30% | Combustible leve 40%')),['Combustible Leve','Combustible Medio']);
 assert.equal(compararContramuestra(sample,vote('a','Normal','conforme')).status,'discrepancia');
});
test('negaciones, alternativas y observaciones ambiguas requieren revisión',()=>{
 for(const text of ['No es normal','Sin Tierra Medio','Normal o Tierra Medio','Tal vez normal','Correcto','Tierra Medio y leve'])assert.equal(saboresContramuestra(vote('a',text)),null,text);
 const r=indexarComparaciones([sample],[vote('a','Correcto'),vote('b','Tierra Medio')],people).get('m');
 assert.equal(r.goodPercent,'50');assert.equal(r.reviewPercent,'50');assert.equal(r.pending,1);
});
test('pendientes no son discrepancias y cada inspector activo cuenta una sola vez',()=>{
 const r=indexarComparaciones([sample],[vote('a','Tierra Medio'),vote('a','Normal'),vote('removed','Normal')],people).get('m');
 assert.equal(r.total,1);assert.equal(r.goodPercent,'100');assert.equal(r.bad,0);assert.equal(r.pending,2);
});
test('las composiciones estructuradas prevalecen y los porcentajes pueden variar',()=>{
 const baseline={id:'m',receiptFlavors:[{sabor:'Tierra Medio',porcentaje:20},{sabor:'Normal',porcentaje:80}]};
 const v={counterFlavors:[{sabor:'Normal',porcentaje:30},{sabor:'Tierra Medio',porcentaje:70}],observations:'Tierra leve'};
 assert.equal(compararContramuestra(baseline,v).status,'conforme');
 assert.equal(compararContramuestra(sample,{counterFlavors:[{sabor:'Tierra Medio',porcentaje:90}],observations:'Tierra Medio'}).status,'revisar');
});
test('la interpretación no modifica las muestras ni los votos originales',()=>{
 const votes=[vote('a','Tierra Medio'),vote('b','Normal')],before=JSON.stringify({sample,votes});
 indexarComparaciones([sample],votes,people);assert.equal(JSON.stringify({sample,votes}),before);
});
