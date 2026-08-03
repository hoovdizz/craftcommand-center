# Product benchmark and beta decisions

Reviewed August 3, 2026.

## Nearby tools

- **Pterodactyl** is a broad multi-game panel with isolated Docker instances and extensive administration features. Its own installation guide describes a complex stack involving a web server, PHP, database, Redis, queues, and system administration knowledge.
- **PufferPanel** is a lighter open-source multi-game manager focused on a central web interface and delegated access.
- **Crafty Controller** focuses specifically on Minecraft and is often praised for simple deployment, while community feedback asks for a less clunky UI, easier file transfer, native S3 backups, and clearer storage/permission troubleshooting.
- **Bedrock Server Manager** provides full Bedrock lifecycle automation, content upload/download, updates, and backups.
- **AMP** is a commercial general-purpose game panel; community reviews include concerns about licensing, troubleshooting, offline behavior, and unclear logs.

## Recurring user wishes incorporated in CraftCommand Center 2.1

| Feedback theme | CraftCommand Center decision |
|---|---|
| Full panels feel excessive for one existing server | Remains a small Binhex companion rather than provisioning or replacing the server |
| Delegating access should not require SSH | Persistent viewer, operator, and admin dashboard accounts |
| Errors are difficult to diagnose | At-a-Glance diagnostics and a dedicated Help page with plain-language checks |
| Users need to know who changed what | Persistent activity/audit history with username, target, result, and export |
| Interfaces feel dated or clunky | Phone-first responsive layout, icon/text modes, searchable catalog, kit previews, and confirmation dialogs |
| Container/session names change after reboot | Automatic discovery of the current `*.minecraft` screen before commands and a manual refresh control |
| Player lists are incomplete | Live `list` command, Docker logs, server files, and a persistent manual-player fallback |
| Permission and storage failures are confusing | Diagnostics explicitly test Docker socket, Binhex container, screen session, and persistent data writability |
| Paid/online dependencies are undesirable for LAN use | Local-first, open-source, no cloud account or external service required |

## Intentionally out of scope for the companion

Backups, world import/export, server start/stop/update, file editing, and content upload remain with Binhex/Unraid. Duplicating those controls would add filesystem risk and make this lightweight companion compete with the server manager it is meant to complement.

## Sources reviewed

- https://pterodactyl.io/project/introduction.html
- https://pterodactyl.io/panel/1.0/getting_started.html
- https://docs.pufferpanel.com/en/3.x/about/about.html
- https://github.com/PufferPanel/PufferPanel/issues/924
- https://bedrock-server-manager.readthedocs.io/en/stable/features/default_plugins.html
- https://www.reddit.com/r/admincraft/comments/1pwq3xd/crafty_controller_is_a_game_changer/
- https://www.reddit.com/r/CraftyController/comments/1tuml3r/issue_with_crafty_default_backups/
- https://www.reddit.com/r/CraftyController/comments/1re77p1/what_the_hell_has_happened/
- https://www.reddit.com/r/selfhosted/comments/1b55f9v/amp_application_management_panel_urgent_buyer/
