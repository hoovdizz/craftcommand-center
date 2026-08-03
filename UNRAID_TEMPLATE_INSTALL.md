# Unraid template installation

## GHCR beta installation

```bash
mkdir -p /boot/config/plugins/dockerMan/templates-user
wget -O /boot/config/plugins/dockerMan/templates-user/my-craftcommand-center.xml \
  https://raw.githubusercontent.com/hoovdizz/craftcommand-center/main/templates/my-craftcommand-center.xml
```

Then select:

```text
Unraid → Docker → Add Container → Template → CraftCommand-Center
```

The template pulls:

```text
ghcr.io/hoovdizz/craftcommand-center:latest
```

Set the correct Binhex container name and replace the default dashboard password. Appdata remains persistent when Unraid replaces or updates the image.

## New 2.2 template fields

External reachability fields:

```text
External Reachability Check: false until configured
External Minecraft Hostname / IP: your public DNS name or IP
External Bedrock UDP Port: 19132
External Check Mode: external
```

The `external` mode uses an internet-hosted Bedrock probe. `local` only tests from Unraid, and `both` reports both.

Backup/export fields:

```text
Backup / Export Storage: /mnt/user/backups/craftcommand-center
Backup / Export Enabled: true
Binhex Backup Source Path: /config
Backup Directory in App: /app/backups
Backup Retention: 10
Pause World Saves During Export: true
```

Only admin accounts can create, list, download, or delete exports.

## Updating

Use **Docker → Check for Updates**, then apply the available update. No local Docker build is required.

## Local-development fallback

Build locally and copy `templates/my-craftcommand-center-local.xml` only when testing unpublished changes:

```bash
docker build -t craftcommand-center:local .
cp templates/my-craftcommand-center-local.xml \
  /boot/config/plugins/dockerMan/templates-user/my-craftcommand-center.xml
```
