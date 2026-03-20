// app/api/admin/route.js — 精簡路由層，只做 auth + dispatch
import { isAuthorized } from '@/lib/admin/auth';
import { handleGetAction } from '@/lib/admin/actions-get';
import { handlePostAction } from '@/lib/admin/actions-post';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = isAuthorized(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    const result = await handleGetAction(action, searchParams);
    if (result) return result;
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Admin API error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = isAuthorized(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { action } = body;

    const result = await handlePostAction(action, body);
    if (result) return result;
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Admin POST error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
