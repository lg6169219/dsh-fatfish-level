# dsh-fatfish-level · 大肥鱼等级

[![license](https://img.shields.io/github/license/lg6169219/dsh-fatfish-level)](LICENSE)

按**累计烧掉的 token 量级**给 DSH 右下角的大肥鱼（小鲸鱼挂件）升级，并把它做成一个小游戏。

不碰余额、不猜价格，只认本机会话里的真实 `usage`：输入、缓存命中、缓存写入、输出，统统算进「烧掉的 token」。右下角是胶囊铭牌 `🐳 Lv.N 称号 🔥连击`；点开是三页面板：**成长 / 今日 / 成就**。

![成长面板](https://raw.githubusercontent.com/lg6169219/dsh-fatfish-level/main/docs/screenshots/01-growth.png)

## 功能

- **14 级成长**：鱼苗 → 胖头鲸 → 巨鲸 → 吞星鲸 → 维度吞噬者；每级一个 DeepSeek 鲸鱼图标，配色、体型、皇冠、星芒、轨道环逐级变化。
- **真实记账**：监听本机所有会话的 `assistant/message`，按 `inputTokens + cacheReadTokens + cacheWriteTokens + outputTokens` 累加；子智能体与重试的用量同样计入。
- **历史补算与对账**：首次启用读小鲸鱼账本的逐轮记录补算历史；之后定期对账，插件停用期间漏掉的量会补回总量。
- **今日任务**：今日烧掉 500 万 / 2000 万 / 5000 万 token，三条独立打勾，每天 0 点刷新。
- **每日目标、连击、成就**：目标进度、连续天数、14 个成就徽章（含深夜摸鱼、早起的鱼、一口千万、七日不断等）与个人纪录。
- **升级演出**：铭牌弹跳、撒花、漫画气泡；Lv.4 起小鲸鱼身后有等级光环，Lv.6 起头顶皇冠，面板里可关闭装饰。

![今日任务](https://raw.githubusercontent.com/lg6169219/dsh-fatfish-level/main/docs/screenshots/02-today.png)

![成就徽章](https://raw.githubusercontent.com/lg6169219/dsh-fatfish-level/main/docs/screenshots/03-badges.png)

## 安装

需要 DSH 0.2.x（Node.js ≥ 22）。

从 GitHub 安装（当前推荐）：

```sh
dsh plugin --profile web add "github:lg6169219/dsh-fatfish-level"
```

npm 包发布后，也可以直接：

```sh
dsh plugin --profile web add dsh-fatfish-level
```

装完刷新一次页面（F5）。插件服务端会热加载；**前端脚本走 index 注入，必须刷新页面才会出现**。

本地开发可以 `link:`：

```sh
dsh plugin --profile web add "link:<本仓库绝对路径>"
```

## 等级表

| Lv | 称号 | 累计 token | 本级新增 |
|---:|---|---:|---:|
| 1 | 鱼苗 | 0 | — |
| 2 | 小鱼花 | 300 万 | 300 万 |
| 3 | 小肥鱼 | 1,200 万 | 900 万 |
| 4 | 圆肚鱼 | 4,000 万 | 2,800 万 |
| 5 | 肥鱼 | 1 亿 | 6,000 万 |
| 6 | 大肥鱼 | 2.2 亿 | 1.2 亿 |
| 7 | 胖头鲸 | 4 亿 | 1.8 亿 |
| 8 | 巨鲸 | 10 亿 | 6 亿 |
| 9 | 深海霸主 | 30 亿 | 20 亿 |
| 10 | 吞星鲸 | 100 亿 | 70 亿 |
| 11 | 银河鲸 | 300 亿 | 200 亿 |
| 12 | 宇宙肥鱼 | 1,000 亿 | 700 亿 |
| 13 | 究极肥鱼 | 3,000 亿 | 2,000 亿 |
| 14 | 维度吞噬者 | 1 万亿 | 7,000 亿 |

Lv.2–4 每级约 3～4 倍，Lv.5–7 约 2 倍；Lv.8 起每档 3～4 倍，顶级 1 万亿。

## 计分口径

| 项目 | 口径 |
|---|---|
| 计入 | `inputTokens` + `cacheReadTokens` + `cacheWriteTokens` + `outputTokens` |
| 不重复计 | `reasoningTokens` 已含在 `outputTokens` 里，不再单加 |
| 轮数 | 按 `(会话 id, turn)` 去重；同一轮多次 assistant 消息只算一轮 |
| 模型归属 | 取消息的 `source.model`，缺失时记「未知模型」 |
| 历史 | 小鲸鱼账本里已有的逐轮 token；对账补差记「未记录」 |
| 今日 / 近七日 | 只统计插件自己实时记到的量，补账不污染今天 |

## 数据与隐私

- 账本：`$DSH_HOME/.dsh-fatfish-level.json`，只有累计数、按天、按模型和轮次键；不含会话内容、路径或密钥。
- 只读探针：小鲸鱼的 `$DSH_HOME/.dshw-usage.json` 与 `/dsh-whale/usage-records.json`，用于补算历史、对账、连击与单轮纪录。
- 浏览器本地：`dshf.achv`（成就）、`dshf.maxTurn`、`dshf.hourMask`、`dshf.fx`（装饰开关）。
- 插件只提供两个只读 HTTP 接口：`/dsh-fatfish-level/state.json` 和 `/dsh-fatfish-level/client.js`；没有写接口，不上传任何数据。

## 兼容性

- DSH `0.2.x`（`engines.dsh` 已声明，含 `0.2.1-rc.*` 预发布）。
- 只在 Web profile 的聊天页挂载；设置页等路由自动隐藏。
- 鲸鱼图标使用 DSH 自带的 `FishLogo` 矢量路径，按等级改色与加装饰，不需要额外图片资源。

## 开发

```sh
npm test               # 等级表、账本、接口与清理
npm run check:release  # 发布前检查（包名、manifest、文件、截图、绝对路径）
npm run pack:check     # 查看会打进 npm 的文件
```

等级表在 `lib/levels.js`（服务端）和 `lib/client.js` 的 `THRESHOLDS`（前端）各一份，测试会逐项比对；改门槛时两处一起改。

## 非官方声明

这是个人插件，不是 DeepSeek 官方项目。鲸鱼轮廓来自 DSH 自带的 `FishLogo`（`@deepseek-ai/dsh-client-ui-primitives`，MIT，© DeepSeek），仅用于本插件的等级徽章；相关商标归原权利人。

## License

[MIT](LICENSE)
