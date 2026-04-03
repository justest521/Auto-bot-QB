═══ QB ERP 部署監控報告 ═══
日期：2026-04-02（自動排程執行）
專案：Auto QB (izfxiaufbwrlmifrbdiv) — Supabase ap-southeast-1
DB 版本：PostgreSQL 17.6.1.084

---

## ▸ 最近提交（最近 3 筆）

| Commit | 摘要 |
|--------|------|
| 171e9f9 | feat: restructure dealer mobile app — 進貨→到貨, 庫存→商品 |
| 6e7da33 | fix: mobile app inventory/procurement shows 0 products |
| bdc0983 | fix: Pulse module crash — API/frontend field name mismatches |

最近 3 筆 commit 影響 7 個檔案（+424 / -23 行），主要涉及：
- 經銷商行動版 App 重構（ArrivalsNotify 新元件、命名調整）
- Pulse 模組 API 欄位修正
- 經銷商 API route 新增

---

## ▸ Build 狀態：❌ 失敗

```
Error: ENOENT: no such file or directory, open '.next/server/pages-manifest.json'
```

**分析：** Build 在「Collecting page data」階段失敗，`.next/server/pages-manifest.json` 遺失。這通常發生在：
1. `.next` 快取不完整或損壞
2. 沙盒環境缺少某些原生 binary（@next/swc 平台套件）

**建議動作：**
- 在正式部署環境執行 `rm -rf .next && npm run build` 清除快取重建
- 確認 Vercel 部署是否正常（Vercel CI 環境通常不受此影響）
- 多個 webpack cache 警告為跨平台套件警告，不影響功能

---

## ▸ Supabase API 日誌：✅ 正常

過去 24 小時 API 日誌分析：
- **全部 HTTP 狀態碼：200 / 206** — 無 4xx 或 5xx 錯誤
- 主要活躍端點：
  - `/rest/v1/erp_orders` — 訂單查詢（HEAD + GET）
  - `/rest/v1/erp_invoices` — 發票查詢（206 = 分頁回應，正常）
  - `/rest/v1/erp_dealer_users` — 經銷商用戶驗證
  - `/rest/v1/quickbuy_products` — 產品搜尋
  - `/rest/v1/admin_sessions` — 管理員登入驗證
- **無** 500 錯誤、連線超時、查詢逾時或認證失敗

---

## ▸ Supabase Postgres 日誌：⚠️ 1 個錯誤

| 嚴重度 | 訊息 | 時間 |
|--------|------|------|
| ERROR | `relation "dealer_users" does not exist` | 04:45:58 UTC |

**分析：** 有一筆 ALTER TABLE 嘗試修改不存在的 `dealer_users` 表（正確表名為 `erp_dealer_users`）。隨後已用正確表名重新執行成功，新增了 `discount_rate` 欄位。此為一次性人為操作錯誤，不影響系統運行。

其餘 Postgres 日誌全為正常連線/認證記錄，使用 TLSv1.3 加密，安全性正常。

---

## ▸ Auth 日誌：✅ 正常

過去 24 小時無任何 Auth 錯誤日誌。

---

## ▸ 資料庫容量（前 10 大資料表）

| 資料表 | 容量 | 資料筆數 |
|--------|------|----------|
| quickbuy_products | 101 MB | 122,483 |
| quickbuy_chat_history | 31 MB | 86,261 |
| erp_invoices | 13 MB | 25,811 |
| qb_sales_history | 4,600 kB | 25,810 |
| erp_profit_analysis | 2,984 kB | 9,056 |
| erp_customers | 2,728 kB | 1,919 |
| erp_sales_return_summary | 2,496 kB | 9,056 |
| qb_customers | 808 kB | 2,499 |
| qb_inventory_movements | 240 kB | 230 |
| erp_orders | 232 kB | 62 |

**總估計使用量：** ~155 MB（Supabase Free tier 上限 500 MB）
**使用率：** 約 31% — 容量充足

⚠️ **注意：** `quickbuy_chat_history` 已有 86K+ 筆記錄（31 MB），建議：
- 考慮定期清理超過 90 天的對話記錄
- 或建立分區策略以維持查詢效能

---

## ▸ 環境一致性：⚠️ 無法完整驗證

專案目錄中未找到 `.env.local` 或 `.env.example` 檔案（可能被 `.gitignore` 排除，屬正常做法）。

程式碼中引用的**應用層關鍵環境變數**：

| 變數名 | 用途 |
|--------|------|
| SUPABASE_URL | Supabase 連線 |
| SUPABASE_ANON_KEY | Supabase 匿名金鑰 |
| SUPABASE_SERVICE_KEY / SERVICE_ROLE_KEY | Supabase 服務金鑰 |
| NEXT_PUBLIC_SUPABASE_URL | 前端 Supabase URL |
| NEXT_PUBLIC_LIFF_ID | LINE LIFF 應用 ID |
| LINE_CHANNEL_ACCESS_TOKEN | LINE Bot 存取權杖 |
| LINE_CHANNEL_SECRET | LINE Bot 密鑰 |
| ANTHROPIC_API_KEY | Claude AI API |
| RESEND_API_KEY | Resend 郵件服務 |
| ADMIN_TOKEN | 管理員認證 |
| DEALER_SALT | 經銷商密碼加鹽 |
| NEXT_PUBLIC_APP_URL | 應用公開 URL |

**建議：** 建立 `.env.example` 範本檔並加入版本控制，方便新開發者設定環境。

---

## 📋 總結

| 項目 | 狀態 |
|------|------|
| Supabase 服務 | ✅ ACTIVE_HEALTHY |
| API 日誌 | ✅ 正常（全 200/206） |
| Postgres 日誌 | ⚠️ 1 個非致命錯誤（已修正） |
| Auth 日誌 | ✅ 無錯誤 |
| 本地 Build | ❌ 失敗（快取問題） |
| 資料庫容量 | ✅ 31% 使用率 |
| 環境一致性 | ⚠️ 缺少 .env.example |

## 🔧 建議行動

1. **Build 修復（優先）：** 在正式環境確認 Vercel 部署狀態是否正常；本地開發請執行 `rm -rf .next && npm run build`
2. **Chat 歷史清理：** 規劃 `quickbuy_chat_history` 的資料保留策略（目前 86K 筆，持續成長中）
3. **環境變數文件化：** 建立 `.env.example` 檔案，列出所有必要環境變數
4. **DB 欄位變更記錄：** 今日新增了 `erp_dealer_users.discount_rate` 欄位，請確認前端程式碼已配合更新
