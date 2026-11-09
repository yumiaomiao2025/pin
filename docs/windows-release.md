# Windows 发布交接

## 1.0.2 本地安装包

2026-11-09 构建，文件为 `release/1.0.2/Pin-1.0.2-win-x64-setup.exe`，同目录附 `SHA256SUMS.txt`。安装包包含普通小窗在 `Win+D` 回到桌面时的层级修复和 PIN 置顶行为。沿用 Inno Setup 的 `AppId`，已有 Inno 版可在原安装目录升级。

Windows「已安装的应用」和开始菜单「卸载 Pin」指向同一个 Inno Setup 卸载程序。卸载会移除安装文件、快捷方式以及指向当前安装目录的开机启动项，保留 `%APPDATA%\Pin` 用户资料。

本次通过 `pnpm package`、Inno Setup 编译和 SHA-256 校验。在独立注册项和带空格的临时安装目录中验证了简体中文卸载快捷方式、Windows 卸载注册、已安装程序回归、卸载清理、便携副本启动项及测试数据库保留。安装包未签名，覆盖真实旧版安装待验证。

## 1.0.1 历史候选

2026-11-07：`1.0.1` 为本地发布候选，尚未发布。已有 `v1.0.0` 标签指向旧代码；新版本使用 `v1.0.1`，保留原标签。

| 文件 | 用途 |
| --- | --- |
| `Pin-1.0.1-win-x64-setup.exe` | Windows x64 安装包，支持简体中文、选择目录和可选桌面快捷方式 |
| `Pin-1.0.1-win-x64-portable.zip` | Windows x64 免安装包，完整解压后运行 `Pin.exe` |
| `SHA256SUMS.txt` | 上述两个文件的 SHA-256 校验 |

本地成品在 `release/1.0.1/`。Windows 安装包由 Inno Setup 从 Forge 的成品目录生成。旧 Squirrel 候选包可以从 Windows 已安装应用中卸载；换装时保留 `%APPDATA%\Pin` 中的资料。若以前开启了开机自启，换装后在新版本的设置中重新开关一次。

`assets/pin.ico` 使用黄色 P 图标，包含九档尺寸，由程序窗口、托盘、`Pin.exe` 和安装程序共用。

1. 合并并推送本地发布准备改动。在 [Actions](https://github.com/yumiaomiao2025/pin/actions) 手动运行 **Windows package**，它用 pnpm 冻结安装、检查、打包并生成可下载的 `pin-windows-x64` 产物，无需填写 Secrets。
2. 在 Windows 测试机确认启动、开机自启和有既有数据时的换装；检查签名或按未签名测试版说明。工作流使用临时数据目录，不覆盖真实用户资料。
3. 在 [GitHub Releases](https://github.com/yumiaomiao2025/pin/releases) 创建 `v1.0.1`，标签对准该次通过检查的提交，上传 EXE、ZIP 和校验文件。不要把 GitHub 自动生成的 Source code ZIP 当作免安装包。
4. 主页项目卡片打开 `/demos/pin/index.html`，这是合成数据交互演示。正式发布后可再添加指向 Release 的“下载 Windows 版”链接。

发布简介可用：「Pin 是一组可以自由摆放的 Windows 桌面小窗口，把便签、待办和常用文字放在手边。内容保存在本机，支持三合一工作台和自定义配色。」

本轮 `pnpm typecheck`、`pnpm lint`、`pnpm db:check`、`pnpm test:db`（21 项）、`pnpm release:win` 通过。旧打包版在 Windows 125% 缩放下单次移动就会放大；修复版连续移动 16 次后，内容区和数据库中保存的宽高保持不变，显式调整大小仍然有效。已查看中文版安装向导的目录选择页，并将新版装到带空格的临时自定义目录；对装好的 `Pin.exe` 执行完整 `pnpm package:check`，然后卸载临时安装。候选包未签名；旧候选的真实数据换装、跨不同缩放比例的显示器拖动和 GitHub 工作流仍待验证。

`better-sqlite3` 和 `koffi` 使用锁定版本提供的 Windows x64 原生二进制。构建脚本调用现有 Inno Setup 编译器；本地不自动下载或运行编译器安装脚本。正式 Release 前以干净 Windows runner 的结果为准。

同日更新：修复折叠标题下方露出内容底色，折叠宽度独立保存（最小 120 DIP，展开仍为 240 DIP），标题支持双击原位改名并同步管理列表。打包回归覆盖实际指针拖宽、最窄宽度下三个按钮无遮挡、双击改名、取消及重新载入；22 项数据库测试通过，包括旧库迁移及保存折叠宽度后重开。仍为本地候选。
