import { setupExpalsaQuiz } from './expalsa-quiz.js';
import {isApprovedInspector} from './expalsa-resultados.js';

const el = id => document.getElementById(id);
const info = text => { el('expalsaAuthMessage').textContent = text; };
const gate = el('expalsaAuthGate');
const uiStatus = (message, failed = false) => {
  el('cloudConnection').textContent = message;
  const s = el('saveStatus');
  if (s) { s.textContent = message; s.classList.toggle('error', failed); }
  el('cloudRetry').hidden = !failed;
};
const cfg = window.EXPALSA_FIREBASE_CONFIG;
if (!cfg || !cfg.apiKey || cfg.apiKey.includes('PEGAR_') || !cfg.appId || cfg.appId.includes('PEGAR_') || cfg.projectId !== 'oceantreasure-app') {
  info('Falta completar firebase-config.js. Obtén la configuración de la aplicación web EXPALSA en Firebase Console; esta página no almacena datos hasta que se configure.');
  el('expalsaLoginButton').disabled = true;
} else {
  try {
    const V = '13.0.0';
    const [{ initializeApp }, { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserSessionPersistence }, { getFirestore, collection, getDocs, doc, getDoc, getDocFromServer, onSnapshot, setDoc, updateDoc, writeBatch, runTransaction, serverTimestamp, Timestamp }] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`)
    ]);
    const app = initializeApp(cfg, 'expalsa-calidad-web');
    const auth = getAuth(app);
    const db = getFirestore(app);
    await setPersistence(auth, browserSessionPersistence);
    const allowedKinds = new Set(Object.keys(window.EXPALSA_DATA.schemas));
    let loggedUser = null;
    let role = null;
    let administratorIdentity = null;
    let started = false;
    let flushTimer = null;
    let sending = false;
    let dirty = false;
    let lastCommitted = new Map();
    let wanted = null;
    let quizController = null;

    const stable = value => JSON.stringify(value, function (_key, val) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        return Object.fromEntries(Object.keys(val).sort().map(k => [k, val[k]]));
      }
      return val;
    });
    const sourceMap = data => {
      const out = new Map();
      for (const profile of data.profiles) {
        const id = profile.id;
        if (typeof id !== 'string' || !id || id.includes('/')) throw Error('Identificador de expediente no admitido: ' + id);
        out.set('p:' + id, { id, payload: profile, collection: 'expalsa_calidad_perfiles' });
      }
      for (const [kind, rows] of Object.entries(data.logs)) {
        if (!allowedKinds.has(kind)) continue;
        for (const row of rows) {
          const id = row.id;
          if (typeof id !== 'string' || !id || id.includes('/')) throw Error('Identificador de registro no admitido: ' + id);
          if (out.has('r:' + id)) throw Error('ID de registro duplicado entre formularios: ' + id);
          out.set('r:' + id, { id, payload: row, kind, collection: 'expalsa_calidad_registros' });
        }
      }
      return out;
    };

    async function loadCloud() {

      const [pSnap, rSnap] = await Promise.all([
        getDocs(collection(db, 'expalsa_calidad_perfiles')),
        getDocs(collection(db, 'expalsa_calidad_registros'))
      ]);
      const initial = window.ExpalsaCore.emptyState();
      for (const row of pSnap.docs) initial.profiles.push(row.data().payload);
      for (const row of rSnap.docs) {
        const data = row.data();
        if (!allowedKinds.has(data.kind)) throw Error('Se encontró un formulario no reconocido: ' + data.kind);
        initial.logs[data.kind].push(data.payload);
      }
      const normalized = window.ExpalsaCore.validateState(initial);
      lastCommitted = new Map([...sourceMap(normalized)].map(([key, item]) => [key, stable(item.payload)]));
      return normalized;
    }

    function requestSync(snapshot) {
      if (role !== 'admin') throw Error('La cuenta no está autorizada para escribir.');
      const valid = window.ExpalsaCore.validateState(snapshot);
      const map = sourceMap(valid);

      for (const item of map.values()) if (new Blob([JSON.stringify(item.payload)]).size > 850000) {
        throw Error('Un documento supera el tamaño recomendado para Firestore. Exporta un respaldo JSON.');
      }
      wanted = valid;
      dirty = true;
      uiStatus('Cambios pendientes de sincronización…');
      clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, 950);
    }

    async function flush() {
      if (sending || !wanted || !loggedUser) return;
      sending = true;
      const current = wanted;
      let total = 0;
      try {
        const target = sourceMap(current);
        for (const [key, item] of target) {
          const encoded = stable(item.payload);
          const previous = lastCommitted.get(key);
          if (encoded === previous) continue;
          const docRef = doc(db, item.collection, item.id);

          await runTransaction(db, async t => {
            const latest = await t.get(docRef);
            const serverValue = latest.exists() ? stable(latest.data().payload) : undefined;
            if (serverValue !== previous) {
              throw Error('CONFLICTO: ' + item.id + ' fue modificado en otro equipo. Descarga un respaldo JSON, luego actualiza desde Firestore antes de continuar.');
            }
            t.set(docRef, {
              payload: item.payload,
              updatedBy: loggedUser.email || '',
              changedAt: serverTimestamp(),
              ...(item.kind ? {kind: item.kind} : {})
            });
          });
          lastCommitted.set(key, encoded);
          total++;
        }
        if (wanted === current) {
          wanted = null;
          dirty = false;
          uiStatus('Sincronizado · ' + new Date().toLocaleTimeString('es-EC'));
        } else {
          uiStatus('Sincronizando cambios nuevos…');
        }
      } catch (error) {
        console.error('EXPALSA Firestore:', error);
        dirty = true;
        uiStatus('Error de sincronización: ' + error.message, true);
      } finally {
        sending = false;
        if (wanted && wanted !== current) flushTimer = setTimeout(flush, 200);
      }
    }

    function errorText(error) {
      const code = error?.code || '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return 'Usuario o contraseña incorrectos.';
      if (code === 'auth/invalid-email') return 'El formato del correo es incorrecto.';
      if (code === 'auth/too-many-requests') return 'Demasiados intentos. Intenta más tarde.';
      if (code === 'permission-denied') return 'Acceso denegado por las reglas de Firestore. Verifica que estén publicadas y que la cuenta tenga permisos.';
      return (error?.message || 'Error desconocido').slice(0, 400);
    }

    el('expalsaLoginForm').addEventListener('submit', async event => {
      event.preventDefault();
      el('expalsaLoginButton').disabled = true;
      info('Verificando las credenciales…');
      try {
        await signInWithEmailAndPassword(auth, el('expalsaEmail').value.trim(), el('expalsaPassword').value);
        el('expalsaPassword').value = '';
      } catch (err) {
        info(errorText(err));
        el('expalsaLoginButton').disabled = false;
      }
    });

    const OWNER_EMAIL = 'jefferson@expalsaevaluations.com';
    const ACCESS_COLLECTION = 'expalsa_calidad_accesos';
    const REQUESTS_COLLECTION = 'expalsa_calidad_solicitudes';
    const isValidAccountEmail = address =>
      typeof address === 'string' && /^[^@\s]+@[^@\s]+$/.test(address.trim());

    const showLogin = () => {
      gate.style.display = 'flex';
      el('expalsaLoginForm').hidden = false;
      el('expalsaPendingBox').hidden = true;
      el('expalsaLoginButton').disabled = false;
      el('expalsaAdminOpen').hidden = true;
    };
    const showPending = async user => {
      gate.style.display = 'flex';
      el('expalsaLoginForm').hidden = true;
      el('expalsaPendingBox').hidden = false;
      el('cloudBar').style.display = 'none';
      el('expalsaPendingEmail').textContent = user.email || '';
      el('expalsaPendingUid').textContent = user.uid;
      el('expalsaRequestAccess').disabled = true;
      info('Cuenta válida. Pendiente de autorización del administrador.');
      try {
        const request = await getDoc(doc(db, REQUESTS_COLLECTION, user.uid));
        el('expalsaRequestAccess').disabled = request.exists();
        if (request.exists()) {
          info('Solicitud pendiente de aprobación.');
        }
      } catch (err) { info('No se pudo consultar la solicitud: ' + errorText(err)); }
    };
    const rejectLogin = async err => {
      console.error('Inicio EXPALSA:', err);
      const message = errorText(err);
      loggedUser = null; role = null;
      el('expalsaInspectorPortal').hidden = true;
      el('cloudBar').style.display = 'none';
      try { await signOut(auth); } catch (signOutError) { console.warn('Cierre de sesión:', signOutError); }
      showLogin(); info(message);
    };

    async function authorizeAccount(user) {
      try {
        administratorIdentity = null;
        info('Comprobando permisos de EXPALSA…');
        if (!user?.uid) throw Error('La sesión Firebase no tiene identificador UID.');
        const userEmail = (user.email || '').trim().toLowerCase();
        if (userEmail === OWNER_EMAIL) {

          const control = await getDoc(doc(db, 'expalsa_calidad_config', 'administrador'));
          if (!control.exists() || control.data().uid !== user.uid || control.data().email !== userEmail) {
            throw Error('Administrador EXPALSA no configurado: registra el UID de esta cuenta en Firestore, expalsa_calidad_config/administrador.');
          }
          administratorIdentity = control.data();
          role = 'admin';
        } else if (isValidAccountEmail(userEmail)) {
          const snap = await getDoc(doc(db, ACCESS_COLLECTION, user.uid));
          const access = snap.exists() ? snap.data() : null;
          if (!isApprovedInspector(user,access)) {
            loggedUser = null; role = null;
            await showPending(user);
            return;
          }
          role = 'inspector';
        } else {
          throw Error('Acceso exclusivo para el administrador y las cuentas EXPALSA autorizadas.');
        }
        loggedUser = user;
        if (!quizController) quizController = setupExpalsaQuiz({db,auth,fs:{doc,collection,getDoc,getDocFromServer,onSnapshot,getDocs,setDoc,updateDoc,writeBatch,serverTimestamp,Timestamp,runTransaction,signOut}, adminEmail:OWNER_EMAIL,getAdministrator:()=>administratorIdentity});
        el('expalsaPendingBox').hidden = true;
        gate.style.display = 'none';
        if(role === 'inspector') {
          quizController.reset();
          el('cloudBar').style.display = 'none';
          el('expalsaInspectorPortal').hidden = false;
          await quizController.showInspector(user);
          return;
        }
        el('expalsaInspectorPortal').hidden = true;
        info('Descargando expedientes de Firestore…');
        const cloudData = await loadCloud();
        el('cloudUser').textContent = user.email + ' · administrador';
        if (!started) { window.ExpalsaStart(cloudData, requestSync); started = true; }
        el('cloudBar').style.display = 'flex';
        el('expalsaAdminOpen').hidden = false;
        el('expalsaQuizAdminOpen').hidden = false;

        const dashboard=el('expalsaExecutiveDashboard'),progress=el('expalsaProgressDashboard'),legacy=el('main');
        const setView=view=>{
          const special=view==='inicio'||view==='avances';
          dashboard.hidden=view!=='inicio';progress.hidden=view!=='avances';legacy.hidden=special;
          document.body.classList.toggle('expalsa-executive-mode',special);
          document.title='EXPALSA · '+(view==='avances'?'Avances de inspectores':view==='inicio'?'Evaluaciones':'Calidad');
          if(view==='avances'){
            progress.focus({preventScroll:true});
            quizController.refreshAdmin().catch(err=>el('expalsaProgressStatus').textContent='No se pudieron actualizar los avances: '+(err.message||err));
          }
        };
        setView('inicio');
        el('execRefresh').onclick=()=>quizController.refreshAdmin().catch(err=>el('expalsaPendingEvaluations').textContent=err.message||String(err));
        el('execOpenTests').onclick=()=>el('expalsaQuizAdminOpen').click();
        el('execOpenAccess').onclick=()=>el('expalsaAdminOpen').click();
        if(!document.body.dataset.expalsaViews){document.body.dataset.expalsaViews='yes';document.addEventListener('expalsa:viewchange',evt=>{if(role==='admin')setView(evt.detail.view);});}
        quizController.refreshAdmin().catch(err=>{
            el('expalsaPendingEvaluations').textContent='No se pudieron cargar evaluaciones: '+(err.message||err);
        });
        uiStatus('Sincronizado');
      } catch (err) { await rejectLogin(err); }
    }

    onAuthStateChanged(auth, async user => {
      if (!user) {
        quizController?.reset();
        administratorIdentity=null;
        loggedUser = null; role = null;
        el('expalsaInspectorPortal').hidden = true;
        showLogin();
        el('cloudBar').style.display = 'none';
        info('');
        return;
      }
      await authorizeAccount(user);
    });

    el('expalsaRequestAccess').addEventListener('click', async () => {
      const user = auth.currentUser;
      if (!user || !isValidAccountEmail(user.email)) return;
      const button = el('expalsaRequestAccess');
      button.disabled = true;
      try {
        const target = doc(db, REQUESTS_COLLECTION, user.uid);
        const existing = await getDoc(target);
        if (!existing.exists()) {
          await setDoc(target, {
            email: user.email.trim().toLowerCase(),
            status: 'pending',
            createdAt: serverTimestamp()
          });
        }
        info('Solicitud enviada.');
      } catch (err) { info('No se pudo enviar la solicitud: ' + errorText(err)); button.disabled = false; }
    });
    el('expalsaCheckAccess').addEventListener('click', async () => {
      const user = auth.currentUser;
      if (!user) {showLogin();return;}
      const button = el('expalsaCheckAccess'); button.disabled = true;
      try { await authorizeAccount(user); } finally {button.disabled = false;}
    });
    el('expalsaSwitchAccount').addEventListener('click', async () => {
      await signOut(auth);
      showLogin();
      info('');
    });

    const adminDlg = el('expalsaAdminDialog');
    const adminStatus = txt => {el('expalsaAdminStatus').textContent = txt;};
    const adminRow = (title, uid, caption, label, cb, warn = false) => {
      const row = document.createElement('div'); row.className='expalsa-admin-entry';
      const about=document.createElement('div');
      const strong=document.createElement('b');strong.textContent=title;
      const small=document.createElement('small');small.textContent='UID: '+uid+' · '+caption;
      about.append(strong,small);row.append(about);
      if (label) {
        const button=document.createElement('button');
        button.type='button';button.textContent=label;
        if (warn) button.className='warn';
        button.addEventListener('click', async () => {
          button.disabled=true;
          try { await cb(); await renderAdmin(); }
          catch(err){adminStatus(errorText(err)); button.disabled=false;}
        });
        row.append(button);
      }
      return row;
    };
    async function renderAdmin() {
      if (role !== 'admin' || !auth.currentUser || (auth.currentUser.email||'').toLowerCase()!==OWNER_EMAIL) return;
      adminStatus('Consultando autorizaciones…');
      const [reqs,accesses]=await Promise.all([
        getDocs(collection(db,REQUESTS_COLLECTION)),
        getDocs(collection(db,ACCESS_COLLECTION))
      ]);
      const grants=new Map(accesses.docs.map(s => [s.id,s.data()]));
      const requestsArea=el('expalsaAdminRequests');requestsArea.replaceChildren();
      let pending=0;
      for(const req of reqs.docs) {
        const x=req.data();
        if(x.status!=='pending' || grants.get(req.id)?.active===true) continue;
        pending++;
        requestsArea.append(adminRow(x.email,req.id,'Solicitud pendiente','Aprobar',async()=>{
          if(!isValidAccountEmail(x.email)) throw Error('Correo de cuenta no válido.');
          if(!confirm('¿Has comprobado que '+x.email+' pertenece a un empleado autorizado de EXPALSA?')) return;
          const batch=writeBatch(db);
          batch.set(doc(db,ACCESS_COLLECTION,req.id),{email:x.email,active:true,role:'inspector',note:'Inspector autorizado para las tres etapas de evaluación'});
          batch.update(doc(db,REQUESTS_COLLECTION,req.id),{status:'approved',reviewedAt:serverTimestamp()});
          await batch.commit();
          adminStatus('Usuario aprobado. Puede pulsar «Comprobar autorización».');
        }));
      }
      if(!pending) {const t=document.createElement('p');t.className='expalsa-admin-empty';t.textContent='No hay solicitudes pendientes.';requestsArea.append(t);}
      const list=el('expalsaAdminAccessList');list.replaceChildren();
      if(!accesses.docs.length) {const t=document.createElement('p');t.className='expalsa-admin-empty';t.textContent='Todavía no hay cuentas aprobadas.';list.append(t);}
      for(const access of accesses.docs) {
        const x=access.data();const active=x.active===true;
        if(access.id===administratorIdentity?.uid)continue;
        list.append(adminRow(x.email||'(sin correo)',access.id,
          active?'Inspector activo':'Inspector suspendido',
          active?'Suspender':'Reactivar',async()=>{
          if(!isValidAccountEmail(x.email)) throw Error('Correo no válido: no se modificó.');
            if(!confirm((active?'¿Suspender':'¿Reactivar')+' acceso de '+x.email+'?'))return;
            await updateDoc(doc(db,ACCESS_COLLECTION,access.id),{active:!active,role:'inspector'});
            adminStatus(active?'Acceso suspendido.':'Acceso reactivado.');
        },active));
      }
      adminStatus('Solicitudes pendientes: '+pending+' · Usuarios autorizados: '+accesses.docs.length);
    }
    el('expalsaAdminOpen').addEventListener('click',async()=>{
      if(role!=='admin') return;
      adminDlg.showModal();
      try {await renderAdmin();} catch(err){adminStatus('No se pudo consultar: '+errorText(err));}
    });
    el('expalsaAdminRefresh').addEventListener('click',async()=>{try{await renderAdmin();}catch(err){adminStatus(errorText(err));}});
    el('expalsaAdminClose').addEventListener('click',()=>adminDlg.close());

    el('cloudRetry').addEventListener('click', () => {if (dirty && wanted) flush();});
    el('cloudReload').addEventListener('click', () => {
      if (dirty && !confirm('Existen cambios pendientes. Descarga un respaldo JSON antes de recargar. ¿Descartar lo no sincronizado?')) return;
      location.reload();
    });
    el('cloudLogout').addEventListener('click', async () => {
      if (dirty) {alert('Hay cambios sin sincronizar. Espera «Sincronizado» o descarga un respaldo JSON.');return;}
      await signOut(auth);location.reload();
    });
    window.addEventListener('beforeunload', event => {
      if (dirty) {event.preventDefault(); event.returnValue = '';}
    });
  } catch (err) {
    console.error('Error de inicialización Firebase:', err);
    info('No se pudo iniciar Firebase: ' + (err.message || String(err)) + '. Verifica Internet, configuración y acceso a los dominios de Firebase.');
    el('expalsaLoginButton').disabled = true;
  }
}
