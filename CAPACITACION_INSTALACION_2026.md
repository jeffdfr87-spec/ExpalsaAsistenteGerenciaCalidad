# EXPALSA | Puesta en marcha del control de capacitación 2026

## Archivos nuevos (sin modificar la plataforma existente)
- `capacitacion.html`: tablero administrativo y evaluaciones de campo.
- `capacitacion-data.js`: 10 jornadas, 40 criterios y 10 puestos operativos.
- `Reglas_Firestore_EXPALSA_CON_CAPACITACION_2026.txt`: propuesta de reglas completas, basada en la versión de reglas que estaba en este repositorio.

## Acceso
Página prevista para GitHub Pages:
https://jefferson-arch.github.io/ExpalsaAsistenteGerenciaCalidad/capacitacion.html

La página usa `firebase-config.js` del repositorio y autenticación Firebase. Solo se autoriza la cuenta administrativa existente cuando su UID y correo coinciden con `expalsa_calidad_config/administrador`.

## Paso necesario: habilitar reglas en Firebase
GitHub **no publica las reglas de Firestore**. Para poder guardar, abre Firebase Console > Firestore Database > Reglas.

1. Realiza un respaldo de las reglas que están **publicadas actualmente en Firebase**.
2. Compara esas reglas con `Reglas_Firestore_EXPALSA_CON_CAPACITACION_2026.txt`. Este archivo se generó a partir de la copia del repositorio y puede no reflejar cambios realizados más recientemente en Firebase Console.
3. Integra los dos nuevos bloques `match /expalsa_capacitacion_2026_participantes/{participantId}` y `match /expalsa_capacitacion_2026_sesiones/{sessionId}`, además de sus funciones auxiliares `capAdminWrite` y `capSessionValid`, **sin eliminar** reglas más recientes de evaluaciones o control de empaque.
4. Valida y publica las reglas. Las colecciones se crearán en el primer guardado, no es necesario crearlas a mano.
5. Ingresa como administrador y asigna los inspectores a sus puestos.

## Datos y seguridad
Colecciones nuevas (aisladas):
- `expalsa_capacitacion_2026_participantes`: inspector, puesto, vínculo opcional a cuenta.
- `expalsa_capacitacion_2026_sesiones`: visita, asistencia, 0–4, evidencias, observaciones, refuerzos y cierre.

No se escriben documentos en `expalsa_calidad_registros`, `expalsa_calidad_resultados`, `expalsa_calidad_programas` ni otras colecciones oficiales de evaluación. Tampoco se cambian las contraseñas de usuarios.

## Procedimiento de uso
1. Registrar los diez inspectores (M02, M05, M06, M07, M08, M09, M10, B12, B345, T01).
2. Abrir la jornada 1 a 10, seleccionar el inspector y realizar la observación de 30 minutos.
3. Calificar 4 criterios diarios de 0 a 4, o N/A si no aplica.
4. Añadir hallazgo, medidas de refuerzo y una foto opcional cuando esté autorizada.
5. Finalizar una jornada únicamente cuando esté completa y tenga evidencia registrada. El cierre conserva las calificaciones y puede reabrirse para ajustes.
6. Consultar la matriz diaria y el informe de evolución. Exportar CSV o imprimir en PDF con el navegador.

## Alcance de las pruebas
Se ha validado la sintaxis del JavaScript, la estructura de diez jornadas, la presencia de diez puestos y 40 criterios, y se ha contrastado la integración con los nombres de colecciones y autenticación del repositorio. Todavía **no** se ha realizado una prueba de extremo a extremo en la cuenta Firebase real: requiere publicar las reglas y realizar guardados de prueba con una sesión administrativa autorizada.

## Importante
Las calificaciones de capacitación son formativas, no sustituyen las tres etapas de la evaluación oficial ni una decisión de Gerencia. Los valores técnicos de control siempre proceden de procedimientos y fichas vigentes de EXPALSA.

## Fotografías de evidencia por jornada (actualización)
- `capacitacion-fotos.js` incorpora **Tomar foto**, **Seleccionar de galería** (selección múltiple) y visualización de hasta 15 imágenes por inspector y día.
- Las fotografías se guardan por separado en la subcolección `expalsa_capacitacion_2026_sesiones/{sessionId}/fotos/{fotoId}`.
- Cada fotografía se convierte a JPEG y se comprime. Las fotografías anteriores guardadas en `evidenceImage` se mantienen visibles.
- Solo se pueden añadir o quitar fotografías mientras la jornada esté en borrador; después del cierre es necesario reabrirla.
- **Importante:** también debes incorporar en las reglas publicadas de Firebase el bloque anidado `match /fotos/{photoId}` que figura en la versión más reciente de `Reglas_Firestore_EXPALSA_CON_CAPACITACION_2026.txt`. Sin ese permiso, el botón puede mostrarse pero la carga no tendrá autorización.
- Pruebas pendientes en Firebase real: captura desde cámara trasera, selección de tres o más imágenes, persistencia al actualizar, eliminación y rechazo de cambios tras el cierre.

## Actualización: reportes individuales y evidencias por criterio

- El botón **Capacitar** abre la jornada del inspector; **Eliminar** lo retira del grupo y libera el puesto. La eliminación es lógica (`active:false`), por seguridad no borra sus sesiones históricas.
- Junto a cada opción **N/A** de la matriz hay un botón **Foto**. La captura se guarda con su identificador `criterionId` y se agrupa con ese criterio.
- La sección **Evidencia fotográfica autorizada** se conserva como fotografía principal. Si hay varias fotos generales, la primera se coloca en la portada del PDF y las demás se anexan.
- El botón **Crear reporte PDF** genera un archivo con resultados del inspector, observaciones, evidencia principal en la primera página y fotografías por criterio como anexos.
- Para escribir fotografías por criterio hay que publicar la regla actualizada **`Reglas_Firestore_EXPALSA_CON_CAPACITACION_2026.txt`**, que permite el campo opcional `criterionId` en cada fotografía. Antes de publicar, comparar con las reglas que están activas en Firebase, que pueden diferir de la copia en GitHub.
- La biblioteca jsPDF se carga en el navegador; para crear el PDF es necesaria conectividad a la CDN usada por la página.
- Las evaluaciones oficiales y los perfiles originales de los inspectores no se modifican.

### Pruebas que deben hacerse con Firebase real
1. Seleccionar inspector existente y comprobar área y fotografía.
2. Asignar temporalmente una plaza, retirarla con Eliminar y verificar que se libere sin borrar el historial.
3. Añadir una foto general y dos fotos desde criterios distintos, comprobar que se conservan al recargar.
4. Generar PDF y comprobar que la foto general aparece en la página inicial y cada foto de criterio en los anexos respectivos.
5. Cerrar una jornada, verificar el bloqueo de carga y reabrirla para continuar.
