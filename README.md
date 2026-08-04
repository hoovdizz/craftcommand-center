# CraftCommand Center

CraftCommand Center is a lightweight, mobile-friendly companion dashboard for **`binhex-minecraftbedrockserver` on Unraid**. It connects to the Binhex container's existing GNU `screen` console instead of replacing the server container.

## Why this exists

General game panels such as Pterodactyl, PufferPanel, Crafty Controller, AMP, and Bedrock Server Manager can provision or fully manage servers. CraftCommand Center is intentionally narrower: it adds safe family/admin shortcuts to a Binhex Bedrock server that is already working.

## Current version

| Component | Version |
|---|---|
| CraftCommand Center | **2.3.0-beta.6** |
| Bundled Bedrock item catalog | **26.34/35** |
| Item identifiers | **1,914** |
| Bedrock achievement records | **131** |
| Achievement supply audit | **August 4, 2026** |

CraftCommand Center uses semantic prerelease versions:

- `2.3.0-beta.6` identifies the application release.
- `2.3` is the feature line.
- `beta.6` is the prerelease iteration and may change before the stable `2.3.0` release.
- GHCR publishes `latest`, version tags, and immutable commit-SHA tags.

The application version is defined in `package.json`, shown by diagnostics, and used to identify support reports. The Minecraft release tag is tracked separately because Mojang item data can change independently of the dashboard.

## Features

### Mobile interface and appearance

- Responsive phone, tablet, and desktop interface
- Automatic button text and icon fitting when portrait-mode space is limited
- Deep Ocean, Ember, and Daylight color schemes stored in the browser
- Correct high-contrast native selectors, kit dialogs, item lists, and action buttons across themes
- Icon-plus-text item buttons by default, with optional text-only and icon-only display modes
- XP labels remain visible in icon-only mode so level and point actions remain distinguishable
- Installable PWA with Android installation and iPhone/iPad Add to Home Screen guidance located only under **Help**

### Players, items, XP, and kits

- Player discovery from the live `list` command, Docker logs, allowlist files, permissions files, and a persistent manual list
- Configurable Quick Items that admins can add, remove, restore to factory defaults, and drag to reorder
- Persistent Quick Item ordering and configuration across container updates
- Quick Item, custom item, and clearly labeled XP actions
- Day and night world-time controls
- Persistent, custom-titled teleport buttons with in-place editing, XYZ coordinates, optional dimension changes, player targeting, drag reordering, temporary destination-chunk preloading, and collision-safe arrival checks
- Dashboard connection label showing the active Bedrock `level-name`
- Starter, recovery, mining, and enchanting kits
- Kit previews, confirmation dialogs, inventory artwork, and a persistent custom-kit builder
- Searchable Bedrock item catalog with 1,914 identifiers, categories, descriptions, and give buttons

### Achievement guide

- Dedicated **Achievements** tab with 131 published Bedrock achievement records
- Search, category, completion-state, platform, and player filters
- Coverage for Xbox, Windows, Android, iOS, Nintendo Switch, and supported PlayStation trophies
- Completion instructions, platform availability, gamerscore/trophy information, and audited recipe materials or activity supplies
- Exact crafting quantities for recipe-based goals, with notes for required stations, enchantments, filled bottles, map data, and naturally earned keys
- Private per-player and per-platform checklists stored in the current browser
- Optional send-listed-supplies actions for operators

Achievement progress is not read from or written to Microsoft or PlayStation accounts. Minecraft only awards achievements in an eligible Survival world. Using dashboard commands to grant practice supplies can make a world ineligible, so the interface warns and requests confirmation before sending them.

### Status, security, and administration

- Username/password authentication using salted scrypt hashes and `HttpOnly` session cookies
- Persistent **viewer**, **operator**, and **admin** accounts with case-insensitive usernames
- Persistent activity history showing who sent each action, its target, and whether it succeeded
- Operators and viewers can only read their own activity; admins can review the full audit trail
- Automatic rediscovery of GNU screen names such as `140.minecraft` after server or container restarts
- Dedicated **Status** tab with Docker uptime, last player connection, online players, whitelist, blacklist, permissions, and public Bedrock UDP reachability
- Admin-only Home Server Links on the Status tab
- At-a-Glance diagnostics for Docker, appdata, authentication, backup storage, the public endpoint, and the active screen session
- Admin-only compressed server backup/export with persistent Unraid storage and browser download
- Unraid DockerMan template for normal **Edit**, port settings, credentials, icon, WebUI, and GHCR updates
- GitHub Actions validation and multi-architecture GHCR publishing

## Role permissions

| Role | Access |
|---|---|
| Viewer | Dashboard, Status, diagnostics, players, kits, catalogs, achievement checklists, and only their own activity history |
| Operator | Viewer access plus item, XP, kit, achievement practice-supply, world-time, saved-teleport, player-refresh, and attachment-refresh actions; activity remains limited to their own account |
| Admin | Operator access plus account management, manual players, Quick Item and teleport-location management, custom kits, all activity, and server backup/export |

The primary admin username/password is managed in the Unraid template. Additional accounts are created from the **Accounts** page and stored in `/app/data/users.json`.

## Item catalog version

The bundled catalog contains **1,914 identifiers** based on Microsoft's official Default Minecraft Item Listings reference.

- Minecraft Bedrock release tag: **26.34/35**
- Latest hotfix update used for the tag: **July 28, 2026**
- Catalog snapshot date: **August 3, 2026**

Descriptions and categories are generated by CraftCommand Center. Item artwork is loaded at view time from the current Minecraft Wiki using its inventory-sprite file names, with the legacy Fandom wiki as a fallback. The repository and Docker image do not bundle or redistribute the wiki's Mojang-owned item artwork. An internet connection is required to display those remote icons. Technical, Education, experimental, or feature-dependent items may not work on every server.

## Security

Username/password authentication does not encrypt plain HTTP. Keep port 8223 on a trusted LAN or use an HTTPS reverse proxy. Do not expose this app directly to the internet.

The Docker socket is powerful. CraftCommand Center limits its app actions, but anyone who controls the container or Unraid host can control Docker. Protect Unraid and use operator/viewer accounts for routine access.

## Publish to GitHub and GHCR

Repository target:

```text
https://github.com/hoovdizz/craftcommand-center
```

The included workflow publishes:

```text
ghcr.io/hoovdizz/craftcommand-center:latest
```

It also creates version-tag and immutable SHA-tag images. See [BETA_TESTING.md](BETA_TESTING.md).

## Install from GHCR on Unraid

After the public repository and package exist, run:

```bash
mkdir -p /boot/config/plugins/dockerMan/templates-user
wget -O /boot/config/plugins/dockerMan/templates-user/my-craftcommand-center.xml \
  https://raw.githubusercontent.com/hoovdizz/craftcommand-center/main/templates/my-craftcommand-center.xml
```

Then open:

```text
Unraid → Docker → Add Container → Template → CraftCommand-Center
```

Set a strong admin password before applying the template. The default image is:

```text
ghcr.io/hoovdizz/craftcommand-center:latest
```

Unraid can then pull updates with **Docker → Check for Updates** without rebuilding locally.

## Persistent data

Map:

```text
/mnt/user/appdata/craftcommand-center/data → /app/data
```

Persistent files include:

```text
manual-players.json
custom-kits.json
quick-items.json
teleport-locations.json
users.json
activity.jsonl
```

Only `Everyone` is hard-coded in the default target config. Player names come from discovery or the manual player list.

Color scheme, display mode, achievement checklists, and the dismissed install prompt are browser-local preferences. They are not written to `/app/data` and do not synchronize between browsers or devices.

The default `external` reachability mode asks the public `mcsrvstat.us` Bedrock API to probe the configured public hostname and port. Select `local` to avoid the third-party lookup, or `both` to compare the external result with Unraid/NAT loopback.

Admin-created server exports are stored separately at:

```text
/mnt/user/backups/craftcommand-center → /app/backups
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `CCC_APP_TITLE` | `CraftCommand Center` | Dashboard title |
| `CCC_USERNAME` | `admin` | Primary admin username |
| `CCC_PASSWORD` | `changemenow` | Primary admin password |
| `CCC_PASSWORD_HASH` | blank | Optional scrypt hash overriding the password |
| `CCC_SESSION_HOURS` | `12` | Login session duration |
| `CCC_MINECRAFT_CONTAINER` | `binhex-minecraftbedrockserver` | Exact Binhex Docker name |
| `CCC_DOCKER_USER` | `nobody` | User owning the Binhex screen socket |
| `CCC_SCREEN_SESSION` | `auto` | Rediscover the current `*.minecraft` session |
| `CCC_COMMAND_METHOD` | `attach` | Compatible Binhex PTY attachment method |
| `CCC_MINECRAFT_WEBUI_URL` | `http://[IP]:8222` | Dashboard quick link |
| `CCC_UNRAID_DOCKER_URL` | `http://[IP]/Docker` | Dashboard quick link |
| `CCC_AUDIT_ENABLED` | `true` | Persistent activity logging |
| `CCC_AUDIT_MAX_ENTRIES` | `2000` | Approximate activity retention |
| `CCC_EXTERNAL_CHECK_ENABLED` | `false` | Enable the public Bedrock UDP reachability check |
| `CCC_EXTERNAL_HOST` | blank | Public DNS name or IP used by outside players |
| `CCC_EXTERNAL_PORT` | `19132` | Public Bedrock UDP port |
| `CCC_EXTERNAL_CHECK_MODE` | `external` | Internet-hosted external probe, local NAT-loopback probe, or both |
| `CCC_BACKUP_ENABLED` | `true` | Enable admin-only backup/export |
| `CCC_BACKUP_SOURCE_PATH` | `/config` | Path inside the Binhex container to export |
| `CCC_BACKUP_DIR` | `/app/backups` | Persistent export destination inside CraftCommand Center |
| `CCC_BACKUP_RETENTION` | `10` | Newest exports retained |

## Development

```bash
npm run check
node server.js
```

The application intentionally has no runtime npm dependencies.
