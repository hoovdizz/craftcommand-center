# Security

## Supported version

Security fixes are applied to the latest published beta/release image.

## Deployment guidance

- Keep the dashboard on a trusted LAN or place it behind an HTTPS reverse proxy.
- Do not publish port 8223 directly to the internet.
- Change the default admin password.
- Give routine helpers an **operator** account instead of the main admin account.
- Use **viewer** for read-only access.
- Protect access to the Unraid host because the container mounts `/var/run/docker.sock`.
- Review the Activity page for unexpected commands.

## Reporting

Report security concerns privately to the repository owner rather than posting passwords, tokens, public addresses, or exploit details in a public issue.

## External reachability privacy

When `CCC_EXTERNAL_CHECK_MODE=external`, the configured public Minecraft hostname/IP and port are sent to the public `mcsrvstat.us` Bedrock status API. Use `local` mode to avoid that third-party lookup, understanding that local mode cannot prove reachability from outside the home network.

## Server exports

Backup/export actions are admin-only and write compressed archives to `/app/backups`. Keep the mapped Unraid directory private because exports can contain worlds, allowlists, permissions, server configuration, and other sensitive server data.
