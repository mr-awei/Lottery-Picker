# 彩票选号器 · Lottery Picker

Windows 桌面端彩票选号工具，基于 **Electron + Vue3 + Vite**。完全免费、离线可用，提供往期开奖查询、分布统计、中奖地图、AI 选号、兑奖核对等一体化体验。

> ⚠️ **理性购彩提示**：彩票开奖为独立随机事件，本软件所有选号、评分、统计与推荐均不提高中奖概率，仅供娱乐参考。本软件完全免费，不含任何内购、广告与付费功能。

---

## ✨ 功能特性

### 🎰 支持彩种（共 8 种）

| 分类 | 彩种 | 玩法模型 | 开奖频率 |
|------|------|----------|----------|
| 福彩 | 双色球 / 七乐彩 / 快乐8 / 福彩3D | 乐透型 / 直位型 | 每周 / 每日 |
| 体彩 | 大乐透 / 排列3 / 排列5 / 7星彩 | 乐透型 / 直位型 | 每周 / 每日 |

### 📊 核心功能

- **往期开奖** — 自动拉取近 100 期官方开奖数据，离线缓存
- **分布图** — 号码频次 / 遗漏 / 奇偶大小 / 区间占比 / 和值走势（ECharts 渲染）
- **中奖省份地图** — 一等奖中奖分布热力图（中国地图），条形图切换
- **冷热号看板** — 近 N 期号码出现频率与遗漏值
- **AI 选号引擎** — 基于统计规则的本地选号，支持：
  - 单注 / 多注 / 复式 / 胆拖 / 定位选号
  - 冷热加权、区间均衡、奇偶均衡、和值区间、连号限量
  - **GPU 加速**：WebGPU → GPU.js → Worker → CPU 逐级降级，批量生成海量候选组合
- **兑奖核对** — 输入自选号码即可核对近 N 期历史中奖情况
- **奖池 / 销量展示** — 每期奖池金额、销售额、头奖注数与单注奖金
- **自动刷新** — 距开奖 30 分钟内每分钟自动更新，其余时段 30 分钟轮询
- **深色 / 浅色主题** — 一键切换，记忆用户偏好
- **每日理性购彩弹窗** — 内置免费声明与购彩提醒

### 🧠 技术亮点

- **Electron 主进程抓数据** — 绕开 CORS 与反爬限制，数据源稳定
- **本地 JSON 缓存** — 缓存在 `%APPDATA%/lottery-picker/lottery-data/`，支持缓存失效回退
- **GPU 加速批量评分** — 利用 GPU 并行计算对海量候选组合打分，提升选号质量
- **OCR 号码识别** — 可选的图片识别功能（tesseract.js），方便从截图提取号码
- **Tesseract.js OCR** — 内置字体识别模型文件（位于 `public/ocr/`）

---

## 🛠 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 桌面框架 | Electron | ^31 |
| 前端框架 | Vue 3 | ^3.4 |
| 构建工具 | Vite | ^5.2 |
| UI 组件库 | Element Plus | ^2.7 |
| 图表 | ECharts | ^5.5 |
| GPU 计算 | gpu.js | ^2.24 |
| OCR | tesseract.js | ^7.0 |
| 打包 | electron-builder | ^24.13 |
| 测试 | Vitest | ^4.1 |

---

## 📁 项目结构

```
lottery-picker/
├── electron/                     # Electron 主进程
│   ├── main.js                   # 窗口创建、生命周期、IPC 注册
│   ├── preload.js                # contextBridge 安全暴露 IPC 接口
│   ├── data-fetcher.js           # 官方 API 抓取（福彩/体彩官网）
│   └── data-store.js             # 本地 JSON 缓存读写
├── src/                          # 渲染进程（Vue3）
│   ├── main.js                   # Vue 应用入口
│   ├── App.vue                   # 主界面：彩种切换 + 状态栏 + 每日提示
│   ├── components/
│   │   ├── LotteryBoard.vue      # 统一的彩种面板容器
│   │   ├── AiPicker.vue          # AI 选号面板（单注/多注/复式/胆拖）
│   │   ├── DistributionChart.vue # 号码分布图
│   │   ├── PrizeMap.vue          # 中奖省份地图
│   │   ├── HistoryTable.vue      # 往期开奖表格
│   │   ├── HotColdBoard.vue      # 冷热号看板
│   │   ├── TrendChart.vue        # 走势图
│   │   ├── MatrixView.vue        # 号码矩阵视图
│   │   ├── ChasePlan.vue         # 追号计划
│   │   ├── PoolView.vue          # 奖池视图
│   │   ├── MyPicks.vue           # 我的自选
│   │   ├── SplitTool.vue         # 分解工具
│   │   ├── FileCheck.vue         # 图片识别兑奖
│   │   ├── KnowledgeView.vue     # 玩法知识
│   │   ├── MaxPrizeCard.vue      # 头奖卡片
│   │   └── SettingsView.vue      # 设置（GPU、主题等）
│   ├── utils/
│   │   ├── game-config.js        # 8 种彩种参数化配置
│   │   ├── picker-engine.js      # 选号引擎（本地统计 + GPU 批量）
│   │   ├── gpu-engine.js         # GPU 加速层
│   │   ├── gpu-worker.js         # Worker 降级方案
│   │   ├── prize-check.js        # 中奖判定 / 奖金计算
│   │   ├── map-data.js           # 中奖省份聚合
│   │   ├── echarts-setup.js      # ECharts 按需注册
│   │   ├── ui-state.js           # 主题与 UI 状态
│   │   └── version.js            # 版本信息
│   ├── assets/
│   │   ├── china.json            # 中国地图 GeoJSON
│   │   └── global.css            # 全局样式
│   └── views/
│       ├── SSQView.vue           # 双色球视图（基础模板）
│       └── DLTView.vue           # 大乐透视图（基础模板）
├── public/
│   └── ocr/                      # Tesseract OCR 模型文件
├── build/
│   ├── icon.ico                  # 安装程序图标
│   └── icon.png
├── tests/                        # Vitest 单元测试
├── vite.config.js                # Vite 配置（base: ./ 适合 Electron）
├── vitest.config.mjs
└── package.json
```

---

## 🚀 快速开始

### 环境要求

- Node.js **≥ 18**
- Windows 10 / 11（仅打包 Windows 安装程序）

### 安装与开发

```bash
# 1. 安装依赖
npm install

# 2. 启动 Vite 开发服务器（http://localhost:5173）
npm run dev

# 3. 启动 Electron（需要先在另一个终端运行 dev）
npm start
```

或者一步到位（需要自行配置 concurrently）：

```bash
npm run dev   # 终端 1
npm start     # 终端 2
```

### 构建生产版本

```bash
# 仅构建前端（Vite build）
npm run build

# 构建前端 + Electron 打包 Windows 安装程序（NSIS + zip）
npm run dist
```

打包产物位于 `release/` 目录：
- `release/彩票选号器 Setup 1.7.0.exe` — NSIS 安装程序
- `release/彩票选号器-1.7.0-win.zip` — 绿色免安装版

### 仅抓取数据（CLI）

```bash
# 抓取双色球近 100 期，结果输出到终端
node electron/data-fetcher.js --game=ssq --count=100

# 抓取大乐透并保存为 JSON 文件
node electron/data-fetcher.js --game=dlt --count=100 --out=./data/dlt.json

# 支持的 game 值：ssq, dlt, qlc, kl8, fc3d, pl3, pl5, qxc
```

### 运行测试

```bash
npm test
```

---

## 🌐 数据源

| 彩种 | 数据源 | 接口 |
|------|--------|------|
| 双色球 / 七乐彩 / 快乐8 / 福彩3D | 中国福利彩票官网 `cwl.gov.cn` | 福彩 JSON 接口 |
| 大乐透 / 排列3 / 排列5 / 7星彩 | 中国体育彩票官网 `sporttery.cn` | 体彩 webapi 接口 |

数据缓存路径：`%APPDATA%/lottery-picker/lottery-data/{game}.json`

---

## 🧪 GPU 加速机制

选号引擎的批量评分部分支持多级降级：

```
WebGPU (Chromium compute shader)
    ↓ 不可用
gpu.js (WebGL)
    ↓ 不可用
Web Worker
    ↓ 不可用
CPU (主线程，较慢但最兼容)
```

启动时 Electron 会通过 `app.commandLine.appendSwitch('enable-unsafe-webgpu')` 开启 WebGPU 支持。用户可在「设置 → GPU」中手动选择显卡（核显 / 独显）。

---

## 📜 关于"AI 选号"

本软件所谓的"AI 选号"**并非机器学习或神经网络**，而是基于以下统计规则的启发式组合生成器：

1. **冷热号加权** — 近 N 期出现频率高的号码入选概率更大
2. **区间均衡** — 号码在三个区间内的分布尽量符合历史均值
3. **奇偶均衡** — 控制奇偶比在常见范围内
4. **和值约束** — 和值落在历史高频区间
5. **连号限量** — 避免过多连号
6. **遗漏考虑** — 遗漏值过大的号码有一定补偿权重

彩票为独立随机事件，任何历史统计都无法预测未来。选号结果仅用于**减少用户自行组合的重复劳动**，绝不承诺提高中奖概率。

---

## ⚖️ License

[MIT](./LICENSE) © Marvis

---

## ❤️ 致谢

- [Electron](https://www.electronjs.org/) — 让桌面应用开发变得简单
- [Vue.js](https://vuejs.org/) — 渐进式前端框架
- [ECharts](https://echarts.apache.org/) — 强大的数据可视化库
- [Element Plus](https://element-plus.org/) — Vue 3 组件库
- [gpu.js](https://gpu.rocks/) — 在浏览器中使用 GPU 并行计算
- [tesseract.js](https://tesseract.projectnaptha.com/) — JS OCR 引擎
- [Vite](https://vitejs.dev/) — 极速构建工具

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request。在提交前请先运行测试：

```bash
npm test
```

### 开发规范

- Vue 组件使用 `<script setup>` 语法
- JavaScript 模块使用 ES Module（Vite 渲染进程）/ CommonJS（Electron 主进程）
- 新增彩种只需在 `src/utils/game-config.js` 添加配置 + `electron/data-fetcher.js` 注册抓取函数
- 测试文件放在 `tests/` 目录，使用 Vitest

---

## 📝 更新日志

### v1.7.0
- 新增 GPU 加速批量选号（WebGPU → GPU.js → Worker → CPU 逐级降级）
- 新增中奖省份地图视图切换（地图 / 条形图）
- 新增设置页面（GPU 显卡选择、自动刷新开关）
- 内置 OCR 图片识别功能（tesseract.js）
- 支持 8 种彩种统一参数化配置
- 深色 / 浅色主题切换

### v1.0.0（初始版本）
- 双色球 + 大乐透基础功能
- 往期开奖、分布图、AI 选号
