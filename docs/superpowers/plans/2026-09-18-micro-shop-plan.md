# 微型商城实现计划（VODAR）

> 依据：`docs/superpowers/specs/2026-09-18-micro-shop-design.md`（含终审六项修订 #14~#19）
>
> 形态：Cloudflare Pages（静态 + Functions）+ D1 + Resend；先模拟支付跑通全链路
>
> 状态：待执行

---

## 目标

在现有 `vodar.net`（Pages + GitHub 自动部署）上，实现完整微型商城：
买家选品下单（模拟支付）→ 生成订单 + 自动邮件 → 商家后台发货/售后处理 → 买家凭订单号查物流与售后。

## 分阶段任务

### 阶段 0：项目结构（不动线上页面）
- [ ] 0.1 建 `functions/` 目录（Pages Functions 文件路由）
- [ ] 0.2 建 `schema.sql`（D1 建表：products / orders / order_items / tracking / after_sales / settings）
- [ ] 0.3 建 `wrangler.toml`（D1 绑定、项目名对齐现有 Pages 项目）
- [ ] 0.4 确认 `.gitignore` 无需变更；本地 `wrangler pages dev` 跑通空 Functions

### 阶段 1：后端 API（买家端）
- [ ] 1.1 `functions/api/products.js` — GET 商品列表（只返回 active 商品，含价格）
- [ ] 1.2 `functions/api/order/create.js` — POST 下单：
  - 校验商品 active、数量合法；金额服务端计算（不信前端价格）
  - **幂等（#18）**：同邮箱+同商品组合 60 秒内返回已有订单，不新建
  - 生成订单号 `VOD-<YYMMDD>-<6位随机>`（防枚举）
  - 状态置"待支付"，写入 orders + order_items
- [ ] 1.3 `functions/api/payment/mock.js` — 模拟支付回调：置"已支付"，触发邮件；**预留 `functions/api/payment/callback.js` 真实回调位（#14 验签钩子，模拟阶段跳过验签）**
- [ ] 1.4 `functions/api/order/[id]/query.js` — GET 查询：**只读脱敏（#13）**：返回状态/商品/物流/售后进度；不返回地址、完整邮箱
- [ ] 1.5 `functions/api/aftersales/create.js` — POST 售后：**邮箱二次校验（#13）**：需提交订单邮箱，服务端比对（脱敏显示 `j***@gmail.com`），匹配才受理工单
- [ ] 1.6 `functions/api/_lib/email.js` — Resend 发信：付款成功邮件（含订单号、查询入口链接）；失败不阻塞订单流程（记录日志）

### 阶段 2：商家后台 API（全部带登录态校验）
- [ ] 2.1 `functions/api/admin/login.js` — POST 密码登录（对 `ADMIN_PASSWORD` Secret）；签发带过期的会话 Cookie（HttpOnly）
- [ ] 2.2 **登录限速（#15）**：同 IP 连续失败 5 次 → 锁 15 分钟（D1 存失败计数）
- [ ] 2.3 `functions/api/admin/orders.js` — GET 订单列表/详情（完整信息，含买家地址）
- [ ] 2.4 `functions/api/admin/tracking.js` — POST 录入物流（承运商+跟踪号）→ 订单状态"已发货"
- [ ] 2.5 `functions/api/admin/aftersales.js` — GET 售后列表；POST 填处理说明/改状态（待处理→处理中→已解决）
- [ ] 2.6 `functions/api/admin/products.js` — GET/POST 商品开关与改价（#19）

### 阶段 3：买家端页面（英文，品牌红风格）
- [ ] 3.1 改造 `index.html`：
  - 商品区：2~3 商品卡（数量选择、合计实时计算、提交按钮**点击即禁用**）
  - 收货信息表单（姓名/邮箱/地址/城市/国家/邮编）
  - 成功页区：显示订单号 + "邮件已发送"提示
  - 订单查询区：输订单号 → 状态/商品/物流跟踪号/售后进度
  - 售后提交（查询页内）：类型（退货/换货/其他）+ 邮箱校验 + 描述
  - **保留现有留言表单**（#10）
- [ ] 3.2 `privacy.html` — 隐私政策（GDPR：收集内容/用途/存储/删除权）（#17）
- [ ] 3.3 `returns.html` — 退货政策（欧盟 14 天无理由退货 + 流程）（#17）
- [ ] 3.4 页脚加两政策页链接

### 阶段 4：商家后台页面
- [ ] 4.1 `admin.html`（不建站内入口，不索引）：登录表单 + 限速提示
- [ ] 4.2 仪表盘：订单列表（状态筛选）→ 详情（买家信息）
- [ ] 4.3 物流录入表单；售后工单列表 + 处理表单
- [ ] 4.4 商品开关/改价表单

### 阶段 5：本地联调（wrangler pages dev + 本地 D1）
- [ ] 5.1 初始化本地 D1（执行 schema.sql + 种子商品 P1~P3）
- [ ] 5.2 端到端：下单 → 模拟支付 → 查询 → 售后 → 后台录入物流 → 买家可见
- [ ] 5.3 安全自测：查询接口无敏感字段；单号+错误邮箱无法提交售后；未登录不可调 admin 接口；5 次错误密码触发锁定
- [ ] 5.4 幂等自测：双击提交只生成一单

### 阶段 6：部署上线
- [ ] 6.1 生产 D1 建库 + 绑定（Pages 项目配置或 wrangler.toml 提交）
- [ ] 6.2 Secrets：`ADMIN_PASSWORD`（与用户商定）、`RESEND_API_KEY`（用户注册 Resend 免费档 + 域名验证）
- [ ] 6.3 git push → Pages 自动部署 → 线上冒烟测试（真实浏览器）
- [ ] 6.4 用真实邮箱走一遍全流程，确认订单邮件送达

## 关键技术决策（实现时遵守）
- 金额一律**分**为单位存储，展示层再转 `$xx.xx`
- 订单号格式 `VOD-260918-A1B2C3`（日期 + 6 位随机 base32）
- 所有 admin 接口走同一中间件校验会话 Cookie，**无豁免**
- 模拟支付与真实回调共用状态机，切换时仅替换 payment/callback.js 内实现（+验签）
- 邮件失败不影响主流程（catch + 日志），避免 Resend 故障阻塞下单

## 用户配合项（到对应阶段会提醒）
| 项 | 阶段 | 说明 |
|:--|:--|:--|
| 设置 `ADMIN_PASSWORD` | 6.2 | 商家后台密码（Secrets，不进 Git） |
| 注册 Resend + 域名验证 | 6.2 | 免费档即可；SPF/DKIM 记录按 Resend 指引加到 Cloudflare DNS |
| 真实收单切换（可后置） | 上线后 | 拿到连连凭据后替换回调实现 + 启用验签 |
