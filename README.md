# content-review-workbench · AI 内容审稿工作台

> AI 负责写，你负责审——带人工审稿闭环的轻量自媒体内容产线。

[![CI](https://github.com/Eplayed/content-review-workbench/actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522.5-green)](package.json)
[![English](https://img.shields.io/badge/docs-English-blue)](README.en.md)

市面上的同类工具分两类：一类在卷「一键分发 20+ 平台」的全自动矩阵（踩平台红线），另一类是纯生成流水线（没有审稿、没有复盘）。本产品反其道而行：**把「人机协同审稿闭环」做成一等公民**，符合平台 AI 内容整顿后的合规趋势。

## 定位

自托管的轻量内容产线：

```
素材库 → AI 生成初稿 → 人工审稿（三态流转）→ 导出发布 → 数据回填 → 周报复盘
```

目标用户：一人自媒体、小商家、代运营者。

## 核心特性

- **三态审稿流**：待审 → 已审 → 已发，全勾审稿清单才能过审（服务端强制门禁，前端只是入口）
- **可扩展的 AI 腔检测引擎**：规则即 JSON（`rules/builtin/*.json`，内置 15+ 条：对比修辞、教科书标题、车轱辘词、绝对化表述、行业黑话……），**写一条新规则 ≈ 10 分钟，不改代码**——见 [docs/RULES.md](docs/RULES.md)；红黄分级、一键定位、按规则开关
- **素材库**：粘贴文本 / CSV 批量导入（带表头与位置两种格式）
- **AI 供应商可插拔**：OpenAI 兼容接口（含 Ollama 本地模型）；`AI_PROVIDER=fake` 演示模式零成本体验；写作人格（system 提示词）在设置页可编辑、可恢复默认
- **导出器插件化**：公众号内联样式 / 通用网页 / Markdown 原文，按渠道自动选择（见 `src/exporters/`）
- **数据回填与周报**：多次回填表现数据，按周聚合产量与中位数，周报一键导出 HTML
- **备份/恢复**：全量 JSON（**永不包含 API Key**），恢复时外键自动重映射
- **安全与运维**：`APP_PASSWORD`（浏览器 Basic 登录）/ `AUTH_TOKEN`（脚本 Bearer）；数据库版本化迁移，**升级不丢数据**；暗色主题；PWA 可安装到手机桌面

## 路线图

- [x] **v0.1.0 可用**：M1–M3 全部功能落地
- [x] **v0.2.0 可信**：鉴权、迁移、CI、社区文件、规则引擎 JSON 化、提示词模板、导出器插件化、fake provider、集成测试、暗色主题、PWA、双语文档
- [ ] **v0.3.0 可扩展**：外部规则包、多模型对比生成、docx/pdf 素材解析、导出模板可视化编辑
- [ ] **v0.4.0 协作**：多用户角色、审稿评论与修订历史、Webhook

完整路线与负空间（明确不做的事）见 [docs/ROADMAP.md](docs/ROADMAP.md)。

## 技术栈

Node.js ≥ 22.5（内置 `node:sqlite`，零原生编译依赖）· Express · SQLite 单文件 · 原生 HTML/CSS/JS（无构建步骤）· Docker

## 快速开始

```bash
# 方式一：本地运行（需 Node.js ≥ 22.5）
npm install
npm start
# 打开 http://localhost:3000

# 方式二：Docker（推荐）
docker compose up -d
```

- 数据存于 `data/workbench.db`（SQLite 单文件），Docker 部署挂载 `data` 目录；`PORT` 改端口
- **公网部署**：设置 `APP_PASSWORD=你的密码`（浏览器弹原生登录框）和/或 `AUTH_TOKEN=令牌`（脚本调用）；`.env.example` 有全部可配项
- **本地模型**：Ollama 起服务后，baseUrl 填 `http://127.0.0.1:11434/v1`，模型填如 `qwen2.5:7b`
- **演示模式**：设置里 provider 选 fake（或 `AI_PROVIDER=fake`），生成固定示例稿，零 API 成本
- 首次使用：设置 → 载入示例数据，即可体验完整审稿闭环
- 测试：`npm test`（49 个用例：规则引擎 / 迁移 / 鉴权 / 集成链路 / 导出 / 备份恢复 / CSV）

## 贡献

最容易的入门方式是**写一条检测规则**（纯 JSON + 用例）：见 [docs/RULES.md](docs/RULES.md)。其余见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 合规声明

本工具**不包含任何平台的自动登录、自动发布、批量定时发布功能**。发布动作由人工完成——这是特性，不是缺陷。

## License

MIT
