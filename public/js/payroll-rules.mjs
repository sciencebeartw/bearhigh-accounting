function number(value, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value) {
  return String(value ?? '').trim();
}

function positive(value, fallback = 0) {
  const parsed = number(value);
  return parsed > 0 ? parsed : fallback;
}

export const PAYROLL_MODES = {
  perHead: 'per_head',
  mingxuan: 'mingxuan',
  hourly: 'hourly',
  fixedSession: 'fixed_session'
};

export function resolvePayrollRule({ course = {}, teacher = {}, defaults = {} } = {}) {
  const hint = `${course.courseName || ''} ${course.payrollPayeeName || ''} ${course.teacherName || ''} ${teacher.name || ''}`;
  let mode = text(course.payrollMode) || text(teacher.payrollMode);
  if (!mode && /明軒/.test(hint)) mode = PAYROLL_MODES.mingxuan;
  if (!mode && /國文|黃道/.test(hint)) mode = PAYROLL_MODES.hourly;
  if (!mode && number(course.defaultFixedRate || teacher.defaultFixedRate) > 0) mode = PAYROLL_MODES.fixedSession;
  if (!mode) mode = PAYROLL_MODES.perHead;

  if (mode === PAYROLL_MODES.mingxuan) {
    return {
      mode,
      baseRate: positive(course.baseRate, positive(teacher.baseRate, positive(defaults.minBase, 4500))),
      threshold: positive(course.threshold, positive(teacher.threshold, positive(defaults.minThreshold, 15))),
      extraPerStudent: positive(course.extraPerStudent, positive(teacher.extraPerStudent, positive(defaults.minBonus, 300)))
    };
  }
  if (mode === PAYROLL_MODES.hourly) {
    return {
      mode,
      hourlyRate: positive(course.hourlyRate, positive(teacher.hourlyRate, positive(defaults.hourlyRate, 800))),
      hoursPerSession: positive(course.hoursPerSession, positive(teacher.hoursPerSession, positive(defaults.hourlyHours, 3)))
    };
  }
  if (mode === PAYROLL_MODES.fixedSession) {
    return {
      mode,
      fixedSessionRate: positive(course.fixedSessionRate, positive(course.defaultFixedRate, positive(teacher.fixedSessionRate, positive(teacher.defaultFixedRate))))
    };
  }
  const headRate = positive(course.headRate, positive(teacher.headRate, positive(defaults.headRate, 670)));
  const sharePercent = positive(course.sharePercent, positive(teacher.sharePercent, positive(teacher.defaultShare, positive(defaults.sharePercent, 50))));
  return {
    mode: PAYROLL_MODES.perHead,
    headRate,
    sharePercent,
    teacherPerHead: Math.round(headRate * (sharePercent / 100))
  };
}

export function payrollRuleLabel(rule = {}) {
  if (rule.mode === PAYROLL_MODES.mingxuan) return `保底 ${rule.baseRate} + 超過 ${rule.threshold} 人每人 ${rule.extraPerStudent}`;
  if (rule.mode === PAYROLL_MODES.hourly) return `鐘點 ${rule.hourlyRate} x ${rule.hoursPerSession} 小時`;
  if (rule.mode === PAYROLL_MODES.fixedSession) return `固定 ${rule.fixedSessionRate} / 堂`;
  return `人均堂收 ${rule.headRate} x 分潤 ${rule.sharePercent}%`;
}

export function payrollAmountForSession(rule = {}, headcount = 0) {
  const people = Math.max(0, number(headcount));
  if (rule.mode === PAYROLL_MODES.mingxuan) return Math.round(rule.baseRate + Math.max(0, people - rule.threshold) * rule.extraPerStudent);
  if (rule.mode === PAYROLL_MODES.hourly) return Math.round(rule.hourlyRate * rule.hoursPerSession);
  if (rule.mode === PAYROLL_MODES.fixedSession) return Math.round(rule.fixedSessionRate || 0);
  return Math.round(number(rule.teacherPerHead) * people);
}
