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
