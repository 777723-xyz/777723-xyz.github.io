import fs from "node:fs/promises";

const sourceUrl = process.env.CATALOG_SOURCE_URL
  || "https://raw.githubusercontent.com/777723-xyz/game-index-runner/main/list.json";
const allowedHosts = new Set(
  (process.env.ALLOWED_GAME_HOSTS || "777723-xyz.github.io")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const concurrency = parsePositiveInt(process.env.CHECK_CONCURRENCY || "10");
const timeoutMs = parsePositiveInt(process.env.CHECK_TIMEOUT_MS || "12000");

const response = await fetch(sourceUrl, { headers: { "User-Agent": "777723-catalog-builder" } });
if (!response.ok) throw new Error(`Catalog source returned ${response.status}`);

const source = await response.json();
if (!Array.isArray(source)) throw new Error("Catalog source is not an array");

const candidates = source.filter((game) => {
  if (game?.status !== "verified" || typeof game.pagesUrl !== "string") return false;
  if (game.title?.trim() === "__template__") return false;
  try {
    return allowedHosts.has(new URL(game.pagesUrl).hostname);
  } catch {
    return false;
  }
});

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
const published = checks.filter((item) => item.ok).map((item) => publicGame(item.game));
const unavailable = checks.filter((item) => !item.ok).map((item) => ({
  id: item.game.id,
  pagesUrl: item.game.pagesUrl,
  status: item.status,
  error: item.error,
}));

if (candidates.length > 0 && published.length === 0) {
  throw new Error("Availability check rejected every candidate; refusing to publish an empty catalog");
}

await fs.writeFile("games.json", `${JSON.stringify(published, null, 2)}\n`, "utf8");
await fs.writeFile("catalog-manifest.json", `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  sourceUrl,
  sourceCount: source.length,
  candidateCount: candidates.length,
  publishedCount: published.length,
  unavailableCount: unavailable.length,
  unavailable,
}, null, 2)}\n`, "utf8");

console.log(`Catalog source entries: ${source.length}`);
console.log(`Verified own-Pages candidates: ${candidates.length}`);
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
  };
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

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Expected positive integer, got ${value}`);
  return parsed;
}
