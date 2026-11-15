// =====================================================================
//  UTILITÀ: date, formattazione e calcoli (nessun accesso ai dati qui)
//  Le date sono stringhe "AAAA-MM-GG": si confrontano come testo
//  e non hanno problemi di fuso orario.
// =====================================================================

export const pad = (n) => String(n).padStart(2, "0");

// Date -> "2026-11-15" (ora locale)
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// "2026-11-15" -> Date (mezzogiorno, per evitare scherzi con l'ora legale)
export const fromISO = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};
export const todayISO = () => toISO(new Date());
export const addDays = (iso, n) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

// Lunedì della settimana che contiene la data
export const startOfWeek = (iso) => {
  const d = fromISO(iso);
  const dow = (d.getDay() + 6) % 7; // lun=0 ... dom=6
  d.setDate(d.getDate() - dow);
  return toISO(d);
};

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio",
  "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
export const monthName = (m) => MESI[m];

// Intervallo [from, to] (inclusi) per settimana / mese / anno.
// offset = 0 periodo attuale, -1 precedente, +1 successivo...
export function periodRange(type, offset = 0, base = todayISO()) {
  const d = fromISO(base);
  if (type === "week") {
    const from = addDays(startOfWeek(base), offset * 7);
    const to = addDays(from, 6);
    return { from, to, label: `${fmtDateShort(from)} – ${fmtDateShort(to)}` };
  }
  if (type === "month") {
    const first = new Date(d.getFullYear(), d.getMonth() + offset, 1, 12);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12);
    return { from: toISO(first), to: toISO(last), label: `${MESI[first.getMonth()]} ${first.getFullYear()}` };
  }
  const y = d.getFullYear() + offset;
  return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
}

// ---------- formattazione ----------
export const euro = (n) =>
  (n || 0).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

export const hours = (min) => {
  const h = Math.floor((min || 0) / 60);
  const m = Math.round((min || 0) % 60);
  return m ? `${h}h ${pad(m)}m` : `${h}h`;
};

export const fmtDate = (iso) => {
  const d = fromISO(iso);
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
};
export const fmtDateShort = (iso) => {
  const d = fromISO(iso);
  return `${d.getDate()} ${MESI[d.getMonth()].slice(0, 3)}`;
};
export const fmtDayHeader = (iso) => {
  const d = fromISO(iso);
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`;
};

// Evita che testo inserito dall'utente rompa l'HTML
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- calcoli ----------
// Riassunto di una lista di lezioni:
//  - fatte: presenti (sommano ore e soldi)
//  - perse: assenti (0 €)
export function summarize(lessons) {
  const s = { done: 0, missed: 0, minDone: 0, minMissed: 0, earned: 0, toRecover: 0 };
  for (const l of lessons) {
    if (l.status === "presente") {
      s.done++;
      s.minDone += l.duration || 0;
      s.earned += l.price || 0;
    } else if (l.status === "assente") {
      s.missed++;
      s.minMissed += l.duration || 0;
      if (l.recovery === "da_recuperare") s.toRecover++;
    }
  }
  return s;
}

export const inRange = (l, from, to) => l.date >= from && l.date <= to;
