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
  const matches = String(value ?? '').match(/\d{4}-\d{1,2}-\d{1,2}/g) || [];
  const dates = matches.map(normalizeIsoDate).filter(Boolean);
  return dates.map((date, index) => ({
    sessionNo: index + 1,
    date
  }));
}

export function sessionDatesToText(sessions) {
  return (sessions || [])
    .slice()
    .sort((a, b) => Number(a.sessionNo || 0) - Number(b.sessionNo || 0))
    .map((session) => normalizeIsoDate(session.date))
    .filter(Boolean)
    .join('\n');
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

export function effectiveSessionsForEvents(defaultSessionCount, events, sessionDateRows = []) {
  const defaultSessions = Math.max(0, parseInteger(defaultSessionCount));
  const sessions = (sessionDateRows || []).filter((session) => normalizeIsoDate(session.date));
  let activeFrom = 1;
  let activeUntil = defaultSessions;
  const notes = [];

  for (const event of events || []) {
    const resolved = resolveSessionNo(event, sessions, defaultSessions);
    const datePrefix = event.date ? `${event.date} ` : '';
    if (!resolved.sessionNo) {
      notes.push(`${datePrefix}${event.action || '異動'}未填堂次，且無堂次日期表`);
      continue;
    }

    const sourceNote = resolved.source === 'date' ? '（由日期推算）' : '';
    if (event.action === '退出') {
      activeUntil = Math.min(activeUntil, resolved.sessionNo - 1);
      notes.push(`${datePrefix}退出第 ${resolved.sessionNo} 堂${sourceNote}`);
    } else if (event.action === '加入') {
      activeFrom = Math.max(activeFrom, resolved.sessionNo);
      notes.push(`${datePrefix}加入第 ${resolved.sessionNo} 堂${sourceNote}`);
    }
  }

  const sessionsCount = Math.max(0, activeUntil - activeFrom + 1);
  return {
    sessions: sessionsCount,
    note: notes.join('；'),
    activeFrom,
    activeUntil
  };
}
