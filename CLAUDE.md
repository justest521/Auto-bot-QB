# QB ERP — Claude 工作守則

## 專案概覽

台灣零售/電商 ERP，Next.js 14 App Router + Supabase PostgreSQL。
後端邏輯集中在：
- `lib/admin/actions-get.js` — 所有 GET API
- `lib/admin/actions-post.js` — 所有 POST API

---

## 修改前必做

### 1. 先跑全流程
修改任何後端邏輯前，必須追蹤「觸發這段程式的完整流程」：
- 資料從哪裡來？哪張 table 哪個欄位？
- 這筆資料在哪裡被建立（insert）？被修改（update）？被刪除？
- 同一筆資料有沒有其他地方也在讀寫？

**不能只看報錯那一行，要看整個前後流程。**

### 2. 修改後必跑 audit
修改 `actions-get.js` 或 `actions-post.js` 後，必須執行：
```bash
/usr/local/bin/node scripts/audit.js
```
確認沒有新增 ERROR 或 WARN。

---

## 已知的地雷

### A. Supabase `.maybeSingle()` 的限制
- 在「一對多」欄位（`order_id`, `source_id`, `sale_id`）上用 `.maybeSingle()` 時，**必須**先加 `.limit(1)`
- 多行時不加 `.limit(1)` 會 silent error（返回 null，不拋例外）
- ✅ 安全：PK (`id`)、唯一鍵 (`invoice_no`, `order_no`, `slip_number`)
- ❌ 危險：`order_id`, `source_id`, `shipment_id`, `erp_order_id`, `sale_id`

### B. `erp_invoices` 的雙來源問題
- `erp_invoices.paid_amount` 由 `actions-post.js:3704` 自動從 `qb_payments` 更新
- **不能**在計算已收金額時再加 `qb_payments` 的 sum → 雙計
- 應收帳款列表的 `已收金額` 唯一來源：`erp_invoices.paid_amount`

### C. `erp_invoices` 多行問題
- 同一訂單可有多張銷貨單，每張銷貨單有自己的 `erp_invoices` 行
- 不能用 `order_id` alone 來查找「唯一」的發票 → 需加 `sale_id` 或 `invoice_no`
- `create_shipment` 自動建立的行 `invoice_no = 'INV...'`（非 null），不在 `.is('invoice_no', null)` 範圍內
- 查找既有行的正確優先順序：`invoice_no` → `sale_id` → `order_id + invoice_no IS NULL`

### D. `erp_invoices` INSERT 必要欄位
每次 insert 必須包含：
```
invoice_no, total_amount, customer_id, payment_status, order_id (若有)
```

### E. `erp_vendor_payables` INSERT 必要欄位
每次 insert 必須包含：
```
payment_status ('unpaid')
```

---

## 修改後必做

1. **跑 audit**：`/usr/local/bin/node scripts/audit.js`
2. **git commit + push**：每次修改完立刻 commit，不要累積

---

## 靜態掃描腳本

```bash
# 完整掃描
/usr/local/bin/node scripts/audit.js

# 掃單一檔案
/usr/local/bin/node scripts/audit.js lib/admin/actions-post.js
```

掃描規則位置：`scripts/audit.js`
規則說明見腳本頂部注釋。

---

## 常用指令

```bash
# Build 測試
/usr/local/bin/node /Users/tungyiwu/Desktop/AI/QB-ERP/node_modules/.bin/next build

# Git
git add -p && git commit -m "..." && git push
```
