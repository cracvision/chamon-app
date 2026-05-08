## Cierre Fase 1: Zod + audit columns + FK

Cuatro cambios coordinados — uno cliente (Zod), tres SQL (columnas + FK) + edits a la RPC para poblar las nuevas columnas.

### 1. Zod en cliente (`src/lib/agent-actions.ts`)

- Añadir `import { z } from 'zod'` y definir 4 schemas: `createTaskPayload`, `createMissionPayload`, `createReservationPayload`, `updateTaskPayload`.
- Mapa `PAYLOAD_SCHEMAS: Record<action_type, ZodSchema>` exportado, más tipo `AgentActionType`.
- En `proposeAgentAction`: antes del INSERT, hacer `safeParse`; si falla, `throw new Error(\`Invalid payload for ${action_type}: ${issues}\`)`. Si pasa, insertar `parsed.data` (no el original).
- Aplicar a TODOS los call sites — actualmente solo hay uno (`_authenticated.agent.tsx`, "+ test action"), pero el chequeo va dentro de `proposeAgentAction` para que cubra futuros call sites de Fase 2 automáticamente.

Ajustes a los schemas vs. propuesta del usuario para alinear con el DDL real:
- `create_task.due_date`: usar `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` (la columna es `date`, no `timestamptz`; la RPC ya parsea con `::date`). Mismo ajuste para `create_mission.due_date`, `create_reservation.check_in_date/check_out_date`, `update_task.updates.due_date`.
- `create_mission.priority`: `z.enum(['low','mid','high'])` (matchea el default `'mid'` del DDL y el resto del código en `QuickAddDialog`). NO `'medium'/'critical'`.
- `create_reservation.source`: agregar `'direct'` o dejar como propone el usuario; mantener la lista propuesta es seguro (la RPC no valida el valor).
- `update_task`: la RPC actual lee campos planos del payload (`payload->>'title'`, etc.), no un sub-objeto `updates`. Dos opciones: (a) cambiar el schema a campos planos para matchear la RPC, o (b) cambiar la RPC a leer `payload->'updates'->>...`. Voy con (a) — menos cambios, no rompe nada existente. Esquema: `{ task_id, title?, notes?, status?, due_date?, is_today?, friction_level? }` con `.refine` para exigir ≥1 campo además de `task_id`.

### 2. Migración SQL única

Una sola migración con todo:

```sql
-- 2.1 executed_by
ALTER TABLE public.agent_actions
  ADD COLUMN IF NOT EXISTS executed_by uuid REFERENCES auth.users(id);

-- 2.2 agent_action_id en tasks/missions
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS agent_action_id uuid
  REFERENCES public.agent_actions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_agent_action_id
  ON public.tasks(agent_action_id) WHERE agent_action_id IS NOT NULL;

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS agent_action_id uuid
  REFERENCES public.agent_actions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_missions_agent_action_id
  ON public.missions(agent_action_id) WHERE agent_action_id IS NOT NULL;

-- 2.3 FK assets.property_id (precheck huérfanos primero via read_query)
ALTER TABLE public.assets
  ADD CONSTRAINT assets_property_id_fkey
  FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE RESTRICT;

-- 2.4 Reescribir execute_agent_action con:
--   a) Validación plpgsql defensiva por action_type (mission_id+title, area_id+title, etc.)
--   b) UPDATE final agrega executed_by = _uid
--   c) INSERT a tasks/missions agrega agent_action_id = _action.id
CREATE OR REPLACE FUNCTION public.execute_agent_action(_action_id uuid) ...
```

Antes de aplicar la FK de assets, correré:
```sql
SELECT COUNT(*) FROM assets
WHERE property_id IS NOT NULL
  AND property_id NOT IN (SELECT id FROM properties);
```
Si >0, paro y reporto. Si 0, sigo. (Tabla está vacía probablemente — Fase 2 no arrancó.)

### 3. Verificación post-migración

- Query del usuario (`SELECT aa.id, executed_by, approved_by, t.agent_action_id ...`) corrida via `read_query` después de pedirle al usuario que haga un test action E2E.
- Test negativo Zod: documentado en mi respuesta final para que el usuario lo corra desde la consola del browser (no puedo ejecutarlo desde mi entorno sin sesión auth).

### Lo que NO incluye este plan

- `created_by_agent` boolean separado en recursos creados — no lo pediste; con `agent_action_id IS NOT NULL` ya tenés el equivalente.
- Cambios en `_authenticated.agent.tsx` más allá de propagar errores Zod via toast (ya hace `toast.error(e?.message)`, alcanza).
- Migrar el shape de `update_task` a `{ updates: {...} }` anidado — preservo el shape plano actual de la RPC.

### Archivos tocados

- `src/lib/agent-actions.ts` — Zod schemas + validación en `proposeAgentAction`.
- `supabase/migrations/<timestamp>_phase1_close.sql` — todo el SQL.
- `src/integrations/supabase/types.ts` — auto-regenerado tras migración.

¿Procedo?
