'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadRules, loadRulesCached, clearRuleCache, runRules, validateRule, defaultBuiltinDir } = require('../src/rules');
const { detectAiStyle } = require('../src/detector');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'crw-rules-'));
}

test('内置规则全部合法且数量达到预期', () => {
  const rules = loadRules({ customDir: null });
  assert.ok(rules.length >= 15, '内置规则应 ≥15 条，实际 ' + rules.length);
  const ids = rules.map((r) => r.id);
  ['contrast', 'textbook-heading', 'filler'].forEach((id) => assert.ok(ids.includes(id), '缺内置规则 ' + id));
  assert.ok(new Set(ids).size === ids.length, '规则 id 不得重复');
  rules.forEach((r) => assert.strictEqual(r.source, 'builtin'));
});

test('自定义规则目录：新规则可加载，同 id 覆盖内置', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'my-rule.json'), JSON.stringify({
    id: 'my-rule', title: '自定义规则', type: 'regex', severity: 'red', patterns: ['测试词']
  }), 'utf8');
  fs.writeFileSync(path.join(dir, 'contrast.json'), JSON.stringify({
    id: 'contrast', title: '覆盖后的对比修辞', type: 'regex', severity: 'yellow', patterns: ['不是']
  }), 'utf8');

  const rules = loadRules({ customDir: dir });
  const mine = rules.find((r) => r.id === 'my-rule');
  const contrast = rules.find((r) => r.id === 'contrast');
  assert.strictEqual(mine.source, 'custom');
  assert.strictEqual(contrast.source, 'custom', '同 id 应被自定义覆盖');
  assert.strictEqual(contrast.title, '覆盖后的对比修辞');
  assert.strictEqual(loadRules({ customDir: dir }).length, loadRules({ customDir: null }).length + 1);
});

test('非法规则被拒绝且报错可读', () => {
  assert.throws(() => validateRule({ title: 'x', type: 'regex' }, 'f.json'), /缺少字段 id/);
  assert.throws(() => validateRule({ id: 'a', title: 'x', type: 'nope' }, 'f.json'), /type 必须是/);
  assert.throws(() => validateRule({ id: 'a', title: 'x', type: 'regex', patterns: [] }, 'f.json'), /patterns/);
  assert.throws(() => validateRule({ id: 'a', title: 'x', type: 'regex', patterns: ['('] }, 'f.json'), /正则非法/);
  assert.throws(() => validateRule({ id: 'BAD ID', title: 'x', type: 'regex', patterns: ['a'] }, 'f.json'), /id 需为/);
  assert.throws(() => validateRule({ id: 'a', title: 'x', type: 'filler', words: ['a'] }, 'f.json'), /minHits/);
});

test('规则文件 JSON 损坏时报错含文件名', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'broken.json'), '{ not json', 'utf8');
  assert.throws(() => loadRules({ customDir: dir }), /broken\.json/);
});

test('新增通用规则生效：黑话堆砌（红色）与万能开头（黄色）', () => {
  const text = '# 标题\n\n随着 AI 技术的发展，行业迎来变革。我们要以赋能为抓手，打造内容闭环，形成生态位。';
  const findings = detectAiStyle(text);
  const rules = findings.map((f) => f.ruleId);
  assert.ok(rules.includes('jargon-stack'), '应命中行业黑话堆砌：' + JSON.stringify(findings.map((f) => f.rule)));
  assert.ok(rules.includes('cliche-open'), '应命中万能开头');
  const jargon = findings.find((f) => f.ruleId === 'jargon-stack');
  assert.strictEqual(jargon.severity, 'red');
});

test('绝对化表述达到阈值升级为红标', () => {
  const one = detectAiStyle('这个方案 100% 有效。');
  const oneHits = one.filter((f) => f.ruleId === 'absolute-claim');
  assert.strictEqual(oneHits.length, 1);
  assert.strictEqual(oneHits[0].severity, 'yellow');

  const two = detectAiStyle('这个方案 100% 有效，而且一定能落地。');
  const twoHits = two.filter((f) => f.ruleId === 'absolute-claim');
  assert.strictEqual(twoHits.length, 2, '应有两条逐条命中（黄标）');
  assert.ok(two.some((f) => f.severity === 'red' && f.ruleId === 'absolute-claim:escalate'), '达到阈值应产生升级红标');
});

test('runRules 输出契约稳定（rule/ruleId/severity/snippet/idx）', () => {
  const rules = loadRules({ customDir: null });
  const findings = runRules(rules, '不是甲，而是乙。', { disabled: [] });
  assert.ok(findings.length >= 1);
  findings.forEach((f) => {
    assert.strictEqual(typeof f.rule, 'string');
    assert.strictEqual(typeof f.ruleId, 'string');
    assert.ok(['red', 'yellow'].includes(f.severity));
    assert.strictEqual(typeof f.snippet, 'string');
    assert.strictEqual(typeof f.idx, 'number');
  });
  // 红标排在最前
  const firstYellow = findings.findIndex((f) => f.severity === 'yellow');
  const lastRed = findings.map((f) => f.severity).lastIndexOf('red');
  if (firstYellow > -1 && lastRed > -1) assert.ok(lastRed < firstYellow, '红标应排在黄标之前');
});

test('打开与关闭规则：disabled 按 id 生效', () => {
  const text = '随着时代的发展，我们要赋能业务。';
  assert.ok(detectAiStyle(text).length > 0);
  const off = detectAiStyle(text, { disabled: ['cliche-open', 'jargon-stack'] });
  assert.strictEqual(off.length, 0);
});

test('缓存可被清空（新增规则后立即生效）', () => {
  const dir = tmpDir();
  const before = loadRulesCached({ customDir: dir }).length;
  fs.writeFileSync(path.join(dir, 'hot.json'), JSON.stringify({ id: 'hot', title: '热更新', type: 'regex', patterns: ['热更新测试'] }), 'utf8');
  assert.strictEqual(loadRulesCached({ customDir: dir }).length, before, 'TTL 内命中缓存');
  clearRuleCache();
  assert.strictEqual(loadRulesCached({ customDir: dir }).length, before + 1, '清缓存后应加载到新规则');
});

test('内置规则目录存在且可写文档化（供 docs/RULES.md 引用）', () => {
  assert.ok(fs.existsSync(defaultBuiltinDir()));
});
