// lib/admin/actions-get.js — 所有 GET action handlers
import { supabase } from '@/lib/supabase';
import {
  formatMonthLabel, formatDayLabel,
  isMissingRelationError, missingRelationResponse,
  cleanCsvValue, toNumber,
} from './utils';
import { getQuickbuyConfigEntry, getImportHistory } from './config';
import { runErpCustomerQuery, getErpCustomerColumnState } from './erp-customers';
import { choosePreferredErpCustomer } from './utils';

export async function handleGetAction(action, searchParams) {
  switch (action) {
      case 'env_health': {
        const groups = {
          master: {
            label: '主檔資料',
            tables: [
              { name: 'erp_customers', label: '客戶主檔' },
              { name: 'quickbuy_products', label: '商品主檔' },
              { name: 'erp_vendors', label: '廠商主檔' },
            ],
          },
          transaction: {
            label: '交易作業',
            tables: [
              { name: 'erp_quotes', label: '報價單' },
              { name: 'erp_quote_items', label: '報價明細' },
              { name: 'erp_orders', label: '訂單' },
              { name: 'erp_order_items', label: '訂單明細' },
              { name: 'qb_sales_history', label: '銷貨單' },
              { name: 'qb_order_items', label: '銷貨明細' },
              { name: 'qb_invoices', label: '發票資料' },
            ],
          },
          reports: {
            label: '分析報表',
            tables: [
              { name: 'erp_sales_return_summary', label: '銷退貨彙總' },
              { name: 'erp_profit_analysis', label: '利潤分析' },
            ],
          },
          system: {
            label: 'LINE 與系統',
            tables: [
              { name: 'quickbuy_line_customers', label: 'LINE 客戶' },
              { name: 'quickbuy_line_messages', label: 'LINE 訊息' },
              { name: 'quickbuy_config', label: '系統設定' },
            ],
          },
        };

        const result = {};
        let readyCount = 0;
        let totalCount = 0;

        for (const [key, group] of Object.entries(groups)) {
          const checks = await Promise.all(
            group.tables.map(async (table) => {
              const { error, count } = await supabase.from(table.name).select('*', { count: 'exact', head: true }).limit(1);
              const ready = !error;
              if (ready) readyCount += 1;
              totalCount += 1;
              return {
                ...table,
                ready,
                count: ready ? (count || 0) : 0,
                error: ready ? null : (isMissingRelationError(error) ? '資料表未建立' : (error?.message || '無法讀取')),
              };
            })
          );

          result[key] = {
            label: group.label,
            ready: checks.every((item) => item.ready),
            items: checks,
          };
        }

        return Response.json({
          groups: result,
          summary: {
            ready_count: readyCount,
            total_count: totalCount,
          },
        });
      }

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

      case 'formal_customer_detail': {
        const erpCustomerId = (searchParams.get('erp_customer_id') || '').trim();
        if (!erpCustomerId) {
          return Response.json({ error: 'erp_customer_id is required' }, { status: 400 });
        }

        let customerStageReady = true;
        const { data: customer, error: customerError, stageReady } = await runErpCustomerQuery((columns) =>
          supabase
            .from('erp_customers')
            .select(columns)
            .eq('id', erpCustomerId)
            .maybeSingle()
        );

        customerStageReady = stageReady;
        if (customerError) return Response.json({ error: customerError.message }, { status: 500 });
        if (!customer) return Response.json({ error: 'Customer not found' }, { status: 404 });

        let quoteRows = [];
        let orderRows = [];
        let salesRows = [];
        let lineProfile = null;
        let lineMessageCount = 0;

        try {
          const [{ data: quotes }, { data: orders }] = await Promise.all([
            supabase
              .from('erp_quotes')
              .select('id,quote_no,quote_date,status,total_amount,valid_until,remark')
              .eq('customer_id', customer.id)
              .order('quote_date', { ascending: false, nullsFirst: false })
              .limit(5),
            supabase
              .from('erp_orders')
              .select('id,order_no,order_date,status,payment_status,shipping_status,total_amount,remark')
              .eq('customer_id', customer.id)
              .order('order_date', { ascending: false, nullsFirst: false })
              .limit(5),
          ]);
          quoteRows = quotes || [];
          orderRows = orders || [];
        } catch {
          quoteRows = [];
          orderRows = [];
        }

        try {
          const candidateNames = [...new Set([
            cleanCsvValue(customer.company_name),
            cleanCsvValue(customer.name),
            cleanCsvValue(customer.display_name),
          ].filter(Boolean))];

          if (candidateNames.length) {
            let salesQuery = supabase
              .from('qb_sales_history')
              .select('id,slip_number,sale_date,invoice_number,customer_name,sales_person,subtotal,tax,total,cost,gross_profit,profit_margin');

            salesQuery = salesQuery.or(candidateNames.map((name) => `customer_name.eq.${String(name).replace(/,/g, '\\,')}`).join(','));
            const { data: sales } = await salesQuery
              .order('sale_date', { ascending: false, nullsFirst: false })
              .limit(10);

            salesRows = sales || [];
          }
        } catch {
          salesRows = [];
        }

        if (customer.line_user_id) {
          try {
            const [{ data: lineCustomer }, lineMessages] = await Promise.all([
              supabase
                .from('quickbuy_line_customers')
                .select('*')
                .eq('line_user_id', customer.line_user_id)
                .maybeSingle(),
              supabase
                .from('quickbuy_line_messages')
                .select('*', { count: 'exact', head: true })
                .eq('line_user_id', customer.line_user_id),
            ]);
            lineProfile = lineCustomer || null;
            lineMessageCount = lineMessages.count || 0;
          } catch {
            lineProfile = null;
            lineMessageCount = 0;
          }
        }

        const summary = {
          quote_count: quoteRows.length,
          quote_total: quoteRows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
          order_count: orderRows.length,
          order_total: orderRows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
          sale_count: salesRows.length,
          sales_total: salesRows.reduce((sum, row) => sum + Number(row.total || 0), 0),
          gross_profit_total: salesRows.reduce((sum, row) => sum + Number(row.gross_profit || 0), 0),
          line_message_count: lineMessageCount,
        };

        return Response.json({
          customer,
          summary,
          recent_quotes: quoteRows,
          recent_orders: orderRows,
          recent_sales: salesRows.slice(0, 5),
          line_profile: lineProfile,
          customer_stage_ready: customerStageReady,
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
            .order('created_at', { ascending: false, nullsFirst: false })
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
        const status = searchParams.get('status') || 'all';
        const page = parseInt(searchParams.get('page') || '0', 10);
        const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 50);
        const offset = page * limit;

        let query = supabase
          .from('quickbuy_products')
          .select(
            'item_number,description,us_price,tw_retail_price,tw_reseller_price,product_status,category,replacement_model,weight_kg,origin_country',
            { count: 'exact' }
          )
          .order('item_number', { ascending: true })
          .range(offset, offset + limit - 1);

        if (category && category !== 'all') {
          query = query.eq('category', category);
        }

        if (status && status !== 'all') {
          query = query.eq('product_status', status);
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

        const [allProducts, currentProducts, replacementProducts, categoryRows] = await Promise.all([
          supabase.from('quickbuy_products').select('*', { count: 'exact', head: true }),
          supabase.from('quickbuy_products').select('*', { count: 'exact', head: true }).eq('product_status', 'Current'),
          supabase.from('quickbuy_products').select('*', { count: 'exact', head: true }).not('replacement_model', 'is', null),
          supabase.from('quickbuy_products').select('category').limit(5000),
        ]);

        const categoryCount = new Set((categoryRows.data || []).map((row) => row.category).filter(Boolean)).size;

        return Response.json({
          products: data || [],
          total: count || 0,
          page,
          limit,
          summary: {
            total_products: allProducts.count || 0,
            current_products: currentProducts.count || 0,
            replacement_products: replacementProducts.count || 0,
            category_count: categoryCount,
          },
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
        const prompt = await getQuickbuyConfigEntry('ai_system_prompt');
        return Response.json({ prompt: prompt || '' });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  }
}
