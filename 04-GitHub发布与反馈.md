# 04 · GitHub 发布与反馈闭环

**一句话**：仓库就是发布源，`docs/` 就是线上站，Issue 就是反馈箱。没有服务器、没有数据库、没有月费。

---

## 0. 现在的位置

**已经做完的（不用你动手）：**

| 项目 | 状态 |
|---|---|
| `docs/` 发布目录 | 24 个文件 · 672 KB，中英双语 6 个工具 + 首页 + 404 + 隐私/条款 + sitemap/robots/llms.txt |
| GitHub Pages 必需文件 | `.nojekyll` 已生成（否则下划线目录会被 Jekyll 吞掉）、`CNAME` = `calc.toolona.com` |
| 反馈入口 | 页面按钮直接开一条**预填好你当前那组数字**的 GitHub Issue |
| Issue 模板 | `.github/ISSUE_TEMPLATE/wrong-number.yml`，带 `wrong-number` 标签 |
| 本地仓库 | 已 `git init` 并完成首次提交，只差加 remote 和 push |

**需要你安排的，按这个顺序，一次一件事：**

1. 建仓库（1 分钟）
2. push（2 分钟，第一次要输一次凭证）
3. 开 Pages（1 分钟）
4. 绑 `calc.toolona.com`（5 分钟 + 等证书）
5. 提交 sitemap 到 GSC（5 分钟）
6. 之后每次发版就是三条命令

---

## 1. 建仓库

打开 <https://github.com/new>

- **Repository name**：`calc-tools`
- **Public**（Pages 免费版要求公开仓库；私有仓库要 Pro）
- 不要勾 "Add a README"、不要选 .gitignore、不要选 license —— 本地已经有全套，勾了会冲突

点 Create。

> 仓库名想换就换，但要改两处：`factory/site.json` 里的 `github.repo`，以及第 2 步的 remote 地址。**只改一处会出现反馈按钮指向 404。**

---

## 2. 首次推送

在 Git Bash 里，`cd` 到 `virtual-products`（就是有 `package.json` 的这一层）：

```bash
cd /c/Users/Administrator/WorkBuddy/2026-11-10-21-15-25/virtual-products

git remote add origin https://github.com/qwehkkk/calc-tools.git
git branch -M main
git push -u origin main
```

第一次会弹 GitHub 登录窗口（浏览器授权），之后 Windows 凭据管理器会记住，**不需要生成明文 token**。

推完确认一下推上去的是不是该推的东西：

```bash
git ls-files | head -30
```

应该看到 `docs/`、`factory/`、`README.md`、`.github/`。
**不应该**看到 `data/`、`原始材料/`、`01~03-*.md` —— 这些在 `.gitignore` 里，是内部推演和收入数据，不公开。

---

## 3. 打开 Pages

仓库 → **Settings** → 左侧 **Pages**

- **Source**：`Deploy from a branch`
- **Branch**：`main`，**Folder**：`/docs`
- 点 **Save**

等 30–60 秒，页面顶部会出现 `https://qwehkkk.github.io/calc-tools/`。

### 这里有个坑，必须知道

我们的页面内链是**根绝对路径**（`/carton-blank-yield/`）。挂在 `github.io/calc-tools/` 这种子路径下，链接会全部 404、样式也会丢。

两种走法，**选 B**，A 只在你想先看一眼时用：

**A. 先用子路径预览**（可选，2 分钟）

改 `factory/site.json`：

```json
"base": "/calc-tools",
"customDomain": ""
```

```bash
node factory/build.mjs && node factory/publish.mjs
git add -A && git commit -m "preview on github.io" && git push
```

这时 `https://qwehkkk.github.io/calc-tools/` 能完整点开。`canonical` 仍然指向正式域，不会污染 SEO。

**B. 直接上自定义域**（推荐，跳过 A）

保持 `base: ""`，做第 4 步。站点在根目录，路径语义和最终线上完全一致，不用来回改配置。

---

## 4. 绑 `calc.toolona.com`

**4.1 在 GitHub 填域名**

Settings → Pages → **Custom domain** → 输入 `calc.toolona.com` → **Save**
（`docs/CNAME` 里已经写着这个值，GitHub 会识别到，不会重复冲突）

**4.2 在 Cloudflare 加解析**

Cloudflare → 选 **`toolona.com`** 这个域（⚠️ 别选错，你名下域名不止一个）→ DNS → Records → Add record：

| 字段 | 值 |
|---|---|
| Type | `CNAME` |
| Name | `calc` |
| Target | `qwehkkk.github.io` |
| Proxy status | **DNS only（灰色云）** |
| TTL | Auto |

**必须是灰色云。** 橙色云会让 GitHub 签证书时校验失败，最后表现为 `ERR_TOO_MANY_REDIRECTS` 或者一直"证书签发中"。

根域 `toolona.com` 现在跑的是中文工具箱 easytool，**不要动它的记录**，我们只用 `calc` 这个子域。

**4.3 等证书，然后强制 HTTPS**

回 Settings → Pages，等顶部提示变成 "Your site is live at https://calc.toolona.com"（通常 1–15 分钟，DNS 生效慢的话更久）。

然后勾上 **Enforce HTTPS**。

**4.4 验收（三条命令，都要对）**

```bash
curl -sI https://calc.toolona.com/ | head -3                       # 期望 HTTP/2 200
curl -s  https://calc.toolona.com/sitemap.xml | head -5            # 期望有 <urlset
curl -sI https://calc.toolona.com/nope-404 | head -1               # 期望 404，不是 200
```

第三条尤其要测：Pages 的 404 页如果配错，会把所有不存在的路径返回 200（软 404），Google 会把它们当重复内容收录。

---

## 5. 交 sitemap 给 Google Search Console

**5.1 加资源**

<https://search.google.com/search-console> → 添加资源 → **网址前缀** → `https://calc.toolona.com/`
（选"网址前缀"而不是"网域"，可以省掉 DNS TXT 验证；验证方式选 HTML 标记或 DNS 都行）

**5.2 提交 sitemap**

左侧 Sitemaps → 输入 `sitemap.xml` → 提交。

**5.3 逐页请求收录**

用顶部搜索框（URL Inspection）贴每页地址 → 请求编入索引。**12 个页面（6 工具 × 中英），一天 3 个，四天做完。** 一天全提交等于告诉 Google 这是垃圾站。

提交顺序按搜索价值排：

1. `/container-load-fit/`、`/tile-quantity-calc/`（大众词，先喂域名权重）
2. `/pallet-carton-fit/`、`/carton-blank-yield/`
3. `/acrylic-panel-quote/`、`/glass-sheet-yield/`
4. 各自的 `/zh/` 版本

---

## 6. 日常发版循环

改一份 JSON，三条命令，一次 push：

```bash
cd /c/Users/Administrator/WorkBuddy/2026-11-10-21-15-25/virtual-products

node factory/build.mjs      # 编译
node factory/test.mjs       # 必须"全部通过"才往下走
node factory/publish.mjs    # 同步到 docs/

git add -A && git commit -m "add <slug>" && git push
```

30–60 秒后线上生效。

**这三条命令的顺序不能换**：测试跑的是 `dist/web`，publish 搬的也是 `dist/web`，先测再发布能挡住带 NaN 的页面。

一条命令搞定也行：`npm run ship`（build + test + publish 串起来，但不含 git）。

---

## 7. 反馈闭环

### 7.1 页面上的两个按钮

| 按钮 | 给谁 | 产出 |
|---|---|---|
| **Report a wrong number** | 有 GitHub 账号的人 | 直接开一条 Issue，正文**已经填好他这一组输入和全部结果**，他只需写"实际是多少" |
| **Copy my numbers** | 没账号、或在微信里聊的人 | 复制一段纯文本，粘到哪都行 |
| **or email** | 不想用以上两种 | 邮件，已预填标题和页面地址 |

这一步是整套打法的关键：**反馈不依赖对方是"专业人士"，只依赖他用过一次。** 一个跟单员、一个采购、一个学生，只要他的结果和车间对不上，他就能在 15 秒内把证据交上来。行业门槛挡的是"职位权限"，不是"能不能看出数不对"。

### 7.2 仓库里要做一次设置

Issues → Labels → New label：

- Name：`wrong-number`
- 描述：The number this page produced disagrees with reality.
- 颜色：`#d93f0b`

标签不存在时 Issue 仍会创建，只是不打标；建一次之后所有新报告自动归堆。

### 7.3 每周固定动作（30 分钟）

1. 打开 Issues，按 `wrong-number` 过滤
2. 每条判断归到 A/B/C/D 四类（判据在 `03-铺量作战计划.md` 第五节）
3. **A 类（公式真错）当天改**：改 `factory/verticals/<slug>.json` 里的 `expr` → build → test → publish → push，commit message 写 `fix: <slug> per issue #12`
4. 在 Issue 里回一句"已修，页面刷新即生效"，然后关掉
5. 把这条贴进 `data/反馈库.csv`

公开的 Issue 有两个副作用，都是好的：一是别人能看到"提了就修"，二是这些页面有了活跃痕迹。

### 7.4 一个前提

`factory/site.json` 里的 `email` 现在是 `asdzcc@gmail.com`，但**这个地址没开真实收信**。GitHub Issue 不受影响；要让邮件通道也能用，去 Cloudflare → Email Routing 加一条转发规则（免费），或者把 `email` 换成常用的那个。

---

## 8. 扩展上架（独立动作，可以晚点做）

网页版上线、有搜索流量之后再做，顺序别倒。

1. Chrome 开发者账号注册：<https://chrome.google.com/webstore/devconsole>，一次性 **$5**
2. 上传 `factory/dist/zip/<slug>.zip`（`node factory/pack.mjs` 生成，已经是合法 MV3 包）
3. 填文案：`factory/dist/listing/<slug>.md` 里已经按字段拆好（名称 ≤45 字符、短描述 ≤132 字符，都校验过）
4. 隐私政策填 `https://calc.toolona.com/privacy.html`（已生成，Chrome 审核必查这一项）

**别一上来传 6 个。** 先传 1 个（`container-load-fit`，装柜是最好理解的），拿到 5 条评价再传下一个。同时上 6 个零评价的扩展，只会让审核和用户都觉得这是批量刷的。

---

## 9. 出问题怎么查

| 现象 | 原因 | 处理 |
|---|---|---|
| 打开是 404 | Pages 的 Folder 没选 `/docs`，或 `docs/` 没推上去 | Settings → Pages 看一眼；`git ls-files docs | head` |
| 页面没样式、点链接 404 | 用了子路径预览但 `base` 没设 | `site.json` 设 `"base": "/calc-tools"` 重建，或改走自定义域 |
| 一直"证书签发中" | Cloudflare 代理是橙色云 | 改成 DNS only，等 10 分钟 |
| `ERR_TOO_MANY_REDIRECTS` | 同上，或 GitHub 的 Enforce HTTPS 与 Cloudflare 的 Always Use HTTPS 打架 | 二选一，只留 GitHub 那个 |
| 推上去但线上没变 | Pages 部署要 30–60 秒；浏览器缓存 | `curl -s https://calc.toolona.com/ | grep -c 工具名`，别靠刷新判断 |
| 任意路径都返回 200 | 404 页配错成软 404 | 确认 `docs/404.html` 存在（已生成），测 `/nope-404` 应为 404 |
| 反馈按钮点开是 404 | `site.json` 的 `github.owner/repo` 和真实仓库不一致 | 改一处，同时检查 remote 地址 |

---

## 10. 我要你回的三句话

1. 仓库名就用 `calc-tools`，还是换一个？（决定 `site.json` 里那一个字段）
2. 第 2 步的 push 你自己来，还是把 remote 配好后我直接推？
3. `asdzcc@gmail.com` 到底收不收信？不收的话我把它换成哪个地址，或者直接去掉邮件按钮。

这三句回完，发布这条链就彻底通了。通了之后我继续铺下一批产品（混凝土、涂料、钣金、体积重、电缆压降…），公式全部来自公开标准，不需要任何人先帮我测。
