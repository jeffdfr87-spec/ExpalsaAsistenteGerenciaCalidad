const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore} = require("firebase-admin/firestore");

initializeApp();

const DOMAIN = "expalsaevaluations.com";
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,38}[a-z0-9]$/;
const COLLECTIONS = [
  "expalsa_calidad_accesos",
  "expalsa_calidad_solicitudes",
  "expalsa_calidad_solicitudes_teoria",
  "expalsa_calidad_perfiles"
];
const IDENTIFIER_FIELDS = new Set([
  "email", "correo", "mail", "username", "usuario", "login", "cuenta"
]);

function hasUsername(value, email, username) {
  if (Array.isArray(value)) return value.some(item => hasUsername(item, email, username));
  if (!value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value)) {
    if (IDENTIFIER_FIELDS.has(key.toLocaleLowerCase("es")) && typeof child === "string") {
      const candidate = child.trim().toLocaleLowerCase("es");
      if (candidate === email || candidate === username) return true;
    }
    if (hasUsername(child, email, username)) return true;
  }
  return false;
}

async function existsInFirestore(email, username) {
  const db = getFirestore();
  const snapshots = await Promise.all(COLLECTIONS.map(name => db.collection(name).get()));
  return snapshots.some(snapshot => snapshot.docs.some(document => {
    const id = document.id.trim().toLocaleLowerCase("es");
    return id === email || id === username || hasUsername(document.data(), email, username);
  }));
}

exports.checkInspectorUsername = onCall(
  {region: "us-central1", maxInstances: 3, timeoutSeconds: 30, memory: "256MiB"},
  async request => {
    const username = typeof request.data?.username === "string"
      ? request.data.username.trim().toLocaleLowerCase("es")
      : "";
    if (!USERNAME_PATTERN.test(username) || /[._-]{2}/.test(username)) {
      throw new HttpsError("invalid-argument", "Nombre de usuario no válido.");
    }

    const email = username + "@" + DOMAIN;
    try {
      await getAuth().getUserByEmail(email);
      return {available: false};
    } catch (error) {
      if (error.code !== "auth/user-not-found") {
        console.error("No se pudo verificar Firebase Authentication:", error);
        throw new HttpsError("unavailable", "No se pudo verificar la disponibilidad.");
      }
    }

    try {
      return {available: !(await existsInFirestore(email, username))};
    } catch (error) {
      console.error("No se pudo consultar la disponibilidad en Firestore:", error);
      throw new HttpsError("unavailable", "No se pudo verificar la disponibilidad.");
    }
  }
);

const TRAINING_BANK = "expalsa_capacitacion_2026_bancos/cap-plan-20261103-v1";
const TRAINING_ATTEMPTS = "expalsa_capacitacion_2026_evaluaciones";
const TRAINING_REQUESTS = "expalsa_capacitacion_2026_solicitudes";
const TRAINING_PERMISSIONS = "expalsa_capacitacion_2026_permisos";
const TRAINING_ADMIN = "jefferson@expalsaevaluations.com";

async function trainingUser(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Inicia sesión para continuar.");
  const uid = request.auth.uid;
  const email = String(request.auth.token.email || "").trim().toLowerCase();
  if (email === TRAINING_ADMIN) {
    const admin = await getFirestore().doc("expalsa_calidad_config/administrador").get();
    if (admin.exists && admin.data().uid === uid && admin.data().email === email) return {uid, email, admin: true};
  }
  const access = await getFirestore().doc(`expalsa_calidad_accesos/${uid}`).get();
  if (!access.exists || access.data().active !== true || access.data().deleted === true || access.data().email !== email) {
    throw new HttpsError("permission-denied", "La cuenta de inspector no está habilitada.");
  }
  return {uid, email, admin: false};
}

async function requireTrainingAdmin(request) {
  const identity = await trainingUser(request);
  if (!identity.admin) throw new HttpsError("permission-denied", "Acción exclusiva del administrador.");
  return identity;
}

function cleanTrainingDay(bank, day) {
  return {
    version: bank.version,
    questions: (bank.questions || []).filter(question => question.day === day).map(question => {
      const {answer, explanation, rubric, criteria, ...publicQuestion} = question;
      return publicQuestion;
    })
  };
}

function trainingExpiry(attempt) {
  return attempt.startedAt.toMillis() + attempt.durationMinutes * 60000;
}

function submittedAttempt(attempt, expired, now) {
  return {
    status: "submitted",
    submittedAt: now,
    submissionKind: expired ? "expired" : "manual",
    updatedAt: now,
    updatedBy: attempt.accountUid,
    rev: Number(attempt.rev || 1) + 1
  };
}

function publicTrainingAttempt(attempt) {
  if (!attempt) return null;
  const out = {...attempt};
  for (const key of ["startedAt", "createdAt", "updatedAt", "submittedAt", "gradedAt"]) {
    const value = out[key];
    if (value && typeof value.toMillis === "function") out[key + "Ms"] = value.toMillis();
    delete out[key];
  }
  return out;
}

function savedDayField(purpose) {
  return purpose === "refuerzo" ? "refuerzoSavedThrough" : "initialSavedThrough";
}

async function getTrainingContext(request, requirePermission = true) {
  const user = await trainingUser(request);
  if (user.admin) throw new HttpsError("failed-precondition", "El administrador usa la vista de gestión.");
  const db = getFirestore();
  const permissionRef = db.doc(`${TRAINING_PERMISSIONS}/${user.uid}`);
  const [permissionSnap, bankSnap] = await Promise.all([permissionRef.get(), db.doc(TRAINING_BANK).get()]);
  const permission = permissionSnap.exists ? permissionSnap.data() : {};
  if (requirePermission && !permission.initialEnabled && !permission.refuerzoEnabled) {
    const active = await db.collection(TRAINING_ATTEMPTS).where("accountUid", "==", user.uid).where("status", "==", "active").limit(1).get();
    if (active.empty) return {user, permission, permissionRef, bank: null, bankRef: db.doc(TRAINING_BANK)};
  }
  if (!bankSnap.exists) throw new HttpsError("unavailable", "El cuestionario no está disponible.");
  return {user, permission, permissionRef, bank: bankSnap.data(), bankRef: db.doc(TRAINING_BANK)};
}

exports.requestTrainingEvaluation = onCall(
  {region: "us-central1", maxInstances: 10, timeoutSeconds: 30, memory: "256MiB"},
  async request => {
    const ctx = await getTrainingContext(request, false);
    const {user, permission} = ctx;
    const kind = request.data?.kind === "refuerzo" ? "refuerzo" : "inicial";
    const db = getFirestore();
    const attemptsSnap = await db.collection(TRAINING_ATTEMPTS).where("accountUid", "==", user.uid).get();
    const attempts = attemptsSnap.docs.map(d => d.data());
    if (kind === "inicial" && (permission.initialEnabled || permission.initialUsed || attempts.length)) {
      throw new HttpsError("failed-precondition", "La evaluación inicial ya fue habilitada o realizada.");
    }
    if (kind === "refuerzo" && !attempts.some(a => a.status === "submitted" || a.status === "graded")) {
      throw new HttpsError("failed-precondition", "El refuerzo estará disponible después de entregar la evaluación inicial.");
    }
    if (kind === "refuerzo" && (permission.refuerzoEnabled || attempts.some(a => a.purpose === "refuerzo" && a.status === "active"))) {
      throw new HttpsError("failed-precondition", "Ya tienes un refuerzo habilitado o en curso.");
    }
    const requests = await db.collection(TRAINING_REQUESTS).where("uid", "==", user.uid).where("kind", "==", kind).get();
    if (requests.docs.some(d => d.data().status === "pending")) throw new HttpsError("already-exists", "Ya tienes una solicitud pendiente.");
    const ref = db.collection(TRAINING_REQUESTS).doc();
    await ref.set({id: ref.id, uid: user.uid, email: user.email, kind, status: "pending", requestedAt: require("firebase-admin/firestore").Timestamp.now(), reviewedAt: null, reviewedBy: "", durationMinutes: 0});
    return {status: "pending"};
  }
);

exports.reviewTrainingEvaluation = onCall(
  {region: "us-central1", maxInstances: 10, timeoutSeconds: 30, memory: "256MiB"},
  async request => {
    const admin = await requireTrainingAdmin(request);
    const id = String(request.data?.id || "");
    const approve = request.data?.approve === true;
    const minutes = Number(request.data?.durationMinutes);
    if (!id || id.includes("/")) throw new HttpsError("invalid-argument", "Solicitud no válida.");
    if (approve && (!Number.isInteger(minutes) || minutes < 5 || minutes > 180)) throw new HttpsError("invalid-argument", "El tiempo debe ser de 5 a 180 minutos.");
    const db = getFirestore(), reqRef = db.doc(`${TRAINING_REQUESTS}/${id}`);
    await db.runTransaction(async tx => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists || reqSnap.data().status !== "pending") throw new HttpsError("failed-precondition", "La solicitud ya fue atendida.");
      const item = reqSnap.data();
      const accessRef = db.doc(`${TRAINING_PERMISSIONS}/${item.uid}`), accessSnap = await tx.get(accessRef);
      const old = accessSnap.exists ? accessSnap.data() : {uid: item.uid, initialEnabled: false, initialUsed: false, refuerzoEnabled: false, refuerzoUsed: false};
      if (approve) {
        if (item.kind === "inicial" && (old.initialUsed || old.initialEnabled)) throw new HttpsError("failed-precondition", "La evaluación inicial ya fue utilizada o habilitada.");
        if (item.kind === "refuerzo" && (old.refuerzoUsed || old.refuerzoEnabled)) throw new HttpsError("failed-precondition", "El permiso de refuerzo ya está utilizado o habilitado.");
        if (item.kind === "inicial") { old.initialEnabled = true; old.initialDurationMinutes = minutes; }
        else { old.refuerzoEnabled = true; old.refuerzoDurationMinutes = minutes; }
        old.uid = item.uid; old.updatedAt = require("firebase-admin/firestore").Timestamp.now(); old.updatedBy = admin.uid;
        tx.set(accessRef, old);
      }
      tx.update(reqRef, {status: approve ? "approved" : "rejected", durationMinutes: approve ? minutes : 0, reviewedAt: require("firebase-admin/firestore").Timestamp.now(), reviewedBy: admin.uid});
    });
    return {status: approve ? "approved" : "rejected"};
  }
);

exports.startTrainingEvaluation = onCall(
  {region: "us-central1", maxInstances: 10, timeoutSeconds: 60, memory: "256MiB"},
  async request => {
    const {user, permission, permissionRef, bank} = await getTrainingContext(request);
    if (!bank) return {status: "pending"};
    const db = getFirestore(), now = require("firebase-admin/firestore").Timestamp.now();
    const attemptsQuery = db.collection(TRAINING_ATTEMPTS).where("accountUid", "==", user.uid);
    let returned;
    await db.runTransaction(async tx => {
      const [permSnap, attemptsSnap] = await Promise.all([tx.get(permissionRef), tx.get(attemptsQuery)]);
      const latest = attemptsSnap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => b.startedAt.toMillis() - a.startedAt.toMillis())[0];
      const perm = permSnap.exists ? permSnap.data() : {};
      if (latest?.status === "active") {
        if (trainingExpiry(latest) <= now.toMillis()) {
          tx.update(db.doc(`${TRAINING_ATTEMPTS}/${latest.id}`), submittedAttempt(latest, true, now));
          returned = {status: "submitted", attempt: publicTrainingAttempt({...latest, status:"submitted", submissionKind:"expired"}), bank: null};
        } else {
          const activeAttempt = {...latest, savedThrough:Number(perm[savedDayField(latest.purpose)] ?? latest.savedThrough ?? 0)};
          returned = {status: "active", attempt: publicTrainingAttempt(activeAttempt), bank: cleanTrainingDay(bank, Math.min(activeAttempt.savedThrough + 1,10))};
        }
        return;
      }
      const kind = perm.initialEnabled && !perm.initialUsed ? "inicial" : perm.refuerzoEnabled && !perm.refuerzoUsed ? "refuerzo" : "";
      if (!kind) { returned = {status: latest?.status === "submitted" || latest?.status === "graded" ? "completed" : "unauthorized", attempt: latest || null}; return; }
      const durationMinutes = kind === "inicial" ? Number(perm.initialDurationMinutes) : Number(perm.refuerzoDurationMinutes);
      if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 180) throw new HttpsError("failed-precondition", "El administrador debe asignar el tiempo de evaluación.");
      const ref = db.collection(TRAINING_ATTEMPTS).doc();
      const record = {id:ref.id,accountUid:user.uid,scope:0,purpose:kind,durationMinutes,bankId:bank.version,status:"active",answers:"{}",marks:"{}",startedAt:now,createdAt:now,updatedAt:now,submittedAt:null,gradedAt:null,submissionKind:"",createdBy:user.uid,updatedBy:user.uid,rev:1};
      tx.create(ref, record);
      const savedField=savedDayField(kind);
      if (kind === "inicial") tx.update(permissionRef, {initialEnabled:false,initialUsed:true,[savedField]:0,updatedAt:now});
      else tx.update(permissionRef, {refuerzoEnabled:false,refuerzoUsed:true,[savedField]:0,updatedAt:now});
      returned = {status:"active",attempt:publicTrainingAttempt({...record,savedThrough:0}),bank:cleanTrainingDay(bank,1)};
    });
    return returned;
  }
);

exports.listTrainingEvaluationRequests = onCall(
  {region: "us-central1", maxInstances: 10, timeoutSeconds: 30, memory: "256MiB"},
  async request => {
    await requireTrainingAdmin(request);
    const snapshot = await getFirestore().collection(TRAINING_REQUESTS).get();
    const requests = snapshot.docs.map(doc => ({id:doc.id,...doc.data()}))
      .filter(row => row.status === "pending")
      .sort((a,b) => b.requestedAt.toMillis() - a.requestedAt.toMillis())
      .slice(0,100)
      .map(row => {
        const {requestedAt,...safeRow}=row;
        return {...safeRow,requestedAtMs:requestedAt.toMillis()};
      });
    return {requests};
  }
);

exports.saveTrainingAnswers = onCall(
  {region: "us-central1", maxInstances: 10, timeoutSeconds: 30, memory: "256MiB"},
  async request => {
    const {user, bank} = await getTrainingContext(request);
    if (!bank) throw new HttpsError("permission-denied", "La evaluación no está habilitada.");
    const attemptId = String(request.data?.attemptId || ""), raw = request.data?.answers;
    if (!/^[A-Za-z0-9]{20}$/.test(attemptId) || !raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpsError("invalid-argument", "Respuestas no válidas.");
    const ref = getFirestore().doc(`${TRAINING_ATTEMPTS}/${attemptId}`), now = require("firebase-admin/firestore").Timestamp.now();
    const result = await getFirestore().runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data().accountUid !== user.uid) throw new HttpsError("permission-denied", "Intento no válido.");
      const old = snap.data();
      if (old.status !== "active" || trainingExpiry(old) <= now.toMillis()) throw new HttpsError("failed-precondition", "El tiempo de evaluación terminó.");
      const next = JSON.parse(old.answers || "{}");
      for (const [id, value] of Object.entries(raw)) {
        const q = bank.questions.find(item => item.id === id);
        if (!q) throw new HttpsError("invalid-argument", "La pregunta no pertenece al cuestionario.");
        if (q.type === "choice" && (!Number.isInteger(value) || value < 0 || value >= q.options.length)) throw new HttpsError("invalid-argument", "Respuesta de selección no válida.");
        if (q.type === "case" && (typeof value !== "string" || value.length > 3000)) throw new HttpsError("invalid-argument", "Respuesta de caso no válida.");
        next[id] = value;
      }
      const serialized = JSON.stringify(next);
      if (serialized.length > 60000) throw new HttpsError("resource-exhausted", "Las respuestas exceden el límite.");
      tx.update(ref, {answers:serialized,updatedAt:now,updatedBy:user.uid,rev:Number(old.rev||1)+1});
      return {saved:true};
    });
    return result;
  }
);

exports.saveTrainingDay = onCall(
  {region: "us-central1", maxInstances: 10, timeoutSeconds: 30, memory: "256MiB"},
  async request => {
    const {user, bank, permissionRef} = await getTrainingContext(request);
    const attemptId = String(request.data?.attemptId || ""), day = Number(request.data?.day);
    if (!/^[A-Za-z0-9]{20}$/.test(attemptId) || !Number.isInteger(day) || day < 1 || day > 10) throw new HttpsError("invalid-argument", "Jornada no válida.");
    const ref = getFirestore().doc(`${TRAINING_ATTEMPTS}/${attemptId}`), now = require("firebase-admin/firestore").Timestamp.now();
    return getFirestore().runTransaction(async tx => {
      const [snap,permSnap] = await Promise.all([tx.get(ref),tx.get(permissionRef)]);
      if (!snap.exists || snap.data().accountUid !== user.uid) throw new HttpsError("permission-denied", "Intento no válido.");
      const old = snap.data(), answers = JSON.parse(old.answers || "{}");
      const perm = permSnap.exists ? permSnap.data() : {};
      const savedField = savedDayField(old.purpose), savedThrough = Number(perm[savedField] ?? old.savedThrough ?? 0);
      if (old.status !== "active" || trainingExpiry(old) <= now.toMillis()) throw new HttpsError("failed-precondition", "El tiempo de evaluación terminó.");
      if (day !== savedThrough + 1) throw new HttpsError("failed-precondition", "Guarda cada jornada en orden antes de avanzar.");
      const qs = bank.questions.filter(q => q.day === day);
      if (!qs.length || qs.some(q => !(q.id in answers) || (q.type === "case" && !String(answers[q.id] || "").trim()))) throw new HttpsError("failed-precondition", "Responde todas las preguntas de esta jornada antes de guardarla.");
      tx.update(permissionRef, {[savedField]:day,progressUpdatedAt:now,progressUpdatedBy:user.uid});
      return {savedThrough:day,complete:day === 10};
    });
  }
);

exports.finishTrainingEvaluation = onCall(
  {region: "us-central1", maxInstances: 10, timeoutSeconds: 30, memory: "256MiB"},
  async request => {
    const {user, bank, permissionRef} = await getTrainingContext(request);
    const attemptId = String(request.data?.attemptId || "");
    if (!/^[A-Za-z0-9]{20}$/.test(attemptId)) throw new HttpsError("invalid-argument", "Intento no válido.");
    const ref = getFirestore().doc(`${TRAINING_ATTEMPTS}/${attemptId}`), now = require("firebase-admin/firestore").Timestamp.now();
    return getFirestore().runTransaction(async tx => {
      const [snap,permSnap] = await Promise.all([tx.get(ref),tx.get(permissionRef)]);
      if (!snap.exists || snap.data().accountUid !== user.uid) throw new HttpsError("permission-denied", "Intento no válido.");
      const old = snap.data();
      if (old.status !== "active") return {status:old.status};
      const expired = trainingExpiry(old) <= now.toMillis();
      const perm = permSnap.exists ? permSnap.data() : {};
      if (!expired && Number(perm[savedDayField(old.purpose)] ?? old.savedThrough ?? 0) !== 10) throw new HttpsError("failed-precondition", "Guarda las diez jornadas antes de entregar la evaluación.");
      tx.update(ref, submittedAttempt(old, expired, now));
      return {status:"submitted",expired};
    });
  }
);

exports.getTrainingEvaluationState = onCall(
  {region: "us-central1", maxInstances: 10, timeoutSeconds: 60, memory: "256MiB"},
  async request => {
    const {user, permission, bank} = await getTrainingContext(request, false);
    const db = getFirestore();
    const [requests, attemptsSnap] = await Promise.all([
      db.collection(TRAINING_REQUESTS).where("uid", "==", user.uid).get(),
      db.collection(TRAINING_ATTEMPTS).where("accountUid", "==", user.uid).get()
    ]);
    const attempts = attemptsSnap.docs.map(d => ({id:d.id,...d.data()})).sort((a,b)=>b.startedAt.toMillis()-a.startedAt.toMillis());
    let latest = attempts[0] || null;
    if (latest?.status === "active" && trainingExpiry(latest) <= Date.now()) {
      const ref = db.doc(`${TRAINING_ATTEMPTS}/${latest.id}`), now = require("firebase-admin/firestore").Timestamp.now();
      await ref.update(submittedAttempt(latest,true,now));
      latest = {...latest,...submittedAttempt(latest,true,now)};
    }
    const requestRows=requests.docs.map(d=>d.data()).sort((a,b)=>b.requestedAt.toMillis()-a.requestedAt.toMillis());
    const pending=requestRows.find(r=>r.status==="pending");
    const pendingInitial=requestRows.some(r=>r.kind==="inicial"&&r.status==="pending"),pendingRefuerzo=requestRows.some(r=>r.kind==="refuerzo"&&r.status==="pending");
    let status="unauthorized";
    if(latest?.status==="active")status="active";
    else if(latest?.status==="submitted"||latest?.status==="graded")status="completed";
    else if(permission.initialEnabled||permission.refuerzoEnabled)status="enabled";
    else if(pending)status="pending";
    const publicAttempt=latest?{...latest,savedThrough:Number(permission[savedDayField(latest.purpose)]??latest.savedThrough??0)}:null;
    const dayBank=latest?.status==="active"&&bank?cleanTrainingDay(bank,Math.min(publicAttempt.savedThrough+1,10)):null;
    return {status,attempt:publicTrainingAttempt(publicAttempt),pendingKind:pending?.kind||"",pendingInitial,pendingRefuerzo,initialEnabled:!!permission.initialEnabled,refuerzoEnabled:!!permission.refuerzoEnabled,canRequestRefuerzo:attempts.some(a=>a.status==="submitted"||a.status==="graded")&&!permission.refuerzoEnabled&&!pendingRefuerzo,bank:dayBank};
  }
);

