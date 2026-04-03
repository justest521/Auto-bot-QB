═══ QB ERP 部署監控報告 ═══
日期：2026-04-03（五）

---

## ▸ 最近提交（Latest 10 Commits）

| Commit | 說明 |
|--------|------|
| e7e5ea5 | feat: per-dealer discount rate — individual pricing off retail |
| 171e9f9 | feat: restructure dealer mobile app — 進貨→到貨, 庫存→商品 |
| 6e7da33 | fix: mobile app inventory/procurement shows 0 products |
| bdc0983 | fix: Pulse module crash — API/frontend field name mismatches |
| 193ee98 | feat: add MoreYou Pulse AI sentiment analysis module |
| 18da73c | feat: add HR module — employees, attendance, leave, payroll |
| ce23f29 | feat: first-login skip OTP + force password change |
| 425b2b7 | feat: upgrade analytics reports — AI forecast, charts, visual summaries |
| f0f7a9b | fix: user creation error handling + required field indicators |
| 39591f1 | fix: resolve React hydration error #425 on dealer page |

**最近 3 筆 commit 影響範圍：** 7 個檔案，+418 行 / -11 行
- 主要變更：經銷商折扣定價、行動版 App 架構重整（進貨→到貨 / 庫存→商品）、修復行動版顯示 0 筆商品問題

---

## ▸ Build 狀態：⚠️ 無法驗證

Build 在沙盒環境中兩次超時（>2 分鐘），因沙盒運算資源有限。建議在本機或 CI/CD 管線驗證 `npm run build`。

---

## ▸ Supabase 日誌：✅ 正常

| 服務 | 狀態 |
|------|------|
| **API Gateway** | ✅ 最近 100 筆請求全部 200，0 筆 5xx 錯誤 |
| **PostgreSQL** | ✅ 僅正常連線日誌（postgres_exporter / psql），無 ERROR / FATAL |
| **Auth** | ✅ 最近 24 小時內無日誌（低流量或無認證錯誤） |

**結論：** 無 500 錯誤、無連線超時、無查詢逾時、無認證失敗。

---

## ▸ 資料庫容量（Top 10 資料表）

| 資料表 | 容量 | 行數 |
|--------|------|------|
| quickbuy_products | 101 MB | 122,483 |
| quickbuy_chat_history | 31 MB | 86,261 |
| repair_history | 19 MB | 62,064 |
| erp_invoices | 13 MB | 25,811 |
| qb_sales_history | 4.6 MB | 25,810 |
| erp_profit_analysis | 3.0 MB | 9,056 |
| erp_customers | 2.7 MB | 1,919 |
| erp_sales_return_summary | 2.5 MB | 9,056 |
| qb_customers | 808 kB | 2,499 |
| qb_inventory_movements | 240 kB | 230 |

**資料庫總估算：** ~175 MB（Supabase Free Tier 限制 500 MB）→ 使用約 35%

---

## ▸ 環境變數一致性：⚠️ 無 .env 範例檔

專案中未找到 `.env.local`、`.env.example` 或 `.env` 檔案（正確地未提交至 Git）。

**應用程式碼引用的自訂環境變數（16 個）：**

| 變數名稱 | 用途推測 |
|----------|----------|
| SUPABASE_URL | Supabase 專案 URL |
| SUPABASE_ANON_KEY | Supabase 匿名金鑰 |
| SUPABASE_SERVICE_KEY | Supabase 服務金鑰 |
| SUPABASE_SERVICE_ROLE_KEY | Supabase 服務角色金鑰 |
| NEXT_PUBLIC_SUPABASE_URL | 前端 Supabase URL |
| NEXT_PUBLIC_APP_URL | 應用公開 URL |
| NEXT_PUBLIC_LIFF_ID | LINE LIFF ID |
| LINE_CHANNEL_ACCESS_TOKEN | LINE Bot 存取權杖 |
| LINE_CHANNEL_SECRET | LINE Bot 密鑰 |
| ADMIN_TOKEN | 管理員驗證 Token |
| DEALER_SALT | 經銷商密碼加鹽 |
| ANTHROPIC_API_KEY | Claude AI API 金鑰 |
| RESEND_API_KEY | Resend 郵件 API 金鑰 |
| EMAIL_FROM | 寄件者信箱 |
| PO_FROM_EMAIL | 採購單寄件信箱 |
| PO_FROM_NAME | 採購單寄件者名稱 |

**建議：** 建立 `.env.example` 檔案列出所有必要變數，方便團隊新成員設定。

---

## ▸ 建議與注意事項

1. **🟢 Supabase 運行穩定** — API / DB / Auth 均無異常，可安心部署。
2. **🟡 Build 需本機驗證** — 最近有 7 個檔案變動（經銷商折扣 + 行動版重構），建議在正式部署前確認 `npm run build` 成功。
3. **🟡 quickbuy_products 表偏大（101 MB / 122K 行）** — 佔整體 DB 約 58%，若持續成長建議考慮分區或歸檔策略。
4. **🟡 quickbuy_chat_history（31 MB / 86K 行）** — 聊天紀錄持續累積，建議設定自動清理或歸檔機制（例如保留 90 天）。
5. **🟠 缺少 .env.example** — 建議建立範例環境變數檔案，降低新環境部署門檻。
6. **🟡 SUPABASE_SERVICE_KEY vs SUPABASE_SERVICE_ROLE_KEY** — 程式碼同時引用兩個類似變數，建議統一為一個避免混淆。
