# 检测规则编写指南 · docs/RULES.md

> 一条规则 = 一个 JSON 文件。**写一条可用规则的时间 ≈ 10 分钟**，不需要改任何代码。
> 这是本项目对社区贡献者最友好的入口：你的规则合入后，所有用户的「AI 腔检测」立刻变强。

## 1. 规则放哪里

| 类型 | 目录 | 说明 |
|---|---|---|
| 内置规则 | `rules/builtin/*.json` | 随仓库发布；不可通过 API 删除，可用同 id 自定义规则覆盖 |
| 自定义规则 | `DATA_DIR/rules/*.json`（默认 `data/rules/`） | 你的私有规则；也可通过 `POST /api/rules` 在线创建 |

- 同 `id` 时**自定义覆盖内置**；规则引擎有 3 秒缓存，写文件后调 `clearRuleCache()` 或重启生效
- 内置规则贡献流程：fork → 在 `rules/builtin/` 加 JSON → 在 `tests/rules.test.js` 或你的测试里加用例 → 提 PR

## 2. 规则 Schema

```json
{
  "id": "absolute-claim",
  "title": "绝对化表述",
  "type": "regex",
  "severity": "yellow",
  "description": "给用户看的规则说明（会出现在文档与 API 里）",
  "patterns": ["(100%|一定能|必然会|彻底解决)"],
  "escalate": {
    "minHits": 2,
    "title": "绝对化表述重复",
    "severity": "red",
    "message": "绝对化表述出现 {count} 处，建议改为有条件、有前提的说法（合规风险）。"
  }
}
```

### 公共字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✅ | 2-40 位小写字母/数字/连字符，全局唯一 |
| `title` | ✅ | 检测结果里展示的规则名 |
| `type` | ✅ | `regex` / `heading` / `filler` 三选一 |
| `severity` |  | `red`（严重）/ `yellow`（提示），默认 `yellow` |
| `description` |  | 规则意图，PR 审查时主要看这个 |
| `escalate` |  | 命中次数达到 `minHits` 时追加一条升级红标汇总，`message` 支持 `{count}` `{detail}` 占位 |

### 三种 type

**`regex`** —— 逐条命中会各产生一个 yellow/red 定位项，`escalate` 做汇总：

```json
{ "type": "regex", "patterns": ["不是[^。！？\\n]{1,25}(而是|，是)", "不再[^。！？\\n]{1,25}(而是|，是)"], "threshold 说明见 escalate" }
```

- `patterns`：1-10 条正则字符串，单条 ≤300 字符，非法正则会在加载时被拒绝
- `escalate.minHits`：达到后触发汇总（可选）

**`heading`** —— 检查 Markdown 小标题（`#`~`####`）：

```json
{ "type": "heading", "prefixes": ["掌握", "学会", "厘清"], "requireNoColon": true }
```

- `prefixes`：标题以这些词开头才检查
- `requireNoColon: true`：标题不含「：/:」才标记（带信息量的标题可豁免）

**`filler`** —— 词频统计，达到 `minHits` 直接出一条汇总（不逐条标记）：

```json
{ "type": "filler", "words": ["首先", "其次", "综上所述"], "minHits": 3, "message": "过渡套话出现 {count} 次（{detail}）" }
```

- `{detail}` 会被替换成 `首先×2、其次×1` 形式

## 3. 在线管理（API）

```bash
# 查看全部规则及启用状态
curl http://localhost:3000/api/rules

# 新增/覆盖一条自定义规则（写入 data/rules/<id>.json）
curl -X POST http://localhost:3000/api/rules \
  -H "Content-Type: application/json" \
  -d '{"id":"my-rule","title":"我的规则","type":"regex","severity":"yellow","patterns":["万能模板句"]}'

# 删除自定义规则（内置规则返回 400）
curl -X DELETE http://localhost:3000/api/rules/my-rule
```

设置页的「AI 腔检测规则开关」会动态列出全部规则（含你的自定义规则），按 id 持久化开关状态。

## 4. 写一条好规则的注意事项

1. **先写 `description`**：说清这条规则抓的是什么文风问题、为什么有害
2. **宁可漏报，不要误报**：误报会让人关掉你的规则；阈值先收紧再放宽
3. **带测试**：`tests/rules.test.js` 风格，给你要抓的坏例一句 + 干净的一句
4. **正则用非贪婪**：中文长句注意 `[^。！？\\n]` 控制跨句边界
5. severity 语义：`red` = 大概率要改写；`yellow` = 提醒作者自查
