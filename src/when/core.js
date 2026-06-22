export function parse(input) {
  const cleaned = input.trim().toLowerCase();

  // "today"
  if (cleaned === 'today') {
    return midnight(new Date());
  }

  // "tomorrow"
  if (cleaned === 'tomorrow') {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return midnight(d);
  }

  // "yesterday"
  if (cleaned === 'yesterday') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return midnight(d);
  }

  // "next Monday", "next Tuesday", etc.
  const nextDayMatch = cleaned.match(/^next (sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (nextDayMatch) {
    const targetDay = dayIndex(nextDayMatch[1]);
    return midnight(nextDow(targetDay));
  }

  // "last Monday", "last Tuesday", etc.
  const lastDayMatch = cleaned.match(/^last (sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (lastDayMatch) {
    const targetDay = dayIndex(lastDayMatch[1]);
    return midnight(lastDow(targetDay));
  }

  // "in N days"
  const inDaysMatch = cleaned.match(/^in (\d+) days?$/);
  if (inDaysMatch) {
    const d = new Date();
    d.setDate(d.getDate() + Number(inDaysMatch[1]));
    return midnight(d);
  }

  // ISO date YYYY-MM-DD
  const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  return null;
}

function midnight(d) {
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayIndex(name) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days.indexOf(name);
}

function nextDow(targetDay) {
  const d = new Date();
  const current = d.getDay();
  let diff = targetDay - current;
  if (diff <= 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function lastDow(targetDay) {
  const d = new Date();
  const current = d.getDay();
  let diff = current - targetDay;
  if (diff < 0) diff += 7;
  if (diff === 0) diff = 7;
  d.setDate(d.getDate() - diff);
  return d;
}
