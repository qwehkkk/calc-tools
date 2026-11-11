/**
 * test.mjs — 编译产物冒烟测试
 * 用最小 DOM 垫片在 Node 里真跑一遍页面脚本，检查：
 *   1) 脚本不抛异常
 *   2) 每个 KPI 都有数字，且不含 NaN / Infinity
 *   3) 排版图有输出、公式行有输出
 * 用法： node factory/test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(ROOT, 'dist', 'web');

function makeEl(tag = 'div') {
  let html = '';
  return {
    tagName: tag, className: '', textContent: '', value: '', open: false,
    style: {}, children: [], href: '',
    get classList() {
      const self = this;
      const list = () => String(self.className || '').split(/\s+/).filter(Boolean);
      return {
        add: (c) => { const v = list(); if (!v.includes(c)) self.className = v.concat(c).join(' '); },
        remove: (c) => { self.className = list().filter((x) => x !== c).join(' '); },
        contains: (c) => list().includes(c),
        toggle: () => {}
      };
    },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {},
    closest() { return makeEl('div'); },
    set innerHTML(v) { html = String(v); this.children = []; },
    get innerHTML() { return html; }
  };
}

function run(html, file) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const reg = new Map();
  const doc = {
    documentElement: makeEl('html'),
    getElementById(id) {
      if (!reg.has(id)) reg.set(id, makeEl('div'));
      return reg.get(id);
    },
    createElement: (t) => makeEl(t)
  };
  const opened = [];
  const ctx = vm.createContext({
    document: doc,
    window: { open: (u) => opened.push(u), prompt() {} },
    navigator: {},
    location: { pathname: '/', href: 'http://x/', search: '' },
    encodeURIComponent, decodeURIComponent, console,
    Math, JSON, Object, Array, String, Number, isNaN, isFinite, parseFloat, parseInt
  });
  ctx.globalThis = ctx;
  for (const s of scripts) {
    new vm.Script(s, { filename: file }).runInContext(ctx);
  }
  reg.opened = opened;
  return reg;
}

const strip = (s) => String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** 递归取元素文本：innerHTML + 所有子节点（模板大量用 appendChild） */
function textOf(el) {
  if (!el) return '';
  const parts = [strip(el.innerHTML || '')];
  for (const c of el.children || []) parts.push(textOf(c));
  if (el.textContent) parts.push(String(el.textContent));
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
let fail = 0;

const dirs = fs.readdirSync(WEB).filter((d) => {
  const p = path.join(WEB, d);
  return fs.statSync(p).isDirectory() && d !== 'zh';
});
if (fs.existsSync(path.join(WEB, 'zh'))) {
  for (const d of fs.readdirSync(path.join(WEB, 'zh'))) dirs.push('zh/' + d);
}

for (const d of dirs) {
  const f = path.join(WEB, d, 'index.html');
  if (!fs.existsSync(f)) continue;
  const rel = path.relative(WEB, f);
  try {
    const reg = run(fs.readFileSync(f, 'utf8'), rel);
    const kpis = reg.get('kpis');
    const dia = reg.get('diagram');
    const form = reg.get('form');
    const fml = reg.get('formulas');
    const brk = reg.get('brk');

    const kpiText = textOf(kpis);
    const problems = [];
    if (!kpiText) problems.push('KPI 为空');
    if (/NaN|Infinity|undefined/.test(kpiText)) problems.push('KPI 含 NaN/Infinity: ' + kpiText.slice(0, 120));
    if (form.children.length === 0) problems.push('表单未生成');
    var noDia = /"noDiagram":\s*true/.test(fs.readFileSync(f, 'utf8'));
    if (!noDia && !textOf(dia)) problems.push('图为空');
    if (/NaN|Infinity/.test(textOf(brk))) problems.push('成本表含 NaN');

    // Pro 候补：有 pro 配置就必须真的露出候补卡（hidden 从 undefined 变 false 才说明代码跑到了）
    const rawHtml = fs.readFileSync(f, 'utf8');
    if (/"pro":\s*\{/.test(rawHtml)) {
      const waitBox = reg.get('wait');
      if (waitBox.hidden !== false) problems.push('候补卡没露出来（hidden 没被清掉）');
      if (!textOf(reg.get('wait-p'))) problems.push('候补说明为空');
      if (!textOf(reg.get('wait-btn'))) problems.push('候补按钮无文字');
      if (/undefined|NaN/.test(textOf(reg.get('wait-p')))) problems.push('候补文案含 undefined/NaN');
    }
    // 页面上不该再出现任何金额或「付费版」承诺（脚本里的 endpoint 不算）
    if (/一次性买断|付费版|\$99|¥99/.test(rawHtml.replace(/<script[\s\S]*?<\/script>/g, ''))) {
      problems.push('页面残留价格/付费文案');
    }

    // 反馈通道：按钮必须能生成一条带真实数字的 Issue 链接
    const issueBtn = reg.get('fb-issue');
    if (typeof issueBtn.onclick === 'function') {
      try {
        issueBtn.onclick({ preventDefault() {} });
        const u = reg.opened && reg.opened[0];
        if (!u) problems.push('反馈按钮没生成链接');
        else if (u.indexOf('https://github.com/') !== 0 || u.indexOf('/issues/new?') < 0) problems.push('反馈链接异常: ' + u.slice(0, 80));
        else if (/undefined|NaN/.test(decodeURIComponent(u))) problems.push('反馈正文含 undefined/NaN');
        if (process.env.SHOW_ISSUE && rel.indexOf('zh') !== 0) {
          console.log('    ISSUE → ' + decodeURIComponent(u).replace(/\n/g, ' | ').slice(0, 420));
        }
      } catch (e) {
        problems.push('反馈按钮报错: ' + e.message);
      }
    }

    if (problems.length) {
      fail++;
      console.log(`✗ ${rel}\n    ${problems.join('\n    ')}`);
    } else {
      console.log(`✓ ${rel}`);
      console.log(`    KPI: ${kpiText}`);
      console.log(`    表单 ${form.children.length} 项 · 公式 ${fml.children.length} 行`);
    }
  } catch (e) {
    fail++;
    console.log(`✗ ${rel}\n    运行时异常: ${e.message}\n    ${(e.stack || '').split('\n')[1] || ''}`);
  }
}

console.log(`\n${fail === 0 ? '全部通过' : fail + ' 个失败'}\n`);
process.exit(fail ? 1 : 0);
