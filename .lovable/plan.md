
# Mission Control → Agentic Operating System

Convertir la app de "organizador" a "operador": detectar → entender → proponer → ejecutar → verificar, con cola de acciones supervisada y trazabilidad completa. Cada fase entrega valor por sí sola y deja base para la siguiente.

---

## Principios arquitectónicos (transversales)

1. **Fuente de verdad ≠ representación.** `reservations` es la verdad; el evento de calendario y las tareas son derivados.
2. **Nada se ejecuta sin pasar por `agent_actions`.** Toda acción del agente (crear evento, tarea, misión, email) se propone primero. Auto-ejecuta sólo si `confidence ≥ umbral` y la regla lo permite.
3. **Idempotencia obligatoria.** Cada acción derivada de una fuente externa lleva una `idempotency_key` (ej. `airbnb:{confirmation_code}:{check_in}`) para evitar duplicados al reintentar.
4. **Audit trail siempre.** Toda acción ejecutada se escribe en `events` con `source`, `tool_name`, `old/new value`, `confidence`, `approved_by`.
5. **Chamón = frontman.** Detrás, sub-agentes especializados (Inbox, Reservation, Calendar, Task Planner, Document, Maintenance, Finance, Briefing, Audit) — cada uno una edge function o handler dedicado, no un mega-prompt.
6. **Confidence Gate estándar:** ≥0.90 auto (si la regla lo permite) · 0.70–0.89 requiere aprobación · <0.70 crea tarea "revisar".

---

## FASE 1 — Foundation: memoria operacional + cola de acciones

Objetivo: dar al agente memoria estructurada y un canal supervisado para actuar. Sin UI vistosa todavía; aquí se construye la base.

**Esquema nuevo (migraciones):**

- `reservations` — campos del blueprint (property_name, source, confirmation_code, guest_*, check_in/out, payout, status, confidence_score, source_email_ids[], calendar_event_id, mission_id). RLS por `user_id`. Índice único parcial sobre `(user_id, source, confirmation_code)`.
- `agent_actions` — cola: `source_type`, `source_ref`, `action_type`, `payload_json`, `confidence_score`, `status` (proposed/approved/rejected/executed/failed), `requires_approval`, `idempotency_key` (UNIQUE), `executed_at`, `error_message`, `created_by_agent`.
- `email_ingestion_log` — `gmail_message_id` (UNIQUE), `from`, `subject`, `received_at`, `classification`, `processed_at`, `extracted_payload jsonb`. Evita reprocesar.
- `vendors` — name, category, phone, email, rating, last_service_date, notes (RLS por user_id).
- `assets` — equipo/activo (nevera, A/C, lockbox, etc.) por property con historial via `events`.
- Extender `attachments` con `extracted_data jsonb` y `asset_id` opcional.

**Edge functions / server fns nuevas:**

- `agent-actions-execute` — toma una `agent_action` aprobada y la ejecuta (switch por `action_type`). Escribe a `events`. Maneja idempotencia.
- `agent-actions-propose` — helper compartido que sub-agentes llaman para encolar.

**UI mínima:**

- Pantalla `/agent` (dev/admin): lista de `agent_actions` con Approve / Reject / Edit payload / Execute. Sin estilos finos, funcional.

**Criterio de éxito:** puedo crear manualmente una `agent_action` con payload de "crear tarea X", aprobarla en UI, y se ejecuta + queda auditada.

---

## FASE 2 — Reservation Autopilot (Vista Pelícano)

El primer feature agéntico end-to-end. Email de Airbnb → reserva → calendario → misión + tareas.

**Sub-agentes (edge functions):**

1. `gmail-sync-reservations` — cron cada 10 min. Busca emails nuevos de Airbnb/VRBO/Booking (filtro por remitente). Inserta en `email_ingestion_log` con `classification = 'reservation_candidate'`.
2. `reservation-extract` — para cada candidato: llama Lovable AI (`google/gemini-2.5-flash`) con schema JSON estricto. Extrae guest, fechas, código, monto, confidence. Guarda payload en `email_ingestion_log.extracted_payload`.
3. `reservation-propose` — encola en `agent_actions`:
   - `create_reservation` (siempre)
   - `create_calendar_event` (si Google Calendar conectado)
   - `create_mission_from_template` (template "Preparar estadía")
   - tareas estándar (confirmar, limpieza, inventario, instrucciones, checkout, review)
   - Todas comparten `idempotency_key = airbnb:{code}:{check_in}`.
4. **Google Calendar write** — OAuth scope `calendar.events`, nuevo connector. Crear evento con descripción + link al email original. Guardar `calendar_event_id` en `reservations`.
5. **Reconciliación** — si llega email de cambio/cancelación con mismo `confirmation_code`: extraer diff, encolar `update_reservation` + `update_calendar_event` + `update_tasks`. Cancelaciones SIEMPRE requieren aprobación.

**Templates de misión** (nueva tabla `mission_templates`):

- "Nueva reserva Airbnb" → 7 tareas predefinidas con offsets de fecha relativos al check-in/out.
- Helper `instantiate_template(template_id, context)` que crea misión + tareas con due_dates calculados.

**UI nueva:**

- `/operations/vista-pelican` — Vista Pelícano dashboard:
  - Próxima llegada / Huésped actual / Próxima salida
  - Limpieza pendiente · Mantenimiento pendiente
  - Estado operacional (OK/Atención/Crítico)
- `/operations/reservations` — lista de `reservations` con filtros y detalle.
- Inbox de `agent_actions` ahora con UI bonita: agrupación por reserva, "Approve all" por grupo.

**Auto-aprobación opcional** (settings): "Auto-aprobar reservas confirmadas con confidence ≥ 0.95".

**Criterio de éxito:** llega un email real de Airbnb → en <15 min veo propuesta agrupada → 1 click crea reserva + evento + misión + 6 tareas, todo trazable.

---

## FASE 3 — Operaciones completas (cleaning, maintenance, guest inbox, money)

Construir los demás sub-agentes sobre la base de Fase 1-2.

**Cleaning Coordinator Agent:**
- Al confirmarse reserva, ya se crean tareas de limpieza. Añadir: asignación automática a `vendor` con categoría `cleaning`, recordatorio email/SMS X horas antes, escalación a "crítico" si no hay confirmación 24h antes del check-in.

**Maintenance Memory Agent:**
- Cuando se sube adjunto (foto/factura) a una tarea/misión: `attachment-analyze` (multimodal) detecta tipo (factura, foto avería, garantía), extrae monto/técnico/fecha, vincula a `asset`, propone cerrar tarea + crear recordatorio garantía. Historial visible por activo.

**Guest Communication Agent:**
- `gmail-sync-guests` clasifica emails de huéspedes (pregunta / problema / queja / review). Para cada uno, propone borrador de respuesta (NO envía solo). UI tipo bandeja con "Aprobar y enviar" / "Editar".

**Finance Agent:**
- Detecta payouts y gastos en emails/adjuntos. Categoriza (limpieza/mantenimiento/supplies/utilities/plataforma). Tabla `transactions`. Resumen mensual + export CSV. Alertas de anomalía ("gasto mantenimiento +38% vs mes anterior").

**UI: secciones nuevas dentro de Vista Pelícano:**
- Guest Inbox · Turnovers · Maintenance (con historial por activo) · Money (resumen + transacciones) · Agent Actions (cola unificada).

**Persistencia automática de adjuntos del widget Chamón** (item del roadmap): cuando Chamón recibe foto/doc en conversación, ofrece "guardar como adjunto de [misión/tarea X]" automáticamente.

---

## FASE 4 — Proactividad (briefings, debriefs, "what am I missing?")

El agente deja de esperar y empieza a empujar.

- **Morning Briefing Agent** (cron 7am hora del usuario): genera resumen accionable usando tareas + calendario + Gmail + reservas + health. Entrega via email (ya tienes infra) + notificación in-app + opcional voz al abrir Chamón.
- **End-of-Day Debrief Agent** (cron 9pm): qué se completó / movió / quedó. Pregunta "¿reprogramo no completadas a mañana?" con un click.
- **Weekly Strategy Agent** (domingo): misiones estancadas, áreas abandonadas, balance de foco entre áreas, top 3 prioridades sugeridas.
- **"¿Qué se me está escapando?"** — botón en Chamón. Recorre: reservas próximas sin limpieza, tareas vencidas, emails sin responder >24h, gastos sin categorizar, adjuntos sin vincular, misiones sin próxima acción. Devuelve lista priorizada con acciones sugeridas (todas vía `agent_actions`).
- **Close-the-Loop Agent**: detecta tareas con verbos "llamar/confirmar/verificar/enviar" y cruza con evidencia (email recibido, foto subida, factura) para proponer cierre.

---

## FASE 5 — Semi-autonomía + Beryllium/Documents

- **Autopilot Rules** (UI de configuración): reglas tipo `if source=airbnb AND action=create_reservation AND confidence>=0.95 THEN auto_execute`. Toda regla auditada.
- **Document-to-Mission Agent**: subir cualquier doc (contrato, SOP, cotización) → resumen + obligaciones + fechas + misión propuesta con tareas y due dates.
- **Beryllium / Consultoría Agent**: extiende guest inbox a emails de trabajo. Detecta deadlines implícitos ("by Friday"), crea tareas con due_date, vincula contactos, resume hilos largos, sugiere bloque en Foco del Día.
- **Review Intelligence**: analiza reviews de huéspedes, detecta patrones recurrentes, propone tareas de mejora del listing.
- **Rollback parcial**: para cada acción ejecutada por agente, botón "deshacer" que revierte (borra evento de calendario, marca tarea como deleted, etc.) usando el `payload_json` original como guía.

---

## Detalles técnicos clave

**Stack:** TanStack Start + Lovable Cloud (Supabase) + edge functions Deno. AI: `google/gemini-2.5-flash` para extracción/clasificación, `gemini-2.5-pro` para razonamiento multimodal pesado, todo vía `LOVABLE_API_KEY` (sin nuevas API keys).

**Gmail:** ya hay `GOOGLE_MAIL_API_KEY` connector. Reutilizar.

**Google Calendar (write):** requiere nuevo connector OAuth con scope `https://www.googleapis.com/auth/calendar.events`. Se pedirá al inicio de Fase 2.

**Cron:** `pg_cron` + `pg_net` llamando a server routes en `/api/public/hooks/*` con header `apikey` (anon key). Una entrada de cron por agente programado.

**RLS:** todas las nuevas tablas con `user_id` y políticas idénticas a las existentes (select/insert/update own). `agent_actions` y `email_ingestion_log` también.

**Idempotencia:** UNIQUE index parcial en `agent_actions(idempotency_key) WHERE idempotency_key IS NOT NULL`. Inserción con `ON CONFLICT DO NOTHING`.

**Observabilidad:** todas las edge functions loggean `{agent, action_type, source_ref, confidence, outcome}` para poder buscar en logs.

**Seguridad de borradores de email:** Fase 3 NUNCA envía emails autónomamente. Sólo borradores. El envío automático queda como regla opt-in en Fase 5.

---

## Recomendación de orden

Si te parece bien, ejecutamos **Fase 1 + arranque de Fase 2** en el primer sprint (foundation + Reservation Autopilot end-to-end con aprobación manual). Es lo que da valor visible más rápido y valida la arquitectura para todo lo demás.

Cuando apruebes el plan, antes de codear te confirmo:
1. ¿Activas el connector de Google Calendar ahora o esperamos al final de Fase 1?
2. ¿La propiedad "Vista Pelícano" ya existe como `area`/`mission`, o creamos una entidad `properties` desde Fase 1 (recomendado si planeas más unidades)?
3. Umbral de auto-aprobación inicial (sugiero 0.95 sólo para `create_reservation`; resto siempre manual al principio).
