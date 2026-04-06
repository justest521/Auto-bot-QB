export const dynamic = 'force-dynamic';
export const preferredRegion = 'sin1';

import { supabase } from '@/lib/supabase';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { publicLimiter, authLimiter } from '@/lib/security/rate-limit';
import { safeSearch, escapePostgrestValue } from '@/lib/security/sanitize';

const DEALER_TOKEN_SECRET = process.env.DEALER_SECRET || process.env.DEALER_SALT || 'qb-dealer-token-secret';

/** Hash password with bcrypt (for new passwords / password changes) */
async function hashPasswordBcrypt(password) {
  return bcrypt.hash(password, 10);
}

/** Verify password: try bcrypt first, fallback to legacy SHA-256 for migration */
async function verifyPassword(password, storedHash) {
  // bcrypt hashes start with $2a$ or $2b$
  if (storedHash.startsWith('$2')) {
    return bcrypt.compare(password, storedHash);
  }
  // Legacy SHA-256 fallback (for existing users not yet migrated)
  const legacyHash = crypto.createHash('sha256').update(password + (DEALER_TOKEN_SECRET)).digest('hex');
  return legacyHash === storedHash;
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
    can_search_customers: true, // 業務可搜尋主系統客戶
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
  const rl = publicLimiter(request);
  if (!rl.ok) return rl.response;

  try {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || '';
  // Prefer header-based token (avoids token appearing in server logs/URLs)
  const token = request.headers.get('x-dealer-token') || searchParams.get('token') || '';

  // Actions that don't need auth
  if (action === 'ping') return jsonOk({ ok: true });

  // Auth check
  if (action !== 'login') {
    const user = await getUserFromToken(token);
    if (!user) return jsonErr('未授權，請重新登入', 401);

    switch (action) {
      case 'me': {
        // Also fetch active announcements for this role
        const { data: anns } = await supabase
          .from('erp_announcements')
          .select('id, title, content, type, priority, target_roles')
          .eq('is_active', true)
          .order('priority', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(20);
        // Filter: show if target_roles is empty (all) or includes user's role
        const myAnns = (anns || []).filter(a => !a.target_roles || a.target_roles.length === 0 || a.target_roles.includes(user.role));
        return jsonOk({
          user: sanitizeUser(user),
          role_config: ROLE_CONFIG[user.role] || ROLE_CONFIG.dealer,
          announcements: myAnns,
        });
      }

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
          const eq = escapePostgrestValue(safeSearch(q));
          query = query.or(`item_number.ilike.%${eq}%,description.ilike.%${eq}%,search_text.ilike.%${eq}%`);
        }
        if (category && category !== 'all') {
          query = query.eq('category', category);
        }

        const { data, count, error } = await query;
        if (error) return jsonErr(error.message, 500);

        const roleConfig = ROLE_CONFIG[user.role] || ROLE_CONFIG.dealer;
        const hasPersonalDiscount = user.discount_rate != null && user.discount_rate > 0;
        let rows = (data || []).map((p) => {
          const retailPrice = Number(p.tw_retail_price || 0);
          const basePrice = hasPersonalDiscount
            ? Math.round(retailPrice * user.discount_rate)
            : Number(p[roleConfig.price_field] || retailPrice);
          const item = {
            id: p.id,
            item_number: p.item_number,
            description: p.description,
            category: p.category,
            origin_country: p.origin_country || null,
            image_url: p.image_url || null,
            price: basePrice,
            price_label: hasPersonalDiscount ? `${Math.round(user.discount_rate * 100)}折價` : roleConfig.price_label,
            retail_price: retailPrice,  // 建議售價：所有角色皆可查看
            stock_qty: user.can_see_stock !== false ? Number(p.stock_qty || 0) : null,
            safety_stock: user.can_see_stock !== false ? Number(p.safety_stock || 0) : null,
          };
          if (roleConfig.can_see_cost) {
            item.us_price = Number(p.us_price || 0);
            item.reseller_price = Number(p.tw_reseller_price || 0);
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

      case 'my_arrivals': {
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 100);
        const offset = (page - 1) * limit;

        let query = supabase
          .from('erp_orders')
          .select('*', { count: 'exact' })
          .eq('dealer_user_id', user.id)
          .in('status', ['arrived', 'partial_arrived', 'shipped'])
          .order('updated_at', { ascending: false })
          .range(offset, offset + limit - 1);

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

        return jsonOk({ arrivals: rows, total: count || 0, page, limit });
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

      case 'my_performance': {
        const range = searchParams.get('range') || 'month'; // month | quarter | year
        const now = new Date();
        let dateFrom;
        if (range === 'year') {
          dateFrom = `${now.getFullYear()}-01-01`;
        } else if (range === 'quarter') {
          const qm = Math.floor(now.getMonth() / 3) * 3;
          dateFrom = `${now.getFullYear()}-${String(qm + 1).padStart(2, '0')}-01`;
        } else {
          dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        }

        // Get all orders in range
        const { data: orders } = await supabase
          .from('erp_orders')
          .select('id, order_no, order_date, status, total_amount, subtotal, created_at')
          .eq('dealer_user_id', user.id)
          .gte('order_date', dateFrom)
          .order('created_at', { ascending: false });

        const allOrders = orders || [];
        const activeOrders = allOrders.filter(o => o.status !== 'cancelled');
        const totalAmount = activeOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
        const totalOrders = activeOrders.length;
        const avgOrderAmount = totalOrders > 0 ? Math.round(totalAmount / totalOrders) : 0;

        // Status breakdown
        const statusBreakdown = {};
        for (const o of allOrders) {
          const label = ORDER_STATUS_LABEL[o.status] || o.status;
          if (!statusBreakdown[o.status]) statusBreakdown[o.status] = { label, count: 0, amount: 0 };
          statusBreakdown[o.status].count++;
          statusBreakdown[o.status].amount += Number(o.total_amount || 0);
        }

        // Get top products from order items
        const orderIds = activeOrders.map(o => o.id);
        let topProducts = [];
        if (orderIds.length) {
          const { data: items } = await supabase
            .from('erp_order_items')
            .select('item_number_snapshot, description_snapshot, qty, line_total')
            .in('order_id', orderIds);
          const prodMap = {};
          for (const it of (items || [])) {
            const k = it.item_number_snapshot;
            if (!prodMap[k]) prodMap[k] = { item_number: k, description: it.description_snapshot, total_qty: 0, total_amount: 0 };
            prodMap[k].total_qty += Number(it.qty || 0);
            prodMap[k].total_amount += Number(it.line_total || 0);
          }
          topProducts = Object.values(prodMap).sort((a, b) => b.total_amount - a.total_amount).slice(0, 10);
        }

        // Monthly trend (last 6 months)
        const monthlyTrend = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const mOrders = (orders || []).filter(o => o.status !== 'cancelled' && (o.order_date || '').startsWith(mKey));
          monthlyTrend.push({ month: mKey, orders: mOrders.length, amount: mOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0) });
        }

        return jsonOk({
          range,
          date_from: dateFrom,
          total_amount: totalAmount,
          total_orders: totalOrders,
          avg_order_amount: avgOrderAmount,
          status_breakdown: Object.values(statusBreakdown),
          top_products: topProducts,
          monthly_trend: monthlyTrend,
        });
      }

      case 'my_notifications': {
        // Derive notifications from recent order status changes
        const { data: recentOrders } = await supabase
          .from('erp_orders')
          .select('id, order_no, status, updated_at, total_amount')
          .eq('dealer_user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(30);

        const notifications = (recentOrders || []).map(o => {
          let type = 'info';
          let message = '';
          const label = ORDER_STATUS_LABEL[o.status] || o.status;
          if (o.status === 'arrived' || o.status === 'partial_arrived') {
            type = 'arrival';
            message = `訂單 ${o.order_no} ${label}`;
          } else if (o.status === 'shipped') {
            type = 'shipped';
            message = `訂單 ${o.order_no} 已出貨`;
          } else if (o.status === 'confirmed') {
            type = 'confirmed';
            message = `訂單 ${o.order_no} 已確認`;
          } else if (o.status === 'purchasing') {
            type = 'purchasing';
            message = `訂單 ${o.order_no} 採購中`;
          } else if (o.status === 'completed') {
            type = 'completed';
            message = `訂單 ${o.order_no} 已完成`;
          } else if (o.status === 'cancelled') {
            type = 'cancelled';
            message = `訂單 ${o.order_no} 已取消`;
          } else {
            message = `訂單 ${o.order_no} 狀態：${label}`;
          }
          return {
            id: o.id,
            type,
            message,
            order_no: o.order_no,
            status: o.status,
            amount: Number(o.total_amount || 0),
            time: o.updated_at,
          };
        });

        // Count unread-like: orders updated in last 3 days that aren't pending
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        const newCount = notifications.filter(n => n.time > threeDaysAgo && n.type !== 'info').length;

        return jsonOk({ notifications, new_count: newCount });
      }

      case 'prospects': {
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
        const offset = (page - 1) * limit;
        const statusF = (searchParams.get('status') || '').trim();
        const categoryF = (searchParams.get('category') || '').trim();
        const cityF = (searchParams.get('city') || '').trim();
        const q = (searchParams.get('q') || '').trim();

        let query = supabase
          .from('erp_prospects')
          .select('*, creator:created_by(display_name), assignee:assigned_to(display_name)', { count: 'exact' })
          .order('updated_at', { ascending: false })
          .range(offset, offset + limit - 1);

        // Dealer sees all (company-wide), sales/technician sees own
        if (user.role !== 'dealer') {
          query = query.or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`);
        }

        if (statusF) query = query.eq('status', statusF);
        if (categoryF) query = query.eq('category', categoryF);
        if (cityF) query = query.eq('city', cityF);
        if (q) {
          const eq = escapePostgrestValue(safeSearch(q));
          query = query.or(`shop_name.ilike.%${eq}%,contact_person.ilike.%${eq}%,address.ilike.%${eq}%,phone.ilike.%${eq}%`);
        }

        const { data, count, error } = await query;
        if (error) return jsonErr(error.message, 500);
        return jsonOk({ prospects: data || [], total: count || 0, page, limit });
      }

      case 'prospect_detail': {
        const pid = searchParams.get('id');
        if (!pid) return jsonErr('id required');

        const { data: prospect, error } = await supabase
          .from('erp_prospects')
          .select('*, creator:created_by(display_name), assignee:assigned_to(display_name)')
          .eq('id', pid)
          .maybeSingle();
        if (error) return jsonErr(error.message, 500);
        if (!prospect) return jsonErr('不存在', 404);

        const { data: visits } = await supabase
          .from('erp_prospect_visits')
          .select('*, visitor:visited_by(display_name)')
          .eq('prospect_id', pid)
          .order('visit_date', { ascending: false })
          .limit(50);

        return jsonOk({ prospect, visits: visits || [] });
      }

      case 'prospect_stats': {
        let statsQuery = supabase
          .from('erp_prospects')
          .select('status, category');
        if (user.role !== 'dealer') {
          statsQuery = statsQuery.or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`);
        }
        const { data, error } = await statsQuery;
        if (error) return jsonErr(error.message, 500);

        const stats = { total: 0, by_status: {}, by_category: {} };
        for (const r of (data || [])) {
          stats.total++;
          stats.by_status[r.status] = (stats.by_status[r.status] || 0) + 1;
          stats.by_category[r.category] = (stats.by_category[r.category] || 0) + 1;
        }
        return jsonOk({ stats });
      }

      case 'smart_route': {
        const today = new Date().toISOString().slice(0, 10);
        const dayOfWeek = new Date().getDay();
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const weekStartStr = weekStart.toISOString().slice(0, 10);
        const weekEndStr = weekEnd.toISOString().slice(0, 10);

        const suggestions = [];
        const salesName = user.display_name || '';

        // ====== PART A: ERP 正式客戶 (from erp_customers + erp_profit_analysis) ======
        // 1. Get this user's customers from erp_customers
        let custQuery = supabase
          .from('erp_customers')
          .select('id, company_name, name, phone, address, sales_person, customer_stage, status')
          .not('status', 'eq', 'inactive');
        // Match by sales_person = display_name, or for dealer role show all
        if (user.role !== 'dealer' && salesName) {
          custQuery = custQuery.eq('sales_person', salesName);
        }
        const { data: myCusts } = await custQuery;
        const customers = myCusts || [];

        // 2. Get last transaction date + total for each customer from profit_analysis
        let txQuery = supabase
          .from('erp_profit_analysis')
          .select('customer_name, doc_date, amount');
        if (user.role !== 'dealer' && salesName) {
          txQuery = txQuery.eq('sales_name', salesName);
        }
        const { data: txns } = await txQuery;

        // Build customer transaction summary: last purchase date, total amount, purchase count
        const txMap = {};
        for (const tx of (txns || [])) {
          const cn = tx.customer_name;
          if (!cn) continue;
          if (!txMap[cn]) txMap[cn] = { last_date: null, total: 0, count: 0 };
          txMap[cn].count++;
          txMap[cn].total += Number(tx.amount || 0);
          if (!txMap[cn].last_date || tx.doc_date > txMap[cn].last_date) {
            txMap[cn].last_date = tx.doc_date;
          }
        }

        // 3. Score each customer
        for (const c of customers) {
          const cName = c.company_name || c.name || '';
          const tx = txMap[cName] || null;
          const daysSincePurchase = tx?.last_date
            ? Math.floor((Date.now() - new Date(tx.last_date).getTime()) / 86400000)
            : 9999;
          let priority = 0;
          const reasons = [];

          // High churn risk: 60-180 days no purchase (and has history)
          if (tx && daysSincePurchase >= 60 && daysSincePurchase <= 180) {
            priority += 90;
            reasons.push(`🔴 ${daysSincePurchase} 天未下單`);
            if (tx.count >= 3) reasons.push(`歷史 ${tx.count} 筆`);
          }
          // Critical churn: 180+ days
          else if (tx && daysSincePurchase > 180) {
            priority += 60;
            reasons.push(`⚫ ${daysSincePurchase} 天未下單`);
          }
          // Active but approaching revisit window: 30-60 days
          else if (tx && daysSincePurchase >= 30 && daysSincePurchase < 60) {
            priority += 50;
            reasons.push(`🟡 ${daysSincePurchase} 天未下單`);
          }
          // Recently active (< 30 days) — low priority but show if big customer
          else if (tx && daysSincePurchase < 30 && tx.total >= 100000) {
            priority += 10;
            reasons.push('活躍大客戶');
          }
          // Has customer record but never purchased
          else if (!tx) {
            priority += 25;
            reasons.push('有資料未交易');
          }

          if (priority > 0) {
            // Parse city from address
            let city = '';
            let district = '';
            const addr = c.address || '';
            const addrMatch = addr.match(/^(.{2,3}[縣市])(.{2,3}[區鄉鎮市])?/);
            if (addrMatch) { city = addrMatch[1] || ''; district = addrMatch[2] || ''; }

            suggestions.push({
              id: c.id,
              type: 'customer',
              shop_name: cName,
              category: 'customer',
              city, district,
              address: addr,
              phone: c.phone || '',
              contact_person: c.name || '',
              status: daysSincePurchase <= 30 ? 'active' : daysSincePurchase <= 60 ? 'watch' : daysSincePurchase <= 180 ? 'churn_risk' : 'churn',
              visit_count: tx?.count || 0,
              last_visit_date: tx?.last_date || null,
              next_visit_date: null,
              priority,
              reasons,
              days_since_visit: daysSincePurchase,
              total_amount: tx?.total || 0,
              tx_count: tx?.count || 0,
            });
          }
        }

        // ====== PART B: 開發名單 (erp_prospects) — existing logic ======
        let pQuery = supabase
          .from('erp_prospects')
          .select('id, shop_name, category, city, district, address, phone, contact_person, status, visit_count, last_visit_date, next_visit_date, notes, updated_at')
          .not('status', 'in', '("converted","rejected")');
        if (user.role !== 'dealer') {
          pQuery = pQuery.or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`);
        }
        const { data: allP } = await pQuery;

        for (const p of (allP || [])) {
          let priority = 0;
          const reasons = [];
          const daysSinceVisit = p.last_visit_date ? Math.floor((Date.now() - new Date(p.last_visit_date).getTime()) / 86400000) : 999;

          if (p.next_visit_date && p.next_visit_date <= today) {
            priority += 100;
            reasons.push(p.next_visit_date === today ? '今日預約' : `逾期 ${Math.floor((Date.now() - new Date(p.next_visit_date).getTime()) / 86400000)} 天`);
          } else if (p.next_visit_date && p.next_visit_date >= weekStartStr && p.next_visit_date <= weekEndStr) {
            priority += 70;
            reasons.push(`本週預約 (${p.next_visit_date.slice(5)})`);
          }
          if (p.status === 'interested') { priority += 40; if (daysSinceVisit > 7) reasons.push('有意願，需跟進'); }
          if (p.status === 'new' && p.visit_count === 0) { priority += 30; reasons.push('新名單，未拜訪'); }
          if ((p.status === 'contacted' || p.status === 'visited') && daysSinceVisit > 14) { priority += 20; reasons.push(`${daysSinceVisit} 天未訪`); }
          if (p.status === 'contacted' && p.visit_count <= 1 && daysSinceVisit > 7) { priority += 15; reasons.push('已聯繫未跟進'); }

          if (priority > 0) {
            suggestions.push({ ...p, type: 'prospect', priority, reasons, days_since_visit: daysSinceVisit, total_amount: 0, tx_count: 0 });
          }
        }

        // ====== Merge, sort, split ======
        suggestions.sort((a, b) => b.priority - a.priority);

        const todayList = suggestions.filter(s =>
          s.priority >= 70 || (s.next_visit_date && s.next_visit_date <= today)
        ).slice(0, 10);

        const weekList = suggestions.filter(s =>
          !todayList.find(t => t.id === s.id)
        ).slice(0, 20);

        // Area clustering
        const cityGroups = {};
        for (const s of [...todayList, ...weekList]) {
          const area = (s.city || '') + (s.district || '');
          if (!cityGroups[area]) cityGroups[area] = { area: area || '未分區', count: 0, shops: [] };
          cityGroups[area].count++;
          cityGroups[area].shops.push(s.shop_name);
        }

        // Separate counts
        const allCustomerSuggestions = suggestions.filter(s => s.type === 'customer');
        const allProspectSuggestions = suggestions.filter(s => s.type === 'prospect');

        return jsonOk({
          today: todayList,
          week: weekList,
          area_clusters: Object.values(cityGroups).sort((a, b) => b.count - a.count),
          summary: {
            total_suggestions: suggestions.length,
            customers_total: allCustomerSuggestions.length,
            churn_risk: allCustomerSuggestions.filter(s => s.status === 'churn_risk').length,
            churn_critical: allCustomerSuggestions.filter(s => s.status === 'churn').length,
            watch: allCustomerSuggestions.filter(s => s.status === 'watch').length,
            active_big: allCustomerSuggestions.filter(s => s.status === 'active').length,
            prospects_total: allProspectSuggestions.length,
            overdue: allProspectSuggestions.filter(s => s.next_visit_date && s.next_visit_date < today).length,
            new_unvisited: allProspectSuggestions.filter(s => s.status === 'new' && s.visit_count === 0).length,
          },
          week_range: { start: weekStartStr, end: weekEndStr },
        });
      }

      case 'search_customers': {
        // 業務專用：搜尋主系統客戶
        if (!ROLE_CONFIG[user.role]?.can_search_customers) return jsonErr('無權限搜尋客戶', 403);
        const q = (searchParams.get('q') || '').trim();
        if (q.length < 1) return jsonOk({ customers: [] });
        const eq = escapePostgrestValue(safeSearch(q));
        const { data, error } = await supabase
          .from('erp_customers')
          .select('id, name, company_name, phone, address')
          .or(`name.ilike.%${eq}%,company_name.ilike.%${eq}%,phone.ilike.%${eq}%`)
          .not('status', 'eq', 'inactive')
          .order('company_name', { ascending: true })
          .limit(10);
        if (error) return jsonErr(error.message, 500);
        return jsonOk({ customers: data || [] });
      }

      default:
        return jsonErr('Unknown action: ' + action);
    }
  }

  return jsonErr('Use POST for login');
  } catch (err) {
    console.error('[dealer GET error]', err);
    return jsonErr('Server error: ' + (err.message || 'unknown'), 500);
  }
}

// ========== POST ==========
export async function POST(request) {
  const rl = publicLimiter(request);
  if (!rl.ok) return rl.response;

  try {
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
    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) return jsonErr('密碼錯誤');

    // Auto-migrate legacy SHA-256 hash to bcrypt on successful login
    if (!user.password_hash.startsWith('$2')) {
      const newHash = await hashPasswordBcrypt(password);
      await supabase.from('erp_dealer_users').update({ password_hash: newHash }).eq('id', user.id);
    }

    // Update last login
    await supabase.from('erp_dealer_users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);

    // Token = simple signed value (user_id + timestamp + hash)
    const tokenData = `${user.id}|${Date.now()}`;
    const tokenHash = crypto.createHash('sha256').update(tokenData + (DEALER_TOKEN_SECRET)).digest('hex').slice(0, 16);
    const token = Buffer.from(`${tokenData}|${tokenHash}`).toString('base64');

    return jsonOk({
      token,
      user: sanitizeUser(user),
      role_config: ROLE_CONFIG[user.role] || ROLE_CONFIG.dealer,
    });
  }

  // All other actions need auth
  // Prefer header-based token (avoids token in body logs)
  const token = request.headers.get('x-dealer-token') || body.token || '';
  const user = await getUserFromToken(token);
  if (!user) return jsonErr('未授權，請重新登入', 401);

  switch (action) {
    case 'place_order': {
      if (!user.can_place_order) return jsonErr('您的帳號沒有下單權限');
      const { items, remark, customer_name } = body;
      if (!items?.length) return jsonErr('請至少加入一項商品');

      // Validate items exist
      const itemNumbers = items.map((i) => i.item_number).filter(Boolean);
      const { data: products } = await supabase
        .from('quickbuy_products')
        .select('item_number, description, tw_reseller_price, tw_retail_price, us_price, stock_qty')
        .in('item_number', itemNumbers);

      const productMap = Object.fromEntries((products || []).map((p) => [p.item_number, p]));
      const roleConfig = ROLE_CONFIG[user.role] || ROLE_CONFIG.dealer;
      const hasPersonalDiscount = user.discount_rate != null && user.discount_rate > 0;

      // Build order items, preserving is_preorder flag in po_ref
      const orderItems = items.map((i) => {
        const p = productMap[i.item_number];
        if (!p) return null;
        const retailPrice = Number(p.tw_retail_price || 0);
        const price = hasPersonalDiscount
          ? Math.round(retailPrice * user.discount_rate)
          : Number(p[roleConfig.price_field] || retailPrice);
        return {
          item_number_snapshot: p.item_number,
          description_snapshot: p.description || '',
          qty: Math.max(1, Number(i.qty || 1)),
          unit_price: price,
          cost_price_snapshot: Number(p.us_price || 0),
          line_total: price * Math.max(1, Number(i.qty || 1)),
          ...(i.is_preorder ? { po_ref: '[PREORDER]' } : {}),
        };
      }).filter(Boolean);

      if (!orderItems.length) return jsonErr('所有商品料號均無效');

      const subtotal = orderItems.reduce((s, i) => s + i.line_total, 0);
      const taxAmount = Math.round(subtotal * 0.05);
      const totalAmount = subtotal + taxAmount;
      const orderNo = `DO${Date.now()}`;

      // Build remark: role, dealer name, end-customer, pre-order note
      const preorderItems = items.filter(i => i.is_preorder);
      const preorderNote = preorderItems.length > 0
        ? `【預定：${preorderItems.map(i => i.item_number).join('、')}】`
        : '';
      const customerNote = customer_name ? `銷售對象：${customer_name}` : '';
      const remarkParts = [
        `[${ROLE_CONFIG[user.role]?.label || user.role}] ${user.display_name}`,
        customerNote,
        remark,
        preorderNote,
      ].filter(Boolean);

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
          remark: remarkParts.join(' · '),
          order_source: 'dealer_portal',
        })
        .select()
        .single();

      if (orderError) return jsonErr(orderError.message, 500);

      // Insert order items
      const itemsPayload = orderItems.map((i) => ({ ...i, order_id: order.id }));
      const { error: itemsError } = await supabase.from('erp_order_items').insert(itemsPayload);
      if (itemsError) return jsonErr(itemsError.message, 500);

      return jsonOk({ success: true, order: { ...order, items: orderItems }, message: `訂單 ${orderNo} 建立成功` });
    }

    case 'create_customer': {
      // 業務專用：在主系統新增客戶並同步
      if (!ROLE_CONFIG[user.role]?.can_search_customers) return jsonErr('無權限新增客戶', 403);
      const { name, phone, address } = body;
      if (!name?.trim()) return jsonErr('客戶名稱必填');
      // Check for duplicate
      const { data: existing } = await supabase
        .from('erp_customers')
        .select('id, name, company_name')
        .or(`name.eq.${name.trim()},company_name.eq.${name.trim()}`)
        .limit(1)
        .maybeSingle();
      if (existing) return jsonOk({ customer: existing, created: false, message: '客戶已存在' });
      const { data: cust, error } = await supabase
        .from('erp_customers')
        .insert({
          name: name.trim(),
          company_name: name.trim(),
          phone: phone?.trim() || null,
          address: address?.trim() || null,
          status: 'active',
          customer_stage: 'customer',
          source: 'dealer_portal',
          sales_person: user.display_name,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) return jsonErr(error.message, 500);
      return jsonOk({ customer: cust, created: true });
    }

    case 'notify_customer_arrival': {
      const { order_id } = body;
      if (!order_id) return jsonErr('order_id required');

      // Verify the order belongs to current dealer user
      const { data: order, error: orderError } = await supabase
        .from('erp_orders')
        .select('*')
        .eq('id', order_id)
        .eq('dealer_user_id', user.id)
        .maybeSingle();

      if (orderError) return jsonErr(orderError.message, 500);
      if (!order) return jsonErr('訂單不存在或無權限', 404);

      // Update order: set customer_notified = true, customer_notified_at = now
      const { error: updateError } = await supabase
        .from('erp_orders')
        .update({
          customer_notified: true,
          customer_notified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', order_id);

      if (updateError) return jsonErr(updateError.message, 500);

      return jsonOk({ ok: true, message: '已通知客戶' });
    }

    case 'confirm_pickup': {
      const { order_id } = body;
      if (!order_id) return jsonErr('order_id required');

      // Verify the order belongs to current dealer user
      const { data: order, error: orderError } = await supabase
        .from('erp_orders')
        .select('*')
        .eq('id', order_id)
        .eq('dealer_user_id', user.id)
        .maybeSingle();

      if (orderError) return jsonErr(orderError.message, 500);
      if (!order) return jsonErr('訂單不存在或無權限', 404);

      // Update order: set status = 'completed', completed_at = now
      const { error: updateError } = await supabase
        .from('erp_orders')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', order_id);

      if (updateError) return jsonErr(updateError.message, 500);

      return jsonOk({ ok: true, message: '已確認取貨' });
    }

    case 'update_profile': {
      const allowedFields = ['display_name', 'phone', 'email', 'company_name'];
      const updates = {};
      for (const f of allowedFields) {
        if (body[f] !== undefined && body[f] !== null) updates[f] = String(body[f]).trim();
      }
      if (Object.keys(updates).length === 0) return jsonErr('沒有可更新的欄位');
      updates.updated_at = new Date().toISOString();

      const { error } = await supabase.from('erp_dealer_users').update(updates).eq('id', user.id);
      if (error) return jsonErr(error.message, 500);
      const { data: updated } = await supabase.from('erp_dealer_users').select('*').eq('id', user.id).maybeSingle();
      return jsonOk({ user: sanitizeUser(updated || user), message: '資料已更新' });
    }

    case 'change_password': {
      const { old_password, new_password } = body;
      if (!old_password || !new_password) return jsonErr('請填入舊密碼和新密碼');
      if (new_password.length < 4) return jsonErr('新密碼至少 4 碼');
      const oldValid = await verifyPassword(old_password, user.password_hash);
      if (!oldValid) return jsonErr('舊密碼錯誤');

      const newHash = await hashPasswordBcrypt(new_password);
      const { error } = await supabase
        .from('erp_dealer_users')
        .update({ password_hash: newHash, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (error) return jsonErr(error.message, 500);
      return jsonOk({ message: '密碼已更新' });
    }

    case 'create_prospect': {
      const { shop_name, category, address, city, district, phone, contact_person, notes, source, latitude, longitude } = body;
      if (!shop_name) return jsonErr('請輸入店家名稱');

      // Check duplicate by shop_name
      const { data: existing } = await supabase
        .from('erp_prospects')
        .select('id, shop_name, status')
        .ilike('shop_name', shop_name.trim())
        .limit(1);
      if (existing?.length) return jsonErr(`已有相同名稱的店家：${existing[0].shop_name}（狀態：${PROSPECT_STATUS_LABEL[existing[0].status] || existing[0].status}）`);

      // Also check against existing customers
      const { data: existCust } = await supabase
        .from('erp_customers')
        .select('id, company_name, name')
        .or(`company_name.ilike.%${escapePostgrestValue(shop_name.trim())}%,name.ilike.%${escapePostgrestValue(shop_name.trim())}%`)
        .limit(3);

      let warn = null;
      if (existCust?.length) {
        warn = `注意：已有相似的正式客戶 - ${existCust.map(c => c.company_name || c.name).join('、')}`;
      }

      const { data: prospect, error } = await supabase
        .from('erp_prospects')
        .insert({
          shop_name: shop_name.trim(),
          category: category || 'motorcycle',
          address: address || null,
          city: city || null,
          district: district || null,
          phone: phone || null,
          contact_person: contact_person || null,
          notes: notes || null,
          source: source || 'manual',
          latitude: latitude || null,
          longitude: longitude || null,
          created_by: user.id,
          assigned_to: user.id,
        })
        .select()
        .single();

      if (error) return jsonErr(error.message, 500);
      return jsonOk({ prospect, message: '店家已新增', warning: warn });
    }

    case 'update_prospect': {
      const { id, ...fields } = body;
      if (!id) return jsonErr('id required');

      const allowed = ['shop_name', 'category', 'address', 'city', 'district', 'phone', 'contact_person', 'status', 'notes', 'next_visit_date', 'latitude', 'longitude'];
      const updates = {};
      for (const f of allowed) {
        if (fields[f] !== undefined) updates[f] = fields[f];
      }
      updates.updated_at = new Date().toISOString();

      const { error } = await supabase.from('erp_prospects').update(updates).eq('id', id);
      if (error) return jsonErr(error.message, 500);
      return jsonOk({ message: '已更新' });
    }

    case 'add_visit': {
      const { prospect_id, visit_date, result, notes: visitNotes } = body;
      if (!prospect_id) return jsonErr('prospect_id required');

      const { data: visit, error } = await supabase
        .from('erp_prospect_visits')
        .insert({
          prospect_id,
          visited_by: user.id,
          visit_date: visit_date || new Date().toISOString().slice(0, 10),
          result: result || 'talked',
          notes: visitNotes || null,
        })
        .select()
        .single();

      if (error) return jsonErr(error.message, 500);

      // Update prospect visit count and last_visit_date
      const { data: prospect } = await supabase.from('erp_prospects').select('visit_count').eq('id', prospect_id).maybeSingle();
      await supabase.from('erp_prospects').update({
        visit_count: (prospect?.visit_count || 0) + 1,
        last_visit_date: visit_date || new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      }).eq('id', prospect_id);

      return jsonOk({ visit, message: '拜訪記錄已新增' });
    }

    case 'delete_prospect': {
      const { id: delId } = body;
      if (!delId) return jsonErr('id required');
      const { error } = await supabase.from('erp_prospects').delete().eq('id', delId).eq('created_by', user.id);
      if (error) return jsonErr(error.message, 500);
      return jsonOk({ message: '已刪除' });
    }

    default:
      return jsonErr('Unknown action: ' + action);
  }
  } catch (err) {
    console.error('[dealer POST error]', err);
    return jsonErr('Server error: ' + (err.message || 'unknown'), 500);
  }
}

// ========== Helpers ==========
const PROSPECT_STATUS_LABEL = {
  new: '新名單',
  contacted: '已聯繫',
  visited: '已拜訪',
  interested: '有意願',
  rejected: '無意願',
  converted: '已轉客戶',
};

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
    const expectedHash = crypto.createHash('sha256').update(tokenData + (DEALER_TOKEN_SECRET)).digest('hex').slice(0, 16);
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
    line_user_id: user.line_user_id || null,
    linked_customer_id: user.linked_customer_id || null,
    last_login_at: user.last_login_at || null,
    created_at: user.created_at || null,
  };
}
