export function init(contenedor) {
  const WS_DEFAULT_URL = "ws://localhost:8080";
  const MAX_MESSAGE_LENGTH = 2000;
  const cssUrl = new URL("../css/estilos_david_emergentes.css", import.meta.url).href;
  const htmlUrl = new URL("../html/david_emergentes.html", import.meta.url);

  const stylesheetAlreadyLoaded = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .some((stylesheet) => stylesheet.href === cssUrl);
  if (!stylesheetAlreadyLoaded) {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = cssUrl;
    document.head.append(stylesheet);
  }

  contenedor.innerHTML = '<p class="ws-loading">Cargando chat...</p>';

  fetch(htmlUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`No se pudo cargar el chat (HTTP ${response.status})`);
      return response.text();
    })
    .then((html) => {
      contenedor.innerHTML = html;
      activarChat();
    })
    .catch((error) => {
      contenedor.innerHTML = `<p class="ws-load-error">${error.message}</p>`;
    });

  function activarChat() {
    const endpoint = contenedor.querySelector("#ws-endpoint");
    const username = contenedor.querySelector("#ws-username");
    const connectionButton = contenedor.querySelector("#ws-connect");
    const status = contenedor.querySelector("#ws-status");
    const log = contenedor.querySelector("#ws-messages");
    const emptyState = contenedor.querySelector("#ws-empty");
    const messageForm = contenedor.querySelector("#ws-message-form");
    const messageInput = contenedor.querySelector("#ws-message");
    const sendButton = contenedor.querySelector("#ws-send");
    const counter = contenedor.querySelector("#ws-counter");
    let socket = null;

    endpoint.value = WS_DEFAULT_URL;
    messageInput.maxLength = MAX_MESSAGE_LENGTH;

    function setStatus(label, state) {
      status.dataset.state = state;
      status.querySelector(".ws-status-label").textContent = label;
    }

    function addEntry(text, { sender = "", own = false, system = false, sentAt } = {}) {
      emptyState.hidden = true;
      const item = document.createElement("li");
      item.className = `ws-entry${own ? " is-own" : ""}${system ? " is-system" : ""}`;

      if (sender) {
        const name = document.createElement("strong");
        name.className = "ws-entry-sender";
        name.textContent = sender;
        item.append(name);
      }

      const body = document.createElement("p");
      body.className = "ws-entry-text";
      body.textContent = text;
      item.append(body);

      const time = document.createElement("time");
      const date = sentAt ? new Date(sentAt) : new Date();
      const validDate = !Number.isNaN(date.getTime());
      time.dateTime = validDate ? date.toISOString() : new Date().toISOString();
      time.textContent = new Intl.DateTimeFormat("es", {
        hour: "2-digit",
        minute: "2-digit"
      }).format(validDate ? date : new Date());
      item.append(time);
      log.append(item);
      log.scrollTop = log.scrollHeight;
    }

    function updateConnectionControls(connected) {
      endpoint.disabled = connected;
      username.disabled = connected;
      messageInput.disabled = !connected || !socket || socket.readyState !== WebSocket.OPEN;
      connectionButton.textContent = connected ? "Desconectar" : "Conectar";
      sendButton.disabled = !connected || messageInput.value.trim().length === 0;
    }

    function decodeData(data) {
      if (typeof data === "string") return Promise.resolve(data);
      if (data instanceof ArrayBuffer) return Promise.resolve(new TextDecoder().decode(data));
      if (data instanceof Blob) return data.text();
      return Promise.resolve(String(data));
    }

    function showIncoming(rawData) {
      let packet;
      try {
        packet = JSON.parse(rawData);
      } catch {
        addEntry(rawData);
        return;
      }

      if (packet && typeof packet === "object" && !Array.isArray(packet)) {
        const text = typeof packet.text === "string"
          ? packet.text
          : typeof packet.message === "string"
            ? packet.message
            : JSON.stringify(packet);
        const sender = packet.username || packet.user || packet.sender || "";
        addEntry(text, {
          sender: String(sender),
          own: String(sender).toLowerCase() === username.value.trim().toLowerCase(),
          sentAt: packet.sentAt || packet.timestamp
        });
        return;
      }

      addEntry(JSON.stringify(packet));
    }

    connectionButton.addEventListener("click", () => {
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close();
        setStatus("Desconectando", "connecting");
        return;
      }

      const name = username.value.trim();
      if (!name) {
        username.focus();
        setStatus("Escribe un nombre", "error");
        return;
      }

      let url;
      try {
        url = new URL(endpoint.value.trim());
        if (url.protocol !== "ws:" && url.protocol !== "wss:") {
          throw new Error("El protocolo debe ser ws:// o wss://");
        }
      } catch (error) {
        setStatus(error.message || "URL no válida", "error");
        endpoint.focus();
        return;
      }

      try {
        socket = new WebSocket(url.href);
      } catch (error) {
        setStatus(error.message || "No se pudo iniciar la conexión", "error");
        return;
      }

      updateConnectionControls(true);
      sendButton.disabled = true;
      setStatus("Conectando", "connecting");

      const currentSocket = socket;
      currentSocket.addEventListener("open", () => {
        if (socket !== currentSocket) return;
        setStatus("Conectado", "connected");
        updateConnectionControls(true);
        addEntry("Conexión establecida", { system: true });
      });
      currentSocket.addEventListener("message", async (event) => {
        if (socket !== currentSocket) return;
        showIncoming(await decodeData(event.data));
      });
      currentSocket.addEventListener("error", () => {
        if (socket === currentSocket) setStatus("Error de conexión", "error");
      });
      currentSocket.addEventListener("close", (event) => {
        if (socket !== currentSocket) return;
        setStatus("Desconectado", "disconnected");
        updateConnectionControls(false);
        addEntry(event.wasClean ? "Conexión cerrada" : "Se perdió la conexión", { system: true });
        socket = null;
      });
    });

    messageInput.addEventListener("input", () => {
      counter.textContent = `${messageInput.value.length} / ${MAX_MESSAGE_LENGTH}`;
      sendButton.disabled = !socket || socket.readyState !== WebSocket.OPEN || !messageInput.value.trim();
    });

    messageInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        messageForm.requestSubmit();
      }
    });

    messageForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = messageInput.value.trim();
      if (!text || !socket || socket.readyState !== WebSocket.OPEN) return;

      socket.send(JSON.stringify({
        type: "message",
        username: username.value.trim(),
        text,
        sentAt: new Date().toISOString()
      }));
      messageInput.value = "";
      counter.textContent = `0 / ${MAX_MESSAGE_LENGTH}`;
      sendButton.disabled = true;
      messageInput.focus();
    });
  }
}