# Excel Import Plan

Generated import-ready files live in `data/import-ready/`.

## Current files

- `erp_customers_import.csv`
  - Source: `客戶資料2026031854726.xlsx`
  - Suggested target: `erp_customers`
  - Notes:
    - `customer_code` comes from `客戶代號`
    - `company_name` comes from `客戶簡稱`
    - `name` prefers `主聯絡人`
    - `customer_stage` is inferred from `客戶類型`

- `erp_vendors_import.csv`
  - Source: `廠商資料2026031854743.xlsx`
  - Suggested target: future `erp_vendors`

- `quickbuy_products_import.csv`
  - Source: `商品資料2026031854756.xlsx`
  - Suggested target: `quickbuy_products`
  - Notes:
    - `description` combines `品名 + 規格一 + 規格二`
    - `search_text` is prebuilt for searching

- `erp_products_import.csv`
  - Source: `商品資料2026031854756.xlsx`
  - Suggested target: `erp_products`

- `sales_returns_summary_import.csv`
  - Source: `銷退貨彙總表2026031854939.xlsx`
  - Suggested target: future sales/returns summary table

- `profit_analysis_import.csv`
  - Source: `銷貨利潤分析表2026031855039.xlsx`
  - Suggested target: future profit analysis table

## Suggested replacement order

1. Replace product search data with `quickbuy_products_import.csv`
2. Replace ERP customer master with `erp_customers_import.csv`
3. Create vendor / sales / profit tables before importing the remaining CSV files

## Safety note

Do not overwrite live tables blindly if you need to preserve:

- `line_user_id`
- manual customer bindings
- customer stage changes made in admin

Prefer importing into staging tables first, then merging into production tables.
