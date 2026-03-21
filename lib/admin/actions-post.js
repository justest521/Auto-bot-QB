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

      /* ===================== 庫存異動 ===================== */
      case 'inventory_adjust': {
        const { item_number, movement_type, quantity, notes } = body;
        if (!item_number || !movement_type || !quantity) {
          return Response.json({ error: 'item_number, movement_type, quantity are required' }, { status: 400 });
        }

        const qty = Number(quantity);
        if (!Number.isFinite(qty) || qty === 0) {
          return Response.json({ error: 'quantity must be a non-zero number' }, { status: 400 });
        }

        // Record movement
        const { error: mvError } = await supabase.from('qb_inventory_movements').insert({
          item_number,
          movement_type,
          quantity: qty,
          reference_type: 'manual',
          notes: cleanCsvValue(notes) || `手動${movement_type === 'in' ? '入庫' : '出庫'}`,
          created_by: 'admin',
        });
        if (mvError) return Response.json({ error: mvError.message }, { status: 500 });

        // Update stock_qty on product
        const { data: product } = await supabase
          .from('quickbuy_products')
          .select('stock_qty')
          .eq('item_number', item_number)
          .maybeSingle();

        const currentQty = Number(product?.stock_qty || 0);
        const delta = movement_type === 'in' ? qty : -Math.abs(qty);
        const newQty = Math.max(0, currentQty + delta);

        const { error: updateError } = await supabase
          .from('quickbuy_products')
          .update({ stock_qty: newQty })
          .eq('item_number', item_number);

        if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

        return Response.json({ success: true, item_number, previous_qty: currentQty, new_qty: newQty, delta });
      }

      /* ===================== 收款記錄 ===================== */
      case 'create_payment': {
        const { order_id, amount, payment_method, payment_date, bank_last5, notes } = body;
        if (!order_id || !amount) {
          return Response.json({ error: 'order_id and amount are required' }, { status: 400 });
        }

        const paymentNo = `PAY${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
        const { data, error } = await insertSingleWithColumnFallback('qb_payments', {
          payment_number: paymentNo,
          order_id: Number(order_id),
          amount: toNumber(amount),
          payment_method: cleanCsvValue(payment_method) || 'transfer',
          payment_date: toDateValue(payment_date) || new Date().toISOString().slice(0, 10),
          bank_last5: cleanCsvValue(bank_last5),
          status: 'pending',
          notes: cleanCsvValue(notes),
        });

        if (error) {
          if (isMissingRelationError(error)) return missingRelationResponse(error, 'qb_payments');
          return Response.json({ error: error.message }, { status: 500 });
        }

        return Response.json({ success: true, payment: data });
      }

      case 'confirm_payment': {
        const { payment_id } = body;
        if (!payment_id) return Response.json({ error: 'payment_id is required' }, { status: 400 });

        const { data, error } = await supabase
          .from('qb_payments')
          .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), confirmed_by: 'admin' })
          .eq('id', payment_id)
          .select()
          .single();

        if (error) return Response.json({ error: error.message }, { status: 500 });

        // Update order payment_status if all paid
        if (data?.order_id) {
          const { data: order } = await supabase.from('erp_orders').select('total_amount').eq('id', data.order_id).maybeSingle();
          if (!order) {
            // Try qb_sales_history by id
          }
          const { data: payments } = await supabase
            .from('qb_payments')
            .select('amount')
            .eq('order_id', data.order_id)
            .eq('status', 'confirmed');

          const totalPaid = (payments || []).reduce((s, r) => s + Number(r.amount || 0), 0);
          const orderTotal = Number(order?.total_amount || 0);

          if (orderTotal > 0 && totalPaid >= orderTotal) {
            await supabase.from('erp_orders').update({ payment_status: 'paid' }).eq('id', data.order_id);
          } else if (totalPaid > 0) {
            await supabase.from('erp_orders').update({ payment_status: 'partial' }).eq('id', data.order_id);
          }
        }

        return Response.json({ success: true, payment: data });
      }

      /* ===================== 出貨管理 ===================== */
      case 'create_shipment': {
        const { order_id, carrier, tracking_no, shipping_address, remark, items } = body;
        if (!order_id) return Response.json({ error: 'order_id is required' }, { status: 400 });

        const shipmentNo = `SHP${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;

        // Get order to find customer
        const { data: order } = await supabase.from('erp_orders').select('customer_id').eq('id', order_id).maybeSingle();

        const { data: shipment, error: shipError } = await insertSingleWithColumnFallback('erp_shipments', {
          shipment_no: shipmentNo,
          order_id,
          customer_id: order?.customer_id || null,
          carrier: cleanCsvValue(carrier),
          tracking_no: cleanCsvValue(tracking_no),
          status: 'pending',
          shipping_address: cleanCsvValue(shipping_address),
          remark: cleanCsvValue(remark),
        });

        if (shipError) {
          if (isMissingRelationError(shipError)) return missingRelationResponse(shipError, 'erp_shipments');
          return Response.json({ error: shipError.message }, { status: 500 });
        }

        // Insert shipment items if provided
        const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
        if (safeItems.length > 0) {
          const itemPayload = safeItems.map((it) => ({
            shipment_id: shipment.id,
            item_number: cleanCsvValue(it.item_number),
            description: cleanCsvValue(it.description),
            qty_shipped: toNumber(it.qty_shipped) || toNumber(it.qty),
          }));
          await insertManyWithColumnFallback('erp_shipment_items', itemPayload);
        }

        // Update order shipping_status
        await supabase.from('erp_orders').update({ shipping_status: 'shipped' }).eq('id', order_id);

        return Response.json({ success: true, shipment });
      }

      case 'update_shipment_status': {
        const { shipment_id, status } = body;
        if (!shipment_id || !status) return Response.json({ error: 'shipment_id and status are required' }, { status: 400 });

        const { data, error } = await supabase
          .from('erp_shipments')
          .update({ status })
          .eq('id', shipment_id)
          .select()
          .single();

        if (error) return Response.json({ error: error.message }, { status: 500 });

        // If delivered, update order shipping_status
        if (status === 'delivered' && data?.order_id) {
          await supabase.from('erp_orders').update({ shipping_status: 'delivered' }).eq('id', data.order_id);
        }

        return Response.json({ success: true, shipment: data });
      }

      /* ===================== 退貨管理 ===================== */
      case 'create_return': {
        const { sale_id, order_id, customer_id, reason, remark, items } = body;
        if (!items?.length) return Response.json({ error: 'items are required' }, { status: 400 });

        const returnNo = `RTN${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
        const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
        const refundAmount = safeItems.reduce((s, it) => s + Number(it.line_total || 0), 0);

        const { data: ret, error: retError } = await insertSingleWithColumnFallback('erp_returns', {
          return_no: returnNo,
          sale_id: sale_id ? Number(sale_id) : null,
          order_id: order_id || null,
          customer_id: customer_id || null,
          reason: cleanCsvValue(reason),
          status: 'pending',
          refund_amount: refundAmount,
          remark: cleanCsvValue(remark),
        });

        if (retError) {
          if (isMissingRelationError(retError)) return missingRelationResponse(retError, 'erp_returns');
          return Response.json({ error: retError.message }, { status: 500 });
        }

        const itemPayload = safeItems.map((it) => ({
          return_id: ret.id,
          item_number: cleanCsvValue(it.item_number),
          description: cleanCsvValue(it.description),
          qty_returned: toNumber(it.qty_returned) || 1,
          unit_price: toNumber(it.unit_price),
          line_total: toNumber(it.line_total),
          reason: cleanCsvValue(it.reason),
        }));

        if (itemPayload.length > 0) {
          await insertManyWithColumnFallback('erp_return_items', itemPayload);
        }

        // Restore inventory for returned items
        for (const it of itemPayload) {
          if (it.item_number && it.qty_returned > 0) {
            await supabase.from('qb_inventory_movements').insert({
              item_number: it.item_number,
              movement_type: 'in',
              quantity: it.qty_returned,
              reference_type: 'return',
              reference_id: ret.id,
              notes: `退貨入庫 ${returnNo}`,
              created_by: 'admin',
            });
            // Update stock
            const { data: prod } = await supabase.from('quickbuy_products').select('stock_qty').eq('item_number', it.item_number).maybeSingle();
            if (prod) {
              await supabase.from('quickbuy_products').update({ stock_qty: Number(prod.stock_qty || 0) + it.qty_returned }).eq('item_number', it.item_number);
            }
          }
        }

        return Response.json({ success: true, return_doc: ret, count: itemPayload.length });
      }

      case 'approve_return': {
        const { return_id } = body;
        if (!return_id) return Response.json({ error: 'return_id is required' }, { status: 400 });

        const { data, error } = await supabase
          .from('erp_returns')
          .update({ status: 'approved' })
          .eq('id', return_id)
          .select()
          .single();

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true, return_doc: data });
      }

      /* ===================== 詢價管理 ===================== */
      case 'create_inquiry': {
        const { customer_id, subject, description, priority, items } = body;
        if (!subject) return Response.json({ error: 'subject is required' }, { status: 400 });

        const inquiryNo = `INQ${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;

        const { data: inquiry, error: inqError } = await insertSingleWithColumnFallback('erp_inquiries', {
          inquiry_no: inquiryNo,
          customer_id: customer_id || null,
          subject: cleanCsvValue(subject),
          description: cleanCsvValue(description),
          priority: cleanCsvValue(priority) || 'normal',
          status: 'open',
        });

        if (inqError) {
          if (isMissingRelationError(inqError)) return missingRelationResponse(inqError, 'erp_inquiries');
          return Response.json({ error: inqError.message }, { status: 500 });
        }

        const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
        if (safeItems.length > 0) {
          const itemPayload = safeItems.map((it) => ({
            inquiry_id: inquiry.id,
            item_number: cleanCsvValue(it.item_number),
            description: cleanCsvValue(it.description),
            qty: toNumber(it.qty) || 1,
            remark: cleanCsvValue(it.remark),
          }));
          await insertManyWithColumnFallback('erp_inquiry_items', itemPayload);
        }

        return Response.json({ success: true, inquiry, count: safeItems.length });
      }

      case 'update_inquiry_status': {
        const { inquiry_id, status } = body;
        if (!inquiry_id || !status) return Response.json({ error: 'inquiry_id and status are required' }, { status: 400 });

        const { data, error } = await supabase
          .from('erp_inquiries')
          .update({ status })
          .eq('id', inquiry_id)
          .select()
          .single();

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true, inquiry: data });
      }

      /* ===================== 報價到期檢查 ===================== */
      case 'expire_quotes': {
        const today = new Date().toISOString().slice(0, 10);
        const { data, error } = await supabase
          .from('erp_quotes')
          .update({ status: 'expired' })
          .lt('valid_until', today)
          .in('status', ['draft', 'sent'])
          .select('id');

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true, expired_count: data?.length || 0 });
      }

      /* ===================== 採購單 ===================== */
      case 'create_purchase_order': {
        const { vendor_id, expected_date, remark, items } = body;
        const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
        if (!safeItems.length) return Response.json({ error: 'items are required' }, { status: 400 });

        const poNo = `PO${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
        const subtotal = safeItems.reduce((s, it) => s + Number(it.line_total || 0), 0);
        const taxAmt = Math.round(subtotal * 0.05);

        const { data: po, error: poErr } = await insertSingleWithColumnFallback('erp_purchase_orders', {
          po_no: poNo, vendor_id: vendor_id ? Number(vendor_id) : null,
          expected_date: toDateValue(expected_date), status: 'draft',
          subtotal, tax_amount: taxAmt, total_amount: subtotal + taxAmt,
          remark: cleanCsvValue(remark),
        });
        if (poErr) { if (isMissingRelationError(poErr)) return missingRelationResponse(poErr, 'erp_purchase_orders'); return Response.json({ error: poErr.message }, { status: 500 }); }

        const itemPayload = safeItems.map(it => ({
          po_id: po.id, item_number: cleanCsvValue(it.item_number),
          description: cleanCsvValue(it.description),
          qty: toNumber(it.qty) || 1, unit_cost: toNumber(it.unit_cost),
          line_total: toNumber(it.line_total),
        }));
        await insertManyWithColumnFallback('erp_purchase_order_items', itemPayload);

        return Response.json({ success: true, purchase_order: po, count: itemPayload.length });
      }

      case 'confirm_purchase_order': {
        const { po_id } = body;
        if (!po_id) return Response.json({ error: 'po_id is required' }, { status: 400 });
        const { data, error } = await supabase.from('erp_purchase_orders').update({ status: 'confirmed' }).eq('id', po_id).select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true, purchase_order: data });
      }

      /* ===================== 進貨單 (入庫) ===================== */
      case 'create_stock_in': {
        const { po_id, vendor_id, remark, items } = body;
        const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
        if (!safeItems.length) return Response.json({ error: 'items are required' }, { status: 400 });

        const siNo = `SI${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
        const totalAmt = safeItems.reduce((s, it) => s + Number(it.line_total || 0), 0);

        const { data: si, error: siErr } = await insertSingleWithColumnFallback('erp_stock_ins', {
          stock_in_no: siNo, po_id: po_id || null,
          vendor_id: vendor_id ? Number(vendor_id) : null,
          status: 'pending', total_amount: totalAmt,
          remark: cleanCsvValue(remark),
        });
        if (siErr) { if (isMissingRelationError(siErr)) return missingRelationResponse(siErr, 'erp_stock_ins'); return Response.json({ error: siErr.message }, { status: 500 }); }

        const itemPayload = safeItems.map(it => ({
          stock_in_id: si.id, item_number: cleanCsvValue(it.item_number),
          description: cleanCsvValue(it.description),
          qty_received: toNumber(it.qty_received) || toNumber(it.qty) || 1,
          unit_cost: toNumber(it.unit_cost), line_total: toNumber(it.line_total),
        }));
        await insertManyWithColumnFallback('erp_stock_in_items', itemPayload);

        return Response.json({ success: true, stock_in: si, count: itemPayload.length });
      }

      case 'confirm_stock_in': {
        const { stock_in_id } = body;
        if (!stock_in_id) return Response.json({ error: 'stock_in_id is required' }, { status: 400 });

        const { data: si, error: siErr } = await supabase.from('erp_stock_ins').update({ status: 'confirmed' }).eq('id', stock_in_id).select().single();
        if (siErr) return Response.json({ error: siErr.message }, { status: 500 });

        // Increase stock for each item
        const { data: items } = await supabase.from('erp_stock_in_items').select('item_number,qty_received').eq('stock_in_id', stock_in_id);
        for (const it of (items || [])) {
          if (!it.item_number || !it.qty_received) continue;
          const { data: prod } = await supabase.from('quickbuy_products').select('stock_qty').eq('item_number', it.item_number).maybeSingle();
          if (prod) {
            await supabase.from('quickbuy_products').update({ stock_qty: Number(prod.stock_qty || 0) + Number(it.qty_received) }).eq('item_number', it.item_number);
          }
          await supabase.from('qb_inventory_movements').insert({
            item_number: it.item_number, movement_type: 'in', quantity: it.qty_received,
            reference_type: 'stock_in', reference_id: stock_in_id,
            notes: `進貨入庫 ${si.stock_in_no}`, created_by: 'admin',
          });
        }

        // Update PO status if linked
        if (si.po_id) {
          await supabase.from('erp_purchase_orders').update({ status: 'received' }).eq('id', si.po_id);
        }

        return Response.json({ success: true, stock_in: si });
      }

      /* ===================== 進貨退出 ===================== */
      case 'create_purchase_return': {
        const { stock_in_id, vendor_id, reason, remark, items } = body;
        const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
        if (!safeItems.length) return Response.json({ error: 'items are required' }, { status: 400 });

        const retNo = `PR${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
        const totalAmt = safeItems.reduce((s, it) => s + Number(it.line_total || 0), 0);

        const { data: ret, error: retErr } = await insertSingleWithColumnFallback('erp_purchase_returns', {
          return_no: retNo, stock_in_id: stock_in_id || null,
          vendor_id: vendor_id ? Number(vendor_id) : null,
          reason: cleanCsvValue(reason), status: 'pending',
          total_amount: totalAmt, remark: cleanCsvValue(remark),
        });
        if (retErr) { if (isMissingRelationError(retErr)) return missingRelationResponse(retErr, 'erp_purchase_returns'); return Response.json({ error: retErr.message }, { status: 500 }); }

        const itemPayload = safeItems.map(it => ({
          return_id: ret.id, item_number: cleanCsvValue(it.item_number),
          description: cleanCsvValue(it.description),
          qty_returned: toNumber(it.qty_returned) || 1,
          unit_cost: toNumber(it.unit_cost), line_total: toNumber(it.line_total),
        }));
        await insertManyWithColumnFallback('erp_purchase_return_items', itemPayload);

        // Decrease stock for returned items
        for (const it of itemPayload) {
          if (!it.item_number || !it.qty_returned) continue;
          const { data: prod } = await supabase.from('quickbuy_products').select('stock_qty').eq('item_number', it.item_number).maybeSingle();
          if (prod) {
            await supabase.from('quickbuy_products').update({ stock_qty: Math.max(0, Number(prod.stock_qty || 0) - it.qty_returned) }).eq('item_number', it.item_number);
          }
          await supabase.from('qb_inventory_movements').insert({
            item_number: it.item_number, movement_type: 'out', quantity: it.qty_returned,
            reference_type: 'purchase_return', reference_id: ret.id,
            notes: `進貨退出 ${retNo}`, created_by: 'admin',
          });
        }

        return Response.json({ success: true, purchase_return: ret, count: itemPayload.length });
      }

      /* ===================== 付款單 ===================== */
      case 'create_vendor_payment': {
        const { vendor_id, po_id, amount, payment_method, payment_date, bank_info, remark } = body;
        if (!amount) return Response.json({ error: 'amount is required' }, { status: 400 });

        const payNo = `VP${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
        const { data, error } = await insertSingleWithColumnFallback('erp_vendor_payments', {
          payment_no: payNo, vendor_id: vendor_id ? Number(vendor_id) : null,
          po_id: po_id || null, amount: toNumber(amount),
          payment_method: cleanCsvValue(payment_method) || 'transfer',
          payment_date: toDateValue(payment_date) || new Date().toISOString().slice(0, 10),
          status: 'pending', bank_info: cleanCsvValue(bank_info),
          remark: cleanCsvValue(remark),
        });
        if (error) { if (isMissingRelationError(error)) return missingRelationResponse(error, 'erp_vendor_payments'); return Response.json({ error: error.message }, { status: 500 }); }
        return Response.json({ success: true, payment: data });
      }

      case 'confirm_vendor_payment': {
        const { payment_id } = body;
        if (!payment_id) return Response.json({ error: 'payment_id is required' }, { status: 400 });
        const { data, error } = await supabase.from('erp_vendor_payments').update({ status: 'confirmed' }).eq('id', payment_id).select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true, payment: data });
      }

      /* ===================== 盤點 ===================== */
      case 'create_stocktake': {
        const { remark } = body;
        const stNo = `ST${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;

        const { data: st, error: stErr } = await insertSingleWithColumnFallback('erp_stocktakes', {
          stocktake_no: stNo, status: 'draft', remark: cleanCsvValue(remark),
        });
        if (stErr) return Response.json({ error: stErr.message }, { status: 500 });

        // Auto-populate items from all products with stock > 0 or safety_stock > 0
        const { data: products } = await supabase.from('quickbuy_products')
          .select('item_number,description,stock_qty')
          .or('stock_qty.gt.0,safety_stock.gt.0')
          .order('item_number')
          .limit(2000);

        if (products?.length) {
          const stItems = products.map(p => ({
            stocktake_id: st.id, item_number: p.item_number,
            description: p.description, system_qty: Number(p.stock_qty || 0),
            actual_qty: Number(p.stock_qty || 0),
          }));
          await insertManyWithColumnFallback('erp_stocktake_items', stItems);
        }

        return Response.json({ success: true, stocktake: st, item_count: products?.length || 0 });
      }

      case 'update_stocktake_item': {
        const { item_id, actual_qty } = body;
        if (!item_id) return Response.json({ error: 'item_id is required' }, { status: 400 });

        const { data, error } = await supabase.from('erp_stocktake_items')
          .update({ actual_qty: toNumber(actual_qty) })
          .eq('id', item_id).select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true, item: data });
      }

      case 'complete_stocktake': {
        const { stocktake_id } = body;
        if (!stocktake_id) return Response.json({ error: 'stocktake_id is required' }, { status: 400 });

        // Get items with differences
        const { data: items } = await supabase.from('erp_stocktake_items')
          .select('item_number,system_qty,actual_qty,diff_qty')
          .eq('stocktake_id', stocktake_id);

        const diffs = (items || []).filter(it => Number(it.diff_qty || 0) !== 0);

        // Apply adjustments
        for (const it of diffs) {
          const diff = Number(it.diff_qty);
          const { data: prod } = await supabase.from('quickbuy_products').select('stock_qty').eq('item_number', it.item_number).maybeSingle();
          if (prod) {
            await supabase.from('quickbuy_products').update({ stock_qty: Number(it.actual_qty) }).eq('item_number', it.item_number);
          }
          await supabase.from('qb_inventory_movements').insert({
            item_number: it.item_number, movement_type: diff > 0 ? 'in' : 'out',
            quantity: Math.abs(diff), reference_type: 'stocktake', reference_id: stocktake_id,
            notes: `盤點調整 系統${it.system_qty}→實際${it.actual_qty}`, created_by: 'admin',
          });
        }

        await supabase.from('erp_stocktakes').update({ status: 'completed' }).eq('id', stocktake_id);

        return Response.json({ success: true, adjusted_count: diffs.length });
      }

      /* ===================== 調整單 ===================== */
      case 'create_stock_adjustment': {
        const { reason, remark, items } = body;
        const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
        if (!safeItems.length) return Response.json({ error: 'items are required' }, { status: 400 });

        const adjNo = `ADJ${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
        const { data: adj, error: adjErr } = await insertSingleWithColumnFallback('erp_stock_adjustments', {
          adjustment_no: adjNo, reason: cleanCsvValue(reason), status: 'confirmed',
          remark: cleanCsvValue(remark),
        });
        if (adjErr) return Response.json({ error: adjErr.message }, { status: 500 });

        const itemPayload = [];
        for (const it of safeItems) {
          const itemNum = cleanCsvValue(it.item_number);
          if (!itemNum) continue;
          const { data: prod } = await supabase.from('quickbuy_products').select('stock_qty').eq('item_number', itemNum).maybeSingle();
          const beforeQty = Number(prod?.stock_qty || 0);
          const adjustQty = toNumber(it.adjust_qty);
          const afterQty = Math.max(0, beforeQty + adjustQty);

          itemPayload.push({
            adjustment_id: adj.id, item_number: itemNum,
            description: cleanCsvValue(it.description),
            before_qty: beforeQty, adjust_qty: adjustQty, after_qty: afterQty,
          });

          await supabase.from('quickbuy_products').update({ stock_qty: afterQty }).eq('item_number', itemNum);
          await supabase.from('qb_inventory_movements').insert({
            item_number: itemNum, movement_type: adjustQty >= 0 ? 'in' : 'out',
            quantity: Math.abs(adjustQty), reference_type: 'adjustment', reference_id: adj.id,
            notes: `調整單 ${adjNo} ${cleanCsvValue(reason) || ''}`.trim(), created_by: 'admin',
          });
        }

        if (itemPayload.length) await insertManyWithColumnFallback('erp_stock_adjustment_items', itemPayload);

        return Response.json({ success: true, adjustment: adj, count: itemPayload.length });
      }

      case 'create_dealer_user': {
        const { username, password, display_name, role, company_name, phone, email, price_level } = body;
        if (!username || !password || !display_name) return Response.json({ error: '帳號、密碼、姓名為必填' }, { status: 400 });
        if (!['dealer', 'sales', 'technician'].includes(role)) return Response.json({ error: '角色無效' }, { status: 400 });

        const crypto = await import('crypto');
        const hash = crypto.createHash('sha256').update(password + (process.env.DEALER_SALT || 'qb_dealer_2024')).digest('hex');

        const { data, error } = await supabase.from('erp_dealer_users').insert({
          username: username.trim().toLowerCase(),
          password_hash: hash,
          display_name,
          role,
          company_name: company_name || null,
          phone: phone || null,
          email: email || null,
          price_level: price_level || (role === 'dealer' ? 'reseller' : role === 'sales' ? 'reseller' : 'retail'),
        }).select().single();

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true, user: data });
      }

      case 'update_dealer_user': {
        const { user_id, ...updates } = body;
        if (!user_id) return Response.json({ error: 'user_id required' }, { status: 400 });

        const allowed = ['display_name', 'role', 'company_name', 'phone', 'email', 'price_level', 'can_see_stock', 'can_place_order', 'notify_on_arrival', 'status'];
        const payload = { updated_at: new Date().toISOString() };
        for (const key of allowed) {
          if (updates[key] !== undefined) payload[key] = updates[key];
        }

        // Handle password reset
        if (updates.new_password) {
          const crypto = await import('crypto');
          payload.password_hash = crypto.createHash('sha256').update(updates.new_password + (process.env.DEALER_SALT || 'qb_dealer_2024')).digest('hex');
        }

        const { error } = await supabase.from('erp_dealer_users').update(payload).eq('id', user_id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true });
      }

      case 'update_dealer_order': {
        const { order_id, status, remark } = body;
        if (!order_id) return Response.json({ error: 'order_id required' }, { status: 400 });
        const updates = { updated_at: new Date().toISOString() };
        if (status) updates.status = status;
        if (remark !== undefined) updates.remark = remark;
        const { error } = await supabase.from('erp_orders').update(updates).eq('id', order_id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true, message: '訂單已更新' });
      }

      case 'update_dealer_order_item': {
        const { item_id, qty, remark } = body;
        if (!item_id) return Response.json({ error: 'item_id required' }, { status: 400 });
        const updates = {};
        if (qty !== undefined) {
          updates.qty = Number(qty);
          updates.line_total = Number(qty) * (body.unit_price || 0);
        }
        if (remark !== undefined) updates.remark = remark;
        const { error } = await supabase.from('erp_order_items').update(updates).eq('id', item_id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true });
      }

      case 'create_announcement': {
        const { title, content, type, target_roles, priority } = body;
        if (!title) return Response.json({ error: '標題為必填' }, { status: 400 });
        const { data, error } = await supabase.from('erp_announcements').insert({
          title, content: content || '', type: type || 'info',
          target_roles: target_roles || [], priority: priority || 0, is_active: true,
        }).select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ announcement: data, message: '公告已發布' });
      }

      case 'update_announcement': {
        const { announcement_id, ...fields } = body;
        if (!announcement_id) return Response.json({ error: 'announcement_id required' }, { status: 400 });
        const allowed = ['title', 'content', 'type', 'target_roles', 'is_active', 'priority'];
        const updates = { updated_at: new Date().toISOString() };
        for (const k of allowed) { if (fields[k] !== undefined) updates[k] = fields[k]; }
        const { error } = await supabase.from('erp_announcements').update(updates).eq('id', announcement_id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true, message: '公告已更新' });
      }

      case 'delete_announcement': {
        const { announcement_id } = body;
        if (!announcement_id) return Response.json({ error: 'announcement_id required' }, { status: 400 });
        const { error } = await supabase.from('erp_announcements').delete().eq('id', announcement_id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true });
      }

      case 'consolidate_orders_to_po': {
        const { order_ids, vendor_id } = body;
        if (!order_ids?.length) return Response.json({ error: '請選擇至少一筆訂單' }, { status: 400 });

        // Get all order items from selected orders
        const { data: allItems, error: itemsErr } = await supabase
          .from('erp_order_items')
          .select('*')
          .in('order_id', order_ids);

        if (itemsErr) return Response.json({ error: itemsErr.message }, { status: 500 });
        if (!allItems?.length) return Response.json({ error: '選取的訂單沒有明細' }, { status: 400 });

        // Consolidate by item_number: sum quantities
        const consolidated = {};
        for (const item of allItems) {
          const key = item.item_number_snapshot || item.description_snapshot || `item_${item.id}`;
          if (!consolidated[key]) {
            consolidated[key] = {
              item_number: item.item_number_snapshot || '',
              description: item.description_snapshot || '',
              qty: 0,
              unit_cost: Number(item.cost_price_snapshot || item.unit_price || 0),
            };
          }
          consolidated[key].qty += Number(item.qty || 1);
        }

        const poItems = Object.values(consolidated);
        const poTotal = poItems.reduce((s, i) => s + i.unit_cost * i.qty, 0);
        const poNo = `PO${Date.now()}`;

        // Create PO
        const { data: po, error: poErr } = await insertSingleWithColumnFallback('erp_purchase_orders', {
          po_no: poNo,
          vendor_id: vendor_id || null,
          po_date: new Date().toISOString().slice(0, 10),
          status: 'draft',
          total_amount: poTotal,
          remark: `彙整自 ${order_ids.length} 筆訂單`,
        });

        if (poErr) return Response.json({ error: poErr.message }, { status: 500 });

        // Create PO items
        const poItemsPayload = poItems.map((i) => ({
          po_id: po.id,
          item_number: i.item_number,
          description: i.description,
          qty: i.qty,
          unit_cost: i.unit_cost,
          line_total: i.unit_cost * i.qty,
        }));

        if (poItemsPayload.length) {
          await insertManyWithColumnFallback('erp_purchase_order_items', poItemsPayload);
        }

        // Update order statuses to 'purchasing'
        await supabase.from('erp_orders').update({ status: 'purchasing' }).in('id', order_ids);

        return Response.json({
          success: true,
          po: { ...po, items: poItemsPayload },
          consolidated_count: poItems.length,
          order_count: order_ids.length,
          message: `已建立採購單 ${poNo}，合併 ${poItems.length} 項商品`,
        });
      }

      /* ===================== 訂單確認 → 自動扣庫存 + 缺貨檢查 ===================== */
      case 'confirm_order_with_stock': {
        const { order_id } = body;
        if (!order_id) return Response.json({ error: 'order_id required' }, { status: 400 });

        // Get order items
        const { data: items, error: itemsErr } = await supabase
          .from('erp_order_items')
          .select('item_number_snapshot, qty')
          .eq('order_id', order_id);
        if (itemsErr) return Response.json({ error: itemsErr.message }, { status: 500 });

        const stockIssues = [];
        const reorderNeeded = [];

        // Check and deduct stock for each item
        for (const item of (items || [])) {
          if (!item.item_number_snapshot) continue;
          const { data: product } = await supabase
            .from('quickbuy_products')
            .select('item_number, description, stock_qty, safety_stock')
            .eq('item_number', item.item_number_snapshot)
            .single();

          if (!product) continue;
          const currentStock = product.stock_qty || 0;
          const orderQty = Number(item.qty || 0);

          if (currentStock < orderQty) {
            stockIssues.push({ item_number: item.item_number_snapshot, needed: orderQty, available: currentStock });
          }

          // Deduct stock (allow negative to show deficit)
          const newStock = currentStock - orderQty;
          await supabase
            .from('quickbuy_products')
            .update({ stock_qty: newStock, updated_at: new Date().toISOString() })
            .eq('item_number', item.item_number_snapshot);

          // Check if below safety stock → auto reorder suggestion
          if (newStock <= (product.safety_stock || 0) && (product.safety_stock || 0) > 0) {
            reorderNeeded.push({
              item_number: product.item_number,
              description: product.description,
              current_stock: newStock,
              safety_stock: product.safety_stock || 0,
              suggested_qty: Math.max((product.safety_stock || 0) * 2 - newStock, 1),
              status: 'pending',
            });
          }
        }

        // Create reorder suggestions for items that don't already have pending ones
        if (reorderNeeded.length > 0) {
          const itemNums = reorderNeeded.map(r => r.item_number);
          const { data: existing } = await supabase
            .from('erp_reorder_suggestions')
            .select('item_number')
            .in('item_number', itemNums)
            .eq('status', 'pending');
          const existingSet = new Set((existing || []).map(e => e.item_number));
          const newSuggestions = reorderNeeded.filter(r => !existingSet.has(r.item_number));
          if (newSuggestions.length > 0) {
            await supabase.from('erp_reorder_suggestions').insert(newSuggestions);
          }
        }

        // Update order status
        await supabase.from('erp_orders').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', order_id);

        return Response.json({
          success: true,
          stock_issues: stockIssues,
          reorder_created: reorderNeeded.length,
          message: stockIssues.length > 0
            ? `訂單已確認，但有 ${stockIssues.length} 項庫存不足，已自動建立補貨建議`
            : '訂單已確認，庫存已扣除',
        });
      }

      /* ===================== 進貨確認 → 自動加庫存 ===================== */
      case 'confirm_stock_in_with_inventory': {
        const { stock_in_id } = body;
        if (!stock_in_id) return Response.json({ error: 'stock_in_id required' }, { status: 400 });

        // Check current status
        const { data: si } = await supabase.from('erp_stock_ins').select('status').eq('id', stock_in_id).single();
        if (si?.status === 'confirmed') return Response.json({ error: '此進貨單已確認' }, { status: 400 });

        // Get stock-in items
        const { data: siItems } = await supabase
          .from('erp_stock_in_items')
          .select('item_number, qty_received')
          .eq('stock_in_id', stock_in_id);

        let updatedCount = 0;
        for (const item of (siItems || [])) {
          if (!item.item_number) continue;
          const { data: product } = await supabase
            .from('quickbuy_products')
            .select('stock_qty')
            .eq('item_number', item.item_number)
            .single();

          if (product) {
            const newStock = (product.stock_qty || 0) + (item.qty_received || 0);
            await supabase
              .from('quickbuy_products')
              .update({ stock_qty: newStock, updated_at: new Date().toISOString() })
              .eq('item_number', item.item_number);
            updatedCount++;
          }

          // Clear any pending reorder suggestions for this item
          await supabase
            .from('erp_reorder_suggestions')
            .update({ status: 'fulfilled' })
            .eq('item_number', item.item_number)
            .eq('status', 'pending');
        }

        // Update stock-in status
        await supabase.from('erp_stock_ins').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', stock_in_id);

        return Response.json({
          success: true,
          updated_products: updatedCount,
          message: `進貨已確認，${updatedCount} 項商品庫存已增加`,
        });
      }

      /* ===================== 補貨建議 → 轉採購單 ===================== */
      case 'reorder_to_po': {
        const { suggestion_ids, vendor_id } = body;
        if (!suggestion_ids?.length) return Response.json({ error: '請選擇至少一項補貨建議' }, { status: 400 });

        const { data: suggestions } = await supabase
          .from('erp_reorder_suggestions')
          .select('*')
          .in('id', suggestion_ids)
          .eq('status', 'pending');

        if (!suggestions?.length) return Response.json({ error: '沒有待處理的建議' }, { status: 400 });

        const poNo = `PO${Date.now()}`;
        const poTotal = suggestions.reduce((s, r) => s + (r.suggested_qty || 0) * 1, 0); // unit cost unknown yet

        const { data: po, error: poErr } = await insertSingleWithColumnFallback('erp_purchase_orders', {
          po_no: poNo,
          vendor_id: vendor_id || null,
          po_date: new Date().toISOString().slice(0, 10),
          status: 'draft',
          total_amount: 0,
          remark: `自動補貨：${suggestions.length} 項商品低於安全庫存`,
        });

        if (poErr) return Response.json({ error: poErr.message }, { status: 500 });

        const poItems = suggestions.map(s => ({
          po_id: po.id,
          item_number: s.item_number,
          description: s.description || '',
          qty: s.suggested_qty,
          unit_cost: 0,
          line_total: 0,
        }));

        if (poItems.length) {
          await insertManyWithColumnFallback('erp_purchase_order_items', poItems);
        }

        // Mark suggestions as converted
        await supabase
          .from('erp_reorder_suggestions')
          .update({ status: 'converted', po_id: po.id })
          .in('id', suggestion_ids);

        return Response.json({
          success: true,
          po_no: poNo,
          items_count: poItems.length,
          message: `已建立採購單 ${poNo}，包含 ${poItems.length} 項商品`,
        });
      }

      /* ===================== CRM 線索 CRUD ===================== */
      case 'create_lead': {
        const { customer_name, contact_name, phone, email, source, expected_amount, notes, assigned_to } = body;
        if (!customer_name) return Response.json({ error: '客戶名稱為必填' }, { status: 400 });
        const leadNo = `L${Date.now()}`;
        const { data, error } = await supabase.from('erp_crm_leads').insert({
          lead_no: leadNo, customer_name, contact_name: contact_name || '', phone: phone || '',
          email: email || '', source: source || 'manual', stage: 'new',
          expected_amount: expected_amount || 0, assigned_to: assigned_to || '',
          notes: notes || '', probability: 10,
        }).select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ lead: data, message: `線索 ${leadNo} 已建立` });
      }

      case 'update_lead': {
        const { lead_id, ...fields } = body;
        if (!lead_id) return Response.json({ error: 'lead_id required' }, { status: 400 });
        const allowed = ['customer_name', 'contact_name', 'phone', 'email', 'stage', 'expected_amount', 'probability', 'assigned_to', 'notes', 'lost_reason'];
        const updates = { updated_at: new Date().toISOString() };
        for (const k of allowed) { if (fields[k] !== undefined) updates[k] = fields[k]; }
        // Auto-set won_date
        if (fields.stage === 'won') updates.won_date = new Date().toISOString();
        if (fields.stage === 'won') updates.probability = 100;
        if (fields.stage === 'lost') updates.probability = 0;
        const { error } = await supabase.from('erp_crm_leads').update(updates).eq('id', lead_id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true });
      }

      case 'delete_lead': {
        const { lead_id } = body;
        if (!lead_id) return Response.json({ error: 'lead_id required' }, { status: 400 });
        const { error } = await supabase.from('erp_crm_leads').delete().eq('id', lead_id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true });
      }

      case 'dismiss_reorder': {
        const { suggestion_id } = body;
        if (!suggestion_id) return Response.json({ error: 'suggestion_id required' }, { status: 400 });
        const { error } = await supabase.from('erp_reorder_suggestions').update({ status: 'dismissed' }).eq('id', suggestion_id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true });
      }

      /* ===================== 發票 CRUD ===================== */
      case 'create_invoice_from_order': {
        const { order_id } = body;
        if (!order_id) return Response.json({ error: 'order_id required' }, { status: 400 });

        const { data: order } = await supabase.from('erp_orders').select('*').eq('id', order_id).single();
        if (!order) return Response.json({ error: '找不到訂單' }, { status: 400 });

        // Check if invoice already exists
        const { data: existing } = await supabase.from('erp_invoices').select('id').eq('order_id', order_id).limit(1);
        if (existing?.length) return Response.json({ error: '此訂單已有發票' }, { status: 400 });

        const invoiceNo = `INV${Date.now()}`;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);

        const { data: inv, error } = await supabase.from('erp_invoices').insert({
          invoice_no: invoiceNo,
          order_id: order.id,
          customer_id: order.customer_id,
          invoice_date: new Date().toISOString().slice(0, 10),
          due_date: dueDate.toISOString().slice(0, 10),
          status: 'issued',
          subtotal: order.subtotal || order.total_amount || 0,
          tax_amount: order.tax_amount || 0,
          total_amount: order.total_amount || 0,
          payment_status: 'unpaid',
          remark: `來自訂單 ${order.order_no || order.id}`,
        }).select().single();

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ invoice: inv, message: `發票 ${invoiceNo} 已建立` });
      }

      case 'record_payment': {
        const { invoice_id, amount } = body;
        if (!invoice_id || !amount) return Response.json({ error: 'invoice_id 和 amount 為必填' }, { status: 400 });

        const { data: inv } = await supabase.from('erp_invoices').select('*').eq('id', invoice_id).single();
        if (!inv) return Response.json({ error: '找不到發票' }, { status: 400 });

        const newPaid = Number(inv.paid_amount || 0) + Number(amount);
        const total = Number(inv.total_amount || 0);
        const paymentStatus = newPaid >= total ? 'paid' : 'partial';

        const { error } = await supabase.from('erp_invoices').update({
          paid_amount: newPaid,
          payment_status: paymentStatus,
          updated_at: new Date().toISOString(),
        }).eq('id', invoice_id);

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true, paid_amount: newPaid, payment_status: paymentStatus, message: paymentStatus === 'paid' ? '已全額收款' : `已收款 NT$${newPaid.toLocaleString()}` });
      }

      /* ===================== 簽核審批 ===================== */
      case 'submit_approval': {
        const { doc_type, doc_id, doc_no, requested_by } = body;
        if (!doc_type || !doc_id) return Response.json({ error: 'doc_type 和 doc_id 為必填' }, { status: 400 });

        // Check if already pending
        const { data: existing } = await supabase.from('erp_approvals').select('id').eq('doc_id', doc_id).eq('status', 'pending').limit(1);
        if (existing?.length) return Response.json({ error: '此文件已在簽核中' }, { status: 400 });

        const { data, error } = await supabase.from('erp_approvals').insert({
          doc_type, doc_id, doc_no: doc_no || '', requested_by: requested_by || 'system', status: 'pending',
        }).select().single();

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ approval: data, message: '已送出簽核' });
      }

      case 'process_approval': {
        const { approval_id, action: approvalAction, approved_by, rejected_reason } = body;
        if (!approval_id || !approvalAction) return Response.json({ error: 'approval_id 和 action 為必填' }, { status: 400 });

        const { data: approval } = await supabase.from('erp_approvals').select('*').eq('id', approval_id).single();
        if (!approval) return Response.json({ error: '找不到簽核單' }, { status: 400 });
        if (approval.status !== 'pending') return Response.json({ error: '此簽核單已處理' }, { status: 400 });

        const newStatus = approvalAction === 'approve' ? 'approved' : 'rejected';
        await supabase.from('erp_approvals').update({
          status: newStatus,
          approved_by: approved_by || 'admin',
          approved_at: new Date().toISOString(),
          rejected_reason: rejected_reason || null,
        }).eq('id', approval_id);

        // If approved, auto-confirm the source document
        if (newStatus === 'approved') {
          if (approval.doc_type === 'purchase_order') {
            await supabase.from('erp_purchase_orders').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', approval.doc_id);
          } else if (approval.doc_type === 'quote') {
            await supabase.from('erp_quotes').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', approval.doc_id);
          } else if (approval.doc_type === 'order') {
            await supabase.from('erp_orders').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', approval.doc_id);
          }
        }

        return Response.json({ success: true, message: newStatus === 'approved' ? '已核准，原始文件已自動確認' : '已退回' });
      }

      /* ===================== 客服工單 ===================== */
      case 'create_ticket': {
        const { customer_name, customer_id, line_user_id, channel, subject, description, priority, assigned_to } = body;
        if (!subject) return Response.json({ error: '主題為必填' }, { status: 400 });
        const ticketNo = `TK${Date.now()}`;
        const { data, error } = await supabase.from('erp_tickets').insert({
          ticket_no: ticketNo, customer_name: customer_name || '', customer_id: customer_id || null,
          line_user_id: line_user_id || null, channel: channel || 'manual',
          subject, description: description || '', priority: priority || 'medium',
          status: 'open', assigned_to: assigned_to || '',
        }).select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ticket: data, message: `工單 ${ticketNo} 已建立` });
      }

      case 'update_ticket': {
        const { ticket_id, ...fields } = body;
        if (!ticket_id) return Response.json({ error: 'ticket_id required' }, { status: 400 });
        const allowed = ['status', 'priority', 'assigned_to', 'resolution', 'subject'];
        const updates = { updated_at: new Date().toISOString() };
        for (const k of allowed) { if (fields[k] !== undefined) updates[k] = fields[k]; }
        if (fields.status === 'resolved') updates.resolved_at = new Date().toISOString();
        const { error } = await supabase.from('erp_tickets').update(updates).eq('id', ticket_id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true });
      }

      case 'reply_ticket': {
        const { ticket_id, message, sender } = body;
        if (!ticket_id || !message) return Response.json({ error: 'ticket_id 和 message 為必填' }, { status: 400 });
        const { error } = await supabase.from('erp_ticket_replies').insert({
          ticket_id, message, sender: sender || 'staff',
        });
        if (error) return Response.json({ error: error.message }, { status: 500 });
        // Auto update ticket to in_progress if still open
        await supabase.from('erp_tickets').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', ticket_id).eq('status', 'open');
        return Response.json({ success: true });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
}
