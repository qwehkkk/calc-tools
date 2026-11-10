/**
 * build.mjs — 产品工厂编译器
 *
 *   一个 verticals/*.json  ──►  dist/web/<slug>/            (英文站，SEO)
 *                            ├─  dist/web/zh/<slug>/       (中文站)
 *                            ├─  dist/ext/<slug>/          (Chrome MV3 扩展)
 *                            └─  dist/listing/<slug>.md    (商店上架文案)
 *
 * 用法：  node factory/build.mjs
 * 新增产品：往 verticals/ 里丢一个 json，重跑，就完事。
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const VP = path.resolve(ROOT, '..');
const SITE = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.json'), 'utf8'));
const MODE = SITE.deployMode || 'domain';           // github = 子路径预览；domain = 自定义域根目录
const BASE = MODE === 'github' ? '/' + (SITE.github?.repo || 'calc-tools') : (SITE.base || '');
const REPO = SITE.github ? `https://github.com/${SITE.github.owner}/${SITE.github.repo}` : '';
const ISSUE = REPO ? `${REPO}/issues/new` : '';
const TPL = fs.readFileSync(path.join(ROOT, 'template', 'page.html'), 'utf8');
const ENGINE = [
  fs.readFileSync(path.join(ROOT, 'engine', 'formula.js'), 'utf8'),
  fs.readFileSync(path.join(ROOT, 'engine', 'nesting.js'), 'utf8'),
  fs.readFileSync(path.join(ROOT, 'engine', 'engine.js'), 'utf8')
].join('\n');

const DIRS = {
  web: path.join(ROOT, 'dist', 'web'),
  ext: path.join(ROOT, 'dist', 'ext'),
  listing: path.join(ROOT, 'dist', 'listing')
};
for (const d of Object.values(DIRS)) fs.mkdirSync(d, { recursive: true });

/* ---------------- tiny PNG encoder（无依赖生成图标） ---------------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))]);
}
/** 画一个「排样网格」图标：底色 + 3 块错落矩形，视觉上就是 nesting */
function makeIcon(size, hex) {
  const [, r, g, b] = hex.match(/^#?(\w\w)(\w\w)(\w\w)$/).map((x, i) => i ? parseInt(x, 16) : x);
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const o = (y * size + x) * 4;
    px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = c[3] == null ? 255 : c[3];
  };
  const bg = [13, 20, 24, 255];
  const fg = [r, g, b, 255];
  const fg2 = [Math.min(255, r + 60), Math.min(255, g + 60), Math.min(255, b + 60), 255];
  const rad = size * 0.22;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = Math.min(x, size - 1 - x), dy = Math.min(y, size - 1 - y);
    const inside = dx >= rad || dy >= rad ||
      Math.hypot(Math.max(0, rad - dx), Math.max(0, rad - dy)) <= rad;
    if (inside) set(x, y, bg);
  }
  const u = size / 16, m = u * 1.6;
  const rects = [
    [m, m, u * 7.2, u * 5.4, fg],
    [m, m + u * 6.4, u * 4.6, u * 6.6, fg2],
    [m + u * 5.4, m + u * 6.4, u * 6.8, u * 6.6, fg]
  ];
  for (const [x0, y0, w, h, c] of rects) {
    for (let y = Math.round(y0); y < Math.round(y0 + h); y++)
      for (let x = Math.round(x0); x < Math.round(x0 + w); x++) set(x, y, c);
  }
  return png(size, size, px);
}

/* ---------------- 渲染 ---------------- */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pick = (o, lang) => (typeof o === 'string' ? o : (o?.[lang] ?? o?.en ?? ''));
const slugOf = (v) => v.slug;

function render(v, lang) {
  const isZh = lang === 'zh';
  const prefix = isZh ? '/zh' : '';
  const canonical = `${SITE.domain}${prefix}/${v.slug}/`;
  const title = pick(v.seo?.title, lang) || pick(v.headline, lang);
  const desc = pick(v.seo?.desc, lang) || pick(v.sub, lang);
  const cfg = {
    ...v,
    email: SITE.email,
    base: BASE,
    repo: REPO,
    issueUrl: ISSUE,
    storeUrl: SITE.storeUrl || `${BASE}/`,
    langBase: '/zh',
    related: (v.related || []).map((s) => {
      const t = ALL.find((x) => x.slug === s);
      return t ? { href: `${BASE}${prefix}/${t.slug}/`, title: pick(t.name, lang), desc: pick(t.tagline, lang) } : null;
    }).filter(Boolean)
  };

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: pick(v.name, lang),
        url: canonical,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Any',
        description: desc,
        offers: { '@type': 'Offer', price: String(v.price?.value ?? 0), priceCurrency: v.currency || 'USD' }
      },
      {
        '@type': 'FAQPage',
        mainEntity: (v.faq || []).map((f) => ({
          '@type': 'Question',
          name: pick(f.q, lang),
          acceptedAnswer: { '@type': 'Answer', text: pick(f.a, lang) }
        }))
      }
    ]
  };

  const favicon = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0d1418"/><rect x="4" y="4" width="15" height="11" fill="${v.accent || '#1d8a7a'}"/><rect x="4" y="17" width="9" height="11" fill="${v.accent || '#1d8a7a'}" opacity=".6"/><rect x="15" y="17" width="13" height="11" fill="${v.accent || '#1d8a7a'}"/></svg>`
  );

  return TPL
    .replaceAll('__LANGJS__', JSON.stringify(lang))
    .replaceAll('__ENGINE__', ENGINE)
    .replaceAll('__CONFIG__', JSON.stringify(cfg, null, 0))
    .replaceAll('__SITENAME__', esc(pick(SITE.name, lang) || SITE.name))
    .replaceAll('__TITLE__', esc(title))
    .replaceAll('__DESC__', esc(desc))
    .replaceAll('__CANONICAL__', canonical)
    .replaceAll('__FAVICON__', favicon)
    .replaceAll('__JSONLD__', JSON.stringify(ld))
    .replaceAll('__YEAR__', String(new Date().getFullYear()))
    .replaceAll('__BASE__', BASE)
    .replaceAll('__ISSUE__', ISSUE || '#')
    .replaceAll('__MAIL__', `mailto:${SITE.email}`)
    .replaceAll('__REPO__', REPO)
    .replaceAll('__LANG__', isZh ? 'zh-CN' : 'en');
}

/* ---------------- 商店上架文案 ---------------- */
function listing(v) {
  const name = pick(v.name, 'en');
  const shortRaw = pick(v.listing?.short, 'en') || pick(v.tagline, 'en');
  const short = shortRaw.length <= 132 ? shortRaw : shortRaw.slice(0, 129) + '...';
  const keywords = (v.seo?.keywords || []).join(', ');
  return `# ${name} — store listing

## Chrome Web Store
**Name (max 45 chars):** ${name}${name.length > 45 ? '  ⚠️ TOO LONG' : ''}
**Short description (max 132 chars):**
${short}

**Category:** Tools
**Language:** English
**Detailed description:**

${pick(v.listing?.long, 'en') || pick(v.sub, 'en')}

### What it does
${(v.listing?.bullets || []).map((b) => `- ${b}`).join('\n')}

### Permissions justification
${v.listing?.perms || 'No special permissions requested. Everything runs locally in your browser.'}

## SEO
**Target keywords:** ${keywords}
**Canonical:** ${SITE.domain}/${v.slug}/
**Title tag:** ${pick(v.seo?.title, 'en')}

## Pricing
${v.price ? `${v.currency || 'USD'} ${v.price.value} — ${v.price.note?.en || ''}` : 'Free'}

## 首发动作（人工）
1. 传给 3 个真实使用者，要一句具体反馈（哪一步算错了）
2. 把反馈贴进 data/反馈库.csv
3. 商店第一周目标：5 条评价（评分 > 4.2 是排名分水岭）
`;
}

/* ---------------- 汇总页 ---------------- */
function indexPage(list, lang) {
  const isZh = lang === 'zh';
  const prefix = isZh ? '/zh' : '';
  const cards = list.map((v) => `
    <a class="t" href="${BASE}${prefix}/${v.slug}/">
      <div class="tc" style="background:${v.accent || '#1d8a7a'}22;color:${v.accent || '#1d8a7a'}">${esc(pick(v.category, lang).slice(0, lang === 'zh' ? 2 : 1))}</div>
      <div>
        <div class="tn">${esc(pick(v.name, lang))}</div>
        <div class="td">${esc(pick(v.tagline, lang))}</div>
      </div>
    </a>`).join('');
  const t = isZh
    ? { h: '工程计算器：算完就能报价', s: '给车间、作坊、报价员用的计算工具。打开就能用，不用注册。', all: '全部工具' }
    : { h: 'Calculators that end in a number you can quote', s: 'Built for the shop floor, the studio and the quoting desk. No signup, no install.', all: 'All tools' };
  return `<!DOCTYPE html><html lang="${isZh ? 'zh-CN' : 'en'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t.all)} · ${esc(pick(SITE.name, lang) || SITE.name)}</title>
<meta name="description" content="${esc(t.s)}">
<link rel="canonical" href="${SITE.domain}${prefix}/">
<style>
:root{--ink:#12171f;--ink2:#5b6675;--line:#e3e7ed;--brand:#0f5c5c}
*{margin:0;padding:0;box-sizing:border-box}
body{background:#f6f7f9;color:var(--ink);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.w{max-width:1000px;margin:0 auto;padding:0 20px}
header{background:#0d1418;color:#e8eef2}
.hd{height:56px;display:flex;align-items:center;gap:10px;font-weight:650}
.hd i{width:22px;height:22px;border-radius:5px;background:linear-gradient(135deg,#1d8a7a,#0f5c5c)}
h1{font-size:30px;letter-spacing:-.02em;line-height:1.25;margin:38px 0 8px;max-width:680px}
.sub{color:var(--ink2);margin-bottom:28px}
.list{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;padding-bottom:60px}
.t{display:flex;gap:13px;align-items:flex-start;background:#fff;border:1px solid var(--line);
 border-radius:10px;padding:16px;text-decoration:none;color:inherit;transition:.14s}
.t:hover{border-color:#b9c6d1;transform:translateY(-2px);box-shadow:0 6px 18px rgba(16,24,32,.06)}
.tc{width:34px;height:34px;border-radius:8px;display:grid;place-items:center;font-size:12px;font-weight:700;flex:none}
.tn{font-weight:620;letter-spacing:-.01em}
.td{color:var(--ink2);font-size:13px;margin-top:3px}
</style></head><body>
<header><div class="w hd"><i></i>${esc(pick(SITE.name, lang) || SITE.name)}</div></header>
<main class="w"><h1>${esc(t.h)}</h1><p class="sub">${esc(t.s)}</p><div class="list">${cards}</div></main>
</body></html>`;
}

/* ---------------- 主流程 ---------------- */
const files = fs.readdirSync(path.join(ROOT, 'verticals'))
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'));
let ALL = files.map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'verticals', f), 'utf8')))
  .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

const stats = [];
for (const v of ALL) {
  const errs = [];
  if (!v.slug || !/^[a-z0-9-]+$/.test(v.slug)) errs.push('slug 必须是小写字母数字加连字符');
  if (!v.inputs?.length) errs.push('缺少 inputs');
  if (!v.outputs?.length) errs.push('缺少 outputs');
  if (!v.sheets?.length) errs.push('缺少 sheets');
  if (errs.length) { console.error(`✗ ${v.slug}: ${errs.join('; ')}`); continue; }

  for (const lang of ['en', 'zh']) {
    const out = path.join(DIRS.web, lang === 'zh' ? 'zh' : '', v.slug);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'index.html'), render(v, lang), 'utf8');
  }

  // 扩展：同一份 HTML 直接复用，离线运行，审核最省事
  const extDir = path.join(DIRS.ext, v.slug);
  fs.mkdirSync(path.join(extDir, 'icons'), { recursive: true });
  fs.writeFileSync(path.join(extDir, 'app.html'), render(v, 'en'), 'utf8');
  fs.writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify({
    manifest_version: 3,
    name: pick(v.name, 'en'),
    version: v.version || '0.1.0',
    description: (pick(v.seo?.desc, 'en') || pick(v.sub, 'en')).slice(0, 132),
    action: { default_title: pick(v.name, 'en') },
    background: { service_worker: 'sw.js' },
    icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
    permissions: ['storage'],
    offline_enabled: true
  }, null, 2), 'utf8');
  fs.writeFileSync(path.join(extDir, 'sw.js'),
    `chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('app.html');
  const tabs = await chrome.tabs.query({ url });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
});
`, 'utf8');
  for (const s of [16, 32, 48, 128]) {
    fs.writeFileSync(path.join(extDir, 'icons', `${s}.png`), makeIcon(s, v.accent || '#1d8a7a'));
  }

  fs.writeFileSync(path.join(DIRS.listing, `${v.slug}.md`), listing(v), 'utf8');
  stats.push({ slug: v.slug, name: pick(v.name, 'en'), priority: v.priority ?? 99 });
}

// 汇总页
for (const lang of ['en', 'zh']) {
  const out = path.join(DIRS.web, lang === 'zh' ? 'zh' : '');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'index.html'), indexPage(ALL, lang), 'utf8');
}

// sitemap / robots / llms.txt
const urls = [];
for (const lang of ['en', 'zh']) {
  const p = lang === 'zh' ? '/zh' : '';
  urls.push(`${SITE.domain}${p}/`);
  ALL.forEach((v) => urls.push(`${SITE.domain}${p}/${v.slug}/`));
}
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(DIRS.web, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${ALL.map((v) => `  <url>
    <loc>${SITE.domain}/${v.slug}/</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${SITE.domain}/${v.slug}/"/>
    <xhtml:link rel="alternate" hreflang="zh" href="${SITE.domain}/zh/${v.slug}/"/>
    <lastmod>${today}</lastmod><priority>0.9</priority>
  </url>
  <url><loc>${SITE.domain}/zh/${v.slug}/</loc><lastmod>${today}</lastmod><priority>0.8</priority></url>`).join('\n')}
  <url><loc>${SITE.domain}/</loc><lastmod>${today}</lastmod><priority>1.0</priority></url>
</urlset>
`, 'utf8');
fs.writeFileSync(path.join(DIRS.web, 'robots.txt'),
  `User-agent: *\nAllow: /\nSitemap: ${SITE.domain}/sitemap.xml\n`, 'utf8');
fs.writeFileSync(path.join(DIRS.web, 'llms.txt'),
  `# ${SITE.name}\n\n> ${SITE.tagline || 'Engineering calculators for the shop floor.'}\n\n` +
  ALL.map((v) => `- [${pick(v.name, 'en')}](${SITE.domain}/${v.slug}/): ${pick(v.tagline, 'en')}`).join('\n') + '\n',
  'utf8');

/* ---------------- 隐私与条款（Chrome 商店审核要求可访问的隐私政策） ---------------- */
function legalPage(kind, lang) {
  const isZh = lang === 'zh';
  const prefix = isZh ? '/zh' : '';
  const P = {
    privacy: {
      h: isZh ? '隐私政策' : 'Privacy Policy',
      body: isZh ? `
<p>本站在你的浏览器里完成全部计算。你输入的尺寸、价格、数量<strong>不会被发送到任何服务器</strong>，也不会被保存到任何数据库。</p>
<h2 style="font-size:15px;margin:22px 0 8px">我们不收集什么</h2>
<ul><li>不收集输入数据</li><li>不设置追踪 Cookie</li><li>不接入第三方分析或广告脚本</li><li>不要求注册、不要邮箱</li></ul>
<h2 style="font-size:15px;margin:22px 0 8px">浏览器扩展</h2>
<p>扩展在本机离线运行，不申请任何网站访问权限，不读取你正在浏览的页面。唯一申请的权限是本地存储，用于记住你上次填的参数，该数据只存在你自己的电脑上。</p>
<h2 style="font-size:15px;margin:22px 0 8px">你要主动发邮件时</h2>
<p>反馈邮件是你主动发送的，其中包含你的邮箱地址和邮件正文。这些内容只用于回复你并修正公式，不会转给第三方，不会用于营销。</p>
<h2 style="font-size:15px;margin:22px 0 8px">联系</h2>
<p>任何与数据有关的问题：<a href="mailto:${SITE.email}" style="color:#0f5c5c">${SITE.email}</a></p>
<p style="color:#8b95a3;font-size:12.5px;margin-top:22px">最后更新：${today}</p>`
      : `
<p>Every calculation on this site runs inside your browser. The dimensions, prices and quantities you type are <strong>never sent to a server</strong> and never written to a database.</p>
<h2 style="font-size:15px;margin:22px 0 8px">What we do not collect</h2>
<ul><li>No input data</li><li>No tracking cookies</li><li>No third-party analytics or ad scripts</li><li>No account, no email required</li></ul>
<h2 style="font-size:15px;margin:22px 0 8px">Browser extension</h2>
<p>The extension runs offline on your machine. It requests no host permissions and does not read the pages you browse. The only permission is local storage, used to remember your last inputs — that data stays on your computer.</p>
<h2 style="font-size:15px;margin:22px 0 8px">When you email us</h2>
<p>A feedback email is something you choose to send. It contains your address and whatever you write. We use it only to reply and to correct the formulas. It is never shared or used for marketing.</p>
<h2 style="font-size:15px;margin:22px 0 8px">Contact</h2>
<p>Any data question: <a href="mailto:${SITE.email}" style="color:#0f5c5c">${SITE.email}</a></p>
<p style="color:#8b95a3;font-size:12.5px;margin-top:22px">Last updated: ${today}</p>`
    },
    terms: {
      h: isZh ? '使用条款' : 'Terms of Use',
      body: isZh ? `
<p>本站提供的计算工具用于估算与参考。所有公式按公开标准与行业惯例编写，但不同工厂、不同地区、不同设备的实际做法存在差异。</p>
<h2 style="font-size:15px;margin:22px 0 8px">你需要自己核对</h2>
<p>在把结果用于报价、下料、开模、签约或任何有经济后果的决定之前，请用你自己的刀模、纸度、材料参数核对一遍。使用本站结果所造成的任何损失，本站不承担责任。</p>
<h2 style="font-size:15px;margin:22px 0 8px">价格</h2>
<p>免费版可无限使用核心计算。付费版为一次性买断，解锁导出、预设保存与批量计算。已支付的费用不退，但如果你发现公式错误并告知我们，我们将免费提供付费版。</p>
<h2 style="font-size:15px;margin:22px 0 8px">内容归属</h2>
<p>页面文案、公式实现与界面设计归本站所有。你可以自由使用计算结果，但不可整体复制本站页面作为自己的产品。</p>
<p style="color:#8b95a3;font-size:12.5px;margin-top:22px">最后更新：${today}</p>`
      : `
<p>These calculators are estimation tools. The formulas follow published standards and common trade practice, but real shops, regions and machines differ.</p>
<h2 style="font-size:15px;margin:22px 0 8px">Verify before you commit</h2>
<p>Before using any result for a quotation, a cut list, a die, a contract or any decision with financial consequence, check it against your own die, board sizes and material data. We accept no liability for losses arising from use of these results.</p>
<h2 style="font-size:15px;margin:22px 0 8px">Pricing</h2>
<p>The core calculation is free and unlimited. The paid tier is a one-time purchase that unlocks export, saved presets and bulk runs. Payments are non-refundable, but if you find a formula error and tell us, we will give you the paid tier free.</p>
<h2 style="font-size:15px;margin:22px 0 8px">Ownership</h2>
<p>The copy, formula implementations and interface belong to us. You may use the results freely; you may not republish the site as your own product.</p>
<p style="color:#8b95a3;font-size:12.5px;margin-top:22px">Last updated: ${today}</p>`
    }
  }[kind];

  const nav = isZh
    ? { all: '全部工具', back: '← 返回工具列表' }
    : { all: 'All tools', back: '← Back to all tools' };

  return `<!DOCTYPE html><html lang="${isZh ? 'zh-CN' : 'en'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${P.h} · ${esc(pick(SITE.name, lang) || SITE.name)}</title>
<link rel="canonical" href="${SITE.domain}${prefix}/${kind}.html">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#f6f7f9;color:#12171f;font:15px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
header{background:#0d1418;color:#e8eef2}
.hd{max-width:760px;margin:0 auto;padding:0 20px;height:56px;display:flex;align-items:center;gap:10px;font-weight:650}
.hd i{width:22px;height:22px;border-radius:5px;background:linear-gradient(135deg,#1d8a7a,#0f5c5c)}
main{max-width:760px;margin:0 auto;padding:40px 20px 70px}
h1{font-size:26px;letter-spacing:-.02em;margin-bottom:18px}
p,li{color:#3c4654;margin-bottom:10px}
ul{padding-left:20px;margin-bottom:14px}
a{color:#0f5c5c}
.back{display:inline-block;margin-top:28px;font-size:14px;color:#5b6675;text-decoration:none}
</style></head><body>
<header><div class="hd"><i></i>${esc(pick(SITE.name, lang) || SITE.name)}</div></header>
<main><h1>${P.h}</h1>${P.body}<a class="back" href="${BASE}${prefix}/">${nav.back}</a></main>
</body></html>`;
}

for (const lang of ['en', 'zh']) {
  const out = path.join(DIRS.web, lang === 'zh' ? 'zh' : '');
  for (const kind of ['privacy', 'terms']) {
    fs.writeFileSync(path.join(out, `${kind}.html`), legalPage(kind, lang), 'utf8');
  }
}

/* ---------------- GitHub Pages 必需文件 ---------------- */
// .nojekyll：不加这个，下划线开头的路径会被 Jekyll 丢掉
fs.writeFileSync(path.join(DIRS.web, '.nojekyll'), '', 'utf8');

// CNAME：只在配了自定义域、且没有子路径前缀时写
const cnamePath = path.join(DIRS.web, 'CNAME');
if (MODE === 'domain' && SITE.customDomain && !BASE) {
  fs.writeFileSync(cnamePath, SITE.customDomain + '\n', 'utf8');
} else if (fs.existsSync(cnamePath)) {
  fs.unlinkSync(cnamePath);   // 域名未就绪时必须删掉，否则 Pages 部署会失败
}

// 404：Pages 找不到路径时用它，把流量接回首页，而不是白屏
const nf = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Not found · ${esc(pick(SITE.name, 'en') || SITE.name)}</title>
<meta name="robots" content="noindex">
<style>
body{background:#f6f7f9;color:#12171f;font:15px/1.6 -apple-system,"Segoe UI","PingFang SC",sans-serif;margin:0}
.w{max-width:640px;margin:0 auto;padding:90px 20px}
h1{font-size:26px;letter-spacing:-.02em;margin:0 0 10px}
p{color:#5b6675}
a{color:#0f5c5c}
.list{margin-top:26px;display:grid;gap:8px}
.list a{display:block;background:#fff;border:1px solid #e3e7ed;border-radius:9px;padding:12px 14px;
 text-decoration:none;color:inherit}
.list a span{display:block;color:#5b6675;font-size:13px;margin-top:2px}
</style></head><body><div class="w">
<h1>That page is not here</h1>
<p>It may have moved. Everything still lives at the index.</p>
<p><a href="${BASE}/">→ All calculators</a></p>
<div class="list">
${ALL.map((v) => `<a href="${BASE}/${v.slug}/">${esc(pick(v.name, 'en'))}<span>${esc(pick(v.tagline, 'en'))}</span></a>`).join('\n')}
</div></div></body></html>`;
fs.writeFileSync(path.join(DIRS.web, '404.html'), nf, 'utf8');

// Issues 模板：让不开链接的人也能按格式提交
if (ISSUE && REPO) {
  const tplDir = path.resolve(VP, '.github', 'ISSUE_TEMPLATE');
  fs.mkdirSync(tplDir, { recursive: true });
  fs.writeFileSync(path.join(tplDir, 'wrong-number.yml'), `name: Wrong number
description: The calculator gave a result your own sheet / die / machine disagrees with.
title: "[wrong] "
labels: ["wrong-number"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks — a wrong number is the most useful thing you can send me.
        Every report gets a fix, and the fix ships with your name in the changelog.
  - type: input
    id: tool
    attributes:
      label: Which calculator
      placeholder: carton-blank-yield
    validations:
      required: true
  - type: textarea
    id: inputs
    attributes:
      label: Your inputs
      description: Paste the block from the "Copy my numbers" button, or type the values.
      render: text
    validations:
      required: true
  - type: input
    id: got
    attributes:
      label: What the page said
    validations:
      required: true
  - type: input
    id: expected
    attributes:
      label: What it should be
    validations:
      required: true
  - type: textarea
    id: why
    attributes:
      label: How you know
      description: Your die size, board size, trade practice, a manual page — anything concrete.
`, 'utf8');
}

console.log(`\n✓ 编译完成：${stats.length} 个产品\n`);
console.log('  优先级  slug                     网页  中文  扩展  文案');
for (const s of stats) {
  console.log(`  ${String(s.priority).padEnd(6)}  ${s.slug.padEnd(24)} ✓     ✓     ✓     ✓`);
}
console.log(`\n  输出：factory/dist/{web,ext,listing}`);
console.log(`  扩展包：factory/dist/ext/<slug>/  直接 zip 上传即可\n`);
