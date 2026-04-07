#!/usr/bin/env node
/**
 * QB ERP 後端靜態掃描
 * 針對這個專案的已知 bug 模式做快速掃描
 * 用法：node scripts/audit.js [file]
 *   不帶參數 → 掃描 actions-get.js + actions-post.js
 *   帶檔案  → 只掃該檔案
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TARGETS = [
  'lib/admin/actions-get.js',
  'lib/admin/actions-post.js',
];

const RED   = '\x1b[31m';
const YLW   = '\x1b[33m';
const GRN   = '\x1b[32m';
const DIM   = '\x1b[2m';
const RESET = '\x1b[0m';

let totalIssues = 0;

function warn(file, line, level, msg) {
  const icon = level === 'ERROR' ? `${RED}✖ ERROR${RESET}` : `${YLW}⚠ WARN ${RESET}`;
  console.log(`  ${icon}  ${DIM}${file}:${line}${RESET}  ${msg}`);
  totalIssues++;
}

function scanFile(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return;

  const src  = fs.readFileSync(abs, 'utf8');
  const lines = src.split('\n');
  let issues = 0;

  console.log(`\n${DIM}── ${relPath} ──────────────────────────────${RESET}`);

  lines.forEach((raw, i) => {
    const ln = i + 1;
    const line = raw.trim();

    // ── 規則 1：.maybeSingle() + 非唯一欄位查詢（高風險：一對多關係）──────────
    // 只標記用 order_id / source_id / shipment_id / erp_order_id 查詢時
    if (line.includes('.maybeSingle()') && !line.includes('.limit(')) {
      const context = lines.slice(Math.max(0, i - 4), i + 1).join(' ');
      const hasDangerousField = /\.eq\(['"]order_id['"]|\.eq\(['"]source_id['"]|\.eq\(['"]shipment_id['"]|\.eq\(['"]erp_order_id['"]|\.eq\(['"]sale_id['"]/.test(context);
      const hasPkOrUnique = /\.eq\(['"]id['"]|\.eq\(['"]invoice_no['"]|\.eq\(['"]order_no['"]|\.eq\(['"]slip_number['"]|\.eq\(['"]payment_number['"]|\.eq\(['"]item_number['"]|\.eq\(['"]receipt_no['"]/.test(context);
      if (hasDangerousField && !hasPkOrUnique) {
        warn(relPath, ln, 'WARN', `.maybeSingle() + 一對多欄位查詢，多行時會 silent error → 加 .limit(1)`);
        issues++;
      }
    }

    // ── 規則 2：erp_invoices INSERT 缺必要欄位（由 scanInsertBlocks 多行掃描處理）

    // ── 規則 3：paid_amount 雙計模式：invoicePaid + orderPaid / arPaid + depositTotal ──
    if (/invoicePaid\s*\+\s*orderPaid|arPaid\s*\+\s*orderDepositTotal|arPaid\s*\+\s*depositTotal/.test(line)) {
      warn(relPath, ln, 'ERROR', `paid_amount 雙計：兩個來源可能重疊（erp_invoices.paid_amount 已含 qb_payments）`);
      issues++;
    }

    // ── 規則 4：remaining 計算同時減兩個付款來源 ─────────────────────────────────
    if (/orderTotal\s*-\s*orderDepositTotal\s*-\s*arPaid|total\s*-\s*deposits\s*-\s*paid/.test(line)) {
      warn(relPath, ln, 'ERROR', `餘額雙減：orderDepositTotal 與 arPaid 可能重疊`);
      issues++;
    }

    // ── 規則 5：order_id 「過濾」erp_invoices 沒有 .limit(1) ─────────────────
    // 用正則確認是 .eq('order_id', 而非 select 欄位名
    if (line.includes('erp_invoices') && /\.eq\(['"]order_id['"]/.test(line) && !line.includes('.limit(') && line.includes('.maybeSingle()')) {
      warn(relPath, ln, 'WARN', `order_id 查 erp_invoices 未加 .limit(1)，一訂單多發票時會 error`);
      issues++;
    }
  });

  if (issues === 0) {
    console.log(`  ${GRN}✓ 沒有發現已知問題${RESET}`);
  }
  return issues;
}

// ── 進階：掃描 INSERT block（多行版）─────────────────────────────────────────
function scanInsertBlocks(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return;

  const src = fs.readFileSync(abs, 'utf8');

  // 找所有 erp_invoices insert block
  const insertRegex = /supabase\.from\('erp_invoices'\)\s*\.insert\(\{([^}]{0,800})\}/gs;
  let match;
  while ((match = insertRegex.exec(src)) !== null) {
    const block = match[1];
    // 如果 insert body 含 spread（...varName），欄位由外部變數帶入，跳過
    if (/\.\.\.[a-zA-Z]/.test(block)) continue;
    const lineNo = src.slice(0, match.index).split('\n').length;
    const missing = [];
    if (!block.includes('total_amount'))   missing.push('total_amount');
    if (!block.includes('customer_id'))    missing.push('customer_id');
    if (!block.includes('payment_status')) missing.push('payment_status');
    if (missing.length > 0) {
      warn(relPath, lineNo, 'WARN', `erp_invoices insert 缺欄位：${missing.join(', ')}`);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const targets = args.length > 0
  ? args.map(a => path.relative(ROOT, path.resolve(a)))
  : TARGETS;

console.log(`\n${DIM}QB ERP 後端靜態掃描  ${new Date().toLocaleString('zh-TW')}${RESET}`);

targets.forEach(t => {
  scanFile(t);
  scanInsertBlocks(t);
});

console.log(`\n${ totalIssues === 0 ? GRN + '✓ 全部通過' : RED + `✖ 共 ${totalIssues} 個問題`}${RESET}\n`);
process.exit(totalIssues > 0 ? 1 : 0);
