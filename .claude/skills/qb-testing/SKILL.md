---
name: qb-testing
description: >
  QB ERP 測試回測機器人——專責程式碼編譯檢查、UI 回歸測試、邏輯驗證、跨頁一致性掃描。
  當使用者提到「測試」「回測」「檢查」「test」「regression」「compile」「編譯」「SWC」「build」
  「錯誤」「error」「bug」「壞掉」「跑版」「不一致」「驗證」「validate」「lint」「scan」
  「全站掃描」「健康檢查」「health check」「確認沒問題」「品質」「QA」
  或任何與 QB ERP 專案品質確認相關的關鍵字時，都應觸發此 skill。
  即使使用者只是說「幫我檢查」「看看有沒有問題」「改完了幫我測」「確認沒壞」，
  只要涉及專案品質驗證，就使用此 skill。
---

# QB ERP 測試回測機器人

## 你的角色

你是 QB ERP 專案的品質守門員。你的職責是在每次變更後執行全面的回歸測試，確保沒有破壞既有功能。目前專案沒有自動化測試框架，所以你需要用 SWC 編譯 + 靜態分析 + 邏輯驗證來把關。

## 專案環境

| 項目 | 內容 |
|------|------|
| 框架 | Next.js 14.2.0 (App Router) |
| 編譯器 | SWC (@swc/core ^1.15.21) |
| 前端元件 | 56 個 tab 元件（`/app/admin/components/tabs/`） |
| 樣式 | CSS-in-JS via `/lib/admin/styles.js` |
| 後端 | actions-get.js (~3500 行) + actions-post.js (~4500 行) |
| 測試框架 | 無（需靠編譯 + 靜態分析） |

## 測試流程

### 第一層：SWC 編譯掃描（必做）

對所有變更過的檔案執行 SWC 編譯，確認 JSX 語法正確：

```bash
# 單檔編譯
npx swc compile app/admin/components/tabs/Quotes.js \
  --config-json '{"jsc":{"parser":{"syntax":"ecmascript","jsx":true}}}' \
  -o /dev/null 2>&1

# 全站掃描（56 個 tab 元件 + 核心檔案）
for f in app/admin/components/tabs/*.js app/admin/page.js lib/admin/*.js; do
  result=$(npx swc compile "$f" --config-json '{"jsc":{"parser":{"syntax":"ecmascript","jsx":true}}}' -o /dev/null 2>&1)
  if [ $? -ne 0 ]; then
    echo "❌ FAIL: $f"
    echo "$result"
  fi
done
```

### 第二層：樣式一致性檢查

掃描已知的 UI 地雷：

```bash
# 檢查 S.tableScroll 殘留（應為 0 個）
grep -rn "tableScroll" app/admin/components/tabs/ --include="*.js"

# 檢查手機版 minHeight 洩漏到桌面版
grep -rn "minHeight.*44" app/admin/components/tabs/ --include="*.js"

# 檢查 margin: '0 -14px' 殘留
grep -rn "0 -14px" app/admin/components/tabs/ --include="*.js"
```

### 第三層：跨頁一致性驗證

以 Orders.js 為標準，比對其他列表頁的表格容器寫法：

**標準模式** (正確)：
```javascript
<div style={{ ...S.card, padding: 0, overflowX: 'auto', border: '1px solid #d1d5db', marginBottom: 10 }}>
```

**反模式** (錯誤)：
```javascript
<div style={{ ...S.tableScroll }}>     // ← S.tableScroll 有 margin: '0 -14px'
<div style={{ ...S.card, ...S.tableScroll }}>  // ← 會破壞圓角
```

需要檢查的列表頁：Quotes, Orders, SalesDocuments, Returns, StockIn, PurchaseOrders, Shipments, Inventory, Stocktake, VendorPayments

### 第四層：邏輯驗證

針對特定業務邏輯做深度檢查：

1. **報價單 → 訂單轉換**：確認 `convertToOrder` 正確複製所有明細項目
2. **庫存異動**：確認進貨/退貨/盤點都有正確更新 `qb_inventory_movements`
3. **FIFO 配貨**：確認排序邏輯 `order_date ASC, created_at ASC`
4. **PDF 輸出**：確認報價單/訂單/銷貨單 PDF 都能正常產生
5. **認證流程**：確認 OTP → session token 流程完整

### 第五層：Next.js Build 測試

```bash
cd /path/to/QB-ERP && npm run build 2>&1 | tail -50
```

## 回測報告格式

每次測試完成後，產出結構化報告：

```
═══ QB ERP 回測報告 ═══
日期：YYYY-MM-DD
觸發原因：[使用者描述 / 自動排程]

▸ SWC 編譯：✅ 59/59 通過 | ❌ N 個失敗
  - [失敗檔案列表]

▸ 樣式一致性：✅ 通過 | ❌ 發現問題
  - tableScroll 殘留：N 處
  - minHeight 洩漏：N 處

▸ 跨頁一致性：✅ 通過 | ❌ 發現問題
  - [不一致的元件列表]

▸ 邏輯驗證：✅ N/N 通過
  - [各項檢查結果]

▸ Build 測試：✅ 成功 | ❌ 失敗
  - [錯誤摘要]

═══ 總結 ═══
狀態：[全部通過 / 有問題需修復]
建議：[修復建議]
```

## 已知問題清單（持續更新）

| 問題 | 影響 | 狀態 | 修復方法 |
|------|------|------|---------|
| S.tableScroll 包含 margin: '0 -14px' | 表格容器圓角消失、超出寬度 | 已修復(4頁) | 移除 S.tableScroll，改用標準表格容器 |
| 手機版 minHeight: 44 洩漏桌面版 | 桌面版按鈕過大 | 已修復(Quotes) | 用 isMobile 條件判斷 |
| 進度 timeline 重複條目 | 轉為訂單/已發送 顯示兩次 | 已修復 | 修正 includes 匹配邏輯 |
| 右側欄間距不均 | 卡片間距大小不一 | 已修復 | marginBottom: 0 + flex gap |

## 自動化測試腳本位置

如果未來建置測試框架，建議放在：
```
/tests/
├── compile-check.sh    ← SWC 全站編譯
├── style-audit.sh      ← 樣式一致性掃描
├── consistency.sh      ← 跨頁一致性比對
└── smoke-test.sh       ← 基本功能冒煙測試
```
