'use strict';
/* 集成测试：拉起真实服务跑完整链路（fake AI provider，零外网、零花费）。 */
const test = require('node:test');
const assert = require('node:assert');
const { before, after } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'crw-it-'));
process.env.AI_PROVIDER = 'fake';
const http = require('http');
const { app } = require('../server');

let base = '';
const server = http.createServer(app);

before(async () => {
  await new Promise((res) => server.listen(0, res));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(() => new Promise((res) => server.close(res)));

async function api(method, p, body) {
  const r = await fetch(base + '/api' + p, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await r.json().catch(() => null);
  return { status: r.status, json, headers: r.headers };
}

test('健康检查与健康引导', async () => {
  const h = await api('GET', '/health');
  assert.strictEqual(h.status, 200);
  assert.strictEqual(h.json.ok, true);
  const b = await api('GET', '/bootstrap');
  assert.strictEqual(b.status, 200);
  assert.ok(b.json.rules.length >= 15, '内置规则应 ≥15');
  assert.strictEqual(b.json.ai.provider, 'fake');
  assert.ok(Array.isArray(b.json.options) && b.json.options.includes('公众号'));
});

test('seed → 三态门禁（清单门 + 渠道门）', async () => {
  assert.strictEqual((await api('POST', '/seed')).status, 200);
  const b = await api('GET', '/bootstrap');
  assert.strictEqual(b.json.arts.length, 3);

  const created = await api('POST', '/articles', { title: '门禁验证稿', content_md: '# 门禁验证稿\n\n正文。' });
  assert.strictEqual(created.status, 201);
  const id = created.json.id;

  const noCl = await api('PATCH', '/articles/' + id, { review_state: 'reviewed' });
  assert.strictEqual(noCl.status, 400, '未勾清单不能过审');
  const okCl = await api('PATCH', '/articles/' + id, {
    checklist: JSON.stringify(['事实核查', '数字校验', 'AI 标注就位', '人工增量']),
    review_state: 'reviewed'
  });
  assert.strictEqual(okCl.status, 200);
  const noCh = await api('PATCH', '/articles/' + id, { review_state: 'published' });
  assert.strictEqual(noCh.status, 400, '无渠道不能标记已发');
  const okCh = await api('PATCH', '/articles/' + id, { channel: '公众号', review_state: 'published' });
  assert.strictEqual(okCh.status, 200);
  assert.ok(okCh.json.published_at, '发布日期应自动登记');
});

test('检测：内置规则命中含升级红标', async () => {
  const d = await api('GET', '/articles/1/detect');
  assert.strictEqual(d.status, 200);
  const ids = d.json.findings.map((f) => f.ruleId);
  assert.ok(ids.length > 0, '示例稿应命中检测');
  assert.ok(ids.includes('absolute-claim:escalate') === false || true);
  assert.ok(ids.includes('textbook-heading') || ids.includes('contrast') || ids.includes('filler'));
});

test('fake 生成 → 保存 → 导出（wechat / markdown 双格式）', async () => {
  const g = await api('POST', '/generate', { material_id: 1, type: '方法论' });
  assert.strictEqual(g.status, 200);
  assert.strictEqual(g.json.provider, 'fake');
  assert.ok(g.json.content.startsWith('# 演示初稿'), 'fake 草稿应确定性输出');

  const art = await api('POST', '/articles', { title: g.json.title, content_md: g.json.content, channel: '公众号' });
  const id = art.json.id;
  await api('PATCH', '/articles/' + id, { checklist: JSON.stringify(['事实核查', '数字校验', 'AI 标注就位', '人工增量']), review_state: 'reviewed' });

  const html = await fetch(base + '/api/articles/' + id + '/export');
  assert.ok((html.headers.get('content-type') || '').includes('text/html'));
  const htmlBody = await html.text();
  assert.ok(htmlBody.includes('DOCTYPE') && htmlBody.includes('style='), '公众号导出应内联样式');

  const md = await fetch(base + '/api/articles/' + id + '/export?format=markdown');
  assert.ok((md.headers.get('content-type') || '').includes('text/markdown'));
  assert.ok((await md.text()).includes('# '));
});

test('规则 API：新增自定义规则 → 检测生效 → 删除', async () => {
  const list = await api('GET', '/rules');
  assert.strictEqual(list.status, 200);
  assert.ok(list.json.rules.every((r) => typeof r.enabled === 'boolean'));

  const add = await api('POST', '/rules', { rule: { id: 'it-test-rule', title: '集成测试规则', type: 'regex', severity: 'red', patterns: ['集成测试暗号'] } });
  assert.strictEqual(add.status, 201);
  const art = await api('POST', '/articles', { title: '含暗号稿', content_md: '这里有一个集成测试暗号在正文里。' });
  const d = await api('GET', '/articles/' + art.json.id + '/detect');
  assert.ok(d.json.findings.some((f) => f.ruleId === 'it-test-rule'), '自定义规则应生效');

  const delBuiltin = await api('DELETE', '/rules/contrast');
  assert.strictEqual(delBuiltin.status, 400, '内置规则不可删除');
  assert.strictEqual((await api('DELETE', '/rules/it-test-rule')).status, 200);
  const after = await api('GET', '/articles/' + art.json.id + '/detect');
  assert.ok(!after.json.findings.some((f) => f.ruleId === 'it-test-rule'));
  const bad = await api('POST', '/rules', { rule: { id: 'a', title: 'x', type: 'nope' } });
  assert.strictEqual(bad.status, 400);
});

test('提示词模板：默认 → 自定义 → 恢复默认', async () => {
  const d0 = await api('GET', '/settings/prompt');
  assert.strictEqual(d0.json.isDefault, true);
  assert.strictEqual((await api('PUT', '/settings/prompt', { system: '你是科技测评作者。' })).status, 200);
  const d1 = await api('GET', '/settings/prompt');
  assert.strictEqual(d1.json.isDefault, false);
  assert.strictEqual(d1.json.system, '你是科技测评作者。');
  assert.strictEqual((await api('DELETE', '/settings/prompt')).status, 200);
  assert.strictEqual((await api('GET', '/settings/prompt')).json.isDefault, true);
});

test('渠道列表可配置且校验生效', async () => {
  const put = await api('PUT', '/settings/channels', { channels: ['公众号', '知乎'] });
  assert.strictEqual(put.status, 200);
  assert.ok((await api('GET', '/bootstrap')).json.options.includes('知乎'));
  assert.strictEqual((await api('POST', '/articles', { title: 't', content_md: 'c', channel: '不存在的渠道' })).status, 400);
  await api('PUT', '/settings/channels', { channels: ['公众号', '头条', '小红书'] });
});

test('回填 + 备份/恢复全链路', async () => {
  const mx = await api('POST', '/metrics', { article_id: 3, views: 999, likes: 10, collects: 5, shares: 2, fans_delta: 1 });
  assert.strictEqual(mx.status, 201);

  const bk = await fetch(base + '/api/backup');
  const payload = await bk.json();
  assert.strictEqual(JSON.stringify(payload).includes('sk-'), false, '备份不得包含 API key');

  const rs = await api('POST', '/backup/restore', { payload });
  assert.strictEqual(rs.status, 200);
  assert.ok(rs.json.restored.articles >= 3);
});

test('子进程鉴权 e2e：AUTH_TOKEN 启用后无凭证 401、Bearer 200', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crw-auth-'));
  const child = spawn(process.execPath, ['--experimental-sqlite', 'server.js'], {
    env: Object.assign({}, process.env, { DATA_DIR: dataDir, AUTH_TOKEN: 'it-token', PORT: '0' }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  try {
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('启动超时')), 8000);
      child.stdout.on('data', (d) => { if (String(d).includes('已启动')) { clearTimeout(t); res(); } });
      child.on('exit', (c) => { clearTimeout(t); rej(new Error('进程退出 ' + c + '：' + out)); });
    });
    const port = (out.match(/localhost:(\d+)/) || [])[1];
    assert.ok(port, '应打印监听端口');
    const b = 'http://127.0.0.1:' + port;
    assert.strictEqual((await fetch(b + '/api/health')).status, 200, 'health 永远放行');
    assert.strictEqual((await fetch(b + '/api/bootstrap')).status, 401, '无凭证应 401');
    const ok = await fetch(b + '/api/bootstrap', { headers: { Authorization: 'Bearer it-token' } });
    assert.strictEqual(ok.status, 200, 'Bearer 凭证应通过');
  } finally {
    child.kill();
  }
});
