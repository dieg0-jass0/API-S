export function init(contenedor) {
  contenedor.innerHTML = "<h2>Notificaciones y Correo</h2>";
export function init(contenedor) {
  contenedor.innerHTML = "<h2>Notificaciones y Correo</h2>";

  /* ===== A partir de aquí va mi código ===== */

  // 1) Cargar el CSS (una sola vez), buscándolo junto a este archivo .js
  const cssUrl = new URL('./correo.css', import.meta.url).href;
  if (!document.querySelector(`link[href="${cssUrl}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssUrl;
    document.head.appendChild(link);
  }

  // 2) Cargar el HTML (correo.html), agregarlo debajo del <h2> y activar la lógica
  const htmlUrl = new URL('./correo.html', import.meta.url);
  fetch(htmlUrl)
    .then(r => {
      if (!r.ok) throw new Error(`No se encontró correo.html (HTTP ${r.status})`);
      return r.text();
    })
    .then(html => {
      contenedor.insertAdjacentHTML('beforeend', html);
      activar();
    })
    .catch(err => {
      contenedor.insertAdjacentHTML('beforeend', `<p>Error al cargar el módulo: ${err.message}</p>`);
    });

  // 3) Toda la lógica del formulario
  function activar() {
    const $ = (sel) => contenedor.querySelector(sel);

    const form     = $('#form');
    const modo     = $('#modo');
    const estado   = $('#estado');
    const reqOut   = $('#reqOut');
    const resOut   = $('#resOut');
    const btn      = $('#enviar');
    const mensaje  = $('#mensaje');
    const contador = $('#contador');

    const EMAILJS_URL = 'https://api.emailjs.com/api/v1.0/email/send';
    const MOCK_URL    = 'https://mock.local/api/send'; // URL ficticia, nunca sale a internet

    /* ================= Captura de eventos ================= */
    // Cambio de endpoint: muestra/oculta la configuración
    modo.addEventListener('change', () => {
      $('#cfg-mock').hidden    = modo.value !== 'mock';
      $('#cfg-emailjs').hidden = modo.value !== 'emailjs';
    });

    // Contador de caracteres mientras se escribe
    mensaje.addEventListener('input', () => {
      contador.textContent = `${mensaje.value.length} / 500`;
    });

    // Envío del formulario (se evita la recarga de la página)
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const params = {
        from_name: form.from_name.value.trim(),
        to_email:  form.to_email.value.trim(),
        subject:   form.subject.value.trim(),
        message:   form.message.value.trim()
      };

      if (!params.from_name || !params.to_email || !params.subject || !params.message) {
        return mostrarEstado('warn', 'Completa todos los campos antes de enviar.');
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.to_email)) {
        return mostrarEstado('warn', 'El correo destinatario no tiene un formato válido.');
      }

      await enviarCorreo(params);
    });

    /* ================= Llamada a la API ================= */
    async function enviarCorreo(params) {
      const esMock = modo.value === 'mock';

      // Payload JSON estructurado (mismo formato que usa EmailJS)
      const payload = {
        service_id:  esMock ? 'service_mock'  : $('#serviceId').value.trim(),
        template_id: esMock ? 'template_mock' : $('#templateId').value.trim(),
        user_id:     esMock ? $('#mockKey').value.trim()
                            : $('#publicKey').value.trim(),
        template_params: params
      };

      const opciones = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, // encabezado clave
        body: JSON.stringify(payload)                    // objeto JS -> texto JSON
      };

      reqOut.textContent = `POST ${esMock ? MOCK_URL : EMAILJS_URL}\n` +
                           `Content-Type: application/json\n\n` +
                           JSON.stringify(payload, null, 2);
      resOut.textContent = 'Enviando…';
      mostrarEstado('', '');
      btn.disabled = true;

      try {
        const respuesta = esMock ? await fetchMock(MOCK_URL, opciones)
                                 : await fetch(EMAILJS_URL, opciones);

        // EmailJS responde texto plano ("OK"); el mock responde JSON
        const texto = await respuesta.text();
        let cuerpo = texto;
        try { cuerpo = JSON.stringify(JSON.parse(texto), null, 2); } catch (_) {}

        resOut.textContent = `HTTP ${respuesta.status} ${respuesta.statusText}\n` +
                             `Content-Type: ${respuesta.headers.get('Content-Type') || '(no indicado)'}\n\n` +
                             cuerpo;

        manejarStatus(respuesta.status, texto);
      } catch (error) {
        // Falla de red / CORS: ni siquiera hubo respuesta HTTP
        resOut.textContent = 'Error de red: ' + error.message;
        mostrarEstado('err', 'No se pudo contactar al servidor. Revisa tu conexión.');
      } finally {
        btn.disabled = false;
      }
    }

    /* ================= Manejo de códigos HTTP ================= */
    function manejarStatus(status, texto) {
      switch (status) {
        case 200:
          mostrarEstado('ok', '200 OK: el correo fue aceptado para envío.');
          form.reset();
          contador.textContent = '0 / 500';
          break;
        case 400:
          mostrarEstado('err', '400 Bad Request: el servidor rechazó los datos. ' + resumir(texto));
          break;
        case 401:
          mostrarEstado('err', '401 Unauthorized: la clave de API es inválida o falta.');
          break;
        default:
          if (status >= 500) mostrarEstado('err', `${status}: error del servidor, intenta más tarde.`);
          else mostrarEstado('warn', `Respuesta inesperada (${status}). ` + resumir(texto));
      }
    }

    function resumir(t) {
      return t && t.length < 160 ? t : '';
    }

    function mostrarEstado(tipo, msg) {
      estado.className = tipo;
      estado.textContent = msg;
    }

    /* ================= Endpoint mock =================
       Simula un servidor: lee los encabezados y el body JSON que envía fetch
       y devuelve una Response real con el status correspondiente. */
    async function fetchMock(url, opts) {
      await new Promise(r => setTimeout(r, 600)); // latencia simulada

      const json = (status, statusText, obj) => new Response(JSON.stringify(obj), {
        status, statusText, headers: { 'Content-Type': 'application/json' }
      });

      if (opts.headers['Content-Type'] !== 'application/json') {
        return json(400, 'Bad Request', { error: 'Content-Type debe ser application/json' });
      }

      let data;
      try { data = JSON.parse(opts.body); }
      catch { return json(400, 'Bad Request', { error: 'JSON mal formado' }); }

      if (data.user_id !== 'demo-key-123') {
        return json(401, 'Unauthorized', { error: 'API key inválida' });
      }

      const p = data.template_params || {};
      if (!p.to_email || !p.subject || !p.message) {
        return json(400, 'Bad Request', { error: 'Faltan campos obligatorios' });
      }

      return json(200, 'OK', { status: 'queued', id: 'msg_' + Date.now(), to: p.to_email });
    }
  }
} // <- cierre de init
