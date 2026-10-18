# Deploy — Oracle Cloud Always Free VM

Aplikacija se isporučuje kao **jedan Docker image** (Node API + React + MySQL). Ovo uputstvo podiže je na besplatnu, stalno uključenu virtuelnu mašinu sa trajnim diskom (odluka OQ-01/OQ-02).

Trenutni server: `opc@92.5.71.193` (Oracle Linux 9, arm64), domen **https://veseli-cetvrtak.duckdns.org**.

## 1. Kreiranje VM-a (jednom)

1. Registracija na <https://www.oracle.com/cloud/free/> (Free Tier nalog — **ne** prelaziti na Pay As You Go). Home region: Frankfurt.
2. **Compute → Instances → Create instance**
   - Shape: **Ampere VM.Standard.A1.Flex**, 2 OCPU / 12 GB (Always Free). Ako javi *Out of capacity*, probati drugi availability domain.
   - Image: **Oracle Linux 9** (aarch64). SSH korisnik je `opc`.
   - SSH: *Upload public key file* → `~/.ssh/id_ed25519.pub`.
   - Boot volume: podrazumevano. Procena troška u čarobnjaku (~1,85 €/mes. za disk) ne uračunava Always Free — stvarni trošak je 0.
3. Ako instanca nema javnu IP: *Networking → VNIC → IP administration → Edit → Ephemeral public IP*.
4. **VCN → Security List → Add Ingress Rules**: TCP **80** i **443** sa `0.0.0.0/0` (Stateless isključeno).
5. **Billing → Budgets**: budžet 1 EUR mesečno, alert na *Actual spend* ≥ 1 %.
6. **Domen (besplatno):** na <https://www.duckdns.org> ime koje pokazuje na IP VM-a; isto ime mora biti u `deploy/Caddyfile`.

## 2. Priprema VM-a (jednom)

```bash
ssh opc@<IP>

# Firewall
sudo firewall-cmd --permanent --add-service=http --add-service=https && sudo firewall-cmd --reload

# Docker (u prvim minutima posle kreiranja VM-a dnf može biti zaključan zbog automatskog ažuriranja)
sudo rpm --import https://download.docker.com/linux/rhel/gpg
sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
sudo dnf -y install --allowerasing docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker && sudo usermod -aG docker opc

# Caddy (HTTPS sa automatskim Let's Encrypt sertifikatom; Caddyfile kopira deploy.sh)
sudo dnf -y install "dnf-command(copr)" && sudo dnf -y copr enable @caddy/caddy && sudo dnf -y install caddy

# Direktorijumi i tajne (lozinka baze postoji samo na VM-u)
sudo mkdir -p /opt/vc/backups /opt/vc/src && sudo chown -R opc:opc /opt/vc
(umask 077; printf 'DB_PASSWORD=%s\nINITIAL_PASSWORD=\n' "$(openssl rand -hex 24)" > /opt/vc/vc.env)
```

Sadržaj `vc.env` je opisan u `deploy/vc.env.example`.

## 3. Deploy

**Automatski (CI/CD):** svaki push na `main` pokreće `.github/workflows/deploy.yml` — typecheck i testovi, pa `deploy/deploy.sh` preko SSH-a. Ručno pokretanje: GitHub → Actions → Deploy → *Run workflow*.

- Secret `VC_SSH_KEY` (GitHub → Settings → Secrets and variables → Actions) = privatni ključ `~/.ssh/vc_deploy`; njegov javni deo je u `~opc/.ssh/authorized_keys` na VM-u.
- Adresa i host ključ VM-a su u `env` delu workflow-a; ako se VM promeni, ažurirati ih (`ssh-keyscan -t ed25519 <IP>`).

**Ručno**, sa svog računara iz korena repozitorijuma (Git Bash):

```bash
VC_HOST=opc@<IP> bash deploy/deploy.sh
```

Skripta kopira izvorni kod, gradi image na VM-u (ARM ili x86, šta god VM jeste), restartuje kontejner `vc`, čeka health check i osvežava Caddy.

- Podaci MySQL-a su u Docker volumenu `vc-mysql` — **ne brišu se** pri redeploy-u.
- Pri prvom pokretanju, ako `INITIAL_PASSWORD` nije postavljen, početne lozinke su u logu: `sudo docker logs vc | grep "Početna lozinka"`. Svaki član mora da je promeni pri prvoj prijavi. Korisnička imena: `ivanisevic`, `tozislav`, `lakicevic`, `simara`. **Pročitati ih odmah** — svaki deploy pravi novi kontejner i stari log nestaje. Ako su izgubljene: admin resetuje lozinku člana u aplikaciji, a ako se ni admin ne može prijaviti, nova privremena lozinka se upisuje direktno u tabelu `members` (bcrypt hash, `must_change_password=1`).

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
