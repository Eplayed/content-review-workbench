'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createAuthMiddleware, parseBasic, safeEqual } = require('../src/auth');

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    set(k, v) { this.headers[k] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }
  };
}
function run(mw, req) {
  const res = mockRes();
  let nexted = false;
  mw(req, res, () => { nexted = true; });
  return { nexted, res };
}
const basic = (user, pass) => 'Basic ' + Buffer.from(user + ':' + pass).toString('base64');

test('未配置密码与 token：全部放行（本机默认行为不变）', () => {
  const mw = createAuthMiddleware({});
  assert.strictEqual(run(mw, { path: '/api/articles', headers: {} }).nexted, true);
});

test('配置密码后：无凭证 401 且带 WWW-Authenticate', () => {
  const mw = createAuthMiddleware({ APP_PASSWORD: 'secret' });
  const { nexted, res } = run(mw, { path: '/', headers: {} });
  assert.strictEqual(nexted, false);
  assert.strictEqual(res.statusCode, 401);
  assert.match(res.headers['WWW-Authenticate'], /Basic realm/);
});

test('配置密码后：正确 Basic 放行，错误密码 401', () => {
  const mw = createAuthMiddleware({ APP_PASSWORD: 'secret' });
  assert.strictEqual(run(mw, { path: '/api/articles', headers: { authorization: basic('admin', 'secret') } }).nexted, true);
  assert.strictEqual(run(mw, { path: '/api/articles', headers: { authorization: basic('admin', 'wrong') } }).nexted, false);
});

test('Bearer token 放行；错误 token 拒绝', () => {
  const mw = createAuthMiddleware({ AUTH_TOKEN: 'tk_123' });
  assert.strictEqual(run(mw, { path: '/api/articles', headers: { authorization: 'Bearer tk_123' } }).nexted, true);
  assert.strictEqual(run(mw, { path: '/api/articles', headers: { authorization: 'Bearer nope' } }).nexted, false);
});

test('/api/health 始终放行（容器健康检查）', () => {
  const mw = createAuthMiddleware({ APP_PASSWORD: 'secret', AUTH_TOKEN: 'tk' });
  assert.strictEqual(run(mw, { path: '/api/health', headers: {} }).nexted, true);
});

test('parseBasic 解析非法输入返回 null', () => {
  assert.deepStrictEqual(parseBasic('Basic ' + Buffer.from('admin:pw').toString('base64')), { user: 'admin', pass: 'pw' });
  assert.strictEqual(parseBasic('Bearer abc'), null);
  assert.strictEqual(parseBasic('Basic ' + Buffer.from('no-colon').toString('base64')), null);
  assert.strictEqual(parseBasic(''), null);
});

test('safeEqual 长度不一致返回 false 且不抛错', () => {
  assert.strictEqual(safeEqual('abc', 'abcd'), false);
  assert.strictEqual(safeEqual('abc', 'abc'), true);
  assert.strictEqual(safeEqual('', ''), false);
});
