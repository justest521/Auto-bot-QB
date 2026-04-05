const API = '/api/admin';
const ADMIN_TOKEN_KEY = 'qb_admin_token';
const SALES_DOCUMENT_FOCUS_KEY = 'qb_sales_document_focus';

export async function authFetch(url, options = {}) {
  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem(ADMIN_TOKEN_KEY) : '';

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': token || '',
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
    throw new Error('Token 錯誤或已失效，請重新登入');
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;

    try {
      const data = await res.json();
      message = data?.error || message;
    } catch {
      try {
        message = await res.text();
      } catch {
        // Ignore response parse errors and use fallback message.
      }
    }

    throw new Error(message);
  }

  return res;
}

export async function apiGet(params = {}) {
  const p = new URLSearchParams(params);
  const res = await authFetch(`${API}?${p.toString()}`);
  return res.json();
}

export async function apiPost(body) {
  const res = await authFetch(API, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.json();
}

/** Open signed PDF in new tab */
export async function openPdf(docType, docId) {
  try {
    const data = await apiGet({ action: 'generate_pdf_url', doc_type: docType, doc_id: docId });
    if (data.url) {
      window.open(data.url, '_blank');
    } else {
      alert(data.error || 'PDF 連結產生失敗');
    }
  } catch (e) {
    alert('PDF 連結產生失敗: ' + e.message);
  }
}

export { API, ADMIN_TOKEN_KEY, SALES_DOCUMENT_FOCUS_KEY };
