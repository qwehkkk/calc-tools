# 虚拟产品工厂（Toolona Calc）

用 AI 的产能铺通用计算工具，抢搜索位置和货架位置，用免费换反馈，用反馈校准。

**核心不是做产品，是让"新增一个产品"变成一件十分钟的事。**

---

## 现在有什么

6 个已编译完成的产品，每个都有网页版（中英）、Chrome 扩展包、商店上架文案：

| 优先级 | 产品 | 干什么 | 文件 |
|---|---|---|---|
| 1 | carton-blank-yield | 纸箱展开尺寸 + 每张出数 + 单箱纸钱 | `factory/verticals/` |
| 2 | pallet-carton-fit | 托盘码垛：单层几个、能叠几层 | |
| 3 | acrylic-panel-quote | 亚克力排版 + 单件成本 + 报价 | |
| 4 | glass-sheet-yield | 玻璃原片出数 + 真实利用率 | |
| 5 | container-load-fit | 集装箱装柜：六种摆法取最优 | |
| 6 | tile-quantity-calc | 瓷砖用量 + 要买几箱 + 总价 | |

全部公式可验证：玻璃 2440×3300 切 800×500 → 18 块/张；托盘 1200×1000 放 400×300 → 9 个/层；40HQ 装 600×400×350 → 720 箱。跟手算对得上。

---

## 四条命令

```bash
node factory/build.mjs      # 编译：配置 → 网页/扩展/文案/sitemap/404/隐私条款
node factory/test.mjs       # 冒烟测试：真跑页面脚本，查 NaN、空图、反馈链接
node factory/publish.mjs    # 同步 dist/web → docs/（GitHub Pages 的发布目录）
node factory/pack.mjs       # 打包：dist/zip/<slug>.zip，可直接传商店
```

发布：`docs/` 推到 GitHub，Pages 自动部署，绑 `calc.getoolkit.com`。完整步骤见 `04-GitHub发布与反馈.md`。

---

## 新增一个产品（十分钟）

1. 复制 `factory/verticals/_template.json`，改名成 `<slug>.json`
2. 填公式。`expr` 是字符串，支持 `+ - * / % ^ ( )`、`min max floor ceil round abs sqrt ifelse snap clamp`，可以直接引用其它 input 或前面算出的 id
3. 跑 `node factory/build.mjs && node factory/test.mjs`
4. 跑 `node factory/pack.mjs`，zip 拖进 Chrome 或传商店

**两类产品同一套配置：**

- **有排版图的**：填 `parts`（零件尺寸），自动出 SVG 排样图
- **纯公式的**（装柜、瓷砖、涂料）：`parts: []` + `"noDiagram": true`

---

## 目录

```
factory/
├── site.json            域名、邮箱、站名（改这里，canonical 和 sitemap 全跟着变）
├── build.mjs            编译器
├── test.mjs             冒烟测试（最小 DOM 垫片，Node 里真跑页面 JS）
├── pack.mjs             扩展打包（纯 Node 实现 zip，无依赖）
├── engine/
│   ├── formula.js       安全表达式求值器（无 eval，Pratt parser）
│   ├── nesting.js       2D 排版：单尺寸解析网格 + 多尺寸 MaxRects
│   └── engine.js        通用取整与换算
├── template/page.html   唯一模板：一份 HTML 驱动所有产品
├── verticals/           ← 产品就是这里的 json
└── dist/
    ├── web/<slug>/      英文页（SEO 主战场）
    ├── web/zh/<slug>/   中文页
    ├── web/index.html   工具目录
    ├── ext/<slug>/      Chrome MV3 扩展源
    ├── zip/             可直接上传的扩展包
    └── listing/         商店上架文案（名称/短描述/关键词/权限说明）
```

---

## 几个不能忘的判断

- **Chrome 商店不是流量入口。** 26.8 万个扩展，中位数安装 17 个，86% 不到 1000 用户；排名靠评分和安装量。刚上传的扩展没有自然流量，必须从站外点火。
- **网页版才是资产。** 能被 Google 搜到、能沉淀、能复利。扩展是转化面，不是获客渠道。
- **公式层比算法层值钱。** 2D 排版已经商品化（免费的一堆），但没人认识 FEFCO 箱型、标准纸度、行业单位。这部分公开资料两小时能查清，是 AI 能补的活。
- **反馈必须带数字。** 页面上「Report a wrong number」会把当前全部输入和结果**预填进一条 GitHub Issue**，对方只需写「实际是多少」。收到的不是"不好用"，是"我输 320×220×180 得到 5 个/张，实际是 6 个"——这种可直接改公式。旁边还有「复制我这组数」给没有 GitHub 账号的人。

---

## 相关文档

- `04-GitHub发布与反馈.md` —— 建仓、Pages、自定义域、GSC、Issue 反馈闭环，逐条可照做
- `03-铺量作战计划.md` —— 平台权重表、产品优先级矩阵、四周节奏、反馈闭环决策规则、下一批候选
- `02-垂直路线图.md` —— 只保留"公式层是位置"这一结论，其余思路已作废
- `01-需求证据与定位.md` —— 推理存档，多数判断已被推翻
- `原始材料/` —— 最初转过来的两份材料

**下一步只在 `03-铺量作战计划.md` 的第八节。** 产品已经够多了，缺的是入口和第一批反馈。
