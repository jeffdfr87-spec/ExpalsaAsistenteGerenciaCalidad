// Fuente única para cobertura y resultados de la matriz práctica vigente.
const definitions = days => days || globalThis.window?.EXPALSA_CAPACITACION_DIAS || [];
export function criterionValues(session, days) {
  const day = definitions(days).find(d => Number(d.day) === Number(session?.day));
  return (day?.checks || []).map(c => session?.ratings?.[c.id]);
}
export function criteriaComplete(session, days) {
  const values = criterionValues(session, days);
  return values.length > 0 && values.every(v => v === 'na' || (Number.isInteger(v) && v >= 0 && v <= 4)) && values.filter(Number.isInteger).length >= 2;
}
export function sessionComplete(session, days) {
  return session?.status === 'done' && criteriaComplete(session, days);
}
export function criterionScore(session, days) {
  if (!criteriaComplete(session, days)) return null;
  const values = criterionValues(session, days).filter(Number.isInteger);
  return values.reduce((sum, value) => sum + value, 0) / (values.length * 4) * 100;
}
