import { NextResponse } from 'next/server';
import { createRateLimiter } from '@/lib/security/rate-limit';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'sin1';

const shopLimiter = createRateLimiter({ windowMs: 60_000, max: 30, prefix: 'shop_order' });

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, 255);
}

function sanitizePhone(phone) {
  if (typeof phone !== 'string') return '';
  return phone.trim().slice(0, 20);
}

async function validateProducts(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { valid: false, error: 'No items provided' };
  }

  const productIds = items.map(item => item.product_id);

  try {
    const { data: products, error } = await supabase
      .from('quickbuy_products')
      .select('id,item_number,tw_retail_price,product_status')
      .in('id', productIds);

    if (error) {
      console.error('Product validation error:', error);
      return { valid: false, error: 'Failed to validate products' };
    }

    if (!products || products.length !== productIds.length) {
      return { valid: false, error: 'One or more products not found' };
    }

    // Check that all products are available for sale
    for (const product of products) {
      if (product.product_status !== 'Current' && product.product_status !== 'New Announced') {
        return { valid: false, error: `Product ${product.item_number} is not available for purchase` };
      }
    }

    return { valid: true, products };
  } catch (err) {
    console.error('Product validation exception:', err);
    return { valid: false, error: 'Database error during validation' };
  }
}

export async function POST(request) {
  const rl = shopLimiter(request);
  if (!rl.ok) return rl.response;

  try {
    const body = await request.json();

    // Validate required fields
    if (!body.customer_name) {
      return NextResponse.json({ error: 'customer_name is required' }, { status: 400 });
    }
    if (!body.customer_phone) {
      return NextResponse.json({ error: 'customer_phone is required' }, { status: 400 });
    }

    // Validate items
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'At least one item must be provided' }, { status: 400 });
    }

    // Validate each item has product_id and quantity
    for (const item of body.items) {
      if (!item.product_id || !item.quantity) {
        return NextResponse.json(
          { error: 'Each item must have product_id and quantity' },
          { status: 400 }
        );
      }
      if (typeof item.quantity !== 'number' || item.quantity < 1) {
        return NextResponse.json(
          { error: 'Quantity must be a positive number' },
          { status: 400 }
        );
      }
    }

    // Validate email if provided
    if (body.customer_email && !validateEmail(body.customer_email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Validate products exist and are available
    const validation = await validateProducts(body.items);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Prepare order data
    const orderData = {
      customer_name: sanitizeString(body.customer_name),
      customer_phone: sanitizePhone(body.customer_phone),
      customer_email: body.customer_email ? sanitizeString(body.customer_email) : null,
      customer_line_id: body.customer_line_id ? sanitizeString(body.customer_line_id) : null,
      note: body.note ? sanitizeString(body.note) : null,
      source: 'website',
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    // Check if erp_orders table exists and has required columns
    const { data: checkTable, error: checkError } = await supabase
      .from('erp_orders')
      .select('*')
      .limit(0);

    let inquiry_id;

    if (checkError && checkError.code === 'PGRST116') {
      // Table doesn't exist, create shop_orders as fallback
      console.warn('erp_orders table not found, using shop_orders');

      const { data: order, error: orderError } = await supabase
        .from('shop_orders')
        .insert([orderData])
        .select('id')
        .single();

      if (orderError) {
        console.error('Failed to create order:', orderError);
        return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
      }

      inquiry_id = order.id;

      // Insert order items into shop_order_items
      const items = body.items.map(item => ({
        order_id: inquiry_id,
        product_id: item.product_id,
        quantity: item.quantity,
      }));

      const { error: itemsError } = await supabase
        .from('shop_order_items')
        .insert(items);

      if (itemsError) {
        console.error('Failed to create order items:', itemsError);
        // Order was created but items failed - still return success with warning
        console.warn(`Order ${inquiry_id} created but items insertion failed`);
      }
    } else if (checkError) {
      // Some other error
      console.error('Error checking erp_orders table:', checkError);
      return NextResponse.json({ error: 'Database access error' }, { status: 500 });
    } else {
      // Table exists, use erp_orders
      const { data: order, error: orderError } = await supabase
        .from('erp_orders')
        .insert([orderData])
        .select('id')
        .single();

      if (orderError) {
        console.error('Failed to create order:', orderError);
        return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
      }

      inquiry_id = order.id;

      // Try to insert into erp_order_items
      const items = body.items.map(item => ({
        order_id: inquiry_id,
        product_id: item.product_id,
        quantity: item.quantity,
      }));

      const { error: itemsError } = await supabase
        .from('erp_order_items')
        .insert(items);

      if (itemsError) {
        console.error('Failed to create order items:', itemsError);
        // Order was created but items failed - still return success with warning
        console.warn(`Order ${inquiry_id} created but items insertion failed: ${itemsError.message}`);
      }
    }

    return NextResponse.json(
      {
        success: true,
        inquiry_id: String(inquiry_id),
        message: 'Your inquiry has been received. We will contact you soon.',
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Shop order API error:', err);

    // Handle JSON parsing errors
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// OPTIONS for CORS preflight
export async function OPTIONS(request) {
  return NextResponse.json(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
