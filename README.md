# Wathapp 🤖💬

Un asistente que **estudia todos tus chats de WhatsApp**, aprende cómo escribes y cómo le hablas a cada persona, y **contesta los mensajes nuevos por ti, 24/7**. Usa Claude (la IA de Anthropic) para redactar las respuestas.

## Cómo funciona

1. **Estudiar** (`npm run estudiar`): lee los chats que exportes de WhatsApp y guarda en `data/memoria.json`:
   - cada vez que alguien te escribió y tú contestaste (miles de ejemplos reales),
   - una guía de tu estilo (largo de mensajes, emojis, muletillas, mayúsculas…),
   - notas sobre tu relación con los contactos con los que más hablas.
2. **Contestar** (`npm start`): se conecta a tu WhatsApp como un "dispositivo vinculado" (igual que WhatsApp Web). Cuando llega un mensaje:
   - espera unos segundos por si te mandan más mensajes,
   - busca en tu memoria cómo contestaste antes a mensajes parecidos y lee la plática reciente,
   - Claude redacta la respuesta con tu estilo,
   - según el modo, **la manda** o te la deja como **borrador** para que la apruebes.
3. **Sigue aprendiendo**: cada vez que contestas tú a mano, o apruebas/corriges un borrador, lo guarda en `data/aprendido.jsonl` y lo usa desde ese momento.

Si un mensaje es delicado (dinero, salud, discusiones, compromisos, "¿eres un bot?") o no está seguro, **no contesta** y te avisa en tu chat personal.

## Instalación

Necesitas [Node.js 18+](https://nodejs.org) y una clave de la API de Claude (https://console.anthropic.com).

```bash
git clone <este repo> && cd Wathapp
npm install
cp .env.example .env      # y pon tu ANTHROPIC_API_KEY y MI_NOMBRE
```

### 1. Exporta tus chats

En el teléfono, para cada chat: **abre el chat → ⋮ (o el nombre del contacto en iPhone) → Más → Exportar chat → Sin archivos**. Guarda los `.txt` en `data/chats/` (si te llega un `.zip`, descomprímelo; el nombre del archivo debe ser algo como `Chat de WhatsApp con Juan.txt`).

Entre más chats pongas, mejor te imita.

### 2. Estudia

```bash
npm run estudiar
```

Al terminar te muestra la guía de estilo que aprendió. Puedes volver a correrlo cuando agregues más chats.

### 3. Conecta tu WhatsApp

```bash
npm start
```

Escanea el código QR con **WhatsApp → Dispositivos vinculados → Vincular un dispositivo**. La sesión se guarda en `.wwebjs_auth/`, así que solo lo haces una vez.

## Controlarlo desde tu teléfono

Escribe en tu propio chat (**"Tú"** / mensajes a ti mismo):

| Mensaje | Qué hace |
|---|---|
| `si 3` | Envía el borrador #3 |
| `si 3: otro texto` | Envía "otro texto" en lugar del borrador #3 (y aprende de tu corrección) |
| `no 3` | Descarta el borrador #3 |
| `/modo auto` | Contesta solo, sin preguntarte |
| `/modo borrador` | Te pide aprobación antes de mandar |
| `/pausa` · `/reanudar` | Detiene o reactiva el bot |
| `/estado` | Muestra cómo va |

> **Recomendación:** empieza en modo `borrador` unos días. Cuando veas que los borradores ya suenan a ti, cambia a `/modo auto`.

## Configuración (`.env`)

| Variable | Para qué |
|---|---|
| `MI_NOMBRE` | Tu nombre tal como sale en los chats exportados |
| `MODO` | `borrador` (por defecto) o `auto` |
| `RETRASO_SEGUNDOS` | Cuánto espera tras el último mensaje antes de contestar (25) |
| `RESPONDER_GRUPOS` | `true` para contestar también en grupos |
| `CONTACTOS_PERMITIDOS` | Si lo llenas, solo contesta a esos (nombres o números, separados por comas) |
| `CONTACTOS_BLOQUEADOS` | Nunca les contesta (ej. tu jefe, tu pareja…) |
| `HORA_INICIO` / `HORA_FIN` | Horario en que contesta (0–24 = todo el día) |
| `MODELO` | Modelo de Claude (`claude-opus-5`) |

## Tenerlo prendido 24/7

La computadora donde corre tiene que estar siempre encendida y con internet. Lo más cómodo es un servidor barato en la nube (un VPS Linux de 1–2 GB de RAM) o una computadora que dejes prendida en casa.

Con [pm2](https://pm2.keymetrics.io) se reinicia solo si se cae y arranca cuando se prende la máquina:

```bash
npm install -g pm2
npm start                 # la primera vez, para escanear el QR; luego Ctrl+C
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup               # sigue la instrucción que imprime
pm2 logs wathapp          # ver qué está haciendo
```

En Linux sin escritorio quizá necesites las librerías de Chromium: `sudo apt install -y chromium` (o las dependencias de Puppeteer).

## Importante ⚠️

- **Privacidad:** tus chats, la memoria y la sesión se quedan en tu computadora (`data/` y `.wwebjs_auth/` están en `.gitignore`, nunca se suben a GitHub). Los mensajes que se contestan sí se envían a la API de Claude para redactar la respuesta.
- **Riesgo con WhatsApp:** esto usa [whatsapp-web.js](https://wwebjs.dev), que no es oficial. WhatsApp no permite bots en cuentas personales y **podría bloquear tu número**. El bot simula "escribiendo…" y espera antes de contestar, pero el riesgo existe. Si es para un negocio, lo correcto es la [API oficial de WhatsApp Business](https://developers.facebook.com/docs/whatsapp/cloud-api).
- **Costo:** cada respuesta es una llamada a la API de Claude (se cobra por uso). `npm run estudiar` hace una llamada por cada contacto que estudia más la del estilo.
- Tus contactos no saben que habla un bot: usa el modo automático con criterio.

## Pruebas

```bash
npm test
```
