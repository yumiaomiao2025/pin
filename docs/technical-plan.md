# Desktop Widgets 技术方案与完成步骤

## 文档目的

这份文档是实现过程中的持续记录，防止产品决定散落在聊天记录中。

约定：

- 本文的“已确认”内容是当前产品决定。
- 用户后续明确做出的决定优先于原型和旧文档。
- docs/design_handoff_desk_widgets/README.md 仍是视觉 token 和未被覆盖的行为基线。
- 设计原型只说明已经演示的部分，不代表没有演示的功能不需要实现。
- 每个阶段完成后先验收，再进入下一阶段。

当前状态：阶段 0、阶段 1、阶段 2.1、阶段 2.2、阶段 2.3、阶段 3.1 和阶段 3.2 的代码实现已完成；窗口外壳、NOTE、基础窗口状态持久化和自定义缩放把手已落地，完整视觉回归仍需人工确认。

## 一、已确认的产品决定

### 产品形态

- 应用是 Windows 常驻桌面工具。
- 窗口类型有四种：NOTE、TODO、CLIP、DESK。
- 每个窗口都是独立的 Electron BrowserWindow。
- 标题栏的 × 只隐藏窗口，不删除数据。
- 删除整个窗口时先弹出确认框；确认后删除窗口及其内容，并提供 5 秒撤销。
- 删除单条 TODO 或 CLIP 时不弹确认框，但提供 5 秒撤销。
- 同一时间只保留最近一次删除的撤销记录。
- 撤销只在当前应用运行期间有效，应用重启后不恢复临时撤销状态。
- 首次启动且没有任何窗口时，显示引导界面，让用户选择创建四种窗口之一。

### NOTE

- 每个 NOTE 窗口拥有自己的多行正文。
- DESK 也拥有自己独立的 NOTE 正文。
- 正文直接保存为窗口的 note_text，不单独建立 notes 表。

### TODO

- TODO 窗口和 DESK 都可以拥有多条待办。
- 待办文本支持换行。
- 输入行：Enter 新增，Shift + Enter 换行。
- 双击待办文字进入编辑：Enter 保存，Shift + Enter 换行，Esc 取消，失焦保存。
- 允许同一窗口出现完全相同的待办文本。
- 勾选后进入底部“已完成”分组；取消勾选时恢复到原来的未完成位置。
- 已完成条目之间保持原有顺序。
- 删除单条待办不确认，删除后可在 5 秒内撤销。

### CLIP

- CLIP 是用户手动维护的快速复制文本，不是系统剪贴板历史。
- 应用不自动监听 Windows 剪贴板，也不自动收集用户复制过的内容。
- 每个独立 CLIP 窗口都有自己的条目；每个 DESK 也有自己的 CLIP 条目。
- 独立 CLIP 窗口可以创建多个。
- 输入行：Enter 新增，Shift + Enter 换行。
- 双击条目进入编辑，编辑规则与 TODO 相同。
- 点击条目时，按原样写入 Windows 系统剪贴板。
- 每个 CLIP 或 DESK 窗口最多 20 条。
- 同一窗口内完全相同的文本不重复新增；不同窗口可以保存相同文本。
- 新增条目放在列表末尾。
- 支持拖拽调整顺序；点击复制不改变顺序。
- 删除单条条目不确认，删除后可在 5 秒内撤销。

### 配色

- 套装本质上是一组可复用的颜色模板，不是窗口的长期引用。
- 用户将套装应用到窗口时，复制颜色结果到窗口自己的颜色字段。
- 修改或删除套装，不影响已经使用过它的窗口。
- 自定义套装支持保存、命名、重命名和删除。
- 窗口单独改色后不再跟随默认颜色。
- follows_default = true 的窗口在默认颜色改变时重新复制默认颜色。
- title_color = NULL 表示标题栏使用窗口底色。
- spine_color = NULL 表示不显示左侧色脊。
- paper_color、ink_color、accent_color、shadow_color 必须有值。
- sub、soft、hatch 等派生色只在运行时计算，不存数据库。

## 二、已确认的技术栈和架构

技术栈：

- Electron Forge + Vite
- React + TypeScript
- pnpm
- SQLite
- better-sqlite3
- Drizzle ORM
- Zustand（按需使用）
- SCSS / SCSS Modules
- Node `node:test` + `tsx`（数据库测试，仅开发依赖）

架构规则：

- 每个 BrowserWindow 独立运行，但所有窗口共用一份 React renderer 入口。
- 通过 role 和 windowId 区分窗口，例如 role=widget&id=...、role=manager、role=settings。
- URL 参数只携带身份信息，不携带业务数据。
- Electron 主进程是数据库和业务状态的唯一来源。
- renderer 通过 preload + contextBridge 使用类型化 IPC，不启用 nodeIntegration。
- renderer 使用 React Hooks 和适量 Zustand 管理界面状态、编辑状态和临时交互状态。
- 不引入 Redux。
- 主进程独占 SQLite 连接，renderer 不直接打开数据库文件。

## 三、数据库设计

数据库文件位置：

    app.getPath('userData')/desk-widgets.sqlite

### settings

全局设置只有一行，采用多列结构，不采用 key/value 表。

    id
    theme
    auto_theme
    default_paper_color
    default_ink_color
    default_title_color
    default_accent_color
    default_spine_color
    default_shadow_color
    scrollbar
    max_lines
    hover_full
    opacity_bar
    default_opacity
    pin_all
    autostart
    snap

### widgets

保存四种窗口的共同信息、窗口正文、窗口状态和窗口自己的最终颜色。

    id
    type              // note | todo | clip | desk
    title
    x
    y
    width
    height
    display_id
    z_index
    pin
    hidden
    collapsed
    opacity
    note_text
    active_tab        // DESK 使用 note | todo | clip
    paper_color
    ink_color
    title_color       // nullable
    accent_color
    spine_color       // nullable
    shadow_color
    follows_default

约束：

- type 只能是四种窗口类型。
- title 不设唯一约束，允许窗口同名。
- opacity 范围为 35～100。
- 窗口最小尺寸由应用限制为 240×160。
- 不保存 kit_id，不保存 parts_json，避免窗口依赖套装引用。

### todos

    id
    widget_id
    text
    done
    sort_order
    created_at
    updated_at

widget_id 关联 widgets.id。删除窗口时级联删除对应待办。

### clip_items

    id
    widget_id
    text
    sort_order
    created_at
    updated_at

widget_id 关联 widgets.id。同一窗口内的完全相同文本不重复。每个 CLIP 或 DESK 窗口最多保留 20 条。

### custom_kits

套装颜色使用 SQLite TEXT 保存十六进制颜色，例如 "#FFE566"；spine 可以为 NULL。

    id
    name
    paper
    ink
    title
    accent
    spine
    shadow
    created_at
    updated_at

窗口和默认设置保存自己的最终颜色，因此 custom_kits 不需要被 widgets 外键引用。

## 四、分阶段完成步骤

### 阶段 0：冻结规格（当前阶段）

- [x] 确定 Electron + React + TypeScript。
- [x] 确定使用 pnpm。
- [x] 确定 SQLite + better-sqlite3 + Drizzle ORM。
- [x] 确定四种窗口类型和独立 BrowserWindow 结构。
- [x] 确定 NOTE、TODO、CLIP、DESK 的内容归属关系。
- [x] 确定 CLIP 是手动维护的快速复制文本，不监听系统剪贴板。
- [x] 确定删除确认、5 秒撤销和最近一次删除规则。
- [x] 确定窗口颜色采用最终值快照，不引用套装。
- [x] 将这些决定写入本文档。

阶段验收：用户确认本文档内容无误后，才开始创建工程。

### 阶段 1：创建最小工程

- [x] 用 pnpm 创建 Electron Forge + Vite + React + TypeScript 工程。
- [x] 建立 main、preload、renderer 的目录边界。
- [x] 创建安全的 contextBridge IPC 示例。
- [x] 创建一个测试 BrowserWindow。
- [x] 接入 SCSS 和基础设计 token。
- [x] 接入 Zustand，但只用于 renderer 临时状态。
- [x] 验证开发启动和 Windows 打包命令。

实际验证结果：

- `pnpm typecheck` 通过。
- `pnpm lint` 通过。
- `pnpm package` 通过，生成 `out/Pin-win32-x64`。
- `pnpm start` 成功进入 Electron Forge 开发进程并完成 Vite 编译；开发进程随后手动结束。
- 开发环境额外打印了 `C:\\nss_ssl_sfagent.log` 的 SSL key log 权限提示，不影响编译和启动。

阶段验收：能启动 Electron，打开独立窗口，renderer 能通过 IPC 向主进程请求并收到响应。

### 阶段 2：数据库基础

- [x] 配置 better-sqlite3 的 Electron 原生模块重建。
- [x] 用 Drizzle 定义五张表和约束。
- [x] 配置迁移脚本。
- [x] 在主进程建立唯一数据库连接。
- [x] 实现 repository/service 层。
- [x] 实现数据库初始化和首次启动默认设置。
- [x] 为窗口、待办、CLIP、配色模板写基础单元测试。

阶段 2.1 实际验证结果：

- 使用固定版本 `better-sqlite3 13.0.3`，使用其自带的 `win32-x64` 预构建二进制，匹配 Electron 44 的 Node 24.19 运行时。
- `AutoUnpackNativesPlugin` 已加入 Forge 配置，`rebuildConfig.ignoreModules` 保留对 `better-sqlite3` 的跳过，避免在没有 Visual Studio C++ 工具链的机器上源码重编译。
- Electron 44 已通过内存数据库创建、插入和读取探针；Node 20 不作为该版本原生模块的直接运行时。
- 当前机器没有 Visual Studio C++ 工具链，因此不依赖本地源码编译；安装包由 Forge 直接携带预构建二进制。

阶段 2.2 实际验证结果：

- `pnpm typecheck` 通过。
- `pnpm lint` 通过。
- `pnpm db:check` 通过，Drizzle migration 文件完整。
- `pnpm package` 通过，生成 `out/Pin-win32-x64`。
- 使用打包后的 `app.asar` 启动 Electron，确认 `AppData/Roaming/Pin/desk-widgets.sqlite` 创建成功。
- 数据库包含 `settings`、`widgets`、`todos`、`clip_items`、`custom_kits` 五张业务表和 `__drizzle_migrations`；首次启动自动写入 `settings.id = 1`，WAL 和外键约束均已启用。

阶段 2.3 实际验证结果：

- 按表拆分 `repositories.ts`，提供窗口、TODO、CLIP、套装和设置的查询、创建、修改、删除及排序接口。
- `app-service.ts` 提供事务入口，并校验 TODO / CLIP 只能归属兼容的窗口类型。
- CLIP repository 处理同窗口精确去重、20 条上限和最旧条目淘汰；窗口删除由外键级联清理内容。
- `test:db` 通过 7 个测试；测试使用临时数据库，真实执行 migration，并验证事务回滚和关闭后重新打开的数据持久化。
- 测试由 Electron Node 24 运行时执行，避免 `better-sqlite3` 的 Node 20 ABI 不兼容。

阶段验收：创建、读取、修改、删除和事务行为可通过测试；重启应用后数据仍存在。

### 阶段 3：窗口外壳和 NOTE

- [x] 实现独立窗口创建、隐藏、恢复、销毁和单实例主进程。
- [x] 实现无边框窗口、自绘标题栏和标题栏拖动。
- [x] 实现位置、尺寸、显示器 ID、z-index 和透明度持久化。
- [x] 实现置顶、折叠、边缘吸附和最小尺寸。
- [x] 实现右下角自定义缩放把手。
- [x] 实现 NOTE 正文输入即保存。
- [x] 实现关闭按钮只隐藏窗口。
- [x] 实现首次启动引导。

阶段验收：只使用一个 NOTE 窗口即可完成创建、移动、缩放、隐藏、恢复、编辑和重启还原。

阶段 3 开始前确认：

- [x] 窗口位置保存为 Windows 虚拟桌面中的绝对屏幕坐标。
- [x] 窗口距离当前显示器边缘 12px 内时硬吸附，无动画；该距离沿用设计交接文档。
- [x] 原显示器消失时，启动或恢复窗口前将其移动到当前主显示器的可见区域。

阶段 3.1 实际验证结果：

- `window-manager.ts` 管理独立 BrowserWindow、单实例窗口映射、隐藏/恢复、置顶、折叠和退出生命周期。
- 窗口使用无边框模式；标题栏通过 Electron `app-region` 拖动，控制按钮使用 `no-drag`。
- 移动和 resize 事件写回绝对坐标、尺寸、所属显示器和展开高度；距离工作区边缘 12px 内硬吸附。
- NOTE renderer 通过 preload IPC 读取正文，并以 250ms 去抖保存到对应 widget。
- 首次无窗口时显示引导，创建四种窗口类型之一；当前仅 NOTE 有完整内容编辑界面，其他类型保留窗口外壳占位。
- `pnpm start` 和 `pnpm package` 均完成主进程、preload、renderer 编译；生产 `app.asar` 启动后可创建数据库和引导窗口。

阶段 3.2 实际验证结果：

- renderer 在展开的 NOTE、TODO、CLIP 和 DESK 外壳右下角显示 18x18 自定义缩放把手；折叠后隐藏。
- 缩放把手使用 Pointer Events 记录屏幕坐标和起始窗口尺寸，通过 `window:set-size` IPC 调整宽高；主进程继续负责最小尺寸和显示器工作区限制。
- 窗口尺寸与位置写入使用 100ms 去抖；退出前会 flush 待写入窗口的当前边界，避免最后一次拖动丢失。
- `pnpm typecheck` 通过。
- `pnpm lint` 通过。
- 完整的人工拖动、折叠、隐藏、重启视觉回归仍需在真实桌面窗口中确认；当前环境的 Computer Use native pipe 不可用，无法自动截图。

### 阶段 4：TODO

- [x] 实现待办读取、新增、双击编辑、完成/取消完成和单条删除。
- [x] 实现 Enter / Shift + Enter，兼容中文输入法组合状态。
- [x] 实现完成分组和原始顺序恢复。
- [ ] 实现拖拽排序和 sort_order 持久化。
- [ ] 实现 5 秒撤销，并限制为最近一次删除。
- [ ] 按设计实现截断、悬停全文和三种滚动条模式。
- [ ] 按规范实现完成动效和无弹性过渡。

阶段验收：TODO 窗口和 DESK 的 TODO 内容互不影响，重启后顺序和状态保持。

阶段 4.1 实际验证结果：

- 主进程新增 `todo:list`、`todo:create`、`todo:update` 和 `todo:delete` IPC；更新和删除会校验条目属于当前窗口。
- TODO renderer 已支持未完成/已完成分组、勾选切换、双击编辑、Enter 保存、Shift + Enter 换行、Esc 取消、失焦保存和底部新增输入。
- 新增与编辑输入会忽略纯空白内容；输入法组合期间不会误触发 Enter 提交。
- TODO 与已有 NOTE 共用标题栏、透明度条、折叠和缩放把手。
- `pnpm typecheck`、`pnpm lint`、`pnpm test:db`（7/7）、`pnpm package` 通过。
- 拖拽排序、完成动效、悬停全文、滚动条模式和 5 秒撤销留在阶段 4.2。

### 阶段 5：CLIP

- [ ] 实现每个 CLIP / DESK 的独立快速复制文本。
- [ ] 实现新增、双击编辑、多行输入、拖拽排序和删除撤销。
- [ ] 实现同窗口重复文本校验。
- [ ] 实现每窗口 20 条上限和最旧条目淘汰。
- [ ] 实现点击写入 Windows 系统剪贴板。

阶段验收：多个 CLIP 窗口之间数据互不影响，点击复制不改变顺序。

### 阶段 6：DESK 三合一

- [ ] 实现 NOTE / TODO / CLIP 标签页。
- [ ] 保存每个 DESK 的当前标签页。
- [ ] 确保 DESK 的三类内容均属于 DESK 自己，不读取其他窗口内容。
- [ ] 复用已经验收过的 NOTE、TODO、CLIP 组件。

阶段验收：切换标签页不丢失内容，重启后恢复上次标签页。

### 阶段 7：WIDGETS、SETTINGS、COLORS 和右键菜单

- [ ] 实现 WIDGETS 管理器的显隐、置顶、重命名、新建和删除。
- [ ] 实现删除确认框和撤销提示。
- [ ] 实现 SETTINGS 全局设置。
- [ ] 实现默认颜色编辑和“应用到全部”。
- [ ] 实现窗口颜色编辑、主色同步和五个部位独立修改。
- [ ] 实现自定义套装保存、重命名和删除。
- [ ] 验证套装修改/删除不会改变已有窗口颜色。
- [ ] 实现窗口右键菜单和菜单内透明度控制。

阶段验收：默认设置、单窗口覆盖和套装快照三种颜色行为互不混淆。

阶段 7 开始前确认：

- [待确认] 管理器中的拖拽排序只调整窗口列表顺序，还是同时调整 z-index。
- [待确认] 自定义套装保存时的命名弹窗和颜色列表操作细节。
- [待确认] 自动主题跟随对管理型窗口和内容型窗口的具体作用范围。
- [待确认] 删除确认框的最终文案和按钮文案。

### 阶段 8：Windows 系统能力和发布

- [ ] 实现系统托盘右键菜单。
- [ ] 实现开机自启。
- [ ] 处理多显示器消失、分辨率变化和 DPI 变化。
- [ ] 处理显示桌面和全屏应用让位。
- [ ] 处理系统主题切换和 AUTO 模式。
- [ ] 补充安装包、升级、崩溃恢复和数据库迁移策略。
- [ ] 在单屏、双屏、100/125/150/200% DPI 下回归测试。

阶段验收：安装包可在目标 Windows 环境安装、启动、退出和升级，数据不丢失。

阶段 8 开始前确认：

- [待确认] 全屏应用和“显示桌面”时的让位、隐藏和恢复策略。

## 五、当前下一步

阶段 4.1 已完成代码实现。下一步是人工确认 TODO 的新增、编辑、完成切换、删除、Enter/Shift + Enter 和重启还原；确认后进入阶段 4.2 拖拽排序与 5 秒撤销。
