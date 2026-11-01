# Documentos del programa de capacitación EXPALSA

La plataforma `capacitacion.html` está preparada para descargar los PDF originales de las diez jornadas y mostrar el plan general en la pestaña **Plan de capacitación**.

## Único archivo requerido en la raíz del repositorio

`EXPALSA_DOCUMENTOS_CAPACITACION_2026.zip`

El ZIP contiene, sin alterar el contenido de los PDF originales:

- `DIA_01.pdf` a `DIA_10.pdf` (diez guías, dos páginas por día).
- `PLAN_CAPACITACION.pdf` (plan general, 18 páginas).

## Cómo publicar el ZIP

En la rama `main`, abre **Add file → Upload files** de GitHub, selecciona **EXPALSA_DOCUMENTOS_CAPACITACION_2026.zip** y confirma el commit. No descomprimas el ZIP ni lo cambies de nombre. Debe quedar al mismo nivel que `capacitacion.html`.

La página carga ese único archivo una vez y presenta los PDF originales en los botones **Descargar PDF** de cada jornada y en el visor del **Plan de capacitación**. No se necesitan cambios de Firestore.

En esta versión, los botones informan si falta publicar el paquete y evitan descargar un archivo incorrecto.
