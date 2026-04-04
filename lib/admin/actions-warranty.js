// lib/admin/actions-warranty.js — 維修保固模組 GET/POST handlers
import { supabase } from '@/lib/supabase';

/* ==================== GET Actions ==================== */
export async function handleWarrantyGetAction(action, searchParams) {
  switch (action) {

    /* ── 保固政策列表 ── */
    case 'warranty_policies': {
      const brand = searchParams.get('brand') || '';
      const activeOnly = searchParams.get('active_only') !== 'false';
      let q = supabase.from('erp_warranty_policies').select('*').order('brand').order('category');
      if (brand) q = q.eq('brand', brand);
      if (activeOnly) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ rows: data || [] });
    }

    /* ── 保固登錄列表 ── */
    case 'warranty_registrations': {
      const page = parseInt(searchParams.get('page') || '1');
      const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 100);
      const offset = (page - 1) * limit;
      const status = searchParams.get('status') || '';
      const search = (searchParams.get('search') || '').trim();
      const expiring = searchParams.get('expiring') === 'true'; // 即將到期

      let q = supabase.from('erp_warranty_registrations').select('*', { count: 'exact' })
        .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      if (status) q = q.eq('status', status);
      if (search) q = q.or(`registration_no.ilike.%${search}%,customer_name.ilike.%${search}%,product_name.ilike.%${search}%,serial_number.ilike.%${search}%,item_number.ilike.%${search}%`);
      if (expiring) {
        const now = new Date();
        const in30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
        q = q.eq('is_lifetime', false).gte('warranty_end', now.toISOString().slice(0, 10)).lte('warranty_end', in30).eq('status', 'active');
      }

      const { data, count, error } = await q;
      if (error) return Response.json({ error: error.message }, { status: 500 });

      // Summary counts
      const { data: summary } = await supabase.rpc('exec_sql', { sql: `
        SELECT
          count(*) FILTER (WHERE status = 'active') AS active_count,
          count(*) FILTER (WHERE status = 'expired') AS expired_count,
          count(*) FILTER (WHERE is_lifetime = true AND status = 'active') AS lifetime_count,
          count(*) FILTER (WHERE status = 'active' AND is_lifetime = false AND warranty_end <= current_date + interval '30 days' AND warranty_end >= current_date) AS expiring_count
        FROM erp_warranty_registrations
      ` }).catch(() => null);

      return Response.json({ rows: data || [], total: count || 0, summary: summary?.[0] || {} });
    }

    /* ── 維修工單列表 ── */
    case 'repair_orders': {
      const page = parseInt(searchParams.get('page') || '1');
      const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 100);
      const offset = (page - 1) * limit;
      const status = searchParams.get('status') || '';
      const search = (searchParams.get('search') || '').trim();

      let q = supabase.from('erp_repair_orders').select('*', { count: 'exact' })
        .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      if (status) q = q.eq('status', status);
      if (search) q = q.or(`repair_no.ilike.%${search}%,customer_name.ilike.%${search}%,product_name.ilike.%${search}%,serial_number.ilike.%${search}%`);

      const { data, count, error } = await q;
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ rows: data || [], total: count || 0 });
    }

    /* ── 索賠列表 ── */
    case 'warranty_claims': {
      const page = parseInt(searchParams.get('page') || '1');
      const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 100);
      const offset = (page - 1) * limit;
      const status = searchParams.get('status') || '';
      const search = (searchParams.get('search') || '').trim();

      let q = supabase.from('erp_warranty_claims').select('*', { count: 'exact' })
        .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      if (status) q = q.eq('claim_status', status);
      if (search) q = q.or(`claim_no.ilike.%${search}%,customer_name.ilike.%${search}%,product_name.ilike.%${search}%`);

      const { data, count, error } = await q;
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ rows: data || [], total: count || 0 });
    }

    /* ── 保固到期提醒清單 ── */
    case 'warranty_expiring': {
      const days = parseInt(searchParams.get('days') || '30');
      const now = new Date();
      const future = new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10);
      const { data, error } = await supabase.from('erp_warranty_registrations')
        .select('*')
        .eq('status', 'active').eq('is_lifetime', false)
        .gte('warranty_end', now.toISOString().slice(0, 10))
        .lte('warranty_end', future)
        .order('warranty_end', { ascending: true });
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ rows: data || [] });
    }

    default:
      return null;
  }
}

/* ==================== POST Actions ==================== */
export async function handleWarrantyPostAction(action, body) {
  switch (action) {

    /* ── 新增/更新保固政策 ── */
    case 'upsert_warranty_policy': {
      const { id, brand, category, policy_name, warranty_months, is_lifetime, coverage_scope, exclusions, claim_process, is_active } = body;
      if (!brand || !policy_name) return Response.json({ error: '品牌和政策名稱為必填' }, { status: 400 });

      const record = {
        brand, category: category || '', policy_name,
        warranty_months: is_lifetime ? 0 : (parseInt(warranty_months) || 12),
        is_lifetime: !!is_lifetime,
        coverage_scope: coverage_scope || '製造瑕疵',
        exclusions: exclusions || '',
        claim_process: claim_process || '',
        is_active: is_active !== false,
        updated_at: new Date().toISOString(),
      };

      if (id) {
        const { data, error } = await supabase.from('erp_warranty_policies').update(record).eq('id', id).select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true, data, message: '保固政策已更新' });
      } else {
        const { data, error } = await supabase.from('erp_warranty_policies').insert(record).select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true, data, message: '保固政策已新增' });
      }
    }

    /* ── 刪除保固政策 ── */
    case 'delete_warranty_policy': {
      const { id } = body;
      if (!id) return Response.json({ error: 'id 為必填' }, { status: 400 });
      const { error } = await supabase.from('erp_warranty_policies').delete().eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ success: true, message: '已刪除' });
    }

    /* ── 新增保固登錄 ── */
    case 'create_warranty_registration': {
      const { customer_id, customer_name, product_name, item_number, serial_number, brand, category, policy_id, purchase_date, remark, sale_id, order_id } = body;
      if (!product_name || !purchase_date) return Response.json({ error: '產品名稱和購買日期為必填' }, { status: 400 });

      // Look up policy for warranty duration
      let warrantyMonths = 12;
      let isLifetime = false;
      if (policy_id) {
        const { data: pol } = await supabase.from('erp_warranty_policies').select('warranty_months, is_lifetime').eq('id', policy_id).maybeSingle();
        if (pol) { warrantyMonths = pol.warranty_months; isLifetime = pol.is_lifetime; }
      } else if (brand) {
        // Auto-match by brand + category
        let pq = supabase.from('erp_warranty_policies').select('id, warranty_months, is_lifetime').eq('brand', brand).eq('is_active', true);
        if (category) pq = pq.eq('category', category);
        else pq = pq.eq('category', '');
        const { data: pol } = await pq.maybeSingle();
        if (pol) { warrantyMonths = pol.warranty_months; isLifetime = pol.is_lifetime; }
      }

      const startDate = purchase_date;
      const endDate = isLifetime ? null : new Date(new Date(startDate).getTime() + warrantyMonths * 30.44 * 86400000).toISOString().slice(0, 10);
      const regNo = `WR-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;

      const { data, error } = await supabase.from('erp_warranty_registrations').insert({
        registration_no: regNo,
        customer_id: customer_id || null,
        customer_name: customer_name || '',
        product_name, item_number: item_number || null,
        serial_number: serial_number || null,
        brand: brand || null, category: category || null,
        policy_id: policy_id || null,
        purchase_date: startDate,
        warranty_start: startDate,
        warranty_end: endDate,
        is_lifetime: isLifetime,
        sale_id: sale_id || null,
        order_id: order_id || null,
        status: 'active',
        remark: remark || null,
      }).select().single();

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ success: true, data, message: `保固登錄成功 ${regNo}` });
    }

    /* ── 更新保固狀態 ── */
    case 'update_warranty_status': {
      const { id, status } = body;
      if (!id || !status) return Response.json({ error: 'id 和 status 為必填' }, { status: 400 });
      const { error } = await supabase.from('erp_warranty_registrations').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ success: true, message: '狀態已更新' });
    }

    /* ── 建立維修工單 ── */
    case 'create_repair_order': {
      const { warranty_id, customer_id, customer_name, product_name, item_number, serial_number, brand, issue_description, is_warranty, priority, assigned_to, estimated_days, remark } = body;
      if (!product_name || !issue_description) return Response.json({ error: '產品名稱和問題描述為必填' }, { status: 400 });

      const repairNo = `RPR-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
      const { data, error } = await supabase.from('erp_repair_orders').insert({
        repair_no: repairNo,
        warranty_id: warranty_id || null,
        customer_id: customer_id || null,
        customer_name: customer_name || '',
        product_name, item_number: item_number || null,
        serial_number: serial_number || null,
        brand: brand || null,
        issue_description,
        is_warranty: !!is_warranty,
        status: 'pending',
        priority: priority || 'normal',
        assigned_to: assigned_to || null,
        estimated_days: estimated_days ? parseInt(estimated_days) : null,
        remark: remark || null,
      }).select().single();

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ success: true, data, message: `維修工單已建立 ${repairNo}` });
    }

    /* ── 更新維修工單 ── */
    case 'update_repair_order': {
      const { id, status, assigned_to, diagnosis, repair_notes, parts_used, repair_cost, remark } = body;
      if (!id) return Response.json({ error: 'id 為必填' }, { status: 400 });

      const updates = { updated_at: new Date().toISOString() };
      if (status !== undefined) {
        updates.status = status;
        if (status === 'in_progress' && !body.keep_times) updates.started_at = new Date().toISOString();
        if (status === 'completed') updates.completed_at = new Date().toISOString();
        if (status === 'notified') updates.notified_at = new Date().toISOString();
        if (status === 'picked_up') updates.picked_up_at = new Date().toISOString();
      }
      if (assigned_to !== undefined) updates.assigned_to = assigned_to;
      if (diagnosis !== undefined) updates.diagnosis = diagnosis;
      if (repair_notes !== undefined) updates.repair_notes = repair_notes;
      if (parts_used !== undefined) updates.parts_used = parts_used;
      if (repair_cost !== undefined) updates.repair_cost = Number(repair_cost);
      if (remark !== undefined) updates.remark = remark;

      const { data, error } = await supabase.from('erp_repair_orders').update(updates).eq('id', id).select().single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ success: true, data, message: '維修工單已更新' });
    }

    /* ── 建立索賠 ── */
    case 'create_warranty_claim': {
      const { warranty_id, repair_id, customer_id, customer_name, product_name, item_number, serial_number, brand, claim_type, issue_description, vendor_id, vendor_name, claim_amount, remark } = body;
      if (!product_name || !issue_description) return Response.json({ error: '產品名稱和問題描述為必填' }, { status: 400 });

      const claimNo = `CLM-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
      const { data, error } = await supabase.from('erp_warranty_claims').insert({
        claim_no: claimNo,
        warranty_id: warranty_id || null,
        repair_id: repair_id || null,
        customer_id: customer_id || null,
        customer_name: customer_name || '',
        product_name, item_number: item_number || null,
        serial_number: serial_number || null,
        brand: brand || null,
        claim_type: claim_type || 'repair',
        issue_description,
        claim_status: 'pending',
        vendor_id: vendor_id || null,
        vendor_name: vendor_name || '',
        claim_amount: claim_amount ? Number(claim_amount) : 0,
        remark: remark || null,
      }).select().single();

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ success: true, data, message: `索賠已建立 ${claimNo}` });
    }

    /* ── 更新索賠 ── */
    case 'update_warranty_claim': {
      const { id, claim_status, vendor_claim_ref, resolution, replacement_item, replacement_serial, approved_amount, remark } = body;
      if (!id) return Response.json({ error: 'id 為必填' }, { status: 400 });

      const updates = { updated_at: new Date().toISOString() };
      if (claim_status !== undefined) {
        updates.claim_status = claim_status;
        if (claim_status === 'responded') updates.responded_at = new Date().toISOString();
        if (claim_status === 'resolved' || claim_status === 'closed') updates.resolved_at = new Date().toISOString();
      }
      if (vendor_claim_ref !== undefined) updates.vendor_claim_ref = vendor_claim_ref;
      if (resolution !== undefined) updates.resolution = resolution;
      if (replacement_item !== undefined) updates.replacement_item = replacement_item;
      if (replacement_serial !== undefined) updates.replacement_serial = replacement_serial;
      if (approved_amount !== undefined) updates.approved_amount = Number(approved_amount);
      if (remark !== undefined) updates.remark = remark;

      const { data, error } = await supabase.from('erp_warranty_claims').update(updates).eq('id', id).select().single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ success: true, data, message: '索賠已更新' });
    }

    default:
      return null;
  }
}
