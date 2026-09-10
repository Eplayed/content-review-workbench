'use strict';
/* 访问鉴权（默认关闭，仅本机使用）：
 *   APP_PASSWORD  启用 HTTP Basic —— 浏览器原生登录框，无需前端代码
 *   AUTH_TOKEN    额外的 Bearer 凭证，供脚本 / CI / 自动化调用
 * /api/health 始终放行，便于容器健康检查。 */
const crypto = require('crypto');

function safeEqual(a, b) {
  const A = Buffer.from(String(a || ''), 'utf8');
  const B = Buffer.from(String(b || ''), 'utf8');
  if (A.length === 0 || A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

function parseBasic(header) {
  if (!header || header.slice(0, 6).toLowerCase() !== 'basic ') return null;
  let raw = '';
  try {
    raw = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
  } catch (e) {
    return null;
  }
  const i = raw.indexOf(':');
  if (i < 0) return null;
  return { user: raw.slice(0, i), pass: raw.slice(i + 1) };
}

/**
 * @param {object} [env] 便于测试注入 { APP_PASSWORD, AUTH_TOKEN, APP_USER }
 * @returns {import('express').RequestHandler}
 */
function createAuthMiddleware(env) {
  const e = env || process.env;
  const password = e.APP_PASSWORD || '';
  const token = e.AUTH_TOKEN || '';
  const user = e.APP_USER || 'admin';

  if (!password && !token) {
    return function noAuth(req, res, next) { next(); };
  }

  return function auth(req, res, next) {
    if (req.path === '/api/health') return next();

    const header = req.headers.authorization || '';

    if (token && /^Bearer\s+/i.test(header) && safeEqual(header.replace(/^Bearer\s+/i, '').trim(), token)) {
      return next();
    }

    if (password) {
      const basic = parseBasic(header);
      if (basic && safeEqual(basic.pass, password) && (basic.user === user || basic.user === '')) {
        return next();
      }
    }

    res.set('WWW-Authenticate', 'Basic realm="content-review-workbench", charset="UTF-8"');
    return res.status(401).json({ error: '需要登录：请配置 APP_PASSWORD 后使用浏览器登录' });
  };
}

module.exports = { createAuthMiddleware, parseBasic, safeEqual };
