# QB ERP 後端健康檢查報告

**執行時間：** 2026-04-01 自動排程
**專案：** Auto QB (Supabase: izfxiaufbwrlmifrbdiv)
**狀態總覽：** 🟡 警告（需關注）

---

## 1. JavaScript 語法編譯檢查

| 檔案 | 狀態 |
|------|------|
| `lib/admin/actions-get.js` (191KB) | ✅ 通過 |
| `lib/admin/actions-post.js` (250KB) | ✅ 通過 |
| `lib/admin/api.js` | ✅ 通過 |
| `lib/admin/helpers.js` | ✅ 通過 |
| `lib/admin/actions-hr.js` | ✅ 通過 |
| `lib/admin/actions-pulse.js` | ✅ 通過 |
| `app/api/admin/route.js` | ✅ 通過 |
| `app/api/pdf/route.js` | ✅ 通過 |

**結果：** ✅ 全部 8 個核心後端檔案語法正確，無編譯錯誤。

---

## 2. API Actions 錯誤處理分析

### actions-get.js（85 個 action cases）

| 指標 | 數值 | 狀態 |
|------|------|------|
| 總 action 數 | 85 | — |
| 有 try-catch 的 | 21 (25%) | ⚠️ 偏低 |
| 無 try-catch 的 | 64 (75%) | ⚠️ 警告 |
| Fall-through 問題 | 0 | ✅ 正常 |
| Supabase 查詢無錯誤檢查 | 20 cases | ❌ 高風險 |

**高風險 GET actions（無任何錯誤處理）：**
stats, report_center, messages, promotions, pricing, chat_history_stats, stocktake_detail, psi_report, psi_monthly_trend, financial_report, pending_badges, po_item_allocation, stock_alerts, matching_summary, ticket_detail, document_chain, quote_detail, procurement_center, quick_receive_match, barcode_lookup

### actions-post.js（111 個 action cases）

| 指標 | 數值 | 狀態 |
|------|------|------|
| 總 action 數 | 111 | — |
| 有 try-catch 的 | 12 (11%) | ❌ 嚴重偏低 |
| 無 try-catch 的 | 99 (89%) | ❌ 警告 |
| Fall-through 問題 | 0 | ✅ 正常 |
| Supabase 查詢無錯誤檢查 | 8 cases | ❌ 高風險 |

**高風險 POST actions（多個查詢但零錯誤檢查）：**

| Action | 查詢數 | 錯誤檢查數 | 風險 |
|--------|--------|-----------|------|
| execute_vendor_matching | 10 | 0 | ❌ 極高 |
| complete_stocktake | 10 | 0 | ❌ 極高 |
| execute_matching | 10 | 0 | ❌ 極高 |
| receive_po_items | 21 | 1 | ❌ 極高 |
| shortage_to_po | 16 | 3 | ❌ 高 |
| instock_to_sale | 26 | 6 | ⚠️ 中 |

---

## 3. Supabase 連線測試

| 指標 | 數值 | 狀態 |
|------|------|------|
| 資料庫狀態 | ACTIVE_HEALTHY | ✅ 正常 |
| Postgres 版本 | 17.6.1.084 | ✅ 正常 |
| 區域 | ap-southeast-1 | ✅ 正常 |
| 客戶總數 | 1,919 | ✅ |
| 產品總數 | 0 | ⚠️ 空表 |
| 訂單總數 | 62 | ✅ |
| 報價單總數 | 49 | ✅ |
| ERP 資料表數量 | 63 張表 | ✅ |

---

## 4. 資料完整性抽查

| 檢查項目 | 結果 | 狀態 |
|----------|------|------|
| 無客戶的訂單 | 6 筆 | ⚠️ 需檢查 |
| 無明細的訂單 | 0 筆 | ✅ 正常 |
| 無明細的報價單 | 0 筆 | ✅ 正常 |
| erp_products 表結構 | 僅有 id 欄位 | ❌ 異常（缺少 part_number 等欄位） |
| 近 30 天訂單 | 62 筆 | ✅ 活躍 |
| 近 30 天報價 | 49 筆 | ✅ 活躍 |
| 有 email 的客戶 | 8 / 1,919 (0.4%) | ⚠️ 極低 |
| 有電話的客戶 | 1,209 / 1,919 (63%) | ✅ 尚可 |

---

## 5. 環境變數一致性

共偵測到以下 process.env 引用，分布於 12 個檔案中：

| 環境變數 | 引用次數 | 檔案數 |
|----------|---------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | 5 | 5 |
| `SUPABASE_URL` | 4 | 4 |
| `SUPABASE_SERVICE_KEY` | 4 | 4 |
| `SUPABASE_SERVICE_ROLE_KEY` | 4 | 4 |
| `SUPABASE_ANON_KEY` | 1 | 1 |
| `LINE_CHANNEL_ACCESS_TOKEN` | 8 | 3 |
| `LINE_CHANNEL_SECRET` | 1 | 1 |
| `ANTHROPIC_API_KEY` | 3 | 3 |
| `ADMIN_TOKEN` | 1 | 1 |
| `RESEND_API_KEY` | 2 | 2 |
| `EMAIL_FROM` | 1 | 1 |
| `DEALER_SALT` | 3 | 2 |
| `NEXT_PUBLIC_LIFF_ID` | 1 | 1 |
| `NEXT_PUBLIC_APP_URL` | 1 | 1 |
| `VERCEL_URL` | 1 | 1 |
| `PO_FROM_NAME` | 1 | 1 |
| `PO_FROM_EMAIL` | 1 | 1 |

**發現的問題：**
- ⚠️ Supabase 金鑰命名不一致：同時使用 `SUPABASE_SERVICE_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY`，靠 fallback（`||`）彌補。建議統一為一個變數名。
- ⚠️ `SUPABASE_ANON_KEY` 只在 `lib/supabase.js` 中作為最後 fallback 使用，若前兩個 key 都沒設定才會用到，可能造成權限問題。

---

## 6. 總結與建議

### 🔴 需立即處理

1. **erp_products 表結構異常** — 僅有 `id` 欄位，資料筆數為 0。程式碼中引用了 `part_number` 欄位但資料庫中不存在。需確認 migration 是否遺漏或表結構是否需要重建。

2. **POST actions 錯誤處理嚴重不足** — 111 個 POST action 僅 11% 有 try-catch。特別是 `execute_vendor_matching`、`complete_stocktake`、`execute_matching` 涉及多步資料庫操作卻完全無錯誤處理，可能導致資料不一致。

### 🟡 建議改善

3. **6 筆訂單缺少 customer_id** — 可能是測試資料或建立時的 bug，建議清理或補齊。

4. **客戶 email 覆蓋率極低 (0.4%)** — 若有 email 通知功能（如 Resend 寄信），大部分客戶無法收到。

5. **環境變數命名統一** — 將 `SUPABASE_SERVICE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 統一為單一命名。

6. **GET actions 錯誤處理** — 75% 的 GET action 無 try-catch，雖然風險低於 POST，但仍可能在生產環境中造成未處理的 500 錯誤。

### ✅ 正常項目

- 所有 8 個核心檔案語法正確
- 無 fall-through（case 洩漏）問題
- Supabase 資料庫連線正常且健康
- 訂單與報價單明細完整性正常
- 系統近 30 天有活躍交易數據
