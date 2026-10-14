# 5. Poslovna pravila

> Pravila označena sa **(P-xx)** proističu iz odluka tima zabeleženih u poglavlju 10 (potvrđeno na intervjuu 14.10.2026.).

## 5.1 Tim i kolo

**BR-01 — Sastav tima.** Tim ima tačno četiri člana: Ivanišević, Tozislav, Lakićević, Simara. Sistem ne dozvoljava dodavanje ni brisanje članova.

**BR-02 — Sastav tiketa.** Svako kolo ima tačno 4 tipa:
- po jedan **lični tip** za svakog člana koji nije na hlađenju,
- po jedan **tip ekipe** za svakog člana koji jeste na hlađenju (P-12).

**BR-03 — Broj kola.** Redni broj kola dodeljuje sistem: `max(postojeći broj) + 1`. Ne može se uneti ručno. Ako se nezaključeno kolo obriše, njegov broj se ponovo koristi.

**BR-04 — Datum kola.** Datum i vreme otvaranja beleže se automatski (vremenska zona Europe/Belgrade) i ne mogu se menjati.

**BR-05 — Jedno aktivno kolo.** Novo kolo može da se otvori tek kada je prethodno kolo **razrešeno** (dobitno, gubitno ili poništeno). Razlog: hlađenje u novom kolu zavisi od ishoda prethodnog.

**BR-06 — Jedinstven igrač u kolu (P-16).** Isti igrač Evrolige ne može se pojaviti u dva tipa istog kola.

**BR-07 — Kolo = jedno veče (P-08).** Kolo u aplikaciji obuhvata utakmice Evrolige **jednog dana** (večeri), koji admin bira pri otvaranju kola ("dan kola"; bilo koji dan u nedelji). Svi tipovi kola moraju biti sa utakmica zakazanih tog dana (po vremenu Europe/Belgrade). Tipovi mogu biti na različitim utakmicama tog dana. Uz kolo se automatski beleži i kolo Evrolige, samo informativno.

**BR-08 — Utakmica u budućnosti.** Tip se može uneti ili izmeniti samo za utakmicu koja još nije počela.

## 5.2 Unos tipa i tiketa

**BR-09 — Granica (P-03).** Granica je pozitivan broj oblika **x,5** (npr. 0,5; 9,5; 14,5). **Cela granica nije dozvoljena**, pa ishod "poeni tačno jednaki granici" ne može da nastane.

**BR-10 — Uplata i uplatilac.** Uplata je pozitivan iznos u RSD sa najviše 2 decimale (BR-31). Uplatilac je tačno jedan od četiri člana (može biti i član na hlađenju).

**BR-11 — Potencijalni dobitak (P-04).** `potencijalni dobitak = uplata × ukupna kvota`.
- Admin unosi **ukupnu kvotu** tiketa kako je navedena na tiketu kladionice (obavezno).
- **Pojedinačne kvote** tipova su opcione. Ako su unete sve četiri, sistem prikazuje njihov proizvod i upozorava ako se od ukupne kvote razlikuje više od 2% (kladionice ponekad zaokružuju ili primenjuju bonus).
- Za obračun važi ukupna kvota.

## 5.3 Razrešenje tipa

**BR-12 — Pogodak / promašaj.** Na osnovu konačnog broja poena igrača na utakmici (uključujući produžetke):
- smer **Više**: pogodak ako `poeni > granica`, promašaj ako `poeni < granica`;
- smer **Manje**: pogodak ako `poeni < granica`, promašaj ako `poeni > granica`;
- jednakost nije moguća jer je granica uvek x,5 (BR-09).

**BR-13 — Igrač nije zaigrao (P-01).** Ako igrač nije ulazio u igru (DNP, povreda, nije na spisku — 0 odigranih sekundi), tip je **poništen** (kvota 1,00). Ako je igrač ušao makar na kratko, tip se razrešava normalno (i sa 0 poena).

**BR-14 — Otkazana / odložena utakmica (P-02).** Ako utakmica tipa ne počne na dan kola (odložena za drugi dan ili otkazana), tip se **odmah poništava** i kolo se razrešava bez čekanja. Utakmica koja je počela na dan kola, a završila se posle ponoći, razrešava se normalno. Prekinuta utakmica koja nije završena istog dana poništava se.

**BR-15 — Izvor istine za poene (P-13).** Ishod se određuje po zvaničnom konačnom boxscore-u Evrolige. Sistem razrešava tip kada API označi utakmicu završenom, a zatim ponovo proverava podatke posle 12 sati; ako se poeni razlikuju (statistička korekcija) i to menja ishod, sistem automatski ispravlja ishod i upisuje zapis u audit log.

**BR-16 — "Sigurno" stanje tokom utakmice.** Poeni ne mogu da opadnu, pa:
- tip **Više** je *sigurno pogođen* čim `poeni > granica`;
- tip **Manje** je *sigurno promašen* čim `poeni > granica`.
Ova stanja se prikazuju odmah (FR-13), ali se konačno razrešenje i dalje beleži tek po završetku utakmice.

## 5.4 Razrešenje tiketa

**BR-17 — Status tiketa.**
- **Dobitan**: nema nijednog promašaja i bar jedan tip je pogođen.
- **Gubitan**: bar jedan tip je promašen.
- **Poništen**: sva četiri tipa su poništena (uplata se vraća).
Tiket može dobiti status *Gubitan* i pre kraja svih utakmica, čim je neki tip konačno promašen; statistika nizova se ipak ažurira tek po razrešenju svakog pojedinačnog tipa.

**BR-18 — Stvarni dobitak (P-04).**
- Dobitan tiket bez poništenih tipova: `stvarni dobitak = potencijalni dobitak`.
- Dobitan tiket sa poništenim tipom: ako su poznate pojedinačne kvote, `stvarni dobitak = uplata × ukupna kvota / proizvod kvota poništenih tipova`; u suprotnom admin mora da unese stvarni dobitak (sistem prikazuje zadatak "Unesi stvarni dobitak").
- Gubitan: 0. Poništen: jednako uplati.
- Admin uvek može ručno korigovati stvarni dobitak uz obavezan razlog (audit).

**BR-19 — Ishod kola (k/n).** Ishod se izražava kao `pogođeno / važećih`, npr. `3/4` ili `3/3 (+1 poništen)`. U raspodeli ishoda 4/4…0/4 (FR-17) računaju se samo kola sa 4 važeća tipa; kola sa poništenim tipom prikazuju se u posebnoj kategoriji "sa poništenim".

## 5.5 Nizovi, hlađenje, vatrica, blejm

**BR-20 — Niz.** Niz člana računa se nad njegovim **ličnim** tipovima, hronološki po broju kola. Pogodak produžava niz pogodaka i prekida niz promašaja i obrnuto. **Poništen tip i kolo na hlađenju ne menjaju niz** (ni produžavaju ni prekidaju). Nizovi se računaju unutar jedne sezone (BR-33).

**BR-21 — Ulazak na hlađenje.** Kada niz promašaja člana dostigne **5**, član ide na hlađenje u **sledećem** kolu: ne bira lični tip, umesto njega se igra tip ekipe. Hlađenje traje tačno jedno kolo.

**BR-22 — Izlazak sa hlađenja (P-06).** Po završetku kola u kome je član bio na hlađenju, njegov niz promašaja se **resetuje na 0**. Za novo hlađenje potrebno je ponovo 5 uzastopnih promašaja.

**BR-23 — Vatrica.** Član ima aktivnu vatricu dok mu je niz pogodaka ≥ 3. Vatrica se gubi pri prvom sledećem ličnom promašaju. Poništen tip ne gasi vatricu.

**BR-24 — Brojanje vatrica (P-07).** "Broj dobijenih vatrica" raste za 1 svaki put kada niz pogodaka dostigne tačno 3. Nastavak istog niza (4, 5, …) ne donosi novu vatricu.

**BR-25 — Blejm (P-10).** Član dobija blejm kada je tiket **gubitan zbog tačno jednog promašaja**, a taj promašaj je njegov lični tip. Tipično je to ishod 3/4; pravilo važi i za ishod sa poništenim tipom (npr. 2/3 +1 poništen). Ako je jedini promašaj tip ekipe, blejm se beleži na "Ekipu".

**BR-26 — Tip ekipe (P-05).** Tip ekipe ulazi u ishod tiketa i ukupnu statistiku, ali **ne** ulazi u lične statistike, nizove, vatrice ni hlađenja nijednog člana. Za ekipu se vodi zasebna statistika (broj tipova, pogodaka, blejmova).

**BR-27 — Izbor tipa ekipe.** Tip ekipe predlažu i usaglašavaju članovi koji nisu na hlađenju (FR-08); konačan unos vrši admin. Član na hlađenju ne može predlagati tip ekipe niti svoj lični tip u tom kolu.

## 5.6 Zaključavanje i ispravke

**BR-28 — Zaključavanje.** Po zaključavanju glasanja izbori, uplata, kvota i uplatilac se ne mogu menjati kroz standardni unos. Ako admin ne zaključa kolo, a sva 4 tipa su kompletna, sistem ga **automatski zaključava** u trenutku početka prve utakmice kola. Ako tipovi nisu kompletni u tom trenutku, sistem prikazuje upozorenje adminu u aplikaciji (EKR-13), a tipovi čija je utakmica počela više se ne mogu uneti (takvi tipovi se mogu samo označiti kao poništeni).

**BR-29 — Ispravka posle zaključavanja (P-09).**
1. **Otključavanje** celog kola dozvoljeno je samo dok nijedna utakmica tog kola nije počela.
2. Kada je bar jedna utakmica počela, dozvoljena je samo **ciljana ispravka**: ispravka greške u unosu (pogrešan igrač, granica, smer, iznos, kvota, uplatilac) ili ručno razrešenje tipa. Ispravka igrača/granice/smera dozvoljena je samo ako se dokaže greška u unosu (tiket kladionice), jer se tako evidentira stvarno odigrani tiket.
3. Svaka ispravka zahteva tekstualni razlog i upisuje se u audit log (staro → novo, ko, kada).
4. Ispravka pokreće rekalkulaciju (BR-30).

**BR-30 — Izvedena statistika.** Sve statistike, nizovi, hlađenja, vatrice i blejmovi su izvedeni podaci koji se mogu u svakom trenutku izračunati od nule iz istorije kola. Svaka izmena ishoda pokreće rekalkulaciju od izmenjenog kola nadalje. Ako rekalkulacija promeni status hlađenja za kolo koje je već zaključeno, sistem **ne menja** sastav tog kola, već ga označava upozorenjem "nekonzistentno hlađenje" koje admin mora da potvrdi.

## 5.7 Ostalo

**BR-31 — Valuta (P-14).** Svi iznosi su u RSD, prikaz sa separatorom hiljada i 2 decimale (npr. 1.250,00 RSD).

**BR-32 — Administrator.** U svakom trenutku postoji tačno jedan administrator (Ivanišević). Uloga se prenosi samo akcijom aktuelnog administratora (P-11).

**BR-33 — Reset na početku sezone (P-15).** Na početku nove sezone Evrolige (prvo kolo čiji dan kola pripada novoj sezoni) za sve članove se resetuju: niz pogodaka, niz promašaja, aktivna vatrica i zakazano hlađenje (član koji je sezonu završio sa 5 promašaja zaredom **ne** ide na hlađenje u prvom kolu nove sezone). Kumulativne statistike (ukupno pogodaka, blejmova, vatrica, hlađenja…) se ne brišu — prikazuju se ukupno i po sezoni. Najduži nizovi se vode po sezoni i ukupno (maksimum svih sezona).

**BR-34 — Uvezena istorijska kola (P-17).** Kola uvezena iz XLS fajla (FR-25) tretiraju se kao prava kola: ulaze u svu statistiku, nizove, hlađenja, vatrice i blejm, i podležu istim pravilima BR-12…BR-33. Pošto nemaju live podatke, njihov ishod tipa (pogodak/promašaj/poništen) uzima se iz fajla. Uvoz je dozvoljen samo dok u aplikaciji ne postoji nijedno kolo uneto kroz aplikaciju; ponovljeni uvoz zamenjuje ceo prethodno uvezeni skup. Uvezena kola dobijaju brojeve 1…N hronološki po datumu, a prvo kolo otvoreno u aplikaciji dobija N+1 (BR-03).

**BR-35 — Javni pregled (P-18).** Svi podaci osim audit loga dostupni su za pregled bez prijave, preko javnog linka. Bez prijave nije moguća nijedna izmena, predlog ni glasanje.
