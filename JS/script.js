// JS/script.js

import { auth, db, googleProvider } from "../lib/firebase.js";

// Importando Auth via link direto (mais seguro para o navegador)
import {
  signInWithPopup,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Importando Firestore via link direto
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const userLocale = navigator.language || "pt-BR";
const currencyCode = userLocale.startsWith("pt") ? "BRL" : "USD";

const currencyFormatter = new Intl.NumberFormat(userLocale, {
  style: "currency",
  currency: currencyCode,
});

function formatCurrency(value) {
  return currencyFormatter.format(value);
}

// ==========================
// ESTADO DA APLICAÇÃO
// ==========================
let products = []; // Começa vazio, vamos carregar depois // Lista de Produtos
let qty = 0; // Quantidade no Modal;
let stores = JSON.parse(localStorage.getItem("stores")) || [];
let savedLists = JSON.parse(localStorage.getItem("savedLists")) || [];
let currentEditingItem = null; // Variável Global
let userDocId = null; // 🔥 ID do usuário no Firestore (GLOBAL)
let productSuggestions = []; // Carrega o o Histórido do que Foi digitado pelos Usuários
let deferredPrompt;

// ==========================
// ELEMENTOS DO DOM
// ==========================
const productInput = document.getElementById("productInput");
const addBtn = document.getElementById("addBtn");
const clearBtn = document.getElementById("clearBtn");
const productList = document.getElementById("productList");

const googleLoginBtn = document.getElementById("googleLoginBtn");

const loginBtn = document.getElementById("loginBtn");
const loginModal = document.getElementById("loginModal");
const emailLoginBtn = document.getElementById("emailLoginBtn");
const emailSignUpBtn = document.getElementById("emailSignUpBtn");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");

const totalItems = document.getElementById("totalItems");
const totalPrice = document.getElementById("totalPrice");
const cartIcon = document.getElementById("cartIcon");

const emptyState = document.getElementById("emptyState");
const saveListBtn = document.getElementById("saveListBtn");
const viewListsBtn = document.getElementById("viewListsBtn");

// MODAL
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const priceInput = document.getElementById("priceInput");
const qtyValue = document.getElementById("qtyValue");
const subTotal = document.getElementById("subTotal");

const feedbackModal = document.getElementById("feedbackModal");
const feedbackTitle = document.getElementById("feedbackTitle");
const feedbackMessage = document.getElementById("feedbackMessage");
const feedbackOk = document.getElementById("feedbackOk");

const listsModal = document.getElementById("listsModal");
const listsContainer = document.getElementById("listsContainer");
const closeListsModal = document.getElementById("closeListsModal");

const plus = document.getElementById("plus");
const minus = document.getElementById("minus");
const confirmBtn = document.getElementById("confirmBtn");
const deleteBtn = document.getElementById("deleteBtn");

const storeSelect = document.getElementById("storeSelect");
const newStoreInput = document.getElementById("newStoreInput");
const nameOnlyInput = document.getElementById("nameOnlyInput");

const confirmRemoveModal = document.getElementById("confirmRemoveModal");
const confirmModal = document.getElementById("confirmModal");
const confirmTitle = document.getElementById("confirmTitle");
const confirmMessage = document.getElementById("confirmMessage");
const confirmOk = document.getElementById("confirmOk");
const confirmCancel = document.getElementById("confirmCancel");

// 🔥 Fechar Modal ao clicar fora
confirmRemoveModal.onclick = (e) => {
  if (e.target === confirmRemoveModal) {
    confirmRemoveModal.classList.add("hidden");
  }
};

// 🔥 Fechar Modal ao clicar fora
confirmModal.onclick = (e) => {
  if (e.target === confirmModal) {
    confirmModal.classList.add("hidden");
  }
};

// 🔥 Fechar Sugestões ao clicar fora
document.addEventListener("click", (e) => {
  if (!e.target.closest(".add-product")) {
    removeSuggestions();
  }
});

// 🔥 CONFIGURAÇÃO DOS PLACEHOLDERS (INSERIR AQUI)
if (newStoreInput) {
  newStoreInput.placeholder = "Digite o mercado";
}

if (priceInput) {
  priceInput.placeholder = "12,99";
}

// ==========================
// FORMATAÇÃO EM TEMPO REAL
// ==========================

// 1. Capitalize nos inputs de texto
[productInput, newStoreInput, nameOnlyInput].forEach((input) => {
  if (input) {
    input.addEventListener("input", (e) => {
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      e.target.value = capitalizeWords(e.target.value);
      e.target.setSelectionRange(start, end);
    });
  }
});

// 2. Formatação de Moeda Automática
priceInput.addEventListener("input", (e) => {
  // 1. Remove tudo que não é número
  let value = e.target.value.replace(/\D/g, "");

  // 2. Transforma em decimal (ex: 150 vira 1.50)
  let numericValue = (Number(value) / 100).toFixed(2);

  // 3. Formata para o padrão brasileiro (R$ 1.500,00)
  let displayValue = Number(numericValue).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // 4. Se o campo estiver vazio, limpa, senão coloca o valor formatado
  e.target.value = value === "" ? "" : displayValue;

  updateSubtotal();
});

// Limpar preço ao focar no input
priceInput.addEventListener("focus", () => {
  priceInput.value = "";
});

// ==============================
// LÓGICA DE USUÁRIO E CONTADOR
// ==============================
function getUserName(user) {
  const localName = localStorage.getItem("userName");

  return (
    user.displayName?.split(" ")[0] ||
    localName ||
    user.email?.split("@")[0] ||
    "Usuário"
  );
}

onAuthStateChanged(auth, async (user) => {
  const userInfo = document.getElementById("userInfo");
  const loginBtn = document.getElementById("loginBtn");

  if (user) {
    loginBtn.style.display = "none";
    userInfo.style.display = "flex";

    // LIMPA o array local para não duplicar com o que vem do banco
    products = [];

    let userNumber = 0;

    // 🔍 PROCURA usuário existente
    const q = query(collection(db, "users"), where("uid", "==", user.uid));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const docSnap = querySnapshot.docs[0];

      userNumber = docSnap.data().sequence;
      userDocId = docSnap.id; // 🔥 SALVA GLOBAL
    } else {
      // 🆕 NOVO USUÁRIO
      userNumber = await generateNextSequence();

      const nameToSave = getUserName(user);

      const formattedNum = String(userNumber).padStart(3, "0");
      const safeName = nameToSave.toLowerCase().replace(/\s+/g, "-");

      userDocId = `${safeName}-${formattedNum}`; // 🔥 GLOBAL

      const userRef = doc(db, "users", userDocId);

      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        name: nameToSave,
        sequence: userNumber,
        createdAt: new Date(),
        trialEnds: Date.now() + 30 * 24 * 60 * 60 * 1000,
        isPremium: false,
      });
    }

    // FORMATO IMPACTANTE: 001
    const formattedNumber = String(userNumber).padStart(3, "0");
    const name = getUserName(user);

    userInfo.innerHTML = `
            <span class="user-name">${name}</span>
            <span class="user-separator">-</span>
            <div class="user-badge">
                <span class="user-number">${formattedNumber}<sup>U</sup></span>
            </div>
        `;
    products = [];
    initRealtimeProducts(user);
    loadSavedListsRealtime();

    await loadProductSuggestions();

    await checkSubscription();

    // Se for login por e-mail e não tiver nome, abre o modal
    if (!user.displayName && !localName) {
      document.getElementById("nameModal").classList.remove("hidden");
    }
  } else {
    loginBtn.style.display = "block";
    userInfo.style.display = "none";
    // Se deslogado, pega do LocalStorage
    products = JSON.parse(localStorage.getItem("products")) || [];
    renderWithGroups([...products]);
  }
});

// FUNÇÃO DE VERIFICAÇÃO DE ASSINATURA
async function checkSubscription() {
  if (!userDocId) return true;

  const userRef = doc(db, "users", userDocId);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) return true;

  const data = userSnap.data();

  if (data.isPremium) return true;

  const now = Date.now();
  const trialEnds = data.trialEnds;

  if (now > trialEnds) {
    showPaymentModal();
    return false;
  }

  return true;
}
// FIM DA → FUNÇÃO DE VERIFICAÇÃO DE ASSINATURA

function showPaymentModal() {
  document.getElementById("paymentModal").classList.remove("hidden");
}

// FUNÇÃO ÚNICA PARA CONTROLAR A SEQUÊNCIA (Mantenha apenas esta)
async function generateNextSequence() {
  const counterRef = doc(db, "app_settings", "user_counter");

  try {
    return await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef);

      if (!counterSnap.exists()) {
        // Se for o primeiríssimo usuário do app
        transaction.set(counterRef, { last_number: 1 });
        return 1;
      }

      const nextNumber = counterSnap.data().last_number + 1;
      transaction.update(counterRef, { last_number: nextNumber });
      return nextNumber;
    });
  } catch (e) {
    console.error("Falha na transação do contador:", e);
    return 0;
  }
}

// ==========================
// FUNÇÕES
// ==========================
// FUNÇÃO RENDER (O CÉREBRO)
function render() {
  productList.innerHTML = "";
  let total = 0;
  let items = 0;

  // 1. Agrupar por Mercado e depois por Categoria
  const grouped = {};
  products.forEach((p, index) => {
    const store = p.store || "Sem mercado";
    const category = p.category || "Outros";

    if (!grouped[store]) grouped[store] = {};
    if (!grouped[store][category]) grouped[store][category] = [];

    grouped[store][category].push({ ...p, originalIndex: index });
  });

  // 2. Renderizar (Ordenando Mercados e Categorias alfabeticamente)
  Object.keys(grouped)
    .sort()
    .forEach((store) => {
      const storeTitle = document.createElement("h3");
      storeTitle.className = "store-title";
      storeTitle.textContent = store;
      fragment.appendChild(storeTitle);

      Object.keys(grouped[store])
        .sort()
        .forEach((category) => {
          const catTitle = document.createElement("h4");
          catTitle.className = "category-title"; // Estilize no CSS (ex: cor #fa6000, fonte menor)
          catTitle.textContent = category;
          fragment.appendChild(catTitle);

          // 3. Ordenar Produtos Alfabeticamente dentro da categoria
          grouped[store][category]
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach((p) => {
              const li = document.createElement("li");
              li.innerHTML = `
  <div class="item-row">
    <span class="desc ${p.done ? "riscado" : ""}">${p.name}</span>
    ${
      p.done
        ? `
      <span class="qty">${p.qty}</span>
      <span class="unit">${p.unit || "UN"}</span>
      <span class="price">${formatCurrency(p.price)}</span>
      <span class="total">${formatCurrency(p.price * p.qty)}</span>
    `
        : ""
    }
  </div>
`;
              if (p.done) li.classList.add("checked");
              li.onclick = () => openModal(p.originalIndex);
              fragment.appendChild(li);

              if (p.done) {
                total += p.price * p.qty;
                items += 1; // 🔥 sempre conta como 1 unidade
              }
            });
        });
    });

  totalItems.textContent = items === 1 ? "1 produto" : `${items} produtos`;

  totalPrice.textContent = formatCurrency(total);

  // ÍCONE DO CARRINHO
  const hasItems = products.some((p) => p.done);
  cartIcon.src = hasItems
    ? "./IMAGES/full-basket.png"
    : "./IMAGES/empty-basket.png";

  // EMPYT STATE
  emptyState.style.display = products.length === 0 ? "block" : "none";

  productList.style.display = products.length ? "block" : "none";
}
// FIM → FUNÇÃO RENDER

// FUNÇÃO UTILITÁRIA
function saveData() {
  localStorage.setItem("products", JSON.stringify(products));
  localStorage.setItem("stores", JSON.stringify(stores));
}

// FUNÇÃO VER (VISUALIZAR) LISTAS SALVAS
async function viewSavedLists() {
  // 🔥 tenta Firebase primeiro
  if (userDocId && navigator.onLine) {
    try {
      const snapshot = await getDocs(
        query(
          collection(db, "users", userDocId, "saved_lists"),
          orderBy("createdAt", "desc"),
        ),
      );

      savedLists = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // salva offline
      localStorage.setItem("savedLists", JSON.stringify(savedLists));
    } catch (e) {
      console.error("Offline — usando cache local");
    }
  }

  // 🔥 fallback offline
  if (!savedLists || savedLists.length === 0) {
    savedLists = JSON.parse(localStorage.getItem("savedLists")) || [];

    if (savedLists.length === 0) {
      showFeedback("Atenção", "Nenhuma lista salva ainda.");
      return;
    }
  }

  renderSavedLists();
}
// FIM DA → FUNÇÃO VER (VISUALIZAR) LISTAS SALVAS

// FUNÇÃO RENDERIZAR LISTAS SALVAS
function renderSavedLists() {
  listsContainer.innerHTML = "";

  savedLists.forEach((list) => {
    const div = document.createElement("div");
    div.className = "saved-list-card";

    const date = new Date(
      list.createdAt?.seconds ? list.createdAt.seconds * 1000 : list.createdAt,
    );

    div.innerHTML = `
  <h3>
    🗓️ ${date.toLocaleDateString()}
    - ${formatCurrency(list.total)}
  </h3>
`;

    div.onclick = () => openSavedList(list.id);

    listsContainer.appendChild(div);
  });

  listsModal.classList.remove("hidden");
}
// FIM DA → FUNÇÃO RENDERIZAR LISTAS SALVAS

// FUNÇÃO ABRIR LISTA SALVA
async function openSavedList(listId) {
  try {
    const snapshot = await getDocs(
      collection(db, "users", userDocId, "saved_lists", listId, "items"),
    );

    const items = snapshot.docs.map((doc) => doc.data());

    renderSavedListItems(items);
  } catch (e) {
    console.error("Erro ao abrir lista:", e);
  }
}
// FIM DA → FUNÇÃO ABRIR LISTA SALVA

// FUNÇÃO RENDERIZAR ITENS DA LISTA
function renderSavedListItems(items) {
  listsContainer.innerHTML = "";

  const grouped = {};

  items.forEach((p) => {
    const store = p.store || "Sem Estabelecimento";
    const category = p.category || "Outros";

    if (!grouped[store]) grouped[store] = {};
    if (!grouped[store][category]) grouped[store][category] = [];

    grouped[store][category].push(p);
  });

  Object.keys(grouped)
    .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }))
    .forEach((store) => {
      const storeTitle = document.createElement("h3");
      storeTitle.className = "store-title-main";
      const firstItem = grouped[store][Object.keys(grouped[store])[0]][0];
      const icon = getStoreIcon(firstItem.storeType);

      storeTitle.textContent = `${icon} ${store}`;

      listsContainer.appendChild(storeTitle);

      Object.keys(grouped[store]).forEach((category) => {
        const catTitle = document.createElement("h4");
        catTitle.className = "category-title-sub";
        catTitle.textContent = category;

        listsContainer.appendChild(catTitle);

        grouped[store][category].forEach((p) => {
          const row = document.createElement("div");
          row.className = "cart-row";

          row.innerHTML = `
          <div class="col-desc">${p.name}</div>
          <div class="col-qty">${p.qty}</div>
          <div class="col-unit">${p.unit || "UN"}</div>
          <div class="col-price">${formatCurrency(p.price)}</div>
          <div class="col-total">${formatCurrency(p.price * p.qty)}</div>
        `;

          listsContainer.appendChild(row);
        });
      });
    });
}
// FIM DA → FUNÇÃO RENDERIZAR ITENS DA LISTA

// FUNÇÃO MODAL DE FEEDBACK (SUCESSO / ERRO / ATENÇÃO)
function showFeedback(title, message) {
  feedbackTitle.textContent = title;
  feedbackMessage.textContent = message;

  feedbackModal.classList.remove("hidden");
}
// FIM DA → FUNÇÃO MODAL DE FEEDBACK (SUCESSO / ERRO / ATENÇÃO)

// MODAL DE CONFIRMAÇÃO
function showConfirm(title, message) {
  return new Promise((resolve) => {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;

    confirmModal.classList.remove("hidden");

    confirmOk.onclick = () => {
      confirmModal.classList.add("hidden");
      resolve(true);
    };

    confirmCancel.onclick = () => {
      confirmModal.classList.add("hidden");
      resolve(false);
    };
  });
}

feedbackOk.onclick = () => {
  feedbackModal.classList.add("hidden");
};

closeListsModal.onclick = () => {
  listsModal.classList.add("hidden");
};

// Função para transformar a primeira letra de cada palavra em Maiúscula
function capitalizeWords(text) {
  return text
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeText(str) {
  return str
    .normalize("NFD") // separa acento da letra
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase() // padroniza
    .trim();
}

// ==========================
// EMOJIS DE CATEGORIAS / SEÇÕES
// ==========================
const categoryIcons = {
  "Açougue e Peixaria": "🥩🦐",
  Bebidas: "🥤🧃",
  Congelados: "🍨🫓",
  "Decoração e Outros": "🖼️🪴",
  "Eletrodomésticos e Eletrônicos": "🎛️🎮",
  "Frios e Laticínios": "🧀🥛",
  Guloseimas: "🍫🍪",
  "Higiene Pessoal": "🧼🧻",
  Hortifruti: "🥕🥑",
  "Jogos e Brinquedos": "♟️⚽",
  Limpeza: "🪣🧹",
  "Mercearia Seca": "🫘🧂",
  "Móveis e Utensílios": "🛋️🔪",
  "Padaria e Confeitaria": "🥖🍰",
  "Pet Shop": "🐶🐱",
};

// ==========================
// EMOJIS DE TIPOS DE ESTABELECIMENTOS
// ==========================
const storeTypes = {
  acougue: "🥩",
  cosmeticos: "💄",
  eletronicos: "📱",
  farmacia: "💊",
  hortifruti: "🥕",
  lanchonete: "🍔",
  loja: "🏪",
  padaria: "🥖",
  petshop: "🐶",
  pizzaria: "🍕",
  posto: "⛽",
  restaurante: "🍽️",
  roupas: "👕",
  supermercado: "🛒",
  outro: "⁉️",
};

// FUNÇÃO DE PEGAR O ÍCONE DO ESTABELECIMENTO
function getStoreIcon(type) {
  if (!type) return "🏪";
  return storeTypes[type] || "🏪";
}

const normalizedIcons = Object.fromEntries(
  Object.entries(categoryIcons).map(([key, value]) => [
    normalizeText(key),
    value,
  ]),
);

// ADICIONAR PRODUTO
addBtn.onclick = async () => {
  const user = auth.currentUser;
  if (!user) {
    showFeedback("Atenção", "Faça login para adicionar itens");
    return;
  }

  let inputValue = productInput.value.trim();

  const categoryEl = document.getElementById("categorySelect");
  let selectedCategory = categoryEl ? categoryEl.value : "Outros";

  selectedCategory = selectedCategory.trim();

  if (!inputValue) return;

  const formattedName = capitalizeWords(inputValue);
  const id = Date.now().toString();

  const product = {
    id,
    name: formattedName,
    price: 0,
    qty: 1,
    done: false,
    store: "",
    category: selectedCategory,
    userId: user.uid,
    createdAt: new Date(),
  };

  try {
    // 🔥 SALVA NO FIREBASE
    await setDoc(doc(db, "users", userDocId, "shopping_list", id), product);

    productInput.value = "";
  } catch (e) {
    console.error("Erro ao salvar:", e);
  }
};
// FIM → ADICIONAR PRODUTO

// Adicionar produto ao pressionar ENTER
productInput.addEventListener("keyup", (event) => {
  if (event.key === "Enter") {
    addBtn.click(); // Simula o clique no botão de adicionar
  }
});

// FUNÇÃO AUTOCOMPLETAR
productInput.addEventListener("input", () => {
  const value = normalizeText(productInput.value);

  if (!value) {
    removeSuggestions();
    return;
  }

  const matches = [];

  for (const p of productSuggestions) {
    if (normalizeText(p).startsWith(value)) {
      matches.push(p);
    }

    if (matches.length === 5) break;
  }

  showSuggestions(matches);
});
// FIM DA → FUNÇÃO AUTOCOMPLETAR

// FUNÇÃO DE SUGESTÕES
function showSuggestions(list) {
  removeSuggestions();

  const container = document.createElement("div");
  container.id = "autocomplete";

  list.forEach((name) => {
    const div = document.createElement("div");
    div.className = "autocomplete-item";
    div.textContent = name;

    div.onclick = () => {
      productInput.value = name;
      removeSuggestions();
    };

    container.appendChild(div);
  });

  document.querySelector(".add-product").appendChild(container);
}
// FIM DA → FUNÇÃO DE SUGESTÕES

// FUNÇÃO REMOVER SUGESTÕES
function removeSuggestions() {
  const old = document.getElementById("autocomplete");
  if (old) old.remove();
}
// FIM DA → FUNÇÃO REMOVER SUGESTÕES

// FUNÇÃO RENDERIZAR MERCADOS
function renderStores() {
  storeSelect.innerHTML = "";

  stores.forEach((store) => {
    const option = document.createElement("option");
    option.value = store;
    option.textContent = store;
    storeSelect.appendChild(option);
  });
}

// ABRIR MODAL
function openModal(p) {
  currentEditingItem = p;

  modalTitle.textContent = p.name;
  priceInput.value = "";
  priceInput.placeholder = "0,00";

  qty = 0;
  qtyValue.textContent = "";
  qtyValue.setAttribute("placeholder", "1");

  renderStores();

  // 🔥 Garante que o mercado salvo exista na lista
  if (p.store && !stores.includes(p.store)) {
    stores.push(p.store);
    saveData();
    renderStores();
  }

  storeSelect.value = p.store || "";

  document.getElementById("categorySelect").value = p.category || "Outros";

  // Define UN como padrão
  document.querySelector('input[name="unitType"][value="UN"]').checked = true;

  updateSubtotal();
  modal.classList.remove("hidden");
  confirmBtn.textContent = "Confirmar";
  deleteBtn.textContent = "Excluir";
}
// FIM DA → FUNÇÃO ABRIR MODAL

// FUNÇÃO ABRIR MODAL CARRINHO
function openCartModal(p) {
  currentEditingItem = p;

  modalTitle.textContent = p.name;

  // Preenche com valores existentes
  priceInput.value = p.price
    ? p.price.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
      })
    : "";

  qty = p.qty || 0;

  qtyValue.textContent =
    (p.unit || "UN") === "KG" ? Number(qty).toFixed(3) : qty;

  renderStores();

  // 🔥 Garante que o mercado salvo exista na lista
  if (p.store && !stores.includes(p.store)) {
    stores.push(p.store);
    saveData();
    renderStores();
  }

  storeSelect.value = p.store || "";

  document.getElementById("categorySelect").value = p.category || "Outros";

  // Seleciona unidade
  const unit = p.unit || "UN";
  document.querySelector(`input[name="unitType"][value="${unit}"]`).checked =
    true;

  updateSubtotal();

  modal.classList.remove("hidden");
  confirmBtn.textContent = "Alterar";
  deleteBtn.textContent = "Remover";
}
// FIM DA → FUNÇÃO ABRIR MODAL CARRINHO

// ==========================
// RENDERIZAÇÃO
// ==========================
let total = 0;
let totalEntries = 0;

function renderWithGroups(listToRender) {
  productList.innerHTML = "";

  const fragment = document.createDocumentFragment();
  total = 0;
  totalEntries = 0;

  // Separar pendentes e confirmados
  const pending = listToRender.filter((p) => !p.done);
  const done = listToRender.filter((p) => p.done);

  // Verificar se há itens
  const hasItems = pending.length > 0 || done.length > 0;

  emptyState.style.display = hasItems ? "none" : "block";
  productList.style.display = hasItems ? "block" : "none";

  if (!hasItems) return;

  // 📜 Lista de Compras
  if (pending.length) {
    const pendingTitle = document.createElement("h2");
    pendingTitle.textContent = "📜 Lista de Compras";
    pendingTitle.className = "cart-section-title";
    fragment.appendChild(pendingTitle);

    renderGrouped(pending, false, fragment);
  }

  // 🛒 Carrinho
  if (done.length) {
    const cartTitle = document.createElement("h2");
    cartTitle.textContent = "🛒 Carrinho";
    cartTitle.className = "cart-section-title";
    fragment.appendChild(cartTitle);

    renderGrouped(done, true, fragment);
  }

  totalItems.textContent =
    totalEntries === 1 ? "1 produto" : `${totalEntries} produtos`;

  totalPrice.textContent = formatCurrency(total);

  productList.appendChild(fragment);
}

// ==========================
// RENDERIZAÇÃO AGRUPADA
// ==========================
function renderGrouped(items, isCart, fragment) {
  const grouped = {};

  items.forEach((p) => {
    const store = p.store || "Sem Estabelecimento";
    const category = p.category || "Outros";

    if (!grouped[store]) grouped[store] = {};
    if (!grouped[store][category]) grouped[store][category] = [];

    grouped[store][category].push(p);
  });

  Object.keys(grouped)
    .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }))
    .forEach((store) => {
      const storeTitle = document.createElement("h3");
      storeTitle.className = "store-title-main";
      const firstItem = grouped[store][Object.keys(grouped[store])[0]][0];
      const icon = getStoreIcon(firstItem.storeType);

      storeTitle.textContent = `${icon} ${store}`;

      fragment.appendChild(storeTitle);

      Object.keys(grouped[store])
        .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }))
        .forEach((category) => {
          const catTitle = document.createElement("h4");
          catTitle.className = "category-title-sub";

          // 🔥 PADRONIZA A CATEGORIA ANTES DE USAR
          let fixedCategory = category;

          if (fixedCategory.includes("Hortifruti")) {
            fixedCategory = "Hortifruti";
          } else if (fixedCategory.includes("Padaria")) {
            fixedCategory = "Padaria e Confeitaria";
          } else if (fixedCategory.includes("Mercearia")) {
            fixedCategory = "Mercearia Seca";
          }

          // 🔥 NORMALIZA DEPOIS DE PADRONIZAR
          const normalizedCategory = normalizeText(fixedCategory);

          catTitle.textContent = `${normalizedIcons[normalizedCategory] || "🛒"} ${fixedCategory}`;

          fragment.appendChild(catTitle);

          if (isCart) {
            const header = document.createElement("div");
            header.className = "cart-grid cart-header";

            header.innerHTML = `
            <span class="col-desc">Descrição</span>
            <span class="col-qty">Qt</span>
            <span class="col-unit">Un</span>
            <span class="col-price">Vlr</span>
            <span class="col-total">Tot</span>
          `;

            fragment.appendChild(header);
          }

          grouped[store][category]
            .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
            .forEach((p) => {
              const li = document.createElement("li");
              li.className = p.done ? "item-confirmado" : "item-pendente";

              li.innerHTML = `
  <div class="cart-row">

    <div class="col-desc">
      <input type="checkbox" class="item-checkbox"
      ${p.done ? "checked" : ""}
      onclick="event.stopPropagation(); handleCheckboxClick('${p.id}', ${p.done})">

      <strong style="${p.done ? "text-decoration: line-through;" : ""}">
        ${p.name}
      </strong>
    </div>

    ${
      p.done
        ? `
        <div class="col-qty">${p.qty}</div>
        <div class="col-unit">${p.unit || "UN"}</div>
        <div class="col-price">${formatCurrency(p.price)}</div>
        <div class="col-total">${formatCurrency(p.price * p.qty)}</div>
      `
        : ""
    }

  </div>
`;

              if (p.done) {
                total += p.price * p.qty;
                totalEntries += 1;
              }

              li.onclick = () => {
                if (p.done) {
                  openCartModal(p);
                } else {
                  openModal(p);
                }
              };
              fragment.appendChild(li);
            });
        });
    });
}
// FIM DA → FUNÇÃO RENDERIZAÇÃO AGRUPADA

// FUNÇÃO PARA AS CHECKBOX'S DA LISTA DO CARRINHO
async function handleCheckboxClick(id, isDone) {
  if (isDone) {
    const confirmar = confirm(
      "Deseja remover este item do carrinho e devolvê-lo à lista de compras?",
    );

    if (!confirmar) return;

    const item = products.find((p) => p.id === id);

    await setDoc(doc(db, "users", userDocId, "shopping_list", id), {
      ...item,
      done: false,
      createdAt: new Date(),
    });

    await deleteDoc(doc(db, "users", userDocId, "cart", id));
  } else {
    const p = products.find((item) => item.id === id);
    openModal(p);
  }
}

window.handleCheckboxClick = handleCheckboxClick;

// SUBTOTAL DINÂMICO
function updateSubtotal() {
  // Troca a vírgula da máscara por ponto para o JS conseguir calcular
  const numeric = priceInput.value.replace(/\D/g, "");
  const price = Number(numeric) / 100 || 0;

  subTotal.textContent = formatCurrency(price * qty);
}

// CONTROLE DE QUANTIDADE E UNIDADE - MODAL
const unitRadios = document.getElementsByName("unitType");

// Botão +: Acrescenta
plus.onclick = () => {
  const selectedUnit = document.querySelector('input[name="unitType"]:checked');
  const isKg = selectedUnit?.value === "KG";

  if (isKg) {
    qty = parseFloat((qty + 0.001).toFixed(3));
    qtyValue.textContent = qty.toFixed(3);
  } else {
    qty += 1;
    qtyValue.textContent = qty;
  }

  updateSubtotal();
};

// Botão -: Decrementa
minus.onclick = () => {
  const selectedUnit = document.querySelector('input[name="unitType"]:checked');
  const isKg = selectedUnit?.value === "KG";

  if (isKg) {
    if (qty > 0) {
      qty = parseFloat((qty - 0.001).toFixed(3));
      if (qty < 0) qty = 0;
      qtyValue.textContent = qty.toFixed(3);
    }
  } else {
    if (qty > 0) {
      qty--;
      qtyValue.textContent = qty;
    }
  }

  updateSubtotal();
};

qtyValue.contentEditable = true;

qtyValue.addEventListener("focus", () => {
  qtyValue.textContent = "";
});

// FIM DO → CONTROLE DE QUANTIDADE E UNIDADE - MODAL

// Máscara automática reversa para KG
qtyValue.addEventListener("input", (e) => {
  const selectedUnit = document.querySelector('input[name="unitType"]:checked');
  const isKg = selectedUnit?.value === "KG";

  if (isKg) {
    let digits = e.target.textContent.replace(/\D/g, "");

    // Limita a 4 dígitos
    digits = digits.slice(-4);

    // Completa com zeros à esquerda
    digits = digits.padStart(4, "0");

    // Insere o ponto automaticamente
    const formatted = `${digits.slice(0, -3)}.${digits.slice(-3)}`;

    // 🔥 Mostra SEMPRE os 3 dígitos
    e.target.textContent = formatted;

    // Mantém cursor no final
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(e.target);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);

    // 🔥 Usa Number mas mantém exibição separada
    qty = Number(formatted);
  } else {
    let val = e.target.textContent.replace(/\D/g, "");
    e.target.textContent = val;

    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(e.target);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);

    qty = parseInt(val) || 0;
  }

  updateSubtotal();
});

// Troca de UN para KG reseta o valor
unitRadios.forEach((radio) => {
  radio.onchange = () => {
    qty = 0;

    if (radio.value === "KG") {
      qtyValue.textContent = "0.000";
    } else {
      qtyValue.textContent = "0";
    }

    updateSubtotal();
  };
});

// FUNÇÃO - BOTÃO CONFIRMAR - MODAL
confirmBtn.onclick = async () => {
  const user = auth.currentUser;
  if (!user) {
    showFeedback("Atenção", "Você precisa estar logado!");
    return;
  }

  const newStore = newStoreInput.value.trim();
  const selectedStore = storeSelect.value;
  let finalStore = newStore || selectedStore || "Sem mercado";

  const category = document.getElementById("categorySelect").value;

  const storeType = document.getElementById("storeTypeSelect").value;

  const cleanPrice = priceInput.value.replace(/\D/g, "") / 100;

  const selectedUnit = document.querySelector('input[name="unitType"]:checked');
  const unit = selectedUnit ? selectedUnit.value : "UN";

  const productData = {
    name: currentEditingItem.name,
    price: cleanPrice || 0,
    qty: parseFloat(qty),
    unit: unit,
    store: finalStore,
    storeType: storeType || "loja",
    category: category,
    done: true,
    userId: user.uid,
    updatedAt: new Date(),
  };

  try {
    if (currentEditingItem.done) {
      // 🔥 ATUALIZA NO CARRINHO
      await updateDoc(
        doc(db, "users", userDocId, "cart", currentEditingItem.id),
        productData,
      );
    } else {
      // 🔥 MOVE PARA CARRINHO
      await setDoc(
        doc(db, "users", userDocId, "cart", currentEditingItem.id),
        productData,
      );

      await deleteDoc(
        doc(db, "users", userDocId, "shopping_list", currentEditingItem.id),
      );
    }

    modal.classList.add("hidden");
  } catch (e) {
    console.error(e);
  }

  await saveProductHistory(currentEditingItem.name);
};
// FIM DA FUNÇÃO - BOTÃO CONFIRMAR - MODAL

// FUNÇÃO CRIAR HISTÓRICO (Cria um Histórico de tudo o que os Usuários Digitam)
async function saveProductHistory(productName) {
  if (!userDocId) return;

  const normalized = normalizeText(productName);

  const ref = doc(db, "users", userDocId, "product_history", normalized);

  await setDoc(ref, {
    name: productName,
    updatedAt: new Date(),
  });
}
// FIM DA → FUNÇÃO CRIAR HISTÓRICO (Cria um Histórico de tudo o que os Usuários Digitam)

// FUNÇÃO CARREGAR HISTÓRICO DE PRODUTOS
async function loadProductSuggestions() {
  if (!userDocId) return;

  try {
    const snap = await getDocs(
      collection(db, "users", userDocId, "product_history"),
    );

    productSuggestions = snap.docs.map((doc) => doc.data().name);
  } catch (e) {
    console.error("Erro ao carregar sugestões:", e);
  }
}
// FIM DA → FUNÇÃO CARREGAR HISTÓRICO DE PRODUTOS

// FUNÇÃO EXCLUIR PRODUTO
deleteBtn.onclick = async () => {
  try {
    if (!currentEditingItem) return;

    if (currentEditingItem.done) {
      const item = {
        id: currentEditingItem.id,
        name: currentEditingItem.name,
        price: currentEditingItem.price || 0,
        qty: currentEditingItem.qty || 0,
        unit: currentEditingItem.unit || "UN",
        store: currentEditingItem.store || "",
        category: currentEditingItem.category || "Outros",
        done: false,
        userId: auth.currentUser.uid,
        createdAt: new Date(),
      };

      await setDoc(
        doc(db, "users", userDocId, "shopping_list", currentEditingItem.id),
        item,
      );

      await deleteDoc(
        doc(db, "users", userDocId, "cart", currentEditingItem.id),
      );
    } else {
      await deleteDoc(
        doc(db, "users", userDocId, "shopping_list", currentEditingItem.id),
      );
    }

    modal.classList.add("hidden");
  } catch (e) {
    console.error(e);
  }
};
// FIM DA → FUNÇÃO EXCLUIR PRODUTO

// LIMPAR LISTA
clearBtn.onclick = async () => {
  if (!userDocId) return;

  const confirmClear = await showConfirm(
    "Limpar Lista",
    "Deseja limpar toda a lista?",
  );

  if (!confirmClear) return;

  try {
    const shoppingSnap = await getDocs(
      collection(db, "users", userDocId, "shopping_list"),
    );

    const cartSnap = await getDocs(collection(db, "users", userDocId, "cart"));

    for (const docSnap of shoppingSnap.docs) {
      await deleteDoc(docSnap.ref);
    }

    for (const docSnap of cartSnap.docs) {
      await deleteDoc(docSnap.ref);
    }
  } catch (e) {
    console.error(e);
  }
};

// Abrir/Fechar Modal de Login
loginBtn.onclick = () => loginModal.classList.remove("hidden");

document.getElementById("closeLoginModal").onclick = () => {
  loginModal.classList.add("hidden");
};

// Login com Google (dentro do modal)
googleLoginBtn.onclick = async () => {
  try {
    await signInWithPopup(auth, googleProvider);
    loginModal.classList.add("hidden");
    showFeedback("Sucesso", "Login realizado com sucesso!");
  } catch (error) {
    console.error("Erro no login Google:", error);
    showFeedback("Erro", "Falha ao logar com Google.");
  }
};

// Login com E-mail e Senha (Hotmail, Outlook, etc)
emailLoginBtn.onclick = async () => {
  try {
    await signInWithEmailAndPassword(
      auth,
      emailInput.value,
      passwordInput.value,
    );
    loginModal.classList.add("hidden");
  } catch (error) {
    console.error("Erro login e-mail:", error);
    showFeedback("Erro", "E-mail ou senha incorretos.");
  }
};

// Cadastro de novo e-mail
emailSignUpBtn.onclick = async () => {
  try {
    await createUserWithEmailAndPassword(
      auth,
      emailInput.value,
      passwordInput.value,
    );
    showFeedback("Sucesso", "Conta criada com sucesso!");
    loginModal.classList.add("hidden");
  } catch (error) {
    console.error("Erro cadastro:", error);
    showFeedback(
      "Erro",
      "Verifique se o e-mail é válido e a senha tem 6 dígitos.",
    );
  }
};

// FUNÇÃO SALVAR LISTA
saveListBtn.onclick = async () => {
  // ✅ FORA do try
  const shoppingList = products.filter((p) => p.done);

  try {
    if (!userDocId) return;

    if (shoppingList.length === 0) {
      showFeedback("Atenção", "Nenhum produto no carrinho para salvar.");
      return;
    }

    const listId = Date.now().toString();

    const listRef = doc(db, "users", userDocId, "saved_lists", listId);

    await setDoc(listRef, {
      id: listId,
      createdAt: new Date(),
      total: shoppingList.reduce((sum, p) => sum + p.price * p.qty, 0),
    });

    for (const item of shoppingList) {
      await setDoc(
        doc(db, "users", userDocId, "saved_lists", listId, "items", item.id),
        item,
      );
    }

    showFeedback("Sucesso", "Lista salva com sucesso!");
  } catch (e) {
    console.error(e);
  }

  const confirmClear = await showConfirm(
    "Limpar Carrinho",
    "Deseja limpar o carrinho após salvar a lista?",
  );

  if (confirmClear) {
    for (const item of shoppingList) {
      await deleteDoc(doc(db, "users", userDocId, "cart", item.id));
    }
  }
};

viewListsBtn.onclick = viewSavedLists;

// FUNÇÃO CARREGAR LISTA
function loadSavedListsRealtime() {
  if (!userDocId) return;

  const listsRef = query(
    collection(db, "users", userDocId, "saved_lists"),
    orderBy("createdAt", "desc"),
  );

  onSnapshot(listsRef, (snapshot) => {
    savedLists = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // 🔥 salva offline
    localStorage.setItem("savedLists", JSON.stringify(savedLists));
  });
}

// Novos elementos para o Modal de Nome
const nameModal = document.getElementById("nameModal");
const saveNameBtn = document.getElementById("saveNameBtn");

// Salvar o nome manualmente
saveNameBtn.onclick = () => {
  const name = nameOnlyInput.value.trim();
  if (name) {
    localStorage.setItem("userName", name);
    nameModal.classList.add("hidden");
    showFeedback("Sucesso", `Prazer em te conhecer, ${name}!`);
    render(); // Re-renderiza para atualizar o "Olá, Nome"
  }
};

// FECHAR MODAL AO CLICAR FORA
modal.onclick = (e) => {
  if (e.target === modal) {
    modal.classList.add("hidden");
  }
};

feedbackModal.onclick = (e) => {
  if (e.target === feedbackModal) {
    feedbackModal.classList.add("hidden");
  }
};

listsModal.onclick = (e) => {
  if (e.target === listsModal) {
    listsModal.classList.add("hidden");
  }
};

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js");
}

// COntainder de Instalação do app
const installContainer = document.getElementById("install-container");

if (
  installContainer &&
  window.matchMedia("(display-mode: standalone)").matches
) {
  installContainer.style.display = "none";
}

const installBtn = document.getElementById("installBtn");

const installModal = document.getElementById("installModal");
const confirmInstall = document.getElementById("confirmInstall");
const cancelInstall = document.getElementById("cancelInstall");

// 👉 Detecta se pode instalar
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;

  if (installContainer) {
    installContainer.classList.remove("hidden");
  }
});

// 👉 Clique no botão abre SEU modal
installBtn.onclick = () => {
  installModal.classList.remove("hidden");
};

// 👉 Cancelar modal
cancelInstall.onclick = () => {
  installModal.classList.add("hidden");
};

// 👉 Confirmar instalação (aqui chama o popup do navegador)
confirmInstall.onclick = async () => {
  installModal.classList.add("hidden");

  if (deferredPrompt) {
    deferredPrompt.prompt();

    const choice = await deferredPrompt.userChoice;

    if (choice.outcome === "accepted" && installContainer) {
      installContainer.style.display = "none";
    }

    deferredPrompt = null;
  }
};

// 👉 Quando instalar, some tudo
window.addEventListener("appinstalled", () => {
  if (installContainer) {
    installContainer.style.display = "none";
  }
});

function initRealtimeProducts(user) {
  if (!user || !userDocId) return;

  const listRef = query(
    collection(db, "users", userDocId, "shopping_list"),
    orderBy("createdAt", "desc"),
  );

  const cartRef = query(
    collection(db, "users", userDocId, "cart"),
    orderBy("updatedAt", "desc"),
  );

  let shopping = [];
  let cart = [];

  onSnapshot(listRef, (snap) => {
    shopping = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      done: false,
    }));

    updateProducts();
  });

  onSnapshot(cartRef, (snap) => {
    cart = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      done: true,
    }));

    updateProducts();
  });

  function updateProducts() {
    products = [...shopping, ...cart];
    renderWithGroups(products);
  }
}

// INICIALIZAR APP
// render();
