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

// Generate sequential PO number: PO-YYYYMMDD-NNN
async function generatePoNo() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `PO-${today}-`;
  const { data } = await supabase
    .from('erp_purchase_orders')
    .select('po_no')
    .like('po_no', `${prefix}%`)
    .order('po_no', { ascending: false })
    .limit(1);
  const lastNo = data?.[0]?.po_no;
  const seq = lastNo ? parseInt(lastNo.split('-').pop(), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

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
          const payload = safeRows.map((row) => {
            const mapped = {
              item_number: cleanCsvValue(row.item_number),
              description: cleanCsvValue(row.description),
              tw_retail_price: toNumber(row.tw_retail_price),
              tw_reseller_price: toNumber(row.tw_reseller_price),
              us_price: toNumber(row.us_price),
              product_status: cleanCsvValue(row.product_status) || 'Current',
              category: cleanCsvValue(row.category) || 'other',
              replacement_model: cleanCsvValue(row.replacement_model),
              weight_kg: toNumber(row.weight_kg),
              origin_country: cleanCsvValue(row.origin_country),
              commodity_code: cleanCsvValue(row.commodity_code),
              search_text: cleanCsvValue(row.search_text),
            };
            // 移除值為 0 或空的欄位，避免覆蓋已有的資料
            Object.keys(mapped).forEach(k => {
              if (k === 'item_number') return; // 主鍵必留
              if (mapped[k] === '' || mapped[k] === null || mapped[k] === undefined) delete mapped[k];
              if (k !== 'product_status' && k !== 'category' && (mapped[k] === 0 || mapped[k] === '0')) delete mapped[k];
            });
            return mapped;
          }).filter((row) => row.item_number);

          // 同一批次內去重：相同品號只保留最後一筆
          const deduped = Object.values(
            payload.reduce((map, row) => { map[row.item_number] = { ...(map[row.item_number] || {}), ...row }; return map; }, {})
          );

          // Upsert: 有就更新、沒有就新增（不再全刪）
          const { error } = deduped.length
            ? await supabase.from('quickbuy_products').upsert(deduped, { onConflict: 'item_number', ignoreDuplicates: false })
            : { error: null };
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

        // ── 採購單匯入 (erp_purchase_orders: po_no, vendor_id bigint, po_date, expected_date, status, subtotal, tax_amount, total_amount, remark) ──
        if (dataset === 'erp_purchase_orders') {
          const payload = safeRows.map((row) => ({
            po_no: cleanCsvValue(row.po_number),
            vendor_id: null, // vendor FK is bigint, skip for CSV import
            po_date: toDateValue(row.po_date),
            expected_date: toDateValue(row.expected_date),
            status: cleanCsvValue(row.status) || 'confirmed',
            subtotal: toNumber(row.subtotal),
            tax_amount: toNumber(row.tax_amount),
            total_amount: toNumber(row.total_amount),
            remark: cleanCsvValue(row.remark),
          })).filter((row) => row.po_no);

          if (isFirstBatch) {
            await supabase.from('erp_purchase_order_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await supabase.from('erp_purchase_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          }
          const { error } = payload.length ? await supabase.from('erp_purchase_orders').insert(payload) : { error: null };
          if (error) return Response.json({ error: error.message }, { status: 500 });
          if (isLastBatch) {
            await appendImportHistory({ dataset, file_name: file_name || null, count: totalCount, imported_at: new Date().toISOString(), imported_by: 'admin' });
          }
          return Response.json({ success: true, count: payload.length, batch_index: batchIndex, batch_total: batchTotal });
        }

        // ── 進貨單匯入 (erp_stock_ins: stock_in_no, vendor_id bigint, stock_in_date, status, total_amount, remark) ──
        if (dataset === 'erp_stock_ins') {
          const payload = safeRows.map((row) => ({
            stock_in_no: cleanCsvValue(row.grn_number),
            vendor_id: null,
            stock_in_date: toDateValue(row.grn_date),
            status: cleanCsvValue(row.status) || 'confirmed',
            total_amount: toNumber(row.total_amount),
            remark: cleanCsvValue(row.remark),
          })).filter((row) => row.stock_in_no);

          if (isFirstBatch) {
            await supabase.from('erp_stock_in_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await supabase.from('erp_stock_ins').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          }
          const { error } = payload.length ? await supabase.from('erp_stock_ins').insert(payload) : { error: null };
          if (error) return Response.json({ error: error.message }, { status: 500 });
          if (isLastBatch) {
            await appendImportHistory({ dataset, file_name: file_name || null, count: totalCount, imported_at: new Date().toISOString(), imported_by: 'admin' });
          }
          return Response.json({ success: true, count: payload.length, batch_index: batchIndex, batch_total: batchTotal });
        }

        // ── 發票匯入 (erp_invoices: invoice_no, invoice_date, status, subtotal, tax_amount, total_amount, remark) ──
        if (dataset === 'erp_invoices') {
          const payload = safeRows.map((row) => ({
            invoice_no: cleanCsvValue(row.invoice_number),
            invoice_date: toDateValue(row.invoice_date),
            status: cleanCsvValue(row.status) || 'issued',
            subtotal: toNumber(row.amount),
            tax_amount: toNumber(row.tax_amount),
            total_amount: toNumber(row.total_amount),
            remark: cleanCsvValue(row.remark),
          })).filter((row) => row.invoice_no);

          if (isFirstBatch) {
            await supabase.from('erp_invoices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          }
          const { error } = payload.length ? await supabase.from('erp_invoices').insert(payload) : { error: null };
          if (error) return Response.json({ error: error.message }, { status: 500 });
          if (isLastBatch) {
            await appendImportHistory({ dataset, file_name: file_name || null, count: totalCount, imported_at: new Date().toISOString(), imported_by: 'admin' });
          }
          return Response.json({ success: true, count: payload.length, batch_index: batchIndex, batch_total: batchTotal });
        }

        // ── 庫存異動匯入 (qb_inventory_movements: item_number, movement_type, quantity, reference_type, notes) ──
        if (dataset === 'qb_inventory_movements') {
          const payload = safeRows.map((row) => ({
            item_number: cleanCsvValue(row._item_number),
            movement_type: cleanCsvValue(row.movement_type) || 'other',
            quantity: toNumber(row.quantity),
            reference_type: cleanCsvValue(row.reference_no) ? 'import' : null,
            notes: [cleanCsvValue(row.reference_no), cleanCsvValue(row.remark)].filter(Boolean).join(' | ') || null,
          })).filter((row) => row.item_number);

          if (isFirstBatch) {
            await supabase.from('qb_inventory_movements').delete().neq('id', 0);
          }
          const { error } = payload.length ? await supabase.from('qb_inventory_movements').insert(payload) : { error: null };
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

      case 'create_customer': {
        const { profile } = body;
        if (!profile || !profile.company_name) {
          return Response.json({ error: 'company_name is required' }, { status: 400 });
        }

        const { data: maxRow } = await supabase
          .from('erp_customers')
          .select('customer_code')
          .not('customer_code', 'is', null)
          .order('customer_code', { ascending: false })
          .limit(1);
        const maxCode = parseInt(maxRow?.[0]?.customer_code || '0', 10);
        const newCode = String(maxCode + 1).padStart(6, '0');

        const buildCustomerPayload = (p) => ({
          name: p.name || null,
          company_name: p.company_name || null,
          full_name: p.full_name || null,
          phone: p.phone || null,
          fax: p.fax || null,
          mobile: p.mobile || null,
          email: p.email || null,
          tax_id: p.tax_id || null,
          job_title: p.job_title || null,
          sales_person: p.sales_person || null,
          billing_customer: p.billing_customer || null,
          discount_percent: p.discount_percent === '' || p.discount_percent == null ? 0 : Number(p.discount_percent),
          stop_date: p.stop_date || null,
          invoice_email: p.invoice_email || null,
          invoice_mobile: p.invoice_mobile || null,
          carrier_type: p.carrier_type || null,
          carrier_code: p.carrier_code || null,
          bank_account: p.bank_account || null,
          payment_method: p.payment_method || null,
          payment_days: p.payment_days === '' || p.payment_days == null ? 0 : Number(p.payment_days),
          monthly_closing_day: p.monthly_closing_day === '' || p.monthly_closing_day == null ? null : Number(p.monthly_closing_day),
          collection_method: p.collection_method || null,
          collection_day: p.collection_day === '' || p.collection_day == null ? null : Number(p.collection_day),
          address: p.address || null,
          registered_address: p.registered_address || null,
          invoice_address: p.invoice_address || null,
          shipping_address: p.shipping_address || null,
          business_address: p.business_address || null,
          notes: p.notes || null,
        });

        const payload = {
          customer_code: newCode,
          customer_stage: 'customer',
          ...buildCustomerPayload(profile),
        };

        const { data: created, error } = await supabase
          .from('erp_customers')
          .insert(payload)
          .select('id,customer_code')
          .single();

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true, customer: created });
      }

      case 'update_customer_profile': {
        const { erp_customer_id, profile } = body;

        if (!erp_customer_id || !profile) {
          return Response.json({ error: 'erp_customer_id and profile are required' }, { status: 400 });
        }

        const buildCustomerPayload2 = (p) => ({
          name: p.name || null,
          company_name: p.company_name || null,
          full_name: p.full_name || null,
          phone: p.phone || null,
          fax: p.fax || null,
          mobile: p.mobile || null,
          email: p.email || null,
          tax_id: p.tax_id || null,
          job_title: p.job_title || null,
          sales_person: p.sales_person || null,
          billing_customer: p.billing_customer || null,
          discount_percent: p.discount_percent === '' || p.discount_percent == null ? 0 : Number(p.discount_percent),
          stop_date: p.stop_date || null,
          invoice_email: p.invoice_email || null,
          invoice_mobile: p.invoice_mobile || null,
          carrier_type: p.carrier_type || null,
          carrier_code: p.carrier_code || null,
          bank_account: p.bank_account || null,
          payment_method: p.payment_method || null,
          payment_days: p.payment_days === '' || p.payment_days == null ? 0 : Number(p.payment_days),
          monthly_closing_day: p.monthly_closing_day === '' || p.monthly_closing_day == null ? null : Number(p.monthly_closing_day),
          collection_method: p.collection_method || null,
          collection_day: p.collection_day === '' || p.collection_day == null ? null : Number(p.collection_day),
          address: p.address || null,
          registered_address: p.registered_address || null,
          invoice_address: p.invoice_address || null,
          shipping_address: p.shipping_address || null,
          business_address: p.business_address || null,
          notes: p.notes || null,
        });

        const payload = buildCustomerPayload2(profile);

        const { error } = await supabase
          .from('erp_customers')
          .update(payload)
          .eq('id', erp_customer_id);

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true });
      }

      case 'create_product': {
        const { product } = body;
        if (!product?.item_number || !product?.description) {
          return Response.json({ error: '品號和品名為必填' }, { status: 400 });
        }
        const createPayload = {
          item_number: cleanCsvValue(product.item_number),
          description: cleanCsvValue(product.description),
          us_price: toNumber(product.us_price),
          tw_retail_price: toNumber(product.tw_retail_price),
          tw_reseller_price: toNumber(product.tw_reseller_price),
          product_status: cleanCsvValue(product.product_status) || 'Current',
          category: cleanCsvValue(product.category) || 'other',
          replacement_model: cleanCsvValue(product.replacement_model) || '',
          weight_kg: toNumber(product.weight_kg),
          origin_country: cleanCsvValue(product.origin_country) || '',
          search_text: `${cleanCsvValue(product.item_number)} ${cleanCsvValue(product.description)}`.toLowerCase(),
          image_url: cleanCsvValue(product.image_url) || null,
        };
        const { error: createErr } = await supabase.from('quickbuy_products').insert(createPayload);
        if (createErr) return Response.json({ error: createErr.message }, { status: 500 });
        return Response.json({ success: true });
      }

      case 'upload_product_image': {
        const { item_number, image_base64, file_name } = body;
        if (!item_number) return Response.json({ error: 'item_number is required' }, { status: 400 });

        if (image_base64) {
          // Upload image to Supabase storage
          const match = image_base64.match(/^data:(image\/\w+);base64,(.+)$/);
          if (!match) return Response.json({ error: '無效的圖片格式' }, { status: 400 });
          const mimeType = match[1];
          const ext = mimeType.split('/')[1] || 'png';
          const buffer = Buffer.from(match[2], 'base64');
          const storagePath = `products/${item_number.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.${ext}`;

          const { error: uploadErr } = await supabase.storage
            .from('product-images')
            .upload(storagePath, buffer, { contentType: mimeType, upsert: true });
          if (uploadErr) return Response.json({ error: uploadErr.message }, { status: 500 });

          const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(storagePath);
          const publicUrl = urlData?.publicUrl || '';

          const { error: updateErr } = await supabase
            .from('quickbuy_products')
            .update({ image_url: publicUrl })
            .eq('item_number', item_number);
          if (updateErr) return Response.json({ error: updateErr.message }, { status: 500 });
          return Response.json({ success: true, image_url: publicUrl });
        } else {
          // Clear image
          const { error } = await supabase
            .from('quickbuy_products')
            .update({ image_url: null })
            .eq('item_number', item_number);
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ success: true, image_url: null });
        }
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
          image_url: product.image_url !== undefined ? (cleanCsvValue(product.image_url) || null) : undefined,
        };
        // Remove undefined fields
        Object.keys(payload).forEach(k => { if (payload[k] === undefined) delete payload[k]; });

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

      case 'create_order': {
        const {
          customer_id: orderCustomerId,
          order_date,
          status: orderStatus,
          remark: orderRemark,
          discount_amount: orderDiscount,
          shipping_fee: orderShipping,
          tax_amount: orderTaxInput,
          subtotal: orderSubtotalInput,
          total_amount: orderTotalInput,
          items: orderItems,
        } = body;

        const safeOrderItems = normalizeRows(orderItems)
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

        if (!orderCustomerId || !order_date || safeOrderItems.length === 0) {
          return Response.json({ error: 'customer_id, order_date and items are required' }, { status: 400 });
        }

        const orderSubtotal = safeOrderItems.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
        const safeOrderDiscount = toNumber(orderDiscount);
        const safeOrderShipping = toNumber(orderShipping);
        const orderTaxableBase = Math.max(0, orderSubtotal - safeOrderDiscount + safeOrderShipping);
        const orderTaxAmount = orderTaxInput != null ? toNumber(orderTaxInput) : Math.round(orderTaxableBase * 0.05);
        const orderTotalAmount = orderTotalInput != null ? toNumber(orderTotalInput) : (orderTaxableBase + orderTaxAmount);
        const newOrderNo = `DO${Date.now()}`;

        const {
          data: newOrder,
          error: newOrderError,
        } = await insertSingleWithColumnFallback('erp_orders', {
          order_no: newOrderNo,
          customer_id: orderCustomerId,
          order_date,
          status: cleanCsvValue(orderStatus) || 'draft',
          subtotal: orderSubtotal,
          discount_amount: safeOrderDiscount,
          shipping_fee: safeOrderShipping,
          tax_amount: orderTaxAmount,
          total_amount: orderTotalAmount,
          remark: cleanCsvValue(orderRemark),
          payment_status: 'unpaid',
          shipping_status: 'pending',
          created_by: 'admin',
        });

        if (newOrderError) {
          if (isMissingRelationError(newOrderError)) return missingRelationResponse(newOrderError, 'public.erp_orders');
          return Response.json({ error: newOrderError.message }, { status: 500 });
        }

        const orderItemPayload = safeOrderItems.map((item) => ({
          order_id: newOrder.id,
          ...item,
        }));

        const { error: orderItemError } = await insertManyWithColumnFallback('erp_order_items', orderItemPayload);

        if (orderItemError) {
          await supabase.from('erp_orders').delete().eq('id', newOrder.id);
          if (isMissingRelationError(orderItemError)) return missingRelationResponse(orderItemError, 'public.erp_order_items');
          return Response.json({ error: orderItemError.message }, { status: 500 });
        }

        return Response.json({
          success: true,
          order: newOrder,
          count: orderItemPayload.length,
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

        // Validate quote status — only allow conversion from approved or sent
        const allowedQuoteStatuses = ['approved', 'sent', 'draft'];
        if (quote.status === 'converted') return Response.json({ error: '此報價單已轉為訂單，不可重複轉換' }, { status: 400 });
        if (quote.status === 'rejected') return Response.json({ error: '此報價單已被駁回，不可轉為訂單' }, { status: 400 });
        if (quote.status === 'expired') return Response.json({ error: '此報價單已過期，不可轉為訂單' }, { status: 400 });

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

      /* convert_order_to_sale 已廢除 — 統一走 instock_to_sale（有庫存檢查+送審） */
      case 'convert_order_to_sale': {
        return Response.json({
          error: '此功能已停用。請改用「有貨轉銷貨」(instock_to_sale)，系統會自動檢查庫存並送審。',
        }, { status: 400 });
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
        const isUuid = /^[0-9a-f]{8}-/.test(String(order_id));
        const { data, error } = await insertSingleWithColumnFallback('qb_payments', {
          payment_number: paymentNo,
          order_id: isUuid ? null : Number(order_id),
          erp_order_id: isUuid ? order_id : null,
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
        // Check erp_order_id (UUID) first, fallback to order_id (bigint)
        const lookupId = data?.erp_order_id || data?.order_id;
        if (lookupId) {
          const { data: order } = await supabase.from('erp_orders').select('total_amount').eq('id', lookupId).maybeSingle();
          if (order) {
            const { data: payments } = await supabase
              .from('qb_payments')
              .select('amount')
              .or(`order_id.eq.${data.order_id},erp_order_id.eq.${data.erp_order_id}`)
              .eq('status', 'confirmed');

            const totalPaid = (payments || []).reduce((s, r) => s + Number(r.amount || 0), 0);
            const orderTotal = Number(order?.total_amount || 0);

            if (orderTotal > 0 && totalPaid >= orderTotal) {
              await supabase.from('erp_orders').update({ payment_status: 'paid' }).eq('id', lookupId);
            } else if (totalPaid > 0) {
              await supabase.from('erp_orders').update({ payment_status: 'partial' }).eq('id', lookupId);
            }
          }
        }

        return Response.json({ success: true, payment: data });
      }

      /* ===================== 出貨管理 ===================== */
      case 'create_shipment': {
        const { order_id, sale_id, carrier, tracking_no, shipping_address, remark, items, notify_line } = body;
        if (!order_id && !sale_id) return Response.json({ error: 'order_id or sale_id is required' }, { status: 400 });

        const shipmentNo = `SHP${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;

        // Get order info (from order_id or from sale's order link)
        let orderId = order_id;
        let customerId = null;
        let orderNo = '';

        if (order_id) {
          const { data: order } = await supabase.from('erp_orders').select('id, customer_id, order_no').eq('id', order_id).maybeSingle();
          customerId = order?.customer_id || null;
          orderNo = order?.order_no || '';
        } else if (sale_id) {
          // Try to find order from sale's slip_number
          const { data: sale } = await supabase.from('qb_sales_history').select('slip_number, customer_name').eq('id', sale_id).maybeSingle();
          if (sale?.slip_number) {
            const { data: order } = await supabase.from('erp_orders').select('id, customer_id, order_no').eq('order_no', sale.slip_number).maybeSingle();
            if (order) { orderId = order.id; customerId = order.customer_id; orderNo = order.order_no; }
          }
        }

        const { data: shipment, error: shipError } = await insertSingleWithColumnFallback('erp_shipments', {
          shipment_no: shipmentNo,
          order_id: orderId || null,
          customer_id: customerId,
          carrier: cleanCsvValue(carrier),
          tracking_no: cleanCsvValue(tracking_no),
          status: 'shipped',
          ship_date: new Date().toISOString().slice(0, 10),
          shipping_address: cleanCsvValue(shipping_address),
          remark: cleanCsvValue(remark),
        });

        if (shipError) {
          if (isMissingRelationError(shipError)) return missingRelationResponse(shipError, 'erp_shipments');
          return Response.json({ error: shipError.message }, { status: 500 });
        }

        // Insert shipment items if provided (partial shipment support)
        const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
        if (safeItems.length > 0) {
          const itemPayload = safeItems.map((it) => ({
            shipment_id: shipment.id,
            order_item_id: it.order_item_id || it.id || null,
            product_id: it.product_id || null,
            qty_shipped: toNumber(it.qty_shipped) || toNumber(it.qty),
          }));
          await insertManyWithColumnFallback('erp_shipment_items', itemPayload);
        }

        // Auto update order status
        if (orderId) {
          // Check if all items shipped (partial shipment logic)
          const { data: orderItems } = await supabase.from('erp_order_items').select('id, qty').eq('order_id', orderId);
          const { data: allShipmentItems } = await supabase
            .from('erp_shipment_items')
            .select('order_item_id, qty_shipped, erp_shipments!inner(order_id, status)')
            .eq('erp_shipments.order_id', orderId)
            .neq('erp_shipments.status', 'cancelled');

          // Calculate total shipped per order item
          const shippedMap = {};
          (allShipmentItems || []).forEach(si => {
            const key = si.order_item_id;
            if (key) shippedMap[key] = (shippedMap[key] || 0) + Number(si.qty_shipped || 0);
          });

          const allFullyShipped = (orderItems || []).every(oi => (shippedMap[oi.id] || 0) >= Number(oi.qty || 0));

          if (allFullyShipped) {
            await supabase.from('erp_orders').update({ shipping_status: 'shipped', status: 'shipped', updated_at: new Date().toISOString() }).eq('id', orderId);
          } else {
            // Partial shipment — mark as partial
            await supabase.from('erp_orders').update({ shipping_status: 'partial', updated_at: new Date().toISOString() }).eq('id', orderId);
          }
        }

        // LINE notification if requested
        if (notify_line && orderId) {
          try {
            const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
            if (lineToken) {
              const { data: orderWithCustomer } = await supabase
                .from('erp_orders')
                .select('*, erp_customers(name, company_name, line_user_id, line_notify_enabled)')
                .eq('id', orderId)
                .single();

              const customer = orderWithCustomer?.erp_customers;
              if (customer?.line_user_id && customer?.line_notify_enabled !== false) {
                const msg = `📦 出貨通知\n\n訂單 ${orderNo || orderId}\n物流商: ${carrier || '未填'}\n追蹤編號: ${tracking_no || '未填'}\n\n您的訂單已出貨，感謝您的訂購！`;
                await fetch('https://api.line.me/v2/bot/message/push', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lineToken}` },
                  body: JSON.stringify({ to: customer.line_user_id, messages: [{ type: 'text', text: msg }] }),
                });
              }
            }
          } catch (lineErr) {
            // LINE notification is best-effort, don't fail the shipment
          }
        }

        return Response.json({ success: true, shipment, order_no: orderNo });
      }

      case 'update_shipment_status': {
        const { shipment_id, status, notify_line } = body;
        if (!shipment_id || !status) return Response.json({ error: 'shipment_id and status are required' }, { status: 400 });

        // Validate status value
        const validShipStatuses = ['pending', 'shipped', 'in_transit', 'delivered', 'cancelled'];
        if (!validShipStatuses.includes(status)) return Response.json({ error: `無效的出貨狀態：${status}` }, { status: 400 });

        // Validate status transition
        const { data: currentShip } = await supabase.from('erp_shipments').select('status').eq('id', shipment_id).maybeSingle();
        if (currentShip) {
          const invalidTransitions = { delivered: ['pending', 'shipped'], cancelled: ['shipped', 'delivered'] };
          if (invalidTransitions[currentShip.status]?.includes(status)) {
            return Response.json({ error: `無法從「${currentShip.status}」變更為「${status}」` }, { status: 400 });
          }
        }

        const { data, error } = await supabase
          .from('erp_shipments')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('id', shipment_id)
          .select()
          .single();

        if (error) return Response.json({ error: error.message }, { status: 500 });

        // Auto update order status based on shipment status
        if (data?.order_id) {
          if (status === 'delivered') {
            const { data: orderShipments } = await supabase.from('erp_shipments').select('id, status').eq('order_id', data.order_id);
            const allDelivered = (orderShipments || []).every(s => s.status === 'delivered' || s.status === 'cancelled');
            if (allDelivered) {
              await supabase.from('erp_orders').update({ shipping_status: 'delivered', status: 'completed', updated_at: new Date().toISOString() }).eq('id', data.order_id);
            }
          } else if (status === 'cancelled') {
            const { data: activeShipments } = await supabase.from('erp_shipments').select('id').eq('order_id', data.order_id).neq('status', 'cancelled');
            if (!activeShipments?.length) {
              await supabase.from('erp_orders').update({ shipping_status: 'pending', updated_at: new Date().toISOString() }).eq('id', data.order_id);
            }
          }
        }

        // LINE notification on status change
        if (notify_line && data?.order_id && (status === 'shipped' || status === 'delivered')) {
          try {
            const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
            if (lineToken) {
              const { data: orderWithCustomer } = await supabase
                .from('erp_orders')
                .select('order_no, erp_customers(name, company_name, line_user_id, line_notify_enabled)')
                .eq('id', data.order_id)
                .single();
              const customer = orderWithCustomer?.erp_customers;
              if (customer?.line_user_id && customer?.line_notify_enabled !== false) {
                const statusText = status === 'shipped' ? '已出貨' : '已送達';
                const emoji = status === 'shipped' ? '📦' : '✅';
                const msg = `${emoji} ${statusText}通知\n\n訂單 ${orderWithCustomer.order_no || data.order_id}\n出貨單 ${data.shipment_no}\n物流商: ${data.carrier || '未填'}\n追蹤編號: ${data.tracking_no || '未填'}\n\n您的訂單${statusText}，感謝您的訂購！`;
                await fetch('https://api.line.me/v2/bot/message/push', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lineToken}` },
                  body: JSON.stringify({ to: customer.line_user_id, messages: [{ type: 'text', text: msg }] }),
                });
              }
            }
          } catch (lineErr) { /* best-effort */ }
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

        // NOTE: Inventory restoration moved to approve_return (only on approval, not on creation)

        return Response.json({ success: true, return_doc: ret, count: itemPayload.length });
      }

      case 'approve_return': {
        const { return_id, status: retStatus, notify_line } = body;
        if (!return_id) return Response.json({ error: 'return_id is required' }, { status: 400 });
        const newStatus = retStatus || 'approved';

        const { data, error } = await supabase
          .from('erp_returns')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', return_id)
          .select()
          .single();

        if (error) return Response.json({ error: error.message }, { status: 500 });

        // Auto restore inventory on approval
        if (newStatus === 'approved') {
          const { data: retItems } = await supabase.from('erp_return_items').select('*').eq('return_id', return_id);
          for (const it of (retItems || [])) {
            if (it.item_number && it.qty_returned > 0) {
              const { data: prod } = await supabase.from('quickbuy_products').select('stock_qty').eq('item_number', it.item_number).maybeSingle();
              if (prod) {
                await supabase.from('quickbuy_products').update({ stock_qty: Number(prod.stock_qty || 0) + Number(it.qty_returned) }).eq('item_number', it.item_number);
              }
              await supabase.from('qb_inventory_movements').insert({
                item_number: it.item_number, movement_type: 'in', quantity: it.qty_returned,
                reference_type: 'return_approved', reference_id: String(return_id),
                notes: `退貨入庫 ${data?.return_no || return_id}`, created_by: 'admin',
              });
            }
          }
        }

        // LINE notification
        if (notify_line && data?.order_id) {
          try {
            const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
            if (lineToken) {
              const { data: orderWithCust } = await supabase
                .from('erp_orders')
                .select('order_no, erp_customers(name, company_name, line_user_id, line_notify_enabled)')
                .eq('id', data.order_id)
                .single();
              const cust = orderWithCust?.erp_customers;
              if (cust?.line_user_id && cust?.line_notify_enabled !== false) {
                const emoji = newStatus === 'approved' ? '✅' : '❌';
                const statusText = newStatus === 'approved' ? '已核准' : '已拒絕';
                const msg = `${emoji} 退貨${statusText}通知\n\n退貨單 ${data.return_no}\n訂單 ${orderWithCust.order_no || ''}\n退款金額: $${data.refund_amount || 0}\n\n您的退貨申請${statusText}。`;
                await fetch('https://api.line.me/v2/bot/message/push', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lineToken}` },
                  body: JSON.stringify({ to: cust.line_user_id, messages: [{ type: 'text', text: msg }] }),
                });
              }
            }
          } catch (lineErr) { /* best-effort */ }
        }

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

        const poNo = await generatePoNo();
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

      /* confirm_stock_in 已合併至 confirm_stock_in_with_inventory，保留入口相容 */
      case 'confirm_stock_in': {
        // Fallthrough to confirm_stock_in_with_inventory
        body.action = 'confirm_stock_in_with_inventory';
        return handlePostAction('confirm_stock_in_with_inventory', body);
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

        /* 庫存扣減延後至審批通過時執行 */

        return Response.json({ success: true, purchase_return: ret, count: itemPayload.length });
      }

      /* ===================== 新增廠商 ===================== */
      case 'create_vendor': {
        const { vendor_name, vendor_code, contact_name, phone, mobile, email, fax, address, tax_id, bank_account, payment_terms, remark } = body;
        if (!vendor_name) return Response.json({ error: 'vendor_name is required' }, { status: 400 });

        // Auto-generate vendor_code if not provided
        let code = cleanCsvValue(vendor_code);
        if (!code) {
          const { data: maxRow } = await supabase.from('erp_vendors').select('vendor_code').not('vendor_code', 'is', null).order('vendor_code', { ascending: false }).limit(1);
          const maxCode = parseInt(maxRow?.[0]?.vendor_code || '0', 10);
          code = String(maxCode + 1).padStart(4, '0');
        }

        const { data, error } = await insertSingleWithColumnFallback('erp_vendors', {
          vendor_code: code,
          vendor_name: cleanCsvValue(vendor_name),
          contact_name: cleanCsvValue(contact_name) || null,
          phone: cleanCsvValue(phone) || null,
          mobile: cleanCsvValue(mobile) || null,
          email: cleanCsvValue(email) || null,
          fax: cleanCsvValue(fax) || null,
          address: cleanCsvValue(address) || null,
          tax_id: cleanCsvValue(tax_id) || null,
          bank_account: cleanCsvValue(bank_account) || null,
          payment_terms: cleanCsvValue(payment_terms) || null,
          remark: cleanCsvValue(remark) || null,
        });
        if (error) { if (isMissingRelationError(error)) return missingRelationResponse(error, 'erp_vendors'); return Response.json({ error: error.message }, { status: 500 }); }
        return Response.json({ success: true, vendor: data });
      }

      /* ===================== 付款單 ===================== */
      case 'create_vendor_payment': {
        const { vendor_id, po_id, amount, payment_method, payment_date, bank_info, remark } = body;
        if (!amount) return Response.json({ error: 'amount is required' }, { status: 400 });
        if (!vendor_id && !po_id) return Response.json({ error: 'vendor_id 或 po_id 至少需要一個' }, { status: 400 });

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
        const subtotal = poItems.reduce((s, i) => s + i.unit_cost * i.qty, 0);
        const taxAmount = Math.round(subtotal * 0.05);
        const poTotal = subtotal + taxAmount;
        const poNo = await generatePoNo();

        // Create PO
        const { data: po, error: poErr } = await insertSingleWithColumnFallback('erp_purchase_orders', {
          po_no: poNo,
          vendor_id: vendor_id || null,
          po_date: new Date().toISOString().slice(0, 10),
          status: 'draft',
          subtotal: subtotal,
          tax_amount: taxAmount,
          total_amount: poTotal,
          source_order_ids: order_ids,
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

        // Check stock for each item (no deduction here — deduction happens at sales approval)
        for (const item of (items || [])) {
          if (!item.item_number_snapshot) continue;
          const { data: product } = await supabase
            .from('quickbuy_products')
            .select('item_number, description, stock_qty, safety_stock')
            .eq('item_number', item.item_number_snapshot)
            .maybeSingle();

          if (!product) continue;
          const currentStock = product.stock_qty || 0;
          const orderQty = Number(item.qty || 0);

          if (currentStock < orderQty) {
            stockIssues.push({ item_number: item.item_number_snapshot, needed: orderQty, available: currentStock });
          }

          // Check if already below safety stock → auto reorder suggestion
          if (currentStock <= (product.safety_stock || 0) && (product.safety_stock || 0) > 0) {
            reorderNeeded.push({
              item_number: product.item_number,
              description: product.description,
              current_stock: currentStock,
              safety_stock: product.safety_stock || 0,
              suggested_qty: Math.max((product.safety_stock || 0) * 2 - currentStock, 1),
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

        // Check current status and get stock_in_no, po_id
        const { data: si } = await supabase.from('erp_stock_ins').select('status, stock_in_no, po_id').eq('id', stock_in_id).maybeSingle();
        if (!si) return Response.json({ error: '進貨單不存在' }, { status: 404 });
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
            .maybeSingle();

          if (product) {
            const newStock = (product.stock_qty || 0) + (item.qty_received || 0);
            await supabase
              .from('quickbuy_products')
              .update({ stock_qty: newStock, updated_at: new Date().toISOString() })
              .eq('item_number', item.item_number);
            updatedCount++;
          }

          // Record inventory movement
          await supabase.from('qb_inventory_movements').insert({
            item_number: item.item_number, movement_type: 'in', quantity: item.qty_received,
            reference_type: 'stock_in', reference_id: String(stock_in_id),
            notes: `進貨入庫 ${si.stock_in_no}`, created_by: 'admin',
          });

          // Clear any pending reorder suggestions for this item
          await supabase
            .from('erp_reorder_suggestions')
            .update({ status: 'fulfilled' })
            .eq('item_number', item.item_number)
            .eq('status', 'pending');
        }

        // Update stock-in status
        await supabase.from('erp_stock_ins').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', stock_in_id);

        // Update PO status if linked
        if (si.po_id) {
          await supabase.from('erp_purchase_orders').update({ status: 'received' }).eq('id', si.po_id);
        }

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

        const poNo = await generatePoNo();
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

        const { data: order, error: orderFetchErr } = await supabase.from('erp_orders').select('*').eq('id', order_id).maybeSingle();
        if (orderFetchErr) return Response.json({ error: orderFetchErr.message }, { status: 500 });
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

        const { data: inv } = await supabase.from('erp_invoices').select('*').eq('id', invoice_id).maybeSingle();
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

      case 'instock_to_sale': {
        // Convert selected items to sale with custom quantities (partial shipment support)
        const { order_id, item_ids, items: itemsWithQty } = body;
        if (!order_id) return Response.json({ error: 'order_id required' }, { status: 400 });

        const { data: order, error: orderErr } = await supabase.from('erp_orders').select('*').eq('id', order_id).maybeSingle();
        if (orderErr) return Response.json({ error: orderErr.message }, { status: 500 });
        if (!order) return Response.json({ error: 'Order not found' }, { status: 404 });

        // Build qty map: new format [{id, qty}] or legacy [item_ids] (full qty)
        const qtyMap = {};
        if (itemsWithQty && itemsWithQty.length > 0) {
          itemsWithQty.forEach(i => { qtyMap[i.id] = Number(i.qty); });
        }
        const selectedIds = itemsWithQty ? itemsWithQty.map(i => i.id) : (item_ids || []);

        let itemQuery = supabase.from('erp_order_items').select('*').eq('order_id', order_id);
        if (selectedIds.length > 0) itemQuery = itemQuery.in('id', selectedIds);
        const { data: items, error: itemsErr } = await itemQuery;
        if (itemsErr) return Response.json({ error: itemsErr.message }, { status: 500 });

        // Filter items with sufficient stock for the requested qty (respecting already-sold qty)
        const processItems = [];
        const processQtys = [];
        for (const item of (items || [])) {
          if (!item.item_number_snapshot) continue;
          const totalQty = Number(item.qty || 0);
          const alreadySold = Number(item.sold_qty || 0);
          const remainingQty = totalQty - alreadySold;
          if (remainingQty <= 0) continue;
          const requestedQty = Math.min(qtyMap[item.id] || remainingQty, remainingQty);
          if (requestedQty <= 0) continue;
          const { data: product } = await supabase
            .from('quickbuy_products')
            .select('item_number, stock_qty, safety_stock, description')
            .eq('item_number', item.item_number_snapshot)
            .maybeSingle();
          if (!product) continue;
          const stockQty = Number(product.stock_qty || 0);
          if (stockQty >= requestedQty) {
            processItems.push(item);
            processQtys.push(requestedQty);
          }
        }

        if (processItems.length === 0) return Response.json({ error: '沒有庫存充足的項目可轉銷貨' }, { status: 400 });

        // NOTE: Do NOT deduct stock yet — sale is created as draft, stock deducted upon approval
        // Create sale as DRAFT (pending approval)
        const saleTotal = processItems.reduce((s, item, idx) => s + Number(item.unit_price) * processQtys[idx], 0);
        const slipNumber = `SA-${Date.now()}`;

        // Fetch customer name for display
        let custName = '';
        if (order.customer_id) {
          const { data: cust } = await supabase.from('erp_customers').select('name, company_name').eq('id', order.customer_id).maybeSingle();
          custName = cust?.company_name || cust?.name || '';
        }

        const salePayload = {
          slip_number: slipNumber,
          invoice_number: order.order_no,
          customer_name: custName || '未命名客戶',
          subtotal: saleTotal,
          tax: Math.round(saleTotal * 0.05),
          total: Math.round(saleTotal * 1.05),
          sale_date: new Date().toISOString().split('T')[0],
          source_type: 'order_partial',
          source_id: order_id,
          status: 'draft',
          total_amount: saleTotal,
          total_qty: processQtys.reduce((s, q) => s + q, 0),
        };
        const { data: sale, error: saleErr } = await supabase.from('qb_sales_history').insert([salePayload]).select().single();
        if (saleErr) return Response.json({ error: `建立銷貨失敗: ${saleErr.message}` }, { status: 500 });

        // Create sale items in qb_order_items (use custom qty)
        // Note: subtotal is a generated column (quantity * unit_price), do NOT insert it
        const saleItems = processItems.map((i, idx) => ({
          order_id: sale.id,
          item_number: i.item_number_snapshot,
          description: i.description_snapshot,
          quantity: processQtys[idx],
          unit_price: Number(i.unit_price),
        }));
        const { error: saleItemsErr } = await supabase.from('qb_order_items').insert(saleItems);
        if (saleItemsErr) {
          // Rollback: delete the sale if items insert failed
          await supabase.from('qb_sales_history').delete().eq('id', sale.id);
          return Response.json({ error: `銷貨明細寫入失敗：${saleItemsErr.message}` }, { status: 500 });
        }

        // Update erp_order_items: increment sold_qty, set sale_ref when fully sold
        for (let idx = 0; idx < processItems.length; idx++) {
          const item = processItems[idx];
          const newSoldQty = Number(item.sold_qty || 0) + processQtys[idx];
          const updateData = { sold_qty: newSoldQty };
          // Append sale_ref (comma-separated if multiple partial sales)
          const existingRef = item.sale_ref || '';
          updateData.sale_ref = existingRef ? `${existingRef},${slipNumber}` : slipNumber;
          const { error: refErr } = await supabase.from('erp_order_items').update(updateData).eq('id', item.id);
          if (refErr) console.error(`erp_order_items update failed for ${item.id}:`, refErr.message);
        }

        // Auto-submit for approval
        const { error: approvalErr } = await supabase.from('erp_approvals').insert([{
          doc_type: 'sale',
          doc_id: String(sale.id),
          doc_no: slipNumber,
          requested_by: 'admin',
          amount: saleTotal,
          status: 'pending',
          remark: `訂單 ${order.order_no} → 銷貨草稿，含 ${processItems.length} 項`,
        }]);
        if (approvalErr) console.error('Approval insert error:', approvalErr.message);

        return Response.json({ success: true, sale: { slip_number: slipNumber }, processed_count: processItems.length, total_items: (items || []).length });
      }

      case 'add_order_item': {
        const { order_id: addOrderId, item_number, qty: addQty, unit_price: addPrice, discount_rate: addDiscount, item_note: addNote } = body;
        if (!addOrderId || !item_number) return Response.json({ error: 'order_id 和 item_number 為必填' }, { status: 400 });

        // Lookup product info
        const { data: prod } = await supabase.from('quickbuy_products').select('item_number, description, tw_retail_price, cost_price').eq('item_number', item_number).maybeSingle();
        if (!prod) return Response.json({ error: `找不到產品 ${item_number}` }, { status: 404 });

        const finalQty = Math.max(1, Number(addQty || 1));
        const finalPrice = addPrice !== undefined ? Number(addPrice) : Number(prod.tw_retail_price || 0);
        const finalDiscount = Math.min(100, Math.max(0, Number(addDiscount || 0)));
        const discountedPrice = finalDiscount > 0 ? Math.round(finalPrice * (1 - finalDiscount / 100)) : finalPrice;
        const lineTotal = finalQty * discountedPrice;

        const { error: insertErr } = await supabase.from('erp_order_items').insert({
          order_id: addOrderId,
          item_number_snapshot: prod.item_number,
          description_snapshot: prod.description || '',
          qty: finalQty,
          unit_price: finalPrice,
          line_total: lineTotal,
          cost_price_snapshot: Number(prod.cost_price || 0),
          discount_rate: finalDiscount,
          item_note: addNote || '',
        });
        if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 });

        // Recalculate order totals
        const { data: allItems2 } = await supabase.from('erp_order_items').select('line_total').eq('order_id', addOrderId);
        const sub2 = (allItems2 || []).reduce((s, i) => s + Number(i.line_total || 0), 0);
        const tax2 = Math.round(sub2 * 0.05);
        await supabase.from('erp_orders').update({ subtotal: sub2, tax_amount: tax2, total_amount: sub2 + tax2, updated_at: new Date().toISOString() }).eq('id', addOrderId);

        return Response.json({ success: true, message: `已新增 ${prod.item_number}` });
      }

      case 'replace_order_item': {
        const { item_id: replaceItemId, new_item_number } = body;
        if (!replaceItemId || !new_item_number) return Response.json({ error: 'item_id 和 new_item_number 為必填' }, { status: 400 });

        const { data: oldItem } = await supabase.from('erp_order_items').select('*').eq('id', replaceItemId).maybeSingle();
        if (!oldItem) return Response.json({ error: '找不到品項' }, { status: 404 });
        if (oldItem.sale_ref) return Response.json({ error: '此品項已轉銷貨，無法替換' }, { status: 400 });
        if (oldItem.po_ref) return Response.json({ error: '此品項已轉採購，無法替換' }, { status: 400 });

        const { data: newProd } = await supabase.from('quickbuy_products').select('item_number, description, tw_retail_price, cost_price, stock_qty').eq('item_number', new_item_number).maybeSingle();
        if (!newProd) return Response.json({ error: `找不到產品 ${new_item_number}` }, { status: 404 });

        const qty = Number(oldItem.qty);
        const newPrice = Number(newProd.tw_retail_price || oldItem.unit_price);
        const dr = Number(oldItem.discount_rate || 0);
        const discounted = dr > 0 ? Math.round(newPrice * (1 - dr / 100)) : newPrice;

        const { error: replErr } = await supabase.from('erp_order_items').update({
          item_number_snapshot: newProd.item_number,
          description_snapshot: newProd.description || '',
          unit_price: newPrice,
          line_total: qty * discounted,
          cost_price_snapshot: Number(newProd.cost_price || 0),
          item_note: `替換自 ${oldItem.item_number_snapshot}${oldItem.item_note ? ' / ' + oldItem.item_note : ''}`,
        }).eq('id', replaceItemId);
        if (replErr) return Response.json({ error: replErr.message }, { status: 500 });

        // Recalculate order totals
        const { data: allItems3 } = await supabase.from('erp_order_items').select('line_total').eq('order_id', oldItem.order_id);
        const sub3 = (allItems3 || []).reduce((s, i) => s + Number(i.line_total || 0), 0);
        const tax3 = Math.round(sub3 * 0.05);
        await supabase.from('erp_orders').update({ subtotal: sub3, tax_amount: tax3, total_amount: sub3 + tax3, updated_at: new Date().toISOString() }).eq('id', oldItem.order_id);

        return Response.json({ success: true, message: `已將 ${oldItem.item_number_snapshot} 替換為 ${newProd.item_number}` });
      }

      case 'update_order_item': {
        const { item_id, qty, unit_price, discount_rate, item_note } = body;
        if (!item_id) return Response.json({ error: 'item_id required' }, { status: 400 });

        // Fetch current item to check it exists and get order_id
        const { data: currentItem, error: fetchErr } = await supabase.from('erp_order_items').select('*').eq('id', item_id).maybeSingle();
        if (fetchErr) return Response.json({ error: fetchErr.message }, { status: 500 });
        if (!currentItem) return Response.json({ error: '找不到品項' }, { status: 404 });

        // Block editing if item already has sale_ref or po_ref
        if (currentItem.sale_ref) return Response.json({ error: '此品項已轉銷貨，無法修改' }, { status: 400 });

        const updateData = {};
        if (qty !== undefined && qty !== null) {
          const newQty = Math.max(1, Number(qty));
          updateData.qty = newQty;
          const dr = discount_rate !== undefined ? Number(discount_rate) : Number(currentItem.discount_rate || 0);
          const up = unit_price !== undefined ? Number(unit_price) : Number(currentItem.unit_price);
          const discountedPrice = dr > 0 ? Math.round(up * (1 - dr / 100)) : up;
          updateData.line_total = newQty * discountedPrice;
        }
        if (unit_price !== undefined && unit_price !== null) {
          updateData.unit_price = Number(unit_price);
          const q = updateData.qty || Number(currentItem.qty);
          const dr = discount_rate !== undefined ? Number(discount_rate) : Number(currentItem.discount_rate || 0);
          const discountedPrice = dr > 0 ? Math.round(Number(unit_price) * (1 - dr / 100)) : Number(unit_price);
          updateData.line_total = q * discountedPrice;
        }
        if (discount_rate !== undefined && discount_rate !== null) {
          updateData.discount_rate = Math.min(100, Math.max(0, Number(discount_rate)));
          const q = updateData.qty || Number(currentItem.qty);
          const up = updateData.unit_price || Number(currentItem.unit_price);
          const discountedPrice = updateData.discount_rate > 0 ? Math.round(up * (1 - updateData.discount_rate / 100)) : up;
          updateData.line_total = q * discountedPrice;
        }
        if (item_note !== undefined) updateData.item_note = item_note;

        if (Object.keys(updateData).length === 0) return Response.json({ error: '沒有需要更新的欄位' }, { status: 400 });

        const { error: updateErr } = await supabase.from('erp_order_items').update(updateData).eq('id', item_id);
        if (updateErr) return Response.json({ error: updateErr.message }, { status: 500 });

        // Recalculate order totals
        const { data: allItems } = await supabase.from('erp_order_items').select('line_total').eq('order_id', currentItem.order_id);
        const newSubtotal = (allItems || []).reduce((s, i) => s + Number(i.line_total || 0), 0);
        const newTax = Math.round(newSubtotal * 0.05);
        await supabase.from('erp_orders').update({
          subtotal: newSubtotal,
          tax_amount: newTax,
          total_amount: newSubtotal + newTax,
          updated_at: new Date().toISOString(),
        }).eq('id', currentItem.order_id);

        return Response.json({ success: true, message: '品項已更新' });
      }

      case 'delete_order_item': {
        const { item_id: delItemId } = body;
        if (!delItemId) return Response.json({ error: 'item_id required' }, { status: 400 });

        const { data: delItem } = await supabase.from('erp_order_items').select('*').eq('id', delItemId).maybeSingle();
        if (!delItem) return Response.json({ error: '找不到品項' }, { status: 404 });
        if (delItem.sale_ref) return Response.json({ error: '此品項已轉銷貨，無法刪除' }, { status: 400 });
        if (delItem.po_ref) return Response.json({ error: '此品項已轉採購，無法刪除' }, { status: 400 });

        const { error: delErr } = await supabase.from('erp_order_items').delete().eq('id', delItemId);
        if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

        // Recalculate order totals
        const { data: remainItems } = await supabase.from('erp_order_items').select('line_total').eq('order_id', delItem.order_id);
        const recalcSub = (remainItems || []).reduce((s, i) => s + Number(i.line_total || 0), 0);
        const recalcTax = Math.round(recalcSub * 0.05);
        await supabase.from('erp_orders').update({
          subtotal: recalcSub,
          tax_amount: recalcTax,
          total_amount: recalcSub + recalcTax,
          updated_at: new Date().toISOString(),
        }).eq('id', delItem.order_id);

        return Response.json({ success: true, message: '品項已刪除' });
      }

      case 'shortage_to_po': {
        // Convert out-of-stock items to a purchase order
        const { order_id: poOrderId, item_ids: poItemIds } = body;
        if (!poOrderId) return Response.json({ error: 'order_id required' }, { status: 400 });

        const { data: order, error: orderErr2 } = await supabase.from('erp_orders').select('*').eq('id', poOrderId).maybeSingle();
        if (orderErr2) return Response.json({ error: orderErr2.message }, { status: 500 });
        if (!order) return Response.json({ error: 'Order not found' }, { status: 404 });

        let itemQuery = supabase.from('erp_order_items').select('*').eq('order_id', poOrderId);
        if (poItemIds && poItemIds.length > 0) itemQuery = itemQuery.in('id', poItemIds);
        const { data: items } = await itemQuery;

        // When item_ids are provided (manual selection), use all selected items
        // When no item_ids, auto-filter to shortage items only
        const shortageItems = [];
        const alreadyPurchased = [];
        for (const item of (items || [])) {
          if (!item.item_number_snapshot) continue;
          // Skip items already linked to a PO
          if (item.po_ref) {
            alreadyPurchased.push(item.item_number_snapshot);
            continue;
          }
          const { data: product } = await supabase
            .from('quickbuy_products')
            .select('item_number, stock_qty')
            .eq('item_number', item.item_number_snapshot)
            .maybeSingle();
          const stockQty = Number(product?.stock_qty || 0);
          const orderQty = Number(item.qty || 0);
          const shortage = Math.max(0, orderQty - stockQty);
          // If manually selected (item_ids provided), include all; otherwise only shortage items
          if (poItemIds && poItemIds.length > 0) {
            shortageItems.push({ ...item, stock_qty: stockQty, shortage: shortage || orderQty });
          } else if (stockQty < orderQty) {
            shortageItems.push({ ...item, stock_qty: stockQty, shortage });
          }
        }

        if (shortageItems.length === 0 && alreadyPurchased.length > 0) {
          return Response.json({ error: `所選品項皆已建立採購單（${alreadyPurchased.join(', ')}）` }, { status: 400 });
        }
        if (shortageItems.length === 0) return Response.json({ error: '沒有項目需要採購' }, { status: 400 });

        // Create purchase order
        const poNo = await generatePoNo();
        const subtotal = shortageItems.reduce((s, i) => s + (i.shortage * Number(i.unit_price || 0)), 0);
        const taxAmount = Math.round(subtotal * 0.05);
        const poTotal = subtotal + taxAmount;
        const { data: po, error: poErr } = await supabase.from('erp_purchase_orders').insert([{
          po_no: poNo,
          status: 'draft',
          subtotal: subtotal,
          tax_amount: taxAmount,
          total_amount: poTotal,
          source_order_ids: [poOrderId],
          remark: `從訂單 ${order.order_no} 缺貨項目自動建立`,
          po_date: new Date().toISOString().split('T')[0],
        }]).select().single();
        if (poErr) return Response.json({ error: poErr.message }, { status: 500 });

        // Create PO items (order shortage qty, not full qty)
        // erp_purchase_order_items columns: po_id, item_number, description, qty, unit_cost, line_total
        const poItems = shortageItems.map(i => ({
          po_id: po.id,
          item_number: i.item_number_snapshot,
          description: i.description_snapshot,
          qty: i.shortage,
          unit_cost: Number(i.unit_price || 0),
          line_total: i.shortage * Number(i.unit_price || 0),
        }));
        const { error: poItemsErr } = await supabase.from('erp_purchase_order_items').insert(poItems);
        if (poItemsErr) {
          // Rollback: delete the PO if items insert failed
          await supabase.from('erp_purchase_orders').delete().eq('id', po.id);
          return Response.json({ error: `採購單明細寫入失敗：${poItemsErr.message}` }, { status: 500 });
        }

        // Mark erp_order_items with po_ref for per-item tracking
        const shortageItemIds = shortageItems.map(i => i.id).filter(Boolean);
        if (shortageItemIds.length > 0) {
          await supabase.from('erp_order_items').update({ po_ref: poNo }).in('id', shortageItemIds);
        }

        return Response.json({ success: true, po_number: poNo, po_no: poNo, shortage_count: shortageItems.length });
      }

      case 'line_push_message': {
        const { line_user_id, message } = body;
        if (!line_user_id || !message) return Response.json({ error: 'line_user_id and message required' }, { status: 400 });

        const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
        if (!token) return Response.json({ error: 'LINE_CHANNEL_ACCESS_TOKEN not configured' }, { status: 500 });

        // Send push message via LINE API
        const pushRes = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            to: line_user_id,
            messages: [{ type: 'text', text: message }],
          }),
        });

        if (!pushRes.ok) {
          const errText = await pushRes.text();
          return Response.json({ error: `LINE push failed: ${errText}` }, { status: 500 });
        }

        // Save the admin message to DB for history
        await supabase.from('quickbuy_line_messages').insert({
          line_user_id,
          display_name: '管理員',
          message_type: 'admin_push',
          user_message: null,
          ai_response: message,
          response_time_ms: 0,
        });

        return Response.json({ success: true, message: '訊息已發送' });
      }

      case 'auto_tag_line_customers': {
        // Auto-tag LINE customers based on purchase history from ERP
        const { data: lineCustomers } = await supabase.from('quickbuy_line_customers').select('id, line_user_id, display_name');
        if (!lineCustomers?.length) return Response.json({ error: 'No LINE customers found' }, { status: 400 });

        let tagged = 0;
        for (const lc of lineCustomers) {
          // Find linked ERP customer
          const { data: erpCustomer } = await supabase
            .from('erp_customers')
            .select('id')
            .eq('line_user_id', lc.line_user_id)
            .maybeSingle();

          // Get order stats
          const { data: orders } = await supabase
            .from('erp_orders')
            .select('id, total_amount, created_at')
            .eq('customer_id', erpCustomer?.id)
            .order('created_at', { ascending: false });

          const totalOrders = orders?.length || 0;
          const totalSpent = (orders || []).reduce((s, o) => s + Number(o.total_amount || 0), 0);
          const lastOrderAt = orders?.[0]?.created_at || null;
          const daysSinceLastOrder = lastOrderAt ? Math.floor((Date.now() - new Date(lastOrderAt).getTime()) / 86400000) : 999;

          // Get message count
          const { count: msgCount } = await supabase
            .from('quickbuy_line_messages')
            .select('*', { count: 'exact', head: true })
            .eq('line_user_id', lc.line_user_id);

          // Calculate tags
          const tags = [];
          if (totalOrders === 0 && (msgCount || 0) > 0) tags.push('潛在客戶');
          if (totalOrders > 0 && totalOrders <= 2) tags.push('新客戶');
          if (totalOrders >= 3 && totalOrders < 10) tags.push('一般客戶');
          if (totalOrders >= 10 || totalSpent >= 100000) tags.push('VIP');
          if (totalSpent >= 500000) tags.push('鑽石VIP');
          if (daysSinceLastOrder > 90 && totalOrders > 0) tags.push('沉睡客戶');
          if (daysSinceLastOrder <= 30 && totalOrders > 0) tags.push('活躍');
          if ((msgCount || 0) >= 20) tags.push('高互動');

          await supabase.from('quickbuy_line_customers').update({
            tags,
            total_orders: totalOrders,
            total_spent: totalSpent,
            last_order_at: lastOrderAt,
            erp_customer_id: erpCustomer?.id || null,
          }).eq('id', lc.id);

          tagged++;
        }

        return Response.json({ success: true, tagged_count: tagged });
      }

      case 'line_broadcast': {
        // Send LINE message to multiple users by tag filter
        const { message: broadcastMsg, tags: filterTags, line_user_ids } = body;
        if (!broadcastMsg) return Response.json({ error: 'message required' }, { status: 400 });

        const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
        if (!token) return Response.json({ error: 'LINE_CHANNEL_ACCESS_TOKEN not configured' }, { status: 500 });

        // Get target users
        let targets = [];
        if (line_user_ids && line_user_ids.length > 0) {
          targets = line_user_ids;
        } else if (filterTags && filterTags.length > 0) {
          const { data: customers } = await supabase
            .from('quickbuy_line_customers')
            .select('line_user_id, tags')
            .overlaps('tags', filterTags);
          targets = (customers || []).map(c => c.line_user_id).filter(Boolean);
        } else {
          // Broadcast to all
          const { data: allCustomers } = await supabase
            .from('quickbuy_line_customers')
            .select('line_user_id');
          targets = (allCustomers || []).map(c => c.line_user_id).filter(Boolean);
        }

        if (targets.length === 0) return Response.json({ error: '沒有符合條件的用戶' }, { status: 400 });

        // Send via multicast (max 500 per call)
        let sentCount = 0;
        for (let i = 0; i < targets.length; i += 500) {
          const batch = targets.slice(i, i + 500);
          const res = await fetch('https://api.line.me/v2/bot/message/multicast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ to: batch, messages: [{ type: 'text', text: broadcastMsg }] }),
          });
          if (res.ok) sentCount += batch.length;
        }

        return Response.json({ success: true, sent_count: sentCount, total_targets: targets.length });
      }

      case 'send_quote_to_line': {
        // Send quote summary to customer via LINE
        const { quote_id } = body;
        if (!quote_id) return Response.json({ error: 'quote_id required' }, { status: 400 });

        const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
        if (!token) return Response.json({ error: 'LINE_CHANNEL_ACCESS_TOKEN not configured' }, { status: 500 });

        // Get quote with customer
        const { data: quote } = await supabase
          .from('erp_quotes')
          .select('*, erp_customers(name, company_name, line_user_id)')
          .eq('id', quote_id)
          .single();
        if (!quote) return Response.json({ error: 'Quote not found' }, { status: 404 });

        const lineUserId = quote.erp_customers?.line_user_id;
        if (!lineUserId) return Response.json({ error: '此客戶未綁定 LINE 帳號' }, { status: 400 });

        // Get quote items
        const { data: items } = await supabase
          .from('erp_quote_items')
          .select('item_number_snapshot, description_snapshot, qty, unit_price, line_total')
          .eq('quote_id', quote_id);

        // Build message
        const customerName = quote.erp_customers?.company_name || quote.erp_customers?.name || '客戶';
        const itemLines = (items || []).map((it, i) =>
          `${i + 1}. ${it.item_number_snapshot} ${it.description_snapshot || ''}\n   ${it.qty} x $${Number(it.unit_price || 0).toLocaleString()} = $${Number(it.line_total || 0).toLocaleString()}`
        ).join('\n');

        const msg = `📋 報價單通知\n\n${customerName} 您好！\n以下是您的報價明細：\n\n${itemLines}\n\n────────────\n小計：$${Number(quote.subtotal || 0).toLocaleString()}\n稅額：$${Number(quote.tax_amount || 0).toLocaleString()}\n總計：$${Number(quote.total_amount || 0).toLocaleString()}\n\n有效期限：${quote.valid_until || '-'}\n${quote.remark ? `備註：${quote.remark}\n` : ''}\n如有疑問請直接回覆此訊息 💬`;

        // Send via push
        const pushRes = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text: msg }] }),
        });

        if (!pushRes.ok) {
          const errText = await pushRes.text();
          return Response.json({ error: `LINE 發送失敗: ${errText}` }, { status: 500 });
        }

        // Update quote status to sent
        await supabase.from('erp_quotes').update({ status: 'sent', updated_at: new Date().toISOString() }).eq('id', quote_id);

        return Response.json({ success: true, message: '報價單已發送到客戶 LINE' });
      }

      case 'notify_order_status': {
        // Send order status notification to customer via LINE
        const { order_id, status_text } = body;
        if (!order_id) return Response.json({ error: 'order_id required' }, { status: 400 });

        const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
        if (!token) return Response.json({ error: 'LINE_CHANNEL_ACCESS_TOKEN not configured' }, { status: 500 });

        const { data: order } = await supabase
          .from('erp_orders')
          .select('*, erp_customers(name, company_name, line_user_id, line_notify_enabled)')
          .eq('id', order_id)
          .single();
        if (!order) return Response.json({ error: 'Order not found' }, { status: 404 });

        const lineUserId = order.erp_customers?.line_user_id;
        if (!lineUserId) return Response.json({ error: '此客戶未綁定 LINE' }, { status: 400 });
        if (order.erp_customers?.line_notify_enabled === false) return Response.json({ error: '此客戶已關閉 LINE 通知' }, { status: 400 });

        const STATUS_EMOJI = { confirmed: '✅', shipped: '🚚', delivered: '📦', completed: '🎉' };
        const STATUS_TEXT = { confirmed: '已確認', shipped: '已出貨', delivered: '已送達', completed: '已完成' };
        const statusKey = status_text || order.status;
        const emoji = STATUS_EMOJI[statusKey] || '📋';
        const label = STATUS_TEXT[statusKey] || statusKey;
        const customerName = order.erp_customers?.company_name || order.erp_customers?.name || '客戶';

        const msg = `${emoji} 訂單狀態更新\n\n${customerName} 您好！\n您的訂單 ${order.order_no || ''} ${label}。\n\n訂單金額：$${Number(order.total_amount || 0).toLocaleString()}\n${statusKey === 'shipped' ? '\n出貨後預計 1-3 個工作天送達，届時會再通知您。' : ''}\n如有疑問請直接回覆此訊息 💬`;

        const pushRes = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text: msg }] }),
        });

        if (!pushRes.ok) {
          const errText = await pushRes.text();
          return Response.json({ error: `LINE 通知失敗: ${errText}` }, { status: 500 });
        }

        return Response.json({ success: true, message: `已通知客戶訂單${label}` });
      }

      /* ===================== 銷貨單發票號碼更新 ===================== */
      case 'update_sale_invoice': {
        const { sale_id, invoice_number } = body;
        if (!sale_id) return Response.json({ error: 'sale_id 為必填' }, { status: 400 });
        const { error } = await supabase.from('qb_sales_history').update({ invoice_number: invoice_number || null }).eq('id', sale_id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true, message: '發票號碼已更新' });
      }

      /* ===================== 簽核審批 ===================== */
      case 'submit_approval': {
        const { doc_type, doc_id, doc_no, requested_by, amount, remark } = body;
        if (!doc_type || !doc_id) return Response.json({ error: 'doc_type 和 doc_id 為必填' }, { status: 400 });

        // Check if already pending
        const { data: existing } = await supabase.from('erp_approvals').select('id').eq('doc_id', doc_id).eq('status', 'pending').limit(1);
        if (existing?.length) return Response.json({ error: '此文件已在簽核中' }, { status: 400 });

        // Auto-fetch amount if not provided
        let finalAmount = amount || null;
        if (!finalAmount && doc_type === 'order') {
          const { data: ord } = await supabase.from('erp_orders').select('total_amount').eq('id', doc_id).maybeSingle();
          finalAmount = ord?.total_amount || null;
        }
        if (!finalAmount && doc_type === 'sale') {
          const { data: sale } = await supabase.from('qb_sales_history').select('total_amount').eq('id', doc_id).maybeSingle();
          finalAmount = sale?.total_amount || null;
        }
        if (!finalAmount && doc_type === 'purchase_order') {
          const { data: po } = await supabase.from('erp_purchase_orders').select('total_amount').eq('id', doc_id).maybeSingle();
          finalAmount = po?.total_amount || null;
        }

        const { data, error } = await supabase.from('erp_approvals').insert({
          doc_type, doc_id, doc_no: doc_no || '', requested_by: requested_by || 'system', status: 'pending', amount: finalAmount, remark: remark || '',
        }).select().single();

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ approval: data, message: '已送出簽核' });
      }

      case 'process_approval': {
        const { approval_id, decision, action: legacyAction, approved_by, rejected_reason, note } = body;
        const approvalAction = decision || legacyAction;
        if (!approval_id || !approvalAction) return Response.json({ error: 'approval_id 和 decision 為必填' }, { status: 400 });

        // Validate decision value
        const validDecisions = ['approve', 'approved', 'reject', 'rejected'];
        if (!validDecisions.includes(approvalAction)) {
          return Response.json({ error: `無效的審批決定：${approvalAction}，請使用 approve 或 reject` }, { status: 400 });
        }

        const { data: approval, error: apFetchErr } = await supabase.from('erp_approvals').select('*').eq('id', approval_id).maybeSingle();
        if (apFetchErr) return Response.json({ error: apFetchErr.message }, { status: 500 });
        if (!approval) return Response.json({ error: '找不到簽核單' }, { status: 400 });
        if (approval.status !== 'pending') return Response.json({ error: '此簽核單已處理' }, { status: 400 });

        const newStatus = (approvalAction === 'approve' || approvalAction === 'approved') ? 'approved' : 'rejected';
        const { error: apUpdateErr } = await supabase.from('erp_approvals').update({
          status: newStatus,
          approved_by: approved_by || 'admin',
          approved_at: new Date().toISOString(),
          rejected_reason: rejected_reason || note || null,
        }).eq('id', approval_id);
        if (apUpdateErr) return Response.json({ error: `簽核更新失敗：${apUpdateErr.message}` }, { status: 500 });

        // If approved, auto-confirm the source document
        const postErrors = [];
        if (newStatus === 'approved') {
          if (approval.doc_type === 'purchase_order') {
            const { error: e } = await supabase.from('erp_purchase_orders').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', approval.doc_id);
            if (e) postErrors.push(`採購單確認失敗：${e.message}`);
          } else if (approval.doc_type === 'quote') {
            const { error: e } = await supabase.from('erp_quotes').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', approval.doc_id);
            if (e) postErrors.push(`報價單核准失敗：${e.message}`);
          } else if (approval.doc_type === 'order') {
            const { error: e } = await supabase.from('erp_orders').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', approval.doc_id);
            if (e) postErrors.push(`訂單確認失敗：${e.message}`);
          } else if (approval.doc_type === 'sale') {
            // Deduct stock for sale items
            const { data: sale } = await supabase.from('qb_sales_history').select('*').eq('id', approval.doc_id).maybeSingle();
            if (sale) {
              // Try qb_order_items first, then fallback to erp_order_items via sale_ref
              let saleItems = [];
              const { data: qbItems } = await supabase.from('qb_order_items').select('item_number, quantity').eq('order_id', sale.id);
              if (qbItems && qbItems.length > 0) {
                saleItems = qbItems;
              } else if (sale.slip_number) {
                const { data: erpItems } = await supabase.from('erp_order_items').select('item_number_snapshot, qty').like('sale_ref', `%${sale.slip_number}%`);
                saleItems = (erpItems || []).map(i => ({ item_number: i.item_number_snapshot, quantity: i.qty }));
              }
              for (const item of saleItems) {
                if (!item.item_number || !item.quantity) continue;
                const { data: product } = await supabase.from('quickbuy_products').select('stock_qty').eq('item_number', item.item_number).maybeSingle();
                if (product) {
                  const newStock = Math.max(0, Number(product.stock_qty || 0) - Number(item.quantity));
                  const { error: e } = await supabase.from('quickbuy_products').update({ stock_qty: newStock }).eq('item_number', item.item_number);
                  if (e) postErrors.push(`庫存扣減失敗 ${item.item_number}：${e.message}`);
                }
                await supabase.from('qb_inventory_movements').insert({
                  item_number: item.item_number, movement_type: 'out', quantity: item.quantity,
                  reference_type: 'sale_issued', reference_id: String(approval.doc_id),
                  notes: `銷貨出庫 ${sale.slip_number}`, created_by: 'admin',
                });
              }
              const { error: e } = await supabase.from('qb_sales_history').update({ status: 'issued', updated_at: new Date().toISOString() }).eq('id', approval.doc_id);
              if (e) postErrors.push(`銷貨單狀態更新失敗：${e.message}`);
            }
          } else if (approval.doc_type === 'purchase_return') {
            // Deduct stock for purchase return items
            const { data: ret } = await supabase.from('erp_purchase_returns').select('*').eq('id', approval.doc_id).maybeSingle();
            if (ret) {
              const { data: retItems } = await supabase.from('erp_purchase_return_items').select('item_number, qty_returned').eq('return_id', approval.doc_id);
              for (const item of (retItems || [])) {
                if (!item.item_number || !item.qty_returned) continue;
                const { data: product } = await supabase.from('quickbuy_products').select('stock_qty').eq('item_number', item.item_number).maybeSingle();
                if (product) {
                  const newStock = Math.max(0, Number(product.stock_qty || 0) - Number(item.qty_returned));
                  const { error: e } = await supabase.from('quickbuy_products').update({ stock_qty: newStock }).eq('item_number', item.item_number);
                  if (e) postErrors.push(`庫存扣減失敗 ${item.item_number}：${e.message}`);
                }
                await supabase.from('qb_inventory_movements').insert({
                  item_number: item.item_number, movement_type: 'out', quantity: item.qty_returned,
                  reference_type: 'purchase_return_approved', reference_id: String(approval.doc_id),
                  notes: `進貨退出 ${ret.return_no}`, created_by: 'admin',
                });
              }
              const { error: e } = await supabase.from('erp_purchase_returns').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', approval.doc_id);
              if (e) postErrors.push(`退貨單狀態更新失敗：${e.message}`);
            }
          }
        }

        const msg = newStatus === 'approved' ? '已核准，原始文件已自動確認' : '已退回';
        return Response.json({ success: true, message: postErrors.length > 0 ? `${msg}（部分操作有誤：${postErrors.join('；')}）` : msg, warnings: postErrors.length > 0 ? postErrors : undefined });
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

      case 'update_quote_item': {
        const { item_id, qty, unit_price, item_note } = body;
        if (!item_id) return Response.json({ error: 'item_id required' }, { status: 400 });
        const { data: currentItem } = await supabase.from('erp_quote_items').select('*').eq('id', item_id).maybeSingle();
        if (!currentItem) return Response.json({ error: '找不到品項' }, { status: 404 });
        const newQty = qty !== undefined ? Number(qty) : Number(currentItem.qty);
        const newPrice = unit_price !== undefined ? Number(unit_price) : Number(currentItem.unit_price);
        const payload = { qty: newQty, unit_price: newPrice, line_total: newQty * newPrice };
        if (item_note !== undefined) payload.item_note = item_note;
        const { data, error } = await supabase.from('erp_quote_items').update(payload).eq('id', item_id).select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        // Recalculate quote totals
        const { data: allItems } = await supabase.from('erp_quote_items').select('line_total').eq('quote_id', currentItem.quote_id);
        const subtotal = (allItems || []).reduce((s, i) => s + Number(i.line_total || 0), 0);
        await supabase.from('erp_quotes').update({ subtotal, total_amount: subtotal }).eq('id', currentItem.quote_id);
        return Response.json({ item: data, message: '已更新' });
      }

      case 'delete_quote_item': {
        const { item_id } = body;
        if (!item_id) return Response.json({ error: 'item_id required' }, { status: 400 });
        const { data: item } = await supabase.from('erp_quote_items').select('quote_id').eq('id', item_id).maybeSingle();
        if (!item) return Response.json({ error: '找不到品項' }, { status: 404 });
        const { error } = await supabase.from('erp_quote_items').delete().eq('id', item_id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        // Recalculate quote totals
        const { data: allItems } = await supabase.from('erp_quote_items').select('line_total').eq('quote_id', item.quote_id);
        const subtotal = (allItems || []).reduce((s, i) => s + Number(i.line_total || 0), 0);
        await supabase.from('erp_quotes').update({ subtotal, total_amount: subtotal }).eq('id', item.quote_id);
        return Response.json({ message: '品項已刪除' });
      }

      case 'add_quote_item': {
        const { quote_id, item_number } = body;
        if (!quote_id || !item_number) return Response.json({ error: 'quote_id and item_number required' }, { status: 400 });
        const { data: product } = await supabase.from('erp_products').select('*').eq('item_number', item_number).maybeSingle();
        if (!product) return Response.json({ error: `找不到料號 ${item_number}` }, { status: 404 });
        const unitPrice = product.tw_retail_price || product.unit_price || 0;
        const { data, error } = await supabase.from('erp_quote_items').insert({
          quote_id,
          product_id: product.id,
          item_number_snapshot: product.item_number,
          description_snapshot: product.description || product.item_number,
          qty: 1,
          unit_price: unitPrice,
          line_total: unitPrice,
          cost_price_snapshot: product.cost_price || 0,
        }).select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        // Recalculate quote totals
        const { data: allItems } = await supabase.from('erp_quote_items').select('line_total').eq('quote_id', quote_id);
        const subtotal = (allItems || []).reduce((s, i) => s + Number(i.line_total || 0), 0);
        await supabase.from('erp_quotes').update({ subtotal, total_amount: subtotal }).eq('id', quote_id);
        return Response.json({ item: data, message: `已新增 ${item_number}` });
      }

      case 'replace_quote_item': {
        const { item_id, new_item_number } = body;
        if (!item_id || !new_item_number) return Response.json({ error: 'item_id and new_item_number required' }, { status: 400 });
        const { data: currentItem } = await supabase.from('erp_quote_items').select('*').eq('id', item_id).maybeSingle();
        if (!currentItem) return Response.json({ error: '找不到品項' }, { status: 404 });
        const { data: product } = await supabase.from('erp_products').select('*').eq('item_number', new_item_number).maybeSingle();
        if (!product) return Response.json({ error: `找不到料號 ${new_item_number}` }, { status: 404 });
        const unitPrice = product.tw_retail_price || product.unit_price || 0;
        const qty = Number(currentItem.qty) || 1;
        const { data, error } = await supabase.from('erp_quote_items').update({
          product_id: product.id,
          item_number_snapshot: product.item_number,
          description_snapshot: product.description || product.item_number,
          unit_price: unitPrice,
          line_total: qty * unitPrice,
          cost_price_snapshot: product.cost_price || 0,
        }).eq('id', item_id).select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        // Recalculate quote totals
        const { data: allItems } = await supabase.from('erp_quote_items').select('line_total').eq('quote_id', currentItem.quote_id);
        const subtotal = (allItems || []).reduce((s, i) => s + Number(i.line_total || 0), 0);
        await supabase.from('erp_quotes').update({ subtotal, total_amount: subtotal }).eq('id', currentItem.quote_id);
        return Response.json({ item: data, message: `已替換為 ${new_item_number}` });
      }

      case 'update_po_item': {
        const { item_id, qty, unit_cost, item_note } = body;
        if (!item_id) return Response.json({ error: 'item_id required' }, { status: 400 });
        const { data: currentItem } = await supabase.from('erp_purchase_order_items').select('*').eq('id', item_id).maybeSingle();
        if (!currentItem) return Response.json({ error: '找不到品項' }, { status: 404 });
        const newQty = qty !== undefined ? Number(qty) : Number(currentItem.qty);
        const newCost = unit_cost !== undefined ? Number(unit_cost) : Number(currentItem.unit_cost);
        const payload = { qty: newQty, unit_cost: newCost, line_total: newQty * newCost };
        if (item_note !== undefined) payload.item_note = item_note;
        const { data, error } = await supabase.from('erp_purchase_order_items').update(payload).eq('id', item_id).select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        // Recalculate PO totals
        const { data: allItems } = await supabase.from('erp_purchase_order_items').select('line_total').eq('po_id', currentItem.po_id);
        const total = (allItems || []).reduce((s, i) => s + Number(i.line_total || 0), 0);
        await supabase.from('erp_purchase_orders').update({ total_amount: total }).eq('id', currentItem.po_id);
        return Response.json({ item: data, message: '已更新' });
      }

      case 'delete_po_item': {
        const { item_id } = body;
        if (!item_id) return Response.json({ error: 'item_id required' }, { status: 400 });
        const { data: item } = await supabase.from('erp_purchase_order_items').select('po_id').eq('id', item_id).maybeSingle();
        if (!item) return Response.json({ error: '找不到品項' }, { status: 404 });
        const { error } = await supabase.from('erp_purchase_order_items').delete().eq('id', item_id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        const { data: allItems } = await supabase.from('erp_purchase_order_items').select('line_total').eq('po_id', item.po_id);
        const total = (allItems || []).reduce((s, i) => s + Number(i.line_total || 0), 0);
        await supabase.from('erp_purchase_orders').update({ total_amount: total }).eq('id', item.po_id);
        return Response.json({ message: '品項已刪除' });
      }

      case 'add_po_item': {
        const { po_id, item_number } = body;
        if (!po_id || !item_number) return Response.json({ error: 'po_id and item_number required' }, { status: 400 });
        const { data: product } = await supabase.from('erp_products').select('*').eq('item_number', item_number).maybeSingle();
        if (!product) {
          const { data: qbProduct } = await supabase.from('quickbuy_products').select('*').eq('item_number', item_number).maybeSingle();
          if (!qbProduct) return Response.json({ error: `找不到料號 ${item_number}` }, { status: 404 });
          Object.assign(product || {}, qbProduct);
        }
        const p = product || {};
        const unitCost = p.cost_price || p.us_price || 0;
        const { data, error } = await supabase.from('erp_purchase_order_items').insert({
          po_id,
          product_id: p.id,
          item_number: p.item_number,
          description: p.description || p.item_number,
          qty: 1,
          unit_cost: unitCost,
          line_total: unitCost,
        }).select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        const { data: allItems } = await supabase.from('erp_purchase_order_items').select('line_total').eq('po_id', po_id);
        const total = (allItems || []).reduce((s, i) => s + Number(i.line_total || 0), 0);
        await supabase.from('erp_purchase_orders').update({ total_amount: total }).eq('id', po_id);
        return Response.json({ item: data, message: `已新增 ${item_number}` });
      }

      case 'replace_po_item': {
        const { item_id, new_item_number } = body;
        if (!item_id || !new_item_number) return Response.json({ error: 'item_id and new_item_number required' }, { status: 400 });
        const { data: currentItem } = await supabase.from('erp_purchase_order_items').select('*').eq('id', item_id).maybeSingle();
        if (!currentItem) return Response.json({ error: '找不到品項' }, { status: 404 });
        const { data: product } = await supabase.from('erp_products').select('*').eq('item_number', new_item_number).maybeSingle();
        if (!product) return Response.json({ error: `找不到料號 ${new_item_number}` }, { status: 404 });
        const unitCost = product.cost_price || product.us_price || 0;
        const qty = Number(currentItem.qty) || 1;
        const { data, error } = await supabase.from('erp_purchase_order_items').update({
          product_id: product.id,
          item_number: product.item_number,
          description: product.description || product.item_number,
          unit_cost: unitCost,
          line_total: qty * unitCost,
        }).eq('id', item_id).select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        const { data: allItems } = await supabase.from('erp_purchase_order_items').select('line_total').eq('po_id', currentItem.po_id);
        const total = (allItems || []).reduce((s, i) => s + Number(i.line_total || 0), 0);
        await supabase.from('erp_purchase_orders').update({ total_amount: total }).eq('id', currentItem.po_id);
        return Response.json({ item: data, message: `已替換為 ${new_item_number}` });
      }

      case 'update_quote': {
        const { quote_id, ...updates } = body;
        if (!quote_id) return Response.json({ error: 'Missing quote_id' }, { status: 400 });
        const allowed = ['sales_person', 'valid_until', 'remark', 'status', 'discount_amount', 'shipping_fee'];
        const payload = {};
        allowed.forEach(k => { if (updates[k] !== undefined) payload[k] = updates[k]; });
        const { data, error } = await supabase.from('erp_quotes').update(payload).eq('id', quote_id).select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ quote: data, message: '報價單已更新' });
      }

      case 'delete_quote': {
        const { quote_id } = body;
        if (!quote_id) return Response.json({ error: 'Missing quote_id' }, { status: 400 });
        const { data: quote } = await supabase.from('erp_quotes').select('status').eq('id', quote_id).maybeSingle();
        if (!quote) return Response.json({ error: '報價單不存在' }, { status: 404 });
        if (!['draft', 'sent'].includes(quote.status)) return Response.json({ error: '只有草稿或已送出的報價單可以刪除' }, { status: 400 });
        await supabase.from('erp_quote_items').delete().eq('quote_id', quote_id);
        const { error } = await supabase.from('erp_quotes').delete().eq('id', quote_id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ message: '報價單已刪除' });
      }

      case 'quick_create_customer': {
        const { name, company_name, phone, email, tax_id } = body;
        if (!name?.trim()) return Response.json({ error: '客戶名稱必填' }, { status: 400 });
        const code = 'C' + Date.now().toString().slice(-8);
        const { data, error } = await supabase.from('erp_customers').insert({
          customer_code: code,
          name: name.trim(),
          company_name: company_name?.trim() || null,
          phone: phone?.trim() || null,
          email: email?.trim() || null,
          tax_id: tax_id?.trim() || null,
          status: 'active',
          customer_stage: 'customer',
          source: 'manual',
        }).select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ customer: data, message: '客戶已建立' });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
}
