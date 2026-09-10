'use strict';
/* 数据层：SQLite 单文件（Node 22.5+ 内置 node:sqlite，零原生依赖）。
 * 建表与版本升级统一由 src/migrations.js 负责。 */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { runMigrations } = require('./migrations');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

/** 创建数据库实例并迁移到最新版本（文件路径或 :memory:），供服务与测试共用 */
function createDb(target, opts) {
  const db = new DatabaseSync(target);
  if (target !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  runMigrations(db, opts && opts.log);
  return db;
}

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const db = createDb(path.join(DATA_DIR, 'workbench.db'), { log: console.log });

const now = () => new Date().toISOString();
const today = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

module.exports = { db, now, today, createDb, DATA_DIR };
