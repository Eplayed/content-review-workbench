'use strict';
/* AI 供应商抽象。红线：调用失败显式报错，绝不静默降级。
 *   provider = 'openai'  → OpenAI 兼容接口（baseUrl/model/key 可配）
 *   provider = 'fake'    → 确定性演示草稿（AI_PROVIDER=fake 或设置 provider=fake），CI/集成测试零外网 */

const DEFAULT_SYSTEM = '你是一位资深新媒体主笔，为「人机协同审稿」产线写初稿。要求：\n1. 中文，Markdown 格式，正文 900-1400 字\n2. 规避 AI 腔：全文「不是…而是」对比句式最多 1 次；禁用首先/其次/综上所述等套话；小标题禁止「掌握/理解/学会」式开头，要带具体信息\n3. 观点具体，给可执行步骤，案例至少 1 个\n4. 文末输出一节「## 发布前检查」，列 3 条事实核对项';

const FAKE_DRAFT = [
  '# 演示初稿：把审稿清单用起来的三个做法',
  '',
  '审稿清单不是流程负担，而是返工率的闸门。过去一个月我们用四项清单挡下了全部事实性翻车，做法可以拆成三步。',
  '',
  '## 先把「不可妥协项」钉死',
  '清单第一行永远是事实核查：数字、引语、时间线。案例：上周一篇复盘稿里「转化率提升 3 倍」实际是 1.8 倍，核对环节当场拦下。',
  '',
  '## 让 AI 标注成为默认动作',
  '发布前把「AI 辅助生成 · 经人工审核」写进文末，既是新规要求，也是读者信任的一部分。手工留痕比事后补声明成本低得多。',
  '',
  '## 每周复盘清单本身的命中率',
  '被拦下的问题按类型计数：事实类、表述类、合规类。连续两周零事实类问题，说明信息源质量在上升，可以收紧流程。',
  '',
  '## 发布前检查',
  '- 核对文中全部数字与引语来源',
  '- 确认文末 AI 标注就位',
  '- 检查标题与首段是否有过度承诺'
].join('\n');

function resolveProvider(ai, env) {
  if (env && env.AI_PROVIDER === 'fake') return 'fake';
  if (ai && ai.provider === 'fake') return 'fake';
  return 'openai';
}

function buildUserMessage(material, type, title) {
  return '素材：\n' + material.content + '\n\n文章类型：' + (type || '观点') + '\n' +
    (title ? '选题标题（必须沿用）：' + title : '请自拟一个带信息量的标题（第一行输出 # 标题）');
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/**
 * 生成初稿。
 * @returns {Promise<{provider:string, title:string, content:string}>}
 */
async function generateDraft(opts) {
  const { ai, env, material, type, title, systemPrompt } = opts;
  const provider = resolveProvider(ai, env);

  if (provider === 'fake') {
    const hm = FAKE_DRAFT.match(/^#\s+(.+)$/m);
    return { provider, title: title || (hm ? hm[1].trim() : material.title), content: FAKE_DRAFT };
  }

  if (!(ai && ai.base && ai.model && ai.key)) {
    throw httpError(400, '未配置 AI 接口，请先在设置中填写 OpenAI 兼容配置');
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    const r = await fetch(String(ai.base).replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ai.key },
      body: JSON.stringify({
        model: ai.model,
        messages: [{ role: 'system', content: systemPrompt || DEFAULT_SYSTEM }, { role: 'user', content: buildUserMessage(material, type, title) }],
        temperature: 0.7,
        max_tokens: 2400
      }),
      signal: ctrl.signal
    });
    clearTimeout(timer);
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      const msg = j && j.error && j.error.message ? j.error.message : 'HTTP ' + r.status;
      throw httpError(502, '生成失败：' + msg);
    }
    const c0 = j && j.choices && j.choices[0];
    if (!c0 || !c0.message || !c0.message.content) throw httpError(502, '生成失败：接口返回结构异常');
    const content = String(c0.message.content);
    const hm = content.match(/^#\s+(.+)$/m);
    return { provider, title: title || (hm ? hm[1].trim() : material.title), content };
  } catch (e) {
    clearTimeout(timer);
    if (e.status) throw e;
    throw httpError(502, e.name === 'AbortError' ? '生成超时（120s）' : '生成失败：网络异常或地址不可达');
  }
}

/** 连接测试：fake 直接成功；openai 探测 GET /models */
async function testConnection(opts) {
  const { ai, env } = opts || {};
  const provider = resolveProvider(ai, env);
  if (provider === 'fake') return { ok: true, provider };
  if (!(ai && ai.base && ai.model && ai.key)) return { ok: false, provider, error: '请先保存完整的 AI 配置' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(String(ai.base).replace(/\/+$/, '') + '/models', { headers: { Authorization: 'Bearer ' + ai.key }, signal: ctrl.signal });
    clearTimeout(timer);
    return r.ok ? { ok: true, provider } : { ok: false, provider, error: 'HTTP ' + r.status };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, provider, error: e.name === 'AbortError' ? '连接超时（15s）' : '连接失败：网络异常或地址不可达' };
  }
}

module.exports = { generateDraft, testConnection, resolveProvider, DEFAULT_SYSTEM };
