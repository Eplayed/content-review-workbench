'use strict';
/* 数据库迁移：_migrations 记录已应用版本，按序执行、失败回滚。
 * 老库（无 _migrations 但已有业务表）自动把 001 记为已应用，保证升级不丢数据。 */

const nowIso = () => new Date().toISOString();

const MIGRATIONS = [
  {
    id: '001_init',
    desc: '初始四表：materials / articles / metrics / settings',
    up(db) {
      db.exec(`
CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content_md TEXT NOT NULL DEFAULT '',
  content_html TEXT NOT NULL DEFAULT '',
  material_id INTEGER,
  channel TEXT NOT NULL DEFAULT '',
  review_state TEXT NOT NULL DEFAULT 'pending' CHECK (review_state IN ('pending','reviewed','published')),
  checklist TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  collects INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  fans_delta INTEGER NOT NULL DEFAULT 0,
  recorded_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);
    }
  },
  {
    id: '002_indexes',
    desc: '列表与聚合查询索引',
    up(db) {
      db.exec(`
CREATE INDEX IF NOT EXISTS idx_articles_state ON articles(deleted, review_state, created_at);
CREATE INDEX IF NOT EXISTS idx_articles_created ON articles(deleted, created_at);
CREATE INDEX IF NOT EXISTS idx_metrics_article ON metrics(article_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_materials_deleted ON materials(deleted, created_at);
`);
    }
  }
];

/** 已应用的迁移 id 列表 */
function appliedIds(db) {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  return db.prepare('SELECT id FROM _migrations ORDER BY id').all().map((r) => r.id);
}

/**
 * 执行未应用的迁移。
 * 老库（有业务表但无迁移记录）：001 走「基线对齐」——仍幂等重跑一遍（CREATE TABLE IF NOT EXISTS 会自动补齐缺表），
 * 但记为历史基线、不计入本次新应用列表。
 * @returns {string[]} 本次新应用的迁移 id
 */
function runMigrations(db, log) {
  const applied = appliedIds(db);
  const set = new Set(applied);
  const legacy = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='articles'").get();

  const freshly = [];
  for (const m of MIGRATIONS) {
    if (set.has(m.id)) continue;
    const baseline = !!legacy && applied.length === 0 && m.id === '001_init';
    db.exec('BEGIN');
    try {
      m.up(db);
      db.prepare('INSERT INTO _migrations(id, applied_at) VALUES(?, ?)').run(m.id, nowIso());
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error('数据库迁移失败 ' + m.id + '：' + e.message);
    }
    if (baseline) {
      if (log) log('[migrate] 检测到历史数据库，基线对齐（001_init 已幂等重跑，缺失表已补齐）');
    } else {
      freshly.push(m.id);
      if (log) log('[migrate] 已应用 ' + m.id + ' · ' + m.desc);
    }
  }
  return freshly;
}

/** 当前数据库版本（最后一条迁移 id），未迁移过返回 null */
function currentVersion(db) {
  try {
    const rows = appliedIds(db);
    return rows.length ? rows[rows.length - 1] : null;
  } catch (e) {
    return null;
  }
}

module.exports = { MIGRATIONS, runMigrations, currentVersion, appliedIds };
