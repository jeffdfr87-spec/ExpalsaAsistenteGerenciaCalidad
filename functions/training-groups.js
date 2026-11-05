const {HttpsError} = require('firebase-functions/v2/https');
const {FieldValue} = require('firebase-admin/firestore');
const PEOPLE = 'expalsa_capacitacion_2026_participantes';
const GROUPS = 'expalsa_capacitacion_2026_grupos';
const LEGACY = 'expalsa_capacitacion_2026_equipo/responsable';
const STATIONS = ['M02','M05','M06','M07','M08','M09','M10','B12','B345','T01'];
const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const active = p => p.active === true && p.deleted !== true;
const groupOf = p => p.groupNumber || 1;
function reject(message) { throw new HttpsError('failed-precondition', message); }
function validateAssignment(data, people, group) {
  if (!group.name) reject('Guarda primero el asistente responsable del grupo.');
  if (typeof data.name !== 'string' || data.name.trim().length < 2 || data.name.trim().length > 100 || !STATIONS.includes(data.station)) reject('Introduce el nombre completo y selecciona un área válida.');
  if (typeof data.email !== 'string' || data.email.length > 150 || typeof data.accountUid !== 'string' || data.accountUid.length > 128) reject('La cuenta o el correo no son válidos.');
  const assigned = people.filter(active), members = assigned.filter(p => groupOf(p) === group.number);
  if (members.length >= 10) reject('El grupo ya tiene 10 inspectores.');
  if (members.some(p => p.station === data.station)) reject('El área ya está ocupada en este grupo.');
  const duplicate = assigned.find(p => (data.accountUid && p.accountUid === data.accountUid) || (data.email && normalized(p.email) === normalized(data.email)) || normalized(p.name) === normalized(data.name));
  if (duplicate) reject('El inspector ya está asignado al Grupo ' + groupOf(duplicate) + '. Retíralo de ese grupo antes de reasignarlo.');
}
function validateResponsible(name, jpeg) {
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) reject('Escribe el nombre completo del asistente responsable.');
  if (typeof jpeg !== 'string' || jpeg.length > 170000 || (jpeg && !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(jpeg))) reject('La fotografía no es válida.');
}
function handler(db, requireAdmin) {
  return async request => {
    const admin = await requireAdmin(request), data = request.data || {}, action = data.action;
    if (!['list','create','saveResponsible','add','remove'].includes(action)) throw new HttpsError('invalid-argument', 'Acción no válida.');
    return db.runTransaction(async tx => {
      // The lock serializes membership changes, including two concurrent registrations.
      const lock = db.collection(GROUPS).doc('_lock');
      await tx.get(lock);
      const groupsSnap = await tx.get(db.collection(GROUPS));
      const legacySnap = await tx.get(db.doc(LEGACY));
      const peopleSnap = await tx.get(db.collection(PEOPLE));
      const groups = groupsSnap.docs.filter(d => d.id !== '_lock').map(d => d.data());
      if (!groups.some(g => g.number === 1)) groups.push({number:1,name:legacySnap.data()?.name || '',jpeg:legacySnap.data()?.jpeg || '',rev:legacySnap.data()?.rev || 0});
      groups.sort((a,b) => a.number-b.number);
      if (action === 'list') return {groups};
      const now = FieldValue.serverTimestamp(), audit = {updatedAt:now,updatedBy:admin.uid};
      if (action === 'create') {
        const number = Math.max(...groups.map(g => g.number)) + 1;
        if (number > 9999) reject('Se alcanzó el límite de grupos.');
        tx.set(db.collection(GROUPS).doc(String(number)), {number,name:'',jpeg:'',rev:0,createdAt:now,...audit});
        tx.set(lock, audit);
        return {number};
      }
      const group = groups.find(g => g.number === data.groupNumber);
      if (!group) reject('El grupo ya no está disponible. Actualiza la página.');
      if (action === 'saveResponsible') {
        validateResponsible(data.name, data.jpeg);
        if (group.rev !== data.rev) reject('El responsable cambió en otra ventana. Actualiza antes de guardar.');
        const next = {...group,name:data.name.trim(),jpeg:data.jpeg,rev:group.rev+1,...audit};
        tx.set(db.collection(GROUPS).doc(String(group.number)), next);
        tx.set(lock, audit);
        return {rev:next.rev};
      }
      if (action === 'remove') {
        const person = peopleSnap.docs.find(d => d.id === data.personId);
        if (!person || !active(person.data()) || groupOf(person.data()) !== group.number) reject('El inspector ya no pertenece a este grupo.');
        tx.update(person.ref, {active:false,...audit});
      } else {
        let assignment = {name:data.name,email:data.email,accountUid:data.accountUid,station:data.station};
        if (typeof assignment.accountUid !== 'string' || assignment.accountUid.length > 128 || assignment.accountUid.includes('/')) reject('La cuenta no es válida.');
        // Resolve linked names on the server so a renamed account cannot evade matching.
        if (assignment.accountUid) {
          const access = await tx.get(db.collection('expalsa_calidad_accesos').doc(assignment.accountUid));
          if (!access.exists || !active(access.data())) reject('La cuenta seleccionada no está habilitada.');
          assignment.email = access.data().email || '';
          const identity = await tx.get(db.collection('expalsa_calidad_identidades').doc(assignment.accountUid));
          const canonical = [identity.data()?.firstNames,identity.data()?.lastNames].filter(Boolean).join(' ').trim();
          if (canonical) assignment.name = canonical;
        }
        validateAssignment(assignment, peopleSnap.docs.map(d => d.data()), group);
        const ref = db.collection(PEOPLE).doc('ci_' + db.collection(PEOPLE).doc().id);
        tx.create(ref, {...assignment,name:assignment.name.trim(),email:assignment.email.trim(),id:ref.id,groupNumber:group.number,active:true,createdAt:now,...audit});
      }
      tx.set(lock, audit);
      return {ok:true};
    });
  };
}
module.exports = {handler,validateAssignment,validateResponsible,groupOf,normalized};
