const statusElement = document.querySelector("#catalog-status");
const catalogElement = document.querySelector("#catalog");
const searchElement = document.querySelector("#search");
const cardTemplate = document.querySelector("#game-card-template");

let allGames = [];

bootstrap().catch((error) => {
  console.error("Failed to load game catalog", error);
  setStatus("目录暂时无法加载，请稍后重试。", true);
});

async function bootstrap() {
  const config = await fetchJson("/config.json");
  const catalog = await fetchFirstAvailable(config.catalogEndpoints);
  allGames = normalizeGames(catalog, config);
  renderGames(allGames, config.defaultCoverUrl);
  setStatus(`已加载 ${allGames.length} 个可玩游戏。`);

  searchElement.addEventListener("input", () => {
    const query = searchElement.value.trim().toLowerCase();
    const filtered = query
      ? allGames.filter((game) => game.searchText.includes(query))
      : allGames;
    renderGames(filtered, config.defaultCoverUrl);
    setStatus(query ? `找到 ${filtered.length} 个匹配游戏。` : `已加载 ${allGames.length} 个可玩游戏。`);
  });
}

async function fetchFirstAvailable(endpoints) {
  let lastError;
  for (const endpoint of endpoints) {
    try {
      return await fetchJson(endpoint);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("No catalog endpoint is configured");
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json();
}

function normalizeGames(catalog, config) {
  if (!Array.isArray(catalog)) {
    throw new Error("Catalog is not an array");
  }
  const allowedHosts = new Set(config.allowedGameHosts || []);
  const seen = new Set();

  return catalog
    .map((game) => toGame(game, allowedHosts))
    .filter(Boolean)
    .filter((game) => {
      if (seen.has(game.id)) return false;
      seen.add(game.id);
      return true;
    })
    .sort((a, b) => a.title.localeCompare(b.title, "zh-Hans"));
}

function toGame(raw, allowedHosts) {
  if (!raw || raw.status !== "verified" || typeof raw.pagesUrl !== "string") {
    return null;
  }

  const playUrl = buildPlayUrl(raw.pagesUrl, raw.entryPath);
  if (!playUrl || !allowedHosts.has(playUrl.hostname)) {
    return null;
  }

  const sourceUrl = safeHttpUrl(raw.repo);
  const coverUrl = safeHttpUrl(raw.cover, playUrl.href);
  const title = readableTitle(raw);
  return {
    id: raw.id || `${raw.owner || "unknown"}/${raw.name || title}`,
    title,
    owner: raw.owner || "未知作者",
    name: raw.name || "未知仓库",
    engine: raw.engine || "RPG Maker",
    coverUrl: coverUrl ? coverUrl.href : "",
    playUrl: playUrl.href,
    sourceUrl: sourceUrl ? sourceUrl.href : "",
    searchText: [title, raw.owner, raw.name, raw.engine].filter(Boolean).join(" ").toLowerCase()
  };
}

function buildPlayUrl(pagesUrl, entryPath) {
  const base = safeHttpUrl(pagesUrl);
  if (!base) return null;
  const entry = String(entryPath || "index.html").replace(/^\/+/, "");
  const decodedPath = decodeURIComponent(base.pathname).replace(/^\/+/, "");
  if (/\.html?$/i.test(base.pathname) || decodedPath.endsWith(entry)) {
    return base;
  }
  const normalizedBase = base.href.endsWith("/") ? base.href : `${base.href}/`;
  if (!entry || entry.toLowerCase() === "index.html") return new URL(normalizedBase);
  const target = new URL(entry, normalizedBase);
  return target.origin === base.origin && target.pathname.startsWith(new URL(normalizedBase).pathname)
    ? target
    : null;
}

function safeHttpUrl(value, base) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function readableTitle(game) {
  const title = String(game.title || "").trim();
  return title && !/^__template__$/i.test(title)
    ? title
    : String(game.name || game.id || "未命名游戏");
}

function renderGames(games, defaultCoverUrl) {
  catalogElement.replaceChildren();
  if (games.length === 0) {
    catalogElement.textContent = "暂时没有符合发布条件的游戏。";
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const game of games) {
    const card = cardTemplate.content.cloneNode(true);
    const cover = card.querySelector(".cover");
    const title = card.querySelector("h2");
    const repo = card.querySelector(".repo");
    const meta = card.querySelector(".meta");
    const play = card.querySelector(".play");
    const source = card.querySelector(".source");

    cover.src = game.coverUrl || defaultCoverUrl;
    cover.alt = `${game.title} 封面`;
    cover.addEventListener("error", () => { cover.src = defaultCoverUrl; }, { once: true });
    title.textContent = game.title;
    repo.textContent = `${game.owner}/${game.name}`;
    meta.textContent = game.engine;
    play.href = game.playUrl;
    if (game.sourceUrl) {
      source.href = game.sourceUrl;
    } else {
      source.remove();
    }
    fragment.append(card);
  }
  catalogElement.append(fragment);
}

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("is-error", isError);
}
