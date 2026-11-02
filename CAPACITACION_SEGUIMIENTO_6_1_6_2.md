# Seguimiento del plan firmado de capacitación EXPALSA 2026

La pestaña **Calibración y reclamos** de `capacitacion.html` controla los apartados 6.1 y 6.2 del plan firmado.

## Procedimiento

1. Registrar el inicio del programa y la revisión realizada con Gerencia de Calidad. El sistema calcula el intervalo de los doce meses anteriores.
2. Registrar el acta grupal del día 10: muestra, ficha técnica, responsables del turno, referencia y tolerancias aprobadas, acuerdos y evidencias. La duración prevista es de 60 minutos; registrar el tiempo real.
3. Registrar por inspector talla, cuenta, uniformidad, defectos y decisión; documentar discrepancias, refuerzo y nueva comprobación. El resultado solo se completa con asistencia y concordancia comprobada frente a un acta completa.
4. Incorporar los reclamos priorizados del período, sin datos del cliente, con investigación, control, acción, tema, competencias y día de aplicación.
5. Registrar por inspector y reclamo el ejercicio, resultado, evidencia y comprobación del refuerzo. Un aprendizaje pendiente permanece como borrador.
6. Consultar los indicadores, exportar CSV o imprimir. Las referencias de evidencias corresponden al archivo interno autorizado; esta pestaña no sube adjuntos adicionales.

## Persistencia

- `expalsa_capacitacion_2026_complementos`: registros tipados de período, acta, resultado, reclamo y aprendizaje, con fecha de creación, actualización, usuario y revisión incremental.
- Los registros individuales se vinculan al identificador del participante existente. Una pareja inspector–acta o inspector–reclamo tiene un identificador único.
- No hay borrado desde el módulo. Los registros completos pueden editarse o devolverse a borrador; una revisión concurrente produce un error y requiere actualizar.
- La calibración no cambia las ponderaciones C1–C10 ni las evaluaciones oficiales.

## Documento firmado

El PDF permanece privado en Firebase Storage: `expalsa_capacitacion_privada_2026/PLAN_CAPACITACION.pdf`.

Su versión, generación, tamaño y SHA-256 se registran en `expalsa_capacitacion_2026_documentos/plan`. Antes de mostrar o descargar el plan, el visor compara la huella del PDF con ese registro. Los PDF diarios conservan su funcionamiento anterior. El PDF no se incluye en este repositorio público.

## Validación realizada

- Sintaxis del módulo HTML y archivos JavaScript.
- Comprobaciones de período anual, referencias, asistencia, concordancia, evidencias y cierre de refuerzos.
- Cinco formularios y sus indicadores probados en navegador con almacenamiento simulado; revisión visual del formulario móvil.
- Compilación de las reglas y pruebas de lectura: administrador autorizado, usuario anónimo e inspector rechazados.
- PDF cargado en Storage y verificado por SHA-256; lectura anónima rechazada.

La verificación completa con la sesión Firebase del administrador se realiza al registrar los primeros datos reales. No se crean resultados ficticios en producción.
