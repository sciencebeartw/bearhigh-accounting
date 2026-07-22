import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildClassTransferRecords,
  validateClassTransfer
} from '../public/js/transfers.mjs';
import {
  PAYROLL_MODES,
  payrollAmountForSession,
  resolvePayrollRule
} from '../public/js/payroll-rules.mjs';
import {
  buildSessionHeadcountRows,
  effectiveSessionsForEvents,
  parseCourseSessionDates
} from '../public/js/sessions.mjs';

const huangCourse = {
  id: 'course_high1_zhuzhong_huang',
  courseName: '115高一竹中數學',
  subject: '數學',
  term: '115學年度上學期',
  teacherName: '黃浩數學'
};

const mingxuanCourse = {
  id: 'course_high1_zhuzhong_mingxuan',
  courseName: '115高一明軒數學',
  subject: '數學',
  term: '115學年度上學期',
  teacherName: '明軒數學'
};

test('same-subject transfer creates paired roster events with no tuition impact', () => {
  const result = buildClassTransferRecords({
    id: 'transfer_1',
    createdAt: '2026-07-22T00:00:00.000Z',
    studentId: 'student_1',
    studentName: '測試學生',
    fromCourse: huangCourse,
    toCourse: mingxuanCourse,
    effectiveDate: '2026-08-15',
    transferType: 'permanent',
    reason: '學校進度'
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.transfer.tuitionImpact, 0);
  assert.equal(result.transfer.packageImpact, 0);
  assert.deepEqual(result.membershipEvents.map((event) => [event.courseId, event.action]), [
    [huangCourse.id, '退出'],
    [mingxuanCourse.id, '加入']
  ]);
});

test('temporary transfer creates a return pair and preserves split headcount', () => {
  const result = buildClassTransferRecords({
    id: 'transfer_2',
    createdAt: '2026-07-22T00:00:00.000Z',
    studentId: 'student_1',
    studentName: '測試學生',
    fromCourse: huangCourse,
    toCourse: mingxuanCourse,
    effectiveDate: '2026-08-08',
    transferType: 'temporary',
    returnDate: '2026-08-22',
    reason: '學校進度'
  });
  const sessions = parseCourseSessionDates('2026-08-01\n2026-08-08\n2026-08-15\n2026-08-22\n2026-08-29');
  const originalEvents = result.membershipEvents.filter((event) => event.courseId === huangCourse.id);
  const destinationEvents = result.membershipEvents.filter((event) => event.courseId === mingxuanCourse.id);
  const originalEffective = effectiveSessionsForEvents(5, originalEvents, sessions, { initiallyActive: true });
  const destinationEffective = effectiveSessionsForEvents(5, destinationEvents, sessions, { initiallyActive: false });

  assert.deepEqual(originalEffective.activeSessionNos, [1, 4, 5]);
  assert.deepEqual(destinationEffective.activeSessionNos, [2, 3]);
  const originalRows = buildSessionHeadcountRows(sessions, [{ name: '測試學生', events: originalEvents, effective: originalEffective }]);
  assert.deepEqual(originalRows.map((row) => row.headcount), [1, 0, 0, 1, 1]);
  assert.deepEqual(originalRows[1].withdrawnNames, ['測試學生（轉出）']);
  assert.deepEqual(originalRows[3].joinedNames, ['測試學生（換回轉入）']);
});

test('cross-subject transfer is rejected', () => {
  const errors = validateClassTransfer({
    studentId: 'student_1',
    fromCourse: huangCourse,
    toCourse: { ...mingxuanCourse, id: 'english', courseName: '英文', subject: '英文' },
    effectiveDate: '2026-08-08',
    transferType: 'permanent'
  });
  assert.match(errors.join('\n'), /只有同科目/);
});

test('structured payroll mode overrides teacher-name inference', () => {
  const rule = resolvePayrollRule({
    course: { courseName: '數學', payrollMode: PAYROLL_MODES.perHead, headRate: 900, sharePercent: 50 },
    teacher: { name: '明軒數學', payrollMode: PAYROLL_MODES.mingxuan },
    defaults: {}
  });
  assert.equal(rule.mode, PAYROLL_MODES.perHead);
  assert.equal(payrollAmountForSession(rule, 20), 9000);
});

test('Mingxuan structured formula calculates base plus students above threshold', () => {
  const rule = resolvePayrollRule({
    teacher: {
      name: '明軒數學',
      payrollMode: PAYROLL_MODES.mingxuan,
      baseRate: 4500,
      threshold: 15,
      extraPerStudent: 300
    }
  });
  assert.equal(payrollAmountForSession(rule, 14), 4500);
  assert.equal(payrollAmountForSession(rule, 20), 6000);
});
