---
name: qb-erp-ops
description: >
  QB ERP 全方位營運助手——目標取代台灣市面上零售/電商/業務 ERP，以 AI 驅動 + 訂閱制 SaaS 模式運營。
  代理六大品牌：Snap-on、Bahco、Blue Point、Bosch、OTC Tools、Muc-Off。涵蓋銷售分析、保固管理、回訪提醒、供應商三單比對、工具壽命基準、市占率追蹤、政府標案輔助、ERP AI 優化、訂閱制定價策略、電商模組、業務管理模組。
  當使用者提到「工具」「Snap-on」「Bahco」「Blue Point」「Bosch」「OTC」「Muc-Off」「診斷設備」「掃描器」「內視鏡」「工具銷售」「保固」「回訪」「工具客戶」「業務路線」「對帳」「供應商」「工具壽命」「工具採購」「設備租賃」「QB」「Quick Buy」「ERP」「訂閱」「SaaS」「零售」「電商」「業務管理」「AI ERP」「進銷存」「POS」或任何與工具銷售、ERP 系統營運相關的關鍵字時，都應觸發此 skill。
  即使使用者只是說「這個月工具賣多少」「哪個客戶該回訪了」「保固快到期的有哪些」「幫我跟供應商對帳」「這個標案能不能吃」「ERP 要怎麼收費」「怎麼打贏鼎新」「電商模組要加什麼」，只要涉及工具銷售或 ERP 產品化，就使用此 skill。
  也適用於：QB ERP 形象官網設計、工具推薦引擎、AI 自動報價、客戶自助查保固、業務路線優化、SaaS 定價策略、競品分析（鼎新/SAP/SHOPLINE/91APP）、多租戶架構設計。
---

# QB ERP 全方位營運助手

## 系統概況

| 項目 | 內容 |
|------|------|
| 系統名稱 | QB ERP（Quick Buy） |
| 定位 | AI 驅動的次世代 ERP — 零售 + 電商 + 業務管理 |
| 終極目標 | 取代台灣市面 ERP，訂閱制 SaaS |
| 技術棧 | Next.js 14 (App Router) + Supabase + Vercel + LINE LIFF |
| Supabase 專案 | `izfxiaufbwrlmifrbdiv` (AP-SE-1, Vercel region: sin1) |
| 主要依賴 | @supabase/supabase-js, @anthropic-ai/sdk, @line/liff, bcryptjs, xlsx |
| 已上線 | 完整進銷存 ERP + LINE 整合 + 經銷商入口 |

## 六大代理品牌

| 品牌 | 定位 | 品類 | 特性 |
|------|------|------|------|
| Snap-on | 頂級專業工具 | 手工具/氣動/診斷/工具車 | 高單價、終身保固、專業認證 |
| Bahco | 歐系手工具 | 扳手/鉗子/鋸/量具 | 中高單價、瑞典品質、消耗品屬性 |
| Blue Point | Snap-on 副牌 | 手工具/耗材 | 中單價、CP值高、入門款 |
| Bosch | 電動/診斷 | 電動工具/汽車診斷/感測器 | 高科技、電子類強項 |
| OTC Tools | 專業維修 | 特殊工具/拆裝器/壓床 | 專修特定車型、利基市場 |
| Muc-Off | 清潔保養 | 清潔劑/潤滑劑/保養品 | 低單價高頻次、消耗品、機車族群強 |

---

## 系統架構

### 目錄結構
```
QB-ERP/
├── app/
│   ├── admin/
│   │   ├── page.js                    ← 主頁面（sidebar + header + tab 路由）
│   │   └── components/tabs/           ← 51 個分頁元件
│   └── api/
│       ├── admin/route.js             ← 主 API（GET/POST 分流）
│       ├── pdf/route.js               ← PDF 報價單/訂單/銷貨單
│       ├── po/route.js                ← 採購單專用
│       ├── products/route.js          ← 產品查詢
│       ├── dealer/route.js            ← 經銷商入口
│       ├── line/webhook/route.js      ← LINE Webhook
│       ├── snapon-stock/route.js      ← Snap-on 庫存同步
│       └── shop/                      ← 電商前台
│           ├── categories/route.js
│           ├── order/route.js
│           └── products/route.js
├── lib/admin/
│   ├── api.js                         ← API client (apiGet/apiPost/authFetch)
│   ├── styles.js                      ← 全域樣式常數 (S 物件)
│   ├── helpers.js                     ← 工具函式 + CSV 匯入
│   ├── actions-get.js                 ← GET handler (35+ cases, ~2953 行)
│   └── actions-post.js               ← POST handler (50+ cases, ~3631 行)
└── .env.local                         ← Supabase URL/Key, Anthropic, LINE, Resend
```

### API 認證架構
- 2-step login: username+password → OTP email (Resend) → session token
- Token 存 localStorage `qb_admin_token`，API 帶 `x-admin-token` header
- RBAC: `admin_users` + `admin_role_permissions` 控制模組存取
- Rate limiting: 一般 API + 認證端點分開限速

### 核心設計模式
- **React Portal**: `PageLead` 元件透過 `HEADER_ACTION_PORTAL_ID` 將按鈕渲染到 header bar
- **Sidebar 手風琴**: 一次只展開一個分區，點 Logo 全收合
- **全域樣式 (S)**: `/lib/admin/styles.js` 統一管理所有間距/字級/配色
- **FIFO 配貨**: 採購中心按 `order_date` ASC → `created_at` ASC 排序分配
- **Promise.allSettled**: 多表查詢降級處理（單表失敗不影響整體）
- **insertSingleWithColumnFallback**: DB insert 自動偵測欄位是否存在
- **PDF 輸出**: HTML → 瀏覽器列印，支援報價單/訂單/銷貨單，含公司 Logo + 負責業務
- **CSV 匯入**: 12 種資料集批次匯入，支援進度追蹤，批次大小 400-800

---

## 已實作的 Supabase 資料表

### 主檔 (Master Data)
```
erp_customers              — 正式客戶主檔
erp_vendors                — 廠商/供應商主檔
erp_products               — 產品主檔（含六品牌分類）
quickbuy_products          — QuickBuy 產品目錄（120,956 料號）
admin_users                — 後台使用者（含 sales_person 來源）
admin_sessions             — 登入 session
admin_otp                  — OTP 驗證碼
admin_audit_log            — 操作稽核紀錄
admin_role_permissions     — 角色權限
```

### 銷售出貨
```
erp_quotes + erp_quote_items           — 報價單 + 明細
erp_orders + erp_order_items           — 訂單 + 明細
erp_sales                              — 銷貨單
erp_shipments + erp_shipment_items     — 出貨管理
erp_returns + erp_return_items         — 退貨管理
qb_payments                            — 收款紀錄
qb_sales_history                       — 銷售歷史分析
```

### 採購進貨
```
erp_purchase_orders + erp_purchase_order_items  — 採購單 + 明細
erp_stock_ins + erp_stock_in_items              — 進貨單 + 明細
erp_purchase_returns + erp_purchase_return_items — 進貨退出
erp_vendor_payments                              — 付款單
```

### 倉儲管理
```
erp_stocktakes + erp_stocktake_items   — 盤點作業
erp_stock_adjustments                  — 調整單
erp_reorder_suggestions                — 補貨建議
qb_inventory_movements                 — 庫存異動紀錄
```

### 財務與報表
```
erp_invoices                — 發票管理
erp_profit_analysis         — 利潤分析
erp_sales_return_summary    — 銷退貨彙總
qb_invoices                 — QB 發票
```

### 流程與管理
```
erp_approvals              — 審批簽核
erp_tickets + erp_ticket_replies — 客服工單
erp_crm_leads              — CRM 商機管線
erp_announcements          — 公告管理
erp_inquiries              — 客戶詢價
erp_dealer_users           — 經銷商帳號
```

### LINE 整合
```
quickbuy_line_messages     — LINE 訊息紀錄
quickbuy_line_customers    — LINE 客戶資料
quickbuy_chat_history      — AI 對話歷史
quickbuy_config            — 系統設定
quickbuy_promotions + quickbuy_promotion_items — 促銷活動
```

---

## 已實作的 13 個導航分區 + 51 個分頁

### 1. ERP 總覽
| 分頁 | Code | 元件 | 功能 |
|------|------|------|------|
| 系統流程圖 | FLOW | Flowchart.js | ERP 模組關聯圖 |
| 環境檢查 | HEAL | EnvHealth.js | 資料庫表 + 模組就緒狀態 |
| 進銷存報表 | A1 | ReportCenter.js | 鼎新 A1 邏輯報表中心 |
| 儀表板 | DASH | Dashboard.js | 營運數據總覽 |

### 2. ERP 主檔資料
| 分頁 | Code | 元件 | 功能 |
|------|------|------|------|
| 客戶主檔 | CUST | FormalCustomers.js | 正式客戶 CRUD |
| 產品查價 | SRCH | ProductSearch.js | 120K 料號搜尋 + 價格 |
| 廠商主檔 | VNDR | Vendors.js | 供應商管理 |
| LINE 客戶 | LINE | Customers.js | LINE + 正式客戶綜合 |

### 3. ERP 採購進貨
| 分頁 | Code | 元件 | 功能 |
|------|------|------|------|
| 採購單 | PO | PurchaseOrders.js | 建立/確認採購訂單 |
| 採購中心 | PC | ProcurementCenter.js | FIFO 配貨 + 到貨進度 |
| 進貨單 | SI | StockIn.js | 廠商進貨入庫 |
| 進貨退出 | PRTN | PurchaseReturns.js | 退貨給廠商 |
| 付款單 | VP | VendorPayments.js | 對廠商付款 |

### 4. ERP 銷售出貨
| 分頁 | Code | 元件 | 功能 |
|------|------|------|------|
| 報價單 | QUOT | Quotes.js | 報價 → 轉訂單，含 PDF 輸出 |
| 訂單 | ORDR | Orders.js | 訂單 → 轉銷貨/轉採購 |
| 銷貨單 | SALE | SalesDocuments.js | 銷售紀錄 + PDF |
| 出貨管理 | SHIP | Shipments.js | 物流追蹤 |
| 退貨管理 | RTN | Returns.js | 客戶退貨 |
| 收款管理 | PAY | Payments.js | 收款記錄 |
| 活動管理 | PRMO | Promotions.js | 促銷活動 |
| 報價規則 | PRCE | PricingRules.js | 折扣/免運設定 |
| 🔮 零件交易所 | PTEX | PartsExchange.js | 規劃中 |
| 🔮 設備租賃 | LEAS | EquipmentLease.js | 規劃中 |

### 5. ERP 倉儲管理
| 分頁 | Code | 元件 | 功能 |
|------|------|------|------|
| 庫存總覽 | INVT | Inventory.js | 即時庫存 |
| 庫存警示 | ALRT | StockAlerts.js | 低於安全庫存 |
| 補貨建議 | REOD | ReorderSuggestions.js | 自動補貨清單 |
| 盤點作業 | STTK | Stocktake.js | 實體盤點 |
| 調整單 | ADJ | StockAdjustments.js | 手動調整 |

### 6. ERP 分析報表
| 分頁 | Code | 元件 | 功能 |
|------|------|------|------|
| 進銷存報表 | PSI | PSIReport.js | 銷/進/退金額彙總 |
| 財務報表 | FIN | FinancialReport.js | 應收/應付/現金流 |
| 銷退貨彙總 | RETN | SalesReturns.js | 銷退單據彙總 |
| 利潤分析 | PFT | ProfitAnalysis.js | 毛利/成本分析 |
| 🔮 AI 預測 | AIFC | AIForecast.js | 規劃中 |
| 資料匯入 | IMPT | ImportCenter.js | 12 種 CSV 匯入 |

### 7–13. 其他模組
| 分區 | 分頁 | 功能 |
|------|------|------|
| CRM 客戶管線 | 商機管線 (CRM) | Lead → Prospect → Customer |
| ERP 財務會計 | 發票管理 (INV) | 發票開立/追蹤 |
| ERP 審批簽核 | 簽核審批 (APPR) | 文件核准流程 |
| 客服工單 | 工單管理 (TCKT) | 客服工單 + 回覆 |
| 經銷商入口 | 帳號(DUSR) / 訂單(DORD) / 公告(ANN) | 經銷商專用 |
| LINE 與系統 | 聊天(CHAT) / 標籤(TAG) / AI對話(MSG) / Prompt(AI) / 歷史(HIST) | LINE 整合 |
| 系統管理 | 使用者(UMGT) / 公司設定(CSET) | 後台管理 |

---

## API 端點清單

### GET Actions (actions-get.js, 35+ cases)
```
# 系統
ping, me, env_health, stats, ai_prompt, pricing, import_history, chat_history_stats, staff_list

# 主檔
customers, formal_customers, vendors, products, promotions

# 銷售
quotes, orders, sales_documents, sale_detail, shipments, shipment_detail
returns, return_detail, sales_returns, payments, order_items_with_stock

# 採購
purchase_orders, stock_ins, purchase_returns, order_payments

# 倉儲與報表
inventory, inventory_movements, profit_analysis

# LINE
messages, chat_history, line_conversations, line_thread, line_customer_tags

# 客戶
customer_detail, formal_customer_detail, customer_duplicates, erp_customer_lookup

# 管理
list_admin_users, list_admin_roles, list_admin_permissions, get_role_permissions
```

### POST Actions (actions-post.js, 50+ cases)
```
# 認證
login_step1, login_step2, logout

# 客戶
create_customer, update_customer_profile, quick_create_customer
link_line_customer, update_customer_stage

# 產品
create_product, upload_product_image, update_product_master

# 報價 (8 actions)
create_quote, update_quote, update_quote_item, add_quote_item
replace_quote_item, delete_quote_item, convert_quote_to_order, delete_quote

# 訂單 (4 actions)
create_order, convert_order_to_sale, create_shipment, update_shipment_status

# 收付款 (4 actions)
create_payment, confirm_payment, create_vendor_payment, confirm_vendor_payment

# 採購 (12+ actions)
create_purchase_order, confirm_purchase_order
create_stock_in, confirm_stock_in, create_purchase_return
update_po_item, update_po_vendor, receive_po_items
delete_po_item, add_po_item, replace_po_item
mark_po_exported, clear_po_exported

# 庫存 (5 actions)
inventory_adjust, create_stocktake, update_stocktake_item
complete_stocktake, create_stock_adjustment

# 退貨
create_return, approve_return

# 促銷
update_pricing, create_promotion, toggle_promotion

# 管理
create_admin_user, update_admin_user, delete_admin_user
update_role_permissions, update_company_settings, upload_company_logo

# 其他
import_csv_dataset, update_ai_prompt, expire_quotes
create_dealer_user, create_vendor
create_ticket, update_ticket, reply_ticket
create_inquiry, update_inquiry_status
reset_erp_business_data
```

---

## UI 設計規範

### 全域樣式 (S 物件 — lib/admin/styles.js)
```
配色: 主色 #16a34a (green-600), 文字 #111827, 邊框 #e5e7eb, 背景 #f5f6f7
字型: 'Noto Sans TC', system-ui fallback / 數字用 DM Mono
Sidebar: 寬 250px, 手風琴展開, 彩色圖標背景方塊
Header: minHeight 52px, padding 6px 28px
Card: padding 16px 18px, borderRadius 12, marginBottom 12
Input: padding 7px 12px, borderRadius 8
Button 主要: padding 7px 16px, borderRadius 8, background #16a34a
Button Ghost: padding 6px 14px, borderRadius 8, border #e5e7eb
Tag: fontSize 11, padding 2px 8px
頁面標題: fontSize 20
列表 Header: padding 6px 14px
列表 Row: padding 8px 14px
```

### Sidebar 行為
- 手風琴模式：點分類 → 展開該分類 + 跳到第一個子項 + 收合其他
- 預設全收合，初始載入展開當前 tab 所在分區
- 點 Logo → 全部收合
- 收合模式只顯示分類彩色圖標（36x36），點擊展開 sidebar + 跳轉
- Section icon 用 Unicode 符號 + 彩色圓角背景
- Active tab 有左側綠色邊條 (3px solid #16a34a)
- Badge 紅點顯示待處理數量

---

## 完整業務流程（已實作）

### 銷售流程
```
報價單(Quote) → 確認 → 轉訂單(Order)
  ↓
訂單 → 庫存比對 → 有貨 → 轉銷貨單(Sale) → 出貨(Shipment) → 收款(Payment)
  ↓                    ↓
  └─── 缺貨 → 轉採購單(PO) → 進貨(Stock In) → 回到訂單
  ↓
退貨(Return) → 審核 → 庫存回補
```

### 採購流程
```
採購單(PO) → 確認 → 進貨單(Stock In) → 入庫
  ↓
進貨退出(Purchase Return) → 扣庫存
  ↓
付款單(Vendor Payment) → 確認付款
```

### 庫存流程
```
進貨入庫 / 銷貨扣庫 / 退貨回補 → 即時庫存
  ↓
庫存警示 → 補貨建議 → 轉採購單
  ↓
盤點作業 → 差異 → 調整單
```

---

## 尚未實作的規劃功能

以下功能在願景中但尚未建成，標記為 🔮：

| 功能 | 狀態 | 說明 |
|------|------|------|
| 保固管理 | 🔮 規劃中 | 六品牌保固條款、序號追蹤、索賠流程 |
| 回訪提醒 | 🔮 規劃中 | 30天/60天/90天觸發 + LINE 推播 |
| 供應商三單比對 | 🔮 規劃中 | PO vs 送貨單 vs 發票自動比對 |
| 工具壽命基準 | 🔮 規劃中 | 品類壽命模型 + 預測性補貨 |
| 市占率追蹤 | 🔮 規劃中 | 區域滲透率 + 競品分析 |
| AI 自動補貨 | 🔮 規劃中 | 歷史銷售 × 季節性 → 補貨清單 |
| AI 客戶分群 | 🔮 規劃中 | VIP/成長/沉睡/流失 自動分群 |
| AI 定價助手 | 🔮 規劃中 | 成本+競品+歷史 → 建議售價 |
| AI 異常偵測 | 🔮 規劃中 | 退貨率/銷量/庫存異常預警 |
| 電商購物車 | 🔮 部分 | shop/ API 存在但前台未完整 |
| 業務路線 GPS | 🔮 規劃中 | AI 排路線 + GPS 打卡 |
| 多租戶 SaaS | 🔮 規劃中 | tenant_id RLS 架構 |
| 零件交易所 | 🔮 規劃中 | 已有分頁但未完整 |
| 設備租賃 | 🔮 規劃中 | 已有分頁但未完整 |
| AI 預測 | 🔮 規劃中 | 已有分頁但未完整 |

---

## 12 種 CSV 匯入資料集

| Dataset ID | 表名 | 批次大小 |
|------------|------|----------|
| quickbuy_products | quickbuy_products | 800 |
| erp_customers | erp_customers | 400 |
| erp_vendors | erp_vendors | 400 |
| erp_sales_return_summary | erp_sales_return_summary | 400 |
| erp_profit_analysis | erp_profit_analysis | 400 |
| erp_quotes | erp_quotes | 800 |
| erp_orders | erp_orders | 400 |
| qb_sales_history | qb_sales_history | 400 |
| erp_purchase_orders | erp_purchase_orders | 400 |
| erp_stock_ins | erp_stock_ins | 400 |
| erp_invoices | erp_invoices | 400 |
| qb_inventory_movements | qb_inventory_movements | 400 |

---

## 開發注意事項

1. **所有 ERP 表用 `erp_` 前綴**（不是 `tool_` 或 `supplier_`）
2. **API 統一入口** `/api/admin` — GET 用 `action` param，POST 用 body `{ action, ... }`
3. **新增欄位要用 `insertSingleWithColumnFallback`** 避免欄位不存在時 crash
4. **多表查詢用 `Promise.allSettled`** 確保單表失敗不影響整體
5. **日期一律用 `Asia/Taipei` 時區** — `todayInTaipei()` helper
6. **Sidebar 新增分頁** 需改 `SECTIONS` array + `TAB_META` + `TAB_COMPONENTS` 三處
7. **PDF 輸出** 在 `/api/pdf/route.js`，HTML 模板 + 瀏覽器列印
8. **sales_person 欄位** 從 `admin_users` + 歷史資料合併（`staff_list` API）
9. **檔案上傳** 5MB 限制，base64 編碼傳送
10. **Style 修改** 統一改 `lib/admin/styles.js` 的 S 物件

---

## 訂閱制 SaaS 策略（未來方向）

### 要打的對手

| 對手 | 弱點 | QB 優勢 |
|------|------|---------|
| 鼎新/正航 | 老舊介面、導入費百萬、客製化地獄 | 雲端即開即用、AI 內建、月付 |
| SAP/Oracle | 大企業才用得起、太重 | 中小企業友善、行業專精 |
| SHOPLINE/91APP | 只有電商、沒有 ERP 深度 | 進銷存+電商+業務一體化 |
| Excel/Google Sheet | 沒有流程、沒有自動化 | 流程引擎+AI+LINE整合 |
| Odoo | 開源需自己搞、中文差 | 台灣本地化、LINE 生態整合 |

### 訂閱方案

| 方案 | 月費 | 適合 | 包含 |
|------|------|------|------|
| **Free** | NT$0 | 個人/微型 | 100 筆訂單/月、1 用戶、基本進銷存 |
| **Starter** | NT$990/月 | 小型店家 | 1,000 筆/月、3 用戶、LINE 通知、基本報表 |
| **Pro** | NT$2,990/月 | 中型企業 | 無限訂單、10 用戶、AI 補貨、電商、業務管理 |
| **Enterprise** | NT$7,990/月 | 連鎖/經銷 | 無限用戶、多店、API、客製報表、專屬客服 |

### 擴展路徑
```
Phase 1 → 自用（QB ERP 自己用）← 目前在這裡
Phase 2 → 開放同業（其他工具經銷商）
Phase 3 → 泛零售（五金行/汽車百貨/機車用品店）
Phase 4 → 通用 ERP SaaS（任何中小企業）
```
