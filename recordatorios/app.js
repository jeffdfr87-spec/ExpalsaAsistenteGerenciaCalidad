const $ = id => document.getElementById(id);
const DB_NAME = 'oliver-local';
const STORE_NAME = 'reminders';

let reminders = [];
let filter = 'upcoming';
let editing = null;
let selectedPhoto = '';
let installPrompt = null;
let toastTimer;
const pendingNotices = new Set();

const database = new Promise((resolve, reject) => {
  if (!('indexedDB' in window)) {
    reject(new Error('Este navegador no admite almacenamiento local para Oliver.'));
    return;
  }
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
      const store = request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('dueAt', 'dueAt');
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('No se pudo abrir el almacenamiento local.'));
  request.onblocked = () => reject(new Error('Cierra otras pestañas de Oliver y vuelve a intentarlo.'));
});

function storageRequest(mode, operation) {
  return database.then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const request = operation(tx.objectStore(STORE_NAME));
    let result;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error || new Error('No se pudo guardar el aviso en este dispositivo.'));
    tx.oncomplete = () => resolve(result);
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('No se pudo guardar el aviso en este dispositivo.'));
  }));
}

function showToast(message) {
  const box = $('toast');
  box.textContent = message;
  box.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('show'), 3500);
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
function prettyDate(reminder) {
  const d = dateTime(reminder.date, reminder.time);
  return `${new Intl.DateTimeFormat('es-EC', { weekday:'short', day:'numeric', month:'short' }).format(d)} · ${reminder.time}`;
}
function resetForm() {
  $('reminderForm').reset();
  editing = null;
  selectedPhoto = '';
  const soon = new Date(Date.now() + 3600000);
  $('date').value = isoDate(soon);
  $('time').value = `${String(soon.getHours()).padStart(2,'0')}:00`;
  $('photoPreview').classList.add('hidden');
  $('photoPreview').innerHTML = '';
  $('photoLabel').textContent = 'Agregar foto';
  $('saveBtn').innerHTML = 'Guardar recordatorio <span>↗</span>';
}
function render() {
  const shown = reminders
    .filter(r => filter === 'done' ? r.done : !r.done)
    .sort((a, b) => a.dueAt - b.dueAt);
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
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
async function checkDueNotices() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  for (const reminder of reminders) {
    if (reminder.done || reminder.notified || pendingNotices.has(reminder.id) || reminder.dueAt > Date.now()) continue;
    pendingNotices.add(reminder.id);
    try {
      new Notification('Oliver', { body:reminder.title, icon:'/icon.svg', tag:reminder.id });
      reminder.notified = true;
      reminder.updatedAt = Date.now();
      await storageRequest('readwrite', store => store.put(reminder));
    } catch (error) {
      console.warn('No se pudo enviar el aviso:', error);
    }
  }
}

document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  filter = button.dataset.filter;
  document.querySelectorAll('.filter').forEach(b => b.classList.toggle('active', b === button));
  render();
}));

$('reminderForm').addEventListener('submit', async event => {
  event.preventDefault();
  const due = dateTime($('date').value, $('time').value);
  if (!Number.isFinite(due.getTime()) || due.getTime() < Date.now() - 60000) {
    showToast('Elige una fecha y hora futuras.');
    return;
  }
  const previous = editing;
  const now = Date.now();
  const reminder = {
    id: previous?.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`),
    title: $('title').value.trim(),
    date: $('date').value,
    time: $('time').value,
    place: $('place').value.trim(),
    note: $('note').value.trim(),
    photoDataUrl: selectedPhoto || previous?.photoDataUrl || '',
    dueAt: due.getTime(),
    done: previous?.done || false,
    notified: false,
    createdAt: previous?.createdAt || now,
    updatedAt: now
  };
  $('saveBtn').disabled = true;
  try {
    await storageRequest('readwrite', store => store.put(reminder));
    const index = reminders.findIndex(r => r.id === reminder.id);
    if (index < 0) reminders.push(reminder); else reminders[index] = reminder;
    render();
    resetForm();
    showToast(previous ? 'Cambios guardados en este teléfono.' : 'Aviso guardado en este teléfono.');
  } catch (error) {
    showToast(error.message || 'No se pudo guardar el aviso en este dispositivo.');
  } finally {
    $('saveBtn').disabled = false;
  }
});

$('photo').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    selectedPhoto = await compressedPhoto(file);
    $('photoPreview').innerHTML = `<img src="${selectedPhoto}" alt="Vista previa de la foto">`;
    $('photoPreview').classList.remove('hidden');
    $('photoLabel').textContent = 'Cambiar foto';
  } catch (error) {
    showToast(error.message);
    event.target.value = '';
  }
});

$('reminderList').addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const reminder = reminders.find(r => r.id === button.dataset.id);
  if (!reminder) return;
  try {
    if (button.dataset.action === 'done') {
      reminder.done = !reminder.done;
      reminder.notified = false;
      reminder.updatedAt = Date.now();
      await storageRequest('readwrite', store => store.put(reminder));
      showToast(reminder.done ? '¡Listo! Aviso marcado como hecho.' : 'Aviso reactivado.');
      render();
    } else if (button.dataset.action === 'delete') {
      await storageRequest('readwrite', store => store.delete(reminder.id));
      reminders = reminders.filter(r => r.id !== reminder.id);
      render();
      showToast('Aviso eliminado de este teléfono.');
    } else if (button.dataset.action === 'edit') {
      editing = reminder;
      selectedPhoto = '';
      $('title').value = reminder.title;
      $('date').value = reminder.date;
      $('time').value = reminder.time;
      $('place').value = reminder.place || '';
      $('note').value = reminder.note || '';
      if (reminder.photoDataUrl) {
        $('photoPreview').innerHTML = `<img src="${reminder.photoDataUrl}" alt="Foto adjunta">`;
        $('photoPreview').classList.remove('hidden');
        $('photoLabel').textContent = 'Cambiar foto';
      }
      $('saveBtn').innerHTML = 'Guardar cambios <span>↗</span>';
      $('title').focus();
      window.scrollTo({ top:0, behavior:'smooth' });
    }
  } catch (error) {
    showToast(error.message || 'No se pudo actualizar el aviso.');
  }
});

$('locateBtn').addEventListener('click', () => {
  if (!navigator.geolocation) {
    showToast('Este navegador no permite obtener ubicación.');
    return;
  }
  $('locateBtn').textContent = '…';
  navigator.geolocation.getCurrentPosition(pos => {
    $('place').value = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
    $('locateBtn').textContent = '⌖';
    showToast('Ubicación agregada como coordenadas.');
  }, () => {
    $('locateBtn').textContent = '⌖';
    showToast('No pude obtener la ubicación. Revisa el permiso del navegador.');
  }, { enableHighAccuracy:true, timeout:10000 });
});

$('voiceBtn').addEventListener('click', () => {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) {
    showToast('Prueba el micrófono del teclado para dictar.');
    return;
  }
  const recognition = new Speech();
  recognition.lang = 'es-EC';
  recognition.interimResults = false;
  $('voiceBtn').innerHTML = '<span>●</span> Escuchando…';
  recognition.onresult = e => {
    const text = e.results[0][0].transcript;
    $('title').value = $('title').value ? `${$('title').value} ${text}` : text;
  };
  recognition.onerror = () => showToast('No se pudo escuchar. Revisa el permiso del micrófono.');
  recognition.onend = () => { $('voiceBtn').innerHTML = '<span>●</span> Dictar'; };
  recognition.start();
});

$('notifyBtn').addEventListener('click', async () => {
  if (!('Notification' in window)) {
    showToast('Este navegador no admite notificaciones.');
    return;
  }
  const permission = await Notification.requestPermission();
  showToast(permission === 'granted'
    ? 'Avisos activados. Mantén Oliver abierto para recibirlos.'
    : 'Puedes activarlos desde los ajustes del navegador.');
  checkDueNotices();
});

$('installBtn').addEventListener('click', async () => {
  if (!installPrompt) {
    showToast('En Safari: toca Compartir y luego “Añadir a pantalla de inicio”.');
    return;
  }
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $('installBtn').classList.add('hidden');
});
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  $('installBtn').classList.remove('hidden');
});
$('addNav').addEventListener('click', () => {
  $('title').focus();
  window.scrollTo({ top:0, behavior:'smooth' });
});
$('settingsNav').addEventListener('click', () => $('notifyBtn').click());
setInterval(checkDueNotices, 30000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

async function start() {
  $('todayLabel').textContent = new Intl.DateTimeFormat('es-EC', {
    weekday:'long', day:'numeric', month:'long'
  }).format(new Date()).toLocaleUpperCase('es-EC');
  resetForm();
  try {
    reminders = await storageRequest('readonly', store => store.getAll());
    reminders.sort((a, b) => a.dueAt - b.dueAt);
    render();
    checkDueNotices();
  } catch (error) {
    showToast(error.message || 'No se pudo abrir el almacenamiento local.');
  }
}
start();

