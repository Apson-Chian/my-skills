# My Skills

我的个人 AI Agent skill 集合，保存可复用的实现方法、设计偏好和参考资源。

## 在线体验

**[打开 Glass Works 示例站](https://apson-chian.github.io/my-skills/)**

- [glass-ui：通透旅行仪表盘](https://apson-chian.github.io/my-skills/#glass-ui) — 卡片、玻璃弹层、浮动导航与渐进模糊，可切换背景和调节材质。
- [liquid-glass-controls：液态控件实验室](https://apson-chian.github.io/my-skills/#controls) — 实时背景折射、轻微色散、按压形变和按住拖动的分段导航。

网页同时提供 skill 源码入口和可复制的示例提示词。界面中的旅行与天气内容为虚构示例。

## Skills

| Skill | 用途 |
| --- | --- |
| [glass-ui](glass-ui/SKILL.md) | 实现或修复 Web、Android 玻璃材质、背景折射和渐进模糊。 |
| [liquid-glass-controls](liquid-glass-controls/SKILL.md) | 实现 Web 液态玻璃按钮、滑杆、开关和支持按住拖动的分段导航。 |

## 使用

1. 克隆仓库：`git clone https://github.com/Apson-Chian/my-skills.git`。
2. 将需要的完整 skill 目录复制到所用 AI Agent 支持的 skills 目录，保留 `references/`、`assets/` 和 `agents/` 等附属文件。
3. 在任务中指定 skill 名称，或由支持自动匹配的 Agent 按描述加载。

示例：

```text
使用 $glass-ui 改进当前页面的玻璃材质，并检查背景采样与降级效果。
使用 $liquid-glass-controls 实现液态玻璃导航，保留点击、键盘与按住拖动交互。
```

## 参考演示

公开示例站源码在 `docs/`，无需构建或安装依赖：

```sh
python3 -m http.server 8000 --directory docs
```

浏览器访问 `http://localhost:8000`。GitHub Pages 从 `main` 分支的 `/docs` 目录发布，推送该目录的更新后会自动重新部署。

`liquid-glass-controls/assets/atelier/` 包含当前自包含 Web 演示，可通过静态 HTTP 服务预览：

```sh
python3 -m http.server 8000 --directory liquid-glass-controls/assets/atelier
```

浏览器访问 `http://localhost:8000`。旧参考示例位于 `liquid-glass-controls/assets/lab/`。

## 维护

每个 skill 独立维护在顶层目录中，以 `SKILL.md` 为入口。个人参数只是默认起点，具体任务的新要求优先；迁移后应重新验证实际效果。

本仓库仅收录 skill 及其附属资源，不包含本地历史备份和独立演示工程。

## 第三方资源

- 旧演示使用的 [liquid-glass-js](https://github.com/dashersw/liquid-glass-js) 代码保留了随附的 [MIT 许可证](liquid-glass-controls/assets/lab/vendor/LICENSE)。
- 当前演示背景摄影：Shifaaz Shamoon，来源见 [Unsplash](https://unsplash.com/photos/QP6XWJ9q6GY)。
