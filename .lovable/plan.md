Tienes razón. Lo estaba interpretando como “focus manual” por el flag `is_today`, pero según el uso real que describes, ese card debe ser un radar operativo del día: si una tarea vence hoy, debe aparecer ahí automáticamente aunque el icono del sol esté gris.

## Bug confirmado

Actualmente hay dos conceptos separados:

1. `due_date === hoy` → la UI muestra la etiqueta “HOY”.
2. `is_today === true` → el Dashboard la muestra en “HOY · FOCUS”.

Eso causa exactamente el bug que señalas: una tarea que vence hoy puede estar visible como “HOY” en el detalle, pero no aparecer en el card más importante para evitar penalidades.

## Corrección propuesta

### 1. Crear una regla única para “tareas del día”

Voy a tratar como tarea de hoy cualquier tarea abierta que cumpla al menos una de estas condiciones:

```ts
status !== "done" && (
  is_today === true ||
  due_date === today
)
```

Es decir:

- Si está marcada con el sol, aparece en Focus.
- Si vence hoy, aparece en Focus aunque el sol esté gris.
- Si está completada, no aparece.

### 2. Usar esa misma regla en el Dashboard

Archivo: `src/routes/_authenticated.dashboard.tsx`

Cambiaré el filtro actual:

```ts
const todayTasks = tasks.filter(tk => tk.is_today && tk.status !== "done");
```

por una regla que también incluya `due_date` de hoy.

### 3. Usar la misma regla en la página Hoy

Archivo: `src/routes/_authenticated.today.tsx`

Actualmente esa página también depende solo de `is_today`. La voy a alinear para que no haya inconsistencia entre Dashboard y Hoy.

### 4. Evitar errores de fecha por zona horaria

No voy a usar `new Date().toISOString().slice(0, 10)` directamente porque puede fallar por zona horaria. Crearé/usaré una función consistente para comparar fechas locales y que `2026-05-04` sea tratado correctamente como hoy en la experiencia del usuario.

### 5. Ajustar el comportamiento del botón del sol en el Focus card

Como ahora habrá tareas que aparecen por vencer hoy aunque no estén marcadas manualmente con `is_today`, el botón del sol no debe dar la falsa impresión de que puedes “quitar” una tarea venciendo hoy del radar del día.

La intención será:

- Tarea marcada manualmente con sol: el botón permite desmarcarla.
- Tarea que aparece porque vence hoy: sigue apareciendo aunque el sol esté gris, porque es obligatoria para el día.

Si hace falta, ajustaré el tooltip para que sea claro.

## Resultado esperado

Con la data actual, la tarea:

“Llamar al tecnico de reparaciones y coordinar cita”

aparecerá inmediatamente en el card “HOY · FOCUS” porque:

- vence el 05/04/2026,
- hoy es 05/04/2026,
- y no está completada.

No requiere cambiar datos en la base de datos; es una corrección de lógica en la UI.