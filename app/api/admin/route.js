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

function parseBatchNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

const ERP_CUSTOMER_DESIRED_COLUMNS = [
  'id',
  'customer_code',
  'name',
  'company_name',
  'phone',
  'email',
  'tax_id',
  'address',
  'line_user_id',
  'source',
  'status',
  'display_name',
  'customer_stage',
  'notes',
];

let cachedErpCustomerColumnState = null;

async function getErpCustomerColumnState() {
  if (cachedErpCustomerColumnState) return cachedErpCustomerColumnState;

  const { data, error } = await supabase
    .schema('information_schema')
    .from('columns')
    .select('column_name')
    .eq('table_schema', 'public')
    .eq('table_name', 'erp_customers');

  if (error) throw error;

  const available = new Set((data || []).map((row) => row.column_name));
  const columns = ERP_CUSTOMER_DESIRED_COLUMNS.filter((column) => available.has(column));

  cachedErpCustomerColumnState = {
    columns: columns.length ? columns.join(',') : 'id',
    stageReady: available.has('customer_stage'),
    lineReady: available.has('line_user_id'),
    displayReady: available.has('display_name'),
    available,
  };

  return cachedErpCustomerColumnState;
}

async function runErpCustomerQuery(buildQuery) {
  const columnState = await getErpCustomerColumnState();
  const result = await buildQuery(columnState.columns);
  return {
    ...result,
    stageReady: columnState.stageReady,
    lineReady: columnState.lineReady,
    displayReady: columnState.displayReady,
  };
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

      case 'report_center': {
        const [
          customerCount,
          vendorCount,
          quoteCount,
          orderCount,
          salesDocCount,
          returnRows,
          profitCount,
          salesRows,
        ] = await Promise.all([
          supabase.from('erp_customers').select('*', { count: 'exact', head: true }),
          supabase.from('erp_vendors').select('*', { count: 'exact', head: true }),
          supabase.from('erp_quotes').select('*', { count: 'exact', head: true }),
          supabase.from('erp_orders').select('*', { count: 'exact', head: true }),
          supabase.from('qb_sales_history').select('*', { count: 'exact', head: true }),
          supabase.from('erp_sales_return_summary').select('customer_name,total_amount,doc_type').limit(5000),
          supabase.from('erp_profit_analysis').select('*', { count: 'exact', head: true }),
          supabase.from('qb_sales_history').select('customer_name,sales_person,total,gross_profit').limit(5000),
        ]);

        const customerSalesMap = {};
        const salesPersonMap = {};

        (salesRows.data || []).forEach((row) => {
          const customerKey = row.customer_name || '未命名客戶';
          const salesKey = row.sales_person || '未指派業務';

          customerSalesMap[customerKey] = {
            name: customerKey,
            total: (customerSalesMap[customerKey]?.total || 0) + Number(row.total || 0),
            gross_profit: (customerSalesMap[customerKey]?.gross_profit || 0) + Number(row.gross_profit || 0),
          };

          salesPersonMap[salesKey] = {
            name: salesKey,
            total: (salesPersonMap[salesKey]?.total || 0) + Number(row.total || 0),
            gross_profit: (salesPersonMap[salesKey]?.gross_profit || 0) + Number(row.gross_profit || 0),
          };
        });

        const topCustomers = Object.values(customerSalesMap)
          .sort((a, b) => b.total - a.total)
          .slice(0, 10);

        const topSalesPeople = Object.values(salesPersonMap)
          .sort((a, b) => b.total - a.total)
          .slice(0, 10);

        const returns = (returnRows.data || []).reduce((acc, row) => {
          if (String(row.doc_type || '').toLowerCase() === 'return') {
            acc.returnCount += 1;
            acc.returnAmount += Number(row.total_amount || 0);
          } else {
            acc.saleCount += 1;
            acc.saleAmount += Number(row.total_amount || 0);
          }
          return acc;
        }, { saleCount: 0, saleAmount: 0, returnCount: 0, returnAmount: 0 });

        return Response.json({
          counts: {
            customers: customerCount.count || 0,
            vendors: vendorCount.count || 0,
            quotes: quoteCount.count || 0,
            orders: orderCount.count || 0,
            sales_documents: salesDocCount.count || 0,
            sales_returns: (returnRows.data || []).length,
            profit_rows: profitCount.count || 0,
          },
          rankings: {
            top_customers: topCustomers,
            top_sales_people: topSalesPeople,
          },
          returns,
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

      case 'quotes': {
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
        const offset = (page - 1) * limit;
        const search = (searchParams.get('search') || '').trim();

        try {
          let query = supabase
            .from('erp_quotes')
            .select('*', { count: 'exact' })
            .order('quote_date', { ascending: false, nullsFirst: false })
            .range(offset, offset + limit - 1);

          if (search) {
            query = query.or(`quote_no.ilike.%${search}%,status.ilike.%${search}%,remark.ilike.%${search}%`);
          }

          const { data, count, error } = await query;
          if (error) return Response.json({ error: error.message }, { status: 500 });

          const customerIds = [...new Set((data || []).map((row) => row.customer_id).filter(Boolean))];
          let customerMap = {};
          if (customerIds.length) {
            const { data: customerRows } = await runErpCustomerQuery((columns) =>
              supabase.from('erp_customers').select(columns).in('id', customerIds)
            );
            customerMap = Object.fromEntries((customerRows || []).map((row) => [row.id, row]));
          }

          const rows = (data || []).map((row) => ({
            ...row,
            customer: customerMap[row.customer_id] || null,
          }));

          const summary = rows.reduce((acc, row) => {
            acc.total_amount += Number(row.total_amount || 0);
            acc.open_count += row.status && !['approved', 'converted', 'closed'].includes(String(row.status).toLowerCase()) ? 1 : 0;
            return acc;
          }, { total_amount: 0, open_count: 0 });

          return Response.json({ rows, total: count || 0, page, limit, summary, table_ready: true });
        } catch {
          return Response.json({ rows: [], total: 0, page, limit, summary: { total_amount: 0, open_count: 0 }, table_ready: false });
        }
      }

      case 'orders': {
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
        const offset = (page - 1) * limit;
        const search = (searchParams.get('search') || '').trim();

        try {
          let query = supabase
            .from('erp_orders')
            .select('*', { count: 'exact' })
            .order('order_date', { ascending: false, nullsFirst: false })
            .range(offset, offset + limit - 1);

          if (search) {
            query = query.or(`order_no.ilike.%${search}%,status.ilike.%${search}%,payment_status.ilike.%${search}%,shipping_status.ilike.%${search}%,remark.ilike.%${search}%`);
          }

          const { data, count, error } = await query;
          if (error) return Response.json({ error: error.message }, { status: 500 });

          const customerIds = [...new Set((data || []).map((row) => row.customer_id).filter(Boolean))];
          let customerMap = {};
          if (customerIds.length) {
            const { data: customerRows } = await runErpCustomerQuery((columns) =>
              supabase.from('erp_customers').select(columns).in('id', customerIds)
            );
            customerMap = Object.fromEntries((customerRows || []).map((row) => [row.id, row]));
          }

          const rows = (data || []).map((row) => ({
            ...row,
            customer: customerMap[row.customer_id] || null,
          }));

          const summary = rows.reduce((acc, row) => {
            acc.total_amount += Number(row.total_amount || 0);
            acc.pending_count += String(row.status || '').toLowerCase() !== 'completed' ? 1 : 0;
            return acc;
          }, { total_amount: 0, pending_count: 0 });

          return Response.json({ rows, total: count || 0, page, limit, summary, table_ready: true });
        } catch {
          return Response.json({ rows: [], total: 0, page, limit, summary: { total_amount: 0, pending_count: 0 }, table_ready: false });
        }
      }

      case 'sales_documents': {
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
        const offset = (page - 1) * limit;
        const search = (searchParams.get('search') || '').trim();

        try {
          let query = supabase
            .from('qb_sales_history')
            .select('*', { count: 'exact' })
            .order('sale_date', { ascending: false, nullsFirst: false })
            .range(offset, offset + limit - 1);

          if (search) {
            query = query.or(`slip_number.ilike.%${search}%,customer_name.ilike.%${search}%,sales_person.ilike.%${search}%,invoice_number.ilike.%${search}%`);
          }

          const { data, count, error } = await query;
          if (error) return Response.json({ error: error.message }, { status: 500 });

          const summary = (data || []).reduce((acc, row) => {
            acc.total += Number(row.total || 0);
            acc.gross_profit += Number(row.gross_profit || 0);
            return acc;
          }, { total: 0, gross_profit: 0 });

          return Response.json({ rows: data || [], total: count || 0, page, limit, summary, table_ready: true });
        } catch {
          return Response.json({ rows: [], total: 0, page, limit, summary: { total: 0, gross_profit: 0 }, table_ready: false });
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

      case 'sale_detail': {
        const slipNumber = (searchParams.get('slip_number') || '').trim();
        if (!slipNumber) {
          return Response.json({ error: 'slip_number is required' }, { status: 400 });
        }

        try {
          const { data: sale, error: saleError } = await supabase
            .from('qb_sales_history')
            .select('*')
            .eq('slip_number', slipNumber)
            .maybeSingle();

          if (saleError) return Response.json({ error: saleError.message }, { status: 500 });
          if (!sale) return Response.json({ error: 'Sale not found' }, { status: 404 });

          let invoice = null;
          let items = [];

          if (sale.invoice_number) {
            const { data: invoiceRow } = await supabase
              .from('qb_invoices')
              .select('*')
              .eq('invoice_number', sale.invoice_number)
              .maybeSingle();

            invoice = invoiceRow || null;

            if (invoiceRow?.order_id) {
              const { data: itemRows } = await supabase
                .from('qb_order_items')
                .select('*')
                .eq('order_id', invoiceRow.order_id)
                .order('id', { ascending: true });

              items = itemRows || [];
            }
          }

          return Response.json({
            sale,
            invoice,
            items,
            has_items: items.length > 0,
          });
        } catch (error) {
          return Response.json({ error: error.message }, { status: 500 });
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
        const batchIndex = Math.max(0, parseBatchNumber(body.batch_index, 0));
        const batchTotal = Math.max(1, parseBatchNumber(body.batch_total, 1));
        const totalCount = Math.max(safeRows.length, parseBatchNumber(body.total_count, safeRows.length));
        const isFirstBatch = batchIndex === 0;
        const isLastBatch = batchIndex >= batchTotal - 1;

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

          if (isFirstBatch) {
            const { error: deleteError } = await supabase.from('quickbuy_products').delete().neq('item_number', '');
            if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });
          }

          const { error } = payload.length ? await supabase.from('quickbuy_products').insert(payload) : { error: null };
          if (error) return Response.json({ error: error.message }, { status: 500 });

          if (isLastBatch) {
            await appendImportHistory({
              dataset,
              file_name: file_name || null,
              count: totalCount,
              imported_at: new Date().toISOString(),
              imported_by: 'admin',
            });
          }

          return Response.json({ success: true, count: payload.length, batch_index: batchIndex, batch_total: batchTotal });
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

          if (isLastBatch) {
            await appendImportHistory({
              dataset,
              file_name: file_name || null,
              count: totalCount,
              imported_at: new Date().toISOString(),
              imported_by: 'admin',
            });
          }

          return Response.json({ success: true, count: safeRows.length, inserted, updated, batch_index: batchIndex, batch_total: batchTotal });
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

          if (isFirstBatch) {
            const { error: deleteError } = await supabase.from('erp_vendors').delete().neq('vendor_name', '');
            if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });
          }

          const { error } = payload.length ? await supabase.from('erp_vendors').insert(payload) : { error: null };
          if (error) return Response.json({ error: error.message }, { status: 500 });

          if (isLastBatch) {
            await appendImportHistory({
              dataset,
              file_name: file_name || null,
              count: totalCount,
              imported_at: new Date().toISOString(),
              imported_by: 'admin',
            });
          }

          return Response.json({ success: true, count: payload.length, batch_index: batchIndex, batch_total: batchTotal });
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

          if (isFirstBatch) {
            const { error: deleteError } = await supabase.from('erp_sales_return_summary').delete().neq('doc_no', '');
            if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });
          }

          const { error } = payload.length ? await supabase.from('erp_sales_return_summary').insert(payload) : { error: null };
          if (error) return Response.json({ error: error.message }, { status: 500 });

          if (isLastBatch) {
            await appendImportHistory({
              dataset,
              file_name: file_name || null,
              count: totalCount,
              imported_at: new Date().toISOString(),
              imported_by: 'admin',
            });
          }

          return Response.json({ success: true, count: payload.length, batch_index: batchIndex, batch_total: batchTotal });
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

          if (isFirstBatch) {
            const { error: deleteError } = await supabase.from('erp_profit_analysis').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });
          }

          const { error } = payload.length ? await supabase.from('erp_profit_analysis').insert(payload) : { error: null };
          if (error) return Response.json({ error: error.message }, { status: 500 });

          if (isLastBatch) {
            await appendImportHistory({
              dataset,
              file_name: file_name || null,
              count: totalCount,
              imported_at: new Date().toISOString(),
              imported_by: 'admin',
            });
          }

          return Response.json({ success: true, count: payload.length, batch_index: batchIndex, batch_total: batchTotal });
        }

        if (dataset === 'erp_quotes') {
          const customerCodes = [...new Set(safeRows.map((row) => cleanCsvValue(row.customer_code)).filter(Boolean))];
          let customerMap = {};
          if (customerCodes.length) {
            const { data: customerRows, error: customerError } = await supabase
              .from('erp_customers')
              .select('id,customer_code')
              .in('customer_code', customerCodes);
            if (customerError) return Response.json({ error: customerError.message }, { status: 500 });
            customerMap = Object.fromEntries((customerRows || []).map((row) => [row.customer_code, row.id]));
          }

          const payload = safeRows.map((row) => ({
            quote_no: cleanCsvValue(row.quote_no),
            customer_id: customerMap[cleanCsvValue(row.customer_code)] || null,
            quote_date: toDateValue(row.quote_date),
            valid_until: toDateValue(row.valid_until),
            status: cleanCsvValue(row.status) || 'draft',
            subtotal: toNumber(row.subtotal),
            discount_amount: toNumber(row.discount_amount),
            shipping_fee: toNumber(row.shipping_fee),
            tax_amount: toNumber(row.tax_amount),
            total_amount: toNumber(row.total_amount),
            remark: cleanCsvValue(row.remark),
            created_by: 'import',
          })).filter((row) => row.quote_no);

          if (isFirstBatch) {
            const { error: deleteError } = await supabase.from('erp_quotes').delete().neq('quote_no', '');
            if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });
          }

          const { error } = payload.length ? await supabase.from('erp_quotes').insert(payload) : { error: null };
          if (error) return Response.json({ error: error.message }, { status: 500 });

          if (isLastBatch) {
            await appendImportHistory({ dataset, file_name: file_name || null, count: totalCount, imported_at: new Date().toISOString(), imported_by: 'admin' });
          }
          return Response.json({ success: true, count: payload.length, batch_index: batchIndex, batch_total: batchTotal });
        }

        if (dataset === 'erp_orders') {
          const customerCodes = [...new Set(safeRows.map((row) => cleanCsvValue(row.customer_code)).filter(Boolean))];
          let customerMap = {};
          if (customerCodes.length) {
            const { data: customerRows, error: customerError } = await supabase
              .from('erp_customers')
              .select('id,customer_code')
              .in('customer_code', customerCodes);
            if (customerError) return Response.json({ error: customerError.message }, { status: 500 });
            customerMap = Object.fromEntries((customerRows || []).map((row) => [row.customer_code, row.id]));
          }

          const payload = safeRows.map((row) => ({
            order_no: cleanCsvValue(row.order_no),
            customer_id: customerMap[cleanCsvValue(row.customer_code)] || null,
            order_date: toDateValue(row.order_date),
            status: cleanCsvValue(row.status) || 'confirmed',
            payment_status: cleanCsvValue(row.payment_status) || 'unpaid',
            shipping_status: cleanCsvValue(row.shipping_status) || 'pending',
            subtotal: toNumber(row.subtotal),
            discount_amount: toNumber(row.discount_amount),
            shipping_fee: toNumber(row.shipping_fee),
            tax_amount: toNumber(row.tax_amount),
            total_amount: toNumber(row.total_amount),
            remark: cleanCsvValue(row.remark),
          })).filter((row) => row.order_no);

          if (isFirstBatch) {
            const { error: deleteError } = await supabase.from('erp_orders').delete().neq('order_no', '');
            if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });
          }

          const { error } = payload.length ? await supabase.from('erp_orders').insert(payload) : { error: null };
          if (error) return Response.json({ error: error.message }, { status: 500 });

          if (isLastBatch) {
            await appendImportHistory({ dataset, file_name: file_name || null, count: totalCount, imported_at: new Date().toISOString(), imported_by: 'admin' });
          }
          return Response.json({ success: true, count: payload.length, batch_index: batchIndex, batch_total: batchTotal });
        }

        if (dataset === 'qb_sales_history') {
          const payload = safeRows.map((row) => ({
            sale_date: toDateValue(row.sale_date),
            slip_number: cleanCsvValue(row.slip_number),
            invoice_number: cleanCsvValue(row.invoice_number),
            customer_name: cleanCsvValue(row.customer_name),
            sales_person: cleanCsvValue(row.sales_person),
            subtotal: toNumber(row.subtotal),
            tax: toNumber(row.tax),
            total: toNumber(row.total),
            cost: toNumber(row.cost),
            gross_profit: toNumber(row.gross_profit),
            profit_margin: cleanCsvValue(row.profit_margin),
          })).filter((row) => row.slip_number);

          if (isFirstBatch) {
            const { error: deleteError } = await supabase.from('qb_sales_history').delete().neq('slip_number', '');
            if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });
          }

          const { error } = payload.length ? await supabase.from('qb_sales_history').insert(payload) : { error: null };
          if (error) return Response.json({ error: error.message }, { status: 500 });

          if (isLastBatch) {
            await appendImportHistory({ dataset, file_name: file_name || null, count: totalCount, imported_at: new Date().toISOString(), imported_by: 'admin' });
          }
          return Response.json({ success: true, count: payload.length, batch_index: batchIndex, batch_total: batchTotal });
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

      case 'create_quote': {
        const {
          customer_id,
          quote_date,
          valid_until,
          status,
          remark,
          discount_amount,
          shipping_fee,
          items,
        } = body;

        const safeItems = normalizeRows(items)
          .map((item) => {
            const qty = Math.max(1, Number(item.qty || 1));
            const unitPrice = toNumber(item.unit_price);
            const lineTotal = qty * unitPrice;
            return {
              product_id: cleanCsvValue(item.product_id),
              item_number_snapshot: cleanCsvValue(item.item_number_snapshot || item.item_number),
              description_snapshot: cleanCsvValue(item.description_snapshot || item.description),
              qty,
              unit_price: unitPrice,
              discount_rate: toNumber(item.discount_rate),
              line_total: lineTotal,
              cost_price_snapshot: item.cost_price_snapshot !== undefined && item.cost_price_snapshot !== null && item.cost_price_snapshot !== ''
                ? toNumber(item.cost_price_snapshot)
                : null,
            };
          })
          .filter((item) => item.item_number_snapshot || item.description_snapshot);

        if (!customer_id || !quote_date || !valid_until || safeItems.length === 0) {
          return Response.json({ error: 'customer_id, quote_date, valid_until and items are required' }, { status: 400 });
        }

        const subtotal = safeItems.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
        const safeDiscount = toNumber(discount_amount);
        const safeShipping = toNumber(shipping_fee);
        const taxableBase = Math.max(0, subtotal - safeDiscount + safeShipping);
        const taxAmount = Math.round(taxableBase * 0.05);
        const totalAmount = taxableBase + taxAmount;
        const quoteNo = `QT${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;

        const { data: quote, error: quoteError } = await supabase
          .from('erp_quotes')
          .insert({
            quote_no: quoteNo,
            customer_id,
            quote_date,
            valid_until,
            status: cleanCsvValue(status) || 'draft',
            subtotal,
            discount_amount: safeDiscount,
            shipping_fee: safeShipping,
            tax_amount: taxAmount,
            total_amount: totalAmount,
            remark: cleanCsvValue(remark),
            created_by: 'admin',
          })
          .select('*')
          .single();

        if (quoteError) return Response.json({ error: quoteError.message }, { status: 500 });

        const itemPayload = safeItems.map((item) => ({
          quote_id: quote.id,
          ...item,
        }));

        const { error: itemError } = await supabase
          .from('erp_quote_items')
          .insert(itemPayload);

        if (itemError) {
          await supabase.from('erp_quotes').delete().eq('id', quote.id);
          return Response.json({ error: itemError.message }, { status: 500 });
        }

        return Response.json({
          success: true,
          quote,
          count: itemPayload.length,
        });
      }

      case 'convert_quote_to_order': {
        const { quote_id } = body;

        if (!quote_id) {
          return Response.json({ error: 'quote_id is required' }, { status: 400 });
        }

        const { data: quote, error: quoteError } = await supabase
          .from('erp_quotes')
          .select('*')
          .eq('id', quote_id)
          .maybeSingle();

        if (quoteError) return Response.json({ error: quoteError.message }, { status: 500 });
        if (!quote) return Response.json({ error: 'Quote not found' }, { status: 404 });

        const { data: quoteItems, error: itemFetchError } = await supabase
          .from('erp_quote_items')
          .select('*')
          .eq('quote_id', quote_id)
          .order('id', { ascending: true });

        if (itemFetchError) return Response.json({ error: itemFetchError.message }, { status: 500 });
        if (!quoteItems?.length) return Response.json({ error: 'Quote items are missing' }, { status: 400 });

        const orderNo = `SO${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;

        const { data: order, error: orderError } = await supabase
          .from('erp_orders')
          .insert({
            order_no: orderNo,
            customer_id: quote.customer_id,
            quote_id: quote.id,
            order_date: toDateValue(quote.quote_date) || new Date().toISOString().slice(0, 10),
            status: 'confirmed',
            payment_status: 'unpaid',
            shipping_status: 'pending',
            subtotal: toNumber(quote.subtotal),
            discount_amount: toNumber(quote.discount_amount),
            shipping_fee: toNumber(quote.shipping_fee),
            tax_amount: toNumber(quote.tax_amount),
            total_amount: toNumber(quote.total_amount),
            remark: cleanCsvValue(quote.remark),
          })
          .select('*')
          .single();

        if (orderError) return Response.json({ error: orderError.message }, { status: 500 });

        const orderItems = quoteItems.map((item) => ({
          order_id: order.id,
          product_id: item.product_id || null,
          item_number_snapshot: item.item_number_snapshot,
          description_snapshot: item.description_snapshot,
          qty: item.qty,
          unit_price: item.unit_price,
          line_total: item.line_total,
          cost_price_snapshot: item.cost_price_snapshot,
        }));

        const { error: orderItemsError } = await supabase
          .from('erp_order_items')
          .insert(orderItems);

        if (orderItemsError) {
          await supabase.from('erp_orders').delete().eq('id', order.id);
          return Response.json({ error: orderItemsError.message }, { status: 500 });
        }

        await supabase
          .from('erp_quotes')
          .update({ status: 'converted' })
          .eq('id', quote.id);

        return Response.json({
          success: true,
          order,
          count: orderItems.length,
        });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Admin POST error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
