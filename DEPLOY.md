# Deploying Elycubator to Azure

One small Linux VM, Docker Compose, two containers: the Go app (SPA + API + device WebSocket) and Caddy for TLS. SQLite lives on the VM disk in a Docker volume. Suitable for a personal instance and for the first customers.

## Prerequisite: a pushed commit

CI builds the image on every push to `main` and publishes it to GHCR. Nothing can be deployed until the current hardening work is committed and pushed. Pin the deployed image by commit SHA, not `latest`.

    git add -A
    git commit -m "launch hardening: device ownership, rate limits, refresh rotation, deploy stack"
    git push origin main

CI publishes:

    ghcr.io/<owner>/elycubator:latest
    ghcr.io/<owner>/elycubator:<commit-sha>

If the GitHub package is private, log in on the VM with a personal access token that has `read:packages`. Or make the package public in the package settings.

## 1. Decisions before you create anything

| Question | Practical answer |
| --- | --- |
| Open signup or single account | `REGISTRATION_ENABLED=false` for a private instance, `true` if you are selling access. Registration is rate limited either way. |
| Domain | The free Azure DNS label `<label>.<region>.cloudapp.azure.com` works with Let's Encrypt and costs nothing. Your own domain is a CNAME away. |
| Region | Closest to you: `southeastasia`, `eastasia`, or `japaneast`. |
| Size | `Standard_B2ats_v2` (2 vCPU, 1 GiB) is comfortable. `Standard_B1s` is cheaper and fine at this load. |

Cost sketch at pay as you go rates in Malaysia West (October 2026): `Standard_B2ats_v2` is $0.0107/h, about **$7.81 per month**, `Standard_B1s` is $8.69, `Standard_B2als_v2` is $31.24. A 32 GiB Premium SSD (`P4`) is $5.28 per month, the Standard SSD (`E4`) is $2.40, and a Standard static IPv4 is $3.65.

- Frugal: `B2ats_v2` + `E4` + IP = **about $13.86 per month**, so the $100 credit lasts roughly 7 months. The VM has 1 GiB of RAM, so keep the 2 GiB swap file and the 512 MB app cap.
- Comfortable: `B2als_v2` + `P4` + IP = **about $40.17 per month**, roughly 2.5 months on the credit.
- The current deployment is the comfortable shape. To shrink it, deallocate the VM, change the size to `B2ats_v2`, then switch the OS disk to Standard SSD `E4` under Disks, Size and performance. The public IP and the Docker volume survive; the database is on the OS disk.

If the subscription includes the 750h B1s free tier, compute is effectively free and the credit covers disk and IP.

## No DNS label? Use sslip.io

When the public IP has no Azure DNS label, `172-197-161-174.sslip.io` resolves to that address and Let's Encrypt issues a real certificate for it. Set `SITE_ADDRESS` to that name. A later Azure label or your own domain is a one-line change plus `docker compose -f compose.prod.yml up -d caddy`.

## Bootstrapping without a registry image

CI only publishes after a push. To launch an uncommitted tree, build locally and ship the image:

    docker compose build app
    docker save inkubator-iot-app:latest | gzip -1 | ssh <user>@<host> 'sudo docker load'
    ssh <user>@<host> 'sudo docker tag inkubator-iot-app:latest ghcr.io/<owner>/elycubator:local'

Set `IMAGE_TAG=local` in `.env`, then `docker compose -f compose.prod.yml up -d`. `docker compose pull` will not update a `local` tag; repeat the save/load when the image changes. Once CI has a commit SHA tag, switch `IMAGE_TAG` to it and pull normally.

## 2. Create the VM

    az group create --name elycubator --location southeastasia

    az vm create \
      --resource-group elycubator \
      --name elycubator-vm \
      --image Ubuntu2404 \
      --size Standard_B2ats_v2 \
      --admin-username azureuser \
      --generate-ssh-keys \
      --public-ip-sku Standard \
      --public-ip-address-dns-name elycubator-REPLACE-ME \
      --nsg-rule NONE

    az vm open-port --resource-group elycubator --name elycubator-vm --port 80 --priority 1010
    az vm open-port --resource-group elycubator --name elycubator-vm --port 443 --priority 1020

`--nsg-rule NONE` still leaves SSH (22) open from the internet. Restrict it to your own address in the NSG before you walk away.

The public DNS name becomes:

    elycubator-REPLACE-ME.southeastasia.cloudapp.azure.com

Check it resolves:

    nslookup elycubator-REPLACE-ME.southeastasia.cloudapp.azure.com

Add 2 GiB of swap on a 1 GiB VM:

    sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
    sudo mkswap /swapfile && sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

## 3. Install Docker

    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker $USER
    newgrp docker

## 4. Put the deploy files on the VM

    sudo mkdir -p /opt/elycubator && sudo chown $USER /opt/elycubator
    git clone https://github.com/<owner>/inkubator-iot.git /opt/elycubator
    cd /opt/elycubator

Only `compose.prod.yml`, `Caddyfile`, `scripts/backup-db.sh` and `.env` are needed on the VM.

Create `/opt/elycubator/.env`:

    GHCR_OWNER=<github-owner>
    IMAGE_TAG=<commit-sha>
    SITE_ADDRESS=elycubator-REPLACE-ME.southeastasia.cloudapp.azure.com

    APP_ENV=production
    REGISTRATION_ENABLED=true
    TELEMETRY_RETENTION_DAYS=30

    JWT_SECRET=<openssl rand -hex 64>
    DEVICE_SECRET=<openssl rand -hex 64>

`APP_ENV=production` makes the process refuse to start if either secret is missing, left at the development default, or too short. That is deliberate.

Do not carry the development `.env` over. The device secret in it is only known to your bench.

## 5. Start it

    docker login ghcr.io
    docker compose -f compose.prod.yml pull
    docker compose -f compose.prod.yml up -d
    docker compose -f compose.prod.yml ps

First start creates `/data/elycubator.db` inside the `elycubator-data` volume and Caddy requests a certificate. It needs DNS resolving to this VM and ports 80 and 443 reachable, which is why the NSG rules come first.

Verify:

    curl -fsS https://elycubator-REPLACE-ME.southeastasia.cloudapp.azure.com/api/health
    curl -sI https://elycubator-REPLACE-ME.southeastasia.cloudapp.azure.com | grep -i strict-transport
    docker compose -f compose.prod.yml logs --tail=30 caddy
    docker compose -f compose.prod.yml logs --tail=30 app

Then open the site, create the first account, log in, open Devices, and claim the board with the PIN on its LCD.

## 6. Nightly backup

    chmod +x /opt/elycubator/scripts/backup-db.sh
    crontab -e

    # m h dom mon dow command
    17 2 * * * cd /opt/elycubator && ./scripts/backup-db.sh >> /var/log/elycubator-backup.log 2>&1

The script uses SQLite's `.backup` API inside the container, copies the result to `backups/`, and prunes files older than 30 days. For off-site copies, add an `azcopy copy` or `rclone` line for the new file.

Restore:

    cd /opt/elycubator
    docker compose -f compose.prod.yml stop app
    docker compose -f compose.prod.yml cp backups/elycubator-<stamp>.db app:/data/elycubator.db
    docker compose -f compose.prod.yml run --rm --user root --entrypoint chown app app:app /data/elycubator.db
    docker compose -f compose.prod.yml start app

That `chown` is not optional. A database copied into the volume as the host user makes the app open SQLite read-only while still answering `200` on some endpoints. It bit this project once already.

## 7. Updates and rollback

    cd /opt/elycubator
    sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=<new-sha>/' .env
    docker compose -f compose.prod.yml pull app
    docker compose -f compose.prod.yml up -d app

Rollback is the same with the previous SHA. The database volume is untouched by image changes.

## 8. Firmware is the remaining gap

The board still calls `http://` and `ws://` on hardcoded LAN addresses (`10.131.240.115`, `192.168.1.63`). Against a public server it needs:

1. The public hostname in the server list.
2. HTTPS and WSS URLs.
3. TLS trust: either SNTP plus the ISRG Root X1 certificate, or `setInsecure()` for a first cut, which encrypts but does not authenticate.

Until that firmware change and a reflash, the device only reaches the server on the same LAN.

## 9. Ops notes

- Never publish port 3000. Caddy is the only ingress; the app sits on the internal `expose`.
- Rate limiting keys on the last hop of `X-Forwarded-For`, which Caddy sets, so keep the app behind the proxy. If you expose it directly, all clients share the proxy's IP bucket.
- SQLite belongs on the VM's local disk. Do not put it on Azure Files (SMB), WAL and locking will bite.
- The container is capped at 512 MB and has a 1 GiB VM. Do not build images there; pull them.
- Health: `GET /api/health`. Compose and Caddy both use it.
- Retention: telemetry older than `TELEMETRY_RETENTION_DAYS` is deleted hourly, then the WAL is checkpointed.
- Sessions: 15 minute access tokens, 7 day rotating refresh cookie. A failed refresh logs the browser out instead of leaving a dead session.
