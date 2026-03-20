// lib/admin/actions-post.js — 所有 POST action handlers
import { supabase } from '@/lib/supabase';
import {
  cleanCsvValue, toNumber, toDateValue, normalizeRows, parseBatchNumber,
  isMissingRelationError, missingRelationResponse,
  insertSingleWithColumnFallback, insertManyWithColumnFallback,
  deleteAllRows,
} from './utils';
import { appendImportHistory, upsertQuickbuyConfigEntry } from './config';
import { runErpCustomerQuery } from './erp-customers';

export async function handlePostAction(action, body) {
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
          const customerCodes = [...new Set(safeRows.map((row) => cleanCsvValue(row.customer_code)).filter(Boolean))];
          let existingMap = {};

          if (customerCodes.length > 0) {
            const { data: existingRows, error: existingError } = await supabase
              .from('erp_customers')
              .select('id,customer_code,display_name,source,customer_stage,status,notes')
              .in('customer_code', customerCodes);

            if (existingError) return Response.json({ error: existingError.message }, { status: 500 });
            existingMap = Object.fromEntries((existingRows || []).map((row) => [row.customer_code, row]));
          }

          const upsertPayload = [];
          const insertWithoutCodePayload = [];

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
              const existing = existingMap[customerCode];
              if (existing?.id) {
                updated += 1;
                upsertPayload.push({
                  ...payload,
                  source: existing.source || payload.source,
                  display_name: existing.display_name || payload.display_name,
                  customer_stage: existing.customer_stage || payload.customer_stage,
                  status: existing.status || payload.status,
                  notes: existing.notes && payload.notes ? `${existing.notes} | ${payload.notes}` : existing.notes || payload.notes,
                });
              } else {
                inserted += 1;
                upsertPayload.push(payload);
              }
              continue;
            }

            inserted += 1;
            insertWithoutCodePayload.push(payload);
          }

          if (upsertPayload.length > 0) {
            const { error } = await supabase
              .from('erp_customers')
              .upsert(upsertPayload, { onConflict: 'customer_code' });
            if (error) return Response.json({ error: error.message }, { status: 500 });
          }

          if (insertWithoutCodePayload.length > 0) {
            const { error } = await supabase.from('erp_customers').insert(insertWithoutCodePayload);
            if (error) return Response.json({ error: error.message }, { status: 500 });
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
        await upsertQuickbuyConfigEntry('pricing_rules', rules);
        return Response.json({ success: true });
      }

      case 'update_ai_prompt': {
        const { prompt } = body;
        await upsertQuickbuyConfigEntry('ai_system_prompt', prompt);
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

      case 'update_product_master': {
        const { item_number, product } = body;

        if (!item_number || !product) {
          return Response.json({ error: 'item_number and product are required' }, { status: 400 });
        }

        const payload = {
          description: cleanCsvValue(product.description),
          us_price: product.us_price === '' || product.us_price === null || product.us_price === undefined ? null : toNumber(product.us_price),
          tw_retail_price: toNumber(product.tw_retail_price),
          tw_reseller_price: toNumber(product.tw_reseller_price),
          product_status: cleanCsvValue(product.product_status) || 'Current',
          category: cleanCsvValue(product.category) || 'other',
          replacement_model: cleanCsvValue(product.replacement_model),
          weight_kg: product.weight_kg === '' || product.weight_kg === null || product.weight_kg === undefined ? null : toNumber(product.weight_kg),
          origin_country: cleanCsvValue(product.origin_country),
          search_text: cleanCsvValue(product.search_text),
        };

        const { error } = await supabase
          .from('quickbuy_products')
          .update(payload)
          .eq('item_number', item_number);

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true });
      }

      case 'reset_erp_business_data': {
        const { confirmation } = body;

        if (confirmation !== 'RESET ERP') {
          return Response.json({ error: 'Confirmation phrase mismatch' }, { status: 400 });
        }

        await deleteAllRows('erp_quote_items', 'id');
        await deleteAllRows('erp_quotes', 'id');
        await deleteAllRows('erp_order_items', 'id');
        await deleteAllRows('erp_orders', 'id');
        await deleteAllRows('qb_order_items', 'id');
        await deleteAllRows('qb_invoices', 'id');
        await deleteAllRows('qb_sales_history', 'id');
        await deleteAllRows('erp_profit_analysis', 'id');
        await deleteAllRows('erp_sales_return_summary', 'id');
        await deleteAllRows('erp_vendors', 'id');
        await deleteAllRows('erp_customers', 'id');
        await deleteAllRows('quickbuy_products', 'item_number');

        await appendImportHistory({
          dataset: 'system_reset',
          file_name: null,
          count: 0,
          imported_at: new Date().toISOString(),
          imported_by: 'admin',
          notes: 'RESET ERP business data',
        });

        return Response.json({
          success: true,
          cleared_tables: [
            'erp_quote_items',
            'erp_quotes',
            'erp_order_items',
            'erp_orders',
            'qb_order_items',
            'qb_invoices',
            'qb_sales_history',
            'erp_profit_analysis',
            'erp_sales_return_summary',
            'erp_vendors',
            'erp_customers',
            'quickbuy_products',
          ],
        });
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
                : 0,
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

        const {
          data: quote,
          error: quoteError,
        } = await insertSingleWithColumnFallback('erp_quotes', {
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
        });

        if (quoteError) {
          if (isMissingRelationError(quoteError)) return missingRelationResponse(quoteError, 'public.erp_quotes');
          return Response.json({ error: quoteError.message }, { status: 500 });
        }

        const itemPayload = safeItems.map((item) => ({
          quote_id: quote.id,
          ...item,
        }));

        const { error: itemError } = await insertManyWithColumnFallback('erp_quote_items', itemPayload);

        if (itemError) {
          await supabase.from('erp_quotes').delete().eq('id', quote.id);
          if (isMissingRelationError(itemError)) return missingRelationResponse(itemError, 'public.erp_quote_items');
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

        if (quoteError) {
          if (isMissingRelationError(quoteError)) return missingRelationResponse(quoteError, 'public.erp_quotes');
          return Response.json({ error: quoteError.message }, { status: 500 });
        }
        if (!quote) return Response.json({ error: 'Quote not found' }, { status: 404 });

        const { data: quoteItems, error: itemFetchError } = await supabase
          .from('erp_quote_items')
          .select('*')
          .eq('quote_id', quote_id)
          .order('id', { ascending: true });

        if (itemFetchError) {
          if (isMissingRelationError(itemFetchError)) return missingRelationResponse(itemFetchError, 'public.erp_quote_items');
          return Response.json({ error: itemFetchError.message }, { status: 500 });
        }
        if (!quoteItems?.length) return Response.json({ error: 'Quote items are missing' }, { status: 400 });

        const orderNo = `SO${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;

        const {
          data: order,
          error: orderError,
        } = await insertSingleWithColumnFallback('erp_orders', {
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
        });

        if (orderError) {
          if (isMissingRelationError(orderError)) return missingRelationResponse(orderError, 'public.erp_orders');
          return Response.json({ error: orderError.message }, { status: 500 });
        }

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

        const { error: orderItemsError } = await insertManyWithColumnFallback('erp_order_items', orderItems);

        if (orderItemsError) {
          await supabase.from('erp_orders').delete().eq('id', order.id);
          if (isMissingRelationError(orderItemsError)) return missingRelationResponse(orderItemsError, 'public.erp_order_items');
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

      case 'convert_order_to_sale': {
        const { order_id } = body;

        if (!order_id) {
          return Response.json({ error: 'order_id is required' }, { status: 400 });
        }

        const { data: order, error: orderError } = await supabase
          .from('erp_orders')
          .select('*')
          .eq('id', order_id)
          .maybeSingle();

        if (orderError) {
          if (isMissingRelationError(orderError)) return missingRelationResponse(orderError, 'public.erp_orders');
          return Response.json({ error: orderError.message }, { status: 500 });
        }
        if (!order) return Response.json({ error: 'Order not found' }, { status: 404 });

        const existingSlipPrefix = cleanCsvValue(order.order_no) || '';
        const { data: existingSale } = await supabase
          .from('qb_sales_history')
          .select('id,slip_number')
          .ilike('slip_number', `%${existingSlipPrefix}%`)
          .limit(1)
          .maybeSingle();

        if (existingSale) {
          return Response.json({ error: `此訂單可能已轉銷貨：${existingSale.slip_number || ''}`.trim() }, { status: 400 });
        }

        const { data: orderItems, error: orderItemsError } = await supabase
          .from('erp_order_items')
          .select('*')
          .eq('order_id', order_id)
          .order('id', { ascending: true });

        if (orderItemsError) {
          if (isMissingRelationError(orderItemsError)) return missingRelationResponse(orderItemsError, 'public.erp_order_items');
          return Response.json({ error: orderItemsError.message }, { status: 500 });
        }
        if (!orderItems?.length) return Response.json({ error: 'Order items are missing' }, { status: 400 });

        const { data: customer } = await runErpCustomerQuery((columns) =>
          supabase
            .from('erp_customers')
            .select(columns)
            .eq('id', order.customer_id)
            .maybeSingle()
        );

        const saleDate = toDateValue(order.order_date) || new Date().toISOString().slice(0, 10);
        const slipNumber = cleanCsvValue(order.order_no)
          ? `銷 ${String(order.order_no).trim()}`
          : `銷 ${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
        const invoiceNumber = cleanCsvValue(order.order_no) ? `INV-${String(order.order_no).slice(-8)}` : null;
        const legacyOrderId = /^\d+$/.test(String(order.id || '')) ? Number(order.id) : null;

        const {
          data: sale,
          error: saleError,
        } = await insertSingleWithColumnFallback('qb_sales_history', {
          sale_date: saleDate,
          slip_number: slipNumber,
          invoice_number: invoiceNumber,
          customer_name: cleanCsvValue(customer?.company_name) || cleanCsvValue(customer?.name) || '未命名客戶',
          sales_person: 'admin',
          subtotal: toNumber(order.subtotal),
          tax: toNumber(order.tax_amount),
          total: toNumber(order.total_amount),
          cost: orderItems.reduce((sum, item) => sum + (Number(item.cost_price_snapshot || 0) * Number(item.qty || 0)), 0),
          gross_profit: toNumber(order.total_amount) - orderItems.reduce((sum, item) => sum + (Number(item.cost_price_snapshot || 0) * Number(item.qty || 0)), 0),
          profit_margin: toNumber(order.total_amount) > 0
            ? `${(((toNumber(order.total_amount) - orderItems.reduce((sum, item) => sum + (Number(item.cost_price_snapshot || 0) * Number(item.qty || 0)), 0)) / toNumber(order.total_amount)) * 100).toFixed(2)}%`
            : null,
        });

        if (saleError) {
          if (isMissingRelationError(saleError)) return missingRelationResponse(saleError, 'public.qb_sales_history');
          return Response.json({ error: saleError.message }, { status: 500 });
        }

        const salesLinkId = /^\d+$/.test(String(sale?.id || ''))
          ? Number(sale.id)
          : legacyOrderId;

        const salesItemsPayload = orderItems.map((item) => ({
          order_id: salesLinkId,
          item_number: item.item_number_snapshot || null,
          description: item.description_snapshot || null,
          quantity: Math.max(1, Number(item.qty || 1)),
          unit_price: toNumber(item.unit_price),
          subtotal: toNumber(item.line_total),
          stock_status: 'sold',
          estimated_arrival: null,
          notes: slipNumber,
        }));

        const { error: salesItemsError } = salesItemsPayload.length
          ? await insertManyWithColumnFallback('qb_order_items', salesItemsPayload)
          : { error: null };

        if (salesItemsError) {
          await supabase.from('qb_sales_history').delete().eq('id', sale.id);
          if (isMissingRelationError(salesItemsError)) return missingRelationResponse(salesItemsError, 'public.qb_order_items');
          return Response.json({ error: salesItemsError.message }, { status: 500 });
        }

        if (customer?.company_name || customer?.tax_id) {
          const { error: invoiceError } = await insertSingleWithColumnFallback('qb_invoices', {
            invoice_number: invoiceNumber || slipNumber.replace(/\s+/g, ''),
            order_id: salesLinkId,
            customer_id: null,
            invoice_type: customer?.tax_id ? 'triplicate' : 'duplicate',
            tax_id: cleanCsvValue(customer?.tax_id),
            company_name: cleanCsvValue(customer?.company_name),
            amount: toNumber(order.subtotal),
            tax_amount: toNumber(order.tax_amount),
            issued_at: new Date().toISOString(),
            notes: cleanCsvValue(order.remark),
          });

          if (invoiceError) {
            if (isMissingRelationError(invoiceError)) return missingRelationResponse(invoiceError, 'public.qb_invoices');
            await supabase
              .from('erp_orders')
              .update({ status: 'completed', shipping_status: 'shipped' })
              .eq('id', order.id);
            return Response.json({
              success: true,
              sale,
              count: salesItemsPayload.length,
              warning: `銷貨單已建立，但發票未建立：${invoiceError.message}`,
            });
          }
        }

        await supabase
          .from('erp_orders')
          .update({ status: 'completed', shipping_status: 'shipped' })
          .eq('id', order.id);

        return Response.json({
          success: true,
          sale,
          count: salesItemsPayload.length,
        });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
}
