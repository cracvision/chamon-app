## Problema

En mobile (≤766px) el header se ve apretado: el título "Mission Control" se parte en dos líneas, el tagline "CENTRO DE OPERACIONES PERSONALES" envuelve en 3 líneas y compite por espacio con el toggle ES/EN y el botón "+ Añadir rápido". Además el card de "HOY · FOCUS" muestra texto truncado ("Marca tareas para concent…") y los KPIs ocupan mucho alto vertical.

## Cambios propuestos

### 1. `src/routes/_authenticated.tsx` — header responsive

- **Logo**: reducir a `h-7 w-7` en mobile, `h-8 w-8` en `sm+`.
- **Título/tagline**: ocultar el tagline en mobile (`hidden sm:block`) y dejar solo "Mission Control" en una línea con `text-[12px] sm:text-[13px]` y `whitespace-nowrap`.
- **Botón Quick Add**: en mobile mostrar solo el icono `+` (sin texto), texto visible desde `sm+`. Reduce ancho ~70px.
- **Reloj AST**: ya está oculto en mobile (`hidden md:inline`), sin cambios.
- **LangToggle**: sin cambios, pero ahora con espacio disponible.
- **Padding header**: `px-3 sm:px-4` y `gap-2 sm:gap-3` para apretar.

### 2. `src/routes/_authenticated.dashboard.tsx` — KPIs y secciones

- **KPI grid**: pasar de `grid-cols-2` a `grid-cols-2` pero con `gap-2` en mobile y reducir padding interno del `Kpi` a `p-2.5` en mobile (`p-3` desde sm). Esto compacta los 4 KPIs.
- **Kpi**: el icon-box `h-9 w-9` → `h-8 w-8 sm:h-9 sm:w-9`. Valor `text-base sm:text-lg`.
- **Padding contenedor**: `px-3 py-4 lg:px-6` (en vez de `px-4 py-5`).
- **Secciones `surface`**: `p-3 sm:p-4`.
- **HOY · FOCUS empty state**: añadir `text-balance` o quitar `truncate` implícito — el texto ya hace wrap, no necesita cambio aparte de padding.

### 3. `src/components/MissionCard.tsx` — verificar que el badge "Misión Cumplida" no se desborde

Solo lectura para confirmar; añadir `flex-wrap` o `truncate` al header del card si el badge empuja el código `M-01` fuera del card en pantallas estrechas.

## Detalles técnicos

- Todos los breakpoints usan los tokens Tailwind existentes (`sm:`, `md:`, `lg:`).
- No se cambian rutas ni datos.
- No se toca el bottom nav móvil ni el widget de ElevenLabs.

## Resultado esperado

- Header en una sola línea limpia: logo + "Mission Control" + ES/EN + botón `+`.
- Los 4 KPIs caben en 2 filas más compactas, dejando ver "HOY" sin scroll inicial.
- El empty state de HOY no truncado.
- Sin cambios en desktop (todo permanece igual desde `lg:`).
