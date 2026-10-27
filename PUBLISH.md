# 发布清单

目标：把 `dsh-fatfish-level` 发到 npm，并收录进 DSH 插件市场（市场读 `awesome-dsh-plugin` 的精选列表）。

需要你准备两样东西：

1. 一个公开的 GitHub 账号 / 仓库，仓库名建议 `dsh-fatfish-level`；
2. 一个 npm 账号（公共 npm 上 `dsh-fatfish-level` 这个名字目前未被占用）。

## 0. 填 owner

在仓库根目录执行：

```sh
node scripts/fill-owner.mjs <你的 GitHub owner>
```

例如 `node scripts/fill-owner.mjs ligang`。它会：

- 改写 `package.json` 的 `repository` / `homepage` / `bugs`；
- 把 `README.md` 里的 `OWNER` 换成你的 owner；
- 生成 `market-entry.yml`，内容就是提交到市场的 YAML。

然后跑一次检查：

```sh
npm run check:release
```

## 1. 建 GitHub 仓库并推送

在 GitHub 新建公开仓库 `dsh-fatfish-level`（不要勾选自动生成 README），然后：

```sh
git init
git add .
git commit -m "feat: dsh-fatfish-level 0.3.2"
git branch -M main
git remote add origin https://github.com/<owner>/dsh-fatfish-level.git
git push -u origin main
```

在仓库的 **About → Topics** 里加上 `dsh-plugin`。

> 市场要求仓库**创建满 1 天**才会通过 CI；刚建好的仓库当天提交会被打回，等一天再提即可。
>
> 仓库必须是公开的，并且包含真实可运行代码；只有 README 的仓库不收录。

## 2. 发布 npm 包（推荐，非必需）

```sh
npm login --registry=https://registry.npmjs.org
npm publish
```

`package.json` 已设置 `publishConfig.registry` 指向公共 npm，`prepublishOnly` 会先跑发布检查。发布后验证：

```sh
npm view dsh-fatfish-level version
```

安装方式随之变成：

```sh
dsh plugin --profile web add dsh-fatfish-level
```

> 不发 npm 也可以：市场条目仍可提交，用户会从 GitHub 安装；但 npm 预构建安装更快，也会在市场里显示下载量。

## 3. 提交市场收录

市场仓库：[awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)

1. Fork 该仓库；
2. 把根目录的 `market-entry.yml` 复制到 `data/plugins/<owner>__dsh-fatfish-level.yml`；
3. 只提交这一个文件，开 PR。

`market-entry.yml` 内容形如：

```yaml
url: https://github.com/<owner>/dsh-fatfish-level
name: <owner>/dsh-fatfish-level
category: fun
description:
  en: Adds a token-burn leveling widget to DSH with 14 DeepSeek-whale levels, daily quests, streaks and achievements.
  zh: '按累计 token 消耗给右下角大肥鱼升级的 DSH 挂件：14 级 DeepSeek 鲸鱼图标、今日任务、连击与成就。'
icon: https://raw.githubusercontent.com/<owner>/dsh-fatfish-level/main/assets/icon-180.png
```

说明：

- `category: fun` 是列表里的“趣味”分类；这个插件不是工具，不该放 `tools`。
- `description.en` 必填，描述必须和代码一致；不要写“最强”“最好用”之类营销词。
- 一个 PR 最多加 3 条，这里只加 1 条。
- README 由维护者根据 YAML 自动生成，**不要手工改 README**。
- PR CI 会检查 `dsh.bundle` manifest、仓库年龄、YAML 格式、README 生成；通过后维护者会读代码再合并。

## 4. 之后更新

- 发新版：改 `package.json` 的 `version`，`npm publish`；
- 市场条目不需要改，市场会从 npm/仓库读取新版本；
- 截图更新：替换 `docs/screenshots/` 里的图片即可，`screenshots.json` 已指向这些相对路径；
- 条目里的描述只有在功能变化时才需要改。

## 本仓库里已经准备好的东西

| 文件 | 作用 |
|---|---|
| `package.json` | npm 元数据、`dsh.bundle`、`engines.dsh`、发布检查脚本 |
| `cordis.patch.yml` | 把插件插进 loader 树 |
| `LICENSE` | MIT |
| `assets/icon-180.png` | 市场卡片图标 |
| `docs/screenshots/01–03.png` | 市场截图 |
| `screenshots.json` | 市场截图清单（1–8 张） |
| `scripts/fill-owner.mjs` | 一键替换 OWNER |
| `scripts/check-release.mjs` | 发布前自检 |
| `market-entry.yml` | 填完 owner 后生成的市场条目 |
