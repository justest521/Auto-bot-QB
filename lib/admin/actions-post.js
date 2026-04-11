// lib/admin/actions-post.js — 所有 POST action handlers
import { supabase } from '@/lib/supabase';
import {
  cleanCsvValue, toNumber, toDateValue, normalizeRows, parseBatchNumber,
  isMissingRelationError, missingRelationResponse,
  insertSingleWithColumnFallback, insertManyWithColumnFallback,
  deleteAllRows,
} from './utils';
import { appendImportHistory, upsertQuickbuyConfigEntry, getQuickbuyConfigEntry } from './config';
import { runErpCustomerQuery } from './erp-customers';

// ── 訂單鎖定：送審後不可修改品項/金額/數量 ──
const ORDER_EDITABLE_STATUSES = ['draft', 'rejected']; // 只有草稿和被駁回才能改
async function assertOrderEditable(orderId) {
  const { data: order } = await supabase.from('erp_orders').select('status, order_no').eq('id', orderId).maybeSingle();
  if (!order) return { ok: false, error: '找不到訂單', status: 404 };
  if (!ORDER_EDITABLE_STATUSES.includes(order.status)) {
    const labels = { pending_approval: '待審核', confirmed: '已核准', processing: '出貨中', completed: '已完成' };
    return { ok: false, error: `訂單 ${order.order_no} 狀態為「${labels[order.status] || order.status}」，送審後不可修改品項與金額。如需修改請先退回草稿。`, status: 400 };
  }
  return { ok: true, order };
}

// ── ERP 功能開關 ──
const ERP_FEATURES_DEFAULTS = { order_approval: true };
async function getErpFeatures() {
  try {
    const stored = await getQuickbuyConfigEntry('erp_features');
    return { ...ERP_FEATURES_DEFAULTS, ...(stored || {}) };
  } catch { return { ...ERP_FEATURES_DEFAULTS }; }
}

// Helper: 自動核准已停用 — 審核關閉（feature flag = off）時才繞過，否則一律需人工審核
async function tryAutoApproveOrder(orderId, orderNo, totalAmount, _orderItems) {
  // 審核關閉 → 直接核准
  const features = await getErpFeatures();
  if (!features.order_approval) {
    await supabase.from('erp_orders').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', orderId);
    await supabase.from('erp_approvals').insert({
      doc_type: 'order', doc_id: orderId, doc_no: orderNo,
      requested_by: 'system', status: 'approved',
      approved_by: 'system_auto', approved_at: new Date().toISOString(),
      amount: Number(totalAmount || 0), remark: '審核機制已關閉，系統自動核准',
    });
    return { approved: true, reason: '審核機制已關閉' };
  }
  // 審核開啟 → 一律需人工審核，不自動核准
  return { approved: false, reason: '需人工審核' };
}

// Helper: 檢查訂單是否全部完成（付款+出貨都完成才算 completed）
async function checkOrderCompletion(orderId) {
  const { data: order } = await supabase.from('erp_orders').select('payment_status, shipping_status, status').eq('id', orderId).maybeSingle();
  if (!order) return;
  // 已取消或已完成的訂單不再重複更新
  if (order.status === 'completed' || order.status === 'cancelled') return;
  const paid = order.payment_status === 'paid';
  // 接受 shipped / delivered / partial（部分出貨但已全額付款亦視為完成）
  const shipped = ['shipped', 'delivered', 'partial'].includes(order.shipping_status);
  if (paid && shipped) {
    await supabase.from('erp_orders').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', orderId);
  } else if (shipped) {
    // 出貨已開始但尚未全額付款 → 狀態切為「出貨中」
    await supabase.from('erp_orders').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', orderId);
  }
}

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

// ── 敏感操作權限守門 ──
const ADMIN_ONLY_ACTIONS = new Set([
  'reset_erp_business_data', 'import_csv_dataset', 'delete_customer', 'delete_announcement',
  'delete_lead', 'delete_order_item', 'delete_quote_item', 'delete_po_item', 'delete_quote',
  'create_admin_user', 'update_admin_user', 'delete_admin_user', 'update_role_permissions',
]);
const FINANCE_ACTIONS = new Set([
  'confirm_payment', 'verify_payment', 'verify_order_payments',
  'create_payment_receipt', 'allocate_payment', 'manual_reconcile',
]);

export async function handlePostAction(action, body) {
  const userRole = body.__auth_user?.role || 'admin'; // legacy auth 視為 admin

  // 僅 admin 可執行的危險操作
  if (ADMIN_ONLY_ACTIONS.has(action) && userRole !== 'admin') {
    return Response.json({ error: '僅系統管理員可執行此操作' }, { status: 403 });
  }
  // 財務操作僅 admin / accountant
  if (FINANCE_ACTIONS.has(action) && userRole !== 'admin' && userRole !== 'accountant') {
    return Response.json({ error: '僅會計人員或管理員可執行此操作' }, { status: 403 });
  }

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
              stock_qty: toNumber(row.stock_qty),
              safety_stock: toNumber(row.safety_stock),
              cost_price: toNumber(row.cost_price),
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

      case 'delete_customer': {
        const { customer_id } = body;
        if (!customer_id) return Response.json({ error: 'customer_id is required' }, { status: 400 });
        // Check if customer has related records (quotes, orders, sales)
        const [{ count: quoteCount }, { count: orderCount }, { count: saleCount }] = await Promise.all([
          supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('customer_id', customer_id),
          supabase.from('orders').select('id', { count: 'exact', head: true }).eq('customer_id', customer_id),
          supabase.from('sales_slips').select('id', { count: 'exact', head: true }).eq('customer_id', customer_id),
        ]);
        if ((quoteCount || 0) + (orderCount || 0) + (saleCount || 0) > 0) {
          return Response.json({ error: `此客戶有 ${quoteCount || 0} 筆報價、${orderCount || 0} 筆訂單、${saleCount || 0} 筆銷貨，無法刪除。請先刪除相關單據。` }, { status: 400 });
        }
        const { error } = await supabase.from('erp_customers').delete().eq('id', customer_id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true });
      }

      case 'create_customer': {
        const { profile, force } = body;
        if (!profile || !profile.company_name) {
          return Response.json({ error: 'company_name is required' }, { status: 400 });
        }

        // 重複檢查：2+ 欄位吻合即阻擋（除非 force=true 強制建立）
        if (!force) {
          const { data: allCustomers } = await supabase
            .from('erp_customers')
            .select('id, customer_code, company_name, name, phone, tax_id');
          const normInput = (profile.company_name || '').replace(/\s+/g, '').replace(/(股份)?有限公司|企業社|工作室|商行|行號/g, '').trim();
          const inputPhone = (profile.phone || '').replace(/[-\s]/g, '').trim();
          const inputTaxId = (profile.tax_id || '').trim();
          const inputName = (profile.name || '').trim();
          const dupMatches = [];
          (allCustomers || []).forEach(c => {
            let matchCount = 0;
            const matchFields = [];
            const normC = (c.company_name || c.name || '').replace(/\s+/g, '').replace(/(股份)?有限公司|企業社|工作室|商行|行號/g, '').trim();
            if (normInput && normC && normInput === normC) { matchCount++; matchFields.push('公司名稱'); }
            if (inputName && c.name && inputName === c.name) { matchCount++; matchFields.push('聯絡人'); }
            const normCPhone = (c.phone || '').replace(/[-\s]/g, '').trim();
            if (inputPhone && inputPhone.length >= 8 && normCPhone && inputPhone === normCPhone) { matchCount++; matchFields.push('電話'); }
            if (inputTaxId && inputTaxId.length >= 8 && c.tax_id && inputTaxId === c.tax_id) { matchCount++; matchFields.push('統編'); }
            if (matchCount >= 2) {
              dupMatches.push({ id: c.id, customer_code: c.customer_code, company_name: c.company_name, name: c.name, phone: c.phone, tax_id: c.tax_id, matchFields });
            }
          });
          if (dupMatches.length > 0) {
            return Response.json({
              error: 'duplicate_found',
              message: `偵測到 ${dupMatches.length} 筆疑似重複客戶`,
              duplicates: dupMatches,
            });
          }
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

        // 交易明細（子表先刪）
        await deleteAllRows('erp_shipment_items', 'id');
        await deleteAllRows('erp_shipments', 'id');
        await deleteAllRows('erp_quote_items', 'id');
        await deleteAllRows('erp_quotes', 'id');
        await deleteAllRows('erp_order_items', 'id');
        await deleteAllRows('erp_orders', 'id');
        await deleteAllRows('qb_order_items', 'id');
        await deleteAllRows('qb_invoices', 'id');
        await deleteAllRows('qb_sales_history', 'id');
        await deleteAllRows('erp_invoices', 'id');
        await deleteAllRows('erp_approvals', 'id');
        await deleteAllRows('erp_profit_analysis', 'id');
        await deleteAllRows('erp_sales_return_summary', 'id');
        await deleteAllRows('erp_stock_ins', 'id');
        await deleteAllRows('erp_purchase_orders', 'id');
        await deleteAllRows('qb_inventory_movements', 'id');
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
            'erp_shipment_items',
            'erp_shipments',
            'erp_quote_items',
            'erp_quotes',
            'erp_order_items',
            'erp_orders',
            'qb_order_items',
            'qb_invoices',
            'qb_sales_history',
            'erp_invoices',
            'erp_approvals',
            'erp_profit_analysis',
            'erp_sales_return_summary',
            'erp_stock_ins',
            'erp_purchase_orders',
            'qb_inventory_movements',
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
          tax_excluded,
          sales_person,
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
        const taxRate = tax_excluded === false ? 0 : 5; // 0=免稅, 5=5%外加
        const taxAmount = taxRate > 0 ? Math.round(taxableBase * (taxRate / 100)) : 0;
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
          tax_rate: taxRate,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          tax_inclusive: tax_excluded === false,
          remark: cleanCsvValue(remark),
          sales_person: cleanCsvValue(sales_person) || null,
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
          tax_excluded: orderTaxExcluded,
          sales_person: orderSalesPerson,
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
        // 3.2 折扣不能超過小計
        if (safeOrderDiscount > orderSubtotal) {
          return Response.json({ error: `折扣金額 (${safeOrderDiscount}) 不能超過小計 (${orderSubtotal})` }, { status: 400 });
        }
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
          tax_inclusive: orderTaxExcluded === false,
          remark: cleanCsvValue(orderRemark),
          sales_person: cleanCsvValue(orderSalesPerson) || null,
          payment_status: 'unpaid',
          shipping_status: 'pending',
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

        // ── Auto-approve if all items in stock + amount under threshold ──
        let autoApproved = false;
        let autoReason = '';
        try {
          const result = await tryAutoApproveOrder(newOrder.id, newOrder.order_no, newOrder.total_amount, safeOrderItems);
          autoApproved = result.approved;
          autoReason = result.reason || '';
          if (autoApproved) newOrder.status = 'confirmed';
        } catch (e) {
          console.error('[create_order] Auto-approve check failed:', e?.message);
        }

        return Response.json({
          success: true,
          order: newOrder,
          count: orderItemPayload.length,
          auto_approved: autoApproved,
          message: autoApproved ? '訂單已建立，庫存充足系統自動核准' : `訂單已建立${autoReason ? `（${autoReason}，需人工審核）` : ''}`,
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
          status: 'draft',
          payment_status: 'unpaid',
          shipping_status: 'pending',
          subtotal: toNumber(quote.subtotal),
          discount_amount: toNumber(quote.discount_amount),
          shipping_fee: toNumber(quote.shipping_fee),
          tax_amount: toNumber(quote.tax_amount),
          total_amount: toNumber(quote.total_amount),
          tax_inclusive: quote.tax_inclusive || false,
          remark: cleanCsvValue(quote.remark),
          sales_person: quote.sales_person || null,
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

        // ── Auto-approve if all items in stock + amount under threshold ──
        let autoApproved = false;
        let autoReason = '';
        try {
          const result = await tryAutoApproveOrder(order.id, order.order_no, order.total_amount, orderItems);
          autoApproved = result.approved;
          autoReason = result.reason || '';
          if (autoApproved) order.status = 'confirmed';
        } catch (e) {
          console.error('[convert_quote_to_order] Auto-approve check failed:', e?.message);
        }

        return Response.json({
          success: true,
          order,
          count: orderItems.length,
          auto_approved: autoApproved,
          message: autoApproved ? '訂單已建立，庫存充足系統自動核准' : `訂單已建立${autoReason ? `（${autoReason}，需人工審核）` : '，請送審核准後繼續'}`,
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
              await supabase.from('erp_orders').update({ payment_status: 'paid', updated_at: new Date().toISOString() }).eq('id', lookupId);
              await checkOrderCompletion(lookupId);
            } else if (totalPaid > 0) {
              await supabase.from('erp_orders').update({ payment_status: 'partial', updated_at: new Date().toISOString() }).eq('id', lookupId);
            }
          }
        }

        // === Auto-create erp_payment_receipts on confirm ===
        try {
          const rcptNo = `RCPT-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
          let rcptCustId = null;
          if (lookupId) {
            const { data: orderForRcpt } = await supabase.from('erp_orders').select('customer_id, order_no').eq('id', lookupId).maybeSingle();
            rcptCustId = orderForRcpt?.customer_id || null;
            await supabase.from('erp_payment_receipts').insert({
              receipt_no: rcptNo,
              customer_id: rcptCustId,
              receipt_date: new Date().toISOString().slice(0, 10),
              total_amount: Number(data.amount || 0),
              payment_method: data.payment_method || 'transfer',
              reference_no: data.payment_number || '',
              status: 'confirmed',
              confirmed_at: new Date().toISOString(),
              confirmed_by: 'system',
              remark: `收款確認自動建立 | 訂單:${orderForRcpt?.order_no || lookupId}`,
            });
          }
        } catch (rcptErr) {
          console.error('Auto-create payment receipt on confirm error:', rcptErr);
        }

        return Response.json({ success: true, payment: data });
      }

      /* ── 財務核帳 ── */
      case 'verify_payment': {
        const { payment_id: vpId, verified: vpVerified } = body;
        if (!vpId) return Response.json({ error: 'payment_id 為必填' }, { status: 400 });
        const isVerified = vpVerified !== false; // default true
        const { error: vpErr } = await supabase.from('qb_payments').update({
          verified: isVerified,
          verified_by: isVerified ? (body.__auth_user?.display_name || body.__auth_user?.username || 'admin') : null,
          verified_at: isVerified ? new Date().toISOString() : null,
        }).eq('id', vpId);
        if (vpErr) return Response.json({ error: vpErr.message }, { status: 500 });
        return Response.json({ success: true, message: isVerified ? '已核帳' : '已取消核帳' });
      }

      /* ── 批次核帳 ── */
      case 'verify_order_payments': {
        const { order_id: voOrderId, verified: voVerified } = body;
        if (!voOrderId) return Response.json({ error: 'order_id 為必填' }, { status: 400 });
        const voIsVerified = voVerified !== false;
        const verifiedBy = voIsVerified ? (body.__auth_user?.display_name || body.__auth_user?.username || 'admin') : null;
        const { error: voErr, count: voCount } = await supabase.from('qb_payments').update({
          verified: voIsVerified,
          verified_by: verifiedBy,
          verified_at: voIsVerified ? new Date().toISOString() : null,
        }).eq('erp_order_id', voOrderId).eq('status', 'confirmed');
        if (voErr) return Response.json({ error: voErr.message }, { status: 500 });
        return Response.json({ success: true, message: voIsVerified ? `已核帳 ${voCount || ''} 筆` : '已取消核帳' });
      }

      case 'upload_payment_proof': {
        const { payment_id: uppId, proof_data, proof_name } = body;
        if (!uppId || !proof_data) return Response.json({ error: 'payment_id 和 proof_data 為必填' }, { status: 400 });
        const ext = (proof_name || 'proof.jpg').split('.').pop() || 'jpg';
        const proofPath = `payment-proofs/${uppId}-${Date.now()}.${ext}`;
        const proofBuf = Buffer.from(proof_data, 'base64');
        const { error: upErr } = await supabase.storage.from('company-assets').upload(proofPath, proofBuf, { contentType: `image/${ext}`, upsert: true });
        if (upErr) return Response.json({ error: `上傳失敗: ${upErr.message}` }, { status: 500 });
        const { data: urlData } = supabase.storage.from('company-assets').getPublicUrl(proofPath);
        const newProofUrl = urlData?.publicUrl || null;
        await supabase.from('qb_payments').update({ proof_url: newProofUrl }).eq('id', uppId);
        return Response.json({ success: true, proof_url: newProofUrl, message: '匯款證明已上傳' });
      }

      /* ===================== 收據憑證上傳 ===================== */
      case 'upload_receipt_proof': {
        const { receipt_id: urpId, proof_data: urpData, proof_name: urpName } = body;
        if (!urpId || !urpData) return Response.json({ error: 'receipt_id 和 proof_data 為必填' }, { status: 400 });
        const urpExt = (urpName || 'proof.jpg').split('.').pop() || 'jpg';
        const urpPath = `payment-proofs/rcpt-${urpId}-${Date.now()}.${urpExt}`;
        const urpBuf = Buffer.from(urpData, 'base64');
        const { error: urpErr } = await supabase.storage.from('company-assets').upload(urpPath, urpBuf, { contentType: `image/${urpExt === 'png' ? 'png' : 'jpeg'}`, upsert: true });
        if (urpErr) return Response.json({ error: `上傳失敗: ${urpErr.message}` }, { status: 500 });
        const { data: urpUrlData } = supabase.storage.from('company-assets').getPublicUrl(urpPath);
        const urpProofUrl = urpUrlData?.publicUrl || null;
        await supabase.from('erp_payment_receipts').update({ proof_url: urpProofUrl }).eq('id', urpId);
        return Response.json({ success: true, proof_url: urpProofUrl, message: '收據憑證已上傳' });
      }

      /* ===================== 銷貨單付款憑證上傳 ===================== */
      case 'upload_sale_payment_proof': {
        const { sale_id: sppSaleId, proof_data: sppData, proof_name: sppName } = body;
        if (!sppSaleId || !sppData) return Response.json({ error: 'sale_id 和 proof_data 為必填' }, { status: 400 });
        const sppExt = (sppName || 'proof.jpg').split('.').pop() || 'jpg';
        const sppPath = `payment-proofs/sale-${sppSaleId}-${Date.now()}.${sppExt}`;
        const sppBuf = Buffer.from(sppData, 'base64');
        const { error: sppErr } = await supabase.storage.from('company-assets').upload(sppPath, sppBuf, { contentType: `image/${sppExt === 'png' ? 'png' : 'jpeg'}`, upsert: true });
        if (sppErr) return Response.json({ error: `上傳失敗: ${sppErr.message}` }, { status: 500 });
        const { data: sppUrlData } = supabase.storage.from('company-assets').getPublicUrl(sppPath);
        const sppProofUrl = sppUrlData?.publicUrl || null;
        // 1. 更新 qb_sales_history
        await supabase.from('qb_sales_history').update({ proof_url: sppProofUrl }).eq('id', sppSaleId);
        // 2. 同步回寫 qb_payments.proof_url（讓 AR modal / 歷程 可以顯示同一張圖）
        const { data: sppSaleRow } = await supabase.from('qb_sales_history').select('source_id').eq('id', sppSaleId).maybeSingle();
        if (sppSaleRow?.source_id) {
          await supabase.from('qb_payments')
            .update({ proof_url: sppProofUrl })
            .eq('erp_order_id', sppSaleRow.source_id)
            .is('proof_url', null)
            .eq('status', 'confirmed');
        }
        return Response.json({ success: true, proof_url: sppProofUrl, message: '付款憑證已上傳' });
      }

      /* ===================== 廠商付款憑證上傳 ===================== */
      case 'upload_vendor_payment_proof': {
        const { vendor_payment_id: vppId, proof_data: vppData, proof_name: vppName } = body;
        if (!vppId || !vppData) return Response.json({ error: 'vendor_payment_id 和 proof_data 為必填' }, { status: 400 });
        const vppExt = (vppName || 'proof.jpg').split('.').pop() || 'jpg';
        const vppPath = `payment-proofs/vp-${vppId}-${Date.now()}.${vppExt}`;
        const vppBuf = Buffer.from(vppData, 'base64');
        const { error: vppErr } = await supabase.storage.from('company-assets').upload(vppPath, vppBuf, { contentType: `image/${vppExt === 'png' ? 'png' : 'jpeg'}`, upsert: true });
        if (vppErr) return Response.json({ error: `上傳失敗: ${vppErr.message}` }, { status: 500 });
        const { data: vppUrlData } = supabase.storage.from('company-assets').getPublicUrl(vppPath);
        const vppProofUrl = vppUrlData?.publicUrl || null;
        await supabase.from('erp_vendor_payments').update({ proof_url: vppProofUrl }).eq('id', vppId);
        return Response.json({ success: true, proof_url: vppProofUrl, message: '付款憑證已上傳' });
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
          const { data: order } = await supabase.from('erp_orders').select('id, customer_id, order_no, status').eq('id', order_id).maybeSingle();
          if (!order) return Response.json({ error: '找不到對應的訂單' }, { status: 404 });
          // 1.2 訂單必須核准後才能出貨
          if (!['confirmed', 'processing'].includes(order.status)) {
            return Response.json({ error: `訂單狀態為「${order.status}」，必須先通過人工審核才能出貨` }, { status: 400 });
          }
          // 1.2a 確認 erp_approvals 有核准記錄
          const { data: shipApproval } = await supabase.from('erp_approvals')
            .select('id').eq('doc_type', 'order').eq('doc_id', order_id).eq('status', 'approved')
            .limit(1).maybeSingle();
          if (!shipApproval) {
            return Response.json({ error: '找不到此訂單的審核記錄，請先至「審核」頁面完成人工核准' }, { status: 400 });
          }
          customerId = order?.customer_id || null;
          orderNo = order?.order_no || '';
        } else if (sale_id) {
          // Find order via sale's source_id (links to erp_orders.id)
          const { data: sale } = await supabase.from('qb_sales_history').select('slip_number, customer_name, source_id, source_type').eq('id', sale_id).maybeSingle();
          if (sale?.source_id) {
            const { data: order } = await supabase.from('erp_orders').select('id, customer_id, order_no').eq('id', sale.source_id).maybeSingle();
            if (order) { orderId = order.id; customerId = order.customer_id; orderNo = order.order_no; }
          }
        }

        // ── PRE-FLIGHT: compute items BEFORE creating erp_shipments ──
        // Prevents creating/deleting empty shipment records on over-ship
        let alreadyShippedMap = {};
        if (sale_id || orderId) {
          const shipQuery = sale_id
            ? supabase.from('erp_shipment_items').select('order_item_id, product_id, item_number, qty_shipped, erp_shipments!inner(sale_id, status)').eq('erp_shipments.sale_id', sale_id).neq('erp_shipments.status', 'cancelled')
            : supabase.from('erp_shipment_items').select('order_item_id, product_id, item_number, qty_shipped, erp_shipments!inner(order_id, status)').eq('erp_shipments.order_id', orderId).neq('erp_shipments.status', 'cancelled');
          const { data: prevShipped } = await shipQuery;
          (prevShipped || []).forEach(si => {
            const key = String(si.order_item_id || si.product_id || si.item_number || '');
            if (key) alreadyShippedMap[key] = (alreadyShippedMap[key] || 0) + Number(si.qty_shipped || 0);
          });
        }

        // Compute items to ship — use provided items, or auto-populate from sale/order
        // qb_order_items.id is bigint (not UUID); use item_number as key for QB sale items
        let safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
        if (safeItems.length === 0 && sale_id) {
          const { data: saleItems } = await supabase.from('qb_order_items').select('id, item_number, quantity').eq('order_id', sale_id);
          safeItems = (saleItems || []).map(si => {
            const ordered = Number(si.quantity || 0);
            const shipped = alreadyShippedMap[si.item_number] || 0;
            const remaining = Math.max(0, ordered - shipped);
            return { item_number: si.item_number, qty_shipped: remaining };
          }).filter(si => si.qty_shipped > 0);
        }
        if (safeItems.length === 0 && orderId && !sale_id) {
          // Only use order path when NOT from a sale — prevents double-shipping via different keys
          const { data: oi } = await supabase.from('erp_order_items').select('id, product_id, item_number_snapshot, qty').eq('order_id', orderId);
          safeItems = (oi || []).map(o => {
            const ordered = Number(o.qty || 0);
            const shipped = alreadyShippedMap[String(o.id)] || alreadyShippedMap[String(o.product_id || '')] || alreadyShippedMap[o.item_number_snapshot || ''] || 0;
            const remaining = Math.max(0, ordered - shipped);
            return { order_item_id: o.id, product_id: o.product_id, item_number: o.item_number_snapshot, qty_shipped: remaining };
          }).filter(o => o.qty_shipped > 0);
        }

        // Early exit if no items remain — before creating any DB record
        if (safeItems.length === 0) {
          return Response.json({ error: '所有品項已全部出貨完畢，無法再建立出貨單' }, { status: 400 });
        }

        // ── Create erp_shipments record (now that we know items exist) ──
        const { data: shipment, error: shipError } = await insertSingleWithColumnFallback('erp_shipments', {
          shipment_no: shipmentNo,
          order_id: orderId || null,
          sale_id: sale_id || null,
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
        if (!shipment) return Response.json({ error: '出貨單建立失敗，請再試一次' }, { status: 500 });

        // Clamp manually-provided items to remaining qty
        if (Array.isArray(items) && items.filter(Boolean).length > 0) {
          safeItems = safeItems.map(it => {
            const pid = it.product_id;
            const shipped = alreadyShippedMap[pid] || 0;
            // We need original ordered qty to clamp — skip clamping if no ordered info
            return it;
          });
        }

        // === 出貨品項寫入 + 庫存扣減 + 訂單狀態更新 ===
        // 全部包在 try/catch — 即使任何步驟失敗，出貨單已建立，仍回成功
        try {
        if (safeItems.length > 0) {
          const itemPayload = safeItems.map((it) => ({
            shipment_id: shipment.id,
            order_item_id: it.order_item_id || null,  // must be UUID; never use bigint QB item id
            product_id: it.product_id || null,
            item_number: it.item_number || null,
            qty_shipped: toNumber(it.qty_shipped) || toNumber(it.qty),
          }));
          { const { error: _imErr } = await insertManyWithColumnFallback('erp_shipment_items', itemPayload); if (_imErr) console.error('[erp_shipment_items] insert error:', _imErr.message); }

          // 1.7 出貨扣庫存 + 記錄 movement
          for (const it of itemPayload) {
            try {
            const qtyShipped = it.qty_shipped || 0;
            if (qtyShipped <= 0) continue;
            // 查出 item_number（從 order_item 或 product）
            let itemNumber = null;
            if (it.order_item_id) {
              const { data: oi } = await supabase.from('erp_order_items').select('item_number_snapshot').eq('id', it.order_item_id).maybeSingle();
              itemNumber = oi?.item_number_snapshot;
            }
            if (!itemNumber && it.item_number) {
              itemNumber = it.item_number;
            }
            if (!itemNumber && it.product_id) {
              const { data: prod } = await supabase.from('quickbuy_products').select('item_number').eq('id', it.product_id).maybeSingle();
              itemNumber = prod?.item_number;
            }
            if (!itemNumber) continue;
            const normalizedItemNo = String(itemNumber).toUpperCase();
            // CAS 扣庫存
            let retries = 3;
            while (retries > 0) {
              const { data: curr } = await supabase.from('quickbuy_products').select('stock_qty').eq('item_number', normalizedItemNo).maybeSingle();
              if (!curr) break;
              const newStock = Math.max(0, (curr.stock_qty || 0) - qtyShipped);
              const { data: res } = await supabase.from('quickbuy_products')
                .update({ stock_qty: newStock, updated_at: new Date().toISOString() })
                .eq('item_number', normalizedItemNo).eq('stock_qty', curr.stock_qty).select('id');
              if (res?.length) break;
              retries--;
            }
            // 記錄庫存異動
            const { error: mvInsertErr } = await supabase.from('qb_inventory_movements').insert({
              item_number: normalizedItemNo, movement_type: 'out', quantity: qtyShipped,
              reference_type: 'shipment', reference_id: String(shipment.id),
              notes: `出貨扣庫 ${shipmentNo}`, created_by: 'admin',
            });
            if (mvInsertErr) console.error('Movement insert error (shipment):', mvInsertErr.message, { item: normalizedItemNo, shipment_id: shipment.id });
            } catch (stockErr) { console.error('Stock deduction error:', stockErr); }
          }
        }
        } catch (itemsErr) {
          console.error('Shipment items/stock error (shipment already created):', itemsErr);
        }

        // Auto update order status
        try {
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
              await supabase.from('erp_orders').update({ shipping_status: 'shipped', updated_at: new Date().toISOString() }).eq('id', orderId);
              await checkOrderCompletion(orderId);
            } else {
              await supabase.from('erp_orders').update({ shipping_status: 'partial', updated_at: new Date().toISOString() }).eq('id', orderId);
              await checkOrderCompletion(orderId); // 部分出貨 → 狀態切為「出貨中」
            }
          }
        } catch (orderStatusErr) {
          // Order status update is best-effort, don't fail the shipment
          console.error('Auto-update order status error:', orderStatusErr);
        }

        // === Auto-create erp_invoices (應收帳款) on shipment ===
        try {
          // Get order details for invoice
          const orderForInv = orderId
            ? (await supabase.from('erp_orders').select('id, order_no, customer_id, subtotal, tax_amount, total_amount').eq('id', orderId).maybeSingle()).data
            : null;
          const invCustomerId = orderForInv?.customer_id || customerId || null;
          const invTotal = orderForInv?.total_amount || 0;
          const invSubtotal = orderForInv?.subtotal || invTotal;
          const invTax = orderForInv?.tax_amount || 0;
          const invOrderNo = orderForInv?.order_no || orderNo || '';

          // 1.6 Check if invoice already exists for this order/sale (avoid duplicates)
          let existingInv = [];
          if (orderId) {
            existingInv = (await supabase.from('erp_invoices').select('id').eq('order_id', orderId).limit(1)).data || [];
          }
          if (!existingInv.length && sale_id) {
            existingInv = (await supabase.from('erp_invoices').select('id').eq('sale_id', sale_id).limit(1)).data || [];
          }

          if (!(existingInv?.length)) {
            const invNo = `INV${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
            const invDueDate = new Date();
            invDueDate.setDate(invDueDate.getDate() + 30);

            await supabase.from('erp_invoices').insert({
              invoice_no: invNo,
              order_id: orderId || null,
              sale_id: sale_id || null,
              shipment_id: shipment.id,
              customer_id: invCustomerId,
              invoice_date: new Date().toISOString().slice(0, 10),
              due_date: invDueDate.toISOString().slice(0, 10),
              status: 'issued',
              subtotal: invSubtotal,
              tax_amount: invTax,
              total_amount: invTotal,
              paid_amount: 0,
              payment_status: 'unpaid',
              balance: invTotal,
              source_type: 'shipment',
              remark: `出貨自動建立 | 出貨單:${shipmentNo} | 訂單:${invOrderNo}`,
            });
          }
        } catch (invErr) {
          // Invoice creation is best-effort, don't fail the shipment
          console.error('Auto-create invoice error:', invErr);
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

        // 2.1 嚴格正向狀態機
        const { data: currentShip } = await supabase.from('erp_shipments').select('status, order_id').eq('id', shipment_id).maybeSingle();
        if (currentShip) {
          const VALID_SHIP_TRANSITIONS = {
            pending: ['shipped', 'cancelled'],
            shipped: ['in_transit', 'delivered', 'cancelled'],
            in_transit: ['delivered', 'cancelled'],
            delivered: ['cancelled'], // 只能取消，不能反向
            cancelled: [], // 終態
          };
          const allowed = VALID_SHIP_TRANSITIONS[currentShip.status] || [];
          if (!allowed.includes(status)) {
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
              await supabase.from('erp_orders').update({ shipping_status: 'delivered', updated_at: new Date().toISOString() }).eq('id', data.order_id);
              await checkOrderCompletion(data.order_id);
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

        // 2.6 每次出貨狀態變更都檢查訂單完成
        if (data?.order_id) {
          try { await checkOrderCompletion(data.order_id); } catch (_) {}
        }

        return Response.json({ success: true, shipment: data });
      }

      /* ===================== 銷貨退回（從銷貨單發起） ===================== */
      case 'create_sales_return': {
        const { sale_id, slip_number, customer_id, customer_name, items: saleItems, total: saleTotal, subtotal: saleSubtotal, reason: saleReason } = body;
        if (!sale_id && !slip_number) return Response.json({ error: 'sale_id 或 slip_number 為必填' }, { status: 400 });

        const returnNo = `RTN${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
        const refundAmount = Number(saleTotal || saleSubtotal || 0);

        // 1.9 查原始銷貨單明細 + 驗證退貨數量不超過原始數量
        let returnItems = [];
        let originalItemMap = {};
        if (sale_id) {
          const { data: slipItems } = await supabase.from('qb_sales_items').select('*').eq('sale_id', sale_id);
          (slipItems || []).forEach(it => {
            const key = (it.item_number || it.product_code || '').toUpperCase();
            originalItemMap[key] = (originalItemMap[key] || 0) + Number(it.qty || 1);
          });
        }
        if (Array.isArray(saleItems) && saleItems.length > 0) {
          // 驗證每項退貨數量
          for (const it of saleItems) {
            const key = (it.item_number || '').toUpperCase();
            const origQty = originalItemMap[key] || 0;
            const retQty = Number(it.qty_returned || 1);
            if (origQty > 0 && retQty > origQty) {
              return Response.json({ error: `${it.item_number} 退貨數量 ${retQty} 超過原始銷貨數量 ${origQty}` }, { status: 400 });
            }
          }
          returnItems = saleItems;
        } else if (sale_id) {
          const { data: slipItems } = await supabase.from('qb_sales_items').select('*').eq('sale_id', sale_id);
          returnItems = (slipItems || []).map(it => ({
            item_number: it.item_number || it.product_code || '',
            description: it.description || it.product_name || '',
            qty_returned: it.qty || 1,
            unit_price: it.unit_price || 0,
            line_total: it.line_total || it.amount || 0,
          }));
        }

        const { data: ret, error: retError } = await insertSingleWithColumnFallback('erp_returns', {
          return_no: returnNo,
          sale_id: sale_id ? Number(sale_id) : null,
          customer_id: customer_id || null,
          reason: cleanCsvValue(saleReason || `銷貨退回 - ${slip_number || ''}`),
          status: 'pending',
          refund_amount: refundAmount,
          remark: `從銷貨單 ${slip_number || ''} 發起退回`,
        });

        if (retError) {
          if (isMissingRelationError(retError)) return missingRelationResponse(retError, 'erp_returns');
          return Response.json({ error: retError.message }, { status: 500 });
        }

        if (returnItems.length > 0) {
          const itemPayload = returnItems.map(it => ({
            return_id: ret.id,
            item_number: cleanCsvValue(it.item_number),
            description: cleanCsvValue(it.description),
            qty_returned: toNumber(it.qty_returned) || 1,
            unit_price: toNumber(it.unit_price),
            line_total: toNumber(it.line_total),
          }));
          { const { error: _imErr } = await insertManyWithColumnFallback('erp_return_items', itemPayload); if (_imErr) console.error('[erp_return_items] insert error:', _imErr.message); }
        }

        return Response.json({ success: true, return_no: returnNo, return_doc: ret });
      }

      /* ===================== 銷貨單沖帳 ===================== */
      case 'record_sale_payment': {
        const { sale_id, slip_number, amount: salePayAmt, method: salePayMethod } = body;
        if (!sale_id) return Response.json({ error: 'sale_id 為必填' }, { status: 400 });

        // 更新 qb_sales_history 的付款狀態
        const { error: payErr } = await supabase
          .from('qb_sales_history')
          .update({
            payment_status: 'paid',
            payment_method: salePayMethod || null,
            payment_date: new Date().toISOString().slice(0, 10),
            updated_at: new Date().toISOString(),
          })
          .eq('id', sale_id);

        if (payErr) return Response.json({ error: payErr.message }, { status: 500 });
        return Response.json({ success: true, message: '沖帳完成' });
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
          { const { error: _imErr } = await insertManyWithColumnFallback('erp_return_items', itemPayload); if (_imErr) console.error('[erp_return_items] insert error:', _imErr.message); }
        }

        // NOTE: Inventory restoration moved to approve_return (only on approval, not on creation)

        return Response.json({ success: true, return_doc: ret, count: itemPayload.length });
      }

      case 'approve_return': {
        const { return_id, status: retStatus, notify_line } = body;
        if (!return_id) return Response.json({ error: 'return_id is required' }, { status: 400 });
        const newStatus = retStatus || 'approved';

        // 3.8 先查舊狀態，判斷是否需要反向庫存操作
        const { data: prevReturn } = await supabase.from('erp_returns').select('status').eq('id', return_id).maybeSingle();
        const prevStatus = prevReturn?.status;

        const { data, error } = await supabase
          .from('erp_returns')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', return_id)
          .select()
          .single();

        if (error) return Response.json({ error: error.message }, { status: 500 });

        // 3.8 如果從 approved → rejected/cancelled，反扣庫存
        if (prevStatus === 'approved' && (newStatus === 'rejected' || newStatus === 'cancelled')) {
          const { data: retItems } = await supabase.from('erp_return_items').select('*').eq('return_id', return_id);
          for (const it of (retItems || [])) {
            if (it.item_number && it.qty_returned > 0) {
              const { data: prod } = await supabase.from('quickbuy_products').select('stock_qty').eq('item_number', it.item_number).maybeSingle();
              if (prod) {
                const newStock = Math.max(0, Number(prod.stock_qty || 0) - Number(it.qty_returned));
                await supabase.from('quickbuy_products').update({ stock_qty: newStock }).eq('item_number', it.item_number);
              }
              await supabase.from('qb_inventory_movements').insert({
                item_number: it.item_number, movement_type: 'out', quantity: it.qty_returned,
                reference_type: 'return_rejected', reference_id: String(return_id),
                notes: `退貨駁回反扣 ${data?.return_no || return_id}`, created_by: 'admin',
              });
            }
          }
        }

        // Auto restore inventory on approval
        if (newStatus === 'approved' && prevStatus !== 'approved') {
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

        // ── 銷退核准：建立 Credit Note，減少應收帳款 ──
        if (newStatus === 'approved' && prevStatus !== 'approved' && data?.order_id) {
          try {
            const refundAmt = Number(data.refund_amount || 0);
            if (refundAmt > 0) {
              // 防重複：同一退貨單只建一次 Credit Note
              const { data: existCN } = await supabase.from('erp_invoices')
                .select('id').eq('order_id', data.order_id).lt('total_amount', 0).limit(1);
              if (!existCN?.length) {
                const creditNo = `CN-${Date.now().toString(36).toUpperCase()}`;
                await supabase.from('erp_invoices').insert({
                  invoice_no: creditNo,
                  order_id: data.order_id,
                  customer_id: data.customer_id || null,
                  invoice_date: new Date().toISOString().slice(0, 10),
                  due_date: new Date().toISOString().slice(0, 10),
                  status: 'issued',
                  subtotal: -refundAmt,
                  discount_amount: 0,
                  shipping_fee: 0,
                  tax_amount: 0,
                  total_amount: -refundAmt,
                  paid_amount: 0,
                  balance: -refundAmt,
                  payment_status: 'unpaid',
                  remark: `退貨折讓 ${data.return_no || return_id}`,
                  created_by: 'system',
                });
              }
              // 同步減少原始正向發票的 balance
              const { data: origInv } = await supabase.from('erp_invoices')
                .select('*').eq('order_id', data.order_id).gt('total_amount', 0)
                .order('created_at', { ascending: true }).limit(1).maybeSingle();
              if (origInv) {
                const curBalance = Number(origInv.balance ?? (origInv.total_amount - (origInv.paid_amount || 0)));
                const newBalance = Math.max(0, curBalance - refundAmt);
                const newTotal = Math.max(0, Number(origInv.total_amount) - refundAmt);
                const newPaidStatus = (origInv.paid_amount || 0) >= newTotal - 0.01 ? 'paid' : (origInv.paid_amount || 0) > 0 ? 'partial' : 'unpaid';
                await supabase.from('erp_invoices').update({
                  total_amount: newTotal,
                  balance: newBalance,
                  payment_status: newPaidStatus,
                  updated_at: new Date().toISOString(),
                }).eq('id', origInv.id);
              }
              // 同步減少訂單 total_amount，觸發完成檢查
              const { data: retOrder } = await supabase.from('erp_orders').select('total_amount').eq('id', data.order_id).maybeSingle();
              if (retOrder) {
                const newOrderTotal = Math.max(0, Number(retOrder.total_amount) - refundAmt);
                await supabase.from('erp_orders').update({ total_amount: newOrderTotal, updated_at: new Date().toISOString() }).eq('id', data.order_id);
              }
            }
          } catch (cnErr) { console.error('Credit Note 建立失敗:', cnErr.message); }
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
          { const { error: _imErr } = await insertManyWithColumnFallback('erp_inquiry_items', itemPayload); if (_imErr) console.error('[erp_inquiry_items] insert error:', _imErr.message); }
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
        const { vendor_id, expected_date, remark, items, tax_excluded, currency, exchange_rate } = body;
        const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
        if (!safeItems.length) return Response.json({ error: 'items are required' }, { status: 400 });

        const poCurrency = currency || 'TWD';
        const poRate = Number(exchange_rate) || 1;

        const poNo = await generatePoNo();
        const subtotal = safeItems.reduce((s, it) => s + Number(it.line_total || 0), 0);
        const taxAmt = tax_excluded !== false ? Math.round(subtotal * 0.05) : 0;

        const { data: po, error: poErr } = await insertSingleWithColumnFallback('erp_purchase_orders', {
          po_no: poNo, vendor_id: vendor_id || null,
          expected_date: toDateValue(expected_date), status: 'draft',
          subtotal, tax_amount: taxAmt, total_amount: subtotal + taxAmt,
          tax_inclusive: tax_excluded === false,
          remark: cleanCsvValue(remark),
          currency: poCurrency,
          exchange_rate: poRate,
        });
        if (poErr) { if (isMissingRelationError(poErr)) return missingRelationResponse(poErr, 'erp_purchase_orders'); return Response.json({ error: poErr.message }, { status: 500 }); }

        const itemPayload = safeItems.map(it => ({
          po_id: po.id, item_number: cleanCsvValue(it.item_number),
          description: cleanCsvValue(it.description),
          qty: toNumber(it.qty) || 1, unit_cost: toNumber(it.unit_cost),
          line_total: toNumber(it.line_total),
          foreign_unit_cost: toNumber(it.foreign_unit_cost) || 0,
        }));
        { const { error: _imErr } = await insertManyWithColumnFallback('erp_purchase_order_items', itemPayload); if (_imErr) console.error('[erp_purchase_order_items] insert error:', _imErr.message); }

        return Response.json({ success: true, purchase_order: po, count: itemPayload.length });
      }

      case 'confirm_purchase_order': {
        const { po_id } = body;
        if (!po_id) return Response.json({ error: 'po_id is required' }, { status: 400 });
        // 1.4 狀態驗證：只允許 draft/pending_approval → confirmed
        const { data: currentPO } = await supabase.from('erp_purchase_orders').select('status').eq('id', po_id).maybeSingle();
        if (!currentPO) return Response.json({ error: '找不到採購單' }, { status: 404 });
        if (!['draft', 'pending_approval'].includes(currentPO.status)) {
          return Response.json({ error: `採購單狀態為「${currentPO.status}」，無法確認` }, { status: 400 });
        }
        const { data, error } = await supabase.from('erp_purchase_orders').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', po_id).select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true, purchase_order: data });
      }

      /* ===================== 進貨單 (入庫) ===================== */
      case 'create_stock_in': {
        const { po_id, vendor_id, remark, items, currency, exchange_rate } = body;
        const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
        if (!safeItems.length) return Response.json({ error: 'items are required' }, { status: 400 });

        // 未關聯採購單時，廠商為必填（AP 應付帳款需歸帳）
        if (!po_id && !vendor_id) {
          return Response.json({ error: '未關聯採購單時，請選擇進貨廠商' }, { status: 400 });
        }

        // 1.1 採購單必須核准後才能進貨
        if (po_id) {
          const { data: linkedPO } = await supabase.from('erp_purchase_orders').select('status').eq('id', po_id).maybeSingle();
          if (!linkedPO) return Response.json({ error: '找不到對應的採購單' }, { status: 404 });
          if (linkedPO.status !== 'confirmed' && linkedPO.status !== 'received') {
            return Response.json({ error: `採購單狀態為「${linkedPO.status}」，必須核准（confirmed）後才能進貨` }, { status: 400 });
          }
          // 1.2 防重複：檢查是否已有待確認的進貨單（10秒內防連點）
          const { data: recentSI } = await supabase.from('erp_stock_ins').select('id, stock_in_no, created_at')
            .eq('po_id', po_id).eq('status', 'pending').order('created_at', { ascending: false }).limit(1);
          if (recentSI?.length > 0) {
            const age = Date.now() - new Date(recentSI[0].created_at).getTime();
            if (age < 10000) {
              return Response.json({ error: `此採購單已有待確認的進貨單 ${recentSI[0].stock_in_no}，請勿重複建立` }, { status: 409 });
            }
          }
          // 2.3 驗證進貨品項存在於 PO ���
          const { data: poItemsList } = await supabase.from('erp_purchase_order_items').select('item_number').eq('po_id', po_id);
          const poItemSet = new Set((poItemsList || []).map(p => (p.item_number || '').toUpperCase()));
          if (poItemSet.size > 0) {
            const invalidItems = safeItems.filter(it => {
              const num = (it.item_number || '').toUpperCase();
              return num && !poItemSet.has(num);
            });
            if (invalidItems.length > 0) {
              return Response.json({ error: `以下品項不在此採購單中：${invalidItems.map(i => i.item_number).join(', ')}` }, { status: 400 });
            }
          }
        }

        const siNo = `SI${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
        const totalAmt = safeItems.reduce((s, it) => s + Number(it.line_total || 0), 0);

        // 幣別：優先用前端傳入，若有關聯 PO 且未指定則繼承 PO 幣別
        let siCurrency = currency || 'TWD';
        let siRate = Number(exchange_rate) || 1;
        if (po_id && !currency) {
          const { data: linkedPOCurr } = await supabase.from('erp_purchase_orders').select('currency, exchange_rate').eq('id', po_id).maybeSingle();
          if (linkedPOCurr?.currency) { siCurrency = linkedPOCurr.currency; siRate = Number(linkedPOCurr.exchange_rate) || 1; }
        }

        const { data: si, error: siErr } = await insertSingleWithColumnFallback('erp_stock_ins', {
          stock_in_no: siNo, po_id: po_id || null,
          vendor_id: vendor_id || null,
          status: 'pending', total_amount: totalAmt,
          remark: cleanCsvValue(remark),
          currency: siCurrency,
          exchange_rate: siRate,
        });
        if (siErr) { if (isMissingRelationError(siErr)) return missingRelationResponse(siErr, 'erp_stock_ins'); return Response.json({ error: siErr.message }, { status: 500 }); }

        const itemPayload = safeItems.map(it => ({
          stock_in_id: si.id, item_number: cleanCsvValue(it.item_number),
          description: cleanCsvValue(it.description),
          qty_received: toNumber(it.qty_received) || toNumber(it.qty) || 1,
          unit_cost: toNumber(it.unit_cost), line_total: toNumber(it.line_total),
          foreign_unit_cost: toNumber(it.foreign_unit_cost) || 0,
          ...(it.unit ? { unit: cleanCsvValue(it.unit) } : {}),
        }));
        { const { error: _imErr } = await insertManyWithColumnFallback('erp_stock_in_items', itemPayload); if (_imErr) console.error('[erp_stock_in_items] insert error:', _imErr.message); }

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
          vendor_id: vendor_id || null,
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
        { const { error: _imErr } = await insertManyWithColumnFallback('erp_purchase_return_items', itemPayload); if (_imErr) console.error('[erp_purchase_return_items] insert error:', _imErr.message); }

        /* 庫存扣減延後至審批通過時執行 */

        return Response.json({ success: true, purchase_return: ret, count: itemPayload.length });
      }

      // ── 採購退出：審批 ──
      case 'approve_purchase_return': {
        const { return_id: prId, status: prNewSt } = body;
        if (!prId) return Response.json({ error: 'return_id 為必填' }, { status: 400 });
        const prFinalStatus = prNewSt || 'approved';

        const { data: prRet } = await supabase.from('erp_purchase_returns').select('*').eq('id', prId).maybeSingle();
        if (!prRet) return Response.json({ error: '找不到進貨退出單' }, { status: 404 });
        if (prRet.status === 'approved') return Response.json({ error: '已核准，無法重複操作' }, { status: 400 });

        const { error: prUpdErr } = await supabase.from('erp_purchase_returns').update({
          status: prFinalStatus, updated_at: new Date().toISOString(),
        }).eq('id', prId);
        if (prUpdErr) return Response.json({ error: prUpdErr.message }, { status: 500 });

        if (prFinalStatus === 'approved') {
          // 1. 扣減庫存
          const { data: prItems } = await supabase.from('erp_purchase_return_items').select('*').eq('return_id', prId);
          for (const it of (prItems || [])) {
            if (!it.item_number || !(it.qty_returned > 0)) continue;
            const { data: prod } = await supabase.from('quickbuy_products').select('stock_qty').eq('item_number', it.item_number).maybeSingle();
            if (prod) {
              await supabase.from('quickbuy_products').update({
                stock_qty: Math.max(0, Number(prod.stock_qty || 0) - Number(it.qty_returned)),
                updated_at: new Date().toISOString(),
              }).eq('item_number', it.item_number);
            }
            await supabase.from('qb_inventory_movements').insert({
              item_number: it.item_number, movement_type: 'out', quantity: Number(it.qty_returned),
              reference_type: 'purchase_return', reference_id: String(prId),
              notes: `進貨退出 ${prRet.return_no}`, created_by: body.__auth_user?.username || 'admin',
            });
          }

          // 2. 減少對應 AP（應付帳款）
          const prDeduct = Number(prRet.total_amount || 0);
          if (prDeduct > 0 && prRet.stock_in_id) {
            const { data: linkedAP } = await supabase.from('erp_vendor_payables')
              .select('*').eq('source_type', 'stock_in').eq('source_id', prRet.stock_in_id).limit(1).maybeSingle();
            if (linkedAP) {
              const newAPTotal = Math.max(0, Number(linkedAP.total_amount) - prDeduct);
              const newAPBalance = Math.max(0, Number(linkedAP.balance) - prDeduct);
              const newAPStatus = (linkedAP.paid_amount || 0) >= newAPTotal - 0.01 ? 'paid'
                : (linkedAP.paid_amount || 0) > 0 ? 'partial' : 'unpaid';
              await supabase.from('erp_vendor_payables').update({
                total_amount: newAPTotal, balance: newAPBalance,
                payment_status: newAPStatus, updated_at: new Date().toISOString(),
              }).eq('id', linkedAP.id);
            } else if (prRet.vendor_id) {
              // 若找不到對應 AP，建立負數 AP（Debit Memo）作為沖抵憑據
              const dmNo = `DM-${Date.now().toString(36).toUpperCase()}`;
              const dueDate = new Date().toISOString().slice(0, 10);
              await supabase.from('erp_vendor_payables').insert({
                payable_no: dmNo, vendor_id: prRet.vendor_id,
                source_type: 'purchase_return', source_id: prId, source_no: prRet.return_no,
                payable_date: dueDate, due_date: dueDate,
                total_amount: -prDeduct, paid_amount: 0, balance: -prDeduct,
                payment_status: 'unpaid', created_by: 'admin',
              });
            }
          }
        }

        return Response.json({ success: true, message: `進貨退出單已${prFinalStatus === 'approved' ? '核准，庫存已扣減，AP 已沖抵' : '更新'}` });
      }

      /* ===================== 新增廠商 ===================== */
      case 'create_vendor': {
        const { vendor_name, vendor_code, contact_name, phone, mobile, email, fax, address, tax_id, bank_account, payment_terms, remark } = body;
        if (!vendor_name) return Response.json({ error: 'vendor_name is required' }, { status: 400 });

        // 重複檢查：同名廠商
        const { data: dupName } = await supabase.from('erp_vendors').select('id, vendor_name').ilike('vendor_name', cleanCsvValue(vendor_name)).limit(1);
        if (dupName?.length) return Response.json({ error: `廠商「${vendor_name}」已存在，請勿重複建立`, duplicate: true, existing: dupName[0] }, { status: 409 });

        // 重複檢查：同統編
        if (tax_id) {
          const { data: dupTax } = await supabase.from('erp_vendors').select('id, vendor_name, tax_id').eq('tax_id', cleanCsvValue(tax_id)).limit(1);
          if (dupTax?.length) return Response.json({ error: `統編 ${tax_id} 已存在（${dupTax[0].vendor_name}），請勿重複建立`, duplicate: true, existing: dupTax[0] }, { status: 409 });
        }

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
          payment_no: payNo, vendor_id: vendor_id || null,
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

      /* ===================== 付款沖帳配對 ===================== */
      case 'execute_vendor_matching': {
        const { payment_id: vpMatchId, allocations: vpAllocs } = body;
        if (!vpMatchId || !vpAllocs || !vpAllocs.length) return Response.json({ error: 'payment_id 和 allocations 為必填' }, { status: 400 });

        const { data: vpPayment } = await supabase.from('erp_vendor_payments').select('*').eq('id', vpMatchId).maybeSingle();
        if (!vpPayment || vpPayment.status !== 'confirmed') return Response.json({ error: '付款單不存在或尚未確認' }, { status: 400 });

        // Calculate existing allocations for this payment
        const { data: vpExistAllocs } = await supabase.from('erp_vendor_payment_allocations').select('allocated_amount').eq('payment_id', vpMatchId);
        const vpExistAllocated = (vpExistAllocs || []).reduce((s, r) => s + Number(r.allocated_amount || 0), 0);
        const vpRemaining = Number(vpPayment.amount || 0) - vpExistAllocated;

        const vpTotalNew = vpAllocs.reduce((s, a) => s + Number(a.amount || 0), 0);
        if (vpTotalNew > vpRemaining + 0.01) return Response.json({ error: `沖帳金額 ${vpTotalNew} 超過付款餘額 ${vpRemaining}` }, { status: 400 });

        const vpResults = [];
        for (const va of vpAllocs) {
          const { payable_id: vaPayableId, amount: vaAmt, allocation_type: vaType, remark: vaRemark } = va;
          if (!vaPayableId || !vaAmt || Number(vaAmt) <= 0) continue;

          await supabase.from('erp_vendor_payment_allocations').insert({
            payment_id: vpMatchId, payable_id: vaPayableId, allocated_amount: Number(vaAmt),
            allocation_date: new Date().toISOString().slice(0, 10),
            allocation_type: vaType || 'normal', remark: vaRemark || '', created_by: 'admin',
          });

          // Update payable paid_amount & balance（直接加減，不用 Math.abs 避免正負號混亂）
          const { data: vaPay } = await supabase.from('erp_vendor_payables').select('total_amount, paid_amount').eq('id', vaPayableId).maybeSingle();
          if (vaPay) {
            const vaTotal = Number(vaPay.total_amount || 0);
            const vaNewPaid = Number(vaPay.paid_amount || 0) + Number(vaAmt);
            const vaBalance = vaTotal - vaNewPaid;
            // 超付警告（應付金額不應被超付）
            if (vaBalance < -0.01) {
              console.warn(`[vendor_matching] 超付警告: payable ${vaPayableId} total=${vaTotal} newPaid=${vaNewPaid}`);
            }
            const vaPayStatus = vaNewPaid >= vaTotal - 0.01 ? 'paid' : vaNewPaid > 0 ? 'partial' : 'unpaid';
            await supabase.from('erp_vendor_payables').update({
              paid_amount: vaNewPaid, balance: Math.max(0, vaBalance),
              payment_status: vaPayStatus, updated_at: new Date().toISOString(),
            }).eq('id', vaPayableId);
          }
          vpResults.push({ payable_id: vaPayableId, amount: Number(vaAmt) });
        }

        return Response.json({ success: true, matched: vpResults.length, message: `已完成 ${vpResults.length} 筆付款沖帳` });
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
          { const { error: _imErr } = await insertManyWithColumnFallback('erp_stocktake_items', stItems); if (_imErr) console.error('[erp_stocktake_items] insert error:', _imErr.message); }
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

      /* ===================== 調撥單 ===================== */
      case 'create_stock_transfer': {
        const { from_location, to_location, remark, items } = body;
        const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
        if (!safeItems.length) return Response.json({ error: 'items are required' }, { status: 400 });
        if (!from_location || !to_location) return Response.json({ error: 'from_location and to_location are required' }, { status: 400 });

        const transferNo = `TRF${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;

        const { data: tf, error: tfErr } = await insertSingleWithColumnFallback('erp_stock_transfers', {
          transfer_no: transferNo,
          from_location: cleanCsvValue(from_location),
          to_location: cleanCsvValue(to_location),
          status: 'confirmed',
          remark: cleanCsvValue(remark),
        });
        if (tfErr) return Response.json({ error: tfErr.message }, { status: 500 });

        const itemPayload = [];
        for (const it of safeItems) {
          const itemNum = cleanCsvValue(it.item_number);
          if (!itemNum) continue;
          const qty = toNumber(it.quantity);
          if (qty <= 0) continue;

          itemPayload.push({
            transfer_id: tf.id,
            item_number: itemNum,
            description: cleanCsvValue(it.description),
            quantity: qty,
          });

          // Record inventory movements (out from source, in to destination)
          await supabase.from('qb_inventory_movements').insert({
            item_number: itemNum, movement_type: 'out',
            quantity: qty, reference_type: 'transfer_out', reference_id: tf.id,
            notes: `調撥單 ${transferNo} ${cleanCsvValue(from_location)} → ${cleanCsvValue(to_location)}`, created_by: 'admin',
          });
          await supabase.from('qb_inventory_movements').insert({
            item_number: itemNum, movement_type: 'in',
            quantity: qty, reference_type: 'transfer_in', reference_id: tf.id,
            notes: `調撥單 ${transferNo} ${cleanCsvValue(from_location)} → ${cleanCsvValue(to_location)}`, created_by: 'admin',
          });
        }

        if (itemPayload.length) await insertManyWithColumnFallback('erp_stock_transfer_items', itemPayload);

        return Response.json({ success: true, transfer: tf, count: itemPayload.length });
      }

      /* ===================== 組合單 ===================== */
      case 'create_stock_assembly': {
        const { output_item_number, output_description, output_qty, remark, items } = body;
        const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
        if (!safeItems.length) return Response.json({ error: 'component items are required' }, { status: 400 });
        if (!output_item_number) return Response.json({ error: 'output_item_number is required' }, { status: 400 });

        const assemblyNo = `ASM${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
        const outQty = toNumber(output_qty) || 1;

        const { data: asm, error: asmErr } = await insertSingleWithColumnFallback('erp_stock_assemblies', {
          assembly_no: assemblyNo,
          output_item_number: cleanCsvValue(output_item_number),
          output_description: cleanCsvValue(output_description),
          output_qty: outQty,
          status: 'confirmed',
          remark: cleanCsvValue(remark),
        });
        if (asmErr) return Response.json({ error: asmErr.message }, { status: 500 });

        const itemPayload = [];
        for (const it of safeItems) {
          const itemNum = cleanCsvValue(it.item_number);
          if (!itemNum) continue;
          const qty = toNumber(it.quantity);
          if (qty <= 0) continue;

          // Get current stock for component
          const { data: prod } = await supabase.from('quickbuy_products')
            .select('stock_qty').eq('item_number', itemNum).maybeSingle();
          const beforeQty = Number(prod?.stock_qty || 0);
          const afterQty = Math.max(0, beforeQty - qty);

          itemPayload.push({
            assembly_id: asm.id,
            item_number: itemNum,
            description: cleanCsvValue(it.description),
            quantity: qty,
            before_qty: beforeQty,
            after_qty: afterQty,
          });

          // Deduct component stock
          await supabase.from('quickbuy_products')
            .update({ stock_qty: afterQty }).eq('item_number', itemNum);

          // Record movement for component (out)
          await supabase.from('qb_inventory_movements').insert({
            item_number: itemNum, movement_type: 'out',
            quantity: qty, reference_type: 'assembly_consume', reference_id: asm.id,
            notes: `組合單 ${assemblyNo} 組合耗用`, created_by: 'admin',
          });
        }

        if (itemPayload.length) await insertManyWithColumnFallback('erp_stock_assembly_items', itemPayload);

        // Increase output product stock
        const outItemNum = cleanCsvValue(output_item_number);
        const { data: outProd } = await supabase.from('quickbuy_products')
          .select('stock_qty').eq('item_number', outItemNum).maybeSingle();
        const outBefore = Number(outProd?.stock_qty || 0);
        const outAfter = outBefore + outQty;
        await supabase.from('quickbuy_products')
          .update({ stock_qty: outAfter }).eq('item_number', outItemNum);

        // Record movement for output product (in)
        await supabase.from('qb_inventory_movements').insert({
          item_number: outItemNum, movement_type: 'in',
          quantity: outQty, reference_type: 'assembly_output', reference_id: asm.id,
          notes: `組合單 ${assemblyNo} 組合產出`, created_by: 'admin',
        });

        return Response.json({ success: true, assembly: asm, count: itemPayload.length });
      }

      case 'create_dealer_user': {
        const { username, password, display_name, role, company_name, phone, email, price_level } = body;
        if (!username || !password || !display_name) return Response.json({ error: '帳號、密碼、姓名為必填' }, { status: 400 });
        if (!['dealer', 'sales', 'technician'].includes(role)) return Response.json({ error: '角色無效' }, { status: 400 });

        const bcrypt = await import('bcryptjs');
        const hash = await bcrypt.hash(password, 10);

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

        const allowed = ['display_name', 'role', 'company_name', 'phone', 'email', 'price_level', 'discount_rate', 'can_see_stock', 'can_place_order', 'notify_on_arrival', 'status'];
        const payload = { updated_at: new Date().toISOString() };
        for (const key of allowed) {
          if (updates[key] !== undefined) payload[key] = updates[key];
        }

        // Handle password reset
        if (updates.new_password) {
          const bcrypt = await import('bcryptjs');
          payload.password_hash = await bcrypt.hash(updates.new_password, 10);
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

        // Consolidate by item_number: sum quantities, use tw_reseller_price as cost
        const consolidated = {};
        for (const item of allItems) {
          const key = item.item_number_snapshot || item.description_snapshot || `item_${item.id}`;
          if (!consolidated[key]) {
            // If cost_price_snapshot is 0, look up tw_reseller_price from quickbuy_products
            let costPrice = Number(item.cost_price_snapshot || 0);
            if (!costPrice && item.item_number_snapshot) {
              const { data: prod } = await supabase.from('quickbuy_products').select('tw_reseller_price').eq('item_number', item.item_number_snapshot).maybeSingle();
              costPrice = Number(prod?.tw_reseller_price || 0);
            }
            consolidated[key] = {
              item_number: item.item_number_snapshot || '',
              description: item.description_snapshot || '',
              qty: 0,
              unit_cost: costPrice || 0,
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
          { const { error: _imErr } = await insertManyWithColumnFallback('erp_purchase_order_items', poItemsPayload); if (_imErr) console.error('[erp_purchase_order_items] insert error:', _imErr.message); }
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

        // Check current status and get stock_in_no, po_id, vendor_id
        const { data: si } = await supabase.from('erp_stock_ins').select('status, stock_in_no, po_id, vendor_id').eq('id', stock_in_id).maybeSingle();
        if (!si) return Response.json({ error: '進貨單不存在' }, { status: 404 });
        if (si?.status === 'confirmed') return Response.json({ error: '此進貨單已確認' }, { status: 400 });

        // Get stock-in items
        const { data: siItems } = await supabase
          .from('erp_stock_in_items')
          .select('item_number, qty_received, description, unit_cost')
          .eq('stock_in_id', stock_in_id);

        let updatedCount = 0;
        for (const item of (siItems || [])) {
          if (!item.item_number) continue;
          const normalizedItemNo = item.item_number.toUpperCase();
          const { data: product } = await supabase
            .from('quickbuy_products')
            .select('stock_qty, safety_stock')
            .eq('item_number', normalizedItemNo)
            .maybeSingle();

          if (product) {
            // 1.3 原子庫存更新：compare-and-swap 防止 race condition
            const qtyToAdd = item.qty_received || 0;
            let retries = 3;
            let updated = false;
            while (retries > 0 && !updated) {
              const { data: curr } = await supabase.from('quickbuy_products').select('stock_qty, safety_stock').eq('item_number', normalizedItemNo).maybeSingle();
              if (!curr) break;
              const newStock = (curr.stock_qty || 0) + qtyToAdd;
              const updatePayload = { stock_qty: newStock, updated_at: new Date().toISOString() };
              if (!curr.safety_stock || curr.safety_stock <= 0) {
                updatePayload.safety_stock = Math.max(Math.ceil((qtyToAdd || 1) * 0.5), 1);
              }
              // 回寫最近進貨成本
              if (item.unit_cost && Number(item.unit_cost) > 0) {
                updatePayload.cost_price = Number(item.unit_cost);
              }
              const { data: res } = await supabase
                .from('quickbuy_products')
                .update(updatePayload)
                .eq('item_number', normalizedItemNo)
                .eq('stock_qty', curr.stock_qty) // CAS: only if unchanged
                .select('id');
              if (res?.length) { updated = true; } else { retries--; }
            }
            if (updated) updatedCount++;
            else console.error(`CAS failed for ${normalizedItemNo} after 3 retries`);
          }

          // Record inventory movement
          await supabase.from('qb_inventory_movements').insert({
            item_number: normalizedItemNo, movement_type: 'in', quantity: item.qty_received,
            reference_type: 'stock_in', reference_id: String(stock_in_id),
            notes: `進貨入庫 ${si.stock_in_no}`, created_by: 'admin',
          });

          // 2.2 只在庫存已達安全水位時才標 fulfilled
          {
            const { data: updatedProd } = await supabase.from('quickbuy_products').select('stock_qty, safety_stock').eq('item_number', normalizedItemNo).maybeSingle();
            if (updatedProd && (updatedProd.stock_qty || 0) >= (updatedProd.safety_stock || 0)) {
              await supabase.from('erp_reorder_suggestions').update({ status: 'fulfilled' }).eq('item_number', normalizedItemNo).eq('status', 'pending');
            }
          }

          // 2.8 Update PO items qty_received (優先對應本 PO，再 FIFO 其他)
          try {
            let poQuery = supabase
              .from('erp_purchase_order_items')
              .select('id, qty, qty_received, po_id')
              .eq('item_number', normalizedItemNo)
              .order('created_at', { ascending: true });
            // 若有連結 PO，優先只更新該 PO 的品項
            if (si.po_id) poQuery = poQuery.eq('po_id', si.po_id);
            const { data: poItems } = await poQuery;
            if (poItems?.length) {
              let remaining = item.qty_received || 0;
              for (const poi of poItems) {
                if (remaining <= 0) break;
                const currentReceived = Number(poi.qty_received) || 0;
                const canReceive = (Number(poi.qty) || 0) - currentReceived;
                if (canReceive <= 0) continue;
                const toAdd = Math.min(remaining, canReceive);
                await supabase.from('erp_purchase_order_items')
                  .update({ qty_received: currentReceived + toAdd })
                  .eq('id', poi.id);
                remaining -= toAdd;
              }
            }
          } catch (e) {
            console.error('Failed to update PO item qty_received:', e);
          }
        }

        // Update stock-in status
        await supabase.from('erp_stock_ins').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', stock_in_id);

        // Update PO status if linked
        if (si.po_id) {
          await supabase.from('erp_purchase_orders').update({ status: 'received' }).eq('id', si.po_id);
        }

        // 記憶品項對應
        try {
          for (const item of (siItems || [])) {
            const itemNumber = (item.item_number || '').toUpperCase();
            const cost = Number(item.unit_cost) || 0;
            const name = item.description || '';
            if (!itemNumber) continue;

            if (si.vendor_id) {
              await supabase.from('vendor_item_mapping').upsert({
                vendor_id: si.vendor_id, source_part_no: itemNumber,
                mapped_item_number: itemNumber, item_name: name,
                last_cost: cost, times_used: 1, updated_at: new Date().toISOString(),
              }, { onConflict: 'vendor_id,source_part_no' });
              await supabase.rpc('increment_vendor_item_usage', { v_id: si.vendor_id, s_part_no: itemNumber }).catch(() => {});
            }

            const { data: existing } = await supabase.from('item_cost_history').select('*').eq('item_number', itemNumber).maybeSingle();
            if (existing) {
              const total = existing.total_entries || 1;
              const newAvg = Math.round(((existing.avg_cost || 0) * total + cost) / (total + 1));
              await supabase.from('item_cost_history').update({
                item_name: name || existing.item_name, last_cost: cost, avg_cost: newAvg,
                min_cost: Math.min(existing.min_cost || cost, cost),
                max_cost: Math.max(existing.max_cost || cost, cost),
                total_entries: total + 1, updated_at: new Date().toISOString(),
              }).eq('item_number', itemNumber);
            } else {
              await supabase.from('item_cost_history').insert({
                item_number: itemNumber, item_name: name,
                last_cost: cost, avg_cost: cost, min_cost: cost, max_cost: cost, total_entries: 1,
              });
            }
          }
        } catch (_) { /* 記憶寫入失敗不影響主流程 */ }

        // ── 自動產生應付帳款（含稅額對齊）──
        try {
          const siSubtotal = (siItems || []).reduce((s, it) => s + (Number(it.qty_received) || 0) * (Number(it.unit_cost) || 0), 0);
          if (siSubtotal > 0 && si.vendor_id) {
            // 2.10 防重複
            const { data: existAP } = await supabase.from('erp_vendor_payables')
              .select('id').eq('source_type', 'stock_in').eq('source_id', stock_in_id).limit(1);
            if (!existAP?.length) {
              // 2.7 稅額對齊：如有連結 PO 且 PO 含稅，AP 也含稅
              let apTotal = siSubtotal;
              if (si.po_id) {
                const { data: linkedPO } = await supabase.from('erp_purchase_orders').select('tax_inclusive, tax_amount, subtotal').eq('id', si.po_id).maybeSingle();
                if (linkedPO && !linkedPO.tax_inclusive && Number(linkedPO.tax_amount) > 0) {
                  const taxRate = Number(linkedPO.subtotal) > 0 ? Number(linkedPO.tax_amount) / Number(linkedPO.subtotal) : 0.05;
                  apTotal = siSubtotal + Math.round(siSubtotal * taxRate);
                }
              }
              const apNo = `AP-${Date.now().toString(36).toUpperCase()}`;
              const { data: vendor } = await supabase.from('erp_vendors').select('payment_days').eq('id', si.vendor_id).maybeSingle();
              const paymentDays = vendor?.payment_days || 30;
              const dueDate = new Date(Date.now() + paymentDays * 86400000).toISOString().slice(0, 10);
              await supabase.from('erp_vendor_payables').insert({
                payable_no: apNo, vendor_id: si.vendor_id,
                source_type: 'stock_in', source_id: stock_in_id, source_no: si.stock_in_no,
                payable_date: new Date().toISOString().slice(0, 10), due_date: dueDate,
                total_amount: apTotal, paid_amount: 0, balance: apTotal,
                payment_status: 'unpaid', created_by: 'admin',
              });
            }
          }
        } catch (apErr) { console.error('AP creation failed:', apErr.message); }

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
          { const { error: _imErr } = await insertManyWithColumnFallback('erp_purchase_order_items', poItems); if (_imErr) console.error('[erp_purchase_order_items] insert error:', _imErr.message); }
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
          subtotal: Number(order.subtotal || 0),
          discount_amount: Number(order.discount_amount || 0),
          shipping_fee: Number(order.shipping_fee || 0),
          tax_amount: Number(order.tax_amount || 0),
          total_amount: Number(order.total_amount || 0),
          balance: Number(order.total_amount || 0),
          paid_amount: 0,
          payment_status: 'unpaid',
          remark: `來自訂單 ${order.order_no || order.id}`,
        }).select().single();

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ invoice: inv, message: `發票 ${invoiceNo} 已建立` });
      }

      case 'record_payment': {
        const { invoice_id, amount } = body;
        if (!invoice_id || !amount) return Response.json({ error: 'invoice_id 和 amount 為必填' }, { status: 400 });
        // 3.1 金額必須為正數
        if (Number(amount) <= 0) return Response.json({ error: '收款金額必須大於 0' }, { status: 400 });

        const { data: inv } = await supabase.from('erp_invoices').select('*').eq('id', invoice_id).maybeSingle();
        if (!inv) return Response.json({ error: '找不到發票' }, { status: 400 });

        const newPaid = Number(inv.paid_amount || 0) + Number(amount);
        const total = Number(inv.total_amount || 0);
        // 超付防護：收款累計不能超過發票金額
        if (newPaid > total + 0.01) {
          return Response.json({
            error: `收款超額：發票金額 ${total}，已付 ${inv.paid_amount || 0}，本次 ${amount}，合計 ${newPaid} 超過發票金額`,
          }, { status: 400 });
        }
        const paymentStatus = newPaid >= total - 0.01 ? 'paid' : 'partial';

        const { error } = await supabase.from('erp_invoices').update({
          paid_amount: newPaid,
          balance: total - newPaid,
          payment_status: paymentStatus,
          updated_at: new Date().toISOString(),
        }).eq('id', invoice_id);

        if (error) return Response.json({ error: error.message }, { status: 500 });

        // === Upload proof if provided ===
        let proofUrl = null;
        let proofWarning = null;
        if (body.proof_data) {
          try {
            const pExt = (body.proof_name || 'proof.jpg').split('.').pop() || 'jpg';
            const pPath = `payment-proofs/rcpt-${invoice_id}-${Date.now()}.${pExt}`;
            const pBuf = Buffer.from(body.proof_data, 'base64');
            const { error: upErr } = await supabase.storage.from('company-assets').upload(pPath, pBuf, { contentType: `image/${pExt === 'png' ? 'png' : 'jpeg'}`, upsert: true });
            if (upErr) { proofWarning = `憑證上傳失敗: ${upErr.message}`; }
            else {
              const { data: urlD } = supabase.storage.from('company-assets').getPublicUrl(pPath);
              proofUrl = urlD?.publicUrl || null;
            }
          } catch (pe) { proofWarning = `憑證上傳失敗: ${pe.message}`; }
        }

        // === Auto-create erp_payment_receipts + erp_payment_allocations ===
        let receiptId = null;
        try {
          const rcptNo = `RCPT-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
          const { data: rcptData } = await supabase.from('erp_payment_receipts').insert({
            receipt_no: rcptNo,
            customer_id: inv.customer_id || null,
            receipt_date: new Date().toISOString().slice(0, 10),
            total_amount: Number(amount),
            payment_method: body.payment_method || 'transfer',
            reference_no: inv.invoice_no || '',
            status: 'confirmed',
            confirmed_at: new Date().toISOString(),
            confirmed_by: 'system',
            remark: body.remark || `應收帳款收款自動建立 | 發票:${inv.invoice_no}`,
            proof_url: proofUrl,
          }).select().single();
          receiptId = rcptData?.id || null;
          // Create allocation record linking receipt to invoice
          if (rcptData?.id) {
            await supabase.from('erp_payment_allocations').insert({
              receipt_id: rcptData.id,
              invoice_id: invoice_id,
              allocated_amount: Number(amount),
              allocation_date: new Date().toISOString().slice(0, 10),
              allocation_type: body.payment_method || 'transfer',
              remark: body.remark || '',
              created_by: 'system',
            });
          }
        } catch (rcptErr) {
          console.error('Auto-create receipt/allocation from invoice payment error:', rcptErr);
        }

        // 1.5 收款回寫訂單 payment_status + 檢查訂單完成
        if (inv.order_id) {
          try {
            await supabase.from('erp_orders').update({
              payment_status: paymentStatus,
              updated_at: new Date().toISOString(),
            }).eq('id', inv.order_id);
            await checkOrderCompletion(inv.order_id);
          } catch (e) { console.error('Cascade payment to order failed:', e); }
        }

        const baseMsg = paymentStatus === 'paid' ? '已全額收款' : `已收款 NT$${newPaid.toLocaleString()}`;
        return Response.json({ success: true, paid_amount: newPaid, payment_status: paymentStatus, receipt_id: receiptId, proof_url: proofUrl, message: proofWarning ? `${baseMsg}（⚠️ ${proofWarning}）` : baseMsg });
      }

      /* ===================== 應收帳款 - 新增 ===================== */
      case 'create_receivable': {
        const { customer_id: arCustId, total_amount: arAmt, due_date: arDue, remark: arRemark } = body;
        if (!arCustId || !arAmt) return Response.json({ error: 'customer_id 和 total_amount 為必填' }, { status: 400 });
        const arNo = `INV-${Date.now().toString(36).toUpperCase()}`;
        const { data: arData, error: arErr } = await supabase.from('erp_invoices').insert({
          invoice_no: arNo, customer_id: arCustId, invoice_date: new Date().toISOString().slice(0, 10),
          due_date: arDue || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          status: 'unpaid', subtotal: Number(arAmt), tax_amount: 0, total_amount: Number(arAmt),
          paid_amount: 0, payment_status: 'unpaid', balance: Number(arAmt),
          source_type: 'manual', remark: arRemark || '',
        }).select().single();
        if (arErr) return Response.json({ error: arErr.message }, { status: 500 });
        return Response.json({ success: true, data: arData, message: `應收帳款 ${arNo} 已建立` });
      }

      /* ===================== 對帳單 ===================== */
      case 'generate_reconciliation': {
        const { customer_id: reconCustId, period_start: reconStart, period_end: reconEnd } = body;
        if (!reconCustId || !reconStart || !reconEnd) return Response.json({ error: 'customer_id, period_start, period_end 為必填' }, { status: 400 });

        const { data: reconInvoices } = await supabase.from('erp_invoices').select('*')
          .eq('customer_id', reconCustId).gte('invoice_date', reconStart).lte('invoice_date', reconEnd);
        const { data: reconReturns } = await supabase.from('erp_returns').select('*')
          .eq('customer_id', reconCustId).gte('created_at', reconStart + 'T00:00:00').lte('created_at', reconEnd + 'T23:59:59');

        // 查收款記錄（透過 invoice 關聯）
        const invoiceIds = (reconInvoices || []).map(i => i.id);
        let reconPayments = [];
        if (invoiceIds.length > 0) {
          const { data: allocations } = await supabase.from('erp_payment_allocations')
            .select('id, receipt_id, invoice_id, allocated_amount, allocation_date, erp_payment_receipts(receipt_no, payment_method)')
            .in('invoice_id', invoiceIds);
          reconPayments = allocations || [];
        }
        // 也查訂單層級的直接收款
        const orderIds = [...new Set((reconInvoices || []).map(i => i.order_id).filter(Boolean))];
        let orderPayments = [];
        if (orderIds.length > 0) {
          const { data: opays } = await supabase.from('qb_payments')
            .select('id, order_id, amount, payment_method, created_at')
            .in('order_id', orderIds);
          orderPayments = opays || [];
        }

        const reconTotalSales = (reconInvoices || []).reduce((s, r) => s + Number(r.total_amount || 0), 0);
        const reconTotalReturns = (reconReturns || []).reduce((s, r) => s + Number(r.refund_amount || 0), 0);
        const reconTotalPaid = reconPayments.reduce((s, a) => s + Number(a.allocated_amount || 0), 0)
          + orderPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
        const reconNet = reconTotalSales - reconTotalReturns;
        const reconBalance = reconNet - reconTotalPaid;
        const stmtNo = `STMT-${Date.now().toString(36).toUpperCase()}`;

        const { data: stmtData, error: stmtErr } = await supabase.from('erp_reconciliation_statements').insert({
          statement_no: stmtNo, customer_id: reconCustId, period_start: reconStart, period_end: reconEnd,
          total_sales: reconTotalSales, total_returns: reconTotalReturns, total_adjustments: 0,
          net_amount: reconNet, previous_balance: 0, current_balance: reconBalance,
          status: 'draft', created_by: 'admin',
        }).select().single();
        if (stmtErr) return Response.json({ error: stmtErr.message }, { status: 500 });

        const reconItems = [
          ...(reconInvoices || []).map(inv => ({
            statement_id: stmtData.id, source_type: 'invoice', source_id: inv.id,
            source_no: inv.invoice_no, source_date: inv.invoice_date,
            description: `發票 ${inv.invoice_no}`, amount: Number(inv.total_amount || 0),
          })),
          ...(reconReturns || []).map(ret => ({
            statement_id: stmtData.id, source_type: 'return', source_id: ret.id,
            source_no: ret.return_no || '-', source_date: (ret.created_at || '').slice(0, 10),
            description: `退貨 ${ret.return_no || ''}`, amount: -Number(ret.refund_amount || 0),
          })),
          ...reconPayments.map(alloc => ({
            statement_id: stmtData.id, source_type: 'payment', source_id: alloc.receipt_id || alloc.id,
            source_no: alloc.erp_payment_receipts?.receipt_no || '-', source_date: alloc.allocation_date || '',
            description: `收款 ${alloc.erp_payment_receipts?.receipt_no || ''} (${alloc.erp_payment_receipts?.payment_method || '轉帳'})`,
            amount: -Number(alloc.allocated_amount || 0),
          })),
          ...orderPayments.map(pay => ({
            statement_id: stmtData.id, source_type: 'order_payment', source_id: pay.id,
            source_no: '-', source_date: (pay.created_at || '').slice(0, 10),
            description: `訂單收款 (${pay.payment_method || '轉帳'})`,
            amount: -Number(pay.amount || 0),
          })),
        ];
        if (reconItems.length > 0) {
          try { await supabase.from('erp_reconciliation_items').insert(reconItems); } catch (_) {}
        }

        return Response.json({ success: true, data: stmtData, items_count: reconItems.length, total_paid: reconTotalPaid, balance: reconBalance, message: `對帳單 ${stmtNo} 已產生，含 ${reconItems.length} 筆明細（銷售 $${reconTotalSales.toLocaleString()} - 退貨 $${reconTotalReturns.toLocaleString()} - 已收 $${reconTotalPaid.toLocaleString()} = 餘額 $${reconBalance.toLocaleString()}）` });
      }

      case 'update_reconciliation_status': {
        const { id: reconStmtId, status: reconNewStatus } = body;
        if (!reconStmtId || !reconNewStatus) return Response.json({ error: 'id 和 status 為必填' }, { status: 400 });
        const reconUpdates = { status: reconNewStatus, updated_at: new Date().toISOString() };
        if (reconNewStatus === 'confirmed') { reconUpdates.confirmed_at = new Date().toISOString(); reconUpdates.confirmed_by = 'admin'; }
        const { error: reconUpErr } = await supabase.from('erp_reconciliation_statements').update(reconUpdates).eq('id', reconStmtId);
        if (reconUpErr) return Response.json({ error: reconUpErr.message }, { status: 500 });
        const reconLabels = { draft: '草稿', sent: '已寄送', confirmed: '已確認', disputed: '爭議中' };
        return Response.json({ success: true, message: `對帳單狀態已更新為「${reconLabels[reconNewStatus] || reconNewStatus}」` });
      }

      /* ===================== 收款登錄 ===================== */
      case 'create_payment_receipt': {
        const { customer_id: rcptCustId, receipt_date: rcptDate, total_amount: rcptAmt, payment_method: rcptMethod, bank_name: rcptBank, bank_account: rcptBankAcct, check_no: rcptCheckNo, check_date: rcptCheckDate, reference_no: rcptRefNo, remark: rcptRemark } = body;
        if (!rcptCustId || !rcptAmt) return Response.json({ error: 'customer_id 和 total_amount 為必填' }, { status: 400 });
        const rcptNo = `RCPT-${Date.now().toString(36).toUpperCase()}`;
        const { data: rcptData, error: rcptErr } = await supabase.from('erp_payment_receipts').insert({
          receipt_no: rcptNo, customer_id: rcptCustId, receipt_date: rcptDate || new Date().toISOString().slice(0, 10),
          total_amount: Number(rcptAmt), payment_method: rcptMethod || 'transfer',
          bank_name: rcptBank || null, bank_account: rcptBankAcct || null,
          check_no: rcptCheckNo || null, check_date: rcptCheckDate || null,
          reference_no: rcptRefNo || null, status: 'pending',
          remark: rcptRemark || '', created_by: 'admin',
        }).select().single();
        if (rcptErr) return Response.json({ error: rcptErr.message }, { status: 500 });
        return Response.json({ success: true, data: rcptData, message: `收款單 ${rcptNo} 已建立` });
      }

      case 'confirm_payment_receipt': {
        const { id: confirmRcptId } = body;
        if (!confirmRcptId) return Response.json({ error: 'id 為必填' }, { status: 400 });
        const { error: confirmErr } = await supabase.from('erp_payment_receipts').update({
          status: 'confirmed', confirmed_at: new Date().toISOString(), confirmed_by: 'admin', updated_at: new Date().toISOString(),
        }).eq('id', confirmRcptId);
        if (confirmErr) return Response.json({ error: confirmErr.message }, { status: 500 });
        return Response.json({ success: true, message: '收款單已確認' });
      }

      case 'cancel_payment_receipt': {
        const { id: cancelRcptId } = body;
        if (!cancelRcptId) return Response.json({ error: 'id 為必填' }, { status: 400 });
        const { data: cancelAllocs } = await supabase.from('erp_payment_allocations').select('id').eq('receipt_id', cancelRcptId);
        if ((cancelAllocs || []).length > 0) return Response.json({ error: '此收款單已有沖帳記錄，無法取消。請先撤銷沖帳。' }, { status: 400 });
        const { error: cancelErr } = await supabase.from('erp_payment_receipts').update({
          status: 'cancelled', updated_at: new Date().toISOString(),
        }).eq('id', cancelRcptId);
        if (cancelErr) return Response.json({ error: cancelErr.message }, { status: 500 });
        return Response.json({ success: true, message: '收款單已取消' });
      }

      /* ===================== 沖帳配對 ===================== */
      case 'execute_matching': {
        const { receipt_id: matchRcptId, allocations: matchAllocs } = body;
        if (!matchRcptId || !matchAllocs || !matchAllocs.length) return Response.json({ error: 'receipt_id 和 allocations 為必填' }, { status: 400 });

        const { data: matchReceipt } = await supabase.from('erp_payment_receipts').select('*').eq('id', matchRcptId).maybeSingle();
        if (!matchReceipt || matchReceipt.status !== 'confirmed') return Response.json({ error: '收款單不存在或尚未確認' }, { status: 400 });

        const { data: existMatchAllocs } = await supabase.from('erp_payment_allocations').select('allocated_amount').eq('receipt_id', matchRcptId);
        const existMatchAllocated = (existMatchAllocs || []).reduce((s, r) => s + Number(r.allocated_amount || 0), 0);
        const matchRemaining = Number(matchReceipt.total_amount || 0) - existMatchAllocated;

        const matchTotalNew = matchAllocs.reduce((s, a) => s + Number(a.amount || 0), 0);
        if (matchTotalNew > matchRemaining + 0.01) return Response.json({ error: `沖帳金額 ${matchTotalNew} 超過可用餘額 ${matchRemaining}` }, { status: 400 });

        const matchResults = [];
        for (const ma of matchAllocs) {
          const { invoice_id: maInvId, amount: maAmt, allocation_type: maType, remark: maRemark } = ma;
          if (!maInvId || !maAmt || Number(maAmt) <= 0) continue;

          await supabase.from('erp_payment_allocations').insert({
            receipt_id: matchRcptId, invoice_id: maInvId, allocated_amount: Number(maAmt),
            allocation_date: new Date().toISOString().slice(0, 10),
            allocation_type: maType || 'normal', remark: maRemark || '', created_by: 'admin',
          });

          const { data: maInv } = await supabase.from('erp_invoices').select('total_amount, paid_amount').eq('id', maInvId).maybeSingle();
          if (maInv) {
            const maNewPaid = Number(maInv.paid_amount || 0) + Number(maAmt);
            const maTotal = Number(maInv.total_amount || 0);
            const maPayStatus = maNewPaid >= maTotal ? 'paid' : maNewPaid > 0 ? 'partial' : 'unpaid';
            await supabase.from('erp_invoices').update({
              paid_amount: maNewPaid, balance: maTotal - maNewPaid, payment_status: maPayStatus, updated_at: new Date().toISOString(),
            }).eq('id', maInvId);
          }
          matchResults.push({ invoice_id: maInvId, amount: Number(maAmt) });
        }

        return Response.json({ success: true, matched: matchResults.length, message: `已完成 ${matchResults.length} 筆沖帳配對` });
      }

      case 'record_order_payment': {
        // 直接登記訂單付款（不經由發票）
        const { order_id: payOrderId, amount: payAmount, method: payMethod, remark: payRemark, payment_type: payType, proof_data: payProofData, proof_name: payProofName } = body;
        if (!payOrderId || !payAmount) return Response.json({ error: 'order_id 和 amount 為必填' }, { status: 400 });

        const { data: payOrder } = await supabase.from('erp_orders').select('total_amount, payment_status, order_no, customer_id').eq('id', payOrderId).maybeSingle();
        if (!payOrder) return Response.json({ error: '找不到訂單' }, { status: 404 });

        // Generate payment number: PAY-YYYYMMDD-HHMMSS
        const payNo = `PAY-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;

        // Upload proof image if provided
        let proofUrl = null;
        let proofWarning = null;
        if (payProofData) {
          try {
            const ext = (payProofName || 'proof.jpg').split('.').pop()?.toLowerCase() || 'jpg';
            const proofPath = `payment-proofs/${payNo}.${ext}`;
            const proofBuffer = Buffer.from(payProofData, 'base64');
            const { error: uploadErr } = await supabase.storage.from('company-assets').upload(proofPath, proofBuffer, { contentType: `image/${ext === 'png' ? 'png' : 'jpeg'}`, upsert: true });
            if (uploadErr) {
              console.error('Payment proof upload error:', uploadErr);
              proofWarning = `憑證上傳失敗: ${uploadErr.message}`;
            } else {
              const { data: urlData } = supabase.storage.from('company-assets').getPublicUrl(proofPath);
              proofUrl = urlData?.publicUrl || null;
            }
          } catch (proofErr) {
            console.error('Payment proof upload error:', proofErr);
            proofWarning = `憑證上傳失敗: ${proofErr.message}`;
          }
        }

        // Insert payment record
        const { error: payInsertErr } = await supabase.from('qb_payments').insert({
          payment_number: payNo,
          erp_order_id: payOrderId,
          amount: Number(payAmount),
          payment_method: payMethod || 'cash',
          payment_type: payType || 'full',
          payment_date: new Date().toISOString().slice(0, 10),
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          confirmed_by: 'admin',
          notes: payRemark || `訂單 ${payOrder.order_no} ${payType === 'deposit' ? '訂金' : payType === 'balance' ? '尾款' : '付款'}`,
          proof_url: proofUrl,
          verified: false,
        });
        if (payInsertErr) return Response.json({ error: `付款記錄寫入失敗: ${payInsertErr.message}` }, { status: 500 });

        // Calculate total paid (query by erp_order_id)
        const { data: allPayments } = await supabase.from('qb_payments').select('amount').eq('erp_order_id', payOrderId).eq('status', 'confirmed');
        const totalPaid = (allPayments || []).reduce((s, r) => s + Number(r.amount || 0), 0);
        const orderTotal = Number(payOrder.total_amount || 0);
        const newPayStatus = orderTotal > 0 && totalPaid >= orderTotal ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid';

        await supabase.from('erp_orders').update({ payment_status: newPayStatus, updated_at: new Date().toISOString() }).eq('id', payOrderId);
        if (newPayStatus === 'paid') await checkOrderCompletion(payOrderId);

        // === Auto-create erp_payment_receipts (收款登錄) ===
        try {
          const rcptNo = `RCPT-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
          await supabase.from('erp_payment_receipts').insert({
            receipt_no: rcptNo,
            customer_id: payOrder.customer_id || null,
            receipt_date: new Date().toISOString().slice(0, 10),
            total_amount: Number(payAmount),
            payment_method: payMethod || 'cash',
            reference_no: payNo,
            status: 'confirmed',
            confirmed_at: new Date().toISOString(),
            confirmed_by: 'system',
            remark: `自動從收款管理建立 | 訂單:${payOrder.order_no} | ${payType === 'deposit' ? '訂金' : payType === 'balance' ? '尾款' : '付款'}`,
          });
        } catch (rcptErr) {
          console.error('Auto-create payment receipt error:', rcptErr);
        }

        // 3.3 Auto-update ALL erp_invoices paid_amount (應收帳款沖帳)
        try {
          const { data: relatedInvs } = await supabase.from('erp_invoices').select('id, total_amount, paid_amount').eq('order_id', payOrderId).order('created_at', { ascending: true });
          let remainingPaid = totalPaid;
          for (const inv of (relatedInvs || [])) {
            const invTotal = Number(inv.total_amount || 0);
            const allocated = Math.min(invTotal, Math.max(0, remainingPaid));
            const invPayStatus = allocated >= invTotal ? 'paid' : allocated > 0 ? 'partial' : 'unpaid';
            await supabase.from('erp_invoices').update({
              paid_amount: allocated,
              balance: invTotal - allocated,
              payment_status: invPayStatus,
              updated_at: new Date().toISOString(),
            }).eq('id', inv.id);
            remainingPaid -= allocated;
          }
        } catch (invErr) {
          console.error('Auto-update invoice error:', invErr);
        }

        // 1.5 收款後檢查訂單完成
        try { await checkOrderCompletion(payOrderId); } catch (_) {}

        const typeLabel = { deposit: '訂金', partial: '部分付款', balance: '尾款', full: '全額' };
        const baseMsg = newPayStatus === 'paid' ? '已全額收款' : `已收${typeLabel[payType] || '款'} NT$${Number(payAmount).toLocaleString()}，累計 NT$${totalPaid.toLocaleString()}`;
        return Response.json({ success: true, total_paid: totalPaid, payment_status: newPayStatus, proof_url: proofUrl, message: proofWarning ? `${baseMsg}（⚠️ ${proofWarning}）` : baseMsg });
      }

      case 'instock_to_sale': {
        // Convert selected items to sale with custom quantities (partial shipment support)
        const { order_id, item_ids, items: itemsWithQty } = body;
        if (!order_id) return Response.json({ error: 'order_id required' }, { status: 400 });

        const { data: order, error: orderErr } = await supabase.from('erp_orders').select('*').eq('id', order_id).maybeSingle();
        if (orderErr) return Response.json({ error: orderErr.message }, { status: 500 });
        if (!order) return Response.json({ error: 'Order not found' }, { status: 404 });

        // 確認 erp_approvals 有核准記錄（feature flag 關閉時跳過）
        const saleCheckFeatures = await getErpFeatures();
        if (saleCheckFeatures.order_approval) {
          const { data: saleApproval } = await supabase.from('erp_approvals')
            .select('id').eq('doc_type', 'order').eq('doc_id', order_id).eq('status', 'approved')
            .limit(1).maybeSingle();
          if (!saleApproval) {
            const { data: saleExistingSales } = await supabase.from('qb_sales_history')
              .select('id').eq('source_id', order_id).neq('status', 'cancelled').limit(1).maybeSingle();
            if (!saleExistingSales) {
              return Response.json({ error: '此訂單尚未通過人工審核，無法轉銷貨。請先至「審核」頁面核准此訂單' }, { status: 400 });
            }
          }
        }

        // 檢查訂單狀態：已核准/出貨中可直接轉銷貨
        // 若訂單曾核准過（有 approved 記錄 or 已有銷貨單），即使目前狀態被重設也允許（PO到貨場景）
        const allowedStatuses = ['confirmed', 'processing'];
        if (!allowedStatuses.includes(order.status)) {
          // Check if order was previously approved OR has existing sales (PO arrival scenario)
          const { data: prevApproval } = await supabase.from('erp_approvals')
            .select('id')
            .eq('doc_type', 'order').eq('doc_id', order_id).eq('status', 'approved')
            .limit(1).maybeSingle();
          const { data: existingSales } = !prevApproval
            ? await supabase.from('qb_sales_history').select('id').eq('source_id', order_id).neq('status', 'cancelled').limit(1).maybeSingle()
            : { data: null };
          if (prevApproval || existingSales) {
            // Order was previously approved or has sales — allow and restore to processing + audit log
            await supabase.from('erp_orders').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', order_id);
            const evidence = prevApproval ? `原核准紀錄 ${prevApproval.id}` : `已有銷貨紀錄 ${existingSales?.id || 'unknown'}`;
            await supabase.from('erp_approvals').insert({
              doc_type: 'order', doc_id: order_id, doc_no: order.order_no,
              requested_by: 'system', status: 'approved',
              approved_by: 'system_po_arrival', approved_at: new Date().toISOString(),
              amount: order.total_amount,
              remark: `PO 到貨自動恢復 processing（${evidence}），允許處理剩餘品項`,
            });
            order.status = 'processing';
          } else {
            // 檢查審核機制是否已關閉
            const features = await getErpFeatures();
            if (!features.order_approval) {
              // 審核關閉 → 直接核准並繼續
              await supabase.from('erp_orders').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', order_id);
              await supabase.from('erp_approvals').insert({
                doc_type: 'order', doc_id: order_id, doc_no: order.order_no,
                requested_by: 'system', status: 'approved',
                approved_by: 'system_auto', approved_at: new Date().toISOString(),
                amount: order.total_amount, remark: '審核機制已關閉，系統自動核准',
              });
              order.status = 'confirmed';
            } else {
              const statusNames = { draft: '草稿', pending_approval: '待審核', rejected: '已駁回', completed: '已完成' };
              return Response.json({ error: `訂單狀態為「${statusNames[order.status] || order.status}」，需先送審並核准後才能轉銷貨` }, { status: 400 });
            }
          }
        }

        // Build qty map: new format [{id, qty}] or legacy [item_ids] (full qty)
        const qtyMap = {};
        if (itemsWithQty && itemsWithQty.length > 0) {
          itemsWithQty.forEach(i => { qtyMap[i.id] = Number(i.qty); });
        }
        const selectedIds = itemsWithQty ? itemsWithQty.map(i => String(i.id)) : (item_ids || []).map(String);

        // Fetch order items — use filter instead of .in() to avoid array format issues
        let itemQuery = supabase.from('erp_order_items').select('*').eq('order_id', order_id);
        const { data: allItems, error: itemsErr } = await itemQuery;
        // Filter by selectedIds client-side to avoid Supabase .in() UUID serialization issues
        const items = selectedIds.length > 0
          ? (allItems || []).filter(i => selectedIds.includes(String(i.id)))
          : allItems;
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
            .select('item_number, stock_qty, safety_stock, description, cost_price')
            .eq('item_number', item.item_number_snapshot)
            .maybeSingle();
          if (!product) continue;
          const stockQty = Number(product.stock_qty || 0);
          if (stockQty >= requestedQty) {
            processItems.push({ ...item, _cost_price: Number(product.cost_price || 0) });
            processQtys.push(requestedQty);
          }
        }

        if (processItems.length === 0) return Response.json({ error: '沒有庫存充足的項目可轉銷貨' }, { status: 400 });

        // 方案 A：銷貨自動核准，直接扣庫存
        const saleTotal = processItems.reduce((s, item, idx) => s + Number(item.unit_price) * processQtys[idx], 0);
        const saleCost = processItems.reduce((s, item, idx) => s + (item._cost_price || 0) * processQtys[idx], 0);
        const slipNumber = `SA-${Date.now()}`;

        // Fetch customer name for display
        let custName = '';
        if (order.customer_id) {
          const { data: cust } = await supabase.from('erp_customers').select('name, company_name').eq('id', order.customer_id).maybeSingle();
          custName = cust?.company_name || cust?.name || '';
        }

        // 運費：由前端彈窗傳入，使用者每次轉銷貨自行決定
        const orderShipping = Number(body.shipping_fee ?? order.shipping_fee ?? 0);
        const orderDiscount = Number(order.discount_amount || 0);
        const taxableBase = Math.max(0, saleTotal - orderDiscount);
        const orderTaxInclusive = order.tax_inclusive || false;
        const saleTax = orderTaxInclusive ? 0 : Math.round(taxableBase * 0.05);

        const salePayload = {
          slip_number: slipNumber,
          invoice_number: order.order_no,
          customer_name: custName || '未命名客戶',
          sales_person: order.sales_person || null,
          subtotal: saleTotal,
          shipping_fee: orderShipping,
          discount_amount: orderDiscount,
          tax: saleTax,
          total: taxableBase + saleTax + orderShipping,
          tax_inclusive: orderTaxInclusive,
          sale_date: new Date().toISOString().split('T')[0],
          source_type: 'order_partial',
          source_id: order_id,
          status: 'pending',
          total_amount: taxableBase + saleTax + orderShipping,
          total_qty: processQtys.reduce((s, q) => s + q, 0),
          cost: saleCost,
          gross_profit: (taxableBase + saleTax) - saleCost - orderShipping,
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

        // 銷貨需人工審核 — 送審，等核准後才扣庫存
        const { error: approvalErr } = await supabase.from('erp_approvals').insert([{
          doc_type: 'sale',
          doc_id: String(sale.id),
          doc_no: slipNumber,
          requested_by: 'admin',
          amount: saleTotal,
          status: 'pending',
          remark: `訂單 ${order.order_no} 已核准，銷貨待審（含 ${processItems.length} 項）`,
        }]);
        if (approvalErr) console.error('Approval insert error:', approvalErr.message);

        // 更新訂單狀態：轉銷貨後進入 processing，需付款+出貨完成才算 completed
        await supabase.from('erp_orders').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', order_id);

        return Response.json({ success: true, sale: { slip_number: slipNumber }, processed_count: processItems.length, total_items: (items || []).length, order_status: 'processing' });
      }

      case 'create_direct_sale': {
        // Direct (walk-in) sale creation — no order required
        const { customer_name: dsCustName, sales_person: dsSalesPerson, sale_date: dsSaleDate, items: dsItems, tax_inclusive: dsTaxIncl, remark: dsRemark } = body;
        if (!dsCustName) return Response.json({ error: '客戶名稱為必填' }, { status: 400 });
        if (!dsItems || dsItems.length === 0) return Response.json({ error: '至少需要一項商品' }, { status: 400 });

        const now = new Date().toISOString();
        const today = now.split('T')[0];
        const dateSeq = (dsSaleDate || today).replace(/-/g, '');
        const dsSlipNumber = `SA-${dateSeq}-${Date.now().toString(36).toUpperCase().slice(-5)}`;

        const dsSubtotal = dsItems.reduce((s, i) => s + Math.round(Number(i.qty || 1) * Number(i.unit_price || 0)), 0);
        const dsTaxBase = dsSubtotal;
        const dsTax = dsTaxIncl ? 0 : Math.round(dsTaxBase * 0.05);
        const dsTotal = dsTaxBase + dsTax;

        const dsSalePayload = {
          slip_number: dsSlipNumber,
          customer_name: dsCustName.trim(),
          sales_person: dsSalesPerson || null,
          sale_date: dsSaleDate || today,
          subtotal: dsSubtotal,
          tax: dsTax,
          total: dsTotal,
          total_amount: dsTotal,
          tax_inclusive: dsTaxIncl || false,
          status: 'completed',
          source_type: 'direct',
          remark: dsRemark || null,
          created_at: now,
          updated_at: now,
        };

        const { data: dsSale, error: dsSaleErr } = await supabase.from('qb_sales_history').insert([dsSalePayload]).select().single();
        if (dsSaleErr) return Response.json({ error: `建立銷貨單失敗：${dsSaleErr.message}` }, { status: 500 });

        // Insert line items into qb_order_items (order_id = sale.id)
        const dsLineItems = dsItems.map(i => ({
          order_id: dsSale.id,
          item_number: (i.item_number || '').trim() || null,
          description: (i.description || '').trim(),
          quantity: Number(i.qty || 1),
          unit_price: Number(i.unit_price || 0),
        }));
        const { error: dsItemsErr } = await supabase.from('qb_order_items').insert(dsLineItems);
        if (dsItemsErr) {
          await supabase.from('qb_sales_history').delete().eq('id', dsSale.id);
          return Response.json({ error: `品項寫入失敗：${dsItemsErr.message}` }, { status: 500 });
        }

        return Response.json({ success: true, slip_number: dsSlipNumber, sale_id: dsSale.id });
      }

      case 'add_order_item': {
        const { order_id: addOrderId, item_number, qty: addQty, unit_price: addPrice, discount_rate: addDiscount, item_note: addNote } = body;
        if (!addOrderId || !item_number) return Response.json({ error: 'order_id 和 item_number 為必填' }, { status: 400 });

        // 鎖定檢查：送審後不可新增品項
        const addLock = await assertOrderEditable(addOrderId);
        if (!addLock.ok) return Response.json({ error: addLock.error }, { status: addLock.status });

        // Lookup product info
        const { data: prod } = await supabase.from('quickbuy_products').select('item_number, description, tw_retail_price, tw_reseller_price').eq('item_number', item_number).maybeSingle();
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
          cost_price_snapshot: Number(prod.tw_reseller_price || 0),
          discount_rate: finalDiscount,
          item_note: addNote || '',
        });
        if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 });

        // 2.5 Recalculate order totals (含 discount/shipping)
        {
          const { data: allItems2 } = await supabase.from('erp_order_items').select('line_total').eq('order_id', addOrderId);
          const { data: curOrder } = await supabase.from('erp_orders').select('discount_amount, shipping_fee, tax_inclusive').eq('id', addOrderId).maybeSingle();
          const sub2 = (allItems2 || []).reduce((s, i) => s + Number(i.line_total || 0), 0);
          const disc = Number(curOrder?.discount_amount || 0);
          const ship = Number(curOrder?.shipping_fee || 0);
          const taxBase = Math.max(0, sub2 - disc + ship);
          const tax2 = curOrder?.tax_inclusive ? 0 : Math.round(taxBase * 0.05);
          await supabase.from('erp_orders').update({ subtotal: sub2, tax_amount: tax2, total_amount: taxBase + tax2, updated_at: new Date().toISOString() }).eq('id', addOrderId);
        }

        return Response.json({ success: true, message: `已新增 ${prod.item_number}` });
      }

      case 'replace_order_item': {
        const { item_id: replaceItemId, new_item_number } = body;
        if (!replaceItemId || !new_item_number) return Response.json({ error: 'item_id 和 new_item_number 為必填' }, { status: 400 });

        const { data: oldItem } = await supabase.from('erp_order_items').select('*').eq('id', replaceItemId).maybeSingle();
        if (!oldItem) return Response.json({ error: '找不到品項' }, { status: 404 });

        // 鎖定檢查：送審後不可替換品項
        const replaceLock = await assertOrderEditable(oldItem.order_id);
        if (!replaceLock.ok) return Response.json({ error: replaceLock.error }, { status: replaceLock.status });

        if (oldItem.sale_ref) return Response.json({ error: '此品項已轉銷貨，無法替換' }, { status: 400 });
        if (oldItem.po_ref) return Response.json({ error: '此品項已轉採購，無法替換' }, { status: 400 });

        const { data: newProd } = await supabase.from('quickbuy_products').select('item_number, description, tw_retail_price, tw_reseller_price, stock_qty').eq('item_number', new_item_number).maybeSingle();
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
          cost_price_snapshot: Number(newProd.tw_reseller_price || 0),
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

        // ── 訂單鎖定檢查：送審後不可修改品項 ──
        const updateItemLock = await assertOrderEditable(currentItem.order_id);
        if (!updateItemLock.ok) return Response.json({ error: updateItemLock.error }, { status: updateItemLock.status });

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

      case 'update_order_status': {
        const { order_id: uosOrderId, status: uosNewStatus } = body;
        if (!uosOrderId || !uosNewStatus) return Response.json({ error: 'order_id and status required' }, { status: 400 });

        // 退回草稿時檢查：如果已有銷貨單則不允許
        if (uosNewStatus === 'draft') {
          const { data: linkedSales } = await supabase.from('qb_sales_history').select('id').eq('source_id', uosOrderId).neq('status', 'cancelled').limit(1);
          if (linkedSales && linkedSales.length > 0) {
            return Response.json({ error: '此訂單已有銷貨記錄，無法退回草稿' }, { status: 400 });
          }
        }

        const { error: uosErr } = await supabase.from('erp_orders').update({
          status: uosNewStatus,
          updated_at: new Date().toISOString(),
        }).eq('id', uosOrderId);
        if (uosErr) return Response.json({ error: uosErr.message }, { status: 500 });

        return Response.json({ success: true, message: `訂單狀態已更新為 ${uosNewStatus}` });
      }

      case 'delete_order_item': {
        const { item_id: delItemId } = body;
        if (!delItemId) return Response.json({ error: 'item_id required' }, { status: 400 });

        const { data: delItem } = await supabase.from('erp_order_items').select('*').eq('id', delItemId).maybeSingle();
        if (!delItem) return Response.json({ error: '找不到品項' }, { status: 404 });

        // ── 訂單鎖定檢查：送審後不可刪除品項 ──
        const delItemLock = await assertOrderEditable(delItem.order_id);
        if (!delItemLock.ok) return Response.json({ error: delItemLock.error }, { status: delItemLock.status });

        if (delItem.sale_ref) return Response.json({ error: '此品項已轉銷貨，無法刪除' }, { status: 400 });
        if (delItem.po_ref) return Response.json({ error: '此品項已轉採購，無法刪除' }, { status: 400 });

        const { error: delErr } = await supabase.from('erp_order_items').delete().eq('id', delItemId);
        if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

        // 2.5 Recalculate order totals (含 discount/shipping)
        {
          const { data: remainItems } = await supabase.from('erp_order_items').select('line_total').eq('order_id', delItem.order_id);
          const { data: curOrd } = await supabase.from('erp_orders').select('discount_amount, shipping_fee, tax_inclusive').eq('id', delItem.order_id).maybeSingle();
          const recalcSub = (remainItems || []).reduce((s, i) => s + Number(i.line_total || 0), 0);
          const disc = Number(curOrd?.discount_amount || 0);
          const ship = Number(curOrd?.shipping_fee || 0);
          const taxBase = Math.max(0, recalcSub - disc + ship);
          const recalcTax = curOrd?.tax_inclusive ? 0 : Math.round(taxBase * 0.05);
          await supabase.from('erp_orders').update({
            subtotal: recalcSub,
            tax_amount: recalcTax,
            total_amount: taxBase + recalcTax,
            updated_at: new Date().toISOString(),
          }).eq('id', delItem.order_id);
        }

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

        // Look up tw_reseller_price (cost) for each shortage item
        const shortageItemNumbers = shortageItems.map(i => i.item_number_snapshot).filter(Boolean);
        const { data: costProducts } = shortageItemNumbers.length
          ? await supabase.from('quickbuy_products').select('item_number, tw_reseller_price').in('item_number', shortageItemNumbers)
          : { data: [] };
        const costMap = {};
        (costProducts || []).forEach(p => { costMap[p.item_number] = Number(p.tw_reseller_price || 0); });

        // Create purchase order
        const poNo = await generatePoNo();
        const subtotal = shortageItems.reduce((s, i) => {
          const cost = costMap[i.item_number_snapshot] || Number(i.cost_price_snapshot || 0);
          return s + (i.shortage * cost);
        }, 0);
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

        // Create PO items using tw_reseller_price as cost
        // erp_purchase_order_items columns: po_id, item_number, description, qty, unit_cost, line_total
        const poItems = shortageItems.map(i => {
          const cost = costMap[i.item_number_snapshot] || Number(i.cost_price_snapshot || 0);
          return {
            po_id: po.id,
            item_number: i.item_number_snapshot,
            description: i.description_snapshot,
            qty: i.shortage,
            unit_cost: cost,
            line_total: i.shortage * cost,
          };
        });
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

        // 自動送採購審核
        const poFeatures = await getErpFeatures();
        if (poFeatures.order_approval) {
          await supabase.from('erp_purchase_orders').update({ status: 'pending_approval', updated_at: new Date().toISOString() }).eq('id', po.id);
          await supabase.from('erp_approvals').insert({
            doc_type: 'purchase_order', doc_id: po.id, doc_no: poNo,
            requested_by: 'system', status: 'pending',
            amount: poTotal, remark: `從訂單 ${order.order_no} 缺貨轉採購，自動送審`,
          });
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
        const { sale_id, invoice_number, invoice_date, remark,
                invoice_type, buyer_tax_id, buyer_name, carrier_type, carrier_id } = body;
        if (!sale_id) return Response.json({ error: 'sale_id 為必填' }, { status: 400 });
        const salePayload = {};
        if (invoice_number !== undefined) salePayload.invoice_number = invoice_number || null;
        if (invoice_date !== undefined) salePayload.invoice_date = invoice_date || null;
        if (remark !== undefined) salePayload.remark = remark;
        const { error } = await supabase.from('qb_sales_history').update(salePayload).eq('id', sale_id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        // 同步 erp_invoices e-invoice 欄位
        if (invoice_number) {
          const isoNow = new Date().toISOString();

          // 查 sale 基本資料
          const { data: saleRef } = await supabase.from('qb_sales_history').select('source_id, total').eq('id', sale_id).maybeSingle();
          const linkedOrderId = saleRef?.source_id || null;
          const saleTotal = Number(saleRef?.total || 0);

          // 取 customer_id（從訂單抓）
          let customerId = null;
          if (linkedOrderId) {
            const { data: orderRef } = await supabase.from('erp_orders').select('customer_id').eq('id', linkedOrderId).maybeSingle();
            customerId = orderRef?.customer_id || null;
          }

          // 要寫入 erp_invoices 的所有欄位（update / insert 共用）
          const invSyncFields = {
            invoice_no:   invoice_number,
            invoice_type: invoice_type  || 'B2B',
            buyer_tax_id: buyer_tax_id  || null,
            buyer_name:   buyer_name    || null,
            carrier_type: carrier_type  || null,
            carrier_id:   carrier_id    || null,
            updated_at:   isoNow,
            // 確保 total_amount / customer_id 正確（auto-created 行可能用訂單總額）
            ...(saleTotal > 0 ? { total_amount: saleTotal, balance: saleTotal } : {}),
            ...(customerId   ? { customer_id: customerId } : {}),
          };
          if (invoice_date) invSyncFields.invoice_date = invoice_date;

          // ── 查找既有 erp_invoices 行（三段優先順序）──────────────────────────────
          // 1. invoice_no 精確查（重複儲存同一號碼）
          // 2. sale_id 查（create_shipment 自動建立的行，invoice_no 是 INV... 暫存號碼）
          // 3. order_id + invoice_no IS NULL（其他 edge case）
          let existingInvId = null;

          const { data: byNo } = await supabase.from('erp_invoices').select('id')
            .eq('invoice_no', invoice_number).limit(1).maybeSingle();
          existingInvId = byNo?.id || null;

          if (!existingInvId) {
            const { data: bySale } = await supabase.from('erp_invoices').select('id')
              .eq('sale_id', sale_id).limit(1).maybeSingle();
            existingInvId = bySale?.id || null;
          }

          if (!existingInvId && linkedOrderId) {
            // Fallback 3a: rows where invoice_no IS NULL (edge case, pre-INV era)
            const { data: byOrder } = await supabase.from('erp_invoices').select('id')
              .eq('order_id', linkedOrderId).is('invoice_no', null).limit(1).maybeSingle();
            existingInvId = byOrder?.id || null;
          }

          if (!existingInvId && linkedOrderId) {
            // Fallback 3b: system-generated INV... rows where sale_id was NOT saved (historical data)
            // These rows were created by create_shipment before we started saving sale_id
            const { data: byInvRow } = await supabase.from('erp_invoices').select('id')
              .eq('order_id', linkedOrderId).like('invoice_no', 'INV%').limit(1).maybeSingle();
            existingInvId = byInvRow?.id || null;
          }
          // ─────────────────────────────────────────────────────────────────────────

          if (existingInvId) {
            await supabase.from('erp_invoices').update(invSyncFields).eq('id', existingInvId);
          } else {
            await supabase.from('erp_invoices').insert({
              order_id:       linkedOrderId,
              sale_id:        sale_id,
              paid_amount:    0,
              payment_status: 'unpaid',
              created_at:     isoNow,
              ...invSyncFields,
            });
          }

          // 不論 insert / update，只要 total_amount 有異動，重新分配已付款給所有發票
          // （同步 create_shipment verify-payment 裡的 3.3 邏輯）
          if (linkedOrderId && saleTotal > 0) {
            try {
              const [{ data: relatedInvs }, { data: confirmedPays }] = await Promise.all([
                supabase.from('erp_invoices').select('id, total_amount').eq('order_id', linkedOrderId).order('created_at', { ascending: true }),
                supabase.from('qb_payments').select('amount').eq('erp_order_id', linkedOrderId).eq('status', 'confirmed'),
              ]);
              const totalOrderPaid = (confirmedPays || []).reduce((s, p) => s + Number(p.amount || 0), 0);
              let remaining = totalOrderPaid;
              for (const inv of (relatedInvs || [])) {
                const invTotal = Number(inv.total_amount || 0);
                const allocated = Math.min(invTotal, Math.max(0, remaining));
                const invStatus = allocated >= invTotal && invTotal > 0 ? 'paid' : allocated > 0 ? 'partial' : 'unpaid';
                await supabase.from('erp_invoices').update({
                  paid_amount:    allocated,
                  balance:        Math.max(0, invTotal - allocated),
                  payment_status: invStatus,
                  updated_at:     isoNow,
                }).eq('id', inv.id);
                remaining -= allocated;
              }
            } catch (_) { /* 重分配失敗不影響主流程 */ }
          }
        }
        return Response.json({ success: true, message: '已更新' });
      }

      case 'update_order_remark': {
        const { order_id, remark } = body;
        if (!order_id) return Response.json({ error: 'order_id 為必填' }, { status: 400 });
        const { error } = await supabase.from('erp_orders').update({ remark: remark || '' }).eq('id', order_id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true, message: '備註已更新' });
      }

      case 'update_po_remark': {
        const { po_id, remark } = body;
        if (!po_id) return Response.json({ error: 'po_id 為必填' }, { status: 400 });
        const { error } = await supabase.from('erp_purchase_orders').update({ remark: remark || '' }).eq('id', po_id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true, message: '備註已更新' });
      }

      /* ===================== 簽核審批 ===================== */
      case 'submit_approval': {
        const { doc_type, doc_id, doc_no, requested_by, amount, remark } = body;
        if (!doc_type || !doc_id) return Response.json({ error: 'doc_type 和 doc_id 為必填' }, { status: 400 });

        // ── 審核關閉 → 直接核准 ──
        if (doc_type === 'order') {
          const features = await getErpFeatures();
          if (!features.order_approval) {
            await supabase.from('erp_orders').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', doc_id);
            await supabase.from('erp_approvals').insert({
              doc_type, doc_id, doc_no: doc_no || '', requested_by: requested_by || 'system',
              status: 'approved', approved_by: 'system_auto', approved_at: new Date().toISOString(),
              amount: amount || null, remark: '審核機制已關閉，系統自動核准',
            });
            return Response.json({ success: true, message: '審核機制已關閉，訂單已自動核准', auto_approved: true });
          }
        }

        // 3.7 採購單審核關閉 → 直接核准
        if (doc_type === 'purchase_order') {
          const features = await getErpFeatures();
          if (!features.order_approval) {
            await supabase.from('erp_purchase_orders').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', doc_id);
            await supabase.from('erp_approvals').insert({
              doc_type, doc_id, doc_no: doc_no || '', requested_by: requested_by || 'system',
              status: 'approved', approved_by: 'system_auto', approved_at: new Date().toISOString(),
              amount: amount || null, remark: '審核機制已關閉，系統自動核准',
            });
            return Response.json({ success: true, message: '審核機制已關閉，採購單已自動核准', auto_approved: true });
          }
        }

        // Check if already pending
        const { data: existing } = await supabase.from('erp_approvals').select('id').eq('doc_id', doc_id).eq('status', 'pending').limit(1);
        if (existing?.length) return Response.json({ error: '此文件已在簽核中' }, { status: 400 });

        // 2.9 Guard: prevent re-submitting invalid status orders
        if (doc_type === 'order') {
          const { data: ord } = await supabase.from('erp_orders').select('status').eq('id', doc_id).maybeSingle();
          if (ord && ['confirmed', 'processing'].includes(ord.status)) {
            return Response.json({ error: '此訂單已核准，不需重新送審。如需處理到貨商品，請直接在訂單詳情中「勾選項目 → 轉銷貨」。' }, { status: 400 });
          }
          if (ord && ord.status === 'rejected') {
            // 被駁回的訂單：自動轉為 pending_approval 並重新提交，不強迫使用者手動切換草稿
            await supabase.from('erp_orders').update({ status: 'pending_approval', updated_at: new Date().toISOString() }).eq('id', doc_id);
            // 將舊的 rejected 記錄標記為 withdrawn，避免審核頁面顯示重複舊記錄
            await supabase.from('erp_approvals').update({ status: 'withdrawn', remark: '已重新送審' }).eq('doc_type', 'order').eq('doc_id', doc_id).eq('status', 'rejected');
            // fall through → 正常建立新的 pending 記錄
          }
          if (ord && ord.status === 'cancelled') {
            return Response.json({ error: '此訂單已取消，無法送審' }, { status: 400 });
          }
          // Check if was previously approved — warn instead of blocking
          const { data: prevApproved } = await supabase.from('erp_approvals').select('id')
            .eq('doc_type', 'order').eq('doc_id', doc_id).eq('status', 'approved').limit(1).maybeSingle();
          if (prevApproved) {
            // Check if there are linked sales already
            const { data: linkedSales } = await supabase.from('qb_sales_history').select('id').eq('source_id', doc_id).limit(1).maybeSingle();
            if (linkedSales) {
              // Auto-restore to processing instead of re-submitting
              await supabase.from('erp_orders').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', doc_id);
              return Response.json({ message: '此訂單已核准並有銷貨記錄，已自動恢復為「出貨中」狀態。可直接轉銷貨處理到貨商品。', auto_restored: true });
            }
          }
        }

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

        // 更新來源文件狀態
        if (doc_type === 'order') {
          await supabase.from('erp_orders').update({ status: 'pending_approval', updated_at: new Date().toISOString() }).eq('id', doc_id);
        } else if (doc_type === 'purchase_order') {
          await supabase.from('erp_purchase_orders').update({ status: 'pending_approval', updated_at: new Date().toISOString() }).eq('id', doc_id);
        }

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

        // 1.8 審核權限驗證：approved_by 優先用 body.__auth_user（由 route 層注入），否則用 approved_by
        const safeApprovedBy = body.__auth_user?.display_name || body.__auth_user?.username || approved_by || 'admin';

        const { data: approval, error: apFetchErr } = await supabase.from('erp_approvals').select('*').eq('id', approval_id).maybeSingle();
        if (apFetchErr) return Response.json({ error: apFetchErr.message }, { status: 500 });
        if (!approval) return Response.json({ error: '找不到簽核單' }, { status: 400 });
        if (approval.status !== 'pending') return Response.json({ error: '此簽核單已處理' }, { status: 400 });

        const newStatus = (approvalAction === 'approve' || approvalAction === 'approved') ? 'approved' : 'rejected';
        const { error: apUpdateErr } = await supabase.from('erp_approvals').update({
          status: newStatus,
          approved_by: safeApprovedBy,
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

              // ── 自動產生負數應付帳款（沖減原進貨應付）──
              try {
                const retTotal = Number(ret.total_amount || 0);
                if (retTotal > 0 && ret.vendor_id) {
                  const apNo = `AP-RTN-${Date.now().toString(36).toUpperCase()}`;
                  await supabase.from('erp_vendor_payables').insert({
                    payable_no: apNo, vendor_id: ret.vendor_id,
                    source_type: 'purchase_return', source_id: approval.doc_id, source_no: ret.return_no,
                    payable_date: new Date().toISOString().slice(0, 10), due_date: new Date().toISOString().slice(0, 10),
                    total_amount: -retTotal, paid_amount: 0, balance: -retTotal,
                    payment_status: 'unpaid', created_by: 'admin',
                  });
                }
              } catch (_) { /* 應付沖減產生失敗不影響主流程 */ }
            }
          }
        }

        // 駁回時也更新來源文件狀態
        if (newStatus === 'rejected') {
          if (approval.doc_type === 'order') {
            await supabase.from('erp_orders').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', approval.doc_id);
          } else if (approval.doc_type === 'purchase_order') {
            await supabase.from('erp_purchase_orders').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', approval.doc_id);
          } else if (approval.doc_type === 'sale') {
            // 銷貨駁回：設為 rejected + 還原 erp_order_items.sold_qty
            await supabase.from('qb_sales_history').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', approval.doc_id);
            const { data: saleItems } = await supabase.from('qb_order_items').select('item_number, quantity').eq('order_id', approval.doc_id);
            if (saleItems && saleItems.length > 0) {
              const { data: sale } = await supabase.from('qb_sales_history').select('source_id, slip_number').eq('id', approval.doc_id).maybeSingle();
              if (sale?.source_id) {
                const { data: orderItems } = await supabase.from('erp_order_items').select('id, item_number_snapshot, sold_qty, sale_ref').eq('order_id', sale.source_id);
                for (const oi of (orderItems || [])) {
                  const saleItem = saleItems.find(si => si.item_number === oi.item_number_snapshot);
                  if (!saleItem) continue;
                  const newSoldQty = Math.max(0, Number(oi.sold_qty || 0) - Number(saleItem.quantity));
                  const newSaleRef = (oi.sale_ref || '').split(',').filter(r => r.trim() !== sale.slip_number).join(',');
                  await supabase.from('erp_order_items').update({ sold_qty: newSoldQty, sale_ref: newSaleRef || null }).eq('id', oi.id);
                }
              }
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
        // Recalculate quote totals with tax
        const { data: quote } = await supabase.from('erp_quotes').select('discount_amount, shipping_fee, tax_rate').eq('id', currentItem.quote_id).maybeSingle();
        const { data: allItems } = await supabase.from('erp_quote_items').select('line_total').eq('quote_id', currentItem.quote_id);
        const subtotal = (allItems || []).reduce((s, i) => s + Number(i.line_total || 0), 0);
        const taxableBase = Math.max(0, subtotal - Number(quote?.discount_amount || 0));
        const rate = Number(quote?.tax_rate ?? 5);
        const taxAmt = rate > 0 ? Math.round(taxableBase * (rate / 100)) : 0;
        await supabase.from('erp_quotes').update({ subtotal, tax_amount: taxAmt, total_amount: taxableBase + taxAmt }).eq('id', currentItem.quote_id);
        return Response.json({ item: data, message: '已更新' });
      }

      case 'delete_quote_item': {
        const { item_id } = body;
        if (!item_id) return Response.json({ error: 'item_id required' }, { status: 400 });
        const { data: item } = await supabase.from('erp_quote_items').select('quote_id').eq('id', item_id).maybeSingle();
        if (!item) return Response.json({ error: '找不到品項' }, { status: 404 });
        const { error } = await supabase.from('erp_quote_items').delete().eq('id', item_id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        // Recalculate quote totals with tax
        const { data: quote } = await supabase.from('erp_quotes').select('discount_amount, shipping_fee, tax_rate').eq('id', item.quote_id).maybeSingle();
        const { data: allItems } = await supabase.from('erp_quote_items').select('line_total').eq('quote_id', item.quote_id);
        const subtotal = (allItems || []).reduce((s, i) => s + Number(i.line_total || 0), 0);
        const taxableBase = Math.max(0, subtotal - Number(quote?.discount_amount || 0));
        const rate = Number(quote?.tax_rate ?? 5);
        const taxAmt = rate > 0 ? Math.round(taxableBase * (rate / 100)) : 0;
        await supabase.from('erp_quotes').update({ subtotal, tax_amount: taxAmt, total_amount: taxableBase + taxAmt }).eq('id', item.quote_id);
        return Response.json({ message: '品項已刪除' });
      }

      case 'add_quote_item': {
        const { quote_id, item_number } = body;
        if (!quote_id || !item_number) return Response.json({ error: 'quote_id and item_number required' }, { status: 400 });
        // 優先查 quickbuy_products（主要商品表），fallback erp_products
        let { data: product } = await supabase.from('quickbuy_products').select('*').eq('item_number', item_number).maybeSingle();
        if (!product) {
          const { data: erpP } = await supabase.from('erp_products').select('*').eq('item_number', item_number).maybeSingle();
          product = erpP;
        }
        if (!product) return Response.json({ error: `找不到料號 ${item_number}` }, { status: 404 });
        const unitPrice = Number(product.tw_retail_price || product.unit_price || 0);
        const costPrice = Number(product.tw_reseller_price || product.cost_price || 0);
        // quickbuy_products.id 是 bigint，erp_quote_items.product_id 是 uuid，型別不同所以不存
        const { data, error } = await supabase.from('erp_quote_items').insert({
          quote_id,
          item_number_snapshot: product.item_number,
          description_snapshot: product.description || product.item_number,
          qty: 1,
          unit_price: unitPrice,
          line_total: unitPrice,
          cost_price_snapshot: costPrice,
        }).select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        // Recalculate quote totals with tax
        const { data: quote } = await supabase.from('erp_quotes').select('discount_amount, shipping_fee, tax_rate').eq('id', quote_id).maybeSingle();
        const { data: allItems } = await supabase.from('erp_quote_items').select('line_total').eq('quote_id', quote_id);
        const subtotal = (allItems || []).reduce((s, i) => s + Number(i.line_total || 0), 0);
        const taxableBase = Math.max(0, subtotal - Number(quote?.discount_amount || 0));
        const rate = Number(quote?.tax_rate ?? 5);
        const taxAmt = rate > 0 ? Math.round(taxableBase * (rate / 100)) : 0;
        await supabase.from('erp_quotes').update({ subtotal, tax_amount: taxAmt, total_amount: taxableBase + taxAmt }).eq('id', quote_id);
        return Response.json({ item: data, message: `已新增 ${item_number}` });
      }

      case 'replace_quote_item': {
        const { item_id, new_item_number } = body;
        if (!item_id || !new_item_number) return Response.json({ error: 'item_id and new_item_number required' }, { status: 400 });
        const { data: currentItem } = await supabase.from('erp_quote_items').select('*').eq('id', item_id).maybeSingle();
        if (!currentItem) return Response.json({ error: '找不到品項' }, { status: 404 });
        // 優先查 quickbuy_products，fallback erp_products
        let { data: product } = await supabase.from('quickbuy_products').select('*').eq('item_number', new_item_number).maybeSingle();
        if (!product) {
          const { data: erpP } = await supabase.from('erp_products').select('*').eq('item_number', new_item_number).maybeSingle();
          product = erpP;
        }
        if (!product) return Response.json({ error: `找不到料號 ${new_item_number}` }, { status: 404 });
        const unitPrice = Number(product.tw_retail_price || product.unit_price || 0);
        const costPrice = Number(product.tw_reseller_price || product.cost_price || 0);
        const qty = Number(currentItem.qty) || 1;
        const { data, error } = await supabase.from('erp_quote_items').update({
          item_number_snapshot: product.item_number,
          description_snapshot: product.description || product.item_number,
          unit_price: unitPrice,
          line_total: qty * unitPrice,
          cost_price_snapshot: costPrice,
        }).eq('id', item_id).select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        // Recalculate quote totals with tax
        const { data: quote } = await supabase.from('erp_quotes').select('discount_amount, shipping_fee, tax_rate').eq('id', currentItem.quote_id).maybeSingle();
        const { data: allItems } = await supabase.from('erp_quote_items').select('line_total').eq('quote_id', currentItem.quote_id);
        const subtotal = (allItems || []).reduce((s, i) => s + Number(i.line_total || 0), 0);
        const taxableBase = Math.max(0, subtotal - Number(quote?.discount_amount || 0));
        const rate = Number(quote?.tax_rate ?? 5);
        const taxAmt = rate > 0 ? Math.round(taxableBase * (rate / 100)) : 0;
        await supabase.from('erp_quotes').update({ subtotal, tax_amount: taxAmt, total_amount: taxableBase + taxAmt }).eq('id', currentItem.quote_id);
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

      case 'update_po_vendor': {
        const { po_id, vendor_id } = body;
        if (!po_id) return Response.json({ error: 'po_id required' }, { status: 400 });
        const updatePayload = { vendor_id: vendor_id || null };
        const { data, error } = await supabase.from('erp_purchase_orders').update(updatePayload).eq('id', po_id).select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true, po: data, message: '廠商已更新' });
      }

      // ── 部分到貨收貨 ──
      case 'receive_po_items': {
        // items: [{ po_item_id, qty_this_time }]
        const { po_id, items: receiveItems, remark } = body;
        if (!po_id || !receiveItems?.length) return Response.json({ error: 'po_id and items required' }, { status: 400 });

        // Fetch current PO items
        const { data: poItems } = await supabase.from('erp_purchase_order_items').select('*').eq('po_id', po_id);
        const poItemMap = Object.fromEntries((poItems || []).map(i => [String(i.id), i]));

        const stockInItems = [];
        const updatePromises = [];

        for (const ri of receiveItems) {
          const existing = poItemMap[String(ri.po_item_id)];
          if (!existing) continue;
          const qtyThisTime = Math.max(0, Number(ri.qty_this_time || 0));
          if (qtyThisTime <= 0) continue;

          const newReceived = (existing.qty_received || 0) + qtyThisTime;
          updatePromises.push(
            supabase.from('erp_purchase_order_items').update({ qty_received: newReceived }).eq('id', ri.po_item_id)
          );
          stockInItems.push({
            item_number: existing.item_number,
            description: existing.description || '',
            qty_received: qtyThisTime,
            unit_cost: Number(existing.unit_cost || 0),
            line_total: qtyThisTime * Number(existing.unit_cost || 0),
          });
        }

        if (stockInItems.length === 0) return Response.json({ error: '沒有要收貨的品項' }, { status: 400 });

        // Update qty_received
        await Promise.all(updatePromises);

        // Create stock-in record
        const { data: po } = await supabase.from('erp_purchase_orders').select('po_no, vendor_id').eq('id', po_id).maybeSingle();
        const siNo = 'SI' + Date.now();
        const totalAmt = stockInItems.reduce((s, i) => s + i.line_total, 0);
        const { data: si, error: siErr } = await supabase.from('erp_stock_ins').insert({
          stock_in_no: siNo,
          vendor_id: po?.vendor_id || null,
          stock_in_date: new Date().toISOString().slice(0, 10),
          status: 'confirmed',
          total_amount: totalAmt,
          remark: remark || `從採購單 ${po?.po_no || ''} 部分到貨`,
          po_id: po_id,
        }).select().single();

        if (siErr) return Response.json({ error: siErr.message }, { status: 500 });

        // Insert stock-in items
        const siItemsPayload = stockInItems.map(it => ({ ...it, stock_in_id: si.id }));
        { const { error: _imErr } = await insertManyWithColumnFallback('erp_stock_in_items', siItemsPayload); if (_imErr) console.error('[erp_stock_in_items] insert error:', _imErr.message); }

        // Update inventory
        for (const it of stockInItems) {
          if (!it.item_number) continue;
          const { data: inv } = await supabase.from('quickbuy_products').select('id, stock_qty').eq('item_number', it.item_number).maybeSingle();
          if (inv) {
            await supabase.from('quickbuy_products').update({ stock_qty: (inv.stock_qty || 0) + it.qty_received }).eq('id', inv.id);
          }
        }

        // Check if PO is fully received
        const { data: updatedItems } = await supabase.from('erp_purchase_order_items').select('qty, qty_received').eq('po_id', po_id);
        const allReceived = (updatedItems || []).every(i => (i.qty_received || 0) >= (i.qty || 0));
        const someReceived = (updatedItems || []).some(i => (i.qty_received || 0) > 0);
        if (allReceived) {
          await supabase.from('erp_purchase_orders').update({ status: 'received' }).eq('id', po_id);
        } else if (someReceived) {
          // Mark as shipped (partial received)
          const { data: currentPO } = await supabase.from('erp_purchase_orders').select('status').eq('id', po_id).maybeSingle();
          if (currentPO?.status === 'confirmed' || currentPO?.status === 'sent') {
            await supabase.from('erp_purchase_orders').update({ status: 'shipped' }).eq('id', po_id);
          }
        }

        return Response.json({ success: true, stock_in: si, count: stockInItems.length, message: `已收貨 ${stockInItems.length} 項，建立進貨單 ${siNo}` });
      }

      case 'mark_po_exported': {
        const { po_ids } = body;
        if (!po_ids || !Array.isArray(po_ids) || po_ids.length === 0) return Response.json({ error: 'po_ids required' }, { status: 400 });
        const { error } = await supabase.from('erp_purchase_orders').update({ exported_at: new Date().toISOString() }).in('id', po_ids);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true, count: po_ids.length, message: `已標記 ${po_ids.length} 筆為已匯出` });
      }

      case 'clear_po_exported': {
        const { po_ids } = body;
        if (!po_ids || !Array.isArray(po_ids) || po_ids.length === 0) return Response.json({ error: 'po_ids required' }, { status: 400 });
        const { error } = await supabase.from('erp_purchase_orders').update({ exported_at: null }).in('id', po_ids);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true, count: po_ids.length, message: `已清除 ${po_ids.length} 筆匯出標記` });
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
        const unitCost = p.tw_reseller_price || p.cost_price || p.us_price || 0;
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
        // 優先查 quickbuy_products，fallback erp_products
        let { data: product } = await supabase.from('quickbuy_products').select('*').eq('item_number', new_item_number).maybeSingle();
        if (!product) {
          const { data: erpP } = await supabase.from('erp_products').select('*').eq('item_number', new_item_number).maybeSingle();
          product = erpP;
        }
        if (!product) return Response.json({ error: `找不到料號 ${new_item_number}` }, { status: 404 });
        const unitCost = Number(product.tw_reseller_price || product.cost_price || product.us_price || 0);
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

        // ── 同步備註到已轉的訂單 ──
        if (payload.remark !== undefined) {
          try {
            const { data: linkedOrders } = await supabase.from('erp_orders').select('id').eq('quote_id', quote_id);
            if (linkedOrders && linkedOrders.length > 0) {
              const orderIds = linkedOrders.map(o => o.id);
              await supabase.from('erp_orders').update({ remark: payload.remark, updated_at: new Date().toISOString() }).in('id', orderIds);
            }
          } catch (_) { /* 同步失敗不影響主流程 */ }
        }

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
        const { name, company_name, phone, email, tax_id, force } = body;
        if (!name?.trim()) return Response.json({ error: '客戶名稱必填' }, { status: 400 });

        // 重複檢查：比對 company_name/name, phone, tax_id，>=2 欄位吻合即阻擋
        if (!force) {
          const { data: allCust } = await supabase.from('erp_customers').select('id, customer_code, company_name, name, phone, tax_id');
          const normInput = (company_name || name || '').replace(/\s+/g, '').replace(/(股份)?有限公司|企業社|工作室|商行|行號/g, '').trim();
          const inputName = (name || '').trim();
          const inputPhone = (phone || '').replace(/[-\s]/g, '').trim();
          const inputTaxId = (tax_id || '').trim();
          const dupMatches = [];
          (allCust || []).forEach(c => {
            let matchCount = 0;
            const matchFields = [];
            const normC = (c.company_name || c.name || '').replace(/\s+/g, '').replace(/(股份)?有限公司|企業社|工作室|商行|行號/g, '').trim();
            if (normInput && normC && normInput === normC) { matchCount++; matchFields.push('公司名稱'); }
            if (inputName && c.name && inputName === c.name) { matchCount++; matchFields.push('聯絡人'); }
            const normCPhone = (c.phone || '').replace(/[-\s]/g, '').trim();
            if (inputPhone && inputPhone.length >= 8 && normCPhone && inputPhone === normCPhone) { matchCount++; matchFields.push('電話'); }
            if (inputTaxId && inputTaxId.length >= 8 && c.tax_id && inputTaxId === c.tax_id) { matchCount++; matchFields.push('統編'); }
            if (matchCount >= 2) {
              dupMatches.push({ id: c.id, customer_code: c.customer_code, company_name: c.company_name, name: c.name, phone: c.phone, tax_id: c.tax_id, matchFields });
            }
          });
          if (dupMatches.length > 0) {
            return Response.json({
              error: 'duplicate_found',
              message: `偵測到 ${dupMatches.length} 筆疑似重複客戶`,
              duplicates: dupMatches,
            });
          }
        }

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

      /* ===================== LINE 進貨管理員 ===================== */
      case 'update_stock_in_admin_line_ids': {
        const { line_ids } = body;
        if (!Array.isArray(line_ids)) return Response.json({ error: 'line_ids must be an array' }, { status: 400 });
        await upsertQuickbuyConfigEntry('stock_in_admin_line_ids', line_ids);
        return Response.json({ success: true, count: line_ids.length });
      }

      case 'update_company_settings': {
        const { settings } = body;
        if (!settings) return Response.json({ error: 'settings 為必填' }, { status: 400 });
        await upsertQuickbuyConfigEntry('company_settings', settings);
        return Response.json({ success: true, message: '公司設定已更新' });
      }

      case 'update_erp_features': {
        const { features } = body;
        if (!features || typeof features !== 'object') return Response.json({ error: 'features 為必填' }, { status: 400 });
        const existing = await getQuickbuyConfigEntry('erp_features') || {};
        const merged = { ...existing, ...features };
        await upsertQuickbuyConfigEntry('erp_features', merged);

        // 3.7 審核功能 toggle OFF → 自動批准所有卡住的 pending 審核
        const wasTurningOff = features.order_approval === false && existing.order_approval !== false;
        let autoBatchCount = 0;
        if (wasTurningOff) {
          const now = new Date().toISOString();
          // 批准所有 pending_approval 的訂單
          const { data: pendingOrders } = await supabase
            .from('erp_orders')
            .select('id, order_no, total_amount')
            .eq('status', 'pending_approval');
          for (const po of (pendingOrders || [])) {
            await supabase.from('erp_orders').update({ status: 'confirmed', updated_at: now }).eq('id', po.id);
            await supabase.from('erp_approvals').insert({
              doc_type: 'order', doc_id: po.id, doc_no: po.order_no,
              requested_by: 'system', status: 'approved',
              approved_by: 'system_auto', approved_at: now,
              amount: Number(po.total_amount || 0),
              remark: '審核機制已關閉，系統自動批准',
            });
            autoBatchCount++;
          }
          // 批准所有 pending_approval 的採購單
          const { data: pendingPOs } = await supabase
            .from('erp_purchase_orders')
            .select('id, po_no, total_amount')
            .eq('status', 'pending_approval');
          for (const pp of (pendingPOs || [])) {
            await supabase.from('erp_purchase_orders').update({ status: 'confirmed', updated_at: now }).eq('id', pp.id);
            await supabase.from('erp_approvals').insert({
              doc_type: 'purchase_order', doc_id: pp.id, doc_no: pp.po_no,
              requested_by: 'system', status: 'approved',
              approved_by: 'system_auto', approved_at: now,
              amount: Number(pp.total_amount || 0),
              remark: '審核機制已關閉，系統自動批准',
            });
            autoBatchCount++;
          }
        }

        const msg = autoBatchCount > 0
          ? `功能設定已更新，已自動批准 ${autoBatchCount} 筆待審核單據`
          : '功能設定已更新';
        return Response.json({ success: true, features: merged, auto_approved: autoBatchCount, message: msg });
      }

      case 'upload_company_logo': {
        // Expects base64 image data
        const { file_data, file_name, content_type } = body;
        if (!file_data) return Response.json({ error: 'file_data 為必填' }, { status: 400 });

        const buffer = Buffer.from(file_data, 'base64');
        const ext = (file_name || 'logo.png').split('.').pop();
        const path = `logo/company-logo.${ext}`;

        // Upload to Supabase storage (overwrite existing)
        const { error: uploadErr } = await supabase.storage
          .from('company-assets')
          .upload(path, buffer, { contentType: content_type || 'image/png', upsert: true });
        if (uploadErr) return Response.json({ error: `上傳失敗: ${uploadErr.message}` }, { status: 500 });

        // Get public URL
        const { data: urlData } = supabase.storage.from('company-assets').getPublicUrl(path);
        const logoUrl = urlData?.publicUrl || '';

        // Update company_settings with new logo URL
        const existing = await getQuickbuyConfigEntry('company_settings') || {};
        await upsertQuickbuyConfigEntry('company_settings', { ...existing, logo_url: logoUrl + '?t=' + Date.now() });

        return Response.json({ success: true, logo_url: logoUrl, message: 'Logo 已上傳' });
      }

      // ══════════════════════════════════════════════════════════════
      //  快速進貨 — 一鍵入庫
      // ══════════════════════════════════════════════════════════════
      case 'quick_stock_in': {
        const { items, vendor_id, note } = body;
        const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
        if (!safeItems.length) return Response.json({ error: '請至少加入一個品項' }, { status: 400 });

        // 1. 建立進貨單
        const siNo = `RCIV${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
        const totalAmt = safeItems.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.cost) || 0), 0);

        const { data: si, error: siErr } = await insertSingleWithColumnFallback('erp_stock_ins', {
          stock_in_no: siNo,
          vendor_id: vendor_id || null,
          status: 'confirmed',
          total_amount: totalAmt,
          remark: cleanCsvValue(note) || '快速進貨',
        });
        if (siErr) return Response.json({ error: siErr.message }, { status: 500 });

        // 2. 建立進貨明細
        const itemPayload = safeItems.map(it => ({
          stock_in_id: si.id,
          item_number: (cleanCsvValue(it.part_no) || '').toUpperCase(),
          description: cleanCsvValue(it.name),
          qty_received: toNumber(it.qty) || 1,
          unit_cost: toNumber(it.cost) || 0,
          line_total: (toNumber(it.qty) || 1) * (toNumber(it.cost) || 0),
        }));
        { const { error: _imErr } = await insertManyWithColumnFallback('erp_stock_in_items', itemPayload); if (_imErr) console.error('[erp_stock_in_items] insert error:', _imErr.message); }

        // 3. 庫存異動 + 更新 quickbuy_products.stock_qty
        for (const it of safeItems) {
          const itemNumber = (cleanCsvValue(it.part_no) || '').toUpperCase();
          const qty = toNumber(it.qty) || 0;
          if (!itemNumber || !qty) continue;

          await supabase.from('qb_inventory_movements').insert({
            item_number: itemNumber,
            movement_type: 'in',
            quantity: qty,
            reference_type: 'stock_in',
            notes: `快速進貨 ${siNo}`,
            created_by: 'admin',
          });

          // 更新庫存 + 安全庫存
          const { data: prod } = await supabase
            .from('quickbuy_products')
            .select('stock_qty, safety_stock')
            .eq('item_number', itemNumber)
            .maybeSingle();
          if (prod) {
            const newQty = Math.max(0, (Number(prod.stock_qty) || 0) + qty);
            const updateData = { stock_qty: newQty };
            // 使用者手動設定的安全庫存優先，否則自動設定
            if (it.safety_stock != null && Number(it.safety_stock) >= 0) {
              updateData.safety_stock = Number(it.safety_stock);
            } else if (!prod.safety_stock || prod.safety_stock <= 0) {
              updateData.safety_stock = Math.max(Math.ceil(qty * 0.5), 1);
            }
            await supabase.from('quickbuy_products').update(updateData).eq('item_number', itemNumber);
          }
        }

        // 4. 更新採購單品項的到貨數 (erp_purchase_order_items.qty_received)
        for (const it of safeItems) {
          const itemNumber = (cleanCsvValue(it.part_no) || '').toUpperCase();
          const qty = toNumber(it.qty) || 0;
          if (!itemNumber || !qty) continue;

          // 找到所有未完全到貨的採購單品項，按建立時間排序
          const { data: poItems } = await supabase
            .from('erp_purchase_order_items')
            .select('id, qty, qty_received, po_id')
            .eq('item_number', itemNumber)
            .order('created_at', { ascending: true });

          if (poItems?.length) {
            let remaining = qty;
            for (const poi of poItems) {
              if (remaining <= 0) break;
              const currentReceived = Number(poi.qty_received) || 0;
              const canReceive = (Number(poi.qty) || 0) - currentReceived;
              if (canReceive <= 0) continue;
              const toAdd = Math.min(remaining, canReceive);
              await supabase.from('erp_purchase_order_items')
                .update({ qty_received: currentReceived + toAdd })
                .eq('id', poi.id);
              remaining -= toAdd;
            }
          }
        }

        // 5. 推進等待訂單狀態
        const orderIds = safeItems
          .flatMap(i => (i.waiting_orders || []))
          .map(o => o.order_id)
          .filter(Boolean);
        const uniqueOrderIds = [...new Set(orderIds)];
        if (uniqueOrderIds.length) {
          await supabase.from('erp_orders')
            .update({ status: 'ready_to_ship', updated_at: new Date().toISOString() })
            .in('id', uniqueOrderIds)
            .in('status', ['pending', 'processing', 'confirmed']);
        }

        // 6. 記憶品項對應（供日後辨識自動帶入）
        try {
          for (const it of safeItems) {
            const itemNumber = (cleanCsvValue(it.part_no) || '').toUpperCase();
            const cost = toNumber(it.cost) || 0;
            const name = cleanCsvValue(it.name) || '';
            if (!itemNumber) continue;

            // 供應商品項對應
            if (vendor_id) {
              await supabase.from('vendor_item_mapping').upsert({
                vendor_id, source_part_no: itemNumber,
                mapped_item_number: itemNumber, item_name: name,
                last_cost: cost, times_used: 1, updated_at: new Date().toISOString(),
              }, { onConflict: 'vendor_id,source_part_no' });
              // increment times_used if already exists
              await supabase.rpc('increment_vendor_item_usage', { v_id: vendor_id, s_part_no: itemNumber }).catch(() => {});
            }

            // 全域品項成本歷史
            const { data: existing } = await supabase.from('item_cost_history').select('*').eq('item_number', itemNumber).maybeSingle();
            if (existing) {
              const total = (existing.total_entries || 1);
              const newAvg = Math.round(((existing.avg_cost || 0) * total + cost) / (total + 1));
              await supabase.from('item_cost_history').update({
                item_name: name || existing.item_name,
                last_cost: cost, avg_cost: newAvg,
                min_cost: Math.min(existing.min_cost || cost, cost),
                max_cost: Math.max(existing.max_cost || cost, cost),
                total_entries: total + 1,
                updated_at: new Date().toISOString(),
              }).eq('item_number', itemNumber);
            } else {
              await supabase.from('item_cost_history').insert({
                item_number: itemNumber, item_name: name,
                last_cost: cost, avg_cost: cost, min_cost: cost, max_cost: cost, total_entries: 1,
              });
            }
          }
        } catch (_) { /* 記憶寫入失敗不影響主流程 */ }

        // 7. 自動產生應付帳款
        try {
          if (totalAmt > 0 && vendor_id) {
            const qsApNo = `AP-${Date.now().toString(36).toUpperCase()}`;
            const { data: qsVendor } = await supabase.from('erp_vendors').select('payment_days').eq('id', vendor_id).maybeSingle();
            const qsPayDays = qsVendor?.payment_days || 30;
            const qsDueDate = new Date(Date.now() + qsPayDays * 86400000).toISOString().slice(0, 10);
            await supabase.from('erp_vendor_payables').insert({
              payable_no: qsApNo, vendor_id,
              source_type: 'stock_in', source_id: si.id, source_no: siNo,
              payable_date: new Date().toISOString().slice(0, 10), due_date: qsDueDate,
              total_amount: totalAmt, paid_amount: 0, balance: totalAmt,
              payment_status: 'unpaid', created_by: 'admin',
            });
          }
        } catch (_) { /* 應付帳款產生失敗不影響主流程 */ }

        return Response.json({ success: true, stock_in_id: si.id, stock_in_no: siNo, count: itemPayload.length });
      }

      // ══════════════════════════════════════════════════════════════
      //  AI 拍照辨物 — 拍產品照片識別品牌/型號/品名
      // ══════════════════════════════════════════════════════════════
      case 'ai_identify_product': {
        const { image, prompt: userPrompt } = body;
        if (!image) return Response.json({ error: 'image is required' }, { status: 400 });

        const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
        if (!ANTHROPIC_API_KEY) return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });

        try {
          const systemPrompt = `你是一個專業的工具/產品辨識專家。使用者會拍一張產品的照片，你需要盡可能辨識出：
1. brand（品牌名稱）
2. model（型號/料號）
3. description（產品描述/品名）
4. category（產品類別，如：手工具、電動工具、診斷設備、清潔用品等）
5. keywords（搜尋關鍵字陣列，至少 3 個，用於在 ERP 資料庫搜尋）

你特別熟悉這些品牌：Snap-on、Bahco、Blue Point、Bosch、OTC Tools、Muc-Off、GIVI、YAMAHA、WD、Garmin。

請只回傳 JSON 格式，不要其他文字：
{"brand":"...","model":"...","description":"...","category":"...","keywords":["...","..",".."]}

如果看不清或無法辨識，仍盡可能猜測最可能的結果。keywords 要包含品牌、型號的部分字串、產品類型等，方便模糊搜尋。`;

          const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 500,
              messages: [{
                role: 'user',
                content: [
                  { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image.replace(/^data:image\/\w+;base64,/, '') } },
                  { type: 'text', text: userPrompt || '請辨識這個產品的品牌、型號、品名，回傳 JSON。' },
                ],
              }],
              system: systemPrompt,
            }),
          });

          const aiData = await aiRes.json();
          const text = aiData?.content?.[0]?.text || '';

          // 嘗試解析 JSON
          let result = { brand: '', model: '', description: '', category: '', keywords: [] };
          try {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) result = JSON.parse(jsonMatch[0]);
          } catch {
            result.description = text;
            result.keywords = text.split(/[\s,，、]+/).filter(w => w.length >= 2).slice(0, 5);
          }

          // 確保 keywords 是陣列
          if (!Array.isArray(result.keywords)) result.keywords = [];
          // 自動補充品牌和型號到 keywords
          if (result.brand && !result.keywords.includes(result.brand)) result.keywords.unshift(result.brand);
          if (result.model && !result.keywords.includes(result.model)) result.keywords.push(result.model);

          return Response.json({ result });
        } catch (e) {
          return Response.json({ error: 'AI 辨識失敗: ' + (e.message || '') }, { status: 500 });
        }
      }

      // ══════════════════════════════════════════════════════════════
      //  快速進貨 — AI 解析圖片/PDF
      // ══════════════════════════════════════════════════════════════
      case 'parse_receive_image': {
        const { base64, mime, file_hash, file_name } = body;
        if (!base64) return Response.json({ error: 'base64 is required' }, { status: 400 });

        const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
        if (!ANTHROPIC_API_KEY) return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });

        try {
          // ── 1. 快取命中 → 秒回 ──
          if (file_hash) {
            const { data: cached } = await supabase
              .from('receive_parse_cache')
              .select('items')
              .eq('file_hash', file_hash)
              .single();
            if (cached?.items) {
              try { await supabase.rpc('increment_cache_hit', { hash_val: file_hash }); } catch (_) {}
              return Response.json({ items: cached.items, cached: true, method: 'cache' });
            }
          }

          const isPdf = (mime || '').toLowerCase() === 'application/pdf';
          let result = [];
          let method = 'ai-vision';

          // ── 2. PDF → 抽文字 → 用 Haiku 純文字解析（快 5-10 倍）──
          if (isPdf) {
            try {
              const pdfMod = await import('pdf-parse');
              const pdfParse = pdfMod.default || pdfMod;
              const pdfBuffer = Buffer.from(base64, 'base64');
              const pdfData = await pdfParse(pdfBuffer);
              // 確保 pdfData.text 是字串（某些 pdf-parse 版本可能回傳 Buffer 或 undefined）
              const rawText = pdfData?.text;
              const pdfText = (typeof rawText === 'string' ? rawText : String(rawText ?? '')).trim();

              if (pdfText.length > 50) {
                // 有足夠文字 → 用 Haiku 純文字解析（快且便宜）
                method = 'text-haiku';
                const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01',
                  },
                  body: JSON.stringify({
                    model: 'claude-haiku-4-5-20251001',
                    max_tokens: 4000,
                    messages: [{
                      role: 'user',
                      content: `以下是進貨單/送貨單/發票的文字內容，請辨識所有品項。\n回傳 JSON 陣列格式：[{"part_no":"料號","name":"品名","qty":"數量","cost":"單價"}]\n只回傳 JSON，不要其他文字。如果無法辨識任何品項就回傳 []。\n\n---\n${pdfText.slice(0, 8000)}`,
                    }],
                  }),
                });
                const aiData = await aiRes.json();
                if (aiData.error) throw new Error(aiData.error.message || 'Haiku error');
                const text = (aiData.content?.[0]?.text || '[]').replace(/```json|```/g, '').trim();
                result = JSON.parse(text);
                if (!Array.isArray(result)) result = [];
              }
            } catch (pdfErr) {
              // PDF 文字抽取失敗（掃描檔等），fallback 到 vision
              console.log('PDF text extraction failed, falling back to vision:', pdfErr.message);
            }
          }

          // ── 3. 圖片 或 PDF文字抽取失敗 → Vision (Haiku) ──
          if (result.length === 0) {
            method = 'ai-vision';
            const contentBlock = isPdf
              ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
              : { type: 'image', source: { type: 'base64', media_type: mime || 'image/jpeg', data: base64 } };

            const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 4000,
                messages: [{
                  role: 'user',
                  content: [
                    contentBlock,
                    { type: 'text', text: '這是進貨單、送貨單或發票，請辨識所有品項。回傳 JSON 陣列格式：[{"part_no":"料號","name":"品名","qty":"數量","cost":"單價"}]。只回傳 JSON，不要其他文字。如果無法辨識任何品項就回傳 []。' },
                  ],
                }],
              }),
            });
            const aiData = await aiRes.json();
            if (aiData.error) {
              return Response.json({ error: 'AI 解析錯誤: ' + (aiData.error.message || JSON.stringify(aiData.error)) }, { status: 500 });
            }
            const text = (aiData.content?.[0]?.text || '[]').replace(/```json|```/g, '').trim();
            result = JSON.parse(text);
            if (!Array.isArray(result)) result = [];
          }

          // ── 4. 寫入快取 ──
          if (file_hash && result.length > 0) {
            try {
              await supabase.from('receive_parse_cache').upsert({
                file_hash,
                file_name: file_name || null,
                mime_type: mime || null,
                items: result,
                hit_count: 0,
                last_hit_at: null,
              }, { onConflict: 'file_hash' });
            } catch (_) { /* 快取寫入失敗不影響主流程 */ }
          }

          return Response.json({ items: result, cached: false, method });
        } catch (e) {
          return Response.json({ error: '檔案解析失敗: ' + (e.message || '') }, { status: 500 });
        }
      }

      /* ===================== 系統通知 ===================== */
      case 'mark_notifications_read': {
        const { ids } = body; // 可傳 ids 陣列，或不傳表示全部已讀
        let q = supabase.from('erp_notifications').update({ is_read: true });
        if (ids && ids.length) q = q.in('id', ids);
        else q = q.eq('is_read', false);
        const { error } = await q;
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true });
      }

      case 'run_cron_task': {
        // 手動觸發排程任務（後台一鍵執行）
        const { task = 'all' } = body;
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://auto-bot-qb.vercel.app';
        const secret = process.env.CRON_SECRET || '';
        try {
          const res = await fetch(`${baseUrl}/api/cron?task=${task}`, {
            headers: secret ? { Authorization: `Bearer ${secret}` } : {},
          });
          const data = await res.json();
          return Response.json({ ok: true, result: data });
        } catch (e) {
          return Response.json({ error: e.message }, { status: 500 });
        }
      }

      default: {
        // Try Pulse module actions
        const { handlePulsePostAction } = await import('./actions-pulse');
        const pulseResult = await handlePulsePostAction(action, body);
        if (pulseResult) return pulseResult;

        // Try HR module actions
        const { handleHrPostAction } = await import('./actions-hr');
        const hrResult = await handleHrPostAction(action, body);
        if (hrResult) return hrResult;

        // Try Warranty module actions
        const { handleWarrantyPostAction } = await import('./actions-warranty');
        const warrantyResult = await handleWarrantyPostAction(action, body);
        if (warrantyResult) return warrantyResult;
        return Response.json({ error: 'Unknown action' }, { status: 400 });
      }
    }
}
