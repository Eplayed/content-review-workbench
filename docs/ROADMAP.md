# 路线图 · Roadmap

> 目标：把「AI 内容审稿工作台」从一个能跑的个人项目，做成**别人敢部署、愿意贡献、能长期用**的通用开源工具。
> 原则：护城河是**人机协同审稿闭环 + 可扩展的检测规则**；不追功能数量，追可维护性与可扩展性。

## 版本规划

| 版本 | 主题 | 关键内容 | 状态 |
|---|---|---|---|
| v0.1.0 | 可用 | M1–M3 全部功能：素材/三态审稿/AI 腔检测/公众号导出/回填/周报 | ✅ 已发布 |
| **v0.2.0** | **可信** | 访问鉴权、数据库迁移、CI、社区文件、**规则引擎 JSON 化**、提示词模板、导出器插件化、集成测试、暗色主题、PWA、双语文档 | 🚧 本轮交付 |
| v0.3.0 | 可扩展 | 外部规则包（npm/URL 安装）、多模型对比生成、批量导入素材解析器（docx/pdf）、导出模板可视化编辑 | 待排期 |
| v0.4.0 | 协作 | 多用户与角色（只读/审稿/管理）、审稿评论与修订历史、Webhook 通知 | 待排期 |
| v1.0.0 | 稳定 | API 冻结与兼容承诺、i18n（中/英界面）、插件协议定稿、文档站 | 待排期 |

## 本轮（v0.2.0）交付清单

### A. 安全与数据生命线（P0）
- [ ] A1 访问鉴权：`APP_PASSWORD`（Basic，浏览器原生弹窗）/ `AUTH_TOKEN`（Bearer，供脚本）；`/api/health` 放行；未配置时行为与现在一致
- [ ] A2 数据库迁移机制：`_migrations` 表 + 版本化迁移；老库自动基线对齐（不丢数据）；迁移失败回滚
- [ ] A3 查询索引：articles(review_state,deleted,created_at)、metrics(article_id,recorded_at)、materials(deleted,created_at)

### B. 开源工程线（P0/P1）
- [ ] B1 GitHub Actions CI：push/PR 跑全量测试；main 分支构建并推送 GHCR 镜像
- [ ] B2 Dependabot：npm / docker / github-actions 三类依赖每周检查
- [ ] B3 社区标准文件：CONTRIBUTING、CODE_OF_CONDUCT、SECURITY、CODEOWNERS、issue 模板（bug/feature）、PR 模板
- [ ] B4 CHANGELOG + 语义化版本（0.2.0）+ Git tag + GitHub Release
- [ ] B5 依赖可复现：`package-lock.json` 入库，Dockerfile 改用 `npm ci`

### C. 可扩展性（P1，核心竞争力）
- [ ] C1 **检测规则引擎 JSON 化**：内置规则独立成 `rules/builtin/*.json`；支持 `DATA_DIR/rules/*.json` 自定义规则（同 id 覆盖内置）；规则 API（增删查）；`docs/RULES.md` 把「写一条规则」的门槛降到 10 分钟
- [ ] C2 提示词模板可配置：系统提示词存 settings，设置页可编辑、可恢复默认（不同赛道需要不同写作人格）
- [ ] C3 渠道与导出器可插拔：渠道列表可配置；导出器注册表（wechat / generic / markdown），按文章渠道自动选择
- [ ] C4 fake AI provider：`AI_PROVIDER=fake` 产确定性草稿，CI 与集成测试不花一分钱、不依赖外网

### D. 质量与体验（P1）
- [ ] D1 集成测试：拉起真实服务跑完整链路（seed → 三态门禁 → 检测 → fake 生成 → 导出 → 备份/恢复）
- [ ] D2 暗色主题：CSS 变量化 + `prefers-color-scheme` 自动切换
- [ ] D3 PWA：manifest + 图标 + 主题色，手机可「添加到主屏幕」
- [ ] D4 文档：README 补充鉴权/Ollama/规则/部署按钮 + 截图；英文 README（README.en.md）

### E. 明确不做（负空间）
- ❌ 多租户 SaaS、账号体系：单用户自托管是定位，不是缺陷（多用户放到 v0.4+）
- ❌ 任何平台的自动发布能力：合规红线，也是与「全自动矩阵」类工具的差异本身
- ❌ 插件市场、TypeScript 全栈重写：v1.0 前都是消耗
- ❌ 引入 Redis/Postgres/队列：保持 SQLite 单文件 + 零外部依赖

## 验收标准（本轮）
1. `npm test` 全绿，且新增覆盖：鉴权、迁移（含老库）、规则引擎、集成链路
2. 未配置 `APP_PASSWORD` 时行为不变；配置后浏览器弹登录框、API 无凭证返回 401
3. 用 v0.1.0 的旧数据库直接启动新版本：数据完整、自动补齐迁移与索引
4. 新增一条自定义规则只需写一个 JSON 文件（或走设置页），不改代码即可生效
5. CI 在 GitHub 上跑通；仓库有 Release 页与 CHANGELOG

## 贡献路径（给未来的贡献者）
1. **加一条检测规则**（最容易上手）→ `docs/RULES.md`
2. 修 bug / 改文案 → 直接提 PR（见 CONTRIBUTING）
3. 加导出器 → `src/exporters/` 复制 `generic.js` 改造
4. 加 AI 供应商 → `src/ai.js`
