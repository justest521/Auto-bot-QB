# B2C E-Commerce Shop API Endpoints

Three production-ready API endpoints have been created for the Next.js 14 project at `/sessions/stoic-vigilant-shannon/mnt/QB-ERP/`.

## Overview

All endpoints follow Next.js 14 App Router conventions and use the Supabase REST API for database operations. Rate limiting is applied to prevent abuse.

---

## 1. GET /api/shop/products

**File:** `/app/api/shop/products/route.js`

Public product listing API with flexible filtering and search.

### Query Parameters

- `q` (string, optional): Search query. Searches both `item_number` and `description` using case-insensitive ILIKE matching
- `category` (string, optional): Filter by exact category name
- `brand` (string, optional): Filter by brand prefix (e.g., "Snap-on", "BAHCO", "Muc-Off", "美國藍點", "OTC", "QB TOOLS")
- `status` (string, default: "Current,New Announced"): Comma-separated product statuses to include
- `sort` (string, default: "newest"): Sort order
  - `price_asc`: Lowest price first
  - `price_desc`: Highest price first
  - `newest`: Most recently created first
- `page` (integer, default: 1): Page number (1-indexed)
- `limit` (integer, default: 24, max: 48): Items per page

### Response

```json
{
  "products": [
    {
      "id": 12345,
      "item_number": "ABC-001",
      "description": "Product description",
      "tw_retail_price": 299.99,
      "product_status": "Current",
      "category": "Snap-on 扳手系列",
      "image_url": "https://example.com/image.jpg",
      "weight_kg": 0.5,
      "origin_country": "USA"
    }
  ],
  "total": 542,
  "page": 1,
  "totalPages": 23,
  "limit": 24
}
```

### Features

- **Public-safe fields only**: Never returns `tw_reseller_price` (dealer pricing) or `us_price`
- **Availability filter**: Only returns products with `tw_retail_price > 0`
- **Status filtering**: Default to 'Current' and 'New Announced' products only
- **Brand extraction**: Intelligently extracts brand from category prefix
- **Rate limiting**: 60 requests per minute per IP

### Example Usage

```bash
# Search for "wrench"
curl "https://your-domain.com/api/shop/products?q=wrench"

# Filter by brand with pagination
curl "https://your-domain.com/api/shop/products?brand=Snap-on&page=1&limit=24"

# Sort by price (lowest first)
curl "https://your-domain.com/api/shop/products?sort=price_asc"
```

---

## 2. GET /api/shop/categories

**File:** `/app/api/shop/categories/route.js`

Returns all distinct product categories grouped by brand with product counts.

### Query Parameters

None. The response is cached for 5 minutes.

### Response

```json
{
  "brands": [
    {
      "name": "Snap-on",
      "slug": "snapon",
      "categories": [
        {
          "name": "Snap-on 扳手系列",
          "slug": "snapon",
          "count": 24
        },
        {
          "name": "Snap-on 零件",
          "slug": "snapon",
          "count": 18
        }
      ]
    },
    {
      "name": "BAHCO",
      "slug": "bahco",
      "categories": [
        {
          "name": "BAHCO 套筒系列",
          "slug": "bahco",
          "count": 215
        }
      ]
    },
    {
      "name": "other",
      "slug": "other",
      "categories": [
        {
          "name": "other",
          "slug": "other",
          "count": 105000
        }
      ]
    }
  ],
  "totalProducts": 106917
}
```

### Features

- **Smart grouping**: Branded categories first (alphabetically), then "other" category last
- **Slug generation**: URL-friendly slugs for each brand and category
- **Product counting**: Only counts products with status "Current" or "New Announced" and `tw_retail_price > 0`
- **In-memory caching**: 5-minute TTL with fallback to stale cache on errors
- **Cache headers**: Returns `Cache-Control`, `X-Cache` headers
- **Rate limiting**: 60 requests per minute per IP

### Cache Headers

- **Cache-Control**: `public, max-age=300` (fresh data)
- **X-Cache**: `HIT` (cached), `MISS` (fresh), `STALE` (fallback), `ERROR` (error with cached fallback)

### Example Usage

```bash
# Get all categories
curl "https://your-domain.com/api/shop/categories"
```

---

## 3. POST /api/shop/order

**File:** `/app/api/shop/order/route.js`

Creates an order inquiry from B2C customers.

### Request Body

```json
{
  "customer_name": "John Doe",
  "customer_phone": "+886-912-345-678",
  "customer_email": "john@example.com",
  "customer_line_id": "U1234567890abcdef1234567890abcdef",
  "items": [
    {
      "product_id": 12345,
      "quantity": 2
    },
    {
      "product_id": 67890,
      "quantity": 1
    }
  ],
  "note": "Please contact me before 3pm"
}
```

### Field Validation

| Field | Required | Type | Max Length | Notes |
|-------|----------|------|-----------|-------|
| `customer_name` | ✓ | string | 255 | Trimmed and sanitized |
| `customer_phone` | ✓ | string | 20 | Phone number format validated |
| `customer_email` | | string | 255 | Must be valid email format if provided |
| `customer_line_id` | | string | 255 | Optional LINE ID |
| `items` | ✓ | array | - | At least 1 item required |
| `items[].product_id` | ✓ | number | - | Must exist in database |
| `items[].quantity` | ✓ | number | - | Must be >= 1 |
| `note` | | string | 255 | Optional notes |

### Response (Success)

Status: 201

```json
{
  "success": true,
  "inquiry_id": "12345",
  "message": "Your inquiry has been received. We will contact you soon."
}
```

### Response (Error)

Status: 400 or 500

```json
{
  "error": "Error message describing what went wrong"
}
```

### Validation Logic

1. **Required fields**: Validates `customer_name`, `customer_phone`, and at least one item
2. **Email format**: If provided, validates email with regex
3. **Items validation**: Each item must have `product_id` and `quantity >= 1`
4. **Product existence**: Verifies all products exist in the database
5. **Product availability**: Confirms products have status 'Current' or 'New Announced'
6. **Data sanitization**: All strings are trimmed and length-limited

### Database Storage

The endpoint attempts to store orders in this priority:

1. **Primary (erp_orders)**: Uses `erp_orders` + `erp_order_items` tables if they exist
2. **Fallback (shop_orders)**: Uses `shop_orders` + `shop_order_items` tables if `erp_orders` doesn't exist

### Order Fields Stored

- `customer_name`, `customer_phone`, `customer_email`, `customer_line_id`
- `note`
- `source: 'website'`
- `status: 'pending'`
- `created_at: ISO timestamp`

### Features

- **Product validation**: Verifies products exist before accepting order
- **Status checks**: Only allows orders for 'Current' or 'New Announced' products
- **Input sanitization**: Prevents injection attacks with string trimming and length limits
- **CORS support**: Includes OPTIONS endpoint for CORS preflight
- **Graceful degradation**: Works with either `erp_orders` or `shop_orders` tables
- **Rate limiting**: 30 requests per minute per IP
- **Error handling**: Specific error messages for validation failures

### Example Usage

```bash
curl -X POST "https://your-domain.com/api/shop/order" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "John Doe",
    "customer_phone": "+886-912-345-678",
    "customer_email": "john@example.com",
    "items": [
      {"product_id": 12345, "quantity": 2}
    ],
    "note": "Please call before 3pm"
  }'
```

---

## Configuration & Dependencies

### Environment Variables Required

- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_KEY` or `SUPABASE_SERVICE_ROLE_KEY`: Supabase API key

### Imports

- `@/lib/security/rate-limit`: Rate limiting utilities
- `@supabase/supabase-js`: For order endpoint Supabase operations
- `next/server`: NextResponse for handling HTTP responses

### Database Tables Used

- `quickbuy_products`: Product data (read-only for shop endpoints)
- `erp_orders` & `erp_order_items` (preferred, if exists)
- `shop_orders` & `shop_order_items` (fallback)

---

## Rate Limiting

All endpoints use in-memory rate limiting configured per endpoint:

| Endpoint | Window | Limit |
|----------|--------|-------|
| /api/shop/products | 60 seconds | 60 requests |
| /api/shop/categories | 60 seconds | 60 requests |
| /api/shop/order | 60 seconds | 30 requests |

Rate limit exceeded response:

```json
{
  "error": "Too many requests. Please try again later."
}
```

With headers:
- `Retry-After`: Seconds to wait
- `X-RateLimit-Limit`: Max requests per window
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Unix timestamp when limit resets

---

## Security Considerations

### Input Validation

- **Phone numbers**: Limited to 20 characters
- **Names & emails**: Limited to 255 characters
- **Email validation**: Regex-based format check
- **Product IDs**: Validated against database
- **JSON parsing**: Error handling for malformed JSON

### Data Protection

- **Sensitive fields hidden**: Dealer pricing (`tw_reseller_price`) and US pricing never exposed
- **No PII in responses**: Only essential customer data stored
- **Rate limiting**: Prevents brute force and abuse
- **Input sanitization**: Removes quotes and excess whitespace

### Database Security

- All queries use Supabase's built-in RLS (Row Level Security)
- Service key (server-side only) for write operations
- Readonly fields ensure data integrity

---

## Testing

### Products API

```bash
# Basic search
curl "http://localhost:3000/api/shop/products?q=wrench"

# Filter by brand
curl "http://localhost:3000/api/shop/products?brand=Snap-on&page=1&limit=10"

# Sort by price
curl "http://localhost:3000/api/shop/products?sort=price_asc&limit=5"
```

### Categories API

```bash
# Get all categories (cached)
curl "http://localhost:3000/api/shop/categories"

# Call multiple times - second should show X-Cache: HIT
curl "http://localhost:3000/api/shop/categories"
```

### Order API

```bash
# Create an order
curl -X POST "http://localhost:3000/api/shop/order" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "Test User",
    "customer_phone": "0912345678",
    "items": [{"product_id": 1, "quantity": 1}]
  }'
```

---

## File Locations

- `/app/api/shop/products/route.js` - Product listing endpoint
- `/app/api/shop/categories/route.js` - Categories endpoint
- `/app/api/shop/order/route.js` - Order creation endpoint
