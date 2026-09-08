'use strict';
/* 备份/恢复：全量 JSON。API key 永不进备份文件（安全红线）。 */

function buildBackup(db, exportedAt) {
  const settings = {};
  const rows = db.prepare('SELECT key,value FROM settings').all();
  for (const r of rows) {
    if (r.key === 'ai') {
      // 只备份 base/model，绝不备份 key
      try {
        const ai = JSON.parse(r.value || '{}');
        settings.ai = { base: ai.base || '', model: ai.model || '' };
      } catch (e) { /* skip */ }
    } else if (r.key !== 'seed_ids') {
      settings[r.key] = r.value;
    }
  }
  return {
    version: 1,
    exportedAt,
    materials: db.prepare('SELECT * FROM materials ORDER BY id').all(),
    articles: db.prepare('SELECT * FROM articles ORDER BY id').all(),
    metrics: db.prepare('SELECT * FROM metrics ORDER BY id').all(),
    settings
  };
}

/** 整库替换式恢复；素材/文章旧 id → 新 id 映射后回填外键 */
function restoreBackup(db, payload, nowIso, todayStr) {
  if (!payload || !Array.isArray(payload.materials) || !Array.isArray(payload.articles) || !Array.isArray(payload.metrics)) {
    throw new Error('备份文件结构不完整');
  }
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM metrics').run();
    db.prepare('DELETE FROM articles').run();
    db.prepare('DELETE FROM materials').run();
    db.prepare("DELETE FROM settings WHERE key NOT IN ('ai')").run();

    const iM = db.prepare('INSERT INTO materials(id,title,content,tags,source_type,created_at,deleted) VALUES(?,?,?,?,?,?,?)');
    const matMap = {};
    for (const m of payload.materials) {
      const info = iM.run(m.id, m.title, m.content, m.tags || '', m.source_type || 'manual', m.created_at, m.deleted ? 1 : 0);
      matMap[m.id] = Number(info.lastInsertRowid);
    }
    const iA = db.prepare('INSERT INTO articles(id,title,content_md,material_id,channel,review_state,checklist,created_at,updated_at,published_at,deleted) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    const artMap = {};
    for (const a of payload.articles) {
      const info = iA.run(a.id, a.title, a.content_md, a.material_id && matMap[a.material_id] ? matMap[a.material_id] : null, a.channel || '', a.review_state || 'pending', a.checklist || '[]', a.created_at, a.updated_at || nowIso, a.published_at || null, a.deleted ? 1 : 0);
      artMap[a.id] = Number(info.lastInsertRowid);
    }
    const iX = db.prepare('INSERT INTO metrics(id,article_id,views,likes,collects,shares,fans_delta,recorded_at) VALUES(?,?,?,?,?,?,?,?)');
    for (const x of payload.metrics) {
      const aid = artMap[x.article_id];
      if (!aid) continue;
      iX.run(x.id, aid, x.views, x.likes, x.collects, x.shares, x.fans_delta, x.recorded_at || todayStr);
    }
    const iS = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    for (const k of Object.keys(payload.settings || {})) {
      if (k === 'ai') continue; // 恢复不覆盖当前 AI 配置
      iS.run(k, String(payload.settings[k]));
    }
    db.exec('COMMIT');
    return { materials: payload.materials.length, articles: payload.articles.length, metrics: payload.metrics.length };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { buildBackup, restoreBackup };
