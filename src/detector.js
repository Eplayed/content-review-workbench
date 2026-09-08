'use strict';
/* AI 腔检测：纯函数、可测试。三条规则来自真实 AI 文风复盘：
 * 1) 对比修辞滥用：「不是…而是」式句型 ≥2 处
 * 2) 教科书式小标题：「掌握/理解/厘清」开头且无冒号信息
 * 3) 车轱辘词密度：过渡套话 ≥3 次
 */

const CONTRAST_RES = [
  /不是[^。！？\n]{1,25}(而是|，是)/g,
  /不再[^。！？\n]{1,25}(而是|，是)/g,
  /与其说[^。！？\n]{1,30}不如说/g
];

const HEADWORD_RE = /^(厘清|掌握|理解|学会|认识|解析|探究|探讨|揭示)/;
const FILLERS = ['首先', '其次', '综上所述', '总而言之', '值得注意的是'];

function countAll(text, word) {
  let n = 0, i = -1;
  while ((i = text.indexOf(word, i + 1)) > -1) n++;
  return n;
}

/**
 * @param {string} md 文章 Markdown 全文
 * @param {object} [opts] { disabled: string[] } 可关闭指定规则（'contrast'|'textbook'|'filler'）
 * @returns {Array<{rule:string, severity:'red'|'yellow', snippet:string, idx:number}>}
 */
function detectAiStyle(md, opts) {
  const disabled = (opts && opts.disabled) || [];
  const text = String(md || '');
  const findings = [];

  // 规则一：对比修辞
  if (!disabled.includes('contrast')) {
    let contrast = 0, m;
    for (const re of CONTRAST_RES) {
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        contrast++;
        findings.push({ rule: '对比修辞', severity: 'yellow', snippet: m[0], idx: m.index });
      }
    }
    if (contrast >= 2) {
      findings.unshift({
        rule: '对比修辞滥用', severity: 'red',
        snippet: '全文命中 ' + contrast + ' 处「不是…而是」式表达，AI 味过重，建议改写大半。',
        idx: -1
      });
    }
  }

  // 规则二：教科书式小标题
  if (!disabled.includes('textbook')) {
    const lines = text.split('\n');
    let pos = 0;
    for (const line of lines) {
      const h = line.match(/^#{1,4}\s+(.*)$/);
      if (h) {
        const ht = h[1];
        if (HEADWORD_RE.test(ht) && !ht.includes('：') && !ht.includes(':')) {
          findings.push({ rule: '教科书式小标题', severity: 'yellow', snippet: ht, idx: pos });
        }
      }
      pos += line.length + 1;
    }
  }

  // 规则三：车轱辘词密度
  if (!disabled.includes('filler')) {
    const detail = [];
    let total = 0;
    for (const w of FILLERS) {
      const c = countAll(text, w);
      if (c > 0) { detail.push(w + '×' + c); total += c; }
    }
    if (total >= 3) {
      findings.unshift({
        rule: '车轱辘词密度高', severity: 'red',
        snippet: '过渡套话出现 ' + total + ' 次（' + detail.join('、') + '），结构感僵硬，建议重排段落逻辑。',
        idx: -1
      });
    }
  }

  return findings;
}

module.exports = { detectAiStyle, FILLERS };
