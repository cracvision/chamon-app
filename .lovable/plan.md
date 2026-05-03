## Objetivo
Permitir que Chamón (voz) pueda ver y comentar tu progreso de XP, nivel, racha y trofeos — reusando el tool existente `query_mission_control` en ElevenLabs, sin crear uno nuevo.

## Por qué reusar el mismo tool
El tool ya está montado, autenticado (HMAC + bearer) y apuntando a `chamon-query`. Esa función ya hace switch por `query_type`. Solo hay que:
1. Añadir un nuevo valor al enum (`xp_status`).
2. Crear el handler en el backend.
3. Actualizar las descripciones del tool en ElevenLabs para que el agente sepa cuándo usarlo.

No hay que tocar URL, auth, headers, ni crear properties nuevos — los actuales (`query_type`, `params`, `query`, `mission_id`, `mission_title`, `limit`) cubren todo.

## Cambios en el backend (`chamon-query`)

### 1. Nuevo handler: `handlers/xp_status.ts`
Lee de `user_stats`, `achievements`, `user_achievements` y `xp_events` para devolver:

```text
{
  level: { number, name, xp_total, xp_to_next, progress_pct },
  streak: { current_days, longest_days },
  totals: { tasks_completed, missions_completed },
  trophies: {
    unlocked_count,
    total_count,
    recent_unlocked: [ { name, icon, unlocked_at } ],   // últimos 3
    closest_to_unlock: [ { name, icon, progress, target, pct } ]  // top 3 en progreso
  },
  xp_recent: { today, last_7_days }
}
```

Los textos van en español (igual que los otros handlers, usando `format.ts`).

### 2. Registrar el caso en `index.ts`
Añadir `case "xp_status"` al switch — no necesita params, igual que `today_focus` y `overdue`.

## Cambios en ElevenLabs (manual, te paso los textos)

### A. Editar el property `query_type`
Añadir `xp_status` a la lista de Enum Values (ahora son 6, pasarían a 7).

Y actualizar su Description para mencionar el nuevo caso. Te dejaré el texto exacto a pegar.

### B. Actualizar la Description principal del tool
Mencionar que también responde sobre nivel, XP, racha y trofeos.

### C. Actualizar la Description del body
Indicar que `xp_status` no requiere `params`.

### D. (Opcional) Tweak al system prompt del agente
Añadir una línea: "Si Carlos pregunta sobre su progreso, nivel, XP, racha o trofeos, usa `query_mission_control` con `query_type=xp_status`."

## Lo que NO cambia
- URL del endpoint
- Autenticación (HMAC + bearer)
- Properties existentes (`params`, `query`, `mission_id`, `mission_title`, `limit`)
- Los otros 6 handlers
- Frontend (la página `/achievements` ya existe y funciona)

## Después de aprobar
Implemento el handler + el case del switch, pruebo el edge function localmente con `test_edge_functions`, y te entrego los textos exactos para pegar en los 3 lugares de ElevenLabs.

¿Le doy?
