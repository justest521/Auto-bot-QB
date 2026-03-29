// app/api/admin/upload/route.js — 大檔案上傳（FormData，繞過 JSON 4.5MB 限制）
import { isAuthorizedV2 } from '@/lib/admin/auth-v2';
import { handlePostAction } from '@/lib/admin/actions-post';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  const auth = await isAuthorizedV2(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return Response.json({ error: '未收到檔案' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');
    const mime = file.type || 'image/jpeg';
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
