-- ERP Schema v1 for Quick Buy / Auto-bot-QB
-- Target: Supabase Postgres
-- Scope: Phase 1 foundation for customer, product, quote, order, sales, inventory

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists erp_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  parent_id uuid references erp_categories(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists erp_customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text unique,
  name text not null,
  company_name text,
  phone text,
  email text,
  tax_id text,
  address text,
  source text default 'manual',
  line_user_id text unique,
  display_name text,
  customer_stage text not null default 'lead',
  tags jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_customers_status_check check (status in ('active', 'inactive', 'lead', 'blocked')),
  constraint erp_customers_customer_stage_check check (customer_stage in ('lead', 'prospect', 'customer', 'vip'))
);

create index if not exists idx_erp_customers_name on erp_customers(name);
create index if not exists idx_erp_customers_company_name on erp_customers(company_name);
create index if not exists idx_erp_customers_phone on erp_customers(phone);
create index if not exists idx_erp_customers_customer_stage on erp_customers(customer_stage);

create table if not exists erp_products (
  id uuid primary key default gen_random_uuid(),
  item_number text not null unique,
  name text not null,
  description text,
  category_id uuid references erp_categories(id) on delete set null,
  brand text default 'Snap-on',
  unit text not null default 'pcs',
  cost_price numeric(12, 2) not null default 0,
  list_price numeric(12, 2) not null default 0,
  sale_price numeric(12, 2) not null default 0,
  product_status text not null default 'active',
  replacement_model text,
  barcode text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_products_status_check check (product_status in ('active', 'inactive', 'discontinued'))
);

create index if not exists idx_erp_products_name on erp_products(name);
create index if not exists idx_erp_products_category_id on erp_products(category_id);

create table if not exists erp_inquiries (
  id uuid primary key default gen_random_uuid(),
  inquiry_no text unique,
  customer_id uuid not null references erp_customers(id) on delete restrict,
  source text not null default 'line',
  channel text not null default 'line',
  subject text,
  status text not null default 'open',
  assigned_to text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_inquiries_status_check check (status in ('open', 'quoted', 'won', 'lost', 'closed'))
);

create index if not exists idx_erp_inquiries_customer_id on erp_inquiries(customer_id);
create index if not exists idx_erp_inquiries_status on erp_inquiries(status);

create table if not exists erp_inquiry_items (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references erp_inquiries(id) on delete cascade,
  product_id uuid references erp_products(id) on delete set null,
  item_number_snapshot text,
  description_snapshot text,
  qty numeric(12, 2) not null default 1,
  target_price numeric(12, 2),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_erp_inquiry_items_inquiry_id on erp_inquiry_items(inquiry_id);

create table if not exists erp_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_no text not null unique,
  customer_id uuid not null references erp_customers(id) on delete restrict,
  inquiry_id uuid references erp_inquiries(id) on delete set null,
  quote_date date not null default current_date,
  valid_until date,
  status text not null default 'draft',
  subtotal numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  shipping_fee numeric(12, 2) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  remark text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_quotes_status_check check (status in ('draft', 'sent', 'approved', 'rejected', 'expired', 'converted'))
);

create index if not exists idx_erp_quotes_customer_id on erp_quotes(customer_id);
create index if not exists idx_erp_quotes_inquiry_id on erp_quotes(inquiry_id);
create index if not exists idx_erp_quotes_status on erp_quotes(status);

create table if not exists erp_quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references erp_quotes(id) on delete cascade,
  product_id uuid references erp_products(id) on delete set null,
  item_number_snapshot text not null,
  description_snapshot text,
  qty numeric(12, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  discount_rate numeric(7, 4) not null default 0,
  line_total numeric(12, 2) not null default 0,
  cost_price_snapshot numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_erp_quote_items_quote_id on erp_quote_items(quote_id);

create table if not exists erp_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  customer_id uuid not null references erp_customers(id) on delete restrict,
  quote_id uuid references erp_quotes(id) on delete set null,
  order_date date not null default current_date,
  status text not null default 'draft',
  payment_status text not null default 'unpaid',
  shipping_status text not null default 'pending',
  subtotal numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  shipping_fee numeric(12, 2) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  remark text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_orders_status_check check (status in ('draft', 'confirmed', 'processing', 'completed', 'cancelled')),
  constraint erp_orders_payment_status_check check (payment_status in ('unpaid', 'partial', 'paid', 'refunded')),
  constraint erp_orders_shipping_status_check check (shipping_status in ('pending', 'partial', 'shipped', 'delivered', 'returned'))
);

create index if not exists idx_erp_orders_customer_id on erp_orders(customer_id);
create index if not exists idx_erp_orders_quote_id on erp_orders(quote_id);
create index if not exists idx_erp_orders_status on erp_orders(status);

create table if not exists erp_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references erp_orders(id) on delete cascade,
  product_id uuid references erp_products(id) on delete set null,
  item_number_snapshot text not null,
  description_snapshot text,
  qty numeric(12, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null default 0,
  cost_price_snapshot numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_erp_order_items_order_id on erp_order_items(order_id);

create table if not exists erp_shipments (
  id uuid primary key default gen_random_uuid(),
  shipment_no text not null unique,
  order_id uuid not null references erp_orders(id) on delete restrict,
  customer_id uuid not null references erp_customers(id) on delete restrict,
  shipment_date date,
  status text not null default 'pending',
  tracking_no text,
  carrier text,
  remark text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_shipments_status_check check (status in ('pending', 'packed', 'shipped', 'delivered', 'returned', 'cancelled'))
);

create index if not exists idx_erp_shipments_order_id on erp_shipments(order_id);

create table if not exists erp_shipment_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references erp_shipments(id) on delete cascade,
  order_item_id uuid not null references erp_order_items(id) on delete restrict,
  product_id uuid references erp_products(id) on delete set null,
  qty_shipped numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_erp_shipment_items_shipment_id on erp_shipment_items(shipment_id);

create table if not exists erp_sales (
  id uuid primary key default gen_random_uuid(),
  sale_no text not null unique,
  order_id uuid references erp_orders(id) on delete set null,
  customer_id uuid not null references erp_customers(id) on delete restrict,
  sale_date date not null default current_date,
  invoice_no text,
  invoice_type text,
  status text not null default 'draft',
  subtotal numeric(12, 2) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  paid_amount numeric(12, 2) not null default 0,
  remark text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_sales_status_check check (status in ('draft', 'issued', 'paid', 'void'))
);

create index if not exists idx_erp_sales_customer_id on erp_sales(customer_id);
create index if not exists idx_erp_sales_order_id on erp_sales(order_id);

create table if not exists erp_sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references erp_sales(id) on delete cascade,
  product_id uuid references erp_products(id) on delete set null,
  qty numeric(12, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null default 0,
  cost_price_snapshot numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_erp_sale_items_sale_id on erp_sale_items(sale_id);

create table if not exists erp_warehouses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists erp_inventory_balances (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references erp_warehouses(id) on delete cascade,
  product_id uuid not null references erp_products(id) on delete cascade,
  qty_on_hand numeric(12, 2) not null default 0,
  qty_reserved numeric(12, 2) not null default 0,
  qty_available numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (warehouse_id, product_id)
);

create index if not exists idx_erp_inventory_balances_product_id on erp_inventory_balances(product_id);

create table if not exists erp_inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references erp_warehouses(id) on delete restrict,
  product_id uuid not null references erp_products(id) on delete restrict,
  txn_type text not null,
  ref_table text,
  ref_id uuid,
  qty numeric(12, 2) not null,
  unit_cost numeric(12, 2) not null default 0,
  txn_date timestamptz not null default now(),
  remark text,
  created_at timestamptz not null default now(),
  constraint erp_inventory_transactions_type_check check (txn_type in ('opening', 'purchase_in', 'sale_out', 'adjust_in', 'adjust_out', 'return_in', 'return_out', 'reserve', 'release'))
);

create index if not exists idx_erp_inventory_transactions_product_id on erp_inventory_transactions(product_id);
create index if not exists idx_erp_inventory_transactions_warehouse_id on erp_inventory_transactions(warehouse_id);

drop trigger if exists trg_erp_categories_updated_at on erp_categories;
create trigger trg_erp_categories_updated_at before update on erp_categories
for each row execute function set_updated_at();

drop trigger if exists trg_erp_customers_updated_at on erp_customers;
create trigger trg_erp_customers_updated_at before update on erp_customers
for each row execute function set_updated_at();

drop trigger if exists trg_erp_products_updated_at on erp_products;
create trigger trg_erp_products_updated_at before update on erp_products
for each row execute function set_updated_at();

drop trigger if exists trg_erp_inquiries_updated_at on erp_inquiries;
create trigger trg_erp_inquiries_updated_at before update on erp_inquiries
for each row execute function set_updated_at();

drop trigger if exists trg_erp_quotes_updated_at on erp_quotes;
create trigger trg_erp_quotes_updated_at before update on erp_quotes
for each row execute function set_updated_at();

drop trigger if exists trg_erp_orders_updated_at on erp_orders;
create trigger trg_erp_orders_updated_at before update on erp_orders
for each row execute function set_updated_at();

drop trigger if exists trg_erp_shipments_updated_at on erp_shipments;
create trigger trg_erp_shipments_updated_at before update on erp_shipments
for each row execute function set_updated_at();

drop trigger if exists trg_erp_sales_updated_at on erp_sales;
create trigger trg_erp_sales_updated_at before update on erp_sales
for each row execute function set_updated_at();

drop trigger if exists trg_erp_warehouses_updated_at on erp_warehouses;
create trigger trg_erp_warehouses_updated_at before update on erp_warehouses
for each row execute function set_updated_at();

drop trigger if exists trg_erp_inventory_balances_updated_at on erp_inventory_balances;
create trigger trg_erp_inventory_balances_updated_at before update on erp_inventory_balances
for each row execute function set_updated_at();

-- Optional migration helpers from current Quick Buy tables
-- Example:
-- insert into erp_customers (name, company_name, line_user_id, display_name, source)
-- select coalesce(display_name, '未命名客戶'), null, line_user_id, display_name, 'line'
-- from quickbuy_line_customers;
