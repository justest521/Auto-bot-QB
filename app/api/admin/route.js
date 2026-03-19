import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function formatMonthLabel(date) {
  return date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
}

function formatDayLabel(date) {
  return date.toLocaleString('en-US', { month: '2-digit', day: '2-digit' });
}

function normalizeCustomerText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function scoreErpCustomer(row) {
  if (!row) return -1;

  let score = 0;
  if (row.customer_code) score += 50;
  if (row.company_name) score += 20;
  if (row.phone) score += 10;
  if (row.email) score += 10;
  if (row.tax_id) score += 10;
  if (row.customer_stage === 'customer') score += 20;
  if (row.customer_stage === 'vip') score += 25;
  if (row.source && row.source !== 'line') score += 10;

  return score;
}

function choosePreferredErpCustomer(candidates, displayName) {
  if (!candidates?.length) return null;

  const normalizedDisplayName = normalizeCustomerText(displayName);
  const exactNamed = candidates.filter((row) => {
    const names = [row.name, row.company_name, row.display_name].map(normalizeCustomerText);
    return normalizedDisplayName && names.includes(normalizedDisplayName);
  });

  const source = exactNamed.length ? exactNamed : candidates;
  return [...source].sort((a, b) => scoreErpCustomer(b) - scoreErpCustomer(a))[0] || null;
}

function cleanCsvValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  return value;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateValue(value) {
  const cleaned = cleanCsvValue(value);
  return cleaned || null;
}

function normalizeRows(rows) {
  return Array.isArray(rows) ? rows.filter(Boolean) : [];
}

async function getImportHistory() {
  const { data, error } = await supabase
    .from('quickbuy_config')
    .select('config_value')
    .eq('config_key', 'admin_import_history')
    .maybeSingle();

  if (error) throw error;
  return Array.isArray(data?.config_value) ? data.config_value : [];
}

async function appendImportHistory(entry) {
  const history = await getImportHistory();
  const nextHistory = [entry, ...history].slice(0, 30);

  const { error } = await supabase
    .from('quickbuy_config')
    .upsert(
      {
        config_key: 'admin_import_history',
        config_value: nextHistory,
      },
      { onConflict: 'config_key' }
    );

  if (error) throw error;
}

const ERP_CUSTOMER_BASE_COLUMNS = 'id,name,company_name,phone,email,tax_id,address,line_user_id,source,status,display_name';
const ERP_CUSTOMER_COLUMNS_WITH_STAGE = `${ERP_CUSTOMER_BASE_COLUMNS},customer_stage`;

async function runErpCustomerQuery(buildQuery) {
  let stageReady = true;
  let result = await buildQuery(ERP_CUSTOMER_COLUMNS_WITH_STAGE);

  if (result.error && /customer_stage/i.test(result.error.message || '')) {
    stageReady = false;
    result = await buildQuery(ERP_CUSTOMER_BASE_COLUMNS);
  }

  return { ...result, stageReady };
}

function isAuthorized(request) {
  const adminToken = process.env.ADMIN_TOKEN;

  if (!adminToken) {
    console.error('ADMIN_TOKEN is not configured');
    return { ok: false, status: 503, error: 'Admin auth is not configured' };
  }

  const headerToken = request.headers.get('x-admin-token');
  if (headerToken !== adminToken) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  return { ok: true };
}

export async function GET(request) {
  const auth = isAuthorized(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    switch (action) {
      case 'stats': {
        const today = new Date().toISOString().split('T')[0];
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
        const recentMessageSince = new Date(Date.now() - 180 * 86400000).toISOString();

        const [msgTotal, msgToday, msgWeek, customers, avgTime, topProducts, recentMessages] = await Promise.all([
          supabase.from('quickbuy_line_messages').select('*', { count: 'exact', head: true }),
          supabase.from('quickbuy_line_messages').select('*', { count: 'exact', head: true }).gte('created_at', today),
          supabase.from('quickbuy_line_messages').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
          supabase.from('quickbuy_line_customers').select('*', { count: 'exact', head: true }),
          supabase.from('quickbuy_line_messages').select('response_time_ms').not('response_time_ms', 'is', null).limit(100).order('created_at', { ascending: false }),
          supabase.from('quickbuy_line_messages').select('matched_products').not('matched_products', 'is', null).limit(50).order('created_at', { ascending: false }),
          supabase
            .from('quickbuy_line_messages')
            .select('created_at,line_user_id,matched_products,response_time_ms')
            .gte('created_at', recentMessageSince)
            .order('created_at', { ascending: true }),
        ]);

        const times = avgTime.data?.map(r => r.response_time_ms).filter(Boolean) || [];
        const avgMs = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;

        // Count top products from matched_products JSON
        const productCount = {};
        topProducts.data?.forEach(row => {
          const products = Array.isArray(row.matched_products) ? row.matched_products : [];
          products.forEach(p => {
            const key = p.item_number;
            if (key) productCount[key] = (productCount[key] || 0) + 1;
          });
        });
        const topItems = Object.entries(productCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([item, count]) => ({ item_number: item, count }));

        const messageRows = recentMessages.data || [];
        const monthBuckets = Array.from({ length: 7 }, (_, index) => {
          const bucketDate = new Date();
          bucketDate.setMonth(bucketDate.getMonth() - (6 - index));
          return {
            key: `${bucketDate.getFullYear()}-${bucketDate.getMonth()}`,
            label: formatMonthLabel(bucketDate),
            count: 0,
            customers: new Set(),
          };
        });

        const dayBuckets = Array.from({ length: 10 }, (_, index) => {
          const bucketDate = new Date();
          bucketDate.setDate(bucketDate.getDate() - (9 - index));
          return {
            key: bucketDate.toISOString().split('T')[0],
            label: formatDayLabel(bucketDate),
            count: 0,
          };
        });

        let matchedCount = 0;
        let fastReplyCount = 0;
        const customerMessageCount = {};

        messageRows.forEach((row) => {
          if (!row.created_at) return;

          const createdAt = new Date(row.created_at);
          const monthKey = `${createdAt.getFullYear()}-${createdAt.getMonth()}`;
          const dayKey = createdAt.toISOString().split('T')[0];

          const monthBucket = monthBuckets.find((bucket) => bucket.key === monthKey);
          if (monthBucket) {
            monthBucket.count += 1;
            if (row.line_user_id) monthBucket.customers.add(row.line_user_id);
          }

          const dayBucket = dayBuckets.find((bucket) => bucket.key === dayKey);
          if (dayBucket) dayBucket.count += 1;

          if (Array.isArray(row.matched_products) && row.matched_products.length > 0) {
            matchedCount += 1;
          }

          if ((row.response_time_ms || 0) > 0 && row.response_time_ms <= 3000) {
            fastReplyCount += 1;
          }

          if (row.line_user_id) {
            customerMessageCount[row.line_user_id] = (customerMessageCount[row.line_user_id] || 0) + 1;
          }
        });

        const repeatCustomerCount = Object.values(customerMessageCount).filter((count) => count > 1).length;
        const knownCustomerCount = Object.keys(customerMessageCount).length;

        const trendMonthly = monthBuckets.map((bucket) => ({
          label: bucket.label,
          count: bucket.count,
          customers: bucket.customers.size,
        }));

        const trendDaily = dayBuckets.map((bucket) => ({
          label: bucket.label,
          count: bucket.count,
        }));

        const interactionBreakdown = {
          matched_rate: messageRows.length ? Math.round((matchedCount / messageRows.length) * 100) : 0,
          repeat_customer_rate: knownCustomerCount ? Math.round((repeatCustomerCount / knownCustomerCount) * 100) : 0,
          fast_reply_rate: messageRows.length ? Math.round((fastReplyCount / messageRows.length) * 100) : 0,
        };

        return Response.json({
          total_messages: msgTotal.count || 0,
          today_messages: msgToday.count || 0,
          week_messages: msgWeek.count || 0,
          total_customers: customers.count || 0,
          avg_response_ms: avgMs,
          top_products: topItems,
          trend_monthly: trendMonthly,
          trend_daily: trendDaily,
          interaction_breakdown: interactionBreakdown,
        });
      }

      case 'messages': {
        const page = parseInt(searchParams.get('page') || '1');
        const limit = 20;
        const offset = (page - 1) * limit;
        const search = searchParams.get('search') || '';

        let query = supabase
          .from('quickbuy_line_messages')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (search) {
          query = query.or(`user_message.ilike.%${search}%,ai_response.ilike.%${search}%,display_name.ilike.%${search}%`);
        }

        const { data, count } = await query;
        return Response.json({ messages: data || [], total: count || 0, page, limit });
      }

      case 'customers': {
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
        const offset = (page - 1) * limit;
        const search = (searchParams.get('search') || '').trim();

        let query = supabase
          .from('quickbuy_line_customers')
          .select('*', { count: 'exact' })
          .order('last_contact_at', { ascending: false, nullsFirst: false })
          .range(offset, offset + limit - 1);

        if (search) {
          query = query.or(`display_name.ilike.%${search}%,line_user_id.ilike.%${search}%`);
        }

        const { data, count, error } = await query;
        if (error) return Response.json({ error: error.message }, { status: 500 });

        let linkedCustomersByLineId = {};
        let erpReady = true;
        let customerStageReady = true;

        try {
          const lineUserIds = (data || []).map((row) => row.line_user_id).filter(Boolean);
          const displayNames = (data || []).map((row) => row.display_name).filter(Boolean);
          if (lineUserIds.length > 0) {
            const { data: linkedRows, error: linkedError, stageReady } = await runErpCustomerQuery((columns) =>
              supabase
                .from('erp_customers')
                .select(columns)
                .in('line_user_id', lineUserIds)
            );

            if (linkedError) throw linkedError;
            customerStageReady = stageReady;

            const linkedByLineId = Object.fromEntries(
              (linkedRows || []).map((row) => [row.line_user_id, row])
            );

            let nameMatchedRows = [];
            if (displayNames.length > 0) {
              const uniqueDisplayNames = [...new Set(displayNames)];
              const orFilter = uniqueDisplayNames
                .flatMap((name) => [
                  `name.ilike.%${name}%`,
                  `company_name.ilike.%${name}%`,
                  `display_name.ilike.%${name}%`,
                ])
                .join(',');

              const { data: matchedRows, error: matchedError, stageReady: nameStageReady } = await runErpCustomerQuery((columns) =>
                supabase
                  .from('erp_customers')
                  .select(columns)
                  .or(orFilter)
              );

              if (!matchedError) {
                nameMatchedRows = matchedRows || [];
                customerStageReady = customerStageReady && nameStageReady;
              }
            }

            linkedCustomersByLineId = Object.fromEntries(
              (data || []).map((row) => {
                const direct = row.line_user_id ? linkedByLineId[row.line_user_id] || null : null;
                const nameMatches = nameMatchedRows.filter((candidate) => {
                  const normalizedDisplayName = normalizeCustomerText(row.display_name);
                  return normalizedDisplayName && [
                    candidate.name,
                    candidate.company_name,
                    candidate.display_name,
                  ].map(normalizeCustomerText).includes(normalizedDisplayName);
                });

                return [row.line_user_id, choosePreferredErpCustomer([direct, ...nameMatches].filter(Boolean), row.display_name)];
              })
            );
          }
        } catch {
          erpReady = false;
        }

        return Response.json({
          customers: (data || []).map((row) => ({
            ...row,
            linked_customer: row.line_user_id ? linkedCustomersByLineId[row.line_user_id] || null : null,
          })),
          total: count || 0,
          page,
          limit,
          erp_ready: erpReady,
          customer_stage_ready: customerStageReady,
        });
      }

      case 'formal_customers': {
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
        const offset = (page - 1) * limit;
        const search = (searchParams.get('search') || '').trim();

        try {
          let customerStageReady = true;
          let queryBuilder = (columns) => {
            let query = supabase
              .from('erp_customers')
              .select(columns, { count: 'exact' })
              .order('customer_code', { ascending: true, nullsFirst: false })
              .range(offset, offset + limit - 1);

            if (search) {
              query = query.or(`customer_code.ilike.%${search}%,name.ilike.%${search}%,company_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
            }

            return query;
          };

          const { data, count, error, stageReady } = await runErpCustomerQuery(queryBuilder);
          if (error) return Response.json({ error: error.message }, { status: 500 });
          customerStageReady = stageReady;
          const importHistory = await getImportHistory();
          const latestCustomerImport = importHistory.find((entry) => entry.dataset === 'erp_customers') || null;

          return Response.json({
            customers: data || [],
            total: count || 0,
            page,
            limit,
            customer_stage_ready: customerStageReady,
            erp_ready: true,
            latest_import: latestCustomerImport,
          });
        } catch {
          return Response.json({
            customers: [],
            total: 0,
            page,
            limit,
            customer_stage_ready: false,
            erp_ready: false,
            latest_import: null,
          });
        }
      }

      case 'erp_customer_lookup': {
        const search = (searchParams.get('search') || '').trim();
        if (!search) return Response.json({ customers: [], erp_ready: true });

        try {
          const { data, error, stageReady } = await runErpCustomerQuery((columns) =>
            supabase
              .from('erp_customers')
              .select(columns)
              .or(`name.ilike.%${search}%,company_name.ilike.%${search}%,phone.ilike.%${search}%`)
              .limit(10)
          );

          if (error) return Response.json({ error: error.message }, { status: 500 });

          return Response.json({ customers: data || [], erp_ready: true, customer_stage_ready: stageReady });
        } catch {
          return Response.json({ customers: [], erp_ready: false, customer_stage_ready: false });
        }
      }

      case 'customer_detail': {
        const lineUserId = (searchParams.get('line_user_id') || '').trim();
        if (!lineUserId) {
          return Response.json({ error: 'line_user_id is required' }, { status: 400 });
        }

        const { data: customer, error: customerError } = await supabase
          .from('quickbuy_line_customers')
          .select('*')
          .eq('line_user_id', lineUserId)
          .maybeSingle();

        if (customerError) return Response.json({ error: customerError.message }, { status: 500 });
        if (!customer) return Response.json({ error: 'Customer not found' }, { status: 404 });

        let linkedCustomer = null;
        let erpReady = true;
        let customerStageReady = true;
        let quoteCount = 0;
        let orderCount = 0;
        let saleCount = 0;
        let salesTotal = 0;

        try {
          const { data: linkedRow, error: linkedError, stageReady } = await runErpCustomerQuery((columns) =>
            supabase
              .from('erp_customers')
              .select(columns)
              .eq('line_user_id', lineUserId)
              .maybeSingle()
          );

          if (linkedError) throw linkedError;
          linkedCustomer = linkedRow || null;
          customerStageReady = stageReady;

          const displayName = customer.display_name || linkedCustomer?.display_name || '';
          if (displayName) {
            const { data: candidateRows, error: candidateError } = await runErpCustomerQuery((columns) =>
              supabase
                .from('erp_customers')
                .select(columns)
                .or(`name.ilike.%${displayName}%,company_name.ilike.%${displayName}%,display_name.ilike.%${displayName}%`)
            );

            if (!candidateError) {
              linkedCustomer = choosePreferredErpCustomer([linkedCustomer, ...(candidateRows || [])].filter(Boolean), displayName);
            }
          }

          if (linkedCustomer?.id) {
            const [quotes, orders, sales] = await Promise.all([
              supabase.from('erp_quotes').select('*', { count: 'exact', head: true }).eq('customer_id', linkedCustomer.id),
              supabase.from('erp_orders').select('*', { count: 'exact', head: true }).eq('customer_id', linkedCustomer.id),
              supabase.from('erp_sales').select('total_amount').eq('customer_id', linkedCustomer.id),
            ]);

            quoteCount = quotes.count || 0;
            orderCount = orders.count || 0;
            saleCount = sales.data?.length || 0;
            salesTotal = (sales.data || []).reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
          }
        } catch {
          erpReady = false;
        }

        const { data: recentMessages, error: recentMessagesError } = await supabase
          .from('quickbuy_line_messages')
          .select('id,user_message,ai_response,created_at')
          .eq('line_user_id', lineUserId)
          .order('created_at', { ascending: false })
          .limit(5);

        if (recentMessagesError) return Response.json({ error: recentMessagesError.message }, { status: 500 });

        const formalProfileComplete = Boolean(
          linkedCustomer && (
            linkedCustomer.customer_stage === 'customer' ||
            linkedCustomer.customer_stage === 'vip' ||
            linkedCustomer.company_name ||
            linkedCustomer.phone ||
            linkedCustomer.email ||
            linkedCustomer.tax_id ||
            (linkedCustomer.source && linkedCustomer.source !== 'line')
          )
        );

        return Response.json({
          customer: {
            ...customer,
            linked_customer: linkedCustomer,
          },
          summary: {
            message_count: customer.message_count || 0,
            quote_count: quoteCount,
            order_count: orderCount,
            sale_count: saleCount,
            sales_total: salesTotal,
          },
          recent_messages: recentMessages || [],
          erp_ready: erpReady,
          customer_stage_ready: customerStageReady,
          formal_profile_complete: formalProfileComplete,
        });
      }

      case 'promotions': {
        const { data } = await supabase
          .from('quickbuy_promotions')
          .select('*, quickbuy_promotion_items(*)')
          .order('created_at', { ascending: false });
        return Response.json({ promotions: data || [] });
      }

      case 'vendors': {
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
        const offset = (page - 1) * limit;
        const search = (searchParams.get('search') || '').trim();

        try {
          let query = supabase
            .from('erp_vendors')
            .select('*', { count: 'exact' })
            .order('vendor_code', { ascending: true, nullsFirst: false })
            .range(offset, offset + limit - 1);

          if (search) {
            query = query.or(`vendor_name.ilike.%${search}%,vendor_code.ilike.%${search}%,contact_name.ilike.%${search}%`);
          }

          const { data, count, error } = await query;
          if (error) return Response.json({ error: error.message }, { status: 500 });

          return Response.json({ vendors: data || [], total: count || 0, page, limit, table_ready: true });
        } catch {
          return Response.json({ vendors: [], total: 0, page, limit, table_ready: false });
        }
      }

      case 'sales_returns': {
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
        const offset = (page - 1) * limit;
        const search = (searchParams.get('search') || '').trim();
        const dateFrom = (searchParams.get('date_from') || '').trim();
        const dateTo = (searchParams.get('date_to') || '').trim();

        try {
          let query = supabase
            .from('erp_sales_return_summary')
            .select('*', { count: 'exact' })
            .order('doc_date', { ascending: false, nullsFirst: false })
            .range(offset, offset + limit - 1);

          if (search) {
            query = query.or(`doc_no.ilike.%${search}%,customer_name.ilike.%${search}%,sales_name.ilike.%${search}%,invoice_no.ilike.%${search}%`);
          }

          if (dateFrom) query = query.gte('doc_date', dateFrom);
          if (dateTo) query = query.lte('doc_date', dateTo);

          const { data, count, error } = await query;
          if (error) return Response.json({ error: error.message }, { status: 500 });

          const totals = (data || []).reduce((acc, row) => {
            acc.amount += Number(row.amount || 0);
            acc.tax += Number(row.tax_amount || 0);
            acc.total += Number(row.total_amount || 0);
            return acc;
          }, { amount: 0, tax: 0, total: 0 });

          return Response.json({ rows: data || [], total: count || 0, page, limit, summary: totals, table_ready: true, date_from: dateFrom, date_to: dateTo });
        } catch {
          return Response.json({ rows: [], total: 0, page, limit, summary: { amount: 0, tax: 0, total: 0 }, table_ready: false, date_from: dateFrom, date_to: dateTo });
        }
      }

      case 'profit_analysis': {
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
        const offset = (page - 1) * limit;
        const search = (searchParams.get('search') || '').trim();
        const dateFrom = (searchParams.get('date_from') || '').trim();
        const dateTo = (searchParams.get('date_to') || '').trim();

        try {
          let query = supabase
            .from('erp_profit_analysis')
            .select('*', { count: 'exact' })
            .order('doc_date', { ascending: false, nullsFirst: false })
            .range(offset, offset + limit - 1);

          if (search) {
            query = query.or(`customer_name.ilike.%${search}%,doc_no.ilike.%${search}%,sales_name.ilike.%${search}%`);
          }

          if (dateFrom) query = query.gte('doc_date', dateFrom);
          if (dateTo) query = query.lte('doc_date', dateTo);

          const { data, count, error } = await query;
          if (error) return Response.json({ error: error.message }, { status: 500 });

          const summary = (data || []).reduce((acc, row) => {
            acc.amount += Number(row.amount || 0);
            acc.cost += Number(row.cost || 0);
            acc.gross_profit += Number(row.gross_profit || 0);
            return acc;
          }, { amount: 0, cost: 0, gross_profit: 0 });

          return Response.json({ rows: data || [], total: count || 0, page, limit, summary, table_ready: true, date_from: dateFrom, date_to: dateTo });
        } catch {
          return Response.json({ rows: [], total: 0, page, limit, summary: { amount: 0, cost: 0, gross_profit: 0 }, table_ready: false, date_from: dateFrom, date_to: dateTo });
        }
      }

      case 'import_history': {
        try {
          const history = await getImportHistory();
          return Response.json({ history });
        } catch (error) {
          return Response.json({ history: [], error: error.message }, { status: 500 });
        }
      }

      case 'pricing': {
        // Return current pricing rules (stored as a simple config row)
        const { data } = await supabase
          .from('quickbuy_config')
          .select('*')
          .eq('key', 'pricing_rules')
          .single();
        return Response.json({
          rules: data?.value || {
            default_discount: 0.85,
            free_shipping_threshold: 5000,
            show_retail_price: true,
            show_promo_hint: true,
          }
        });
      }

      case 'products': {
        const search = searchParams.get('q') || '';
        const category = searchParams.get('category') || 'all';
        const page = parseInt(searchParams.get('page') || '0', 10);
        const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 50);
        const offset = page * limit;

        let query = supabase
          .from('quickbuy_products')
          .select(
            'item_number,description,us_price,tw_retail_price,tw_reseller_price,product_status,category,replacement_model,weight_kg,origin_country',
            { count: 'exact' }
          )
          .eq('product_status', 'Current')
          .order('item_number', { ascending: true })
          .range(offset, offset + limit - 1);

        if (category && category !== 'all') {
          query = query.eq('category', category);
        }

        const trimmed = search.trim();
        if (trimmed) {
          const escaped = trimmed.replace(/['"]/g, '');
          query = query.or(
            `item_number.ilike.%${escaped}%,search_text.fts.${escaped
              .split(/\s+/)
              .filter(Boolean)
              .join(' & ')}`
          );
        }

        const { data, count, error } = await query;
        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json({
          products: data || [],
          total: count || 0,
          page,
          limit,
        });
      }

      case 'chat_history': {
        const search = searchParams.get('search') || '';
        const page = parseInt(searchParams.get('page') || '0', 10);
        const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 100);
        const offset = page * limit;

        let query = supabase
          .from('quickbuy_chat_history')
          .select(
            'id,sender_type,sender_name,display_name,content,message_date,message_time',
            { count: 'exact' }
          )
          .order('message_timestamp', { ascending: false, nullsFirst: false })
          .range(offset, offset + limit - 1);

        if (search.trim()) {
          const escaped = search.trim().replace(/,/g, ' ');
          query = query.or(
            `content.ilike.%${escaped}%,display_name.ilike.%${escaped}%,sender_name.ilike.%${escaped}%`
          );
        }

        const { data, count, error } = await query;
        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json({
          messages: data || [],
          total: count || 0,
          page,
          limit,
        });
      }

      case 'chat_history_stats': {
        const [user, account, all] = await Promise.all([
          supabase
            .from('quickbuy_chat_history')
            .select('*', { count: 'exact', head: true })
            .eq('sender_type', 'User'),
          supabase
            .from('quickbuy_chat_history')
            .select('*', { count: 'exact', head: true })
            .eq('sender_type', 'Account'),
          supabase.from('quickbuy_chat_history').select('*', { count: 'exact', head: true }),
        ]);

        return Response.json({
          user: user.count || 0,
          account: account.count || 0,
          total: all.count || 0,
        });
      }

      case 'ai_prompt': {
        const { data, error } = await supabase
          .from('quickbuy_config')
          .select('config_value')
          .eq('config_key', 'ai_system_prompt')
          .limit(1)
          .maybeSingle();

        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json({ prompt: data?.config_value || '' });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Admin API error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = isAuthorized(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'import_csv_dataset': {
        const { dataset, rows, file_name } = body;
        const safeRows = normalizeRows(rows);

        if (!dataset || safeRows.length === 0) {
          return Response.json({ error: 'dataset and rows are required' }, { status: 400 });
        }

        if (dataset === 'quickbuy_products') {
          const payload = safeRows.map((row) => ({
            item_number: cleanCsvValue(row.item_number),
            description: cleanCsvValue(row.description),
            tw_retail_price: toNumber(row.tw_retail_price),
            tw_reseller_price: toNumber(row.tw_reseller_price),
            product_status: cleanCsvValue(row.product_status) || 'Current',
            category: cleanCsvValue(row.category) || 'other',
            replacement_model: cleanCsvValue(row.replacement_model),
            weight_kg: toNumber(row.weight_kg),
            origin_country: cleanCsvValue(row.origin_country),
            search_text: cleanCsvValue(row.search_text),
          })).filter((row) => row.item_number);

          const { error: deleteError } = await supabase.from('quickbuy_products').delete().neq('item_number', '');
          if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });

          const { error } = await supabase.from('quickbuy_products').insert(payload);
          if (error) return Response.json({ error: error.message }, { status: 500 });

          await appendImportHistory({
            dataset,
            file_name: file_name || null,
            count: payload.length,
            imported_at: new Date().toISOString(),
            imported_by: 'admin',
          });

          return Response.json({ success: true, count: payload.length });
        }

        if (dataset === 'erp_customers') {
          let updated = 0;
          let inserted = 0;

          for (const row of safeRows) {
            const customerCode = cleanCsvValue(row.customer_code);
            const payload = {
              customer_code: customerCode,
              name: cleanCsvValue(row.name) || cleanCsvValue(row.company_name) || '未命名客戶',
              company_name: cleanCsvValue(row.company_name),
              phone: cleanCsvValue(row.phone),
              email: cleanCsvValue(row.email),
              tax_id: cleanCsvValue(row.tax_id),
              address: cleanCsvValue(row.address),
              source: cleanCsvValue(row.source) || 'import',
              display_name: cleanCsvValue(row.display_name),
              customer_stage: cleanCsvValue(row.customer_stage) || 'lead',
              status: cleanCsvValue(row.status) || 'active',
              notes: cleanCsvValue(row.notes),
            };

            if (customerCode) {
              const { data: existing, error: existingError } = await supabase
                .from('erp_customers')
                .select('id,display_name,source,customer_stage,status,notes')
                .eq('customer_code', customerCode)
                .maybeSingle();

              if (existingError) return Response.json({ error: existingError.message }, { status: 500 });

              if (existing?.id) {
                const updatePayload = {
                  ...payload,
                  source: existing.source || payload.source,
                  display_name: existing.display_name || payload.display_name,
                  customer_stage: existing.customer_stage || payload.customer_stage,
                  status: existing.status || payload.status,
                  notes: existing.notes && payload.notes ? `${existing.notes} | ${payload.notes}` : existing.notes || payload.notes,
                };

                const { error } = await supabase
                  .from('erp_customers')
                  .update(updatePayload)
                  .eq('id', existing.id);

                if (error) return Response.json({ error: error.message }, { status: 500 });
                updated += 1;
                continue;
              }
            }

            const { error } = await supabase.from('erp_customers').insert(payload);
            if (error) return Response.json({ error: error.message }, { status: 500 });
            inserted += 1;
          }

          await appendImportHistory({
            dataset,
            file_name: file_name || null,
            count: safeRows.length,
            inserted,
            updated,
            imported_at: new Date().toISOString(),
            imported_by: 'admin',
          });

          return Response.json({ success: true, count: safeRows.length, inserted, updated });
        }

        if (dataset === 'erp_vendors') {
          const payload = safeRows.map((row) => ({
            vendor_code: cleanCsvValue(row.vendor_code),
            vendor_name: cleanCsvValue(row.vendor_name) || '未命名廠商',
            phone: cleanCsvValue(row.phone),
            fax: cleanCsvValue(row.fax),
            contact_name: cleanCsvValue(row.contact_name),
            contact_title: cleanCsvValue(row.contact_title),
            mobile: cleanCsvValue(row.mobile),
            address: cleanCsvValue(row.address),
            tax_id: cleanCsvValue(row.tax_id),
          }));

          const { error: deleteError } = await supabase.from('erp_vendors').delete().neq('vendor_name', '');
          if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });

          const { error } = await supabase.from('erp_vendors').insert(payload);
          if (error) return Response.json({ error: error.message }, { status: 500 });

          await appendImportHistory({
            dataset,
            file_name: file_name || null,
            count: payload.length,
            imported_at: new Date().toISOString(),
            imported_by: 'admin',
          });

          return Response.json({ success: true, count: payload.length });
        }

        if (dataset === 'erp_sales_return_summary') {
          const payload = safeRows.map((row) => ({
            doc_date: toDateValue(row.doc_date),
            doc_no: cleanCsvValue(row.doc_no),
            doc_type: cleanCsvValue(row.doc_type) || 'sale',
            invoice_no: cleanCsvValue(row.invoice_no),
            customer_name: cleanCsvValue(row.customer_name),
            sales_name: cleanCsvValue(row.sales_name),
            amount: toNumber(row.amount),
            tax_amount: toNumber(row.tax_amount),
            total_amount: toNumber(row.total_amount),
          })).filter((row) => row.doc_no);

          const { error: deleteError } = await supabase.from('erp_sales_return_summary').delete().neq('doc_no', '');
          if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });

          const { error } = await supabase.from('erp_sales_return_summary').insert(payload);
          if (error) return Response.json({ error: error.message }, { status: 500 });

          await appendImportHistory({
            dataset,
            file_name: file_name || null,
            count: payload.length,
            imported_at: new Date().toISOString(),
            imported_by: 'admin',
          });

          return Response.json({ success: true, count: payload.length });
        }

        if (dataset === 'erp_profit_analysis') {
          const payload = safeRows.map((row) => ({
            customer_name: cleanCsvValue(row.customer_name),
            doc_date: toDateValue(row.doc_date),
            doc_no: cleanCsvValue(row.doc_no),
            sales_name: cleanCsvValue(row.sales_name),
            amount: toNumber(row.amount),
            cost: toNumber(row.cost),
            gross_profit: toNumber(row.gross_profit),
            gross_margin: cleanCsvValue(row.gross_margin),
          })).filter((row) => row.doc_no || row.customer_name);

          const { error: deleteError } = await supabase.from('erp_profit_analysis').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });

          const { error } = await supabase.from('erp_profit_analysis').insert(payload);
          if (error) return Response.json({ error: error.message }, { status: 500 });

          await appendImportHistory({
            dataset,
            file_name: file_name || null,
            count: payload.length,
            imported_at: new Date().toISOString(),
            imported_by: 'admin',
          });

          return Response.json({ success: true, count: payload.length });
        }

        return Response.json({ error: 'Unsupported dataset' }, { status: 400 });
      }

      case 'create_promotion': {
        const { name, description, start_date, end_date, free_shipping_threshold, note, items } = body;

        const { data: promo, error: promoError } = await supabase
          .from('quickbuy_promotions')
          .insert({ name, description, start_date, end_date, free_shipping_threshold, note })
          .select()
          .single();

        if (promoError) return Response.json({ error: promoError.message }, { status: 500 });

        if (items?.length > 0) {
          const promoItems = items.map(item => ({
            promotion_id: promo.id,
            item_number: item.item_number,
            promo_price: item.promo_price,
            promo_note: item.promo_note || null,
          }));

          const { error: itemError } = await supabase
            .from('quickbuy_promotion_items')
            .insert(promoItems);

          if (itemError) return Response.json({ error: itemError.message }, { status: 500 });
        }

        return Response.json({ success: true, promotion: promo });
      }

      case 'toggle_promotion': {
        const { id, is_active } = body;
        const { error } = await supabase
          .from('quickbuy_promotions')
          .update({ is_active })
          .eq('id', id);

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true });
      }

      case 'update_pricing': {
        const { rules } = body;
        const { error } = await supabase
          .from('quickbuy_config')
          .upsert({ key: 'pricing_rules', value: rules }, { onConflict: 'key' });

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true });
      }

      case 'update_ai_prompt': {
        const { prompt } = body;
        const { error } = await supabase.from('quickbuy_config').upsert(
          {
            config_key: 'ai_system_prompt',
            config_value: prompt,
          },
          { onConflict: 'config_key' }
        );

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true });
      }

      case 'link_line_customer': {
        const { line_user_id, display_name, erp_customer_id } = body;

        if (!line_user_id || !erp_customer_id) {
          return Response.json({ error: 'line_user_id and erp_customer_id are required' }, { status: 400 });
        }

        const { error: clearError } = await supabase
          .from('erp_customers')
          .update({ line_user_id: null })
          .eq('line_user_id', line_user_id)
          .neq('id', erp_customer_id);

        if (clearError) return Response.json({ error: clearError.message }, { status: 500 });

        const { error } = await supabase
          .from('erp_customers')
          .update({
            line_user_id,
            display_name,
            source: 'line',
          })
          .eq('id', erp_customer_id);

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true });
      }

      case 'update_customer_stage': {
        const { erp_customer_id, customer_stage } = body;

        if (!erp_customer_id || !customer_stage) {
          return Response.json({ error: 'erp_customer_id and customer_stage are required' }, { status: 400 });
        }

        if (!['lead', 'prospect', 'customer', 'vip'].includes(customer_stage)) {
          return Response.json({ error: 'Invalid customer_stage' }, { status: 400 });
        }

        const { error } = await supabase
          .from('erp_customers')
          .update({ customer_stage })
          .eq('id', erp_customer_id);

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true });
      }

      case 'update_customer_profile': {
        const { erp_customer_id, profile } = body;

        if (!erp_customer_id || !profile) {
          return Response.json({ error: 'erp_customer_id and profile are required' }, { status: 400 });
        }

        const payload = {
          name: profile.name || null,
          company_name: profile.company_name || null,
          phone: profile.phone || null,
          email: profile.email || null,
          tax_id: profile.tax_id || null,
          address: profile.address || null,
          notes: profile.notes || null,
        };

        const { error } = await supabase
          .from('erp_customers')
          .update(payload)
          .eq('id', erp_customer_id);

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Admin POST error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
