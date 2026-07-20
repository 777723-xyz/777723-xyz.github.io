# 777723-xyz.github.io

Public, static game catalog for 777723.xyz.

The browser reads the catalog directly from `777723-xyz/game-index-runner` and only renders entries that are both `verified` and published on a host in `config.json`.

## Domain cutover

When a custom domain is ready, configure it in this repository's **Settings → Pages → Custom domain**, then update both:

1. `config.json` → `allowedGameHosts`.
2. `game-index-runner` → `SITE_ORIGIN` and the existing `pagesUrl` records.

Do not use the Baota server as a reverse proxy for game assets in this model. Pages serves the catalog and each game Pages repository directly.
