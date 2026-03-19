-- Step 1:
-- Upload `data/import-ready/quickbuy_products_import.csv`
-- into a temporary table named `stg_quickbuy_products`.
--
-- Suggested staging table columns:
-- item_number text
-- description text
-- tw_retail_price numeric
-- tw_reseller_price numeric
-- product_status text
-- category text
-- replacement_model text
-- weight_kg numeric
-- origin_country text
-- search_text text

begin;

truncate table quickbuy_products;

insert into quickbuy_products (
  item_number,
  description,
  tw_retail_price,
  tw_reseller_price,
  product_status,
  category,
  replacement_model,
  weight_kg,
  origin_country,
  search_text
)
select
  nullif(item_number, '') as item_number,
  nullif(description, '') as description,
  coalesce(tw_retail_price, 0) as tw_retail_price,
  coalesce(tw_reseller_price, 0) as tw_reseller_price,
  coalesce(nullif(product_status, ''), 'Current') as product_status,
  coalesce(nullif(category, ''), 'other') as category,
  nullif(replacement_model, '') as replacement_model,
  coalesce(weight_kg, 0) as weight_kg,
  nullif(origin_country, '') as origin_country,
  nullif(search_text, '') as search_text
from stg_quickbuy_products;

commit;

-- Optional cleanup after verification:
-- drop table if exists stg_quickbuy_products;
