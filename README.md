# fake-messenger

App de mensajeria para partidas de rol. Una mesa crea su partida y reparte tres
codigos de acceso: uno para el **DM**, otro para los **jugadores** y otro para los
**voyeristas**. El codigo con el que entras decide lo que puedes hacer.

- **Backend**: Node + Express + WebSocket (`ws`), en TypeScript.
- **Frontend**: React + Vite, en TypeScript.
- **Tipos compartidos**: paquete `@rol/shared`, usado por los dos lados.
- **Docker Compose** para construir, ejecutar y probar.

## Roles

| | DM | Jugador | Voyerista |
|---|---|---|---|
| Ver la lista de jugadores | si | si | si |
| Ver a los voyeristas | si | **no** | si |
| Leer el chat general | si | si | si |
| Leer chats y grupos privados | si (todos) | solo los suyos | si (todos) |
| Escribir | en cualquier chat | en los suyos | **no** |
| Crear chats privados y grupos | si | si | no |
| Borrar mensajes | cualquiera | solo los propios | no |
| Expulsar participantes | si | no | no |
| Consultar los codigos de la partida | si | no | no |

Los voyeristas son invisibles para los jugadores: no salen en la lista de
participantes ni generan avisos ("X se ha unido") que ellos puedan leer.

## Desplegar con `deploy.sh`

```bash
./deploy.sh
```

El script se encarga de todo:

1. Para el despliegue anterior (asi puede reutilizar su puerto).
2. Elige el puerto del frontend: conserva el del `.env` si sigue libre y, si no,
   busca el primero disponible a partir de 3000.
3. Escribe el `.env` con ese puerto y la contrasena de la mesa (permisos `600`).
4. Busca un token de Cloudflare y, si lo encuentra, levanta tambien el tunel.
5. Construye las imagenes, arranca los contenedores y espera a que la app responda.

El token del tunel se busca por este orden: `--tunnel-token`, `--token-file`, las
variables `CLOUDFLARE_TUNNEL_TOKEN` / `TUNNEL_TOKEN` / `CLOUDFLARED_TOKEN`, el
`.env` anterior y los ficheros `./cloudflared.token`, `./.cloudflared-token`,
`~/.cloudflared/token` y `/etc/cloudflared/token`. Sin token, despliega solo la app.

```bash
./deploy.sh --tunnel-token "eyJhIjoi..."   # publica el tunel
./deploy.sh --password "OtraContrasena"    # cambia la contrasena de la mesa
./deploy.sh --port 8080                    # puerto fijo (falla si esta ocupado)
./deploy.sh --port-base 8000               # busca desde 8000 en vez de 3000
./deploy.sh --no-tunnel                    # ignora el token que haya
./deploy.sh --dry-run                      # solo escribe el .env y enseña el plan
./deploy.sh --help                         # todas las opciones
```

En el panel de Cloudflare, el hostname publico del tunel tiene que apuntar a
`http://app:3000`: el contenedor `cloudflared` llega al servicio `app` por la red
interna de Compose, asi que no hace falta publicar ningun puerto hacia fuera.

## Arrancar con Docker Compose

```bash
# Construir y levantar la app en http://localhost:3000
docker compose up --build app

# Pasar las comprobaciones (tipos del cliente y del servidor + tests del backend)
docker compose run --rm test

# Modo desarrollo con recarga en caliente: Vite en 5173, backend en 3000
docker compose --profile dev up dev
```

La contrasena para crear partidas se puede cambiar con la variable
`ROLEPLAY_PASSWORD` (por defecto `MeGustaElRol`):

```bash
ROLEPLAY_PASSWORD="OtraContrasena" docker compose up --build app
```

El estado de las partidas se guarda en el volumen `partidas` (`/app/data`), asi que
sobrevive a reinicios del contenedor.

Para levantar el tunel a mano, con `CLOUDFLARE_TUNNEL_TOKEN` en el `.env`:

```bash
docker compose --profile tunnel up -d --build app cloudflared
```

## Arrancar sin Docker

```bash
npm install
npm run dev          # Vite en http://localhost:5173 con proxy al backend en 3000
```

Para produccion:

```bash
npm run build        # compila shared, servidor y cliente
npm start            # sirve el SPA y el WebSocket en http://localhost:3000
```

## Comprobaciones

```bash
npm run check        # typecheck de los tres paquetes + tests del backend
npm test             # solo los tests (Vitest: reglas de visibilidad, permisos, REST y WebSocket)
```

## Como se usa

1. En el menu principal, **Crear una partida**: nombre de la mesa y contrasena.
2. La app devuelve los tres codigos (`DM-…`, `PJ-…`, `VY-…`). Repartelos.
   El DM puede volver a consultarlos en la pestana **Codigos**.
3. Cada persona entra desde **Unirse a una partida** con su codigo y su nombre.
4. Todo el mundo empieza en el chat **General**. Los jugadores pueden abrir chats
   privados o grupos desde la barra lateral; el DM ve esas conversaciones marcadas
   con 👁 y puede intervenir en ellas.

## Variables de entorno

| Variable | Por defecto | Para que sirve |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor |
| `HOST` | `0.0.0.0` | Interfaz de escucha |
| `ROLEPLAY_PASSWORD` | `MeGustaElRol` | Contrasena para crear partidas |
| `DATA_DIR` | `./data` | Carpeta donde se guardan las partidas |
| `CLIENT_DIR` | `client/dist` | SPA compilado que sirve el backend |
| `PERSIST` | — | `0` desactiva el guardado en disco (lo usan los tests) |
| `CLOUDFLARE_TUNNEL_TOKEN` | — | Token del tunel; si esta, `deploy.sh` arranca `cloudflared` |

## Estructura

```
deploy.sh  prepara el .env (puerto libre + token) y levanta los contenedores
shared/    tipos y constantes compartidos (protocolo REST y WebSocket)
server/    Express + ws, estado de las partidas y reglas de visibilidad
  src/store.ts    quien ve que, quien puede escribir, borrar o expulsar
  src/server.ts   rutas REST, WebSocket y reparto de eventos
  test/           tests de Vitest
client/    React + Vite
  src/lib/useGame.ts   conexion WebSocket, reconexion y estado del chat
  src/components/      menu, codigos, barra lateral, conversacion, modales
```

## Decisiones y limitaciones

- El voyerista lee **todos** los chats, incluidos los privados: es lo propio del
  rol de espectador. No escribe, no crea chats y no se le puede meter en uno.
- Los jugadores tambien pueden abrir un chat privado con el DM, ademas de entre ellos.
- Una partida admite un solo DM activo y los nombres no se repiten dentro de la mesa.
- Al expulsar a alguien se le invalida la sesion y se le saca de sus chats, pero el
  codigo de acceso sigue siendo valido: quien lo tenga puede volver a entrar con otro
  nombre. Rotar los codigos queda pendiente.
- Las partidas se guardan como JSON en `DATA_DIR`. Es suficiente para una mesa; no
  esta pensado para muchas partidas simultaneas ni para varios procesos a la vez.
- Se conservan los ultimos 1000 mensajes por chat.
