import { init as initCorreo } from "../js/moi_correo.js";
import { init as initComercio } from "../js/cano_comercio.js";
import { init as initMultimedia } from "../js/diego_multimedia.js";
import { init as initEmergentes } from "../js/david_emergentes.js";

const modulos = {
  correo: initCorreo,
  comercio: initComercio,
  multimedia: initMultimedia,
  emergentes: initEmergentes
};

const iniciados = new Set();

function mostrarSeccion(id) {
  document.querySelectorAll(".seccion").forEach(s => (s.hidden = true));
  const seccion = document.getElementById(id);
  seccion.hidden = false;

  if (!iniciados.has(id)) {
    modulos[id](seccion);
    iniciados.add(id);
  }
}

document.querySelectorAll("nav button").forEach(btn => {
  btn.addEventListener("click", () => mostrarSeccion(btn.dataset.section));
});