#!/usr/bin/env bash
#
# deploy.sh - despliega fake-messenger con Docker Compose.
#
#   1. Busca un puerto libre en el host y lo deja escrito en .env.
#   2. Si encuentra un token de Cloudflare, arranca tambien el tunel.
#
# Uso: ./deploy.sh [opciones]   (./deploy.sh --help para verlas)

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

ENV_FILE=".env"
PORT_BASE_DEFAULT=3000
PORT_SCAN_LIMIT=100
HEALTH_TIMEOUT=90

# Sitios donde buscamos el token del tunel si no viene por opcion ni por entorno.
TOKEN_FILES=(
  "./cloudflared.token"
  "./.cloudflared-token"
  "${HOME}/.cloudflared/token"
  "/etc/cloudflared/token"
)

# ------------------------------------------------------------------- salida

if [[ -t 1 ]]; then
  C_STEP=$'\033[1;34m'; C_OK=$'\033[1;32m'; C_WARN=$'\033[1;33m'
  C_ERR=$'\033[1;31m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
else
  C_STEP=''; C_OK=''; C_WARN=''; C_ERR=''; C_DIM=''; C_OFF=''
fi

step() { printf '%s==>%s %s\n' "$C_STEP" "$C_OFF" "$*"; }
ok()   { printf '%s  ok%s %s\n' "$C_OK" "$C_OFF" "$*"; }
warn() { printf '%saviso%s %s\n' "$C_WARN" "$C_OFF" "$*" >&2; }
info() { printf '%s     %s%s\n' "$C_DIM" "$*" "$C_OFF"; }
die()  { printf '%serror%s %s\n' "$C_ERR" "$C_OFF" "$*" >&2; exit 1; }

usage() {
  cat <<'HELP'
Uso: ./deploy.sh [opciones]

Prepara el .env y levanta la app con Docker Compose.

Opciones:
  --port N              Usar este puerto sin buscar otro (falla si esta ocupado).
  --port-base N         Empezar la busqueda de puerto libre en N (por defecto 3000).
  --password TEXTO      Contrasena para crear partidas (por defecto la del .env
                        anterior, o MeGustaElRol).
  --tunnel-token TOKEN  Token del tunel de Cloudflare.
  --token-file RUTA     Fichero que contiene el token.
  --no-tunnel           No arrancar cloudflared aunque haya token.
  --no-build            No reconstruir las imagenes.
  --keep-running        No parar los contenedores antes de desplegar.
  --dry-run             Escribir el .env y enseñar lo que se haria, sin tocar Docker.
  -h, --help            Esta ayuda.

El token del tunel se busca, por orden, en: --tunnel-token, --token-file,
CLOUDFLARE_TUNNEL_TOKEN, TUNNEL_TOKEN, CLOUDFLARED_TOKEN, el .env anterior y
los ficheros ./cloudflared.token, ./.cloudflared-token, ~/.cloudflared/token
y /etc/cloudflared/token.
HELP
}

# ------------------------------------------------------------------ opciones

PORT_FIXED=""
PORT_BASE="${PORT_BASE:-$PORT_BASE_DEFAULT}"
PASSWORD_OPT=""
TOKEN_OPT=""
TOKEN_FILE_OPT=""
USE_TUNNEL=1
DO_BUILD=1
DO_DOWN=1
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)          PORT_FIXED="${2:?--port necesita un numero}"; shift 2 ;;
    --port-base)     PORT_BASE="${2:?--port-base necesita un numero}"; shift 2 ;;
    --password)      PASSWORD_OPT="${2:?--password necesita un valor}"; shift 2 ;;
    --tunnel-token)  TOKEN_OPT="${2:?--tunnel-token necesita un valor}"; shift 2 ;;
    --token-file)    TOKEN_FILE_OPT="${2:?--token-file necesita una ruta}"; shift 2 ;;
    --no-tunnel)     USE_TUNNEL=0; shift ;;
    --no-build)      DO_BUILD=0; shift ;;
    --keep-running)  DO_DOWN=0; shift ;;
    --dry-run)       DRY_RUN=1; shift ;;
    -h|--help)       usage; exit 0 ;;
    *)               usage >&2; die "Opcion desconocida: $1" ;;
  esac
done

for value in "$PORT_BASE" ${PORT_FIXED:+"$PORT_FIXED"}; do
  [[ $value =~ ^[0-9]+$ ]] && (( value >= 1 && value <= 65535 )) \
    || die "Puerto no valido: $value"
done

# ------------------------------------------------------------------ .env previo

# Lee una clave del .env anterior, quitando las comillas si las lleva.
env_value() {
  local key=$1 line value
  [[ -f $ENV_FILE ]] || return 0
  line=$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -n 1) || true
  [[ -n ${line:-} ]] || return 0
  value=${line#*=}
  if [[ $value == \"*\" ]]; then
    value=${value#\"}; value=${value%\"}
    value=${value//\\\"/\"}; value=${value//\\\\/\\}
  fi
  printf '%s' "$value"
}

# Escapa un valor para poder citarlo entre comillas dobles en el .env.
env_escape() {
  local value=$1
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  printf '%s' "$value"
}

PREVIOUS_PORT=$(env_value PORT)
PREVIOUS_PASSWORD=$(env_value ROLEPLAY_PASSWORD)
PREVIOUS_TOKEN=$(env_value CLOUDFLARE_TUNNEL_TOKEN)

# ------------------------------------------------------------------- puertos

# Un puerto esta ocupado si alguien escucha en el. Probamos con las
# herramientas que haya en la maquina y, si no hay ninguna, conectando.
port_busy() {
  local port=$1
  if command -v ss >/dev/null 2>&1; then
    [[ -n $(ss -ltnH "sport = :${port}" 2>/dev/null) ]] && return 0
    return 1
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 && return 0
    return 1
  fi
  if (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
    exec 3<&- 3>&-
    return 0
  fi
  return 1
}

find_free_port() {
  local candidate=$1 checked=0
  while (( checked < PORT_SCAN_LIMIT )); do
    port_busy "$candidate" || { printf '%s' "$candidate"; return 0; }
    candidate=$(( candidate + 1 ))
    checked=$(( checked + 1 ))
  done
  die "No hay ningun puerto libre entre $1 y $(( $1 + PORT_SCAN_LIMIT - 1 ))."
}

# ---------------------------------------------------------- token del tunel

read_token_file() {
  local file=$1
  [[ -r $file ]] || return 1
  # Nos quedamos con la primera linea con contenido, sin espacios sobrantes.
  local token
  token=$(grep -v '^[[:space:]]*#' "$file" | tr -d '\r' | awk 'NF {print; exit}') || true
  [[ -n ${token:-} ]] || return 1
  printf '%s' "$token"
}

# Deja el token en TUNNEL_TOKEN y su procedencia en TOKEN_SOURCE.
# Devuelve 1 si no hay token en ningun sitio.
find_tunnel_token() {
  TUNNEL_TOKEN=""
  TOKEN_SOURCE=""

  if [[ -n $TOKEN_OPT ]]; then
    TUNNEL_TOKEN=$TOKEN_OPT
    TOKEN_SOURCE="la opcion --tunnel-token"
    return 0
  fi

  if [[ -n $TOKEN_FILE_OPT ]]; then
    TUNNEL_TOKEN=$(read_token_file "$TOKEN_FILE_OPT") \
      || die "No pude leer ningun token en $TOKEN_FILE_OPT"
    TOKEN_SOURCE="el fichero $TOKEN_FILE_OPT"
    return 0
  fi

  local name
  for name in CLOUDFLARE_TUNNEL_TOKEN TUNNEL_TOKEN CLOUDFLARED_TOKEN; do
    if [[ -n ${!name:-} ]]; then
      TOKEN_SOURCE="la variable $name"
      TUNNEL_TOKEN=${!name}
      return 0
    fi
  done

  if [[ -n $PREVIOUS_TOKEN ]]; then
    TUNNEL_TOKEN=$PREVIOUS_TOKEN
    TOKEN_SOURCE="el $ENV_FILE anterior"
    return 0
  fi

  local file token
  for file in "${TOKEN_FILES[@]}"; do
    if token=$(read_token_file "$file"); then
      TUNNEL_TOKEN=$token
      TOKEN_SOURCE="el fichero $file"
      return 0
    fi
  done

  return 1
}

# --------------------------------------------------------------------- docker

require_docker() {
  command -v docker >/dev/null 2>&1 \
    || die "Docker no esta instalado. Instalalo desde https://docs.docker.com/get-docker/"
  docker compose version >/dev/null 2>&1 \
    || die "Hace falta Docker Compose v2 (el subcomando 'docker compose')."
  docker info >/dev/null 2>&1 \
    || die "El demonio de Docker no responde. Arrancalo y vuelve a intentarlo."
}

wait_until_healthy() {
  local url=$1 waited=0
  while (( waited < HEALTH_TIMEOUT )); do
    if command -v curl >/dev/null 2>&1; then
      curl -fsS --max-time 3 "$url" >/dev/null 2>&1 && return 0
    elif command -v wget >/dev/null 2>&1; then
      wget -qO- --timeout=3 "$url" >/dev/null 2>&1 && return 0
    else
      return 2   # sin herramientas para comprobarlo
    fi
    sleep 2
    waited=$(( waited + 2 ))
  done
  return 1
}

# ----------------------------------------------------------------- despliegue

step "Preparando el despliegue de fake-messenger"

(( DRY_RUN )) || require_docker

# Bajamos lo que hubiera antes: asi el puerto que ocupaba queda libre y lo
# podemos reutilizar en vez de ir saltando de numero en cada despliegue.
if (( DO_DOWN )) && (( ! DRY_RUN )); then
  step "Parando los contenedores anteriores"
  docker compose down --remove-orphans >/dev/null 2>&1 \
    || warn "No pude parar el despliegue anterior (quiza no habia ninguno)."
fi

step "Eligiendo el puerto del frontend"
if [[ -n $PORT_FIXED ]]; then
  port_busy "$PORT_FIXED" && die "El puerto $PORT_FIXED ya esta ocupado."
  PORT=$PORT_FIXED
  ok "Puerto $PORT (fijado con --port)."
elif [[ -n $PREVIOUS_PORT ]] && ! port_busy "$PREVIOUS_PORT"; then
  PORT=$PREVIOUS_PORT
  ok "Puerto $PORT (el del despliegue anterior, sigue libre)."
else
  [[ -n $PREVIOUS_PORT ]] && info "El puerto $PREVIOUS_PORT del .env anterior esta ocupado."
  PORT=$(find_free_port "$PORT_BASE")
  ok "Puerto $PORT (primero libre desde $PORT_BASE)."
fi

step "Buscando el token del tunel de Cloudflare"
find_tunnel_token || true

if [[ -n $TUNNEL_TOKEN ]]; then
  if [[ $TUNNEL_TOKEN =~ [[:space:]] || ${#TUNNEL_TOKEN} -lt 30 ]]; then
    warn "El token de $TOKEN_SOURCE no tiene la pinta habitual; lo uso igualmente."
  fi
  if (( USE_TUNNEL )); then
    ok "Token encontrado en $TOKEN_SOURCE: arranco tambien cloudflared."
  else
    ok "Token encontrado en $TOKEN_SOURCE, pero --no-tunnel lo deja apagado."
  fi
else
  ok "Sin token: despliego solo la app, sin tunel."
  info "Para publicarla fuera: ./deploy.sh --tunnel-token <TOKEN>"
  info "o guarda el token en ./cloudflared.token y vuelve a ejecutar el script."
fi

PASSWORD=${PASSWORD_OPT:-${PREVIOUS_PASSWORD:-MeGustaElRol}}
if [[ -z $PASSWORD_OPT && -z $PREVIOUS_PASSWORD ]]; then
  warn "Usando la contrasena por defecto (MeGustaElRol). Cambiala con --password."
fi

step "Escribiendo $ENV_FILE"
ENV_TMP=$(mktemp "${ENV_FILE}.XXXXXX")
trap 'rm -f "$ENV_TMP"' EXIT
{
  echo "# Generado por deploy.sh el $(date -u '+%Y-%m-%d %H:%M:%S UTC')."
  echo "# Editalo a mano si quieres, deploy.sh respeta estos valores."
  echo
  echo "# Puerto del host donde se publica la app (frontend + API + WebSocket)."
  echo "PORT=$PORT"
  echo
  echo "# Contrasena para crear partidas."
  echo "ROLEPLAY_PASSWORD=\"$(env_escape "$PASSWORD")\""
  if [[ -n $TUNNEL_TOKEN ]]; then
    echo
    echo "# Token del tunel de Cloudflare (servicio cloudflared)."
    echo "CLOUDFLARE_TUNNEL_TOKEN=\"$(env_escape "$TUNNEL_TOKEN")\""
  fi
} > "$ENV_TMP"
chmod 600 "$ENV_TMP"
mv "$ENV_TMP" "$ENV_FILE"
trap - EXIT
ok "$ENV_FILE listo (permisos 600, ignorado por git)."

COMPOSE_ARGS=()
SERVICES=(app)
if [[ -n $TUNNEL_TOKEN ]] && (( USE_TUNNEL )); then
  COMPOSE_ARGS+=(--profile tunnel)
  SERVICES+=(cloudflared)
fi

UP_ARGS=(up -d)
(( DO_BUILD )) && UP_ARGS+=(--build)

if (( DRY_RUN )); then
  step "Simulacion (--dry-run): no toco Docker"
  info "docker compose ${COMPOSE_ARGS[*]} ${UP_ARGS[*]} ${SERVICES[*]}"
  exit 0
fi

step "Levantando ${SERVICES[*]}"
docker compose "${COMPOSE_ARGS[@]}" "${UP_ARGS[@]}" "${SERVICES[@]}"

step "Esperando a que la app responda"
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"
case "$(wait_until_healthy "$HEALTH_URL" && echo 0 || echo $?)" in
  0) ok "La app responde en $HEALTH_URL" ;;
  2) warn "Sin curl ni wget: no he podido comprobar el estado." ;;
  *)
    docker compose "${COMPOSE_ARGS[@]}" ps
    die "La app no respondio en ${HEALTH_TIMEOUT}s. Mira: docker compose logs app"
    ;;
esac

echo
ok "Desplegado."
info "Local:      http://localhost:${PORT}"
info "Contrasena: $PASSWORD"
if [[ -n $TUNNEL_TOKEN ]] && (( USE_TUNNEL )); then
  info "Tunel:      cloudflared en marcha."
  info "            En el panel de Cloudflare, apunta el hostname a http://app:3000"
  info "            Registro: docker compose --profile tunnel logs -f cloudflared"
else
  info "Tunel:      apagado."
fi
info "Registro:   docker compose logs -f app"
info "Parar:      docker compose ${COMPOSE_ARGS[*]} down"
