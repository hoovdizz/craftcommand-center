# Beta testing

CraftCommand Center is intentionally a **companion** to `binhex-minecraftbedrockserver`. It does not replace the Binhex container, world management, server backups, or the existing server console.

## Maintainer publication checklist

1. Create the public GitHub repository `hoovdizz/craftcommand-center` with an empty `main` branch.
2. Push this project to `main`.
3. Confirm the **Validate and Publish Docker Image** action passes.
4. Open the published `craftcommand-center` package on GitHub and set package visibility to **Public** if it did not inherit public visibility.
5. Create a `v2.1.0-beta.1` tag after the first successful `latest` build.

The workflow publishes:

- `ghcr.io/hoovdizz/craftcommand-center:latest`
- `ghcr.io/hoovdizz/craftcommand-center:v2.1.0-beta.1`
- an immutable `sha-...` image

## Beta tester installation on Unraid

From the Unraid terminal:

```bash
mkdir -p /boot/config/plugins/dockerMan/templates-user
wget -O /boot/config/plugins/dockerMan/templates-user/my-craftcommand-center.xml \
  https://raw.githubusercontent.com/hoovdizz/craftcommand-center/main/templates/my-craftcommand-center.xml
```

Then use:

```text
Unraid → Docker → Add Container → Template → CraftCommand-Center
```

Change the default admin password before applying the template.

## Updating

Unraid can check GHCR for image updates through **Docker → Check for Updates**. The template keeps the appdata mount intact while the image is replaced.

Persistent beta data lives in:

```text
/mnt/user/appdata/craftcommand-center/data
```

It contains player names, custom kits, additional dashboard accounts, and activity history.

## Feedback

Use the repository's structured bug and feature issue forms. Include the version displayed in the Help page and the diagnostics result. Never post dashboard passwords or public IP addresses.
