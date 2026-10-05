// Date helpers for the Growth tracker (all local-time, YYYY-MM-DD strings)
const p2 = (n) => String(n).padStart(2, '0');
export const fmtDay = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const todayLocal = () => fmtDay(new Date());

// Last 14 days, oldest → today: [{ date: 'YYYY-MM-DD', label: dayNumber }]
export function last14() {
  const out = [];
  const nowD = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(nowD);
    d.setDate(nowD.getDate() - i);
    out.push({ date: fmtDay(d), label: d.getDate() });
  }
  return out;
}

// Consecutive-day streak ending today (today may still be unlogged)
export function calcStreak(dateSet) {
  const d = new Date();
  if (!dateSet.has(fmtDay(d))) d.setDate(d.getDate() - 1);
  let s = 0;
  while (dateSet.has(fmtDay(d))) {
    s++;
    d.setDate(d.getDate() - 1);
  }
  return s;
}

// Monday of this week as YYYY-MM-DD (weeks run Mon–Sun)
export function mondayStr() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return fmtDay(d);
}

export function prettyDate(iso) {
  try {
    const [y, m, dd] = iso.split('-').map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// Month grid (weeks start Monday). Returns weeks of 7 cells:
// each cell is 'YYYY-MM-DD' or null (padding).
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(fmtDay(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function monthLabel(year, month) {
  try {
    return new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  } catch {
    return `${month + 1}/${year}`;
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Compact day: "5 Oct" (for small chips/badges)
export function fmtDayMon(v) {
  if (!v) return '—';
  const d = asDate(v);
  if (!d) return String(v);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function asDate(v) {
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Unambiguous dates everywhere: "5 Oct 2026"
export function fmtDateLong(v) {
  if (!v) return '—';
  const d = asDate(v);
  if (!d) return String(v);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Lists: "5 Oct, 11:09 AM"
export function fmtShort(v) {
  if (!v) return '—';
  const d = asDate(v);
  if (!d) return String(v);
  let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
}

// Details: "5 Oct 2026, 11:09 AM"
export function fmtDateTime(v) {
  if (!v) return '—';
  const d = asDate(v);
  if (!d) return String(v);
  let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
}

// "1 tracker", "3 trackers", "1 category", "5 categories"
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many ?? `${one}s`}`;
