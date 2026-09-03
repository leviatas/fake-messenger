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
| Compartir un enlace de invitacion | los tres roles | solo de jugador | no |

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
6. Si hay tunel, comprueba que `cloudflared` sigue en marcha y ha registrado la
   conexion con Cloudflare; si se ha caido, enseña el registro y termina con
   codigo de salida 1 (la app se queda funcionando en local igualmente).

Basta con que el token este puesto —por opcion, por variable de entorno, en el
`.env` o en un fichero— para que el script levante tambien `cloudflared`. Con
`--no-tunnel` lo deja apagado aunque haya token.

Los tiempos de espera se pueden ajustar con `HEALTH_TIMEOUT` (90 s por defecto)
y `TUNNEL_TIMEOUT` (40 s).

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

### Despliegue automatico desde GitHub

`.github/workflows/deploy.yml` despliega en cada push a `main` (y a mano con
*Run workflow*). Corre sobre un runner **self-hosted**: entra en la copia del
repo que hay en el servidor, hace `git pull` y ejecuta `./deploy.sh`.

La ruta por defecto es `~/proyectos/rol/fake-messenger`. Para otra, define la
variable `DEPLOY_DIR` en GitHub (Settings → Secrets and variables → Actions →
Variables). Si ahi no hay un repo git, el workflow falla con un aviso en vez de
desplegar a ciegas.

## Publicar la partida con un tunel de Cloudflare

El tunel deja la app accesible desde internet **sin abrir puertos en el router**:
el contenedor `cloudflared` abre la conexion hacia fuera y Cloudflare le pasa el
trafico. Hace falta un dominio en Cloudflare y una cuenta gratuita.

### 1. Sacar el token

En [dash.cloudflare.com](https://dash.cloudflare.com):

1. Ve a **Networking → Tunnels** (en el panel de Cloudflare One / Zero Trust la
   ruta es **Networks → Connectors → Cloudflare Tunnels**).
2. **Create a tunnel** → conector **Cloudflared** → ponle un nombre
   (por ejemplo `rol`) → **Save**.
3. En la pantalla de instalacion, Cloudflare muestra un comando del tipo
   `cloudflared service install eyJhIjoiNWFiNGU5Z...`. **No lo ejecutes**: de eso
   se encarga el contenedor. Copia solo la cadena larga que empieza por `eyJ...`,
   que es el token.

Si el tunel ya existe, entra en el y usa **Edit** (o **Add a replica**) para ver
otra vez ese comando. **Refresh token** genera uno nuevo e invalida el anterior.

Tambien se puede pedir por API, con un token de Cloudflare que tenga el permiso
*Cloudflare Tunnel Write* (o *Cloudflare One Connector: cloudflared Write*):

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/token" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

### 2. Apuntar el hostname publico a la app

En el mismo tunel, pestana **Public hostname** → **Add a public hostname**:

| Campo | Valor |
|---|---|
| Subdomain / Domain | el que quieras, p. ej. `rol` + `midominio.com` |
| Type | `HTTP` |
| URL | `app:3000` |

`app:3000` es el nombre del servicio dentro de la red de Compose, no una direccion
de tu maquina: por eso el tunel funciona aunque la app no publique ningun puerto
hacia fuera. Va en HTTP plano a proposito — el HTTPS lo pone Cloudflare por
delante. Los WebSockets del chat pasan por el tunel sin configuracion extra.

### 3. Desplegar con el token

```bash
./deploy.sh --tunnel-token "eyJhIjoi..."
```

O deja el token en un fichero y olvidate de la opcion:

```bash
echo "eyJhIjoi..." > cloudflared.token   # ignorado por git
./deploy.sh
```

El token queda guardado en el `.env` (permisos `600`), asi que los siguientes
despliegues ya no necesitan que se lo pases.

```bash
docker compose --profile tunnel logs -f cloudflared   # ver el estado del tunel
docker compose --profile tunnel down                  # parar app y tunel
```

> Quien tenga el token puede levantar el tunel: no lo subas al repositorio ni lo
> pegues en un chat. Si se te escapa, usa **Refresh token** en el panel y vuelve a
> ejecutar `./deploy.sh --tunnel-token <nuevo>`.

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
npm run check        # typecheck + tests + validacion del docker-compose.yml
npm test             # solo los tests (Vitest: reglas de visibilidad, permisos, REST y WebSocket)
npm run check:compose  # que el compose interpole bien en todos los perfiles
```

`check:compose` existe porque Compose interpola el fichero **entero** antes de
filtrar por perfiles: una variable obligatoria en un servicio apagado, como el
token del tunel, rompe hasta un `docker compose up app`. Si no hay `docker` en
la maquina, la comprobacion se salta sin fallar.

## Como se usa

1. En el menu principal, **Crear una partida**: nombre de la mesa y contrasena.
2. La app devuelve los tres codigos (`DM-…`, `PJ-…`, `VY-…`). Repartelos.
   El DM puede volver a consultarlos en la pestana **Codigos**.
3. Cada persona entra desde **Unirse a una partida** con su codigo y su nombre.
4. Todo el mundo empieza en el chat **General**. Los jugadores pueden abrir chats
   privados o grupos desde la barra lateral; el DM ve esas conversaciones marcadas
   con 👁 y puede intervenir en ellas.

Tambien vale el atajo: **🔗 Compartir**, junto a tu nombre en la cabecera de la
partida, genera enlaces de invitacion del tipo `https://tu-dominio/?code=PJ-4K7QZP`,
que abren la app con el codigo ya escrito. Se envian con la hoja de compartir del
movil o, si no la hay, se copian al portapapeles. El DM reparte los tres roles; un
jugador solo puede invitar a mas jugadores y un voyerista no invita a nadie.

Si sales de la partida puedes volver a entrar con **tu mismo nombre** mientras no
haya nadie conectado con el: recuperas tu sitio y tus chats privados. Con alguien
conectado con ese nombre, la app lo rechaza.

## Version y modo administrador

La version (`1.1.0`) vive en el `package.json` de la raiz, es la unica fuente
para el cliente y el servidor, y se ve en el pie de todas las pantallas. Cada
cambio la sube y deja su linea en [CHANGELOG.md](CHANGELOG.md); el servidor la
publica ademas en `GET /api/health`.

Pulsando la version del pie se abre el **modo administrador**. Pide la
contrasena de `ADMIN_PASSWORD` (si no hay ninguna, vale la de crear partidas) y
enseña todas las partidas del servidor: nombre, fecha, numero de chats y de
mensajes, ultima actividad, codigos de acceso y quien esta dentro, con un punto
verde para quien esta conectado. Cada partida se puede **borrar**: se pierden
sus chats, sus codigos dejan de valer y a quien siga dentro se le cierra la
sesion.

La sesion del panel dura una hora, vive solo en memoria del servidor (un
reinicio la tira) y el acceso se corta durante cinco minutos tras cinco intentos
fallidos seguidos.

## Variables de entorno

| Variable | Por defecto | Para que sirve |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor |
| `HOST` | `0.0.0.0` | Interfaz de escucha |
| `ROLEPLAY_PASSWORD` | `MeGustaElRol` | Contrasena para crear partidas |
| `ADMIN_PASSWORD` | la de crear partidas | Contrasena del modo administrador (ver y borrar partidas) |
| `DATA_DIR` | `./data` | Carpeta donde se guardan las partidas |
| `CLIENT_DIR` | `client/dist` | SPA compilado que sirve el backend |
| `PERSIST` | — | `0` desactiva el guardado en disco (lo usan los tests) |
| `CLOUDFLARE_TUNNEL_TOKEN` | — | Token del tunel; si esta, `deploy.sh` arranca `cloudflared` |

## Estructura

```
.github/   workflow de despliegue en el runner self-hosted
deploy.sh  prepara el .env (puerto libre + token) y levanta los contenedores
scripts/   comprobaciones sueltas (validacion del docker-compose.yml)
shared/    tipos y constantes compartidos (protocolo REST y WebSocket)
server/    Express + ws, estado de las partidas y reglas de visibilidad
  src/store.ts    quien ve que, quien puede escribir, borrar o expulsar
  src/server.ts   rutas REST, WebSocket y reparto de eventos
  src/admin.ts    sesiones del panel de administracion y freno de intentos
  src/version.ts  version leida del package.json de la raiz
  test/           tests de Vitest
client/    React + Vite
  src/lib/useGame.ts   conexion WebSocket, reconexion y estado del chat
  src/lib/useViewportHeight.ts  alto real de la ventana (teclado del movil)
  src/lib/share.ts     enlaces de invitacion (compartir y leer el codigo)
  src/version.ts       version incrustada por Vite al compilar
  src/components/      menu, codigos, barra lateral, conversacion, modales
```

## Decisiones y limitaciones

- El voyerista lee **todos** los chats, incluidos los privados: es lo propio del
  rol de espectador. No escribe, no crea chats y no se le puede meter en uno.
- Los jugadores tambien pueden abrir un chat privado con el DM, ademas de entre ellos.
- Una partida admite un solo DM activo y los nombres no se repiten entre quienes
  estan conectados. Un nombre libre se puede reclamar con el codigo de su rol, asi
  que quien tenga el codigo puede ocupar el sitio de alguien desconectado: el codigo
  sigue siendo la unica credencial de la app.
- El modo administrador reparte las llaves de todo el servidor. Conviene darle una
  `ADMIN_PASSWORD` propia, distinta de la de crear partidas.
- Al expulsar a alguien se le invalida la sesion y se le saca de sus chats, pero el
  codigo de acceso sigue siendo valido: quien lo tenga puede volver a entrar con otro
  nombre. Rotar los codigos queda pendiente.
- Las partidas se guardan como JSON en `DATA_DIR`. Es suficiente para una mesa; no
  esta pensado para muchas partidas simultaneas ni para varios procesos a la vez.
- Se conservan los ultimos 1000 mensajes por chat.
