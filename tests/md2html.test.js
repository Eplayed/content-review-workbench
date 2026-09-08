'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { renderMarkdown, buildWechatHtml } = require('../src/md2html');

test('标题/加粗/列表/引用/分隔线渲染', () => {
  const html = renderMarkdown('# 标题\n\n**重点**内容\n\n- 甲\n- 乙\n\n> 引用\n\n---');
  assert.ok(html.includes('<h1>标题</h1>'));
  assert.ok(html.includes('<strong>重点</strong>'));
  assert.ok(html.includes('<ul>'));
  assert.ok(html.includes('<li>甲</li>'));
  assert.ok(html.includes('<blockquote>'));
  assert.ok(html.includes('<hr>'));
});

test('HTML 特殊字符先转义，防注入', () => {
  const html = renderMarkdown('正文 <script>alert(1)</script> 结束');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('公众号导出为完整文档且样式内联', () => {
  const doc = buildWechatHtml('标题', '## 小节\n\n正文');
  assert.ok(doc.startsWith('<!DOCTYPE html>'));
  assert.ok(doc.includes('<h2 style='));
  assert.ok(doc.includes('经人工审核后发布'));
  assert.ok(!doc.includes('<style'));
});

test('列表序号支持中文顿号', () => {
  const html = renderMarkdown('1. 甲\n2. 乙');
  assert.ok(html.includes('<ol>'));
  assert.ok(html.includes('<li>乙</li>'));
});
