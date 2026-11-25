#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Tickbook: single entry point for local development of the simulated
# exchange (paper trading only; no real money, no external market data).
#
#   ./run.sh            Prepare everything (deps, .env, database, migrations,
#                       demo seed) and launch API + web UI.
#   ./run.sh help       List all commands.
#
# Requirements: Node.js >= 22, npm, a running local PostgreSQL server.
# -----------------------------------------------------------------------------
set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly ENV_FILE="${ROOT_DIR}/.env"
readonly ENV_EXAMPLE="${ROOT_DIR}/.env.example"
readonly REQUIRED_NODE_MAJOR=22
readonly SECRET_PLACEHOLDER="replace-me-with-a-long-random-local-only-value"

cd "${ROOT_DIR}"

# ---------- output helpers ---------------------------------------------------
if [[ -t 1 ]]; then
  C_BLUE=$'\033[34m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_RESET=$'\033[0m'
else
  C_BLUE=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_RESET=''
fi
info()  { printf '%s==>%s %s\n' "${C_BLUE}" "${C_RESET}" "$*"; }
ok()    { printf '%s✔%s  %s\n' "${C_GREEN}" "${C_RESET}" "$*"; }
warn()  { printf '%s!%s  %s\n' "${C_YELLOW}" "${C_RESET}" "$*" >&2; }
die()   { printf '%s✖%s  %s\n' "${C_RED}" "${C_RESET}" "$*" >&2; exit 1; }
trap 'die "Command failed at line ${LINENO}: ${BASH_COMMAND}"' ERR

# ---------- prerequisite checks ----------------------------------------------
check_prereqs() {
  command -v node >/dev/null 2>&1 || die "Node.js ${REQUIRED_NODE_MAJOR}+ is required (https://nodejs.org)."
  command -v npm  >/dev/null 2>&1 || die "npm is required."
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  (( major >= REQUIRED_NODE_MAJOR )) || die "Node.js ${REQUIRED_NODE_MAJOR}+ required, found $(node -v)."
  command -v psql >/dev/null 2>&1 || die "psql not found. Install PostgreSQL client tools and start a local server."
  ok "Prerequisites: node $(node -v), npm $(npm -v), $(psql --version | head -n1)"
}

# ---------- environment ------------------------------------------------------
random_secret() {
  node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))'
}

ensure_env() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    [[ -f "${ENV_EXAMPLE}" ]] || die ".env.example is missing."
    cp "${ENV_EXAMPLE}" "${ENV_FILE}"
    chmod 600 "${ENV_FILE}"
    ok "Created .env from .env.example"
  fi
  if grep -q "${SECRET_PLACEHOLDER}" "${ENV_FILE}"; then
    local secret tmp
    secret="$(random_secret)"
    tmp="$(mktemp)"
    sed "s/${SECRET_PLACEHOLDER}/${secret}/" "${ENV_FILE}" > "${tmp}" && mv "${tmp}" "${ENV_FILE}"
    chmod 600 "${ENV_FILE}"
    ok "Created a random local SESSION_SECRET"
  fi
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
  : "${DATABASE_URL:?DATABASE_URL must be set in .env}"
}

# ---------- dependencies -----------------------------------------------------
ensure_deps() {
  local stamp="node_modules/.install-stamp"
  if [[ ! -f "${stamp}" || package-lock.json -nt "${stamp}" || package.json -nt "${stamp}" ]]; then
    info "Installing dependencies"
    if [[ -f package-lock.json ]]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
    touch "${stamp}"
  fi
  ok "Dependencies installed"
}

# ---------- database ---------------------------------------------------------
# Prints "<maintenance-url> <database-name>" for a postgres URL.
split_db_url() {
  node -e '
    const u = new URL(process.argv[1]);
    const name = decodeURIComponent(u.pathname.replace(/^\//, ""));
    if (!/^[A-Za-z0-9_]+$/.test(name)) { console.error("Unsafe database name: " + name); process.exit(1); }
    u.pathname = "/postgres";
    process.stdout.write(u.toString() + " " + name + "\n");
  ' "$1"
}

ensure_database() {
  local url="$1" admin_url name
  read -r admin_url name < <(split_db_url "${url}")
  psql "${admin_url}" -Atqc 'SELECT 1' >/dev/null 2>&1 \
    || die "Cannot reach PostgreSQL via ${admin_url%%\?*}. Start your local server (e.g. 'brew services start postgresql' or 'sudo service postgresql start')."
  if [[ "$(psql "${admin_url}" -Atqc "SELECT 1 FROM pg_database WHERE datname = '${name}'")" != "1" ]]; then
    psql "${admin_url}" -qc "CREATE DATABASE \"${name}\"" >/dev/null
    ok "Created database ${name}"
  fi
}

db_has_users() {
  [[ "$(psql "${DATABASE_URL}" -Atqc "SELECT EXISTS (SELECT 1 FROM users)" 2>/dev/null || echo f)" == "t" ]]
}

# ---------- commands ---------------------------------------------------------
cmd_setup() {
  check_prereqs
  ensure_env
  ensure_deps
  ensure_database "${DATABASE_URL}"
  info "Applying migrations"
  npm run --silent db:migrate
  if db_has_users; then
    ok "Database already seeded"
  else
    info "Seeding development demo data"
    npm run --silent db:seed
  fi
}

cmd_start() {
  cmd_setup
  info "Starting API on http://${API_HOST:-127.0.0.1}:${API_PORT:-4106} and web on ${APP_ORIGIN}"
  info "Demo credentials are listed in README.md (development only). Press Ctrl+C to stop."
  exec npm run dev
}

cmd_migrate() { ensure_env; ensure_deps; ensure_database "${DATABASE_URL}"; npm run --silent db:migrate; }
cmd_seed()    { ensure_env; ensure_deps; npm run --silent db:seed; }

cmd_reset() {
  ensure_env
  [[ "${NODE_ENV:-development}" != "production" ]] || die "Refusing to reset when NODE_ENV=production."
  if [[ "${1:-}" != "--yes" ]]; then
    read -r -p "This DROPS all data in ${DATABASE_URL%%\?*}. Continue? [y/N] " answer
    [[ "${answer}" =~ ^[Yy]$ ]] || die "Aborted."
  fi
  ensure_deps
  ensure_database "${DATABASE_URL}"
  npm run --silent db:reset
  ok "Database reset and reseeded"
}

test_database_url() {
  node -e 'const u = new URL(process.argv[1]); u.pathname = u.pathname.replace(/(_dev)?$/, "_test"); process.stdout.write(u.toString());' "${DATABASE_URL}"
}

cmd_test() {
  ensure_env
  ensure_deps
  local test_url
  test_url="${TEST_DATABASE_URL:-$(test_database_url)}"
  ensure_database "${test_url}"
  info "Running unit + integration tests (test database: ${test_url%%\?*})"
  TEST_DATABASE_URL="${test_url}" npm test
}

cmd_e2e() {
  cmd_setup
  npx playwright install chromium >/dev/null 2>&1 || warn "Could not install Playwright Chromium; using any locally available browser."
  npm run test:e2e
}

cmd_check() {
  ensure_env
  ensure_deps
  npm run lint
  npm run format:check
  npm run typecheck
  cmd_test
}

cmd_build() { ensure_env; ensure_deps; npm run build; }

cmd_help() {
  cat <<USAGE
Usage: ./run.sh [command]

  start|dev  (default) Install deps, prepare .env + database, migrate, seed, launch API + web
  setup      Everything 'start' does, without launching
  migrate    Apply pending database migrations
  seed       Load development demo data (idempotent)
  reset      Drop and recreate the schema, then migrate + seed (asks first; --yes to skip)
  test       Unit + integration tests against a disposable <db>_test database
  e2e        Playwright end-to-end tests (launches the app)
  check      Lint, format check, typecheck and tests (what CI runs)
  build      Production build of API and web
  help       Show this message
USAGE
}

main() {
  local command="${1:-start}"
  shift || true
  case "${command}" in
    start|dev) cmd_start ;;
    setup)   cmd_setup ;;
    migrate) cmd_migrate ;;
    seed)    cmd_seed ;;
    reset)   cmd_reset "$@" ;;
    test)    cmd_test ;;
    e2e)     cmd_e2e ;;
    check)   cmd_check ;;
    build)   cmd_build ;;
    help|-h|--help) cmd_help ;;
    *) cmd_help; die "Unknown command: ${command}" ;;
  esac
}

main "$@"
