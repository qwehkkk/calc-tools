# 04 · GitHub 发布与反馈闭环

**一句话**：仓库就是发布源，`docs/` 就是线上站，Issue 就是反馈箱。没有服务器、没有数据库、没有月费。

---

## 0. 现在的状态（2026-11-10 22:4x）

| 项目 | 状态 |
|---|---|
| 仓库 | ✅ <https://github.com/qwehkkk/calc-tools>（public，Issues 已开） |
| 代码 | ✅ 47 个文件已推送，`docs/` 23 个页面文件 |
| Pages | ✅ 已开启并通过构建：`main` + `/docs` |
| 线上预览 | ✅ <https://qwehkkk.github.io/calc-tools/>（14 条路径实测：6 工具 × 中英 + 首页 + 隐私/条款 + sitemap/robots 全 200，不存在路径返回 404） |
| 自定义域 | ⏸ `calc.toolona.com` 还没解析，**故意先不绑**（原因见第 2 节） |
| 反馈入口 | ✅ 按钮直接开一条**预填当前数字**的 GitHub Issue |

**只差你做一件事**：去 Cloudflare 加一条 DNS 记录。加完跟我说一句，我把 `deployMode` 切成 `domain` 重发一次，你去勾 Enforce HTTPS，然后交 sitemap。

现在就可以点开看：<https://qwehkkk.github.io/calc-tools/>

---

## 1. Cloudflare 加记录（唯一待办）

Cloudflare → 选 **`toolona.com`** 这个域（⚠️ 你名下不止一个域名，别点错）→ DNS → Records → Add record：

| 字段 | 值 |
|---|---|
| Type | `CNAME` |
| Name | `calc` |
| Target | `qwehkkk.github.io` |
| Proxy status | **DNS only（灰色云）** |
| TTL | Auto |

根域 `toolona.com` 跑的是中文工具箱 easytool，**不要动它的记录**，我们只用 `calc` 子域。

加完跟我说一句，我执行切换（把 `deployMode` 从 `github` 改成 `domain`，重建、重发、把 CNAME 交给 Pages），然后你去勾 **Enforce HTTPS**。证书签发要 1–15 分钟。

**验收三条命令，都要对：**

```bash
curl -sI https://calc.toolona.com/ | head -3                    # 期望 HTTP/2 200
curl -s  https://calc.toolona.com/sitemap.xml | head -3         # 期望有 <urlset
curl -sI https://calc.toolona.com/nope-404 | head -1            # 期望 404，不是 200
```

第三条尤其要测：404 页配错会让所有不存在的路径返回 200（软 404），Google 会当成重复内容收录。

---

## 2. 两个已经踩过的坑（写下来省得再踩）

### 坑一：`Page build failed.` 有三层原因，我全踩了一遍

症状都一样：日志里 **build job 成功**，挂在最后一步 `Deploy to GitHub Pages`，报 `Page build failed.`（不给细节）。逐个排除后是这三条：

1. **`docs/CNAME` 指向还没解析的域名** —— Pages 把站点绑到那个域，解析不到就拒绝部署。
2. **`https_enforced: true` 但没有证书** —— 这个状态 API 改不动（PUT 会返回 `404 The certificate does not exist yet`），只能删掉整个 Pages 配置重建。
3. **`github-pages` 环境的部署分支策略允许列表是空的** —— 这条最隐蔽：环境里存在 `custom_branch_policies: true` 但没列出任何分支，所有部署被静默拦住，表现为 job 一直 `in_progress`。
   修法：放行 `main`（`POST /environments/github-pages/deployment-branch-policies`，`{name:"main",type:"branch"}`）。

最终把这四项一起改掉之后才通：`deployMode=github` + 不写 CNAME + 重建 Pages + 放行 main 分支。

**所以现在做成一个开关**，`factory/site.json`：

```json
"deployMode": "github"     // 子路径预览：自动加 base=/calc-tools，不写 CNAME
"deployMode": "domain"     // 正式：base 为空，写 CNAME=calc.toolona.com
```

切一次只要改这一个字段，再 `build → test → publish → push`。`base` 和 `CNAME` 都由它推导，不用手改两处。

### 坑二：git 协议时通时不通，所以留了一条 API 推送通道

`git push` 曾报 `CONNECT tunnel failed, response 502`（`github.com:443` 被出口代理挡），但 `api.github.com` 一直通。
后来代理恢复，`git push` 又能用了。**两种情况都要能应付**，所以：

- 正常情况：`git add -A && git commit -m "..." && git push`
- git 不通时：用下面这条，走 REST API，把工作区快照写成一次提交并更新 `main`

```bash
export GH_TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill | sed -n 's/^password=//p')
npm run push:api
```

（本地历史已经和远端对齐，两种方式混用不会产生分叉。）

```bash
export GH_TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill | sed -n 's/^password=//p')
npm run push:api
```

**顺带发现**：这个 token 只有 `repo` 权限，没有 `workflow`，所以**不能通过 API 创建 `.github/workflows/*`**（会返回 404），GitHub Actions 那条路在这台机器上走不通。不需要它——legacy 构建在补上仓库根目录的 `.nojekyll` 之后是正常的。

**别删仓库根的 `.nojekyll`**，它和 `docs/.nojekyll` 是两回事。

---

## 3. 日常发版：三条命令

```bash
cd /c/Users/Administrator/WorkBuddy/2026-11-10-21-15-25/virtual-products

node factory/build.mjs      # 编译
node factory/test.mjs       # 必须"全部通过"才往下走
node factory/publish.mjs    # 同步 dist/web → docs/
```

然后按环境选一条推送：

```bash
git add -A && git commit -m "add <slug>" && git push   # 你自己的电脑
npm run push:api                                        # 这个沙箱（走 API）
```

**顺序不能换**：测试跑的是 `dist/web`，publish 搬的也是 `dist/web`，先测再发能挡住带 NaN 的页面。

部署 30–60 秒生效。判断有没有生效别靠刷新，用：

```bash
curl -s https://qwehkkk.github.io/calc-tools/ | grep -c carton
```

---

## 4. 反馈闭环

### 4.1 页面上的三个入口

| 按钮 | 给谁 | 产出 |
|---|---|---|
| **Report a wrong number** | 有 GitHub 账号的人 | 开一条 Issue，正文**已填好他这组输入和全部结果**，只需写"实际是多少" |
| **Copy my numbers** | 没账号、在微信里聊的人 | 复制一段纯文本，粘到哪都行 |
| **or email** | 都不想用的人 | 邮件，标题和页面地址已预填，收件人 `asdzcc@gmail.com`（已确认收信） |

**反馈不依赖对方是"专业人士"，只依赖他用过一次。** 一个跟单员、一个采购、一个学生，只要结果和车间对不上，15 秒就能把证据交上来。行业门槛挡的是"职位权限"，不是"能不能看出数不对"。

### 4.2 仓库里建一次标签

Issues → Labels → New label：Name `wrong-number`，颜色 `#d93f0b`。
（标签不存在时 Issue 仍会创建，只是不打标；建一次之后所有新报告自动归堆。）

### 4.3 每周 30 分钟

1. Issues 按 `wrong-number` 过滤
2. 归到 A/B/C/D 四类（判据在 `03-铺量作战计划.md` 第五节）
3. **A 类（公式真错）当天改**：改 `factory/verticals/<slug>.json` 的 `expr` → build → test → publish → 推送，commit 写 `fix: <slug> per issue #12`
4. Issue 里回一句"已修，刷新即生效"，关掉
5. 贴进 `data/反馈库.csv`

---

## 5. 交 sitemap 给 Search Console（等正式域生效后做）

1. <https://search.google.com/search-console> → 添加资源 → **网址前缀** → `https://calc.toolona.com/`
2. 左侧 Sitemaps → 输入 `sitemap.xml` → 提交
3. URL Inspection 逐页请求收录，**一天 3 个，四天做完**：
   `/container-load-fit/` → `/tile-quantity-calc/` → `/pallet-carton-fit/` → `/carton-blank-yield/` → `/acrylic-panel-quote/` → `/glass-sheet-yield/` → 各自的 `/zh/`

一天全提交等于告诉 Google 这是垃圾站。

---

## 6. 扩展上架（独立动作，晚点做）

网页版有搜索流量之后再动，顺序别倒。

1. 开发者账号：<https://chrome.google.com/webstore/devconsole>，一次性 **$5**
2. 上传 `factory/dist/zip/<slug>.zip`（`npm run pack` 生成，已是合法 MV3 包）
3. 文案：`factory/dist/listing/<slug>.md` 已按字段拆好（名称 ≤45、短描述 ≤132，都校验过）
4. 隐私政策填 `https://calc.toolona.com/privacy.html`（已生成，审核必查）

**别一次传 6 个。** 先传 `container-load-fit`，拿到 5 条评价再传下一个。

---

## 7. 出问题怎么查

| 现象 | 原因 | 处理 |
|---|---|---|
| `Page build failed.` | ①CNAME 指向未解析域名 ②https_enforced 无证书 ③github-pages 环境分支策略允许列表为空 | 先看第 2 节，三条按顺序排除 |
| 打开是 404 | Pages 的 Folder 不是 `/docs` | Settings → Pages 确认 |
| 页面没样式、链接 404 | `deployMode=github` 但 base 没生效 | 确认 `site.json` 的 `deployMode` 是 `github`，重建 |
| 一直"证书签发中" | Cloudflare 是橙色云 | 改 DNS only，等 10 分钟 |
| `ERR_TOO_MANY_REDIRECTS` | Cloudflare 的 Always Use HTTPS 与 GitHub 的 Enforce HTTPS 打架 | 只留 GitHub 那个 |
| 推送报 403 secondary rate limit | 短时间提交太多次 | 等 1–3 分钟重试，脚本会自动退避 |
| 构建成功但线上一直是旧内容 | 部署 job 卡在 `in_progress`（GitHub 侧排队卡住） | 取消卡住的 run 再 `POST /pages/builds` 重跑，实测一次就恢复 |
| 反馈按钮点开 404 | `site.json` 的 `github.owner/repo` 与实际仓库不一致 | 改一处，重建重发 |

---

## 8. 下一步

DNS 一加，正式域就通。之后我继续铺下一批：混凝土用量、涂料用量、钣金排版、体积重、电缆压降、沥青用量——公式全部来自公开标准，不需要任何人先帮我测就能写出第一版，对错由反馈校准。
