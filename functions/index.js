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
