# 4. Funkcionalni zahtevi

Format svakog zahteva: **Opis · Akter · Prioritet · Preduslovi · Tok · Kriterijumi prihvatanja (KP)**.
Prioriteti: **M** (mora), **T** (treba), **M-B** (može, ako bude vremena).

## Pregled

| ID | Naziv | Akter | Prioritet |
|----|-------|-------|-----------|
| FR-01 | Prijava i sesija | svi | M |
| FR-02 | Upravljanje članovima i ulogama | Admin | M |
| FR-03 | Sinhronizacija baze igrača | Sistem | M |
| FR-04 | Sinhronizacija rasporeda utakmica | Sistem | M |
| FR-05 | Otvaranje novog kola | Admin | M |
| FR-06 | Izbor igrača pretragom (autocomplete) | Admin, Član | M |
| FR-07 | Unos granice, smera i utakmice | Admin | M |
| FR-08 | Tip ekipe za člana na hlađenju | Admin, Član | M |
| FR-09 | Predlog izbora od strane člana | Član | T |
| FR-10 | Unos uplate, kvote, uplatioca i potencijalnog dobitka | Admin | M |
| FR-11 | Zaključavanje glasanja | Admin, Sistem | M |
| FR-12 | Otključavanje i ispravka posle zaključavanja | Admin | M |
| FR-13 | Praćenje poena uživo | Sistem, svi | M |
| FR-14 | Automatsko razrešenje tipova i tiketa | Sistem | M |
| FR-15 | Ručno razrešenje tipa | Admin | M |
| FR-16 | Rekalkulacija nizova, hlađenja, vatrica i blejma | Sistem | M |
| FR-17 | Ukupna statistika | svi | M |
| FR-18 | Statistika po članu | svi | M |
| FR-19 | Blejm rang lista | svi | M |
| FR-20 | Istorija kola sa filtriranjem | svi | M |
| FR-21 | Detalj kola | svi | M |
| FR-22 | Audit log | Admin, Član | M |
| ~~FR-23~~ | ~~Obaveštenja~~ — povučeno (P-20) | — | — |
| FR-24 | Brisanje nezaključenog kola | Admin | T |
| FR-25 | Uvoz istorijskih kola iz XLS/XLSX | Admin | M |

---

## FR-01 — Prijava i sesija
**Opis:** Svaki od četiri člana pristupa aplikaciji preko svog naloga.
**Akter:** svi · **Prioritet:** M
**Preduslovi:** Nalozi za četiri člana su inicijalno kreirani (seed), jedan je označen kao administrator.
**Tok:**
1. Korisnik otvara aplikaciju; ako nije prijavljen, prikazuje se ekran prijave (EKR-01).
2. Prijava korisničkim imenom i lozinkom (NFR-12); admin može da resetuje lozinku člana.
3. Sesija traje 30 dana na istom uređaju ("zapamti me"), uz mogućnost odjave.
**KP:**
- KP1: Neprijavljen korisnik (gost) vidi sve ekrane u režimu samo za pregled, osim audit loga (BR-35); sve akcije izmene, predloga i glasanja zahtevaju prijavu.
- KP2: Posle 5 neuspešnih pokušaja prijave u 15 minuta nalog se privremeno blokira na 15 minuta.
- KP3: Ne postoji javna registracija.

## FR-02 — Upravljanje članovima i ulogama
**Opis:** Admin uređuje prikazno ime/nadimak i avatar članova i može preneti ulogu administratora.
**Akter:** Admin · **Prioritet:** M
**Preduslovi:** Prijavljen admin.
**Tok:**
1. Admin otvara Podešavanja → Članovi (EKR-11).
2. Menja prikazno ime ili avatar, ili bira "Prenesi admin ulogu" na drugog člana i potvrđuje.
**KP:**
- KP1: Nije moguće dodati ni obrisati člana (BR-01).
- KP2: Posle prenosa, prethodni admin postaje član, a novi admin odmah dobija prava; uvek je tačno jedan admin (BR-32).
- KP3: Prenos se beleži u audit log.

## FR-03 — Sinhronizacija baze igrača
**Opis:** Sistem održava lokalnu kopiju igrača Evrolige aktuelne sezone (ime, prezime, tim, pozicija, broj dresa, slika ako postoji).
**Akter:** Sistem · **Prioritet:** M
**Preduslovi:** Dostupan izvor podataka (poglavlje 7).
**Tok:**
1. Pozadinski posao jednom dnevno (npr. 05:00) i na zahtev admina preuzima spiskove igrača svih timova.
2. Novi igrači se dodaju, postojećim se ažurira tim/pozicija/slika; igrači koji više nisu na spisku označavaju se kao neaktivni (ne brišu se, jer mogu postojati u istoriji).
**KP:**
- KP1: Pretraga (FR-06) radi nad lokalnom bazom, bez poziva spoljnog API-ja.
- KP2: Ako sinhronizacija ne uspe, zadržavaju se poslednji uspešni podaci i adminu se prikazuje upozorenje sa vremenom poslednje uspešne sinhronizacije.
- KP3: Admin može ručno dodati igrača (ime, tim) ako ga API ne vraća; takav igrač je označen kao "ručno dodat".

## FR-04 — Sinhronizacija rasporeda utakmica
**Opis:** Sistem održava raspored utakmica aktuelne sezone (gameCode, kolo Evrolige, domaćin, gost, datum i vreme početka, status).
**Akter:** Sistem · **Prioritet:** M
**Tok:**
1. Raspored se osvežava jednom dnevno i na zahtev admina; na dan utakmice svakih 15 minuta (radi izmena termina).
2. Statusi utakmice: zakazana, u toku, završena, odložena, otkazana.
**KP:**
- KP1: Pri izboru igrača (FR-06) sistem automatski vezuje tip za utakmicu njegovog tima na dan kola.
- KP2: Promena termina utakmice na koju postoji tip prikazuje se u detalju kola; ako je utakmica pomerena na drugi dan, tip se poništava (BR-14).

## FR-05 — Otvaranje novog kola
**Opis:** Admin otvara novo kolo klikom na "Novo kolo".
**Akter:** Admin · **Prioritet:** M
**Preduslovi:** Prethodno kolo je razrešeno (BR-05) ili ne postoji nijedno kolo.
**Tok:**
1. Admin klikne "Novo kolo" (EKR-02 ili EKR-04).
2. Admin bira **dan kola** iz liste narednih dana na kojima ima utakmica Evrolige (podrazumevano prvi naredni takav dan); uz svaki dan prikazan je broj i spisak utakmica (BR-07).
3. Sistem kreira kolo sa brojem `max+1` (BR-03), datumom/vremenom otvaranja (BR-04), danom kola, sezonom i statusom *Otvoren*.
4. Sistem određuje ko je na hlađenju (BR-21, BR-33) i formira 4 mesta za tipove: lično mesto za svakog člana koji nije na hlađenju i mesto "Tip ekipe" za svakog člana na hlađenju (BR-02).
5. Prikazuje se ekran unosa kola (EKR-04).
**KP:**
- KP1: Dugme "Novo kolo" je onemogućeno (sa objašnjenjem) dok prethodno kolo nije razrešeno.
- KP2: Broj kola se ne može uneti niti promeniti.
- KP3: Član na hlađenju je vidljivo označen pahuljicom ❄ i tekstom "Na hlađenju — tip bira ekipa".
- KP4: Kolo Evrolige popunjava se automatski iz rasporeda utakmica izabranog dana (informativno).
- KP5: Ne može se izabrati dan bez utakmica Evrolige niti dan čije su sve utakmice već počele.
- KP6: Dan kola se može promeniti dok kolo nije zaključano; tada se brišu uneti tipovi koji nisu sa utakmica novog dana (uz potvrdu).
- KP7: Prvo kolo nove sezone ne nasleđuje hlađenje iz prethodne sezone (BR-33).

## FR-06 — Izbor igrača pretragom (autocomplete)
**Opis:** Za svako mesto u tiketu bira se igrač Evrolige isključivo pretragom po imenu, bez skrolovanja kroz celu listu.
**Akter:** Admin (za sve mesta), Član (za svoj predlog, FR-09) · **Prioritet:** M
**Preduslovi:** Kolo je *Otvoreno*; baza igrača sinhronizovana (FR-03).
**Tok:**
1. Korisnik u polje kuca bar 2 karaktera imena ili prezimena.
2. Sistem prikazuje do 10 predloga (pretraga po klubu prikazuje ceo sastav kluba): slika (ili inicijali), ime i prezime, tim, pozicija, utakmica na dan kola (protivnik, vreme).
3. Korisnik bira igrača; sistem automatski popunjava utakmicu (FR-07).
**KP:**
- KP1: Pretraga je neosetljiva na velika/mala slova i dijakritike ("sasa" pronalazi "Saša", "vezenkov" pronalazi "Vezenkov"), radi po delu imena ili prezimena i po delu naziva tima.
- KP2: Predlozi se pojavljuju za ≤ 300 ms od poslednjeg kucanja (NFR-05).
- KP3: Na telefonu se lista predloga ne prekriva tastaturom i bira se jednim dodirom.
- KP4: Predlozi su podrazumevano ograničeni na igrače timova koji igraju na dan kola. Igrač čiji tim ne igra tog dana (ili čija je utakmica već počela) prikazuje se zatamnjeno uz napomenu "Ne igra <dan>" i ne može se izabrati.
- KP5: Igrač već izabran u istom kolu ne može se izabrati ponovo (BR-06).
- KP6: Neaktivni igrači (FR-03 KP1) se ne prikazuju.

## FR-07 — Unos granice, smera i utakmice
**Opis:** Za izabranog igrača unosi se granica poena, smer (više/manje) i, opciono, pojedinačna kvota.
**Akter:** Admin · **Prioritet:** M
**Preduslovi:** Izabran igrač (FR-06).
**Tok:**
1. Sistem automatski popunjava utakmicu tima igrača na dan kola (BR-07); utakmica se ne bira ručno.
2. Admin unosi granicu (numerička tastatura) i bira smer dugmićima "Više" / "Manje".
3. Opciono unosi pojedinačnu kvotu.
**KP:**
- KP1: Dozvoljena je samo granica oblika x,5 veća od 0 (BR-09).
- KP2: Unos cele granice (npr. 15) se odbija porukom "Dozvoljene su samo granice x,5 (npr. 14,5 ili 15,5)".
- KP3: Nije moguće izabrati utakmicu koja je počela (BR-08).
- KP4: Decimalni separator prihvata i zarez i tačku.

## FR-08 — Tip ekipe za člana na hlađenju
**Opis:** Kada je član na hlađenju, ostali članovi biraju 4. tip umesto njega.
**Akter:** Članovi koji nisu na hlađenju (predlog), Admin (konačan unos) · **Prioritet:** M
**Preduslovi:** U kolu postoji bar jedan član na hlađenju (BR-21).
**Tok:**
1. Na mestu člana na hlađenju prikazuje se kartica "Tip ekipe (umesto: <ime> ❄)".
2. Članovi koji nisu na hlađenju mogu da dodaju predlog (igrač, granica, smer, komentar) i da glasaju za postojeći predlog (👍).
3. Admin bira jedan predlog (ili unosi sopstveni) i on postaje tip ekipe.
**KP:**
- KP1: Član na hlađenju ne može dodati predlog niti glasati (BR-27).
- KP2: Tip ekipe je u celoj aplikaciji jasno označen kao "Ekipa", ne imenom člana na hlađenju (BR-26).
- KP3: Ako je više članova na hlađenju, postoji po jedan tip ekipe za svakog (P-12).
- KP4: Predlozi i glasovi ostaju sačuvani u istoriji kola.

## FR-09 — Predlog izbora od strane člana
**Opis:** Član može sam da unese predlog svog ličnog tipa, koji admin prihvata ili menja.
**Akter:** Član · **Prioritet:** T
**Preduslovi:** Kolo je *Otvoreno*; član nije na hlađenju.
**Tok:**
1. Član na ekranu otvorenog kola (EKR-04) bira "Predloži svoj tip", bira igrača (FR-06), granicu i smer.
2. Predlog se prikazuje adminu kao "Predlog — čeka potvrdu".
3. Admin prihvata predlog (postaje tip) ili ga menja.
**KP:**
- KP1: Član vidi i menja samo svoj predlog, i to samo dok kolo nije zaključeno.
- KP2: Prihvaćen predlog i dalje može da menja samo admin.
- KP3: Admin može da unese tip i bez predloga člana.

## FR-10 — Unos uplate, kvote, uplatioca i potencijalnog dobitka
**Opis:** Admin unosi finansijske podatke tiketa.
**Akter:** Admin · **Prioritet:** M
**Preduslovi:** Kolo je *Otvoreno*.
**Tok:**
1. Admin unosi iznos uplate (RSD) i ukupnu kvotu tiketa.
2. Bira uplatioca iz liste četiri člana.
3. Sistem automatski računa i prikazuje potencijalni dobitak (BR-11).
4. Ako su unete sve četiri pojedinačne kvote, sistem prikazuje njihov proizvod pored ukupne kvote.
**KP:**
- KP1: Potencijalni dobitak = uplata × ukupna kvota, zaokruženo na 2 decimale; ažurira se pri svakoj izmeni.
- KP2: Upozorenje ako se proizvod pojedinačnih kvota razlikuje od ukupne kvote > 2%.
- KP3: Uplata ≤ 0 i kvota < 1,01 nisu dozvoljeni.
- KP4: Polje "Uplatilac" podrazumevano predlaže člana koji je najdavnije uplatio (pravedna rotacija), ali admin može izabrati bilo koga.

## FR-11 — Zaključavanje glasanja
**Opis:** Klikom na "Zaključi glasanje" kolo se zaključava i izbori se više ne mogu menjati kroz standardni unos.
**Akter:** Admin; Sistem (automatski) · **Prioritet:** M
**Preduslovi:** Unet su sva 4 tipa (igrač, utakmica, granica, smer), uplata, ukupna kvota i uplatilac.
**Tok:**
1. Admin klikne "Zaključi glasanje"; sistem prikazuje rezime tiketa i traži potvrdu.
2. Po potvrdi, status kola postaje *Zaključen*; svi tipovi i finansijski podaci postaju samo za čitanje.
3. Kada počne prva utakmica kola, status postaje *U toku*.
4. Automatsko zaključavanje: ako kolo nije zaključeno, a kompletno je, sistem ga zaključava u trenutku početka prve utakmice (BR-28).
**KP:**
- KP1: Dugme je onemogućeno dok podaci nisu kompletni; prikazuje se šta nedostaje.
- KP2: Posle zaključavanja polja za unos nisu dostupna ni adminu (osim kroz FR-12).
- KP3: Zaključavanje beleži vreme i ko je zaključao (admin ili "sistem").
- KP4: 60 i 15 minuta pre početka prve utakmice nezaključenog kola adminu se u aplikaciji prikazuje upozorenje (baner i zadatak u EKR-13).

## FR-12 — Otključavanje i ispravka posle zaključavanja
**Opis:** Admin može ispraviti grešku nastalu pri unosu ili zaključavanju.
**Akter:** Admin · **Prioritet:** M
**Preduslovi:** Kolo je *Zaključeno*, *U toku* ili razrešeno.
**Tok (otključavanje):**
1. Ako nijedna utakmica kola nije počela, admin bira "Otključaj kolo" i unosi razlog.
2. Kolo se vraća u status *Otvoren*; nakon izmena ponovo se zaključava (FR-11).
**Tok (ciljana ispravka):**
1. Ako je bar jedna utakmica počela, admin bira "Ispravi" na konkretnom polju (tip, uplata, kvota, uplatilac, stvarni dobitak) ili "Razreši ručno" na tipu (FR-15).
2. Unosi novu vrednost i obavezan razlog; sistem prikazuje šta će se promeniti u statistici (npr. "Tozislav: niz promašaja 4 → 5, ulazi na hlađenje").
3. Po potvrdi sistem čuva izmenu, upisuje audit zapis i pokreće rekalkulaciju (FR-16).
**KP:**
- KP1: "Otključaj kolo" nije dostupno kada je bar jedna utakmica počela (BR-29).
- KP2: Svaka ispravka ima audit zapis: ko, kada, polje, stara vrednost, nova vrednost, razlog (FR-22).
- KP3: Kolo sa ispravkom je u istoriji označeno ikonicom "ispravljeno" sa linkom na audit zapise.
- KP4: Ako ispravka menja status hlađenja već zaključenog narednog kola, prikazuje se upozorenje "nekonzistentno hlađenje" (BR-30).

## FR-13 — Praćenje poena uživo
**Opis:** Tokom utakmica broj poena svakog odigranog igrača automatski se osvežava, uz vizuelni prikaz statusa tipa.
**Akter:** Sistem; svi korisnici (pregled) · **Prioritet:** M
**Preduslovi:** Kolo je *U toku*; bar jedna utakmica kola je u toku.
**Tok:**
1. Pozadinski posao za svaku utakmicu u toku preuzima live boxscore na svakih 30 s (NFR-01).
2. Za svaki tip sistem računa trenutni status i šalje izmene klijentima (push, bez ručnog osvežavanja).
3. Prikaz po tipu: igrač, granica i smer, **trenutni poeni**, odigrani minuti, broj ličnih greški, rezultat i vreme utakmice (četvrtina, preostalo vreme), status.
**Statusi tipa (live):**
| Status | Uslov | Vizuelno |
|--------|-------|----------|
| Nije počelo | utakmica zakazana | sivo |
| U prolazu | trenutno bi bio pogođen | zeleno |
| Nije u prolazu | trenutno bi bio promašen | crveno |
| Sigurno pogođen | Više i `poeni > granica` (BR-16) | zeleno + ✔ |
| Sigurno promašen | Manje i `poeni > granica` (BR-16) | crveno + ✘ |
| Nije ušao u igru | 0 sekundi u igri, utakmica u toku | narandžasto + "DNP?" |
| Završeno | utakmica završena, tip razrešen | konačna oznaka |
- Za tip **Više** dodatno se prikazuje "fali još X poena".
- Ukupni indikator tiketa: "Tiket živ (N/4 u prolazu)" ili "Tiket pao" (čim je jedan tip sigurno promašen ili konačno promašen).
**KP:**
- KP1: Promena poena u izvoru vidljiva je na ekranu korisnika u roku od ≤ 60 s (NFR-01).
- KP2: Prikazuje se vreme poslednjeg uspešnog osvežavanja; ako je starije od 2 min, prikazuje se upozorenje "Podaci kasne".
- KP3: Ako izvor nije dostupan, ekran ostaje funkcionalan sa poslednjim poznatim podacima.
- KP4: Statusi se razlikuju i bojom i ikonicom/tekstom (pristupačnost, NFR-10).

## FR-14 — Automatsko razrešenje tipova i tiketa
**Opis:** Po završetku utakmica sistem određuje pogodak/promašaj/poništen za svaki tip i status tiketa.
**Akter:** Sistem · **Prioritet:** M
**Preduslovi:** Utakmica tipa ima status *završena* u izvoru.
**Tok:**
1. Kada izvor označi utakmicu završenom, sistem preuzima konačni boxscore.
2. Za svaki tip te utakmice primenjuje BR-12, BR-13. Ako izvor označi utakmicu kao odloženu/otkazanu ili ona ne počne na dan kola, tip se odmah poništava (BR-14), bez čekanja.
3. Kada su razrešeni svi tipovi kola, sistem određuje status tiketa (BR-17), stvarni dobitak (BR-18) i ishod k/n (BR-19).
4. Sistem pokreće rekalkulaciju (FR-16).
5. Posle 12 h sistem ponovo proverava boxscore (BR-15) i po potrebi automatski ispravlja ishod uz audit zapis.
**KP:**
- KP1: Tip se razrešava najkasnije 10 min nakon što izvor označi utakmicu završenom.
- KP2: Tiket se označava *Gubitnim* čim je bilo koji tip konačno promašen.
- KP3: Ako za dobitan tiket sa poništenim tipom nedostaju pojedinačne kvote, kreira se zadatak za admina "Unesi stvarni dobitak" (BR-18), a statistika "ukupno dobijeno" do tada koristi procenu i označena je kao privremena.
- KP4: Ako utakmica nije označena završenom 6 h posle planiranog početka, adminu se prikazuje zadatak za ručno razrešenje (FR-15).

## FR-15 — Ručno razrešenje tipa
**Opis:** Admin ručno unosi konačne poene ili označava tip kao poništen kada automatsko razrešenje nije moguće.
**Akter:** Admin · **Prioritet:** M
**Preduslovi:** Kolo je *U toku* ili razrešeno; tip nije razrešen ili admin ispravlja automatsko razrešenje.
**Tok:**
1. Admin na tipu bira "Razreši ručno".
2. Bira: (a) unos konačnih poena, (b) "Igrač nije zaigrao (DNP)", (c) "Utakmica otkazana/odložena".
3. Unosi razlog/izvor (npr. "zvanični sajt Evrolige").
4. Sistem primenjuje BR-12…BR-14 kao kod automatskog razrešenja.
**KP:**
- KP1: Ručno razrešen tip je označen kao "ručno" i ima audit zapis.
- KP2: Automatski proces ne prepisuje ručno razrešenje; ako se API podaci razlikuju, adminu se prikazuje upozorenje.
- KP3: Ceo tok je dostupan i bez spoljnog API-ja (rezervni režim, poglavlje 7).

## FR-16 — Rekalkulacija nizova, hlađenja, vatrica i blejma
**Opis:** Posle svakog razrešenja ili ispravke sistem ažurira sve izvedene podatke.
**Akter:** Sistem · **Prioritet:** M
**Tok:**
1. Sistem učitava istoriju razrešenih tipova hronološki (po broju kola).
2. Za svakog člana računa: niz pogodaka/promašaja (BR-20), hlađenja (BR-21, BR-22), vatricu i broj vatrica (BR-23, BR-24), blejmove (BR-25).
3. Rezultat se keš-ira kao snimak (snapshot) po kolu radi brzog prikaza.
**KP:**
- KP1: Rezultat rekalkulacije od nule je identičan inkrementalnom ažuriranju (automatski test nad celom istorijom).
- KP2: Ikone ❄ i 🔥 pored imena člana su ažurne u svim prikazima odmah po razrešenju.
- KP3: Admin može pokrenuti "Ponovo izračunaj sve" iz Podešavanja.
- KP4: Primeri koje sistem mora da zadovolji (testni slučajevi):
  - Član promaši u kolima 1–5 → u kolu 6 je na hlađenju; posle kola 6 niz promašaja = 0; promašaj u kolu 7 → niz promašaja 1.
  - Član pogodi u kolima 1–3 → vatrica (broj vatrica 1); poništen u kolu 4 → vatrica ostaje; pogodak u 5 → niz 4, broj vatrica i dalje 1; promašaj u 6 → vatrica nestaje.
  - Ishod 3/4 gde je jedini promašaj tip ekipe → blejm se beleži na "Ekipu", ne na člana.
  - Član završi sezonu sa 5 promašaja zaredom → u prvom kolu nove sezone **nije** na hlađenju, niz promašaja = 0; aktivna vatrica iz prethodne sezone nestaje (BR-33).
  - Uvezena kola (FR-25) ulaze u nizove: ako poslednja 3 uvezena kola člana budu pogoci, član ulazi u prvo kolo u aplikaciji sa vatricom.

## FR-17 — Ukupna statistika
**Opis:** Pregled ukupnih finansijskih i ishodnih pokazatelja.
**Akter:** svi · **Prioritet:** M
**Sadržaj:**
- ukupno uplaćeno, ukupno dobijeno, bilans (profit/gubitak, zeleno/crveno), ROI (%);
- broj odigranih kola, broj dobitnih kola, procenat dobitnih;
- raspodela ishoda: broj i procenat kola sa 4/4, 3/4, 2/4, 1/4, 0/4 i kategorija "sa poništenim" (BR-19);
- najveći dobitak (kolo, iznos), najduži niz gubitnih tiketa;
- statistika "Ekipa" (tipovi ekipe: broj, pogođeni, %, blejmovi) (BR-26).
**KP:**
- KP1: Procenti se računaju na ukupan broj razrešenih kola i zbir u raspodeli iznosi 100% (±0,1% zbog zaokruživanja).
- KP2: Filtriranje po sezoni (podrazumevano: aktuelna sezona; opcija "Sve sezone") i po periodu od–do datuma.
- KP3: Kola koja nisu razrešena ne ulaze u statistiku.

## FR-18 — Statistika po članu
**Opis:** Pregled ličnih pokazatelja za svakog člana (tabela svih članova + detalj člana).
**Akter:** svi · **Prioritet:** M
**Sadržaj po članu:**
- broj pogođenih, broj promašenih, broj poništenih, procenat pogodaka (`pogođeni / (pogođeni + promašeni)`);
- broj blejmova (BR-25);
- broj uplata i ukupno uplaćen iznos;
- trenutni niz (npr. "3 pogotka" ili "2 promašaja"), najduži niz pogodaka, najduži niz promašaja;
- broj puta na hlađenju, broj dobijenih vatrica; trenutni status ❄/🔥;
- poslednjih 10 tipova kao niz oznaka (✔/✘/–);
- odvojeno procenat pogodaka za "Više" i za "Manje";
- najčešće birani igrači i uspeh po njima.
**KP:**
- KP1: Tipovi ekipe ne ulaze u ličnu statistiku (BR-26).
- KP2: Tabela se može sortirati po svakoj koloni.
- KP3: Filtriranje po sezoni i periodu kao u FR-17. Trenutni niz i ❄/🔥 uvek se odnose na aktuelnu sezonu (BR-33); najduži nizovi se prikazuju za izabranu sezonu, a za "Sve sezone" kao maksimum po sezonama.

## FR-19 — Blejm rang lista
**Opis:** Rang lista članova po broju puta kada su bili jedini promašaj.
**Akter:** svi · **Prioritet:** M
**Sadržaj:** pozicija, član, broj blejmova, procenat blejmova u odnosu na broj odigranih ličnih tipova, "izgubljen potencijalni dobitak" (zbir potencijalnih dobitaka tiketa koje je član "oborio"), lista kola (link na detalj).
**KP:**
- KP1: Pri istom broju blejmova, viši je onaj sa većim izgubljenim potencijalnim dobitkom.
- KP2: "Ekipa" se prikazuje kao poseban red na dnu, ako ima blejmova.

## FR-20 — Istorija kola sa filtriranjem
**Opis:** Lista svih kola sa osnovnim podacima i filterima.
**Akter:** svi · **Prioritet:** M
**Sadržaj reda:** broj kola, datum, kolo Evrolige, ishod (k/n), status (dobitan/gubitan/poništen/u toku), uplata, uplatilac, potencijalni i stvarni dobitak, ikonice (❄ ko je bio na hlađenju, "ispravljeno"), skraćeni prikaz 4 tipa sa oznakom pogodak/promašaj.
**Filteri:** period (od–do), status tiketa, ishod (4/4…0/4, sa poništenim), član (kola u kojima je član pogodio / promašio / bio blejm / bio na hlađenju), uplatilac, igrač Evrolige, tim Evrolige, smer (više/manje), kolo sa tipom ekipe.
**KP:**
- KP1: Podrazumevano sortiranje: najnovije kolo prvo; paginacija ili beskonačno skrolovanje po 20 kola.
- KP2: Filteri se mogu kombinovati; aktivni filteri su vidljivi i brišu se jednim dodirom.
- KP3: Stanje filtera je u URL-u (može se podeliti link).

## FR-21 — Detalj kola
**Opis:** Kompletan prikaz jednog kola.
**Akter:** svi · **Prioritet:** M
**Sadržaj:** broj, datum, kolo Evrolige, status, svi tipovi (član/Ekipa, igrač, tim, utakmica i rezultat, granica, smer, pojedinačna kvota, konačni poeni, minuti, ishod tipa, način razrešenja auto/ručno), uplata, ukupna kvota, uplatilac, potencijalni i stvarni dobitak, ko je bio na hlađenju, ko je dobio/izgubio vatricu u tom kolu, blejm, predlozi i glasovi za tip ekipe, audit zapisi.
**KP:**
- KP1: Dok je kolo *U toku*, detalj prikazuje live podatke (FR-13).
- KP2: Admin iz detalja pokreće akcije FR-12 i FR-15.

## FR-22 — Audit log
**Opis:** Nepromenljiv zapis svih osetljivih akcija.
**Akter:** Admin, Član (pregled; gost nema pristup, BR-35) · **Prioritet:** M
**Beleži se:** zaključavanje (ručno/auto), otključavanje, svaka ispravka posle zaključavanja, ručno razrešenje, automatska ispravka nakon ponovne provere (BR-15), korekcija stvarnog dobitka, prenos admin uloge, brisanje kola, pokretanje kompletne rekalkulacije, uvoz istorijskih kola (FR-25).
**Polja:** vreme, akter (član ili "sistem"), kolo, entitet i polje, stara vrednost, nova vrednost, razlog.
**KP:**
- KP1: Zapisi se ne mogu menjati ni brisati kroz aplikaciju.
- KP2: Lista se može filtrirati po kolu i akteru.

## ~~FR-23 — Obaveštenja~~ (povučeno)
Povučeno odlukom tima (P-20): prva verzija nema obaveštenja van aplikacije (push, Telegram, Viber). Upozorenja i zadaci za admina prikazuju se samo u aplikaciji (EKR-13). Zahtev se može vratiti u nekoj od narednih verzija.

## FR-24 — Brisanje nezaključenog kola
**Opis:** Admin može obrisati kolo otvoreno greškom.
**Akter:** Admin · **Prioritet:** T
**Preduslovi:** Kolo je *Otvoreno* (nikad zaključeno).
**Tok:** Admin bira "Obriši kolo", potvrđuje unosom broja kola; kolo se briše, broj se oslobađa (BR-03).
**KP:**
- KP1: Zaključeno ili razrešeno kolo se ne može obrisati.
- KP2: Brisanje se beleži u audit log.

## FR-25 — Uvoz istorijskih kola iz XLS/XLSX
**Opis:** Admin jednokratno uvozi kola odigrana pre aplikacije iz fajla izvezenog iz Google Sheets-a (XLS/XLSX). Uvezena kola su prava kola (BR-34).
**Akter:** Admin · **Prioritet:** M
**Preduslovi:** U aplikaciji još ne postoji nijedno kolo uneto kroz aplikaciju (BR-34); baza igrača sinhronizovana (FR-03).
**Predloženi šablon (do prijema stvarnog fajla, OP-03)** — jedan red = jedan tip, 4 reda po kolu:

| Kolona | Obavezno | Primer | Napomena |
|--------|:---:|--------|----------|
| `kolo` | ✔ | 12 | redni broj kola iz Sheets-a (služi za grupisanje redova) |
| `datum` | ✔ | 13.03.2025. | dan kola; određuje sezonu (BR-33) |
| `clan` | ✔ | Tozislav | ime člana ili `Ekipa` za tip ekipe |
| `umesto` | | Simara | samo za `Ekipa`: član na hlađenju |
| `igrac` | ✔ | Saša Vezenkov | ime i prezime igrača |
| `tim` | | Olympiacos | pomaže pri uparivanju igrača |
| `granica` | ✔ | 14,5 | x,5 (BR-09); cela granica iz starih kola se prihvata uz upozorenje |
| `tip` | ✔ | više / manje | |
| `poeni` | | 17 | konačni poeni (informativno) |
| `ishod` | ✔ | pogodak / promašaj / poništen | izvor istine za uvezena kola |
| `uplata` | ✔ | 500 | po kolu (dovoljno u prvom redu kola) |
| `kvota` | ✔ | 12,40 | ukupna kvota, po kolu |
| `uplatio` | ✔ | Lakićević | po kolu |
| `dobitak` | | 6200 | stvarni dobitak, po kolu (ako prazno — računa se po BR-18) |

**Tok:**
1. Admin u Podešavanjima (EKR-11) bira "Uvoz istorije" i otprema fajl (do 5 MB).
2. Sistem čita prvi list, prepoznaje kolone po nazivu (neosetljivo na velika slova/dijakritike) i prikazuje ekran mapiranja kolona ako se nazivi ne poklapaju sa šablonom.
3. Sistem validira podatke i prikazuje **pregled pre uvoza**: broj kola, period, greške po redovima (npr. "kolo 7 ima 3 tipa", "nepoznat član", "nevažeći ishod").
4. Za imena igrača koja se ne mogu automatski upariti sa bazom, admin bira igrača iz baze ili ga dodaje kao ručnog igrača (OP-10).
5. Admin potvrđuje uvoz; sistem kreira kola (status prema ishodima, oznaka "uvezeno"), dodeljuje brojeve 1…N hronološki i pokreće kompletnu rekalkulaciju (FR-16).
**KP:**
- KP1: Uvoz je atomičan — ili se uvezu sva kola ili nijedno.
- KP2: Uvoz nije moguć ako postoji bar jedno kolo uneto kroz aplikaciju; ponovni uvoz zamenjuje prethodno uvezena kola (uz potvrdu).
- KP3: Uvezena kola su u istoriji označena ikonicom "uvezeno"; nemaju live podatke ni audit zapise pojedinačnih izmena, već jedan zapis o uvozu.
- KP4: Svako kolo mora imati tačno 4 tipa (BR-02), a tipovi `Ekipa` moraju imati popunjeno `umesto`.
- KP5: Admin može preuzeti prazan šablon XLSX sa ispravnim nazivima kolona.
- KP6: Posle uvoza, nizovi, hlađenje i vatrice članova odgovaraju stanju iz poslednjeg uvezenog kola (FR-16 KP4).
