'use strict';
/* 检测规则引擎：规则是 JSON，引擎只负责加载、校验、执行。
 *   内置规则：rules/builtin/*.json
 *   自定义规则：DATA_DIR/rules/*.json（同 id 覆盖内置）
 * 规则写法见 docs/RULES.md */
const fs = require('fs');
const path = require('path');

const TYPES = ['regex', 'heading', 'filler'];
const SEVERITIES = ['red', 'yellow'];
const MAX_PATTERN_LEN = 300;
const CACHE_TTL_MS = 3000;

function defaultBuiltinDir() { return path.join(__dirname, '..', 'rules', 'builtin'); }
function defaultCustomDir() {
  const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  return path.join(dataDir, 'rules');
}

function validateRule(r, source) {
  const where = source ? source + '：' : '';
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error(where + '规则必须是 JSON 对象');
  ['id', 'title', 'type'].forEach((k) => {
    if (!r[k] || typeof r[k] !== 'string') throw new Error(where + '缺少字段 ' + k);
  });
  if (!TYPES.includes(r.type)) throw new Error(where + r.id + '：type 必须是 ' + TYPES.join(' / '));
  if (r.severity != null && !SEVERITIES.includes(r.severity)) throw new Error(where + r.id + '：severity 只能是 red / yellow');

  if (r.type === 'regex') {
    if (!Array.isArray(r.patterns) || !r.patterns.length) throw new Error(where + r.id + '：regex 规则需要非空 patterns 数组');
    r.patterns.forEach((p) => {
      if (typeof p !== 'string' || !p.length) throw new Error(where + r.id + '：pattern 必须是非空字符串');
      if (p.length > MAX_PATTERN_LEN) throw new Error(where + r.id + '：pattern 过长（上限 ' + MAX_PATTERN_LEN + ' 字符）');
      try { new RegExp(p, 'g'); } catch (e) { throw new Error(where + r.id + '：正则非法 - ' + e.message); }
    });
  }
  if (r.type === 'heading') {
    if (!Array.isArray(r.prefixes) || !r.prefixes.length) throw new Error(where + r.id + '：heading 规则需要非空 prefixes 数组');
  }
  if (r.type === 'filler') {
    if (!Array.isArray(r.words) || !r.words.length) throw new Error(where + r.id + '：filler 规则需要非空 words 数组');
    if (!(r.minHits >= 1)) throw new Error(where + r.id + '：filler 规则需要 minHits ≥ 1');
  }
  if (r.escalate) {
    if (!(r.escalate.minHits >= 1)) throw new Error(where + r.id + '：escalate.minHits 需 ≥ 1');
    if (r.escalate.severity != null && !SEVERITIES.includes(r.escalate.severity)) throw new Error(where + r.id + '：escalate.severity 只能是 red / yellow');
  }
  // id 格式最后校验：先让 type/patterns 等配置错误优先暴露，报错更可读
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(r.id)) throw new Error(where + 'id 需为 2-40 位小写字母/数字/连字符');
  return r;
}

function readRuleDir(dir) {
  const out = [];
  if (!dir || !fs.existsSync(dir)) return out;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    } catch (e) {
      throw new Error('规则文件解析失败 ' + file + '：' + e.message);
    }
    out.push(validateRule(parsed, file));
  }
  return out;
}

/** 加载规则集合（内置 + 自定义，同 id 时自定义覆盖内置） */
function loadRules(opts) {
  const o = opts || {};
  const builtinDir = o.builtinDir || defaultBuiltinDir();
  const customDir = o.customDir === null ? null : (o.customDir || defaultCustomDir());
  const map = new Map();
  for (const rule of readRuleDir(builtinDir)) map.set(rule.id, Object.assign({}, rule, { source: 'builtin' }));
  for (const rule of readRuleDir(customDir)) map.set(rule.id, Object.assign({}, rule, { source: 'custom' }));
  return Array.from(map.values());
}

let _cache = null;
let _cacheAt = 0;
/** 带短 TTL 缓存的加载（避免每次请求读盘；新增规则后调用 clearRuleCache） */
function loadRulesCached(opts) {
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_TTL_MS) return _cache;
  _cache = loadRules(opts);
  _cacheAt = now;
  return _cache;
}
function clearRuleCache() { _cache = null; _cacheAt = 0; }

function fill(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));
}
function countAll(text, word) {
  let n = 0, i = -1;
  while ((i = text.indexOf(word, i + 1)) > -1) n++;
  return n;
}

/**
 * 执行规则集，返回 findings（与前端 / API 契约一致）
 * @returns {Array<{rule:string,ruleId:string,severity:'red'|'yellow',snippet:string,idx:number}>}
 */
function runRules(rules, md, opts) {
  const disabled = new Set((opts && opts.disabled) || []);
  const text = String(md || '');
  const findings = [];

  for (const rule of rules) {
    if (disabled.has(rule.id)) continue;

    if (rule.type === 'regex') {
      const hits = [];
      for (const p of rule.patterns) {
        const re = new RegExp(p, 'g');
        let m;
        while ((m = re.exec(text)) !== null) {
          hits.push({ snippet: m[0], idx: m.index });
          if (m.index === re.lastIndex) re.lastIndex++; // 防零宽匹配死循环
        }
      }
      hits.sort((a, b) => a.idx - b.idx);
      for (const h of hits) {
        findings.push({ rule: rule.title, ruleId: rule.id, severity: rule.severity || 'yellow', snippet: h.snippet, idx: h.idx });
      }
      if (rule.escalate && hits.length >= rule.escalate.minHits) {
        findings.push({
          rule: rule.escalate.title || rule.title,
          ruleId: rule.id + ':escalate',
          severity: rule.escalate.severity || 'red',
          snippet: fill(rule.escalate.message || '「' + rule.title + '」命中 {count} 处，建议修改。', { count: hits.length }),
          idx: -1
        });
      }
    } else if (rule.type === 'heading') {
      const lines = text.split('\n');
      let pos = 0;
      for (const line of lines) {
        const h = line.match(/^#{1,4}\s+(.*)$/);
        if (h) {
          const t = h[1];
          const starts = rule.prefixes.some((p) => t.indexOf(p) === 0);
          const noColon = !t.includes('：') && !t.includes(':');
          if (starts && (!rule.requireNoColon || noColon)) {
            findings.push({ rule: rule.title, ruleId: rule.id, severity: rule.severity || 'yellow', snippet: t, idx: pos });
          }
        }
        pos += line.length + 1;
      }
    } else if (rule.type === 'filler') {
      const detail = [];
      let total = 0;
      for (const w of rule.words) {
        const c = countAll(text, w);
        if (c > 0) { detail.push(w + '×' + c); total += c; }
      }
      if (total >= rule.minHits) {
        findings.push({
          rule: rule.title,
          ruleId: rule.id,
          severity: rule.severity || 'red',
          snippet: fill(rule.message || '「' + rule.title + '」共出现 {count} 次', { count: total, detail: detail.join('、') }),
          idx: -1
        });
      }
    }
  }

  // 红标在前，同一级别按出现位置
  findings.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'red' ? -1 : 1;
    return a.idx - b.idx;
  });
  return findings;
}

module.exports = { loadRules, loadRulesCached, clearRuleCache, runRules, validateRule, readRuleDir, TYPES, SEVERITIES, defaultBuiltinDir, defaultCustomDir };
