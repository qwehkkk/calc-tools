/**
 * publish.mjs — 把构建产物同步到仓库的 docs/（GitHub Pages 的发布目录）
 *
 *   factory/dist/web/  ──►  docs/  ──►  git push  ──►  Pages 自动部署
 *
 * 为什么不全量清空 docs：本机的批量删除保护会拦截（>50 个文件），
 * 而且误删一次就是一次线上 404。这里只删「源里已经没有」的文件。
 *
 * 用法：node factory/publish.mjs [--dry]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const VP = path.resolve(ROOT, '..');
const SRC = path.join(ROOT, 'dist', 'web');
const DST = path.join(VP, 'docs');
const DRY = process.argv.includes('--dry');

if (!fs.existsSync(SRC)) {
  console.error('✗ 找不到 factory/dist/web，先跑 node factory/build.mjs');
  process.exit(1);
}

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full));
  }
  return out;
}

const srcFiles = walk(SRC);
const srcSet = new Set(srcFiles.map((f) => f.split(path.sep).join('/')));
const dstFiles = fs.existsSync(DST) ? walk(DST) : [];
const dstSet = new Set(dstFiles.map((f) => f.split(path.sep).join('/')));

const stale = [...dstSet].filter((f) => !srcSet.has(f));
let added = 0;
let updated = 0;
let bytes = 0;

for (const rel of srcFiles) {
  const from = path.join(SRC, rel);
  const to = path.join(DST, rel);
  const buf = fs.readFileSync(from);
  bytes += buf.length;
  const same = fs.existsSync(to) && fs.readFileSync(to).equals(buf);
  if (!DRY) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (!same) fs.writeFileSync(to, buf);
  }
  if (!dstSet.has(rel.split(path.sep).join('/'))) added++;
  else if (!same) updated++;
}

let removed = 0;
for (const rel of stale) {
  if (DRY) { removed++; continue; }
  try {
    fs.unlinkSync(path.join(DST, rel));
    removed++;
  } catch (e) {
    console.warn(`  ! 删不掉（跳过）：${rel}`);
  }
}

// 空目录顺手清掉，避免 git 残留
if (!DRY && fs.existsSync(DST)) {
  const prune = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const p = path.join(dir, e.name);
      prune(p);
      if (fs.readdirSync(p).length === 0) fs.rmdirSync(p);
    }
  };
  prune(DST);
}

const kb = (bytes / 1024).toFixed(0);
console.log(`\n${DRY ? '（演练，未写入）' : '✓ 已同步到 docs/'}`);
console.log(`  文件 ${srcFiles.length} 个 · ${kb} KB · 新增 ${added} · 更新 ${updated} · 清理 ${removed}`);
if (stale.length && DRY) console.log(`  将删除：${stale.slice(0, 8).join(', ')}${stale.length > 8 ? ' …' : ''}`);
console.log('\n  下一步：');
console.log('    git add -A && git commit -m "update tools" && git push');
console.log('    Pages 会在 30-60 秒内重新部署\n');
