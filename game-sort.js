const collators = new Map();

function compareCatalogGames(a, b, language = "zh-Hans") {
  const runtimeDifference = runtimeRank(a.runtimeStatus) - runtimeRank(b.runtimeStatus);
  if (runtimeDifference) return runtimeDifference;

  const chineseDifference = Number(hasChineseTitle(b.title)) - Number(hasChineseTitle(a.title));
  if (chineseDifference) return chineseDifference;

  if (a.hasCover !== b.hasCover) return a.hasCover ? -1 : 1;
  const aSize = a.dataSize ?? -1;
  const bSize = b.dataSize ?? -1;
  if (aSize !== bSize) return bSize - aSize;
  return getCollator(language).compare(a.title, b.title);
}

function hasChineseTitle(value) {
  const title = String(value || "");
  return /\p{Script=Han}/u.test(title) && !/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(title);
}

function runtimeRank(status) {
  if (status === "playable") return 0;
  if (status === "failed") return 2;
  return 1;
}

function getCollator(language) {
  const locale = language === "en" ? "en" : "zh";
  if (!collators.has(locale)) {
    collators.set(locale, new Intl.Collator(locale, { sensitivity: "base", usage: "sort" }));
  }
  return collators.get(locale);
}

globalThis.GameSort = Object.freeze({ compareCatalogGames, hasChineseTitle });
