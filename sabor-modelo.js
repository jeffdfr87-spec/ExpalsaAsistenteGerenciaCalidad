export const SABORES=Object.freeze(['Normal','Tierra Leve','Tierra Medio','Tierra Fuerte','Fito Leve','Fito Medio','Fito Fuerte','Combustible Leve','Combustible Medio','Combustible Fuerte']);
export function intensidad(sabor){return sabor.endsWith('Fuerte')?3:sabor.endsWith('Medio')?2:sabor.endsWith('Leve')?1:0;}
export function ordenarSabores(componentes){return [...componentes].sort((a,b)=>intensidad(b.sabor)-intensidad(a.sabor)||b.porcentaje-a.porcentaje||a.sabor.localeCompare(b.sabor,'es'));}
export function fechaRecepcion(valor){
 const texto=String(valor||'').trim();if(!texto)return '';
 const partes=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
 const iso=partes?`${partes[3]}-${partes[2]}-${partes[1]}`:texto;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||!Number.isFinite(Date.parse(iso))||new Date(iso).toISOString().slice(0,10)!==iso)throw Error('Introduce una fecha válida en formato dd/mm/aaaa.');
 return iso;
}
export function mostrarFechaRecepcion(valor){const iso=fechaRecepcion(valor);return iso?new Intl.DateTimeFormat('es-EC',{dateStyle:'full',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z')):'Sin fecha de recepción';}
export function normalizarPerfil(filas){
 if(!Array.isArray(filas)||!filas.length)throw Error('Agrega al menos un sabor y su porcentaje.');
 const valores=new Map();
 for(const fila of filas){const sabor=fila?.sabor,porcentaje=Number(String(fila?.porcentaje??'').replace(',','.'));if(!SABORES.includes(sabor)||!Number.isFinite(porcentaje)||porcentaje<=0||porcentaje>100)throw Error('Selecciona un sabor válido y un porcentaje mayor que 0 y hasta 100.');valores.set(sabor,(valores.get(sabor)||0)+porcentaje);}
 const perfil=[...valores].map(([sabor,porcentaje])=>({sabor,porcentaje:Math.round(porcentaje*10000)/10000}));
 if(Math.abs(perfil.reduce((total,fila)=>total+fila.porcentaje,0)-100)>.00001)throw Error('Los porcentajes de los sabores deben sumar 100 %.');
 return ordenarSabores(perfil);
}
export function perfilAnterior(texto){
 if(typeof texto!=='string'||!texto.trim())return null;
 const normal=texto.trim().toLowerCase();if(normal==='normal')return [{sabor:'Normal',porcentaje:100}];
 const filas=[];const patron=/(normal|(?:tierra|fito|combustible)\s+(?:leve|medio|fuerte))\s*(\d+(?:[.,]\d+)?)\s*%/gi;
 for(const match of texto.matchAll(patron)){const sabor=SABORES.find(s=>s.toLowerCase()===match[1].replace(/\s+/g,' ').toLowerCase());filas.push({sabor,porcentaje:Number(match[2].replace(',','.'))});}
 try{return normalizarPerfil(filas);}catch{return null;}
}
export function perfilMateriaPrima(muestra){try{return normalizarPerfil(muestra.receiptFlavors);}catch{return perfilAnterior(muestra.sabor);}}
export function coincidenPerfiles(recepcion,contramuestra){const a=normalizarPerfil(recepcion).map(f=>f.sabor).sort(),b=normalizarPerfil(contramuestra).map(f=>f.sabor).sort();return a.length===b.length&&a.every((s,i)=>s===b[i]);}
export function textoPerfil(perfil){return ordenarSabores(perfil).map(f=>`${f.sabor} ${f.porcentaje}%`).join(' | ');}
