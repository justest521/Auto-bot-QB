export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + (process.env.DEALER_SALT || 'qb_dealer_2024')).digest('hex');
}

function jsonOk(data) { return Response.json(data); }
function jsonErr(msg, status = 400) { return Response.json({ error: msg }, { status }); }

// ========== Permission config per role ==========
const ROLE_CONFIG = {
  dealer: {
    label: '經銷商',
    price_field: 'tw_reseller_price',
    price_label: '經銷價',
    can_see_cost: false,
    can_see_all_orders: false, // only own company's orders
  },
  sales: {
    label: '業務',
    price_field: 'tw_reseller_price',
    price_label: '經銷價',
    can_see_cost: true,
    can_see_all_orders: false, // only own orders
  },
  technician: {
    label: '維修技師',
    price_field: 'tw_retail_price',
    price_label: '零售價',
    can_see_cost: false,
    can_see_all_orders: false, // only own orders
  },
};

// ========== GET ==========
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || '';
  const token = searchParams.get('token') || '';

  // Actions that don't need auth
  if (action === 'ping') return jsonOk({ ok: true });

  // Auth check
  if (action !== 'login') {
    const user = await getUserFromToken(token);
    if (!user) return jsonErr('未授權，請重新登入', 401);

    switch (action) {
      case 'me':
        return jsonOk({
          user: sanitizeUser(user),
          role_config: ROLE_CONFIG[user.role] || ROLE_CONFIG.dealer,
        });

      case 'products': {
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 100);
        const offset = (page - 1) * limit;
        const q = (searchParams.get('q') || '').trim();
        const category = (searchParams.get('category') || '').trim();
        const stockOnly = searchParams.get('stock_only') === '1';

        let query = supabase
          .from('quickbuy_products')
          .select('*', { count: 'exact' })
          .order('item_number', { ascending: true })
          .range(offset, offset + limit - 1);

        if (q) {
          query = query.or(`item_number.ilike.%${q}%,description.ilike.%${q}%,brand.ilike.%${q}%`);
        }
        if (category && category !== 'all') {
          query = query.eq('category', category);
        }

        const { data, count, error } = await query;
        if (error) return jsonErr(error.message, 500);

        const roleConfig = ROLE_CONFIG[user.role] || ROLE_CONFIG.dealer;
        let rows = (data || []).map((p) => {
          const item = {
            id: p.id,
            item_number: p.item_number,
            description: p.description,
            brand: p.brand,
            category: p.category,
            price: Number(p[roleConfig.price_field] || p.tw_retail_price || 0),
            price_label: roleConfig.price_label,
            stock_qty: user.can_see_stock !== false ? Number(p.stock_qty || 0) : null,
            safety_stock: user.can_see_stock !== false ? Number(p.safety_stock || 0) : null,
            image_url: p.image_url || null,
          };
          if (roleConfig.can_see_cost) {
            item.cost_price = Number(p.cost_price || 0);
            item.reseller_price = Number(p.tw_reseller_price || 0);
            item.retail_price = Number(p.tw_retail_price || 0);
          }
          return item;
        });

        if (stockOnly) {
          rows = rows.filter((r) => r.stock_qty > 0);
        }

        return jsonOk({ products: rows, total: count || 0, page, limit });
      }

      case 'my_orders': {
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 100);
        const offset = (page - 1) * limit;
        const statusFilter = (searchParams.get('status') || '').trim();

        let query = supabase
          .from('erp_orders')
          .select('*', { count: 'exact' })
          .eq('dealer_user_id', user.id)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (statusFilter) query = query.eq('status', statusFilter);

        const { data, count, error } = await query;
        if (error) return jsonErr(error.message, 500);

        // Get order items
        const orderIds = (data || []).map((o) => o.id);
        let itemsMap = {};
        if (orderIds.length) {
          const { data: items } = await supabase
            .from('erp_order_items')
            .select('*')
            .in('order_id', orderIds);
          for (const item of (items || [])) {
            if (!itemsMap[item.order_id]) itemsMap[item.order_id] = [];
            itemsMap[item.order_id].push(item);
          }
        }

        const rows = (data || []).map((o) => ({
          ...o,
          items: itemsMap[o.id] || [],
          status_label: ORDER_STATUS_LABEL[o.status] || o.status,
        }));

        return jsonOk({ orders: rows, total: count || 0, page, limit });
      }

      case 'order_detail': {
        const orderId = searchParams.get('order_id');
        if (!orderId) return jsonErr('order_id required');

        const { data: order, error } = await supabase
          .from('erp_orders')
          .select('*')
          .eq('id', orderId)
          .eq('dealer_user_id', user.id)
          .maybeSingle();

        if (error) return jsonErr(error.message, 500);
        if (!order) return jsonErr('訂單不存在', 404);

        const { data: items } = await supabase
          .from('erp_order_items')
          .select('*')
          .eq('order_id', orderId);

        // Check if there's a linked shipment
        const { data: shipments } = await supabase
          .from('erp_shipments')
          .select('*')
          .eq('order_id', orderId)
          .order('created_at', { ascending: false })
          .limit(1);

        return jsonOk({
          order: { ...order, items: items || [], shipment: (shipments || [])[0] || null },
        });
      }

      default:
        return jsonErr('Unknown action: ' + action);
    }
  }

  return jsonErr('Use POST for login');
}

// ========== POST ==========
export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON'); }
  const { action } = body;

  if (action === 'login') {
    const { username, password } = body;
    if (!username || !password) return jsonErr('請輸入帳號密碼');

    const { data: user, error } = await supabase
      .from('erp_dealer_users')
      .select('*')
      .eq('username', username.trim().toLowerCase())
      .eq('status', 'active')
      .maybeSingle();

    if (error) return jsonErr(error.message, 500);
    if (!user) return jsonErr('帳號不存在或已停用');
    if (user.password_hash !== hashPassword(password)) return jsonErr('密碼錯誤');

    // Update last login
    await supabase.from('erp_dealer_users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);

    // Token = simple signed value (user_id + timestamp + hash)
    const tokenData = `${user.id}|${Date.now()}`;
    const tokenHash = crypto.createHash('sha256').update(tokenData + (process.env.DEALER_SALT || 'qb_dealer_2024')).digest('hex').slice(0, 16);
    const token = Buffer.from(`${tokenData}|${tokenHash}`).toString('base64');

    return jsonOk({
      token,
      user: sanitizeUser(user),
      role_config: ROLE_CONFIG[user.role] || ROLE_CONFIG.dealer,
    });
  }

  // All other actions need auth
  const token = body.token || '';
  const user = await getUserFromToken(token);
  if (!user) return jsonErr('未授權，請重新登入', 401);
  if (!user.can_place_order) return jsonErr('您的帳號沒有下單權限');

  switch (action) {
    case 'place_order': {
      const { items, remark } = body;
      if (!items?.length) return jsonErr('請至少加入一項商品');

      // Validate items exist
      const itemNumbers = items.map((i) => i.item_number).filter(Boolean);
      const { data: products } = await supabase
        .from('quickbuy_products')
        .select('item_number, description, tw_reseller_price, tw_retail_price, cost_price, stock_qty')
        .in('item_number', itemNumbers);

      const productMap = Object.fromEntries((products || []).map((p) => [p.item_number, p]));
      const roleConfig = ROLE_CONFIG[user.role] || ROLE_CONFIG.dealer;

      const orderItems = items.map((i) => {
        const p = productMap[i.item_number];
        if (!p) return null;
        const price = Number(p[roleConfig.price_field] || p.tw_retail_price || 0);
        return {
          item_number_snapshot: p.item_number,
          description_snapshot: p.description || '',
          qty: Math.max(1, Number(i.qty || 1)),
          unit_price: price,
          cost_price_snapshot: Number(p.cost_price || 0),
          line_total: price * Math.max(1, Number(i.qty || 1)),
        };
      }).filter(Boolean);

      if (!orderItems.length) return jsonErr('所有商品料號均無效');

      const subtotal = orderItems.reduce((s, i) => s + i.line_total, 0);
      const taxAmount = Math.round(subtotal * 0.05);
      const totalAmount = subtotal + taxAmount;
      const orderNo = `DO${Date.now()}`;

      const { data: order, error: orderError } = await supabase
        .from('erp_orders')
        .insert({
          order_no: orderNo,
          customer_id: user.linked_customer_id || null,
          dealer_user_id: user.id,
          order_date: new Date().toISOString().slice(0, 10),
          status: 'pending',
          payment_status: 'unpaid',
          shipping_status: 'pending',
          subtotal,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          remark: `[${ROLE_CONFIG[user.role]?.label || user.role}] ${user.display_name}${remark ? ' - ' + remark : ''}`,
          order_source: 'dealer_portal',
        })
        .select()
        .single();

      if (orderError) return jsonErr(orderError.message, 500);

      // Insert order items
      const itemsPayload = orderItems.map((i) => ({ ...i, order_id: order.id }));
      const { error: itemsError } = await supabase.from('erp_order_items').insert(itemsPayload);
      if (itemsError) return jsonErr(itemsError.message, 500);

      return jsonOk({ order: { ...order, items: orderItems }, message: `訂單 ${orderNo} 建立成功` });
    }

    case 'change_password': {
      const { old_password, new_password } = body;
      if (!old_password || !new_password) return jsonErr('請填入舊密碼和新密碼');
      if (new_password.length < 4) return jsonErr('新密碼至少 4 碼');
      if (user.password_hash !== hashPassword(old_password)) return jsonErr('舊密碼錯誤');

      const { error } = await supabase
        .from('erp_dealer_users')
        .update({ password_hash: hashPassword(new_password), updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (error) return jsonErr(error.message, 500);
      return jsonOk({ message: '密碼已更新' });
    }

    default:
      return jsonErr('Unknown action: ' + action);
  }
}

// ========== Helpers ==========
const ORDER_STATUS_LABEL = {
  pending: '待處理',
  confirmed: '已確認',
  purchasing: '採購中',
  partial_arrived: '部分到貨',
  arrived: '已到貨',
  shipped: '已出貨',
  completed: '已完成',
  cancelled: '已取消',
};

async function getUserFromToken(token) {
  if (!token) return null;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split('|');
    if (parts.length < 3) return null;
    const [userId, timestamp, hash] = parts;

    // Verify hash
    const tokenData = `${userId}|${timestamp}`;
    const expectedHash = crypto.createHash('sha256').update(tokenData + (process.env.DEALER_SALT || 'qb_dealer_2024')).digest('hex').slice(0, 16);
    if (hash !== expectedHash) return null;

    // Token expires in 7 days
    if (Date.now() - Number(timestamp) > 7 * 24 * 60 * 60 * 1000) return null;

    const { data } = await supabase
      .from('erp_dealer_users')
      .select('*')
      .eq('id', userId)
      .eq('status', 'active')
      .maybeSingle();

    return data || null;
  } catch {
    return null;
  }
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    role_label: ROLE_CONFIG[user.role]?.label || user.role,
    company_name: user.company_name,
    phone: user.phone,
    email: user.email,
    price_level: user.price_level,
    can_see_stock: user.can_see_stock,
    can_place_order: user.can_place_order,
    notify_on_arrival: user.notify_on_arrival,
  };
}
