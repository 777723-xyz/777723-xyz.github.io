import fs from "node:fs/promises";

const config = JSON.parse(await fs.readFile("config.json", "utf8"));
let html = await fs.readFile("index.html", "utf8");
const title = `${config.title || "Web RPG"} · ${config.siteName || "777723.xyz"}`;
const description = String(config.description || "").trim();
const socialDescription = String(config.socialDescription || description).trim();

html = replaceMeta(html, "name", "description", description);
html = replaceMeta(html, "property", "og:site_name", config.title || "Web RPG");
html = replaceMeta(html, "property", "og:title", title);
html = replaceMeta(html, "property", "og:description", socialDescription);
html = replaceMeta(html, "name", "twitter:title", title);
html = replaceMeta(html, "name", "twitter:description", socialDescription);
html = html.replace(/(<title>)[^<]*(<\/title>)/i, `$1${escapeHtml(title)}$2`);
html = html.replace(/(id="brand-title">)[^<]*/i, `$1${escapeHtml(config.title || "Web RPG")}`);
html = html.replace(/(id="tagline">)[^<]*/i, `$1${escapeHtml(config.tagline || "")}`);

await fs.writeFile("index.html", html, "utf8");
console.log(`Synchronized portal metadata for ${title}`);

function replaceMeta(source, attribute, name, value) {
  if (!value) return source;
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(<meta\\s+${attribute}=["']${escapedName}["']\\s+content=["'])[^"']*(["']\\s*/?>)`, "i");
  return source.replace(pattern, `$1${escapeHtml(value)}$2`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
