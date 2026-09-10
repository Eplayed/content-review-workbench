# 贡献指南

感谢你愿意参与！这个项目刻意保持**轻量**：Node + SQLite 单文件，没有构建步骤，没有外部服务。
任何人 5 分钟就能跑起来。

## 环境要求

- Node.js ≥ 22.5（依赖内置 `node:sqlite`，不需要编译原生模块）
- 无需 Docker、无需数据库服务

```bash
git clone https://github.com/Eplayed/content-review-workbench.git
cd content-review-workbench
npm install
npm test          # 全部测试应当通过
npm start         # http://localhost:3000
```

## 最容易上手的贡献：加一条检测规则

检测规则是纯 JSON 文件，不需要改任何代码，也不需要懂前端：

1. 看 `docs/RULES.md` 了解字段含义
2. 在 `rules/builtin/` 加一个 `你的规则.json`
3. 在 `tests/detector.test.js` 补一条用例（正例 + 反例）
4. 提 PR

## 其他贡献方向

| 方向 | 位置 |
| --- | --- |
| 修 bug / 改文案 | 直接提 PR |
| 新增导出器（知乎、头条、小红书…） | `src/exporters/`，复制 `generic.js` 改造 |
| 新增 AI 供应商 | `src/ai.js` |
| 界面 / 交互 | `public/index.html`（单文件，无构建） |
| 文档、翻译 | `README.md` / `README.en.md` / `docs/` |

## 提交规范

- 提交信息用**中文**，前缀标明类型：`feat:` / `fix:` / `docs:` / `ci:` / `test:` / `chore:`
- 按关注点拆分成小提交，不要把不相关的改动混在一起
- 每个 PR 只做一件事，改动尽量不超过 300 行

## PR 前自检

- [ ] `npm test` 全绿
- [ ] 新功能带测试（纯函数优先）
- [ ] 更新的行为同步改文档
- [ ] 没有提交密钥、`.env`、`data/` 目录

## 设计边界（请先读再改）

这些是刻意的取舍，不接受反向的 PR：

- **不做任何平台的自动发布**：合规红线，也是本项目的差异所在
- **不引入 Redis / Postgres / 消息队列**：保持零外部依赖
- **不加构建步骤**：前端保持单文件原生 JS，`git clone` 后即可修改生效

## 行为准则

参与本项目即表示你同意遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
