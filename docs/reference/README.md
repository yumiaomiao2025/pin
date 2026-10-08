# 选型参考

本目录保留开发过程中的静态比较页，不参与应用构建，也不作为当前功能清单。当前实现见 [项目 README](../../README.md) 和 [技术方案](../technical-plan.md)。

| 参考页 | 用途与采用情况 |
| --- | --- |
| [Lucide 图标方案](lucide-icon-options-preview.html) | 比较图标及 PIN 的表达方式；正式应用采用 Lucide，并保留 PIN 文字。候选方案中的按钮排列不代表当前页面布局。 |
| [透明度滑块](range-preview.html) | 留存方块轨道和滑块的视觉比较；正式应用的最低透明度为 5%，实际控件见 `src/renderer/components/RangeControl.tsx`。 |
| [滚动条样式](scrollbar-styles-preview.html) | 五种候选样式中采用第五种：悬浮窗口才显示、贴边、不占内容空间、无箭头、半透明方块滑块。 |

这些 HTML 可直接在浏览器打开。正式滚动控件位于 `src/renderer/components/OverlayScrollArea.tsx`，样式位于 `src/renderer/styles/_scrollbars.scss`；原始设计交付物另见 [设计目录](../design/README.md)。
