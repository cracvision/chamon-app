## Fix: Daily Digest email failing (no domain available)

### Problema
Resend rechaza el envío porque `RESEND_FROM_EMAIL` apunta a un `@gmail.com`. Resend prohíbe enviar desde dominios públicos.

### Solución (Opción A — sin dominio)
Usar el remitente sandbox de Resend: `onboarding@resend.dev`. Funciona inmediatamente sin verificar dominio.

### Limitación importante
Con `onboarding@resend.dev`, Resend **solo permite enviar a la dirección de email registrada en tu cuenta de Resend** (la que usaste al crear la cuenta). Si tu `notification_email` en `profiles` es esa misma dirección → llega. Si es otra → Resend lo rechaza con 403.

### Pasos

1. **Actualizar el secret `RESEND_FROM_EMAIL`** al valor:
   ```
   Mission Control <onboarding@resend.dev>
   ```
   (Lo haces tú desde Cloud → Secrets, o yo te abro el diálogo `add_secret` para sobrescribirlo.)

2. **Verificar** que el `notification_email` en tu perfil coincide con el email de tu cuenta Resend. Si no, ajustarlo en Settings.

3. **Probar** con el botón "Enviar digest ahora" en Settings.

4. **(Opcional, recomendado a futuro)** Cuando consigas un dominio (ej: `chamon.app`), migramos a **Lovable Emails** — viene integrado, sin API keys externas, mejor deliverability, y se configura con 2 records NS en tu DNS provider. No requiere cuenta de Resend.

### Archivos
Ningún cambio de código. La lógica de `send-digest-now` y `send-digest-cron` ya lee `RESEND_FROM_EMAIL` correctamente. Solo cambia el valor del secret.
