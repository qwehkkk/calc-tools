/**
 * push-api.mjs — 当 `git push` 走不通时的发布通道（本机到 github.com:443 被代理拦截时用这个）
 *
 * 原理：全部走 api.github.com。
 *   建树 → 建提交 → 更新 main 引用，一步不少，但不需要 443 端口的 git 协议。
 *
 * 用法（在 virtual-products 目录下）：
 *   export GH_TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill | sed -n 's/^password=//p')
 *   node factory/push-api.mjs
 *
 * 注意：这一步会把 main 强制指向当前工作区的文件快照。
 * 第一次在有网的环境里，记得 `git fetch origin && git reset --hard origin/main` 对齐历史。
 */
/**
 * 通过 GitHub REST API 建仓 + 推送 + 开 Pages
 * （本机到 github.com:443 被代理阻断，但 api.github.com 可达）
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const TOKEN = process.env.GH_TOKEN;
const OWNER = process.env.GH_OWNER || 'qwehkkk';
const REPO = process.env.GH_REPO || 'calc-tools';
const DIR = process.cwd();

const api = async (method, url, body) => {
  const r = await fetch('https://api.github.com' + url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'toolona-factory'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: r.status, ok: r.ok, json };
};

// 1) 建仓（已存在就跳过，别浪费内容创建配额）
let res = await api('GET', `/repos/${OWNER}/${REPO}`);
if (res.ok) {
  console.log(`• 仓库已存在 ${OWNER}/${REPO}`);
} else {
res = await api('POST', '/user/repos', {
  name: REPO,
  description: 'Engineering calculators that end in a number you can quote. One config in, site + Chrome extension out.',
  private: false,
  has_issues: true,
  has_wiki: false,
  has_projects: false,
  auto_init: false,
  homepage: 'https://calc.toolona.com'
});
if (res.ok) console.log(`✓ 建仓 ${OWNER}/${REPO}`);
else if (res.status === 422) console.log(`• 仓库已存在，继续`);
else { console.error('✗ 建仓失败', res.status, JSON.stringify(res.json).slice(0, 300)); process.exit(1); }
}

// 1.5) 空仓库必须先有一个提交，否则 trees API 返回 409
let parent = null;
res = await api('GET', `/repos/${OWNER}/${REPO}/commits?per_page=1`);
if (res.ok && Array.isArray(res.json) && res.json.length) {
  parent = res.json[0].sha;
  console.log(`• 已有提交 ${parent.slice(0, 10)}`);
} else {
  const init = await api('PUT', `/repos/${OWNER}/${REPO}/contents/README.md`, {
    message: 'chore: bootstrap repository',
    content: Buffer.from('# calc-tools\n\nBootstrapping.\n').toString('base64')
  });
  if (!init.ok) { console.error('✗ 初始化失败', init.status, JSON.stringify(init.json).slice(0, 300)); process.exit(1); }
  parent = init.json.commit.sha;
  console.log(`✓ 初始提交 ${parent.slice(0, 10)}`);
}

// 2) 收集文件（用 git 索引，天然排除 .gitignore 里的东西）
const files = execSync('git ls-files -z', { cwd: DIR, maxBuffer: 1 << 26 })
  .toString('utf8').split('\0').filter(Boolean);
console.log(`• 待推送 ${files.length} 个文件`);

const tree = files.map((f) => {
  const buf = fs.readFileSync(`${DIR}/${f}`);
  return { path: f.split('\\').join('/'), mode: '100644', type: 'blob', content: buf.toString('utf8') };
});

// 3) 建树 → 建提交 → 建引用
for (let attempt = 1; ; attempt++) {
  res = await api('POST', `/repos/${OWNER}/${REPO}/git/trees`, { tree });
  const limited = res.status === 403 && /rate limit/i.test(JSON.stringify(res.json));
  if (!res.ok && limited && attempt <= 4) {
    const wait = 60 * attempt;
    console.log(`… 触发限流，等 ${wait}s 后重试（${attempt}/4）`);
    await new Promise((r) => setTimeout(r, wait * 1000));
    continue;
  }
  break;
}
if (!res.ok) { console.error('✗ 建树失败', res.status, JSON.stringify(res.json).slice(0, 400)); process.exit(1); }
const treeSha = res.json.sha;
console.log(`✓ tree ${treeSha.slice(0, 10)}`);

res = await api('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
  message: 'Initial commit: calculator factory, 6 tools, 2 languages, GitHub Pages output',
  tree: treeSha,
  parents: parent ? [parent] : []
});
if (!res.ok) { console.error('✗ 建提交失败', res.status, JSON.stringify(res.json).slice(0, 400)); process.exit(1); }
const commitSha = res.json.sha;
console.log(`✓ commit ${commitSha.slice(0, 10)}`);

res = await api('POST', `/repos/${OWNER}/${REPO}/git/refs`, { ref: 'refs/heads/main', sha: commitSha });
if (res.ok) console.log('✓ 分支 main 已建立');
else if (res.status === 422) {
  res = await api('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/main`, { sha: commitSha, force: true });
  console.log(res.ok ? '✓ 分支 main 已更新' : '✗ 更新分支失败');
} else console.log('! 分支创建', res.status, JSON.stringify(res.json).slice(0, 200));

// 4) 开 Pages（main + /docs）
res = await api('POST', `/repos/${OWNER}/${REPO}/pages`, {
  source: { branch: 'main', path: '/docs' },
  build_type: 'legacy'
});
if (res.ok) console.log('✓ Pages 已开启（main /docs）');
else console.log('! Pages:', res.status, JSON.stringify(res.json).slice(0, 300));

// 5) 绑自定义域
res = await api('PUT', `/repos/${OWNER}/${REPO}/pages`, { cname: 'calc.toolona.com', https_enforced: true });
if (res.ok) console.log('✓ 自定义域 calc.toolona.com 已填');
else console.log('! 自定义域:', res.status, JSON.stringify(res.json).slice(0, 300));

// 6) 仓库元信息
await api('PATCH', `/repos/${OWNER}/${REPO}`, {
  description: 'Engineering calculators that end in a number you can quote. One config in, site + Chrome extension out.',
  homepage: 'https://calc.toolona.com',
  topics: ['calculator', 'manufacturing', 'packaging', 'static-site', 'chrome-extension']
});

res = await api('GET', `/repos/${OWNER}/${REPO}/pages`);
if (res.ok) {
  console.log(`\nPages 状态：${res.json.status || '?'} · ${res.json.html_url || ''}`);
  if (res.json.cname) console.log(`自定义域：${res.json.cname}`);
}
console.log(`\n仓库：https://github.com/${OWNER}/${REPO}`);
