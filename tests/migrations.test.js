'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { DatabaseSync } = require('node:sqlite');
const { createDb } = require('../src/db');
const { runMigrations, currentVersion, MIGRATIONS } = require('../src/migrations');

test('全新数据库：全部迁移已应用，关键表与索引存在', () => {
  const db = createDb(':memory:');
  assert.strictEqual(currentVersion(db), MIGRATIONS[MIGRATIONS.length - 1].id);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  ['materials', 'articles', 'metrics', 'settings', '_migrations'].forEach((t) => assert.ok(tables.includes(t), '缺表 ' + t));
  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map((r) => r.name);
  assert.ok(idx.includes('idx_articles_state'), '缺索引 idx_articles_state');
  assert.ok(idx.includes('idx_metrics_article'), '缺索引 idx_metrics_article');
});

test('老库升级：数据保留，001 自动基线，002 正常应用', () => {
  const db = new DatabaseSync(':memory:');
  // 模拟 v0.1.0 的老库：有业务表、没有 _migrations
  db.exec(`
CREATE TABLE materials (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '', source_type TEXT NOT NULL DEFAULT 'manual', created_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE TABLE articles (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content_md TEXT NOT NULL DEFAULT '', content_html TEXT NOT NULL DEFAULT '', material_id INTEGER, channel TEXT NOT NULL DEFAULT '', review_state TEXT NOT NULL DEFAULT 'pending', checklist TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT, deleted INTEGER NOT NULL DEFAULT 0);
`);
  db.prepare("INSERT INTO articles(title,content_md,created_at,updated_at) VALUES('老文章','正文','2026-09-01','2026-09-01T00:00:00Z')").run();

  const freshly = runMigrations(db);
  assert.deepStrictEqual(freshly, ['002_indexes'], '001 应走基线对齐，只新应用 002');
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM articles').get().c, 1, '升级不得丢数据');
  assert.strictEqual(db.prepare('SELECT title FROM articles').get().title, '老文章');
  assert.strictEqual(currentVersion(db), '002_indexes');
});

test('重复执行迁移幂等', () => {
  const db = createDb(':memory:');
  assert.deepStrictEqual(runMigrations(db), []);
});

test('迁移失败会回滚并抛出可读错误', () => {
  const db = createDb(':memory:');
  const bad = { id: '999_bad', desc: '故意失败', up(d) { d.exec('CREATE TABLE ok_table(a)'); d.exec('THIS IS NOT SQL'); } };
  MIGRATIONS.push(bad);
  try {
    assert.throws(() => runMigrations(db), /999_bad/);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
    assert.ok(!tables.includes('ok_table'), '失败迁移必须回滚');
  } finally {
    MIGRATIONS.pop();
  }
});
