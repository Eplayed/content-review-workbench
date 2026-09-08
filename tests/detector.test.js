'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { detectAiStyle } = require('../src/detector');

test('验收样本必须报 ≥2 处问题', () => {
  const s = '不是工具不够好，而是你不会用。首先，你需要理解原理。其次，掌握方法。综上所述，学习 AI 不是玄学，而是工程。';
  const f = detectAiStyle(s);
  assert.ok(f.length >= 2, '实际报出 ' + f.length + ' 处：' + JSON.stringify(f));
  const rules = f.map((x) => x.rule);
  assert.ok(rules.includes('对比修辞滥用'));
  assert.ok(rules.includes('车轱辘词密度高'));
});

test('对比修辞：单处命中为黄标，两处触发红标汇总', () => {
  const one = detectAiStyle('这不是玄学，而是工程。');
  assert.ok(one.some((x) => x.rule === '对比修辞' && x.severity === 'yellow'));
  assert.ok(!one.some((x) => x.rule === '对比修辞滥用'));
  const two = detectAiStyle('不是工具不行，而是你不会用。这不是玄学，而是工程。');
  assert.ok(two.some((x) => x.rule === '对比修辞滥用' && x.severity === 'red'));
});

test('教科书式小标题：禁词开头且无冒号信息才标记', () => {
  const bad = detectAiStyle('## 掌握AI写作的正确姿势\n\n正文。');
  assert.ok(bad.some((x) => x.rule === '教科书式小标题'));
  const good1 = detectAiStyle('## 掌握：三个信号判断法\n\n正文。');
  assert.ok(!good1.some((x) => x.rule === '教科书式小标题'));
  const good2 = detectAiStyle('## 三个信号判断选题\n\n正文。');
  assert.ok(!good2.some((x) => x.rule === '教科书式小标题'));
});

test('车轱辘词：少于 3 次不标记', () => {
  const f = detectAiStyle('首先，看数据。其次，看案例。就这两步。');
  assert.ok(!f.some((x) => x.rule === '车轱辘词密度高'));
});

test('干净文本零命中', () => {
  const f = detectAiStyle('# 一周三个平台的内容复盘\n\n先看数据：公众号中位阅读 2400。\n\n- 结论一：审稿清单挡住了所有翻车稿\n- 结论二：选题信号要每天看\n\n下周把选题信号做成每日检查项。');
  assert.strictEqual(f.length, 0);
});

test('规则可通过 opts.disabled 关闭', () => {
  const s = '不是工具不够好，而是你不会用。首先，你需要理解原理。其次，掌握方法。综上所述，学习 AI 不是玄学，而是工程。';
  const f = detectAiStyle(s, { disabled: ['contrast'] });
  assert.ok(!f.some((x) => x.rule.startsWith('对比')));
  assert.ok(f.some((x) => x.rule === '车轱辘词密度高'));
});
