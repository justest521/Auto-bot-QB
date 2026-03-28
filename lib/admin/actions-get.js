// lib/admin/actions-get.js — 所有 GET action handlers
import { supabase } from '@/lib/supabase';
import {
  formatMonthLabel, formatDayLabel,
  isMissingRelationError, missingRelationResponse,
  cleanCsvValue, toNumber,
  normalizeCustomerText, choosePreferredErpCustomer,
} from './utils';
import { getQuickbuyConfigEntry, getImportHistory } from './config';
import { runErpCustomerQuery, getErpCustomerColumnState } from './erp-customers';

export async function handleGetAction(action, searchParams) {
  // Export mode: when export=true, allow up to 50000 rows
  const isExport = searchParams.get('export') === 'true';
  const parseLimit = (defaultVal, maxVal) => {
    const raw = parseInt(searchParams.get('limit') || String(defaultVal), 10);
    return isExport ? Math.min(raw, 50000) : Math.min(raw, maxVal);
  };

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
          purchase: {
            label: '採購進貨',
            tables: [
              { name: 'erp_purchase_orders', label: '採購單' },
              { name: 'erp_purchase_order_items', label: '採購明細' },
              { name: 'erp_stock_ins', label: '進貨單' },
              { name: 'erp_stock_in_items', label: '進貨明細' },
              { name: 'erp_purchase_returns', label: '進貨退出' },
              { name: 'erp_vendor_payments', label: '付款單' },
            ],
          },
          transaction: {
            label: '銷售出貨',
            tables: [
              { name: 'erp_inquiries', label: '詢價單' },
              { name: 'erp_quotes', label: '報價單' },
              { name: 'erp_quote_items', label: '報價明細' },
              { name: 'erp_orders', label: '訂單' },
              { name: 'erp_order_items', label: '訂單明細' },
              { name: 'erp_shipments', label: '出貨單' },
              { name: 'erp_returns', label: '退貨單' },
              { name: 'qb_sales_history', label: '銷貨單' },
              { name: 'qb_order_items', label: '銷貨明細' },
              { name: 'qb_invoices', label: '發票資料' },
            ],
          },
          warehouse: {
            label: '倉儲管理',
            tables: [
              { name: 'qb_inventory_movements', label: '庫存異動' },
              { name: 'qb_payments', label: '收款記錄' },
              { name: 'erp_stocktakes', label: '盤點作業' },
              { name: 'erp_stocktake_items', label: '盤點明細' },
              { name: 'erp_stock_adjustments', label: '調整單' },
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
        const limit = parseLimit(20, 100);
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
        const limit = parseLimit(50, 200);
        const offset = (page - 1) * limit;
        const search = (searchParams.get('search') || '').trim();
        const salesPersonFilter = (searchParams.get('sales_person') || '').trim();

        try {
          let customerStageReady = true;
          let queryBuilder = (columns) => {
            let query = supabase
              .from('erp_customers')
              .select(columns, { count: 'exact' })
              .order('customer_code', { ascending: true, nullsFirst: false })
              .range(offset, offset + limit - 1);

            if (search) {
              query = query.or(`customer_code.ilike.%${search}%,name.ilike.%${search}%,company_name.ilike.%${search}%,phone.ilike.%${search}%,tax_id.ilike.%${search}%`);
            }

            if (salesPersonFilter) {
              query = query.eq('sales_person', salesPersonFilter);
            }

            return query;
          };

          const { data, count, error, stageReady } = await runErpCustomerQuery(queryBuilder);
          if (error) return Response.json({ error: error.message }, { status: 500 });
          customerStageReady = stageReady;
          const importHistory = await getImportHistory();
          const latestCustomerImport = importHistory.find((entry) => entry.dataset === 'erp_customers') || null;

          // Year-over-year customer stats (based on sales activity)
          const thisYear = new Date().getFullYear();
          const lastYear = thisYear - 1;
          const [thisYearRes, lastYearRes] = await Promise.all([
            supabase.from('qb_sales_history').select('customer_name', { count: 'exact', head: false }).gte('sale_date', `${thisYear}-01-01`).lte('sale_date', `${thisYear}-12-31`),
            supabase.from('qb_sales_history').select('customer_name', { count: 'exact', head: false }).gte('sale_date', `${lastYear}-01-01`).lte('sale_date', `${lastYear}-12-31`),
          ]);
          const thisYearCustomers = new Set((thisYearRes.data || []).map(r => r.customer_name)).size;
          const lastYearCustomers = new Set((lastYearRes.data || []).map(r => r.customer_name)).size;
          const growthRate = lastYearCustomers > 0 ? ((thisYearCustomers - lastYearCustomers) / lastYearCustomers * 100).toFixed(1) : null;

          // Get distinct sales persons for filter dropdown
          const { data: spRows } = await supabase
            .from('erp_customers')
            .select('sales_person')
            .not('sales_person', 'is', null)
            .neq('sales_person', '')
            .order('sales_person');
          const salesPersons = [...new Set((spRows || []).map(r => r.sales_person))].sort();

          return Response.json({
            customers: data || [],
            total: count || 0,
            page,
            limit,
            customer_stage_ready: customerStageReady,
            erp_ready: true,
            latest_import: latestCustomerImport,
            sales_persons: salesPersons,
            year_stats: {
              this_year: thisYear,
              last_year: lastYear,
              this_year_customers: thisYearCustomers,
              last_year_customers: lastYearCustomers,
              growth_rate: growthRate,
            },
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

      case 'customer_duplicates': {
        // Full-database duplicate detection by company_name, phone, tax_id
        try {
          const { data: allCustomers } = await supabase.from('erp_customers').select('id, customer_code, name, company_name, phone, tax_id').order('customer_code', { ascending: true });
          const groups = {};
          const addToGroup = (key, id) => {
            if (!key || key.length < 2) return;
            if (!groups[key]) groups[key] = new Set();
            groups[key].add(id);
          };
          (allCustomers || []).forEach(c => {
            // Normalize company name: remove suffixes and whitespace
            const normName = (c.company_name || c.name || '').replace(/\s+/g, '').replace(/(股份)?有限公司|企業社|工作室|商行|行號/g, '').trim();
            addToGroup(`name:${normName}`, c.id);
            // Phone match
            const normPhone = (c.phone || '').replace(/[-\s]/g, '').trim();
            if (normPhone.length >= 8) addToGroup(`phone:${normPhone}`, c.id);
            // Tax ID match
            const taxId = (c.tax_id || '').trim();
            if (taxId.length >= 8) addToGroup(`taxid:${taxId}`, c.id);
          });
          // Build duplicate map: id -> { groups, matchTypes }
          const dupMap = {};
          const colors = ['#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6', '#e11d48'];
          let colorIdx = 0;
          Object.entries(groups).forEach(([key, idSet]) => {
            if (idSet.size < 2) return;
            const ids = [...idSet];
            const matchType = key.split(':')[0]; // name, phone, or taxid
            const color = colors[colorIdx % colors.length];
            colorIdx++;
            ids.forEach(id => {
              if (!dupMap[id]) dupMap[id] = { colors: [], matchTypes: [], groupKeys: [] };
              dupMap[id].colors.push(color);
              dupMap[id].matchTypes.push(matchType);
              dupMap[id].groupKeys.push(key);
            });
          });
          // Simplify: pick first color, combine match types
          const result = {};
          Object.entries(dupMap).forEach(([id, info]) => {
            result[id] = {
              groupColor: info.colors[0],
              matchTypes: [...new Set(info.matchTypes)],
              groupCount: info.groupKeys.length,
            };
          });
          return Response.json({ duplicates: result, total_flagged: Object.keys(result).length });
        } catch (e) {
          return Response.json({ duplicates: {}, total_flagged: 0, error: e.message });
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
              .limit(10),
            supabase
              .from('erp_orders')
              .select('id,order_no,order_date,status,payment_status,shipping_status,total_amount,remark')
              .eq('customer_id', customer.id)
              .order('order_date', { ascending: false, nullsFirst: false })
              .limit(10),
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
          recent_sales: salesRows,
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
        const limit = parseLimit(20, 100);
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
        const limit = parseLimit(20, 100);
        const offset = (page - 1) * limit;
        const search = (searchParams.get('search') || '').trim();
        const dateFrom = (searchParams.get('date_from') || '').trim();
        const dateTo = (searchParams.get('date_to') || '').trim();
        const statusFilter = (searchParams.get('status') || '').trim();

        try {
          let query = supabase
            .from('erp_quotes')
            .select('*', { count: 'exact' })
            .order('quote_date', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false, nullsFirst: false })
            .range(offset, offset + limit - 1);

          if (search) {
            query = query.or(`quote_no.ilike.%${search}%,status.ilike.%${search}%,remark.ilike.%${search}%`);
          }
          if (dateFrom) query = query.gte('quote_date', dateFrom);
          if (dateTo) query = query.lte('quote_date', dateTo);
          if (statusFilter) query = query.eq('status', statusFilter);

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

      case 'order_items_with_stock': {
        const orderId = searchParams.get('order_id');
        if (!orderId) return Response.json({ error: 'order_id required' }, { status: 400 });

        const { data: items, error: itemsErr } = await supabase
          .from('erp_order_items')
          .select('*')
          .eq('order_id', orderId)
          .order('created_at', { ascending: true });
        if (itemsErr) return Response.json({ error: itemsErr.message }, { status: 500 });

        // Batch fetch stock from quickbuy_products
        const itemNumbers = [...new Set((items || []).map(i => i.item_number_snapshot).filter(Boolean))];
        let stockMap = {};
        if (itemNumbers.length > 0) {
          const { data: products } = await supabase
            .from('quickbuy_products')
            .select('item_number, stock_qty, safety_stock, description, tw_retail_price')
            .in('item_number', itemNumbers);
          stockMap = Object.fromEntries((products || []).map(p => [p.item_number, p]));
        }

        const enriched = (items || []).map(item => {
          const product = stockMap[item.item_number_snapshot] || {};
          const stockQty = Number(product.stock_qty || 0);
          const orderQty = Number(item.qty || 0);
          let stockStatus = 'no_stock'; // 無庫存
          if (stockQty >= orderQty) stockStatus = 'sufficient'; // 充足
          else if (stockQty > 0) stockStatus = 'partial'; // 部分有貨

          return {
            ...item,
            stock_qty: stockQty,
            safety_stock: Number(product.safety_stock || 0),
            stock_status: stockStatus,
            shortage: stockStatus === 'sufficient' ? 0 : orderQty - stockQty,
          };
        });

        // Fetch linked sales (from qb_sales_history via source_id)
        const { data: linkedSales } = await supabase
          .from('qb_sales_history')
          .select('id, slip_number, status, total, total_qty, sale_date, created_at')
          .eq('source_id', orderId)
          .order('created_at', { ascending: false });

        // Fetch linked purchase orders
        // First try source_order_ids FK, then fallback to remark ilike
        const { data: orderData } = await supabase.from('erp_orders').select('order_no').eq('id', orderId).maybeSingle();
        let linkedPOs = [];

        // Try source_order_ids first (direct relationship)
        const { data: posBySourceId } = await supabase
          .from('erp_purchase_orders')
          .select('id, po_no, status, total_amount, po_date, created_at')
          .or(`source_order_ids.cs.["${orderId}"]`)
          .order('created_at', { ascending: false });

        if (posBySourceId?.length) {
          linkedPOs = posBySourceId;
        } else if (orderData?.order_no) {
          // Fallback to remark ilike (legacy compatibility)
          const { data: posByRemark } = await supabase
            .from('erp_purchase_orders')
            .select('id, po_no, status, total_amount, po_date, created_at')
            .ilike('remark', `%${orderData.order_no}%`)
            .order('created_at', { ascending: false });
          linkedPOs = posByRemark || [];
        }

        // Merge and deduplicate
        const uniquePOs = Array.from(new Map(linkedPOs.map(p => [p.id, p])).values());

        // Build sale status lookup: slip_number → status
        const saleStatusLookup = Object.fromEntries((linkedSales || []).map(s => [s.slip_number, s.status || 'draft']));
        // Build PO status lookup: po_no → status
        const poStatusLookup = Object.fromEntries(uniquePOs.map(p => [p.po_no, p.status || 'draft']));

        // Enrich items with conversion status using direct sale_ref / po_ref fields
        const finalItems = enriched.map(item => {
          // sale_ref may be comma-separated (multiple partial sales)
          const saleRefs = item.sale_ref ? item.sale_ref.split(',').map(s => s.trim()).filter(Boolean) : [];
          const latestRef = saleRefs.length > 0 ? saleRefs[saleRefs.length - 1] : null;
          const soldQty = Number(item.sold_qty || 0);
          const totalQty = Number(item.qty || 0);
          const remainingQty = totalQty - soldQty;
          return {
            ...item,
            sold_qty: soldQty,
            remaining_qty: remainingQty,
            sale_info: saleRefs.length > 0 ? { slip_number: latestRef, status: saleStatusLookup[latestRef] || 'draft', sale_refs: saleRefs, sold_qty: soldQty, remaining_qty: remainingQty } : null,
            po_info: item.po_ref ? { po_no: item.po_ref, status: poStatusLookup[item.po_ref] || 'draft' } : null,
          };
        });

        // Build timeline for order — 批次查詢，不逐筆
        const timeline = [];
        const { data: order } = await supabase.from('erp_orders').select('*').eq('id', orderId).maybeSingle();
        if (order) {
          timeline.push({ event: '建立訂單', time: order.created_at, status: 'done' });

          // 一次 Promise.all 拿所有 timeline 需要的資料
          const [quoteRes, approvalsRes, shipmentsRes] = await Promise.all([
            order.quote_id
              ? supabase.from('erp_quotes').select('quote_no, created_at').eq('id', order.quote_id).maybeSingle()
              : { data: null },
            supabase.from('erp_approvals').select('status, created_at, approved_at, approved_by').eq('doc_id', orderId.toString()).order('created_at', { ascending: true }),
            supabase.from('erp_shipments').select('shipment_no, created_at').eq('order_id', orderId).order('created_at', { ascending: true }),
          ]);

          if (quoteRes.data) {
            timeline.push({ event: `從報價單 ${quoteRes.data.quote_no} 轉入`, time: quoteRes.data.created_at, status: 'done' });
          }

          if (approvalsRes.data?.length) {
            for (const ap of approvalsRes.data) {
              timeline.push({ event: '訂單送審', time: ap.created_at, status: 'done' });
              if (ap.status === 'approved') {
                timeline.push({ event: '訂單已核准', time: ap.approved_at || ap.created_at, status: 'done', by: ap.approved_by });
              } else if (ap.status === 'rejected') {
                timeline.push({ event: '訂單已駁回', time: ap.approved_at || ap.created_at, status: 'rejected', by: ap.approved_by });
              } else {
                timeline.push({ event: '訂單審核中', time: null, status: 'pending' });
              }
            }
          }

          // 重用已查過的 linkedSales 和 uniquePOs，不再重複查
          if (linkedSales?.length) {
            for (const sale of linkedSales) {
              timeline.push({ event: `建立銷貨單 ${sale.slip_number}`, time: sale.created_at, status: 'done' });
            }
          }
          for (const po of uniquePOs) {
            timeline.push({ event: `建立採購單 ${po.po_no}`, time: po.created_at, status: 'done' });
          }
          if (shipmentsRes.data?.length) {
            for (const ship of shipmentsRes.data) {
              timeline.push({ event: `建立出貨單 ${ship.shipment_no}`, time: ship.created_at, status: 'done' });
            }
          }
        }

        return Response.json({ items: finalItems, linked_sales: linkedSales || [], linked_pos: uniquePOs, timeline });
      }

      case 'orders': {
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseLimit(20, 100);
        const offset = (page - 1) * limit;
        const search = (searchParams.get('search') || '').trim();
        const dateFrom = (searchParams.get('date_from') || '').trim();
        const dateTo = (searchParams.get('date_to') || '').trim();

        try {
          let query = supabase
            .from('erp_orders')
            .select('*', { count: 'exact' })
            .order('order_date', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false, nullsFirst: false })
            .range(offset, offset + limit - 1);

          if (search) {
            query = query.or(`order_no.ilike.%${search}%,status.ilike.%${search}%,payment_status.ilike.%${search}%,shipping_status.ilike.%${search}%,remark.ilike.%${search}%`);
          }
          if (dateFrom) query = query.gte('order_date', dateFrom);
          if (dateTo) query = query.lte('order_date', dateTo);

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
        const limit = parseLimit(20, 100);
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
        const limit = parseLimit(20, 100);
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
          // Fetch ALL rows for this slip_number (may have multiple line-level rows)
          const { data: saleRows, error: saleError } = await supabase
            .from('qb_sales_history')
            .select('*')
            .eq('slip_number', slipNumber)
            .order('id', { ascending: true });

          if (saleError) return Response.json({ error: saleError.message }, { status: 500 });
          if (!saleRows || saleRows.length === 0) return Response.json({ error: 'Sale not found' }, { status: 404 });

          // Build aggregated sale header from all rows
          const first = saleRows[0];
          const sale = {
            id: first.id,
            sale_date: first.sale_date,
            slip_number: first.slip_number,
            invoice_number: first.invoice_number,
            customer_name: first.customer_name,
            sales_person: first.sales_person,
            subtotal: saleRows.reduce((s, r) => s + Number(r.subtotal || 0), 0),
            tax: saleRows.reduce((s, r) => s + Number(r.tax || 0), 0),
            total: saleRows.reduce((s, r) => s + Number(r.total || 0), 0),
            cost: saleRows.reduce((s, r) => s + Number(r.cost || 0), 0),
            gross_profit: saleRows.reduce((s, r) => s + Number(r.gross_profit || 0), 0),
            line_count: saleRows.length,
          };

          let invoice = null;
          let items = [];

          // Try to get invoice info
          const invoiceNumber = first.invoice_number;
          if (invoiceNumber) {
            const { data: invoiceRow } = await supabase
              .from('qb_invoices')
              .select('*')
              .eq('invoice_number', invoiceNumber)
              .limit(1);

            invoice = invoiceRow?.[0] || null;

            if (invoice?.order_id) {
              const { data: itemRows } = await supabase
                .from('qb_order_items')
                .select('*')
                .eq('order_id', invoice.order_id)
                .order('id', { ascending: true });

              items = itemRows || [];
            }
          }

          // Fallback 1: try fetching items by sale.id directly (convert_order_to_sale stores items with order_id = sale.id)
          if (items.length === 0) {
            const { data: directItems } = await supabase
              .from('qb_order_items')
              .select('*')
              .eq('order_id', first.id)
              .order('id', { ascending: true });
            items = directItems || [];
          }

          // Fallback 2: try erp_order_items by sale_ref (instock_to_sale flow)
          if (items.length === 0) {
            const { data: erpItems } = await supabase
              .from('erp_order_items')
              .select('id, item_number_snapshot, description_snapshot, qty, unit_price, line_total, sale_ref, item_note')
              .like('sale_ref', `%${slipNumber}%`)
              .order('id', { ascending: true });
            if (erpItems && erpItems.length > 0) {
              items = erpItems.map(i => ({
                id: i.id,
                item_number: i.item_number_snapshot,
                description: i.description_snapshot,
                quantity: i.qty,
                unit_price: i.unit_price,
                subtotal: i.line_total,
              }));
            }
          }

          // Fallback 3: use the sales_history rows as line items
          if (items.length === 0 && saleRows.length > 1) {
            items = saleRows.map((r, i) => ({
              id: r.id,
              item_number: `#${i + 1}`,
              description: `${r.customer_name || ''} - 明細 ${i + 1}`,
              quantity: 1,
              unit_price: r.subtotal,
              subtotal: r.subtotal,
            }));
          }

          // Build timeline for sale
          const timeline = [];
          timeline.push({ event: '建立銷貨單', time: first.created_at, status: 'done' });

          // Check if sale came from an order
          if (first.erp_order_id) {
            const { data: linkedOrder } = await supabase.from('erp_orders').select('order_no, created_at').eq('id', first.erp_order_id).maybeSingle();
            if (linkedOrder) {
              timeline.push({ event: `來自訂單 ${linkedOrder.order_no}`, time: linkedOrder.created_at, status: 'done' });
            }
          }

          // Check approvals for this sale
          const { data: approvals } = await supabase.from('erp_approvals').select('status, created_at, approved_at, approved_by').eq('doc_id', first.id.toString()).order('created_at', { ascending: true });
          if (approvals && approvals.length > 0) {
            for (const ap of approvals) {
              timeline.push({ event: '銷貨單送審', time: ap.created_at, status: 'done' });
              if (ap.status === 'approved') {
                timeline.push({ event: '銷貨單已核准', time: ap.approved_at || ap.created_at, status: 'done', by: ap.approved_by });
              } else if (ap.status === 'rejected') {
                timeline.push({ event: '銷貨單已駁回', time: ap.approved_at || ap.created_at, status: 'rejected', by: ap.approved_by });
              } else {
                timeline.push({ event: '銷貨單審核中', time: null, status: 'pending' });
              }
            }
          }

          // Check for shipments
          const { data: shipmentsList } = await supabase.from('erp_shipments').select('shipment_no, created_at').or(`sale_id.eq.${first.id},order_id.eq.${first.erp_order_id}`).order('created_at', { ascending: true });
          if (shipmentsList && shipmentsList.length > 0) {
            for (const ship of shipmentsList) {
              timeline.push({ event: `建立出貨單 ${ship.shipment_no}`, time: ship.created_at, status: 'done' });
            }
          }

          // If invoice exists, add to timeline
          if (invoice?.invoice_number) {
            timeline.push({ event: `開立發票 ${invoice.invoice_number}`, time: invoice.created_at || first.created_at, status: 'done' });
          }

          return Response.json({
            sale,
            invoice,
            items,
            has_items: items.length > 0,
            timeline,
          });
        } catch (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }
      }

      case 'profit_analysis': {
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseLimit(20, 100);
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
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseLimit(25, 50);
        const offset = (page - 1) * limit;
        const lite = searchParams.get('lite') === '1'; // 輕量模式：跳過 summary 統計 + count

        const selectFields = lite
          ? 'item_number,description,tw_retail_price,stock_qty'
          : 'item_number,description,us_price,tw_retail_price,tw_reseller_price,product_status,category,replacement_model,weight_kg,origin_country,image_url,stock_qty';

        let query = supabase
          .from('quickbuy_products')
          .select(selectFields, lite ? { count: 'planned' } : { count: 'exact' })
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
          query = query.or(`item_number.ilike.%${escaped}%,description.ilike.%${escaped}%`);
        }

        const { data, count, error } = await query;
        if (error) return Response.json({ error: error.message }, { status: 500 });

        // 輕量模式：直接回傳搜尋結果，不跑 summary 統計（省 ~1000ms）
        if (lite) {
          return Response.json({ rows: data || [], products: data || [], total: count || 0, page, limit });
        }

        const [allProducts, currentProducts, replacementProducts, categoryRows] = await Promise.all([
          supabase.from('quickbuy_products').select('*', { count: 'exact', head: true }),
          supabase.from('quickbuy_products').select('*', { count: 'exact', head: true }).eq('product_status', 'Current'),
          supabase.from('quickbuy_products').select('*', { count: 'exact', head: true }).not('replacement_model', 'is', null),
          supabase.rpc('get_distinct_categories'),
        ]);

        const allCategories = (categoryRows.data || []).map((row) => row.category).filter(Boolean);

        return Response.json({
          products: data || [],
          rows: data || [],
          total: count || 0,
          page,
          limit,
          categories: allCategories,
          summary: {
            total_products: allProducts.count || 0,
            current_products: currentProducts.count || 0,
            replacement_products: replacementProducts.count || 0,
            category_count: allCategories.length,
          },
        });
      }

      case 'chat_history': {
        const search = searchParams.get('search') || '';
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseLimit(30, 100);
        const offset = (page - 1) * limit;

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

      case 'line_conversations': {
        // Get unique LINE users with their latest message, ordered by last activity
        const { data: conversations, error: convErr } = await supabase
          .from('quickbuy_line_messages')
          .select('line_user_id, display_name, user_message, ai_response, created_at')
          .order('created_at', { ascending: false });
        if (convErr) return Response.json({ error: convErr.message }, { status: 500 });

        // Group by user, keep latest message + count
        const userMap = {};
        for (const msg of (conversations || [])) {
          if (!userMap[msg.line_user_id]) {
            userMap[msg.line_user_id] = {
              line_user_id: msg.line_user_id,
              display_name: msg.display_name || '客戶',
              last_message: msg.user_message || msg.ai_response || '',
              last_at: msg.created_at,
              message_count: 0,
              unread: 0,
            };
          }
          userMap[msg.line_user_id].message_count++;
        }

        const list = Object.values(userMap).sort((a, b) => new Date(b.last_at) - new Date(a.last_at));
        return Response.json({ conversations: list });
      }

      case 'line_thread': {
        // Get full conversation thread for a specific LINE user
        const lineUserId = searchParams.get('line_user_id');
        if (!lineUserId) return Response.json({ error: 'line_user_id required' }, { status: 400 });

        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseLimit(50, 200);
        const offset = (page - 1) * limit;

        const { data: messages, count, error: msgErr } = await supabase
          .from('quickbuy_line_messages')
          .select('id, line_user_id, display_name, message_type, user_message, ai_response, matched_products, response_time_ms, created_at', { count: 'exact' })
          .eq('line_user_id', lineUserId)
          .order('created_at', { ascending: true })
          .range(offset, offset + limit - 1);
        if (msgErr) return Response.json({ error: msgErr.message }, { status: 500 });

        // Get customer profile
        const { data: customer } = await supabase
          .from('quickbuy_line_customers')
          .select('*')
          .eq('line_user_id', lineUserId)
          .maybeSingle();

        return Response.json({ messages: messages || [], total: count || 0, page, limit, customer });
      }

      case 'line_customer_tags': {
        const search = (searchParams.get('search') || '').trim();
        const tagFilter = searchParams.get('tag') || '';

        let query = supabase
          .from('quickbuy_line_customers')
          .select('*')
          .order('last_contact_at', { ascending: false, nullsFirst: false });

        if (search) {
          query = query.ilike('display_name', `%${search}%`);
        }
        if (tagFilter) {
          query = query.contains('tags', [tagFilter]);
        }

        const { data, error } = await query;
        if (error) return Response.json({ error: error.message }, { status: 500 });

        // Compute tag summary
        const tagCounts = {};
        for (const c of (data || [])) {
          for (const t of (c.tags || [])) {
            tagCounts[t] = (tagCounts[t] || 0) + 1;
          }
        }

        return Response.json({
          customers: data || [],
          total: (data || []).length,
          tag_summary: tagCounts,
          available_tags: ['VIP', '鑽石VIP', '一般客戶', '新客戶', '潛在客戶', '沉睡客戶', '活躍', '高互動'],
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

      /* ===================== 庫存管理 ===================== */
      case 'inventory': {
        const search = (searchParams.get('search') || '').trim();
        const filter = searchParams.get('filter') || 'all';
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseLimit(30, 100);
        const offset = (page - 1) * limit;

        let query = supabase
          .from('quickbuy_products')
          .select('item_number,description,category,stock_qty,safety_stock,product_status', { count: 'exact' })
          .order('item_number', { ascending: true })
          .range(offset, offset + limit - 1);

        if (search) {
          query = query.or(`item_number.ilike.%${search}%,description.ilike.%${search}%`);
        }
        // Note: Supabase JS can't compare column-to-column, so for low_stock we fetch and filter in-app
        if (filter === 'out_of_stock') {
          query = query.lte('stock_qty', 0);
        }

        const { data: rawData, count, error } = await query;
        if (error) return Response.json({ error: error.message }, { status: 500 });

        // For low_stock, filter client-side (stock_qty <= safety_stock AND safety_stock > 0)
        const data = filter === 'low_stock'
          ? (rawData || []).filter(r => Number(r.safety_stock || 0) > 0 && Number(r.stock_qty || 0) <= Number(r.safety_stock))
          : rawData;

        // Summary stats
        const [totalRes, , outRes, allWithStock] = await Promise.all([
          supabase.from('quickbuy_products').select('*', { count: 'exact', head: true }),
          null,
          supabase.from('quickbuy_products').select('*', { count: 'exact', head: true }).lte('stock_qty', 0),
          supabase.from('quickbuy_products').select('stock_qty,safety_stock').gt('safety_stock', 0),
        ]);
        const lowCount = (allWithStock?.data || []).filter(r => Number(r.stock_qty || 0) <= Number(r.safety_stock)).length;

        return Response.json({
          items: data || [],
          total: count || 0,
          page,
          limit,
          summary: {
            total_products: totalRes.count || 0,
            low_stock: lowCount,
            out_of_stock: outRes.count || 0,
          },
        });
      }

      case 'inventory_movements': {
        const item = (searchParams.get('item_number') || '').trim();
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseLimit(30, 100);
        const offset = (page - 1) * limit;

        let query = supabase
          .from('qb_inventory_movements')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (item) query = query.eq('item_number', item);

        const { data, count, error } = await query;
        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json({ movements: data || [], total: count || 0, page, limit });
      }

      /* ===================== 收款管理 ===================== */
      case 'payments': {
        const search = (searchParams.get('search') || '').trim();
        const statusFilter = (searchParams.get('status') || '').trim();
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseLimit(30, 100);
        const offset = (page - 1) * limit;

        let query = supabase
          .from('qb_payments')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (statusFilter) query = query.eq('status', statusFilter);
        if (search) {
          query = query.or(`payment_number.ilike.%${search}%,notes.ilike.%${search}%`);
        }

        const { data, count, error } = await query;
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const [{ data: pmCounts }, { data: totalAmtRows2 }] = await Promise.all([
          supabase.rpc('get_status_counts', { table_name: 'qb_payments' }),
          supabase.from('qb_payments').select('amount').eq('status', 'confirmed'),
        ]);
        const pmc = pmCounts || {};
        const totalConfirmedAmt = (totalAmtRows2 || []).reduce((s, r) => s + Number(r.amount || 0), 0);

        return Response.json({
          payments: data || [],
          total: count || 0,
          page,
          limit,
          summary: {
            pending: pmc.pending || 0,
            confirmed: pmc.confirmed || 0,
            total_confirmed_amount: totalConfirmedAmt,
          },
        });
      }

      /* ===================== 出貨管理 ===================== */
      case 'shipments': {
        const search = (searchParams.get('search') || '').trim();
        const statusFilter = (searchParams.get('status') || '').trim();
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseLimit(30, 100);
        const offset = (page - 1) * limit;

        let query = supabase
          .from('erp_shipments')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (statusFilter) query = query.eq('status', statusFilter);
        if (search) {
          query = query.or(`shipment_no.ilike.%${search}%,tracking_no.ilike.%${search}%,carrier.ilike.%${search}%`);
        }

        const { data, count, error } = await query;
        if (error) {
          if (isMissingRelationError(error)) return missingRelationResponse(error, 'erp_shipments');
          return Response.json({ error: error.message }, { status: 500 });
        }

        const { data: shCounts } = await supabase.rpc('get_status_counts', { table_name: 'erp_shipments' });
        const shc = shCounts || {};

        return Response.json({
          shipments: data || [],
          total: count || 0,
          page,
          limit,
          summary: {
            pending: shc.pending || 0,
            shipped: shc.shipped || 0,
            delivered: shc.delivered || 0,
          },
        });
      }

      /* ===================== 出貨明細 ===================== */
      case 'shipment_detail': {
        const shipmentId = (searchParams.get('shipment_id') || '').trim();
        if (!shipmentId) return Response.json({ error: 'shipment_id is required' }, { status: 400 });

        try {
          const { data: shipment, error: shipErr } = await supabase
            .from('erp_shipments')
            .select('*')
            .eq('id', shipmentId)
            .maybeSingle();

          if (shipErr) {
            if (isMissingRelationError(shipErr)) return missingRelationResponse(shipErr, 'erp_shipments');
            return Response.json({ error: shipErr.message }, { status: 500 });
          }
          if (!shipment) return Response.json({ error: 'Shipment not found' }, { status: 404 });

          // Get shipment items
          let shipItems = [];
          const { data: siRows } = await supabase
            .from('erp_shipment_items')
            .select('*')
            .eq('shipment_id', shipmentId)
            .order('id', { ascending: true });
          shipItems = siRows || [];

          // Get linked order info
          let order = null;
          let orderItems = [];
          let customer = null;
          if (shipment.order_id) {
            const { data: orderRow } = await supabase.from('erp_orders').select('*').eq('id', shipment.order_id).maybeSingle();
            order = orderRow || null;

            const { data: oiRows } = await supabase.from('erp_order_items').select('*').eq('order_id', shipment.order_id).order('id', { ascending: true });
            orderItems = oiRows || [];
          }

          if (shipment.customer_id) {
            const { data: custRow } = await runErpCustomerQuery((columns) =>
              supabase.from('erp_customers').select(columns).eq('id', shipment.customer_id).maybeSingle()
            );
            customer = custRow || null;
          }

          // Merge shipment items with order items for display
          const displayItems = shipItems.length > 0 ? shipItems.map(si => {
            const oi = orderItems.find(o => String(o.id) === String(si.order_item_id));
            return {
              ...si,
              item_number: oi?.item_number_snapshot || oi?.item_number || si.item_number || '-',
              description: oi?.description_snapshot || oi?.description || si.description || '-',
              unit_price: oi?.unit_price || 0,
              order_qty: oi?.qty || 0,
            };
          }) : orderItems.map(oi => ({
            order_item_id: oi.id,
            item_number: oi.item_number_snapshot || oi.item_number || '-',
            description: oi.description_snapshot || oi.description || '-',
            unit_price: oi.unit_price || 0,
            order_qty: oi.qty || 0,
            qty_shipped: oi.qty || 0,
          }));

          return Response.json({ shipment, items: displayItems, order, customer });
        } catch (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }
      }

      /* ===================== 退貨管理 ===================== */
      case 'returns': {
        const search = (searchParams.get('search') || '').trim();
        const statusFilter = (searchParams.get('status') || '').trim();
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseLimit(30, 100);
        const offset = (page - 1) * limit;

        let query = supabase
          .from('erp_returns')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (statusFilter) query = query.eq('status', statusFilter);
        if (search) {
          query = query.or(`return_no.ilike.%${search}%,reason.ilike.%${search}%`);
        }

        const { data, count, error } = await query;
        if (error) {
          if (isMissingRelationError(error)) return missingRelationResponse(error, 'erp_returns');
          return Response.json({ error: error.message }, { status: 500 });
        }

        const [{ data: rtCounts }, { data: refundRows }] = await Promise.all([
          supabase.rpc('get_status_counts', { table_name: 'erp_returns' }),
          supabase.from('erp_returns').select('amount:refund_amount').not('status', 'eq', 'rejected'),
        ]);
        const rtc = rtCounts || {};
        const totalRefund = (refundRows || []).reduce((s, r) => s + Number(r.amount || 0), 0);

        return Response.json({
          returns: data || [],
          total: count || 0,
          page,
          limit,
          summary: {
            pending: rtc.pending || 0,
            approved: rtc.approved || 0,
            total_refund: totalRefund,
          },
        });
      }

      /* ===================== 退貨明細 ===================== */
      case 'return_detail': {
        const returnId = (searchParams.get('return_id') || '').trim();
        if (!returnId) return Response.json({ error: 'return_id is required' }, { status: 400 });

        try {
          const { data: ret, error: retErr } = await supabase
            .from('erp_returns')
            .select('*')
            .eq('id', returnId)
            .maybeSingle();

          if (retErr) {
            if (isMissingRelationError(retErr)) return missingRelationResponse(retErr, 'erp_returns');
            return Response.json({ error: retErr.message }, { status: 500 });
          }
          if (!ret) return Response.json({ error: 'Return not found' }, { status: 404 });

          const { data: retItems } = await supabase
            .from('erp_return_items')
            .select('*')
            .eq('return_id', returnId)
            .order('id', { ascending: true });

          let order = null;
          let customer = null;

          if (ret.order_id) {
            const { data: orderRow } = await supabase.from('erp_orders').select('*').eq('id', ret.order_id).maybeSingle();
            order = orderRow || null;
          }

          if (ret.customer_id) {
            const { data: custRow } = await runErpCustomerQuery((columns) =>
              supabase.from('erp_customers').select(columns).eq('id', ret.customer_id).maybeSingle()
            );
            customer = custRow || null;
          } else if (order?.customer_id) {
            const { data: custRow } = await runErpCustomerQuery((columns) =>
              supabase.from('erp_customers').select(columns).eq('id', order.customer_id).maybeSingle()
            );
            customer = custRow || null;
          }

          return Response.json({ return_doc: ret, items: retItems || [], order, customer });
        } catch (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }
      }

      /* ===================== 詢價管理 ===================== */
      case 'inquiries': {
        const search = (searchParams.get('search') || '').trim();
        const statusFilter = (searchParams.get('status') || '').trim();
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseLimit(30, 100);
        const offset = (page - 1) * limit;

        let query = supabase
          .from('erp_inquiries')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (statusFilter) query = query.eq('status', statusFilter);
        if (search) {
          query = query.or(`inquiry_no.ilike.%${search}%,subject.ilike.%${search}%`);
        }

        const { data, count, error } = await query;
        if (error) {
          if (isMissingRelationError(error)) return missingRelationResponse(error, 'erp_inquiries');
          return Response.json({ error: error.message }, { status: 500 });
        }

        const [openRes, quotedRes, closedRes] = await Promise.all([
          supabase.from('erp_inquiries').select('*', { count: 'exact', head: true }).eq('status', 'open'),
          supabase.from('erp_inquiries').select('*', { count: 'exact', head: true }).eq('status', 'quoted'),
          supabase.from('erp_inquiries').select('*', { count: 'exact', head: true }).eq('status', 'closed'),
        ]);

        return Response.json({
          inquiries: data || [],
          total: count || 0,
          page,
          limit,
          summary: {
            open: openRes.count || 0,
            quoted: quotedRes.count || 0,
            closed: closedRes.count || 0,
          },
        });
      }

      /* ===================== 採購單 ===================== */
      case 'purchase_orders': {
        const search = (searchParams.get('search') || '').trim();
        const statusFilter = (searchParams.get('status') || '').trim();
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseLimit(30, 100);
        const offset = (page - 1) * limit;

        let query = supabase.from('erp_purchase_orders').select('*', { count: 'exact' })
          .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
        if (statusFilter) query = query.eq('status', statusFilter);
        if (search) query = query.or(`po_no.ilike.%${search}%,remark.ilike.%${search}%`);

        const { data, count, error } = await query;
        if (error) { if (isMissingRelationError(error)) return missingRelationResponse(error, 'erp_purchase_orders'); return Response.json({ error: error.message }, { status: 500 }); }

        const { data: statusCounts } = await supabase.rpc('get_status_counts', { table_name: 'erp_purchase_orders' });
        const sc = statusCounts || {};

        return Response.json({ rows: data || [], total: count || 0, page, limit, summary: { draft: sc.draft || 0, sent: sc.sent || 0, confirmed: sc.confirmed || 0, shipped: sc.shipped || 0, received: sc.received || 0 } });
      }

      /* ===================== 進貨單 ===================== */
      case 'stock_ins': {
        const search = (searchParams.get('search') || '').trim();
        const statusFilter = (searchParams.get('status') || '').trim();
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseLimit(30, 100);
        const offset = (page - 1) * limit;

        let query = supabase.from('erp_stock_ins').select('*', { count: 'exact' })
          .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
        if (statusFilter) query = query.eq('status', statusFilter);
        if (search) query = query.or(`stock_in_no.ilike.%${search}%,remark.ilike.%${search}%`);

        const { data, count, error } = await query;
        if (error) { if (isMissingRelationError(error)) return missingRelationResponse(error, 'erp_stock_ins'); return Response.json({ error: error.message }, { status: 500 }); }

        const { data: siCounts } = await supabase.rpc('get_status_counts', { table_name: 'erp_stock_ins' });
        const sic = siCounts || {};

        return Response.json({ rows: data || [], total: count || 0, page, limit, summary: { pending: sic.pending || 0, confirmed: sic.confirmed || 0 } });
      }

      /* ===================== 進貨退出 ===================== */
      case 'purchase_returns': {
        const search = (searchParams.get('search') || '').trim();
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseLimit(30, 100);
        const offset = (page - 1) * limit;

        let query = supabase.from('erp_purchase_returns').select('*', { count: 'exact' })
          .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
        if (search) query = query.or(`return_no.ilike.%${search}%,reason.ilike.%${search}%`);

        const { data, count, error } = await query;
        if (error) { if (isMissingRelationError(error)) return missingRelationResponse(error, 'erp_purchase_returns'); return Response.json({ error: error.message }, { status: 500 }); }
        return Response.json({ rows: data || [], total: count || 0, page, limit });
      }

      /* ===================== 付款單 ===================== */
      case 'vendor_payments': {
        const search = (searchParams.get('search') || '').trim();
        const statusFilter = (searchParams.get('status') || '').trim();
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseLimit(30, 100);
        const offset = (page - 1) * limit;

        let query = supabase.from('erp_vendor_payments').select('*', { count: 'exact' })
          .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
        if (statusFilter) query = query.eq('status', statusFilter);
        if (search) query = query.or(`payment_no.ilike.%${search}%,remark.ilike.%${search}%`);

        const { data, count, error } = await query;
        if (error) { if (isMissingRelationError(error)) return missingRelationResponse(error, 'erp_vendor_payments'); return Response.json({ error: error.message }, { status: 500 }); }

        const [{ data: vpCounts }, { data: totalAmtRows }] = await Promise.all([
          supabase.rpc('get_status_counts', { table_name: 'erp_vendor_payments' }),
          supabase.from('erp_vendor_payments').select('amount').eq('status', 'confirmed'),
        ]);
        const vpc = vpCounts || {};
        const totalPaid = (totalAmtRows || []).reduce((s, r) => s + Number(r.amount || 0), 0);

        return Response.json({ rows: data || [], total: count || 0, page, limit, summary: { pending: vpc.pending || 0, confirmed: vpc.confirmed || 0, total_paid: totalPaid } });
      }

      /* ===================== 盤點單 ===================== */
      case 'stocktakes': {
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseLimit(30, 100);
        const offset = (page - 1) * limit;

        const { data, count, error } = await supabase.from('erp_stocktakes').select('*', { count: 'exact' })
          .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
        if (error) { if (isMissingRelationError(error)) return missingRelationResponse(error, 'erp_stocktakes'); return Response.json({ error: error.message }, { status: 500 }); }
        return Response.json({ rows: data || [], total: count || 0, page, limit });
      }

      case 'stocktake_detail': {
        const id = searchParams.get('id');
        if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

        const { data: stocktake } = await supabase.from('erp_stocktakes').select('*').eq('id', id).maybeSingle();
        const { data: items } = await supabase.from('erp_stocktake_items').select('*').eq('stocktake_id', id).order('id');
        return Response.json({ stocktake, items: items || [] });
      }

      /* ===================== 調整單 ===================== */
      case 'stock_adjustments': {
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseLimit(30, 100);
        const offset = (page - 1) * limit;

        const { data, count, error } = await supabase.from('erp_stock_adjustments').select('*', { count: 'exact' })
          .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
        if (error) { if (isMissingRelationError(error)) return missingRelationResponse(error, 'erp_stock_adjustments'); return Response.json({ error: error.message }, { status: 500 }); }
        return Response.json({ rows: data || [], total: count || 0, page, limit });
      }

      /* ===================== 進銷存報表 ===================== */
      case 'psi_report': {
        const dateFrom = (searchParams.get('date_from') || '').trim();
        const dateTo = (searchParams.get('date_to') || '').trim();

        // Sales summary
        let salesQ = supabase.from('qb_sales_history').select('total,cost,gross_profit');
        if (dateFrom) salesQ = salesQ.gte('sale_date', dateFrom);
        if (dateTo) salesQ = salesQ.lte('sale_date', dateTo);
        const { data: sales } = await salesQ;

        // Purchase summary
        let purchaseQ = supabase.from('erp_stock_ins').select('total_amount').eq('status', 'confirmed');
        if (dateFrom) purchaseQ = purchaseQ.gte('stock_in_date', dateFrom);
        if (dateTo) purchaseQ = purchaseQ.lte('stock_in_date', dateTo);
        const { data: purchases } = await purchaseQ;

        // Returns
        let salesRetQ = supabase.from('erp_returns').select('refund_amount');
        if (dateFrom) salesRetQ = salesRetQ.gte('return_date', dateFrom);
        if (dateTo) salesRetQ = salesRetQ.lte('return_date', dateTo);
        const { data: salesReturns } = await salesRetQ;

        let purchRetQ = supabase.from('erp_purchase_returns').select('total_amount');
        if (dateFrom) purchRetQ = purchRetQ.gte('return_date', dateFrom);
        if (dateTo) purchRetQ = purchRetQ.lte('return_date', dateTo);
        const { data: purchReturns } = await purchRetQ;

        const sum = (arr, key) => (arr || []).reduce((s, r) => s + Number(r[key] || 0), 0);

        return Response.json({
          sales_total: sum(sales, 'total'),
          sales_cost: sum(sales, 'cost'),
          sales_profit: sum(sales, 'gross_profit'),
          purchase_total: sum(purchases, 'total_amount'),
          sales_return_total: sum(salesReturns, 'refund_amount'),
          purchase_return_total: sum(purchReturns, 'total_amount'),
          date_from: dateFrom,
          date_to: dateTo,
        });
      }

      /* ===================== 財務報表 ===================== */
      case 'financial_report': {
        const dateFrom = (searchParams.get('date_from') || '').trim();
        const dateTo = (searchParams.get('date_to') || '').trim();

        // Receivables (confirmed sales - confirmed customer payments)
        let salesQ = supabase.from('qb_sales_history').select('total');
        if (dateFrom) salesQ = salesQ.gte('sale_date', dateFrom);
        if (dateTo) salesQ = salesQ.lte('sale_date', dateTo);
        const { data: sales } = await salesQ;

        let custPayQ = supabase.from('qb_payments').select('amount').eq('status', 'confirmed');
        if (dateFrom) custPayQ = custPayQ.gte('payment_date', dateFrom);
        if (dateTo) custPayQ = custPayQ.lte('payment_date', dateTo);
        const { data: custPay } = await custPayQ;

        // Payables (confirmed stock-ins - confirmed vendor payments)
        let stockInQ = supabase.from('erp_stock_ins').select('total_amount').eq('status', 'confirmed');
        if (dateFrom) stockInQ = stockInQ.gte('stock_in_date', dateFrom);
        if (dateTo) stockInQ = stockInQ.lte('stock_in_date', dateTo);
        const { data: stockIns } = await stockInQ;

        let vendPayQ = supabase.from('erp_vendor_payments').select('amount').eq('status', 'confirmed');
        if (dateFrom) vendPayQ = vendPayQ.gte('payment_date', dateFrom);
        if (dateTo) vendPayQ = vendPayQ.lte('payment_date', dateTo);
        const { data: vendPay } = await vendPayQ;

        const sum = (arr, key) => (arr || []).reduce((s, r) => s + Number(r[key] || 0), 0);
        const salesTotal = sum(sales, 'total');
        const custPayTotal = sum(custPay, 'amount');
        const purchaseTotal = sum(stockIns, 'total_amount');
        const vendPayTotal = sum(vendPay, 'amount');

        return Response.json({
          revenue: salesTotal,
          received: custPayTotal,
          receivable: salesTotal - custPayTotal,
          purchase: purchaseTotal,
          paid: vendPayTotal,
          payable: purchaseTotal - vendPayTotal,
          net_cash: custPayTotal - vendPayTotal,
          date_from: dateFrom,
          date_to: dateTo,
        });
      }

      case 'dealer_users': {
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseLimit(50, 100);
        const offset = (page - 1) * limit;
        const search = (searchParams.get('search') || '').trim();
        const roleFilter = (searchParams.get('role') || '').trim();

        let query = supabase
          .from('erp_dealer_users')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (search) query = query.or(`username.ilike.%${search}%,display_name.ilike.%${search}%,company_name.ilike.%${search}%,phone.ilike.%${search}%`);
        if (roleFilter) query = query.eq('role', roleFilter);

        const { data, count, error } = await query;
        if (error) {
          if (isMissingRelationError(error)) return missingRelationResponse(error, 'erp_dealer_users');
          return Response.json({ error: error.message }, { status: 500 });
        }

        return Response.json({ rows: data || [], total: count || 0, page, limit });
      }

      case 'dealer_orders': {
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseLimit(50, 100);
        const offset = (page - 1) * limit;
        const statusFilter = (searchParams.get('status') || '').trim();

        let query = supabase
          .from('erp_orders')
          .select('*', { count: 'exact' })
          .eq('order_source', 'dealer_portal')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (statusFilter) query = query.eq('status', statusFilter);

        const { data, count, error } = await query;
        if (error) return Response.json({ error: error.message }, { status: 500 });

        // Get dealer user info
        const dealerIds = [...new Set((data || []).map((o) => o.dealer_user_id).filter(Boolean))];
        let dealerMap = {};
        if (dealerIds.length) {
          const { data: dealers } = await supabase.from('erp_dealer_users').select('id,display_name,role,company_name').in('id', dealerIds);
          dealerMap = Object.fromEntries((dealers || []).map((d) => [d.id, d]));
        }

        // Get order items
        const orderIds = (data || []).map((o) => o.id);
        let itemsMap = {};
        if (orderIds.length) {
          const { data: items } = await supabase.from('erp_order_items').select('*').in('order_id', orderIds);
          for (const item of (items || [])) {
            if (!itemsMap[item.order_id]) itemsMap[item.order_id] = [];
            itemsMap[item.order_id].push(item);
          }
        }

        const rows = (data || []).map((o) => ({
          ...o,
          dealer: dealerMap[o.dealer_user_id] || null,
          items: itemsMap[o.id] || [],
        }));

        return Response.json({ rows, total: count || 0, page, limit });
      }

      case 'pending_badges': {
        const [dealerPending, poDraft, siPending, orderPending, approvalPending, ticketOpen, invoiceUnpaid] = await Promise.all([
          supabase.from('erp_orders').select('*', { count: 'exact', head: true }).eq('order_source', 'dealer_portal').eq('status', 'pending'),
          supabase.from('erp_purchase_orders').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
          supabase.from('erp_stock_ins').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('erp_orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('erp_approvals').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('erp_tickets').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
          supabase.from('erp_invoices').select('*', { count: 'exact', head: true }).eq('payment_status', 'unpaid'),
        ]);
        return Response.json({
          dealer_orders: dealerPending.count || 0,
          purchase_orders: poDraft.count || 0,
          stock_in: siPending.count || 0,
          orders: orderPending.count || 0,
          approvals: approvalPending.count || 0,
          tickets: ticketOpen.count || 0,
          invoices: invoiceUnpaid.count || 0,
        });
      }

      case 'po_items': {
        const poId = searchParams.get('po_id');
        if (!poId) return Response.json({ error: 'po_id required' }, { status: 400 });
        const { data, error } = await supabase.from('erp_purchase_order_items').select('*').eq('po_id', poId).order('created_at', { ascending: true });
        if (error) return Response.json({ error: error.message }, { status: 500 });

        // Build timeline for PO
        const timeline = [];
        const { data: po } = await supabase.from('erp_purchase_orders').select('*').eq('id', poId).maybeSingle();
        if (po) {
          // PO created
          timeline.push({ event: '建立採購單', time: po.created_at, status: 'done' });

          // Check if PO came from an order
          if (po.source_order_ids && Array.isArray(po.source_order_ids) && po.source_order_ids.length > 0) {
            const sourceOrderId = po.source_order_ids[0];
            const { data: linkedOrder } = await supabase.from('erp_orders').select('order_no, created_at').eq('id', sourceOrderId).maybeSingle();
            if (linkedOrder) {
              timeline.push({ event: `來自訂單 ${linkedOrder.order_no}`, time: linkedOrder.created_at, status: 'done' });
            }
          }

          // PO status timeline
          if (po.status === 'confirmed' || po.status === 'shipped' || po.status === 'received') {
            timeline.push({ event: '採購單已確認', time: po.confirmed_at || po.updated_at, status: 'done' });
          }
          if (po.status === 'shipped') {
            timeline.push({ event: '採購單已出貨', time: po.shipped_at || po.updated_at, status: 'done' });
          }
          if (po.status === 'received') {
            timeline.push({ event: '採購單已到貨', time: po.received_at || po.updated_at, status: 'done' });
          }

          // Check for receiving records (stock_in)
          const { data: stockInList } = await supabase.from('erp_stock_in').select('stock_in_no, created_at').eq('po_id', poId).order('created_at', { ascending: true });
          if (stockInList && stockInList.length > 0) {
            for (const stockIn of stockInList) {
              timeline.push({ event: `進貨 ${stockIn.stock_in_no}`, time: stockIn.created_at, status: 'done' });
            }
          }
        }

        return Response.json({ items: data || [], timeline });
      }

      case 'announcements': {
        const activeOnly = searchParams.get('active_only') === '1';
        let query = supabase.from('erp_announcements').select('*').order('priority', { ascending: false }).order('created_at', { ascending: false });
        if (activeOnly) query = query.eq('is_active', true);
        const { data, error } = await query;
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ announcements: data || [] });
      }

      /* ===================== 自動補貨建議 ===================== */
      case 'reorder_suggestions': {
        const statusFilter = (searchParams.get('status') || '').trim();
        const autoGenerate = searchParams.get('generate') === '1';

        if (autoGenerate) {
          // Scan products below safety stock and create suggestions
          const { data: lowStock } = await supabase
            .from('quickbuy_products')
            .select('item_number, description, stock_qty, safety_stock')
            .gt('safety_stock', 0)
            .not('item_number', 'is', null);

          const belowSafety = (lowStock || []).filter(p => (p.stock_qty || 0) <= (p.safety_stock || 0));

          if (belowSafety.length > 0) {
            // Check which ones already have pending suggestions
            const itemNums = belowSafety.map(p => p.item_number);
            const { data: existing } = await supabase
              .from('erp_reorder_suggestions')
              .select('item_number')
              .in('item_number', itemNums)
              .eq('status', 'pending');
            const existingSet = new Set((existing || []).map(e => e.item_number));

            const newSuggestions = belowSafety
              .filter(p => !existingSet.has(p.item_number))
              .map(p => ({
                item_number: p.item_number,
                description: p.description,
                current_stock: p.stock_qty || 0,
                safety_stock: p.safety_stock || 0,
                suggested_qty: Math.max((p.safety_stock || 0) * 2 - (p.stock_qty || 0), 1),
                status: 'pending',
              }));

            if (newSuggestions.length > 0) {
              await supabase.from('erp_reorder_suggestions').insert(newSuggestions);
            }
          }
        }

        let query = supabase.from('erp_reorder_suggestions').select('*').order('created_at', { ascending: false });
        if (statusFilter) query = query.eq('status', statusFilter);
        const { data, error } = await query;
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ suggestions: data || [], total: (data || []).length });
      }

      /* ===================== CRM 線索管線 ===================== */
      case 'crm_leads': {
        const stage = (searchParams.get('stage') || '').trim();
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseLimit(50, 100);
        const offset = (page - 1) * limit;

        let query = supabase.from('erp_crm_leads').select('*', { count: 'exact' })
          .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
        if (stage) query = query.eq('stage', stage);

        const { data, count, error } = await query;
        if (error) { if (isMissingRelationError(error)) return missingRelationResponse(error, 'erp_crm_leads'); return Response.json({ error: error.message }, { status: 500 }); }

        // Pipeline summary
        const stages = ['new', 'qualified', 'proposition', 'negotiation', 'won', 'lost'];
        const countPromises = stages.map(s =>
          supabase.from('erp_crm_leads').select('*', { count: 'exact', head: true }).eq('stage', s)
        );
        const stageCounts = await Promise.all(countPromises);
        const pipeline = {};
        stages.forEach((s, i) => { pipeline[s] = stageCounts[i].count || 0; });

        // Win rate
        const totalClosed = (pipeline.won || 0) + (pipeline.lost || 0);
        pipeline.win_rate = totalClosed > 0 ? Math.round((pipeline.won / totalClosed) * 100) : 0;

        // Expected revenue
        const { data: wonLeads } = await supabase.from('erp_crm_leads').select('expected_amount').eq('stage', 'won');
        pipeline.total_won_amount = (wonLeads || []).reduce((s, l) => s + Number(l.expected_amount || 0), 0);

        return Response.json({ rows: data || [], total: count || 0, page, limit, pipeline });
      }

      /* ===================== 庫存警示儀表板 ===================== */
      case 'stock_alerts': {
        const { data: lowStock } = await supabase
          .from('quickbuy_products')
          .select('item_number, description, stock_qty, safety_stock')
          .gt('safety_stock', 0)
          .not('item_number', 'is', null)
          .order('stock_qty', { ascending: true });

        const alerts = (lowStock || [])
          .filter(p => (p.stock_qty || 0) <= (p.safety_stock || 0))
          .map(p => ({
            ...p,
            deficit: (p.safety_stock || 0) - (p.stock_qty || 0),
            urgency: (p.stock_qty || 0) === 0 ? 'critical' : (p.stock_qty || 0) <= Math.floor((p.safety_stock || 0) / 2) ? 'high' : 'medium',
          }));

        return Response.json({ alerts, total: alerts.length });
      }

      /* ===================== 發票管理 ===================== */
      case 'invoices': {
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseLimit(30, 100);
        const offset = (page - 1) * limit;
        const statusFilter = (searchParams.get('status') || '').trim();
        const paymentFilter = (searchParams.get('payment_status') || '').trim();

        let query = supabase.from('erp_invoices').select('*', { count: 'exact' })
          .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
        if (statusFilter) query = query.eq('status', statusFilter);
        if (paymentFilter) query = query.eq('payment_status', paymentFilter);

        const { data, count, error } = await query;
        if (error) { if (isMissingRelationError(error)) return missingRelationResponse(error, 'erp_invoices'); return Response.json({ error: error.message }, { status: 500 }); }

        // Summary
        const [unpaidRes, paidRes, overdueRes] = await Promise.all([
          supabase.from('erp_invoices').select('total_amount').eq('payment_status', 'unpaid'),
          supabase.from('erp_invoices').select('total_amount').eq('payment_status', 'paid'),
          supabase.from('erp_invoices').select('total_amount').eq('payment_status', 'unpaid').lt('due_date', new Date().toISOString().slice(0, 10)),
        ]);
        const sum = (arr) => (arr || []).reduce((s, r) => s + Number(r.total_amount || 0), 0);

        return Response.json({
          rows: data || [], total: count || 0, page, limit,
          summary: {
            unpaid_amount: sum(unpaidRes.data),
            unpaid_count: (unpaidRes.data || []).length,
            paid_amount: sum(paidRes.data),
            paid_count: (paidRes.data || []).length,
            overdue_amount: sum(overdueRes.data),
            overdue_count: (overdueRes.data || []).length,
          },
        });
      }

      /* ===================== 簽核審批 ===================== */
      case 'approvals': {
        const statusFilter = (searchParams.get('status') || '').trim();
        const docType = (searchParams.get('doc_type') || '').trim();
        let query = supabase.from('erp_approvals').select('*').order('created_at', { ascending: false });
        if (statusFilter) query = query.eq('status', statusFilter);
        if (docType) query = query.eq('doc_type', docType);
        const { data, error } = await query;
        if (error) { if (isMissingRelationError(error)) return missingRelationResponse(error, 'erp_approvals'); return Response.json({ error: error.message }, { status: 500 }); }

        // Enrich each approval with related doc details (order/sale customer + items)
        // Helper: fetch customer's historical order summary with item details
        const fetchCustomerHistory = async (customerId) => {
          if (!customerId) return null;
          try {
            const { data: orders } = await supabase.from('erp_orders').select('id, order_no, total_amount, created_at, status').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(10);
            if (!orders || orders.length === 0) return null;
            const totalSpent = orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
            // Fetch items for each order
            const recentOrders = await Promise.all(orders.map(async (o) => {
              const { data: rawItems } = await supabase.from('erp_order_items').select('item_number_snapshot, description_snapshot, qty, unit_price, line_total').eq('order_id', o.id);
              const items = (rawItems || []).map(i => ({ item_number: i.item_number_snapshot, description: i.description_snapshot, quantity: i.qty, unit_price: i.unit_price, subtotal: i.line_total }));
              return { order_id: o.id, order_no: o.order_no, amount: o.total_amount, date: o.created_at?.slice(0, 10), status: o.status, items };
            }));
            return { order_count: orders.length, total_spent: totalSpent, recent_orders: recentOrders };
          } catch (_) { return null; }
        };

        const enriched = await Promise.all((data || []).map(async (a) => {
          try {
            if (a.doc_type === 'order' && a.doc_id) {
              const { data: order } = await supabase.from('erp_orders').select('id, order_no, total_amount, customer_id, customer:erp_customers(name, company_name, phone)').eq('id', a.doc_id).maybeSingle();
              const { data: rawItems } = await supabase.from('erp_order_items').select('item_number_snapshot, description_snapshot, qty, unit_price, line_total').eq('order_id', a.doc_id);
              const items = (rawItems || []).map(i => ({ item_number: i.item_number_snapshot, description: i.description_snapshot, quantity: i.qty, unit_price: i.unit_price, subtotal: i.line_total }));
              const customerHistory = await fetchCustomerHistory(order?.customer_id);
              return { ...a, amount: a.amount || order?.total_amount || null, customer: order?.customer || null, items, customer_history: customerHistory };
            }
            if (a.doc_type === 'sale' && a.doc_id) {
              const { data: sale } = await supabase.from('qb_sales_history').select('id, slip_number, total_amount, customer_id, customer:erp_customers(name, company_name, phone)').eq('id', a.doc_id).maybeSingle();
              const { data: rawItems } = await supabase.from('erp_order_items').select('item_number_snapshot, description_snapshot, qty, unit_price, line_total').eq('sale_ref', a.doc_id);
              const items = (rawItems || []).map(i => ({ item_number: i.item_number_snapshot, description: i.description_snapshot, quantity: i.qty, unit_price: i.unit_price, subtotal: i.line_total }));
              const customerHistory = await fetchCustomerHistory(sale?.customer_id);
              return { ...a, amount: a.amount || sale?.total_amount || null, customer: sale?.customer || null, items, customer_history: customerHistory };
            }
            if (a.doc_type === 'purchase_order' && a.doc_id) {
              const { data: po } = await supabase.from('erp_purchase_orders').select('id, po_number, total_amount, vendor:erp_vendors(name, company_name)').eq('id', a.doc_id).maybeSingle();
              const { data: rawItems } = await supabase.from('erp_purchase_order_items').select('item_number, description, qty, unit_cost, line_total').eq('po_id', a.doc_id);
              const items = (rawItems || []).map(i => ({ item_number: i.item_number, description: i.description, quantity: i.qty, unit_price: i.unit_cost, subtotal: i.line_total }));
              return { ...a, amount: a.amount || po?.total_amount || null, vendor: po?.vendor || null, items };
            }
          } catch (_) { /* ignore enrichment errors */ }
          return a;
        }));

        const pendingCount = enriched.filter(a => a.status === 'pending').length;
        return Response.json({ rows: enriched, total: enriched.length, pending_count: pendingCount });
      }

      /* ===================== 客服工單 ===================== */
      case 'tickets': {
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseLimit(30, 100);
        const offset = (page - 1) * limit;
        const statusFilter = (searchParams.get('status') || '').trim();

        let query = supabase.from('erp_tickets').select('*', { count: 'exact' })
          .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
        if (statusFilter) query = query.eq('status', statusFilter);

        const { data, count, error } = await query;
        if (error) { if (isMissingRelationError(error)) return missingRelationResponse(error, 'erp_tickets'); return Response.json({ error: error.message }, { status: 500 }); }

        const [openRes, progressRes, resolvedRes] = await Promise.all([
          supabase.from('erp_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
          supabase.from('erp_tickets').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
          supabase.from('erp_tickets').select('*', { count: 'exact', head: true }).eq('status', 'resolved'),
        ]);

        return Response.json({
          rows: data || [], total: count || 0, page, limit,
          summary: { open: openRes.count || 0, in_progress: progressRes.count || 0, resolved: resolvedRes.count || 0 },
        });
      }

      case 'ticket_detail': {
        const ticketId = searchParams.get('ticket_id');
        if (!ticketId) return Response.json({ error: 'ticket_id required' }, { status: 400 });
        const { data: ticket } = await supabase.from('erp_tickets').select('*').eq('id', ticketId).maybeSingle();
        const { data: replies } = await supabase.from('erp_ticket_replies').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true });
        return Response.json({ ticket, replies: replies || [] });
      }

      case 'quote_detail': {
        const quoteId = searchParams.get('quote_id');
        if (!quoteId) return Response.json({ error: 'Missing quote_id' }, { status: 400 });
        const { data: items } = await supabase.from('erp_quote_items').select('*').eq('quote_id', quoteId).order('id');
        // Enrich items with stock info
        const productIds = (items || []).map(i => i.product_id).filter(Boolean);
        let stockMap = {};
        if (productIds.length > 0) {
          const { data: stockRows } = await supabase.from('erp_products').select('id, stock_qty').in('id', productIds);
          (stockRows || []).forEach(s => { stockMap[s.id] = Number(s.stock_qty) || 0; });
        }
        const enrichedItems = (items || []).map(i => {
          const stockQty = stockMap[i.product_id] || 0;
          const needed = Number(i.qty) || 0;
          const stockStatus = stockQty >= needed ? 'sufficient' : stockQty > 0 ? 'partial' : 'no_stock';
          return { ...i, stock_qty: stockQty, stock_status: stockStatus, shortage: needed > stockQty ? needed - stockQty : 0 };
        });
        const { data: quote } = await supabase.from('erp_quotes').select('*, customer:erp_customers(name, company_name, phone, email, tax_id, address)').eq('id', quoteId).maybeSingle();

        // Build timeline events
        const timeline = [];
        if (quote) {
          timeline.push({ event: '建立報價單', time: quote.created_at, status: 'done' });
          if (quote.status === 'sent' || quote.status === 'approved' || quote.status === 'converted' || quote.status === 'closed') {
            timeline.push({ event: '已發送客戶', time: quote.updated_at, status: 'done' });
          }
          // Check linked order
          const { data: linkedOrder } = await supabase.from('erp_orders').select('id, order_no, status, created_at').eq('quote_id', quoteId).maybeSingle();
          if (linkedOrder) {
            timeline.push({ event: `轉為訂單 ${linkedOrder.order_no}`, time: linkedOrder.created_at, status: 'done' });
            // Check approvals on the order
            const { data: approvals } = await supabase.from('erp_approvals').select('status, created_at, approved_at, approved_by, doc_type').eq('doc_id', linkedOrder.id.toString()).order('created_at', { ascending: true });
            if (approvals && approvals.length > 0) {
              for (const ap of approvals) {
                timeline.push({ event: `${ap.doc_type === 'sale' ? '銷貨單' : '訂單'}送審`, time: ap.created_at, status: 'done' });
                if (ap.status === 'approved') {
                  timeline.push({ event: `${ap.doc_type === 'sale' ? '銷貨單' : '訂單'}已核准`, time: ap.approved_at || ap.created_at, status: 'done', by: ap.approved_by });
                } else if (ap.status === 'rejected') {
                  timeline.push({ event: `${ap.doc_type === 'sale' ? '銷貨單' : '訂單'}已駁回`, time: ap.approved_at || ap.created_at, status: 'rejected', by: ap.approved_by });
                } else {
                  timeline.push({ event: `${ap.doc_type === 'sale' ? '銷貨單' : '訂單'}審核中`, time: null, status: 'pending' });
                }
              }
            }
            // Check linked sales
            const { data: linkedSales } = await supabase.from('qb_sales_history').select('id, slip_number, status, created_at').eq('erp_order_id', linkedOrder.id).order('created_at', { ascending: true });
            if (linkedSales && linkedSales.length > 0) {
              for (const sale of linkedSales) {
                timeline.push({ event: `建立銷貨單 ${sale.slip_number}`, time: sale.created_at, status: 'done' });
              }
            }
          }
          // Valid until marker
          if (quote.valid_until) {
            const now = new Date();
            const validDate = new Date(quote.valid_until + 'T23:59:59');
            if (validDate < now && quote.status !== 'converted' && quote.status !== 'closed') {
              timeline.push({ event: '報價已過期', time: quote.valid_until, status: 'expired' });
            }
          }
        }

        return Response.json({ quote, items: enrichedItems || [], timeline });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
}
