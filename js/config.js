// =====================================================================
//  CONFIGURAZIONE
//  1) Incolla qui sotto i dati del TUO progetto Firebase
//     (Console Firebase → Impostazioni progetto → Le tue app → App web → Config)
//  2) Finché apiKey contiene "INSERISCI", l'app parte in MODALITÀ DEMO:
//     i dati restano solo in memoria e spariscono ricaricando la pagina.
// =====================================================================

export const firebaseConfig = {
  apiKey: "INSERISCI_API_KEY",
  authDomain: "INSERISCI.firebaseapp.com",
  projectId: "INSERISCI",
  storageBucket: "INSERISCI.appspot.com",
  messagingSenderId: "INSERISCI",
  appId: "INSERISCI",
};

// Aliquota tasse usata per il calcolo del netto (0.30 = 30%)
export const TAX_RATE = 0.30;

// true = modalità demo (nessun salvataggio online)
export const DEMO_MODE = firebaseConfig.apiKey.includes("INSERISCI");
