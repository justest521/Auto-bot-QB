═══════════════════════════════════════════════
  QB ERP 部署監控報告
  Auto QB (izfxiaufbwrlmifrbdiv)
═══════════════════════════════════════════════
日期：2026-03-31 (二)

───────────────────────────────────────────────
▸ 最近提交（最近 3 筆）
───────────────────────────────────────────────
1. 39591f1 fix: resolve React hydration error #425 on dealer page
2. ac87679 dealer: complete visual quality rewrite of all dealer portal components
3. 0b142c6 fix: remove all emoji from dealer, improve KPI layout

最近 3 筆 commit 影響 8 個檔案（主要為 dealer portal），淨減 1,270 行（重構瘦身）。
影響範圍：app/dealer/components/ 下的 7 個元件 + page.js

───────────────────────────────────────────────
▸ Build 狀態
───────────────────────────────────────────────
狀態：⚠ 無法在沙箱環境完成驗證（build 超過 4 分鐘 timeout）
備註：Next.js 專案規模較大，沙箱資源不足以完成 build。
      建議在本機或 Vercel 確認 build 狀態。

───────────────────────────────────────────────
▸ Supabase API 日誌（過去 24 小時）
───────────────────────────────────────────────
狀態：✅ 正常 — 無 500 錯誤、無連線超時、無認證失敗

摘要：
- 所有 API 請求均回傳 200 / 206（正常）
- 主要流量為 admin dashboard 的輪詢請求（約每 60 秒）：
  · erp_orders (pending)
  · erp_approvals (pending)
  · erp_invoices (unpaid) — 回傳 206（部分內容，資料量大）
  · erp_tickets (open/in_progress)
  · erp_stock_ins (pending)
  · erp_purchase_orders (draft)
  · admin_sessions / admin_role_permissions（認證驗證）
- 觀察到有 dealer_portal 訂單輪詢，表示經銷商後台有活躍使用

───────────────────────────────────────────────
▸ Postgres 日誌
───────────────────────────────────────────────
狀態：✅ 正常 — 僅有標準連線認證日誌（LOG 層級）

- 所有連線皆使用 TLSv1.3 加密（TLS_AES_256_GCM_SHA384）
- 無 ERROR / WARNING / FATAL 級別日誌
- 無查詢逾時紀錄

───────────────────────────────────────────────
▸ Auth 日誌
───────────────────────────────────────────────
狀態：✅ 正常 — 過去 24 小時無任何錯誤日誌

───────────────────────────────────────────────
▸ 資料庫容量（前 10 大資料表）
───────────────────────────────────────────────
| 資料表                          | 容量     | 列數     |
|--------------------------------|----------|----------|
| public.quickbuy_products       | 101 MB   | 122,483  |
| public.quickbuy_chat_history   | 31 MB    | 86,261   |
| public.erp_invoices            | 13 MB    | 25,811   |
| public.qb_sales_history        | 4,600 kB | 25,810   |
| public.erp_profit_analysis     | 2,984 kB | 9,056    |
| public.erp_customers           | 2,728 kB | 1,919    |
| public.erp_sales_return_summary| 2,496 kB | 9,056    |
| public.qb_customers            | 808 kB   | 2,499    |
| public.qb_inventory_movements  | 240 kB   | 230      |
| public.erp_orders              | 232 kB   | 62       |

總估計使用量：約 156 MB（Supabase Free tier 限制 500 MB）
使用率：約 31%

───────────────────────────────────────────────
▸ 環境一致性
───────────────────────────────────────────────
狀態：⚠ 本機無 .env.local / .env.example 檔案

程式碼中引用的環境變數（共 17 個）：
  ADMIN_TOKEN, ANTHROPIC_API_KEY, DEALER_SALT, EMAIL_FROM,
  LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET,
  NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_LIFF_ID,
  NEXT_PUBLIC_SUPABASE_URL, PO_FROM_EMAIL, PO_FROM_NAME,
  RESEND_API_KEY, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY,
  SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, VERCEL_URL

備註：SUPABASE_SERVICE_KEY 和 SUPABASE_SERVICE_ROLE_KEY 同時存在，
      可能為重複引用，建議統一為 SUPABASE_SERVICE_ROLE_KEY。
      VERCEL_URL 為 Vercel 自動注入，無需手動設定。

═══════════════════════════════════════════════
▸ 建議事項
═══════════════════════════════════════════════

1. 【資料庫】quickbuy_products（101 MB, 122K 列）佔總容量 65%，
   建議檢查是否有過期或重複產品資料可清理，或考慮分表/歸檔。

2. 【資料庫】quickbuy_chat_history（31 MB, 86K 列）持續成長，
   建議設定保留策略（如 90 天自動清理），避免佔用過多空間。

3. 【API 輪詢】Dashboard 每 60 秒輪詢 7 個端點，
   建議改用 Supabase Realtime 訂閱以減少不必要的請求。

4. 【環境變數】建議建立 .env.example 範例檔並提交至 Git，
   方便新開發者或部署環境設定。統一 SUPABASE_SERVICE_KEY
   與 SUPABASE_SERVICE_ROLE_KEY 的命名。

5. 【Build】建議在 Vercel Dashboard 確認最新部署是否成功，
   沙箱環境無法完成 build 驗證。

═══════════════════════════════════════════════
  報告產生時間：2026-03-31T14:07 UTC
  下次排程監控：依排程設定
═══════════════════════════════════════════════
