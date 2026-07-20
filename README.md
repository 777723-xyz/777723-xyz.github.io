# 777723-xyz.github.io

777723.xyz 的公开 Web RPG 门户。仓库只承载门户、启动器和发布时生成的可用游戏目录；游戏文件由各游戏 Fork 的 GitHub Pages 承载。

## 数据闭环

1. `game-index-runner/list.json` 是唯一游戏真源。
2. Pages 工作流运行 `scripts/build-catalog.mjs`，只保留 `verified`、属于 `allowedGameHosts` 且实际返回成功状态的游戏。
3. 门户只读取本次部署生成的 `games.json`。
4. `config.json` 管理品牌、发布页、获取链接、启动器、允许的游戏域名、统计端点和游戏广告时间。
5. `ads.json` 管理 13 条广告文案及顶部、搜索下方、卡片间、游戏开始和游戏定时广告位。

Runner 在校验/Pages 回写成功后会主动通知门户重建；门户保留每小时第 27 分钟的兜底构建，避免和 Runner 每小时第 17 分钟索引竞争。部署前会运行 `node scripts/validate-portal.mjs`，配置、广告引用、旧域名或未批准统计脚本不合格时会阻止发布。

## 本地检查

```bash
node --check app.js
node scripts/validate-portal.mjs
node scripts/build-catalog.mjs
```

然后在仓库根目录启动任意静态 HTTP 服务，访问 `/` 和 `/play.html?id=<游戏ID>`。

## 宝塔控制广告

宝塔只需要提供很小的 JSON 配置文件，不存游戏、不反代游戏流量。完整操作与 CORS 示例见 [`BAOTA_CONTROL.md`](BAOTA_CONTROL.md)。广告服务尚未上线前，保持 `runtimeConfigEndpoints` 为空，门户会使用仓库内的安全默认配置。

## 绑定域名

域名准备好后，在本仓库 **Settings → Pages → Custom domain** 中设置，并同步修改：

1. `config.json` 的 `allowedGameHosts`。
2. `game-index-runner` 的 `SITE_ORIGIN` 和后续回写的 `pagesUrl`。

此架构不需要宝塔代理或存储游戏资源。
