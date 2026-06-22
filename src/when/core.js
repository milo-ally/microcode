"use strict";

const DAY = 24 * 60 * 60 * 1000;

const DAYS = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function startOfDay(d) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function isoRegex(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function inNDays(s) {
  const m = s.match(/^in\s+(\d+)\s+days?$/i);
  if (!m) return null;
  return parseInt(m[1], 10);
}

function nextDay(s) {
  const m = s.match(/^next\s+(\w+)$/i);
  if (!m) return null;
  const target = DAYS[m[1].toLowerCase()];
  if (target === undefined) return null;
  return target;
}

function lastDay(s) {
  const m = s.match(/^last\s+(\w+)$/i);
  if (!m) return null;
  const target = DAYS[m[1].toLowerCase()];
  if (target === undefined) return null;
  return target;
}

function parse(input) {
  let d = null;

  if (!input || typeof input !== "string") {
    return { input, parsed: null, display: "Could not understand: " + input };
  }

  const trimmed = input.trim();

  if (isoRegex(trimmed)) {
    d = new Date(trimmed + "T00:00:00");
  } else if (trimmed.toLowerCase() === "today") {
    d = startOfDay(new Date());
  } else if (trimmed.toLowerCase() === "yesterday") {
    d = startOfDay(new Date(Date.now() - DAY));
  } else if (trimmed.toLowerCase() === "tomorrow") {
    d = startOfDay(new Date(Date.now() + DAY));
  } else {
    const n = inNDays(trimmed);
    if (n !== null) {
      d = startOfDay(new Date(Date.now() + n * DAY));
    } else {
      const nd = nextDay(trimmed);
      if (nd !== null) {
        const today = startOfDay(new Date());
        const todayDow = today.getDay();
        const diff = (nd - todayDow + 7) % 7;
        d = new Date(today.getTime() + diff * DAY);
      } else {
        const ld = lastDay(trimmed);
        if (ld !== null) {
          const today = startOfDay(new Date());
          const todayDow = today.getDay();
          const diff = (todayDow - ld + 7) % 7;
          d = new Date(today.getTime() - diff * DAY);
        }
      }
    }
  }

  if (d === null || isNaN(d.getTime())) {
    return { input, parsed: null, display: "Could not understand: " + input };
  }

  const display = d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
  return { input, parsed: d, display };
}

export { parse };
