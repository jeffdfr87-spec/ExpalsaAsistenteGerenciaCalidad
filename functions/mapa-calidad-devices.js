const crypto = require("node:crypto");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore, FieldValue, Timestamp} = require("firebase-admin/firestore");

const REGION = "us-central1";
const ADMIN_EMAIL = "jefferson@expalsaevaluations.com";
const QUALITY_ADMIN_EMAILS = new Set([ADMIN_EMAIL, "fabio@expalsaevaluations.com", "karina@expalsaevaluations.com"]);
const DEVICES = "expalsa_calidad_dispositivos";

function deviceRef(db, uid, deviceId) {
  return db.doc(`${DEVICES}/${uid}/equipos/${deviceId}`);
}

async function identity(request, requireAdmin = false) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Inicia sesión para continuar.");
  const uid = request.auth.uid;
  const email = String(request.auth.token.email || "").trim().toLowerCase();
  const db = getFirestore();
  let admin = false;
  if (email === ADMIN_EMAIL) {
    const snap = await db.doc("expalsa_calidad_config/administrador").get();
    admin = snap.exists && snap.data().uid === uid && snap.data().email === email;
  }
  if (QUALITY_ADMIN_EMAILS.has(email) && email !== ADMIN_EMAIL) admin = true;
  if (requireAdmin && !admin) throw new HttpsError("permission-denied", "Acción exclusiva del administrador.");
  if (!admin) {
    const access = await db.doc(`expalsa_calidad_accesos/${uid}`).get();
    if (!access.exists || access.data().active !== true || access.data().deleted === true || access.data().email !== email) {
      throw new HttpsError("permission-denied", "La cuenta no está habilitada en Evaluaciones EXPALSA.");
    }
  }
  return {uid, email, admin};
}

function validDeviceId(value) {
  return typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value);
}

function validPublicKey(key) {
  return key && key.kty === "EC" && key.crv === "P-256" &&
    typeof key.x === "string" && /^[A-Za-z0-9_-]{43}$/.test(key.x) &&
    typeof key.y === "string" && /^[A-Za-z0-9_-]{43}$/.test(key.y) &&
    Object.keys(key).every(k => ["kty", "crv", "x", "y", "ext", "key_ops"].includes(k));
}

function safeLabel(value) {
  return typeof value === "string" ? value.trim().replace(/[<>\u0000-\u001f]/g, "").slice(0, 60) || "Dispositivo" : "Dispositivo";
}

exports.beginCalidadDevice = onCall({region: REGION, maxInstances: 10, timeoutSeconds: 30}, async request => {
  const actor = await identity(request);
  const {deviceId, publicKey} = request.data || {};
  if (!validDeviceId(deviceId) || !validPublicKey(publicKey)) throw new HttpsError("invalid-argument", "Identidad de dispositivo no válida.");
  const db = getFirestore(), ref = deviceRef(db, actor.uid, deviceId);
  const label = safeLabel(request.data.label);
  const encodedKey = JSON.stringify({kty: publicKey.kty, crv: publicKey.crv, x: publicKey.x, y: publicKey.y});
  const result = await db.runTransaction(async tx => {
    const existing = await tx.get(ref);
    if (existing.exists) {
      const data = existing.data();
      if (!data.publicKey || data.publicKey.kty !== publicKey.kty || data.publicKey.crv !== publicKey.crv ||
        data.publicKey.x !== publicKey.x || data.publicKey.y !== publicKey.y) {
        throw new HttpsError("already-exists", "Este dispositivo ya tiene otra identidad registrada.");
      }
      return {status: data.status};
    }
    const all = await db.collection(`${DEVICES}/${actor.uid}/equipos`).get();
    if (all.size >= 10) throw new HttpsError("resource-exhausted", "Se alcanzó el máximo de 10 dispositivos registrados.");
    const status = actor.admin ? "active" : "pending";
    tx.create(ref, {
      uid: actor.uid, email: actor.email, deviceId, publicKey: JSON.parse(encodedKey),
      label, status, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      createdBy: actor.uid
    });
    return {status};
  });
  return {...result, deviceId};
});

exports.listCalidadDevices = onCall({region: REGION, maxInstances: 5, timeoutSeconds: 30}, async request => {
  await identity(request, true);
  const db = getFirestore();
  const snapshot = await db.collectionGroup("equipos").get();
  return {devices: snapshot.docs
    .filter(d => d.ref.path.startsWith(`${DEVICES}/`))
    .map(d => ({uid: d.data().uid, email: d.data().email, deviceId: d.data().deviceId, label: d.data().label,
      status: d.data().status, createdAt: d.data().createdAt?.toMillis?.() || 0}))
    .sort((a,b) => (a.status === "pending" ? -1 : 0) - (b.status === "pending" ? -1 : 0) || b.createdAt - a.createdAt)};
});

exports.setCalidadDeviceStatus = onCall({region: REGION, maxInstances: 5, timeoutSeconds: 30}, async request => {
  await identity(request, true);
  const {uid, deviceId, status} = request.data || {};
  if (typeof uid !== "string" || uid.length < 10 || !validDeviceId(deviceId) || !["active", "revoked"].includes(status)) {
    throw new HttpsError("invalid-argument", "Datos de autorización no válidos.");
  }
  const ref = deviceRef(getFirestore(), uid, deviceId), snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "No se encontró el dispositivo.");
  await ref.update({status, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid});
  return {updated: true, status};
});

exports.challengeCalidadDevice = onCall({region: REGION, maxInstances: 10, timeoutSeconds: 30}, async request => {
  const actor = await identity(request);
  const {deviceId} = request.data || {};
  if (!validDeviceId(deviceId)) throw new HttpsError("invalid-argument", "Identidad de dispositivo no válida.");
  const ref = deviceRef(getFirestore(), actor.uid, deviceId), snap = await ref.get();
  if (!snap.exists || snap.data().status !== "active") throw new HttpsError("permission-denied", "El administrador aún no ha autorizado este dispositivo.");
  const challenge = crypto.randomBytes(32).toString("base64url");
  await ref.update({challenge, challengeExpiresAt: Timestamp.fromMillis(Date.now() + 120000)});
  return {challenge};
});

exports.exchangeCalidadDevice = onCall({region: REGION, maxInstances: 10, timeoutSeconds: 30}, async request => {
  const actor = await identity(request);
  const {deviceId, signature} = request.data || {};
  if (!validDeviceId(deviceId) || typeof signature !== "string" || !/^[A-Za-z0-9_-]{80,100}$/.test(signature)) {
    throw new HttpsError("invalid-argument", "Prueba de dispositivo no válida.");
  }
  const db = getFirestore(), ref = deviceRef(db, actor.uid, deviceId), snap = await ref.get();
  if (!snap.exists || snap.data().status !== "active") throw new HttpsError("permission-denied", "El dispositivo no está autorizado.");
  const data = snap.data();
  if (typeof data.challenge !== "string" || !data.challengeExpiresAt || data.challengeExpiresAt.toMillis() < Date.now()) {
    throw new HttpsError("failed-precondition", "La prueba venció. Intenta de nuevo.");
  }
  let verified = false;
  try {
    const key = crypto.createPublicKey({key: data.publicKey, format: "jwk"});
    const rawSignature = Buffer.from(signature, "base64url");
    verified = crypto.verify("sha256", Buffer.from(data.challenge), {key, dsaEncoding: "ieee-p1363"}, rawSignature);
  } catch (_) { verified = false; }
  if (!verified) throw new HttpsError("permission-denied", "La clave de este dispositivo no coincide.");
  const consumed = await db.runTransaction(async tx => {
    const current = await tx.get(ref);
    if (!current.exists || current.data().status !== "active" || current.data().challenge !== data.challenge ||
      !current.data().challengeExpiresAt || current.data().challengeExpiresAt.toMillis() < Date.now()) return false;
    tx.update(ref, {challenge: FieldValue.delete(), challengeExpiresAt: FieldValue.delete()});
    return true;
  });
  if (!consumed) throw new HttpsError("failed-precondition", "La prueba ya se utilizó. Intenta de nuevo.");
  const token = await getAuth().createCustomToken(actor.uid, {calidadDeviceId: deviceId});
  return {token};
});

