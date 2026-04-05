// app/api/admin/upload/route.js — 大檔案上傳（FormData，繞過 JSON 4.5MB 限制）
import { isAuthorizedV2 } from '@/lib/admin/auth-v2';
import { handlePostAction } from '@/lib/admin/actions-post';
import { adminLimiter } from '@/lib/security/rate-limit';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_FILE_SIZE    = 10 * 1024 * 1024; // 10 MB (PDF 可能較大)
const MAX_IMAGE_SIZE   =  5 * 1024 * 1024; //  5 MB for images
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
  'image/webp', 'image/bmp', 'image/tiff',
  'application/pdf',
]);

export async function POST(request) {
  // Rate limiting
  const rl = adminLimiter(request);
  if (!rl.ok) return rl.response;

  // Auth
  const auth = await isAuthorizedV2(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return Response.json({ error: '未收到檔案' }, { status: 400 });
    }

    // File type validation
    const mime = file.type || '';
    if (!ALLOWED_MIME_TYPES.has(mime)) {
      return Response.json({ error: `不支援的檔案格式 (${mime || '未知'})，僅允許 JPEG / PNG / GIF / WebP` }, { status: 415 });
    }

    // File size validation
    const buffer = Buffer.from(await file.arrayBuffer());
    const sizeLimit = mime === 'application/pdf' ? MAX_FILE_SIZE : MAX_IMAGE_SIZE;
    if (buffer.length > sizeLimit) {
      const limitMb = (sizeLimit / 1024 / 1024).toFixed(0);
      return Response.json({ error: `檔案過大（${(buffer.length / 1024 / 1024).toFixed(1)} MB），上限為 ${limitMb} MB` }, { status: 413 });
    }

    // Magic byte check: verify actual content matches declared MIME type
    const sig4 = buffer.slice(0, 4).toString('hex');
    const isPdf  = mime === 'application/pdf';
    const isJpeg = sig4.startsWith('ffd8ff');
    const isPng  = sig4 === '89504e47';
    const isGif  = sig4.startsWith('47494638');
    const isWebpAlt = buffer.slice(8, 12).toString('ascii') === 'WEBP';
    const isBmp  = sig4.startsWith('424d');
    // PDF magic: %PDF = 0x25504446
    const isPdfMagic = sig4 === '25504446';

    const mimeOk = isPdf
      ? isPdfMagic
      : (mime.includes('jpeg') && isJpeg) ||
        (mime.includes('png')  && isPng)  ||
        (mime.includes('gif')  && isGif)  ||
        (mime.includes('webp') && (isWebpAlt || buffer.slice(0, 4).toString('ascii') === 'RIFF')) ||
        (mime.includes('bmp')  && isBmp)  ||
        mime.includes('tiff');

    if (!mimeOk && !mime.includes('tiff')) {
      return Response.json({ error: isPdf ? '檔案內容不是有效的 PDF' : '檔案內容與宣告格式不符，請確認上傳的是圖片或 PDF' }, { status: 415 });
    }

    const base64 = buffer.toString('base64');
    const fileName = file.name || 'upload';
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

    return handlePostAction('parse_receive_image', {
      base64,
      mime,
      file_hash: fileHash,
      file_name: fileName,
    });
  } catch (err) {
    console.error('Upload error:', err);
    return Response.json({ error: err.message || '上傳失敗' }, { status: 500 });
  }
}
