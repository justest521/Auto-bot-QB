create table if not exists erp_vendors (
  id uuid primary key default gen_random_uuid(),
  vendor_code text unique,
  vendor_name text not null,
  phone text,
  fax text,
  contact_name text,
  contact_title text,
  mobile text,
  address text,
  tax_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists erp_sales_return_summary (
  id uuid primary key default gen_random_uuid(),
  doc_date date,
  doc_no text unique,
  doc_type text not null,
  invoice_no text,
  customer_name text,
  sales_name text,
  amount numeric(12, 2) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  constraint erp_sales_return_summary_doc_type_check check (doc_type in ('sale', 'return'))
);

create table if not exists erp_profit_analysis (
  id uuid primary key default gen_random_uuid(),
  customer_name text,
  doc_date date,
  doc_no text,
  sales_name text,
  amount numeric(12, 2) not null default 0,
  cost numeric(12, 2) not null default 0,
  gross_profit numeric(12, 2) not null default 0,
  gross_margin text,
  created_at timestamptz not null default now()
);
