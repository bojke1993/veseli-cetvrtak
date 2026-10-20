# Zahtevi — Veseli četvrtak

**Izvor:** `docs/specifikacija/` (FRS v1.1, odluke sa intervjua 14.10.2026.)
**Format:** korisničke priče + kriterijumi prihvatanja u EARS formatu
**Status:** odgovori na otvorena pitanja OQ-01…OQ-05 ugrađeni (14.10.2026.); otvoreni OQ-06 (format XLS) i OQ-07 (ostatak uputstva za design.md/tasks.md)

## Konvencije

**Uloge:** *administrator* (Ivanišević), *član* (Ivanišević, Tozislav, Lakićević, Simara), *gost* (neprijavljen posetilac), *sistem* (pozadinski procesi).

**EARS obrasci** korišćeni u kriterijumima:
| Obrazac | Oblik |
|---------|-------|
| Uvek važeći | Sistem ĆE … |
| Događaj | KADA <okidač>, ONDA sistem ĆE … |
| Stanje | DOK <stanje>, sistem ĆE … |
| Neželjeno ponašanje | AKO <uslov>, ONDA sistem ĆE … |
| Opcija | GDE <karakteristika postoji>, sistem ĆE … |

Kolona **Izvor** povezuje zahtev sa specifikacijom (FR = funkcionalni zahtev, BR = poslovno pravilo, NFR = nefunkcionalni zahtev, P = odluka tima).

## Pregled

| ID | Naziv | Izvor |
|----|-------|-------|
| REQ-01 | Prijava člana | FR-01, NFR-12 |
| REQ-02 | Javni pregled za gosta | BR-35, P-18 |
| REQ-03 | Tim od četiri člana i uloga administratora | BR-01, BR-32, FR-02 |
| REQ-04 | Sinhronizacija baze igrača | FR-03 |
| REQ-05 | Sinhronizacija rasporeda utakmica | FR-04 |
| REQ-06 | Otvaranje novog kola | FR-05, BR-03…BR-05, BR-07 |
| REQ-07 | Izbor igrača pretragom | FR-06, BR-06 |
| REQ-08 | Unos tipa (granica, više/manje) | FR-07, BR-08, BR-09 |
| REQ-09 | Predlog sopstvenog tipa | FR-09 |
| REQ-10 | Uplata, kvota, uplatilac i potencijalni dobitak | FR-10, BR-10, BR-11 |
| REQ-11 | Zaključavanje glasanja | FR-11, BR-28 |
| REQ-12 | Ispravka posle zaključavanja | FR-12, BR-29 |
| REQ-13 | Praćenje poena uživo | FR-13, BR-16, NFR-01…04 |
| REQ-14 | Razrešenje tipa | FR-14, BR-12…BR-15 |
| REQ-15 | Razrešenje tiketa i dobitak | FR-14, BR-17…BR-19 |
| REQ-16 | Ručno razrešenje tipa | FR-15 |
| REQ-17 | Nizovi pogodaka i promašaja | BR-20 |
| REQ-18 | Hlađenje (pahuljica ❄) | BR-21, BR-22, P-06 |
| REQ-19 | Tip ekipe umesto člana na hlađenju | FR-08, BR-02, BR-26, BR-27, P-05, P-12 |
| REQ-20 | Vatrica 🔥 | BR-23, BR-24, P-07 |
| REQ-21 | Blejm | BR-25, P-10 |
| REQ-22 | Reset na početku sezone | BR-33, P-15 |
| REQ-23 | Rekalkulacija izvedene statistike | FR-16, BR-30 |
| REQ-24 | Ukupna statistika i raspodela ishoda | FR-17, BR-19 |
| REQ-25 | Statistika po članu | FR-18 |
| REQ-26 | Blejm rang lista | FR-19 |
| REQ-27 | Istorija kola sa filterima | FR-20 |
| REQ-28 | Detalj kola | FR-21 |
| REQ-29 | Audit log | FR-22 |
| REQ-30 | Brisanje nezaključenog kola | FR-24 |
| REQ-31 | Uvoz istorijskih kola iz XLS/XLSX | FR-25, BR-34, P-17 |
| REQ-32 | Zadaci i upozorenja za administratora | EKR-13, P-20 |
| REQ-33 | Rezervni režim bez spoljnog API-ja | pogl. 7.5, NFR-20 |
| REQ-34 | Prikaz na telefonu | NFR-07…NFR-11 |
| REQ-35 | Performanse | NFR-05, NFR-06 |
| REQ-36 | Bezbednost | NFR-12…NFR-17, NFR-24 |
| REQ-37 | Pouzdanost, rezervne kopije i testabilnost | NFR-18…NFR-22 |
| REQ-38 | Isporuka kao jedan Docker image na besplatnom hostingu | zahtev naručioca (stack), NFR-23 |

---

## 1. Pristup i uloge

### REQ-01 — Prijava člana
**Kao** član, **želim** da se prijavim svojim nalogom, **kako bih** mogao da predlažem tipove i (kao admin) unosim kola.
**Izvor:** FR-01, NFR-12

Kriterijumi prihvatanja:
1. Sistem ĆE imati tačno četiri korisnička naloga, po jedan za svakog člana, i NEĆE nuditi javnu registraciju.
2. KADA član unese ispravno korisničko ime i lozinku, ONDA sistem ĆE kreirati sesiju koja traje 30 dana na tom uređaju (OQ-03: bez e-mail servisa).
3. KADA administrator resetuje lozinku člana, ONDA sistem ĆE generisati privremenu lozinku, prikazati je samo administratoru, zahtevati njenu promenu pri sledećoj prijavi i upisati audit zapis.
4. KADA član promeni svoju lozinku, ONDA sistem ĆE zahtevati trenutnu lozinku i novu lozinku od najmanje 10 karaktera.
5. AKO se za isti nalog zabeleži 5 neuspešnih pokušaja prijave u 15 minuta, ONDA sistem ĆE blokirati prijavu na taj nalog na 15 minuta.
6. AKO prijava ne uspe, ONDA sistem ĆE prikazati poruku greške koja ne otkriva da li nalog postoji.
7. KADA član izabere "Odjavi se", ONDA sistem ĆE poništiti sesiju.

### REQ-02 — Javni pregled za gosta
**Kao** gost, **želim** da bez prijave vidim kola, live poene i statistiku, **kako bih** pratio igru ekipe.
**Izvor:** BR-35, P-18

1. DOK korisnik nije prijavljen, sistem ĆE prikazivati početnu stranu, live praćenje, istoriju, detalj kola, statistiku i blejm listu samo za pregled.
2. DOK korisnik nije prijavljen, sistem NEĆE prikazivati audit log, podešavanja ni e-mail adrese članova.
3. AKO neprijavljen korisnik pošalje zahtev za izmenu podataka, predlog ili glas, ONDA sistem ĆE odbiti zahtev (HTTP 401) bez ikakve izmene.
4. Sistem ĆE na svim stranama slati zaglavlje/oznaku `noindex` kako javne strane ne bi bile indeksirane.

### REQ-03 — Tim od četiri člana i uloga administratora
**Kao** administrator, **želim** da tim uvek ima tačno četiri fiksna člana i da mogu da prenesem admin ulogu, **kako bi** evidencija bila konzistentna.
**Izvor:** BR-01, BR-32, FR-02

1. Sistem ĆE sadržati tačno četiri člana — Ivanišević, Tozislav, Lakićević, Simara — i NEĆE omogućiti dodavanje ni brisanje članova.
2. Sistem ĆE u svakom trenutku imati tačno jednog administratora; početni administrator je Ivanišević.
3. KADA administrator potvrdi prenos uloge na drugog člana, ONDA sistem ĆE u jednoj transakciji dodeliti ulogu novom i oduzeti je prethodnom administratoru i upisati zapis u audit log.
4. KADA administrator izmeni prikazno ime ili avatar člana, ONDA sistem ĆE prikazati izmenu svuda, a fiksno ime člana ostaje nepromenjeno.
5. AKO korisnik bez admin uloge pozove akciju rezervisanu za administratora, ONDA sistem ĆE odbiti zahtev (HTTP 403).

---

## 2. Podaci Evrolige

### REQ-04 — Sinhronizacija baze igrača
**Kao** administrator, **želim** ažurnu lokalnu bazu igrača Evrolige, **kako bih** brzo pronašao igrača bez zavisnosti od spoljnog API-ja.
**Izvor:** FR-03

1. Sistem ĆE jednom dnevno preuzeti spisak igrača aktuelne sezone (ime, prezime, klub, pozicija, broj dresa, slika ako postoji).
2. KADA administrator izabere "Sinhronizuj igrače sada", ONDA sistem ĆE odmah pokrenuti sinhronizaciju i prikazati njen ishod.
3. KADA igrač više nije na spisku nijednog kluba, ONDA sistem ĆE ga označiti kao neaktivnog, a NEĆE ga obrisati.
4. AKO sinhronizacija ne uspe, ONDA sistem ĆE zadržati poslednje uspešne podatke i administratoru prikazati upozorenje sa vremenom poslednje uspešne sinhronizacije.
5. KADA administrator ručno doda igrača (ime, klub), ONDA sistem ĆE ga sačuvati sa oznakom "ručno dodat".

### REQ-05 — Sinhronizacija rasporeda utakmica
**Kao** administrator, **želim** da sistem zna raspored utakmica, **kako bi** se tipovi automatski vezivali za pravu utakmicu.
**Izvor:** FR-04

1. Sistem ĆE jednom dnevno osvežiti raspored utakmica aktuelne sezone (gameCode, kolo Evrolige, domaćin, gost, termin, status).
2. DOK je dan na koji postoji utakmica sa tipom aktivnog kola, sistem ĆE osvežavati raspored svakih 15 minuta.
3. KADA se promeni termin utakmice na koju postoji tip, ONDA sistem ĆE prikazati promenu u detalju kola.
4. Sistem ĆE razlikovati statuse utakmice: zakazana, u toku, završena, odložena, otkazana.

---

## 3. Kolo i tiket

### REQ-06 — Otvaranje novog kola
**Kao** administrator, **želim** da klikom na "Novo kolo" otvorim kolo sa automatskim brojem i datumom, **kako bih** brzo počeo unos.
**Izvor:** FR-05, BR-03, BR-04, BR-05, BR-07

1. KADA administrator otvori novo kolo, ONDA sistem ĆE dodeliti broj kola `max(postojeći) + 1` i zabeležiti datum i vreme otvaranja (Europe/Belgrade); nijedno od ta dva se ne može ručno menjati.
2. KADA administrator otvara kolo, ONDA sistem ĆE ponuditi izbor **dana kola** među narednim danima na kojima postoje nezapočete utakmice Evrolige (podrazumevano prvi takav dan) i prikazati utakmice tog dana.
3. KADA je kolo kreirano, ONDA sistem ĆE automatski popuniti sezonu i kolo Evrolige (informativno) na osnovu dana kola.
4. KADA je kolo kreirano, ONDA sistem ĆE formirati tačno 4 mesta za tipove: lično mesto za svakog člana koji nije na hlađenju i mesto "Tip ekipe" za svakog člana na hlađenju (REQ-18, REQ-19).
5. AKO prethodno kolo nije razrešeno (dobitno, gubitno ili poništeno), ONDA sistem ĆE onemogućiti otvaranje novog kola i prikazati razlog.
6. AKO administrator promeni dan kola pre zaključavanja, ONDA sistem ĆE posle potvrde obrisati unete tipove koji nisu sa utakmica novog dana.
7. AKO izabrani dan nema nijednu nezapočetu utakmicu, ONDA sistem ĆE odbiti izbor tog dana.

### REQ-07 — Izbor igrača pretragom
**Kao** administrator, **želim** da igrača pronađem kucanjem imena (autocomplete), **kako ne bih** skrolovao kroz celu listu.
**Izvor:** FR-06, BR-06

1. KADA korisnik ukuca najmanje 2 karaktera, ONDA sistem ĆE za ≤ 300 ms prikazati do 10 predloga (ako upit od bar 3 slova odgovara klubu — sve igrače tog kluba) sa slikom (ili inicijalima), imenom, klubom, pozicijom i utakmicom na dan kola.
2. Sistem ĆE pretragu vršiti bez obzira na velika/mala slova i dijakritike, po delu imena, prezimena ili naziva kluba ("sasa" pronalazi "Saša").
3. DOK je kolo otvoreno, sistem ĆE kao izborne prikazivati samo igrače čiji klub igra na dan kola i čija utakmica nije počela; ostale prikazuje zatamnjeno sa napomenom i ne dozvoljava njihov izbor.
4. AKO je igrač već izabran u istom kolu, ONDA sistem ĆE onemogućiti njegov ponovni izbor.
5. Sistem NEĆE prikazivati neaktivne igrače u predlozima.

### REQ-08 — Unos tipa (granica, više/manje)
**Kao** administrator, **želim** da za izabranog igrača unesem granicu i tip "više" ili "manje", **kako bi** tiket bio kompletan.
**Izvor:** FR-07, BR-08, BR-09

1. KADA administrator izabere igrača, ONDA sistem ĆE automatski vezati tip za utakmicu igračevog kluba na dan kola.
2. Sistem ĆE prihvatati samo granicu oblika x,5 veću od 0 (npr. 14,5), sa zarezom ili tačkom kao decimalnim separatorom.
3. AKO administrator unese celu granicu (npr. 15), ONDA sistem ĆE odbiti unos porukom "Dozvoljene su samo granice x,5".
4. Sistem ĆE zahtevati izbor tačno jednog smera: "Više" ili "Manje".
5. GDE administrator unese pojedinačnu kvotu tipa, sistem ĆE je sačuvati uz tip (opciono polje).
6. AKO je utakmica tipa počela, ONDA sistem ĆE onemogućiti unos ili izmenu tog tipa.
7. KADA administrator izmeni bilo koje polje otvorenog kola, ONDA sistem ĆE ga automatski sačuvati i prikazati oznaku "Sačuvano".

### REQ-09 — Predlog sopstvenog tipa
**Kao** član, **želim** da sam predložim svoj tip, **kako bi** admin samo potvrdio umesto da prepisuje.
**Izvor:** FR-09

1. DOK je kolo otvoreno i član nije na hlađenju, sistem ĆE dozvoliti članu da unese ili izmeni predlog svog ličnog tipa (igrač, granica, smer).
2. KADA član sačuva predlog, ONDA sistem ĆE ga prikazati administratoru sa oznakom "Predlog — čeka potvrdu".
3. KADA administrator prihvati predlog, ONDA sistem ĆE od njega kreirati lični tip tog člana; dalje izmene može vršiti samo administrator.
4. AKO član pokuša da izmeni tip drugog člana, ONDA sistem ĆE odbiti zahtev.
5. Sistem ĆE dozvoliti administratoru da unese tip i bez predloga člana.

### REQ-10 — Uplata, kvota, uplatilac i potencijalni dobitak
**Kao** administrator, **želim** da zabeležim iznos uplate, kvotu i ko je uplatio, **kako bi** finansijska statistika bila tačna.
**Izvor:** FR-10, BR-10, BR-11, BR-31

1. Sistem ĆE zahtevati iznos uplate (> 0, RSD, najviše 2 decimale), ukupnu kvotu tiketa (≥ 1,01) i uplatioca (jedan od četiri člana, uključujući i člana na hlađenju).
2. KADA se promeni uplata ili ukupna kvota, ONDA sistem ĆE odmah izračunati potencijalni dobitak = uplata × ukupna kvota, zaokruženo na 2 decimale.
3. GDE su unete sve četiri pojedinačne kvote, sistem ĆE prikazati njihov proizvod; AKO se on razlikuje od ukupne kvote više od 2%, ONDA sistem ĆE prikazati upozorenje.
4. Sistem ĆE kao podrazumevanog uplatioca predložiti člana koji je najdavnije uplatio, uz mogućnost izbora bilo kog člana.
5. Sistem ĆE sve iznose prikazivati u formatu `1.250,00 RSD`.

### REQ-11 — Zaključavanje glasanja
**Kao** administrator, **želim** da klikom na "Zaključi glasanje" zamrznem tiket, **kako se** izbori ne bi menjali posle uplate.
**Izvor:** FR-11, BR-28, P-19

1. DOK nedostaje bilo koji od podataka (4 tipa, uplata, ukupna kvota, uplatilac), sistem ĆE onemogućiti "Zaključi glasanje" i prikazati šta nedostaje.
2. KADA administrator potvrdi zaključavanje u prozoru sa rezimeom tiketa, ONDA sistem ĆE postaviti status kola na *Zaključen*, zabeležiti vreme i ko je zaključao, i učiniti sve tipove i finansijske podatke samo za čitanje.
3. KADA počne prva utakmica kola koje je kompletno, a nije zaključeno, ONDA sistem ĆE automatski zaključati kolo i kao aktera zabeležiti "sistem".
4. AKO u trenutku početka prve utakmice kolo nije kompletno, ONDA sistem ĆE administratoru prikazati upozorenje, onemogućiti unos tipova čija je utakmica počela i dozvoliti samo da se takav tip označi kao poništen.
5. DOK je do početka prve utakmice nezaključenog kola manje od 60 minuta, sistem ĆE administratoru prikazivati upozorenje sa odbrojavanjem.
6. KADA počne prva utakmica zaključanog kola, ONDA sistem ĆE promeniti status kola u *U toku*.

### REQ-12 — Ispravka posle zaključavanja
**Kao** administrator, **želim** da ispravim grešku u unosu i posle zaključavanja, **kako bi** evidencija odgovarala stvarnom tiketu, uz trag ko je i zašto menjao.
**Izvor:** FR-12, BR-29, P-09

1. DOK nijedna utakmica zaključanog kola nije počela, sistem ĆE dozvoliti administratoru da otključa celo kolo uz obavezan razlog, pri čemu se kolo vraća u status *Otvoren*.
2. AKO je bar jedna utakmica kola počela, ONDA sistem NEĆE dozvoliti otključavanje celog kola, već samo ciljanu ispravku pojedinačnog polja (igrač, granica, smer, uplata, kvota, uplatilac, stvarni dobitak) ili ručno razrešenje tipa.
3. KADA administrator pokrene ispravku, ONDA sistem ĆE pre potvrde prikazati posledice po statistiku (npr. "Tozislav: niz promašaja 4 → 5, ulazi na hlađenje").
4. KADA administrator potvrdi ispravku, ONDA sistem ĆE sačuvati izmenu, upisati audit zapis (ko, kada, polje, staro, novo, razlog) i pokrenuti rekalkulaciju (REQ-23).
5. AKO razlog nije unet, ONDA sistem ĆE odbiti ispravku.
6. Sistem ĆE kolo sa ispravkom označiti ikonicom "ispravljeno" u istoriji.

---

## 4. Uživo i razrešenje

### REQ-13 — Praćenje poena uživo
**Kao** član ili gost, **želim** da tokom utakmica vidim poene svakog odigranog igrača i da li je tip "u prolazu", **kako bih** pratio tiket bez traženja po drugim sajtovima.
**Izvor:** FR-13, BR-16, NFR-01…NFR-04

1. DOK je u toku utakmica sa tipom aktivnog kola, sistem ĆE preuzimati live boxscore te utakmice najmanje svakih 30 sekundi.
2. KADA se poeni igrača promene u izvoru, ONDA sistem ĆE prikazati novu vrednost svim otvorenim ekranima za ≤ 60 sekundi, bez ručnog osvežavanja stranice.
3. Sistem ĆE za svaki tip prikazati: igrača, granicu i smer, trenutne poene, minute u igri, lične greške, rezultat i vreme utakmice i status tipa.
4. Sistem ĆE status tipa određivati ovako:
   - KADA utakmica nije počela, ONDA status je "Nije počelo";
   - DOK je tip trenutno ispunjen, status je "U prolazu"; inače "Nije u prolazu";
   - KADA je smer "Više" i poeni > granica, ONDA status je "Sigurno pogođen";
   - KADA je smer "Manje" i poeni > granica, ONDA status je "Sigurno promašen";
   - DOK je utakmica u toku, a igrač ima 0 sekundi u igri, status je "Nije ušao u igru".
5. DOK je smer "Više" i tip nije pogođen, sistem ĆE prikazivati "fali još X poena".
6. Sistem ĆE prikazati indikator tiketa: "Tiket živ (N/4 u prolazu)" ili "Tiket pao" čim je bilo koji tip sigurno ili konačno promašen.
7. AKO je poslednje uspešno osvežavanje starije od 2 minuta, ONDA sistem ĆE prikazati upozorenje "Podaci kasne" i zadržati poslednje poznate podatke.
8. Sistem ĆE statuse razlikovati i bojom i ikonicom/tekstom.
9. Sistem ĆE ka spoljnom API-ju slati najviše 20 zahteva u minuti (dovoljno za 4 utakmice × zaglavlje + boxscore na 30 s) i primenjivati eksponencijalno odlaganje (30 s → 60 s → 2 min → 5 min) pri greškama 429/5xx.
10. Klijent (browser) NEĆE nikada direktno pozivati spoljni API.

### REQ-14 — Razrešenje tipa
**Kao** član, **želim** da sistem sam odredi da li je tip pogođen, **kako niko ne bi** morao ručno da proverava boxscore.
**Izvor:** FR-14, BR-12…BR-15, P-01, P-02, P-13

1. KADA izvor označi utakmicu završenom, ONDA sistem ĆE u roku od 10 minuta preuzeti konačni boxscore i razrešiti svaki tip te utakmice.
2. KADA je smer "Više", ONDA sistem ĆE tip označiti kao pogodak ako su konačni poeni (uključujući produžetke) veći od granice, a inače kao promašaj.
3. KADA je smer "Manje", ONDA sistem ĆE tip označiti kao pogodak ako su konačni poeni manji od granice, a inače kao promašaj.
4. AKO igrač nije ulazio u igru (0 sekundi), ONDA sistem ĆE tip označiti kao poništen (kvota 1,00); igrač koji je ušao makar na sekund razrešava se normalno, i sa 0 poena.
5. AKO utakmica ne počne na dan kola (odložena ili otkazana) ili je prekinuta i nije završena istog dana, ONDA sistem ĆE tip odmah označiti kao poništen, bez čekanja.
6. KADA prođe 12 sati od završetka utakmice, ONDA sistem ĆE ponovo proveriti boxscore; AKO se poeni promene tako da se menja ishod, ONDA sistem ĆE ispraviti ishod, upisati audit zapis i pokrenuti rekalkulaciju.
7. AKO utakmica nije označena završenom 6 sati posle planiranog početka, ONDA sistem ĆE administratoru kreirati zadatak za ručno razrešenje (REQ-16).

### REQ-15 — Razrešenje tiketa i dobitak
**Kao** član, **želim** da sistem odredi da li je tiket dobitan i koliko smo dobili, **kako bi** bilans bio tačan.
**Izvor:** FR-14, BR-17, BR-18, BR-19, P-04

1. Sistem ĆE tiket označiti kao **dobitan** samo kada nijedan tip nije promašen i bar jedan je pogođen — tj. 4/4, odnosno svi važeći tipovi pogođeni kada je neki tip poništen (npr. 3/3 +1 poništen; potvrđeno, OQ-04).
2. KADA je bilo koji tip konačno promašen, ONDA sistem ĆE tiket odmah označiti kao **gubitan**, i pre kraja ostalih utakmica.
3. AKO su sva četiri tipa poništena, ONDA sistem ĆE tiket označiti kao **poništen**, a stvarni dobitak jednak uplati.
4. KADA je tiket dobitan bez poništenih tipova, ONDA sistem ĆE stvarni dobitak postaviti na potencijalni dobitak.
5. KADA je tiket dobitan sa poništenim tipom i poznate su pojedinačne kvote, ONDA sistem ĆE stvarni dobitak izračunati kao `uplata × ukupna kvota / proizvod kvota poništenih tipova`.
6. AKO je tiket dobitan sa poništenim tipom, a pojedinačne kvote nisu unete, ONDA sistem ĆE kreirati zadatak "Unesi stvarni dobitak", a do unosa dobitak u statistici prikazivati kao privremen.
7. Sistem ĆE ishod kola prikazivati kao `pogođeno/važećih`, npr. `3/4` ili `3/3 (+1 poništen)`.
8. KADA administrator ručno koriguje stvarni dobitak uz razlog, ONDA sistem ĆE sačuvati vrednost i upisati audit zapis.

### REQ-16 — Ručno razrešenje tipa
**Kao** administrator, **želim** da ručno unesem konačne poene ili poništim tip, **kako bi** kolo moglo da se razreši i kad API ne radi.
**Izvor:** FR-15

1. KADA administrator izabere "Razreši ručno", ONDA sistem ĆE ponuditi: unos konačnih poena, "Igrač nije zaigrao (DNP)" ili "Utakmica nije odigrana na dan kola", uz obavezan razlog/izvor.
2. KADA administrator potvrdi ručno razrešenje, ONDA sistem ĆE primeniti ista pravila kao u REQ-14, označiti tip kao "ručno" i upisati audit zapis.
3. Sistem NEĆE automatski prepisivati ručno razrešen tip; AKO se podaci iz API-ja razlikuju, ONDA sistem ĆE administratoru prikazati upozorenje.

---

## 5. Nizovi, pahuljica, vatrica, blejm

### REQ-17 — Nizovi pogodaka i promašaja
**Kao** član, **želim** da vidim svoj trenutni niz pogodaka ili promašaja, **kako bih** znao da li se približavam vatrici ili hlađenju.
**Izvor:** BR-20

1. Sistem ĆE niz člana računati isključivo nad njegovim **ličnim** tipovima, hronološki po broju kola, unutar jedne sezone.
2. KADA je lični tip pogođen, ONDA sistem ĆE niz pogodaka uvećati za 1, a niz promašaja postaviti na 0.
3. KADA je lični tip promašen, ONDA sistem ĆE niz promašaja uvećati za 1, a niz pogodaka postaviti na 0.
4. KADA je lični tip poništen ili je član u tom kolu na hlađenju, ONDA sistem NEĆE menjati nijedan niz tog člana.
5. Sistem ĆE pamtiti najduži niz pogodaka i najduži niz promašaja svakog člana.

### REQ-18 — Hlađenje (pahuljica ❄)
**Kao** član, **želim** da onaj ko promaši 5 puta zaredom pauzira jedno kolo, **kako bi** igra imala kaznu za loš niz.
**Izvor:** BR-21, BR-22, P-06

1. KADA niz promašaja člana dostigne 5, ONDA sistem ĆE člana označiti pahuljicom ❄ i u **sledećem** kolu ga staviti na hlađenje.
2. DOK je član na hlađenju, sistem NEĆE dozvoliti unos ni predlog njegovog ličnog tipa, a na njegovom mestu ĆE formirati tip ekipe (REQ-19).
3. Hlađenje ĆE trajati tačno jedno kolo.
4. KADA se razreši kolo u kome je član bio na hlađenju, ONDA sistem ĆE njegov niz promašaja postaviti na 0.
5. Sistem ĆE brojati koliko puta je svaki član bio na hlađenju.
6. Sistem ĆE pahuljicu ❄ prikazivati uz ime člana u svim prikazima dok je zakazano ili traje njegovo hlađenje.

### REQ-19 — Tip ekipe umesto člana na hlađenju
**Kao** član koji nije na hlađenju, **želim** da sa ostalima izaberem 4. tip umesto kažnjenog člana, **kako bi** tiket i dalje imao četiri tipa.
**Izvor:** FR-08, BR-02, BR-26, BR-27, P-05, P-12

1. Sistem ĆE za svakog člana na hlađenju formirati po jedno mesto "Tip ekipe (umesto: <ime> ❄)", tako da tiket uvek ima tačno 4 tipa.
2. DOK je kolo otvoreno, sistem ĆE dozvoliti članovima koji nisu na hlađenju da dodaju predlog tipa ekipe i da glasaju (👍) za postojeće predloge.
3. AKO član na hlađenju pokuša da doda predlog ili glasa, ONDA sistem ĆE odbiti zahtev.
4. KADA administrator izabere predlog (ili unese sopstveni), ONDA sistem ĆE ga postaviti kao tip ekipe.
5. Sistem ĆE tip ekipe pripisati "Ekipi": ulazi u ishod tiketa i ukupnu statistiku, ali NE ulazi u lične statistike, nizove, vatrice ni hlađenja nijednog člana.
6. Sistem ĆE voditi zasebnu statistiku "Ekipa" (broj tipova, pogodaka, procenat, blejmovi).
7. AKO su sva četiri člana na hlađenju, ONDA sistem ĆE formirati četiri tipa ekipe koje unosi administrator.

### REQ-20 — Vatrica 🔥
**Kao** član, **želim** da dobijem vatricu posle 3 pogotka zaredom, **kako bi** dobar niz bio nagrađen i vidljiv.
**Izvor:** BR-23, BR-24, P-07

1. KADA niz pogodaka člana dostigne 3, ONDA sistem ĆE članu dodeliti vatricu 🔥 i uvećati njegov broj dobijenih vatrica za 1.
2. DOK je niz pogodaka ≥ 3, sistem ĆE prikazivati vatricu uz ime člana; nastavak niza (4, 5, …) NEĆE uvećati broj vatrica.
3. KADA član ima vatricu i njegov lični tip bude promašen, ONDA sistem ĆE ukloniti vatricu.
4. KADA je lični tip poništen, ONDA sistem NEĆE ukloniti vatricu.

### REQ-21 — Blejm
**Kao** član, **želim** da se beleži ko je bio jedini promašaj na tiketu, **kako bismo** imali "blejm" rang listu.
**Izvor:** BR-25, P-10

1. KADA je tiket gubitan zbog tačno jednog promašaja, a taj promašaj je lični tip člana, ONDA sistem ĆE tom članu zabeležiti jedan blejm (tipično ishod 3/4; važi i za npr. 2/3 +1 poništen).
2. KADA je tiket gubitan zbog tačno jednog promašaja, a taj promašaj je tip ekipe, ONDA sistem ĆE blejm zabeležiti "Ekipi".
3. AKO tiket ima dva ili više promašaja, ONDA sistem NEĆE nikome beležiti blejm.

### REQ-22 — Reset na početku sezone
**Kao** član, **želim** da svaka sezona Evrolige počne "od nule" za nizove, **kako bi** stari niz promašaja ili vatrica ne prelazili u novu sezonu.
**Izvor:** BR-33, P-15

1. KADA se razrešava prvo kolo čiji dan kola pripada novoj sezoni, ONDA sistem ĆE za sve članove pre obrade tog kola postaviti nizove pogodaka i promašaja na 0, ukloniti vatricu i poništiti zakazano hlađenje.
2. AKO je član završio sezonu sa 5 promašaja zaredom, ONDA sistem ga NEĆE staviti na hlađenje u prvom kolu nove sezone.
3. Sistem NEĆE brisati kumulativne statistike; prikazivaće ih po sezoni i ukupno.
4. Sistem ĆE najduže nizove voditi po sezoni, a za "Sve sezone" prikazivati maksimum po sezonama.

### REQ-23 — Rekalkulacija izvedene statistike
**Kao** administrator, **želim** da se sve statistike uvek mogu ponovo izračunati iz istorije, **kako bi** ispravke bile bezbedne i statistika uvek tačna.
**Izvor:** FR-16, BR-30

1. Sistem ĆE nizove, hlađenja, vatrice, blejmove i sve statistike tretirati kao izvedene podatke, izračunljive od nule iz istorije kola.
2. KADA se razreši tip ili tiket, ili se sačuva ispravka, ONDA sistem ĆE ponovo izračunati izvedene podatke od izmenjenog kola nadalje.
3. KADA administrator izabere "Ponovo izračunaj sve", ONDA sistem ĆE izračunati sve izvedene podatke od nule i upisati audit zapis.
4. Sistem ĆE dati identičan rezultat pri inkrementalnom ažuriranju i pri rekalkulaciji od nule.
5. AKO rekalkulacija promeni status hlađenja za kolo koje je već zaključeno, ONDA sistem NEĆE menjati sastav tog kola, već ĆE ga označiti upozorenjem "nekonzistentno hlađenje" i kreirati zadatak za administratora.
6. Sistem ĆE zadovoljiti sledeće scenarije:
   - promašaji u kolima 1–5 → hlađenje u kolu 6 → posle kola 6 niz promašaja 0 → promašaj u kolu 7 → niz promašaja 1;
   - pogoci 1–3 → vatrica (1); poništen u 4 → vatrica ostaje; pogodak u 5 → niz 4, broj vatrica i dalje 1; promašaj u 6 → vatrica nestaje;
   - 3/4 gde je jedini promašaj tip ekipe → blejm "Ekipi";
   - 5 promašaja na kraju sezone → prvo kolo nove sezone bez hlađenja.

---

## 6. Statistika i istorija

### REQ-24 — Ukupna statistika i raspodela ishoda
**Kao** član ili gost, **želim** da vidim koliko smo uplatili, dobili i kako su se završavala kola, **kako bih** znao da li smo u plusu.
**Izvor:** FR-17, BR-19

1. Sistem ĆE prikazati: ukupno uplaćeno, ukupno dobijeno, bilans (dobijeno − uplaćeno, zeleno za plus, crveno za minus), ROI (%), broj kola, broj i procenat dobitnih kola.
2. Sistem ĆE prikazati broj i procenat kola sa ishodom 4/4, 3/4, 2/4, 1/4 i 0/4; kola sa poništenim tipom prikazuju se u posebnoj kategoriji "sa poništenim".
3. Sistem ĆE procente računati nad razrešenim kolima tako da zbir raspodele bude 100% (±0,1% zbog zaokruživanja).
4. Sistem NEĆE uključivati nerazrešena kola u statistiku.
5. Sistem ĆE prikazati najveći dobitak, najduži niz gubitnih tiketa, kretanje bilansa kroz kola i statistiku "Ekipa".
6. KADA korisnik izabere sezonu ili period od–do, ONDA sistem ĆE sve pokazatelje računati samo za taj opseg (podrazumevano aktuelna sezona).

### REQ-25 — Statistika po članu
**Kao** član, **želim** da vidim svoje i tuđe pokazatelje, **kako bismo** se poredili.
**Izvor:** FR-18

1. Sistem ĆE za svakog člana prikazati: broj pogođenih, promašenih i poništenih tipova i procenat pogodaka `pogođeni / (pogođeni + promašeni)`.
2. Sistem ĆE za svakog člana prikazati: broj blejmova, broj uplata i ukupno uplaćen iznos.
3. Sistem ĆE za svakog člana prikazati: trenutni niz, najduži niz pogodaka, najduži niz promašaja, broj hlađenja, broj dobijenih vatrica i trenutni status ❄/🔥.
4. Sistem ĆE prikazati poslednjih 10 ličnih tipova (✔/✘/–), procenat pogodaka posebno za "Više" i "Manje" i najčešće birane igrače sa uspehom.
5. Sistem NEĆE uključivati tipove ekipe u ličnu statistiku.
6. KADA korisnik klikne na zaglavlje kolone, ONDA sistem ĆE sortirati tabelu po toj koloni.
7. Sistem ĆE trenutni niz i ❄/🔥 uvek računati za aktuelnu sezonu, nezavisno od izabranog filtera.

### REQ-26 — Blejm rang lista
**Kao** član, **želim** rang listu po broju blejmova, **kako bismo** znali ko nas je najviše koštao.
**Izvor:** FR-19

1. Sistem ĆE prikazati članove rangirane po broju blejmova, sa procentom blejmova u odnosu na broj ličnih tipova i zbirom "izgubljenog potencijalnog dobitka".
2. AKO dva člana imaju isti broj blejmova, ONDA sistem ĆE više rangirati onog sa većim izgubljenim potencijalnim dobitkom.
3. GDE "Ekipa" ima blejmove, sistem ĆE je prikazati kao poseban red na dnu.
4. KADA korisnik izabere člana, ONDA sistem ĆE prikazati listu kola u kojima je bio jedini promašaj.

### REQ-27 — Istorija kola sa filterima
**Kao** član ili gost, **želim** da pregledam sva kola i filtriram ih, **kako bih** pronašao određena kola.
**Izvor:** FR-20

1. Sistem ĆE za svako kolo prikazati: broj, dan kola, kolo Evrolige, ishod k/n, status, uplatu, uplatioca, potencijalni i stvarni dobitak, oznake (❄, "ispravljeno", "uvezeno") i skraćeni prikaz 4 tipa sa ishodom.
2. Sistem ĆE podrazumevano prikazivati najnovija kola prvo, po 20 kola na strani.
3. Sistem ĆE omogućiti kombinovanje filtera: sezona, period, status tiketa, ishod, član (pogodio / promašio / blejm / hlađenje), uplatilac, igrač, klub, smer, kola sa tipom ekipe.
4. KADA korisnik promeni filtere, ONDA sistem ĆE upisati njihovo stanje u URL, tako da se link može podeliti.
5. AKO nijedno kolo ne odgovara filterima, ONDA sistem ĆE prikazati poruku i dugme "Obriši filtere".

### REQ-28 — Detalj kola
**Kao** član ili gost, **želim** da vidim sve podatke jednog kola, **kako bih** razumeo kako je kolo prošlo.
**Izvor:** FR-21

1. Sistem ĆE prikazati sve podatke kola: tipove (član/Ekipa, igrač, klub, utakmica i rezultat, granica, smer, pojedinačna kvota, konačni poeni, minuti, ishod, način razrešenja), uplatu, kvotu, uplatioca, potencijalni i stvarni dobitak, hlađenja, promene vatrica, blejm i predloge sa glasovima.
2. DOK je kolo *U toku*, sistem ĆE u detalju prikazivati live podatke (REQ-13).
3. DOK je korisnik administrator, sistem ĆE u detalju nuditi akcije iz REQ-12 i REQ-16.
4. DOK je korisnik prijavljeni član, sistem ĆE prikazivati audit zapise tog kola.

### REQ-29 — Audit log
**Kao** član, **želim** da vidim svaku naknadnu izmenu, **kako bi** igra bila transparentna.
**Izvor:** FR-22

1. Sistem ĆE upisati audit zapis za: zaključavanje (ručno/automatsko), otključavanje, svaku ispravku, ručno razrešenje, automatsku ispravku posle ponovne provere, korekciju stvarnog dobitka, prenos admin uloge, brisanje kola, kompletnu rekalkulaciju i uvoz istorije.
2. Svaki zapis ĆE sadržati: vreme, aktera (član ili "sistem"), kolo, entitet i polje, staru i novu vrednost i razlog.
3. Sistem NEĆE omogućiti izmenu ni brisanje audit zapisa.
4. Sistem ĆE prijavljenim članovima omogućiti filtriranje audit loga po kolu i akteru.

### REQ-30 — Brisanje nezaključenog kola
**Kao** administrator, **želim** da obrišem kolo otvoreno greškom, **kako ne bi** ostalo prazno kolo u istoriji.
**Izvor:** FR-24

1. DOK kolo nikada nije bilo zaključano, sistem ĆE dozvoliti administratoru da ga obriše posle potvrde unosom broja kola.
2. KADA je kolo obrisano, ONDA sistem ĆE osloboditi njegov broj i upisati audit zapis.
3. AKO je kolo zaključano ili razrešeno, ONDA sistem NEĆE dozvoliti brisanje.

### REQ-31 — Uvoz istorijskih kola iz XLS/XLSX
**Kao** administrator, **želim** da uvezem ranija kola iz našeg Google Sheets-a, **kako bi** statistika i nizovi uključivali celu istoriju.
**Izvor:** FR-25, BR-34, P-17

1. DOK u aplikaciji ne postoji nijedno kolo uneto kroz aplikaciju, sistem ĆE administratoru omogućiti otpremanje XLS/XLSX fajla do 5 MB.
2. KADA administrator otpremi fajl, ONDA sistem ĆE pročitati prvi list (samo vrednosti ćelija, bez makroa i formula), prepoznati kolone po nazivu i ponuditi ručno mapiranje kolona koje ne prepozna.
3. KADA su kolone mapirane, ONDA sistem ĆE prikazati pregled pre uvoza: broj kola, period i greške po redovima.
4. AKO kolo nema tačno 4 tipa, član nije prepoznat, ishod nije "pogodak/promašaj/poništen" ili tip ekipe nema popunjeno "umesto", ONDA sistem ĆE označiti grešku i onemogućiti potvrdu uvoza.
5. AKO se ime igrača ne može automatski upariti sa bazom, ONDA sistem ĆE ponuditi izbor igrača iz baze ili dodavanje ručnog igrača.
6. KADA administrator potvrdi uvoz, ONDA sistem ĆE u jednoj transakciji kreirati sva kola sa oznakom "uvezeno", dodeliti im brojeve 1…N hronološki, upisati jedan audit zapis i pokrenuti kompletnu rekalkulaciju.
7. Sistem ĆE uvezena kola tretirati kao prava kola: ulaze u svu statistiku, nizove, hlađenja, vatrice i blejm, a ishod tipa uzima se iz fajla.
8. KADA administrator ponovi uvoz, ONDA sistem ĆE posle potvrde zameniti ceo prethodno uvezeni skup.
9. Sistem ĆE ponuditi preuzimanje praznog XLSX šablona.

### REQ-32 — Zadaci i upozorenja za administratora
**Kao** administrator, **želim** jedno mesto sa svim što čeka moju akciju, **kako ništa ne bih** propustio, iako aplikacija ne šalje obaveštenja.
**Izvor:** EKR-13, P-20

1. Sistem ĆE prikazivati listu otvorenih zadataka: nezaključeno kolo pred početak utakmice, tip za ručno razrešenje, unos stvarnog dobitka, nekonzistentno hlađenje, neuspešna sinhronizacija.
2. DOK postoji bar jedan otvoren zadatak, sistem ĆE administratoru u navigaciji prikazivati bedž sa brojem zadataka.
3. KADA je uslov zadatka rešen, ONDA sistem ĆE automatski zatvoriti zadatak.
4. Sistem NEĆE slati obaveštenja van aplikacije (push, e-mail, Telegram, Viber).

### REQ-33 — Rezervni režim bez spoljnog API-ja
**Kao** administrator, **želim** da aplikacija radi i kada Euroleague API nije dostupan, **kako bi** igra mogla da se nastavi.
**Izvor:** specifikacija 7.5, NFR-20

1. AKO spoljni API nije dostupan, ONDA sistem ĆE nastaviti da radi sa poslednjim sinhronizovanim podacima i NEĆE prekinuti rad ostalih funkcija.
2. Sistem ĆE administratoru omogućiti ručni unos igrača, utakmice i konačnih poena.
3. AKO live poller ne uspe 5 puta zaredom, ONDA sistem ĆE administratoru prikazati upozorenje.
4. Sistem ĆE pristupati spoljnom izvoru isključivo preko zamenjivog adaptera, tako da promena izvora ne zahteva izmene ostatka aplikacije.
5. AKO struktura odgovora API-ja ne odgovara očekivanoj šemi, ONDA sistem ĆE odbaciti odgovor, zabeležiti grešku i upozoriti administratora.

---

## 7. Nefunkcionalni zahtevi

### REQ-34 — Prikaz na telefonu
**Kao** član, **želim** da sve radim sa telefona, **kako bih** unosio i pratio kola bilo gde.
**Izvor:** NFR-07…NFR-11

1. Sistem ĆE sve ekrane prikazati funkcionalno na širini od 360 px, bez horizontalnog skrolovanja stranice (osim tabela u sopstvenom kontejneru).
2. Sistem ĆE imati dodirne površine od najmanje 44×44 px i numeričku tastaturu za granicu, uplatu i kvotu.
3. Sistem ĆE omogućiti administratoru da unese kompletno kolo na telefonu za ≤ 2 minuta.
4. Sistem ĆE imati web app manifest i ikonice, tako da se može dodati na početni ekran telefona; offline keš (service worker) NIJE deo prve verzije (OQ-05).
5. AKO uređaj izgubi vezu sa serverom, ONDA sistem ĆE prikazati oznaku "Nema veze" i nastaviti prikaz poslednjih učitanih podataka do ponovnog povezivanja.
6. Sistem ĆE poštovati kontrast WCAG 2.1 AA i ikonice ❄/🔥 opremiti tekstualnim opisom.
7. Sistem ĆE prikazivati UI na srpskom (latinica), datume `dd.MM.yyyy.`, vreme 24h, vremensku zonu Europe/Belgrade i decimalni zarez.

### REQ-35 — Performanse
**Kao** korisnik, **želim** brz odziv, **kako bi** praćenje uživo bilo prijatno.
**Izvor:** NFR-05, NFR-06

1. Sistem ĆE vratiti rezultate pretrage igrača za ≤ 300 ms.
2. Sistem ĆE prikazati prvi sadržaj početne strane i live ekrana za ≤ 2 s na 4G mreži.
3. Sistem ĆE odgovoriti na zahteve za statistiku i istoriju (do 500 kola) za ≤ 1 s.
4. Sistem ĆE izvršiti kompletnu rekalkulaciju za 500 kola za ≤ 5 s.

### REQ-36 — Bezbednost
**Kao** član, **želim** da samo ovlašćeni mogu da menjaju podatke, **kako bi** evidencija bila pouzdana.
**Izvor:** NFR-12…NFR-17, NFR-24

1. Sistem ĆE sva ovlašćenja proveravati na serveru; skrivanje dugmadi u UI-ju nije dovoljno.
2. Sistem ĆE lozinke čuvati isključivo kao heš (bcrypt ili argon2), a sesiju u kolačiću sa atributima HttpOnly, Secure i SameSite=Lax.
3. Sistem ĆE raditi isključivo preko HTTPS-a (HSTS).
4. Sistem ĆE validirati sve ulaze na serveru, koristiti parametrizovane SQL upite i štititi od CSRF i XSS napada.
5. AKO se pokuša izmena zaključanog kola mimo procedure iz REQ-12 (i direktnim API pozivom), ONDA sistem ĆE odbiti zahtev.
6. Sistem NEĆE čuvati podatke o plaćanju.

### REQ-37 — Pouzdanost, rezervne kopije i testabilnost
**Kao** član, **želim** da podaci ne nestanu i da pravila rade tačno, **kako bi** statistika bila verodostojna.
**Izvor:** NFR-18…NFR-22

1. Sistem ĆE biti dostupan 99% vremena tokom termina utakmica Evrolige.
2. Sistem ĆE jednom dnevno praviti rezervnu kopiju baze (`mysqldump`) i čuvati je 30 dana **van kontejnera** — na trajnom volumenu VM-a, a dodatno i van VM-a (besplatno objektno skladište), kako kvar VM-a ne bi uništio i bazu i kopije.
3. Sistem ĆE poslovna pravila implementirati kao čiste funkcije pokrivene jediničnim testovima, uključujući sve scenarije iz REQ-23.6.
4. Sistem ĆE integraciju sa spoljnim API-jem testirati nad snimljenim JSON odgovorima.
5. Sistem ĆE pisati strukturirane logove pozadinskih poslova.

### REQ-38 — Isporuka kao jedan Docker image na besplatnom hostingu
**Kao** administrator, **želim** da se cela aplikacija pokreće iz jednog Docker image-a, **kako bi** postavljanje i održavanje bilo jednostavno i besplatno.
**Izvor:** zahtev naručioca (tehnološki stack), NFR-23, P-21

1. Sistem ĆE se isporučivati kao jedan Docker image koji sadrži Node.js backend, build-ovan React frontend (servira ga backend) i MySQL bazu.
2. KADA se kontejner pokrene nad praznom bazom, ONDA sistem ĆE automatski izvršiti migracije i kreirati četiri člana (seed).
3. Sistem ĆE MySQL podatke čuvati na trajnom volumenu montiranom u kontejner, tako da restart, ažuriranje image-a ili ponovno kreiranje kontejnera NE briše podatke (OQ-01).
4. Sistem ĆE raditi na besplatnoj virtuelnoj mašini koja je stalno uključena (npr. Oracle Cloud Always Free), bez mesečnog troška (OQ-01, OQ-02).
5. DOK kontejner radi, sistem ĆE pokretati pozadinske poslove (live poller, automatsko zaključavanje, razrešenje, sinhronizacije) unutar istog kontejnera, bez zavisnosti od spoljnog "buđenja".
6. AKO kontejner neočekivano stane, ONDA hosting okruženje ĆE ga automatski ponovo pokrenuti (restart politika), a sistem ĆE po pokretanju nastaviti započete poslove (npr. praćenje utakmica u toku).
7. Sistem ĆE konfiguraciju (tajne, URL-ovi, sezona) čitati iz promenljivih okruženja, a ne iz image-a.

---

## Otvorena pitanja

Pitanja koja specifikacija nije rešavala ili su bila u suprotnosti sa novim tehničkim zahtevima. Odgovori naručioca od 14.10.2026. su ugrađeni u zahteve.

| ID | Pitanje | Odluka | Pogođeni zahtevi |
|----|---------|--------|------------------|
| ~~OQ-01~~ | MySQL u istom image-u + besplatan hosting: većina besplatnih PaaS platformi nema trajni disk, pa se baza briše pri restartu. | ✅ **Besplatna VM** (npr. Oracle Cloud Always Free) na kojoj radi jedan image, sa MySQL podacima na montiranom trajnom volumenu. | REQ-37, REQ-38 |
| ~~OQ-02~~ | Besplatni PaaS uspavljuje kontejner, pa ne rade live poller i automatsko zaključavanje. | ✅ Rešeno kroz OQ-01: VM je stalno uključena, a pozadinski poslovi rade u istom kontejneru. | REQ-11, REQ-13, REQ-14, REQ-38 |
| ~~OQ-03~~ | Prijava: magični link na e-mail ili lozinka? | ✅ **Korisničko ime + lozinka**, bez e-mail servisa; admin resetuje lozinke. | REQ-01, REQ-36 |
| ~~OQ-04~~ | "Dobitan samo 4/4" vs. poništen tip (P-01). | ✅ Važi specifikacija: tiket je dobitan kada su svi **važeći** tipovi pogođeni (npr. 3/3 +1 poništen). | REQ-15, REQ-24 |
| ~~OQ-05~~ | PWA/offline u prvoj verziji? | ✅ **Samo manifest** (dodavanje na početni ekran), bez offline keša. | REQ-34 |
| **OQ-06** | Format XLS fajla sa istorijom (OP-03, OP-10, OP-11 iz specifikacije). | ⏳ Implementira se predloženi šablon i mapiranje kolona; tačan format se proverava kada fajl stigne. | REQ-31 |
| **OQ-07** | Uputstvo za `design.md` i `tasks.md` je nepotpuno — zadatak se prekida kod "Istraži i…". | ⏳ Čeka ostatak uputstva. | — |

## Matrica pokrivenosti specifikacije

| Specifikacija | Zahtev |
|---------------|--------|
| FR-01…FR-22, FR-24, FR-25 | REQ-01…REQ-33 (vidi kolonu "Izvor" u Pregledu) |
| FR-23 (povučeno) | REQ-32.4 (izričito bez obaveštenja) |
| BR-01…BR-35 | REQ-03, REQ-06…REQ-23, REQ-31, REQ-02 |
| NFR-01…NFR-24 | REQ-13, REQ-34…REQ-38 |
| Poglavlje 7 (integracije) | REQ-04, REQ-05, REQ-13, REQ-14, REQ-33 |
