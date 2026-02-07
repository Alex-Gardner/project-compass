# Docker Permissions Note

## Blocker Encountered
Attempting to start local infra with:

```bash
cd infra
docker compose up -d
```

failed with:

```txt
permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock
```

## Root Cause
Current user (`winlinux-dev`) is not in the `docker` group.

- User groups: `winlinux-dev`, `adm`, `dialout`, `cdrom`, `floppy`, `sudo`, `audio`, `dip`, `video`, `plugdev`, `netdev`
- Docker socket ownership: `root:docker` with mode `srw-rw----`

## One-Time Fix (run with sudo)

```bash
sudo usermod -aG docker winlinux-dev
newgrp docker
```

Alternative: log out and back in after `usermod`.

## Retry Steps
After group update, run:

```bash
cd /home/winlinux-dev/project-compass/infra
docker compose up -d
docker compose ps
```

Expected services:
- `postgres` on `5432`
- `redis` on `6379`

## Recheck (February 7, 2026)
- Retried `docker ps` and `docker compose up -d`.
- Result: still `permission denied` on `/var/run/docker.sock`.
- Likely cause: current shell/session has not picked up new group membership yet.

### Next fix to apply on your side
Run one of these and reopen the terminal session used by Codex:

```bash
# option 1
newgrp docker

# option 2
# fully log out/login and reopen terminal
```

## Latest Status (February 7, 2026)
- `docker ps` still fails in this Codex shell with docker socket permission denied.
- Despite that, API + worker were validated against reachable Postgres/Redis endpoints and completed a full upload -> process -> notify cycle.
- Conclusion: application progress can continue, but this shell still cannot directly manage Docker containers.
