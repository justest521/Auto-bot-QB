# QB ERP 後端健康檢查報告

**檢查時間**: 2026-04-02（自動排程）
**專案**: Auto QB (izfxiaufbwrlmifrbdiv)
**Supabase 狀態**: ACTIVE_HEALTHY
**資料庫版本**: PostgreSQL 17.6.1.084

---

## 1. SWC 編譯 ✅ 全部通過

| 檔案 | 狀態 |
|------|------|
| lib/admin/actions-get.js | ✅ OK |
| lib/admin/actions-post.js | ✅ OK |
| lib/admin/api.js | ✅ OK |
| lib/admin/helpers.js | ✅ OK |
| app/api/admin/route.js | ✅ OK |
| app/api/pdf/route.js | ✅ OK |

所有 6 個核心後端檔案皆通過 SWC 編譯，無語法錯誤。

---

## 2. API Actions 完整性 ⚠️ 需關注

### 規模統計
- **actions-get.js**: 85 個 case
- **actions-post.js**: 111 個 case
- **合計**: 196 個 API action

### Try-Catch 覆蓋率
| 檔案 | 總 case 數 | 有 try-catch | 無 try-catch | 覆蓋率 |
|------|-----------|-------------|-------------|--------|
| actions-get.js | 85 | 21 | 64 | 24.7% |
| actions-post.js | 111 | 12 | 99 | 10.8% |

> **⚠️ 警告**: 大部分 action case 缺少獨立的 try-catch 錯誤處理。雖然外層可能有全域 catch，但建議為關鍵寫入操作（如 create_order、create_payment、create_shipment）加上獨立的 try-catch 以提供更精確的錯誤訊息。

### Supabase 查詢錯誤檢查
| 檔案 | Supabase 呼叫數 | 缺少 error 解構 |
|------|----------------|----------------|
| actions-get.js | 124 | 5 |
| actions-post.js | 353 | 1 |

缺少 error 解構的位置（actions-get.js）：
- 第 897 行（promotions 相關）
- 第 938, 950, 957 行（vendors/item_memory 相關）
- 第 1527 行（pricing 相關）
- actions-post.js 第 27 行（import 相關）

> **⚠️ 警告**: 這 6 處 Supabase 呼叫僅解構 `{ data }` 而未包含 `{ data, error }`，若查詢失敗將靜默忽略錯誤。

---

## 3. Supabase 連線測試 ✅ 正常

資料庫可達，各主表筆數：

| 資料表 | 筆數 |
|--------|------|
| erp_customers | 1,919 |
| quickbuy_products | 122,483 |
| erp_orders | 62 |
| erp_quotes | 49 |
| erp_vendors | 17 |
| qb_sales_history | 25,810 |

---

## 4. 資料完整性抽查 ⚠️ 有異常

### 4.1 沒有客戶的訂單 — ⚠️ 6 筆

有 6 筆訂單的 `customer_id` 為 NULL：

| 訂單號 | 建立時間 |
|--------|---------|
| DO1774272932892 | 2026-03-23 13:35 |
| DO1774272853811 | 2026-03-23 13:34 |
| DO1774272500595 | 2026-03-23 13:28 |
| DO1774271346184 | 2026-03-23 13:09 |
| DO1774058754403 | 2026-03-21 02:05 |
| DO1774058385007 | 2026-03-21 01:59 |

> 這些訂單集中在 3/21 與 3/23，可能是測試資料或前端建單時未正確帶入客戶 ID。建議檢查建單流程。

### 4.2 沒有明細的報價單 — ✅ 0 筆

所有 49 筆報價單都有對應的報價明細，正常。

### 4.3 重複的產品料號 — ✅ 0 筆

`quickbuy_products.item_number` 無重複值，正常。

---

## 5. 環境變數一致性 ✅ 正常

共偵測到以下 `process.env` 引用，分布於 12 個檔案：

| 環境變數名稱 | 引用次數 | 檔案數 |
|-------------|---------|--------|
| LINE_CHANNEL_ACCESS_TOKEN | 8 | 4 |
| ANTHROPIC_API_KEY | 3 | 3 |
| SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL | 6 | 5 |
| SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE_KEY | 6 | 5 |
| SUPABASE_ANON_KEY | 1 | 1 |
| ADMIN_TOKEN | 2 | 2 |
| RESEND_API_KEY | 2 | 2 |
| DEALER_SALT | 4 | 2 |
| LINE_CHANNEL_SECRET | 1 | 1 |
| NEXT_PUBLIC_LIFF_ID | 1 | 1 |
| NEXT_PUBLIC_APP_URL / VERCEL_URL | 2 | 1 |
| PO_FROM_NAME / PO_FROM_EMAIL | 2 | 1 |
| EMAIL_FROM | 1 | 1 |

**命名一致性**: Supabase 連線使用 fallback 模式（`SUPABASE_URL || NEXT_PUBLIC_SUPABASE_URL`），各檔案間命名一致。DEALER_SALT 帶有預設值 `'qb_dealer_2024'`。未發現命名不一致問題。

---

## 6. 總結

| 檢查項目 | 狀態 | 說明 |
|---------|------|------|
| SWC 編譯 | ✅ 正常 | 6/6 檔案通過 |
| Supabase 連線 | ✅ 正常 | 資料庫 ACTIVE_HEALTHY |
| API Action 數量 | ℹ️ 資訊 | GET 85 + POST 111 = 196 個 |
| Try-Catch 覆蓋 | ⚠️ 警告 | GET 24.7% / POST 10.8% 覆蓋率偏低 |
| Supabase Error 檢查 | ⚠️ 警告 | 6 處缺少 error 解構 |
| 訂單無客戶 | ⚠️ 警告 | 6 筆訂單 customer_id 為 NULL |
| 報價單完整性 | ✅ 正常 | 所有報價單都有明細 |
| 產品料號重複 | ✅ 正常 | 無重複 item_number |
| 環境變數一致性 | ✅ 正常 | 命名一致，無衝突 |

### 建議優先處理事項
1. **修復 6 筆無客戶訂單** — 確認是否為測試資料，如是則清除，如否則修補 customer_id
2. **補齊 6 處 Supabase error 解構** — 將 `const { data }` 改為 `const { data, error }` 並加上錯誤處理
3. **逐步提升 try-catch 覆蓋率** — 優先為寫入型 action（create/update/delete）加上獨立 try-catch
