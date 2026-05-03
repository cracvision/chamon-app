# Thumbnails + Preview de Adjuntos

Sí, es totalmente posible. El bucket `task-attachments` ya existe y los archivos están en Supabase Storage, así que solo hay que mejorar el componente `AttachmentsList.tsx` (y opcionalmente añadir un componente de preview).

## Qué se va a construir

1. **Thumbnails inline** para cada adjunto en la lista:
   - **Imágenes** (png/jpeg/webp/heic): miniatura cuadrada (40×40) con la imagen real, generada vía `createSignedUrl` (cache de 1h en estado local).
   - **PDFs / docs / hojas de cálculo**: ícono coloreado por tipo (lo que ya hay hoy), pero más prominente.
   - HEIC se mostrará como ícono de imagen (los browsers no lo renderizan nativamente).

2. **Click → Modal de preview** usando el `Dialog` de shadcn ya instalado:
   - **Imágenes**: se muestran a tamaño completo (max 80vh) con fondo oscuro.
   - **PDFs**: se embebe en un `<iframe>` con la signed URL (los browsers tienen viewer nativo).
   - **Otros tipos** (Word/Excel/CSV/TXT): el modal muestra ícono grande + nombre + tamaño + botón "Descargar" (no hay viewer nativo razonable sin librerías pesadas).
   - Header del modal: nombre del archivo, tamaño, botones Descargar y Cerrar.

3. **Comportamiento de los iconitos existentes**:
   - El botón Download (⬇) y Delete (🗑) se mantienen visibles a la derecha de cada item — no se rompe el flujo actual.
   - Click en el thumbnail o en el nombre → abre preview. Click en los botones → acción directa (con `stopPropagation`).

## Detalles técnicos

**Archivo a editar**: `src/components/AttachmentsList.tsx`

- Añadir estado `previewItem: Attachment | null` y `thumbUrls: Record<string, string>`.
- En `load()`, después de traer los attachments, para los que sean imagen generar signed URLs en batch (`createSignedUrls`, expiración 3600s) y guardar en `thumbUrls`.
- Reemplazar el `<Icon>` actual por:
  - `<img src={thumbUrls[a.id]} class="h-10 w-10 rounded object-cover" />` si es imagen y la URL existe.
  - Ícono grande (h-10 w-10) en caja con bg sutil para no-imágenes.
- Hacer la fila clickable (`onClick={() => setPreviewItem(a)}`), aplicando `stopPropagation` en los botones existentes.
- Nuevo `<Dialog open={!!previewItem}>` al final del componente con la lógica de render por mime type.

**Sin nuevas dependencias** — `Dialog`, `lucide-react` y Supabase Storage ya están en uso. Sin cambios de DB ni de RLS.

**Performance**: signed URLs se generan una vez por carga del componente y se cachean en estado. Se invalidan con cada `load()` (que ya ocurre tras upload/delete), bien dentro de la ventana de 1h.

## Out of scope (puedo añadirlo si lo pides)

- Generar thumbnails reales server-side (resize) — los browsers cargarán la imagen completa para la miniatura. Para 5 fotos de 1-2 MB es aceptable; si en el futuro hay 50+ adjuntos por misión conviene una edge function de resize.
- Preview de Word/Excel/PPT inline (requeriría librerías pesadas o servicio externo).
- Navegación con flechas entre adjuntos dentro del modal.

¿Procedo?
