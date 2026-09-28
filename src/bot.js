// Paso 2: el bot. Se conecta a tu WhatsApp (como WhatsApp Web), escucha los mensajes nuevos
// y los contesta con tu estilo. Pensado para correr 24/7 con pm2 (ver README).
//
// Control desde tu propio chat ("Tú" / mensajes a ti mismo):
//   si 3            -> envía el borrador #3
//   si 3: otro texto -> envía "otro texto" en lugar del borrador #3
//   no 3            -> descarta el borrador #3
//   /modo auto | /modo borrador | /pausa | /reanudar | /estado

import 'dotenv/config';
import qrcode from 'qrcode-terminal';
import wweb from 'whatsapp-web.js';
import { Memoria, normalizar } from './memoria.js';
import { generarRespuesta } from './responder.js';

const { Client, LocalAuth } = wweb;

const cfg = {
  modo: process.env.MODO === 'auto' ? 'auto' : 'borrador',
  retraso: Number(process.env.RETRASO_SEGUNDOS ?? 25) * 1000,
  grupos: process.env.RESPONDER_GRUPOS === 'true',
  permitidos: lista(process.env.CONTACTOS_PERMITIDOS),
  bloqueados: lista(process.env.CONTACTOS_BLOQUEADOS),
  horaInicio: Number(process.env.HORA_INICIO ?? 0),
  horaFin: Number(process.env.HORA_FIN ?? 24),
};
let pausado = false;

function lista(valor) {
  return (valor || '').split(',').map((v) => normalizar(v.trim())).filter(Boolean);
}
function log(...args) {
  console.log(new Date().toLocaleString('es-MX'), '|', ...args);
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const memoria = Memoria.cargar();
log(`Memoria: ${memoria.ejemplos.length} ejemplos, ${Object.keys(memoria.contactos).length} contactos con notas.`);
if (!memoria.estilo) log('Aviso: no hay guía de estilo. Corre primero "npm run estudiar".');

const cliente = new Client({
  authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
});

let yo = null; // tu propio id de WhatsApp
const temporizadores = new Map(); // chatId -> timeout pendiente
const enviadosPorBot = new Set(); // textos que mandó el bot, para distinguirlos de lo que escribes tú
const borradores = new Map(); // número -> { chatId, contacto, entrada, partes }
let siguienteBorrador = 1;

async function aMiChat(texto) {
  try {
    await cliente.sendMessage(yo, texto);
  } catch (err) {
    log('No pude escribir en tu chat:', err.message);
  }
}

async function enviar(chatId, partes) {
  const chat = await cliente.getChatById(chatId);
  for (const parte of partes) {
    enviadosPorBot.add(parte);
    await chat.sendStateTyping();
    await esperar(Math.min(1500 + parte.length * 60, 8000)); // "escribiendo..." realista
    await chat.sendMessage(parte);
  }
  await chat.clearState();
}

function permitido(nombre, numero) {
  const claves = [normalizar(nombre || ''), numero];
  if (cfg.bloqueados.some((b) => claves.includes(b))) return false;
  return !cfg.permitidos.length || cfg.permitidos.some((p) => claves.includes(p));
}

function enHorario() {
  const h = new Date().getHours();
  return cfg.horaInicio <= cfg.horaFin
    ? h >= cfg.horaInicio && h < cfg.horaFin
    : h >= cfg.horaInicio || h < cfg.horaFin;
}

async function conversacionDe(chat, limite = 30) {
  const mensajes = await chat.fetchMessages({ limit: limite });
  return mensajes
    .filter((m) => m.body)
    .map((m) => ({
      yo: m.fromMe,
      texto: m.body,
      hora: new Date(m.timestamp * 1000).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }),
      id: m.id._serialized,
    }));
}

async function atender(chatId, contacto) {
  temporizadores.delete(chatId);
  if (pausado) return;
  const chat = await cliente.getChatById(chatId);
  const conversacion = await conversacionDe(chat);
  if (!conversacion.length || conversacion.at(-1).yo) return; // ya contestaste tú

  const pendiente = conversacion
    .slice(conversacion.findLastIndex((m) => m.yo) + 1)
    .map((m) => m.texto)
    .join('\n');
  log(`Pensando respuesta para ${contacto}: "${pendiente.slice(0, 80)}"`);

  const partes = await generarRespuesta({ memoria, contacto, conversacion });
  if (!partes) {
    log(`  -> mejor no contesto a ${contacto}`);
    await aMiChat(`🤔 No contesté a *${contacto}* (mejor que lo veas tú):\n> ${pendiente.slice(0, 300)}`);
    return;
  }

  if (cfg.modo === 'auto') {
    await enviar(chatId, partes);
    log(`  -> enviado a ${contacto}: ${partes.join(' / ')}`);
  } else {
    const n = siguienteBorrador++;
    borradores.set(n, { chatId, contacto, entrada: pendiente, partes });
    await aMiChat(
      `📝 *Borrador #${n}* para *${contacto}*\n> ${pendiente.slice(0, 300)}\n\n${partes.join('\n\n')}\n\n` +
        `Responde "si ${n}" para enviarlo, "si ${n}: tu texto" para mandar otra cosa, o "no ${n}".`,
    );
    log(`  -> borrador #${n} para ${contacto}`);
  }
}

async function comando(texto) {
  const aprobar = texto.match(/^(?:si|sí|ok)\s+#?(\d+)(?:\s*:\s*([\s\S]+))?$/i);
  const descartar = texto.match(/^no\s+#?(\d+)$/i);
  if (aprobar) {
    const b = borradores.get(Number(aprobar[1]));
    if (!b) return aMiChat(`No encuentro el borrador #${aprobar[1]}.`);
    const partes = aprobar[2] ? [aprobar[2].trim()] : b.partes;
    borradores.delete(Number(aprobar[1]));
    await enviar(b.chatId, partes);
    memoria.aprender({
      contacto: b.contacto,
      contexto: [],
      entrada: b.entrada,
      respuesta: partes.join('\n'),
      fecha: new Date().toISOString(),
      origen: aprobar[2] ? 'corregido' : 'aprobado',
    });
    return aMiChat(`✅ Enviado a ${b.contacto}.`);
  }
  if (descartar) {
    borradores.delete(Number(descartar[1]));
    return aMiChat(`🗑️ Borrador #${descartar[1]} descartado.`);
  }
  const modo = texto.match(/^\/modo\s+(auto|borrador)$/i);
  if (modo) {
    cfg.modo = modo[1].toLowerCase();
    return aMiChat(`⚙️ Modo: ${cfg.modo}`);
  }
  if (/^\/pausa$/i.test(texto)) {
    pausado = true;
    return aMiChat('⏸️ Bot en pausa. Escribe /reanudar para seguir.');
  }
  if (/^\/reanudar$/i.test(texto)) {
    pausado = false;
    return aMiChat('▶️ Bot activo.');
  }
  if (/^\/estado$/i.test(texto)) {
    return aMiChat(
      `🤖 ${pausado ? 'En pausa' : 'Activo'} · modo ${cfg.modo} · ${memoria.ejemplos.length} ejemplos aprendidos · ` +
        `${borradores.size} borradores pendientes`,
    );
  }
}

// Cuando TÚ escribes a mano en un chat, el bot cancela lo que tenía pendiente ahí y aprende de tu respuesta.
async function aprenderDeTi(msg) {
  const chatId = msg.to;
  clearTimeout(temporizadores.get(chatId));
  temporizadores.delete(chatId);

  const chat = await msg.getChat();
  if (chat.isGroup && !cfg.grupos) return;
  const conversacion = await conversacionDe(chat, 20);
  const i = conversacion.findIndex((m) => m.id === msg.id._serialized);
  const antes = i >= 0 ? conversacion.slice(0, i) : conversacion.slice(0, -1);
  if (!antes.length || antes.at(-1).yo) return; // no es una respuesta a algo que te dijeron

  const inicio = antes.findLastIndex((m) => m.yo) + 1;
  const contacto = chat.name;
  memoria.aprender({
    contacto,
    contexto: antes.slice(Math.max(0, inicio - 6), inicio).map((m) => `${m.yo ? 'Yo' : contacto}: ${m.texto}`),
    entrada: antes.slice(inicio).map((m) => m.texto).join('\n'),
    respuesta: msg.body,
    fecha: new Date().toISOString(),
    origen: 'manual',
  });
  log(`Aprendí de tu respuesta a ${contacto}.`);
}

cliente.on('qr', (qr) => {
  log('Escanea este código con WhatsApp > Dispositivos vinculados > Vincular un dispositivo:');
  qrcode.generate(qr, { small: true });
});

cliente.on('ready', async () => {
  yo = cliente.info.wid._serialized;
  log(`Conectado como ${cliente.info.pushname}. Modo: ${cfg.modo}.`);
  await aMiChat(`🤖 Bot conectado (modo ${cfg.modo}). Escribe /estado para ver cómo va.`);
});

cliente.on('message', async (msg) => {
  try {
    if (msg.fromMe || msg.isStatus || msg.from === 'status@broadcast' || !msg.body) return;
    const chat = await msg.getChat();
    if (chat.isGroup && !cfg.grupos) return;
    const contacto = await msg.getContact();
    const nombre = contacto.name || contacto.pushname || contacto.number;
    if (!permitido(nombre, contacto.number) || pausado || !enHorario()) return;

    // Espera un poco por si te mandan varios mensajes seguidos, y contesta todo junto.
    clearTimeout(temporizadores.get(chat.id._serialized));
    temporizadores.set(
      chat.id._serialized,
      setTimeout(() => atender(chat.id._serialized, nombre).catch((e) => log('Error al contestar:', e.message)), cfg.retraso),
    );
  } catch (err) {
    log('Error con mensaje entrante:', err.message);
  }
});

cliente.on('message_create', async (msg) => {
  try {
    if (!msg.fromMe || !msg.body) return;
    if (enviadosPorBot.delete(msg.body)) return; // lo mandó el bot
    if (msg.to === yo || msg.to === msg.from) return comando(msg.body.trim()); // tu propio chat
    await aprenderDeTi(msg);
  } catch (err) {
    log('Error con mensaje propio:', err.message);
  }
});

// Si se cae la conexión, salimos para que pm2 reinicie el bot automáticamente.
cliente.on('auth_failure', (m) => {
  log('Falló la autenticación:', m);
  process.exit(1);
});
cliente.on('disconnected', (razon) => {
  log('Desconectado:', razon);
  process.exit(1);
});
process.on('unhandledRejection', (err) => log('Error no controlado:', err?.message || err));

cliente.initialize();
