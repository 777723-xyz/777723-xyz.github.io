# 777723-xyz.github.io

Public, static game catalog for 777723.xyz.

The Pages deployment reads the catalog from `777723-xyz/game-index-runner`, verifies each game URL, and publishes only entries that are `verified`, hosted on a host in `config.json`, and reachable over HTTP. The browser reads the generated `games.json`, so unavailable game Pages are not shown to users.

The catalog is rebuilt on every portal push, on manual dispatch, and hourly at minute 17.

## Domain cutover

When a custom domain is ready, configure it in this repository's **Settings → Pages → Custom domain**, then update both:

1. `config.json` → `allowedGameHosts`.
2. `game-index-runner` → `SITE_ORIGIN` and the existing `pagesUrl` records.

Do not use the Baota server as a reverse proxy for game assets in this model. Pages serves the catalog and each game Pages repository directly.
