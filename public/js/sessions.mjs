function parseInteger(value) {
  const number = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(number) ? Math.round(number) : 0;
}

export function normalizeIsoDate(value) {
  const match = String(value ?? '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function parseCourseSessionDates(value) {
  const rows = [];
  for (const line of String(value ?? '').split(/\r?\n/)) {
    const matches = line.match(/\d{4}-\d{1,2}-\d{1,2}/g) || [];
    for (const match of matches) {
      const date = normalizeIsoDate(match);
      if (!date) continue;
      const status = matches.length === 1
        ? line.replace(match, '').replace(/^[\s|｜,，:：-]+/, '').trim()
        : '';
      rows.push({ sessionNo: rows.length + 1, date, status });
    }
  }
  return rows;
}

export function sessionDatesToText(sessions) {
  return (sessions || [])
    .slice()
    .sort((a, b) => Number(a.sessionNo || 0) - Number(b.sessionNo || 0))
    .map((session) => {
      const date = normalizeIsoDate(session.date);
      return date && session.status ? `${date} | ${session.status}` : date;
    })
    .filter(Boolean)
    .join('\n');
}

export function validateSessionDatePlan(sessions, expectedSessionCount = 0) {
  const rows = sessions || [];
  const errors = [];
  const expected = parseInteger(expectedSessionCount);
  if (!rows.length) return errors;
  if (expected > 0 && rows.length !== expected) {
    errors.push(`堂次日期 ${rows.length} 筆，與本月堂數 ${expected} 不一致。`);
  }

  for (let index = 0; index < rows.length; index += 1) {
    const current = normalizeIsoDate(rows[index]?.date);
    if (!current) {
      errors.push(`第 ${index + 1} 堂日期格式不正確。`);
      continue;
    }
    if (index === 0) continue;
    const previous = normalizeIsoDate(rows[index - 1]?.date);
    if (previous && current <= previous) {
      errors.push(`第 ${index + 1} 堂日期必須晚於第 ${index} 堂。`);
    }
  }

  return errors;
}

function resolveSessionNo(event, sessions, defaultSessions) {
  const explicitSessionNo = parseInteger(event.sessionNo);
  if (explicitSessionNo > 0) {
    return {
      sessionNo: Math.min(Math.max(explicitSessionNo, 1), defaultSessions + 1),
      source: 'manual'
    };
  }

  const eventDate = normalizeIsoDate(event.date);
  if (!eventDate || !sessions.length) {
    return {
      sessionNo: 0,
      source: 'missing'
    };
  }

  const matchedSession = sessions.find((session) => normalizeIsoDate(session.date) >= eventDate);
  return {
    sessionNo: matchedSession ? Number(matchedSession.sessionNo) : defaultSessions + 1,
    source: 'date'
  };
}

export function resolveMembershipEventSession(event, sessionDateRows = [], defaultSessionCount = 0) {
  const defaultSessions = Math.max(0, parseInteger(defaultSessionCount));
  const sessions = (sessionDateRows || []).filter((session) => normalizeIsoDate(session.date));
  return resolveSessionNo(event || {}, sessions, defaultSessions);
}

export function effectiveSessionsForEvents(defaultSessionCount, events, sessionDateRows = [], options = {}) {
  const defaultSessions = Math.max(0, parseInteger(defaultSessionCount));
  const sessions = (sessionDateRows || []).filter((session) => normalizeIsoDate(session.date));
  const notes = [];
  const resolvedEvents = [];

  for (const event of events || []) {
    const resolved = resolveSessionNo(event, sessions, defaultSessions);
    const datePrefix = event.date ? `${event.date} ` : '';
    if (!resolved.sessionNo) {
      notes.push(`${datePrefix}${event.action || '異動'}未填堂次，且無堂次日期表`);
      continue;
    }

    const sourceNote = resolved.source === 'date' ? '（由日期推算）' : '';
    if (event.action === '退出') {
      notes.push(`${datePrefix}退出第 ${resolved.sessionNo} 堂${sourceNote}`);
    } else if (event.action === '加入') {
      notes.push(`${datePrefix}加入第 ${resolved.sessionNo} 堂${sourceNote}`);
    }
    resolvedEvents.push({ event, sessionNo: resolved.sessionNo });
  }

  resolvedEvents.sort((left, right) => (
    left.sessionNo - right.sessionNo ||
    String(left.event.date || '').localeCompare(String(right.event.date || '')) ||
    (left.event.action === '退出' ? -1 : 1)
  ));
  let active = Object.prototype.hasOwnProperty.call(options, 'initiallyActive')
    ? options.initiallyActive !== false
    : resolvedEvents[0]?.event.action !== '加入';
  let eventIndex = 0;
  const activeSessionNos = [];
  for (let sessionNo = 1; sessionNo <= defaultSessions; sessionNo += 1) {
    while (eventIndex < resolvedEvents.length && resolvedEvents[eventIndex].sessionNo <= sessionNo) {
      const action = resolvedEvents[eventIndex].event.action;
      if (action === '退出') active = false;
      if (action === '加入') active = true;
      eventIndex += 1;
    }
    if (active) activeSessionNos.push(sessionNo);
  }
  const activeFrom = activeSessionNos[0] || defaultSessions + 1;
  const activeUntil = activeSessionNos[activeSessionNos.length - 1] || 0;
  return {
    sessions: activeSessionNos.length,
    note: notes.join('；'),
    activeFrom,
    activeUntil,
    activeSessionNos
  };
}

export function buildSessionHeadcountRows(sessionDateRows = [], students = []) {
  const sessions = (sessionDateRows || [])
    .filter((session) => normalizeIsoDate(session.date))
    .slice()
    .sort((a, b) => Number(a.sessionNo || 0) - Number(b.sessionNo || 0));
  const defaultSessionCount = sessions.length;

  return sessions.map((session) => {
    const sessionNo = Number(session.sessionNo || 0);
    const activeStudents = (students || []).filter((student) => {
      if (Array.isArray(student.effective?.activeSessionNos)) {
        return student.effective.activeSessionNos.includes(sessionNo);
      }
      return sessionNo >= Number(student.effective?.activeFrom || 1) &&
        sessionNo <= Number(student.effective?.activeUntil ?? defaultSessionCount);
    });
    const joinedNames = [];
    const withdrawnNames = [];

    for (const student of students || []) {
      for (const event of student.events || []) {
        const resolved = resolveMembershipEventSession(event, sessions, defaultSessionCount);
        if (resolved.sessionNo !== sessionNo) continue;
        const suffix = event.movementType === '換班'
          ? `（${event.transferDirection || (event.action === '加入' ? '轉入' : '轉出')}）`
          : '';
        if (event.action === '加入') joinedNames.push(`${student.name}${suffix}`);
        if (event.action === '退出') withdrawnNames.push(`${student.name}${suffix}`);
      }
    }

    return {
      sessionNo,
      date: normalizeIsoDate(session.date),
      status: String(session.status || '').trim(),
      headcount: activeStudents.length,
      activeNames: activeStudents.map((student) => student.name).filter(Boolean),
      joinedNames: Array.from(new Set(joinedNames.filter(Boolean))),
      withdrawnNames: Array.from(new Set(withdrawnNames.filter(Boolean)))
    };
  });
}
