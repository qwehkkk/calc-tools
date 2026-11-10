/**
 * indexnow.mjs — 把 sitemap 里的 URL 一键推给 Bing / Yandex / Seznam（IndexNow 协议）
 *
 * 前提：site.json 里有 indexNowKey，且已构建发布（key 文件在站点根）。
 * 用法：npm run indexnow
 * 返回 200/202 = 成功；403 = key 文件还没上线；422 = URL 不属于该 host。
 */
import fs from 'node:fs';

const SITE = JSON.parse(fs.readFileSync('factory/site.json', 'utf8'));
const KEY = SITE.indexNowKey;
if (!KEY) { console.error('✗ site.json 没有 indexNowKey'); process.exit(1); }

const DOMAIN = (SITE.domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
if (!DOMAIN) { console.error('✗ site.json 没有 domain'); process.exit(1); }

const xml = fs.readFileSync('docs/sitemap.xml', 'utf8');
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (!urls.length) { console.error('✗ sitemap 里没解析到 URL，先 npm run build && npm run publish:docs'); process.exit(1); }

const body = {
  host: DOMAIN,
  key: KEY,
  keyLocation: `https://${DOMAIN}/${KEY}.txt`,
  urlList: urls
};

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body)
});

console.log(`推送 ${urls.length} 条 URL → api.indexnow.org`);
console.log(`key 文件：${body.keyLocation}`);
console.log(res.ok ? `✓ HTTP ${res.status}，已接受` : `✗ HTTP ${res.status} ${await res.text()}`);
if (res.status === 403) console.log('  提示：key 文件还没上线，先 push 并等 Pages 构建完成。');
process.exit(res.ok ? 0 : 1);
