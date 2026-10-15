# Learnings

Stvari naučene tokom razvoja koje nisu očigledne iz koda. Dopunjavati kako projekat raste.

## Tabela istorije (Google Sheets → `docs/initial-data/`)

- **Ishod tipa je zapisan bojom ćelije**, ne tekstom: zelena `B6D7A8` = pogodak, crvena `EA9999` = promašaj, žuta `FFF2CC` = poništen (igrač nije igrao). Čitati sa `XLSX.readFile(..., { cellStyles: true })` → `cell.s.fgColor.rgb`.
- Zapis tipa: `Francisco 15.5- (18)` = igrač, granica, `−` manje / `+` više, (poeni). U 2025/26 samo `Hifi -` (bez granice i poena).
- Kolona `Prolaznost` ponekad je Excel datum (npr. `46115` = 3. april = "3/4"), jer je Sheets "3/4" protumačio kao datum. Ne oslanjati se na nju; ishod računati iz boja.
- `Dobitak` u 2026/27 je **potencijalni** dobitak (kvota = dobitak / uplata); u 2025/26 je **stvarni** dobitak.
- Nadimci uplatilaca: Simke = Simara, Laki = Lakićević, Ivan = Ivanišević, Toza = Tozislav.
- Imena igrača su često srpska transkripcija ("Kampaco", "Dinvidi", "Odzelej", "Huanco"), inicijali ("CMM", "K. Hayes", "Mck. Wright") ili samo ime ("Bruno", "Sterling", "Kodi"). Pouzdano uparivanje: kandidati = igrači iz zvaničnih boxscore-ova utakmica **tog dana** + fonetsko poređenje; gde postoje poeni, oni razrešavaju dvosmislenost. Igrač koji nije igrao (DNP ili van sastava) često **nije** u boxscore-u — tražiti ga u `people` listi sezone.
- Zbirne formule u tabeli 2025/26 ne obuhvataju poslednji red (37 od 38 kola).
- Hlađenje u 2025/26 nije postojalo — uvezena kola se ne proveravaju na "nekonzistentno hlađenje".

## Euroleague API

- `live.euroleague.net` vraća **HTTP 429** već posle ~150 zahteva u kratkom roku i blokada traje desetine minuta. Masovno preuzimanje raditi sporo (≥ 4 s između zahteva) i keširati odgovore; aplikacija ima budžet 20 zahteva/min.
- Nema paginacije: `v2/.../games` i `v2/.../people` vraćaju celu sezonu u jednom odgovoru.
- `Player_ID` u boxscore-u = `"P" + person.code` sa razmacima na kraju; `Minutes` je `"MM:SS"` ili `"DNP"`.
- `gameStatus` je uvek `"Confirmed"` — odlaganje/otkazivanje se ne vidi u feed-u.
- Imena iz feed-a su "PREZIME, IME" velikim slovima; pri title-case čuvati inicijale (`TJ`) i sufikse (`III`).

## Backend

- `players.search_name` sadrži i naziv kluba (radi pretrage po klubu) — za poređenje **samo imena** koristiti `normalizeName(full_name)`, ne `search_name`.
- Fastify/Ajv sa type coercion pretvara `null` u `0` u `anyOf` granama: u šemama stavljati `{ type: 'null' }` **prvu**.
- Kysely 0.29: `Migrator` se uvozi iz `kysely/migration`, ne iz `kysely`.
- POST bez tela sa `Content-Type: application/json` Fastify odbija (`FST_ERR_CTP_EMPTY_JSON_BODY`); klijent uvek šalje `{}`.
- Izvedeno stanje (nizovi, ❄, 🔥, blejm) se nikad ne čuva — `computeDerived()` nad celom istorijom; posle direktnih izmena baze (skripte) restartovati aplikaciju ili pozvati `POST /api/admin/recalc`, jer je keš u memoriji.

## Lokalno okruženje (Windows)

- Nema Docker-a ni MySQL-a; `scripts/local.sh` koristi MySQL binarne fajlove u `.localdb/mysql` (preuzeo ih je `mysql-memory-server` za testove).
- Gašenje pozadinskog bash procesa **ne** gasi `mysqld`/`node` — gasiti sa `mysqladmin --protocol=tcp -h127.0.0.1 -P3307 -uroot shutdown` i `Stop-Process`. Ctrl+C u terminalu radi ispravno (trap).
- Git Bash `curl -d` sa dijakritikom šalje pogrešno kodiran tekst (konzolna kodna strana) — za proveru UTF-8 koristiti Node `fetch`.
- npm workspaces: posle promene glavne verzije React-a obrisati `node_modules` i `package-lock.json`, inače ostaje stara kopija u korenu (dva React-a → pucaju hook-ovi).

## Deploy (Oracle VM)

- VM je **arm64** (Ampere A1, Oracle Linux 9, korisnik `opc`) — image se gradi na samom VM-u, ne u CI-ju.
- npm workspaces podižu (hoist) zavisnosti u korenski `node_modules`; `server/node_modules` možda ne postoji, pa ga Dockerfile pravi sa `mkdir -p` pre `COPY`.
- Odmah posle kreiranja VM-a `dnf` je neko vreme zaključan (automatsko ažuriranje) — instalacija paketa pada sa "can't create transaction lock".
- Oracle Linux ima `firewalld` (ne iptables kao Ubuntu image) i Caddy se instalira iz COPR-a `@caddy/caddy`.
- Procena troška u Oracle čarobnjaku prikazuje cenu boot volumena bez Always Free popusta — stvarni trošak je 0.
