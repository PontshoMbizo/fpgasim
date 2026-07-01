#!/bin/bash
# Redeploy nikaVSimulator from origin/main. Invoked by GitHub Actions over the
# restricted gha_deploy SSH key (see ~/.ssh/gha-deploy-dispatch.sh), or run by hand.
set -euo pipefail
cd ~/apps/nikaVSimulator

echo "== fetching origin/main =="
git fetch origin main
git reset --hard origin/main

echo "== building sandbox image (nika-sim) =="
podman build -t nika-sim -f Dockerfile.sim sim/

echo "== building + starting app =="
docker compose build
docker compose up -d

echo "== health check =="
ok=""
for i in 1 2 3 4 5 6 7 8; do
  if curl -sf http://127.0.0.1:3000/ >/dev/null; then
    ok=1
    break
  fi
  sleep 3
done

if [ -z "$ok" ]; then
  echo "nika deploy: FAILED health check" >&2
  docker compose logs --tail 40 app >&2
  exit 1
fi

echo "nika deploy: OK"
