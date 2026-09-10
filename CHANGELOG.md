# 更新日志

本项目遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.2.0] - 2026-09-10

主题：**从「能跑」到「可信」**——补上安全、升级、协作与可扩展四块地基。

### 新增

- **访问鉴权**：`APP_PASSWORD` 启用 HTTP Basic（浏览器原生登录框，无需前端改动），`AUTH_TOKEN` 提供 Bearer 凭证给脚本与 CI；`/api/health` 始终放行；未配置时行为与 0.1.0 一致
- **数据库迁移机制**：`_migrations` 表 + 版本化迁移，升级自动执行、失败回滚；老数据库自动基线对齐并补齐缺失表，**升级不丢数据**
- **查询索引**：articles / metrics / materials 列表与聚合索引
- **检测规则引擎（JSON 化）**：内置规则移出代码，改为 `rules/builtin/*.json`；支持 `DATA_DIR/rules/*.json` 自定义规则（同 id 覆盖内置）；新增规则 API（查询/新增/删除）与 [`docs/RULES.md`](docs/RULES.md)，写一条规则只需 10 分钟
- **提示词模板可配置**：系统提示词存入设置并在设置页可编辑、可一键恢复默认
- **导出器插件化**：导出器注册表（wechat / generic / markdown），渠道列表可配置，按文章渠道自动选择导出器
- **假 AI 供应商**：`AI_PROVIDER=fake` 产出确定性草稿，CI 与集成测试无需外网、不花钱
- **集成测试**：拉起真实服务跑完整链路（初始化 → 示例数据 → 三态门禁 → 检测 → 生成 → 导出 → 备份/恢复）
- **暗色主题**：跟随系统 `prefers-color-scheme` 自动切换
- **PWA**：manifest + 图标 + 主题色，手机可「添加到主屏幕」
- **工程基建**：GitHub Actions（测试 + GHCR 镜像）、Dependabot、CONTRIBUTING、CODE_OF_CONDUCT、SECURITY、CODEOWNERS、issue / PR 模板、`docs/ROADMAP.md` 路线图
- **英文 README**（README.en.md）与 Ollama 本地模型使用说明

### 变更

- Dockerfile 改用 `npm ci` 并提交 `package-lock.json`，构建可复现
- `npm test` 改为自动发现测试文件（`node --test`），适配 Node 22 行为
- 启动日志展示数据目录、迁移版本、鉴权与 AI 供应商状态

### 安全

- `.env` 与 `.env.local` 加入 `.gitignore`
- 备份文件明确不含 API Key；恢复不覆盖当前 AI 配置

## [0.1.0] - 2026-09-08

首个可用版本。

### 新增

- 素材库：粘贴录入、CSV 批量导入（表头映射 / 位置解析、引号内逗号换行容错）
- 写作台：OpenAI 兼容接口生成初稿 + 手动粘贴
- 审稿台：三态流转（待审/已审/已发）、**审稿清单门禁**（未全勾不可标记已审）、AI 腔检测三规则（对比修辞 / 教科书式小标题 / 车轱辘词）、正文预览与问题定位
- 公众号导出：Markdown → 内联样式 HTML，一键复制/下载
- 复盘台：数据回填、周报（产量/已发/积压/中位阅读 + 环比）、周报导出 HTML
- 素材与文章软删除、示例数据、全量 JSON 备份/恢复
- Docker 部署（`docker compose up -d`）与单文件 SQLite 存储

[0.2.0]: https://github.com/Eplayed/content-review-workbench/releases/tag/v0.2.0
[0.1.0]: https://github.com/Eplayed/content-review-workbench/releases/tag/v0.1.0
