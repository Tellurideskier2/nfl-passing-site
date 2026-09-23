export function dateInZone(now = new Date(), timeZone = 'America/Denver') {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function validDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}

// Resolve each midnight separately: DST days can contain 23 or 25 hours.
export function dayBounds(date, timeZone) {
  if (!validDate(date)) throw new Error('Use a valid YYYY-MM-DD date.');
  const midnight = day => {
    const target = Date.parse(`${day}T00:00:00Z`);
    let value = target;
    for (let i = 0; i < 4; i++) {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
        minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      }).formatToParts(new Date(value)).map(p => [p.type, p.value]));
      const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
      value += target - local;
    }
    return new Date(value).toISOString();
  };
  const next = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
  return { start: midnight(date), end: midnight(next) };
}

export function seasonForDate(date) {
  return Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 8 ? 1 : 0);
}
