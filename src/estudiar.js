// Paso 1: "estudiar". Lee todos tus chats exportados en data/chats/ y crea data/memoria.json con:
//  - todos los pares "me escribieron -> contesté"
//  - estadísticas y una guía de tu forma de escribir
//  - notas sobre tu relación con los contactos con los que más hablas

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { leerCarpeta, adivinarMiNombre, extraerEjemplos } from './parser.js';
import { ARCHIVO_MEMORIA, CARPETA_DATOS } from './memoria.js';
import { preguntar } from './claude.js';

const CARPETA_CHATS = path.join(CARPETA_DATOS, 'chats');

function estadisticas(misMensajes) {
  const textos = misMensajes.map((m) => m.texto);
  const emojis = new Map();
  for (const t of textos) {
    for (const e of t.match(/\p{Extended_Pictographic}/gu) || []) emojis.set(e, (emojis.get(e) || 0) + 1);
  }
  const conEmoji = textos.filter((t) => /\p{Extended_Pictographic}/u.test(t)).length;
  const empiezaMinuscula = textos.filter((t) => /^\p{Ll}/u.test(t)).length;
  const conPuntoFinal = textos.filter((t) => /\.$/.test(t)).length;
  const pct = (n) => Math.round((100 * n) / (textos.length || 1));
  return {
    mensajes: textos.length,
    largoPromedio: Math.round(textos.reduce((s, t) => s + t.length, 0) / (textos.length || 1)),
    pctConEmoji: pct(conEmoji),
    emojisFavoritos: [...emojis.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([e]) => e),
    pctEmpiezaMinuscula: pct(empiezaMinuscula),
    pctConPuntoFinal: pct(conPuntoFinal),
  };
}

function muestra(lista, n) {
  if (lista.length <= n) return lista;
  const paso = lista.length / n;
  return Array.from({ length: n }, (_, i) => lista[Math.floor(i * paso)]);
}

async function guiaDeEstilo(miNombre, ejemplos, stats) {
  const sistema =
    'Eres un analista de estilo de escritura. Describes con precisión cómo escribe una persona en WhatsApp para que alguien pueda imitarla.';
  const pares = muestra(ejemplos, 300)
    .map((e) => `[${e.contacto}] Le dijeron: ${e.entrada}\n${miNombre} contestó: ${e.respuesta}`)
    .join('\n---\n');
  return preguntar({
    system: sistema,
    esfuerzo: 'high',
    mensaje:
      `Estas son respuestas reales de ${miNombre} en WhatsApp y algunas estadísticas:\n` +
      `${JSON.stringify(stats)}\n\n${pares}\n\n` +
      `Escribe una guía de estilo concreta (máx. 400 palabras) de cómo escribe ${miNombre}: largo de los mensajes, ` +
      'uso de mayúsculas, signos, emojis, muletillas y expresiones típicas, saludos y despedidas, nivel de formalidad, ' +
      'cómo cambia según con quién habla, cosas que nunca hace. Incluye frases típicas textuales. Solo la guía, sin introducción.',
  });
}

async function notasDeContacto(miNombre, chat) {
  const ultimos = chat.mensajes
    .slice(-200)
    .map((m) => `${m.autor === miNombre ? 'Yo' : m.autor}: ${m.texto}`)
    .join('\n');
  return preguntar({
    system: 'Tomas notas breves y útiles sobre relaciones personales a partir de conversaciones de WhatsApp.',
    esfuerzo: 'low',
    mensaje:
      `Esta es la parte más reciente de la conversación entre ${miNombre} ("Yo") y ${chat.contacto}:\n\n${ultimos}\n\n` +
      `En máximo 120 palabras: ¿qué relación parecen tener? ¿cómo le habla ${miNombre} (tono, apodos, formalidad)? ` +
      '¿de qué temas hablan? ¿hay pendientes o datos importantes (planes, fechas, favores)? Solo las notas.',
  });
}

async function main() {
  const chats = leerCarpeta(CARPETA_CHATS);
  if (!chats.length) {
    console.error(`No encontré chats en ${CARPETA_CHATS}. Exporta tus chats de WhatsApp (.txt) y ponlos ahí.`);
    process.exit(1);
  }

  const miNombre = process.env.MI_NOMBRE?.trim() || adivinarMiNombre(chats);
  console.log(`Estudiando ${chats.length} chats. Tu nombre en los chats: "${miNombre}"`);
  if (!process.env.MI_NOMBRE) console.log('  (si no es correcto, pon MI_NOMBRE en el archivo .env)');

  const ejemplos = chats.flatMap((c) => extraerEjemplos(c, miNombre));
  const misMensajes = chats.flatMap((c) => c.mensajes.filter((m) => m.autor === miNombre));
  if (!ejemplos.length) {
    console.error(`No encontré respuestas de "${miNombre}". Revisa MI_NOMBRE en .env.`);
    process.exit(1);
  }
  const stats = estadisticas(misMensajes);
  console.log(`- ${misMensajes.length} mensajes tuyos, ${ejemplos.length} ejemplos de respuesta.`);

  console.log('- Analizando tu estilo de escritura con Claude...');
  const estilo = await guiaDeEstilo(miNombre, ejemplos, stats);

  const n = Number(process.env.ESTUDIAR_CONTACTOS ?? 20);
  const principales = chats
    .filter((c) => !c.mensajes.every((m) => m.autor === miNombre))
    .sort((a, b) => b.mensajes.length - a.mensajes.length)
    .slice(0, n);
  const contactos = {};
  for (const chat of principales) {
    process.stdout.write(`- Tomando notas de ${chat.contacto}... `);
    try {
      contactos[chat.contacto] = await notasDeContacto(miNombre, chat);
      console.log('listo');
    } catch (err) {
      console.log(`error (${err.message})`);
    }
  }

  fs.writeFileSync(
    ARCHIVO_MEMORIA,
    JSON.stringify({ miNombre, estilo, estadisticas: stats, contactos, ejemplos, creado: new Date() }, null, 1),
  );
  console.log(`\nListo. Memoria guardada en ${ARCHIVO_MEMORIA}\n\nTu estilo según Claude:\n${estilo}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
