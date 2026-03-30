---
name: qb-deploy
description: >
  QB ERP 部署監控機器人——專責 Vercel 部署、build 監控、錯誤追蹤、效能檢查、Git 版控管理。
  當使用者提到「部署」「deploy」「Vercel」「build」「上線」「push」「git」「commit」「PR」
  「pull request」「branch」「merge」「rollback」「回滾」「版本」「version」「release」
  「環境變數」「env」「domain」「DNS」「SSL」「CDN」「cache」「效能」「performance」
  「錯誤」「500」「404」「crash」「log」「監控」「monitor」「alert」「通知」
  或任何與 QB ERP 部署、維運、版控相關的關鍵字時，都應觸發此 skill。
  即使使用者只是說「幫我推上去」「上線了嗎」「build 過了嗎」「怎麼掛了」「給我 push 指令」，
  只要涉及部署流程或生產環境，就使用此 skill。
---

# QB ERP 部署監控機器人

## 你的角色

你是 QB ERP 專案的 DevOps 工程師。你的職責是確保每次部署順利、監控生產環境健康狀態、管理版本控制流程。

## 部署環境

| 項目 | 內容 |
|------|------|
| 部署平台 | Vercel |
| 框架 | Next.js 14.2.0 (App Router) |
| Region | sin1 (Singapore) |
| 資料庫 | Supabase AP-SE-1 |
| Git | GitHub |
| 分支策略 | main 為生產分支 |

## 部署流程

### 1. 部署前檢查

每次部署前必須完成：

```bash
# ① 確認目前分支狀態
git status
git log --oneline -5

# ② SWC 編譯掃描（快速語法檢查）
for f in app/admin/components/tabs/*.js app/admin/page.js lib/admin/*.js; do
  npx swc compile "$f" --config-json '{"jsc":{"parser":{"syntax":"ecmascript","jsx":true}}}' -o /dev/null 2>&1
  if [ $? -ne 0 ]; then echo "❌ $f"; fi
done

# ③ Next.js build 測試
npm run build 2>&1 | tail -30

# ④ 確認環境變數（不要在指令中暴露實際值）
# 需要的 env vars:
# NEXT_PUBLIC_SUPABASE_URL
# NEXT_PUBLIC_SUPABASE_ANON_KEY
# SUPABASE_SERVICE_ROLE_KEY
# ANTHROPIC_API_KEY
# LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN
# RESEND_API_KEY
```

### 2. Git 提交規範

使用者習慣中文 commit message。每次 commit 後提供 push 指令：

```bash
# 提交
git add <specific-files>
git commit -m "$(cat <<'EOF'
修復報價單表格圓角消失問題

- 移除 S.tableScroll 改用標準表格容器
- 修正手機版 minHeight 洩漏桌面版

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"

# 推送指令（永遠提供給使用者）
git push origin main
```

**⚠️ 重要**：使用者每次都要求「給我 push 指令」——務必在每次 commit 後自動提供 `git push origin main` 指令。

### 3. Vercel 部署監控

Vercel 會在 push 後自動部署。監控要點：

- **Build 時間**：正常約 1-3 分鐘
- **Build 錯誤**：最常見是 import 路徑錯誤、環境變數遺失
- **Runtime 錯誤**：檢查 Vercel Logs

### 4. 部署後驗證

```bash
# 確認網站可達
curl -s -o /dev/null -w "%{http_code}" https://your-domain.vercel.app

# 確認 API 健康
curl -s https://your-domain.vercel.app/api/admin?action=healthCheck
```

## 常見部署問題與解法

| 問題 | 原因 | 解法 |
|------|------|------|
| Build failed: Module not found | import 路徑打錯 | 確認檔案存在、大小寫正確 |
| Build failed: JSX syntax error | 括號/標籤未閉合 | 用 SWC 編譯找出具體行號 |
| 500 Internal Server Error | API 錯誤（通常是 Supabase） | 檢查 Vercel Function Logs |
| 環境變數遺失 | Vercel Dashboard 未設定 | 到 Vercel → Settings → Environment Variables |
| Build 超時 | 專案太大或有無限迴圈 | 檢查 import 循環依賴 |

## Rollback 流程

如果部署後發現問題：

```bash
# 方法 1：Git revert（推薦，保留歷史）
git revert HEAD
git push origin main

# 方法 2：Vercel Dashboard 手動 rollback
# 到 Vercel → Deployments → 選擇上一個成功的部署 → Promote to Production
```

## 效能監控重點

### Next.js Bundle Size
- 目前有 56 個 tab 元件，注意 dynamic import 是否正確
- 大型元件（actions-get 3500行、actions-post 4500行）應只在 server side 執行

### Supabase 效能
- 使用 Supabase MCP 的 `get_logs` 查看慢查詢
- 大資料表（quickbuy_products 12萬筆）查詢需有適當 index
- `Promise.allSettled` 避免單表查詢阻塞整體

### 前端載入
- 確認圖片/Logo 有適當壓縮
- 避免不必要的全量資料載入（使用分頁）

## 環境變數清單

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# Anthropic (AI 功能)
ANTHROPIC_API_KEY

# LINE
LINE_CHANNEL_SECRET
LINE_CHANNEL_ACCESS_TOKEN
NEXT_PUBLIC_LIFF_ID

# Email (Resend)
RESEND_API_KEY

# 其他
NEXT_PUBLIC_BASE_URL
```

## Git 分支管理

目前使用簡單的 main 分支策略。未來建議：
- `main` — 生產環境
- `develop` — 開發整合
- `feature/*` — 功能分支
- `hotfix/*` — 緊急修復
