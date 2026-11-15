// =====================================================================
//  CANTO ORE - logica dell'app
//  Struttura:
//   1. Stato e avvio
//   2. Funzioni di supporto (nomi, prezzi, modale, toast)
//   3. Una funzione render...() per ogni scheda
//   4. I form (scuola, studente, lezione, recupero)
//   5. Menu: backup, importazione, logout
// =====================================================================

import { store } from "./store.js";
import { DEMO_MODE, TAX_RATE } from "./config.js";
import {
  todayISO, addDays, startOfWeek, periodRange, fromISO, toISO,
  euro, hours, fmtDate, fmtDayHeader, esc, summarize, inRange, monthName, pad,
} from "./utils.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---------------------------------------------------------------------
// 1. STATO E AVVIO
// ---------------------------------------------------------------------
let data = { schools: [], students: [], lessons: [] };
let user = null;

// Stato dell'interfaccia (quale scheda, quale periodo, filtri...)
const ui = {
  tab: "lessons",
  lessonsMode: "week",   // "week" | "recover"
  weekOffset: 0,
  selDay: "",            // giorno selezionato nella striscia
  reportType: "month",   // "week" | "month" | "year"
  reportOffset: 0,
  reportFilter: "all",   // "all" | "s:<idScuola>" | "casa" | "p:<idStudente>"
  studentSearch: "",
  netYearOffset: 0,
  netMonth: new Date().getMonth(),
};

const TITLES = { lessons: "Agenda", students: "Studenti", schools: "Scuole", reports: "Report", net: "Netto" };

async function start() {
  if (DEMO_MODE) $("#demo-banner").classList.remove("hidden");
  try {
    await store.init();
  } catch (e) {
    $("#loading").innerHTML = `<p class="error">Impossibile caricare Firebase. Controlla la connessione e la configurazione.<br>${esc(e.message)}</p>`;
    return;
  }
  store.onAuth((u) => {
    user = u;
    $("#loading").classList.add("hidden");
    if (u) {
      $("#login").classList.add("hidden");
      $("#app").classList.remove("hidden");
      store.subscribe((d) => {
        data = d;
        render();
      });
      render();
    } else {
      $("#app").classList.add("hidden");
      $("#login").classList.remove("hidden");
    }
  });
  bindLogin();
  bindShell();
  registerSW();
}

function registerSW() {
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

// ---------- Login ----------
function bindLogin() {
  const err = $("#login-error");
  const show = (e) => (err.textContent = authMessage(e));
  $("#login-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    err.textContent = "";
    try { await store.loginEmail($("#login-email").value.trim(), $("#login-pw").value); } catch (e) { show(e); }
  });
  $("#btn-register").addEventListener("click", async () => {
    err.textContent = "";
    const email = $("#login-email").value.trim();
    const pw = $("#login-pw").value;
    if (!email || pw.length < 6) return (err.textContent = "Inserisci email e una password di almeno 6 caratteri.");
    try { await store.registerEmail(email, pw); } catch (e) { show(e); }
  });
  $("#btn-google").addEventListener("click", async () => {
    err.textContent = "";
    try { await store.loginGoogle(); } catch (e) { show(e); }
  });
  $("#btn-reset").addEventListener("click", async () => {
    const email = $("#login-email").value.trim();
    if (!email) return (err.textContent = "Scrivi prima la tua email nel campo sopra.");
    try { await store.resetPassword(email); err.textContent = "Ti ho mandato un'email per reimpostare la password."; } catch (e) { show(e); }
  });
}

// Traduce i codici di errore di Firebase in italiano
function authMessage(e) {
  const c = e?.code || "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) return "Email o password errate.";
  if (c.includes("email-already-in-use")) return "Esiste già un account con questa email: usa Accedi.";
  if (c.includes("invalid-email")) return "Email non valida.";
  if (c.includes("weak-password")) return "Password troppo debole (minimo 6 caratteri).";
  if (c.includes("popup-closed")) return "Accesso annullato.";
  if (c.includes("unauthorized-domain")) return "Dominio non autorizzato: aggiungilo in Firebase → Authentication → Impostazioni → Domini autorizzati.";
  if (c.includes("network")) return "Problema di connessione.";
  return e?.message || "Errore imprevisto.";
}

// ---------- Barra in basso, pulsante +, menu, modale ----------
function bindShell() {
  $$(".tabbar button").forEach((b) =>
    b.addEventListener("click", () => {
      ui.tab = b.dataset.tab;
      window.scrollTo(0, 0);
      render();
    })
  );
  $("#fab").addEventListener("click", () => {
    if (ui.tab === "lessons") lessonForm();
    else if (ui.tab === "students") studentForm();
    else if (ui.tab === "schools") schoolForm();
  });
  $("#btn-menu").addEventListener("click", menu);
  $("#modal").addEventListener("click", (e) => {
    if (e.target.id === "modal" || e.target.closest("[data-close]")) closeModal();
  });
}

// ---------------------------------------------------------------------
// 2. FUNZIONI DI SUPPORTO
// ---------------------------------------------------------------------
const schoolById = (id) => data.schools.find((s) => s.id === id);
const studentById = (id) => data.students.find((s) => s.id === id);
const fullName = (st) => (st ? `${st.firstName} ${st.lastName}` : "Studente eliminato");
const schoolName = (id) => (id ? schoolById(id)?.name || "Scuola eliminata" : "Casa");
const byName = (a, b) => fullName(a).localeCompare(fullName(b));
const byDateTime = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);

// Prezzo e durata di una lezione per questo studente:
// se è in una scuola valgono quelli della scuola, se è "Casa" i suoi.
function lessonTerms(st) {
  const sc = st.schoolId ? schoolById(st.schoolId) : null;
  return sc
    ? { price: Number(sc.price) || 0, duration: Number(sc.duration) || 60, schoolId: sc.id }
    : { price: Number(st.price) || 0, duration: Number(st.duration) || 60, schoolId: "" };
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.add("hidden"), 2500);
}

function openModal(title, html) {
  $("#modal-title").textContent = title;
  $("#modal-body").innerHTML = html;
  $("#modal").classList.remove("hidden");
  return $("#modal-body");
}
function closeModal() {
  $("#modal").classList.add("hidden");
  $("#modal-body").innerHTML = "";
}

// Conferma dentro la modale: restituisce true/false
function confirmBox(title, text, okLabel = "Conferma", danger = true) {
  return new Promise((resolve) => {
    const body = openModal(title, `
      <p>${text}</p>
      <div class="actions">
        <button class="btn" id="cf-no">Annulla</button>
        <button class="btn ${danger ? "danger" : "primary"}" id="cf-yes">${okLabel}</button>
      </div>`);
    $("#cf-no", body).onclick = () => { closeModal(); resolve(false); };
    $("#cf-yes", body).onclick = () => { closeModal(); resolve(true); };
  });
}

// Esegue un salvataggio mostrando eventuali errori
async function save(fn, okMsg) {
  try {
    await fn();
    if (okMsg) toast(okMsg);
    return true;
  } catch (e) {
    console.error(e);
    toast("Errore: " + (e.message || e));
    return false;
  }
}

const statBox = (v, l, cls = "") => `<div class="stat ${cls}"><div class="v">${v}</div><div class="l">${l}</div></div>`;
const emptyBox = (emoji, text) => `<div class="empty"><div class="e">${emoji}</div><p>${text}</p></div>`;

// ---------------------------------------------------------------------
// 3. SCHEDE
// ---------------------------------------------------------------------
function render() {
  if (!user) return;
  $("#page-title").textContent = TITLES[ui.tab];
  $$(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.tab === ui.tab));
  $("#fab").classList.toggle("hidden", ui.tab === "reports" || ui.tab === "net");
  const view = $("#view");
  ({ lessons: renderLessons, students: renderStudents, schools: renderSchools, reports: renderReports, net: renderNet })[ui.tab](view);
}

// ===================== LEZIONI =====================
function renderLessons(view) {
  const toRecover = data.lessons.filter((l) => l.status === "assente" && l.recovery === "da_recuperare").sort(byDateTime);

  let html = `
    <div class="seg">
      <button data-mode="week" class="${ui.lessonsMode === "week" ? "active" : ""}">Settimana</button>
      <button data-mode="recover" class="${ui.lessonsMode === "recover" ? "active" : ""}">Da recuperare${toRecover.length ? ` (${toRecover.length})` : ""}</button>
    </div>`;

  if (!data.students.length) {
    html += emptyBox("👋", "Inizia aggiungendo una <b>scuola</b> e poi uno <b>studente</b>.<br>Dopo potrai inserire le lezioni con il pulsante +.");
    view.innerHTML = html;
    bindLessonView(view);
    return;
  }

  if (ui.lessonsMode === "recover") {
    html += toRecover.length
      ? toRecover.map((l) => lessonCard(l, true)).join("")
      : emptyBox("✅", "Nessuna lezione da recuperare.");
  } else {
    const r = periodRange("week", ui.weekOffset);
    const list = data.lessons.filter((l) => inRange(l, r.from, r.to)).sort(byDateTime);
    const sum = summarize(list);
    html += `
      <div class="pager">
        <button class="btn small" data-week="-1">‹</button>
        <strong>${r.label}</strong>
        <button class="btn small" data-week="1">›</button>
      </div>
      ${ui.weekOffset !== 0 ? `<button class="btn small full" data-week="0" style="margin-bottom:12px">Torna a questa settimana</button>` : ""}
      <div class="stats">
        ${statBox(hours(sum.minDone), "ore fatte", "ok")}
        ${statBox(euro(sum.earned), "guadagnato")}
      </div>`;
    // Striscia orizzontale dei 7 giorni: tocchi un giorno e vedi le sue lezioni
    const today = todayISO();
    if (!inRange({ date: ui.selDay }, r.from, r.to)) ui.selDay = inRange({ date: today }, r.from, r.to) ? today : r.from;
    const DW = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
    html += `<div class="days">${Array.from({ length: 7 }, (_, i) => {
      const day = addDays(r.from, i);
      const cls = ["day", day === today ? "today" : "", day === ui.selDay ? "sel" : "", list.some((l) => l.date === day) ? "has" : ""].join(" ");
      return `<button class="${cls}" data-day="${day}"><span class="dw">${DW[i]}</span><span class="dn">${Number(day.slice(8))}</span><span class="dot"></span></button>`;
    }).join("")}</div>`;
    const dayLessons = list.filter((l) => l.date === ui.selDay);
    html += `<div class="day-head ${ui.selDay === today ? "today" : ""}">${ui.selDay === today ? "Oggi · " : ""}${fmtDayHeader(ui.selDay)}</div>`;
    html += dayLessons.length
      ? dayLessons.map((l) => lessonCard(l)).join("")
      : emptyBox("🎵", "Nessuna lezione in questo giorno.");
  }
  view.innerHTML = html;
  bindLessonView(view);
}

function lessonCard(l, showDate = false) {
  const st = studentById(l.studentId);
  let chip = "";
  if (l.status === "presente") chip = `<span class="chip ok">${euro(l.price)}</span>`;
  else if (l.status === "assente") {
    chip = { da_recuperare: `<span class="chip warn">da recuperare</span>`, programmato: `<span class="chip">recupero fissato</span>`, fatto: `<span class="chip ok">recuperata</span>` }[l.recovery] || `<span class="chip ko">assente</span>`;
  }
  const makeup = l.makeupOf ? `<span class="chip">recupero</span> ` : "";
  return `
    <div class="card lesson" data-id="${l.id}">
      <div class="time">${esc(l.time)}</div>
      <div class="info" data-open="${l.id}">
        <div class="name">${esc(fullName(st))}</div>
        <div class="muted small">${showDate ? fmtDate(l.date) + " · " : ""}${esc(schoolName(l.schoolId))} · ${l.duration} min</div>
        <div style="margin-top:4px">${makeup}${chip}</div>
      </div>
      ${showDate
        ? `<button class="btn small" data-recover="${l.id}">Fissa recupero</button>`
        : `<div class="btns">
            <button class="mark ok ${l.status === "presente" ? "on" : ""}" data-present="${l.id}" title="Presente">✓</button>
            <button class="mark ko ${l.status === "assente" ? "on" : ""}" data-absent="${l.id}" title="Assente">✕</button>
          </div>`}
    </div>`;
}

function bindLessonView(view) {
  $$("[data-mode]", view).forEach((b) => (b.onclick = () => { ui.lessonsMode = b.dataset.mode; render(); }));
  $$("[data-day]", view).forEach((b) => (b.onclick = () => { ui.selDay = b.dataset.day; render(); }));
  $$("[data-week]", view).forEach((b) => (b.onclick = () => {
    const v = Number(b.dataset.week);
    ui.weekOffset = v === 0 ? 0 : ui.weekOffset + v;
    render();
  }));
  $$("[data-present]", view).forEach((b) => (b.onclick = () => markPresent(b.dataset.present)));
  $$("[data-absent]", view).forEach((b) => (b.onclick = () => markAbsent(b.dataset.absent)));
  $$("[data-open]", view).forEach((b) => (b.onclick = () => editLessonForm(b.dataset.open)));
  $$("[data-recover]", view).forEach((b) => (b.onclick = () => recoveryForm(b.dataset.recover, true)));
}

// Presente: la lezione vale il suo prezzo. Se era un recupero, segna recuperata quella persa.
async function markPresent(id) {
  const l = data.lessons.find((x) => x.id === id);
  if (!l) return;
  const nowPresent = l.status !== "presente";
  await save(async () => {
    const patch = { status: nowPresent ? "presente" : "programmata" };
    if (l.status === "assente") { patch.recovery = null; }
    await store.update("lessons", id, patch);
    if (l.makeupOf && data.lessons.some((x) => x.id === l.makeupOf)) {
      await store.update("lessons", l.makeupOf, { recovery: nowPresent ? "fatto" : "programmato" });
    }
  });
}

// Assente: 0 € e chiede come gestire il recupero
async function markAbsent(id) {
  const l = data.lessons.find((x) => x.id === id);
  if (!l) return;
  if (l.status === "assente") {
    // seconda pressione: annulla l'assenza
    await save(() => store.update("lessons", id, { status: "programmata", recovery: null }));
    return;
  }
  await save(async () => {
    await store.update("lessons", id, { status: "assente", recovery: null });
    if (l.makeupOf && data.lessons.some((x) => x.id === l.makeupOf)) {
      await store.update("lessons", l.makeupOf, { recovery: "programmato" });
    }
  });
  recoveryForm(id);
}

// ===================== STUDENTI =====================
function renderStudents(view) {
  if (!data.students.length) {
    view.innerHTML = emptyBox("👤", data.schools.length
      ? "Nessuno studente. Aggiungilo con il pulsante +."
      : "Prima crea una scuola nella scheda <b>Scuole</b> (oppure aggiungi studenti a <b>Casa</b> con il +).");
    return;
  }
  const m = periodRange("month", 0);
  const q = ui.studentSearch.toLowerCase();
  const groups = [...data.schools].sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ id: s.id, name: s.name }));
  groups.push({ id: "", name: "Casa" });

  let html = `<input type="search" id="st-search" placeholder="Cerca studente..." value="${esc(ui.studentSearch)}" style="margin-bottom:12px" />`;
  for (const g of groups) {
    const list = data.students
      .filter((s) => (s.schoolId || "") === g.id && fullName(s).toLowerCase().includes(q))
      .sort(byName);
    if (!list.length) continue;
    html += `<div class="day-head">${esc(g.name)} · ${list.length}</div>`;
    for (const s of list) {
      const sum = summarize(data.lessons.filter((l) => l.studentId === s.id && inRange(l, m.from, m.to)));
      const t = lessonTerms(s);
      html += `
        <div class="card tap" data-student="${s.id}">
          <div class="card-row">
            <div>
              <h3>${esc(fullName(s))}</h3>
              <div class="muted small">${euro(t.price)} / lezione · ${t.duration} min</div>
            </div>
            <div style="text-align:right">
              <div><b>${euro(sum.earned)}</b></div>
              <div class="muted small">questo mese · ${sum.done}✓ ${sum.missed}✕</div>
            </div>
          </div>
        </div>`;
    }
  }
  view.innerHTML = html;
  const search = $("#st-search", view);
  search.oninput = () => {
    ui.studentSearch = search.value;
    render();
    const s = $("#st-search");
    s.focus();
    s.setSelectionRange(s.value.length, s.value.length);
  };
  $$("[data-student]", view).forEach((c) => (c.onclick = () => studentDetail(c.dataset.student)));
}

function studentDetail(id) {
  const s = studentById(id);
  if (!s) return;
  const lessons = data.lessons.filter((l) => l.studentId === id).sort(byDateTime).reverse();
  const m = periodRange("month", 0);
  const y = periodRange("year", 0);
  const sm = summarize(lessons.filter((l) => inRange(l, m.from, m.to)));
  const sy = summarize(lessons.filter((l) => inRange(l, y.from, y.to)));
  const t = lessonTerms(s);
  const body = openModal(fullName(s), `
    <p class="muted" style="margin-top:0">${esc(schoolName(s.schoolId))} · ${euro(t.price)} / lezione · ${t.duration} min</p>
    <div class="stats">
      ${statBox(euro(sm.earned), "questo mese")}
      ${statBox(euro(sy.earned), "quest'anno")}
      ${statBox(hours(sy.minDone), "ore fatte (anno)", "ok")}
      ${statBox(hours(sy.minMissed), "ore perse (anno)", "ko")}
    </div>
    <div class="actions">
      <button class="btn primary" id="sd-add">+ Lezione</button>
      <button class="btn" id="sd-edit">Modifica</button>
    </div>
    <div class="day-head">Lezioni (${lessons.length})</div>
    ${lessons.slice(0, 60).map((l) => `
      <div class="card card-row" style="padding:10px 12px">
        <div>${fmtDate(l.date)} · ${esc(l.time)}${l.makeupOf ? ' <span class="chip">recupero</span>' : ""}</div>
        <div>${l.status === "presente" ? `<span class="chip ok">${euro(l.price)}</span>`
          : l.status === "assente" ? `<span class="chip ko">assente</span>` : `<span class="chip">da fare</span>`}</div>
      </div>`).join("") || `<p class="muted">Nessuna lezione.</p>`}
    ${lessons.length > 60 ? `<p class="muted small">Mostrate le ultime 60. Il totale completo è nei Report.</p>` : ""}
  `);
  $("#sd-add", body).onclick = () => lessonForm(id);
  $("#sd-edit", body).onclick = () => studentForm(id);
}

// ===================== SCUOLE =====================
function renderSchools(view) {
  let html = "";
  if (!data.schools.length) {
    html += emptyBox("🏫", "Nessuna scuola. Aggiungila con il pulsante +.<br>Per ogni scuola scegli prezzo, durata della lezione e tipo di conteggio.");
  }
  const m = periodRange("month", 0);
  const sorted = [...data.schools].sort((a, b) => a.name.localeCompare(b.name));
  for (const s of sorted) {
    const nStud = data.students.filter((st) => st.schoolId === s.id).length;
    let sum, periodLabel;
    if (s.mode === "progressivo") {
      const since = s.resetAt || "";
      sum = summarize(data.lessons.filter((l) => l.schoolId === s.id && (l.date + "T" + l.time) > since));
      periodLabel = since ? `dal ${fmtDate(since.slice(0, 10))} (ultimo azzeramento)` : "dall'inizio";
    } else {
      sum = summarize(data.lessons.filter((l) => l.schoolId === s.id && inRange(l, m.from, m.to)));
      periodLabel = m.label;
    }
    html += `
      <div class="card">
        <div class="card-row">
          <div class="tap" data-school="${s.id}" style="cursor:pointer">
            <h3>${esc(s.name)}</h3>
            <div class="muted small">${euro(Number(s.price))} / lezione · ${s.duration} min · ${nStud} studenti</div>
          </div>
          <span class="chip ${s.mode === "progressivo" ? "warn" : ""}">${s.mode === "progressivo" ? "Progressivo" : "Mensile"}</span>
        </div>
        <div class="stats" style="margin:12px 0 0">
          ${statBox(euro(sum.earned), "totale " + periodLabel, "big")}
          ${statBox(hours(sum.minDone), `ore fatte · ${sum.done} lez.`, "ok")}
          ${statBox(hours(sum.minMissed), `ore perse · ${sum.missed} lez.`, "ko")}
        </div>
        ${s.mode === "progressivo" ? `<button class="btn small full" data-reset="${s.id}" style="margin-top:10px">Azzera conteggio</button>` : ""}
      </div>`;
  }
  // "Casa" (studenti senza scuola): sempre conteggio mensile
  const home = data.students.filter((st) => !st.schoolId);
  if (home.length) {
    const sum = summarize(data.lessons.filter((l) => !l.schoolId && inRange(l, m.from, m.to)));
    html += `
      <div class="card">
        <div class="card-row"><div><h3>Casa</h3><div class="muted small">${home.length} studenti · prezzo per studente</div></div><span class="chip">Mensile</span></div>
        <div class="stats" style="margin:12px 0 0">
          ${statBox(euro(sum.earned), "totale " + m.label, "big")}
          ${statBox(hours(sum.minDone), `ore fatte · ${sum.done} lez.`, "ok")}
          ${statBox(hours(sum.minMissed), `ore perse · ${sum.missed} lez.`, "ko")}
        </div>
      </div>`;
  }
  view.innerHTML = html;
  $$("[data-school]", view).forEach((c) => (c.onclick = () => schoolForm(c.dataset.school)));
  $$("[data-reset]", view).forEach((b) => (b.onclick = async () => {
    const s = schoolById(b.dataset.reset);
    if (await confirmBox("Azzera conteggio", `Azzero il totale di <b>${esc(s.name)}</b>? Il conteggio ripartirà da adesso. Le lezioni restano salvate e visibili nei Report.`, "Azzera")) {
      const now = new Date();
      const stamp = `${toISO(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
      save(() => store.update("schools", s.id, { resetAt: stamp }), "Conteggio azzerato");
    }
  }));
}

// ===================== REPORT =====================
function renderReports(view) {
  const r = periodRange(ui.reportType, ui.reportOffset);
  // filtro
  const f = ui.reportFilter;
  const match = (l) =>
    f === "all" ? true
    : f === "casa" ? !l.schoolId
    : f.startsWith("s:") ? l.schoolId === f.slice(2)
    : f.startsWith("p:") ? l.studentId === f.slice(2) : true;
  const list = data.lessons.filter((l) => inRange(l, r.from, r.to) && match(l));
  const sum = summarize(list);

  const opts = [`<option value="all">Tutte le scuole e studenti</option>`]
    .concat([...data.schools].sort((a, b) => a.name.localeCompare(b.name)).map((s) => `<option value="s:${s.id}">🏫 ${esc(s.name)}</option>`))
    .concat(`<option value="casa">🏠 Casa</option>`)
    .concat([...data.students].sort(byName).map((s) => `<option value="p:${s.id}">👤 ${esc(fullName(s))}</option>`))
    .join("");

  let html = `
    <div class="seg">
      ${["week", "month", "year"].map((t) => `<button data-rt="${t}" class="${ui.reportType === t ? "active" : ""}">${{ week: "Settimana", month: "Mese", year: "Anno" }[t]}</button>`).join("")}
    </div>
    <div class="pager">
      <button class="btn small" data-ro="-1">‹</button>
      <strong>${r.label}</strong>
      <button class="btn small" data-ro="1">›</button>
    </div>
    <select id="rep-filter" style="margin-bottom:12px">${opts}</select>
    <div class="stats">
      ${statBox(euro(sum.earned), "guadagnato (lordo)", "big")}
      ${statBox(hours(sum.minDone), `ore frequentate · ${sum.done} lez.`, "ok")}
      ${statBox(hours(sum.minMissed), `ore perse · ${sum.missed} lez.`, "ko")}
    </div>`;

  // Tabella per scuola (solo con "Tutti")
  if (f === "all") {
    const keys = [...new Set(list.map((l) => l.schoolId || ""))];
    if (keys.length) {
      const rows = keys
        .map((k) => ({ name: schoolName(k), s: summarize(list.filter((l) => (l.schoolId || "") === k)) }))
        .sort((a, b) => b.s.earned - a.s.earned);
      html += tableCard("Per scuola", rows, sum);
    }
  }
  // Tabella per studente (tranne quando si guarda un solo studente)
  if (!f.startsWith("p:")) {
    const ids = [...new Set(list.map((l) => l.studentId))];
    if (ids.length) {
      const rows = ids
        .map((id) => ({ name: fullName(studentById(id)), s: summarize(list.filter((l) => l.studentId === id)) }))
        .sort((a, b) => b.s.earned - a.s.earned);
      html += tableCard("Per studente", rows, sum);
    }
  }
  if (!list.length) html += emptyBox("📊", "Nessuna lezione in questo periodo.");
  view.innerHTML = html;

  $("#rep-filter", view).value = f;
  $("#rep-filter", view).onchange = (e) => { ui.reportFilter = e.target.value; render(); };
  $$("[data-rt]", view).forEach((b) => (b.onclick = () => { ui.reportType = b.dataset.rt; ui.reportOffset = 0; render(); }));
  $$("[data-ro]", view).forEach((b) => (b.onclick = () => { ui.reportOffset += Number(b.dataset.ro); render(); }));
}

function tableCard(title, rows, total) {
  return `
    <div class="card">
      <h3 style="margin-bottom:8px">${title}</h3>
      <div class="table-wrap"><table>
        <tr><th></th><th>Ore fatte</th><th>Ore perse</th><th>€</th></tr>
        ${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${hours(r.s.minDone)}</td><td>${hours(r.s.minMissed)}</td><td>${euro(r.s.earned)}</td></tr>`).join("")}
        ${rows.length > 1 ? `<tr class="total"><td>Totale</td><td>${hours(total.minDone)}</td><td>${hours(total.minMissed)}</td><td>${euro(total.earned)}</td></tr>` : ""}
      </table></div>
    </div>`;
}

// ===================== NETTO =====================
// Netto = lordo - tasse (TAX_RATE, di base 30%)
function renderNet(view) {
  const year = new Date().getFullYear() + ui.netYearOffset;
  const yl = data.lessons.filter((l) => l.date.startsWith(year + "-") && l.status === "presente");
  const mm = `${year}-${pad(ui.netMonth + 1)}`;
  const ml = yl.filter((l) => l.date.startsWith(mm));
  const pct = Math.round(TAX_RATE * 100);

  // tabella lordo / tasse / netto per scuola
  const netTable = (lessons) => {
    const keys = [...new Set([...data.schools.map((s) => s.id), ...lessons.map((l) => l.schoolId || "")])];
    const rows = keys
      .map((k) => ({ name: schoolName(k), gross: lessons.filter((l) => (l.schoolId || "") === k).reduce((a, l) => a + (l.price || 0), 0) }))
      .filter((r) => r.gross > 0)
      .sort((a, b) => b.gross - a.gross);
    const tot = rows.reduce((a, r) => a + r.gross, 0);
    if (!rows.length) return `<p class="muted">Nessun incasso.</p>`;
    return `<div class="table-wrap"><table>
      <tr><th></th><th>Lordo</th><th>Tasse ${pct}%</th><th>Netto</th></tr>
      ${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${euro(r.gross)}</td><td>${euro(r.gross * TAX_RATE)}</td><td><b>${euro(r.gross * (1 - TAX_RATE))}</b></td></tr>`).join("")}
      <tr class="total"><td>Tutte le scuole</td><td>${euro(tot)}</td><td>${euro(tot * TAX_RATE)}</td><td>${euro(tot * (1 - TAX_RATE))}</td></tr>
    </table></div>`;
  };

  const grossY = yl.reduce((a, l) => a + (l.price || 0), 0);
  const grossM = ml.reduce((a, l) => a + (l.price || 0), 0);

  // mese per mese
  const months = Array.from({ length: 12 }, (_, i) => {
    const g = yl.filter((l) => l.date.startsWith(`${year}-${pad(i + 1)}`)).reduce((a, l) => a + (l.price || 0), 0);
    return { i, g };
  });

  view.innerHTML = `
    <div class="pager">
      <button class="btn small" data-ny="-1">‹</button>
      <strong>Anno ${year}</strong>
      <button class="btn small" data-ny="1">›</button>
    </div>
    <div class="stats">
      ${statBox(euro(grossY * (1 - TAX_RATE)), `netto ${year}`, "ok")}
      ${statBox(euro(grossY), `lordo ${year}`)}
    </div>

    <div class="card">
      <div class="card-row" style="margin-bottom:8px">
        <h3>Mese</h3>
        <select id="net-month" style="width:auto">${Array.from({ length: 12 }, (_, i) => `<option value="${i}">${monthName(i)}</option>`).join("")}</select>
      </div>
      <p class="muted small" style="margin:0 0 8px">Netto ${monthName(ui.netMonth)}: <b>${euro(grossM * (1 - TAX_RATE))}</b></p>
      ${netTable(ml)}
    </div>

    <div class="card">
      <h3 style="margin-bottom:8px">Anno ${year}</h3>
      ${netTable(yl)}
    </div>

    <div class="card">
      <h3 style="margin-bottom:8px">Mese per mese</h3>
      <div class="table-wrap"><table>
        <tr><th>Mese</th><th>Lordo</th><th>Netto</th></tr>
        ${months.map((m) => `<tr><td style="text-transform:capitalize">${monthName(m.i)}</td><td>${euro(m.g)}</td><td>${euro(m.g * (1 - TAX_RATE))}</td></tr>`).join("")}
        <tr class="total"><td>Totale</td><td>${euro(grossY)}</td><td>${euro(grossY * (1 - TAX_RATE))}</td></tr>
      </table></div>
    </div>
    <p class="muted small">Calcolo semplificato: netto = lordo − ${pct}%. Puoi cambiare la percentuale in js/config.js.</p>`;

  $("#net-month", view).value = ui.netMonth;
  $("#net-month", view).onchange = (e) => { ui.netMonth = Number(e.target.value); render(); };
  $$("[data-ny]", view).forEach((b) => (b.onclick = () => { ui.netYearOffset += Number(b.dataset.ny); render(); }));
}

// ---------------------------------------------------------------------
// 4. FORM
// ---------------------------------------------------------------------

// ---------- Scuola ----------
function schoolForm(id) {
  const s = id ? schoolById(id) : { name: "", price: "", duration: 60, mode: "mensile" };
  const body = openModal(id ? "Modifica scuola" : "Nuova scuola", `
    <form class="form" id="f">
      <label class="field">Nome<input name="name" required value="${esc(s.name)}" /></label>
      <div class="row">
        <label class="field">Prezzo lezione (€)<input name="price" type="number" step="0.01" min="0" inputmode="decimal" required value="${esc(s.price)}" /></label>
        <label class="field">Durata (min)<input name="duration" type="number" min="5" step="5" inputmode="numeric" required value="${esc(s.duration)}" /></label>
      </div>
      <label class="field">Conteggio
        <select name="mode">
          <option value="mensile">Mensile (riparte ogni mese)</option>
          <option value="progressivo">Progressivo (cresce finché non azzero)</option>
        </select>
      </label>
      ${id ? `<p class="muted small">Il nuovo prezzo vale per le lezioni create da adesso: quelle già inserite mantengono il loro prezzo.</p>` : ""}
      <div class="actions">
        ${id ? `<button type="button" class="btn danger" id="del">Elimina</button>` : ""}
        <button class="btn primary">Salva</button>
      </div>
    </form>`);
  $("[name=mode]", body).value = s.mode || "mensile";
  $("#f", body).onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const obj = { name: fd.name.trim(), price: Number(fd.price), duration: Number(fd.duration), mode: fd.mode };
    const ok = await save(() => (id ? store.update("schools", id, obj) : store.add("schools", { ...obj, resetAt: "" })), "Scuola salvata");
    if (ok) closeModal();
  };
  if (id) $("#del", body).onclick = async () => {
    const n = data.students.filter((st) => st.schoolId === id).length;
    if (n) return toast(`Ci sono ${n} studenti in questa scuola: spostali o eliminali prima.`);
    if (await confirmBox("Elimina scuola", `Eliminare <b>${esc(s.name)}</b>?`, "Elimina")) save(() => store.remove("schools", id), "Scuola eliminata");
  };
}

// ---------- Studente ----------
function studentForm(id) {
  const s = id ? studentById(id) : { firstName: "", lastName: "", schoolId: data.schools[0]?.id || "", price: "", duration: 60 };
  const body = openModal(id ? "Modifica studente" : "Nuovo studente", `
    <form class="form" id="f">
      <div class="row">
        <label class="field">Nome<input name="firstName" required value="${esc(s.firstName)}" /></label>
        <label class="field">Cognome<input name="lastName" required value="${esc(s.lastName)}" /></label>
      </div>
      <label class="field">Scuola
        <select name="schoolId">
          ${[...data.schools].sort((a, b) => a.name.localeCompare(b.name)).map((sc) => `<option value="${sc.id}">${esc(sc.name)} · ${euro(Number(sc.price))}</option>`).join("")}
          <option value="">Casa (nessuna scuola)</option>
        </select>
      </label>
      <div class="row" id="home-fields">
        <label class="field">Prezzo lezione (€)<input name="price" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(s.price)}" /></label>
        <label class="field">Durata (min)<input name="duration" type="number" min="5" step="5" inputmode="numeric" value="${esc(s.duration || 60)}" /></label>
      </div>
      <p class="muted small" id="school-note">Prezzo e durata sono quelli della scuola.</p>
      <div class="actions">
        ${id ? `<button type="button" class="btn danger" id="del">Elimina</button>` : ""}
        <button class="btn primary">Salva</button>
      </div>
    </form>`);
  const sel = $("[name=schoolId]", body);
  sel.value = s.schoolId || "";
  const toggle = () => {
    const home = sel.value === "";
    $("#home-fields", body).classList.toggle("hidden", !home);
    $("#school-note", body).classList.toggle("hidden", home);
    $("[name=price]", body).required = home;
  };
  sel.onchange = toggle;
  toggle();

  $("#f", body).onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const obj = { firstName: fd.firstName.trim(), lastName: fd.lastName.trim(), schoolId: fd.schoolId };
    if (!fd.schoolId) { obj.price = Number(fd.price); obj.duration = Number(fd.duration) || 60; }
    const ok = await save(() => (id ? store.update("students", id, obj) : store.add("students", obj)), "Studente salvato");
    if (ok) closeModal();
  };
  if (id) $("#del", body).onclick = async () => {
    const ids = data.lessons.filter((l) => l.studentId === id).map((l) => l.id);
    if (await confirmBox("Elimina studente", `Eliminare <b>${esc(fullName(s))}</b> e le sue <b>${ids.length}</b> lezioni? Spariranno anche dai report.`, "Elimina tutto")) {
      save(async () => { await store.removeMany("lessons", ids); await store.remove("students", id); }, "Studente eliminato");
    }
  };
}

// ---------- Nuova lezione (singola o settimanale) ----------
function lessonForm(studentId = "") {
  if (!data.students.length) return toast("Aggiungi prima uno studente.");
  const today = todayISO();
  const body = openModal("Nuova lezione", `
    <form class="form" id="f">
      <label class="field">Studente
        <select name="studentId" required>
          ${[...data.students].sort(byName).map((s) => `<option value="${s.id}">${esc(fullName(s))} · ${esc(schoolName(s.schoolId))}</option>`).join("")}
        </select>
      </label>
      <div class="row">
        <label class="field">Data<input name="date" type="date" required value="${today}" /></label>
        <label class="field">Ora<input name="time" type="time" required value="16:00" /></label>
      </div>
      <p class="muted small" id="terms"></p>
      <label class="field">Ripetizione
        <select name="repeat">
          <option value="single">Lezione singola</option>
          <option value="weekly">Ogni settimana (stesso giorno e ora)</option>
        </select>
      </label>
      <label class="field hidden" id="until-f">Fino al<input name="until" type="date" value="${addDays(today, 91)}" /></label>
      <p class="muted small hidden" id="count"></p>
      <button class="btn primary">Salva</button>
    </form>`);
  const sel = $("[name=studentId]", body);
  if (studentId) sel.value = studentId;
  const upd = () => {
    const st = studentById(sel.value);
    const t = lessonTerms(st);
    $("#terms", body).textContent = `${euro(t.price)} · ${t.duration} min (${schoolName(t.schoolId)})`;
    const weekly = $("[name=repeat]", body).value === "weekly";
    $("#until-f", body).classList.toggle("hidden", !weekly);
    $("#count", body).classList.toggle("hidden", !weekly);
    if (weekly) $("#count", body).textContent = `Verranno create ${weeklyDates($("[name=date]", body).value, $("[name=until]", body).value).length} lezioni.`;
  };
  $$("select, input", body).forEach((el) => el.addEventListener("input", upd));
  upd();

  $("#f", body).onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const st = studentById(fd.studentId);
    const base = { studentId: st.id, time: fd.time, status: "programmata", recovery: null, makeupOf: null, ...lessonTerms(st) };
    const dates = fd.repeat === "weekly" ? weeklyDates(fd.date, fd.until) : [fd.date];
    if (!dates.length) return toast("Controlla le date: 'fino al' deve essere dopo la prima lezione.");
    if (dates.length > 200) return toast("Massimo 200 lezioni alla volta.");
    const ok = await save(() => store.addMany("lessons", dates.map((date) => ({ ...base, date }))),
      dates.length > 1 ? `${dates.length} lezioni create` : "Lezione creata");
    if (ok) {
      closeModal();
      // porta la vista sulla settimana della prima lezione
      ui.tab = "lessons"; ui.lessonsMode = "week"; ui.selDay = fd.date;
      ui.weekOffset = Math.round((fromISO(startOfWeek(fd.date)) - fromISO(startOfWeek(todayISO()))) / (7 * 864e5));
      render();
    }
  };
}

function weeklyDates(from, until) {
  const out = [];
  if (!from || !until) return out;
  for (let d = from; d <= until && out.length <= 200; d = addDays(d, 7)) out.push(d);
  return out;
}

// ---------- Modifica lezione ----------
function editLessonForm(id) {
  const l = data.lessons.find((x) => x.id === id);
  if (!l) return;
  const st = studentById(l.studentId);
  const body = openModal("Lezione", `
    <p style="margin-top:0"><b>${esc(fullName(st))}</b> · ${esc(schoolName(l.schoolId))}</p>
    <form class="form" id="f">
      <div class="row">
        <label class="field">Data<input name="date" type="date" required value="${l.date}" /></label>
        <label class="field">Ora<input name="time" type="time" required value="${esc(l.time)}" /></label>
      </div>
      <div class="row">
        <label class="field">Prezzo (€)<input name="price" type="number" step="0.01" min="0" value="${l.price}" /></label>
        <label class="field">Durata (min)<input name="duration" type="number" min="5" step="5" value="${l.duration}" /></label>
      </div>
      <label class="field">Stato
        <select name="status">
          <option value="programmata">Da fare</option>
          <option value="presente">Presente</option>
          <option value="assente">Assente</option>
        </select>
      </label>
      ${l.status === "assente" ? `<button type="button" class="btn" id="rec">Gestisci recupero</button>` : ""}
      <div class="actions">
        <button type="button" class="btn danger" id="del">Elimina</button>
        <button class="btn primary">Salva</button>
      </div>
      <button type="button" class="btn small" id="del-next">Elimina questa e le successive di ${esc(st?.firstName || "")} alla stessa ora</button>
    </form>`);
  $("[name=status]", body).value = l.status;
  $("#f", body).onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const patch = { date: fd.date, time: fd.time, price: Number(fd.price), duration: Number(fd.duration), status: fd.status };
    if (fd.status !== "assente") patch.recovery = null;
    const ok = await save(async () => {
      await store.update("lessons", id, patch);
      if (l.makeupOf && data.lessons.some((x) => x.id === l.makeupOf)) {
        await store.update("lessons", l.makeupOf, { recovery: fd.status === "presente" ? "fatto" : "programmato" });
      }
    }, "Lezione salvata");
    if (ok) {
      closeModal();
      if (fd.status === "assente" && l.status !== "assente") recoveryForm(id);
    }
  };
  const rec = $("#rec", body);
  if (rec) rec.onclick = () => recoveryForm(id);
  $("#del", body).onclick = async () => {
    if (await confirmBox("Elimina lezione", `Eliminare la lezione del ${fmtDate(l.date)}?`, "Elimina")) save(() => store.remove("lessons", id), "Lezione eliminata");
  };
  const dn = $("#del-next", body);
  if (dn) dn.onclick = async () => {
    const ids = data.lessons
      .filter((x) => x.studentId === l.studentId && x.time === l.time && x.date >= l.date && x.status === "programmata" && fromISO(x.date).getDay() === fromISO(l.date).getDay())
      .map((x) => x.id);
    if (!ids.includes(id)) ids.push(id);
    if (await confirmBox("Elimina lezioni", `Eliminare <b>${ids.length}</b> lezioni (da fare) dal ${fmtDate(l.date)} in poi, stesso giorno e ora?`, "Elimina"))
      save(() => store.removeMany("lessons", ids), `${ids.length} lezioni eliminate`);
  };
}

// ---------- Recupero di una lezione persa ----------
function recoveryForm(id, scheduleOnly = false) {
  const l = data.lessons.find((x) => x.id === id);
  if (!l) return;
  const st = studentById(l.studentId);
  const body = openModal("Recupero lezione", `
    <p style="margin-top:0"><b>${esc(fullName(st))}</b> era assente il ${fmtDate(l.date)}. La lezione vale 0 €.<br>Quando viene recuperata?</p>
    <form class="form" id="f">
      <div class="row">
        <label class="field">Data recupero<input name="date" type="date" required value="${addDays(l.date, 7)}" /></label>
        <label class="field">Ora<input name="time" type="time" required value="${esc(l.time)}" /></label>
      </div>
      <button class="btn primary">Fissa il recupero</button>
    </form>
    ${scheduleOnly ? "" : `
    <div class="sep"><span>oppure</span></div>
    <div class="form">
      <button class="btn" id="later">Segna "da recuperare" (decido dopo)</button>
      <button class="btn" id="none">Non va recuperata</button>
    </div>`}`);
  $("#f", body).onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const ok = await save(async () => {
      await store.add("lessons", {
        studentId: l.studentId, date: fd.date, time: fd.time,
        price: l.price, duration: l.duration, schoolId: l.schoolId || "",
        status: "programmata", recovery: null, makeupOf: l.id,
      });
      await store.update("lessons", l.id, { recovery: "programmato" });
    }, "Recupero fissato");
    if (ok) closeModal();
  };
  if (!scheduleOnly) {
    $("#later", body).onclick = async () => { if (await save(() => store.update("lessons", id, { recovery: "da_recuperare" }), "Segnata da recuperare")) closeModal(); };
    $("#none", body).onclick = async () => { if (await save(() => store.update("lessons", id, { recovery: null }))) closeModal(); };
  }
}

// ---------------------------------------------------------------------
// 5. MENU: backup, import, logout
// ---------------------------------------------------------------------
function menu() {
  const body = openModal("Menu", `
    <p class="muted" style="margin-top:0">Account: <b>${esc(user?.email || "")}</b>${DEMO_MODE ? " (demo)" : ""}</p>
    <div class="form">
      <button class="btn" id="m-exp">⬇️ Esporta backup (file .json)</button>
      <button class="btn" id="m-imp">⬆️ Importa backup</button>
      <input type="file" id="m-file" accept="application/json,.json" class="hidden" />
      ${DEMO_MODE ? `<button class="btn" id="m-demo">🧪 Carica dati di esempio</button>` : ""}
      <button class="btn danger" id="m-out">Esci</button>
    </div>
    <p class="muted small">I dati sono salvati online sul tuo account${DEMO_MODE ? " (non in modalità demo)" : ""}. Il backup è una copia in più, da tenere dove vuoi.</p>`);
  $("#m-exp", body).onclick = exportBackup;
  $("#m-imp", body).onclick = () => $("#m-file", body).click();
  $("#m-file", body).onchange = (e) => e.target.files[0] && importBackup(e.target.files[0]);
  $("#m-out", body).onclick = async () => { closeModal(); await store.logout(); };
  const demo = $("#m-demo", body);
  if (demo) demo.onclick = async () => { await loadDemoData(); closeModal(); toast("Dati di esempio caricati"); };
}

function exportBackup() {
  const strip = (arr) => arr.map(({ ...x }) => x);
  const payload = { app: "canto-ore", version: 1, exportedAt: new Date().toISOString(),
    schools: strip(data.schools), students: strip(data.students), lessons: strip(data.lessons) };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `canto-ore-backup-${todayISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast("Backup scaricato");
}

// Importa un backup: crea nuovi documenti e ricollega gli id (scuola → studente → lezione)
async function importBackup(file) {
  let b;
  try { b = JSON.parse(await file.text()); } catch { return toast("File non valido."); }
  if (b.app !== "canto-ore") return toast("Questo non è un backup di Canto Ore.");
  const ok = await confirmBox("Importa backup",
    `Aggiungo ${b.schools.length} scuole, ${b.students.length} studenti e ${b.lessons.length} lezioni ai dati attuali. Se li hai già, verranno duplicati.`, "Importa", false);
  if (!ok) return;
  await save(async () => {
    const map = {};
    const clean = ({ id, createdAt, ...rest }) => rest;
    for (const s of b.schools) map[s.id] = await store.add("schools", clean(s));
    for (const s of b.students) map[s.id] = await store.add("students", { ...clean(s), schoolId: s.schoolId ? map[s.schoolId] || "" : "" });
    // prima le lezioni normali, poi i recuperi (che puntano alle lezioni normali)
    const order = [...b.lessons].sort((x, y) => (x.makeupOf ? 1 : 0) - (y.makeupOf ? 1 : 0));
    for (const l of order) {
      map[l.id] = await store.add("lessons", {
        ...clean(l), studentId: map[l.studentId] || l.studentId,
        schoolId: l.schoolId ? map[l.schoolId] || "" : "", makeupOf: l.makeupOf ? map[l.makeupOf] || null : null,
      });
    }
  }, "Backup importato");
}

// Dati finti per provare l'app in modalità demo
async function loadDemoData() {
  const a = await store.add("schools", { name: "Accademia Musica", price: 25, duration: 60, mode: "mensile", resetAt: "" });
  const b = await store.add("schools", { name: "Scuola Voce Bergamo", price: 20, duration: 45, mode: "progressivo", resetAt: "" });
  const studs = [
    { firstName: "Giulia", lastName: "Rossi", schoolId: a },
    { firstName: "Marco", lastName: "Bianchi", schoolId: a },
    { firstName: "Sara", lastName: "Verdi", schoolId: b },
    { firstName: "Luca", lastName: "Neri", schoolId: "", price: 30, duration: 60 },
  ];
  const ids = [];
  for (const s of studs) ids.push(await store.add("students", s));
  const list = [];
  const start = addDays(startOfWeek(todayISO()), -42);
  const today = todayISO();
  ids.forEach((sid, i) => {
    const st = studentById(sid) || { ...studs[i], id: sid };
    const t = lessonTerms(st);
    for (let w = 0; w < 9; w++) {
      const date = addDays(start, w * 7 + i);
      const past = date < today;
      const absent = past && (w + i) % 5 === 0;
      list.push({ studentId: sid, date, time: ["15:00", "16:00", "17:30", "18:30"][i], ...t,
        status: past ? (absent ? "assente" : "presente") : "programmata",
        recovery: absent ? "da_recuperare" : null, makeupOf: null });
    }
  });
  await store.addMany("lessons", list);
}

start();
