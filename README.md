# Veseli četvrtak

Web aplikacija za praćenje zajedničkog tiketa četiri prijatelja na poene igrača Evrolige: kola, tipovi više/manje, live poeni, hlađenje ❄, vatrica 🔥, blejm i statistika.

- Specifikacija i zahtevi: [`docs/`](docs/README.md) — `requirements.md`, `design.md`, `tasks.md`
- Deploy: [`deploy/README.md`](deploy/README.md)

## Lokalni razvoj

Potrebno: Node.js 22+ i MySQL 8.4 (lokalno ili u Docker-u).

```bash
npm install
# backend (http://localhost:8080) — podesite DB_* promenljive (vidi server/src/config.ts)
DB_USER=root DB_PASSWORD=... INITIAL_PASSWORD=lozinka123456 ENABLE_WORKER=false npm run dev:server
# frontend (http://localhost:5173, proxy ka /api)
npm run dev:web
```

### Lokalno pokretanje bez Docker-a (Windows, Git Bash)

```bash
./scripts/local.sh     # MySQL (.localdb/, port 3307) + aplikacija na http://localhost:8080; Ctrl+C gasi oba
```

MySQL fajlovi su u `.localdb/mysql`, a podaci u `.localdb/data` i ostaju između pokretanja. Početne lozinke se ispisuju u logu samo pri prvom pokretanju.

## Testovi i provere

```bash
npm test            # server (Vitest + privremena MySQL instanca, preuzima se automatski) i web
npm run typecheck
npm run build
```

## Docker (jedan image)

```bash
docker build -t veseli-cetvrtak .
docker run -d --name vc -p 8080:8080 -e DB_PASSWORD=tajna \
  -v vc-mysql:/var/lib/mysql -v vc-backups:/backups veseli-cetvrtak
```
