'use strict';
/* Markdown → 公众号正文（内联样式 HTML）。
 * 公众号编辑器会剥离 <style> 标签，因此所有样式必须内联。 */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function mdInline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function renderMarkdown(md) {
  const lines = String(md || '').split('\n');
  const out = [];
  let inUl = false, inOl = false, inQ = false, buf = '';
  const flushP = () => { if (buf) { out.push('<p>' + mdInline(esc(buf)) + '</p>'); buf = ''; } };
  const closeLists = () => {
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
    if (inQ) { out.push('</blockquote>'); inQ = false; }
  };
  for (const l of lines) {
    if (/^\s*$/.test(l)) { flushP(); closeLists(); continue; }
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) { flushP(); closeLists(); out.push('<h' + h[1].length + '>' + mdInline(esc(h[2])) + '</h' + h[1].length + '>'); continue; }
    if (/^(\*{3,}|-{3,})\s*$/.test(l)) { flushP(); closeLists(); out.push('<hr>'); continue; }
    if (/^>\s?/.test(l)) {
      flushP();
      if (!inQ) { closeLists(); out.push('<blockquote>'); inQ = true; }
      out.push('<p>' + mdInline(esc(l.replace(/^>\s?/, ''))) + '</p>');
      continue;
    }
    const ul = l.match(/^[-*]\s+(.*)$/);
    if (ul) {
      flushP();
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inUl) { closeLists(); out.push('<ul>'); inUl = true; }
      out.push('<li>' + mdInline(esc(ul[1])) + '</li>');
      continue;
    }
    const ol = l.match(/^(\d+)[.、]\s+(.*)$/);
    if (ol) {
      flushP();
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (!inOl) { closeLists(); out.push('<ol>'); inOl = true; }
      out.push('<li>' + mdInline(esc(ol[2])) + '</li>');
      continue;
    }
    closeLists();
    buf += l;
  }
  flushP(); closeLists();
  return out.join('\n');
}

function buildWechatHtml(title, md) {
  let body = renderMarkdown(md);
  body = body
    .replace(/<h1>/g, '<h1 style="margin:28px 0 14px;font-size:20px;font-weight:700;color:#1f2329;line-height:1.4">')
    .replace(/<h2>/g, '<h2 style="margin:28px 0 12px;font-size:17px;font-weight:700;color:#1f2329;border-left:4px solid #4f46e5;padding-left:10px;line-height:1.4">')
    .replace(/<h3>/g, '<h3 style="margin:22px 0 10px;font-size:15px;font-weight:700;color:#1f2329">')
    .replace(/<h4>/g, '<h4 style="margin:18px 0 8px;font-size:14px;font-weight:700;color:#1f2329">')
    .replace(/<p>/g, '<p style="margin:12px 0">')
    .replace(/<blockquote>/g, '<blockquote style="margin:14px 0;padding:10px 14px;background:#f3f4f6;border-left:3px solid #9ca3af;border-radius:0 8px 8px 0;color:#4b5563">')
    .replace(/<ul>/g, '<ul style="padding-left:22px;margin:12px 0">')
    .replace(/<ol>/g, '<ol style="padding-left:22px;margin:12px 0">')
    .replace(/<li>/g, '<li style="margin:6px 0">')
    .replace(/<hr>/g, '<hr style="border:none;border-top:1px dashed #d1d5db;margin:20px 0">')
    .replace(/<code>/g, '<code style="background:#f3f4f6;border-radius:4px;padding:1px 6px;font-size:13px">')
    .replace(/<strong>/g, '<strong style="color:#111827">');
  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    esc(title) + '</title></head><body><section style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,\'PingFang SC\',\'Microsoft YaHei\',sans-serif;font-size:15px;color:#3f3f3f;line-height:1.75;padding:16px 8px;letter-spacing:.3px">' +
    body +
    '<p style="margin-top:28px;font-size:12px;color:#9ca3af;text-align:center">本文由 AI 辅助生成 · 经人工审核后发布</p>' +
    '</section></body></html>';
}

module.exports = { renderMarkdown, buildWechatHtml, esc };
