// lib/admin/actions-hr.js — HR Module: Employees, Attendance, Leave, Payroll
import { supabase } from '@/lib/supabase';

// ── Helpers ──
function paginate(searchParams) {
  const page = Math.max(1, parseInt(searchParams?.get?.('page') || '1', 10));
  const limit = Math.min(parseInt(searchParams?.get?.('limit') || '20', 10), 200);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  return { page, limit, from, to };
}

// ══════════════════════════════════════════════════════
// GET ACTIONS
// ══════════════════════════════════════════════════════
export async function handleHrGetAction(action, searchParams) {
  switch (action) {

    // ── Employee List ──
    case 'hr_employees': {
      const { page, limit, from, to } = paginate(searchParams);
      const search = searchParams.get('search') || '';
      const status = searchParams.get('status') || '';

      let query = supabase.from('hr_employees')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (status) query = query.eq('status', status);
      if (search) {
        query = query.or(`full_name.ilike.%${search}%,employee_no.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,department.ilike.%${search}%`);
      }

      const { data, count, error } = await query.range(from, to);
      if (error) return Response.json({ error: error.message }, { status: 500 });

      // Summary stats
      const { data: statsData } = await supabase.from('hr_employees').select('status');
      const stats = {
        total: statsData?.length || 0,
        active: statsData?.filter(e => e.status === 'active').length || 0,
        resigned: statsData?.filter(e => e.status === 'resigned').length || 0,
        on_leave: statsData?.filter(e => e.status === 'on_leave').length || 0,
      };

      return Response.json({ employees: data || [], total: count || 0, page, limit, stats });
    }

    // ── Single Employee ──
    case 'hr_employee_detail': {
      const id = searchParams.get('id');
      if (!id) return Response.json({ error: '缺少 id' }, { status: 400 });

      const { data, error } = await supabase.from('hr_employees')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      if (!data) return Response.json({ error: '找不到員工' }, { status: 404 });

      // Get leave balance
      const { data: leaves } = await supabase.from('hr_leave_requests')
        .select('*, leave_type:hr_leave_types(*)')
        .eq('employee_id', id)
        .eq('status', 'approved')
        .gte('start_date', `${new Date().getFullYear()}-01-01`);

      // Get recent attendance
      const { data: attendance } = await supabase.from('hr_attendance')
        .select('*')
        .eq('employee_id', id)
        .order('date', { ascending: false })
        .limit(30);

      return Response.json({ employee: data, leaves: leaves || [], attendance: attendance || [] });
    }

    // ── Leave Types ──
    case 'hr_leave_types': {
      const { data } = await supabase.from('hr_leave_types')
        .select('*')
        .order('sort_order', { ascending: true });
      return Response.json({ leave_types: data || [] });
    }

    // ── Leave Requests ──
    case 'hr_leave_requests': {
      const { page, limit, from, to } = paginate(searchParams);
      const status = searchParams.get('status') || '';
      const employeeId = searchParams.get('employee_id') || '';

      let query = supabase.from('hr_leave_requests')
        .select('*, employee:hr_employees(full_name, employee_no, department), leave_type:hr_leave_types(label, code)', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (status) query = query.eq('status', status);
      if (employeeId) query = query.eq('employee_id', employeeId);

      const { data, count, error } = await query.range(from, to);
      if (error) return Response.json({ error: error.message }, { status: 500 });

      return Response.json({ requests: data || [], total: count || 0, page, limit });
    }

    // ── Attendance List ──
    case 'hr_attendance': {
      const { page, limit, from, to } = paginate(searchParams);
      const date = searchParams.get('date') || '';
      const employeeId = searchParams.get('employee_id') || '';
      const month = searchParams.get('month') || ''; // YYYY-MM

      let query = supabase.from('hr_attendance')
        .select('*, employee:hr_employees(full_name, employee_no, department)', { count: 'exact' })
        .order('date', { ascending: false });

      if (date) query = query.eq('date', date);
      if (employeeId) query = query.eq('employee_id', employeeId);
      if (month) {
        query = query.gte('date', `${month}-01`);
        const [y, m] = month.split('-').map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        query = query.lte('date', `${month}-${String(lastDay).padStart(2, '0')}`);
      }

      const { data, count, error } = await query.range(from, to);
      if (error) return Response.json({ error: error.message }, { status: 500 });

      return Response.json({ records: data || [], total: count || 0, page, limit });
    }

    // ── Attendance Summary (for a month) ──
    case 'hr_attendance_summary': {
      const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
      const [y, m] = month.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const from = `${month}-01`;
      const to = `${month}-${String(lastDay).padStart(2, '0')}`;

      const { data: employees } = await supabase.from('hr_employees')
        .select('id, full_name, employee_no, department')
        .eq('status', 'active');

      const { data: records } = await supabase.from('hr_attendance')
        .select('*')
        .gte('date', from)
        .lte('date', to);

      const summary = (employees || []).map(emp => {
        const empRecords = (records || []).filter(r => r.employee_id === emp.id);
        return {
          ...emp,
          present: empRecords.filter(r => r.status === 'present').length,
          late: empRecords.filter(r => r.status === 'late').length,
          absent: empRecords.filter(r => r.status === 'absent').length,
          leave: empRecords.filter(r => r.status === 'leave').length,
          overtime_hours: empRecords.reduce((s, r) => s + Number(r.overtime_hours || 0), 0),
          total_days: empRecords.length,
        };
      });

      return Response.json({ summary, month, work_days: lastDay });
    }

    // ── Payroll List ──
    case 'hr_payroll': {
      const { page, limit, from: rangeFrom, to: rangeTo } = paginate(searchParams);
      const month = searchParams.get('month') || '';
      const status = searchParams.get('status') || '';

      let query = supabase.from('hr_payroll')
        .select('*, employee:hr_employees(full_name, employee_no, department)', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (month) query = query.eq('year_month', month);
      if (status) query = query.eq('status', status);

      const { data, count, error } = await query.range(rangeFrom, rangeTo);
      if (error) return Response.json({ error: error.message }, { status: 500 });

      // Totals for the month
      let totals = { gross: 0, net: 0, tax: 0, labor: 0, health: 0 };
      if (month) {
        const { data: allMonth } = await supabase.from('hr_payroll')
          .select('gross_pay, net_pay, income_tax, labor_insurance_employee, health_insurance_employee')
          .eq('year_month', month);
        (allMonth || []).forEach(r => {
          totals.gross += Number(r.gross_pay || 0);
          totals.net += Number(r.net_pay || 0);
          totals.tax += Number(r.income_tax || 0);
          totals.labor += Number(r.labor_insurance_employee || 0);
          totals.health += Number(r.health_insurance_employee || 0);
        });
      }

      return Response.json({ payroll: data || [], total: count || 0, page, limit, totals });
    }

    // ── HR Dashboard Stats ──
    case 'hr_dashboard': {
      const [empRes, leaveRes, attRes] = await Promise.all([
        supabase.from('hr_employees').select('status, department, hire_date'),
        supabase.from('hr_leave_requests').select('status, days').eq('status', 'pending'),
        supabase.from('hr_attendance').select('status, date').eq('date', new Date().toISOString().slice(0, 10)),
      ]);

      const employees = empRes.data || [];
      const pendingLeaves = leaveRes.data || [];
      const todayAttendance = attRes.data || [];

      // Department breakdown
      const deptMap = {};
      employees.filter(e => e.status === 'active').forEach(e => {
        const d = e.department || '未分配';
        deptMap[d] = (deptMap[d] || 0) + 1;
      });

      return Response.json({
        stats: {
          total_employees: employees.length,
          active: employees.filter(e => e.status === 'active').length,
          resigned: employees.filter(e => e.status === 'resigned').length,
          pending_leaves: pendingLeaves.length,
          today_present: todayAttendance.filter(a => a.status === 'present').length,
          today_absent: todayAttendance.filter(a => a.status === 'absent').length,
          today_late: todayAttendance.filter(a => a.status === 'late').length,
        },
        departments: Object.entries(deptMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      });
    }

    default:
      return null; // Not an HR action
  }
}

// ══════════════════════════════════════════════════════
// POST ACTIONS
// ══════════════════════════════════════════════════════
export async function handleHrPostAction(action, body) {
  switch (action) {

    // ── Create/Update Employee ──
    case 'hr_upsert_employee': {
      const { id, ...fields } = body;
      fields.updated_at = new Date().toISOString();

      if (id) {
        const { data, error } = await supabase.from('hr_employees')
          .update(fields).eq('id', id).select().maybeSingle();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true, employee: data });
      } else {
        // Auto-generate employee_no if not provided
        if (!fields.employee_no) {
          const { count } = await supabase.from('hr_employees').select('*', { count: 'exact', head: true });
          fields.employee_no = `EMP${String((count || 0) + 1).padStart(4, '0')}`;
        }
        const { data, error } = await supabase.from('hr_employees')
          .insert(fields).select().maybeSingle();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true, employee: data });
      }
    }

    // ── Delete Employee ──
    case 'hr_delete_employee': {
      const { id } = body;
      if (!id) return Response.json({ error: '缺少 id' }, { status: 400 });
      const { error } = await supabase.from('hr_employees').delete().eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ── Create Leave Request ──
    case 'hr_create_leave': {
      const { employee_id, leave_type_id, start_date, end_date, days, reason } = body;
      if (!employee_id || !leave_type_id || !start_date || !end_date) {
        return Response.json({ error: '請填寫必要欄位' }, { status: 400 });
      }
      const { data, error } = await supabase.from('hr_leave_requests')
        .insert({ employee_id, leave_type_id, start_date, end_date, days: days || 1, reason })
        .select('*, employee:hr_employees(full_name), leave_type:hr_leave_types(label)')
        .maybeSingle();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true, request: data });
    }

    // ── Approve/Reject Leave ──
    case 'hr_update_leave_status': {
      const { id, status, approved_by, reject_reason } = body;
      if (!id || !status) return Response.json({ error: '缺少參數' }, { status: 400 });
      const updates = { status, updated_at: new Date().toISOString() };
      if (status === 'approved') {
        updates.approved_by = approved_by || null;
        updates.approved_at = new Date().toISOString();
      }
      if (status === 'rejected') updates.reject_reason = reject_reason || '';
      const { data, error } = await supabase.from('hr_leave_requests')
        .update(updates).eq('id', id).select().maybeSingle();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true, request: data });
    }

    // ── Clock In/Out ──
    case 'hr_clock': {
      const { employee_id, type } = body; // type: 'in' or 'out'
      const today = new Date().toISOString().slice(0, 10);
      const now = new Date().toISOString();

      if (!employee_id || !type) return Response.json({ error: '缺少參數' }, { status: 400 });

      // Check existing record for today
      const { data: existing } = await supabase.from('hr_attendance')
        .select('*')
        .eq('employee_id', employee_id)
        .eq('date', today)
        .maybeSingle();

      if (type === 'in') {
        if (existing) {
          return Response.json({ error: '今天已經打過上班卡' }, { status: 400 });
        }
        // Late if after 09:00
        const hour = new Date().getHours();
        const status = hour >= 9 ? 'late' : 'present';

        const { data, error } = await supabase.from('hr_attendance')
          .insert({ employee_id, date: today, clock_in: now, status })
          .select().maybeSingle();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true, record: data });
      }

      if (type === 'out') {
        if (!existing) {
          return Response.json({ error: '今天尚未打上班卡' }, { status: 400 });
        }
        // Calculate overtime (after 18:00)
        const hour = new Date().getHours();
        const overtime = Math.max(0, hour - 18);

        const { data, error } = await supabase.from('hr_attendance')
          .update({ clock_out: now, overtime_hours: overtime })
          .eq('id', existing.id)
          .select().maybeSingle();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true, record: data });
      }

      return Response.json({ error: 'type 必須是 in 或 out' }, { status: 400 });
    }

    // ── Batch Attendance (manual entry) ──
    case 'hr_upsert_attendance': {
      const { id, employee_id, date, clock_in, clock_out, status, overtime_hours, note } = body;
      const record = { employee_id, date, clock_in, clock_out, status, overtime_hours: overtime_hours || 0, note };

      if (id) {
        const { data, error } = await supabase.from('hr_attendance')
          .update(record).eq('id', id).select().maybeSingle();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true, record: data });
      } else {
        const { data, error } = await supabase.from('hr_attendance')
          .upsert(record, { onConflict: 'employee_id,date' }).select().maybeSingle();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true, record: data });
      }
    }

    // ── Generate Payroll ──
    case 'hr_generate_payroll': {
      const { year_month } = body;
      if (!year_month) return Response.json({ error: '請選擇月份' }, { status: 400 });

      // Get all active employees
      const { data: employees } = await supabase.from('hr_employees')
        .select('*')
        .eq('status', 'active');

      if (!employees || employees.length === 0) {
        return Response.json({ error: '沒有在職員工' }, { status: 400 });
      }

      // Get attendance for the month
      const [y, m] = year_month.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const { data: attendance } = await supabase.from('hr_attendance')
        .select('*')
        .gte('date', `${year_month}-01`)
        .lte('date', `${year_month}-${String(lastDay).padStart(2, '0')}`);

      const payrollRows = employees.map(emp => {
        const empAtt = (attendance || []).filter(a => a.employee_id === emp.id);
        const overtimeHours = empAtt.reduce((s, a) => s + Number(a.overtime_hours || 0), 0);
        const baseSalary = Number(emp.base_salary || 0);

        // Taiwan labor/health insurance approximation
        const laborInsEmp = emp.labor_insurance ? Math.round(baseSalary * 0.115 * 0.2) : 0; // ~2.3%
        const healthInsEmp = emp.health_insurance ? Math.round(baseSalary * 0.0517 * 0.3) : 0; // ~1.55%
        const overtimePay = Math.round(overtimeHours * (baseSalary / 30 / 8) * 1.34);

        const grossPay = baseSalary + overtimePay;
        const totalDeduction = laborInsEmp + healthInsEmp;
        const netPay = grossPay - totalDeduction;

        return {
          employee_id: emp.id,
          year_month,
          base_salary: baseSalary,
          overtime_pay: overtimePay,
          bonus: 0,
          allowance: 0,
          labor_insurance_employee: laborInsEmp,
          health_insurance_employee: healthInsEmp,
          income_tax: 0,
          other_deduction: 0,
          gross_pay: grossPay,
          net_pay: netPay,
          status: 'draft',
        };
      });

      const { data, error } = await supabase.from('hr_payroll')
        .upsert(payrollRows, { onConflict: 'employee_id,year_month' })
        .select('*, employee:hr_employees(full_name, employee_no)');
      if (error) return Response.json({ error: error.message }, { status: 500 });

      return Response.json({ ok: true, payroll: data || [], count: payrollRows.length });
    }

    // ── Update Payroll Row ──
    case 'hr_update_payroll': {
      const { id, ...fields } = body;
      if (!id) return Response.json({ error: '缺少 id' }, { status: 400 });
      fields.updated_at = new Date().toISOString();

      // Recalculate totals
      if (fields.base_salary !== undefined || fields.overtime_pay !== undefined || fields.bonus !== undefined || fields.allowance !== undefined) {
        const gross = Number(fields.base_salary || 0) + Number(fields.overtime_pay || 0) + Number(fields.bonus || 0) + Number(fields.allowance || 0);
        const deductions = Number(fields.labor_insurance_employee || 0) + Number(fields.health_insurance_employee || 0) + Number(fields.income_tax || 0) + Number(fields.other_deduction || 0);
        fields.gross_pay = gross;
        fields.net_pay = gross - deductions;
      }

      const { data, error } = await supabase.from('hr_payroll')
        .update(fields).eq('id', id).select().maybeSingle();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true, payroll: data });
    }

    // ── Confirm/Pay Payroll ──
    case 'hr_batch_payroll_status': {
      const { ids, status } = body;
      if (!ids || !Array.isArray(ids) || !status) return Response.json({ error: '缺少參數' }, { status: 400 });
      const updates = { status, updated_at: new Date().toISOString() };
      if (status === 'paid') updates.paid_at = new Date().toISOString();
      const { error } = await supabase.from('hr_payroll').update(updates).in('id', ids);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    default:
      return null;
  }
}
