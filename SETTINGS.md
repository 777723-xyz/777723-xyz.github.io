# 门户设置

这个仓库就是门户的设置中心，不需要宝塔，也不需要 VPS 承载访问流量。修改 `main` 分支后，GitHub Actions 会自动校验并重新发布 Pages。当前门户仍使用 GitHub Pages 默认域名；`yx.ecy.al` 待 DNS 生效后再启用。

## 常用设置

- [`config.json`](config.json)：站点标题、副标题、发布页、默认获取地址、默认封面、游戏内广告时间。
- [`ads.json`](ads.json)：广告文案、每条广告链接、顶部横幅、搜索框下方广告、卡片间广告和游戏内广告位。
- [`assets/`](assets/)：本地头像、背景和加载占位图。

`config.json` 中的 `title` 是网站标题，`siteName` 是品牌/域名，`tagline` 是首页品牌下方介绍，`description` 是搜索引擎摘要，`socialDescription` 是分享卡片摘要。页面运行时标题和这些摘要会一起更新，避免只改了可见文字却忘记 SEO 文案。

## 修改流程

1. 在 GitHub 打开对应 JSON 文件，点击编辑按钮。
2. 保持合法 JSON，不要写注释或尾逗号。
3. 修改后提交到 `main`。
4. 等待 `Deploy public game catalog` 成功，再访问 `https://yx.ecy.al/`。

广告链接必须使用 `config.json` 中 `allowedAdHosts` 允许的主机；每条广告的 `url` 可以不同，因此可以按广告区域使用不同域名。区域由 `slots` 控制，`slotEnabled` 可以单独关闭 `header`、`search`、`cards`、`gameOverlay`、`gameStart` 或 `gameTimed`；`enabled: false` 会全局关闭广告。

游戏卡片“获取”默认地址修改 `config.json` 的 `acquireUrl`，当前默认是 `https://pipifu.com`；它与 `ads.json` 的广告链接分开维护。首页右上角的关闭广告按钮只对当前浏览器生效，并保存在本地；重新点击可恢复。不要把 API 密钥、SSH 密钥、密码或统计私钥写进仓库。

## 域名与流量

门户和游戏 Pages 由 GitHub Pages 直接分发，用户访问不会经过宝塔或 VPS。启用 `yx.ecy.al` 时，域名服务商添加 `yx.ecy.al` 的 CNAME 指向 `777723-xyz.github.io`，确认 DNS 生效后再在 GitHub Pages 设置 Custom domain 并通过 HTTPS 检查。
