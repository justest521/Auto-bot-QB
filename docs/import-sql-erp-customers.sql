-- Step 1:
-- Upload `data/import-ready/erp_customers_import.csv`
-- into a temporary table named `stg_erp_customers`.
--
-- Suggested staging table columns:
-- customer_code text
-- name text
-- company_name text
-- phone text
-- email text
-- tax_id text
-- address text
-- source text
-- display_name text
-- customer_stage text
-- status text
-- notes text

begin;

-- 1. Update existing ERP customers by customer_code first.
update erp_customers as target
set
  name = src.name,
  company_name = src.company_name,
  phone = src.phone,
  email = nullif(src.email, ''),
  tax_id = nullif(src.tax_id, ''),
  address = nullif(src.address, ''),
  source = coalesce(nullif(target.source, ''), src.source, 'import'),
  display_name = coalesce(target.display_name, src.display_name),
  customer_stage = coalesce(nullif(target.customer_stage, ''), src.customer_stage, 'lead'),
  status = coalesce(nullif(target.status, ''), src.status, 'active'),
  notes = case
    when coalesce(target.notes, '') = '' then nullif(src.notes, '')
    when coalesce(src.notes, '') = '' then target.notes
    else target.notes || ' | ' || src.notes
  end
from stg_erp_customers as src
where target.customer_code = src.customer_code
  and src.customer_code is not null
  and src.customer_code <> '';

-- 2. Insert missing customers.
insert into erp_customers (
  customer_code,
  name,
  company_name,
  phone,
  email,
  tax_id,
  address,
  source,
  display_name,
  customer_stage,
  status,
  notes
)
select
  nullif(src.customer_code, ''),
  coalesce(nullif(src.name, ''), nullif(src.company_name, ''), '未命名客戶'),
  nullif(src.company_name, ''),
  nullif(src.phone, ''),
  nullif(src.email, ''),
  nullif(src.tax_id, ''),
  nullif(src.address, ''),
  coalesce(nullif(src.source, ''), 'import'),
  nullif(src.display_name, ''),
  coalesce(nullif(src.customer_stage, ''), 'lead'),
  coalesce(nullif(src.status, ''), 'active'),
  nullif(src.notes, '')
from stg_erp_customers as src
where not exists (
  select 1
  from erp_customers as target
  where target.customer_code = src.customer_code
    and src.customer_code is not null
    and src.customer_code <> ''
);

commit;

-- Optional cleanup after verification:
-- drop table if exists stg_erp_customers;
