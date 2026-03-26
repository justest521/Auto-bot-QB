# Shop API Quick Start Guide

## Files Created

Three production-ready API endpoints have been added to your Next.js 14 project:

```
/app/api/shop/products/route.js      (127 lines)
/app/api/shop/categories/route.js    (183 lines)
/app/api/shop/order/route.js         (240 lines)
```

## Endpoint URLs

```
GET  /api/shop/products   - List products with search and filtering
GET  /api/shop/categories - Get all product categories (cached 5min)
POST /api/shop/order      - Create customer order inquiry
```

## Quick Examples

### 1. Search Products
```bash
curl "http://localhost:3000/api/shop/products?q=wrench&page=1&limit=24"
```

**Response:**
```json
{
  "products": [{"id": 1, "item_number": "ABC-001", "tw_retail_price": 299.99, ...}],
  "total": 542,
  "page": 1,
  "totalPages": 23,
  "limit": 24
}
```

### 2. Filter by Brand
```bash
curl "http://localhost:3000/api/shop/products?brand=Snap-on&limit=10"
```

### 3. Get Categories
```bash
curl "http://localhost:3000/api/shop/categories"
```

**Response:**
```json
{
  "brands": [
    {
      "name": "Snap-on",
      "slug": "snapon",
      "categories": [{"name": "Snap-on 扳手系列", "slug": "snapon-", "count": 24}]
    }
  ],
  "totalProducts": 106917
}
```

### 4. Create Order
```bash
curl -X POST "http://localhost:3000/api/shop/order" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "John Doe",
    "customer_phone": "0912-345-678",
    "customer_email": "john@example.com",
    "items": [
      {"product_id": 123, "quantity": 2}
    ],
    "note": "Call before 3pm"
  }'
```

**Response:**
```json
{
  "success": true,
  "inquiry_id": "12345",
  "message": "Your inquiry has been received. We will contact you soon."
}
```

## Key Features

### /api/shop/products
- ✓ Search by item_number or description (`q` parameter)
- ✓ Filter by category or brand
- ✓ Sort by price or date (price_asc, price_desc, newest)
- ✓ Pagination (page, limit)
- ✓ Hides dealer pricing (tw_reseller_price, us_price)
- ✓ Only shows products with tw_retail_price > 0
- ✓ Rate limit: 60/min per IP

### /api/shop/categories
- ✓ Groups categories by brand
- ✓ Product count for each category
- ✓ 5-minute in-memory cache
- ✓ Fallback to stale cache on errors
- ✓ Cache status headers (HIT/MISS/STALE)
- ✓ Rate limit: 60/min per IP

### /api/shop/order
- ✓ Validates all required fields
- ✓ Email format validation
- ✓ Verifies products exist in database
- ✓ Checks product availability
- ✓ Stores in erp_orders (or shop_orders fallback)
- ✓ Includes ORDER items relationships
- ✓ Input sanitization (prevent injection)
- ✓ Rate limit: 30/min per IP

## Database Tables Used

**Read-only:**
- `quickbuy_products` - Product data with prices, status, categories

**Write:**
- `erp_orders` & `erp_order_items` (primary)
- OR `shop_orders` & `shop_order_items` (fallback if erp_* don't exist)

## Query Parameters

### Products (/api/shop/products)

| Param | Type | Default | Example |
|-------|------|---------|---------|
| `q` | string | - | `q=wrench` |
| `category` | string | - | `category=Snap-on%20扳手系列` |
| `brand` | string | - | `brand=Snap-on` |
| `status` | string | Current,New Announced | `status=Current` |
| `sort` | string | newest | `sort=price_asc` |
| `page` | number | 1 | `page=2` |
| `limit` | number | 24 | `limit=48` (max) |

### Categories (/api/shop/categories)

None. Response is cached automatically.

### Order (/api/shop/order)

POST body with JSON:

```json
{
  "customer_name": "required",
  "customer_phone": "required",
  "customer_email": "optional",
  "customer_line_id": "optional",
  "items": [{"product_id": "required", "quantity": "required"}],
  "note": "optional"
}
```

## Response Fields

### Product Object
- `id` - Database ID
- `item_number` - SKU/item code
- `description` - Product name/description
- `tw_retail_price` - Taiwan retail price (only price shown publicly)
- `product_status` - 'Current' or 'New Announced'
- `category` - Category name
- `image_url` - Product image URL
- `weight_kg` - Weight in kg
- `origin_country` - Country of origin

### Brand Object
- `name` - Brand name (e.g., "Snap-on")
- `slug` - URL-friendly slug
- `categories` - Array of category objects

### Category Object
- `name` - Category name
- `slug` - URL-friendly slug
- `count` - Number of available products

## Hidden Fields

These fields are NEVER returned to the public API:
- `tw_reseller_price` - Dealer/wholesale pricing
- `us_price` - US market pricing
- `replacement_model` - Internal product data
- `commodity_code` - Customs classification
- `search_text` - Internal search optimization
- `safety_stock` - Internal inventory data

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Order created successfully |
| 400 | Bad request (validation error) |
| 429 | Rate limit exceeded |
| 500 | Server error |

## Rate Limit Headers

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 55
X-RateLimit-Reset: 1648485600
Retry-After: 45
```

## Brands Currently Supported

```
- Snap-on
- BAHCO
- Muc-Off
- 美國藍點 (Blue Point USA - Taiwan)
- OTC (Ordinary Tools Company)
- QB TOOLS
- (plus "other" for unbranded products)
```

## Testing the APIs

### Test product search (works immediately)
```bash
curl "http://localhost:3000/api/shop/products?q=test&limit=5"
```

### Test categories (may be empty if no products with prices)
```bash
curl "http://localhost:3000/api/shop/categories"
```

### Test order (requires product_id from actual DB)
```bash
# First get a product ID from products endpoint, then:
curl -X POST "http://localhost:3000/api/shop/order" \
  -H "Content-Type: application/json" \
  -d '{"customer_name":"Test","customer_phone":"0900000000","items":[{"product_id":1,"quantity":1}]}'
```

## Production Checklist

- [ ] Environment variables set (SUPABASE_URL, SUPABASE_SERVICE_KEY)
- [ ] Database tables verified (erp_orders or shop_orders exists)
- [ ] Product data has tw_retail_price values > 0
- [ ] Images properly configured (image_url field populated)
- [ ] Rate limits appropriate for expected traffic
- [ ] CORS configured if frontend on different domain
- [ ] Logging monitoring set up for errors
- [ ] Database backups enabled

## Documentation

Full API documentation is available in `/API_SHOP_ENDPOINTS.md`

## Support

For issues or questions, check:
1. Server logs for error messages
2. Database connectivity (SUPABASE_URL/SUPABASE_SERVICE_KEY)
3. Table schema (quickbuy_products, erp_orders, etc.)
4. Product data (tw_retail_price values)
