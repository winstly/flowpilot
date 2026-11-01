# FlowPilot

Agent 工作流工作室 — 用于编排、运行与复盘 Agent 工作流的前端原型（Vite + React + Tailwind CSS）。

## 快速开始

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
npm run preview
```

## 桌面端（Electron）

```bash
npm run dev:desktop    # Vite 开发服 + 桌面壳
npm run build:desktop  # 构建产物 + 以桌面模式启动
```

无原生标题栏与菜单（frame: false），自绘 32px 标题条带窗口控制钮；
Web 构建不受影响（标题条仅在 `window.desktop` 存在时渲染）。

## 目录结构

```
src/
  components/   通用组件（对话框、面板、表单等）
  pages/        页面（任务、市场、洞察、运行/复盘）
  data/         演示数据
  store/        轻量状态管理
```
