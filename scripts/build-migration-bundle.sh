#!/usr/bin/env bash
# ===========================================================================
# CareLink-AI — build ONE ordered SQL bundle of every migration.
#
# The live Supabase project must run the migrations in order. This produces a
# single file you can paste into the Supabase SQL editor (or pipe to psql):
#
#   bash scripts/build-migration-bundle.sh
#   # -> supabase/DEPLOY_ALL.sql
#
# Ordering note: two files share the 0028 prefix. The numeric order below is the
# order the local replay harness (supabase/tests/run.sh) uses and is the order
# that works: 0028_ai_tools... THEN 0028_step17... (the step17 file redefines
# carelink_admin_stats as the superset).
#
# This script ONLY concatenates existing files — it never edits them.
# ===========================================================================
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIG_DIR="$ROOT/supabase/migrations"
OUT="$ROOT/supabase/DEPLOY_ALL.sql"

if [ ! -d "$MIG_DIR" ]; then
  echo "migrations dir not found: $MIG_DIR" >&2
  exit 1
fi

# Explicit order (glob order is lexicographic and works, but we pin it).
ORDER=(
  0001_initial_health_schema.sql
  0002_rls_policies.sql
  0003_security_hardening.sql
  0004_condition_specialty_master.sql
  0005_provider_ecosystem.sql
  0006_rbac_provider_membership.sql
  0007_reviews.sql
  0008_agent_recommendations.sql
  0009_ai_context_backend.sql
  0010_appointment_expansion.sql
  0011_medication_scheduling.sql
  0012_recovery_expansion.sql
  0013_health_timeline.sql
  0014_notifications.sql
  0015_sos_emergency.sql
  0016_blood_donation.sql
  0017_realtime.sql
  0018_audit_expansion.sql
  0019_agent_recommendation_verification.sql
  0020_review_verification_rls.sql
  0021_security_least_privilege_execute.sql
  0022_development_provider_seed.sql
  0023_provider_media_and_location_indexes.sql
  0024_data_provenance_and_booking_integrity.sql
  0025_account_suspension_login_activity_admin_permissions.sql
  0026_admin_rbac_layer.sql
  0027_step16_operations_and_quality.sql
  0028_ai_tools_search_reviews_infinite.sql
  0028_step17_carelink_command_center.sql
  0029_step18_owner_auth_hierarchy.sql
  0030_step19_owner_auth_hardening.sql
  0031_step21_machilipatnam_directory.sql
  0032_step21_review_eligibility.sql
  0033_step22_appointment_request_workflow.sql
  0034_corridor_directory_import.sql
  0035_step25_departments_affiliations_blood_centres.sql
  0036_step27_pharmacy_lab_directory.sql
  0037_step28_public_reviews.sql
)

{
  echo "-- ========================================================================="
  echo "-- CareLink-AI — FULL SCHEMA DEPLOY BUNDLE (generated)"
  echo "-- Source: supabase/migrations/*.sql concatenated in replay order."
  echo "-- Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "--"
  echo "-- HOW TO APPLY (Supabase dashboard): SQL Editor -> New query -> paste this"
  echo "-- file -> Run. Or: psql \"\$SUPABASE_DB_URL\" -f supabase/DEPLOY_ALL.sql"
  echo "-- ========================================================================="
  echo ""
} > "$OUT"

missing=0
for f in "${ORDER[@]}"; do
  if [ ! -f "$MIG_DIR/$f" ]; then
    echo "MISSING migration: $f" >&2
    missing=1
    continue
  fi
  {
    echo ""
    echo "-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>"
    echo "-- BEGIN $f"
    echo "-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>"
    echo ""
    cat "$MIG_DIR/$f"
    echo ""
    echo "-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"
    echo "-- END $f"
    echo ""
  } >> "$OUT"
done

if [ "$missing" -ne 0 ]; then
  echo "One or more migrations were missing — bundle is INCOMPLETE." >&2
  exit 1
fi

lines=$(wc -l < "$OUT")
echo "Wrote $OUT ($lines lines, ${#ORDER[@]} migrations)."
