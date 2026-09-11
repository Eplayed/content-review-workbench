'use strict';
/* AI 腔检测：规则引擎的薄封装（对外 API 保持稳定）。
 * 规则不再是代码，而是 JSON：rules/builtin/*.json + DATA_DIR/rules/*.json
 * 新增一条规则见 docs/RULES.md，无需改动本文件。 */
const { loadRulesCached, runRules, clearRuleCache } = require('./rules');

/** 兼容旧调用方（历史导出） */
const FILLERS = ['首先', '其次', '综上所述', '总而言之', '值得注意的是'];

/**
 * @param {string} md 文章 Markdown
 * @param {object} [opts] { disabled?: string[], rules?: object[], customDir?: string }
 * @returns {Array<{rule:string,ruleId:string,severity:'red'|'yellow',snippet:string,idx:number}>}
 */
function detectAiStyle(md, opts) {
  const o = opts || {};
  const rules = o.rules || loadRulesCached(o.customDir === undefined ? undefined : { customDir: o.customDir });
  return runRules(rules, md, { disabled: o.disabled });
}

module.exports = { detectAiStyle, FILLERS, clearRuleCache };
