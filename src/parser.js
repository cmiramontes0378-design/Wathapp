// Lee los archivos .txt que genera WhatsApp con "Exportar chat" (Android e iPhone,
// en español o inglés) y los convierte en una lista de mensajes.

import fs from 'node:fs';
import path from 'node:path';

// Android: "12/03/24, 14:05 - Juan: Hola"  |  "12/3/2024 2:05 p. m. - Juan: Hola"
// iPhone:  "[12/03/24, 14:05:33] Juan: Hola"
const CABECERA =
  /^\[?(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*([ap]\.?\s?m\.?)?\]?\s*(?:-\s)?\s*([^:]{1,80}?):\s?([\s\S]*)$/i;

const IGNORAR = [
  /^<(multimedia omitido|media omitted|archivo omitido)>$/i,
  /^(imagen|video|audio|sticker|gif|documento) omitid[oa]$/i,
  /^(se eliminó este mensaje|eliminaste este mensaje|this message was deleted|you deleted this message)\.?$/i,
  /^<se editó este mensaje>$/i,
  /^null$/i,
];

function limpiarLinea(linea) {
  return linea
    .replace(/[‎‏‪-‮]/g, '')
    .replace(/[  ]/g, ' ')
    .replace(/\r$/, '');
}

function aFecha(fecha, hora, ampm) {
  const [d, m, a] = fecha.split(/[/.-]/).map(Number);
  let [h, min, s = 0] = hora.split(':').map(Number);
  if (ampm) {
    const pm = /^p/i.test(ampm);
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  const anio = a < 100 ? 2000 + a : a;
  return new Date(anio, m - 1, d, h, min, s);
}

export function parsearTexto(texto) {
  const mensajes = [];
  for (const cruda of texto.split('\n')) {
    const linea = limpiarLinea(cruda);
    const m = linea.match(CABECERA);
    if (m) {
      const [, fecha, hora, ampm, autor, cuerpo] = m;
      mensajes.push({ fecha: aFecha(fecha, hora, ampm), autor: autor.trim(), texto: cuerpo });
    } else if (mensajes.length && !/^\[?\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(linea)) {
      // Continuación de un mensaje de varias líneas.
      mensajes[mensajes.length - 1].texto += '\n' + linea;
    }
    // Las líneas de sistema ("Juan creó el grupo", "Los mensajes están cifrados...") se descartan.
  }
  return mensajes
    .map((msg) => ({ ...msg, texto: msg.texto.trim() }))
    .filter((msg) => msg.texto && !IGNORAR.some((re) => re.test(msg.texto)));
}

// "Chat de WhatsApp con Juan Pérez.txt" -> "Juan Pérez"
export function nombreDeArchivo(archivo) {
  return path
    .basename(archivo, path.extname(archivo))
    .replace(/^(chat de whatsapp con|whatsapp chat with|whatsapp chat -)\s*/i, '')
    .trim();
}

export function leerCarpeta(carpeta) {
  if (!fs.existsSync(carpeta)) return [];
  return fs
    .readdirSync(carpeta)
    .filter((f) => f.toLowerCase().endsWith('.txt'))
    .map((f) => ({
      contacto: nombreDeArchivo(f),
      mensajes: parsearTexto(fs.readFileSync(path.join(carpeta, f), 'utf8')),
    }))
    .filter((chat) => chat.mensajes.length > 0);
}

// Tu nombre es el autor que aparece en más chats distintos.
export function adivinarMiNombre(chats) {
  const conteo = new Map();
  for (const chat of chats) {
    for (const autor of new Set(chat.mensajes.map((m) => m.autor))) {
      conteo.set(autor, (conteo.get(autor) || 0) + 1);
    }
  }
  return [...conteo.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

// Junta mensajes seguidos del mismo autor en un solo "turno".
export function agruparTurnos(mensajes) {
  const turnos = [];
  for (const m of mensajes) {
    const ultimo = turnos[turnos.length - 1];
    const seguido = ultimo && ultimo.autor === m.autor && m.fecha - ultimo.fin < 10 * 60 * 1000;
    if (seguido) {
      ultimo.texto += '\n' + m.texto;
      ultimo.fin = m.fecha;
    } else {
      turnos.push({ autor: m.autor, texto: m.texto, inicio: m.fecha, fin: m.fecha });
    }
  }
  return turnos;
}

// Cada vez que tú contestas a alguien se guarda un ejemplo: lo que te dijeron -> lo que respondiste.
export function extraerEjemplos(chat, miNombre, turnosContexto = 6) {
  const turnos = agruparTurnos(chat.mensajes);
  const ejemplos = [];
  for (let i = 1; i < turnos.length; i++) {
    const mio = turnos[i];
    const previo = turnos[i - 1];
    if (mio.autor !== miNombre || previo.autor === miNombre) continue;
    ejemplos.push({
      contacto: chat.contacto,
      contexto: turnos
        .slice(Math.max(0, i - 1 - turnosContexto), i - 1)
        .map((t) => `${t.autor === miNombre ? 'Yo' : t.autor}: ${t.texto}`),
      entrada: previo.texto,
      respuesta: mio.texto,
      fecha: mio.inicio.toISOString(),
    });
  }
  return ejemplos;
}
