# Mapa de calidad y sabor por destino

La página `mapa-calidad.html` usa el proyecto Firebase `oceantreasure-app`, el mismo de Evaluaciones EXPALSA.

## Requisitos de publicación

1. Activa el proveedor **Correo y contraseña** en Firebase Authentication y agrega el dominio de GitHub Pages a los dominios autorizados.
2. Publica las reglas de `firestore.rules` y las funciones del codebase `registro-inspectores`:

   ```powershell
   firebase deploy --only firestore:rules,functions:registro-inspectores
   ```

3. Verifica que exista `expalsa_calidad_config/administrador` con el UID y correo de la cuenta administradora (`jefferson@expalsaevaluations.com`).
4. La primera vez, ingresa a la página con esa cuenta. El dispositivo del administrador se registra como autorizado.
5. Los demás usuarios deben tener una cuenta activa en `expalsa_calidad_accesos/{uid}`. Al iniciar sesión desde un dispositivo nuevo, quedará pendiente hasta que el administrador lo autorice desde **Admin → Autorizar dispositivos**.
6. Publica `mapa-calidad.html` junto al resto del sitio y ábrela en una URL HTTPS.

Las claves privadas de dispositivo se generan como claves no exportables y se guardan en IndexedDB del navegador. Las reglas solo permiten leer `grados` y `destinos` con una sesión de dispositivo autorizada; solo la cuenta administradora puede modificarlos. Las demás colecciones conservan sus reglas actuales.

La carga inicial de la matriz está disponible desde el menú Admin. Revisa los permisos y los dispositivos autorizados después de la primera configuración.

