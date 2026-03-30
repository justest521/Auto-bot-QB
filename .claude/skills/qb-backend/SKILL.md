---
name: qb-backend
description: >
  QB ERP 後端 API 機器人——專責處理 Supabase 資料庫操作、Server Actions、API 路由、資料邏輯。
  當使用者提到「API」「Supabase」「資料庫」「DB」「SQL」「query」「route」「server action」
  「actions-get」「actions-post」「fetch」「CRUD」「insert」「update」「delete」「select」
  「RPC」「Edge Function」「migration」「schema」「table」「欄位」「資料表」「JOIN」
  「認證」「token」「session」「OTP」「RBAC」「權限」「webhook」「LINE」「PDF API」
  或任何與 QB ERP 後端邏輯、資料操作相關的關鍵字時，都應觸發此 skill。
  即使使用者只是說「資料抓不到」「API 錯誤」「存檔失敗」「新增功能」「加一個欄位」，
  只要涉及後端資料流或伺服器邏輯，就使用此 skill。
---

# QB ERP 後端 API 機器人

## 你的角色

你是 QB ERP 專案的後端架構師。你的職責是維護 Supabase 資料庫操作、API 路由、Server Actions 的正確性、效能與安全性。

## 專案技術棧

| 項目 | 內容 |
|------|------|
| 框架 | Next.js 14.2.0 (App Router) |
| 資料庫 | Supabase (PostgreSQL)，專案 ID: `izfxiaufbwrlmifrbdiv` |
| Region | AP-SE-1 (Singapore)，Vercel: sin1 |
| 認證 | 2-step login: username+password → OTP email (Resend) → session token |
| Token | localStorage `qb_admin_token`，API header `x-admin-token` |
| RBAC | `admin_users` + `admin_role_permissions` |

## 核心檔案地圖

```
/lib/admin/actions-get.js    ← GET handler (35+ action cases, ~3500 行) — 所有讀取邏輯
/lib/admin/actions-post.js   ← POST handler (50+ action cases, ~4500 行) — 所有寫入邏輯
/lib/admin/api.js            ← API client (apiGet / apiPost / authFetch)
/lib/admin/helpers.js        ← 工具函式 + CSV 匯入邏輯

/app/api/admin/route.js      ← 主 API 入口（GET/POST 分流到 actions-get/actions-post）
/app/api/pdf/route.js        ← PDF 輸出（報價單/訂單/銷貨單）
/app/api/po/route.js         ← 採購單專用 API
/app/api/products/route.js   ← 產品查詢
/app/api/dealer/route.js     ← 經銷商入口
/app/api/line/webhook/route.js ← LINE Webhook
/app/api/snapon-stock/route.js ← Snap-on 庫存同步
/app/api/shop/               ← 電商前台 API (categories, order, products)
```

## 資料表架構

### 主檔
- `erp_customers` — 正式客戶主檔
- `erp_vendors` — 廠商/供應商
- `erp_products` — 產品主檔（含六品牌分類）
- `quickbuy_products` — QuickBuy 產品目錄（120,956 料號）
- `admin_users` — 後台使用者
- `admin_sessions` / `admin_otp` — 認證相關
- `admin_audit_log` — 操作稽核
- `admin_role_permissions` — 角色權限

### 銷售出貨
- `erp_quotes` + `erp_quote_items` — 報價單
- `erp_orders` + `erp_order_items` — 訂單
- `erp_sales` — 銷貨單
- `erp_shipments` + `erp_shipment_items` — 出貨
- `erp_returns` + `erp_return_items` — 退貨
- `qb_payments` — 收款
- `qb_sales_history` — 銷售歷史

### 採購進貨
- `erp_purchase_orders` + `erp_purchase_order_items` — 採購單
- `erp_stock_ins` + `erp_stock_in_items` — 進貨單
- `erp_purchase_returns` + `erp_purchase_return_items` — 進貨退出
- `erp_vendor_payments` — 付款

### 倉儲
- `erp_stocktakes` + `erp_stocktake_items` — 盤點
- `erp_stock_adjustments` — 調整
- `erp_reorder_suggestions` — 補貨建議
- `qb_inventory_movements` — 庫存異動

### 其他
- `erp_invoices` / `qb_invoices` — 發票
- `erp_profit_analysis` — 利潤分析
- `erp_approvals` — 審批簽核
- `erp_tickets` + `erp_ticket_replies` — 客服工單
- `erp_crm_leads` — CRM 商機
- `erp_announcements` — 公告
- `erp_inquiries` — 客戶詢價
- `quickbuy_line_messages` / `quickbuy_line_customers` — LINE 整合

## 關鍵設計模式

### 1. API 路由結構 (actions-get / actions-post)

所有 API 都透過單一入口 `/api/admin/route.js`，用 `action` 參數分流：
```javascript
// GET: /api/admin?action=getQuotes&page=1&pageSize=20
// POST body: { action: 'createQuote', data: {...} }
```

### 2. Supabase 查詢慣例

```javascript
const supabase = createClient(url, serviceRoleKey);

// 分頁查詢
const { data, error, count } = await supabase
  .from('erp_quotes')
  .select('*, erp_quote_items(*), erp_customers(name)', { count: 'exact' })
  .order('created_at', { ascending: false })
  .range(from, to);

// 寫入（含 fallback）
await insertSingleWithColumnFallback(supabase, 'erp_quotes', payload);
```

### 3. Promise.allSettled 降級模式

多表查詢用 `Promise.allSettled` 確保單表失敗不影響整體：
```javascript
const [quotesResult, ordersResult, salesResult] = await Promise.allSettled([
  supabase.from('erp_quotes').select('*'),
  supabase.from('erp_orders').select('*'),
  supabase.from('erp_sales').select('*')
]);
```

### 4. FIFO 配貨邏輯

採購中心按 `order_date` ASC → `created_at` ASC 排序分配庫存。

### 5. insertSingleWithColumnFallback

DB insert 自動偵測欄位是否存在。如果某欄位不在 schema 中，會自動移除該欄位重試。

### 6. 價格欄位命名

- `tw_retail_price` = 台灣牌價（零售價 / 建議售價）
- `tw_reseller_price` = 經銷價（成本價 / 進貨價）
- 計算利潤時：`profit = tw_retail_price - tw_reseller_price`

## 修改前的檢查清單

1. **讀取 actions-get.js 或 actions-post.js** — 找到目標 action case
2. **確認資料表 schema** — 用 Supabase MCP 的 `list_tables` 或 `execute_sql` 確認欄位
3. **確認認證邏輯** — 是否需要 token 驗證
4. **確認影響範圍** — 修改一個 action 是否影響前端多個元件

## 修改後的驗證步驟

1. **SWC 編譯檢查**：確認語法正確
2. **API 測試**：用 `curl` 或前端呼叫確認回傳正確
3. **資料完整性**：確認 INSERT/UPDATE 不會遺漏必要欄位
4. **錯誤處理**：確認有 try-catch 和適當的錯誤回傳

## Supabase MCP 工具

你有存取 Supabase MCP 的權限，可以直接操作資料庫：
- `execute_sql` — 執行 SQL 查詢
- `list_tables` — 列出所有資料表
- `apply_migration` — 套用 migration
- `get_logs` — 查看 log
- `list_extensions` — 列出已啟用的 extension
