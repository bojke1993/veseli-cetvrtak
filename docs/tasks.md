# Plan rada — Veseli četvrtak

**Izvor:** `docs/requirements.md`, `docs/design.md`
Oznake: ☐ nije urađeno · ☑ urađeno · ⏸ blokirano. Kolona **REQ** vezuje zadatak za zahteve.

## Faza 0 — Osnova (sekvencijalno, pre paralelnog rada)

| ID | Zadatak | REQ | Status |
|----|---------|-----|--------|
| T-01 | Monorepo (npm workspaces `server`, `web`), strict TypeScript, `.gitignore`, `.editorconfig` (ESLint/Prettier nisu uvedeni — provere radi `tsc --strict`) | — | ☑ |
| T-02 | `server/src/config.ts`, `db/kysely.ts`, `db/schema.ts` (tipovi tabela), migracija `001_initial` (sve tabele iz design §4) | REQ-38 | ☑ |
| T-03 | `db/seed.ts`: 4 člana (Ivanišević admin), korisnička imena, početne lozinke, sezona | REQ-01, REQ-03 | ☑ |
| T-04 | `server/src/api-types.ts` — DTO ugovori za sve rute iz design §6 | — | ☑ |
| T-05 | `app.ts` kostur: Fastify, kolačići, helmet, greške, `requireMember`/`requireAdmin`, `/api/health`, statički web | REQ-36 | ☑ |
| T-06 | Test infrastruktura: Vitest, `mysql-memory-server` helper (`test/helpers/db.ts`), fixtures Euroleague API-ja | REQ-37 | ☑ |

## Faza 1 — Paralelni tokovi (agenti)

### Tok A — Domen i izvedena statistika (`server/src/domain`, `services/derived.ts`, `services/stats.ts`)
| ID | Zadatak | REQ | Status |
|----|---------|-----|--------|
| T-10 | `isValidLine`, `normalizeName`, `seasonForDate`, formatiranje novca | REQ-07, REQ-08, REQ-22 | ☑ |
| T-11 | `resolvePick`, `liveStatus` (svi statusi + "fali još X") | REQ-13, REQ-14 | ☑ |
| T-12 | `ticketOutcome`, `computeActualWin` | REQ-15 | ☑ |
| T-13 | `computeDerived`: nizovi, hlađenje + reset, vatrica + brojač, blejm (član/Ekipa), reset po sezoni, nekonzistentno hlađenje | REQ-17…REQ-23 | ☑ |
| T-14 | Statistika: pregled + raspodela 4/4…0/4 + "sa poništenim", po članu, blejm lista, filter sezona/period | REQ-24…REQ-26 | ☑ |
| T-15 | Jedinični testovi za sve gore, uključujući scenarije iz REQ-23.6 | REQ-37 | ☑ |

### Tok B — Integracija i worker (`server/src/provider`, `server/src/worker`, `services/sync.ts`, `services/resolution.ts`, `live/`)
| ID | Zadatak | REQ | Status |
|----|---------|-----|--------|
| T-20 | `EuroleagueProvider` interfejs, `EuroleagueLiveProvider` (fetch, Zod, timeout, backoff), `FakeProvider` | REQ-13, REQ-33 | ☑ |
| T-21 | `syncPlayers`, `syncSchedule` (+ evidencija `sync_runs`, upozorenja) | REQ-04, REQ-05 | ☑ |
| T-22 | `livePoll` + SSE event bus + ruta `/api/live/stream` | REQ-13 | ☑ |
| T-23 | Razrešenje: `finalize`, `notPlayed`, `recheck`, `autoLock`, prelaz `in_progress` | REQ-11, REQ-14, REQ-15 | ☑ |
| T-24 | Scheduler (tick 30 s, zaštita od preklapanja, nastavak posle restarta) + `backup` posao | REQ-37, REQ-38 | ☑ |
| T-25 | Testovi nad fixture-ima i lažnim provajderom | REQ-37 | ☑ |

### Tok C — API rute i servisi (`server/src/routes`, `services/rounds.ts`, `auth.ts`, `audit.ts`, `import.ts`, `tasks.ts`)
| ID | Zadatak | REQ | Status |
|----|---------|-----|--------|
| T-30 | Auth: prijava, odjava, `me`, promena lozinke, reset lozinke, blokada posle 5 pokušaja | REQ-01, REQ-36 | ☑ |
| T-31 | Članovi: lista sa statusima, izmena, prenos admin uloge | REQ-03 | ☑ |
| T-32 | Igrači i utakmice: pretraga, dani sa utakmicama, ručni unos | REQ-04…REQ-07, REQ-33 | ☑ |
| T-33 | Kolo: otvaranje (slotovi + hlađenje), izmena, tipovi, zaključavanje, otključavanje, ispravke (dry-run posledica), ručno razrešenje, stvarni dobitak, brisanje | REQ-06, REQ-08, REQ-10…REQ-12, REQ-16, REQ-30 | ☑ |
| T-34 | Predlozi i glasanje (lični tip, tip ekipe) | REQ-09, REQ-19 | ☑ |
| T-35 | Istorija sa filterima + detalj kola, statistika rute, audit log | REQ-24…REQ-29 | ☑ |
| T-36 | Zadaci admina (izvedeni) | REQ-32 | ☑ |
| T-37 | Uvoz XLS/XLSX: šablon, pregled, mapiranje, uparivanje igrača, atomičan commit | REQ-31 | ☑ |
| T-38 | Integracioni testovi API-ja (prava MySQL instanca) | REQ-37 | ☑ |

### Tok D — Frontend (`web/`)
| ID | Zadatak | REQ | Status |
|----|---------|-----|--------|
| T-40 | Vite + React + Router + TanStack Query, API klijent, formatiranje (sr-Latn), layout sa navigacijom (telefon/desktop), manifest | REQ-34 | ☑ |
| T-41 | Prijava, promena lozinke, režim gosta | REQ-01, REQ-02 | ☑ |
| T-42 | Početna (stanja kola, mini statistika) | REQ-24 | ☑ |
| T-43 | Unos kola: dan kola, 4 kartice, autocomplete, granica/smer/kvota, tiket sekcija, predlozi, tip ekipe, zaključavanje | REQ-06…REQ-11, REQ-19 | ☑ |
| T-44 | Live prikaz (SSE, statusi, indikator tiketa, "Podaci kasne") | REQ-13 | ☑ |
| T-45 | Istorija + filteri u URL-u, detalj kola + admin akcije (ispravka, razrešenje, otključavanje) | REQ-12, REQ-16, REQ-27, REQ-28 | ☑ |
| T-46 | Statistika, članovi + profil, blejm lista | REQ-24…REQ-26 | ☑ |
| T-47 | Audit, zadaci admina, podešavanja (članovi, sinhronizacija, rekalkulacija, uvoz) | REQ-29, REQ-31, REQ-32 | ☑ |
| T-48 | Testovi komponenti (formatiranje, autocomplete, statusi) | REQ-37 | ☑ |

## Faza 2 — Integracija i isporuka

| ID | Zadatak | REQ | Status |
|----|---------|-----|--------|
| T-50 | Spajanje tokova, `index.ts` (migracije → seed → HTTP → scheduler), build web → server/public | REQ-38 | ☑ |
| T-51 | `Dockerfile`, `docker/entrypoint.sh`, `.dockerignore`, healthcheck | REQ-38 | ☑ |
| T-52 | `deploy/`: uputstvo za Oracle Cloud Always Free VM, `deploy.sh`, Caddyfile (HTTPS), cron za backup van VM-a | REQ-37, REQ-38 | ☑ |
| T-53 | Code review (`/code-review`) i ispravke — 10 nalaza: 9 ispravljeno, 1 delimično (ispravka igrača posle kraja utakmice u kolu iz aplikacije i dalje briše ishod; admin dobija zadatak za ručno razrešenje) + regresioni testovi | — | ☑ |
| T-54 | Kompletno pokretanje testova (server 108, web 40), typecheck, build | REQ-37 | ☑ |
| T-55 | Deploy na VM | REQ-38 | ⏸ čeka VM (naručilac još nema VM) |

## Faza 3 — Ponuda kladionica i izmena tipa do zaključavanja (P-23, 16.11.2026.)

Plan i odluke: `docs/plan-ponuda-kladionica.md`.

| ID | Zadatak | REQ | Status |
|----|---------|-----|--------|
| T-60 | Specifikacija: BR-28, BR-36, P-23, FR-08/09/11, FR-26, NFR-25, REQ-09/11/19/39, EKR-04, model, integracije | REQ-09, REQ-11, REQ-19, REQ-39 | ☑ |
| T-61 | Zatvaranje predloga i glasanja na početku prve utakmice tipova (`proposalsOpen`), odbrojavanje u EKR-04 | REQ-11.7, REQ-11.8, REQ-19.2 | ☑ |
| T-62 | „Promeni tip” posle prihvatanja: novi predlog, prikaz važećeg tipa i izmene na čekanju, jedan `accepted` po mestu | REQ-09.3, REQ-09.6 | ☑ |
| T-63 | Verifikacija izvora (Mozzart, Meridian, BalkanBet) na dan kola, sa VM-a; nalazi u learnings | REQ-39 | ☐ |
| T-64 | `OddsProvider` + migracija `005_odds` (bookmakers, odds_offers, odds_bookmaker_code) + `oddsPoll` + `GET /rounds/:id/odds` | REQ-39 | ☐ (čeka T-63) |
| T-65 | UI blok „Ponuda kladionica” + logotipi + izvor kvote u kartici i detalju kola | REQ-39 | ☐ (čeka T-64) |

## Faza 4 — Disciplinske mere (P-24, 18.11.2026.)

| ID | Zadatak | REQ | Status |
|----|---------|-----|--------|
| T-70 | Specifikacija: BR-37, P-24, FR-27, REQ-40, EKR-14, model (SANCTION), uloge, pojmovnik | REQ-40 | ☑ |
| T-71 | Migracija `003_sanctions`, servis (izricanje, eskalacija, poništavanje), `GET/POST /sanctions`, `POST /sanctions/:id/revoke` | REQ-40.1–40.3, REQ-40.6 | ☑ |
| T-72 | Primena preskakanja kola pri otvaranju kola; izvedeno stanje razlikuje suspenziju od hlađenja | REQ-40.4, REQ-40.5 | ☑ |
| T-73 | UI: ekran „Disciplina” (EKR-14), 🟨/🟥 uz ime člana, mere na profilu, 🟥 u kolu | REQ-40.7 | ☑ |
| T-74 | Testovi (jedinični + API) | REQ-37 | ☑ |
| T-75 | Deploy, unos prve mere (opomena Lakićeviću, kolo #15) i ispravka tipa u kolu #15 (Dobrić više 5,5 @ 1,90) | REQ-40 | ☐ |

## Faza 5 — Rekordi, bedževi, forma igrača, live šanse (P-25, 23.11.2026.)

| ID | Zadatak | REQ | Status |
|----|---------|-----|--------|
| T-80 | Specifikacija: BR-38…40, P-25, FR-28…30, NFR-26, REQ-41…43, EKR-03/04/08/09, model, integracije | REQ-41…43 | ☑ |
| T-81 | `domain/records.ts` (rekordi, bedževi, „za dlaku”), proširen DTO statistike, `last10` hronološki | REQ-41 | ☑ |
| T-82 | UI: „Kuća slavnih” na Statistici, bedževi i „Za dlaku” na profilu | REQ-41 | ☑ |
| T-83 | Migracija `004_boxscore`, čuvanje boxscore-a svih igrača, posao `boxscoreBackfill`, forma u pretrazi igrača | REQ-42 | ☑ |
| T-84 | UI: `PlayerForm` u pretrazi i kartici tipa | REQ-42 | ☑ |
| T-85 | `domain/chance.ts`, šanse u detalju kola, indikator i proslava (`Celebration`) | REQ-43 | ☑ |

## Faza 6 — Chat ekipe (P-26, 24.11.2026.)

| ID | Zadatak | REQ | Status |
|----|---------|-----|--------|
| T-86 | Specifikacija: BR-41, P-26, FR-31, NFR-27, REQ-44, EKR-15, model, uloge | REQ-44 | ☑ |
| T-87 | Migracija `005_chat`, servis i rute `/api/chat/*`, SSE `/api/chat/stream`, praćenje prisutnosti | REQ-44 | ☑ |
| T-88 | UI: ekran Chat, online tačke, broj nepročitanih u meniju | REQ-44 | ☑ |

## Faza 7 — Neuplaćen tiket i upozorenje (P-27, 25.11.2026.)

| ID | Zadatak | REQ | Status |
|----|---------|-----|--------|
| T-89 | Specifikacija: BR-42, P-27, FR-32, REQ-45, model, EKR-14 | REQ-45 | ☑ |
| T-90 | Migracija `006_round_note_notice` (uklj. ispravku kola #18 i upozorenje Tozislavu), `PUT /rounds/:id/note`, bilans bez neuplaćenih, eskalacija upozorenje → opomena | REQ-45 | ☑ |
| T-91 | UI: napomena i „tiket nije uplaćen” u detalju/istoriji, admin forma, ⚠️ upozorenje na Disciplini i uz ime | REQ-45 | ☑ |

