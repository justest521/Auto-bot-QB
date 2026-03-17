alter table erp_customers
add column if not exists customer_stage text not null default 'lead';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_customers_customer_stage_check'
  ) then
    alter table erp_customers
    add constraint erp_customers_customer_stage_check
    check (customer_stage in ('lead', 'prospect', 'customer', 'vip'));
  end if;
end
$$;

create index if not exists idx_erp_customers_customer_stage on erp_customers(customer_stage);
