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

- Forma igrača (FR-29) nema poseban endpoint: koristi se isti `Boxscore` kao za live. Posle kraja utakmice čuva se red za **sve** igrače u `player_game_stats` i `games.boxscore_saved_at`; stare utakmice dopunjava `boxscoreBackfill` (≤ 3 zahteva po ticku, pauza 2 min posle live pollinga, staje na prvoj grešci). Posle prvog deploy-a backfill sezone traje ~1–2 h (≈ 10 utakmica po kolu Evrolige). Igrači iz boxscore-a koji nisu u tabeli `players` se preskaču.
- Red bez `player_game_stats` reda i dalje znači „nije izabran/nije pročitan” samo za igrače iz tipova; za formu odsustvo reda znači da igrač nije bio u zapisniku (povređen/van sastava) i takva utakmica se ne prikazuje.

## Ponuda kladionica (provera 01.11.2026; odluka: ne radi se, OP-12)

- Mozzart i Meridian nemaju javno dokumentovan API. Meridianov `online.meridianbet.com/betshop/api` vraća 401 bez tokena.
- SoccerBet i MaxBet (ista platforma) odgovaraju bez ključa: `GET /restapi/offer/sr/categories/sport/B/l?annex=0&desktopVersion=2.36.3.9&locale=sr` i `/sport/B/league/{id}/mob`; odgovor je gzip. API je nedokumentovan, a uslovi korišćenja nisu provereni.
- SoccerBet ima ligu Evroliga (10 utakmica), ali poeni igrača nisu nađeni: 4 dana pre utakmica nema lige „Evroliga Igrači”, a `/mob` za „NBA Igrači” (kategorija kaže 38) vraća prazno. MaxBet tog dana nije imao Evroligu u kategorijama.
- OddsPapi (250 zahteva mesečno besplatno) za Evroligu navodi samo timska tržišta, bez poena igrača i bez Mozzart/Meridian/MaxBet/SoccerBet.

## Backend

- `players.search_name` sadrži i naziv kluba (radi pretrage po klubu) — za poređenje **samo imena** koristiti `normalizeName(full_name)`, ne `search_name`.
- Fastify/Ajv sa type coercion pretvara `null` u `0` u `anyOf` granama: u šemama stavljati `{ type: 'null' }` **prvu**.
- Kysely 0.29: `Migrator` se uvozi iz `kysely/migration`, ne iz `kysely`.
- POST bez tela sa `Content-Type: application/json` Fastify odbija (`FST_ERR_CTP_EMPTY_JSON_BODY`); klijent uvek šalje `{}`.
- Izvedeno stanje (nizovi, ❄, 🔥, blejm) se nikad ne čuva — `computeDerived()` nad celom istorijom; posle direktnih izmena baze (skripte) restartovati aplikaciju ili pozvati `POST /api/admin/recalc`, jer je keš u memoriji.

- `player_game_stats` se puni samo za tipove koji postoje dok se utakmica prati. Tip prihvaćen posle kraja utakmice nema red, a izostanak reda se računa kao DNP; zato `runResolvePending` prvo dopunjava poene iz boxscore-a. U kolu #10 (27.10.2026.) Larkin (4 poena, 22:26) je pogrešno dobio DNP, a sve upućuje na ovaj uzrok (audit log nije proveren); ispravlja se ručnim razrešenjem.
- Više predloga istog člana u kolu može ostati `accepted`, a tip je samo jedan: kolo #10 je imalo Lučića i Llulla, a u tip je ušao Llull (ispravljeno 03.11.2026.). Status predloga zato ne dokazuje šta je odigrano. Od 16.11.2026. (P-23) prihvatanje predloga prethodni `accepted` za isto mesto prebacuje u `superseded`, ali starija kola i direktan unos admina (bez predloga) i dalje mogu odstupati. Korekcija igrača zadržava staru granicu, pa je granicu po potrebi ispraviti posebno.
- Preskakanje kola (suspenzija, BR-37) u bazi izgleda isto kao hlađenje: tip ekipe sa `cooldown_for_member_id`. Razlika se vidi samo iz `sanctions.served_round_id` — zato `loadDerivedInputs` učitava odslužene suspenzije, a svako mesto koje iz `picks` zaključuje „na hlađenju” mora da ih isključi (`RoundDerived.suspendedMemberIds`).
- `proposals.created_at` se upisuje iz `deps.now()` (ne DB default), jer se po njemu proverava da li je predlog dat pre početka utakmice (kasno prihvatanje, `late_accept`).

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

## Frontend

- Nizovi rezultata se prikazuju hronološki sa leva na desno (BR-40, P-25). `MemberStatsDto.last10` je do 23.11.2026. stizao od najnovijeg, a profil ga je crtao kao da je od najstarijeg — sada server šalje od najstarijeg.
- Proslava dobitnog tiketa (`Celebration`) se pamti u `localStorage` ključem `vc-celebrated-<roundId>`; kolo dobijeno pre više od 24 h ne pokreće konfete (pregled istorije).

- Chat (BR-41): „online” = član ima otvorenu vezu `/api/chat/stream` (otvara je `Layout` na svakoj strani). Ko je online drži se samo u memoriji servera (`chat/presence.ts`, 30 s tolerancije), pa posle restarta servera svi su offline dok se klijenti ponovo ne povežu (EventSource to radi sam za ~5 s). Telefon u pozadini posle nekog vremena prekida vezu → član postaje offline.

- Chat ekran na telefonu: `100dvh` na iOS-u ne prati tastaturu (Safari ignoriše `interactive-widget`), pa je cela strana mogla da odskroluje i chat „nestane”. Dok je chat otvoren, `html.chat-open` zaključava skrolovanje strane, a visina aplikacije je `--app-h` iz `visualViewport.height`. Zvuk poruke je Web Audio (bez fajla) i radi tek posle prvog dodira strane (autoplay pravila); telefon sa zaključanim ekranom ili aplikacijom u pozadini ga ne pušta.

- Web Push (P-28): VAPID ključevi se generišu pri prvom zahtevu i čuvaju u `app_settings` (`vapid_keys`) — ne brisati ih, inače sve pretplate prestaju da rade i članovi moraju ponovo da uključe obaveštenja. `web-push` 4.x je čist ESM sa imenovanim izvozima (`import { sendNotification } from 'web-push'`), tipovi su iz `@types/web-push` 3.x. „Gleda aplikaciju” = otkucaj `POST /chat/visibility` u poslednjih 40 s (samo u memoriji). iOS dozvoljava push samo za aplikaciju dodatu na početni ekran, a Safari može ukinuti pretplatu ako push ne prikaže obaveštenje — zato service worker **uvek** prikazuje obaveštenje, a filtriranje je na serveru. Ikonica obaveštenja je SVG; Android je možda neće prikazati (nema PNG ikonica).

- `@fastify/static` je registrovan sa `wildcard: false` — lista fajlova se pravi pri startu servera. Posle `npm run build -w web` na živom serveru novi (heširani) asset-i padaju na SPA fallback i vraćaju `index.html` → prazna stranica. Posle build-a restartovati server.
- Tema: `html[data-theme="light"|"dark"]` (ThemeToggle, `localStorage` ključ `vc-theme`); bez atributa važi `prefers-color-scheme`. Tamna paleta je u `app.css` dvaput (media upit + `[data-theme='dark']`) — menjati oba bloka. Tema se primenjuje pre iscrtavanja iz `web/public/theme.js` (CSP zabranjuje inline skripte).
- Snimci ekrana bez Chrome ekstenzije: headless Chrome sa `--remote-debugging-port` + CDP preko Node `WebSocket`-a (`Emulation.setDeviceMetricsOverride`, `Page.captureScreenshot`); `--screenshot` sa `--virtual-time-budget` visi zbog SSE veze.

- Bez SSH pristupa produkciji jednokratne ispravke podataka idu kroz migraciju sa strogim uslovom (npr. `006_round_note_notice`: kolo #18, dan, uplatilac) — na test i lokalnoj bazi uslov nije ispunjen, pa je migracija tamo samo šema. Neuplaćen tiket (BR-42) se iz bilansa izbacuje u `loadRounds` (stake/won = 0), ne brisanjem uplate iz kola.
