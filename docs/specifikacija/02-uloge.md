# 2. Uloge korisnika

> Model uloga je **pretpostavka P-11** (vidi poglavlje 10).

## 2.1 Pregled

| Uloga | Ko | Opis |
|-------|----|------|
| **Administrator** | jedan član tima (podrazumevano Ivanišević; može se preneti) | Otvara kola, unosi izbore, uplatu, kvotu, zaključava glasanje, vrši ispravke i ručna razrešenja. Ima i sva prava člana. |
| **Član** | ostala tri člana (svaki ima svoj nalog) | Pregled svega; predlaganje sopstvenog izbora za otvoreno kolo; učešće u izboru "tipa ekipe". |
| **Sistem** | automatski procesi | Sinhronizacija igrača i rasporeda, live osvežavanje poena, automatsko razrešenje tipova i tiketa, rekalkulacija statistike. |
| **Gost** | bilo ko sa linkom | Samo pregled bez prijave (BR-35, P-18): dashboard, live praćenje, statistika, istorija. Bez audit loga i bez ikakvih izmena. |

Ukupan broj korisničkih naloga je tačno 4 (jedan po članu). Novi nalozi se ne mogu kreirati kroz UI.

## 2.2 Matrica ovlašćenja

| Akcija | Administrator (Ivanišević) | Član | Gost* |
|--------|:---:|:---:|:---:|
| Pregled dashboard-a, live praćenja, statistike, istorije | ✔ | ✔ | ✔ |
| Predlog sopstvenog izbora za otvoreno kolo | ✔ | ✔ | ✘ |
| Glas/predlog za "tip ekipe" (kada je neko na hlađenju) | ✔ | ✔ (osim člana na hlađenju) | ✘ |
| Otvaranje novog kola | ✔ | ✘ | ✘ |
| Unos/izmena izbora za bilo kog člana | ✔ | ✘ | ✘ |
| Unos uplate, kvote, uplatioca | ✔ | ✘ | ✘ |
| Zaključavanje glasanja | ✔ | ✘ | ✘ |
| Otključavanje kola / ispravka posle zaključavanja | ✔ (uz razlog) | ✘ | ✘ |
| Ručno razrešenje tipa (DNP, ručni unos poena) | ✔ (uz razlog) | ✘ | ✘ |
| Ručna korekcija stvarnog dobitka | ✔ (uz razlog) | ✘ | ✘ |
| Brisanje kola | ✔ (samo nezaključeno) | ✘ | ✘ |
| Pregled audit loga | ✔ | ✔ | ✘ |
| Prenos uloge administratora | ✔ | ✘ | ✘ |

\* gost = neprijavljen posetilac (javni pregled je uključen, P-18). Uvoz istorijskih kola (FR-25) može samo administrator.

## 2.3 Napomene
- Transparentnost: svi članovi vide audit log, jer su ispravke posle zaključavanja osetljive ("ko je menjao tip").
- U svakom trenutku postoji tačno jedan administrator (BR-32).
