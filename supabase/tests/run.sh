#!/usr/bin/env bash
# CareLink-AI — local migration replay + RLS/security test runner.
#
# Creates a CLEAN disposable database, applies the test-only Supabase-like
# scaffold, replays every migration in supabase/migrations IN ORDER with
# per-migration verification, then runs each test suite file in order.
#
# Any migration failure or failed assertion exits non-zero. Errors are never
# masked: psql runs with ON_ERROR_STOP and every assertion is recorded.
set -u

DB_NAME="${DB_NAME:-carelink_test}"
# Connect as a local superuser role that can read the workspace files
# (created once via: createuser -s "$USER"). Local-only disposable test DB.
PSQL="psql -X -v ON_ERROR_STOP=1 -qAt"
PSQL_VERBOSE="psql -X -v ON_ERROR_STOP=1 -q"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$ROOT/migrations"
TESTS_DIR="$ROOT/tests"

echo "== 1. Recreate clean test database: $DB_NAME =="
dropdb --if-exists "$DB_NAME" || exit 1
createdb "$DB_NAME" || exit 1

run_file() {
  local file="$1"
  local label="$2"
  if $PSQL_VERBOSE -d "$DB_NAME" -f "$file" > /tmp/carelink_test_step.log 2>&1; then
    echo "PASS  $label"
    return 0
  else
    echo "FAIL  $label"
    sed 's/^/      /' /tmp/carelink_test_step.log | head -30
    return 1
  fi
}

echo "== 2. Apply test harness scaffold =="
run_file "$TESTS_DIR/harness/0000_scaffold.sql" "harness/0000_scaffold.sql" || exit 1

echo "== 3. Replay migrations in order (each verified individually) =="
for f in "$MIGRATIONS_DIR"/*.sql; do
  run_file "$f" "migration $(basename "$f")" || exit 1
done

echo "== 4. Run test suites =="
TESTS_FAILED=0
for f in "$TESTS_DIR"/[0-9]*.sql; do
  suite="$(basename "$f" .sql)"
  if ! $PSQL_VERBOSE -d "$DB_NAME" \
      -c "select set_config('harness.suite', '$suite', false);" \
      -f "$f" > "/tmp/carelink_suite_${suite}.log" 2>&1; then
    echo "ERROR running suite $suite:"
    sed 's/^/      /' "/tmp/carelink_suite_${suite}.log" | head -30
    TESTS_FAILED=1
  fi
done

echo "== 5. Results =="
$PSQL -d "$DB_NAME" -c "
  select case when ok then 'PASS' else 'FAIL' end, suite, label, coalesce(detail,'')
  from harness.results order by id;" | sed 's/^/  /'

FAIL_COUNT=$($PSQL -d "$DB_NAME" -c "select count(*) from harness.results where not ok;")
PASS_COUNT=$($PSQL -d "$DB_NAME" -c "select count(*) from harness.results where ok;")
echo ""
echo "Assertions: $PASS_COUNT passed, $FAIL_COUNT failed"

if [ "$TESTS_FAILED" -ne 0 ] || [ "$FAIL_COUNT" != "0" ]; then
  echo "RESULT: FAIL"
  exit 1
fi
echo "RESULT: PASS"
