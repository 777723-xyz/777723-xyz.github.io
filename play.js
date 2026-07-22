const elements = {
  game: document.querySelector("#game"),
  acquire: document.querySelector("#acquire"),
  topAd: document.querySelector("#game-top-ad"),
  modal: document.querySelector("#ad-modal"),
  title: document.querySelector("#ad-title"),
  text: document.querySelector("#ad-text"),
  link: document.querySelector("#ad-link"),
  close: document.querySelector("#ad-close"),
};

const state = { config: {}, ads: { ads: [], slots: {} }, game: null, closeTimer: null };
const params = new URLSearchParams(location.search);
const REMOTE_CONFIG_FIELDS = new Set([
  "siteName", "publishUrl", "acquireUrl", "adsEndpoints", "defaultCoverUrl",
]);

start().catch(showError);

async function start() {
  const [local, localGames, localAds] = await Promise.all([
    fetchJson("/config.json"),
    fetchJson("/games.json"),
    fetchJson("/ads.json"),
  ]);
  state.config = await loadRuntimeConfig(local);
  const [games, ads] = await Promise.all([
    usesOnlyEndpoint(state.config.catalogEndpoints, "/games.json") ? localGames : fetchFirst(state.config.catalogEndpoints),
    usesOnlyEndpoint(state.config.adsEndpoints, "/ads.json") ? localAds : fetchFirst(state.config.adsEndpoints || ["/ads.json"]),
  ]);
  if (!Array.isArray(games)) throw new Error("游戏目录格式无效");

  state.ads = normalizeAds(ads);
  state.game = games.find((game) => game.id === params.get("id"));
  if (!state.game) throw new Error("没有找到该游戏");

  const target = buildPlayUrl(state.game.pagesUrl, state.game.entryPath);
  if (!target || !state.config.allowedGameHosts?.includes(target.hostname)) {
    throw new Error("游戏地址未通过本站校验");
  }

  const acquire = safeAllowedUrl(state.game.acquireUrl, state.config.allowedAdHosts)
    || safeAllowedUrl(state.config.acquireUrl, state.config.allowedAdHosts)
    || new URL("https://ecy.al/");
  elements.acquire.href = acquire.href;
  document.title = `${state.game.title || state.game.name || "游戏"} · ${state.config.siteName || "777723.xyz"}`;
  if (state.config.iframeSandbox) elements.game.setAttribute("sandbox", state.config.iframeSandbox);
  elements.game.src = target.href;
  renderTopAd();
  sendEvent("game_open");
  scheduleAds();
}

async function loadRuntimeConfig(local) {
  for (const endpoint of Array.isArray(local.runtimeConfigEndpoints) ? local.runtimeConfigEndpoints : []) {
    if (!safeAllowedUrl(endpoint, local.allowedControlHosts, location.href, true)) continue;
    try {
      return mergeConfig(local, await fetchJson(endpoint, 4000));
    } catch (error) {
      console.warn(`Runtime config unavailable: ${endpoint}`, error);
    }
  }
  return local;
}

function mergeConfig(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) return base;
  const merged = { ...base };
  for (const field of REMOTE_CONFIG_FIELDS) if (field in override) merged[field] = override[field];
  if (!safeAllowedUrl(merged.publishUrl, base.allowedAdHosts)) merged.publishUrl = base.publishUrl;
  if (!safeAllowedUrl(merged.acquireUrl, base.allowedAdHosts)) merged.acquireUrl = base.acquireUrl;
  if (Array.isArray(merged.adsEndpoints)) {
    merged.adsEndpoints = merged.adsEndpoints.filter((endpoint) => safeAllowedUrl(endpoint, base.allowedControlHosts, location.href, true));
  }
  if (!merged.adsEndpoints?.length) merged.adsEndpoints = base.adsEndpoints;

  const analytics = override.analytics && typeof override.analytics === "object" ? override.analytics : {};
  const analyticsEndpoint = safeAllowedUrl(analytics.endpoint, base.allowedControlHosts, location.href, true);
  merged.analytics = {
    ...(base.analytics || {}),
    ...(analyticsEndpoint ? { endpoint: analyticsEndpoint.href } : {}),
    ...(typeof analytics.siteId === "string" ? { siteId: analytics.siteId.slice(0, 80) } : {}),
  };

  const gameAd = override.gameAd && typeof override.gameAd === "object" ? override.gameAd : {};
  merged.gameAd = {
    ...(base.gameAd || {}),
    enabled: gameAd.enabled === false ? false : base.gameAd?.enabled !== false,
    startDelaySeconds: clampInteger(gameAd.startDelaySeconds, 0, 3600, Number(base.gameAd?.startDelaySeconds) || 45),
    repeatSeconds: clampInteger(gameAd.repeatSeconds, 60, 86_400, Number(base.gameAd?.repeatSeconds) || 600),
    closeDelaySeconds: clampInteger(gameAd.closeDelaySeconds, 0, 60, Number(base.gameAd?.closeDelaySeconds) || 5),
  };

  return {
    ...merged,
    allowedControlHosts: base.allowedControlHosts,
    allowedAdHosts: base.allowedAdHosts,
    allowedGameHosts: base.allowedGameHosts,
    catalogEndpoints: base.catalogEndpoints,
    launcherPath: base.launcherPath,
    iframeSandbox: base.iframeSandbox,
    runtimeConfigEndpoints: base.runtimeConfigEndpoints,
  };
}

async function fetchFirst(endpoints) {
  let lastError;
  for (const endpoint of Array.isArray(endpoints) ? endpoints : []) {
    try { return await fetchJson(endpoint); } catch (error) { lastError = error; }
  }
  throw lastError || new Error("没有配置数据地址");
}

function usesOnlyEndpoint(endpoints, expected) {
  return Array.isArray(endpoints) && endpoints.length === 1 && endpoints[0] === expected;
}

async function fetchJson(value, timeoutMs = 12000) {
  const url = safeHttpUrl(value, location.href);
  if (!url) throw new Error(`无效地址：${value}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "default", signal: controller.signal });
    if (!response.ok) throw new Error(`${url} 返回 ${response.status}`);
    if (!(response.headers.get("content-type") || "").includes("json")) throw new Error(`${url} 未返回 JSON`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function scheduleAds() {
  const options = state.config.gameAd || {};
  if (options.enabled === false) return;
  setTimeout(() => showAd("gameStart"), Math.max(0, number(options.startDelaySeconds, 45)) * 1000);
  setInterval(() => showAd("gameTimed"), Math.max(60, number(options.repeatSeconds, 600)) * 1000);
}

function renderTopAd() {
  const ads = getSlot("gameOverlay");
  if (!ads.length) return;
  const ad = ads[Math.floor(Date.now() / 86_400_000) % ads.length];
  const url = safeAllowedUrl(ad.url, state.config.allowedAdHosts);
  if (!url) return;
  elements.topAd.textContent = ad.text;
  elements.topAd.href = url.href;
  elements.topAd.hidden = false;
}

function showAd(slot) {
  if (!elements.modal.hidden) return;
  const ads = getSlot(slot);
  if (!ads.length) return;
  const ad = ads[Math.floor(Math.random() * ads.length)];
  const url = safeAllowedUrl(ad.url, state.config.allowedAdHosts);
  if (!url) return;
  elements.title.textContent = slot === "gameStart" ? "开始游戏提示" : "游戏进行中";
  elements.text.textContent = ad.text;
  elements.link.href = url.href;
  elements.modal.hidden = false;
  startCloseCountdown();
  sendEvent("game_ad_show", { slot });
}

function normalizeAds(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ads: [], slots: {} };
  return {
    ads: Array.isArray(value.ads) ? value.ads.filter(isValidAd) : [],
    slots: value.slots && typeof value.slots === "object" ? value.slots : {},
  };
}

function getSlot(slot) {
  const entries = Array.isArray(state.ads.slots?.[slot]) ? state.ads.slots[slot] : [];
  const byId = new Map(state.ads.ads.map((ad) => [ad.id, ad]));
  return entries.map((entry) => typeof entry === "string" ? byId.get(entry) : entry).filter(isValidAd);
}

function isValidAd(ad) {
  return Boolean(ad && typeof ad.text === "string" && ad.text.trim() && safeAllowedUrl(ad.url, state.config.allowedAdHosts));
}

function startCloseCountdown() {
  clearInterval(state.closeTimer);
  elements.close.disabled = true;
  let remaining = Math.max(0, number(state.config.gameAd?.closeDelaySeconds, 5));
  const update = () => { elements.close.textContent = remaining ? `关闭 (${remaining})` : "关闭"; };
  update();
  if (!remaining) { elements.close.disabled = false; return; }
  state.closeTimer = setInterval(() => {
    remaining -= 1;
    update();
    if (remaining <= 0) { clearInterval(state.closeTimer); elements.close.disabled = false; }
  }, 1000);
}

elements.close.addEventListener("click", () => { elements.modal.hidden = true; sendEvent("game_ad_close"); });
elements.link.addEventListener("click", () => sendEvent("game_ad_click"));
elements.acquire.addEventListener("click", () => sendEvent("acquire_click"));
elements.topAd.addEventListener("click", () => sendEvent("game_ad_click", { slot: "gameOverlay" }));

function showError(error) {
  document.body.innerHTML = `<main class="error"><div class="error-box"><h1>游戏暂时无法启动</h1><p>${escapeHtml(error?.message || "未知错误")}</p><p><a href="/">返回游戏目录</a></p></div></main>`;
}

function buildPlayUrl(pagesUrl, entryPath) {
  const base = safeHttpUrl(pagesUrl);
  if (!base) return null;
  const entry = String(entryPath || "index.html").replace(/^\/+/, "");
  let path = base.pathname;
  try { path = decodeURIComponent(path); } catch { /* keep encoded path */ }
  if (/\.html?$/i.test(base.pathname) || path.replace(/^\/+/, "").endsWith(entry)) return base;
  const normalized = base.href.endsWith("/") ? base.href : `${base.href}/`;
  if (!entry || entry.toLowerCase() === "index.html") return new URL(normalized);
  const target = new URL(entry, normalized);
  return target.origin === base.origin && target.pathname.startsWith(new URL(normalized).pathname) ? target : null;
}

function sendEvent(event, data = {}) {
  const endpoint = safeAllowedUrl(state.config.analytics?.endpoint, state.config.allowedControlHosts, location.href, true);
  if (!endpoint) return;
  try {
    navigator.sendBeacon(endpoint, new Blob([JSON.stringify({
      event,
      site: state.config.analytics?.siteId || "rpg-portal",
      gameId: state.game?.id,
      path: location.pathname,
      at: new Date().toISOString(),
      ...data,
    })], { type: "application/json" }));
  } catch { /* analytics must never break the launcher */ }
}

function safeHttpUrl(value, base) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch { return null; }
}

function safeAllowedUrl(value, allowedHosts, base, allowSameOrigin = false) {
  const url = safeHttpUrl(value, base);
  if (!url) return null;
  if (allowSameOrigin && url.origin === location.origin) return url;
  return Array.isArray(allowedHosts) && allowedHosts.includes(url.hostname) ? url : null;
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
