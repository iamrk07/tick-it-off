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
