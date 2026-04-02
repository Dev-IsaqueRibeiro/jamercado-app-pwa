// lib/firebase.js

// 1. Padronizando todos os imports para links diretos (CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore,
  enableIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "XXXXXXXXXXXX",
  authDomain: "XXXXXXXXXXXX",
  projectId: "XXXXXXXXXXXX",
  storageBucket: "XXXXXXXXXXXX",
  messagingSenderId: "XXXXXXXXXXXX",
  appId: "XXXXXXXXXXXX",
  measurementId: "XXXXXXX",
};

// Inicialização
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Analytics só roda no navegador
const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;

// Configuração de Persistência Offline
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === "failed-precondition") {
    console.warn("Persistência offline: falhou (muitas abas abertas).");
  } else if (err.code === "unimplemented") {
    console.warn("Persistência offline: o navegador não suporta.");
  }
});

export { auth, db, googleProvider, analytics };
