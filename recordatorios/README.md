# Mis Avisos

App web progresiva independiente, servida en `/recordatorios/` dentro del alojamiento Firebase existente. Usa la app web Firebase `Mis Avisos` y la base Firestore `default` del proyecto `oceantreasure-app`.

## Datos

Cada aviso vive en `recordatorios/{uid}/avisos/{avisoId}` y solo el usuario autenticado cuyo UID coincide con la ruta puede leerlo, cambiarlo o borrarlo. No comparte colecciones con la app de EXPALSA. Los campos incluyen título, fecha, hora, lugar, nota, foto JPEG comprimida, estado, fecha de aviso y marcas de tiempo.

## Acceso

Inicia sesión con una cuenta Firebase Auth existente o crea una cuenta con correo y contraseña. La app no concede permisos administrativos. Las fotos se comprimen antes de guardarse en Firestore y el tamaño se limita en la interfaz y en las reglas.

## Límites

Las notificaciones del navegador se procesan mientras la app está abierta y el permiso está concedido; el sistema puede suspender avisos en segundo plano. No hay alertas geográficas al llegar a un lugar. La ubicación se conserva como coordenadas o texto de lugar.

Las reglas añadidas son un prototipo de acceso por UID y validación de campos. Conviene revisarlas antes de compartir la app con un público amplio.

