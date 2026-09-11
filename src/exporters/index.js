'use strict';
/* 导出器：wechat = 公众号内联样式（由 md2html 提供）；generic = 通用网页；markdown = 原文。
 * 新增导出器：在本目录加一个模块（render/contentType/ext/inlineStyle），无需改路由。 */
const { buildWechatHtml } = require('../md2html');

const wechat = {
  id: 'wechat',
  label: '公众号',
  contentType: 'text/html; charset=utf-8',
  ext: 'html',
  inlineStyle: true,
  render: (title, md) => buildWechatHtml(title, md)
};

const generic = {
  id: 'generic',
  label: '通用网页',
  contentType: 'text/html; charset=utf-8',
  ext: 'html',
  inlineStyle: true,
  render: (title, md) => {
    const { renderMarkdown, esc } = require('../md2html');
    return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
      esc(title) + '</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;max-width:680px;margin:0 auto;padding:24px 16px;line-height:1.75;color:#24292f}h1{font-size:22px;line-height:1.4}h2{font-size:18px;margin:24px 0 10px}pre{background:#f6f8fa;padding:12px;border-radius:8px;overflow:auto}code{background:#f6f8fa;padding:1px 5px;border-radius:4px}blockquote{border-left:4px solid #d0d7de;margin:12px 0;padding:4px 14px;color:#57606a;background:#f6f8fa}</style></head><body><h1>' +
      esc(title) + '</h1>' + renderMarkdown(md) + '</body></html>';
  }
};

const markdown = {
  id: 'markdown',
  label: 'Markdown 原文',
  contentType: 'text/markdown; charset=utf-8',
  ext: 'md',
  inlineStyle: false,
  render: (title, md) => '# ' + title + '\n\n' + md
};

const registry = { wechat, generic, markdown };

function resolveFormat(channel, queryFormat) {
  if (queryFormat && registry[queryFormat]) return queryFormat;
  if (channel === '公众号') return 'wechat';
  return 'generic';
}

function render(format, title, md) {
  const e = registry[format] || registry.generic;
  return { id: e.id, body: e.render(title, md), contentType: e.contentType, ext: e.ext, inlineStyle: !!e.inlineStyle };
}

module.exports = { registry, resolveFormat, render };
