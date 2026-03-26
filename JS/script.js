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
  setDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================
// ESTADO DA APLICAÇÃO
// ==========================
let products = JSON.parse(localStorage.getItem("products")) || []; // Lista de Produtos
let currentIndex = null; // Qual item está sendo editado
let qty = 1; // Quantidade no Modal;
let stores = JSON.parse(localStorage.getItem("stores")) || [];
let savedLists = JSON.parse(localStorage.getItem("savedLists")) || [];
let currentEditingItem = null; // Variável Global

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
  let value = e.target.value.replace(/\D/g, "");
  value = (value / 100).toFixed(2) + "";
  value = value.replace(".", ",");
  value = value.replace(/(\d)(\d{3})(\d{3}),/g, "$1.$2.$3,");
  value = value.replace(/(\d)(\d{3}),/g, "$1.$2,");
  e.target.value = value === "0,00" ? "" : value;
  updateSubtotal();
});
const newStoreInput = document.getElementById("newStoreInput");

// ==============================
// LÓGICA DE USUÁRIO E CONTADOR
// ==============================
onAuthStateChanged(auth, async (user) => {
  const userInfo = document.getElementById("userInfo");
  const loginBtn = document.getElementById("loginBtn");

  if (user) {
    loginBtn.style.display = "none";
    userInfo.style.display = "flex";

    // 1. Inicia a escuta em tempo real do Firebase
    initRealtimeProducts(user);

    let userNumber = 0;
    const userRef = doc(db, "users", user.uid);

    try {
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        userNumber = userSnap.data().sequence;
      } else {
        // NOVO USUÁRIO: Gera número oficial no banco
        userNumber = await generateNextSequence();
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          sequence: userNumber,
          createdAt: new Date(),
        });
      }
    } catch (e) {
      console.error("Erro ao processar contador:", e);
    }

    // FORMATO IMPACTANTE: 001
    const formattedNumber = String(userNumber).padStart(3, "0");
    const localName = localStorage.getItem("userName");
    const name = user.displayName
      ? user.displayName.split(" ")[0]
      : localName || "Visitante";

    userInfo.innerHTML = `
            <span class="user-name">${name}</span>
            <span class="user-separator">-</span>
            <div class="user-badge">
                <span class="user-number">${formattedNumber}<sup>U</sup></span>
            </div>
        `;

    // Se for login por e-mail e não tiver nome, abre o modal
    if (!user.displayName && !localName) {
      document.getElementById("nameModal").classList.remove("hidden");
    }
  } else {
    loginBtn.style.display = "block";
    userInfo.style.display = "none";

    // Se não está logado, renderiza apenas os itens locais
    renderWithGroups([...products]);
  }
});

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
      productList.appendChild(storeTitle);

      Object.keys(grouped[store])
        .sort()
        .forEach((category) => {
          const catTitle = document.createElement("h4");
          catTitle.className = "category-title"; // Estilize no CSS (ex: cor #fa6000, fonte menor)
          catTitle.textContent = category;
          productList.appendChild(catTitle);

          // 3. Ordenar Produtos Alfabeticamente dentro da categoria
          grouped[store][category]
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach((p) => {
              const li = document.createElement("li");
              li.innerHTML = `
          <div class="item-left">
              <span class="dot"></span>
              <div class="item-info"><strong>${p.name}</strong></div>
          </div>
          ${p.done ? `<span class="item-price">R$ ${(p.price * p.qty).toFixed(2)}</span>` : ""}
        `;
              if (p.done) li.classList.add("checked");
              li.onclick = () => openModal(p.originalIndex);
              productList.appendChild(li);

              if (p.done) {
                total += p.price * p.qty;
                items += p.qty;
              }
            });
        });
    });

  totalItems.textContent = `${items} itens`;
  totalPrice.textContent = `R$ ${total.toFixed(2)}`;

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

// FUNÇÃO SALVAR LISTA ATUAL
function saveCurrentList() {
  const doneItems = products.filter((p) => p.done);

  if (doneItems.length === 0) {
    showFeedback("Atenção", "Nenhum item finalizado para salvar!");
    return;
  }

  const total = doneItems.reduce((sum, p) => sum + p.price * p.qty, 0);

  const newList = {
    id: Date.now(),
    date: new Date().toLocaleDateString("pt-BR"),
    items: doneItems.map((p) => ({ ...p })),
    total,
  };

  savedLists.push(newList);

  localStorage.setItem("savedLists", JSON.stringify(savedLists));

  showFeedback("Sucesso", "Lista salva com sucesso!");
}

// FUNÇÃO LISTAS SALVAS
function viewSavedLists() {
  if (savedLists.length === 0) {
    showFeedback("Atenção", "Nenhuma lista salva ainda.");
    return;
  }

  listsContainer.innerHTML = "";

  savedLists.forEach((list) => {
    const div = document.createElement("div");
    div.style.borderBottom = "1px solid #ccc";
    div.style.marginBottom = "10px";
    div.style.paddingBottom = "10px";

    const title = document.createElement("h3");
    title.textContent = `🗓️ ${list.date} - R$ ${list.total.toFixed(2)}`;

    div.appendChild(title);

    list.items.forEach((item) => {
      const p = document.createElement("p");
      p.textContent = `• ${item.name} | ${item.qty}x | R$ ${item.price.toFixed(2)} | ${item.store || "Sem mercado"}`;
      div.appendChild(p);
    });

    listsContainer.appendChild(div);
  });

  listsModal.classList.remove("hidden");
}

// FUNÇÃO MOSTRAR LISTA SALVA
function showFeedback(title, message) {
  feedbackTitle.textContent = title;
  feedbackMessage.textContent = message;

  feedbackModal.classList.remove("hidden");
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

// ADICIONAR PRODUTO
addBtn.onclick = () => {
  let inputValue = productInput.value.trim();
  if (!inputValue) return;

  // Transforma o texto antes de salvar
  const formattedName = capitalizeWords(inputValue);

  products.push({
    name: formattedName,
    price: 0,
    qty: 1,
    done: false,
    store: "",
  });

  saveData();
  productInput.value = "";
  renderWithGroups([...products]);
};
// FIM → ADICIONAR PRODUTO

// Faz o texto do input ficar visualmente bonito enquanto digita
productInput.addEventListener("input", (e) => {
  const start = e.target.selectionStart;
  const end = e.target.selectionEnd;
  e.target.value = capitalizeWords(e.target.value);
  e.target.setSelectionRange(start, end); // Mantém o cursor no lugar certo
});

// Adicionar produto ao pressionar ENTER
productInput.addEventListener("keyup", (event) => {
  if (event.key === "Enter") {
    addBtn.click(); // Simula o clique no botão de adicionar
  }
});

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
  // Guarda o objeto clicado (seja do banco ou do local)
  currentEditingItem = p;

  modalTitle.textContent = p.name;
  priceInput.value = p.price || "";
  qty = p.qty || 1;
  qtyValue.textContent = qty;

  renderStores();
  storeSelect.value = p.store || "";
  document.getElementById("categorySelect").value = p.category || "Outros";

  updateSubtotal();
  modal.classList.remove("hidden");
}
// FIM DA → FUNÇÃO ABRIR MODAL

// RENDERIZAÇÃO
function renderWithGroups(listToRender) {
  productList.innerHTML = "";
  let total = 0;
  let items = 0;
  const grouped = {};

  listToRender.forEach((p) => {
    const store = p.store || "Sem mercado";
    const cat = p.category || "Outros";
    if (!grouped[store]) grouped[store] = {};
    if (!grouped[store][cat]) grouped[store][cat] = [];
    grouped[store][cat].push(p);
  });

  Object.keys(grouped)
    .sort()
    .forEach((store) => {
      const sTitle = document.createElement("h3");
      sTitle.className = "store-title";
      sTitle.textContent = store;
      productList.appendChild(sTitle);

      Object.keys(grouped[store])
        .sort()
        .forEach((category) => {
          const cTitle = document.createElement("h4");
          cTitle.className = "category-title";
          cTitle.textContent = category;
          productList.appendChild(cTitle);

          grouped[store][category]
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach((p) => {
              const li = document.createElement("li");
              // Adicionamos a classe 'checked' se o produto já foi finalizado
              if (p.done) li.classList.add("checked");

              li.innerHTML = `
                        <div class="item-left">
                            <span class="dot"></span>
                            <div class="item-info"><strong>${p.name}</strong></div>
                        </div>
                        <div class="item-right">
                             ${p.done ? `<span class="item-price">R$ ${(p.price * p.qty).toFixed(2)}</span>` : ""}
                        </div>
                    `;

              // IMPORTANTE: Passa o objeto p para o modal
              li.onclick = () => openModal(p);
              productList.appendChild(li);

              if (p.done) {
                total += p.price * p.qty;
                items += p.qty;
              }
            });
        });
    });

  totalItems.textContent = `${items} itens`;
  totalPrice.textContent = `R$ ${total.toFixed(2)}`;
}
// FIM DA → FUNÇÃO RENDERIZAÇÃO

// SUBTOTAL DINÂMICO
function updateSubtotal() {
  const rawValue = priceInput.value.replace(/\./g, "").replace(",", ".");
  const price = parseFloat(rawValue) || 0;
  subTotal.textContent = `R$ ${(price * qty).toFixed(2)}`;
}

priceInput.oninput = updateSubtotal;

// CONTROLE DE QUANTIDADE
plus.onclick = () => {
  qty++;
  qtyValue.textContent = qty;
  updateSubtotal();
};

minus.onclick = () => {
  if (qty > 1) qty--;
  qtyValue.textContent = qty;
  updateSubtotal();
};

confirmBtn.onclick = async () => {
  const user = auth.currentUser;
  if (!user) {
    showFeedback("Atenção", "Você precisa estar logado para salvar itens!");
    return;
  }

  // 1. Lógica de Mercado (Recuperada do seu código original)
  const newStore = newStoreInput.value.trim();
  const selectedStore = storeSelect.value;
  let finalStore = newStore || selectedStore || "Sem mercado";

  // Se o usuário digitou um mercado novo, salva no localStorage para futuras sugestões
  if (newStore && !stores.includes(newStore)) {
    stores.push(newStore);
    localStorage.setItem("stores", JSON.stringify(stores));
  }

  // 2. Preparação dos Dados
  const category = document.getElementById("categorySelect").value;

  const productData = {
    price: parseFloat(priceInput.value) || 0,
    qty: qty,
    store: finalStore,
    category: category,
    done: true,
    userId: user.uid,
    updatedAt: new Date(), // Boa prática para saber quando foi alterado
  };

  try {
    // 3. Lógica Inteligente: Atualizar ou Criar
    if (currentEditingItem && currentEditingItem.id) {
      // ITEM JÁ EXISTE NO FIREBASE: Apenas atualizamos
      const docRef = doc(db, "user_products", currentEditingItem.id);
      await updateDoc(docRef, productData);
    } else {
      // ITEM É NOVO (Vem do localStorage): Criamos no Firebase
      productData.name = modalTitle.textContent;
      productData.createdAt = new Date();

      await addDoc(collection(db, "user_products"), productData);

      // Remove da lista temporária (localStorage)
      products = products.filter(
        (item) => item.name !== currentEditingItem.name,
      );
      saveData();
    }

    modal.classList.add("hidden");
  } catch (e) {
    console.error("Erro ao salvar:", e);
    showFeedback("Erro", "Não foi possível sincronizar com o banco.");
  }
};

// EXCLUIR PRODUTO
deleteBtn.onclick = async () => {
  try {
    if (currentEditingItem && currentEditingItem.id) {
      // Se está no Firebase, deleta de lá
      await deleteDoc(doc(db, "user_products", currentEditingItem.id));
    } else {
      // Se está no localStorage, remove do array local
      products = products.filter(
        (item) => item.name !== currentEditingItem.name,
      );
      saveData();
      renderWithGroups([...products]);
    }
    modal.classList.add("hidden");
  } catch (e) {
    console.error("Erro ao excluir:", e);
    showFeedback("Erro", "Não foi possível excluir o item.");
  }
};

// LIMPAR LISTA
clearBtn.onclick = () => {
  products = [];
  saveData();
  // Se estiver logado, o initRealtimeProducts cuidará de mostrar apenas o que está no banco
  const user = auth.currentUser;
  if (user) {
    initRealtimeProducts(user);
  } else {
    renderWithGroups([]);
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

saveListBtn.onclick = saveCurrentList;
viewListsBtn.onclick = viewSavedLists;

// Novos elementos para o Modal de Nome
const nameModal = document.getElementById("nameModal");
const nameOnlyInput = document.getElementById("nameOnlyInput");
const saveNameBtn = document.getElementById("saveNameBtn");

// Função para lidar com o nome do usuário
function checkUserName(user) {
  const savedName = localStorage.getItem("userName");

  // Se o Firebase não tem nome (comum em login por e-mail) e não salvamos no localStorage
  if (!user.displayName && !savedName) {
    nameModal.classList.remove("hidden");
  } else {
    // Se já existe, apenas atualiza a interface
    render();
  }
}

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

let deferredPrompt;

const installContainer = document.getElementById("install-container");

if (window.matchMedia("(display-mode: standalone)").matches) {
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

  // só mostra botão se NÃO estiver instalado
  installContainer.classList.remove("hidden");
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

    if (choice.outcome === "accepted") {
      installContainer.style.display = "none";
    }

    deferredPrompt = null;
  }
};

// 👉 Quando instalar, some tudo
window.addEventListener("appinstalled", () => {
  installContainer.style.display = "none";
});

function initRealtimeProducts(user) {
  const q = query(
    collection(db, "user_products"),
    where("userId", "==", user.uid),
  );

  onSnapshot(q, (snapshot) => {
    const dbProducts = [];
    snapshot.forEach((doc) => {
      dbProducts.push({ id: doc.id, ...doc.data() });
    });

    // Junta com os produtos que ainda não foram "confirmados" (que estão no localStorage)
    const allProducts = [...products, ...dbProducts];

    // Atualiza a tela chamando sua função render original,
    // mas agora passando os dados do banco
    renderWithGroups(allProducts);
  });
}

// INICIALIZAR APP
// render();
