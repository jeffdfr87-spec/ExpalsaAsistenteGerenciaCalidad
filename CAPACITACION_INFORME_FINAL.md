# Responsable del equipo e informe integral

## Nombre y foto del responsable

En **Inspectores**, la sección del Asistente de Aseguramiento de Calidad permite escribir el nombre y tomar o seleccionar una fotografía. **Guardar responsable** conserva ambos datos de forma privada. La imagen es opcional y se comprime a JPEG. Al cambiar de nombre, la fotografía anterior no se asigna automáticamente a la nueva persona.

Este registro es independiente de los inspectores y sus jornadas. No modifica el plan, el PDF, los días, las horas, las ponderaciones ni las calificaciones. Tampoco acredita por sí solo presencia diaria.

Datos: `expalsa_capacitacion_2026_equipo/responsable`, lectura y escritura exclusivamente administrativas, campos validados y revisión incremental para evitar sobrescrituras concurrentes.

## Informe final del plan

La pestaña **Informe final del plan** incorpora:

- **Ver ejemplo del informe final**: diez inspectores ficticios, cien jornadas, calibración, un reclamo demostrativo y dos necesidades de refuerzo. No escribe en Firestore.
- **Generar con los registros reales**: consulta los inspectores activos y sus registros actuales. Reúne diez jornadas por inspector, criterios y competencias, observaciones, seguimientos, fotos generales y por criterio, actas y resultados de calibración, matriz de reclamos y aprendizajes individuales.
- **Tamaño de fotografías**: pequeñas, medianas o grandes. También permite omitirlas y volver a generar.
- **Imprimir / Guardar PDF**: abre la impresión del informe para guardarlo como PDF desde el navegador.

El informe incluye resumen del programa y del responsable, resultados ponderados, fortalezas, debilidades, número de inspectores con refuerzo adicional, propuesta de actividades y criterios de comprobación, y pendientes de cierre. Las propuestas se identifican como tales; no son actividades ejecutadas ni decisiones de acreditación.

Los resultados teóricos no se inventan: no se registran en este módulo. La falta de registros o de fotografías se señala. El informe se identifica como avance mientras falte cobertura documental. La condición de cobertura completa no equivale a aprobar a todos los inspectores.

Los informes se generan en la sesión administrativa, sin publicar archivos ni datos privados en GitHub. Los datos ficticios del ejemplo están claramente identificados y no contienen personas reales. Las cuentas retiradas quedan excluidas de los resultados individuales.

## Verificación

Pruebas de validación de nombre y fotografía, persistencia con almacenamiento simulado, compresión de imagen, navegación del ejemplo, generación con registros simulados, cobertura de cien jornadas, selección de tamaño de fotografías, exclusión de retirados, necesidades de refuerzo y escape de contenido HTML. Reglas compiladas y lecturas del responsable probadas para administrador, inspector y usuario anónimo.

La cámara física y la impresión del navegador deben comprobarse en el dispositivo del administrador durante el uso. No se capturaron personas ni se generaron resultados ficticios en la base real durante las pruebas.
