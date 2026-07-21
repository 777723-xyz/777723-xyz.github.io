# 777723-xyz.github.io

777723.xyz 的公开 Web RPG 门户。仓库只承载门户、启动器和发布时生成的可用游戏目录；游戏文件由各游戏 Fork 的 GitHub Pages 承载。

## 数据闭环

1. `game-index-runner/list.json` 是唯一游戏真源。
2. Pages 工作流运行 `scripts/build-catalog.mjs`，只保留 `verified`、属于 `allowedGameHosts` 且实际返回成功状态的游戏。
3. 门户只读取本次部署生成的 `games.json`。
4. `config.json` 管理品牌、发布页、获取链接、启动器、允许的游戏域名、统计端点和游戏广告时间。
5. `ads.json` 管理 13 条广告文案及顶部、搜索下方、卡片间、游戏开始和游戏定时广告位。

Runner 会以六小时为一个周期，按“索引一条 → Fork 一条 → 校验一条”的顺序渐进处理；只有校验元数据实际更新时才会主动通知门户重建。门户保留每六小时第 55 分钟的兜底构建。部署前会运行 `node scripts/validate-portal.mjs`，配置、广告引用、旧域名或未批准统计脚本不合格时会阻止发布。

## 本地检查

```bash
node --check app.js
node scripts/validate-portal.mjs
node scripts/build-catalog.mjs
```

然后在仓库根目录启动任意静态 HTTP 服务，访问 `/` 和 `/play.html?id=<游戏ID>`。

## GitHub 设置中心

日常设置直接编辑 [`config.json`](config.json) 和 [`ads.json`](ads.json)，提交到 `main` 后自动部署。字段说明和操作步骤见 [`SETTINGS.md`](SETTINGS.md)。这是推荐的长期方案，GitHub Pages 直接承载门户和游戏 Pages，不经过宝塔或 VPS。

## 宝塔控制广告（可选）

宝塔只需要提供很小的 JSON 配置文件，不存游戏、不反代游戏流量。完整操作与 CORS 示例见 [`BAOTA_CONTROL.md`](BAOTA_CONTROL.md)。广告服务尚未上线前，保持 `runtimeConfigEndpoints` 为空，门户会使用仓库内的安全默认配置。

## 绑定域名

域名 DNS 生效后，再写入 `CNAME`（内容为 `yx.ecy.al`）并在本仓库 **Settings → Pages → Custom domain** 中填写 `yx.ecy.al`。在域名服务商处添加：

```text
类型：CNAME
主机：yx
值：777723-xyz.github.io
```

DNS 和 GitHub Pages 设置完成后，再把门户 canonical、站点地图和 Open Graph 地址同步为新域名。游戏资源仍使用 `777723-xyz.github.io` 的各游戏路径，不要把 `allowedGameHosts` 改成门户域名。

如以后更换门户域名，只需同步修改 `CNAME`、`config.json` 的控制域名白名单，以及 SEO 文件：

1. `index.html` 的 canonical、Open Graph 和 Twitter 图片地址。
2. `robots.txt` 与 `sitemap.xml`。
3. `game-index-runner` 的 `SITE_ORIGIN` 和后续回写的 `pagesUrl`（只在改变游戏 Pages 出口时修改）。

此架构不需要宝塔代理或存储游戏资源。
