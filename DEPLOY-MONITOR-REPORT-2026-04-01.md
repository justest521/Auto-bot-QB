# QB ERP 部署監控報告

**日期：** 2026-04-01 (自動排程)
**專案：** Auto QB (`izfxiaufbwrlmifrbdiv`)
**狀態：** ACTIVE_HEALTHY
**區域：** ap-southeast-1
**資料庫版本：** PostgreSQL 17.6.1.084

---

## 1. 最近提交 (Recent Commits)

| Commit | 說明 |
|--------|------|
| `bdc0983` | fix: Pulse module crash — API/frontend field name mismatches |
| `193ee98` | feat: add MoreYou Pulse AI sentiment analysis module |
| `18da73c` | feat: add HR module — employees, attendance, leave, payroll |

**最近 3 筆 commit 影響範圍：** 8 個檔案，+3,703 行 / -2 行。主要新增 Pulse AI 情緒分析模組、HR 模組（員工/出勤/假勤/薪資），以及修復 Pulse 模組的 API/前端欄位名稱不一致問題。

---

## 2. Build 狀態

**結果：** 無法在沙盒環境驗證（Next.js build 在受限環境中逾時）。建議在 Vercel 部署面板確認最新部署狀態。

---

## 3. Supabase API 日誌

**結果：正常 — 無 500 錯誤**

過去 24 小時 API 日誌全部為 200/206 狀態碼，主要請求端點：

- `/rest/v1/erp_invoices` (206 — unpaid invoices, 分頁回應)
- `/rest/v1/erp_orders` (200)
- `/rest/v1/erp_tickets` (200)
- `/rest/v1/erp_approvals` (200)
- `/rest/v1/erp_stock_ins` (200)
- `/rest/v1/erp_purchase_orders` (200)
- `/rest/v1/admin_sessions` (200)
- `/rest/v1/admin_role_permissions` (200)

**Auth 日誌：** 空（無錯誤）
**Postgres 日誌：** 全部為 LOG 級別的常規連線記錄，無 ERROR 或 WARNING

---

## 4. 資料庫容量 (Top 10)

| 資料表 | 容量 | 行數 |
|--------|------|------|
| `public.quickbuy_products` | 101 MB | 122,483 |
| `public.quickbuy_chat_history` | 31 MB | 86,261 |
| `public.erp_invoices` | 13 MB | 25,811 |
| `public.qb_sales_history` | 4,600 kB | 25,810 |
| `public.erp_profit_analysis` | 2,984 kB | 9,056 |
| `public.erp_customers` | 2,728 kB | 1,919 |
| `public.erp_sales_return_summary` | 2,496 kB | 9,056 |
| `public.qb_customers` | 808 kB | 2,499 |
| `public.qb_inventory_movements` | 240 kB | 230 |
| `public.erp_orders` | 232 kB | 62 |

**總觀察：** 資料庫總量約 155 MB，以 `quickbuy_products`（101 MB）和 `quickbuy_chat_history`（31 MB）為主。容量正常，暫無需清理。

---

## 5. 安全性與效能建議 (Supabase Advisors)

### 安全性 (98 項)

| 等級 | 問題 | 數量 |
|------|------|------|
| ERROR | RLS Disabled in Public | 19 |
| ERROR | Sensitive Columns Exposed | 2 |
| WARN | RLS Policy Always True | 67 |
| WARN | Function Search Path Mutable | 8 |
| WARN | Extension in Public | 2 |

### 效能 (210 項)

| 等級 | 問題 | 數量 |
|------|------|------|
| WARN | Multiple Permissive Policies | 64 |
| WARN | Auth RLS Initialization Plan | 26 |
| INFO | Unused Index | 68 |
| INFO | Unindexed foreign keys | 51 |
| INFO | Auth DB Connection Strategy | 1 |

---

## 6. 環境一致性

程式碼中引用的環境變數共 17 個：

```
ADMIN_TOKEN, ANTHROPIC_API_KEY, DEALER_SALT, EMAIL_FROM,
LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET,
NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_LIFF_ID, NEXT_PUBLIC_SUPABASE_URL,
PO_FROM_EMAIL, PO_FROM_NAME, RESEND_API_KEY,
SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, SUPABASE_SERVICE_ROLE_KEY,
SUPABASE_URL, VERCEL_URL
```

**注意：** 本地無 `.env.local` 或 `.env.example` 檔案。建議建立 `.env.example` 作為環境變數範本，方便團隊協作。

---

## 7. 總結與建議

### 整體狀態：正常運作

**需要注意的事項：**

1. **安全性 — 高優先**
   - 19 張 public schema 的資料表未啟用 RLS（Row Level Security），這是最嚴重的安全風險。建議盡快為所有 public 資料表啟用 RLS 並設定適當 policy。
   - 2 項敏感欄位暴露警告，需檢查是否有密碼或個資欄位未正確保護。
   - 67 項 RLS policy 設定為 always true（等於沒有保護），應檢視這些 policy 是否為刻意設計。

2. **效能 — 中優先**
   - 51 個外鍵未建立索引，可能影響 JOIN 查詢效能，建議逐步補上。
   - 68 個未使用的索引佔用空間，可考慮清理。
   - 64 個多重 permissive policy 可能導致查詢效能下降。

3. **開發流程 — 低優先**
   - 建議建立 `.env.example` 檔案，記錄所有需要的環境變數。
   - `quickbuy_chat_history`（31 MB, 86K 行）持續成長，建議評估是否需要定期清理或歸檔。

4. **Build 驗證**
   - 無法在沙盒環境完成 build 驗證，請透過 Vercel dashboard 確認最新部署狀態。
