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
  apiKey: "AIzaSyCMtRvkJ2UlMVj9D_2j7T72gIGgHmTD1IU",
  authDomain: "jamercado-14a85.firebaseapp.com",
  projectId: "jamercado-14a85",
  storageBucket: "jamercado-14a85.firebasestorage.app",
  messagingSenderId: "141910404887",
  appId: "1:141910404887:web:c0ed5d6fc25f3f32649152",
  measurementId: "G-TQDRYEWHNF",
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
