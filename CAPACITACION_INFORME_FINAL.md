# Responsable del equipo e informe integral

## Nombre y foto del responsable

En **Inspectores**, la sección del Asistente de Aseguramiento de Calidad permite escribir el nombre y tomar o seleccionar una fotografía. **Guardar responsable** conserva ambos datos de forma privada. La imagen es opcional y se comprime a JPEG. Al cambiar de nombre, la fotografía anterior no se asigna automáticamente a la nueva persona.

Este registro es independiente de los inspectores y sus jornadas. No modifica el plan, el PDF, los días, las horas, las ponderaciones ni las calificaciones. Tampoco acredita por sí solo presencia diaria.

Datos: `expalsa_capacitacion_2026_equipo/responsable`, lectura y escritura exclusivamente administrativas, campos validados y revisión incremental para evitar sobrescrituras concurrentes.

## Informe final del plan

La pestaña **Informe final del plan** incorpora:

- **Ver ejemplo del informe final**: diez inspectores ficticios, cien jornadas, calibración, un reclamo demostrativo, seis promedios teóricos en meta, cuatro por debajo y dos brechas amplias para revisión prioritaria. No escribe en Firestore.
- **Generar con los registros reales**: consulta los inspectores activos y sus registros actuales. Reúne diez jornadas por inspector, criterios y competencias, observaciones, seguimientos, fotos generales y por criterio, actas y resultados de calibración, matriz de reclamos y aprendizajes individuales.
- **Tamaño de fotografías**: pequeñas, medianas o grandes. También permite omitirlas y volver a generar.
- **Imprimir / Guardar PDF**: abre la impresión del informe para guardarlo como PDF desde el navegador.

El informe incluye resumen del programa y del responsable, resultados ponderados, fortalezas, debilidades, número de inspectores con refuerzo adicional, propuesta de actividades y criterios de comprobación, y pendientes de cierre. Las propuestas se identifican como tales; no son actividades ejecutadas ni decisiones de acreditación.

Los resultados teóricos se consultan de forma privada y de solo lectura desde la plataforma de evaluación de Calidad, mediante la cuenta vinculada del inspector. No se inventan ni se recalifican. La falta de registros o de fotografías se señala. El informe se identifica como avance mientras falte cobertura documental. La condición de cobertura completa no equivale a aprobar a todos los inspectores.

Los informes se generan en la sesión administrativa, sin publicar archivos ni datos privados en GitHub. Los datos ficticios del ejemplo están claramente identificados y no contienen personas reales. Las cuentas retiradas quedan excluidas de los resultados individuales.

## Verificación

Pruebas de validación de nombre y fotografía, persistencia con almacenamiento simulado, compresión de imagen, navegación del ejemplo, generación con registros simulados, cobertura de cien jornadas, selección de tamaño de fotografías, exclusión de retirados, necesidades de refuerzo y escape de contenido HTML. Reglas compiladas y lecturas del responsable probadas para administrador, inspector y usuario anónimo.

La cámara física y la impresión del navegador deben comprobarse en el dispositivo del administrador durante el uso. No se capturaron personas ni se generaron resultados ficticios en la base real durante las pruebas.


## Integración de las evaluaciones teóricas

La referencia es la implementación vigente integrada en `index.html` de la plataforma de evaluación, incluidas sus funciones de puntuación, normalización y correspondencia de preguntas con C1–C10. Las funciones puras necesarias se conservan en `capacitacion-teoria-core.js`, sin incluir bancos ni claves oficiales en el código público.

- Se muestran tres etapas y hasta dos intentos por etapa. El promedio conserva todos los intentos calificados, como en la plataforma de origen; no selecciona únicamente la mejor nota.
- Una autocalificación válida se calcula como aciertos × 100 / total. En versiones que requieren calificación manual se conserva la nota oficial del intento calificado. Los intentos en curso o pendientes no se convierten en cero.
- Se admiten los tamaños de evaluación que soporta la plataforma de origen: 12, 28, 30, 43 y 44 preguntas. La configuración revisada actualmente indica 30 por etapa; no se presupone ese total para las versiones históricas.
- Se comprueban cuenta, etapa, versión del banco y versión de su clave. Las distribuciones por competencia solo se atribuyen cuando el cálculo del banco coincide con la nota oficial, sin pendientes de calificación. Las discrepancias se señalan y no modifican la nota.
- El detalle opcional incluye los cuestionarios entregados, respuesta del inspector, criterio correcto y fundamento. Los fundamentos históricos solo se reutilizan cuando coinciden exactamente la pregunta y la clave originales.
- La meta teórica del plan es 85%. La clasificación teórica por competencias utiliza la referencia de 75% del perfil de la plataforma. Las necesidades teóricas se incorporan a las propuestas de refuerzo.
- Se permite consultar el expediente completo con fechas visibles o limitarlo a entregas con fecha verificable desde la inscripción actual. Los resultados históricos no se atribuyen automáticamente al grupo o período actual.
- La práctica del plan y la teoría del expediente se presentan juntas, con notas separadas. No se reemplaza la práctica oficial de la otra plataforma ni se crea una nueva calificación integrada.
- Solo se consultan cuentas vinculadas de inspectores activos. No se realiza una asociación por nombre o correo. La falta de vínculo o de datos queda indicada.

Consultas privadas de solo lectura: accesos, entregas, resúmenes, autocalificaciones, cuestionarios, bancos versionados, soluciones y fundamentos históricos. La integración no habilita exámenes, crea intentos, instala bancos ni escribe calificaciones; no requiere ampliar permisos existentes.

El ejemplo contiene preguntas y respuestas ficticias de selección y cálculo, tres etapas de treinta preguntas y un segundo intento demostrativo. Ninguna pregunta de un banco privado real se incluye en ese ejemplo.

Verificación adicional: comparación de puntuación con el código fuente vigente, promedios con reintento, cero válido, rechazo de cuentas/versiones inconsistentes, conservación de notas ante discrepancias, datos sin vínculo, filtro de fechas y generación en navegador del ejemplo completo y del resumen. En la consulta de esquema no había participantes activos vinculados para comprobar un examen real completo; no se alteraron datos para simular esa prueba.


## Informe ejecutivo compacto y gráfico de avances

El formato predeterminado del informe es **Ejecutivo compacto con tablas y gráficos**. El ejemplo se organiza en cinco páginas de contenido y una página opcional de evidencia seleccionada. Conserva resumen individual, barras de práctica y teoría, curvas prácticas de diez días, trayectoria teórica por etapa e intento, radar C1–C10, cobertura, brechas, calibración 6.1, reclamos 6.2 y acciones de refuerzo propuestas. La extensión real puede variar según los datos y la configuración de impresión.

No repite los cien registros ni todos los cuestionarios en la síntesis. El selector **Expediente completo con registros y cuestionarios** conserva el detalle íntegro por separado. En el ejecutivo se seleccionan como máximo cuatro fotos; la recuperación de imágenes se limita progresivamente para no descargar todas las galerías cuando solo se necesita una selección.

La nueva pestaña **Gráfico de avances** muestra dos curvas independientes:

- Práctica: diez jornadas, una serie por inspector; solo jornadas completas y resultados de 0–100%.
- Teoría: etapas e intentos de la plataforma de evaluación, sin convertirlos artificialmente en días prácticos. El promedio mantiene todos los intentos calificados.

Los resultados ausentes se mantienen como datos faltantes y cortan la curva, sin convertirse en cero. Se pueden filtrar las curvas por inspector cuando se superponen. La tabla diaria conserva cobertura, cantidad en meta, cantidad con 100% y promedio de todo el equipo.

Las fotos o avatares son botones. Al pulsarlos se abre una ficha breve con nombres, apellidos, código y área. Los puntos de las curvas también permiten abrir la ficha, incluido acceso por teclado. En práctica, cuando está registrada, se presenta el área de la jornada; en teoría se identifica el área del grupo sin atribuir al examen un lugar que no consta en la entrega. Los datos que falten no se inventan ni se sustituyen por identificadores internos.

Mientras la pestaña esté abierta, las suscripciones de Firestore actualizan participantes, jornadas, entregas teóricas y calificaciones. Se cancelan al salir o cerrar la sesión. La simulación está separada de los datos reales y no escribe resultados ni mantiene suscripciones activas.

El ejemplo contiene seis promedios teóricos ≥85%, cuatro inferiores a 85%, y dos inferiores a 50% con resultados prácticos persistentemente bajos. Estos últimos se identifican como **brechas amplias para revisión técnica prioritaria**. El sistema no concluye que una persona sea incapaz de aprender ni recomienda automáticamente su desvinculación.

Verificación: coherencia numérica de diez series y cien jornadas; escenario 6/4/2; exclusión de retirados; datos ausentes sin cero; fichas desde fotos y puntos; selección individual; actualización automática tras una jornada simulada y cierre de suscripciones al salir; interfaz móvil sin desbordamiento de página. Se revisaron las alturas de las seis secciones del ejemplo en ancho A4 con los estilos de impresión. No se crearon datos de prueba en producción.
