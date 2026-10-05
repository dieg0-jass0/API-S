export function init(contenedor) {
  contenedor.innerHTML = "<h2>Comercio Electrónico</h2>";

  /* ===== Carga del CSS (una sola vez) desde la carpeta css/ ===== */
  const cssUrl = new URL('../css/estilos_cano_comercio.css', import.meta.url).href;
  if (!document.querySelector(`link[href="${cssUrl}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssUrl;
    document.head.appendChild(link);
  }

  /* ===== HTML del módulo ===== */
  const HTML = `
<div class="ec-root">

  <!-- Barra de sesión -->
  <div class="ec-bar">
    <span id="ec-user">Sin sesión</span>
    <button id="ec-login" class="ec-sec">Iniciar sesión</button>
  </div>

  <div class="ec-layout">

    <!-- Catálogo -->
    <section aria-label="Catálogo">
      <div class="ec-toolbar">
        <input id="ec-search" type="search" placeholder="Buscar producto" aria-label="Buscar producto">
        <select id="ec-category" aria-label="Categoría">
          <option value="">Todas las categorías</option>
        </select>
      </div>
      <div id="ec-products" class="ec-grid" aria-live="polite"></div>
    </section>

    <!-- Panel lateral -->
    <aside class="ec-side">
      <div class="ec-panel">
        <h3>Carrito</h3>
        <div id="ec-cart"></div>
        <div class="ec-total"><span>Total</span><span id="ec-total">$0.00</span></div>
        <button id="ec-checkout" class="ec-full">Pagar pedido</button>
        <p id="ec-msg" role="status"></p>
      </div>

      <div class="ec-panel">
        <h3>Token de autorización</h3>
        <div id="ec-token" class="ec-token">Inicia sesión para obtener un JWT.</div>
      </div>

      <div class="ec-panel">
        <h3>Peticiones HTTP</h3>
        <table>
          <thead><tr><th>Método</th><th>Ruta</th><th>Status</th><th>ms</th></tr></thead>
          <tbody id="ec-log"></tbody>
        </table>
      </div>
    </aside>

  </div>
</div>`;
  contenedor.insertAdjacentHTML('beforeend', HTML);
  activar();

  /* ===== Lógica del módulo ===== */
  function activar() {
    const $ = (sel) => contenedor.querySelector(sel);
    const BASE = "https://dummyjson.com";
    const state = { products: [], cart: new Map(), token: null, user: null, userId: null };
    const money = n => "$" + n.toFixed(2);

    /* ---------- Capa HTTP: único punto de fetch (headers, errores y registro) ---------- */
    async function api(path, { method = "GET", body, auth = false } = {}) {
      const headers = {};
      if (body) headers["Content-Type"] = "application/json";
      if (auth) {
        if (!state.token) throw new Error("401 Unauthorized: inicia sesión primero");
        headers["Authorization"] = `Bearer ${state.token}`;
      }
      const t0 = performance.now();
      let status = "ERR";
      try {
        const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
        status = res.status;
        if (!res.ok) {
          let detalle = res.statusText || "Error";
          try { detalle = (await res.json()).message || detalle; } catch (_) {}
          throw new Error(`${res.status} ${detalle} (${method} ${path})`);
        }
        const ct = res.headers.get("content-type") || "";
        return ct.includes("json") ? await res.json() : await res.text();
      } finally {
        logRequest(method, path, status, Math.round(performance.now() - t0));
      }
    }

    function logRequest(method, path, status, ms) {
      const tr = document.createElement("tr");
      const cls = String(status).startsWith("2") ? "ec-s2" : "ec-s4";
      tr.innerHTML = `<td>${method}</td><td>${path}</td><td class="${cls}">${status}</td><td>${ms}</td>`;
      $("#ec-log").prepend(tr);
      while ($("#ec-log").rows.length > 8) $("#ec-log").deleteRow(-1);
    }

    function say(text, type = "") {
      $("#ec-msg").textContent = text;
      $("#ec-msg").className = type ? "ec-" + type : "";
    }

    /* ---------- Catálogo (GET) ---------- */
    async function loadCatalog() {
      $("#ec-products").innerHTML = `<p class="ec-empty">Cargando productos…</p>`;
      try {
        const [products, categories] = await Promise.all([
          api("/products?limit=0&select=title,price,category,rating,thumbnail"),
          api("/products/category-list")
        ]);
        state.products = products.products;
        categories.forEach(c => $("#ec-category").add(new Option(c.replace(/-/g, " "), c)));
        renderProducts();
      } catch (e) {
        $("#ec-products").innerHTML =
          `<p class="ec-empty ec-err">No se pudo cargar el catálogo. ${e.message}. Revisa tu conexión y recarga la página.</p>`;
      }
    }

    function renderProducts() {
      const q = $("#ec-search").value.trim().toLowerCase();
      const cat = $("#ec-category").value;
      const list = state.products.filter(p =>
        (!cat || p.category === cat) && p.title.toLowerCase().includes(q));
      $("#ec-products").innerHTML = list.length ? "" : `<p class="ec-empty">Ningún producto coincide con tu búsqueda.</p>`;
      list.forEach(p => {
        const el = document.createElement("article");
        el.className = "ec-product";
        el.innerHTML = `
          <img src="${p.thumbnail}" alt="${p.title}" loading="lazy">
          <h4 title="${p.title}">${p.title}</h4>
          <span class="ec-rating">★ ${p.rating}</span>
          <span class="ec-price">${money(p.price)}</span>
          <button data-id="${p.id}">Agregar al carrito</button>`;
        $("#ec-products").append(el);
      });
    }

    /* ---------- Carrito (estado en memoria + DOM) ---------- */
    function changeQty(id, delta) {
      const next = (state.cart.get(id) || 0) + delta;
      next <= 0 ? state.cart.delete(id) : state.cart.set(id, next);
      renderCart();
    }

    function renderCart() {
      const box = $("#ec-cart");
      box.innerHTML = "";
      let total = 0;
      if (!state.cart.size) box.innerHTML = `<p class="ec-empty">Tu carrito está vacío. Agrega un producto del catálogo.</p>`;
      for (const [id, qty] of state.cart) {
        const p = state.products.find(x => x.id === id);
        total += p.price * qty;
        const row = document.createElement("div");
        row.className = "ec-item";
        row.innerHTML = `<span>${p.title.slice(0, 26)}…</span>
          <span class="ec-qty"><button data-d="-1" data-id="${id}">−</button> ${qty} <button data-d="1" data-id="${id}">+</button></span>`;
        box.append(row);
      }
      $("#ec-total").textContent = money(total);
    }

    /* ---------- Autenticación: POST /auth/login devuelve un JWT (accessToken) ---------- */
    async function login() {
      const username = prompt("Usuario (demo: emilys)", "emilys");
      const password = prompt("Contraseña (demo: emilyspass)", "emilyspass");
      if (!username || !password) return;
      try {
        const data = await api("/auth/login", {
          method: "POST",
          body: { username, password, expiresInMins: 30 }
        });
        state.token = data.accessToken;   // JWT que devuelve DummyJSON
        state.userId = data.id;
        state.user = username;
        $("#ec-user").textContent = username;
        // GET protegido: demuestra el encabezado Authorization: Bearer <JWT>
        try {
          const me = await api("/auth/me", { auth: true });
          $("#ec-user").textContent = `${me.firstName} ${me.lastName}`;
        } catch (_) { /* si falla, se queda el nombre de usuario */ }
        $("#ec-login").textContent = "Cerrar sesión";
        $("#ec-token").textContent = state.token;
        say("Sesión iniciada.", "ok");
      } catch (e) {
        say(`No se pudo iniciar sesión: ${e.message}. Verifica usuario y contraseña.`, "err");
      }
    }

    function logout() {
      state.token = state.user = state.userId = null;
      $("#ec-user").textContent = "Sin sesión";
      $("#ec-login").textContent = "Iniciar sesión";
      $("#ec-token").textContent = "Inicia sesión para obtener un JWT.";
      say("Sesión cerrada.");
    }

    /* ---------- Pago: POST /carts/add con Authorization: Bearer <JWT> ---------- */
    async function checkout() {
      if (!state.cart.size) return say("Agrega al menos un producto antes de pagar.", "err");
      try {
        const payload = {
          userId: state.userId,
          products: [...state.cart].map(([id, quantity]) => ({ id, quantity }))
        };
        const order = await api("/carts/add", { method: "POST", body: payload, auth: true });
        say(`Pedido #${order.id} enviado correctamente. Total: ${money(order.total)}`, "ok");
        state.cart.clear();
        renderCart();
      } catch (e) {
        say(e.message.startsWith("401") ? "Debes iniciar sesión para pagar." : `No se pudo enviar el pedido: ${e.message}`, "err");
      }
    }

    /* ---------- Captura de eventos ---------- */
    $("#ec-products").addEventListener("click", e => {
      const id = e.target.dataset.id;
      if (id) changeQty(Number(id), 1);
    });
    $("#ec-cart").addEventListener("click", e => {
      const { id, d } = e.target.dataset;
      if (id) changeQty(Number(id), Number(d));
    });
    $("#ec-search").addEventListener("input", renderProducts);
    $("#ec-category").addEventListener("change", renderProducts);
    $("#ec-login").addEventListener("click", () => (state.token ? logout() : login()));
    $("#ec-checkout").addEventListener("click", checkout);

    loadCatalog();
    renderCart();
  }
} // <- cierre de init
