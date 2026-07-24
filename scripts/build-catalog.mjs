import fs from "node:fs/promises";

const sourceUrl = process.env.CATALOG_SOURCE_URL
  || "https://raw.githubusercontent.com/777723-xyz/game-index-runner/main/list.json";
const fallbackCatalogUrl = process.env.LAST_PUBLISHED_CATALOG_URL
  || "https://777723-xyz.github.io/games.json";
const allowedHosts = new Set(
  (process.env.ALLOWED_GAME_HOSTS || "777723-xyz.github.io")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const concurrency = parsePositiveInt(process.env.CHECK_CONCURRENCY || "10");
const timeoutMs = parsePositiveInt(process.env.CHECK_TIMEOUT_MS || "12000");

const sourceRequestUrl = appendCacheBuster(sourceUrl);
const response = await fetch(sourceRequestUrl, {
  headers: {
    "User-Agent": "777723-catalog-builder",
    "Cache-Control": "no-cache",
  },
});
if (!response.ok) throw new Error(`Catalog source returned ${response.status}`);

const source = await response.json();
if (!Array.isArray(source)) throw new Error("Catalog source is not an array");

const sourceCandidates = source.filter((game) => {
  if (game?.status !== "verified" || typeof game.pagesUrl !== "string") return false;
  if (game.title?.trim() === "__template__") return false;
  try {
    return allowedHosts.has(new URL(game.pagesUrl).hostname);
  } catch {
    return false;
  }
});
const candidates = deduplicateCatalog(sourceCandidates);

const checks = new Array(candidates.length);
let cursor = 0;

async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= candidates.length) return;
    checks[index] = await checkGame(candidates[index]);
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));

// `list.json` is an operational index and intentionally contains upstream audit
// metadata.  The public portal only receives fields it renders or needs to
// launch an already-verified game, so old upstream Pages/cover URLs never leak
// into the browser catalog.
let published = checks.filter((item) => item.ok).map((item) => publicGame(item.game));
let usedFallback = false;
const unavailable = checks.filter((item) => !item.ok).map((item) => ({
  id: item.game.id,
  pagesUrl: item.game.pagesUrl,
  status: item.status,
  error: item.error,
}));

if (candidates.length > 0 && published.length === 0) {
  const fallback = await loadFallbackCatalog();
  if (fallback.length === 0) {
    throw new Error("Availability check rejected every candidate; refusing to publish an empty catalog");
  }
  published = fallback;
  usedFallback = true;
  console.warn(`Availability checks rejected every candidate; retaining ${fallback.length} games from the last published catalog`);
}

await fs.writeFile("games.json", `${JSON.stringify(published, null, 2)}\n`, "utf8");
await fs.writeFile("catalog-manifest.json", `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  sourceUrl,
  sourceCount: source.length,
  sourceCandidateCount: sourceCandidates.length,
  candidateCount: candidates.length,
  duplicateCandidateCount: sourceCandidates.length - candidates.length,
  publishedCount: published.length,
  usedFallback,
  unavailableCount: unavailable.length,
  unavailable,
}, null, 2)}\n`, "utf8");

console.log(`Catalog source entries: ${source.length}`);
console.log(`Verified own-Pages candidates: ${candidates.length}`);
console.log(`Duplicate verified candidates excluded: ${sourceCandidates.length - candidates.length}`);
console.log(`Published reachable games: ${published.length}`);
console.log(`Unavailable games excluded: ${unavailable.length}`);

function publicGame(game) {
  return {
    id: game.id,
    title: game.title,
    owner: game.owner,
    name: game.name,
    engine: game.engine,
    repo: game.repo,
    status: "verified",
    pagesUrl: game.pagesUrl,
    entryPath: game.entryPath || "index.html",
    ...(Number.isFinite(Number(game.totalSize)) ? { totalSize: Number(game.totalSize) } : {}),
    ...(Number.isFinite(Number(game.dataSize)) ? { dataSize: Number(game.dataSize) } : {}),
    ...(typeof game.cover === "string" ? { cover: game.cover } : {}),
    ...(["playable", "failed"].includes(game.runtimeStatus) ? { runtimeStatus: game.runtimeStatus } : {}),
    ...(Number.isFinite(Number(game.runtimeLoadMs)) ? { runtimeLoadMs: Number(game.runtimeLoadMs) } : {}),
    ...(typeof game.runtimeCheckedAt === "string" ? { runtimeCheckedAt: game.runtimeCheckedAt } : {}),
  };
}

function deduplicateCatalog(games) {
  const unique = [];
  const ids = new Set();
  const pagesUrls = new Set();
  for (const game of games) {
    const id = String(game.id || "").trim().toLowerCase();
    const source = `${game.owner || ""}/${game.name || ""}`.toLowerCase();
    const identity = id || source;
    const pagesUrl = normalizePagesUrl(game.pagesUrl);
    if (!identity || ids.has(identity) || (pagesUrl && pagesUrls.has(pagesUrl))) continue;
    ids.add(identity);
    if (pagesUrl) pagesUrls.add(pagesUrl);
    unique.push(game);
  }
  return unique;
}

function normalizePagesUrl(value) {
  try {
    const url = new URL(value);
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "") || "/"}`;
  } catch {
    return "";
  }
}

function appendCacheBuster(value) {
  const separator = value.includes("?") ? "&" : "?";
  return `${value}${separator}catalog_refresh=${Date.now()}`;
}

async function checkGame(game) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await fetch(game.pagesUrl, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": "777723-catalog-builder" },
      });
      if (result.status >= 200 && result.status < 400) {
        return { ok: true, game, status: result.status };
      }
      if (result.status < 500 || attempt === 1) {
        return { ok: false, game, status: result.status };
      }
    } catch (error) {
      if (attempt === 1) {
        return { ok: false, game, status: 0, error: error.name || error.message };
      }
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, game, status: 0, error: "unknown" };
}

async function loadFallbackCatalog() {
  try {
    const separator = fallbackCatalogUrl.includes("?") ? "&" : "?";
    const response = await fetch(`${fallbackCatalogUrl}${separator}fallback=${Date.now()}`, {
      headers: { "User-Agent": "777723-catalog-builder" },
    });
    if (!response.ok) return [];
    const catalog = await response.json();
    if (!Array.isArray(catalog)) return [];
    return deduplicateCatalog(catalog
      .filter((game) => game?.status === "verified" && typeof game.pagesUrl === "string")
      .filter((game) => {
        try { return allowedHosts.has(new URL(game.pagesUrl).hostname); } catch { return false; }
      })
      .map(publicGame));
  } catch (error) {
    console.warn(`Last published catalog unavailable: ${error.name || error.message}`);
    return [];
  }
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Expected positive integer, got ${value}`);
  return parsed;
}
