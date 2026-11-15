// =====================================================================
//  STORE: tutto quello che legge/scrive i dati passa da qui.
//  Ci sono due "motori" con gli stessi metodi:
//   - FirebaseStore: dati salvati online su Firestore (uno spazio per utente)
//   - DemoStore:     dati solo in memoria, per provare l'app senza Firebase
//  In questo modo app.js non sa (e non gli importa) dove finiscono i dati.
// =====================================================================

import { firebaseConfig, DEMO_MODE } from "./config.js";

const COLLECTIONS = ["schools", "students", "lessons"];
const FB = "https://www.gstatic.com/firebasejs/11.0.2/";

// ---------------------------------------------------------------------
//  Motore Firebase
// ---------------------------------------------------------------------
class FirebaseStore {
  async init() {
    // import dinamici: Firebase viene scaricato solo se serve davvero
    const [{ initializeApp }, authMod, fsMod] = await Promise.all([
      import(FB + "firebase-app.js"),
      import(FB + "firebase-auth.js"),
      import(FB + "firebase-firestore.js"),
    ]);
    this.a = authMod;
    this.f = fsMod;
    const app = initializeApp(firebaseConfig);
    this.auth = authMod.getAuth(app);
    // cache offline: se manca la rete l'app continua a funzionare
    // e sincronizza appena torna la connessione. I dati "veri" restano online.
    this.db = fsMod.initializeFirestore(app, {
      localCache: fsMod.persistentLocalCache(),
    });
    this.unsubs = [];
  }

  onAuth(cb) {
    this.a.onAuthStateChanged(this.auth, (u) => {
      this.user = u;
      cb(u ? { email: u.email, uid: u.uid } : null);
    });
  }

  loginEmail(email, pw) {
    return this.a.signInWithEmailAndPassword(this.auth, email, pw);
  }
  registerEmail(email, pw) {
    return this.a.createUserWithEmailAndPassword(this.auth, email, pw);
  }
  loginGoogle() {
    return this.a.signInWithPopup(this.auth, new this.a.GoogleAuthProvider());
  }
  resetPassword(email) {
    return this.a.sendPasswordResetEmail(this.auth, email);
  }
  logout() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    return this.a.signOut(this.auth);
  }

  col(name) {
    return this.f.collection(this.db, "users", this.user.uid, name);
  }

  // Ascolta in tempo reale le 3 raccolte; chiama cb con tutti i dati
  subscribe(cb) {
    const data = { schools: [], students: [], lessons: [] };
    const ready = new Set();
    COLLECTIONS.forEach((name) => {
      const un = this.f.onSnapshot(this.col(name), (snap) => {
        data[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        ready.add(name);
        if (ready.size === COLLECTIONS.length) cb({ ...data });
      });
      this.unsubs.push(un);
    });
  }

  async add(name, obj) {
    const ref = await this.f.addDoc(this.col(name), { ...obj, createdAt: Date.now() });
    return ref.id;
  }
  // Più documenti in un colpo solo (es. lezioni settimanali ripetute)
  async addMany(name, list) {
    for (let i = 0; i < list.length; i += 400) {
      const batch = this.f.writeBatch(this.db);
      list.slice(i, i + 400).forEach((obj) => {
        batch.set(this.f.doc(this.col(name)), { ...obj, createdAt: Date.now() });
      });
      await batch.commit();
    }
  }
  update(name, id, patch) {
    return this.f.updateDoc(this.f.doc(this.col(name), id), patch);
  }
  remove(name, id) {
    return this.f.deleteDoc(this.f.doc(this.col(name), id));
  }
  async removeMany(name, ids) {
    for (let i = 0; i < ids.length; i += 400) {
      const batch = this.f.writeBatch(this.db);
      ids.slice(i, i + 400).forEach((id) => batch.delete(this.f.doc(this.col(name), id)));
      await batch.commit();
    }
  }
}

// ---------------------------------------------------------------------
//  Motore DEMO (in memoria)
// ---------------------------------------------------------------------
class DemoStore {
  async init() {
    this.data = { schools: [], students: [], lessons: [] };
    this.listeners = [];
    this.n = 0;
  }
  onAuth(cb) {
    this.authCb = cb;
    cb(null);
  }
  async loginEmail(email) {
    this.authCb({ email: email || "demo@canto-ore", uid: "demo" });
  }
  registerEmail(email) { return this.loginEmail(email); }
  loginGoogle() { return this.loginEmail("demo@canto-ore"); }
  async resetPassword() {}
  async logout() { this.authCb(null); }

  emit() {
    const copy = {};
    COLLECTIONS.forEach((c) => (copy[c] = this.data[c].map((x) => ({ ...x }))));
    this.listeners.forEach((cb) => cb(copy));
  }
  subscribe(cb) {
    this.listeners = [cb];
    this.emit();
  }
  async add(name, obj) {
    const id = "d" + ++this.n;
    this.data[name].push({ id, ...obj, createdAt: Date.now() });
    this.emit();
    return id;
  }
  async addMany(name, list) {
    list.forEach((obj) => this.data[name].push({ id: "d" + ++this.n, ...obj, createdAt: Date.now() }));
    this.emit();
  }
  async update(name, id, patch) {
    const it = this.data[name].find((x) => x.id === id);
    if (it) Object.assign(it, patch);
    this.emit();
  }
  async remove(name, id) {
    this.data[name] = this.data[name].filter((x) => x.id !== id);
    this.emit();
  }
  async removeMany(name, ids) {
    const s = new Set(ids);
    this.data[name] = this.data[name].filter((x) => !s.has(x.id));
    this.emit();
  }
}

export const store = DEMO_MODE ? new DemoStore() : new FirebaseStore();
