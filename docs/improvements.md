# 彩票选号器 · 改进清单（v1.7.0 → v2.0 路线图）

> 审查日期：2026-09-01
> 基于完整代码阅读（Electron 主进程 + Vue 渲染层 + 工具层 + 单元测试），每条问题绑定了具体文件与代码位置，方便定位与追踪。
>
> 优先级说明：🔴 P0 = Bug / 必须修复；🟡 P1 = 重要优化；🟢 P2 = 锦上添花。

---

## 一、🐛 Bug（🔴 P0）

### 1. 七乐彩兑奖逻辑错误 —— 特别号完全没参与判定

**文件**: `src/utils/prize-check.js` 第 33-41 行（PRIZE_RULES.qlc）+ 第 60-83 行（checkPrize）
**现象**: 七乐彩兑奖规则里，二等奖 = 红 6 + 特别号、四等奖 = 红 5 + 特别号。但七乐彩的 game-config 配置 `blueCount: 0`（选号时不选蓝球），用户选号时 `blue` 数组为空，导致 `blueMatch` 永远等于 0，**所有涉及特别号的奖项（二/四等奖）永远不可能命中**。

七乐彩的特别号在选号阶段不作为蓝球选，但在兑奖时需作为额外判定条件。需要单独写 `checkPrizeQLC(cfg, red, draw)` 方法，比对 `draw.blue`（接口返回的特别号）是否出现在用户选号里，作为特别奖级的附加条件。

**修复位置**: `src/utils/prize-check.js` 增加 `checkPrizeQLC` 函数，并在 `checkTicket` / `checkPrize` 中对 `cfg.special === true` 的彩种路由到新函数。

---

### 2. 分布图表冷热号阈值硬编码，不适应不同规模彩种

**文件**: `src/components/DistributionChart.vue` 第 257-258 行（freq 判定）+ 第 258、339 行（miss markLine）
**现象**:
- 热号判定 `s.recentCount[n] >= 3` —— 近 10 期出现 ≥3 次算热号，但快乐8每期开 20 个号码，出现 3 次太容易；双色球每期只开 6 个，出现 3 次反而算多
- 冷号判定 `s.total - s.lastSeen[n] >= 10` + `markLine: { yAxis: 10 }` —— 对快乐8（80 号码池）遗漏 10 期太普遍；对 3D/排列3（每位置 0-9），遗漏 10 期又太长
- 分布图顶部图例说明 "红色=热号(近10期≥3次) 蓝色=冷号(遗漏≥10期)" 是固定文案，不随彩种变化

**修复**: 将冷热阈值抽到 `game-config.js`，每种彩种可配置 `hotThreshold` / `coldMissThreshold`，DistributionChart 读取 cfg 值。

---

### 3. 走势图 DOM 爆炸 —— 直位彩种每行列数过多

**文件**: `src/components/TrendChart.vue` 第 131-212 行、样式第 440-486 行
**现象**: 7 星彩直位走势图每行 = 6 位 × 10 + 尾位 15 = **75 列**，100 期就是 7500 个表格单元格 DOM。浏览器渲染明显卡顿，滚动抖动。

**修复**: 用虚拟滚动（vue-virtual-scroller）或 IntersectionObserver 只渲染可视区域行；或者把直位走势图做成多标签页（按位切换）而不是一排全开。

---

### 4. 走势图 zone-gap CSS 类名含义混淆

**文件**: `src/components/TrendChart.vue` 第 377-379 行
**现象**: `.zone-gap { border-right: ... }` 类名看起来是"区间间隔"，但 CSS 里用了 `!important` 并且实际上是给列加分隔线。命名改成 `.col-zone-divider` 或 `.col-separator` 更清晰。

---

### 5. 走势图冷号显示 `miss-cold` 条件硬编码 ≥ 10

**文件**: `src/components/TrendChart.vue` 第 61 行、第 68 行、第 102 行、第 112 行、第 425-428 行
**现象**: 遗漏高亮蓝底用 `row.redMiss[n] >= 10`（或直位的 `row.digitMiss >= 10`），和分布图同样硬编码问题。

---

## 二、🎨 UI / 文案 / 交互优化（🟡 P1）

### 6. App.vue 初始渲染时 nextDrawText 为空

**文件**: `src/App.vue` 第 132、184-197、274 行
**现象**: `nextDrawText` 只在 `onMounted` 里调用一次 `updateNextDrawText()`，以及定时器里更新。但 `onMounted` 在第一次 render **之后**才触发，所以界面首次渲染时顶栏的"距开奖 XX 小时"是空的（虽然很快就会被定时器补上）。

**修复**: 把 `const nextDrawText = ref('')` 改成初始化时就调用 `updateNextDrawTextSync()` 或在 setup 阶段直接计算。

---

### 7. 多组件存在 .ghost-btn / .prize-flow-dialog 全局样式重复

**文件**: `src/components/FileCheck.vue` 第 389-410 行（.ghost-btn）+ 第 562-837 行（.prize-flow-dialog）
**现象**: `.ghost-btn`、`.prize-flow-dialog`、`.prize-flow`、`.pf-hero`、`.pf-balls` 等样式在 FileCheck.vue 和 MyPicks.vue（或其他组件）里重复定义。这是全局样式，应该统一抽到 `src/assets/global.css`。

---

### 8. 走势图表头/首列 sticky 层级注释提到"原选择器永不匹配"

**文件**: `src/components/TrendChart.vue` 第 313-321 行
**现象**: 注释 "修复：表头 sticky 层级（原 .thead .col-issue 选择器永不匹配导致错位）"。说明之前有 bug，现在虽然改好了，但注释留着挺好，建议在 CHANGELOG 里也加一条。

---

### 9. 设置页"当前彩种"描述与页面不联动

**文件**: `src/components/SettingsView.vue` 第 29-35 行
**现象**: 设置页的"当前彩种"区块显示的是 `cfg.name`，但它读取的是 `props.game`（LotteryBoard 传入的当前彩种）。如果用户在 App 顶部切换彩种再进入设置页，这里的值会更新，但描述文案"顶栏切换双色球 / 大乐透，各自数据独立缓存"是固定的，没体现"当前"这一含义。可以改成"当前彩种缓存位置：`%APPDATA%/lottery-picker/lottery-data/{game}.json`" 这种更有用的信息。

---

### 10. HistoryTable 表格无列排序、无导出

**文件**: `src/components/HistoryTable.vue`
**现象**: 只有期号搜索框，缺少按一等奖单注、一等奖注数排序的能力。也缺少"导出为 CSV"按钮。ECharts 的 chart.getDataURL() 可以导出图片，但 el-table 本身需要手动拼 CSV。

---

### 11. 每日弹窗标题 "RATIONAL LOTTERY NOTICE" 全大写

**文件**: `src/App.vue` 第 70 行
**现象**: 小标题 `RATIONAL LOTTERY NOTICE` 全大写字母间距很大，审美上可以改成 `Rational Lottery Notice`，或者改成中文版 `理性购彩提示`，保持与中文主标题呼应。

---

### 12. 顶栏数据状态显示过长

**文件**: `src/App.vue` 第 216 行
**现象**: `statusText` 在刷新后显示完整描述 "双色球 100 期 · 2026-09-01 07:30 · 官方接口"，顶栏宽度有限时容易挤压右侧按钮组。可以把状态做成 tooltip，默认只显示短版本 "双色球 · 2026-09-01"，hover 显示详情。

---

## 三、📊 数据层优化（🟡 P1）

### 13. 官方 API 请求无重试、无退避

**文件**: `electron/data-fetcher.js` 第 10-42 行（requestJson）
**现象**: HTTP 请求超时 20s 后直接报错，没有重试逻辑。网络抖动时会出现"上次抓取成功 → 这次失败 → 用缓存兜底"的情况。可以加一个简单的指数退避重试（最多 2-3 次，间隔 1s / 2s / 4s）。

---

### 14. 体彩接口 isVerify=1 参数含义不明

**文件**: `electron/data-fetcher.js` 第 192、205、220、234 行
**现象**: 所有体彩接口都带 `&isVerify=1`，没有注释说明这个参数的作用。如果官方哪天去掉这个参数或者改名，所有体彩接口都会挂。建议在每个体彩抓取函数上方加注释说明 `isVerify=1` 的含义（可能是"开启签名验证"或"返回验证结果"），并在请求失败时尝试 `isVerify=0` 作为兜底。

---

### 15. 缓存无清理机制

**文件**: `electron/data-store.js` 全文件
**现象**: 缓存文件写入后永远不会被清理。用户数据目录里的 `lottery-data/ssq.json`、`dlt.json` 等会一直堆积。版本升级时可以考虑在首次启动时清理超过 N 天的旧缓存，或者提供一个"清除缓存"按钮在设置页。

---

### 16. data-fetcher.js 无 User-Agent 轮换，长期可能被风控

**文件**: `electron/data-fetcher.js` 第 7-8 行
**现象**: UA 是固定字符串 `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...`。虽然目前是直连 JSON 接口不是爬 HTML，但如果接口加了风控，固定 UA 更容易被拦截。可以在若干个常见 UA 之间随机切换。

---

### 17. 快乐8 官方奖池数据不完整，PoolView 可能显示异常

**文件**: `electron/data-fetcher.js` 第 134-141 行（fetchKL8）
**现象**: parseCwlRows 里 `pool: r.poolmoney ? Number(r.poolmoney) : null`。查福彩官方快8接口是否返回 poolmoney 字段？如果不返回，快乐8奖池视图会显示全空。需要确认并在 PoolView 里对 pool=null 做降级提示。

---

## 四、⚡ 性能 & 构建 & 安全（🟡 P1）

### 18. Electron sandbox: false —— 安全降级

**文件**: `electron/main.js` 第 48 行
**现象**: `sandbox: false` + `contextIsolation: true`。contextIsolation 已经开启是好的，但 sandbox 关闭意味着渲染进程 Node 原生模块如果被意外引入会直接有完整 Node 权限。

**修复建议**: 尝试开启 `sandbox: true`，如果导致某些功能（比如 GPU.js / tesseract.js 的 WASM 加载）失败，就在 preload 里显式列出需要的 Node API 并保持 sandbox 关闭，但注释清楚原因。

---

### 19. ECharts + Element Plus 全量引入 —— 包体过大

**文件**: `src/utils/echarts-setup.js` 第 1 行 + `src/main.js` 第 2-3 行
**现象**:
- `import * as echarts from 'echarts'` —— ECharts 全量打包约 900KB+
- `import ElementPlus from 'element-plus'` —— Element Plus 全量打包也接近 1MB+
- 打包后 `dist/assets/index-*.js` 估计 2-3MB

**修复建议**:
1. ECharts 按需引入：只注册用到的图表类型（bar、line、pie、map、scatter），打包体积能降一半
2. Element Plus 按需引入：用 `unplugin-vue-components` + `unplugin-auto-import` 按需自动引入用到的组件
3. 地图 GeoJSON（`src/assets/china.json`）如果不用 ECharts map 可以换成 ECharts registerMap 按需注册

---

### 20. OCR WASM 文件重复拷贝（dist + public）

**文件**: `public/ocr/` + `dist/ocr/`（build 后）
**现象**: `public/ocr/` 目录下约 4MB（tesseract-core-simd-lstm.wasm 最大）。Vite 打包后会把 public 目录原封不动复制到 dist。但 tesseract.js 的 createWorker 里已经指定了 `workerPath` / `corePath` / `langPath` 都从 public/ocr/ 加载。这部分没问题，但可以考虑把 OCR 做成懒加载（只有用户点击"上传图片识别"时才初始化 worker），减少首屏内存占用。

---

### 21. GPU.js + tesseract.js + Element Plus —— 依赖更新不及时

**文件**: `package.json`
**现象**:
- Element Plus: `^2.7.0` —— 当前最新 2.8.x，有 bugfix
- tesseract.js: `^7.0.0` —— 7.x 还在快速迭代
- Electron: `^31.0.0` —— 32/33/34 已经发布，有安全修复
- vitest: `^4.1.11` —— 已不在 package-lock.json 最新列表里

**修复**: 跑一次 `npm outdated` 看看哪些有更新，Electron 和 Electron-builder 的版本要配对升级。

---

### 22. 无 GitHub Actions —— 每次发版手动打包

**建议**: 添加 `.github/workflows/build.yml`，每次打 tag 自动在 Windows runner 上执行 `npm ci && npm run dist`，并把 `release/*.exe` 和 `release/*.zip` 作为 GitHub Release 资产上传。

---

## 五、✨ 值得做的新功能（🟢 P2）

### 23. 走势图开奖号码高亮 —— 当前期红球/蓝球加红圈

**文件**: `src/components/TrendChart.vue`
**建议**: 在每一行的"开奖号码"格子里，除了画红色实心球，还可以给最新一期（`isLatest`）的红球/蓝球加一个粗边框或发光效果，让用户一眼看到当前期开了什么。

---

### 24. 走势图 / 分布图导出为 PNG

**文件**: `src/components/TrendChart.vue` + DistributionChart / PrizeMap
**建议**: ECharts 实例有 `chart.getDataURL({ type: 'png', pixelRatio: 2 })`，走势图用 HTML 表格但可以用 html2canvas 或 dom-to-image 截图。每张图右上角加一个"📷 导出"按钮。

---

### 25. 自选号 / 追号计划 / ChasePlan 导出 CSV

**建议**: 所有表格数据（history、mypicks、追号回测结果、复式拆票结果）都加一个"导出 CSV"按钮，方便用户在 Excel 里做二次分析。

---

### 26. 多窗口模式 —— 同时看双色球 + 大乐透

**现状**: LotteryBoard 是单实例，顶部按钮组切换彩种。
**建议**: 支持"横向分屏"或"新窗口打开"，两个彩种并排对比。Electron 可以 `new BrowserWindow()` 创建子窗口，IPC 同步数据。

---

### 27. 中奖声音提示

**文件**: `src/components/AiPicker.vue` / FileCheck.vue / MyPicks.vue
**建议**: 中大奖（一/二等奖）时弹出兑奖弹窗的同时播放一段短促的中奖音效（可选开关，默认开启）。使用 `<audio>` 标签 + 内置 base64 音频资源，避免外部文件依赖。

---

### 28. OCR 增加中文彩票字体识别

**文件**: `src/components/FileCheck.vue`
**现象**: 当前 tesseract.js 用的是 `'eng'`（英文模型），对中文彩票上的号码（虽然是阿拉伯数字）识别还行，但如果彩票上有其他干扰文字，效果不佳。
**建议**: 可以尝试训练专门的彩票号码识别模型，或者用中文模型 `chi_sim` + 英文模型组合，提高准确率。

---

### 29. 快捷键支持

**建议**: Electron 主进程注册全局快捷键（或在渲染层用 `keymaster.js`）：
- `Ctrl + 1` / `Ctrl + 2` / `Ctrl + 3` ... 切换彩种
- `Ctrl + R` 刷新数据
- `Ctrl + ,` 打开设置
- `F5` 等同于刷新
- `Ctrl + S` 在 AI 选号里保存当前推荐

---

### 30. 开奖倒计时独立小窗 / 系统托盘

**建议**: Electron 可以做系统托盘（Tray API），右键菜单显示各彩种下次开奖倒计时，点击恢复主窗口。开奖前 5 分钟托盘图标闪烁 + 气泡通知。

---

### 31. 走势图"买定离手"标记 —— 标记已购注

**建议**: 在走势图里让用户标记自己买的号码，开奖后自动高亮命中情况（比如命中的格子变绿 + 中奖金额）。这是个让用户"有参与感"的功能。

---

### 32. GitHub README 加入截图 / GIF 预览

**建议**: README 里放 3-5 张界面截图（深色主题 + 走势图 + 中奖地图 + AI 选号 + 设置页），让第一次看仓库的人立刻知道这是什么软件。

---

## 六、📝 代码规范 & 工程化（🟢 P2）

### 33. 项目目录里仍有 views/SSQView.vue、DLTView.vue 未使用

**文件**: `src/views/SSQView.vue`、`src/views/DLTView.vue`
**现象**: 两个文件存在但没有任何地方 import。所有彩种都用 LotteryBoard 统一面板渲染，这两个是早期版本遗留的单彩种专用视图，可以删掉。

---

### 34. vite.config.js 的 chunkSizeWarningLimit 设成了 2000

**文件**: `vite.config.js` 第 10 行
**现象**: `chunkSizeWarningLimit: 2000`（2MB），这个数值本身不算"不合理"，但加这个配置应该是为了压制大 chunk 警告。**更好的做法是配 splitManualChunks**，把 echarts / element-plus / gpu.js / tesseract.js 各拆一个 chunk，这样首屏只加载必要代码，其他懒加载。

---

### 35. 没有 Prettier / ESLint 配置

**建议**: 加 `.prettierrc` + `.eslintrc.cjs`（`eslint-plugin-vue` + `@typescript-eslint` 如果将来转 TS），配合 husky + lint-staged 做 pre-commit 检查。虽然当前代码风格看起来不错（空格、引号都统一），但统一配置能防止后续混乱。

---

### 36. vitest 测试覆盖范围 —— 主进程 data-fetcher / data-store 无测试

**文件**: `tests/` 目录
**现象**: 测试文件有 picker-engine、prize-check、consistency_check 等，但 Electron 主进程的 data-fetcher、data-store 完全没有单元测试。主进程逻辑同样重要，尤其是 parseCwlRows / parseSportteryRows 这些函数，如果官方接口字段变了但没人发现，会影响所有彩种数据。

**建议**: 把 data-fetcher.js 里的纯函数（parseCwlRows、parseSportteryRows、parseProvinceContent、normalizeProvince、requestJson 里的 JSON 解析部分）拆出来放到 `electron/utils/` 并写单元测试。

---

## 七、📊 按影响面排序的 TOP 10 优先修复清单

| # | 问题 | 类别 | 影响 | 改动量 |
|---|------|------|------|--------|
| 1 | 七乐彩兑奖特别号不参与判定 | Bug | 所有七乐彩二等奖 / 四等奖 / 七等奖用户永远中不了 | 中（新增 checkPrizeQLC） |
| 2 | 冷热号阈值硬编码 → game-config 参数化 | Bug | 快乐8/3D 的冷热判断完全错位 | 小 |
| 3 | 走势图直位 DOM 爆炸 | 性能 | 7星彩走势图滚动卡顿 | 中（虚拟滚动或分位） |
| 4 | Electron sandbox: false 安全降级 | 安全 | 潜在渲染进程逃逸风险 | 小 |
| 5 | 全量引入 ECharts + Element Plus | 性能 | 包体 2-3MB，首屏加载慢 | 中（按需引入） |
| 6 | 全局样式重复 → 抽到 global.css | 代码质量 | 维护困难，改一处要改多处 | 小 |
| 7 | 走势图 / 分布图导出 PNG | 功能 | 用户核心诉求 | 小 |
| 8 | HTTP 无重试 + 无退避 | 数据稳定性 | 网络抖动时容易"刷新失败" | 小 |
| 9 | 清理遗留 views/SSQView.vue + DLTView.vue | 代码质量 | 仓库有冗余文件 | 小 |
| 10 | 添加 GitHub Actions 自动构建 | 工程化 | 每次发版手动打包容易出错 | 小 |

---

## 八、🧭 分阶段落地建议

| 阶段 | 目标 | 预计工时 |
|------|------|----------|
| **v1.7.1 热修复** | #1 七乐彩兑奖 + #2 阈值参数化 + #6 全局样式合并 + #8 HTTP 重试 | 1-2 天 |
| **v1.8.0 性能 + 安全** | #3 走势图虚拟滚动 + #4 sandbox + #5 按需引入 + #9 清理冗余 | 2-3 天 |
| **v1.9.0 功能体验** | #7 导出 PNG + 走势图开奖高亮 + 快捷键 + 中奖音效 | 3-5 天 |
| **v2.0.0 大版本** | 多窗口 / 分屏 + 系统托盘 + OCR 升级 + CI/CD 全量覆盖 | 1-2 周 |

> 💡 以上工时基于**边写边验证**的节奏，实际落地请先做一个问题、跑一个小测试、确认没问题再进下一个。建议从 v1.7.1 热修复开始，一个一个解决，每完成一批发一个小版本。
