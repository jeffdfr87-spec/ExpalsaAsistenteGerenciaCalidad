import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compararContramuestra,indexarComparaciones,saboresContramuestra,normalizarPerfil,perfilMateriaPrima,normalizarObservaciones,clasificarPerfiles} from '../sabor-modelo.js';
import {createRequire} from 'node:module';
const servidor=createRequire(import.meta.url)('../functions-sabor/sensory.js');
const sample={id:'m',receiptFlavors:[{sabor:'Tierra Medio',porcentaje:100}]};
const people=['a','b','c'].map(uid=>({uid}));
const vote=(uid,observations,result='no_conforme')=>({sampleId:'m',inspectorUid:uid,observations,result});
test('tres coincidencias son 100%, independientemente de las categorías manuales antiguas',()=>{
 const r=indexarComparaciones([sample],people.map(p=>vote(p.uid,'Tierra Medio')),people).get('m');
 assert.equal(r.goodPercent,'100');assert.equal(r.bad,0);
});
test('el resultado mixto separa conformidades y parciales con porcentajes redondeados',()=>{
 const r=indexarComparaciones([sample],[vote('a','Tierra Medio'),vote('b','Tierra medio'),vote('c','Tierra leve','conforme')],people).get('m');
 assert.equal(r.goodPercent,'66.67');assert.equal(r.partialPercent,'33.33');assert.equal(r.badPercent,'0');assert.equal(r.review,0);
});

test('recepción con sabores ignora Normal y distingue intensidad de porcentajes',()=>{
 const baseline={id:'m',receiptFlavors:[{sabor:'Combustible Leve',porcentaje:60},{sabor:'Normal',porcentaje:40}]};
 assert.equal(compararContramuestra(baseline,vote('a','Combustible leve')).status,'conforme');
 assert.equal(compararContramuestra(baseline,vote('a','Combustible medio')).status,'parcial');
 assert.equal(compararContramuestra(baseline,vote('a','Tierra leve')).status,'discrepancia');
 assert.equal(compararContramuestra(baseline,vote('a','Le dio normal')).status,'discrepancia');
 assert.equal(clasificarPerfiles(baseline.receiptFlavors,[{sabor:'Combustible Leve',porcentaje:1},{sabor:'Normal',porcentaje:99}]),'conforme');
 assert.equal(clasificarPerfiles(baseline.receiptFlavors,[{sabor:'Tierra Leve',porcentaje:1},{sabor:'Normal',porcentaje:99}]),'discrepancia');
});

test('Normal 100 requiere Normal 100 y los alias antiguos se interpretan como Normal',()=>{
 const baseline={id:'m',receiptFlavors:[{sabor:'Normal',porcentaje:100}]};
 for(const text of ['Le dio normal','Le dio sabor normal','LE DIÓ NORMAL.','Normal','Normal 100%'])assert.equal(compararContramuestra(baseline,vote('a',text)).status,'conforme',text);
 assert.equal(compararContramuestra(baseline,{counterFlavors:[{sabor:'Normal',porcentaje:90},{sabor:'Tierra Leve',porcentaje:10}]}).status,'discrepancia');
 assert.equal(compararContramuestra(baseline,{counterFlavors:[{sabor:'Normal',porcentaje:90}]}).status,'discrepancia');
 assert.equal(compararContramuestra(baseline,vote('a','Normal 90%')).status,'discrepancia');
 assert.deepEqual(normalizarPerfil([{sabor:'Le dio normal',porcentaje:100}]),[{sabor:'Normal',porcentaje:100}]);
 assert.deepEqual(perfilMateriaPrima({sabor:'Le dio normal'}),[{sabor:'Normal',porcentaje:100}]);
 assert.equal(normalizarObservaciones('Le dio normal'),'Normal');assert.equal(normalizarObservaciones('No es normal'),'No es normal');
});

test('cliente y servidor clasifican todas las combinaciones con las mismas reglas',()=>{
 const profiles=[[{sabor:'Normal',porcentaje:100}],...[1,40,100].flatMap(p=>['Tierra Leve','Tierra Medio','Combustible Leve','Fito Fuerte'].map(s=>p===100?[{sabor:s,porcentaje:p}]:[{sabor:s,porcentaje:p},{sabor:'Normal',porcentaje:100-p}]))];
 for(const a of profiles)for(const b of profiles)assert.equal(clasificarPerfiles(a,b),servidor.clasificarPerfiles(a,b));
 const baseline={receiptFlavors:[{sabor:'Normal',porcentaje:100}]};
 for(const text of ['Le dio normal','Normal 90%','No es normal','Tierra leve'])assert.deepEqual(compararContramuestra(baseline,vote('a',text)),servidor.compararContramuestra(baseline,vote('a',text)));
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
