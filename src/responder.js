// Decide qué contestar a un mensaje nuevo usando tu estilo y tus respuestas pasadas.

import { preguntar } from './claude.js';

export const NO_RESPONDER = '[NO_RESPONDER]';

function instrucciones(memoria) {
  const yo = memoria.miNombre || 'el dueño del teléfono';
  return `Eres ${yo} contestando tus propios mensajes de WhatsApp. Nadie debe notar que no eres tú.

Cómo escribe ${yo}:
${memoria.estilo || '(sin guía de estilo todavía: imita los ejemplos)'}

Estadísticas de sus mensajes: ${JSON.stringify(memoria.estadisticas)}

Reglas:
- Contesta SOLO con el texto del mensaje, exactamente como lo escribiría ${yo}: mismo largo, mismas mayúsculas/minúsculas, mismos emojis y muletillas. Sin comillas ni explicaciones.
- Si ${yo} suele mandar varios mensajes cortos seguidos, puedes separarlos con una línea que diga solo "|||".
- Básate en los ejemplos reales de cómo contestó antes a mensajes parecidos y en cómo le habla a esta persona.
- No inventes datos que no sabes (dónde estás, horarios, precios, direcciones, planes). No aceptes compromisos, citas, pagos ni favores importantes en nombre de ${yo}. Si hace falta algo así, puedes dar una respuesta breve y natural que no comprometa (ej. "déjame checar y te digo").
- Contesta exactamente ${NO_RESPONDER} (y nada más) si: el mensaje es delicado (dinero, salud, emergencias, discusiones, temas íntimos), te preguntan si eres un bot, no hay nada que contestar (ej. un "ok" o un sticker que cierra la plática), o no estás seguro de qué diría ${yo}.`;
}

function formatearEjemplos(ejemplos) {
  return ejemplos
    .map((e) => {
      const ctx = e.contexto?.length ? e.contexto.join('\n') + '\n' : '';
      return `<ejemplo contacto="${e.contacto}">\n${ctx}${e.contacto}: ${e.entrada}\nYo: ${e.respuesta}\n</ejemplo>`;
    })
    .join('\n');
}

// conversacion: [{ yo: boolean, texto, hora }] del más viejo al más nuevo (lo último es lo que hay que contestar)
export async function generarRespuesta({ memoria, contacto, conversacion }) {
  const pendiente = [];
  for (let i = conversacion.length - 1; i >= 0 && !conversacion[i].yo; i--) pendiente.unshift(conversacion[i].texto);
  const ejemplos = memoria.buscar(pendiente.join('\n'), contacto);
  const notas = memoria.notasDe(contacto);
  const ahora = new Date().toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' });

  const mensaje = `<ejemplos_de_como_contestaste_antes>
${formatearEjemplos(ejemplos) || '(ninguno parecido)'}
</ejemplos_de_como_contestaste_antes>

<notas_del_contacto>
${notas || `Sin notas. Nombre del contacto: ${contacto || 'desconocido'}`}
</notas_del_contacto>

Fecha y hora actual: ${ahora}

<conversacion_actual con="${contacto}">
${conversacion.map((m) => `[${m.hora}] ${m.yo ? 'Yo' : contacto}: ${m.texto}`).join('\n')}
</conversacion_actual>

Escribe lo que contestarías ahora a ${contacto}.`;

  const texto = await preguntar({ system: instrucciones(memoria), mensaje, esfuerzo: 'medium' });
  if (!texto || texto.includes(NO_RESPONDER)) return null;
  return texto
    .split(/^\s*\|\|\|\s*$/m)
    .map((t) => t.trim())
    .filter(Boolean);
}
