'use strict';
/* 全部 API 路由。红线：
 * - 不做任何平台自动发布
 * - AI 调用失败显式报错，绝不静默降级
 * - 素材/文章删除为软删除（可恢复）
 * - API key 只存 settings 表，永不返回给前端、不打进日志 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { db, now, today } = require('./db');
const { detectAiStyle, clearRuleCache } = require('./detector');
const { parseMaterialsCsv } = require('./csv');
const { buildBackup, restoreBackup } = require('./backup');
const ai = require('./ai');
const exporters = require('./exporters');
const rulesEngine = require('./rules');

const CHECKLIST_ITEMS = ['事实核查', '数字校验', 'AI 标注就位', '人工增量'];
const DEFAULT_CHANNELS = ['公众号', '头条', '小红书'];
const router = express.Router();

/* ---------- 工具 ---------- */
function getSetting(key, def) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : def;
}
function setSetting(key, val) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(val));
}
function parseCl(s) { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function aiConfig() {
  try { return JSON.parse(getSetting('ai', '{}') || '{}'); } catch (e) { return {}; }
}
function getSystemPrompt() { return getSetting('prompt_system', '') || ai.DEFAULT_SYSTEM; }
function channelsList() {
  try {
    const v = JSON.parse(getSetting('channels', '[]') || '[]');
    if (Array.isArray(v) && v.length && v.every((x) => typeof x === 'string' && x.trim())) return v;
  } catch (e) { /* fallthrough */ }
  return DEFAULT_CHANNELS;
}
function detectorDisabled() {
  try { const d = JSON.parse(getSetting('detector_disabled', '[]') || '[]'); return Array.isArray(d) ? d : []; } catch (e) { return []; }
}
function rowArt(r) {
  return { id: r.id, title: r.title, content_md: r.content_md, channel: r.channel, review_state: r.review_state, checklist: r.checklist, created_at: r.created_at, updated_at: r.updated_at, published_at: r.published_at };
}
function rowMat(r) { return { id: r.id, title: r.title, content: r.content, tags: r.tags, source_type: r.source_type, created_at: r.created_at }; }
function rowMx(r) { return { id: r.id, article_id: r.article_id, views: r.views, likes: r.likes, collects: r.collects, shares: r.shares, fans_delta: r.fans_delta, recorded_at: r.recorded_at }; }

/* ---------- 健康 & 引导 ---------- */
router.get('/health', (req, res) => res.json({ ok: true, mode: 'server' }));

router.get('/bootstrap', (req, res) => {
  const mats = db.prepare('SELECT * FROM materials WHERE deleted=0 ORDER BY created_at DESC, id DESC').all().map(rowMat);
  const arts = db.prepare('SELECT * FROM articles WHERE deleted=0 ORDER BY created_at DESC, id DESC').all().map(rowArt);
  const mx = db.prepare('SELECT * FROM metrics ORDER BY recorded_at DESC, id DESC').all().map(rowMx);
  const c = aiConfig();
  res.json({
    mats, arts, mx,
    ai: { base: c.base || '', model: c.model || '', provider: ai.resolveProvider(c, process.env), configured: !!(c.base && c.model && c.key) },
    options: channelsList(),
    checklistItems: CHECKLIST_ITEMS,
    detector: detectorDisabled(),
    rules: rulesEngine.loadRulesCached().map((r) => ({ id: r.id, title: r.title, source: r.source }))
  });
});

/* ---------- 素材 ---------- */
router.get('/materials', (req, res) => {
  res.json(db.prepare('SELECT * FROM materials WHERE deleted=0 ORDER BY created_at DESC, id DESC').all().map(rowMat));
});
router.post('/materials', (req, res) => {
  const { title, content, tags, source_type } = req.body || {};
  if (!title || !content) return res.status(400).json({ error: '标题和正文必填' });
  const info = db.prepare('INSERT INTO materials(title,content,tags,source_type,created_at) VALUES(?,?,?,?,?)')
    .run(String(title), String(content), String(tags || ''), String(source_type || 'manual'), today());
  const row = db.prepare('SELECT * FROM materials WHERE id=?').get(info.lastInsertRowid);
  res.status(201).json(rowMat(row));
});
router.delete('/materials/:id', (req, res) => {
  db.prepare('UPDATE materials SET deleted=1 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});
router.post('/materials/import', (req, res) => {
  const { csv } = req.body || {};
  if (!csv) return res.status(400).json({ error: '缺少 CSV 内容' });
  const { rows, skipped } = parseMaterialsCsv(csv);
  if (!rows.length) return res.status(400).json({ error: '没有可导入的行：每行需包含标题和正文' });
  const ins = db.prepare('INSERT INTO materials(title,content,tags,source_type,created_at) VALUES(?,?,?,?,?)');
  db.exec('BEGIN');
  try {
    for (const r of rows) ins.run(r.title, r.content, r.tags, 'csv', today());
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: '导入失败：' + e.message });
  }
  res.status(201).json({ imported: rows.length, skipped });
});

/* ---------- 文章（三态流转核心） ---------- */
router.get('/articles', (req, res) => {
  const { state } = req.query;
  let rows;
  if (state && ['pending', 'reviewed', 'published'].includes(state)) {
    rows = db.prepare('SELECT * FROM articles WHERE deleted=0 AND review_state=? ORDER BY created_at DESC, id DESC').all(state);
  } else {
    rows = db.prepare('SELECT * FROM articles WHERE deleted=0 ORDER BY created_at DESC, id DESC').all();
  }
  res.json(rows.map(rowArt));
});
router.get('/articles/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM articles WHERE id=? AND deleted=0').get(req.params.id);
  if (!row) return res.status(404).json({ error: '文章不存在' });
  res.json(rowArt(row));
});
router.post('/articles', (req, res) => {
  const { title, content_md, channel, material_id } = req.body || {};
  if (!title || !content_md) return res.status(400).json({ error: '标题和正文必填' });
  if (channel && !channelsList().includes(channel)) return res.status(400).json({ error: '渠道必须是：' + channelsList().join('/') });
  const info = db.prepare(`INSERT INTO articles(title,content_md,material_id,channel,review_state,checklist,created_at,updated_at)
    VALUES(?,?,?,?,'pending','[]',?,?)`).run(String(title), String(content_md), material_id || null, channel || '', today(), now());
  const row = db.prepare('SELECT * FROM articles WHERE id=?').get(info.lastInsertRowid);
  res.status(201).json(rowArt(row));
});
router.patch('/articles/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM articles WHERE id=? AND deleted=0').get(req.params.id);
  if (!row) return res.status(404).json({ error: '文章不存在' });
  const b = req.body || {};
  const next = {
    title: b.title != null ? String(b.title) : row.title,
    content_md: b.content_md != null ? String(b.content_md) : row.content_md,
    channel: b.channel != null ? String(b.channel) : row.channel,
    checklist: b.checklist != null ? String(b.checklist) : row.checklist,
    review_state: b.review_state != null ? String(b.review_state) : row.review_state,
    published_at: row.published_at
  };
  if (!next.title || !next.content_md) return res.status(400).json({ error: '标题和正文不能为空' });
  if (b.channel != null && next.channel && !channelsList().includes(next.channel)) return res.status(400).json({ error: '渠道必须是：' + channelsList().join('/') });
  if (!['pending', 'reviewed', 'published'].includes(next.review_state)) return res.status(400).json({ error: '非法的审稿状态' });

  if (b.review_state && b.review_state !== row.review_state) {
    if (b.review_state === 'reviewed') {
      const done = parseCl(next.checklist);
      const okAll = CHECKLIST_ITEMS.every((it) => done.includes(it));
      if (!okAll) return res.status(400).json({ error: '审稿清单未完成：全勾后才能标记已审' });
    }
    if (b.review_state === 'published') {
      if (!next.channel) return res.status(400).json({ error: '请先确认发布渠道，再标记已发' });
      if (!next.published_at) next.published_at = today();
    }
    if (b.review_state === 'pending') next.published_at = null;
  }
  db.prepare('UPDATE articles SET title=?,content_md=?,channel=?,checklist=?,review_state=?,published_at=?,updated_at=? WHERE id=?')
    .run(next.title, next.content_md, next.channel, next.checklist, next.review_state, next.published_at, now(), row.id);
  const updated = db.prepare('SELECT * FROM articles WHERE id=?').get(row.id);
  res.json(rowArt(updated));
});
router.delete('/articles/:id', (req, res) => {
  db.prepare('UPDATE articles SET deleted=1, updated_at=? WHERE id=?').run(now(), req.params.id);
  res.json({ ok: true });
});
router.get('/articles/:id/detect', (req, res) => {
  const row = db.prepare('SELECT * FROM articles WHERE id=? AND deleted=0').get(req.params.id);
  if (!row) return res.status(404).json({ error: '文章不存在' });
  let disabled = [];
  try { disabled = JSON.parse(getSetting('detector_disabled', '[]') || '[]'); } catch (e) { disabled = []; }
  res.json({ findings: detectAiStyle(row.content_md, { disabled }) });
});
router.get('/articles/:id/export', (req, res) => {
  const row = db.prepare('SELECT * FROM articles WHERE id=? AND deleted=0').get(req.params.id);
  if (!row) return res.status(404).json({ error: '文章不存在' });
  const format = exporters.resolveFormat(row.channel, req.query.format);
  const out = exporters.render(format, row.title, row.content_md);
  if (out.inlineStyle) db.prepare('UPDATE articles SET content_html=?,updated_at=? WHERE id=?').run(out.body, now(), row.id);
  res.set('Content-Type', out.contentType);
  res.set('Content-Disposition', 'attachment; filename="article-' + row.id + '.' + out.ext + '"');
  res.send(out.body);
});

/* ---------- 数据回填 ---------- */
router.get('/metrics', (req, res) => {
  const { article_id } = req.query;
  const rows = article_id
    ? db.prepare('SELECT * FROM metrics WHERE article_id=? ORDER BY recorded_at DESC, id DESC').all(article_id)
    : db.prepare('SELECT * FROM metrics ORDER BY recorded_at DESC, id DESC').all();
  res.json(rows.map(rowMx));
});
router.post('/metrics', (req, res) => {
  const b = req.body || {};
  const art = db.prepare('SELECT id FROM articles WHERE id=? AND deleted=0').get(b.article_id);
  if (!art) return res.status(400).json({ error: '请先选择已发文章' });
  const num = (v) => Math.max(0, Math.round(Number(v) || 0));
  const info = db.prepare('INSERT INTO metrics(article_id,views,likes,collects,shares,fans_delta,recorded_at) VALUES(?,?,?,?,?,?,?)')
    .run(art.id, num(b.views), num(b.likes), num(b.collects), num(b.shares), b.fans_delta == null ? 0 : Math.round(Number(b.fans_delta) || 0), b.recorded_at || today());
  const row = db.prepare('SELECT * FROM metrics WHERE id=?').get(info.lastInsertRowid);
  res.status(201).json(rowMx(row));
});
router.delete('/metrics/:id', (req, res) => {
  db.prepare('DELETE FROM metrics WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------- 设置（AI 接入 / 检测规则开关） ---------- */
router.get('/settings/ai', (req, res) => {
  const c = aiConfig();
  res.json({ base: c.base || '', model: c.model || '', provider: ai.resolveProvider(c, process.env), configured: !!(c.base && c.model && c.key) });
});
router.put('/settings/ai', (req, res) => {
  const b = req.body || {};
  const old = aiConfig();
  const provider = b.provider === 'fake' ? 'fake' : (b.provider === 'openai' ? 'openai' : (old.provider || 'openai'));
  const next = {
    provider,
    base: String(b.base != null ? b.base : (old.base || '')).trim().replace(/\/+$/, ''),
    model: String(b.model != null ? b.model : (old.model || '')).trim(),
    key: String(b.key != null ? b.key : (old.key || '')).trim()
  };
  setSetting('ai', JSON.stringify(next));
  res.json({ provider: next.provider, base: next.base, model: next.model, configured: !!(next.base && next.model && next.key) });
});
router.post('/settings/ai/test', async (req, res) => {
  const r = await ai.testConnection({ ai: aiConfig(), env: process.env });
  res.json(r);
});
router.get('/settings/prompt', (req, res) => {
  const custom = getSetting('prompt_system', '');
  res.json({ system: getSystemPrompt(), isDefault: !custom });
});
router.put('/settings/prompt', (req, res) => {
  const s = String((req.body || {}).system || '').trim();
  if (!s) return res.status(400).json({ error: 'system 提示词不能为空' });
  if (s.length > 4000) return res.status(400).json({ error: '提示词过长（上限 4000 字符）' });
  setSetting('prompt_system', s);
  res.json({ ok: true });
});
router.delete('/settings/prompt', (req, res) => {
  db.prepare('DELETE FROM settings WHERE key=?').run('prompt_system');
  res.json({ ok: true });
});
router.get('/settings/channels', (req, res) => {
  res.json({ channels: channelsList() });
});
router.put('/settings/channels', (req, res) => {
  const v = req.body && req.body.channels;
  if (!Array.isArray(v) || !v.length || v.length > 12 || !v.every((x) => typeof x === 'string' && x.trim())) {
    return res.status(400).json({ error: 'channels 需为 1-12 个非空字符串的数组' });
  }
  const uniq = Array.from(new Set(v.map((x) => x.trim())));
  setSetting('channels', JSON.stringify(uniq));
  res.json({ channels: uniq });
});
router.get('/settings/detector', (req, res) => {
  res.json({ disabled: detectorDisabled() });
});
router.put('/settings/detector', (req, res) => {
  const ids = rulesEngine.loadRulesCached().map((r) => r.id);
  const d = (req.body && Array.isArray(req.body.disabled)) ? req.body.disabled.filter((x) => ids.includes(x)) : [];
  setSetting('detector_disabled', JSON.stringify(d));
  res.json({ disabled: d });
});

/* ---------- 检测规则（JSON 即规则，可贡献） ---------- */
router.get('/rules', (req, res) => {
  const disabled = new Set(detectorDisabled());
  const rules = rulesEngine.loadRulesCached().map((r) => ({
    id: r.id, title: r.title, type: r.type, severity: r.severity || 'yellow', source: r.source, enabled: !disabled.has(r.id)
  }));
  res.json({ rules });
});
router.post('/rules', (req, res) => {
  try {
    const rule = req.body && req.body.rule ? req.body.rule : req.body;
    const valid = rulesEngine.validateRule(rule, 'request');
    const dir = rulesEngine.defaultCustomDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, valid.id + '.json'), JSON.stringify(valid, null, 2), 'utf8');
    clearRuleCache();
    res.status(201).json({ ok: true, id: valid.id, source: 'custom' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
router.delete('/rules/:id', (req, res) => {
  const id = String(req.params.id || '');
  if (fs.existsSync(path.join(rulesEngine.defaultBuiltinDir(), id + '.json'))) {
    return res.status(400).json({ error: '内置规则不可删除：可用同 id 自定义规则覆盖行为' });
  }
  const file = path.join(rulesEngine.defaultCustomDir(), id + '.json');
  if (!fs.existsSync(file)) return res.status(404).json({ error: '自定义规则不存在' });
  fs.unlinkSync(file);
  clearRuleCache();
  res.json({ ok: true });
});

/* ---------- AI 生成（provider 抽象：openai / fake） ---------- */
router.post('/generate', async (req, res) => {
  const { material_id, type, title } = req.body || {};
  const m = material_id ? db.prepare('SELECT * FROM materials WHERE id=? AND deleted=0').get(material_id) : null;
  if (!m) return res.status(400).json({ error: '请选择素材' });
  const c = aiConfig();
  const provider = ai.resolveProvider(c, process.env);
  if (provider !== 'fake' && !(c.base && c.model && c.key)) {
    return res.status(400).json({ error: '未配置 AI 接口，请先在设置中填写 OpenAI 兼容配置（或选演示模式 provider=fake）' });
  }
  try {
    const out = await ai.generateDraft({ ai: c, env: process.env, material: m, type, title, systemPrompt: getSystemPrompt() });
    res.json({ provider: out.provider, title: out.title, content: out.content });
  } catch (e) {
    res.status(e.status || 502).json({ error: e.message });
  }
});

/* ---------- 备份 / 恢复 ---------- */
router.get('/backup', (req, res) => {
  const payload = buildBackup(db, now());
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="workbench-backup-' + today() + '.json"');
  res.send(JSON.stringify(payload, null, 2));
});
router.post('/backup/restore', (req, res) => {
  try {
    const body = req.body || {};
    const counts = restoreBackup(db, body.payload || body, now(), today());
    res.json({ ok: true, restored: counts });
  } catch (e) {
    res.status(400).json({ error: e.message || '恢复失败' });
  }
});

/* ---------- 示例数据 ---------- */
function seedIds() { try { const v = JSON.parse(getSetting('seed_ids', '[]') || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
router.post('/seed', (req, res) => {
  if (seedIds().length) return res.status(400).json({ error: '示例数据已存在，请先清空' });
  const t = today();
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const ids = [];
  const iM = db.prepare('INSERT INTO materials(title,content,tags,source_type,created_at) VALUES(?,?,?,?,?)');
  ids.push(iM.run('AI 选题方法访谈笔记', '访谈要点：\n- 判断选题看三个信号：搜索量异动、社群追问密度、竞品空窗\n- 「工具+人群」组合公式最容易出爆款\n- 目标读者反复问的是流程，不是原理', 'AI,选题', 'manual', t).lastInsertRowid);
  ids.push(iM.run('读者留言精选：关于写作工具', '「用了 AI 之后产量上去了，但读者说一眼假。」\n「最怕的是数据回填，总是忘。」\n「想要一个能管审稿进度的地方。」', '用户原声', 'manual', t).lastInsertRowid);
  const iA = db.prepare("INSERT INTO articles(title,content_md,channel,review_state,checklist,created_at,updated_at,published_at) VALUES(?,?,?,?,?,?,?,?)");
  ids.push(iA.run('不是工具不好用，而是你没搭好工作流', '## 掌握AI写作的正确姿势\n很多人写不好文章，不是文笔不行，而是流程不对。首先，你要理解工具的边界。其次，你需要掌握选题方法。综上所述，学习 AI 写作不是玄学，而是工程。\n\n值得注意的是，工具只是放大器，判断力才是核心。与其说你在跟 AI 合作，不如说你在跟自己的流程合作。', '公众号', 'pending', '[]', d(5), now(), null).lastInsertRowid);
  ids.push(iA.run('AI 标识新规落地后的内容策略', '新规要求 AI 生成内容显式标注。\n\n**对个人创作者的三点影响：**\n1. 纯 AI 生成的内容流量会重新分配\n2. 人工增量（观点、案例、实测）变得更值钱\n3. 留存审稿记录本身就是合规证据\n\n建议把「AI 标注就位」固化进审稿清单。', '头条', 'pending', '[]', t, now(), null).lastInsertRowid);
  ids.push(iA.run('一周三平台内容复盘：数据与教训', '## 数据\n- 公众号 2 篇，中位阅读 2400\n- 头条 1 篇，阅读 1100\n\n## 教训\n> 先审后发的一篇也没爆，但零翻车。\n\n下周重点：把选题信号做成每日检查项。', '公众号', 'published', JSON.stringify(CHECKLIST_ITEMS), d(4), now(), d(3)).lastInsertRowid);
  const publishedId = ids[ids.length - 1];
  db.prepare('INSERT INTO metrics(article_id,views,likes,collects,shares,fans_delta,recorded_at) VALUES(?,?,?,?,?,?,?)').run(publishedId, 2400, 86, 45, 12, 18, d(2));
  setSetting('seed_ids', JSON.stringify(ids));
  res.json({ ok: true, count: ids.length });
});
router.post('/seed/clear', (req, res) => {
  const ids = seedIds();
  if (!ids.length) return res.json({ ok: true, removed: 0 });
  const ph = ids.map(() => '?').join(',');
  db.prepare('UPDATE materials SET deleted=1 WHERE id IN (' + ph + ')').run(...ids);
  db.prepare('UPDATE articles SET deleted=1, updated_at=? WHERE id IN (' + ph + ')').run(now(), ...ids);
  db.prepare('DELETE FROM metrics WHERE article_id IN (' + ph + ')').run(...ids);
  setSetting('seed_ids', '[]');
  res.json({ ok: true, removed: ids.length });
});

module.exports = router;
