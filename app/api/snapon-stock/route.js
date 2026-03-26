// app/api/snapon-stock/route.js — Check Snap-on US stock via their internal API
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const itemNumber = searchParams.get('item');

  if (!itemNumber) {
    return Response.json({ error: 'Missing item parameter' }, { status: 400 });
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': `https://shop.snapon.com/product/${itemNumber}`,
    'Origin': 'https://shop.snapon.com',
  };

  try {
    // Step 1: Hit the main page to get session cookies
    const pageRes = await fetch('https://shop.snapon.com/', {
      headers: { ...headers, Accept: 'text/html' },
      redirect: 'follow',
    });
    const cookies = pageRes.headers.getSetCookie?.() || [];
    const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');

    // Step 2: Call Snap-on internal product API
    const apiUrl = `https://shop.snapon.com/api/Product/1?sku=${encodeURIComponent(itemNumber)}`;
    const apiRes = await fetch(apiUrl, {
      headers: { ...headers, Cookie: cookieStr },
    });

    let productData = null;
    let usPrice = null;
    let stockStatus = 'unknown';
    let stockMessage = '';
    let estimatedDate = '';

    if (apiRes.ok) {
      const text = await apiRes.text();
      if (text && text.trim()) {
        try {
          productData = JSON.parse(text);
          // Extract price
          if (productData.price) usPrice = `$${productData.price}`;
          else if (productData.listPrice) usPrice = `$${productData.listPrice}`;

          // Extract stock info
          const avail = productData.availability || productData.stockStatus || productData.inventoryStatus || '';
          const availMsg = productData.availabilityMessage || productData.stockMessage || '';

          if (typeof avail === 'string') {
            const lower = (avail + ' ' + availMsg).toLowerCase();
            if (lower.includes('in stock') || lower.includes('available')) {
              stockStatus = 'in_stock';
              stockMessage = 'In Stock';
            } else if (lower.includes('backorder')) {
              stockStatus = 'backordered';
              stockMessage = availMsg || 'Backordered';
              const etaMatch = (avail + ' ' + availMsg).match(/(\d{4}\/\d{1,2}\/\d{1,2})/);
              if (etaMatch) estimatedDate = etaMatch[1];
            } else if (lower.includes('discontinu')) {
              stockStatus = 'discontinued';
              stockMessage = 'Discontinued';
            }
          }
        } catch (e) { /* not JSON */ }
      }
    }

    // Step 3: If API didn't work, fallback to scraping the HTML page
    if (stockStatus === 'unknown') {
      const htmlUrl = `https://shop.snapon.com/product/${encodeURIComponent(itemNumber)}`;
      const htmlRes = await fetch(htmlUrl, {
        headers: { ...headers, Accept: 'text/html', Cookie: cookieStr },
      });

      if (htmlRes.ok) {
        const html = await htmlRes.text();

        // Try to find stock info in pre-rendered or SSR content
        const stockMatch = html.match(/stock-info[^>]*>([^<]+)</);
        if (stockMatch) {
          const msg = stockMatch[1].trim();
          if (msg.includes('Backordered')) {
            stockStatus = 'backordered';
            const etaMatch = msg.match(/(\d{4}\/\d{1,2}\/\d{1,2})/);
            estimatedDate = etaMatch ? etaMatch[1] : '';
            stockMessage = estimatedDate ? `Backordered - ETA: ${estimatedDate}` : 'Backordered';
          } else if (msg.includes('Discontinued')) {
            stockStatus = 'discontinued';
            stockMessage = 'Discontinued';
          } else if (msg.includes('Out of Stock')) {
            stockStatus = 'out_of_stock';
            stockMessage = 'Out of Stock';
          }
        }

        // Check for price if not found yet
        if (!usPrice) {
          const priceMatch = html.match(/\$[\d,]+\.\d{2}/);
          if (priceMatch) usPrice = priceMatch[0];
        }

        // Check page content for keywords
        if (stockStatus === 'unknown') {
          if (html.includes('ADD TO CART') || html.includes('Add to Cart')) {
            stockStatus = 'in_stock';
            stockMessage = 'Available';
          }
        }
      }
    }

    return Response.json({
      item_number: itemNumber,
      stock_status: stockStatus,
      stock_message: stockMessage,
      estimated_date: estimatedDate,
      us_price: usPrice,
      snap_url: `https://shop.snapon.com/product/${itemNumber}`,
    });
  } catch (err) {
    return Response.json({
      item_number: itemNumber,
      stock_status: 'error',
      stock_message: '查詢失敗',
      snap_url: `https://shop.snapon.com/product/${itemNumber}`,
    });
  }
}
