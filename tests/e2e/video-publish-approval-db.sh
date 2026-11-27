#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
database="$(docker run --detach --rm --network none --env POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine)"
trap 'docker stop "$database" >/dev/null' EXIT
for attempt in {1..20}; do
  if docker exec "$database" pg_isready -h 127.0.0.1 -U postgres >/dev/null; then
    break
  fi
  sleep 1
done

cat "$root/supabase/tests/video_publish_approvals_fixture.sql" \
    "$root/supabase/migrations/20261128120000_video_publish_approvals.sql" \
    "$root/supabase/tests/video_publish_approvals.sql" \
  | docker exec --interactive "$database" psql --host 127.0.0.1 --username postgres --set ON_ERROR_STOP=1
