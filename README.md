# Claude Usage Monitor — VSCode Extension

Muestra en tiempo real el uso de la API de Claude (ventana de 5 horas y 7 días) directamente en la **barra de estado de VSCode** y en un **panel detallado**.

---

## Instalación local (modo desarrollo)

### Requisitos
- Node.js ≥ 18
- npm
- VSCode ≥ 1.85

### Pasos

```bash
cd claude-usage-vscode
npm install
npm run compile
```

Luego pulsa **F5** en VSCode (con este directorio abierto). Se abrirá una ventana de *Extension Development Host* con la extensión activa.

Para desarrollo continuo con recompilación automática:
```bash
npm run watch
```

### Empaquetar con vsce

```bash
npm run package
# Genera: claude-usage-vscode-0.1.0.vsix
```

Instalar el `.vsix` en VSCode:
```bash
code --install-extension claude-usage-vscode-0.1.0.vsix
```

---

## Configuración del token (autenticación)

La extensión necesita un **OAuth access token** de Anthropic.

### Opción 1 — Auto-detección (Windows, best-effort)

La extensión intentará leer automáticamente las credenciales de Claude Code desde:
- Windows Credential Manager (entrada `"Claude Code-credentials"`)
- Archivos en `~/.claude/`, `%APPDATA%\Claude\`, etc.

> **Nota Windows:** La auto-detección vía Credential Manager usa P/Invoke desde PowerShell. Puede no funcionar en todos los entornos. Si falla, usa la Opción 2.

### Opción 2 — Token manual (recomendado en Windows)

1. Ejecuta el comando: **`Claude Usage: Sign In / Configure Token`**
2. Pega tu access token de Claude.
3. El token se guarda en el **SecretStorage de VSCode** (cifrado, nunca en `settings.json`).

#### ¿Cómo obtener el token?

Abre la consola de Chrome DevTools en `claude.ai` y busca en `Application → Cookies` el valor de la sesión OAuth, o extráelo de Claude Code:

```powershell
# PowerShell — muestra el token almacenado por Claude Code (si existe)
cmdkey /list | Select-String "Claude"
```

---

## Comandos disponibles

| Comando | Descripción |
|---------|------------|
| `Claude Usage: Open Panel` | Abre el panel con el detalle completo |
| `Claude Usage: Refresh` | Fuerza un refresh manual |
| `Claude Usage: Sign In / Configure Token` | Configura o reemplaza el token |
| `Claude Usage: Toggle Status Bar Mode` | Alterna entre `percentage`, `bar`, `compact` |

---

## Settings

| Setting | Tipo | Default | Descripción |
|---------|------|---------|-------------|
| `claudeUsage.refreshIntervalSeconds` | number | `60` | Frecuencia de auto-refresh (mín. 10s) |
| `claudeUsage.thresholds` | number[] | `[50,75,90,100]` | Umbrales de notificación (%) |
| `claudeUsage.statusBarDisplay` | string | `percentage` | Modo de la barra: `percentage`, `bar`, `compact` |
| `claudeUsage.primaryMetric` | string | `fiveHour` | Métrica principal: `fiveHour` o `weekly` |
| `claudeUsage.enableNotifications` | boolean | `true` | Activar notificaciones de umbral |
| `claudeUsage.debugLogging` | boolean | `false` | Logs detallados en el canal "Claude Usage" |
| `claudeUsage.autoDetectCredentials` | boolean | `true` | Intentar auto-detectar credenciales |

---

## API utilizada

- **Endpoint:** `GET https://api.anthropic.com/api/oauth/usage`
- **Headers:** `Authorization: Bearer {token}`, `anthropic-beta: oauth-2025-04-20`
- **Respuesta:**
  ```json
  {
    "five_hour": { "utilization": 72.5, "resets_at": "...", "tokens_used": 55000, "tokens_limit": 100000 },
    "seven_day":  { "utilization": 35.0, "resets_at": "...", "tokens_used": 35000, "tokens_limit": 100000 }
  }
  ```

---

## Seguridad

- Los tokens **nunca** se guardan en `settings.json`.
- Se usa `context.secrets` (VSCode SecretStorage — cifrado en el keychain del OS).
- Los logs de debug solo muestran los últimos 4 caracteres del token.

---

## Troubleshooting

**La barra muestra "Sign in":**
→ Ejecuta `Claude Usage: Sign In / Configure Token` y pega tu token.

**Error "Unauthorized" después de funcionar:**
→ El token ha expirado. Vuelve a hacer Sign In.

**No aparece nada en la barra de estado:**
→ Comprueba que la extensión está activa (`Extensions: Show Running Extensions`) y que `claudeUsage.statusBarDisplay` no está mal configurado.

**Quiero ver logs de debug:**
→ Activa `claudeUsage.debugLogging: true` y abre el panel "Output" → "Claude Usage".

---

## Limitaciones conocidas (Windows)

- La auto-detección vía Windows Credential Manager es **best-effort** y puede requerir que PowerShell esté disponible y sin restricciones de política de ejecución.
- La extracción desde el Keychain de macOS (`"Claude Code-credentials"`) **no aplica** en Windows; en su lugar se usa el Credential Manager.
- En entornos corporativos con políticas de PowerShell restrictivas, la auto-detección puede fallar — usa el token manual.

---

## Estructura del proyecto

```
src/
├── extension.ts                 # Punto de entrada, comandos, timer
├── usage/
│   ├── types.ts                 # Tipos: UsageSnapshot, StoredToken
│   ├── AnthropicUsageClient.ts  # Cliente HTTP a la API de Anthropic
│   └── CredentialProvider.ts   # Gestión de tokens (SecretStorage + auto-detect)
├── ui/
│   ├── StatusBarController.ts  # Status bar item
│   └── PanelWebview.ts         # Panel webview con anillos y trend
└── storage/
    └── HistoryStore.ts          # Historial de uso (globalState)
```
