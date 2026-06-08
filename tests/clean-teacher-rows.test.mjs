import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeCleanTeacherRows } from '../public/js/clean-teacher-rows.mjs';

const helpers = {
  normalizeText: (value) => String(value || '').trim().toLowerCase(),
  parseAmount: (value) => {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  },
  stableFallbackId: (teacherName) => `fallback:${teacherName}`,
  canonicalSubject: (teacherName) => (String(teacherName).includes('化學') ? '化學' : ''),
  inferTermLabel: (title, sheet) => `${sheet || ''} ${title || ''}`.trim()
};

test('clean teacher rows merge manual masters with imported roster blocks', () => {
  const rows = mergeCleanTeacherRows({
    ...helpers,
    masterRows: [
      { id: 'manual_teacher_zhou', name: '周逸化學', subject: '化學', courseCount: 0, enrollmentCount: 0, feeTotal: 0, courses: [] }
    ],
    rosterBlocks: [
      rosterBlock('化學師資', '114下高一化學', 35),
      rosterBlock('物理師資-Nick', '114下高二物理', 60),
      rosterBlock('周逸化學', '114下高三化學', 28)
    ]
  }).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));

  assert.deepEqual(rows.map((row) => row.name), ['化學師資', '周逸化學', '物理師資-Nick']);
  const zhou = rows.find((row) => row.name === '周逸化學');
  assert.equal(zhou.courseCount, 1);
  assert.equal(zhou.enrollmentCount, 28);
  assert.equal(zhou.courses[0].courseName, '114下高三化學');
});

test('archived manual teacher hides matching imported roster teacher', () => {
  const rows = mergeCleanTeacherRows({
    ...helpers,
    masterRows: [
      { id: 'manual_teacher_zhou', name: '周逸化學', archived: true, courseCount: 0, enrollmentCount: 0, feeTotal: 0, courses: [] }
    ],
    archivedTeacherNames: new Set(['周逸化學']),
    rosterBlocks: [
      rosterBlock('周逸化學', '114下高三化學', 28),
      rosterBlock('化學師資', '114下高一化學', 35)
    ]
  });

  assert.deepEqual(rows.map((row) => row.name), ['化學師資']);
});

function rosterBlock(teacherSheet, title, rowCount) {
  return {
    key: `${teacherSheet}::${title}`,
    teacherSheet,
    title,
    sheet: '114下',
    rowCount,
    rows: [
      { row: 1, fields: { 姓名: '測試學生', 單堂: 900 } }
    ]
  };
}
