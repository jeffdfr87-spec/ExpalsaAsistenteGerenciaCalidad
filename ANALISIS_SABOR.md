# Análisis de sabor EXPALSA

Aplicación `analisis-sabor.html`, publicada por GitHub Pages. Usa la autenticación existente y la función callable `manageFlavorAnalysis`, codebase `analisis-sabor`, proyecto `oceantreasure-app`, Firestore Standard.

## Operación

- Las sesiones admiten múltiples inspectores; cada inspector registra un resultado independiente para cada muestra. Las altas se procesan de 100 en 100, sin un límite total configurado.
- La muestra contiene lote, fecha de recepción opcional y composición de sabor de recepción de materia prima. La fecha admite `dd/mm/aaaa` y se muestra completa en español. Se puede guardar solo la fecha de una muestra antigua.
- El catálogo contiene Normal y Tierra, Fito o Combustible con intensidad Leve, Medio o Fuerte. Cada fila incluye un porcentaje numérico mayor que cero. La composición debe sumar 100 %. Se combinan filas repetidas del mismo sabor e intensidad.
- La contramuestra usa el mismo catálogo. El servidor calcula Conforme cuando coinciden los conjuntos de sabores e intensidades; las diferencias de porcentaje no afectan la conformidad. Si no coinciden se registra Discrepancia.
- El sabor predominante es el de mayor intensidad: Fuerte, Medio, Leve y Normal, en ese orden. Dentro de la misma intensidad se ordena por porcentaje y nombre. No se confunde intensidad con proporción.
- La evaluación conserva una copia de la composición de recepción utilizada. Las evaluaciones anteriores a esta actualización no se convierten ni se sobrescriben. Los perfiles antiguos incompletos requieren completar la recepción antes de registrar otra evaluación. Los antiguos campos de talla, color, código, destino e importador se conservan internamente pero desaparecen de las pantallas y reportes nuevos.
- El administrador elimina sesiones desde su encabezado, moviéndolas a la papelera. Eliminar un inspector elimina su asignación y todos sus resultados y fotografías de evidencia de esa sesión, sin eliminar la cuenta global. Se procesa por páginas reintentables de 20 muestras; una eliminación pendiente puede continuarse desde el botón junto al nombre.
- Fabio y Karina, con sus cuentas activas `fabio@expalsaevaluations.com` y `karina@expalsaevaluations.com`, únicamente pueden consultar y descargar PDF. Toda operación que modifique datos se reserva al administrador y se verifica también en el servidor.

## Fotografías y PDF

Se muestra el perfil del inspector seleccionado. Las fotos de muestra se agregan desde galería o cámara y pueden reemplazarse o eliminarse. Las capturas de evidencia usan preferentemente la cámara trasera y se guardan inmediatamente, incluso antes del resultado. Si la carga falla permanecen pendientes para reintentar; no se descartan las observaciones escritas.

Las fotografías se comprimen a JPEG y se guardan en documentos individuales; el servidor valida dimensiones y un máximo de 220 000 bytes. No existen enlaces públicos. Los reemplazos y eliminaciones de fotos retiran el documento de galerías y reportes mediante una marca de auditoría. Las listas de fotos se paginan de cuatro en cuatro.

El botón PDF del modal genera el reporte por lote con logo EXPALSA, fecha de recepción, composición ordenada, resultados de contramuestra y observaciones, pendientes y todas las fotos guardadas de muestra, perfiles y evidencias. Usa las distribuciones locales de jsPDF 4.2.1 y AutoTable 5.0.9 con paginación automática. No genera reportes con fotografías o eliminaciones de inspectores pendientes. El CSV recorre todas las páginas de muestras y resultados.

## Datos y seguridad

Colección raíz `expalsa_sabor_sesiones/{sessionId}`; subcolecciones `inspectors`, `samples`, `samples/{sampleId}/votes`, fotos de muestra y fotos por evaluación. El índice `expalsa_sabor_inspectores/{uid}/sesiones` permite consultar asignaciones. Las nuevas muestras reciben un ID automático; las existentes conservan sus IDs. Cada voto tiene el UID del inspector como ID y conserva la cuenta responsable, fecha y modo de registro. Las transacciones evitan doble envío e inconsistencias en contadores.

El cliente accede exclusivamente por callable autenticada. Las reglas existentes mantienen la denegación directa de estas colecciones; no se modifican reglas de otros módulos. El administrador se valida contra `expalsa_calidad_config/administrador` y los inspectores contra su acceso activo. `serviceInfo` expone solamente la versión del servicio.

## Validación y publicación

```powershell
npm test --prefix functions-sabor
node --check analisis-sabor.js
npx -y firebase-tools@latest deploy --only functions:analisis-sabor:manageFlavorAnalysis --project oceantreasure-app
```

Desplegar la función y verificar `serviceInfo` antes de publicar la interfaz. Los módulos `sabor-modelo.js` y `functions-sabor/sensory.js` contienen la misma lógica para navegador y servidor; actualizar ambos a la vez. Los ejemplos de pruebas nunca se cargan en la base de producción.

## Porcentajes de conformidad

Tabla, modal, vista individual, PDF y CSV comparan cada contramuestra con la recepción actual mediante la misma función. Se comparan conjuntos de sabores e intensidades, ignorando los porcentajes de composición. Los resultados se agrupan en una sola pasada por muestra e inspector; no se duplican evaluaciones ni se cuentan inspectores retirados.

Conformidad = coincidencias / evaluaciones recibidas × 100; Discrepancia = diferencias / evaluaciones recibidas × 100. Se redondea a dos decimales (2 de 3 = 66.67 %; 1 de 3 = 33.33 %). Las evaluaciones no enviadas siguen pendientes y no se consideran discrepancias. Durante una sesión incompleta los porcentajes son parciales. Los casos sin composición interpretable se muestran como Por revisar y participan en el denominador para no inflar la conformidad.

Los votos antiguos se interpretan únicamente cuando las observaciones contienen sabores explícitos del catálogo y frases reconocidas como «Le dio sabor normal» o «Normal, reproceso». No se deducen sabores a partir de la categoría manual antigua; textos ambiguos o negados requieren revisión. No se inventan porcentajes de composición para esas observaciones. La interpretación y el resumen son derivados: no sobrescriben votos, observaciones, fechas ni fotografías de los analistas.

## Fabio y Karina: consulta y PDF

Las cuentas activas de Fabio y Karina tienen un rol de solo lectura: sesiones, muestras, resultados, perfiles, evidencias y descarga del PDF comparativo. No pueden crear, modificar, evaluar, registrar resultados de terceros, cargar o reemplazar fotografías, administrar inspectores, abrir, cerrar, restaurar ni eliminar sesiones. El servidor usa una lista explícita de operaciones de lectura; rechaza cualquier otra acción antes de procesarla. La interfaz muestra consulta y PDF, sin formularios, CSV ni botones de gestión. El administrador conserva todas sus funciones. Los demás inspectores mantienen su flujo individual previo. No se modifican datos de analistas al aplicar estos permisos.

## Sesiones por muestra y recuperación del trabajo

El administrador crea la sesión y elige inspectores, agrega las muestras y selecciona una desde la tabla. El panel Analizar muestra permanece oculto hasta pulsar Comenzar análisis. Una sesión tiene una única muestra activa; el servidor impide iniciar otra mientras la actual no haya terminado.

Guardar un resultado avanza al siguiente inspector pendiente. Cuando todos los inspectores asignados tienen su evaluación, se habilita Análisis de la muestra terminado. La confirmación se guarda en la muestra, colorea toda su fila y comienza la siguiente pendiente en orden de creación. Terminar sesión solo se habilita cuando todas las muestras están explícitamente terminadas y los contadores de evaluaciones coinciden. La función verifica estas condiciones nuevamente al cerrar. El proceso es idempotente: reintentar una finalización no incrementa dos veces el contador.

Los resultados históricos se conservan. En sesiones abiertas anteriores se pueden finalizar las muestras con sus evaluaciones ya registradas, sin volver a evaluarlas. Las sesiones antiguas ya cerradas se presentan como terminadas. Agregar o quitar inspectores invalida las finalizaciones mediante una revisión de membresía sin borrar votos de los inspectores que permanecen. Una corrección de sabor de recepción invalida la finalización de esa muestra; cambiar solo su fecha no la invalida.

Los formularios de sesión, muestra, recepción y evaluación, y la posición actual, se autoguardan localmente al escribir y en Firebase con una pausa de 600 ms. Los borradores de gestión están bajo `expalsa_sabor_progreso/{adminUid}/drafts/{hash}` y solo el administrador puede leerlos o escribirlos por la función. La interfaz distingue Guardado automáticamente de Guardado en este equipo cuando no hay conexión. Al volver a iniciar sesión se recuperan la sesión, muestra, inspector y formulario pendientes. Las solicitudes de creación llevan un identificador estable para evitar duplicados al reintentar.

Las fotografías todavía pendientes de enviar y las del formulario de una muestra sin guardar se conservan en IndexedDB, separadas por cuenta y sesión. Su recuperación requiere el mismo navegador y equipo mientras no se hayan cargado en Firebase. Las fotos ya enviadas están disponibles en Firebase. Antes de finalizar una muestra se reintentan sus cargas pendientes y se impide finalizar si fallan. No se guardan contraseñas en los borradores.

El administrador carga todas las páginas de muestras y votos de la sesión para ordenar el avance; los lectores mantienen la consulta paginada y su permiso de PDF. Las nuevas acciones de inicio, finalización y autoguardado están denegadas a Fabio y Karina por su rol de consulta.

## Gestión de recepción y muestras ciegas (6 de noviembre de 2026)

Cada muestra admite analista de recepción y letra A–Z, única dentro de su sesión. El administrador y los lectores conservan la correspondencia letra/lote; los inspectores reciben solo la letra y no la composición de recepción. Los perfiles ingresados por debajo de 100 % se completan con Normal; un exceso, valores inválidos o perfiles vacíos siguen rechazándose. La fecha de recepción se introduce explícitamente y se muestra con fecha larga.

Comenzar/continuar análisis se ofrece en cada fila de muestras. Administrar inspectores y agregar/eliminar muestras está disponible para el administrador en borradores, sesiones abiertas y cerradas; agregar muestras a una sesión cerrada la reabre. La eliminación de muestras es lógica y transaccional: descuenta sus evaluaciones y finalización una sola vez, sin borrar físicamente otros resultados. Sus fotografías y votos dejan de ser accesibles. El menú de sesiones siempre permite eliminar sesiones al administrador. Entrar desde Análisis de sabor abre ese menú, conservando los borradores. Fabio y Karina continúan exclusivamente como lectores y descarga de PDF.

Las letras ocupadas se excluyen del selector. En el análisis solo se muestran inspectores sin evaluación para la muestra activa; al completar todos los resultados se vacían los selectores y permanece la acción de finalizar muestra. La tabla incluye analista de recepción y letra destacada. Los textos de recepción del análisis y las fechas de la tabla se amplían al doble.
