# EXPALSA — Protección de documentos mediante Firebase Storage

## Estado de integración

La web de GitHub Pages usa Firebase Authentication para validar la sesión administrativa y `getBlob()` de Firebase Storage para recuperar los documentos sin obtener URL públicas con tokens.

**La conexión y los archivos de reglas están preparados en GitHub, pero NO se han activado directamente en Firebase.** Es necesario configurar el bucket y cargar los once PDF en Firebase Console con una cuenta que tenga permisos de administración del proyecto.

## 1. Ubicación exacta de los once PDF

Proyecto Firebase: `oceantreasure-app`
Bucket configurado: `oceantreasure-app.firebasestorage.app`
Carpeta en Firebase Storage: `expalsa_capacitacion_privada_2026`

Dentro de esta carpeta, subir archivos individuales con los nombres exactos:

- `PLAN_CAPACITACION.pdf`
- `DIA_01.pdf`
- `DIA_02.pdf`
- `DIA_03.pdf`
- `DIA_04.pdf`
- `DIA_05.pdf`
- `DIA_06.pdf`
- `DIA_07.pdf`
- `DIA_08.pdf`
- `DIA_09.pdf`
- `DIA_10.pdf`

No se deben publicar estos documentos en GitHub Pages, ni almacenar enlaces públicos o `getDownloadURL()` dentro de `capacitacion.html`.

## 2. Reglas de Firebase Storage

Entrar a Firebase Console → Storage → Rules. **Antes de cambiar nada, guardar una copia de las reglas de Storage actualmente publicadas.**

Integrar el bloque de `REGLA_STORAGE_CAPACITACION_PRIVADA.txt` **dentro** del bloque existente `match /b/{bucket}/o`. No pegarlo en Firestore Database → Rules: son servicios distintos.

La regla compara la cuenta autenticada con el correo administrativo y con el documento `expalsa_calidad_config/administrador` de Firestore, incluyendo el UID. Solo permite lectura directa `get` de los 11 nombres autorizados. La carga y modificaciones desde la aplicación están bloqueadas.

**Advertencia crítica:** otras reglas de Storage más permisivas (como `match /{allPaths=**} { allow read: if true; }`) pueden conceder acceso a estos mismos archivos. Las reglas superpuestas se evalúan con lógica OR. Revisar toda la configuración de Storage y eliminar o restringir cualquier regla global que permita leer esta carpeta. No sustituir el conjunto completo de reglas sin conservar los permisos necesarios para otras aplicaciones, por ejemplo fotos de perfiles.

Al guardar reglas que usan `firestore.get`, Firebase puede pedir activar permisos entre Cloud Storage y Firestore; completar ese paso desde la consola.

## 3. Configurar CORS (necesario para getBlob en navegador)

Configurar el CORS del bucket de Storage para permitir solicitudes autenticadas desde:

`https://jefferson-arch.github.io`

El archivo `cors-capacitacion-privada.json` contiene esta configuración. En Cloud Console → Cloud Storage → Buckets → bucket → Configuration → Cross-origin resource sharing, agregar una configuración equivalente o hacerlo desde CLI:

```bash
gcloud storage buckets update gs://oceantreasure-app.firebasestorage.app --cors-file=cors-capacitacion-privada.json
```

**No reemplazar una configuración CORS existente necesaria para otras aplicaciones:** combinarla con la configuración anterior. CORS no reemplaza las reglas de autorización, solo habilita la petición del navegador.

## 4. Subir los archivos una sola vez

Firebase Console → Storage → Files → carpeta `expalsa_capacitacion_privada_2026`, subir los once PDF. La aplicación no pide cargar nada al usuario.

Verificar que los archivos están guardados como `application/pdf` y no son públicos en IAM. Evitar generar o compartir URLs de descarga con tokens; si un objeto tiene un token público de descarga, revocarlo/rotarlo según corresponda.

## 5. Verificación

1. Iniciar sesión como `jefferson@expalsaevaluations.com`.
2. Abrir `https://jefferson-arch.github.io/ExpalsaAsistenteGerenciaCalidad/capacitacion.html`.
3. En **Plan de capacitación**, comprobar que aparece el PDF completo.
4. En **Cronograma**, comprobar las 10 descargas separadas.
5. Cerrar sesión e intentar acceder sin autenticar y con un inspector: la lectura debe ser denegada.
6. Revisar que las fotos de perfiles y el resto de funciones sigan operativas.

## 6. Retirar los antiguos PDF públicos de GitHub

Los once PDF que estaban en `documentos-capacitacion/` deben eliminarse de la rama pública. Eliminarlos de la rama principal **no elimina los commits históricos que ya los contienen**, ni copias externas o cachés. Requiere gestionar el historial del repositorio y posibles cachés de GitHub Pages, siguiendo la guía oficial de GitHub para retirar contenido sensible de un repositorio. Si alguno de estos documentos se compartió mediante un enlace de descarga público, dicho enlace debe revocarse.

## Limitaciones de la operación actual

No existe en la conexión disponible un método autorizado para publicar reglas de Firebase Storage ni cargar archivos binarios en el bucket. Por ello el sitio no tendrá acceso funcional hasta que se completen los pasos 2–4 y se realicen pruebas reales.
