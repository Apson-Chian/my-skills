# Web 玻璃实现

本次用户确认的 Web 液态玻璃默认值、轻微色散与压感映射见 [当前参数](liquid-glass-current.md)。下面的 CSS 起点只表示通透磨砂回退，不代表已实现这组真实位移、色散和按压交互。

## 选择渲染路径

| 目标 | 路径 | 能声称的效果 |
| --- | --- | --- |
| 轻量导航、卡片与表单 | 半透明底色 + `backdrop-filter` + 独立光照层 | 背景模糊与材质层次 |
| 渐进模糊 | 少量模糊档位，各自用空间蒙版平滑融合 | 渐进模糊的近似 |
| 实际背景折射 | 工程已有的背景纹理/渲染场景 + 位移 shader；或已在目标浏览器实测的 SVG backdrop 滤镜 | 实际输入像素发生位移，验证后才能声称折射 |
| 无滤镜或主动减少效果 | 接近实色的阅读底色、细边与阴影 | 清晰回退 |

DOM 不是随手可取的 GPU 纹理。Canvas/WebGL 不能自动采到任意页面背后的实时 DOM；已有场景纹理可复用，但其坐标、滚动与更新也必须匹配。不要默认复制整棵 DOM 或循环调用截图库冒充实时折射。

`@supports` 只能检查语法支持，不能证明组合滤镜、SVG 位移与跨浏览器画面正确。SVG backdrop 路径需要逐一观察目标浏览器；不能因为普通 CSS 模糊可用就认定高级路径也可用。

## 分层与故障定位

将滤镜/色调、光照装饰和清晰内容分开。给装饰层 `pointer-events: none`，保留按钮、输入、焦点和页面滚动。别把 `filter: blur()` 加在包含前景的整个组件上。

当 `backdrop-filter` 看起来没有作用，先排查透明底色和祖先的 backdrop root。祖先的 `opacity < 1`、filter、mask、backdrop-filter 等属性可能限制可见采样范围；`will-change` 也可能改变该边界。不要为每个组件无条件加提升合成层的属性。见 [MDN backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter)。

边框裁切与阴影分离：圆角材质裁切放在效果层；外层不要用 `overflow: hidden` 顺便裁掉阴影、弹出内容和焦点环。祖先变换也可能改变 fixed 元素的定位行为，应在现有布局中核对。

## 可改用的 CSS 起点

以下只建立磨砂玻璃底层，不包含折射或渐进模糊。数值是试调起点，不是通用标准。与项目现有 token、主题选择器和组件封装合并，不直接覆盖全站样式。

```html
<section class="glass">
  <div class="glass__content">现有可交互内容</div>
</section>
```

```css
.glass {
  --glass-solid: #f6f7f9;
  --glass-tint: rgb(250 252 255 / 38%);
  --glass-edge: rgb(255 255 255 / 48%);
  --glass-glow: rgb(255 255 255 / 16%);
  --glass-ink: #172033;
  position: relative;
  z-index: 0;
  border-radius: 24px;
  color: var(--glass-ink);
  box-shadow: 0 16px 40px rgb(10 20 40 / 9%),
              0 2px 5px rgb(10 20 40 / 7%);
}
.glass::before, .glass::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
}
.glass::before {
  z-index: 0;
  background: linear-gradient(135deg, var(--glass-glow), transparent 55%),
              var(--glass-solid);
}
.glass::after {
  z-index: 2;
  box-shadow: inset 0 1px 0 var(--glass-edge),
              inset 0 -1px 0 rgb(0 0 0 / 5%);
}
.glass__content { position: relative; z-index: 1; }
[data-theme="dark"] .glass {
  --glass-solid: #202630;
  --glass-tint: rgb(22 28 38 / 68%);
  --glass-edge: rgb(255 255 255 / 19%);
  --glass-glow: rgb(255 255 255 / 6%);
  --glass-ink: #f3f5fa;
}
@supports ((backdrop-filter: blur(1px)) or
           (-webkit-backdrop-filter: blur(1px))) {
  .glass::before {
    background: linear-gradient(135deg, var(--glass-glow), transparent 55%),
                var(--glass-tint);
    -webkit-backdrop-filter: blur(16px) saturate(115%);
    backdrop-filter: blur(16px) saturate(115%);
  }
}
/* Place the media override after the enhancement. */
@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
  .glass::before {
    background: var(--glass-solid);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}
[data-glass-effects="off"] .glass::before {
  background: var(--glass-solid);
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
```

如果容器自身使用 `data-glass-effects="off"`，同步适配自身选择器；示例假定属性在祖先上。焦点样式沿用项目现有规则并实测，不能用发光替代可辨认的焦点轮廓。

减少透明媒体查询的支持取决于浏览器，不能依赖它作为唯一回退入口。见 [MDN prefers-reduced-transparency](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-transparency)。

## 渐进模糊的实现边界

把渐进效果放在浮动 chrome 的独立装饰层，内容和导航分别在下方与上方。顶缘从零效果过渡，到靠近导航处增强；顶部栏则反向。保留安全区域和底部内容 padding。

先尝试最少的有效层数，例如清晰、轻模糊、较强模糊三段。各层分别使用连续 alpha 蒙版，避免先把下层玻璃滤成背景再供上层采样；检查祖先 backdrop root 和兄弟叠加的实际结果。多层叠加不必然等于对同一源做插值，必须观察条纹夹具的条带、双影和接缝。

避免将 mask 放在包住所有内容的祖先上；不要在每帧动画中改变大面积模糊半径。优先复用小面积效果，页面隐藏或效果关闭时停止自定义渲染。减少动态效果时关闭指针景深、光斑跟随和持续扭曲，保持必要的状态反馈。

## 按需验证

在当前项目实际支持的浏览器检查，优先覆盖已知有差异的引擎与手机。背景更新、滚动、resize 和主题切换都需要检查；只测静态桌面首屏不足以验证浮动导航。出现性能疑问时用性能记录定位绘制面积和 GPU/主线程瓶颈，再决定是否减少层数或分辨率。
