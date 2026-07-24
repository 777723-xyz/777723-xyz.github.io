import assert from "node:assert/strict";
await import("../game-sort.js");

const { compareCatalogGames, hasChineseTitle } = globalThis.GameSort;

const games = [
  game("unknown-zh", "中文冒险", "unknown", 500),
  game("playable-en", "English Adventure", "playable", 100),
  game("failed-zh", "失效游戏", "failed", 900),
  game("playable-zh", "勇者物语", "playable", 50),
  game("unknown-en", "Unknown Quest", "unknown", 1_000),
];

assert.deepEqual(
  games.sort((a, b) => compareCatalogGames(a, b, "zh-Hans")).map((game) => game.id),
  ["playable-zh", "playable-en", "unknown-zh", "unknown-en", "failed-zh"],
);
assert.equal(hasChineseTitle("比基尼铠甲探险队完整版"), true);
assert.equal(hasChineseTitle("Violated Princess ダッシュ"), false);
assert.equal(hasChineseTitle("English Adventure"), false);

console.log("Game sorting test passed.");

function game(id, title, runtimeStatus, dataSize) {
  return { id, title, runtimeStatus, dataSize, hasCover: true };
}
