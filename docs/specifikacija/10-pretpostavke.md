# 10. Odluke, pretpostavke i otvorena pitanja

## 10.1 Odluke tima (intervju 14.10.2026.)

Pitanja iz prvobitne specifikacije razrešena su intervjuom sa naručiocem. Status **✅ Potvrđeno** = tim je prihvatio predlog; **✏️ Promenjeno** = tim je izabrao drugačije pravilo od predloženog.

| ID | Pitanje | Odluka | Status | Pravila |
|----|---------|--------|--------|---------|
| **P-01** | Šta ako izabrani igrač ne zaigra (povreda, DNP)? | Tip se **poništava** (kvota 1,00): ne računa se ni kao pogodak ni kao promašaj i ne utiče na nizove. Tiket se računa nad preostalim tipovima. Ako je igrač ušao makar na sekund, tip važi normalno. | ✅ Potvrđeno | BR-13 |
| **P-02** | Šta ako je utakmica otkazana ili odložena? | Ako utakmica ne počne na dan kola, tip se **odmah poništava** i kolo se razrešava bez čekanja. | ✅ Potvrđeno | BR-14 |
| **P-03** | Šta ako su poeni tačno jednaki celoj granici? | **Cela granica je zabranjena** — dozvoljene su samo granice x,5, pa slučaj ne može da nastane. | ✏️ Promenjeno (predlog je bio poništavanje) | BR-09, BR-12 |
| **P-04** | Kako se računa potencijalni dobitak? | **Uplata × ukupna kvota tiketa** (kako piše na tiketu). Pojedinačne kvote su opcione — služe za proveru i za obračun kada je neki tip poništen: `uplata × ukupna kvota / kvota poništenog tipa`. Bez pojedinačnih kvota admin ručno unosi stvarni dobitak. | ✅ Potvrđeno | BR-11, BR-18 |
| **P-05** | Kome se pripisuje 4. tip koji ekipa bira umesto člana na hlađenju? | Pripisuje se **"Ekipi"**, ne nijednom članu. Ne ulazi u lične statistike, nizove, vatrice ni hlađenja nikoga. Ulazi u ishod tiketa, ukupnu statistiku i zasebnu statistiku "Ekipa". | ✅ Potvrđeno | BR-26 |
| **P-06** | Da li se niz promašaja resetuje nakon odsluženog hlađenja? | **Da, na 0.** Za novo hlađenje potrebno je ponovo 5 uzastopnih promašaja. | ✅ Potvrđeno | BR-22 |
| **P-07** | Kako se broje dobijene vatrice? | **Jedna po nizu**: vatrica se dobija kada niz pogodaka dostigne 3; nastavak niza ne donosi novu. Poništen tip ne gasi vatricu. | ✅ Potvrđeno | BR-23, BR-24 |
| **P-08** | Šta je kolo u aplikaciji? | **Jedno veče (dan)** — bilo koji dan koji admin izabere; svi tipovi moraju biti sa utakmica tog dana. Kolo Evrolige se beleži informativno. | ✏️ Promenjeno (predlog je bio proizvoljan skup utakmica) | BR-07 |
| **P-09** | Kako admin ispravlja grešku posle zaključavanja? | Otključavanje celog kola samo dok **nijedna utakmica nije počela**; kasnije samo **ciljana ispravka** pojedinačnog polja ili ručno razrešenje, uz obavezan razlog i audit zapis. Statistika se rekalkuliše automatski. | ✅ Potvrđeno | BR-28, BR-29, BR-30 |
| **P-10** | Da li se blejm računa ako je neki tip poništen? | **Da** — blejm je kada je tiket pao zbog tačno jednog promašaja koji je lični tip člana (npr. 2/3 +1 poništen). Ako je jedini promašaj tip ekipe, blejm ide "Ekipi". | ✅ Potvrđeno | BR-25 |
| **P-11** | Ko je administrator i da li ostali imaju naloge? | Administrator je **Ivanišević** (može preneti ulogu). Svi članovi imaju sopstvene naloge: pregled svega, predlog sopstvenog tipa, predlog i glasanje za tip ekipe. Konačan unos i zaključavanje radi samo admin. | ✅ Potvrđeno | BR-32, poglavlje 2 |
| **P-12** | Šta ako je više članova istovremeno na hlađenju? | **Po jedan tip ekipe za svakog** člana na hlađenju; biraju ga članovi koji nisu na hlađenju. Tiket uvek ima 4 tipa. Ako su svi na hlađenju, sva 4 tipa su tipovi ekipe koje unosi admin u dogovoru sa svima. | ✅ Potvrđeno | BR-02, FR-08 |
| **P-13** | Šta je izvor istine za poene? | Zvanični konačni boxscore Evrolige (uključujući produžetke), uz ponovnu proveru posle 12 h i automatsku ispravku ako se podaci promene. | pretpostavka (nije posebno razmatrano) | BR-15 |
| **P-14** | Valuta i dugovanja? | Svi iznosi u **RSD**. Aplikacija **ne vodi** ko kome duguje (van prve verzije). | ✅ Potvrđeno | BR-31 |
| **P-15** | Da li se nizovi, hlađenja i vatrice resetuju na početku nove sezone? | **Da, reset** nizova, aktivne vatrice i zakazanog hlađenja. Kumulativne statistike ostaju i prikazuju se po sezoni i ukupno. | ✏️ Promenjeno (predlog je bio prenos) | BR-33 |
| **P-16** | Da li dva člana mogu izabrati istog igrača u istom kolu? | **Ne.** | ✅ Potvrđeno | BR-06 |
| **P-17** | Uvoz istorijskih kola? | Tim ima istoriju u Google Sheets; uvozi se kao **XLS/XLSX**. Uvezena kola su **prava kola** (ulaze u nizove, hlađenja, vatrice, blejm). | ✅ Odlučeno | BR-34, FR-25 |
| **P-18** | Javni pregled bez prijave? | **Da, samo pregled** (bez audit loga, bez izmena). | ✏️ Promenjeno (predlog je bio isključeno) | BR-35, poglavlje 2 |
| **P-19** | Automatsko zaključavanje kada admin zaboravi? | **Da** — ako je kolo kompletno, sistem ga zaključava u trenutku početka prve utakmice. | ✅ Potvrđeno | BR-28 |
| **P-20** | Obaveštenja (Telegram, push, Viber)? | **Bez obaveštenja** u prvoj verziji. Upozorenja adminu prikazuju se samo u aplikaciji (EKR-13). | ✅ Odlučeno | FR-23 (povučeno) |
| **P-21** | Budžet za hosting i API? | **Besplatno**: besplatni hosting i besplatni Euroleague API; ručni unos kao rezerva. Plaćeni API samo uz novu odluku tima. | ✅ Odlučeno | NFR-23, poglavlje 7 |

## 10.2 Ostale pretpostavke
- Tipovi se igraju isključivo na **poene** igrača (ne skokove, asistencije, PRA…).
- Tiket uvek ima tačno 4 tipa (nema sistema ni dodatnih parova).
- Aplikacija pokriva samo **Evroligu** (ne Evrokup, ABA ligu, NBA).
- Kvote unosi admin ručno sa tiketa; nema integracije sa kladionicama.
- Novo kolo se otvara tek kad je prethodno razrešeno (BR-05) — dva kola ne mogu biti aktivna istovremeno.
- Sezona Evrolige određuje se po danu kola: sezona `E{godina}` traje od početka regularnog dela (oktobar) do kraja Fajnal-fora (maj/jun).

## 10.3 Otvorena pitanja

| ID | Pitanje | Uticaj | Status |
|----|---------|--------|--------|
| ~~OP-01~~ | ~~Javni pregled bez prijave~~ | | Rešeno → P-18 |
| ~~OP-02~~ | ~~Kanal obaveštenja~~ | | Rešeno → P-20 |
| **OP-03** | **Tačan format XLS fajla sa istorijom** (kolone, način zapisa igrača, granice, ishoda, uplate). Tim šalje primer fajla naknadno. | FR-25 | ⏳ Čeka fajl. Do tada važi predloženi šablon iz FR-25; mapiranje kolona se dorađuje kada fajl stigne. |
| **OP-04** | Da li u budućnosti igrati i na druga takmičenja (Evrokup, ABA, NBA)? | integracije, model | Van obima v1; model pripremljen preko koda takmičenja/sezone. |
| ~~OP-05~~ | ~~Obračun dugovanja~~ | | Rešeno → P-14 (van v1) |
| ~~OP-06~~ | ~~Isti igrač dvaput u kolu~~ | | Rešeno → P-16 |
| ~~OP-07~~ | ~~Reset na novoj sezoni~~ | | Rešeno → P-15 |
| ~~OP-08~~ | ~~Budžet~~ | | Rešeno → P-21 |
| ~~OP-09~~ | ~~Potvrda pretpostavki~~ | | Rešeno intervjuom 14.10.2026. |
| **OP-10** | Kako u uvezenim kolima prepoznati igrače čije ime u Sheets-u ne odgovara bazi Evrolige (nadimci, skraćenice, igrači iz ranijih sezona)? | FR-25 | Predlog: ekran za ručno uparivanje nepoznatih imena pri uvozu. |
| **OP-11** | Da li uvezena kola iz ranijih sezona ulaze u statistiku "po sezoni" — tj. da li Sheets sadrži datume kola? | FR-25, BR-33 | Zavisi od fajla (OP-03). |
