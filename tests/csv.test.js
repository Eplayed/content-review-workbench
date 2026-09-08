'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseMaterialsCsv } = require('../src/csv');

test('无表头：按 标题,标签,正文 位置解析', () => {
  const { rows, skipped } = parseMaterialsCsv('标题A,标签1,正文内容');
  assert.strictEqual(skipped, 0);
  assert.deepStrictEqual(rows[0], { title: '标题A', tags: '标签1', content: '正文内容' });
});

test('带表头：列乱序也能映射，引号内逗号与换行合法', () => {
  const csv = '标签,标题,正文\n"AI,选题",T1,"第一行\n第二行"';
  const { rows } = parseMaterialsCsv(csv);
  assert.deepStrictEqual(rows[0], { title: 'T1', tags: 'AI,选题', content: '第一行\n第二行' });
});

test('引号内转义引号', () => {
  const { rows } = parseMaterialsCsv('A,"他说""你好""，然后",C');
  assert.strictEqual(rows[0].tags, '他说"你好"，然后');
});

test('兼容 BOM、\\r\\n 与空行', () => {
  const csv = '\uFEFF标题,标签,正文\r\n甲,,内容甲\r\n\r\n乙,,内容乙\r\n';
  const { rows } = parseMaterialsCsv(csv);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].title, '甲');
  assert.strictEqual(rows[1].content, '内容乙');
});

test('缺标题或缺正文的行计入 skipped', () => {
  const { rows, skipped } = parseMaterialsCsv('只有标题,标签,\n完整,标签,正文');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(skipped, 1);
});

test('空文本返回空', () => {
  const { rows } = parseMaterialsCsv('');
  assert.strictEqual(rows.length, 0);
});
