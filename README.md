<div align="center">

# RADAR NIC

**Los dominios .cl que NIC Chile libera, antes que nadie.**

Un radar personal que vigila la lista pública de dominios eliminados de NIC Chile, te muestra todo lo que se libera y te avisa al celular cuando el dominio que esperas queda disponible.

Un producto de **[Teo Labs](https://www.teolabs.app)** ®

</div>

---

## De qué se trata

Cada día, cientos de dominios `.cl` vencen porque su dueño no los renueva. Cuando NIC Chile los elimina, quedan libres para inscribir, y **gana el primero que llega**. El problema: nadie avisa. Hay que acordarse de entrar a mirar la lista, y para cuando se mira ya los tomó otro.

Radar NIC responde las preguntas del que compra dominios:

- *¿Ya se liberó `pituto.cl`?* Te llega una notificación al celular en el minuto en que aparece.
- *¿Qué se liberó mientras dormía?* Un resumen a las 8:00 con lo más corto y limpio de la noche.
- *¿Hay algún nombre corto, sin números ni guiones, que valga la pena?* Un listado con filtros para elegir.
- *¿A qué hora suele liberar NIC?* El radar mide cuándo ve aparecer cada dominio y lo grafica, para saber en qué horas estar atento.

Es una herramienta de **una sola persona**: entra con una contraseña y se instala como app en el teléfono.

## Lo que hace

### Listado de dominios liberados

| Función | Detalle |
|---|---|
| Lista completa | Todos los dominios que NIC publica como "nuevamente disponibles", acumulados día a día (la lista semanal de NIC trae cerca de 2.000) |
| Búsqueda | Por texto dentro del nombre |
| Filtros | Sin números, sin guiones, hasta 8 letras, últimas 24 h, solo los vistos por el radar |
| Orden | Más recientes, más cortos, A–Z |
| Favoritos y descartados | Marcas para ir separando lo que importa; lo descartado sale de la vista principal |
| Inscribir | Cada dominio lleva el enlace directo a la inscripción en NIC |

### Vigilancia y avisos

| Función | Detalle |
|---|---|
| Lista de vigilancia | Escribes `pituto` o `pituto.cl`; hasta 500 dominios |
| Aviso inmediato | Notificación push al celular, con prioridad alta, apenas el dominio aparece en la lista de NIC |
| Sin avisos perdidos | Si ningún dispositivo recibió el aviso, se reintenta en la siguiente revisión |
| Resumen de la mañana | Un solo mensaje por día con cuántos se liberaron y los cinco más cortos |
| Prueba de envío | Botón para comprobar que las notificaciones llegan a ese dispositivo |

### Radar

| Función | Detalle |
|---|---|
| Horario de Chile | De 8:00 a 23:00 revisa NIC cada minuto; de noche cada 15 minutos y solo suena lo que está en tu vigilancia |
| Estado | Última revisión, cuántos dominios hay en la lista, dispositivos conectados, errores |
| Revisar ahora | Fuerza una consulta a NIC |
| Horas de liberación | Gráfico de a qué hora (de Chile) se ve aparecer cada dominio |

## Un recorrido de punta a punta

```
   NIC Chile                    Radar NIC (Cloudflare)                     Tu iPhone
 ─────────────          ───────────────────────────────────          ───────────────────
 lista semanal  ──────▶  cada minuto (de día) la descarga
 de eliminados           │
                         ├─ guarda los dominios nuevos
                         │   y la hora en que aparecieron
                         │
                         ├─ ¿alguno está en tu vigilancia? ──sí──▶  notificación push
                         │                                          "🔔 pituto.cl está disponible"
                         │                                                   │
                         └─ 8:00: resumen del día  ─────────────────▶ "☀️ 12 dominios liberados"
                                                                              │
                                              toca el aviso ◀─────────────────┘
                                                   │
                                   la app abre el dominio ──▶ "Inscribir" ──▶ clientes.nic.cl
```

## Las decisiones que sostienen el sistema

1. **Se lee siempre la lista semanal, no la diaria.** La lista de "último día" de NIC viene cortada en 200 dominios; la semanal no. Leer la semanal y guardar solo lo nuevo no pierde ninguna liberación, aunque una revisión se retrase.
2. **El aviso compara contra la lista actual de NIC, no contra el historial.** Un dominio liberado hace diez días y ya comprado por otro no dispara una alerta falsa.
3. **Horario por la hora de Chile, decidido en el código.** Chile cambia de horario dos veces al año; en vez de reprogramar tareas, el radar despierta cada minuto y decide si le toca trabajar. De noche el celular no suena por dominios que no están en tu vigilancia.
4. **Notificaciones propias, sin depender de otra app.** El aviso llega por notificación push de la propia app instalada, con el cifrado estándar de Web Push. Sin bots ni cuentas de terceros.
5. **Si NIC cambia su formato, el radar se detiene en vez de guardar basura.** Una respuesta con menos de 50 dominios se descarta y queda registrada como error visible en la pantalla Radar.

## Stack

| Capa | Tecnología |
|---|---|
| Servidor y tareas programadas | Cloudflare Workers (TypeScript), cron cada minuto |
| Base de datos | Cloudflare D1 (SQLite) |
| App | React 19 + Vite, instalable como PWA |
| Notificaciones | Web Push con VAPID y cifrado `aes128gcm`, solo con WebCrypto |
| Hosting | Todo en un solo Worker (API + archivos de la app) |
| Costo | Plan gratuito de Cloudflare |

## Puesta en marcha

```bash
npm install
npm run setup:env          # crea .dev.vars con contraseña, secreto de sesión y llaves push (solo local)
npm run db:migrate:local   # crea las tablas en la base local
npm run seed:demo          # opcional: datos de demostración (solo local)
npm run build              # compila la app a dist/
npm run dev:worker         # API + app en http://localhost:8787
```

Pruebas y verificación de tipos:

```bash
npm test                   # cifrado push, firma VAPID, horario de Chile, lectura de la lista de NIC
npm run typecheck
```

## Estructura

```
NIC/
├── worker/
│   ├── index.ts        API (/api/*) y tarea programada
│   ├── poll.ts         descarga de NIC, nuevos, vigilancia y resumen de la mañana
│   ├── nic.ts          lectura y validación de la lista de NIC
│   ├── schedule.ts     horario día/noche en hora de Chile
│   ├── webpush.ts      cifrado y firma de notificaciones push
│   ├── notify.ts       envío a todos los dispositivos
│   └── auth.ts         contraseña, sesión firmada y freno a intentos
├── shared/domain.ts    reglas de nombres .cl y enlace de inscripción
├── src/                app (React): listado, vigilancia y radar
├── public/             manifiesto, service worker, íconos, cabeceras de seguridad
├── migrations/         esquema de la base de datos
└── scripts/            llaves y secretos, íconos, datos de demostración
```

## Deploy

```bash
npx wrangler login
npm run deploy                       # crea la base D1 la primera vez
npm run db:migrate:remote
node scripts/init-env.mjs --print    # muestra los valores; cárgalos uno a uno:
npx wrangler secret put APP_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
```

Después, abre la dirección del Worker en **Safari**, toca **Compartir → Agregar a inicio**, abre la app desde el ícono y activa las notificaciones en la pestaña Radar. En iPhone las notificaciones solo existen con la app instalada.

## Seguridad

- Acceso con una contraseña; sesión en cookie firmada (`HttpOnly`, `Secure`, `SameSite=Strict`) y máximo 10 intentos por hora por IP.
- La contraseña y las llaves viven como secretos del Worker, nunca en el código.
- Las peticiones que modifican datos rechazan orígenes distintos al de la app.
- Solo se aceptan suscripciones push de los servicios reales (Apple, Google, Mozilla, Microsoft).
- Cabeceras de seguridad y política de contenido estricta en la app.

---

<div align="center">

**Construido por [Teo Labs](https://www.teolabs.app)** ®

*Porque en los dominios, el que llega primero se queda con el nombre.*

</div>
