// app/admin/layout.js — Admin-specific metadata (noindex, security)
export const metadata = {
  title: 'Auto-bot QB 管理後台',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }) {
  return children;
}
