import config from './firebase-config.js';

const V = '13.0.0';
const [appSdk, authSdk, dbSdk] = await Promise.all([
  import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
  import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
  import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`)
]);

const app = appSdk.initializeApp(config, 'mis-avisos');
const auth = authSdk.getAuth(app);
const db = dbSdk.getFirestore(app);
await authSdk.setPersistence(auth, authSdk.browserLocalPersistence);

const $ = id => document.getElementById(id);
const authScreen = $('authScreen');
const appScreen = $('appScreen');
const authForm = $('authForm');
let authMode = 'login';
let user = null;
let reminders = [];
let stopListening = null;
let filter = 'upcoming';
let editing = null;
let selectedPhoto = '';
let installPrompt = null;
let toastTimer;
const pendingNotices = new Set();

function errorText(error) {
  const known = {
    'auth/invalid-credential': 'El correo o la contraseña no coinciden.',
    'auth/user-not-found': 'No encontré una cuenta con ese correo.',
    'auth/wrong-password': 'El correo o la contraseña no coinciden.',
    'auth/email-already-in-use': 'Ya existe una cuenta con ese correo. Inicia sesión.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/invalid-email': 'Revisa el formato del correo.',
    'auth/too-many-requests': 'Hubo demasiados intentos. Prueba más tarde.',
    'permission-denied': 'Firestore rechazó el acceso. Verifica las reglas del proyecto.'
  };
  return known[error?.code] || (error?.message || 'No se pudo completar la acción.').slice(0, 240);
}
function showToast(message) {
  const box = $('toast'); box.textContent = message; box.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => box.classList.remove('show'), 3000);
}
function esc(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function dateTime(date, time) { return new Date(`${date}T${time}`); }
function dateLabel(value) {
  return new Intl.DateTimeFormat('es-EC', { day:'2-digit', month:'short' }).format(new Date(`${value}T12:00`)).replace('.', '');
}
function prettyDate(r) {
  const d = dateTime(r.date, r.time);
  return `${new Intl.DateTimeFormat('es-EC', { weekday:'short', day:'numeric', month:'short' }).format(d)} · ${r.time}`;
}
function setAuthMode(mode) {
  authMode = mode;
  $('authHeading').innerHTML = mode === 'login' ? 'Tus avisos,<br><em>siempre contigo.</em>' : 'Crea tu espacio<br><em>personal.</em>';
  $('authSubmit').textContent = mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta';
  $('authToggle').textContent = mode === 'login' ? '¿No tienes cuenta? Crear una' : 'Ya tengo cuenta. Iniciar sesión';
  $('password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('authMessage').textContent = '';
}
function reminderCollection() {
  return dbSdk.collection(db, 'recordatorios', user.uid, 'avisos');
}
function resetForm() {
  $('reminderForm').reset(); editing = null; selectedPhoto = '';
  const soon = new Date(Date.now() + 3600000);
  $('date').value = isoDate(soon); $('time').value = `${String(soon.getHours()).padStart(2,'0')}:00`;
  $('photoPreview').classList.add('hidden'); $('photoPreview').innerHTML = '';
  $('photoLabel').textContent = 'Agregar foto'; $('saveBtn').innerHTML = 'Guardar recordatorio <span>↗</span>';
}
function render() {
  const shown = reminders.filter(r => filter === 'done' ? r.done : !r.done);
  $('count').textContent = String(shown.length);
  $('reminderList').innerHTML = shown.map(r => `
    <article class="card ${r.done ? 'done' : ''}">
      <div class="date-chip"><b>${esc(dateLabel(r.date).split(' ')[0])}</b><span>${esc(dateLabel(r.date).split(' ').slice(1).join(' '))}</span></div>
      <div><h3>${esc(r.title)}</h3><div class="card-meta"><span>◷ ${esc(prettyDate(r))}</span>${r.place ? `<span>⌖ ${esc(r.place)}</span>` : ''}</div>${r.note ? `<p class="card-note">${esc(r.note)}</p>` : ''}${r.photoDataUrl ? `<img class="card-photo" src="${r.photoDataUrl}" alt="Foto adjunta">` : ''}</div>
      <div class="card-actions"><button data-action="edit" data-id="${esc(r.id)}" aria-label="Editar">✎</button><button data-action="done" data-id="${esc(r.id)}" aria-label="${r.done ? 'Reactivar' : 'Marcar como hecho'}">${r.done ? '↶' : '✓'}</button><button data-action="delete" data-id="${esc(r.id)}" aria-label="Eliminar">×</button></div>
    </article>`).join('');
  $('emptyState').classList.toggle('hidden', shown.length > 0);
  $('emptyState').innerHTML = filter === 'done'
    ? '<span class="empty-icon">✓</span><strong>Aún no hay avisos hechos.</strong><p>Cuando completes uno, aparecerá aquí.</p>'
    : '<span class="empty-icon">✳</span><strong>Tu mente puede descansar.</strong><p>Agrega tu primer aviso y aparecerá aquí.</p>';
}
async function compressedPhoto(file) {
  if (!file.type.startsWith('image/')) throw new Error('El archivo seleccionado no es una imagen.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.72));
  if (!blob || blob.size > 300000) throw new Error('La foto no pudo comprimirse lo suficiente; elige otra imagen.');
  return await new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
async function checkDueNotices() {
  if (!user || !('Notification' in window) || Notification.permission !== 'granted') return;
  for (const r of reminders) {
    if (r.done || r.notified || pendingNotices.has(r.id) || dateTime(r.date, r.time).getTime() > Date.now()) continue;
    pendingNotices.add(r.id);
    try {
      new Notification('Mis Avisos', { body:r.title, icon:'/recordatorios/icon.svg', tag:r.id });
      await dbSdk.updateDoc(dbSdk.doc(db, 'recordatorios', user.uid, 'avisos', r.id), { notified:true, updatedAt:dbSdk.serverTimestamp() });
    } catch (error) { console.warn('No se pudo enviar el aviso:', error); }
  }
}

authForm.addEventListener('submit', async event => {
  event.preventDefault(); $('authSubmit').disabled = true; $('authMessage').textContent = 'Conectando…';
  try {
    const email = $('email').value.trim(); const password = $('password').value;
    if (authMode === 'login') await authSdk.signInWithEmailAndPassword(auth, email, password);
    else await authSdk.createUserWithEmailAndPassword(auth, email, password);
  } catch (error) { $('authMessage').textContent = errorText(error); }
  finally { $('authSubmit').disabled = false; }
});
$('authToggle').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'register' : 'login'));
authSdk.onAuthStateChanged(auth, nextUser => {
  user = nextUser;
  if (stopListening) { stopListening(); stopListening = null; }
  reminders = []; pendingNotices.clear();
  authScreen.hidden = Boolean(user); appScreen.hidden = !user;
  if (!user) return;
  $('todayLabel').textContent = new Intl.DateTimeFormat('es-EC',{weekday:'long',day:'numeric',month:'long'}).format(new Date()).toLocaleUpperCase('es-EC');
  const q = dbSdk.query(reminderCollection(), dbSdk.orderBy('dueAt', 'asc'));
  stopListening = dbSdk.onSnapshot(q, snapshot => {
    reminders = snapshot.docs.map(d => ({ id:d.id, ...d.data() }));
    render(); checkDueNotices();
  }, error => showToast(errorText(error)));
  resetForm();
});
$('logoutBtn').addEventListener('click', async () => { await authSdk.signOut(auth); });

$('reminderForm').addEventListener('submit', async event => {
  event.preventDefault(); if (!user) return;
  const due = dateTime($('date').value, $('time').value);
  if (!Number.isFinite(due.getTime()) || due.getTime() < Date.now() - 60000) { showToast('Elige una fecha y hora futuras.'); return; }
  const previous = editing;
  const record = {
    title:$('title').value.trim(), date:$('date').value, time:$('time').value,
    place:$('place').value.trim(), note:$('note').value.trim(),
    photoDataUrl:selectedPhoto || previous?.photoDataUrl || '',
    dueAt:dbSdk.Timestamp.fromDate(due), done:previous?.done || false, notified:false,
    updatedAt:dbSdk.serverTimestamp()
  };
  try {
    if (previous) await dbSdk.updateDoc(dbSdk.doc(db,'recordatorios',user.uid,'avisos',previous.id), record);
    else await dbSdk.addDoc(reminderCollection(), { ...record, createdAt:dbSdk.serverTimestamp() });
    resetForm(); showToast(previous ? 'Cambios guardados.' : 'Recordatorio guardado.');
  } catch (error) { showToast(errorText(error)); }
});
$('photo').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    selectedPhoto = await compressedPhoto(file);
    $('photoPreview').innerHTML = `<img src="${selectedPhoto}" alt="Vista previa de la foto">`;
    $('photoPreview').classList.remove('hidden'); $('photoLabel').textContent='Cambiar foto';
  } catch (error) { showToast(error.message); event.target.value=''; }
});
$('reminderList').addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]'); if (!button || !user) return;
  const item = reminders.find(r => r.id === button.dataset.id); if (!item) return;
  const ref = dbSdk.doc(db,'recordatorios',user.uid,'avisos',item.id);
  try {
    if (button.dataset.action === 'done') {
      await dbSdk.updateDoc(ref,{done:!item.done,updatedAt:dbSdk.serverTimestamp()});
      showToast(item.done ? 'Aviso reactivado.' : '¡Listo! Aviso marcado como hecho.');
    } else if (button.dataset.action === 'delete') {
      await dbSdk.deleteDoc(ref); showToast('Recordatorio eliminado.');
    } else if (button.dataset.action === 'edit') {
      editing = item; selectedPhoto = '';
      $('title').value=item.title; $('date').value=item.date; $('time').value=item.time; $('place').value=item.place||''; $('note').value=item.note||'';
      if (item.photoDataUrl) { $('photoPreview').innerHTML=`<img src="${item.photoDataUrl}" alt="Foto adjunta">`; $('photoPreview').classList.remove('hidden'); $('photoLabel').textContent='Cambiar foto'; }
      $('saveBtn').innerHTML='Guardar cambios <span>↗</span>'; $('title').focus(); window.scrollTo({top:0,behavior:'smooth'});
    }
  } catch (error) { showToast(errorText(error)); }
});
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  filter=button.dataset.filter; document.querySelectorAll('.filter').forEach(b=>b.classList.toggle('active',b===button)); render();
}));
$('locateBtn').addEventListener('click', () => {
  if (!navigator.geolocation) { showToast('Este navegador no permite obtener ubicación.'); return; }
  $('locateBtn').textContent='…';
  navigator.geolocation.getCurrentPosition(pos=>{
    $('place').value=`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
    $('locateBtn').textContent='⌖'; showToast('Ubicación agregada como coordenadas.');
  },()=>{ $('locateBtn').textContent='⌖'; showToast('No pude obtener la ubicación. Revisa el permiso del navegador.'); },{enableHighAccuracy:true,timeout:10000});
});
$('voiceBtn').addEventListener('click', () => {
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  if (!Speech) { showToast('Prueba el micrófono del teclado para dictar.'); return; }
  const recognition=new Speech(); recognition.lang='es-EC'; recognition.interimResults=false;
  $('voiceBtn').innerHTML='<span>●</span> Escuchando…';
  recognition.onresult=e=>{const text=e.results[0][0].transcript;$('title').value=$('title').value?`${$('title').value} ${text}`:text;};
  recognition.onerror=()=>showToast('No se pudo escuchar. Revisa el permiso del micrófono.');
  recognition.onend=()=>{$('voiceBtn').innerHTML='<span>●</span> Dictar';};
  recognition.start();
});
$('notifyBtn').addEventListener('click', async () => {
  if (!('Notification' in window)) { showToast('Este navegador no admite notificaciones.'); return; }
  const permission=await Notification.requestPermission();
  showToast(permission==='granted'?'Avisos activados. Mantén la app abierta para recibirlos.':'Puedes activarlos desde los ajustes del navegador.');
  checkDueNotices();
});
$('installBtn').addEventListener('click', async () => {
  if (!installPrompt) { showToast('En Safari: toca Compartir y luego “Añadir a pantalla de inicio”.'); return; }
  installPrompt.prompt(); await installPrompt.userChoice; installPrompt=null; $('installBtn').classList.add('hidden');
});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('installBtn').classList.remove('hidden');});
$('addNav').addEventListener('click',()=>{$('title').focus();window.scrollTo({top:0,behavior:'smooth'});});
$('settingsNav').addEventListener('click',()=>$('notifyBtn').click());
setInterval(checkDueNotices,30000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/recordatorios/sw.js').catch(()=>{});
resetForm();

