# 9. Nefunkcionalni zahtevi

## 9.1 Osvežavanje uživo
- **NFR-01 — Kašnjenje live podataka.** Server preuzima live boxscore na svakih 30 s za svaku utakmicu u toku koja ima tip u aktivnom kolu. Promena u izvoru mora biti vidljiva korisniku za ≤ 60 s (95. percentil), ne računajući kašnjenje samog izvora.
- **NFR-02 — Push ka klijentu.** Izmene se šalju klijentima preko Server-Sent Events ili WebSocket-a; ako veza padne, klijent se automatski ponovo povezuje (backoff do 30 s), a u međuvremenu radi polling na 60 s.
- **NFR-03 — Pozadinski rad.** Kada tab nije aktivan, klijent smanjuje učestalost; po povratku odmah preuzima najnovije stanje.
- **NFR-04 — Opterećenje izvora.** Ukupno ≤ 20 zahteva/min (4 utakmice × 2 zahteva na 30 s = 16) ka Euroleague API-ju tokom live praćenja; backoff pri greškama (poglavlje 7.2).

## 9.2 Performanse
- **NFR-05 — Autocomplete.** Rezultati pretrage igrača za ≤ 300 ms (server, lokalna baza ~ 300–400 igrača; dovoljno je i pretraživanje na klijentu nad keširanim spiskom).
- **NFR-06 — Učitavanje ekrana.** Početna i live ekran: prvi prikaz sadržaja ≤ 2 s na 4G mreži; statistika i istorija (do 500 kola) ≤ 1 s odziv servera. Rekalkulacija cele istorije (FR-16) ≤ 5 s za 500 kola.

## 9.3 Prikaz na telefonu i upotrebljivost
- **NFR-07 — Mobile-first.** Svi ekrani potpuno funkcionalni na širini od 360 px; bez horizontalnog skrolovanja stranice (osim tabela u sopstvenom kontejneru). Dodirne površine ≥ 44×44 px.
- **NFR-08 — PWA.** Aplikacija ima web app manifest i ikonice, pa se može dodati na početni ekran telefona. Offline keš nije deo prve verzije.
- **NFR-09 — Brz unos.** Admin može da unese kompletno kolo (4 tipa + tiket) za ≤ 2 minuta na telefonu; numerička tastatura za granicu, uplatu i kvotu.
- **NFR-10 — Pristupačnost.** Statusi se ne prenose samo bojom (ikonica + tekst); kontrast prema WCAG 2.1 AA; ikonice ❄/🔥 imaju tekstualni opis.
- **NFR-11 — Jezik i format.** UI na srpskom (latinica); datumi `dd.MM.yyyy.`, vreme 24h, vremenska zona Europe/Belgrade; brojevi sa decimalnim zarezom (14,5) i tačkom za hiljade.

## 9.4 Bezbednost
- **NFR-12 — Autentifikacija.** Korisničko ime i lozinka, bez e-mail servisa (min. 10 karaktera, heširana bcrypt/argon2). Sesija u HttpOnly, Secure, SameSite=Lax kolačiću.
- **NFR-13 — Autorizacija.** Sva ovlašćenja (matrica u poglavlju 2) proveravaju se na serveru; UI skrivanje dugmadi nije dovoljno.
- **NFR-14 — Transport.** Isključivo HTTPS (HSTS).
- **NFR-15 — Zaštita od uobičajenih napada.** Validacija svih ulaza na serveru, zaštita od CSRF, XSS (escapovanje), SQL injection (parametrizovani upiti); ograničenje broja pokušaja prijave (FR-01 KP2).
- **NFR-16 — Integritet podataka.** Zaključano kolo se ne može izmeniti mimo FR-12 ni direktnim API pozivom; audit log je append-only (FR-22).
- **NFR-17 — Privatnost.** Javni pregled je uključen (BR-35), ali aplikacija nije indeksirana (robots noindex) i dostupna je samo onima koji imaju link. Gostima se ne prikazuju e-mail adrese ni audit log. Ne čuvaju se podaci o plaćanju.
- **NFR-24 — Uvoz fajla.** Otpremljeni XLS/XLSX (do 5 MB) obrađuje se na serveru bez izvršavanja makroa ili formula iz fajla; čitaju se samo vrednosti ćelija.

## 9.5 Pouzdanost i održavanje
- **NFR-18 — Dostupnost.** Ciljna dostupnost 99% tokom termina utakmica Evrolige (utorak–petak uveče); van toga dozvoljeno održavanje.
- **NFR-19 — Rezervne kopije.** Dnevni backup baze, čuvanje 30 dana; test vraćanja jednom u sezoni.
- **NFR-20 — Otpornost na izvor.** Pad ili promena spoljnog API-ja ne sme da obori aplikaciju (poglavlje 7.5); greške se loguju i prikazuju adminu.
- **NFR-21 — Testabilnost.** Poslovna pravila (BR-12…BR-30) implementirana kao čiste funkcije pokrivene jediničnim testovima, uključujući testne slučajeve iz FR-16 KP4; integracija testirana nad snimljenim JSON odgovorima API-ja.
- **NFR-22 — Logovanje i praćenje.** Strukturirani logovi worker-a; upozorenje adminu ako live poller ne uspe 5 puta zaredom.
- **NFR-23 — Troškovi (P-21).** Budžet je 0 EUR: rešenje mora da radi na besplatnom hostingu (besplatni planovi za web aplikaciju, bazu i pozadinske poslove) i besplatnom Euroleague API-ju. Arhitektura mora uzeti u obzir ograničenja besplatnih planova (npr. "uspavljivanje" servera — live poller mora biti pokrenut zakazanim poslom pre početka utakmica).
