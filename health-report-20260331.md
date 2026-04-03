# QB ERP 後端健康檢查報告

**掃描時間：** 2026-03-31
**狀態總覽：** 🟡 警告（無阻斷性錯誤，但有多項需關注事項）

---

## 1. SWC 編譯檢查 ✅ 全部通過

| 檔案 | 結果 |
|------|------|
| lib/admin/actions-get.js | ✅ OK |
| lib/admin/actions-post.js | ✅ OK |
| lib/admin/api.js | ✅ OK |
| lib/admin/helpers.js | ✅ OK |
| app/api/admin/route.js | ✅ OK |
| app/api/pdf/route.js | ✅ OK |

所有 6 個後端核心檔案皆可成功編譯，無語法錯誤。

---

## 2. Supabase 連線測試 ✅ 資料庫可達

| 資料表 | 記錄數 |
|--------|--------|
| erp_customers | 1,919 |
| erp_orders | 62 |
| quickbuy_products | 122,483 |
| erp_quotes | 49 |

資料庫連線正常，查詢回應正常。

---

## 3. 資料完整性抽查 🟡 有警告

| 檢查項目 | 結果 | 狀態 |
|----------|------|------|
| 沒有客戶的訂單 (customer_id IS NULL) | **6 筆** | ⚠️ 警告 |
| 重複料號 (quickbuy_products) | 0 筆 | ✅ 正常 |
| 無明細的報價單 | 0 筆 | ✅ 正常 |
| 庫存為負的產品 | 0 筆 | ✅ 正常 |
| erp_products 表僅有 id 欄位 | 是 | ⚠️ 異常 |

**發現問題：**

- **6 筆訂單缺少 customer_id**：建議排查是否為測試資料或匯入時遺漏。
- **erp_products 表僅有 1 個欄位 (id)**：此表疑似空殼 / 棄用表。產品主資料實際存於 `quickbuy_products`（122,483 筆）。程式碼中仍有引用 `erp_products` 的查詢（如 actions-get.js），若此表確實棄用，建議清理相關引用以避免無效查詢。

---

## 4. API Actions 完整性檢查 🟡 需改善

### actions-get.js（約 3,900 行）

| 指標 | 數量 | 狀態 |
|------|------|------|
| Case 區塊總數 | 60+ | — |
| 缺少 try-catch 的 case | **23+** | ⚠️ |
| Fall-through case (缺 return/break) | **0** | ✅ |
| 未檢查 error 的 Supabase 查詢 | **50+** | ⚠️ |

**高風險項目：**
- **Line 1527**：`.single()` 呼叫未檢查 error — 當查無資料或多筆時可能拋出例外
- **Lines 125-137**：`stats` case 中 Promise.all 包含 7 個查詢，全部未做 error 檢查
- **Lines 255-262**：`report_center` case 中 Promise.all 包含 8 個查詢，全部未做 error 檢查
- **Line 2772**：`.insert()` 操作未檢查 error，寫入可能靜默失敗

### actions-post.js（約 4,800 行）

| 指標 | 數量 | 狀態 |
|------|------|------|
| Case 區塊總數 | 60+ | — |
| 缺少 try-catch 的 case | **54** | ⚠️ |
| Fall-through case | **1**（刻意設計） | ✅ |
| 未檢查 error 的 Supabase 查詢 | **20+** | ⚠️ |

**備註：** 大部分 case 使用「解構 data 後 null check」的隱式錯誤處理模式，而非顯式 try-catch + error 檢查。此模式可運作，但會掩蓋資料庫層錯誤（如權限不足、連線逾時），導致問題難以排查。

**唯一 fall-through（line 1912-1916）：** `confirm_stock_in` 刻意落入 `confirm_stock_in_with_inventory`，為向後相容設計，已有註解說明。

---

## 5. 環境變數檢查 ✅ 一致

程式碼中引用的 17 個環境變數：

| 變數名稱 | 使用檔案數 | 有 fallback |
|----------|-----------|------------|
| NEXT_PUBLIC_SUPABASE_URL | 5 | — |
| SUPABASE_URL | 5 | 與上者互為 fallback |
| SUPABASE_SERVICE_KEY | 4 | fallback → SERVICE_ROLE_KEY |
| SUPABASE_SERVICE_ROLE_KEY | 4 | 與上者互為 fallback |
| LINE_CHANNEL_ACCESS_TOKEN | 6 | ❌ 無 |
| ANTHROPIC_API_KEY | 3 | ❌ 無 |
| ADMIN_TOKEN | 2 | ❌ 無 |
| RESEND_API_KEY | 2 | ❌ 無 |
| LINE_CHANNEL_SECRET | 1 | ❌ 無 |
| NEXT_PUBLIC_LIFF_ID | 1 | ❌ 無 |
| NEXT_PUBLIC_APP_URL | 1 | fallback → VERCEL_URL |
| VERCEL_URL | 1 | 與上者互為 fallback |
| DEALER_SALT | 3 | fallback → 'qb_dealer_2024' |
| EMAIL_FROM | 1 | fallback → noreply@resend.dev |
| PO_FROM_NAME | 1 | fallback → 'Quick Buy 採購系統' |
| PO_FROM_EMAIL | 1 | fallback → noreply@resend.dev |
| SUPABASE_ANON_KEY | 1 | 為 fallback 鏈末端 |

**命名一致性：** ✅ 無拼寫不一致問題。Supabase 連線使用 `SUPABASE_URL → NEXT_PUBLIC_SUPABASE_URL` 和 `SUPABASE_SERVICE_KEY → SUPABASE_SERVICE_ROLE_KEY → SUPABASE_ANON_KEY` 的 fallback 鏈，設計合理。

---

## 6. 資料庫結構觀察

系統共有 **68 張資料表**，分為三個命名空間：

- **erp_***：45 張（ERP 核心業務表）
- **quickbuy_***：7 張（LINE Bot / 商品 / 促銷）
- **qb_***：16 張（訂單 / 客戶 / 發票等）

**注意：** `erp_products` 僅有 `id` 一個欄位（0 筆資料），而 `quickbuy_products` 有 18 個欄位（122,483 筆）。建議確認 `erp_products` 是否為棄用表或尚未建置完成的遷移目標。

---

## 建議優先處理事項

1. **🔴 高優先** — 為 `stats` 和 `report_center` 的 Promise.all 加入 error 檢查，避免單一查詢失敗導致整個 API 回應 500
2. **🔴 高優先** — 修正 `.single()` 呼叫（line 1527）加入 error 處理
3. **🟡 中優先** — 清查 6 筆 customer_id 為 NULL 的訂單
4. **🟡 中優先** — 評估是否移除或完善 `erp_products` 空殼表
5. **🟢 低優先** — 逐步為各 case 區塊添加 Supabase error 解構檢查，建議從寫入操作（insert/update/delete）優先處理
