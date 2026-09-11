'use strict';
/* 入口：node server.js 启动 ≤3 秒，浏览器打开即用 */
const path = require('path');
const express = require('express');
const routes = require('./src/routes');
const { createAuthMiddleware } = require('./src/auth');
const { currentVersion } = require('./src/migrations');
const { db, DATA_DIR } = require('./src/db');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(createAuthMiddleware());
app.use('/api', routes);
app.use(express.static(path.join(__dirname, 'public')));

/* JSON 404 兜底（API 走到这里说明路径不存在） */
app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));
/* 前端路由兜底 → 首页 */
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

/* 统一错误响应，不泄漏堆栈 */
app.use((err, req, res, next) => {
  console.error('[server]', err.message);
  res.status(500).json({ error: '服务器内部错误' });
});

module.exports = { app };

if (require.main === module) {
  const guarded = !!(process.env.APP_PASSWORD || process.env.AUTH_TOKEN);
  app.listen(PORT, () => {
    console.log('AI 内容审稿工作台已启动：http://localhost:' + PORT);
    console.log('  · 数据目录 ' + DATA_DIR + '（迁移版本 ' + currentVersion(db) + '）');
    console.log('  · 访问鉴权 ' + (guarded ? '已启用' : '未启用（建议公网部署时设置 APP_PASSWORD）'));
    console.log('  · AI 供应商 ' + (process.env.AI_PROVIDER || 'openai（OpenAI 兼容接口）'));
  });
}
