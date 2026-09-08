# 彩票选号器 · Lottery Picker

> Windows 桌面端彩票选号工具，基于 **Electron + Vue 3 + Vite**。完全免费、离线可用，提供往期开奖查询、分布统计、中奖地图、AI 选号、兑奖核对等一体化体验。
>
> A Windows desktop lottery number picker built with **Electron + Vue 3 + Vite**. Completely free and offline-capable, offering historical draw lookup, distribution stats, winning-province map, AI number picking, and prize checking in one integrated experience.

> ⚠️ **理性购彩提示 / Responsible Gaming Notice**
> 彩票开奖为独立随机事件，本软件所有选号、评分、统计与推荐均不提高中奖概率，仅供娱乐参考。本软件完全免费，不含任何内购、广告与付费功能。
> Lottery draws are independent random events. Nothing in this software improves your odds of winning — all picks, scores, stats and recommendations are for entertainment reference only. The software is 100% free, with no in-app purchases, ads, or paid features.

[![GitHub Release](https://img.shields.io/github/v/release/mr-awei/Lottery-Picker?label=GitHub%20Release&color=blue)](https://github.com/mr-awei/Lottery-Picker/releases)

---

## 📥 下载安装包 / Download

本项目的 Windows 安装包（NSIS 安装程序 + 绿色 zip）由 **GitHub Actions 在每次推送时自动构建**。

Windows installers (NSIS setup + portable zip) are **automatically built by GitHub Actions on every push**.

➡️ **[点击前往 GitHub Releases 下载最新版 / Download the latest release from GitHub](https://github.com/mr-awei/Lottery-Picker/releases)**

> 说明：Gitee 仓库仅镜像源码，**安装包统一在 GitHub 发布**。GitHub 与 Gitee 代码完全同步，下载请走上方 GitHub 链接。
> Note: The Gitee repo mirrors source only; **installers are published exclusively on GitHub**. Code is fully synced between both remotes.

---

## ✨ 功能特性 / Features

### 🎰 支持彩种（共 8 种）/ Supported Lotteries (8 total)

| 分类 / Category | 彩种 / Lottery | 玩法模型 / Play Model | 开奖频率 / Draw Frequency |
|------|------|----------|----------|
| 福彩 / Welfare | 双色球 / 七乐彩 / 快乐8 / 福彩3D | 乐透型 / 直位型 Lotto / Position | 每周 / 每日 Weekly / Daily |
| 体彩 / Sports | 大乐透 / 排列3 / 排列5 / 7星彩 | 乐透型 / 直位型 Lotto / Position | 每周 / 每日 Weekly / Daily |

### 📊 核心功能 / Core Features

- **往期开奖 / Historical draws** — 自动拉取近 100 期官方开奖数据，离线缓存 / Auto-fetches the latest 100 official draws with offline cache
- **分布图 / Distribution charts** — 号码频次 / 遗漏 / 奇偶大小 / 区间占比 / 和值走势（ECharts 渲染）/ Frequency, omission, odd/even, zone ratio, sum trends (ECharts)
- **中奖省份地图 / Winning-province map** — 一等奖中奖分布热力图（中国地图），条形图切换 / Heat map of first-prize provinces (China map), toggle to bar chart
- **冷热号看板 / Hot & cold board** — 近 N 期号码出现频率与遗漏值 / Frequency and omission over recent N draws
- **AI 选号引擎 / AI picker engine** — 基于统计规则的本地选号，支持 / Local stats-based picking with:
  - 单注 / 多注 / 复式 / 胆拖 / 定位选号 / Single, multi, compound,胆拖, position plays
  - 冷热加权、区间均衡、奇偶均衡、和值区间、连号限量 / Hot-cold weighting, zone balance, odd-even balance, sum range, consecutive limit
  - **GPU 加速 / GPU acceleration**：WebGPU → GPU.js → Worker → CPU 逐级降级，批量生成海量候选组合 / Tiered fallback for massive candidate generation
- **兑奖核对 / Prize checking** — 输入自选号码即可核对近 N 期历史中奖情况 / Check your picks against recent N draws
- **奖池 / 销量展示 / Jackpot & sales** — 每期奖池金额、销售额、头奖注数与单注奖金 / Per-draw jackpot, sales, first-prize count and per-ticket amount
- **自动刷新 / Auto refresh** — 距开奖 30 分钟内每分钟自动更新，其余时段 30 分钟轮询 / Every minute within 30 min of draw, otherwise every 30 min
- **深色 / 浅色主题 / Dark & light themes** — 一键切换，记忆用户偏好 / One-click toggle with preference memory
- **每日理性购彩弹窗 / Daily responsible-gaming popup** — 内置免费声明与购彩提醒 / Built-in free-use statement and gaming reminder

### 🧠 技术亮点 / Technical Highlights

- **Electron 主进程抓数据 / Main-process fetching** — 绕开 CORS 与反爬限制，数据源稳定 / Bypasses CORS and anti-scraping for stable data sources
- **本地 JSON 缓存 / Local JSON cache** — 缓存在 `%APPDATA%/lottery-picker/lottery-data/`，支持缓存失效回退 / Cached at `%APPDATA%/lottery-picker/lottery-data/` with stale-cache fallback
- **GPU 加速批量评分 / GPU-accelerated batch scoring** — 利用 GPU 并行计算对海量候选组合打分，提升选号质量 / GPU-parallel scoring of massive candidate sets
- **OCR 号码识别 / OCR number recognition** — 可选的图片识别功能（tesseract.js），方便从截图提取号码 / Optional screenshot-to-numbers via tesseract.js
- **Tesseract.js OCR** — 内置字体识别模型文件（位于 `public/ocr/`）/ Bundled trained model in `public/ocr/`

---

## 🛠 技术栈 / Tech Stack

| 层级 / Layer | 技术 / Tech | 版本 / Version |
|------|------|------|
| 桌面框架 / Desktop | Electron | ^31 |
| 前端框架 / Frontend | Vue 3 | ^3.4 |
| 构建工具 / Bundler | Vite | ^5.2 |
| UI 组件库 / UI Kit | Element Plus | ^2.7 |
| 图表 / Charts | ECharts | ^5.5 |
| GPU 计算 / GPU Compute | gpu.js | ^2.24 |
| OCR | tesseract.js | ^7.0 |
| 打包 / Packaging | electron-builder | ^24.13 |
| 测试 / Testing | Vitest | ^4.1 |

---

## 📁 项目结构 / Project Structure

```
lottery-picker/
├── electron/                     # Electron 主进程 / Main process
│   ├── main.js                   # 窗口创建、生命周期、IPC 注册 / Window, lifecycle, IPC
│   ├── preload.js                # contextBridge 安全暴露 IPC 接口 / Secure IPC bridge
│   ├── data-fetcher.js           # 官方 API 抓取（福彩/体彩官网）/ Official API fetch
│   └── data-store.js             # 本地 JSON 缓存读写 / Local JSON cache
├── src/                          # 渲染进程（Vue3）/ Renderer (Vue 3)
│   ├── main.js                   # Vue 应用入口 / App entry
│   ├── App.vue                   # 主界面：彩种切换 + 状态栏 + 每日提示 / Main UI
│   ├── components/
│   │   ├── LotteryBoard.vue      # 统一的彩种面板容器 / Lottery panel container
│   │   ├── AiPicker.vue          # AI 选号面板（单注/多注/复式/胆拖）/ AI picker panel
│   │   ├── DistributionChart.vue # 号码分布图 / Distribution chart
│   │   ├── PrizeMap.vue          # 中奖省份地图 / Winning-province map
│   │   ├── HistoryTable.vue      # 往期开奖表格 / History table
│   │   ├── HotColdBoard.vue      # 冷热号看板 / Hot & cold board
│   │   ├── TrendChart.vue        # 走势图 / Trend chart
│   │   ├── MatrixView.vue        # 号码矩阵视图 / Number matrix
│   │   ├── ChasePlan.vue         # 追号计划 / Chase plan
│   │   ├── PoolView.vue          # 奖池视图 / Jackpot view
│   │   ├── MyPicks.vue           # 我的自选 / My picks
│   │   ├── SplitTool.vue         # 分解工具 / Split tool
│   │   ├── FileCheck.vue         # 图片识别兑奖 / OCR prize check
│   │   ├── KnowledgeView.vue     # 玩法知识 / Play knowledge
│   │   ├── MaxPrizeCard.vue      # 头奖卡片 / Max-prize card
│   │   └── SettingsView.vue      # 设置（GPU、主题、协议等）/ Settings
│   ├── utils/
│   │   ├── game-config.js        # 8 种彩种参数化配置 / 8-lottery config
│   │   ├── picker-engine.js      # 选号引擎（本地统计 + GPU 批量）/ Picker engine
│   │   ├── gpu-engine.js         # GPU 加速层 / GPU layer
│   │   ├── gpu-worker.js         # Worker 降级方案 / Worker fallback
│   │   ├── prize-check.js        # 中奖判定 / 奖金计算 / Prize判定 & calc
│   │   ├── map-data.js           # 中奖省份聚合 / Province aggregation
│   │   ├── echarts-setup.js      # ECharts 按需注册 / ECharts setup
│   │   ├── ui-state.js           # 主题与 UI 状态 / Theme & UI state
│   │   ├── version.js            # 版本信息与更新公告 / Version & changelog
│   │   └── license.js            # 双授权协议全文（应用内弹窗复用）/ Dual-license text
│   ├── assets/
│   │   ├── china.json            # 中国地图 GeoJSON / China GeoJSON
│   │   └── global.css            # 全局样式 / Global styles
│   └── views/
│       ├── SSQView.vue           # 双色球视图 / SSQ view
│       └── DLTView.vue           # 大乐透视图 / DLT view
├── public/
│   └── ocr/                      # Tesseract OCR 模型文件 / OCR models
├── build/
│   ├── icon.ico                  # 安装程序图标 / Installer icon
│   └── icon.png
├── tests/                        # Vitest 单元测试 / Unit tests
├── vite.config.js                # Vite 配置（base: ./ 适合 Electron）/ Vite config
├── vitest.config.mjs
├── LICENSE                       # 双授权协议 v1.0 / Dual License v1.0
└── package.json
```

---

## 🚀 快速开始 / Quick Start

### 环境要求 / Requirements

- Node.js **≥ 18**
- Windows 10 / 11（仅打包 Windows 安装程序 / Windows installers only）

### 安装与开发 / Install & Develop

```bash
# 1. 安装依赖 / Install dependencies
npm install

# 2. 启动 Vite 开发服务器（http://localhost:5173）/ Start Vite dev server
npm run dev

# 3. 启动 Electron（需要先在另一个终端运行 dev）/ Start Electron (dev server must be running)
npm start
```

### 构建生产版本 / Build for Production

```bash
# 仅构建前端（Vite build）/ Frontend only
npm run build

# 构建前端 + Electron 打包 Windows 安装程序（NSIS + zip）/ Frontend + Windows installer
npm run dist
```

打包产物位于 `release/` 目录 / Output in `release/`:
- `release/彩票选号器 Setup 1.7.2.exe` — NSIS 安装程序 / NSIS installer
- `release/彩票选号器-1.7.2-win.zip` — 绿色免安装版 / Portable zip

### 仅抓取数据（CLI）/ Fetch Data Only (CLI)

```bash
# 抓取双色球近 100 期，结果输出到终端 / Fetch 100 SSQ draws, print to stdout
node electron/data-fetcher.js --game=ssq --count=100

# 抓取大乐透并保存为 JSON 文件 / Fetch DLT and save to JSON
node electron/data-fetcher.js --game=dlt --count=100 --out=./data/dlt.json

# 支持的 game 值 / Supported games：ssq, dlt, qlc, kl8, fc3d, pl3, pl5, qxc
```

### 运行测试 / Run Tests

```bash
npm test
```

---

## 🌐 数据源 / Data Sources

| 彩种 / Lottery | 数据源 / Source | 接口 / API |
|------|--------|------|
| 双色球 / 七乐彩 / 快乐8 / 福彩3D | 中国福利彩票官网 `cwl.gov.cn` / China Welfare Lottery | 福彩 JSON 接口 / Welfare JSON API |
| 大乐透 / 排列3 / 排列5 / 7星彩 | 中国体育彩票官网 `sporttery.cn` / China Sports Lottery | 体彩 webapi 接口 / Sports webapi |

数据缓存路径 / Cache path：`%APPDATA%/lottery-picker/lottery-data/{game}.json`

---

## 🧪 GPU 加速机制 / GPU Acceleration

选号引擎的批量评分部分支持多级降级 / The picker engine's batch scoring supports tiered fallback:

```
WebGPU (Chromium compute shader)
    ↓ unavailable
gpu.js (WebGL)
    ↓ unavailable
Web Worker
    ↓ unavailable
CPU (主线程，较慢但最兼容 / main thread, slower but most compatible)
```

启动时 Electron 会通过 `app.commandLine.appendSwitch('enable-unsafe-webgpu')` 开启 WebGPU 支持。用户可在「设置 → GPU」中手动选择显卡（核显 / 独显）。

At startup Electron enables WebGPU via `app.commandLine.appendSwitch('enable-unsafe-webgpu')`. Users can manually select a GPU (integrated / discrete) under **Settings → GPU**.

---

## 📜 关于"AI 选号" / About "AI Picking"

本软件所谓的"AI 选号"**并非机器学习或神经网络**，而是基于以下统计规则的启发式组合生成器：

The so-called "AI picking" in this software is **NOT machine learning or a neural network** — it is a heuristic combination generator based on statistical rules:

1. **冷热号加权 / Hot-cold weighting** — 近 N 期出现频率高的号码入选概率更大 / Higher-frequency numbers over recent N draws get larger selection probability
2. **区间均衡 / Zone balance** — 号码在三个区间内的分布尽量符合历史均值 / Distribution across three zones approximates historical mean
3. **奇偶均衡 / Odd-even balance** — 控制奇偶比在常见范围内 / Odd-even ratio kept within common ranges
4. **和值约束 / Sum constraint** — 和值落在历史高频区间 / Sum falls within historically high-frequency range
5. **连号限量 / Consecutive limit** — 避免过多连号 / Avoid too many consecutive numbers
6. **遗漏考虑 / Omission consideration** — 遗漏值过大的号码有一定补偿权重 / Long-omitted numbers get compensatory weight

彩票为独立随机事件，任何历史统计都无法预测未来。选号结果仅用于**减少用户自行组合的重复劳动**，绝不承诺提高中奖概率。

Lottery draws are independent random events; no historical statistic can predict the future. Pick results only **reduce the manual labor of combining numbers** and never promise improved odds.

---

## ⚖️ 开源协议 / Open Source License

本项目采用「**彩票选号器 双授权协议 v1.0**」（Lottery Picker Dual License v1.0）：

This project is licensed under the **"Lottery Picker Dual License v1.0"**:

- ✅ **非商业使用免费 / Non-commercial use is free** — 个人、非盈利组织、教育机构可免费使用、复制、修改、分发 / Individuals, non-profits, and educational institutions may freely use, copy, modify, and distribute
- 💰 **商业使用需授权 / Commercial use requires authorization** — 任何商业用途请联系 new_mr_awei@163.com 购买商业授权 / Any commercial use must contact new_mr_awei@163.com to purchase a commercial license
- 🚫 **严禁用于恶意程序 / Strictly prohibited for malware** — 三层保护 / three-layer protection：防篡改注入、防植入恶意程序、防用于恶意程序（免费版与商业版均必须遵守 / both free and commercial versions must comply）
- ⚖️ **违反者保留起诉权利 / Violators face legal action**

详见 / See [LICENSE](./LICENSE)

> 应用内查看路径 / In-app path：设置 → 关于软件 → 开源协议 → 查看协议 / Settings → About → Open Source License → View

---

## ❤️ 致谢 / Acknowledgments

- [Electron](https://www.electronjs.org/) — 让桌面应用开发变得简单 / Makes desktop app development simple
- [Vue.js](https://vuejs.org/) — 渐进式前端框架 / Progressive frontend framework
- [ECharts](https://echarts.apache.org/) — 强大的数据可视化库 / Powerful data visualization
- [Element Plus](https://element-plus.org/) — Vue 3 组件库 / Vue 3 component library
- [gpu.js](https://gpu.rocks/) — 在浏览器中使用 GPU 并行计算 / GPU parallel computing in the browser
- [tesseract.js](https://tesseract.projectnaptha.com/) — JS OCR 引擎 / JS OCR engine
- [Vite](https://vitejs.dev/) — 极速构建工具 / Lightning-fast bundler

---

## 🤝 贡献 / Contributing

欢迎提交 Issue 和 Pull Request。在提交前请先运行测试 / Issues and PRs are welcome. Please run tests before submitting:

```bash
npm test
```

### 开发规范 / Development Conventions

- Vue 组件使用 `<script setup>` 语法 / Vue components use `<script setup>`
- JavaScript 模块使用 ES Module（Vite 渲染进程）/ CommonJS（Electron 主进程）/ ESM for Vite renderer, CJS for Electron main
- 新增彩种只需在 `src/utils/game-config.js` 添加配置 + `electron/data-fetcher.js` 注册抓取函数 / Add a lottery by config in `game-config.js` + fetcher in `data-fetcher.js`
- 测试文件放在 `tests/` 目录，使用 Vitest / Tests live in `tests/`, powered by Vitest

---

## 📝 更新日志 / Changelog

### v1.7.2 (2026-09-09) — 双授权协议上线 · 开源合规 / Dual License · Open-source Compliance
- 项目正式采用「彩票选号器 双授权协议 v1.0」，根目录新增 LICENSE 文件（中英双语全文）/ Adopted Dual License v1.0; added root LICENSE (bilingual)
- 非商业使用免费，商业使用需联系作者购买授权 / Non-commercial free; commercial requires authorization
- 恶意程序禁止条款三层保护（免费版与商业版均必须遵守）/ Three-layer malware prohibition (both versions must comply)
- 设置页「关于软件」新增开源协议入口，弹窗展示完整协议，邮箱支持一键复制 / Added in-app license entry in Settings → About, with full-text dialog and one-click email copy
- README 重写为中英双语 / README rewritten in bilingual Chinese-English

### v1.7.0 (2026-08-24) — GPU 加速 · 设置入口置底 / GPU Acceleration
- 新增 GPU 加速：AI 一直选 / 暴力模式批量评分由 GPU 并行计算（WebGPU 优先，自动降级 GPU.js / 多线程 / CPU）/ GPU-accelerated batch scoring with WebGPU-first tiered fallback
- 真实识别本机显卡型号，支持手动选择显卡、关闭加速、四选一锁定方案 / Real GPU detection with manual selection and scheme lock
- 内置基准测试：10 万次候选评分对比 GPU 与 CPU 耗时 / Built-in benchmark comparing GPU vs CPU

### v1.0.0 (2026-08-22) — 第一版 / Initial Release
- 双色球 + 大乐透基础功能 / SSQ + DLT base features
- 往期开奖、分布图、AI 选号 / History, distribution, AI picking

> 完整更新日志请在应用内「设置 → 更新公告」查看 / Full changelog available in-app under Settings → Update Notes.

---

## 🔄 双端同步与自动构建 / Dual-remote Sync & CI Build

仓库同时托管在 **GitHub** 与 **Gitee**，并通过 Git 配置实现「一次推送、双端同步」，再配合 GitHub Actions 在每次推送后**自动构建 Windows 安装包**。

The repo is hosted on both **GitHub** and **Gitee**, configured for "one push, dual sync", with GitHub Actions **automatically building Windows installers** after every push.

### 一次推送，双端同步 / One Push, Dual Sync

`origin` 已配置两个推送地址，一条命令即可同时推送到 GitHub 和 Gitee / `origin` has two push URLs — one command pushes to both:

```bash
# 首次推送（建立上游跟踪）/ First push (set upstream)
git push -u origin --all --tags

# 之后日常推送 / Subsequent pushes
git push
```

> 拉取仍默认来自 GitHub；如需从 Gitee 拉取可 `git fetch gitee`。
> Pull defaults to GitHub; use `git fetch gitee` to pull from Gitee.

### 自动构建安装包 / Automated Installer Build

推送（或打 `v*` 标签）到 `master` 分支后，GitHub Actions（`.github/workflows/build.yml`）会在 Windows 环境自动执行 / After pushing (or tagging `v*`) to `master`, GitHub Actions runs on Windows:

```bash
npm ci && npm run dist      # vite build + electron-builder --win
```

- **每次推 `master` / Every push to master**：自动构建并在 GitHub 发布一个名为 `latest` 的**预发布 Release**，附带 `release/*.exe` 与 `release/*.zip` / Auto-builds a `latest` **pre-release** with installer artifacts
- **打标签推送（如 `v1.7.2`）/ Tag push (e.g. v1.7.2)**：自动创建**正式 Release**（同名标签），附带安装包 / Creates a **stable release** with the same tag, including installers
  - 若 GitHub 仓库配置了 `GITEE_TOKEN` 密钥，还会在 Gitee 同步一个「指向 GitHub 下载页」的发行版 / If `GITEE_TOKEN` is configured, also syncs a Gitee release linking to GitHub downloads

发版时打标签即可生成稳定的正式 Release / To release, tag and push:

```bash
git tag v1.7.2
git push origin master --tags
```
