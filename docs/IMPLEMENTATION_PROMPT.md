# AI 实现提示词

> 用法：把下方代码块内的完整内容直接粘贴给 AI 编码代理（TRAE / Cursor / WorkBuddy 等），让它从零实现本项目。

```markdown
# 任务：从零实现「AI 内容审稿工作台」开源项目

## 产品定位
一个自托管的轻量内容产线：AI 生成初稿 → 人工审稿（三态流转）→ 导出发布 → 数据回填 → 周报复盘。
核心差异点：市面工具都在做"全自动发布"，本产品反其道做"人机协同审稿闭环"，
符合 2025-09《AI 生成内容标识办法》后的平台合规趋势。目标用户：一人自媒体、小商家、代运营者。

## 技术约束
- 单仓库，前后端不分离：Node.js 20 + 原生 http 或 Express，前端原生 HTML/CSS/JS（无构建步骤，参考 JSON 文件 + vanilla JS 的极简模式）
- 数据库：SQLite 单文件（better-sqlite3，同步 API），所有状态本地持久化
- AI 调用：OpenAI 兼容接口（/v1/chat/completions），baseUrl/model/apiKey 可配置；预留 Dify workflow 适配器接口但不实现
- 零外部依赖服务：无 Redis、无消息队列、无向量库
- Docker 一键部署（docker-compose.yml），同时支持 node server.js 直接跑
- 所有 API 用 JSON over HTTP，前端 fetch 调用

## 数据模型（SQLite 表）
1. materials 素材表：id, title, content, source_type(manual/url/csv), tags, created_at
2. articles 文章表：id, title, content_md, content_html, material_id, channel(wechat/toutiao/xhs),
   review_state(pending/reviewed/published)——三态是核心, created_at, updated_at, published_at
3. metrics 表现回填表：id, article_id, views, likes, collects, shares, fans_delta, recorded_at
4. settings 配置表：key, value（存 AI 配置、审稿 checklist、检测规则开关）

## 功能模块（按里程碑）

### M1 审稿闭环（先做，这是卖点）
- 素材导入：粘贴文本框 + CSV 上传，入库后列表展示
- 文章生成：选素材 → 填选题/文章类型 → 调 LLM 生成 Markdown → 落库为 pending
- 三态流转：列表徽章点击循环切换（pending→reviewed→published），弹窗下拉精确选择
- **AI 腔检测**（独立模块 detector.js，纯函数可测试）：
  - 对比修辞检测：正则 `不是[^。！？\n]{1,25}(而是|，是)`，全文命中 ≥2 处标记；「不再…而是」「与其说」同口径
  - 教科书标题组：小标题以「厘清/掌握/理解/学会/认识/解析/探究/探讨/揭示」开头且结尾无冒号信息 → 标记
  - 车轱辘词密度：首先/其次/综上所述/总而言之/值得注意的是 出现 ≥3 次标记
  - 检测结果展示在文章详情页，红黄标出，支持一键定位
- 审稿 checklist：可编辑清单（默认含：事实核查/数字校验/AI 标注就位/人工增量），全勾过才允许置为 reviewed

### M2 排版导出与回填
- 公众号 HTML 导出：Markdown → 内联样式 HTML（标题/正文/引用/分隔符样式内置，主题可换）
- 发布登记：published 文章登记发布日期 + 渠道
- 数据回填：表单录入阅读/点赞/收藏/分享/净增粉丝，可多次回填
- 简版周报：按周聚合——产量、三态分布、各渠道中位数表现、环比

### M3 配置与打磨
- AI 设置页（baseUrl/model/key，存 settings 表，测试连接按钮）
- 检测规则开关（每条规则可独立关闭）
- 数据导出（全部数据 JSON 备份/恢复）
- README：截图 + 30 秒部署说明 + 合规声明（本工具不含自动发布功能，发布需人工操作——这是特性不是缺陷）

## 硬性红线（违反任何一条视为实现失败）
1. 不实现任何平台的自动登录、自动发布、批量定时发布
2. AI 调用失败时明确报错，绝不静默降级为本地模板
3. 所有列表操作需二次确认，删除文章软删除（可恢复）
4. API key 只存本地 settings 表，永不打进日志和前端响应
5. 检测正则必须带单元测试（vitest 或 node:test），用真实 AI 文风样本回归

## 验收标准
- node server.js 启动 ≤3 秒，浏览器打开即用
- M1 全流程可跑通：导入素材→生成→检测→审稿→三态切换，全程不碰命令行
- AI 腔检测对这段话必须报 ≥2 处：「不是工具不够好，而是你不会用。首先，你需要理解原理。其次，掌握方法。综上所述，学习 AI 不是玄学，而是工程。」
- 切换 review_state 后刷新页面状态保持（SQLite 持久化）
- docker compose up 后 60 秒内可用

## 工程习惯要求
- 每完成一个里程碑跑一次全量回归（node --test）
- 提交信息中文、按模块分组
- 禁止引入本任务未列出的框架（React/Vue/Tailwind 等一律不要）
```
