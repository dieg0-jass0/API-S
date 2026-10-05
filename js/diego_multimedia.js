export function init(contenedor) {
  contenedor.innerHTML = "<h2>Multimedia</h2>";

  /* ===== A partir de aquí va mi código ===== */

  // 1) Cargar el CSS (una sola vez)
  const cssUrl = new URL('../css/estilos_diego_multimedia.css', import.meta.url).href;
  if (!document.querySelector('link[href$="estilos_diego_multimedia.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssUrl;
    document.head.appendChild(link);
  }

  // 2) Cargar el HTML (multimedia.html), agregarlo debajo del <h2> y activar la lógica
  const htmlUrl = new URL('./multimedia.html', import.meta.url);
  fetch(htmlUrl)
    .then(r => {
      if (!r.ok) throw new Error(`No se encontró multimedia.html (HTTP ${r.status})`);
      return r.text();
    })
    .then(html => {
      contenedor.insertAdjacentHTML('beforeend', html);
      activar();
    })
    .catch(err => {
      contenedor.insertAdjacentHTML('beforeend', `<p>Error al cargar el módulo: ${err.message}</p>`);
    });

  // 3) Toda la lógica de la sección
  async function activar() {
    const $ = (sel) => contenedor.querySelector(sel);

    const video    = $('#mm-video');
    const audio    = $('#mm-audio');
    const estado   = $('#mm-estado');
    const reqOut   = $('#mm-req');
    const resOut   = $('#mm-res');
    const btnCarga = $('#mm-cargar');

    const HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';

    // Fuentes dinámicas por streaming (manifiestos .m3u8)
    const STREAMS = [
      { id: 'mux',    titulo: 'Big Buck Bunny (HLS)', tipo: 'hls',
        src: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
      { id: 'sintel', titulo: 'Sintel (HLS)', tipo: 'hls',
        src: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8' },
      { id: 'apple',  titulo: 'Bip-bop (HLS)', tipo: 'hls',
        src: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8' }
    ];

    const PISTAS = [
      { titulo: 'Canción 1', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
      { titulo: 'Canción 2', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
      { titulo: 'Canción 3', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' }
    ];

    let hls = null;
    let videos = [...STREAMS];
    let actual = null;
    let bitrateTxt = '—';

    /* ================= Utilidades ================= */
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function duracion(seg) {
      if (!Number.isFinite(seg)) return '—';
      return `${Math.floor(seg / 60)}:${Math.floor(seg % 60).toString().padStart(2, '0')}`;
    }

    function bitrate(bps) {
      if (!bps) return 'n/d';
      return bps >= 1e6 ? `${(bps / 1e6).toFixed(2)} Mbps` : `${Math.round(bps / 1e3)} kbps`;
    }

    function mostrarEstado(tipo, msg) {
      estado.className = tipo;
      estado.textContent = msg;
    }

    function registrar(origen, evento, detalle = '') {
      const li = document.createElement('li');
      li.textContent = `${new Date().toLocaleTimeString()} [${origen}] ${evento} ${detalle}`;
      $('#mm-log').prepend(li);
      while ($('#mm-log').children.length > 40) $('#mm-log').lastChild.remove();
    }

    // hls.js se carga solo cuando se abre la sección
    function cargarHls() {
      if (window.Hls) return Promise.resolve();
      return new Promise((ok, fallo) => {
        const s = document.createElement('script');
        s.src = HLS_CDN;
        s.onload = ok;
        s.onerror = () => fallo(new Error('No se pudo cargar hls.js'));
        document.head.appendChild(s);
      });
    }

    /* ================= Metadatos y lista ================= */
    function pintarMetadatos() {
      if (!actual) return;
      const filas = [
        ['Título', actual.titulo],
        ['Tipo', actual.tipo === 'hls' ? 'Streaming HLS (.m3u8)' : 'MP4 (API Pexels)'],
        ['Duración', duracion(video.duration)],
        ['Posición', duracion(video.currentTime)],
        ['Resolución', video.videoWidth ? `${video.videoWidth}×${video.videoHeight}` : '—'],
        ['Bitrate', bitrateTxt]
      ];
      $('#mm-meta').innerHTML = filas.map(([k, v]) => `<li><b>${k}:</b> ${esc(v)}</li>`).join('');
    }

    function pintarLista() {
      $('#mm-lista').innerHTML = videos
        .map(v => `<button type="button" data-id="${esc(v.id)}">${esc(v.titulo)}</button>`)
        .join('');
      if (actual) marcarActivo();
    }

    function marcarActivo() {
      $('#mm-lista').querySelectorAll('button').forEach(b =>
        b.classList.toggle('mm-activo', b.dataset.id === actual.id));
    }

    /* ================= Reproducción (HLS o MP4) ================= */
    function reproducir(item) {
      actual = item;
      bitrateTxt = '—';
      if (hls) { hls.destroy(); hls = null; }
      video.poster = item.poster || '';

      if (item.tipo === 'hls' && window.Hls && window.Hls.isSupported()) {
        const Hls = window.Hls;
        hls = new Hls();
        hls.loadSource(item.src);
        hls.attachMedia(video);
        hls.on(Hls.Events.LEVEL_SWITCHED, (_e, d) => {
          bitrateTxt = bitrate(hls.levels[d.level]?.bitrate);
          registrar('hls', 'cambio de calidad', bitrateTxt);
          pintarMetadatos();
        });
        hls.on(Hls.Events.ERROR, (_e, d) => {
          registrar('hls', 'error', d.details);
          if (d.fatal) mostrarEstado('err', 'No se pudo reproducir este stream. Prueba con otro.');
        });
      } else if (item.tipo === 'hls' && video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = item.src; // Safari
      } else if (item.tipo === 'hls') {
        mostrarEstado('warn', 'Este navegador no soporta HLS.');
      } else {
        video.src = item.src;
      }

      marcarActivo();
      pintarMetadatos();
    }

    // Bitrate estimado de un MP4: tamaño (HEAD) * 8 / duración
    async function estimarBitrate(url, seg) {
      try {
        const res = await fetch(url, { method: 'HEAD' });
        const bytes = Number(res.headers.get('content-length'));
        return bytes && seg ? Math.round((bytes * 8) / seg) : null;
      } catch (_) {
        return null; // CORS o red
      }
    }

    /* ================= Captura de eventos ================= */
    // <video>
    ['loadedmetadata', 'play', 'pause', 'waiting', 'seeked', 'ended', 'error'].forEach(ev =>
      video.addEventListener(ev, () =>
        registrar('video', ev, ev === 'error' ? (video.error?.message || '') : '')));
    ['timeupdate', 'resize'].forEach(ev => video.addEventListener(ev, pintarMetadatos));
    video.addEventListener('loadedmetadata', async () => {
      pintarMetadatos();
      if (actual?.tipo === 'mp4') {
        const objetivo = actual;
        const bps = await estimarBitrate(objetivo.src, video.duration);
        if (actual === objetivo) { bitrateTxt = bitrate(bps); pintarMetadatos(); }
      }
    });

    // <audio>
    ['loadedmetadata', 'play', 'pause', 'ended', 'error'].forEach(ev =>
      audio.addEventListener(ev, () => registrar('audio', ev)));
    audio.addEventListener('loadedmetadata', () => {
      $('#mm-audio-info').textContent = `Duración: ${duracion(audio.duration)}`;
    });
    $('#mm-pista').innerHTML = PISTAS.map((p, i) => `<option value="${i}">${esc(p.titulo)}</option>`).join('');
    $('#mm-pista').addEventListener('change', (e) => { audio.src = PISTAS[e.target.value].src; });
    audio.src = PISTAS[0].src;

    // Selección de video en la lista
    $('#mm-lista').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-id]');
      if (btn) reproducir(videos.find(v => v.id === btn.dataset.id));
    });

    // Botón: pedir videos a la API de Pexels
    btnCarga.addEventListener('click', cargarPexels);

    /* ================= Llamada a la API de Pexels ================= */
    async function cargarPexels() {
      const clave = $('#mm-key').value.trim();
      const consulta = $('#mm-query').value.trim() || 'nature';

      if (!clave) return mostrarEstado('warn', 'Escribe tu API key de Pexels para cargar videos.');

      const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(consulta)}&per_page=5`;

      reqOut.textContent = `GET ${url}\nAuthorization: ${clave.slice(0, 6)}…(oculta)\nAccept: application/json`;
      resOut.textContent = 'Cargando…';
      mostrarEstado('', '');
      btnCarga.disabled = true;

      try {
        const t0 = performance.now();
        const respuesta = await fetch(url, {
          method: 'GET',
          headers: { Authorization: clave, Accept: 'application/json' }
        });
        const ms = Math.round(performance.now() - t0);

        const texto = await respuesta.text();
        let cuerpo = texto;
        try { cuerpo = JSON.stringify(JSON.parse(texto), null, 2); } catch (_) {}
        if (cuerpo.length > 700) cuerpo = cuerpo.slice(0, 700) + '\n…';

        resOut.textContent = `HTTP ${respuesta.status} ${respuesta.statusText} (${ms} ms)\n` +
                             `Content-Type: ${respuesta.headers.get('Content-Type') || '(no indicado)'}\n\n` +
                             cuerpo;

        manejarStatus(respuesta.status, texto);
      } catch (error) {
        // Falla de red / CORS: ni siquiera hubo respuesta HTTP
        resOut.textContent = 'Error de red: ' + error.message;
        mostrarEstado('err', 'No se pudo contactar a Pexels. Revisa tu conexión.');
      } finally {
        btnCarga.disabled = false;
      }
    }

    /* ================= Manejo de códigos HTTP ================= */
    function manejarStatus(status, texto) {
      switch (status) {
        case 200: {
          const data = JSON.parse(texto);
          const nuevos = data.videos.map(v => {
            const mp4 = v.video_files.filter(f => f.file_type === 'video/mp4' && f.width && f.width <= 1280);
            const archivo = mp4.sort((a, b) => b.width - a.width)[0];
            return archivo && { id: `pexels-${v.id}`, titulo: `Pexels #${v.id}`, tipo: 'mp4', src: archivo.link, poster: v.image };
          }).filter(Boolean);

          videos = [...STREAMS, ...nuevos];
          pintarLista();
          mostrarEstado('ok', `200 OK: se agregaron ${nuevos.length} videos de Pexels.`);
          break;
        }
        case 400:
          mostrarEstado('err', '400 Bad Request: la búsqueda no es válida.');
          break;
        case 401:
          mostrarEstado('err', '401 Unauthorized: la API key es inválida o falta.');
          break;
        case 429:
          mostrarEstado('warn', '429 Too Many Requests: se alcanzó el límite de peticiones.');
          break;
        default:
          if (status >= 500) mostrarEstado('err', `${status}: error del servidor, intenta más tarde.`);
          else mostrarEstado('warn', `Respuesta inesperada (${status}).`);
      }
    }

    /* ================= Arranque ================= */
    try {
      await cargarHls();
    } catch (err) {
      mostrarEstado('warn', `${err.message}. Los streams HLS no se podrán reproducir.`);
    }
    pintarLista();
    reproducir(videos[0]);
    if (!estado.textContent) {
      mostrarEstado('', 'Mostrando streams HLS. Pega una API key para sumar videos de Pexels.');
    }
  }
} // <- cierre de init
