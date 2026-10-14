# Dokumentacija — Veseli četvrtak

**Dokument:** Specifikacija funkcionalnih zahteva (FRS)
**Verzija:** 1.1
**Datum:** 14.10.2026.
**Status:** Pravila potvrđena intervjuom sa timom; otvoren samo format XLS uvoza (OP-03)

## Istorija izmena
| Verzija | Datum | Izmena |
|---------|-------|--------|
| 1.0 | 14.10.2026. | Prvi nacrt specifikacije |
| 1.1 | 14.10.2026. | Ugrađene odluke sa intervjua: kolo = jedno veče, samo granice x,5, reset po sezoni, javni pregled, uvoz iz XLS (FR-25), bez obaveštenja (FR-23 povučen), budžet 0 EUR |

## Sadržaj

| # | Poglavlje | Fajl |
|---|-----------|------|
| 1 | Uvod i cilj sistema | [01-uvod.md](specifikacija/01-uvod.md) |
| 2 | Uloge korisnika | [02-uloge.md](specifikacija/02-uloge.md) |
| 3 | Pojmovnik | [03-pojmovnik.md](specifikacija/03-pojmovnik.md) |
| 4 | Funkcionalni zahtevi (FR-01…FR-25) | [04-funkcionalni-zahtevi.md](specifikacija/04-funkcionalni-zahtevi.md) |
| 5 | Poslovna pravila (BR-01…BR-35) | [05-poslovna-pravila.md](specifikacija/05-poslovna-pravila.md) |
| 6 | Model podataka | [06-model-podataka.md](specifikacija/06-model-podataka.md) |
| 7 | Integracije sa spoljnim API-jem | [07-integracije.md](specifikacija/07-integracije.md) |
| 8 | Ekrani i UI opis | [08-ekrani.md](specifikacija/08-ekrani.md) |
| 9 | Nefunkcionalni zahtevi | [09-nefunkcionalni-zahtevi.md](specifikacija/09-nefunkcionalni-zahtevi.md) |
| 10 | Odluke, pretpostavke i otvorena pitanja | [10-pretpostavke.md](specifikacija/10-pretpostavke.md) |

## Preporučeni redosled čitanja
1. Pojmovnik (3) — da bi termini bili jasni.
2. Poslovna pravila (5) i Odluke (10) — ovo je "pravilnik igre"; odluke P-01…P-21 potvrđene su na intervjuu 14.10.2026.
3. Funkcionalni zahtevi (4) i Ekrani (8).
4. Model podataka (6), Integracije (7), NFR (9) — za razvoj.

## Oznake
- `FR-xx` funkcionalni zahtev · `BR-xx` poslovno pravilo · `NFR-xx` nefunkcionalni zahtev
- `P-xx` pretpostavka (predloženo pravilo koje čeka potvrdu) · `OP-xx` otvoreno pitanje · `EKR-xx` ekran
- Prioriteti: **M** (mora), **T** (treba), **M-B** (može, ako bude vremena)

## Ostali dokumenti

- [`requirements.md`](requirements.md) — zahtevi (REQ-01…REQ-38, EARS)
- [`design.md`](design.md) — arhitektura i tehničke odluke
- [`tasks.md`](tasks.md) — plan rada i status
- [`learnings.md`](learnings.md) — naučene lekcije (tabela istorije, Euroleague API, zamke)
- [`initial-data/`](initial-data/README.md) — uvezena istorija kola
