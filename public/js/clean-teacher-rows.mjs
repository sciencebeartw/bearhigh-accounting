export function mergeCleanTeacherRows({
  masterRows = [],
  rosterBlocks = [],
  archivedTeacherNames = new Set(),
  normalizeText,
  parseAmount,
  stableFallbackId,
  canonicalSubject,
  inferTermLabel
}) {
  const rowsByTeacher = new Map();
  for (const teacher of masterRows) {
    const teacherName = String(teacher.name || '未指定老師').trim() || '未指定老師';
    const key = normalizeText(teacherName);
    if (teacher.archived || archivedTeacherNames.has(key)) continue;
    rowsByTeacher.set(key, {
      ...teacher,
      name: teacherName,
      courseCount: parseAmount(teacher.courseCount),
      enrollmentCount: parseAmount(teacher.enrollmentCount),
      feeTotal: parseAmount(teacher.feeTotal),
      courses: [...(teacher.courses || [])]
    });
  }
  for (const block of rosterBlocks) {
    if (block.source === 'manualCourse') continue;
    const teacherName = String(block.teacherSheet || '未指定老師').trim() || '未指定老師';
    const key = normalizeText(teacherName);
    if (archivedTeacherNames.has(key)) continue;
    const row = rowsByTeacher.get(key) || {
      id: stableFallbackId(teacherName),
      name: teacherName,
      subject: canonicalSubject(teacherName),
      courseCount: 0,
      enrollmentCount: 0,
      feeTotal: 0,
      courses: []
    };
    row.courseCount += 1;
    row.enrollmentCount += block.rowCount || 0;
    row.courses.push({
      id: block.key,
      term: inferTermLabel(block.title, block.sheet),
      cohort: block.sheet || '',
      courseName: block.title || '',
      teacherName,
      sessionCount: 24,
      enrollmentCount: block.rowCount || 0,
      feeTotal: 0,
      enrollments: (block.rows || []).map((blockRow) => ({
        id: `${block.key}:${blockRow.row}`,
        studentName: blockRow.fields?.['姓名'] || '',
        tuitionAmount: parseAmount(blockRow.fields?.['單堂']) * 24,
        source: 'teacherRoster'
      }))
    });
    rowsByTeacher.set(key, row);
  }
  return Array.from(rowsByTeacher.values());
}
