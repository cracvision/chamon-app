## Objetivo

Hacer que el widget de voz de ElevenLabs (`<elevenlabs-convai>`) esté disponible de forma flotante en **todas las pantallas autenticadas** de la app, sin importar la ruta (Dashboard, Today, Calendar, Contacts, Settings, Mission detail, etc.).

## Enfoque

ElevenLabs distribuye el widget como un **Web Component** (`<elevenlabs-convai>`) más un script embebido (`@elevenlabs/convai-widget-embed`). Por defecto, el widget se ancla flotante en la esquina inferior derecha de la pantalla, encima del contenido — exactamente lo que queremos para acceso global.

Como el widget ya es flotante por sí mismo, **no necesitamos un contenedor de UI propio**: solo hace falta montarlo una vez en un punto del árbol que esté siempre presente para usuarios autenticados.

## Decisión de dónde montarlo

Lo montamos en `src/routes/_authenticated.tsx` (el layout que envuelve Dashboard, Today, Calendar, Contacts, Settings, Missions). Ventajas:

- Visible en **todas las rutas autenticadas**, persiste entre navegaciones (no se desmonta porque el layout no cambia).
- **No aparece en `/auth`** ni en la landing pública — el agente solo tiene sentido para usuarios logueados (tu Edge Function ya usa `CHAMON_USER_ID` y datos del usuario).
- Se beneficia de la nav inferior móvil sin tapar contenido importante (el widget se posiciona en bottom-right por defecto, podemos ajustar offset si choca con la barra móvil).

## Cambios concretos

### 1. Crear `src/components/ChamonVoiceWidget.tsx`

Componente cliente que:
- Inyecta el `<script src="https://unpkg.com/@elevenlabs/convai-widget-embed" async>` en `document.head` **una sola vez** (chequeo de duplicados por `id`).
- Renderiza `<elevenlabs-convai agent-id="agent_5901ke9dw1ggfxhb7kg0kcvdgkvd"></elevenlabs-convai>`.
- Usa `useEffect` para que el script se cargue solo en el cliente (SSR-safe — el web component se hidrata en el browser).
- Declara el custom element en TypeScript (`declare global { namespace JSX { interface IntrinsicElements { 'elevenlabs-convai': ... } } }`) para que TS no se queje.

### 2. Montar el widget en `_authenticated.tsx`

Añadir `<ChamonVoiceWidget />` justo antes del cierre del layout (al lado de `<QuickAddDialog />`). Solo se renderiza cuando ya hay sesión (`user` válido), porque el layout retorna `<Navigate to="/auth" />` antes si no hay usuario.

### 3. Ajuste responsive (opcional pero recomendado)

En móvil tenemos una barra de navegación inferior (`fixed bottom-0`). El botón flotante de ElevenLabs por defecto se posiciona `bottom: 20px right: 20px` y podría solaparse con la nav. Solución: agregar una regla CSS global en `src/styles.css` que en breakpoints `<lg` empuje el widget hacia arriba ~70px:

```css
@media (max-width: 1023px) {
  elevenlabs-convai { --el-convai-bottom-offset: 80px; }
}
```

(El nombre exacto de la variable CSS lo verificaré al implementar; si el widget no expone variable, se usa selector `elevenlabs-convai::part(...)` o un wrapper con `style={{ bottom: ... }}`.)

## Detalles técnicos

- **No edge function nueva**: el widget habla directo con ElevenLabs. La Edge Function `chamon-query` que ya verificamos será llamada por el agente vía la URL pública del webhook que configuraste en el dashboard de ElevenLabs — no se invoca desde el frontend.
- **Sin secretos en cliente**: el `agent-id` es público (es identificador, no API key). Está bien hardcodearlo en el código.
- **SSR**: TanStack Start hace SSR, por eso el script se inyecta en `useEffect` (solo cliente). El custom element se renderiza vacío en SSR y se hidrata cuando el script carga.
- **Persistencia de conversación**: como el widget vive en el layout `_authenticated`, navegar entre rutas internas **no lo desmonta** → la sesión de voz sobrevive cambios de página.

## Lo que NO cambiamos

- Edge function `chamon-query`: ya está verificada y desplegada.
- Migraciones de DB: no hace falta nada.
- `index.html`: no aplica (TanStack Start gestiona el shell desde `__root.tsx`).

## Resultado esperado

Tras aplicar el plan: en cualquier ruta autenticada (Dashboard, Today, Calendar, etc.) verás el botón flotante de Chamón en la esquina inferior derecha. Click → abre la conversación de voz con tu agente, que a su vez consulta `chamon-query` para obtener tus datos en tiempo real.