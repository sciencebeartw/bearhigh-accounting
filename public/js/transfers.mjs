function text(value) {
  return String(value ?? '').trim();
}

function compact(value) {
  return text(value).replace(/\s+/g, '');
}

export function transferCourseSubject(course = {}) {
  const source = compact(`${course.subject || ''} ${course.courseName || ''}`);
  if (/數學|明軒|黃浩|竹中|竹北|竹女|李翔/.test(source)) return '數學';
  if (/英文|小揚|小楊/.test(source)) return '英文';
  if (/物理/.test(source)) return '物理';
  if (/化學/.test(source)) return '化學';
  if (/生物/.test(source)) return '生物';
  if (/地科|地球科學/.test(source)) return '地科';
  if (/國文/.test(source)) return '國文';
  if (/社會/.test(source)) return '社會';
  return text(course.subject);
}

export function validateClassTransfer(input = {}) {
  const errors = [];
  const fromCourse = input.fromCourse || {};
  const toCourse = input.toCourse || {};
  const effectiveDate = text(input.effectiveDate);
  const returnDate = text(input.returnDate);
  if (!text(input.studentId)) errors.push('請選學生。');
  if (!text(fromCourse.id)) errors.push('請選原班。');
  if (!text(toCourse.id)) errors.push('請選新班。');
  if (fromCourse.id && toCourse.id && fromCourse.id === toCourse.id) errors.push('原班與新班不能相同。');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) errors.push('請填正確的換班生效日。');
  const fromSubject = transferCourseSubject(fromCourse);
  const toSubject = transferCourseSubject(toCourse);
  if (!fromSubject || !toSubject || fromSubject !== toSubject) errors.push('只有同科目可以直接換班；跨科請走退班加新科入班。');
  if (compact(fromCourse.term) && compact(toCourse.term) && compact(fromCourse.term) !== compact(toCourse.term)) {
    errors.push('原班與新班必須屬於同一學期。');
  }
  if (input.transferType === 'temporary') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) errors.push('暫時換班請填預計換回日。');
    if (effectiveDate && returnDate && returnDate <= effectiveDate) errors.push('換回日必須晚於換班生效日。');
  }
  return errors;
}

function membershipEvent({ id, transferId, student, course, date, action, direction, otherCourse, reason, createdAt }) {
  const otherLabel = text(otherCourse.courseName) || text(otherCourse.id);
  return {
    id,
    transferId,
    createdAt,
    updatedAt: createdAt,
    source: 'classTransfer',
    movementType: '換班',
    transferDirection: direction,
    courseId: course.id,
    rosterKey: `manualCourse::${course.id}`,
    courseName: text(course.courseName),
    month: date.slice(0, 7),
    date,
    sessionNo: '',
    studentId: student.id,
    studentName: text(student.name),
    action,
    note: [direction, otherLabel ? `${direction === '轉出' ? '轉至' : '來自'} ${otherLabel}` : '', reason].filter(Boolean).join('；')
  };
}

export function buildClassTransferRecords(input = {}) {
  const errors = validateClassTransfer(input);
  if (errors.length) return { errors, transfer: null, membershipEvents: [] };
  const createdAt = input.createdAt || new Date().toISOString();
  const transferId = text(input.id) || `class_transfer_${Date.now()}`;
  const student = {
    id: text(input.studentId),
    name: text(input.studentName)
  };
  const fromCourse = input.fromCourse;
  const toCourse = input.toCourse;
  const effectiveDate = text(input.effectiveDate);
  const returnDate = input.transferType === 'temporary' ? text(input.returnDate) : '';
  const reason = text(input.reason);
  const transfer = {
    id: transferId,
    createdAt,
    updatedAt: createdAt,
    studentId: student.id,
    studentName: student.name,
    subject: transferCourseSubject(fromCourse),
    term: text(fromCourse.term) || text(toCourse.term),
    fromCourseId: fromCourse.id,
    fromCourseName: text(fromCourse.courseName),
    fromTeacherName: text(fromCourse.payrollPayeeName) || text(fromCourse.teacherName),
    toCourseId: toCourse.id,
    toCourseName: text(toCourse.courseName),
    toTeacherName: text(toCourse.payrollPayeeName) || text(toCourse.teacherName),
    effectiveDate,
    transferType: input.transferType === 'temporary' ? 'temporary' : 'permanent',
    returnDate,
    reason,
    tuitionImpact: 0,
    packageImpact: 0,
    status: returnDate ? 'scheduled_return' : 'active'
  };
  const membershipEvents = [
    membershipEvent({ id: `${transferId}_out`, transferId, student, course: fromCourse, date: effectiveDate, action: '退出', direction: '轉出', otherCourse: toCourse, reason, createdAt }),
    membershipEvent({ id: `${transferId}_in`, transferId, student, course: toCourse, date: effectiveDate, action: '加入', direction: '轉入', otherCourse: fromCourse, reason, createdAt })
  ];
  if (returnDate) {
    membershipEvents.push(
      membershipEvent({ id: `${transferId}_return_out`, transferId, student, course: toCourse, date: returnDate, action: '退出', direction: '換回轉出', otherCourse: fromCourse, reason, createdAt }),
      membershipEvent({ id: `${transferId}_return_in`, transferId, student, course: fromCourse, date: returnDate, action: '加入', direction: '換回轉入', otherCourse: toCourse, reason, createdAt })
    );
  }
  return { errors: [], transfer, membershipEvents };
}

export function transferStudentIdsForCourse(transfers = [], courseId = '') {
  return Array.from(new Set((transfers || [])
    .filter((transfer) => transfer?.fromCourseId === courseId || transfer?.toCourseId === courseId)
    .map((transfer) => transfer.studentId)
    .filter(Boolean)));
}
