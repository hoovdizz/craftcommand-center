# CraftCommand Center

CraftCommand Center is a mobile-friendly control dashboard for Binhex Minecraft Bedrock Docker containers. It sends commands through the selected container's GNU `screen` console; it does not use RCON.

The dashboard requires access to the Docker socket and should run only on a trusted Docker host or behind an HTTPS reverse proxy.

## Current release

| Component | Version |
|---|---|
| CraftCommand Center | **2.3.0-beta.16** |
| Bedrock item catalog | **26.34/35** |
| Item identifiers | **1,914** |
| Achievement records | **131** |

Images are published to GHCR:

```text
ghcr.io/hoovdizz/craftcommand-center:latest        # main
ghcr.io/hoovdizz/craftcommand-center:development   # development
```

## Features

- Responsive dashboard and installable PWA.
- Deep Ocean, Ember, Daylight, and Minecraft themes.
- Custom background image URLs and bundled Minecraft wallpaper choices.
- Icon + text, icon-only, and text-only button layouts.
- Player discovery, item catalog, XP, kits, teleport locations, and day/night controls.
- Status page with Docker state, uptime, image, online players, access lists, permissions, world name, and recent player connections.
- GNU `screen` attachment rediscovery after container restarts.
- Admin-only account management, audit history, backups, restores, world renaming, and reachability settings.
- Admin-only server-property editor for performance, security, and core gameplay settings.
- Public Bedrock reachability checks using an internet probe, local Docker-host probe, or both.

## Roles

| Role | Capabilities |
|---|---|
| Viewer | Read dashboard, status, players, catalogs, kits, achievements, and personal activity. |
| Operator | Viewer access plus Minecraft commands, XP/items/kits, time, teleports, player refresh, and screen attachment refresh. |
| Admin | Operator access plus accounts, server properties, world settings, backups/restores, reachability, links, and full activity history. |

Only administrators can change server properties. Changes are written to the Minecraft container's `server.properties`; restart the Minecraft container after saving when the server does not reload a value automatically.

### Server properties in Admin

The Admin page loads the current values and keeps each category collapsed until expanded:

- **Performance optimization:** `view-distance`, `tick-distance`, `max-threads`, `player-idle-timeout`.
- **Security:** `allow-list`, `online-mode`, `texturepack-required`, `allow-cheats`.
- **Core gameplay:** `gamemode`, `difficulty`, `force-gamemode`, `default-player-permission-level`.

## Docker deployment

### Docker Desktop on Windows

The dashboard and Minecraft container must use the same Docker engine. CraftCommand needs the Docker socket mounted at `/var/run/docker.sock`.

The automated installer is available at [tools/Windows-Bundle-Install.ps1](tools/Windows-Bundle-Install.ps1):

```powershell
Invoke-WebRequest `
  -Uri https://raw.githubusercontent.com/hoovdizz/craftcommand-center/main/tools/Windows-Bundle-Install.ps1 `
  -OutFile .\Windows-Bundle-Install.ps1
Set-ExecutionPolicy -Scope Process Bypass
.\Windows-Bundle-Install.ps1
```

To install manually:

```powershell
New-Item -ItemType Directory -Force .\craftcommand-data | Out-Null
docker run -d --name craftcommand-center `
  --restart unless-stopped `
  -p 8223:8223 `
  -e CCC_USERNAME=admin `
  -e CCC_PASSWORD="replace-with-a-long-password" `
  -v "${PWD}\craftcommand-data:/app/data" `
  -v /var/run/docker.sock:/var/run/docker.sock `
  ghcr.io/hoovdizz/craftcommand-center:latest
```

Open `http://localhost:8223`, then on **Status → Minecraft Server Connection** select **Binhex Windows Docker / screen** and enter the exact Minecraft container name from:

```powershell
docker ps --format "{{.Names}}"
```

The dashboard container and Minecraft container have different names. No RCON port, RCON password, or LAN scan is required.

### Linux or other Docker hosts

Use the same image and mount `/var/run/docker.sock` into CraftCommand. Mount `/app/data` to persistent storage, publish port `8223`, and select **Binhex Docker / screen** on the Status page. The Minecraft container name must exactly match `docker ps --format "{{.Names}}"` output.

### Updating

```powershell
docker pull ghcr.io/hoovdizz/craftcommand-center:latest
docker stop craftcommand-center
docker rm craftcommand-center
# Run the original docker run command again.
```

For the development channel, replace `:latest` with `:development` in both the pull and run commands.

## Reachability configuration

Open **Admin → Internet reachability** and set:

- Public hostname or IP.
- Public Bedrock UDP port (normally `19132`).
- Probe mode: internet-hosted, local Docker-host, or both.
- Enable/disable the check.

The settings persist in `/app/data/external-server.json`. The internet probe may be briefly cached. Local mode tests from the Docker host and can be affected by router NAT loopback.

## Authentication and security

- The first admin account comes from `CCC_USERNAME` and `CCC_PASSWORD`.
- Change the signed-in admin password from **Admin → Change admin password**. The change persists in `/app/data/users.json` and overrides the bootstrap password.
- Additional viewer, operator, and admin accounts are managed from **Admin → Accounts**.
- Passwords are stored as salted scrypt hashes and sessions use `HttpOnly` cookies.
- Plain HTTP is not encrypted. Use an HTTPS reverse proxy before exposing the dashboard beyond a trusted LAN.
- Docker socket access is equivalent to powerful host access; protect the host and limit routine users to viewer/operator roles.

## Persistent storage

Mount `/app/data` for dashboard settings and `/app/backups` for server exports. Important data files include:

```text
users.json
activity.jsonl
connection.json
external-server.json
manual-players.json
custom-kits.json
quick-items.json
teleport-locations.json
```

Themes, background selection, button layout, and achievement checklist state are browser-local preferences.

## Environment variables

| Variable | Purpose |
|---|---|
| `CCC_APP_TITLE` | Dashboard title |
| `CCC_USERNAME` / `CCC_PASSWORD` | Bootstrap admin credentials |
| `CCC_PASSWORD_HASH` | Optional scrypt hash instead of plaintext password |
| `CCC_SESSION_HOURS` | Session lifetime |
| `CCC_MINECRAFT_CONTAINER` | Default Minecraft Docker container name |
| `CCC_DOCKER_USER` | User owning the Minecraft screen socket |
| `CCC_SCREEN_SESSION` | Screen session name, or `auto` for discovery |
| `CCC_COMMAND_METHOD` | Console attachment method, normally `attach` |
| `CCC_AUTO_REFRESH_ATTACHMENT_ON_BOOT` | Rediscover and attach on startup |
| `CCC_REFRESH_ATTACHMENT_BEFORE_COMMAND` | Refresh the screen attachment before commands |
| `CCC_SHOW_RAW_OUTPUT` | Include raw command output in responses |
| `CCC_MINECRAFT_WEBUI_URL` | Optional Minecraft WebUI link |
| `CCC_AUDIT_ENABLED` / `CCC_AUDIT_MAX_ENTRIES` | Activity logging controls |
| `CCC_EXTERNAL_CHECK_ENABLED` | Enable reachability at startup |
| `CCC_EXTERNAL_HOST` / `CCC_EXTERNAL_PORT` | Public Bedrock endpoint |
| `CCC_EXTERNAL_CHECK_MODE` | `external`, `local`, or `both` |
| `CCC_EXTERNAL_TIMEOUT_MS` | Reachability probe timeout |
| `CCC_BACKUP_ENABLED` | Enable admin backups |
| `CCC_BACKUP_SOURCE_PATH` | Container path to export, normally `/config` |
| `CCC_BACKUP_DIR` | CraftCommand backup directory |
| `CCC_BACKUP_RETENTION` | Number of newest exports to retain |
| `CCC_BACKUP_TIMEOUT_MS` | Backup/restore operation timeout |
| `CCC_BACKUP_SAVE_HOLD` | Keep the server paused during backup operations |

Admin-saved reachability and password settings are stored in `/app/data` and are applied after environment configuration.

## Development

```bash
npm run check
node server.js
```

The application intentionally has no runtime npm dependencies. GitHub Actions validates the project and publishes the `main` and `development` GHCR images.
