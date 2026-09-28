import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsearTexto, extraerEjemplos, adivinarMiNombre, nombreDeArchivo } from '../src/parser.js';
import { Memoria } from '../src/memoria.js';

const android = `12/03/24, 14:05 - Los mensajes y las llamadas están cifrados de extremo a extremo.
12/03/24, 14:05 - Juan: Qué onda, vas a ir hoy al fut?
12/03/24, 14:06 - Juan: <Multimedia omitido>
12/03/24, 14:10 - Carlos: simon carnal
llego como a las 8
12/03/24, 14:11 - Juan: va
13/03/24, 9:00 a. m. - Juan: me pasas lo de la tarea?
13/03/24, 9:02 p. m. - Carlos: ahorita te la mando`;

const iphone = `[12/03/24, 14:05:33] Mamá: Ya comiste hijo?
[12/03/24, 14:07:01] Carlos: sí ma, ya 😊`;

test('lee formato Android con mensajes de varias líneas y a. m./p. m.', () => {
  const m = parsearTexto(android);
  assert.equal(m.length, 5);
  assert.equal(m[1].texto, 'simon carnal\nllego como a las 8');
  assert.equal(m[3].fecha.getHours(), 9);
  assert.equal(m[4].fecha.getHours(), 21);
});

test('lee formato iPhone', () => {
  const m = parsearTexto(iphone);
  assert.deepEqual(m.map((x) => x.autor), ['Mamá', 'Carlos']);
  assert.equal(m[1].texto, 'sí ma, ya 😊');
});

test('saca ejemplos "me dijeron -> contesté"', () => {
  const chats = [
    { contacto: 'Juan', mensajes: parsearTexto(android) },
    { contacto: 'Mamá', mensajes: parsearTexto(iphone) },
  ];
  assert.equal(adivinarMiNombre(chats), 'Carlos');
  const ej = extraerEjemplos(chats[0], 'Carlos');
  assert.equal(ej.length, 2);
  assert.equal(ej[0].entrada, 'Qué onda, vas a ir hoy al fut?');
  assert.equal(ej[0].respuesta, 'simon carnal\nllego como a las 8');
  assert.equal(ej[1].entrada, 'me pasas lo de la tarea?');
});

test('nombre del contacto a partir del archivo', () => {
  assert.equal(nombreDeArchivo('Chat de WhatsApp con Juan Pérez.txt'), 'Juan Pérez');
  assert.equal(nombreDeArchivo('WhatsApp Chat with Ana.txt'), 'Ana');
});

test('la memoria encuentra respuestas parecidas', () => {
  const memoria = new Memoria({
    ejemplos: [
      { contacto: 'Juan', entrada: 'vas al fut hoy?', respuesta: 'simon', fecha: '2024-01-01' },
      { contacto: 'Ana', entrada: 'me pasas la tarea', respuesta: 'va', fecha: '2024-01-02' },
      { contacto: 'Mamá', entrada: 'ya comiste?', respuesta: 'sí ma', fecha: '2024-01-03' },
    ],
  });
  const r = memoria.buscar('oye y la tarea de mate?', 'Pedro');
  assert.equal(r[0].respuesta, 'va');
});
