#!/usr/bin/env bash
#
# Comprueba que docker-compose.yml se interpola bien en todas las combinaciones.
#
# Compose interpola el fichero ENTERO antes de filtrar por perfiles: una
# variable obligatoria en un servicio apagado rompe igualmente `up app`. Por eso
# probamos cada perfil sin ninguna variable puesta (--env-file /dev/null).

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "docker compose no esta disponible: me salto la comprobacion."
  exit 0
fi

failed=0

check() {
  local description=$1
  shift
  if output=$("$@" 2>&1); then
    echo "  ok  $description"
  else
    echo "  FALLA  $description"
    echo "$output" | sed 's/^/         /'
    failed=1
  fi
}

for profile in "" tunnel dev test; do
  args=(docker compose --env-file /dev/null)
  [[ -n $profile ]] && args+=(--profile "$profile")
  check "sin variables${profile:+, perfil $profile}" "${args[@]}" config --quiet
done

check "con el token puesto" env CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoiZGUtcHJ1ZWJhIn0 \
  docker compose --env-file /dev/null --profile tunnel config --quiet

exit "$failed"
