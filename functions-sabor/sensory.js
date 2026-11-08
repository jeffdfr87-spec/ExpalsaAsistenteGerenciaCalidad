const SABORES=Object.freeze(['Normal','Tierra Leve','Tierra Medio','Tierra Fuerte','Fito Leve','Fito Medio','Fito Fuerte','Combustible Leve','Combustible Medio','Combustible Fuerte']);
const textoCanonico=valor=>String(valor??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
function esNormalAntiguo(valor){return /^(?:le dio (?:sabor )?|sabor )?normal[.!]?$/.test(textoCanonico(valor));}
function normalizarSabor(valor){if(esNormalAntiguo(valor))return 'Normal';const texto=textoCanonico(valor);return SABORES.find(s=>textoCanonico(s)===texto)||valor;}
function normalizarObservaciones(valor){return esNormalAntiguo(valor)?'Normal':String(valor??'');}
function intensidad(sabor){return sabor.endsWith('Fuerte')?3:sabor.endsWith('Medio')?2:sabor.endsWith('Leve')?1:0;}
function ordenarSabores(componentes){return [...componentes].sort((a,b)=>intensidad(b.sabor)-intensidad(a.sabor)||b.porcentaje-a.porcentaje||a.sabor.localeCompare(b.sabor,'es'));}
function fechaRecepcion(valor){
 const texto=String(valor||'').trim();if(!texto)return '';
 const partes=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
 const iso=partes?`${partes[3]}-${partes[2]}-${partes[1]}`:texto;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||!Number.isFinite(Date.parse(iso))||new Date(iso).toISOString().slice(0,10)!==iso)throw Error('Introduce una fecha válida en formato dd/mm/aaaa.');
 return iso;
}
function mostrarFechaRecepcion(valor){const iso=fechaRecepcion(valor);return iso?new Intl.DateTimeFormat('es-EC',{dateStyle:'full',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z')):'Sin fecha de recepción';}
function normalizarPerfil(filas){
 if(!Array.isArray(filas)||!filas.length)throw Error('Agrega al menos un sabor y su porcentaje.');
 const valores=new Map();
 for(const fila of filas){const sabor=normalizarSabor(fila?.sabor),porcentaje=Number(String(fila?.porcentaje??'').replace(',','.'));if(!SABORES.includes(sabor)||!Number.isFinite(porcentaje)||porcentaje<=0||porcentaje>100)throw Error('Selecciona un sabor válido y un porcentaje mayor que 0 y hasta 100.');valores.set(sabor,(valores.get(sabor)||0)+porcentaje);}
 const perfil=[...valores].map(([sabor,porcentaje])=>({sabor,porcentaje:Math.round(porcentaje*10000)/10000}));
 if(Math.abs(perfil.reduce((total,fila)=>total+fila.porcentaje,0)-100)>.00001)throw Error('Los porcentajes de los sabores deben sumar 100 %.');
 return ordenarSabores(perfil);
}
function completarNormal(filas){
 if(!Array.isArray(filas)||!filas.length)return normalizarPerfil(filas);
 // Validate every submitted component before filling the unclassified remainder.
 const total=filas.reduce((n,f)=>n+Number(String(f?.porcentaje??'').replace(',','.')),0);
 if(!Number.isFinite(total)||total<=0||total>100)return normalizarPerfil(filas);
 const resto=Math.round((100-total)*10000)/10000;
 return normalizarPerfil(resto>0?[...filas,{sabor:'Normal',porcentaje:resto}]:filas);
}
function perfilAnterior(texto){
 if(typeof texto!=='string'||!texto.trim())return null;
 if(esNormalAntiguo(texto))return [{sabor:'Normal',porcentaje:100}];
 const filas=[];const patron=/(normal|(?:tierra|fito|combustible)\s+(?:leve|medio|fuerte))\s*(\d+(?:[.,]\d+)?)\s*%/gi;
 for(const match of texto.matchAll(patron)){const sabor=SABORES.find(s=>s.toLowerCase()===match[1].replace(/\s+/g,' ').toLowerCase());filas.push({sabor,porcentaje:Number(match[2].replace(',','.'))});}
 try{return normalizarPerfil(filas);}catch{return null;}
}
function perfilMateriaPrima(muestra){try{return normalizarPerfil(muestra.receiptFlavors);}catch{return perfilAnterior(muestra.sabor);}}
function compararSabores(esperados,actuales){
 const expected=[...new Set(esperados.map(normalizarSabor))],actual=[...new Set(actuales.map(normalizarSabor))];
 if(expected.every(s=>s==='Normal'))return actual.length===1&&actual[0]==='Normal'?'conforme':'discrepancia';
 const a=expected.filter(s=>s!=='Normal').sort(),b=actual.filter(s=>s!=='Normal').sort();
 if(a.length===b.length&&a.every((s,i)=>s===b[i]))return 'conforme';
 const base=s=>s.replace(/\s+(Leve|Medio|Fuerte)$/,'');
 const familiasA=[...new Set(a.map(base))].sort(),familiasB=[...new Set(b.map(base))].sort();
 return familiasA.length===familiasB.length&&familiasA.every((s,i)=>s===familiasB[i])?'parcial':'discrepancia';
}
function clasificarPerfiles(recepcion,contramuestra){return compararSabores(normalizarPerfil(recepcion).map(f=>f.sabor),normalizarPerfil(contramuestra).map(f=>f.sabor));}
function coincidenPerfiles(recepcion,contramuestra){return clasificarPerfiles(recepcion,contramuestra)==='conforme';}
function textoPerfil(perfil){return ordenarSabores(perfil).map(f=>`${f.sabor} ${f.porcentaje}%`).join(' | ');}
// Interpret only explicit flavor statements in old observations. Never infer from the old manual flag.
function saboresContramuestra(voto){
 if(!voto)return null;
 if(voto.counterFlavors!==undefined){try{return normalizarPerfil(voto.counterFlavors).map(f=>f.sabor);}catch{return null;}}
 let texto=textoCanonico(normalizarObservaciones(voto.observations));
 const sabores=[];
 texto=texto.replace(/\b(normal|(?:tierra|fito|combustible)\s+(?:leve|medio|fuerte))\b(?:\s*\d+(?:[.,]\d+)?\s*%)?/g,(match,label)=>{const sabor=SABORES.find(s=>s.toLowerCase()===label.replace(/\s+/g,' '));if(sabor)sabores.push(sabor);return ' ';});
 texto=texto.replace(/\b(?:le dio|sabor|reproceso)\b/g,' ').replace(/[\s,;|/!.()+\-]+/g,' ').replace(/\by\b/g,' ').trim();
 return sabores.length&&!texto?[...new Set(sabores)].sort():null;
}
function compararContramuestra(muestra,voto){
 if(!voto)return {status:'pendiente',label:'Pendiente',sabores:null};
 const recepcion=perfilMateriaPrima(muestra),sabores=saboresContramuestra(voto);
 if(recepcion?.every(f=>f.sabor==='Normal')){
  const filas=voto.counterFlavors;
  const declarado=Array.isArray(filas)&&filas.length&&filas.every(f=>normalizarSabor(f.sabor)==='Normal')?filas.reduce((n,f)=>n+Number(String(f.porcentaje).replace(',','.')),0):null;
  const texto=filas===undefined?/^(?:le dio (?:sabor )?|sabor )?normal\s*(\d+(?:[.,]\d+)?)\s*%[.!]?$/.exec(textoCanonico(voto.observations)):null;
  const porcentaje=texto?Number(texto[1].replace(',','.')):declarado;
  if(porcentaje!==null&&Number.isFinite(porcentaje)&&porcentaje>0&&porcentaje<100)return {status:'discrepancia',label:'Discrepancia',sabores:['Normal']};
 }
 if(!recepcion||!sabores)return {status:'revisar',label:'Por revisar',sabores};
 const esperados=recepcion.map(f=>f.sabor).sort(),actuales=[...sabores].sort();
 const status=compararSabores(esperados,actuales);
 return {status,label:status==='conforme'?'Conforme':status==='parcial'?'Conformidad parcial':'Discrepancia',sabores};
}
function porcentajeComparacion(cantidad,total){return total?(cantidad*100/total).toFixed(2).replace(/\.00$/,''):'0';}
function indexarComparaciones(muestras,evaluaciones,inspectores){
 const index=new Map(muestras.map(m=>[m.id,{sample:m,votes:[],good:0,partial:0,bad:0,review:0,byInspector:new Map()}]));
 const asignados=Array.isArray(inspectores)?new Set(inspectores.filter(p=>!p.removing).map(p=>p.uid)):null;
 for(const voto of evaluaciones){const stats=index.get(voto.sampleId);if(!stats||(asignados&&!asignados.has(voto.inspectorUid))||stats.byInspector.has(voto.inspectorUid))continue;
  const comparison=compararContramuestra(stats.sample,voto);stats.byInspector.set(voto.inspectorUid,{vote:voto,...comparison});stats.votes.push(voto);if(comparison.status==='conforme')stats.good++;else if(comparison.status==='parcial')stats.partial++;else if(comparison.status==='discrepancia')stats.bad++;else stats.review++;
 }
 for(const stats of index.values()){stats.total=stats.votes.length;stats.pending=Math.max(0,(asignados?.size||0)-stats.total);stats.goodPercent=porcentajeComparacion(stats.good,stats.total);stats.partialPercent=porcentajeComparacion(stats.partial,stats.total);stats.badPercent=porcentajeComparacion(stats.bad,stats.total);stats.reviewPercent=porcentajeComparacion(stats.review,stats.total);}
 return index;
}

module.exports={SABORES,esNormalAntiguo,normalizarSabor,normalizarObservaciones,intensidad,ordenarSabores,fechaRecepcion,mostrarFechaRecepcion,normalizarPerfil,completarNormal,perfilAnterior,perfilMateriaPrima,compararSabores,clasificarPerfiles,coincidenPerfiles,textoPerfil,saboresContramuestra,compararContramuestra,porcentajeComparacion,indexarComparaciones};
