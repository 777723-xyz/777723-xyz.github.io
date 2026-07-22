const elements = {
  status: document.querySelector("#catalog-status"),
  loader: document.querySelector("#catalog-loader"),
  loaderLabel: document.querySelector("#catalog-loader-label"),
  catalog: document.querySelector("#catalog"),
  catalogMore: document.querySelector("#catalog-more"),
  loadMore: document.querySelector("#load-more"),
  search: document.querySelector("#search"),
  reload: document.querySelector("#reload"),
  brandTitle: document.querySelector("#brand-title"),
  tagline: document.querySelector("#tagline"),
  publish: document.querySelector("#publish-link"),
  footerPublish: document.querySelector("#footer-publish"),
  adsToggle: document.querySelector("#ads-toggle"),
  headerAd: document.querySelector("#header-ad"),
  searchAd: document.querySelector("#search-ad"),
  gameTemplate: document.querySelector("#game-card-template"),
  adTemplate: document.querySelector("#card-ad-template"),
};

const COPY = {
  "zh-Hans": {
    tagline: "请务必收藏发布页，回家不迷路",
    searchPlaceholder: "搜索标题、作者或仓库名",
    loading: "正在读取索引…",
    loaded: (shown, total) => `共 ${total} 个可玩游戏。`,
    matched: (shown, total) => `共 ${total} 个匹配游戏。`,
    empty: "暂时没有符合条件的游戏。",
    error: "目录暂时无法加载，请稍后重试。",
    play: "开始",
    source: "源码",
    acquire: "获取",
    loadMore: "加载更多",
    hideAds: "关闭广告",
    showAds: "显示广告",
  },
  en: {
    tagline: "Bookmark the permanent release page",
    searchPlaceholder: "Search title, author, or repository",
    loading: "Loading index…",
    loaded: (shown, total) => `${total} playable games.`,
    matched: (shown, total) => `${total} matching games.`,
    empty: "No matching games are available.",
    error: "The catalog is temporarily unavailable.",
    play: "Play",
    source: "Source",
    acquire: "Get",
    loadMore: "Load more",
    hideAds: "Hide ads",
    showAds: "Show ads",
  },
  ja: {
    tagline: "恒久公開ページをブックマークしてください",
    searchPlaceholder: "タイトル・作者・リポジトリを検索",
    loading: "ゲーム一覧を読み込み中…",
    loaded: (shown, total) => `${total} 本のゲーム。`,
    matched: (shown, total) => `${total} 件のゲーム。`,
    empty: "一致するゲームはありません。",
    error: "ゲーム一覧を読み込めませんでした。",
    play: "開始",
    source: "ソース",
    acquire: "取得",
    loadMore: "さらに読み込む",
    hideAds: "広告を非表示",
    showAds: "広告を表示",
  },
};

const titleCollators = new Map();

const state = {
  config: {},
  ads: { ads: [], slots: {} },
  games: [],
  gridColumns: 1,
  language: getInitialLanguage(),
  loading: false,
  visibleCount: 24,
  adsHidden: readAdsHiddenPreference(),
};

const PAGE_SIZE = 24;
const LOCAL_CATALOG_ENDPOINT = "/games.json?v=data-size-sort-20260721";
const LOCAL_ADS_ENDPOINT = "/ads.json";
let autoLoadObserver;
let coverLoadObserver;
let resizeFrame;

const REMOTE_CONFIG_FIELDS = new Set([
  "siteName", "title", "tagline", "description", "socialDescription", "publishUrl", "acquireUrl", "showSourceButton", "defaultCoverUrl", "adsEndpoints",
]);

initializeUi();
loadData();

function initializeUi() {
  elements.search.addEventListener("input", () => {
    state.visibleCount = PAGE_SIZE;
    render();
  });
  elements.reload.addEventListener("click", () => loadData({ force: true }));
  elements.adsToggle.addEventListener("click", toggleAdsVisibility);
  elements.loadMore.addEventListener("click", () => {
    showNextPage();
  });
  initializeAutoLoad();
  initializeCoverLoading();
  window.addEventListener("resize", scheduleGridRender, { passive: true });
  window.addEventListener("load", registerServiceWorker, { once: true });
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.language));
  });
  document.addEventListener("click", trackClick);
  applyLanguage();
}

async function loadData({ force = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  elements.reload.classList.add("is-loading");
  setLoading(true);
  setStatus(copy().loading);

  try {
    const cacheMode = force ? "no-store" : "default";
    const [localConfig, localCatalog, localAds] = await Promise.all([
      fetchJson("/config.json", 12000, cacheMode),
      fetchJson(LOCAL_CATALOG_ENDPOINT, 12000, cacheMode),
      fetchJson(LOCAL_ADS_ENDPOINT, 12000, cacheMode),
    ]);
    state.config = await loadRuntimeConfig(localConfig, cacheMode);
    const [catalog, ads] = await Promise.all([
      usesOnlyEndpoint(state.config.catalogEndpoints, LOCAL_CATALOG_ENDPOINT)
        ? localCatalog
        : fetchFirstAvailable(state.config.catalogEndpoints, cacheMode),
      usesOnlyEndpoint(state.config.adsEndpoints, LOCAL_ADS_ENDPOINT)
        ? localAds
        : fetchFirstAvailable(state.config.adsEndpoints || ["/ads.json"], cacheMode),
    ]);

    state.ads = normalizeAds(ads);
    state.games = normalizeGames(catalog, state.config);
    state.visibleCount = PAGE_SIZE;
    applyConfig();
    renderAdSlot(elements.headerAd, "header");
    renderAdSlot(elements.searchAd, "search");
    render();
    sendEvent("page_view", { gameCount: state.games.length });
  } catch (error) {
    console.error("Failed to load portal data", error);
    elements.catalog.replaceChildren(createStateCard(copy().error));
    setStatus(copy().error, true);
  } finally {
    state.loading = false;
    elements.reload.classList.remove("is-loading");
    setLoading(false);
  }
}

async function loadRuntimeConfig(localConfig, cacheMode) {
  const endpoints = Array.isArray(localConfig.runtimeConfigEndpoints)
    ? localConfig.runtimeConfigEndpoints
    : [];

  for (const endpoint of endpoints) {
    if (!safeAllowedUrl(endpoint, localConfig.allowedControlHosts, location.href, true)) continue;
    try {
      const remote = await fetchJson(endpoint, 4000, cacheMode);
      return mergeConfig(localConfig, remote);
    } catch (error) {
      console.warn(`Runtime config unavailable: ${endpoint}`, error);
    }
  }
  return localConfig;
}

function mergeConfig(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) return base;

  const merged = { ...base };
  for (const field of REMOTE_CONFIG_FIELDS) {
    if (field in override) merged[field] = override[field];
  }
  if (typeof merged.publishUrl === "string" && !safeAllowedUrl(merged.publishUrl, base.allowedAdHosts)) merged.publishUrl = base.publishUrl;
  if (typeof merged.acquireUrl === "string" && !safeAllowedUrl(merged.acquireUrl, base.allowedAdHosts)) merged.acquireUrl = base.acquireUrl;
  if (typeof merged.showSourceButton !== "boolean") merged.showSourceButton = base.showSourceButton === true;
  if (typeof merged.defaultCoverUrl === "string" && !safeAllowedUrl(merged.defaultCoverUrl, base.allowedCoverHosts)) merged.defaultCoverUrl = base.defaultCoverUrl;
  if (Array.isArray(merged.adsEndpoints)) {
    merged.adsEndpoints = merged.adsEndpoints.filter((endpoint) => safeAllowedUrl(endpoint, base.allowedControlHosts, location.href, true));
  }
  if (!merged.adsEndpoints?.length) merged.adsEndpoints = base.adsEndpoints;

  const remoteAnalytics = override.analytics && typeof override.analytics === "object" ? override.analytics : {};
  const analyticsEndpoint = safeAllowedUrl(remoteAnalytics.endpoint, base.allowedControlHosts, location.href, true);
  merged.analytics = {
    ...(base.analytics || {}),
    ...(analyticsEndpoint ? { endpoint: analyticsEndpoint.href } : {}),
    ...(typeof remoteAnalytics.siteId === "string" ? { siteId: remoteAnalytics.siteId.slice(0, 80) } : {}),
  };

  const remoteGameAd = override.gameAd && typeof override.gameAd === "object" ? override.gameAd : {};
  merged.gameAd = {
    ...(base.gameAd || {}),
    enabled: remoteGameAd.enabled === false ? false : base.gameAd?.enabled !== false,
    startDelaySeconds: clampInteger(remoteGameAd.startDelaySeconds, 0, 3600, Number(base.gameAd?.startDelaySeconds) || 45),
    repeatSeconds: clampInteger(remoteGameAd.repeatSeconds, 60, 86_400, Number(base.gameAd?.repeatSeconds) || 600),
    closeDelaySeconds: clampInteger(remoteGameAd.closeDelaySeconds, 0, 60, Number(base.gameAd?.closeDelaySeconds) || 5),
  };

  return {
    ...merged,
    allowedControlHosts: base.allowedControlHosts,
    allowedAdHosts: base.allowedAdHosts,
    allowedCoverHosts: base.allowedCoverHosts,
    allowedGameHosts: base.allowedGameHosts,
    catalogEndpoints: base.catalogEndpoints,
    launcherPath: base.launcherPath,
    iframeSandbox: base.iframeSandbox,
    runtimeConfigEndpoints: base.runtimeConfigEndpoints,
  };
}

async function fetchFirstAvailable(endpoints, cacheMode = "default") {
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    throw new Error("No endpoint is configured");
  }
  let lastError;
  for (const endpoint of endpoints) {
    try {
      return await fetchJson(endpoint, 12000, cacheMode);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("All endpoints failed");
}

function usesOnlyEndpoint(endpoints, expected) {
  return Array.isArray(endpoints) && endpoints.length === 1 && endpoints[0] === expected;
}

async function fetchJson(url, timeoutMs = 12000, cacheMode = "default") {
  const target = safeHttpUrl(url, location.href);
  if (!target) throw new Error(`Invalid endpoint: ${url}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(target, { cache: cacheMode, signal: controller.signal });
    if (!response.ok) throw new Error(`${target} returned ${response.status}`);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("json")) throw new Error(`${target} did not return JSON`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeGames(catalog, config) {
  if (!Array.isArray(catalog)) throw new Error("Catalog is not an array");
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
    .sort(compareGames);
}

function toGame(raw, allowedHosts) {
  if (!raw || raw.status !== "verified" || typeof raw.pagesUrl !== "string") return null;
  const playUrl = buildPlayUrl(raw.pagesUrl, raw.entryPath);
  if (!playUrl || !allowedHosts.has(playUrl.hostname)) return null;

  const title = readableTitle(raw);
  const sourceUrl = safeHttpUrl(raw.repo);
  const coverUrl = safeAllowedUrl(raw.cover, state.config.allowedCoverHosts, playUrl.href);
  const acquireUrl = safeAllowedUrl(raw.acquireUrl, state.config.allowedAdHosts);
  return {
    id: raw.id || `${raw.owner || "unknown"}/${raw.name || title}`,
    title,
    owner: raw.owner || "未知作者",
    name: raw.name || "未知仓库",
    engine: raw.engine || "RPG Maker",
    totalSize: Number.isFinite(Number(raw.totalSize)) ? Number(raw.totalSize) : null,
    dataSize: Number.isFinite(Number(raw.dataSize)) ? Number(raw.dataSize) : null,
    hasCover: Boolean(raw.cover),
    coverUrl: coverUrl?.href || "",
    playUrl: playUrl.href,
    sourceUrl: sourceUrl?.href || "",
    acquireUrl: acquireUrl?.href || "",
    searchText: [title, raw.owner, raw.name, raw.engine].filter(Boolean).join(" ").toLowerCase(),
  };
}

function compareGames(a, b) {
  if (a.hasCover !== b.hasCover) return a.hasCover ? -1 : 1;
  const aSize = a.dataSize ?? -1;
  const bSize = b.dataSize ?? -1;
  if (aSize !== bSize) return bSize - aSize;
  return getTitleCollator().compare(a.title, b.title);
}

function getTitleCollator() {
  const locale = state.language === "en" ? "en" : "zh";
  return titleCollators.get(locale) || createTitleCollator(locale);
}

function createTitleCollator(locale) {
  const collator = new Intl.Collator(locale, { sensitivity: "base", usage: "sort" });
  titleCollators.set(locale, collator);
  return collator;
}

function buildPlayUrl(pagesUrl, entryPath) {
  const base = safeHttpUrl(pagesUrl);
  if (!base) return null;
  const entry = String(entryPath || "index.html").replace(/^\/+/, "");
  let decodedPath = base.pathname;
  try { decodedPath = decodeURIComponent(base.pathname); } catch { /* keep encoded path */ }
  decodedPath = decodedPath.replace(/^\/+/, "");
  if (/\.html?$/i.test(base.pathname) || decodedPath.endsWith(entry)) return base;
  const normalizedBase = base.href.endsWith("/") ? base.href : `${base.href}/`;
  if (!entry || entry.toLowerCase() === "index.html") return new URL(normalizedBase);
  const target = new URL(entry, normalizedBase);
  return target.origin === base.origin && target.pathname.startsWith(new URL(normalizedBase).pathname)
    ? target
    : null;
}

function render() {
  const query = elements.search.value.trim().toLowerCase();
  const games = getFilteredGames(query);
  const visibleGames = games.slice(0, state.visibleCount);
  resetObservedCovers();
  elements.catalog.replaceChildren();
  state.gridColumns = getGridColumnCount();

  if (games.length === 0) {
    elements.catalogMore.hidden = true;
    elements.catalog.append(createStateCard(copy().empty));
    setStatus(query ? copy().matched(0, 0) : copy().loaded(0, 0));
    return;
  }

  appendCatalogPage(games, 0, visibleGames.length);
  elements.catalogMore.hidden = visibleGames.length >= games.length;
  elements.loadMore.textContent = copy().loadMore;
  setStatus(query ? copy().matched(visibleGames.length, games.length) : copy().loaded(visibleGames.length, games.length));
}

function getFilteredGames(query = elements.search.value.trim().toLowerCase()) {
  return query
    ? state.games.filter((game) => game.searchText.includes(query))
    : state.games;
}

function appendCatalogPage(games, start, end) {
  if (end <= start) return;
  const fragment = document.createDocumentFragment();
  const cardAds = getSlotAds("cards");
  const interval = getCardInterval();
  let adIndex = 0;
  let nextAdAt = cardAds.length
    ? intervalFor(adIndex, interval, state.gridColumns)
    : Number.POSITIVE_INFINITY;

  // Walk from the beginning to keep card-ad positions stable when a later page
  // is appended. Existing cards are never recreated during automatic loading.
  for (let position = 1; position <= end; position += 1) {
    if (position > start) fragment.append(createGameCard(games[position - 1]));
    if (position !== nextAdAt) continue;
    if (position >= start && position < games.length) {
      fragment.append(createCardAd(cardAds[adIndex % cardAds.length]));
    }
    adIndex += 1;
    nextAdAt += intervalFor(adIndex, interval, state.gridColumns);
  }

  elements.catalog.append(fragment);
}

function createGameCard(game) {
  const card = elements.gameTemplate.content.cloneNode(true);
  const defaultCover = safeAllowedUrl(
    state.config.defaultCoverUrl,
    state.config.allowedCoverHosts,
    location.href,
    true,
  )?.href || "";
  const base = card.querySelector(".cover-base");
  const image = card.querySelector(".cover-image");
  base.src = defaultCover;
  if (game.coverUrl) {
    image.alt = `${game.title} 封面`;
    image.addEventListener("load", () => image.classList.add("is-loaded"), { once: true });
    image.addEventListener("error", () => image.remove(), { once: true });
    queueCoverImage(image, game.coverUrl);
  } else {
    image.remove();
  }

  card.querySelector(".game-title").textContent = game.title;
  card.querySelector(".game-repo").textContent = `${game.owner}/${game.name}`;
  card.querySelector(".engine").textContent = game.engine;
  const size = card.querySelector(".size");
  if (game.totalSize != null) {
    size.hidden = false;
    size.textContent = formatSize(game.totalSize);
  }

  const play = card.querySelector(".play");
  play.href = buildLauncherUrl(game);
  play.dataset.gameId = game.id;

  const source = card.querySelector(".source");
  const actions = card.querySelector(".game-actions");
  if (state.config.showSourceButton === true && game.sourceUrl) {
    source.href = game.sourceUrl;
    source.dataset.sourceId = game.id;
    source.setAttribute("aria-label", `${copy().source}：${game.title}`);
    source.title = `${copy().source}：${game.title}`;
  } else {
    source.remove();
    actions.classList.add("two-actions");
  }

  const acquire = card.querySelector(".acquire");
  acquire.href = game.acquireUrl || safeAllowedUrl(state.config.acquireUrl, state.config.allowedAdHosts)?.href || "https://pipifu.com/";
  acquire.dataset.acquireId = game.id;
  applyCopy(card);
  return card;
}

function buildLauncherUrl(game) {
  if (state.config.gameAd?.enabled === false || !state.config.launcherPath) return game.playUrl;
  const launcher = new URL(state.config.launcherPath, location.origin);
  launcher.searchParams.set("id", game.id);
  return launcher.href;
}

function normalizeAds(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ads: [], slots: {} };
  return {
    ...value,
    enabled: value.enabled !== false,
    slotEnabled: value.slotEnabled && typeof value.slotEnabled === "object" ? value.slotEnabled : {},
    ads: Array.isArray(value.ads) ? value.ads.filter(isValidAd) : [],
    slots: value.slots && typeof value.slots === "object" ? value.slots : {},
  };
}

function getSlotAds(slot) {
  if (state.adsHidden || state.ads.enabled === false || state.ads.slotEnabled?.[slot] === false) return [];
  const entries = Array.isArray(state.ads.slots?.[slot]) ? state.ads.slots[slot] : [];
  const byId = new Map(state.ads.ads.map((ad) => [ad.id, ad]));
  return entries
    .map((entry) => typeof entry === "string" ? byId.get(entry) : entry)
    .filter(isValidAd);
}

function isValidAd(ad) {
  return Boolean(ad && typeof ad.text === "string" && ad.text.trim() && safeAllowedUrl(ad.url, state.config.allowedAdHosts));
}

function renderAdSlot(element, slot) {
  const ads = getSlotAds(slot);
  const ad = ads[0];
  if (!ad) {
    element.closest(".ad-slot").hidden = true;
    return;
  }
  element.closest(".ad-slot").hidden = false;
  element.href = safeAllowedUrl(ad.url, state.config.allowedAdHosts).href;
  element.textContent = ad.text;
  element.dataset.adSlot = slot;
}

function createCardAd(ad) {
  const node = elements.adTemplate.content.cloneNode(true);
  const link = node.querySelector("a");
  link.href = safeAllowedUrl(ad.url, state.config.allowedAdHosts).href;
  link.dataset.adSlot = "cards";
  link.querySelector("strong").textContent = ad.text;
  return node;
}

function getCardInterval() {
  const min = clampInteger(state.ads.cardInterval?.min, 8, 12, 8);
  const max = clampInteger(state.ads.cardInterval?.max, min, 12, 12);
  return { min, max };
}

function intervalFor(index, { min, max }, columns = 1) {
  const aligned = [];
  for (let value = min; value <= max; value += 1) {
    if (value % columns === 0) aligned.push(value);
  }
  if (aligned.length > 0) return aligned[(index * 7 + 3) % aligned.length];
  const range = max - min + 1;
  return min + ((index * 7 + 3) % range);
}

function getGridColumnCount() {
  const tracks = getComputedStyle(elements.catalog).gridTemplateColumns.trim();
  return tracks && tracks !== "none" ? Math.max(1, tracks.split(/\s+/).length) : 1;
}

function showNextPage() {
  const games = getFilteredGames();
  const start = Math.min(state.visibleCount, games.length);
  const end = Math.min(start + PAGE_SIZE, games.length);
  if (end <= start) return;
  const scrollAnchor = { left: window.scrollX, top: window.scrollY };
  state.visibleCount = end;
  state.gridColumns = getGridColumnCount();
  appendCatalogPage(games, start, end);
  restoreScrollAnchor(scrollAnchor);
  elements.catalogMore.hidden = end >= games.length;
  elements.loadMore.textContent = copy().loadMore;
  const query = elements.search.value.trim().toLowerCase();
  setStatus(query ? copy().matched(end, games.length) : copy().loaded(end, games.length));
}

function restoreScrollAnchor(anchor) {
  if (!anchor) return;
  const restore = () => {
    if (Math.abs(window.scrollX - anchor.left) < 1 && Math.abs(window.scrollY - anchor.top) < 1) return;
    window.scrollTo({ left: anchor.left, top: anchor.top, behavior: "instant" });
  };
  restore();
  requestAnimationFrame(restore);
}

function initializeAutoLoad() {
  if (!("IntersectionObserver" in window)) return;
  document.documentElement.classList.add("has-auto-load");
  autoLoadObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting) && !state.loading && !elements.catalogMore.hidden) {
      showNextPage();
    }
  }, { rootMargin: "700px 0px" });
  autoLoadObserver.observe(elements.catalogMore);
}

function initializeCoverLoading() {
  if (!("IntersectionObserver" in window)) return;
  coverLoadObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      loadCoverImage(entry.target);
      coverLoadObserver.unobserve(entry.target);
    }
  }, { rootMargin: "360px 0px" });
}

function queueCoverImage(image, url) {
  image.dataset.src = url;
  if (coverLoadObserver) {
    coverLoadObserver.observe(image);
  } else {
    loadCoverImage(image);
  }
}

function loadCoverImage(image) {
  const url = image.dataset.src;
  if (!url) return;
  delete image.dataset.src;
  image.src = url;
}

function resetObservedCovers() {
  if (!coverLoadObserver) return;
  elements.catalog.querySelectorAll(".cover-image[data-src]").forEach((image) => {
    coverLoadObserver.unobserve(image);
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const register = () => navigator.serviceWorker.register("/service-worker.js").catch((error) => {
    console.warn("Portal cache unavailable", error);
  });
  if ("requestIdleCallback" in window) {
    requestIdleCallback(register, { timeout: 3000 });
  } else {
    setTimeout(register, 0);
  }
}

function scheduleGridRender() {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    if (state.games.length > 0 && getGridColumnCount() !== state.gridColumns) render();
  });
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function applyConfig() {
  const publishUrl = safeAllowedUrl(state.config.publishUrl, state.config.allowedAdHosts)?.href || "https://ecy.al/";
  elements.publish.href = publishUrl;
  elements.footerPublish.href = publishUrl;
  const siteTitle = `${state.config.title || "Web RPG"} · ${state.config.siteName || "777723.xyz"}`;
  document.title = siteTitle;
  elements.brandTitle.textContent = state.config.title || "Web RPG";
  setMetaContent('meta[name="description"]', state.config.description);
  setMetaContent('meta[property="og:site_name"]', state.config.title || "Web RPG");
  setMetaContent('meta[property="og:title"]', siteTitle);
  setMetaContent('meta[property="og:description"]', state.config.socialDescription || state.config.description);
  setMetaContent('meta[name="twitter:title"]', siteTitle);
  setMetaContent('meta[name="twitter:description"]', state.config.socialDescription || state.config.description);
  applyLanguage();
}

function setMetaContent(selector, value) {
  if (typeof value !== "string" || !value.trim()) return;
  const node = document.querySelector(selector);
  if (node) node.setAttribute("content", value.trim());
}

function setLanguage(language) {
  if (!(language in COPY)) return;
  state.language = language;
  state.visibleCount = PAGE_SIZE;
  try { localStorage.setItem("rpg-portal-language", language); } catch { /* storage is optional */ }
  state.games.sort(compareGames);
  applyLanguage();
  render();
}

function applyLanguage() {
  const language = state.language in COPY ? state.language : "zh-Hans";
  document.documentElement.lang = language;
  elements.tagline.textContent = language === "zh-Hans" && typeof state.config.tagline === "string"
    ? state.config.tagline
    : copy().tagline;
  elements.search.placeholder = copy().searchPlaceholder;
  if (state.loading) elements.loaderLabel.textContent = copy().loading;
  document.querySelectorAll("[data-language]").forEach((button) => {
    const active = button.dataset.language === language;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  updateAdsToggle();
  applyCopy(document);
}

function toggleAdsVisibility() {
  state.adsHidden = !state.adsHidden;
  try { localStorage.setItem("rpg-portal-ads-hidden", String(state.adsHidden)); } catch { /* storage is optional */ }
  updateAdsToggle();
  if (state.games.length > 0) render();
  renderAdSlot(elements.headerAd, "header");
  renderAdSlot(elements.searchAd, "search");
}

function updateAdsToggle() {
  if (!elements.adsToggle) return;
  const label = state.adsHidden ? copy().showAds : copy().hideAds;
  elements.adsToggle.hidden = state.ads.enabled === false || state.ads.ads.length === 0;
  elements.adsToggle.setAttribute("aria-label", label);
  elements.adsToggle.title = label;
  elements.adsToggle.classList.toggle("is-active", state.adsHidden);
}

function applyCopy(root) {
  root.querySelectorAll?.("[data-copy]").forEach((node) => {
    node.textContent = copy()[node.dataset.copy];
  });
}

function copy() {
  return COPY[state.language] || COPY["zh-Hans"];
}

function getInitialLanguage() {
  try {
    const saved = localStorage.getItem("rpg-portal-language");
    if (saved && saved in COPY) return saved;
  } catch { /* storage is optional */ }
  const language = navigator.language || "";
  if (language.startsWith("ja")) return "ja";
  if (language.startsWith("en")) return "en";
  return "zh-Hans";
}

function readAdsHiddenPreference() {
  try { return localStorage.getItem("rpg-portal-ads-hidden") === "true"; } catch { return false; }
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("is-error", isError);
}

function setLoading(isLoading) {
  elements.loader.classList.toggle("is-hidden", !isLoading);
  elements.loader.setAttribute("aria-busy", String(isLoading));
  if (isLoading) elements.loaderLabel.textContent = copy().loading;
}

function createStateCard(message) {
  const node = document.createElement("div");
  node.className = "state-card";
  node.textContent = message;
  return node;
}

function trackClick(event) {
  const target = event.target.closest("[data-game-id],[data-source-id],[data-acquire-id],[data-ad-slot]");
  if (!target) return;
  if (target.dataset.gameId) sendEvent("play_open", { gameId: target.dataset.gameId });
  if (target.dataset.sourceId) sendEvent("source_open", { gameId: target.dataset.sourceId });
  if (target.dataset.acquireId) sendEvent("acquire_click", { gameId: target.dataset.acquireId });
  if (target.dataset.adSlot) sendEvent("ad_click", { slot: target.dataset.adSlot });
}

function sendEvent(name, data = {}) {
  const endpoint = safeAllowedUrl(state.config.analytics?.endpoint, state.config.allowedControlHosts, location.href, true);
  if (!endpoint) return;
  const payload = JSON.stringify({
    event: name,
    site: state.config.analytics?.siteId || "rpg-portal",
    path: location.pathname,
    at: new Date().toISOString(),
    ...data,
  });
  try {
    navigator.sendBeacon(endpoint, new Blob([payload], { type: "application/json" }));
  } catch { /* analytics must never break the portal */ }
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

function safeAllowedUrl(value, allowedHosts, base, allowSameOrigin = false) {
  const url = safeHttpUrl(value, base);
  if (!url) return null;
  if (allowSameOrigin && url.origin === location.origin) return url;
  return Array.isArray(allowedHosts) && allowedHosts.includes(url.hostname) ? url : null;
}

function readableTitle(game) {
  const title = String(game.title || "").trim();
  return title && !/\{\{.*\}\}/.test(title) && title !== "__template__"
    ? title
    : String(game.name || game.id || "未命名游戏");
}

function formatSize(kilobytes) {
  let bytes = kilobytes * 1024;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  while (bytes >= 1024 && index < units.length - 1) {
    bytes /= 1024;
    index += 1;
  }
  return `${bytes.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}
