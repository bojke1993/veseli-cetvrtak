# 8. Ekrani i UI opis

Opis sadržaja i ponašanja, bez vizuelnog dizajna. Primarni uređaj je **telefon** (NFR-07).

## 8.1 Navigacija
- Telefon: donja traka sa 5 stavki — **Početna**, **Kolo** (aktuelno), **Istorija**, **Statistika**, **Još** (Blejm lista, Audit log, Podešavanja, Odjava).
- Desktop: ista struktura kao bočni meni.
- Admin vidi bedž sa brojem otvorenih zadataka (EKR-13) na stavci "Još". Nema obaveštenja van aplikacije (P-20).
- **Gost** (neprijavljen, BR-35) vidi Početnu, Kolo, Istoriju i Statistiku u režimu samo za pregled; umesto akcija prikazuje se dugme "Prijavi se". Audit log i Podešavanja nisu dostupni.
- Statistički ekrani imaju izbor sezone (podrazumevano aktuelna, opcija "Sve sezone").
- Ikonice statusa svuda uz ime člana: ❄ (na hlađenju u aktuelnom/narednom kolu), 🔥 (aktivna vatrica), sa tekstualnim opisom za čitače ekrana.

## 8.2 Spisak ekrana

| ID | Ekran | FR |
|----|-------|----|
| EKR-01 | Prijava | FR-01 |
| EKR-02 | Početna (dashboard) | FR-05, FR-13, FR-17 |
| EKR-03 | Live praćenje kola | FR-13 |
| EKR-04 | Unos / otvoreno kolo | FR-05…FR-10 |
| EKR-05 | Zaključavanje (rezime) | FR-11 |
| EKR-06 | Istorija kola | FR-20 |
| EKR-07 | Detalj kola | FR-12, FR-15, FR-21 |
| EKR-08 | Ukupna statistika | FR-17 |
| EKR-09 | Statistika članova i profil člana | FR-18 |
| EKR-10 | Blejm rang lista | FR-19 |
| EKR-11 | Podešavanja (uključujući uvoz istorije) | FR-02, FR-03, FR-16, FR-25 |
| EKR-12 | Audit log | FR-22 |
| EKR-13 | Zadaci admina | FR-14, FR-15 |

---

### EKR-01 — Prijava
- Polja: korisničko ime i lozinka; dugme "Prijavi se"; poruka greške bez otkrivanja da li nalog postoji.
- Posle prijave → EKR-02. Ekran prijave nije obavezan za pregled (gost, BR-35); otvara se na zahtev.

### EKR-02 — Početna (dashboard)
Sadržaj zavisi od stanja aktuelnog kola:
- **Nema otvorenog kola:** kartica poslednjeg kola (broj, ishod k/n, status, dobitak); admin vidi dugme **"Novo kolo"** (onemogućeno uz objašnjenje ako prethodno kolo nije razrešeno).
- **Kolo otvoreno:** "Kolo #N — u pripremi", koliko tipova je uneto (npr. 3/4), vreme do početka prve utakmice, ko je na hlađenju; dugme "Otvori kolo" → EKR-04.
- **Kolo u toku:** kompaktan live prikaz 4 tipa (status boja + poeni / granica) i indikator tiketa → klik vodi na EKR-03.
- Ispod: mini statistika — bilans, procenat dobitnih kola, statusi članova (❄/🔥, trenutni niz), lider blejm liste.

### EKR-03 — Live praćenje kola
- Zaglavlje: Kolo #N, uplata, kvota, potencijalni dobitak, indikator tiketa ("Tiket živ — 3/4 u prolazu" / "Tiket pao").
- Kartica po tipu (redosled po vremenu početka utakmice):
  - član (ili "Ekipa umesto <ime> ❄"), igrač (slika, ime, klub), utakmica (rezultat, četvrtina, preostalo vreme ili "počinje u 20:30"),
  - **trenutni poeni** velikim brojem pored granice i smera (npr. "**12** / više 14,5"), "fali još 3",
  - minuti u igri, lične greške,
  - status iz tabele u FR-13 (boja + ikonica + tekst).
- Vreme poslednjeg osvežavanja; upozorenje "Podaci kasne" posle 2 min.
- Ponašanje: automatsko osvežavanje bez reload-a; kratka animacija pri promeni poena; ekran ne sme da "skače" pri osvežavanju.

### EKR-04 — Unos / otvoreno kolo
- Zaglavlje: Kolo #N (automatski), datum otvaranja (automatski), **dan kola** (izbor iz liste dana sa utakmicama, uz spisak utakmica tog dana), kolo Evrolige (automatski, informativno).
- **4 kartice tipova** (redosled članova fiksan):
  - lična kartica: ime člana + ❄/🔥; polje za pretragu igrača (autocomplete, FR-06) → nakon izbora prikazuje igrača, klub, utakmicu (sa mogućnošću promene), polje granica, prekidač Više/Manje, opciono kvota;
  - ako postoji predlog člana (FR-09): oznaka "Predlog — čeka potvrdu" sa dugmadima Prihvati / Izmeni;
  - kartica tipa ekipe (FR-08): lista predloga sa glasovima 👍, dugme "Dodaj predlog" (članovi koji nisu na hlađenju), admin bira "Izaberi ovaj predlog".
- **Tiket sekcija:** uplata, ukupna kvota, uplatilac (padajuća lista 4 člana, predlog po rotaciji), automatski potencijalni dobitak, proizvod pojedinačnih kvota i upozorenje o razlici.
- Dugme **"Zaključi glasanje"** (samo admin) — onemogućeno uz listu onoga što nedostaje.
- Upozorenje sa odbrojavanjem kad je do početka prve utakmice < 60 min.
- Član (ne-admin) vidi sve kartice samo za čitanje, osim svog predloga i predloga tipa ekipe.
- Automatsko čuvanje svake izmene (nema dugmeta "Sačuvaj"); indikator "Sačuvano".
- Admin: dugme "Obriši kolo" (FR-24) u meniju.

### EKR-05 — Zaključavanje (rezime)
- Modal: pregled sva 4 tipa, uplata, kvota, uplatilac, potencijalni dobitak.
- Tekst: "Posle zaključavanja izbori se ne mogu menjati. Ispravke su moguće samo uz razlog i biće zabeležene."
- Dugmad: "Potvrdi i zaključaj" / "Nazad".

### EKR-06 — Istorija kola
- Lista kartica (telefon) / tabela (desktop) sa sadržajem iz FR-20.
- Traka filtera (FR-20): otvara se kao panel; aktivni filteri kao "čipovi" sa ✕.
- Klik na kolo → EKR-07.
- Prazno stanje: "Nema kola za izabrane filtere" + dugme "Obriši filtere".

### EKR-07 — Detalj kola
- Sadržaj iz FR-21.
- Dok je kolo u toku: isti live prikaz kao EKR-03.
- Admin akcije (meni "⋯"): Otključaj kolo (samo ako nijedna utakmica nije počela), Ispravi polje, Razreši tip ručno, Koriguj stvarni dobitak. Svaka akcija otvara formu sa obaveznim poljem "Razlog" i pregledom posledica po statistiku pre potvrde (FR-12).
- Sekcija "Istorija izmena" (audit zapisi tog kola).

### EKR-08 — Ukupna statistika
- Kartice: ukupno uplaćeno, ukupno dobijeno, bilans, ROI, broj kola, % dobitnih.
- Grafikon raspodele ishoda (4/4…0/4 + "sa poništenim") sa brojem i procentom.
- Grafikon kretanja bilansa kroz kola (linija).
- Statistika "Ekipa".
- Filter perioda.

### EKR-09 — Statistika članova i profil člana
- Tabela: član, pogođeni, promašeni, %, blejm, broj uplata, uplaćeno, trenutni niz, najduži niz pogodaka/promašaja, hlađenja, vatrice; sortiranje po kolonama; na telefonu horizontalni skrol sa fiksiranom prvom kolonom.
- Klik na člana → profil: svi pokazatelji iz FR-18, niz poslednjih 10 tipova, % za Više/Manje, omiljeni igrači, lista njegovih tipova (link na kola).

### EKR-10 — Blejm rang lista
- Rang lista iz FR-19; prvo mesto istaknuto (šaljivo, npr. "Kralj blejma"); red "Ekipa" na dnu.
- Klik na člana prikazuje listu kola u kojima je bio jedini promašaj.

### EKR-11 — Podešavanja
- Svi: profil (prikazno ime, avatar), odjava.
- Admin: **Uvoz istorije** (FR-25) — otpremanje XLS/XLSX, preuzimanje praznog šablona, mapiranje kolona, uparivanje nepoznatih igrača, pregled grešaka i potvrda uvoza. Dostupno samo dok ne postoji nijedno kolo uneto kroz aplikaciju.
- Admin: članovi i prenos admin uloge (FR-02); "Sinhronizuj igrače sada", "Sinhronizuj raspored sada" sa vremenom poslednje uspešne sinhronizacije (FR-03, FR-04); ručno dodavanje igrača i utakmice (7.5); "Ponovo izračunaj statistiku" (FR-16); status integracije (poslednji SYNC_RUN-ovi, greške).

### EKR-12 — Audit log
- Hronološka lista zapisa (FR-22) sa filterima po kolu i akteru; samo pregled.

### EKR-13 — Zadaci admina
- Lista otvorenih zadataka: "Kolo #N nije zaključeno — prva utakmica počinje za X min", "Razreši ručno: <igrač> (utakmica bez konačnih podataka)", "Unesi stvarni dobitak za kolo #N", "Nekonzistentno hlađenje u kolu #N", "Sinhronizacija igrača ne radi od <datum>".
- Svaki zadatak vodi direktno na mesto rešavanja.
