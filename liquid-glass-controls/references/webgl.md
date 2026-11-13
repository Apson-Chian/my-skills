# 当前 WebGL 接线

当前参数以 [material-preset.md](material-preset.md) 为准。可运行代码位于 [assets/atelier/index.html](../assets/atelier/index.html)，对应本次用户确认的网页版本；不依赖 Sites、源仓库凭据或额外 npm 包。

## 复用入口

| 文件 / 函数 | 用途 |
| --- | --- |
| [app.js](../assets/atelier/app.js) `state` | 通透 / 柔雾、折射 72、模糊 8、压感 80 与统一更新路径 |
| `fragment`, `setupGL`, `render` | 共享背景纹理、圆角距离场、边缘位移、轻微色散、清晰 / 模糊纹理混合 |
| `paintBackdrop`, `paintBlurredBackdrop` | 可见背景与滤镜输入，按需更新的平滑模糊缓存 |
| `trackDock`, `finishDockDrag`, `positionSelection` | 连续拖动、跨栏切换、取消回退与松手吸附 |
| `releaseAll`, `press`, 透镜指针监听 | 按压、拖动、释放 / 取消 / 失焦清理 |
| `drawRanges` | 原生 range 的清晰命中层与 2D 轨道弯曲近似 |
| [styles.css](../assets/atelier/styles.css) | 独立高光 / 阴影、透明度回退、焦点、减少动态与窄屏 |

移植时只抽取必要部分并适配目标组件；不要默认替换产品布局、主题、图标或背景。照片只为观察折射提供输入；若复制该照片，保留演示页中的 Shifaaz Shamoon / Unsplash 来源。

## 背景与模糊

- 同一 Canvas 既是可见背景又是 WebGL 输入，背景文字也由该源绘制。前景控件内容是清晰 DOM。这里没有任意实时 DOM 捕获能力。
- 场景、源内容或尺寸变化后标记 `sourceDirty`。统一在下一次 rAF 上传原始纹理；模糊数值或背景变化时才重建模糊纹理。
- 模糊前延展原始背景的四边、四角像素到 padding 区域，`padding = ceil(radius × sourceDPR × 3) + 2`，再执行 Canvas 2D 平滑 blur 并裁回原尺寸，避免透明黑晕。
- 按压帧复用缓存，混合清晰 / 模糊纹理；不每帧 CPU 截图或重做模糊。模糊 0 时使用清晰输入，独立调节模糊不改折射和压感。
- 无 Canvas 2D filter 时用 shader 多点采样近似；无 WebGL 时采用透明色调、轻模糊、高光与阴影的 CSS 回退。回退不能声称为真实折射。
- 参考分辨率上限：WebGL DPR 1.75、背景 Canvas DPR 2。按实际设备与表面积调整，不把软件渲染截图当作 GPU 性能结论。
- 示例共享一个 WebGL 画布，光学面只采背景；父导航与选中面不是逐级捕获的嵌套玻璃。需要子面再次折射父面时单独接入分层纹理，不能宣称示例已实现。

## 拖动分段导航

- 用归一化栏目坐标维护位置、目标与速度。参考为 3 栏、左右 5 px 内边距；迁移时从实际选项数、尺寸和间距计算，不照抄常数到任意导航。
- 当前选中面上按下时保留抓取偏移；抓住吸附中的选中块时从当前呈现值接手。按在其他栏目时把选中块移到指针处。
- 拖动时停用位置过渡，直接更新连续位置；四舍五入为最近栏目索引，跨中线即更新业务选择、让背景缓存失效，不等待抬手。
- 抬手后弹簧贴合当前栏目。拖出导航后依靠 pointer capture 收到释放；取消、丢失捕获、失焦 / 隐藏 / resize 时恢复手势开始的栏目并清理。
- 指针手势已提交选择时拦截其后续带指针 `detail` 的 click，保留键盘 / 辅助技术 click。轻点、方向键、Home / End、空格 / Enter 仍有效。
- 静止且输入不再变化后停止 rAF；关闭光学效果不关闭导航行为。

只有维护旧 `Container` / `Button` 接线或明确复现旧图时才读 [legacy-webgl.md](legacy-webgl.md)。其中深海 100% / 30% 及旧半径映射属于历史方案，不是当前默认。
