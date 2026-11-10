# 04 · GitHub 发布与反馈闭环

**一句话**：仓库就是发布源，`docs/` 就是线上站，Issue 就是反馈箱。没有服务器、没有数据库、没有月费。

---

## 0. 现在的状态

**已经做完了：**

| 项目 | 状态 |
|---|---|
| 仓库 | ✅ <https://github.com/qwehkkk/calc-tools>（public，已开启 Issues） |
| 代码 | ✅ 46 个文件已推送，`docs/` 24 个页面文件齐全 |
| Pages | ✅ 已开启：分支 `main`，目录 `/docs` |
| 自定义域 | ✅ 已在 GitHub 侧填写 `calc.toolona.com` |
| 发布目录 | ✅ `docs/` 含 `.nojekyll` / `CNAME` / `404.html` / sitemap / robots / llms.txt |
| 反馈入口 | ✅ 页面按钮直接开一条**预填当前数字**的 GitHub Issue |
| Issue 模板 | ✅ `.github/ISSUE_TEMPLATE/wrong-number.yml` |

**只差你做两件事**（第 1、2 节，各五分钟）：加一条 DNS 记录、交一次 sitemap。

> 说明一句：这台机器到 `github.com:443` 的 git 协议被代理挡了（`CONNECT tunnel failed, 502`），
> 但 `api.github.com` 通。所以首次推送走的是 REST API，仓库里的提交历史和本地那两个提交是**平行**的。
> 在你能正常连 GitHub 的环境里，第一次先执行一次对齐，之后就是普通 `git push`：
>
> ```bash
> git fetch origin && git reset --hard origin/main
> ```
>
> 内容完全一致，只是历史线不同。以后在这个沙箱里更新，用 `npm run push:api`（见第 5 节）。

---

## 1. 加 DNS 记录（唯一还没做的一步）

Cloudflare → 选 **`toolona.com`** 这个域（⚠️ 你名下不止一个域名，别选错）→ DNS → Records → Add record：

| 字段 | 值 |
|---|---|
| Type | `CNAME` |
| Name | `calc` |
| Target | `qwehkkk.github.io` |
| Proxy status | **DNS only（灰色云）** |
| TTL | Auto |

**必须是灰色云。** 橙色云会让 GitHub 签证书时校验不到，表现为一直"证书签发中"、`ERR_TOO_MANY_REDIRECTS`，或者干脆 502。

根域 `toolona.com` 跑的是中文工具箱 easytool，**不要动它的记录**，我们只用 `calc` 子域。

加完之后 1–15 分钟证书签发完成。回 GitHub 仓库 → Settings → Pages → 勾上 **Enforce HTTPS**（现在还是关着的，因为证书没到）。

**验收三条命令，都要对：**

```bash
curl -sI https://calc.toolona.com/ | head -3                    # 期望 HTTP/2 200
curl -s  https://calc.toolona.com/sitemap.xml | head -3         # 期望有 <urlset
curl -sI https://calc.toolona.com/nope-404 | head -1            # 期望 404，不是 200
```

第三条尤其要测：404 页配错会让所有不存在的路径返回 200（软 404），Google 会当成重复内容收录。

---

## 2. 交 sitemap 给 Google Search Console

**2.1 加资源**

<https://search.google.com/search-console> → 添加资源 → **网址前缀** → `https://calc.toolona.com/`
（选"网址前缀"可以省掉 DNS TXT 验证；用 HTML 标记或 DNS 都可以）

**2.2 提交 sitemap**

左侧 Sitemaps → 输入 `sitemap.xml` → 提交。

**2.3 逐页请求收录**

顶部搜索框（URL Inspection）贴地址 → 请求编入索引。**12 个页面（6 工具 × 中英），一天 3 个，四天做完。** 一天全提交等于告诉 Google 这是垃圾站。

按搜索价值排：

1. `/container-load-fit/`、`/tile-quantity-calc/` —— 大众词，先喂域名权重
2. `/pallet-carton-fit/`、`/carton-blank-yield/`
3. `/acrylic-panel-quote/`、`/glass-sheet-yield/`
4. 各自的 `/zh/` 版本

---

## 3. 日常发版：三条命令

```bash
cd /c/Users/Administrator/WorkBuddy/2026-11-10-21-15-25/virtual-products

node factory/build.mjs      # 编译
node factory/test.mjs       # 必须"全部通过"才往下走
node factory/publish.mjs    # 同步 dist/web → docs/

git add -A && git commit -m "add <slug>" && git push
```

或者一条：`npm run ship`（build + test + publish，不含 git）。

**顺序不能换**：测试跑的是 `dist/web`，publish 搬的也是 `dist/web`，先测再发能挡住带 NaN 的页面。

**在这个沙箱里 `git push` 会失败**（443 被代理挡），改用：

```bash
export GH_TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill | sed -n 's/^password=//p')
npm run push:api
```

它走 `api.github.com`，把当前工作区快照写成一次提交并更新 `main`。在你自己的电脑上，正常 `git push` 就行，不用这个。

---

## 4. 反馈闭环

### 4.1 页面上的三个入口

| 按钮 | 给谁 | 产出 |
|---|---|---|
| **Report a wrong number** | 有 GitHub 账号的人 | 直接开一条 Issue，正文**已经填好他这一组输入和全部结果**，他只需写"实际是多少" |
| **Copy my numbers** | 没账号、在微信里聊的人 | 复制一段纯文本，粘到哪都行 |
| **or email** | 都不想用的人 | 邮件，标题和页面地址已预填，收件人 `asdzcc@gmail.com` |

这是整套打法的关键：**反馈不依赖对方是"专业人士"，只依赖他用过一次。** 一个跟单员、一个采购、一个学生，只要结果和车间对不上，15 秒就能把证据交上来。行业门槛挡的是"职位权限"，不是"能不能看出数不对"。

### 4.2 仓库里建一次标签

Issues → Labels → New label：

- Name：`wrong-number`
- Description：The number this page produced disagrees with reality.
- Color：`#d93f0b`

标签不存在时 Issue 仍会创建，只是不打标；建一次之后所有新报告自动归堆。

### 4.3 每周固定动作（30 分钟）

1. Issues 按 `wrong-number` 过滤
2. 每条归到 A/B/C/D 四类（判据在 `03-铺量作战计划.md` 第五节）
3. **A 类（公式真错）当天改**：改 `factory/verticals/<slug>.json` 里的 `expr` → build → test → publish → 推送，commit 写 `fix: <slug> per issue #12`
4. Issue 里回一句"已修，刷新即生效"，然后关闭
5. 贴进 `data/反馈库.csv`

公开 Issue 有两个副作用，都是好的：别人看得到"提了就修"，页面也有了活跃痕迹。

---

## 5. 扩展上架（独立动作，晚点做）

网页版有搜索流量之后再动，顺序别倒。

1. 开发者账号：<https://chrome.google.com/webstore/devconsole>，一次性 **$5**
2. 上传 `factory/dist/zip/<slug>.zip`（`npm run pack` 生成，已是合法 MV3 包）
3. 文案：`factory/dist/listing/<slug>.md` 已按字段拆好（名称 ≤45、短描述 ≤132，都校验过）
4. 隐私政策填 `https://calc.toolona.com/privacy.html`（已生成，审核必查）

**别一次传 6 个。** 先传 `container-load-fit`（装柜最好理解），拿到 5 条评价再传下一个。同时上 6 个零评价的扩展，只会让审核和用户都觉得是批量刷的。

---

## 6. 出问题怎么查

| 现象 | 原因 | 处理 |
|---|---|---|
| 打开是 404 | Pages 的 Folder 不是 `/docs`，或 `docs/` 没推上去 | Settings → Pages 确认；`git ls-files docs | head` |
| 页面没样式、点链接 404 | 用了 `github.io/calc-tools` 子路径但 `base` 没设 | `site.json` 设 `"base": "/calc-tools"` 重建；正式域则保持 `""` |
| 一直"证书签发中" | Cloudflare 是橙色云 | 改 DNS only，等 10 分钟 |
| `ERR_TOO_MANY_REDIRECTS` | 同上，或 Cloudflare 的 Always Use HTTPS 与 GitHub 的 Enforce HTTPS 打架 | 只留 GitHub 那个 |
| 推上去但线上没变 | 部署要 30–60 秒，或浏览器缓存 | `curl -s https://calc.toolona.com/ | grep -c carton`，别靠刷新判断 |
| 任意路径都返回 200 | 404 页成软 404 | 确认 `docs/404.html` 存在（已生成），测 `/nope-404` |
| 反馈按钮点开 404 | `site.json` 的 `github.owner/repo` 与实际仓库不一致 | 改一处，重建重发 |
| `git push` 报 502 | 本机到 github.com 的 git 协议被代理挡 | 用 `npm run push:api` |

---

## 7. 下一步

DNS 和 GSC 这两件做完，入口就通了。通了之后我继续铺下一批产品：混凝土用量、涂料用量、钣金排版、体积重、电缆压降、沥青用量 —— 公式全部来自公开标准，不需要任何人先帮我测就能写出第一版，第一版的对错由反馈来校准。
