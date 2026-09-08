'use strict';
/* 素材 CSV 解析：纯函数。
 * 支持两种格式：
 * 1) 带表头：首行含「标题」/「正文」/「标签」（顺序不限，缺列用空）
 * 2) 无表头：按 标题,标签,正文 三列位置解析（正文可缺）
 * 兼容 BOM、\r\n、引号包裹字段（内含逗号/换行/转义引号 ""）。 */

/** 把整段 CSV 文本拆成「单元格矩阵」（引号内换行不切行） */
function parseCsvGrid(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let cells = [''], inQ = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQ) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { cells[cells.length - 1] += '"'; i++; }
        else inQ = false;
      } else cells[cells.length - 1] += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') cells.push('');
    else if (ch === '\n') { rows.push(cells); cells = ['']; }
    else if (ch === '\r') { /* skip */ }
    else cells[cells.length - 1] += ch;
  }
  if (cells.some((c) => c.trim() !== '')) rows.push(cells);
  // 丢掉全空行
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * @param {string} text CSV 文本
 * @returns {{rows:Array<{title:string,tags:string,content:string}>, skipped:number}}
 */
function parseMaterialsCsv(text) {
  const grid = parseCsvGrid(text);
  if (!grid.length) return { rows: [], skipped: 0 };
  const head = grid[0].map((c) => c.trim());
  const hasHeader = head.some((c) => ['标题', 'title'].includes(c));
  let idx = { title: 0, tags: 1, content: 2 };
  let start = 0;
  if (hasHeader) {
    idx = { title: head.findIndex((c) => ['标题', 'title'].includes(c)), tags: head.findIndex((c) => ['标签', 'tags', 'tag'].includes(c)), content: head.findIndex((c) => ['正文', '内容', 'content'].includes(c)) };
    start = 1;
  }
  const rows = [];
  let skipped = 0;
  for (let i = start; i < grid.length; i++) {
    const c = grid[i];
    const title = (idx.title > -1 ? c[idx.title] : '').trim();
    const tags = (idx.tags > -1 ? c[idx.tags] : '').trim();
    const content = (idx.content > -1 ? c[idx.content] : '').trim();
    if (!title || !content) { skipped++; continue; }
    rows.push({ title, tags, content });
  }
  return { rows, skipped };
}

module.exports = { parseMaterialsCsv, parseCsvGrid };
