# CraftCommand Center

CraftCommand Center is a mobile-friendly administration dashboard for the
[Binhex Minecraft Bedrock Server](https://github.com/binhex/arch-minecraftbedrockserver)
Docker container. It talks to the Bedrock console through the container's GNU
`screen` session; it does not require or use RCON.

> [!IMPORTANT]
> CraftCommand Center mounts the Docker socket. Anyone with administrative
> access to the dashboard can perform powerful Docker operations. Run it only
> on a trusted host, use a strong password, and place it behind HTTPS before
> exposing it outside your LAN.

## Current release

| Component | Version |
|---|---|
| CraftCommand Center | **2.3.0-beta.18** |
| Bedrock item catalog | **26.34/35** |
| Item identifiers | **1,914** |
| Achievement records | **131** |

Published images:

```text
ghcr.io/hoovdizz/craftcommand-center:latest        # stable/main
ghcr.io/hoovdizz/craftcommand-center:development   # development builds
```

## What it provides

- Installable, mobile-friendly PWA with multiple themes and button layouts.
- Server status, health, logs, players, permissions, allowlist, and recent
  connection history.
- Item catalog, give/item commands, XP, kits, teleports, time controls, saves,
  and player refresh.
- Admin moderation: kick, allowlist add/remove, operator, and de-op/member.
  Unsupported Bedrock commands are not emulated.
- Admin scheduler for backups, restarts, warning messages, day/night, saves,
  player refreshes, and validated Minecraft commands. Daily, selected weekday,
  weekly, and one-time schedules are supported. Host shell commands are never
  accepted.
- A structured `server.properties` editor that validates changes, shows a
  confirmation diff, creates a timestamped backup, preserves comments and
  unknown properties, and edits only changed values.
- Admin backups/restores, external reachability checks, account management, and
  persistent activity auditing.
- Automatic GNU `screen` attachment discovery after Minecraft restarts.

## Roles and authorization

Permissions are enforced by the server, not just by hidden interface buttons.

| Role | Access |
|---|---|
| Viewer | Dashboard, status, health, logs, players, item and achievement catalogs, and their own activity. |
| Operator | Viewer access plus approved item/XP/kit/teleport/time commands, player refresh, and approved diagnostics. |
| Admin | Full access, including moderation, lifecycle controls, accounts, schedules, backups, properties, and all activity. |

## Choose an installation

| Host | Recommended method | What it installs |
|---|---|---|
| Unraid | Community template in this repository | CraftCommand Center alongside an existing Binhex Bedrock container |
| Windows 10/11 | Bundled PowerShell installer | Docker Desktop, existing or newly deployed Binhex Bedrock configuration, and CraftCommand Center |
| Windows with an existing Binhex container | Manual `docker run` | CraftCommand Center only |

The dashboard and Minecraft must be on the same Docker engine. CraftCommand
does not need to share a Docker network with Minecraft because it communicates
through `/var/run/docker.sock`.

## Unraid installation

### Requirements

- A running Binhex Minecraft Bedrock container.
- Its exact container name (normally `binhex-minecraftbedrockserver`). Find it
  with `docker ps --format '{{.Names}}'` in the Unraid terminal.
- Host TCP port `8223` available for CraftCommand Center.
- A persistent appdata directory and a persistent backup directory.

### 1. Install the Unraid template

Open **Unraid > Terminal** and run:

```bash
mkdir -p /boot/config/plugins/dockerMan/templates-user
wget -O /boot/config/plugins/dockerMan/templates-user/my-craftcommand-center.xml \
  https://raw.githubusercontent.com/hoovdizz/craftcommand-center/main/templates/my-craftcommand-center.xml
```

Then open **Docker > Add Container**, select **CraftCommand-Center** from the
Template list, and configure these important fields:

| Template field | Recommended value | Notes |
|---|---|---|
| WebUI Port | `8223` | Change the host side if the port is already used. |
| Docker Socket | `/var/run/docker.sock` | Required; leave container path unchanged. |
| Persistent Data | `/mnt/user/appdata/craftcommand-center/data` | Stores users, settings, schedules, history, and audit data. |
| Backup Storage | `/mnt/user/backups/craftcommand-center` | Stores Minecraft exports; keep this outside the container. |
| Admin Username | A private administrator name | `admin` is only a bootstrap default. |
| Admin Password | A unique, long password | Never deploy the template default `changemenow`. |
| Minecraft Container | Exact name from `docker ps` | Usually `binhex-minecraftbedrockserver`. Names are case-sensitive. |
| Docker User | `nobody` | The user that normally owns the Binhex screen session. |
| Screen Session | `auto` | Lets CraftCommand rediscover the session after restarts. |
| Command Method | `attach` | Correct method for the supported Binhex container. |
| Minecraft WebUI URL | `http://[IP]:8222` | Optional shortcut shown in the dashboard. |
| Unraid Docker URL | `http://[IP]/Docker` | Optional shortcut shown in the dashboard. |

Keep **Privileged** disabled. The Docker socket mount supplies the access the
application needs. Review the optional reachability and backup retention fields,
click **Apply**, and wait for the container to start.

### 2. First sign-in and validation

Open `http://UNRAID-IP:8223`, sign in with the username/password entered in the
template, and then:

1. Open **Status > Minecraft Server Connection**.
2. Confirm the selected container matches the exact Binhex container name.
3. Use the attachment refresh/test control and confirm the status is healthy.
4. Open **Players** and refresh once.
5. As an admin, review **Admin > Server properties**, **Scheduled Actions**,
   backup retention, and external reachability before enabling automation.

### 3. Updating on Unraid

In **Docker**, choose **Check for Updates**, then update the CraftCommand Center
container. The `/app/data` and `/app/backups` mappings preserve application data
when the container is recreated. If a browser still shows an older interface,
hard-refresh it or clear the site's cached data/PWA cache.

## Windows Docker Desktop installation

### Requirements

- Windows 10 or Windows 11.
- An account allowed to elevate to Administrator.
- Docker Desktop using **Linux containers**. The installer can start Docker
  Desktop, but Docker Desktop itself must already be installed.
- Free ports: TCP `8222` (Minecraft WebUI), TCP `8223` (CraftCommand), and
  TCP/UDP `19132` and `19133` (Bedrock).

### Recommended: bundled installer

Open PowerShell. Download the script first so it can be reviewed before it is
run:

```powershell
Invoke-WebRequest `
  -Uri https://raw.githubusercontent.com/hoovdizz/craftcommand-center/main/tools/Windows-Bundle-Install.ps1 `
  -OutFile .\Windows-Bundle-Install.ps1

Set-ExecutionPolicy -Scope Process Bypass
.\Windows-Bundle-Install.ps1
```

The script self-elevates, verifies Docker Desktop and Linux-container mode,
prompts for the `latest` or `development` CraftCommand channel, and asks for one
username and masked password. Those credentials are applied to both the Binhex
WebUI and CraftCommand Center. The password must be at least 10 characters.

It then pulls current images, recreates both containers, configures Windows
Firewall rules, and validates the result. Existing persistent directories are
kept:

```text
C:\Docker\minecraftbedrockserver
C:\Docker\craftcommand-center\data
C:\Docker\craftcommand-center\backups
```

> [!WARNING]
> Re-running the bundle replaces both containers and cached copies of their
> images. It does not delete the persistent directories above, but you should
> still keep an independent backup before any major update.

After installation, open:

- CraftCommand Center: `http://localhost:8223`
- Binhex Minecraft WebUI: `http://localhost:8222`
- Another LAN device: replace `localhost` with the Windows computer's LAN IP.
- Minecraft Bedrock: connect to the Windows computer's LAN IP on UDP `19132`.

To choose a channel without the prompt:

```powershell
.\Windows-Bundle-Install.ps1 -CraftChannel latest
# Or use: -CraftChannel development
```

Re-run the same installer to refresh both images while retaining the mapped
data. Use `latest` unless you intentionally want prerelease changes.

### Manual Windows install (CraftCommand only)

Use this when the Binhex Bedrock container already exists in the same Docker
Desktop Linux engine. First obtain its exact name:

```powershell
docker ps --format "{{.Names}}"
```

Then create persistent folders and start CraftCommand. Replace the example
credentials and, if necessary, the Minecraft container name:

```powershell
$CraftRoot = 'C:\Docker\craftcommand-center'
New-Item -ItemType Directory -Force `
  "${CraftRoot}\data", "${CraftRoot}\backups" | Out-Null

docker run -d --name craftcommand-center `
  --restart unless-stopped `
  -p 8223:8223 `
  -e CCC_USERNAME='your-admin-name' `
  -e CCC_PASSWORD='replace-with-a-long-unique-password' `
  -e CCC_MINECRAFT_CONTAINER='minecraftbedrockserver' `
  -e CCC_DOCKER_USER='nobody' `
  -e CCC_SCREEN_SESSION='auto' `
  -e CCC_COMMAND_METHOD='attach' `
  -e CCC_BACKUP_ENABLED='true' `
  -e CCC_BACKUP_SOURCE_PATH='/config' `
  -e CCC_BACKUP_DIR='/app/backups' `
  -v "${CraftRoot}\data:/app/data" `
  -v "${CraftRoot}\backups:/app/backups" `
  -v /var/run/docker.sock:/var/run/docker.sock `
  ghcr.io/hoovdizz/craftcommand-center:latest
```

Open `http://localhost:8223`, then use **Status > Minecraft Server Connection**
to test or correct the container name. No RCON port or password is required.

To update a manual installation, pull the same channel, remove only the
CraftCommand container, and repeat the original `docker run` command. Do not
remove the mapped data directories.

```powershell
docker pull ghcr.io/hoovdizz/craftcommand-center:latest
docker stop craftcommand-center
docker rm craftcommand-center
# Repeat the docker run command above.
```

## Initial administration checklist

1. Change the initial admin password under **Admin > Change admin password**.
   The saved account in `/app/data/users.json` takes precedence over bootstrap
   environment credentials on later starts.
2. Create individual Viewer or Operator accounts instead of sharing Admin.
3. Test a harmless action such as player refresh or `list` before lifecycle
   actions.
4. Create one manual backup and verify it appears in the backup directory.
5. Confirm the displayed timezone before creating schedules. Schedules use the
   container's configured local time.
6. Review external reachability settings before enabling internet probes.
7. Put the dashboard behind an HTTPS reverse proxy if it will be reachable from
   outside the trusted LAN. Plain HTTP does not encrypt credentials.

## Scheduled actions

Admins manage schedules under **Admin > Scheduled Actions**. A schedule has a
name, enabled state, action, schedule type, time/day selection, and action-specific
options. The page reports last run, last result, and next run. Schedules persist
in `/app/data/schedules.json` and are checked every 30 seconds.

Supported actions are Minecraft backup/export, restart, `say`, day, night, save,
player refresh, and a validated Minecraft server command. Restart schedules may
send a warning in advance. “Custom command” means a Minecraft command only;
arbitrary host shell execution is not available. Every run and restart warning
is written to the activity log.

## Safe `server.properties` editor

Admins can edit supported properties under **Admin > Server properties**. The
form groups General, Gameplay, Network, Performance, and Security settings and
only presents values that exist or are safe for the detected server.

Before a save, CraftCommand validates values and asks the admin to confirm the
old-to-new diff. It creates a timestamped backup beside `server.properties`,
preserves comments and unsupported properties where practical, and changes only
submitted values. Many Bedrock properties take effect only after a Minecraft
restart.

## Player moderation and connection history

Admins can use the Bedrock-supported kick, allowlist add/remove, operator, and
de-op/member actions. Confirmation is required for destructive or permission
changes, and every attempt is audited with the acting CraftCommand user, player,
result, timestamp, and success/failure state. Ban/unban or Visitor controls are
not fabricated when the running Bedrock server has no supported command.

Connection history is derived from timestamped container logs and live player
data. Join time, detectable leave time, last seen, and current status are stored
in `/app/data/player-history.json` with bounded retention. It is intentionally
presented as best-effort history when logs cannot establish an exact event.

## Persistent storage

Always map both directories:

| Container path | Purpose |
|---|---|
| `/app/data` | Accounts, settings, schedules, activity, connection data, kits, and locations |
| `/app/backups` | Minecraft backup/export archives |

Important files under `/app/data` include:

```text
users.json                 accounts and password hashes
activity.jsonl             persistent audit activity
connection.json            selected Docker/screen attachment
external-server.json       reachability configuration
schedules.json             scheduled actions and their run state
player-history.json        bounded, best-effort player sessions
manual-players.json        manually retained player entries
custom-kits.json           custom kits
quick-items.json           dashboard item shortcuts
teleport-locations.json    saved teleport destinations
```

Themes, background choice, button layout, and achievement checklist state are
stored in each browser rather than on the server.

## Reachability configuration

Under **Admin > Internet reachability**, configure a public hostname/IP, Bedrock
UDP port (normally `19132`), and probe mode (`external`, `local`, or `both`). The
settings persist in `/app/data/external-server.json`. An internet probe can be
briefly cached; a local probe can be affected by router NAT-loopback behavior.

## Environment reference

| Variable | Purpose / typical value |
|---|---|
| `CCC_APP_TITLE` | Dashboard title |
| `CCC_USERNAME`, `CCC_PASSWORD` | Bootstrap administrator credentials |
| `CCC_PASSWORD_HASH` | Optional scrypt hash instead of plaintext bootstrap password |
| `CCC_SESSION_HOURS` | Login session lifetime |
| `CCC_MINECRAFT_CONTAINER` | Exact Minecraft Docker container name |
| `CCC_DOCKER_USER` | Screen owner; normally `nobody` for Binhex |
| `CCC_SCREEN_SESSION` | Screen name or `auto` for discovery |
| `CCC_COMMAND_METHOD` | Normally `attach` |
| `CCC_AUTO_REFRESH_ATTACHMENT_ON_BOOT` | Rediscover attachment at startup |
| `CCC_REFRESH_ATTACHMENT_BEFORE_COMMAND` | Refresh attachment before commands |
| `CCC_SHOW_RAW_OUTPUT` | Include raw console output in responses |
| `CCC_MINECRAFT_WEBUI_URL` | Optional Binhex WebUI shortcut |
| `CCC_UNRAID_DOCKER_URL` | Optional Unraid Docker-page shortcut |
| `CCC_AUDIT_ENABLED`, `CCC_AUDIT_MAX_ENTRIES` | Persistent activity controls |
| `CCC_EXTERNAL_CHECK_ENABLED` | Run reachability checks |
| `CCC_EXTERNAL_HOST`, `CCC_EXTERNAL_PORT` | Public Bedrock endpoint |
| `CCC_EXTERNAL_CHECK_MODE` | `external`, `local`, or `both` |
| `CCC_EXTERNAL_TIMEOUT_MS` | Reachability timeout |
| `CCC_BACKUP_ENABLED` | Enable admin backups |
| `CCC_BACKUP_SOURCE_PATH` | Minecraft container source, normally `/config` |
| `CCC_BACKUP_DIR` | CraftCommand archive directory, normally `/app/backups` |
| `CCC_BACKUP_RETENTION` | Number of newest exports retained |
| `CCC_BACKUP_TIMEOUT_MS` | Backup/restore timeout |
| `CCC_BACKUP_SAVE_HOLD` | Pause saving while creating a consistent backup |

Settings saved by an admin in `/app/data` can override corresponding bootstrap
environment values.

## Troubleshooting

### CraftCommand cannot find or control Minecraft

- Confirm both containers appear in the same `docker ps` output.
- Copy the Minecraft container name exactly; do not use the image name.
- Confirm `/var/run/docker.sock` is mounted inside CraftCommand.
- For Binhex, use Docker user `nobody`, screen session `auto`, and method
  `attach`, then refresh the attachment on the Status page.
- Inspect logs with `docker logs craftcommand-center` and the Minecraft logs
  from Unraid or Docker Desktop.

### A port is already allocated

Change only the host side of the mapping. For example, `-p 8323:8223` makes the
dashboard available at `http://localhost:8323` while its container port remains
`8223`. Ensure firewall and bookmarks use the new host port.

### The browser shows old controls or “Method Not Allowed” after an update

Hard-refresh the page, close installed PWA windows, or clear site data and open
the dashboard again. Browsers can retain an older service-worker cache after a
container update.

### Backups disappear after recreating the container

Verify `/app/backups` is mapped to a host directory. Mapping `/app/data` alone
does not preserve exported archives.

### Scheduled work runs at the wrong hour

Schedules use the container timezone. Set the Docker `TZ` environment variable
to an IANA timezone such as `America/New_York`, recreate the CraftCommand
container, and verify the next-run value before enabling important schedules.

### Property changes do not appear in the running world

Many `server.properties` values are read only during Bedrock startup. Confirm
the save succeeded and its backup path is shown, then perform an admin-approved
Minecraft restart.

## Development

```bash
npm run check
node server.js
```

The application intentionally has no runtime npm dependencies. GitHub Actions
validates the repository and publishes GHCR images from `main` and
`development`.
