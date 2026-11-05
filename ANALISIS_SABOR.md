# Análisis de sabor de materia prima

Entrada: `analisis-sabor.html`. Usa el proyecto Firebase existente `oceantreasure-app`, base `(default)` Standard en `nam5`, y las cuentas habilitadas en Evaluaciones.

## Operación

1. El administrador existente crea una sesión, elige fecha e inspectores habilitados. No hay un límite fijo de inspectores por sesión en la aplicación.
2. Registra las muestras: lote, talla, color, sabor de referencia, destino, código e importador. El código es único dentro de la sesión, sin distinguir mayúsculas ni espacios iniciales/finales.
3. Abre la sesión. Desde ese momento las muestras quedan fijas; **Agregar inspectores** permite seguir incorporando participantes en cualquier estado. Agregar nuevos inspectores a una sesión finalizada la reabre para recibir sus resultados.
4. En la misma página, el administrador pulsa **Comenzar análisis**, selecciona muestra e inspector y registra el resultado conforme o no conforme. Un resultado no conforme exige observaciones. También se conserva la evaluación desde la cuenta individual del inspector.
5. Las evaluaciones enviadas son definitivas y no se pueden sobrescribir. Cada inspector solo consulta sus resultados; el administrador compara todos y exporta CSV.
6. El administrador cierra la sesión cuando se completan todas las combinaciones muestra–inspector. Cerrar impide nuevos envíos.
7. **Eliminar sesión** la mueve a la **Papelera** y bloquea nuevos registros. **Restaurar sesión** recupera su estado, muestras, inspectores y resultados. La eliminación es recuperable y no borra físicamente las evaluaciones.
8. **Ver resultados** abre el modal identificado por el lote. Su botón **PDF** descarga los resultados de esa muestra con logo de EXPALSA, datos de la muestra, resultados y observaciones de cada inspector, pendientes y paginación automática mediante jsPDF-AutoTable. Se exportan los datos cargados que se muestran en el modal; usa Actualizar antes de abrirlo para consultar nuevos resultados.

El registro central conserva el inspector que analizó y la cuenta del administrador que capturó el resultado (`recordedBy`, `recordedByEmail`, `entryMode: laboratory`). Ambos modos comparten el mismo registro único por muestra e inspector y no pueden sobrescribirse entre sí. Los resultados comparativos son parciales mientras falten evaluaciones. Una discrepancia significa que hay votos de ambas categorías; el sistema no decide la liberación comercial del lote. Una nueva evaluación del mismo lote requiere otra sesión y conserva la trazabilidad de la anterior.

## Implementación y seguridad

La función callable `manageFlavorAnalysis` está en un codebase independiente, `analisis-sabor`, sin modificar las funciones existentes. Verifica el UID y correo del administrador contra `expalsa_calidad_config/administrador`; verifica que las cuentas de inspector estén activas, no eliminadas y coincidan con el correo autenticado en cada solicitud.

Colecciones nuevas: `expalsa_sabor_sesiones/{sessionId}`, `inspectors/{inspectorUid}`, `samples/{sampleId}`, `samples/{sampleId}/votes/{inspectorUid}` y el índice de asignación `expalsa_sabor_inspectores/{uid}/sesiones/{sessionId}`. El padrón se almacena en documentos separados; el documento de sesión conserva únicamente el contador. Las sesiones del formato anterior se migran automáticamente al agregar participantes, sin alterar votos existentes. El ID de muestra es un hash del código normalizado. Cada evaluación registra cuenta, fecha del servidor, resultado y observaciones. Las transacciones impiden códigos duplicados, doble envío y cambios de estado incompatibles con evaluaciones concurrentes.

El cliente nunca accede directamente a estas colecciones. Las reglas existentes no contienen rutas que las autoricen y conservan la denegación implícita. No se despliegan ni sustituyen reglas de otros módulos. El acceso se realiza por la función autenticada con Admin SDK.

Las listas de sesiones y muestras se paginan de 20 en 20; inspectores y votos, de 200 en 200. Las altas se envían en grupos de 100 por solicitud y pueden repetirse sin límite total configurado, respetando las cuotas operativas de Firebase. Cada inspector puede analizar la misma muestra, con un resultado independiente bajo su UID. Las altas repetidas no duplican miembros ni incrementan el contador. El filtro y los contadores de discrepancias corresponden a las muestras cargadas; el CSV recorre todas las páginas de votos e incluye las evaluaciones pendientes. Los valores que puedan interpretarse como fórmulas de hoja de cálculo se neutralizan al exportar. El botón Actualizar obtiene los nuevos resultados.

El PDF se genera en el navegador, sin enviar los resultados a servicios externos. Las distribuciones fijadas de jsPDF 4.2.1 y jsPDF-AutoTable 5.0.9 y sus licencias están incluidas en `vendor/`; se cargan al solicitar el PDF. El código aparece como dato de muestra, mientras que el encabezado y los títulos del reporte usan el lote.

## Validación y despliegue

```powershell
npm ci --prefix functions-sabor
npm test --prefix functions-sabor
node --check analisis-sabor.js
npx -y firebase-tools@latest deploy --only functions:analisis-sabor:manageFlavorAnalysis --project oceantreasure-app
```

La interfaz se publica con el GitHub Pages del repositorio. El código de la función debe desplegarse antes de publicar el enlace de la interfaz. Los datos de ejemplo del servidor de pruebas local no forman parte del producto ni se cargan en Firebase.
