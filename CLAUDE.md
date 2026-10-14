# CLAUDE.md — Veseli četvrtak

## O projektu
Web aplikacija za praćenje statistike zajedničkog igranja tiketa grupe od tačno četiri prijatelja:
**Ivanišević, Tozislav, Lakićević, Simara**. U svakom kolu svaki član bira jednog igrača Evrolige i igra
"više" ili "manje" na granicu poena. Tiket je dobitan samo ako su sva četiri tipa pogođena.

Trenutna faza: **specifikacija** (nema koda). Stack još nije izabran.

## Ključna pravila (skraćeno — izvor istine je `docs/specifikacija/05-poslovna-pravila.md`)
- 4/4 pogođeno = dobitan tiket; sve ostalo = gubitan.
- **Hlađenje** (pahuljica ❄): 5 promašaja zaredom → član pauzira naredno kolo; ostala trojica biraju "tip ekipe" umesto njega.
- **Vatrica** (vatra 🔥): 3 pogotka zaredom → vatrica; gubi se na prvom sledećem promašaju.
- **Blejm**: član je jedini promašaj na tiketu 3/4.
- **Kolo = jedno veče** (bilo koji dan); svi tipovi su sa utakmica tog dana. Granice su samo x,5.
- Poništeni tipovi (DNP, utakmica odložena/otkazana sa dana kola) ne računaju se ni kao pogodak ni kao promašaj.
- Tip ekipe (umesto člana na hlađenju) pripisuje se "Ekipi", ne ulazi u lične nizove.
- Na početku nove sezone Evrolige nizovi, vatrice i zakazano hlađenje se resetuju.
- Admin je Ivanišević; ostali članovi imaju naloge (predlozi); gosti vide sve bez prijave (samo pregled). Nema obaveštenja van aplikacije.
- Istorija se uvozi iz XLS-a (Google Sheets) i tretira kao prava kola.
- Sve statistike (nizovi, pahuljice, vatrice, blejm) su **izvedene** iz istorije kola i moraju moći da se rekalkulišu od nule.

## Dokumentacija
- `docs/README.md` — indeks i redosled čitanja.
- `docs/specifikacija/01..10-*.md` — FRS po poglavljima (uvod, uloge, pojmovnik, FR, BR, model podataka, integracije, ekrani, NFR, pretpostavke).
- Promena pravila igre: prvo ažurirati `05-poslovna-pravila.md` i `10-pretpostavke.md`, pa tek onda FR/kod.
- Odluke tima sa intervjua (14.10.2026.) su u `10-pretpostavke.md` (P-01…P-21). Otvoreno: format XLS fajla sa istorijom (OP-03, OP-10, OP-11).
- Budžet je **0 EUR** — besplatan hosting i besplatni Euroleague API.

## Learnings
Pre rada pročitati `docs/learnings.md` (tumačenje tabele istorije, ograničenja Euroleague API-ja, zamke u backendu i lokalnom okruženju). Nova saznanja dopisivati tamo.

## Konvencije
- Dokumentacija i UI tekstovi na **srpskom, latinica**. Kod (identifikatori) na engleskom.
- ID oznake se nikad ne prenumerišu: `FR-xx` (funkcionalni zahtevi), `BR-xx` (poslovna pravila), `NFR-xx`, `P-xx` (pretpostavke), `OP-xx` (otvorena pitanja), `EKR-xx` (ekrani). Nove stavke idu na kraj; ukinute se označavaju "~~povučeno~~".
- Imena članova pisati tačno kako su navedena (sa dijakritikom).

## Stack (obavezan, odluka naručioca)
- Backend: Node.js · Frontend: React (servira ga backend) · Baza: **MySQL**.
- Sve u **jednom Docker image-u** (backend + build-ovan frontend + MySQL), pozadinski worker u istom kontejneru.
- Hosting: **besplatna VM** (npr. Oracle Cloud Always Free), MySQL podaci na trajnom volumenu, dnevni backup i van VM-a.
- Prijava: korisničko ime + lozinka (bez e-mail servisa). PWA: samo manifest.
- Zahtevi (REQ-xx, EARS): `docs/requirements.md`; arhitektura: `docs/design.md`; plan rada: `docs/tasks.md`.
Pristup Euroleague API-ju isključivo preko adapter sloja (`EuroleagueProvider`), nikad direktno iz browsera.
Detalji u `docs/specifikacija/07-integracije.md`.
