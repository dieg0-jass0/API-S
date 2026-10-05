export function init(contenedor) {
  contenedor.innerHTML = "<h2>Comercio Electrónico</h2>";

  // Empieza tu código aquí, CANO


  
}

const BASE = "https://fakestoreapi.com";
const state = { products: [], cart: new Map(), token: null, user: null };
const $ = id => document.getElementById(id);
const money = n => "$" + n.toFixed(2);

/* ---------- Capa HTTP: un solo punto para fetch, headers, errores y log ---------- */
async function api(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    if (!state.token) throw new Error("401 Unauthorized: inicia sesión primero");
    headers["Authorization"] = `Bearer ${state.token}`;
  }
  const t0 = performance.now();
  let status = "ERR";
  try {
    const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    status = res.status;
    if (!res.ok) throw new Error(`${res.status} ${res.statusText || "Error"} en ${method} ${path}`);
    const ct = res.headers.get("content-type") || "";
    return ct.includes("json") ? await res.json() : await res.text();
  } finally {
    logRequest(method, path, status, Math.round(performance.now() - t0));
  }
}

function logRequest(method, path, status, ms) {
  const tr = document.createElement("tr");
  const cls = String(status).startsWith("2") ? "s2" : "s4";
  tr.innerHTML = `<td>${method}</td><td>${path}</td><td class="${cls}">${status}</td><td>${ms}</td>`;
  $("log").prepend(tr);
  while ($("log").rows.length > 8) $("log").deleteRow(-1);
}

function say(text, type = "") { $("msg").textContent = text; $("msg").className = type; }

/* ---------- Catálogo (GET) ---------- */
async function loadCatalog() {
  $("products").innerHTML = `<p class="empty">Cargando productos…</p>`;
  try {
    const [products, categories] = await Promise.all([api("/products"), api("/products/categories")]);
    state.products = products;
    categories.forEach(c => $("category").add(new Option(c, c)));
    renderProducts();
  } catch (e) {
    $("products").innerHTML = `<p class="empty err">No se pudo cargar el catálogo. ${e.message}. Revisa tu conexión y recarga la página.</p>`;
  }
}

function renderProducts() {
  const q = $("search").value.trim().toLowerCase();
  const cat = $("category").value;
  const list = state.products.filter(p =>
    (!cat || p.category === cat) && p.title.toLowerCase().includes(q));
  $("products").innerHTML = list.length ? "" : `<p class="empty">Ningún producto coincide con tu búsqueda.</p>`;
  list.forEach(p => {
    const el = document.createElement("article");
    el.className = "product";
    el.innerHTML = `
      <img src="${p.image}" alt="${p.title}" loading="lazy">
      <h3 title="${p.title}">${p.title}</h3>
      <span class="rating">★ ${p.rating.rate} (${p.rating.count})</span>
      <span class="price">${money(p.price)}</span>
      <button data-id="${p.id}">Agregar al carrito</button>`;
    $("products").append(el);
  });
}

/* ---------- Carrito (estado en memoria + DOM) ---------- */
function changeQty(id, delta) {
  const next = (state.cart.get(id) || 0) + delta;
  next <= 0 ? state.cart.delete(id) : state.cart.set(id, next);
  renderCart();
}

function renderCart() {
  const box = $("cart");
  box.innerHTML = "";
  let total = 0;
  if (!state.cart.size) box.innerHTML = `<p class="empty">Tu carrito está vacío. Agrega un producto del catálogo.</p>`;
  for (const [id, qty] of state.cart) {
    const p = state.products.find(x => x.id === id);
    total += p.price * qty;
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `<span>${p.title.slice(0, 26)}…</span>
      <span class="qty"><button data-d="-1" data-id="${id}">−</button> ${qty} <button data-d="1" data-id="${id}">+</button></span>`;
    box.append(row);
  }
  $("total").textContent = money(total);
}

/* ---------- Autenticación: POST /auth/login devuelve un JWT ---------- */
async function login() {
  const username = prompt("Usuario (demo: mor_2314)", "mor_2314");
  const password = prompt("Contraseña (demo: 83r5^_)", "83r5^_");
  if (!username || !password) return;
  try {
    const data = await api("/auth/login", { method: "POST", body: { username, password } });
    state.token = data.token;
    state.user = username;
    $("userLabel").textContent = username;
    $("loginBtn").textContent = "Cerrar sesión";
    $("token").textContent = state.token;
    say("Sesión iniciada.", "ok");
  } catch (e) {
    say(`No se pudo iniciar sesión: ${e.message}. Verifica usuario y contraseña.`, "err");
  }
}

function logout() {
  state.token = state.user = null;
  $("userLabel").textContent = "Sin sesión";
  $("loginBtn").textContent = "Iniciar sesión";
  $("token").textContent = "Inicia sesión para obtener un JWT.";
  say("Sesión cerrada.");
}

/* ---------- Pago: POST /carts con Authorization: Bearer <JWT> ---------- */
async function checkout() {
  if (!state.cart.size) return say("Agrega al menos un producto antes de pagar.", "err");
  try {
    const payload = {
      userId: 1,
      date: new Date().toISOString().slice(0, 10),
      products: [...state.cart].map(([productId, quantity]) => ({ productId, quantity }))
    };
    const order = await api("/carts", { method: "POST", body: payload, auth: true });
    say(`Pedido #${order.id} enviado correctamente.`, "ok");
    state.cart.clear();
    renderCart();
  } catch (e) {
    say(e.message.startsWith("401") ? "Debes iniciar sesión para pagar." : `No se pudo enviar el pedido: ${e.message}`, "err");
  }
}

/* ---------- Eventos ---------- */
$("products").addEventListener("click", e => {
  const id = e.target.dataset.id;
  if (id) changeQty(Number(id), 1);
});
$("cart").addEventListener("click", e => {
  const { id, d } = e.target.dataset;
  if (id) changeQty(Number(id), Number(d));
});
$("search").addEventListener("input", renderProducts);
$("category").addEventListener("change", renderProducts);
$("loginBtn").addEventListener("click", () => (state.token ? logout() : login()));
$("checkout").addEventListener("click", checkout);

loadCatalog();
renderCart();
