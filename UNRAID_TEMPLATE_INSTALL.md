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

## Updating

Use **Docker → Check for Updates**, then apply the available update. No local Docker build is required.

## Local-development fallback

Build locally and copy `templates/my-craftcommand-center-local.xml` only when testing unpublished changes:

```bash
docker build -t craftcommand-center:local .
cp templates/my-craftcommand-center-local.xml \
  /boot/config/plugins/dockerMan/templates-user/my-craftcommand-center.xml
```
