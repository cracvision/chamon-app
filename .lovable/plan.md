## Plan: añadir animación MCH debajo del card de login

1. **Copiar el componente al proyecto**
   - Copiar `user-uploads://MchSplashScreen.tsx` a `src/components/MchSplashScreen.tsx` (sin modificar — ya respeta `prefers-reduced-motion` y trae todas las animaciones del logo).

2. **Integrarlo en `src/routes/auth.tsx`**
   - Importar el componente.
   - Renderizarlo justo debajo del `<form>` (antes del botón de toggle signin/signup), envuelto en un contenedor que:
     - Lo muestre **inline** (no fullscreen): override de `position: fixed` no aplica porque pasaremos props o usaremos un wrapper. Como el componente original es `position: fixed` por diseño (splash), necesitamos una variante embebida.
   - **Decisión:** en lugar de pasarle props nuevas al componente (que rompería su contrato de splash), crear un wrapper ligero `MchLogoAnimated` reutilizando solo el `<svg>` y los `<style>` de animaciones del archivo subido, sin el overlay fixed ni la lógica de fade/onComplete. Así queda un logo animado limpio para embeber.
   - Tamaño sugerido: `size={140}` centrado, con margen superior moderado debajo del card.

3. **Resultado visual**
   - Card de credenciales → animación del logo MCH (flecha sube/baja + bullseye pulsa) → link "¿No tienes cuenta?".
   - Respeta `prefers-reduced-motion`.

### Detalles técnicos
- Crear `src/components/MchLogoAnimated.tsx` con solo el SVG + `<style>` de keyframes del archivo subido (sin `position: fixed`, sin timers, sin `onComplete`).
- Mantener `src/components/MchSplashScreen.tsx` por si más adelante lo usas como splash real al bootear la app.
- No tocar `routeTree.gen.ts`.
