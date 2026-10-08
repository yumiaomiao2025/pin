# Handoff: Windows 桌面便签工具（便签 / 待办 / 剪贴板 / 三合一）

> 当前实现已移除 LIGHT / DARK / AUTO 管理界面主题功能，管理界面固定使用浅色样式。本文及配套 HTML 中的主题切换和管理界面深色稿作为历史设计参考；内容窗口配色套装继续保留。最新决定见 [技术方案](../technical-plan.md)。

> 当前实现的列表滚动条统一为悬浮模式：默认隐藏，鼠标悬浮窗口时显示，并继承对应窗口的配色。

## Overview
一组常驻 Windows 桌面的极简小工具窗口：**便签（NOTE）**、**待办（TODO）**、**剪贴板历史（CLIP）**，以及把三者合入一个窗口的**三合一（DESK）**。另有两个管理型窗口：**WIDGETS 管理器**（多实例显隐/删除/排序/重命名/新建）与 **SETTINGS 设置**（全局默认值与行为）。

视觉方向是「硬线框」：纯白/纯黑底、1.5px 全黑描边、**直角无圆角**、8px 实心硬阴影（无模糊）、等宽字体、单一强调色。全部窗口宽 320px。

## About the Design Files
本包内的 HTML 文件是**用 HTML 制作的设计参考**——用于表达最终外观与交互行为的原型，**不是可直接搬运的生产代码**。

实现任务是：在目标工程既有环境中**重建**这些设计。本产品实际形态是 Windows 桌面应用，推荐路径为 Electron / Tauri（Web 技术栈可直接复用本原型的布局与状态模型）或 WinUI 3 / WPF（需按下列规格重绘）。若目标工程已有技术栈与组件库，请沿用其既有模式，而非照抄原型的 DOM 结构。

窗口无边框（frameless / `WindowStyle=None`）、自绘标题栏、支持置顶（always-on-top）与窗口透明度，是原生层必须提供的能力。

## Fidelity
**高保真（hifi）。** 颜色、字号、间距、边框、阴影、动效时长均为最终值，请按下列数值 1:1 实现。仅有两处是刻意的低保真占位：托盘条（原型底部那条 TRAY 工具栏）在真实产品中应为**系统托盘图标右键菜单**；系统级行为（多显示器、DPI、显示桌面）仅有规则描述，无视觉稿。

---

## Design Tokens

### 颜色
| Token | 浅色 | 深色 | 用途 |
|---|---|---|---|
| `bg` | `#FFFFFF` | `#0D0D0D` | 窗口底 |
| `fg` | `#111111` | `#F2F2F2` | 正文/图标 |
| `line` | `#111111` | `#F2F2F2` | 所有描边、分隔线、进度填充 |
| `sub` | `#8A8A8A` | `#6F6F6F` | 次要文字、已完成文字、拖拽把手 |
| `soft` | `#F4F4F1` | `#1A1A18` | 分组标题底、输入行底 |
| `inv` | `#FFFFFF` | `#0D0D0D` | 反白文字（落在 `fg` 上） |
| `shadow` | `#111111` | `#F2F2F2` | 窗口硬阴影 |

上表是**管理型窗口**（WIDGETS 管理器、SETTINGS、右键菜单、COLORS 面板）使用的固定主题色，随浅/深主题切换。

**内容型窗口（NOTE / TODO / CLIP / DESK）不用上表**，而是各自持有一套「配色套装（kit）」——见下节。

### 配色套装（kit）—— 内容型窗口的颜色模型

每个内容型窗口持有 `kit`（套装 id）+ `parts`（该窗口的逐项覆盖）+ `follows`（是否跟随全局默认）。
最终生效值 = `KITS[kit]` 覆盖 `parts`，再经 `resolveKit()` 校正。

**五个可调部位**
| key | 落在哪里 |
|---|---|
| `paper` | 窗口底色（内容区、输入行、空状态底） |
| `ink` | 描边、分隔线、正文、复选框、已完成填充 —— **不由用户直接选**，见下 |
| `title` | 标题栏底色；为空时标题栏用 `paper` |
| `accent` | 条目拖拽行底、拖拽落位线、CLIP 刚复制行、置顶窗口阴影色、管理器 NOTE 类型标签底 |
| `spine` | 窗口最左 8px 竖色带（`inset 8px 0 0 <spine>` + 根元素 `padding-left:8px`）；为空则不占位 |
| `shadow` | 窗口 `8px 8px 0` 硬阴影色（置顶时被 `accent` 顶替） |

**五套预设**
| id | 名称 | paper | accent | ink | title | shadow |
|---|---|---|---|---|---|---|
| `plain` | 黄标 · 白纸 | `#FFFFFF` | `#FFE566` | `#111111` | `#FFE566` | `#111111` |
| `kraft` | 牛皮纸 | `#FFF9D6` | `#E5B64B` | `#3B3226` | `#E5B64B` | `#3B3226` |
| `blueprint` | 蓝图 | `#E8F1FB` | `#5E82AA` | `#1E2C38` | `#5E82AA` | `#1E2C38` |
| `grass` | 草绿 | `#EDF6EF` | `#6E9C7B` | `#20321F` | `#6E9C7B` | `#20321F` |
| `invert` | 反相黑 | `#0D0D0D` | `#FFE566` | `#F2F2F2` | `#FFE566` | `#F2F2F2` |

所有预设的 `spine` 均为 `null`（默认不显示色脊）。

**派生值（必须按此推导，不要写死）**
```
resolveKit(base, parts):
  k = { ...base, ...parts }
  // 纸色与文字色亮度差不足 0.35 时，文字翻到对立极色
  if |lum(k.paper) - lum(k.ink)| < 0.35:
      k.ink = lum(k.paper) > 0.5 ? '#111111' : '#F2F2F2'
  return k

lum(hex)  = (0.299R + 0.587G + 0.114B) / 255
mix(a,b,t) = 逐通道线性插值

sub   = mix(ink, paper, 0.5)     // 次要文字、已完成文字、拖拽把手、行内 ×
soft  = mix(paper, ink, 0.06)    // 分组标题底、输入行底
hatch = repeating-linear-gradient(45deg, paper 0 6px, soft 6px 12px)   // 空状态斜纹
```
标签页选中：底 `ink` / 字 `paper`；未选中：透明底 / 字 `ink`。
标题栏：有 `title` 时文字与描边固定 `#111`；无 `title` 时用 `ink`。
PIN 置顶态：底 `title ? '#111' : ink`，字 `title || paper`。

### COLORS 面板

同一个面板，两个 scope，宽 320，硬阴影 `8px 8px 0`，标题栏可拖动，**出现位置须钳入视口**（放不下时翻到反侧，再按 `innerWidth/Height` 夹取）。

**两个入口，标题栏不加按钮：**
1. **窗口右键 → 颜色…** —— scope = 该窗口，标题 `COLORS · <窗口名>`，改动即时作用于本窗口，并将该窗口 `follows` 置为 `false`（脱离默认跟随）。
2. **设置 → 配色套装** —— scope = 默认值，标题 `COLORS · 默认`，右上有 **应用到全部**（把默认套装+覆盖推给所有窗口并重置 `follows = true`）。

**第一层：套装列表**
五行套装（左侧 38×22 三段色样 = paper / accent / ink，各段 1.5px 分隔），当前项底为该套装 `accent` + `inset 3px 0 0 line` 并在右侧标 `当前`；下面一行 `＋ 自定义… ›`（38×22 虚线框）；最后一行开关 `跟随系统深浅`。**没有「高级 · 分部件调整」。**

**第二层：自定义**（点「自定义…」进入，标题栏左侧 `‹` 返回，右上 `存为套装`）
- 分区 `主色 · 一选五处同步`：四色等分色块（高 34），选中项 `inset 0 0 0 3px bg` 内环。点选即一次性写入 `title / accent / spine / shadow = 主色`，且 `paper = mix(主色, #FFFFFF, 0.88)`。**无浓度选项。**
- 分区 `五处 · 可各自改`：五行（标题栏底 / 选中·拖拽行 / 左色脊 / 窗口底纸色 / 硬阴影），每行右侧 40×16 当前色块 + `▾`；点击展开一排等分候选色（高 20，当前项显 `✓`，可为空的项显 `/`），选中即写入对应 `parts[key]`。
  - 候选集：`paper` = `#FFFFFF / #FFF9D6 / #EDF6EF / #E8F1FB / #0D0D0D`；`shadow` = `#111111 / #F2F2F2` + 四主色；其余 = 四主色 + `null`（无）。
- 底栏：左侧提示（默认 scope 为 `同步跟随默认的窗口`，窗口 scope 为 `改动即时作用于本窗口`），右侧 `恢复默认`（清空 `parts`，回到当前套装原值）。
- **无预览方块**：所见即所得，改动直接反映在受影响的真实窗口上。

**跟随默认（follows）**
新建窗口 `follows = true`，并拷贝当前 `defaultKit + defaultParts`。
在默认 scope 下改套装或改任一部位时，**所有 `follows === true` 的窗口即时同步重绘**；`follows === false` 的窗口不受影响，除非点「应用到全部」。

### 字体
`'JetBrains Mono', ui-monospace, monospace`（Windows 上可回退 Consolas / Cascadia Mono）。中文回退 Microsoft YaHei。

| 用途 | 字号 | 字重 | 字距 | 行高 |
|---|---|---|---|---|
| 标题栏标签（NOTE/TODO/DESK…） | 11px | 700 | .12em | — |
| 分区标题（WINDOW/THEME/DEFAULTS/TEXT） | 10px | 700 | .16em | — |
| 标签页（NOTE/TODO/CLIP） | 11px | 700 | .10em | — |
| 待办条目文字 | 13px | 400 | — | 1.5 |
| 便签正文 | 13px | 400 | — | 1.85 |
| 剪贴板条目 | 12px | 400 | — | — |
| 设置项标题 | 12px | 400 | — | — |
| 管理器行标题 | 12px | 400 | — | — |
| 管理器类型标签 | 9px | 700 | .08em | — |
| OPACITY / KEEP 20 / v0.3 等 | 10px | 400 | .10em | — |
| 悬停气泡正文 | 12px | 400 | — | 1.65 |

### 尺寸与间距
- 窗口宽：**320px**（固定起始值）；最小尺寸 **240 × 160**
- 默认高：DESK / TODO **480**、NOTE **230**、CLIP **220**
- 边框：`1.5px solid line`；内部分隔线 `1px solid line`；分组分界 `1.5px solid line`
- 阴影：`8px 8px 0 <shadow>`（窗口）、`5px 5px 0 <shadow>`（右键菜单、气泡）
- **圆角一律 0**
- 标题栏高 32；标签页行高 33（`padding:9px 0`）；条目行 `padding:11px 12px`；设置行 `padding:8px 12px`；分区标题 `padding:6px 12px`
- 底部条：颜色条 34、OPACITY 条 44、待办输入行 `padding:10px 12px`、CLIP 底栏 30、SETTINGS 底栏 38、管理器底栏 40
- 复选框 16×16（`1.5px` 边）；管理器/菜单内色块 20×16 或 20×18；开关轨道 38×18，旋钮 14px 宽满高，`padding:1.5px`
- 缩放把手 18×18，右下角，`repeating-linear-gradient(-45deg, line 0 1.5px, transparent 1.5px 5px)` + 左/上 1.5px 边

---

## Screens / Views

所有窗口结构统一为：**标题栏 → （标签页）→ 内容 → OPACITY 条**。窗口内没有颜色控件——颜色只从右键「颜色…」或设置进入。OPACITY 条可在设置里关闭，关闭后以可拖轨道的形式出现在窗口右键菜单顶部。

### 1. 标题栏（所有窗口共用）
高 32，`padding: 0 6px 0 12px`，底边 1.5px，`cursor: move`，`user-select: none`，底色 = 窗口色标或 `bg`。
从左到右：
1. **类型标签** 11px/700/.12em，`flex:1`，单行省略。文案：`NOTE` / `TODO` / `CLIP` / `DESK`；当窗口有待办时追加 ` · N OPEN`（N = 未完成数）。
2. **PIN** 10px，`padding:1px 5px`，1px 边。未置顶=透明底；置顶=反白（底 `fg`，字 `inv`；有色标时底 `#111`、字为色标色）。
3. **＋** 11px，22×20 居中 —— 再开一个同类窗口。
4. **– / ▣** 11px —— 折叠 / 展开（折叠时窗口高度锁 32px，只剩标题栏）。
5. **×** 12px —— 隐藏（**不删数据**）。

交互：拖动移动窗口；双击 = 折叠切换。

### 2. NOTE 便签
内容区为整块 `textarea`：`padding:14px`，13px/1.85，无边框无描边，底透明，`resize:none`，输入即存。

### 3. TODO 待办
- 列表可滚动，滚动条默认隐藏，鼠标悬浮窗口时显示。
- **未完成条目行**：`display:flex; align-items:flex-start; gap:10px; padding:11px 12px`，底边 1px。
  - 复选框 16×16，`margin-top:1px`，`1.5px solid line`，未选透明底、已选填 `line` 并居中显示 `✓`（10px，`inv` 色）。
  - 文字 13px，`flex:1`，`word-break: normal`；按「最多显示 N 行」截断（见下）。
  - `⠿` 拖拽把手 12px，`sub` 色，`cursor:grab`。
  - `×` 删除 12px，`sub` 色。
- **已完成分组**：标题行 `padding:7px 12px`，底 `soft`，10px/700/.14em，`sub` 色，文案 `已完成 N`；其下为已完成条目（复选框填实带 ✓，文字 `sub` + `line-through`，可再次点击取消完成）。
- **输入行**（固定在列表下方）：底 `soft`，上边 1.5px，`padding:10px 12px`，左侧 `[+]` 13px，右侧无边框 input，placeholder `写点什么…`，**回车新增**、内容为空则忽略。

### 4. CLIP 剪贴板历史
- 条目行 `padding:11px 12px`，底边 1px，12px 字，`cursor:pointer`：
  `01`（`sub` 色，两位补零）＋ 文本（单行 `text-overflow: ellipsis`）＋ `⧉`（700）。
- 点击即「复制」，该行变为 accent 底、`#111` 字（`刚复制` 状态；同一时刻只有一行处于此态）。
- **空状态**：`padding:28px 12px`，居中两行 —— `EMPTY`（12px/.14em）与 `复制任意内容即出现`（11px），底为斜纹 `repeating-linear-gradient(45deg, bg 0 6px, soft 6px 12px)`。
- 底栏高 30：左 `KEEP 20`（10px/.10em/`sub`），右 `CLEAR` 按钮（10px，1px 边，`padding:1px 5px`）—— 清空全部。
- **剪贴板全局唯一**：只能存在一个 CLIP 实例，不可删除，只能隐藏。

### 5. DESK 三合一
标题栏下增加**标签页行**：三等分，`padding:9px 0`，11px/700/.10em，右侧 1.5px 分隔（末项无），底边 1.5px。
选中项：底 `fg`、字 `inv`；未选中：透明底、字 `fg`。**切换无过渡（直切）**。
选中标签决定内容区渲染 NOTE / TODO / CLIP 三者之一（内容各自独立存储）。

### 6. OPACITY 条（所有窗口）
高 44，上边 1.5px，`padding:0 12px`，`gap:10px`：
`OPACITY`（10px/.10em）＋ 轨道（`flex:1`，高 10，`1.5px solid line`，内部左起实心 `line` 填充）＋ 数值（10px，右对齐，宽 22）。
**范围 5–100%**；按下并拖动即时改窗口不透明度（映射：填充宽 = (opacity-5)/95）。

### 7. WIDGETS 管理器（320×480）
- 标题栏：`WIDGETS · N`（N=实例总数）＋ `⚙`（打开设置）＋ `×`（关闭）；可拖动。
- **筛选行**：`ALL` / `NOTE n` / `TODO n` / `DESK n`，7px 上下内距，10px/700/.08em，选中反白。
- **实例行**（`padding:10px 10px 10px 12px`，`gap:8px`，底边 1px；隐藏的实例整行 `opacity:.5`）：
  类型标签（9px/700，`padding:2px 4px`，1px 边；DESK=填 `fg`/字 `inv`，NOTE=填 accent/字 `#111`，其余透明）
  ＋ 名称（12px，单行省略，**双击进入重命名**）
  ＋ `PIN`（同标题栏规格，切换置顶）
  ＋ `◉/○`（12px，宽 14 居中）显示/隐藏
  ＋ `×`（删除；CLIP 类型显示为 `–` 且为 `sub` 色，仅隐藏）。
- **重命名态**：名称位置换为 input（`1.5px solid line`，`padding:1px 4px`，12px）；回车确认、Esc 取消、失焦确认；空值不生效。
- **撤销行**（删除后出现在列表末尾）：底 `soft`，左 `已删除「<名称>」`（11px），右 `撤销` 按钮（10px，1px 边）。**停留 5 秒**后自动消失；撤销后恢复到原索引位置。
- **底栏**（高 40）：左 `◉ 显示 · × 删除可撤销`（10px/`sub`），右 `+ NEW ▾`（10px/.10em，`padding:4px 8px`，底 `fg`、字 `inv`）。
- **新建菜单**（点 `+ NEW` 由底栏向上展开，箭头变 `▴`）：四项 `新便签 / 新待办清单 / 剪贴板 / 新三合一`，每行 `padding:10px 12px`，左侧 14×14 色块（NOTE=accent，DESK=填 `fg`，其余透明），底边 1px。已存在的 CLIP 行 `opacity:.45`、`cursor:default`、右侧标注 `已存在`。

### 8. SETTINGS 设置（320×480）
标题栏 `SETTINGS` ＋ `×`，可拖动。分区标题统一为 `padding:6px 12px`，底 `soft`，10px/700/.16em。

**WINDOW**：`全部始终置顶`（打开即把所有实例设为置顶）、`吸附屏幕边缘`、`溢出悬停显示全文`。
**APPEARANCE**：`配色套装`、`新窗口透明度`（同 OPACITY 条规格，5–100）、`窗口内显示透明度条`（开关），并附说明行 `关掉透明度条后，它会出现在窗口右键菜单里`。
**TEXT**：`字体大小`、`条目最多显示` = `1 行 / 2 行 / 3 行 / 不限`（`padding:2px 7px`，11px，选中反白）。
**STARTUP**：`开机自启`。
**底栏**（高 38）：左 `v0.3`（10px/`sub`），右 `RESET`（10px，1px 边，`padding:2px 7px`）—— 还原上述全部全局项为默认值。

开关样式：轨道 38×18，`1.5px solid line`，`padding:1.5px`；关=底 `bg`、旋钮 `fg` 靠左；开=底 `fg`、旋钮 accent 靠右。

### 9. 窗口右键菜单
宽 186，`1.5px solid line`，阴影 `5px 5px 0 shadow`，出现在光标处，`z-index` 最高层（低于气泡）。
若设置里关闭了 OPACITY 条，菜单**顶部**追加 `透明度` 行（`padding:8px 12px`，标签 ＋ 可拖轨道 ＋ 数值）。

固定项（每行 `padding:9px 12px`，12px，底边 1px）：
`再开一个同类` → `置顶显示 / 取消置顶` → `颜色…`（打开 COLORS 面板，scope = 本窗口）→ `重命名…`（打开管理器并进入该行重命名态）→ `隐藏（保留内容）` → `删除`（底色 = accent）。

**右键实现注意**：右键的 `mousedown` 会先冒泡到背景，若背景负责「点击空白关菜单」，须忽略右键（`button === 2`）并在 `contextmenu` 中 `stopPropagation`，否则菜单会被自己的按下事件立刻关掉。点击菜单外任意处（左键）关闭。

### 10. 托盘（原型中为底部条，实现时为系统托盘图标右键菜单）
菜单项：`新建 →`（便签 / 待办清单 / 剪贴板〔仅一个〕/ 三合一）、`管理面板…`、`全部隐藏`、`全部显示`、`设置`、`退出`。
**不占用任何全局快捷键**——所有操作从托盘与窗口内进入。

---

## Interactions & Behavior

### 窗口
| 行为 | 规则 |
|---|---|
| 拖动标题栏 | 移动窗口；距屏幕边 **12px 内吸附**（硬跳，无动画） |
| 双击标题栏 / `–` | 折叠 ↔ 展开，`height 180ms linear` |
| 拖右下角把手 | 改尺寸，最小 240×160 |
| `×` | 隐藏，保留全部内容与位置 |
| `PIN` | 置顶；阴影色由 `shadow` 变为 accent |
| 悬停 | 若透明度 < 100%，临时恢复 100%（`opacity 120ms linear`） |
| 右键 | 打开上下文菜单 |

### 待办
- **勾选时序**：0ms 点击 → 0–60ms 方框填黑（无过渡）→ 60–120ms `✓` 由左至右擦出，同时复选框 `scale(1.18) → 1`（`transform 120ms linear`，320ms 后复位）→ 60–180ms 删除线扫过 → 180–300ms 文字转 `sub` 并下沉至「已完成」分组。连点多条**逐条排队，不合批**。
- **拖拽排序**：按住 `⠿` 起拖 → 该行底色 = accent、`translateX(2px)`、`inset 3px 0 0 line`；掠过的目标行顶部出现 `2px solid accent` 落位线；在目标行松手完成换位。
- **新增**：输入行回车追加到列表末尾。
- **删除**：行内 `×` 立即删除（无撤销，条目级；窗口级删除才有撤销）。

### 文本溢出
- 条目按设置截断为 1/2/3 行（`display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:N; overflow:hidden`）；「不限」时 `display:block`，条目自动增高。
- CLIP 条目与所有窗口标题恒为单行 `text-overflow: ellipsis`。
- **悬停气泡**：仅当元素实际溢出（`scrollHeight-clientHeight ≥ 2` 或 `scrollWidth-clientWidth ≥ 2`）才触发；悬停 **400ms** 后浮出；底 `#111`、字 `#fff` 12px/1.65、`1.5px solid #111`、阴影 `5px 5px 0 accent`、`padding:10px 12px`、宽 = max(220, 目标宽)、位于目标下方 6px；`pointer-events:none`；贴屏幕边时翻转；移出立即消失。可在设置中整体关闭。

### 滚动条
滚动条统一使用悬浮模式：默认透明，鼠标悬浮窗口时显示，移出后淡出；滑块使用当前窗口的 `ink` 颜色，不额外占用内容宽度。

### 动效 token
| 场景 | 参数 |
|---|---|
| 状态切换（底色、透明度） | 120ms linear |
| 标签页切换 | 无过渡，直切 |
| 折叠 / 展开 | 180ms linear（height） |
| 撤销条 | 120ms 出现，停留 5000ms |
| 窗口吸附 | 12px 阈值，硬跳无动画 |
| 悬浮滚动条 | 淡入 120ms / 移出 600ms 后淡出 |
| 悬停气泡 | 延迟 400ms |
> 全局：不使用弹性/回弹曲线（无 spring、无 overshoot）。

---

## State Management

### 全局
```
theme: 'light' | 'dark'
defaultKit: 'plain'|'kraft'|'blueprint'|'grass'|'invert'
defaultParts: { [part]: color|null }   // 默认套装之上的覆盖
autoTheme: boolean                     // 跟随系统深浅
colors: { open, scope: 'default'|widgetId, view:'kits'|'custom', x, y, part }
maxLines: 1 | 2 | 3 | 0            // 0 = 不限
hoverFull: boolean                  // 溢出悬停显示全文
opBar: boolean                      // 窗口内显示透明度条
defaultOpacity: 5..100              // 新窗口默认透明度
pinAll / autostart / snap: boolean
trash: { widget, index } | null      // 5s 后自动清空
renaming: widgetId | null
menu: { widgetId, x, y } | null
tip: { text, x, y, width } | null
dragId / overId: todoId | null       // 条目拖拽
copied: clipId | null                // CLIP 刚复制高亮
```

### 每个窗口实例
```
id, type: 'note'|'todo'|'clip'|'desk', title,
x, y, w, h, z,
pin, hidden, collapsed,
opacity: 5..100,
kit: string,                         // 套装 id
parts: { [part]: color|null },       // 该窗口的逐项覆盖
follows: boolean,                    // 是否跟随全局默认（被单独改过即 false）
tab: 'note'|'todo'|'clip',           // 仅 desk
note: string,
todos: [{ id, text, done }],
clips: [{ id, text }]
```

### 持久化
输入即存（去抖 ≤ 500ms 即可）。需持久化：全部全局项 + 每个实例的完整状态（含位置、尺寸、所属显示器、置顶、透明度、色标、折叠态、内容）。异常退出后重启完全还原。

### 边缘情况
| 场景 | 规则 |
|---|---|
| 多显示器 | 记录所属屏幕；该屏消失则移回主屏可见区 |
| DPI 变化 | 1.5px 边框按整数物理像素对齐，避免虚边 |
| 分辨率变小 | 超出屏幕的窗口夹回可见范围 |
| 「显示桌面」 | 置顶部件随桌面一同隐藏 |
| 全屏应用 | 自动让位，不覆盖全屏窗口 |
| 系统主题切换 | 若为 AUTO 则跟随反相，无过渡 |
| 敏感剪贴内容 | 密码类不入库，行内标「已忽略」 |
| 剪贴板容量 | 最多 20 条，超出丢弃最旧 |
| 首次启动 | 无任何实例时显示引导窗：文案 `还没有任何部件。从这里开一个：` + 四个类型按钮（`padding:5px 9px`，11px，1.5px 边，首项底为 accent），底为斜纹 |

---

## Assets
无图片、无图标文件。全部符号使用文本字符：`⠿ ✓ × – ＋ ▣ ◉ ○ ⚙ ⧉ ▾ ▴ ◐ ◑ [+]`。
实现时若需替换为图标字体或 SVG，请保持同等视觉重量（1.5px 描边感、无圆角）。
字体 JetBrains Mono 需自行引入（原型用 Google Fonts）。

## Files
- `Desk Widgets Prototype.dc.html` —— **可交互原型**：真实的标签切换、勾选动画、增删条目、拖拽排序、透明度拖拽、配色套装与自定义面板、置顶、折叠、缩放、右键菜单、管理器（显隐/删除/撤销/重命名/新建）、设置和悬停气泡。早期主题与滚动条选项仅保留作历史参考。
- `Desktop Widgets Styles.dc.html` —— **静态规范画布**：四种部件的完整视觉稿与深色反相版、设置面板、托盘与管理器流程、交互六态与动效分帧、以及全部边缘情况示意。像素与文案规格以此文件为准。

两个文件均可直接在浏览器打开。
