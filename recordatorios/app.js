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
let voiceFlow = null;
let voiceRecognition = null;
let voiceTurn = 0;
let voiceSpeakTimer;
const mobileVoiceMode = navigator.standalone === true
  || window.matchMedia?.('(display-mode: standalone)').matches
  || /android|iphone|ipad|ipod/i.test(navigator.userAgent);

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
    const notifyAt = reminder.notifyAt ?? reminder.dueAt;
    if (reminder.done || reminder.notified || pendingNotices.has(reminder.id) || notifyAt > Date.now()) continue;
    pendingNotices.add(reminder.id);
    try {
      const when = new Intl.DateTimeFormat('es-EC', { hour:'2-digit', minute:'2-digit' }).format(new Date(reminder.dueAt));
      new Notification('Oliver · Recordatorio', { body:`${reminder.title} · Hoy a las ${when}`, icon:'/icon.svg', tag:reminder.id });
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
    reminderLeadMinutes: previous?.reminderLeadMinutes ?? null,
    done: previous?.done || false,
    notified: false,
    notifyAt: previous?.reminderLeadMinutes != null ? due.getTime() - previous.reminderLeadMinutes * 60000 : previous?.notifyAt ?? due.getTime(),
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

const voiceSpeech = window.SpeechRecognition || window.webkitSpeechRecognition;
const voiceMonths = {enero:0, febrero:1, marzo:2, abril:3, mayo:4, junio:5, julio:6, agosto:7, septiembre:8, octubre:9, noviembre:10, diciembre:11};
const voiceNumbers = {una:1,uno:1,un:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,once:11,doce:12,trece:13,catorce:14,quince:15,dieciseis:16,diecisiete:17,dieciocho:18,diecinueve:19,veinte:20,veintiuno:21,veintidos:22,veintitres:23,veinticuatro:24,veinticinco:25,veintiseis:26,veintisiete:27,veintiocho:28,veintinueve:29,treinta:30,treintaiuno:31,media:30};
function voiceNorm(text) { return text.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.,;!?]/g, ' ').replace(/\s+/g, ' ').trim(); }
function spokenNumber(text) { const clean = voiceNorm(text); if (/^\d{1,2}$/.test(clean)) return Number(clean); const words = clean.split(' '); return voiceNumbers[words.find(word => word in voiceNumbers)] ?? null; }
function parseVoiceDate(text) {
  const clean = voiceNorm(text), now = new Date();
  if (/\bpasado manana\b/.test(clean)) { now.setDate(now.getDate()+2); return isoDate(now); }
  if (/\bmanana\b/.test(clean)) { now.setDate(now.getDate()+1); return isoDate(now); }
  if (/\bhoy\b/.test(clean)) return isoDate(now);
  const numeric = clean.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numeric) { const year = numeric[3] ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]) : now.getFullYear(); const date = new Date(year, Number(numeric[2])-1, Number(numeric[1])); return date.getMonth() === Number(numeric[2])-1 && date.getDate() === Number(numeric[1]) ? isoDate(date) : null; }
  const named = clean.match(/\b(\d{1,2}|[a-z]+)\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+de\s+(\d{4}))?/);
  if (named) { const day = spokenNumber(named[1]); if (!day) return null; let year = Number(named[3] || now.getFullYear()); let date = new Date(year, voiceMonths[named[2]], day); if (date.getMonth() !== voiceMonths[named[2]] || date.getDate() !== day) return null; if (!named[3] && date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) date = new Date(year+1, voiceMonths[named[2]], day); return isoDate(date); }
  const weekdays = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
  const weekday = weekdays.findIndex(day => new RegExp(`\\b${day}\\b`).test(clean));
  if (weekday >= 0) { const date = new Date(now); let delta = (weekday - date.getDay() + 7) % 7; if (delta === 0 || /proximo|que viene/.test(clean)) delta += 7; date.setDate(date.getDate()+delta); return isoDate(date); }
  return null;
}
function parseVoiceTime(text) {
  const clean = voiceNorm(text);
  const match = clean.match(/(?:a\s+las?\s+)?(\d{1,2})(?::(\d{2}))?(?:\s+y\s+(media|cuarto)|\s+(media|cuarto))?\s*(de\s+la\s+(manana|tarde|noche))?/);
  let hour, minute;
  if (match) { hour = Number(match[1]); minute = match[2] ? Number(match[2]) : (match[3] || match[4] ? (match[3] || match[4]) === 'media' ? 30 : 15 : 0); }
  else { const word = clean.match(/(?:a\s+las?\s+)?(una|uno|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(?:\s+y\s+(media|cuarto))?\s*(?:de\s+la\s+(manana|tarde|noche))?/); if (!word) return null; hour = voiceNumbers[word[1]]; minute = word[2] === 'media' ? 30 : word[2] === 'cuarto' ? 15 : 0; if (word[3] && ['tarde','noche'].includes(word[3]) && hour < 12) hour += 12; }
  const period = match?.[6]; if (period && ['tarde','noche'].includes(period) && hour < 12) hour += 12;
  if (!Number.isInteger(hour) || hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
}
function speakVoice(text, onEnd) {
  const turn = ++voiceTurn;
  clearTimeout(voiceSpeakTimer);
  window.speechSynthesis?.cancel();
  if (voiceFlow) { voiceFlow.speaking = true; voiceFlow.answerBusy = false; }
  $('voiceDialog').classList.add('speaking');
  $('voiceDialog').classList.remove('listening');
  const stages = { title:'BIENVENIDA', date:'FECHA', time:'HORA', place:'LUGAR', noteDecision:'DETALLES', note:'DETALLES', lead:'ANTICIPACIÓN' };
  $('voiceStep').textContent = `OLIVER · ${stages[voiceFlow?.step] || 'TU AVISO'}`;
  $('voicePrompt').textContent = text;
  $('voiceStatus').textContent = 'Oliver está hablando…';
  $('voiceStatus').classList.remove('listening');
  $('voiceRetry').classList.add('hidden');
  let finished = false;
  const finish = () => {
    if (finished || turn !== voiceTurn || !voiceFlow) return;
    finished = true;
    clearTimeout(voiceSpeakTimer);
    voiceFlow.speaking = false;
    voiceFlow.ignoreVoiceUntil = Date.now() + 700;
    $('voiceDialog').classList.remove('speaking');
    if (onEnd) onEnd();
    else if (mobileVoiceMode && voiceFlow.step !== 'lead') $('voiceStatus').textContent = 'Escuchando…';
    if (mobileVoiceMode && voiceFlow.mobileVoiceActive) $('voiceDialog').classList.add('listening');
  };
  if (!('speechSynthesis' in window)) { $('voiceStatus').textContent = 'La voz no está disponible. Puedes leer la pregunta y responder.'; finish(); return; }
  const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'es-ES';
  const voice = speechSynthesis.getVoices().find(item => item.lang.toLowerCase().startsWith('es'));
  if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
  utterance.onend = finish;
  utterance.onerror = finish;
  speechSynthesis.speak(utterance);
  voiceSpeakTimer = setTimeout(finish, Math.max(4500, text.length * 105));
}
function listenVoice() {
  if (!voiceFlow) return;
  if (!voiceSpeech) { $('voiceStatus').textContent = 'Este navegador no ofrece dictado directo. Puedes responder con el micrófono del teclado.'; $('voiceFallback').classList.remove('hidden'); $('voiceRetry').classList.add('hidden'); return; }
  const recognition = new voiceSpeech(); voiceRecognition = recognition;
  recognition.lang = 'es-ES'; recognition.interimResults = false; recognition.maxAlternatives = 1;
  recognition.continuous = mobileVoiceMode;
  $('voiceStatus').textContent = voiceFlow.speaking ? 'Oliver está hablando…' : 'Escuchando…';
  $('voiceDialog').classList.toggle('listening', !voiceFlow.speaking);
  $('voiceRetry').classList.add('hidden'); $('voiceFallback').classList.add('hidden');
  recognition.onresult = event => {
    if (mobileVoiceMode) {
      if (voiceFlow?.speaking || Date.now() < (voiceFlow?.ignoreVoiceUntil || 0) || voiceFlow?.answerBusy) return;
      const heard = Array.from(event.results).slice(event.resultIndex)
        .filter(result => result.isFinal).map(result => result[0].transcript.trim()).filter(Boolean).join(' ');
      if (!heard) return;
      voiceFlow.answerBusy = true;
      $('voiceStatus').textContent = 'Te escuché';
      handleVoiceAnswer(heard);
      return;
    }
    const answer = event.results[event.resultIndex][0].transcript;
    voiceRecognition = null;
    handleVoiceAnswer(answer);
  };
  recognition.onerror = event => {
    if (mobileVoiceMode && !['not-allowed','service-not-allowed','audio-capture'].includes(event.error)) return;
    voiceRecognition = null;
    if (voiceFlow) voiceFlow.mobileVoiceActive = false;
    $('voiceDialog').classList.remove('listening');
    $('voiceStatus').textContent = event.error === 'not-allowed' ? 'Permite el micrófono para continuar.' : 'La escucha continua no está disponible. Puedes dictar con el micrófono del teclado.';
    $('voiceRetry').classList.remove('hidden'); $('voiceFallback').classList.remove('hidden');
  };
  recognition.onend = () => {
    if (voiceRecognition !== recognition) return;
    voiceRecognition = null;
    if (mobileVoiceMode && voiceFlow?.mobileVoiceActive) {
      $('voiceStatus').textContent = voiceFlow.speaking ? 'Oliver está hablando…' : 'Escuchando…';
      setTimeout(() => { if (voiceFlow?.mobileVoiceActive && !voiceRecognition) listenVoice(); }, 300);
      return;
    }
    $('voiceDialog').classList.remove('listening');
    $('voiceStatus').textContent = 'No alcancé a escucharte. Puedes volver a intentarlo.';
    $('voiceRetry').classList.remove('hidden'); $('voiceFallback').classList.remove('hidden');
  };
  try { recognition.start(); voiceRecognition = recognition; }
  catch {
    voiceRecognition = null;
    if (voiceFlow) voiceFlow.mobileVoiceActive = false;
    $('voiceDialog').classList.remove('listening');
    $('voiceStatus').textContent = 'No se pudo iniciar la escucha continua. Puedes dictar con el micrófono del teclado.';
    $('voiceRetry').classList.remove('hidden'); $('voiceFallback').classList.remove('hidden');
  }
}
function afterVoicePrompt() {
  if (mobileVoiceMode) {
    if (voiceFlow?.mobileVoiceActive) { $('voiceStatus').textContent = 'Escuchando…'; $('voiceDialog').classList.add('listening'); }
  } else listenVoice();
}
function askVoice(step, prompt) { voiceFlow.step = step; $('voiceFallbackInput').value = ''; $('voiceFallback').classList.add('hidden'); speakVoice(prompt, afterVoicePrompt); }
function showVoiceChoices() {
  const summary = `Agendaré: ${voiceFlow.data.title}. Fecha: ${new Intl.DateTimeFormat('es-EC',{dateStyle:'full'}).format(new Date(`${voiceFlow.data.date}T12:00`))}, a las ${voiceFlow.data.time}.${voiceFlow.data.place ? ` Lugar: ${voiceFlow.data.place}.` : ''}${voiceFlow.data.note ? ` Detalle: ${voiceFlow.data.note}.` : ''}`;
  $('voiceChoices').innerHTML = ['5 minutos','30 minutos','1 hora','1 día'].map(label => `<span class="voice-choice">${label}</span>`).join('');
  $('voiceChoices').classList.remove('hidden'); $('voiceActions').classList.remove('hidden');
  askVoice('lead',`${summary} ¿Con cuánta anticipación quieres que te lo recuerde? Dime cinco minutos, treinta minutos, una hora o un día.`);
}
function parseVoiceLead(text) {
  const clean = voiceNorm(text);
  if (/\b(cinco|5)\s+minutos?\b/.test(clean)) return 5;
  if (/\b(treinta|30)\s+minutos?\b|\bmedia\s+hora\b/.test(clean)) return 30;
  if (/\b(una?|1)\s+hora\b/.test(clean)) return 60;
  if (/\b(un|una|1)\s+dia\b|\bveinticuatro\s+horas?\b/.test(clean)) return 1440;
  return null;
}
function yesAnswer(text) { return /\b(si|claro|correcto|por supuesto|aj[aá]|ok|dale)\b/.test(voiceNorm(text)); }
function noAnswer(text) { return /\b(no|ninguno|nada|eso es todo)\b/.test(voiceNorm(text)); }
function handleVoiceAnswer(answer) {
  if (!voiceFlow) return;
  const flow = voiceFlow;
  if (flow.step === 'title') { if (!answer.trim()) return askVoice('title','No alcancé a entender el aviso. ¿Qué necesitas agendar?'); flow.data.title = answer.trim(); return askVoice('date','¡Dime la fecha!'); }
  if (flow.step === 'date') { const date = parseVoiceDate(answer); if (!date) return askVoice('date','No pude identificar la fecha. Dime, por ejemplo, mañana, el 15 de abril o el lunes.'); flow.data.date = date; return askVoice('time','¡Ahora, dime la hora del evento!'); }
  if (flow.step === 'time') { const time = parseVoiceTime(answer); if (!time) return askVoice('time','No pude identificar la hora. Dime la hora, por ejemplo, a las siete de la tarde.'); const due = dateTime(flow.data.date,time); if (due.getTime() < Date.now()-60000) return askVoice('date','Esa fecha y hora ya pasaron. Dime otra vez la fecha.'); flow.data.time = time; return askVoice('place','¿Me podrías indicar el lugar? Si no tiene lugar, di que no.'); }
  if (flow.step === 'place') { flow.data.place = noAnswer(answer) ? '' : answer.trim().replace(/^(en|a)\s+/i,''); return askVoice('noteDecision','¿Deseas dar algún otro detalle para recordártelo?'); }
  if (flow.step === 'noteDecision') { if (yesAnswer(answer)) return askVoice('note','Te escucho.'); if (noAnswer(answer)) { flow.data.note = ''; return showVoiceChoices(); } return askVoice('noteDecision','Dime sí para agregar un detalle o no para continuar.'); }
  if (flow.step === 'note') { flow.data.note = noAnswer(answer) ? '' : answer.trim(); return showVoiceChoices(); }
  if (flow.step === 'lead') { const minutes = parseVoiceLead(answer); if (minutes) return saveVoiceReminder(minutes); return askVoice('lead','No reconocí la anticipación. Dime cinco minutos, treinta minutos, una hora o un día.'); }
}
async function saveVoiceReminder(minutes) {
  if (!voiceFlow) return;
  const { title, date, time, place, note } = voiceFlow.data;
  const due = dateTime(date,time), now = Date.now();
  if (due.getTime() < now-60000) { closeVoice(); showToast('La fecha y hora ya pasaron. Vuelve a intentarlo.'); return; }
  let noticePermission = 'unsupported';
  if ('Notification' in window) {
    noticePermission = Notification.permission;
    if (noticePermission === 'default') { try { noticePermission = await Notification.requestPermission(); } catch { noticePermission = 'denied'; } }
  }
  const reminder = { id:crypto.randomUUID ? crypto.randomUUID() : `${now}-${Math.random().toString(36).slice(2)}`, title, date, time, place, note, photoDataUrl:'', dueAt:due.getTime(), notifyAt:due.getTime()-minutes*60000, reminderLeadMinutes:minutes, done:false, notified:false, createdAt:now, updatedAt:now };
  $('voiceStatus').textContent = 'Guardando en este teléfono…'; $('voiceChoices').classList.add('hidden');
  try { await storageRequest('readwrite', store => store.put(reminder)); reminders.push(reminder); render(); closeVoice(); resetForm(); showToast(noticePermission === 'granted' ? 'Recordatorio guardado en este teléfono.' : 'Guardado. Activa avisos para recibir la notificación.'); if ('Notification' in window && Notification.permission === 'granted') checkDueNotices(); }
  catch (error) { $('voiceStatus').textContent = error.message || 'No se pudo guardar el recordatorio.'; $('voiceChoices').classList.remove('hidden'); }
}
function closeVoice() { voiceTurn++; clearTimeout(voiceSpeakTimer); window.speechSynthesis?.cancel(); try { voiceRecognition?.abort(); } catch {} voiceRecognition = null; voiceFlow = null; $('voiceDialog').classList.add('hidden'); $('voiceDialog').classList.remove('speaking','listening'); document.body.classList.remove('voice-open'); $('voiceChoices').classList.add('hidden'); $('voiceFallback').classList.add('hidden'); $('voiceActions').classList.remove('hidden'); $('voiceListen').disabled = false; }
$('voiceBtn').addEventListener('click', () => {
  voiceFlow = { step:'title', data:{}, mobileVoiceActive: mobileVoiceMode && !!voiceSpeech };
  $('voiceFallback').classList.add('hidden'); $('voiceFallbackInput').value = ''; $('voiceListen').classList.toggle('hidden', !mobileVoiceMode); $('voiceDialog').classList.remove('hidden'); document.body.classList.add('voice-open'); $('voiceClose').focus({preventScroll:true});
  if (mobileVoiceMode && voiceSpeech) listenVoice();
  else if (mobileVoiceMode) { $('voiceFallback').classList.remove('hidden'); $('voiceStatus').textContent = 'Puedes responder con el micrófono del teclado.'; }
  speakVoice('Bienvenido. ¿Qué necesitas agendar?', afterVoicePrompt);
});
$('voiceDialog').addEventListener('click', event => { if (event.target === $('voiceDialog')) closeVoice(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('voiceDialog').classList.contains('hidden')) { event.preventDefault(); closeVoice(); } });
$('voiceClose').addEventListener('click', closeVoice);
$('voiceCancel').addEventListener('click', closeVoice);
$('voiceRetry').addEventListener('click', () => { if (voiceFlow) speakVoice($('voicePrompt').textContent, afterVoicePrompt); });
$('voiceListen').addEventListener('click', listenVoice);
$('voiceFallbackSend').addEventListener('click', () => { const answer = $('voiceFallbackInput').value.trim(); if (answer) { $('voiceFallback').classList.add('hidden'); handleVoiceAnswer(answer); } });

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
if ('serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let refreshingForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshingForUpdate) return;
    const hasDraft = $('title').value.trim() || $('place').value.trim() || $('note').value.trim() || $('photo').files.length;
    if (hasDraft) { showToast('Oliver se actualizó. Cierra y vuelve a abrir la app cuando termines este aviso.'); return; }
    refreshingForUpdate = true;
    window.location.reload();
  });
  navigator.serviceWorker.register('/sw.js', { updateViaCache:'none' })
    .then(registration => registration.update().catch(() => {}))
    .catch(() => {});
}

async function start() {
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

