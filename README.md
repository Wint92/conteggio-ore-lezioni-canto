# 🎤 Canto Ore

Web app installabile sul telefono per gestire le lezioni di canto:
scuole, studenti, presenze, recuperi, report e netto (meno 30% di tasse).

- **Codice** → GitHub (pubblicato gratis con GitHub Pages)
- **Dati** → Firebase Firestore, online, separati per account e protetti dal login

---

## 1. Crea il progetto Firebase (10 minuti)

1. Vai su <https://console.firebase.google.com> → **Aggiungi progetto** → nome `canto-ore` (Google Analytics non serve).
2. **Authentication** → *Inizia* → scheda **Metodo di accesso**:
   - attiva **Email/password**
   - attiva **Google** (scegli la tua email come email di assistenza)
3. **Firestore Database** → *Crea database* → località **europe-west** (es. `eur3`) → *modalità produzione*.
4. Sempre in Firestore → scheda **Regole** → cancella tutto, incolla il contenuto del file
   [`firestore.rules`](firestore.rules) → **Pubblica**.
   > Queste regole fanno sì che ogni utente veda e modifichi solo i propri dati.
5. ⚙️ **Impostazioni progetto** → in basso *Le tue app* → icona **`</>`** (Web) → nome `canto-ore` → *Registra app*.
   Ti mostra un blocco `firebaseConfig = { ... }`: copia quei valori dentro **`js/config.js`**.

> La `apiKey` di Firebase **non è una password**: può stare su GitHub pubblico.
> La sicurezza dei dati la danno login + regole del punto 4.

## 2. Metti il codice su GitHub e pubblicalo

1. Su <https://github.com/new> crea una repository chiamata `canto-ore`.
2. Pagina della repo → **Add file → Upload files** → trascina **tutto il contenuto** della cartella
   (i file `index.html`, `README.md`… e le cartelle `css`, `js`, `icons`) → **Commit changes**.
3. **Settings → Pages** → *Source*: **Deploy from a branch** → Branch **main** / **(root)** → **Save**.
4. Dopo 1-2 minuti l'app è online su `https://TUO-UTENTE.github.io/canto-ore/`.

## 3. Autorizza il dominio su Firebase

Firebase → **Authentication → Impostazioni → Domini autorizzati → Aggiungi dominio** →
`TUO-UTENTE.github.io`. Senza questo passaggio il login con Google non funziona.

## 4. Installala sul telefono

Apri il link dal telefono:
- **iPhone (Safari)**: Condividi → *Aggiungi alla schermata Home*
- **Android (Chrome)**: menu ⋮ → *Installa app* / *Aggiungi a schermata Home*

---

## Come si usa

| Scheda | Cosa fai |
|---|---|
| **Scuole** | Nome, prezzo e durata lezione, conteggio **mensile** o **progressivo** (con pulsante *Azzera*) |
| **Studenti** | Nome, cognome, scuola oppure **Casa** (prezzo e durata personali) |
| **Lezioni** | Singole o **settimanali ripetute**; ✓ presente (somma il prezzo), ✕ assente (0 €) → chiede la data del recupero o la segna *da recuperare* |
| **Report** | Settimana / mese / anno, per tutti, per scuola o per studente: ore fatte, ore perse, guadagnato |
| **Netto** | Lordo, tasse 30% e netto, per mese e per anno, per scuola e totale |

**Menu ⋮** → *Esporta backup*: scarica tutti i dati in un file `.json` (copia di sicurezza extra).

## Modificare l'app

- Percentuale tasse: `TAX_RATE` in `js/config.js`
- Dopo ogni modifica caricata su GitHub, aumenta `VERSION` in `sw.js` (es. `canto-ore-v2`)
  così i telefoni scaricano la versione nuova.

## Struttura

```
index.html          pagina unica (login + app)
css/style.css       grafica (chiara/scura automatica)
js/config.js        configurazione Firebase e tasse  ← da compilare
js/store.js         lettura/scrittura dati (Firebase o demo)
js/utils.js         date, formattazione, calcoli
js/app.js           schermate e logica
firestore.rules     regole di sicurezza da incollare in Firebase
sw.js, manifest     rendono l'app installabile
```

Senza configurazione Firebase l'app parte in **modalità demo** (dati solo in memoria,
dal menu ⋮ puoi caricare dati di esempio).
