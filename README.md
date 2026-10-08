# Pin

Pin 是一个面向 Windows 的常驻桌面组件工具。它把便签、待办和常用文本整理成可以自由摆放的独立小窗口，所有内容保存在本地 SQLite 数据库中，重启应用后仍会恢复。

项目采用硬线框视觉风格：无边框窗口、直角布局、清晰描边和实心阴影。内容窗口可以独立使用，也可以在 DESK（三合一）窗口中通过标签页集中管理。

## 功能

- **NOTE**：多行便签，输入后自动保存。
- **TODO**：支持多行文本、Enter 新增、Shift + Enter 换行、完成分组、拖拽排序、双击编辑和删除后 5 秒撤销。
- **CLIP**：手动维护的快速复制文本。点击条目即可写入系统剪贴板；同一窗口内去重，最多保存 20 条，并支持排序、编辑和撤销删除。应用不会监听或收集系统剪贴板历史。
- **DESK**：在同一个窗口中组合 NOTE、TODO、CLIP 三种内容，每个 DESK 的内容和当前标签页独立保存。
- **WIDGETS**：查看、筛选、创建、重命名、置顶、隐藏和删除组件；删除窗口前确认，并提供撤销。
- **SETTINGS**：设置默认透明度、置顶、开机自启、边缘吸附、字体大小、文本行数和悬停全文等行为。列表滚动条统一为悬浮显示并匹配当前窗口配色；管理、设置和配色界面跟随默认配色。
- **COLORS**：提供经典黄、牛皮纸、蓝图和草绿四个只读内置套装。自定义套装支持背景色、强调色、文字色的取色和命名，取色时实时预览窗口配色，在内容区保存后正式应用，返回或关闭时撤销未保存的预览；支持编辑自定义套装、单个窗口配色和窗口跟随默认配色。
- **窗口交互**：无边框拖动、12px 边缘吸附、折叠、缩放、置顶、透明度调节、右键菜单和系统托盘菜单。
- **持久化**：窗口位置、大小、显示器、内容、排序、透明度、颜色和设置均写入本地数据库。

## 技术栈

- Electron Forge + Vite
- React 19 + TypeScript
- SQLite + `better-sqlite3` + Drizzle ORM
- React Hooks（renderer 临时状态）
- `@dnd-kit`（TODO/CLIP 拖拽排序）
- SCSS / SCSS Modules
- Node `node:test` + `tsx`（数据库测试）

主进程独占数据库连接并负责业务状态，renderer 通过 `preload` 和类型化 IPC 访问功能；启用 `contextIsolation`，关闭 `nodeIntegration`。WIDGETS、SETTINGS 和 COLORS 共用一个管理 `BrowserWindow`，通过页面参数在同一窗口内切换；每个内容组件仍是独立的 Electron `BrowserWindow`。

## 开始开发

需要安装 Node.js 和 pnpm。Windows 开发环境建议使用项目锁定的依赖版本。

```bash
pnpm install
pnpm start
```

常用命令：

```bash
pnpm typecheck   # TypeScript 类型检查
pnpm lint        # ESLint 检查
pnpm test:db     # 数据库与 repository 测试
pnpm db:check    # Drizzle migration 检查
pnpm package     # 生成未安装的 Windows 应用目录
pnpm package:check # 用临时数据目录验证打包应用启动和基础配色流程（Node.js 22+）
pnpm make        # 生成可分发安装包
```

`pnpm package` 的产物位于 `out/Pin-win32-x64`。首次启动且没有组件时会显示引导窗口，可选择创建 NOTE、TODO、CLIP 或 DESK。

## 数据存储

生产环境数据库位于 Electron `userData` 目录：

```text
%APPDATA%\Pin\desk-widgets.sqlite
```

数据库包含以下表：

- `settings`：全局设置（单例行）
- `widgets`：窗口类型、标题、位置、尺寸、状态、正文和最终颜色
- `todos`：TODO 条目及其完成状态和排序
- `clip_items`：CLIP 条目及其排序
- `custom_kits`：自定义配色套装

删除窗口时，关联的 TODO 和 CLIP 条目会通过外键级联删除。应用内的 5 秒撤销状态只在当前运行期间有效，重启后不会恢复临时撤销记录。

## 项目结构

```text
src/
  main.ts                         Electron 启动、模块组装与退出协调
  preload.ts                      安全的 contextBridge API
  renderer.tsx                    React 挂载入口
  renderer/App.tsx                窗口角色与页面选择
  renderer/pages/                管理、设置、配色和引导页面
  renderer/widgets/              NOTE、TODO、CLIP、DESK 组件窗口
  renderer/components/           公共控件与窗口交互
  renderer/hooks/                窗口状态与交互 Hooks
  renderer/colors/               配色预览与样式映射
  main/window-manager.ts          独立窗口生命周期与系统窗口行为
  main/ipc/                       按职责分组的 IPC 注册与参数验证
  main/tray.ts                    系统托盘菜单
  main/database/                  schema、migration、repository 和 service
  shared/colors.ts                配色套装与派生颜色
  shared/types.ts                 跨进程数据结构
  shared/pin-api.ts               preload API 契约
  styles/global.scss              全局样式和设计 token
drizzle/                          SQLite migration
docs/                             技术方案、视觉规范和交互原型
tests/                            数据库测试
```

## 文档

- [技术方案与完成步骤](docs/technical-plan.md)：产品决定、数据库设计、架构约束、实现阶段和验收记录。
- [项目清理与模块化重构计划](docs/refactoring-plan.md)：分阶段任务、目录方案和验证记录。
- [视觉与交互规范](docs/design_handoff_desk_widgets/README.md)：设计 token、窗口尺寸、交互规则和原型说明。
- `docs/design_handoff_desk_widgets/Desk Widgets Prototype.dc.html`：可交互视觉原型，可直接在浏览器打开。
- `docs/design_handoff_desk_widgets/Desktop Widgets Styles.dc.html`：静态视觉规范画布。

当前主要功能已经落地；多显示器、DPI 变化和最终发布回归仍在后续验证范围内，具体进度以技术方案文档中的阶段记录为准。

## 许可证

MIT
