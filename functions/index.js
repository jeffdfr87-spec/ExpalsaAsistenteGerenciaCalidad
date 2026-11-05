const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore} = require("firebase-admin/firestore");

initializeApp();

exports.manageTrainingGroups = onCall(
  {region:'us-central1',maxInstances:3,timeoutSeconds:60,memory:'256MiB'},
  require('./training-groups').handler(getFirestore(), requireTrainingAdmin)
);

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
const TRAINING_VIEWERS = new Set(["fabio@expalsaevaluations.com","karina@expalsaevaluations.com"]);
const TRAINING_VIEWER_UIDS = {"fabio@expalsaevaluations.com":"pC14usDq9pWuVoqLOv6CDlwBdmK2","karina@expalsaevaluations.com":"96Q1hgrEKyR2zVL8CfCXf1xe4al2"};

exports.getTrainingProgressView=onCall({region:"us-central1",maxInstances:5,timeoutSeconds:60},async request=>{
  if(!request.auth||TRAINING_VIEWER_UIDS[String(request.auth.token.email||"").toLowerCase()]!==request.auth.uid)throw new HttpsError("permission-denied","Acceso de consulta no autorizado.");
  const db=getFirestore();
  const [participants,sessions,attempts,bankDoc,groupConfig]=await Promise.all([db.collection("expalsa_capacitacion_2026_participantes").get(),db.collection("expalsa_capacitacion_2026_sesiones").get(),db.collection(TRAINING_ATTEMPTS).get(),db.doc(TRAINING_BANK).get(),db.collection("expalsa_capacitacion_2026_grupos").get()]);
  const assistants=new Map(groupConfig.docs.filter(d=>d.data().kind==="assistant").map(d=>{const a=d.data();return [a.id||d.id.replace(/^assistant_/,""),a.name||""];})),groups=groupConfig.docs.map(d=>d.data()).filter(g=>Number.isInteger(g.number)&&g.kind!=="assistant").map(g=>({number:g.number,assistantId:g.assistantId||"",name:assistants.get(g.assistantId)||g.name||""})).sort((a,b)=>a.number-b.number);
  const people=[];for(const doc of participants.docs){const p=doc.data();if(p.active!==true||p.deleted===true||!p.accountUid)continue;const [access,identity,photo]=await Promise.all([db.doc(`expalsa_calidad_accesos/${p.accountUid}`).get(),db.doc(`expalsa_calidad_identidades/${p.accountUid}`).get(),db.doc(`expalsa_calidad_fotos_perfil/${p.accountUid}`).get()]);if(!access.exists||access.data().active!==true||access.data().deleted===true)continue;const i=identity.exists?identity.data():{},f=photo.exists?photo.data():{};people.push({id:doc.id,accountUid:p.accountUid,active:true,deleted:false,name:[i.firstNames,i.lastNames].filter(Boolean).join(" ")||p.name||"Inspector",groupNumber:Number.isInteger(p.groupNumber)?p.groupNumber:1,firstNames:i.firstNames||"",lastNames:i.lastNames||"",employeeCode:i.employeeId||"",station:p.station||"",portrait:typeof f.jpeg==="string"&&/^\/9j\/[A-Za-z0-9+/=]+$/.test(f.jpeg)?"data:image/jpeg;base64,"+f.jpeg:"",createdAtMs:p.createdAt?.toMillis?.()||0});}
  const ids=new Set(people.map(p=>p.id)),rows=sessions.docs.map(d=>({id:d.id,...d.data()})).filter(s=>ids.has(s.personId)).map(s=>({id:s.id,personId:s.personId,day:s.day,status:s.status,ratings:s.ratings||{},station:s.station||"",date:s.date||""}));
  const bank=bankDoc.exists?bankDoc.data():{questions:[]},records=attempts.docs.map(d=>({id:d.id,...d.data()})),theory={};
  for(const p of people){const record=records.filter(r=>r.accountUid===p.accountUid&&r.scope===0&&r.status==="graded").sort((a,b)=>(b.startedAt?.toMillis?.()||0)-(a.startedAt?.toMillis?.()||0)||String(b.id).localeCompare(String(a.id)))[0];let assessed=[];
    if(record&&record.bankId===bank.version){let answers={},marks={};try{answers=JSON.parse(record.answers||"{}");marks=JSON.parse(record.marks||"{}");}catch{}assessed=(bank.questions||[]).map(q=>({id:q.competency,points:q.type==="choice"?(answers[q.id]===q.answer?1:0):Number.isInteger(marks[q.id])&&marks[q.id]>=0&&marks[q.id]<=4?marks[q.id]/4:null}));}
    const valid=assessed.length>0&&assessed.every(r=>r.points!==null),average=valid?assessed.reduce((n,r)=>n+r.points,0)/assessed.length*100:null,points=Array.from({length:10},(_,i)=>{const id="C"+(i+1),own=assessed.filter(r=>r.id===id);return {id,score:valid&&own.length?own.reduce((n,r)=>n+r.points,0)/own.length*100:null,attempts:valid?1:0,questions:valid?own.length:0};}),ownAttempts=valid?[{key:"1",stage:1,number:1,status:"graded",score:average,verified:true,competencies:points.map(p=>({id:p.id,score:p.score,questions:p.questions})),questions:[],date:record.submittedAt?.toDate?.().toLocaleString("es-EC",{timeZone:"America/Guayaquil"})||""}]:[];
    theory[p.id]={attempts:ownAttempts,average,completed:ownAttempts.length,verified:ownAttempts.length,points,weak:points.filter(p=>p.score!==null&&p.score<85),strong:points.filter(p=>p.score!==null&&p.score>=85),needsReinforcement:average!==null&&average<85,unavailable:0,linkStatus:"linked",note:valid?"Último intento integral calificado.":"Sin evaluación integral calificada."};delete p.createdAtMs;
  }
  return {people,sessions:rows,theory,groups,records:[],photos:{},photoErrors:[]};
});

exports.accountRecovery = onCall({region:"us-central1",maxInstances:3,timeoutSeconds:60},async request=>{
  const action=String(request.data?.action||""),db=getFirestore(),auth=getAuth(),crypto=require("node:crypto"),now=Date.now();
  const records=db.collection("expalsa_calidad_recuperaciones");
  const digest=value=>crypto.createHash("sha256").update(value).digest("hex");
  if(action==="request"||action==="complete"){
    let email=String(request.data?.username||"").trim().toLowerCase();if(!email.includes("@"))email+="@"+DOMAIN;
    if(!/^[a-z0-9][a-z0-9._-]{1,38}[a-z0-9]@expalsaevaluations\.com$/.test(email))throw new HttpsError("invalid-argument","Revisa tu usuario.");
    let user;try{user=await auth.getUserByEmail(email);}catch(e){if(e.code!=="auth/user-not-found")throw e;}
    if(action==="request"){
      if(user&&!user.disabled)await db.runTransaction(async tx=>{const ref=records.doc(user.uid),old=await tx.get(ref);if(old.exists&&(old.data().status==="pending"||(old.data().status==="issued"&&old.data().expiresAtMs>now)||now-Number(old.data().requestedAtMs||0)<60000))return;tx.set(ref,{uid:user.uid,email,status:"pending",requestedAtMs:now,attempts:0});});
      return {message:"Solicitud recibida. Contacta al administrador para verificar tu identidad."};
    }
    const password=String(request.data?.password||""),code=String(request.data?.code||"").trim();
    if(password.length<12||password.length>128)throw new HttpsError("invalid-argument","La nueva contraseña debe tener de 12 a 128 caracteres.");
    if(!user||user.disabled)throw new HttpsError("permission-denied","Clave temporal inválida o vencida.");
    const ref=records.doc(user.uid);
    const accepted=await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)return false;const d=snap.data();if(d.status!=="issued"||d.expiresAtMs<=now||Number(d.attempts||0)>=5)return false;const valid=typeof d.codeHash==="string"&&crypto.timingSafeEqual(Buffer.from(digest(code)),Buffer.from(d.codeHash));if(!valid){tx.update(ref,{attempts:Number(d.attempts||0)+1});return false;}tx.update(ref,{status:"processing",codeHash:"",claimedAtMs:now});return true;});
    if(!accepted)throw new HttpsError("permission-denied","Clave temporal inválida o vencida.");
    try{await auth.updateUser(user.uid,{password});await auth.revokeRefreshTokens(user.uid);await ref.update({status:"completed",completedAtMs:Date.now()});return {saved:true};}
    catch(e){await ref.update({status:"failed",failedAtMs:Date.now()});throw new HttpsError("internal","No se completó el cambio. Solicita una nueva clave al administrador.");}
  }
  const admin=await requireTrainingAdmin(request);
  if(action==="list"){
    const result=await auth.listUsers(1000,request.data?.pageToken||undefined),[identities,accesses,recoveries]=await Promise.all([db.collection("expalsa_calidad_identidades").get(),db.collection("expalsa_calidad_accesos").get(),records.get()]);
    const identity=new Map(identities.docs.map(d=>[d.id,d.data()])),access=new Map(accesses.docs.map(d=>[d.id,d.data()])),pending=new Map(recoveries.docs.map(d=>[d.id,d.data()]));
    return {users:result.users.map(u=>{const i=identity.get(u.uid)||{},a=access.get(u.uid)||{},r=pending.get(u.uid)||{};return {uid:u.uid,email:u.email||"",name:[i.firstNames,i.lastNames].filter(Boolean).join(" ")||u.displayName||"",role:u.email===TRAINING_ADMIN?"administrador":a.role||"Sin rol asignado",disabled:u.disabled,deleted:!!a.deleted,recovery:r.status||"",expiresAtMs:r.expiresAtMs||0};}),pageToken:result.pageToken||""};
  }
  const uid=String(request.data?.uid||"");if(!uid||uid.includes("/")||uid.length>128)throw new HttpsError("invalid-argument","Cuenta no válida.");
  if(action==="issue"){
    const user=await auth.getUser(uid);if(user.disabled)throw new HttpsError("failed-precondition","La cuenta está deshabilitada.");
    const code=crypto.randomBytes(18).toString("hex"),expiresAtMs=now+30*60000;
    await records.doc(uid).set({uid,email:user.email||"",status:"issued",codeHash:digest(code),expiresAtMs,attempts:0,issuedAtMs:now,issuedBy:admin.uid});
    return {code,expiresAtMs};
  }
  if(action==="reject"){await records.doc(uid).set({status:"rejected",codeHash:"",reviewedAtMs:now,reviewedBy:admin.uid},{merge:true});return {saved:true};}
  throw new HttpsError("invalid-argument","Acción no válida.");
});

exports.inspectorAccountAction = onCall({region:"us-central1",maxInstances:10,timeoutSeconds:30}, async request => {
  const db=getFirestore(), now=require("firebase-admin/firestore").Timestamp.now();
  const action=String(request.data?.action||"");
  if(!request.auth)throw new HttpsError("unauthenticated","Inicia sesión.");
  const uid=request.auth.uid,email=String(request.auth.token.email||"").toLowerCase();
  if(action==="requestAccess"){
    if(!email.endsWith("@"+DOMAIN)||email===TRAINING_ADMIN)throw new HttpsError("permission-denied","Cuenta no válida.");
    const ref=db.doc(`expalsa_calidad_solicitudes/${uid}`);
    return db.runTransaction(async tx=>{
      const [access,old]=await Promise.all([tx.get(db.doc(`expalsa_calidad_accesos/${uid}`)),tx.get(ref)]);
      if(access.exists&&access.data().active===true&&!access.data().deleted)return {status:"approved"};
      if(old.exists&&old.data().status==="pending")return {status:"pending"};
      tx.set(ref,{email,status:"pending",createdAt:now});return {status:"pending"};
    });
  }
  if(action==="reviewAccess"){
    await requireTrainingAdmin(request);const owner=String(request.data?.uid||"");
    if(!owner||owner.includes("/"))throw new HttpsError("invalid-argument","Cuenta no válida.");
    const assignedRole=String(request.data?.role||"inspector");
    if(request.data?.approve===true&&!["inspector","asistente","coordinador","jefe","gerente","subgerente"].includes(assignedRole))throw new HttpsError("invalid-argument","Rol no válido.");
    const ref=db.doc(`expalsa_calidad_solicitudes/${owner}`),access=db.doc(`expalsa_calidad_accesos/${owner}`),program=db.doc(`expalsa_calidad_programas/${owner}`);
    return db.runTransaction(async tx=>{
      const [snap,p]=await Promise.all([tx.get(ref),tx.get(program)]);
      if(!snap.exists||snap.data().status!=="pending")throw new HttpsError("failed-precondition","La solicitud ya fue atendida.");
      if(request.data?.approve===true){tx.set(access,{email:snap.data().email,active:true,deleted:false,role:assignedRole,note:"Acceso aprobado desde Notificaciones"},{merge:true});if(p.exists)tx.update(program,{active:true});tx.update(ref,{status:"approved",assignedRole,reviewedAt:now,reviewedBy:uid});}
      else tx.delete(ref);
      return {saved:true};
    });
  }
  const changes=db.collection("expalsa_calidad_cambios_perfil");
  if(action==="listProfiles"||action==="reviewProfile"){
    await requireTrainingAdmin(request);
    if(action==="listProfiles"){const rows=await changes.where("status","==","pending").get();return {requests:rows.docs.map(d=>({uid:d.id,email:d.data().email,status:"pending"}))};}
    const owner=String(request.data?.uid||"");if(!owner||owner.includes("/"))throw new HttpsError("invalid-argument","Cuenta no válida.");
    return db.runTransaction(async tx=>{const ref=changes.doc(owner),snap=await tx.get(ref);if(!snap.exists||snap.data().status!=="pending")throw new HttpsError("failed-precondition","La solicitud ya fue atendida.");tx.update(ref,{status:request.data?.approve===true?"enabled":"rejected",reviewedAt:now,reviewedBy:uid});return {saved:true};});
  }
  await trainingUser(request);
  if(action==="savePhoto"){
    const image=request.data?.image||{};
    if(typeof image.jpeg!=="string"||image.jpeg.length>280000||!/^\/9j\/[A-Za-z0-9+/=]+$/.test(image.jpeg)||!Number.isInteger(image.width)||image.width<1||image.width>1600||!Number.isInteger(image.height)||image.height<1||image.height>1600||!Number.isInteger(image.size)||image.size<1||image.size>210000||Buffer.from(image.jpeg,"base64").length!==image.size)throw new HttpsError("invalid-argument","La fotografía no es válida.");
    await db.doc(`expalsa_calidad_fotos_perfil/${uid}`).set({uid,path:`expalsa_calidad_fotos/${uid}/perfil.jpg`,origin:"gallery",uploadedBy:uid,storage:"firestore",jpeg:image.jpeg,width:image.width,height:image.height,size:image.size,updatedAt:now});return {saved:true};
  }
  const permit=changes.doc(uid),identity=db.doc(`expalsa_calidad_identidades/${uid}`);
  if(action==="getProfile"){const [p,i]=await Promise.all([permit.get(),identity.get()]);const d=i.exists?i.data():{};return {status:p.exists?p.data().status:"none",firstNames:d.firstNames||"",lastNames:d.lastNames||"",employeeId:d.employeeId||""};}
  if(action==="requestProfile")return db.runTransaction(async tx=>{const snap=await tx.get(permit);if(snap.exists&&["pending","enabled"].includes(snap.data().status))return {status:snap.data().status};tx.set(permit,{uid,email,status:"pending",requestedAt:now});return {status:"pending"};});
  if(action==="saveProfile"){
    const firstNames=String(request.data?.firstNames||"").trim().replace(/\s+/g," "),lastNames=String(request.data?.lastNames||"").trim().replace(/\s+/g," "),employeeId=String(request.data?.employeeId||"").trim();
    if(firstNames.length<2||firstNames.length>100||lastNames.length<2||lastNames.length>100||! /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(employeeId))throw new HttpsError("invalid-argument","Revisa nombres, apellidos y código.");
    return db.runTransaction(async tx=>{const [p,i,all]=await Promise.all([tx.get(permit),tx.get(identity),tx.get(db.collection("expalsa_calidad_identidades"))]);if(!p.exists||p.data().status!=="enabled")throw new HttpsError("permission-denied","Solicita autorización para modificar tus datos.");if(!i.exists)throw new HttpsError("failed-precondition","Completa primero tu perfil.");if(all.docs.some(d=>d.id!==uid&&String(d.data().employeeId||"").toLowerCase()===employeeId.toLowerCase()))throw new HttpsError("already-exists","El código pertenece a otro inspector.");tx.update(identity,{firstNames,lastNames,employeeId,updatedAt:now});tx.update(permit,{status:"used",usedAt:now});return {saved:true};});
  }
  throw new HttpsError("invalid-argument","Acción no válida.");
});

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
  if(TRAINING_VIEWERS.has(user.email))throw new HttpsError("permission-denied","Esta cuenta tiene acceso de consulta a los gráficos de avance.");
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
  const bank=bankSnap.data(),questions=bank.questions||[];
  if(questions.length!==60||new Set(questions.map(q=>q.id)).size!==60||questions.some(q=>typeof q.id!=="string"||!q.id||!Number.isInteger(q.day)||q.day<1||q.day>10)||Array.from({length:10},(_,i)=>questions.filter(q=>q.day===i+1).length).some(n=>n!==6))throw new HttpsError("failed-precondition","El cuestionario requiere revisión de sus identificadores y jornadas.");
  return {user, permission, permissionRef, bank, bankRef: db.doc(TRAINING_BANK)};
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
    const {user, bank, permissionRef} = await getTrainingContext(request);
    if (!bank) throw new HttpsError("permission-denied", "La evaluación no está habilitada.");
    const attemptId = String(request.data?.attemptId || ""), raw = request.data?.answers;
    if (!/^[A-Za-z0-9]{20}$/.test(attemptId) || !raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpsError("invalid-argument", "Respuestas no válidas.");
    const ref = getFirestore().doc(`${TRAINING_ATTEMPTS}/${attemptId}`), now = require("firebase-admin/firestore").Timestamp.now();
    const result = await getFirestore().runTransaction(async tx => {
      const [snap,permSnap] = await Promise.all([tx.get(ref),tx.get(permissionRef)]);
      if (!snap.exists || snap.data().accountUid !== user.uid) throw new HttpsError("permission-denied", "Intento no válido.");
      const old = snap.data();
      if (old.status !== "active" || trainingExpiry(old) <= now.toMillis()) throw new HttpsError("failed-precondition", "El tiempo de evaluación terminó.");
      const perm=permSnap.exists?permSnap.data():{},currentDay=Number(perm[savedDayField(old.purpose)]??old.savedThrough??0)+1;
      const next = JSON.parse(old.answers || "{}");
      for (const [id, value] of Object.entries(raw)) {
        const q = bank.questions.find(item => item.id === id);
        if (!q) throw new HttpsError("invalid-argument", "La pregunta no pertenece al cuestionario.");
        if(q.day!==currentDay)throw new HttpsError("failed-precondition","Solo puedes responder la jornada actual. Las jornadas guardadas están bloqueadas.");
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

