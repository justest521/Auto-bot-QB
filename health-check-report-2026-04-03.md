# QB ERP 後端健康檢查報告

**檢查時間：** 2026-04-03
**專案：** Auto QB (izfxiaufbwrlmifrbdiv)
**資料庫狀態：** ACTIVE_HEALTHY

---

## 總覽

| 檢查項目 | 狀態 |
|---------|------|
| SWC 編譯 | ✅ 全部通過 |
| Supabase 連線 | ✅ 正常 |
| 資料完整性 | ⚠️ 有小問題 |
| 環境變數一致性 | ✅ 正常 |
| API 錯誤處理 | ❌ 有多處缺漏 |

---

## 1. SWC 編譯結果 — ✅ 全部通過

所有 18 個後端核心檔案編譯成功，無語法錯誤：

**核心 API 檔案（6 個）：** actions-get.js, actions-post.js, api.js, helpers.js, app/api/admin/route.js, app/api/pdf/route.js

**輔助模組（12 個）：** actions-hr.js, actions-pulse.js, auth.js, auth-v2.js, config.js, erp-customers.js, utils.js, supabase.js, ai-handler.js, line/webhook/route.js, po/route.js, dealer/route.js

---

## 2. Supabase 連線測試 — ✅ 正常

| 資料表 | 筆數 |
|-------|------|
| erp_customers | 1,919 |
| quickbuy_products | 122,483 |
| erp_orders | 62 |
| erp_quotes | 49 |
| erp_vendors | 17 |
| qb_sales_history | 25,810 |
| erp_purchase_orders | 32 |
| quickbuy_line_messages | 13 |
| quickbuy_line_customers | 4 |

---

## 3. 資料完整性抽查 — ⚠️ 有小問題

| 檢查項目 | 結果 | 狀態 |
|---------|------|------|
| 無客戶的訂單 (customer_id IS NULL) | **6 筆** | ⚠️ 警告 |
| 重複的產品料號 | 0 筆 | ✅ 正常 |
| 無明細的報價單 | 0 筆 | ✅ 正常 |

**建議：** 6 筆 erp_orders 缺少 customer_id 關聯，可能是匯入時缺少客戶對應或手動建立時未指定客戶。建議排查這 6 筆訂單並補上客戶關聯。

---

## 4. 環境變數檢查 — ✅ 正常

專案程式碼中引用的自訂環境變數（排除 Next.js/Node 內建變數）：

| 環境變數 | 使用位置 | 備註 |
|---------|---------|------|
| SUPABASE_URL | lib/supabase.js, api routes | 有 NEXT_PUBLIC_SUPABASE_URL 備援 |
| SUPABASE_SERVICE_KEY | lib/supabase.js, api routes | 有 SERVICE_ROLE_KEY 備援 |
| SUPABASE_SERVICE_ROLE_KEY | lib/supabase.js, api routes | 同上 |
| SUPABASE_ANON_KEY | lib/supabase.js | 最後備援 |
| NEXT_PUBLIC_SUPABASE_URL | middleware.js, supabase.js | 前端可用 |
| ANTHROPIC_API_KEY | lib/ai-handler.js, actions-post.js | AI 功能必要 |
| LINE_CHANNEL_ACCESS_TOKEN | ai-handler.js, actions-post.js, webhook | LINE 推送必要 |
| LINE_CHANNEL_SECRET | webhook/route.js | 驗簽必要 |
| ADMIN_TOKEN | auth.js, auth-v2.js | 管理後台驗證 |
| RESEND_API_KEY | auth-v2.js, po/route.js | 郵件寄送 |
| EMAIL_FROM | auth-v2.js | 有預設值 |
| DEALER_SALT | actions-post.js, dealer/route.js | 有預設值 'qb_dealer_2024' |
| PO_FROM_NAME | po/route.js | 有預設值 |
| PO_FROM_EMAIL | po/route.js | 有預設值 |
| NEXT_PUBLIC_LIFF_ID | liff/page.js | LIFF 初始化 |
| NEXT_PUBLIC_APP_URL | po/route.js | 有 VERCEL_URL 備援 |

**結論：** 所有環境變數命名一致，關鍵變數都有備援或預設值。

---

## 5. API Actions 程式碼品質 — ❌ 需要改善

### 5.1 actions-get.js（3,947 行）

**嚴重問題：**

| 問題 | 數量 | 範例位置 |
|------|------|---------|
| Supabase 查詢未檢查 error 回傳 | 15+ 處 | L126-137, L255-262, L338, L897-901, L2413-2433 |
| Promise.all 中含 null 值（會導致執行錯誤） | 1 處 | L1789 |
| 錯誤的 HTTP status code（error 回 200） | 1 處 | L2575 staff_list |
| 未做 null 檢查直接存取物件 | 2+ 處 | L2693-2725 |

**中等問題：**

| 問題 | 數量 | 範例位置 |
|------|------|---------|
| 缺少 try-catch 的複雜 case | 8+ 處 | L12-117, L120-242, L2407-2447, L3337-3577 |
| 錯誤處理模式不一致 | 多處 | 混用 if(error) 和 try-catch |

### 5.2 actions-post.js（4,813 行）

**嚴重問題：**

| 問題 | 數量 | 範例位置 |
|------|------|---------|
| insertManyWithColumnFallback 未檢查錯誤回傳 | 14 處 | L1427, L1649, L1711, L1809, L1869, L1906, L1941, L2083, L2166, L2216, L2275, L2461, L2736, L4467 |
| 函式呼叫簽名錯誤（多傳 supabase 參數） | 1 處 | L4199 receive_po_items |
| delete 操作未檢查錯誤 | 6 處 | L413-414, L436-437, L460, L481 |
| select 查詢未解構 error | 2+ 處 | L1277-1278, L1302 |

**中等問題：**

| 問題 | 數量 |
|------|------|
| try-catch 吞掉錯誤（只 log 不回傳） | 7+ 處 |

---

## 優先修復建議

### P0（立即修復）
1. **L4199 actions-post.js** — `insertManyWithColumnFallback` 呼叫簽名錯誤，多傳了 `supabase` 參數，可能導致 receive_po_items 靜默失敗
2. **L1789 actions-get.js** — Promise.all 中含 `null`，await null 會回傳 undefined 而非預期查詢結果，可能造成庫存頁面資料不完整

### P1（本週修復）
3. 為 14 處 `insertManyWithColumnFallback` 呼叫加上錯誤檢查，防止寫入失敗時使用者無感知
4. 修正 `staff_list` case 的 error response 改用 status 500
5. 補上 6 筆缺少 customer_id 的訂單資料

### P2（持續改善）
6. 統一錯誤處理模式（建議全面改用 try-catch）
7. 為所有 Supabase 查詢加上 error 解構和檢查
8. 為複雜的 GET action case 加上 top-level try-catch

---

*報告由 QB ERP 後端健康檢查排程任務自動產生*
