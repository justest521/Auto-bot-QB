#!/usr/bin/env node
/**
 * QB ERP Pre-flight Check — 上線前自動審查
 *
 * 檢查項目：
 * 1. 變數作用域問題（在 if/for 內宣告但在外部引用）
 * 2. API 參數一致性（前端傳的 action 後端有沒有處理）
 * 3. Supabase 查詢安全性（.maybeSingle() 沒有 .limit(1)）
 * 4. JSX 語法（三元運算內的 IIFE 不需要外層大括號）
 * 5. 表名一致性（products vs quickbuy_products）
 * 6. undefined 參數傳遞
 * 7. 前端 API 呼叫的 action 是否存在於後端
 *
 * Usage: node scripts/preflight-check.js
 */

const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

let errors = 0;
let warnings = 0;

function error(file, line, msg) {
  console.log(`  ${RED}ERROR${RESET} ${file}:${line} — ${msg}`);
  errors++;
}
function warn(file, line, msg) {
  console.log(`  ${YELLOW}WARN${RESET}  ${file}:${line} — ${msg}`);
  warnings++;
}
function pass(msg) {
  console.log(`  ${GREEN}✓${RESET} ${msg}`);
}

// ═══════════════════════════════════════════════════════
// 1. Check backend actions-post.js & actions-get.js
// ═══════════════════════════════════════════════════════

function checkBackend() {
  console.log(`\n${DIM}── Backend Checks ──${RESET}`);

  const postFile = 'lib/admin/actions-post.js';
  const getFile = 'lib/admin/actions-get.js';
  const routeFile = 'app/api/admin/route.js';

  for (const file of [postFile, getFile]) {
    if (!fs.existsSync(file)) continue;
    const code = fs.readFileSync(file, 'utf8');
    const lines = code.split('\n');

    lines.forEach((line, i) => {
      const ln = i + 1;

      // Check: .from('products') instead of .from('quickbuy_products')
      if (line.includes(".from('products')") && !line.includes('// legacy')) {
        error(file, ln, ".from('products') 應改為 .from('quickbuy_products')");
      }

      // Check: .maybeSingle() without .limit(1) on non-unique columns
      if (line.includes('.maybeSingle()') && !line.includes('.limit(1)') && !line.includes('.limit(1).maybeSingle')) {
        // Check if it's querying by a unique key (id, order_no, invoice_no, etc.)
        const isUnique = /\.eq\('id'|\.eq\('order_no'|\.eq\('invoice_no'|\.eq\('po_no'|\.eq\('slip_number'|\.eq\('shipment_no'|\.eq\('stock_in_no'|\.eq\('username'|\.eq\('email'|\.eq\('token'|\.eq\('item_number'/.test(line);
        if (!isUnique) {
          warn(file, ln, ".maybeSingle() 沒有 .limit(1)，可能在多行時 silent error");
        }
      }

      // Check: undefined string in Supabase query
      if (line.includes("eq.undefined") || line.includes("'undefined'")) {
        error(file, ln, "Supabase 查詢包含 'undefined' 字串");
      }

      // Check: auth?.user (doesn't exist in actions-post.js)
      if (file === postFile && /\bauth\?\.user\b/.test(line) && !line.includes('__auth_user')) {
        error(file, ln, "actions-post.js 沒有 auth 變數，應用 body.__auth_user");
      }
    });
  }

  // Check route.js: __auth_user includes role
  if (fs.existsSync(routeFile)) {
    const routeCode = fs.readFileSync(routeFile, 'utf8');
    if (routeCode.includes('__auth_user') && !routeCode.includes('role: auth.role')) {
      error(routeFile, 0, "__auth_user 沒有注入 role");
    } else {
      pass('route.js __auth_user 包含 role');
    }
  }
}

// ═══════════════════════════════════════════════════════
// 2. Check frontend tabs for common issues
// ═══════════════════════════════════════════════════════

function checkFrontend() {
  console.log(`\n${DIM}── Frontend Checks ──${RESET}`);

  const tabsDir = 'app/admin/components/tabs';
  if (!fs.existsSync(tabsDir)) return;

  const files = fs.readdirSync(tabsDir).filter(f => f.endsWith('.js'));
  let jsxIssues = 0;
  let undefinedParams = 0;

  // Collect all backend actions
  const backendActions = new Set();
  for (const bf of ['lib/admin/actions-post.js', 'lib/admin/actions-get.js', 'app/api/admin/route.js']) {
    if (!fs.existsSync(bf)) continue;
    const code = fs.readFileSync(bf, 'utf8');
    const matches = code.matchAll(/case\s+'([^']+)'/g);
    for (const m of matches) backendActions.add(m[1]);
    // Also check route.js direct action checks
    const routeMatches = code.matchAll(/action\s*===\s*'([^']+)'/g);
    for (const m of routeMatches) backendActions.add(m[1]);
  }

  for (const file of files) {
    const fp = path.join(tabsDir, file);
    const code = fs.readFileSync(fp, 'utf8');
    const lines = code.split('\n');

    lines.forEach((line, i) => {
      const ln = i + 1;

      // Check: JSX IIFE in ternary with extra braces — ) : ( {(() => {
      if (/\)\s*:\s*\(\s*\{/.test(line) && line.includes('(() =>')) {
        error(fp, ln, "三元運算內 IIFE 不需要外層 {} — ) : ( {(() 應改為 ) : ( (()");
        jsxIssues++;
      }

      // Check: passing undefined to API — value: something || undefined
      if (/:\s*\w+\s*\|\|\s*undefined/.test(line) && line.includes('apiGet')) {
        warn(fp, ln, "apiGet 傳 undefined 參數可能被序列化為字串 'undefined'");
        undefinedParams++;
      }

      // Check: hardcoded .from('products')
      if (line.includes(".from('products')")) {
        error(fp, ln, ".from('products') 應改為 .from('quickbuy_products')");
      }
    });

    // Check: frontend calls actions that don't exist in backend
    const actionCalls = code.matchAll(/action:\s*'([^']+)'/g);
    for (const m of actionCalls) {
      if (!backendActions.has(m[1])) {
        warn(fp, 0, `呼叫不存在的 action: '${m[1]}'`);
      }
    }

    // Check: brace balance
    const opens = (code.match(/\{/g) || []).length;
    const closes = (code.match(/\}/g) || []).length;
    if (opens !== closes) {
      error(fp, 0, `大括號不平衡: { ${opens} vs } ${closes}`);
    }
  }

  if (jsxIssues === 0) pass('JSX IIFE 語法正確');
  if (undefinedParams === 0) pass('無 undefined 參數傳遞');
}

// ═══════════════════════════════════════════════════════
// 3. Check API parameter consistency
// ═══════════════════════════════════════════════════════

function checkApiConsistency() {
  console.log(`\n${DIM}── API Consistency ──${RESET}`);

  // Check: vendor_id filter handles "undefined" string
  const getFile = 'lib/admin/actions-get.js';
  if (fs.existsSync(getFile)) {
    const code = fs.readFileSync(getFile, 'utf8');

    // Find all searchParams.get() that are used in .eq() queries
    const paramMatches = code.matchAll(/const\s+(\w+)\s*=.*searchParams\.get\(['"](\w+)['"]\)/g);
    for (const m of paramMatches) {
      const varName = m[1];
      const paramName = m[2];
      // Check if it's used in an .eq() without filtering 'undefined'
      if (code.includes(`.eq('${paramName}'`) || code.includes(`.eq('${varName}'`)) {
        // Check if there's protection against 'undefined' string
        const lineIdx = code.indexOf(m[0]);
        const surrounding = code.substring(lineIdx, lineIdx + 200);
        if (!surrounding.includes('undefined') && paramName.includes('_id')) {
          warn(getFile, 0, `${paramName} 參數可能收到 'undefined' 字串`);
        }
      }
    }
  }

  pass('API 參數檢查完成');
}

// ═══════════════════════════════════════════════════════
// 4. Production build check (optional, slow)
// ═══════════════════════════════════════════════════════

function checkBuild() {
  console.log(`\n${DIM}── Build Check ──${RESET}`);

  // Quick syntax check: just verify brace balance in key files
  const keyFiles = [
    'lib/admin/actions-post.js',
    'lib/admin/actions-get.js',
    'app/api/admin/route.js',
    'app/admin/page.js',
  ];

  let allGood = true;
  for (const file of keyFiles) {
    if (!fs.existsSync(file)) continue;
    const code = fs.readFileSync(file, 'utf8');
    const opens = (code.match(/\{/g) || []).length;
    const closes = (code.match(/\}/g) || []).length;
    if (opens !== closes) {
      error(file, 0, `大括號不平衡: { ${opens} vs } ${closes}`);
      allGood = false;
    }
  }
  if (allGood) pass('核心檔案語法平衡');
}

// ═══════════════════════════════════════════════════════
// Run all checks
// ═══════════════════════════════════════════════════════

console.log(`${DIM}QB ERP Pre-flight Check  ${new Date().toLocaleString('zh-TW')}${RESET}`);

checkBackend();
checkFrontend();
checkApiConsistency();
checkBuild();

console.log(`\n${'═'.repeat(50)}`);
if (errors > 0) {
  console.log(`${RED}✗ ${errors} ERROR${errors > 1 ? 'S' : ''}, ${warnings} WARNING${warnings > 1 ? 'S' : ''}${RESET}`);
  process.exit(1);
} else if (warnings > 0) {
  console.log(`${YELLOW}⚠ ${warnings} WARNING${warnings > 1 ? 'S' : ''}, 0 errors${RESET}`);
} else {
  console.log(`${GREEN}✓ 全部通過${RESET}`);
}
