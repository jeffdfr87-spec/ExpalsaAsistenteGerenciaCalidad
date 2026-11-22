# Oliver

App web progresiva independiente, publicada en `https://oliverasist.web.app/`. No requiere cuenta. Guarda los avisos en IndexedDB del navegador de este teléfono.

## Datos

El botón «Dictar» inicia una conversación para capturar título, fecha, hora, lugar, nota opcional y anticipación del aviso. En teléfonos compatibles, Oliver solicita el permiso del micrófono al iniciar, mantiene la escucha tras el toque inicial y guarda cuando dices cuánto tiempo antes quieres el aviso. Si el navegador no ofrece reconocimiento continuo, puedes responder con el micrófono del teclado. Los avisos de voz también se guardan localmente. El botón junto al logo «Limpiar caché y recargar» elimina solo la caché de la app; no modifica IndexedDB ni los avisos guardados.

## Datos

Los datos incluyen título, fecha, hora, lugar, nota, foto JPEG comprimida, estado y marcas de tiempo. Se quedan en el almacenamiento local de Oliver; no se sincronizan entre teléfonos o navegadores.

## Límites

Las notificaciones del navegador se procesan mientras la app está abierta y el permiso está concedido; el sistema puede suspender avisos en segundo plano. No hay alertas geográficas al llegar a un lugar. La ubicación se conserva como coordenadas o texto de lugar.




