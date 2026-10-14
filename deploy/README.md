# Deploy — Oracle Cloud Always Free VM

Aplikacija se isporučuje kao **jedan Docker image** (Node API + React + MySQL). Ovo uputstvo podiže je na besplatnu, stalno uključenu virtuelnu mašinu sa trajnim diskom (odluka OQ-01/OQ-02).

## 1. Kreiranje VM-a (jednom)

1. Registracija na <https://www.oracle.com/cloud/free/> (traži karticu radi provere identiteta; Always Free resursi se ne naplaćuju). Izaberite *home region* blizu (npr. Frankfurt) — ne može se kasnije menjati.
2. **Compute → Instances → Create instance**
   - Image: **Ubuntu 24.04**
   - Shape: **Ampere (VM.Standard.A1.Flex)**, 1 OCPU, 6 GB RAM (u okviru Always Free). Alternativa: VM.Standard.E2.1.Micro (1 GB RAM) radi, ali je tesna za MySQL.
   - SSH: nalepite svoj javni ključ (`~/.ssh/id_ed25519.pub`; ako ga nemate: `ssh-keygen -t ed25519`).
   - Boot volume: podrazumevanih 50 GB je dovoljno.
3. **Networking → Virtual Cloud Network → Security List** dodajte *Ingress* pravila za TCP **80** i **443** sa `0.0.0.0/0`.
4. Zapišite javnu IP adresu instance.

## 2. Priprema VM-a (jednom)

```bash
ssh ubuntu@<IP>

# Docker
curl -fsSL https://get.docker.com | sudo sh

# Ubuntu firewall na Oracle image-u blokira 80/443 — otvorite ih
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# Caddy (HTTPS reverse proxy sa automatskim sertifikatom)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# Direktorijumi i tajne
sudo mkdir -p /opt/vc/backups
sudo cp /dev/null /opt/vc/vc.env && sudo chmod 600 /opt/vc/vc.env
sudoedit /opt/vc/vc.env   # sadržaj po uzoru na deploy/vc.env.example
```

**Domen (besplatno):** napravite ime na <https://www.duckdns.org> (npr. `veseli-cetvrtak.duckdns.org`) koje pokazuje na IP VM-a, upišite ga u `deploy/Caddyfile`, pa:

```bash
sudo cp Caddyfile /etc/caddy/Caddyfile   # posle prvog deploy-a je u /opt/vc/src/deploy/
sudo systemctl reload caddy
```

## 3. Deploy (svaki put)

Sa svog računara, iz korena repozitorijuma (Git Bash):

```bash
VC_HOST=ubuntu@<IP> ./deploy/deploy.sh
```

Skripta kopira izvorni kod, gradi image na VM-u (ARM ili x86, šta god VM jeste), restartuje kontejner `vc` i čeka health check.

- Podaci MySQL-a su u Docker volumenu `vc-mysql` — **ne brišu se** pri redeploy-u.
- Pri prvom pokretanju, ako `INITIAL_PASSWORD` nije postavljen, početne lozinke su u logu: `sudo docker logs vc | grep "Početna lozinka"`. Svaki član mora da je promeni pri prvoj prijavi. Korisnička imena: `ivanisevic`, `tozislav`, `lakicevic`, `simara`.

## 4. Rezervne kopije

- Aplikacija svakog dana posle 03:00 pravi `mysqldump` u `/opt/vc/backups` (čuva 30 dana).
- Kopija **van VM-a**: instalirajte `rclone`, podesite remote `offsite` (npr. Oracle Object Storage, Always Free 20 GB) i dodajte u `crontab -e`:
  ```
  30 3 * * * /opt/vc/src/deploy/backup-offsite.sh >> /opt/vc/backups/offsite.log 2>&1
  ```
- Vraćanje: `gunzip -c vc-YYYYMMDD.sql.gz | sudo docker exec -i vc sh -c 'mysql -uvc -p"$DB_PASSWORD" veseli_cetvrtak'`.

## 5. Održavanje

| Akcija | Komanda |
|--------|---------|
| Logovi | `sudo docker logs -f vc` |
| Restart | `sudo docker restart vc` |
| Status | `curl -s http://127.0.0.1:8080/api/health` |
| Ulazak u bazu | `sudo docker exec -it vc sh -c 'mysql -uvc -p"$DB_PASSWORD" veseli_cetvrtak'` |
