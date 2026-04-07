'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager, StatCard } from '../shared/ui';

// ══════════════════════════════════════════════════════
// HR MODULE — Sub-tab based layout
// ══════════════════════════════════════════════════════

const SUB_TABS = [
  { id: 'dashboard', label: '總覽', icon: '📊' },
  { id: 'employees', label: '員工管理', icon: '👤' },
  { id: 'attendance', label: '出勤管理', icon: '⏰' },
  { id: 'leave', label: '請假管理', icon: '📋' },
  { id: 'payroll', label: '薪資管理', icon: '💰' },
];

const STATUS_MAP = {
  active: { label: '在職', color: t.color.brand },
  resigned: { label: '離職', color: t.color.error },
  on_leave: { label: '留停', color: t.color.warning },
  terminated: { label: '解僱', color: t.color.textMuted },
};

const LEAVE_STATUS = {
  pending: { label: '待審核', color: t.color.warning },
  approved: { label: '已核准', color: t.color.brand },
  rejected: { label: '已駁回', color: t.color.error },
  cancelled: { label: '已取消', color: t.color.textDisabled },
};

const PAYROLL_STATUS = {
  draft: { label: '草稿', color: t.color.warning },
  confirmed: { label: '已確認', color: t.color.link },
  paid: { label: '已發放', color: t.color.brand },
};

const ATT_STATUS = {
  present: { label: '出勤', color: t.color.brand },
  late: { label: '遲到', color: t.color.warning },
  absent: { label: '缺勤', color: t.color.error },
  early_leave: { label: '早退', color: '#f59e0b' },
  day_off: { label: '休假', color: t.color.textDisabled },
  holiday: { label: '國定假日', color: t.color.textMuted },
  leave: { label: '請假', color: t.color.link },
};

/* ── Tag component ── */
function Tag({ label, color }) {
  return (
    <span style={{
      display: 'inline-block',
      fontSize: t.fontSize.badge,
      fontWeight: t.fontWeight.semibold,
      color,
      background: `${color}14`,
      border: `1px solid ${color}30`,
      borderRadius: t.radius.pill,
      padding: '2px 10px',
      whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}

/* ── Modal Shell ── */
function Modal({ open, onClose, title, children, width = 520 }) {
  const { isMobile } = useResponsive();
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />
      <div style={{
        position: 'relative', background: '#fff', borderRadius: isMobile ? '16px 16px 0 0' : 16,
        width: isMobile ? '100%' : width, maxHeight: '85vh', overflow: 'auto',
        padding: isMobile ? '20px 16px' : '28px 32px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        ...(isMobile ? { position: 'fixed', bottom: 0, left: 0, right: 0 } : {}),
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: t.fontSize.h1, color: t.color.textMuted, cursor: 'pointer', padding: 4 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Form Field ── */
function Field({ label, required, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: t.color.textMuted, marginBottom: 4 }}>
        {label}{required && <span style={{ color: t.color.error, marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════
function HRDashboard() {
  const { isMobile } = useResponsive();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet({ action: 'hr_dashboard' }).then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  const s = data?.stats || {};
  const depts = data?.departments || [];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <StatCard code="TOTAL" label="總員工" value={s.total_employees || 0} tone="blue" />
        <StatCard code="ACTIVE" label="在職" value={s.active || 0} tone="green" />
        <StatCard code="LEAVE" label="待審假單" value={s.pending_leaves || 0} tone="yellow" />
        <StatCard code="TODAY" label="今日出勤" value={s.today_present || 0} tone="green" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
        <div style={{ ...S.card }}>
          <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: t.color.textMuted, letterSpacing: 1, marginBottom: 14 }}>DEPARTMENT BREAKDOWN</div>
          {depts.length === 0 ? <div style={{ color: t.color.textDisabled, fontSize: t.fontSize.caption }}>尚無部門資料</div> : depts.map((d, i) => {
            const max = depts[0]?.count || 1;
            return (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: t.fontSize.tiny, color: t.color.textPrimary, fontWeight: t.fontWeight.semibold }}>{d.name}</span>
                  <span style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, ...S.mono }}>{d.count} 人</span>
                </div>
                <div style={{ height: 6, background: t.color.borderLight, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(d.count / max) * 100}%`, background: t.color.brand, borderRadius: 3 }} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ ...S.card }}>
          <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: t.color.textMuted, letterSpacing: 1, marginBottom: 14 }}>TODAY ATTENDANCE</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: t.fontWeight.bold, color: t.color.brand, ...S.mono }}>{s.today_present || 0}</div>
              <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted }}>出勤</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: t.fontWeight.bold, color: t.color.warning, ...S.mono }}>{s.today_late || 0}</div>
              <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted }}>遲到</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: t.fontWeight.bold, color: t.color.error, ...S.mono }}>{s.today_absent || 0}</div>
              <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted }}>缺勤</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// EMPLOYEE MANAGEMENT
// ══════════════════════════════════════════════════════
function EmployeeManagement() {
  const { isMobile } = useResponsive();
  const [data, setData] = useState({ employees: [], total: 0, stats: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async (p = page, q = search, s = statusFilter) => {
    setLoading(true);
    try {
      const res = await apiGet({ action: 'hr_employees', page: String(p), search: q, status: s });
      setData(res);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [page, search, statusFilter]);

  useEffect(() => { load(1); }, []);

  const openNew = () => {
    setEditingEmployee(null);
    setForm({ full_name: '', employee_no: '', department: '', job_title: '', phone: '', email: '', hire_date: new Date().toISOString().slice(0, 10), employment_type: 'full_time', base_salary: '', gender: '', birth_date: '', address: '', emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relation: '' });
    setMsg('');
    setShowForm(true);
  };

  const openEdit = (emp) => {
    setEditingEmployee(emp);
    setForm({ ...emp, base_salary: emp.base_salary || '' });
    setMsg('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.full_name?.trim()) { setMsg('請輸入姓名'); return; }
    if (!form.hire_date) { setMsg('請輸入到職日期'); return; }
    setSaving(true);
    setMsg('');
    try {
      const payload = { ...form };
      if (editingEmployee) payload.id = editingEmployee.id;
      if (payload.base_salary) payload.base_salary = Number(payload.base_salary);
      const res = await apiPost({ action: 'hr_upsert_employee', ...payload });
      if (res?.ok) {
        setShowForm(false);
        load(1);
      } else { setMsg(res?.error || '儲存失敗'); }
    } catch (e) { setMsg(e.message || '儲存失敗'); }
    setSaving(false);
  };

  const stats = data.stats || {};

  return (
    <div>
      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatCard code="ALL" label="全部" value={stats.total || 0} tone="blue" />
        <StatCard code="ACT" label="在職" value={stats.active || 0} tone="green" />
        <StatCard code="RES" label="離職" value={stats.resigned || 0} tone="red" />
        <StatCard code="LOA" label="留停" value={stats.on_leave || 0} tone="yellow" />
      </div>

      {/* Search + Add */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, statusFilter)} placeholder="搜尋姓名、工號、部門..." style={{ ...S.input, flex: 1 }} />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); load(1, search, e.target.value); }} style={{ ...S.input, width: isMobile ? '100%' : 140 }}>
          <option value="">全部狀態</option>
          <option value="active">在職</option>
          <option value="resigned">離職</option>
          <option value="on_leave">留停</option>
        </select>
        <button onClick={openNew} style={{ ...S.btnPrimary, whiteSpace: 'nowrap' }}>+ 新增員工</button>
      </div>

      {/* Table */}
      {loading ? <Loading /> : data.employees.length === 0 ? <EmptyState text="尚無員工資料" /> : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          {isMobile ? data.employees.map(emp => (
            <div key={emp.id} onClick={() => openEdit(emp)} style={{ padding: '14px 16px', borderBottom: `1px solid ${t.color.borderLight}`, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>{emp.full_name}</div>
                  <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginTop: 2 }}>{emp.employee_no} · {emp.department || '-'} · {emp.job_title || '-'}</div>
                </div>
                <Tag {...(STATUS_MAP[emp.status] || { label: emp.status, color: '#999' })} />
              </div>
            </div>
          )) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 120px 120px 110px 100px 80px', gap: 8, padding: '12px 18px', borderBottom: `1px solid ${t.color.border}`, fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: t.color.textMuted }}>
                <div>工號</div><div>姓名 / 部門</div><div>職稱</div><div>電話</div><div>到職日</div><div>狀態</div><div>操作</div>
              </div>
              {data.employees.map(emp => (
                <div key={emp.id} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 120px 120px 110px 100px 80px', gap: 8, padding: '12px 18px', borderBottom: `1px solid ${t.color.borderLight}`, alignItems: 'center', fontSize: t.fontSize.body }}>
                  <div style={{ ...S.mono, color: t.color.textMuted }}>{emp.employee_no}</div>
                  <div>
                    <div style={{ fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>{emp.full_name}</div>
                    <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted }}>{emp.department || '-'}</div>
                  </div>
                  <div style={{ color: t.color.textSecondary }}>{emp.job_title || '-'}</div>
                  <div style={{ ...S.mono, color: t.color.textSecondary }}>{emp.phone || '-'}</div>
                  <div style={{ ...S.mono, color: t.color.textSecondary }}>{emp.hire_date || '-'}</div>
                  <div><Tag {...(STATUS_MAP[emp.status] || { label: emp.status, color: '#999' })} /></div>
                  <div><button onClick={() => openEdit(emp)} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: t.fontSize.tiny }}>編輯</button></div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
      <Pager page={data.page || 1} limit={data.limit || 20} total={data.total || 0} onPageChange={(p) => { setPage(p); load(p); }} />

      {/* Employee Form Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editingEmployee ? '編輯員工' : '新增員工'} width={600}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 16px' }}>
          <Field label="姓名" required><input value={form.full_name || ''} onChange={(e) => setForm({ ...form, full_name: e.target.value })} style={S.input} /></Field>
          <Field label="工號"><input value={form.employee_no || ''} onChange={(e) => setForm({ ...form, employee_no: e.target.value })} placeholder="自動產生" style={S.input} /></Field>
          <Field label="部門"><input value={form.department || ''} onChange={(e) => setForm({ ...form, department: e.target.value })} style={S.input} /></Field>
          <Field label="職稱"><input value={form.job_title || ''} onChange={(e) => setForm({ ...form, job_title: e.target.value })} style={S.input} /></Field>
          <Field label="電話"><input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={S.input} /></Field>
          <Field label="Email"><input value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} style={S.input} /></Field>
          <Field label="到職日" required><input type="date" value={form.hire_date || ''} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} style={S.input} /></Field>
          <Field label="僱用類型">
            <select value={form.employment_type || 'full_time'} onChange={(e) => setForm({ ...form, employment_type: e.target.value })} style={S.input}>
              <option value="full_time">正職</option>
              <option value="part_time">兼職</option>
              <option value="contract">約聘</option>
              <option value="intern">實習</option>
            </select>
          </Field>
          <Field label="性別">
            <select value={form.gender || ''} onChange={(e) => setForm({ ...form, gender: e.target.value })} style={S.input}>
              <option value="">未填</option>
              <option value="male">男</option>
              <option value="female">女</option>
              <option value="other">其他</option>
            </select>
          </Field>
          <Field label="生日"><input type="date" value={form.birth_date || ''} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} style={S.input} /></Field>
          <Field label="底薪"><input type="number" value={form.base_salary || ''} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} placeholder="月薪" style={S.input} /></Field>
          <Field label="地址"><input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} style={S.input} /></Field>
        </div>
        <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: t.color.textMuted, letterSpacing: 1, margin: '16px 0 10px' }}>EMERGENCY CONTACT</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '0 12px' }}>
          <Field label="緊急聯絡人"><input value={form.emergency_contact_name || ''} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} style={S.input} /></Field>
          <Field label="聯絡電話"><input value={form.emergency_contact_phone || ''} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} style={S.input} /></Field>
          <Field label="關係"><input value={form.emergency_contact_relation || ''} onChange={(e) => setForm({ ...form, emergency_contact_relation: e.target.value })} style={S.input} /></Field>
        </div>
        {editingEmployee && (
          <Field label="狀態">
            <select value={form.status || 'active'} onChange={(e) => setForm({ ...form, status: e.target.value })} style={S.input}>
              <option value="active">在職</option>
              <option value="resigned">離職</option>
              <option value="on_leave">留停</option>
              <option value="terminated">解僱</option>
            </select>
          </Field>
        )}
        {editingEmployee && form.status === 'resigned' && (
          <Field label="離職日期"><input type="date" value={form.resignation_date || ''} onChange={(e) => setForm({ ...form, resignation_date: e.target.value })} style={S.input} /></Field>
        )}
        {msg && <div style={{ color: t.color.error, fontSize: t.fontSize.tiny, marginBottom: 10 }}>{msg}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={handleSave} disabled={saving} style={{ ...S.btnPrimary, flex: 1, opacity: saving ? 0.7 : 1 }}>{saving ? '儲存中...' : '儲存'}</button>
          <button onClick={() => setShowForm(false)} style={{ ...S.btnGhost, flex: 1 }}>取消</button>
        </div>
      </Modal>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// ATTENDANCE MANAGEMENT
// ══════════════════════════════════════════════════════
function AttendanceManagement() {
  const { isMobile } = useResponsive();
  const [view, setView] = useState('summary'); // summary | detail
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [summary, setSummary] = useState([]);
  const [records, setRecords] = useState({ records: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const loadSummary = useCallback(async (m = month) => {
    setLoading(true);
    try {
      const res = await apiGet({ action: 'hr_attendance_summary', month: m });
      setSummary(res.summary || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [month]);

  const loadDetail = useCallback(async (m = month) => {
    setLoading(true);
    try {
      const res = await apiGet({ action: 'hr_attendance', month: m, limit: '200' });
      setRecords(res);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [month]);

  useEffect(() => {
    apiGet({ action: 'hr_employees', status: 'active', limit: '200' }).then(r => setEmployees(r.employees || []));
    loadSummary();
  }, []);

  const reload = (m) => {
    setMonth(m);
    if (view === 'summary') loadSummary(m); else loadDetail(m);
  };

  const openManualEntry = () => {
    setForm({ employee_id: '', date: new Date().toISOString().slice(0, 10), clock_in: '09:00', clock_out: '18:00', status: 'present', overtime_hours: 0, note: '' });
    setMsg('');
    setShowForm(true);
  };

  const handleSaveAttendance = async () => {
    if (!form.employee_id) { setMsg('請選擇員工'); return; }
    if (!form.date) { setMsg('請選擇日期'); return; }
    setSaving(true);
    setMsg('');
    try {
      const clockIn = form.clock_in ? `${form.date}T${form.clock_in}:00+08:00` : null;
      const clockOut = form.clock_out ? `${form.date}T${form.clock_out}:00+08:00` : null;
      const res = await apiPost({
        action: 'hr_upsert_attendance',
        employee_id: form.employee_id, date: form.date,
        clock_in: clockIn, clock_out: clockOut,
        status: form.status, overtime_hours: Number(form.overtime_hours || 0), note: form.note,
      });
      if (res?.ok) { setShowForm(false); reload(month); }
      else { setMsg(res?.error || '儲存失敗'); }
    } catch (e) { setMsg(e.message); }
    setSaving(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="month" value={month} onChange={(e) => reload(e.target.value)} style={{ ...S.input, width: 160 }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {[['summary', '月報'], ['detail', '明細']].map(([v, l]) => (
            <button key={v} onClick={() => { setView(v); if (v === 'summary') loadSummary(month); else loadDetail(month); }} style={{
              ...S.btnGhost, padding: '6px 14px', fontSize: t.fontSize.tiny,
              background: view === v ? t.color.infoBg : 'transparent',
              borderColor: view === v ? '#93c5fd' : t.color.border,
              color: view === v ? t.color.link : t.color.textMuted,
            }}>{l}</button>
          ))}
        </div>
        <button onClick={openManualEntry} style={{ ...S.btnPrimary, marginLeft: 'auto', whiteSpace: 'nowrap' }}>+ 手動登記</button>
      </div>

      {loading ? <Loading /> : view === 'summary' ? (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          {summary.length === 0 ? <div style={{ padding: 20 }}><EmptyState text="本月無出勤資料" /></div> : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 50px 50px 50px 50px 60px' : '1fr 80px 80px 80px 80px 80px 80px', gap: 8, padding: '12px 18px', borderBottom: `1px solid ${t.color.border}`, fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: t.color.textMuted }}>
                <div>員工</div><div style={{ textAlign: 'center' }}>出勤</div><div style={{ textAlign: 'center' }}>遲到</div><div style={{ textAlign: 'center' }}>缺勤</div><div style={{ textAlign: 'center' }}>請假</div>{!isMobile && <div style={{ textAlign: 'center' }}>加班(h)</div>}<div style={{ textAlign: 'center' }}>合計</div>
              </div>
              {summary.map(s => (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 50px 50px 50px 50px 60px' : '1fr 80px 80px 80px 80px 80px 80px', gap: 8, padding: '12px 18px', borderBottom: `1px solid ${t.color.borderLight}`, alignItems: 'center', fontSize: t.fontSize.body }}>
                  <div>
                    <div style={{ fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>{s.full_name}</div>
                    <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted }}>{s.employee_no} · {s.department || '-'}</div>
                  </div>
                  <div style={{ textAlign: 'center', color: t.color.brand, fontWeight: t.fontWeight.semibold, ...S.mono }}>{s.present}</div>
                  <div style={{ textAlign: 'center', color: s.late > 0 ? t.color.warning : t.color.textDisabled, fontWeight: t.fontWeight.semibold, ...S.mono }}>{s.late}</div>
                  <div style={{ textAlign: 'center', color: s.absent > 0 ? t.color.error : t.color.textDisabled, fontWeight: t.fontWeight.semibold, ...S.mono }}>{s.absent}</div>
                  <div style={{ textAlign: 'center', color: t.color.link, ...S.mono }}>{s.leave}</div>
                  {!isMobile && <div style={{ textAlign: 'center', ...S.mono }}>{s.overtime_hours}</div>}
                  <div style={{ textAlign: 'center', fontWeight: t.fontWeight.semibold, ...S.mono }}>{s.total_days}</div>
                </div>
              ))}
            </>
          )}
        </div>
      ) : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          {(records.records || []).length === 0 ? <div style={{ padding: 20 }}><EmptyState text="無出勤明細" /></div> : (records.records || []).map(r => (
            <div key={r.id} style={{ padding: '12px 18px', borderBottom: `1px solid ${t.color.borderLight}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>{r.employee?.full_name || '-'} <span style={{ color: t.color.textMuted, fontWeight: t.fontWeight.normal, fontSize: t.fontSize.tiny }}>{r.date}</span></div>
                <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginTop: 2, ...S.mono }}>
                  {r.clock_in ? new Date(r.clock_in).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) : '--:--'} → {r.clock_out ? new Date(r.clock_out).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                  {r.overtime_hours > 0 && <span style={{ color: t.color.warning }}> +{r.overtime_hours}h</span>}
                </div>
              </div>
              <Tag {...(ATT_STATUS[r.status] || { label: r.status, color: '#999' })} />
            </div>
          ))}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="手動登記出勤">
        <Field label="員工" required>
          <select value={form.employee_id || ''} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} style={S.input}>
            <option value="">選擇員工</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_no})</option>)}
          </select>
        </Field>
        <Field label="日期" required><input type="date" value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} style={S.input} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="上班時間"><input type="time" value={form.clock_in || ''} onChange={(e) => setForm({ ...form, clock_in: e.target.value })} style={S.input} /></Field>
          <Field label="下班時間"><input type="time" value={form.clock_out || ''} onChange={(e) => setForm({ ...form, clock_out: e.target.value })} style={S.input} /></Field>
        </div>
        <Field label="狀態">
          <select value={form.status || 'present'} onChange={(e) => setForm({ ...form, status: e.target.value })} style={S.input}>
            {Object.entries(ATT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="加班時數"><input type="number" value={form.overtime_hours || 0} onChange={(e) => setForm({ ...form, overtime_hours: e.target.value })} style={S.input} /></Field>
        <Field label="備註"><input value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} style={S.input} /></Field>
        {msg && <div style={{ color: t.color.error, fontSize: t.fontSize.tiny, marginBottom: 10 }}>{msg}</div>}
        <button onClick={handleSaveAttendance} disabled={saving} style={{ ...S.btnPrimary, width: '100%', marginTop: 8, opacity: saving ? 0.7 : 1 }}>{saving ? '儲存中...' : '儲存'}</button>
      </Modal>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// LEAVE MANAGEMENT
// ══════════════════════════════════════════════════════
function LeaveManagement() {
  const { isMobile } = useResponsive();
  const [data, setData] = useState({ requests: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async (s = statusFilter) => {
    setLoading(true);
    try {
      const res = await apiGet({ action: 'hr_leave_requests', status: s, limit: '50' });
      setData(res);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    load();
    apiGet({ action: 'hr_employees', status: 'active', limit: '200' }).then(r => setEmployees(r.employees || []));
    apiGet({ action: 'hr_leave_types' }).then(r => setLeaveTypes(r.leave_types || []));
  }, []);

  const openNew = () => {
    setForm({ employee_id: '', leave_type_id: '', start_date: '', end_date: '', days: 1, reason: '' });
    setMsg('');
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.employee_id || !form.leave_type_id || !form.start_date || !form.end_date) { setMsg('請填寫必要欄位'); return; }
    setSaving(true);
    setMsg('');
    try {
      const res = await apiPost({ action: 'hr_create_leave', ...form, days: Number(form.days || 1) });
      if (res?.ok) { setShowForm(false); load(); }
      else { setMsg(res?.error || '申請失敗'); }
    } catch (e) { setMsg(e.message); }
    setSaving(false);
  };

  const handleAction = async (id, status) => {
    try {
      await apiPost({ action: 'hr_update_leave_status', id, status });
      load();
    } catch (e) { console.error(e); }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['', '全部'], ['pending', '待審'], ['approved', '已核'], ['rejected', '駁回']].map(([v, l]) => (
            <button key={v} onClick={() => { setStatusFilter(v); load(v); }} style={{
              ...S.btnGhost, padding: '6px 14px', fontSize: t.fontSize.tiny,
              background: statusFilter === v ? t.color.infoBg : 'transparent',
              borderColor: statusFilter === v ? '#93c5fd' : t.color.border,
              color: statusFilter === v ? t.color.link : t.color.textMuted,
            }}>{l}</button>
          ))}
        </div>
        <button onClick={openNew} style={{ ...S.btnPrimary, marginLeft: 'auto', whiteSpace: 'nowrap' }}>+ 新增假單</button>
      </div>

      {loading ? <Loading /> : data.requests.length === 0 ? <EmptyState text="無假單資料" /> : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          {data.requests.map(r => (
            <div key={r.id} style={{ padding: '14px 18px', borderBottom: `1px solid ${t.color.borderLight}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div>
                  <span style={{ fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>{r.employee?.full_name || '-'}</span>
                  <span style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginLeft: 8 }}>{r.employee?.employee_no} · {r.employee?.department || '-'}</span>
                </div>
                <Tag {...(LEAVE_STATUS[r.status] || { label: r.status, color: '#999' })} />
              </div>
              <div style={{ fontSize: t.fontSize.tiny, color: t.color.textSecondary, marginBottom: 4 }}>
                <Tag label={r.leave_type?.label || '假別'} color={t.color.link} />
                <span style={{ marginLeft: 8, ...S.mono }}>{r.start_date} → {r.end_date}</span>
                <span style={{ marginLeft: 8, color: t.color.textMuted }}>{r.days} 天</span>
              </div>
              {r.reason && <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted }}>{r.reason}</div>}
              {r.status === 'pending' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={() => handleAction(r.id, 'approved')} style={{ ...S.btnPrimary, padding: '4px 14px', fontSize: t.fontSize.tiny }}>核准</button>
                  <button onClick={() => handleAction(r.id, 'rejected')} style={{ ...S.btnGhost, padding: '4px 14px', fontSize: t.fontSize.tiny, color: t.color.error, borderColor: t.color.error }}>駁回</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="新增假單">
        <Field label="員工" required>
          <select value={form.employee_id || ''} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} style={S.input}>
            <option value="">選擇員工</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_no})</option>)}
          </select>
        </Field>
        <Field label="假別" required>
          <select value={form.leave_type_id || ''} onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })} style={S.input}>
            <option value="">選擇假別</option>
            {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.label}</option>)}
          </select>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 12 }}>
          <Field label="開始日期" required><input type="date" value={form.start_date || ''} onChange={(e) => setForm({ ...form, start_date: e.target.value })} style={S.input} /></Field>
          <Field label="結束日期" required><input type="date" value={form.end_date || ''} onChange={(e) => setForm({ ...form, end_date: e.target.value })} style={S.input} /></Field>
          <Field label="天數"><input type="number" value={form.days || 1} onChange={(e) => setForm({ ...form, days: e.target.value })} style={S.input} /></Field>
        </div>
        <Field label="事由"><input value={form.reason || ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} style={S.input} /></Field>
        {msg && <div style={{ color: t.color.error, fontSize: t.fontSize.tiny, marginBottom: 10 }}>{msg}</div>}
        <button onClick={handleSubmit} disabled={saving} style={{ ...S.btnPrimary, width: '100%', marginTop: 8, opacity: saving ? 0.7 : 1 }}>{saving ? '送出中...' : '送出申請'}</button>
      </Modal>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// PAYROLL MANAGEMENT
// ══════════════════════════════════════════════════════
function PayrollManagement() {
  const { isMobile } = useResponsive();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState({ payroll: [], total: 0, totals: {} });
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async (m = month) => {
    setLoading(true);
    try {
      const res = await apiGet({ action: 'hr_payroll', month: m, limit: '100' });
      setData(res);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [month]);

  useEffect(() => { load(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setMsg('');
    try {
      const res = await apiPost({ action: 'hr_generate_payroll', year_month: month });
      if (res?.ok) { setMsg(`已產生 ${res.count} 筆薪資單`); load(month); }
      else { setMsg(res?.error || '產生失敗'); }
    } catch (e) { setMsg(e.message); }
    setGenerating(false);
  };

  const handleBatchStatus = async (status) => {
    const ids = data.payroll.filter(p => status === 'confirmed' ? p.status === 'draft' : p.status === 'confirmed').map(p => p.id);
    if (ids.length === 0) return;
    try {
      await apiPost({ action: 'hr_batch_payroll_status', ids, status });
      load(month);
    } catch (e) { console.error(e); }
  };

  const totals = data.totals || {};

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="month" value={month} onChange={(e) => { setMonth(e.target.value); load(e.target.value); }} style={{ ...S.input, width: 160 }} />
        <button onClick={handleGenerate} disabled={generating} style={{ ...S.btnPrimary, whiteSpace: 'nowrap', opacity: generating ? 0.7 : 1 }}>{generating ? '產生中...' : '產生薪資單'}</button>
        <button onClick={() => handleBatchStatus('confirmed')} style={{ ...S.btnGhost, whiteSpace: 'nowrap' }}>全部確認</button>
        <button onClick={() => handleBatchStatus('paid')} style={{ ...S.btnGhost, whiteSpace: 'nowrap', color: t.color.brand, borderColor: t.color.brand }}>全部發放</button>
      </div>

      {msg && <div style={{ ...S.card, background: msg.includes('失敗') ? t.color.errorBg : t.color.successBg, borderColor: msg.includes('失敗') ? '#fecaca' : '#a7f3d0', color: msg.includes('失敗') ? t.color.error : t.color.brand, fontSize: t.fontSize.caption, marginBottom: 14 }}>{msg}</div>}

      {/* Totals */}
      {data.payroll.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
          <StatCard code="GROSS" label="應發總額" value={fmtP(totals.gross)} tone="blue" />
          <StatCard code="NET" label="實發總額" value={fmtP(totals.net)} tone="green" />
          <StatCard code="TAX" label="所得稅" value={fmtP(totals.tax)} tone="yellow" />
          <StatCard code="LI" label="勞保" value={fmtP(totals.labor)} tone="red" />
          <StatCard code="HI" label="健保" value={fmtP(totals.health)} tone="red" />
        </div>
      )}

      {loading ? <Loading /> : data.payroll.length === 0 ? <EmptyState text="本月無薪資單，請先產生" /> : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden', overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 90px 90px 80px' : '1fr 100px 100px 100px 100px 100px 100px 80px', gap: 8, padding: '12px 18px', borderBottom: `1px solid ${t.color.border}`, fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: t.color.textMuted, minWidth: isMobile ? 400 : 'auto' }}>
            <div>員工</div>
            <div style={{ textAlign: 'right' }}>底薪</div>
            {!isMobile && <div style={{ textAlign: 'right' }}>加班費</div>}
            {!isMobile && <div style={{ textAlign: 'right' }}>勞保</div>}
            {!isMobile && <div style={{ textAlign: 'right' }}>健保</div>}
            <div style={{ textAlign: 'right' }}>應發</div>
            <div style={{ textAlign: 'right' }}>實發</div>
            <div>狀態</div>
          </div>
          {data.payroll.map(p => (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 90px 90px 80px' : '1fr 100px 100px 100px 100px 100px 100px 80px', gap: 8, padding: '12px 18px', borderBottom: `1px solid ${t.color.borderLight}`, alignItems: 'center', fontSize: t.fontSize.body, minWidth: isMobile ? 400 : 'auto' }}>
              <div>
                <div style={{ fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>{p.employee?.full_name || '-'}</div>
                <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted }}>{p.employee?.employee_no}</div>
              </div>
              <div style={{ textAlign: 'right', ...S.mono }}>{fmtP(p.base_salary)}</div>
              {!isMobile && <div style={{ textAlign: 'right', ...S.mono }}>{fmtP(p.overtime_pay)}</div>}
              {!isMobile && <div style={{ textAlign: 'right', ...S.mono, color: t.color.textMuted }}>{fmtP(p.labor_insurance_employee)}</div>}
              {!isMobile && <div style={{ textAlign: 'right', ...S.mono, color: t.color.textMuted }}>{fmtP(p.health_insurance_employee)}</div>}
              <div style={{ textAlign: 'right', ...S.mono }}>{fmtP(p.gross_pay)}</div>
              <div style={{ textAlign: 'right', fontWeight: t.fontWeight.bold, color: t.color.brand, ...S.mono }}>{fmtP(p.net_pay)}</div>
              <div><Tag {...(PAYROLL_STATUS[p.status] || { label: p.status, color: '#999' })} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// MAIN HR MODULE
// ══════════════════════════════════════════════════════
export default function HRModule() {
  const { isMobile } = useResponsive();
  const [subTab, setSubTab] = useState('dashboard');

  return (
    <div>
      <PageLead eyebrow="Human Resources" title="人力資源管理" description="員工檔案、出勤管理、請假審核、薪資計算。" />

      {/* Sub-tab bar */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto', paddingBottom: 4,
        borderBottom: `1px solid ${t.color.borderLight}`,
      }}>
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: isMobile ? '8px 12px' : '10px 18px',
              fontSize: isMobile ? t.fontSize.tiny : t.fontSize.caption,
              fontWeight: subTab === tab.id ? t.fontWeight.bold : t.fontWeight.medium,
              color: subTab === tab.id ? t.color.brand : t.color.textMuted,
              borderBottom: `2px solid ${subTab === tab.id ? t.color.brand : 'transparent'}`,
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
          >
            {!isMobile && <span style={{ marginRight: 6 }}>{tab.icon}</span>}{tab.label}
          </button>
        ))}
      </div>

      {subTab === 'dashboard' && <HRDashboard />}
      {subTab === 'employees' && <EmployeeManagement />}
      {subTab === 'attendance' && <AttendanceManagement />}
      {subTab === 'leave' && <LeaveManagement />}
      {subTab === 'payroll' && <PayrollManagement />}
    </div>
  );
}
