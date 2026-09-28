// La "memoria" del bot: tus respuestas pasadas, tu estilo y notas sobre cada contacto.
// Busca las conversaciones pasadas más parecidas a un mensaje nuevo.

import fs from 'node:fs';
import path from 'node:path';

export const CARPETA_DATOS = path.resolve('data');
export const ARCHIVO_MEMORIA = path.join(CARPETA_DATOS, 'memoria.json');
export const ARCHIVO_APRENDIDO = path.join(CARPETA_DATOS, 'aprendido.jsonl');

const VACIAS = new Set(
  'a al algo ante con de del el en es esa ese eso esta este esto ha la las le les lo los me mi mis no o para pero por que se si sin su sus te tu tus un una uno y ya yo the to and is it of you i'.split(
    ' ',
  ),
);

export function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/(.)\1{2,}/g, '$1$1'); // "holaaaa" -> "holaa"
}

export function palabras(texto) {
  return normalizar(texto)
    .split(/[^a-z0-9ñ]+/)
    .filter((p) => p.length > 1 && !VACIAS.has(p));
}

export class Memoria {
  constructor({ miNombre = '', estilo = '', estadisticas = {}, contactos = {}, ejemplos = [] } = {}) {
    this.miNombre = miNombre;
    this.estilo = estilo;
    this.estadisticas = estadisticas;
    this.contactos = contactos;
    this.ejemplos = [];
    this.df = new Map();
    for (const e of ejemplos) this.agregar(e);
  }

  static cargar() {
    const datos = fs.existsSync(ARCHIVO_MEMORIA)
      ? JSON.parse(fs.readFileSync(ARCHIVO_MEMORIA, 'utf8'))
      : {};
    const memoria = new Memoria(datos);
    if (fs.existsSync(ARCHIVO_APRENDIDO)) {
      for (const linea of fs.readFileSync(ARCHIVO_APRENDIDO, 'utf8').split('\n')) {
        if (linea.trim()) memoria.agregar(JSON.parse(linea));
      }
    }
    return memoria;
  }

  agregar(ejemplo) {
    const clave = new Set(palabras(ejemplo.entrada));
    this.ejemplos.push({ ...ejemplo, _palabras: clave });
    for (const p of clave) this.df.set(p, (this.df.get(p) || 0) + 1);
  }

  // Aprende en vivo de una respuesta nueva y la guarda en disco.
  aprender(ejemplo) {
    this.agregar(ejemplo);
    fs.mkdirSync(CARPETA_DATOS, { recursive: true });
    fs.appendFileSync(ARCHIVO_APRENDIDO, JSON.stringify(ejemplo) + '\n');
  }

  notasDe(contacto) {
    const clave = normalizar(contacto || '');
    const encontrado = Object.keys(this.contactos).find((c) => normalizar(c) === clave);
    return encontrado ? this.contactos[encontrado] : null;
  }

  // Ejemplos más parecidos al mensaje (ponderando palabras poco comunes) + los más recientes con ese contacto.
  buscar(texto, contacto, { parecidos = 8, recientes = 5 } = {}) {
    const consulta = new Set(palabras(texto));
    const total = this.ejemplos.length || 1;
    const mismo = (e) => contacto && normalizar(e.contacto) === normalizar(contacto);

    const puntuados = [];
    for (const e of this.ejemplos) {
      let puntos = 0;
      for (const p of consulta) {
        if (e._palabras.has(p)) puntos += Math.log(1 + total / this.df.get(p));
      }
      if (puntos > 0) puntuados.push({ e, puntos: puntos * (mismo(e) ? 1.5 : 1) });
    }
    puntuados.sort((a, b) => b.puntos - a.puntos);
    const elegidos = puntuados.slice(0, parecidos).map((x) => x.e);

    const delContacto = this.ejemplos
      .filter((e) => mismo(e) && !elegidos.includes(e))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
      .slice(0, recientes);

    return [...delContacto.reverse(), ...elegidos];
  }
}
