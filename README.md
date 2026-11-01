# FlowPilot

Agent 工作流工作室 — 用于编排、运行与复盘 Agent 工作流的桌面应用（Electron + Vite + React）。

## 快速开始

```bash
npm install
npm run dev     # Vite 开发服 + 桌面壳（热更新）
```

## 构建与运行

```bash
npm run build   # 构建渲染层（dist/）
npm start       # 以桌面模式启动（加载 dist/）
```

## 目录结构

```
electron/       桌面壳（主进程 + preload 桥）
src/
  components/   通用组件（标题条、对话框、面板、表单等）
  pages/        页面（任务、市场、洞察、运行/复盘）
  data/         演示数据
  store/        轻量状态管理
```

## 桌面壳说明

- 无原生标题栏与菜单（`frame: false` + 菜单置空）：自绘 32px 标题条，窗口控制钮
  为内联 SVG caption 字形，关闭 hover 用 Windows 原生红
- 标题条整条可拖拽（含双击最大化）；边缘拉伸、Win+方向键贴靠、Alt+F4 均保留
- preload 只暴露最小窗口 API（最小化/最大化/关闭/状态订阅），`contextIsolation` + `sandbox` 开启
- 外部链接走系统浏览器

## 验收截图钩子

```bash
SNAPSHOT=path.png npx electron .                          # 启动后截整窗并退出
SNAPSHOT=path.png SNAPSHOT_ROUTE=tasks/T-100/run npx electron .   # 先跳路由再截
```
