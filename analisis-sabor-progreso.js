const PREFIX='expalsa-sabor-progress-v1/';
export function createProgress({api,getState}){
 const timers=new Map(),pending=new Map(),chains=new Map(),locallySaved=new Map();
 const path=key=>PREFIX+getState().user?.uid+'/'+key;
 const status=text=>{const node=document.querySelector('#autosave-status');if(node)node.textContent=text;};
 function local(key){try{return JSON.parse(localStorage.getItem(path(key))||'null');}catch{return null;}}
 function transmit(key,draft){const old=chains.get(key)||Promise.resolve();const next=old.catch(()=>{}).then(()=>{if(getState().user?.uid!==draft.ownerUid||!getState().admin)throw Error('La cuenta cambió antes de guardar.');return api('saveProgress',{key,draft});});chains.set(key,next);next.then(()=>status('Guardado automáticamente'),()=>status(locallySaved.get(key)?'Guardado en este equipo':'No se pudo guardar el borrador'));return next;}
 function save(key,value){if(!getState().admin)return;const draft={...value,ownerUid:getState().user?.uid,updatedAtMs:Date.now()};try{localStorage.setItem(path(key),JSON.stringify(draft));locallySaved.set(key,true);status('Guardando…');}catch{locallySaved.set(key,false);status('Guardando en Firebase…');}pending.set(key,draft);clearTimeout(timers.get(key));timers.set(key,setTimeout(()=>{pending.delete(key);void transmit(key,draft).catch(()=>{});},600));return draft;}
 async function load(key){const stored=local(key);if(!getState().admin)return stored;try{const {draft}=await api('loadProgress',{key});const latest=(stored?.updatedAtMs||0)>(draft?.updatedAtMs||0)?stored:draft;if(latest)try{localStorage.setItem(path(key),JSON.stringify(latest));}catch{}return latest;}catch{return stored;}}
 function flush(){for(const [key,draft] of pending){clearTimeout(timers.get(key));void transmit(key,draft).catch(()=>{});}pending.clear();}
 document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});globalThis.addEventListener?.('pagehide',flush);
 return {save,load,local,flush};
}
let photosDatabase;
function database(){if(!globalThis.indexedDB)return Promise.resolve(null);return photosDatabase||=new Promise((resolve,reject)=>{const request=indexedDB.open('expalsa-sabor-borradores',1);request.onupgradeneeded=()=>request.result.createObjectStore('photos');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
export async function savePhotoDraft(uid,value){if(!uid)return;const db=await database();if(!db)throw Error('No está disponible el almacenamiento de fotografías pendientes.');await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').put(value,uid);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
export async function loadPhotoDraft(uid){const db=await database();if(!db||!uid)return null;return new Promise((resolve,reject)=>{const request=db.transaction('photos').objectStore('photos').get(uid);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);});}
