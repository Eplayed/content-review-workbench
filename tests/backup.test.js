'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createDb } = require('../src/db');
const { buildBackup, restoreBackup } = require('../src/backup');

function seedSample(db) {
  db.prepare("INSERT INTO materials(id,title,content,tags,source_type,created_at,deleted) VALUES(1,'素材甲','内容','标签','manual','2026-09-01',0)").run();
  db.prepare("INSERT INTO articles(id,title,content_md,material_id,channel,review_state,checklist,created_at,updated_at,published_at,deleted) VALUES(10,'文章甲','# 甲\n正文',1,'公众号','published','[]','2026-09-02','2026-09-02T00:00:00Z','2026-09-03',0)").run();
  db.prepare("INSERT INTO metrics(id,article_id,views,likes,collects,shares,fans_delta,recorded_at) VALUES(100,10,500,20,5,3,2,'2026-09-04')").run();
  db.prepare("INSERT INTO settings(key,value) VALUES('ai',?)").run(JSON.stringify({ base: 'https://api.x.com/v1', model: 'gpt-x', key: 'sk-secret' }));
  db.prepare("INSERT INTO settings(key,value) VALUES('detector_disabled','[\"filler\"]')").run();
  db.prepare("INSERT INTO settings(key,value) VALUES('seed_ids','[1,10]')").run();
}

test('备份包含业务数据与 detector 开关，绝不包含 API key', () => {
  const db = createDb(':memory:');
  seedSample(db);
  const b = buildBackup(db, '2026-09-08T00:00:00Z');
  assert.strictEqual(b.materials.length, 1);
  assert.strictEqual(b.articles.length, 1);
  assert.strictEqual(b.metrics.length, 1);
  assert.strictEqual(JSON.stringify(b).includes('sk-secret'), false);
  assert.strictEqual(b.settings.detector_disabled, '["filler"]');
  assert.ok(!('seed_ids' in b.settings));
  assert.deepStrictEqual(b.settings.ai, { base: 'https://api.x.com/v1', model: 'gpt-x' });
});

test('恢复到空库：外键重映射正确，AI 配置不被覆盖', () => {
  const src = createDb(':memory:');
  seedSample(src);
  const backup = buildBackup(src, '2026-09-08T00:00:00Z');

  const dst = createDb(':memory:');
  dst.prepare("INSERT INTO settings(key,value) VALUES('ai',?)").run(JSON.stringify({ base: 'https://keep.me/v1', model: 'keep', key: 'keep-key' }));
  const counts = restoreBackup(dst, backup, '2026-09-08T01:00:00Z', '2026-09-08');
  assert.deepStrictEqual(counts, { materials: 1, articles: 1, metrics: 1 });

  const art = dst.prepare('SELECT * FROM articles').get();
  const mat = dst.prepare('SELECT * FROM materials').get();
  const mx = dst.prepare('SELECT * FROM metrics').get();
  assert.strictEqual(art.title, '文章甲');
  assert.strictEqual(art.material_id, mat.id, 'material_id 应重映射到新素材 id');
  assert.strictEqual(mx.article_id, art.id, 'metrics.article_id 应重映射到新文章 id');
  assert.strictEqual(mx.views, 500);

  const ai = JSON.parse(dst.prepare("SELECT value FROM settings WHERE key='ai'").get().value);
  assert.strictEqual(ai.key, 'keep-key', '恢复不得覆盖现有 AI 配置');
  assert.strictEqual(dst.prepare("SELECT value FROM settings WHERE key='detector_disabled'").get().value, '["filler"]');
});

test('结构不完整时抛错', () => {
  const db = createDb(':memory:');
  assert.throws(() => restoreBackup(db, { materials: [] }, '', ''));
});
