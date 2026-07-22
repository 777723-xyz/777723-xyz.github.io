import fs from "node:fs/promises";

const [config, ads, indexHtml, appJs, playHtml, playJs, buildCatalogJs, serviceWorkerJs, syncMetaJs, placeholderStat] = await Promise.all([
  readJson("config.json"),
  readJson("ads.json"),
  fs.readFile("index.html", "utf8"),
  fs.readFile("app.js", "utf8"),
  fs.readFile("play.html", "utf8"),
  fs.readFile("play.js", "utf8"),
  fs.readFile("scripts/build-catalog.mjs", "utf8"),
  fs.readFile("service-worker.js", "utf8"),
  fs.readFile("scripts/sync-portal-meta.mjs", "utf8"),
  fs.stat("assets/loading-placeholder.jpg"),
]);

const failures = [];
const requireValue = (condition, message) => { if (!condition) failures.push(message); };
const isHttpUrl = (value) => {
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
};

requireValue(config.title === "Web RPG", "config.title must be Web RPG");
requireValue(config.tagline === "请务必收藏发布页，回家不迷路", "tagline does not match the requested copy");
requireValue(typeof config.description === "string" && config.description.trim().length >= 20, "config.description is missing or too short");
requireValue(typeof config.socialDescription === "string" && config.socialDescription.trim().length >= 12, "config.socialDescription is missing or too short");
requireValue(Number.isInteger(config.displayCountOffset) && config.displayCountOffset >= 0 && config.displayCountOffset <= 100_000, "displayCountOffset must be an integer from 0 to 100000");
requireValue(isHttpUrl(config.publishUrl), "publishUrl must be HTTP(S)");
requireValue(isHttpUrl(config.acquireUrl), "acquireUrl must be HTTP(S)");
requireValue(new URL(config.publishUrl).hostname === "ecy.al", "publishUrl must use ecy.al");
requireValue(config.allowedAdHosts.includes(new URL(config.acquireUrl).hostname), "acquireUrl host is not allowlisted");
requireValue(config.showSourceButton === false, "source button must be hidden by default");
requireValue(config.launcherPath === "/play.html", "launcherPath must point to /play.html");
requireValue(Array.isArray(config.catalogEndpoints) && config.catalogEndpoints.length > 0, "catalogEndpoints is empty");
requireValue(config.catalogEndpoints[0] === "/games.json?v=data-size-sort-20260721", "catalog endpoint cache version is stale");
requireValue(Array.isArray(config.adsEndpoints) && config.adsEndpoints.length > 0, "adsEndpoints is empty");
requireValue(Array.isArray(config.allowedControlHosts) && config.allowedControlHosts.length > 0, "allowedControlHosts is empty");
requireValue(Array.isArray(config.allowedAdHosts) && config.allowedAdHosts.length > 0, "allowedAdHosts is empty");
requireValue(Array.isArray(config.allowedCoverHosts) && config.allowedCoverHosts.length > 0, "allowedCoverHosts is empty");
requireValue(Array.isArray(config.allowedGameHosts) && config.allowedGameHosts.includes("777723-xyz.github.io"), "own Pages host is not allowed");
requireValue(config.defaultCoverUrl === "/assets/loading-placeholder.jpg", "default cover must use the local placeholder");
requireValue(placeholderStat.size > 0, "local cover placeholder is empty");
requireValue(config.gameAd?.enabled === true, "game ads must be enabled");
requireValue(Number(config.gameAd?.repeatSeconds) >= 60, "game ad repeat must be at least 60 seconds");
requireValue(Number(config.gameAd?.closeDelaySeconds) >= 0, "game ad close delay is invalid");

requireValue(Array.isArray(ads.ads), "ads.ads must be an array");
requireValue(ads.ads?.length === 13, `expected exactly 13 ads, got ${ads.ads?.length ?? 0}`);
const ids = new Set();
const texts = new Set();
for (const ad of ads.ads || []) {
  requireValue(typeof ad.id === "string" && ad.id.length > 0, "an ad is missing id");
  requireValue(!ids.has(ad.id), `duplicate ad id: ${ad.id}`);
  requireValue(typeof ad.text === "string" && ad.text.trim().length >= 12, `ad copy is too short: ${ad.id}`);
  requireValue(!texts.has(ad.text), `duplicate ad copy: ${ad.id}`);
  requireValue(isHttpUrl(ad.url), `invalid ad URL: ${ad.id}`);
  requireValue(config.allowedAdHosts.includes(new URL(ad.url).hostname), `ad URL is outside allowed ad hosts: ${ad.id}`);
  ids.add(ad.id);
  texts.add(ad.text);
}

requireValue(Number(ads.cardInterval?.min) >= 8, "card ad minimum interval must be at least 8");
requireValue(Number(ads.cardInterval?.max) <= 12, "card ad maximum interval must be at most 12");
requireValue(Number(ads.cardInterval?.min) <= Number(ads.cardInterval?.max), "card ad interval range is reversed");
requireValue(typeof ads.enabled === "boolean", "ads.enabled must be boolean");
for (const slot of ["header", "search", "cards", "gameOverlay", "gameStart", "gameTimed"]) {
  requireValue(Array.isArray(ads.slots?.[slot]) && ads.slots[slot].length > 0, `ad slot is empty: ${slot}`);
  requireValue(typeof ads.slotEnabled?.[slot] === "boolean", `ads.slotEnabled.${slot} must be boolean`);
  for (const id of ads.slots?.[slot] || []) requireValue(ids.has(id), `unknown ad id ${id} in slot ${slot}`);
}

requireValue(indexHtml.includes('id="publish-link"'), "publish link is missing");
requireValue(indexHtml.includes('id="ads-toggle"'), "one-click ad toggle is missing");
requireValue(indexHtml.includes('id="brand-title"'), "brand title is not configurable");
requireValue(indexHtml.includes('id="catalog-loader"'), "catalog loading layer is missing");
requireValue(indexHtml.includes('rel="canonical"'), "canonical URL is missing");
requireValue(indexHtml.includes('property="og:title"'), "Open Graph title is missing");
requireValue(indexHtml.includes('rel="icon"'), "favicon link is missing");
requireValue(indexHtml.includes('id="game-card-template"'), "game card template is missing");
requireValue(indexHtml.includes('id="card-ad-template"'), "card ad template is missing");
requireValue(indexHtml.includes('id="load-more"'), "incremental catalog control is missing");
requireValue(indexHtml.includes('class="catalog-status"'), "catalog total status is missing");
requireValue(indexHtml.includes('class="pixel-button source"'), "icon-only source action is missing");
requireValue(indexHtml.includes('rel="noopener noreferrer sponsored"'), "sponsored link protections are missing");
requireValue(playHtml.includes('id="ad-modal"'), "game ad modal is missing");
requireValue(playHtml.includes('id="game-top-ad"'), "fixed game overlay ad is missing");
requireValue(playHtml.includes('content="noindex,follow"'), "launcher must not be indexed as a thin page");
requireValue(playHtml.includes('href="/favicon.ico"'), "launcher favicon is missing");
requireValue(playJs.includes("scheduleAds()"), "game ad scheduler is missing");
requireValue(playJs.includes("iframeSandbox"), "iframe sandbox configuration is missing");
requireValue(playHtml.includes('src="/play.js?'), "launcher must use the local hardened script");
requireValue(playJs.includes('renderTopAd()'), "fixed game overlay ad renderer is missing");
requireValue(appJs.includes("REMOTE_CONFIG_FIELDS"), "portal runtime config whitelist is missing");
requireValue(appJs.includes("allowedControlHosts"), "portal control-host restriction is missing");
requireValue(appJs.includes("allowedAdHosts"), "portal ad-host restriction is missing");
requireValue(appJs.includes("setMetaContent"), "SEO metadata is not driven by config.json");
requireValue(appJs.includes("elements.brandTitle.textContent"), "visible site title is not driven by config.json");
requireValue(appJs.includes("function getDisplayTotal"), "display count offset is not applied safely");
requireValue(appJs.includes('element.closest(".ad-slot").hidden = false'), "ad slot cannot be restored after one-click disable");
requireValue(syncMetaJs.includes("replaceMeta"), "static portal metadata sync is missing");
requireValue(appJs.includes("const PAGE_SIZE = 24"), "portal initial render limit is missing");
requireValue(appJs.includes('loadData({ force: true })'), "manual refresh must bypass the catalog cache");
requireValue(appJs.includes("function setLoading"), "catalog loading layer state is missing");
requireValue(appJs.includes("IntersectionObserver"), "automatic incremental loading is missing");
requireValue(appJs.includes("function initializeCoverLoading"), "viewport-based cover loading is missing");
requireValue(appJs.includes("function appendCatalogPage"), "automatic loading must append pages without rebuilding the catalog");
requireValue(appJs.includes("Existing cards are never recreated"), "automatic loading scroll-preservation guard is missing");
requireValue(appJs.includes("function restoreScrollAnchor"), "automatic loading must preserve the scroll anchor");
requireValue(appJs.includes('register("/service-worker.js?v=5")'), "portal cache registration is missing");
requireValue(serviceWorkerJs.includes('const CACHE_NAME = "portal-cache-v5"'), "portal cache version is missing");
requireValue(serviceWorkerJs.includes("networkFirstWithTimeout(request, request, event)"), "portal shell must refresh from the network before using cache");
requireValue(appJs.includes("value % columns === 0"), "card ads are not aligned to complete grid rows");
requireValue(appJs.includes("fetchJson(LOCAL_CATALOG_ENDPOINT"), "catalog request is not prefetched in parallel");
requireValue(appJs.includes("const aSize = a.dataSize ?? -1"), "portal must sort by dataSize like the upstream catalog");
requireValue(buildCatalogJs.includes("totalSize: Number(game.totalSize)"), "published catalog omits game size");
requireValue(buildCatalogJs.includes("dataSize: Number(game.dataSize)"), "published catalog omits dataSize used for sorting");
requireValue(buildCatalogJs.includes('game.title?.trim() === "__template__"'), "template repositories must be excluded like upstream");
requireValue(buildCatalogJs.includes("loadFallbackCatalog"), "catalog build must retain the last published catalog during transient availability failures");

for (const [name, source] of [["index.html", indexHtml], ["app.js", appJs], ["play.html", playHtml], ["play.js", playJs]]) {
  requireValue(!source.includes("webrpg.org"), `${name} still references the old domain`);
  requireValue(!/google-analytics|googletagmanager|gtag\(|matomo|umami|plausible/i.test(source), `${name} contains an unapproved analytics integration`);
}
requireValue(!/<script\s+[^>]*src=["']https?:/i.test(indexHtml + playHtml), "external script dependency is not allowed");

if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Portal validation passed: ${ads.ads.length} ads, card interval ${ads.cardInterval.min}-${ads.cardInterval.max}, game ads enabled.`);
}

async function readJson(path) {
  return JSON.parse(await fs.readFile(path, "utf8"));
}
