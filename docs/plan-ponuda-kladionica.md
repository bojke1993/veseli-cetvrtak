# Plan izmena — ponuda kladionica, izmena tipa do zaključavanja, automatsko zaključavanje

Status (16.11.2026.): odluke O-1…O-5 donete; faze 1–3 urađene (specifikacija, zatvaranje predloga, „Promeni tip”). Faze 0, 4–6 (kladionice) čekaju — vidi T-63…T-65 u docs/tasks.md.

## 1. Zahtev naručioca (16.11.2026.)

1. Za izabranog igrača aplikacija nudi kvote srpskih kladionica za to kolo, ako ih kladionice uopšte imaju u ponudi. Svaka ponuda se prikazuje sa logom i imenom kladionice.
2. Član može da promeni kvotu, granicu i izabranog igrača **sve dok se kolo ne zaključi**.
3. Kolo se **automatski zaključuje kada počne prva utakmica**.

## 2. Kako je sada (šta se menja)

| Tema | Sada | Posle izmene |
|---|---|---|
| Kvote | Samo ručni unos (P-22); OP-12 zatvoren sa „ne radi se” | Ponuda kladionica + ručni unos kao rezerva |
| Izmena tipa (član) | Član menja samo **predlog** na čekanju; posle prihvatanja menja samo admin (FR-09 KP2, REQ-09.3) | Član i posle prihvatanja može da pošalje **novi predlog** (drugi igrač, granica, smer, kvota); admin ga prihvata (O-3) |
| Izmena posle početka utakmice tipa | Igrač, granica i smer se zaključavaju; kvota ostaje izmenljiva (REQ-08.6) | Nema više tog slučaja: kolo se zaključava na početku prve utakmice |
| Automatsko zaključavanje | Na početku prve utakmice **među izabranim tipovima**, i samo ako je kolo kompletno (BR-28) | Isto pravilo (O-1, O-2); novo je da se u tom trenutku **zatvaraju predlozi članova** i prikazuje odbrojavanje |

## 3. Glavni rizik: izvor kvota (mora se proveriti pre implementacije)

Nalazi iz `docs/learnings.md` (01.11.2026.) i današnje kratke provere:

- Mozzart i Meridian nemaju javni API (Meridian vraća 401 bez tokena).
- SoccerBet odgovara bez ključa. Danas (ponedeljak) ima lige „Evroliga” i „Evroliga 2026/27”, ali nema „Evroliga Igrači”. Poeni igrača se verovatno objavljuju tek na dan utakmice, a to dosad nije provereno.
- MaxBet je danas vratio **403** (verovatno zaštita od botova).
- Server je u **Frankfurtu** (Oracle). Srpske kladionice mogu da blokiraju strane IP adrese, pa nešto što radi sa lokalnog računara ne mora da radi sa servera.
- Svi ti API-ji su nedokumentovani i mogu se promeniti bez najave. Uslovi korišćenja nisu provereni.
- Besplatni agregatori (OddsPapi) nemaju poene igrača za Evroligu niti srpske kladionice.

**Kladionice (odluka naručioca 16.11.2026.):** **Mozzart, Meridian i BalkanBet**. Ostale kladionice se ne rade.

**Predlog:** posao počinje **fazom 0 (istraživanje)** na dan kola Evrolige (uto–pet), **sa servera u Frankfurtu**. Za svaku od tri kladionice proveravamo:
1. da li ima poene igrača za Evroligu i od kada (koliko pre utakmice),
2. kojim zahtevom ih njen sajt preuzima (mrežni zahtevi web aplikacije) i da li je potreban token (Meridian je 01.11. vratio 401 bez tokena; treba proveriti da li sajt dobija anonimni token za goste),
3. da li zahtev prolazi sa VM-a (geo-blokada, zaštita od botova),
4. format (igrač, granica, kvota za više i za manje, više granica za istog igrača).

U implementaciju ulaze samo kladionice koje prođu proveru. Za one koje ne prođu ručni unos ostaje jedini način, a u UI se ne prikazuju. Ishod faze 0 se upisuje u `learnings.md`.

## 4. Predlog rešenja

### 4.1 Ponuda kladionica (novo: FR-26, BR-36, P-23; OP-12 se ponovo otvara i zatvara odlukom P-23)

**Backend**
- Novi adapter `OddsProvider` (po uzoru na `EuroleagueProvider`), sa jednom implementacijom po kladionici i lažnom (fake) implementacijom za testove. Browser nikad ne zove kladionice direktno.
- Nove tabele:
  - `bookmakers`: `code`, `name`, `logo_path`, `is_enabled`, `last_ok_at`, `last_error`.
  - `odds_offers`: `bookmaker_code`, `game_id`, `player_id`, `line`, `over_odds`, `under_odds`, `fetched_at`. Igrač može imati više granica (više redova).
- Worker posao `oddsPoll`: radi samo na dan otvorenog kola, od prvog izbora igrača do zaključavanja kola. Svaku kladionicu osvežava na **~10 min**, sa ograničenjem broja zahteva i pauzom (backoff) posle greške (403/429). Ponuda zaključanog kola se zamrzava.
- Uparivanje igrača: ime iz kladionice („Larkin S.”, „S. Larkin”) se poredi sa igračima **dva kluba sa te utakmice** preko `normalizeName(full_name)`. Neupareni se beleže u log i ne prikazuju se.
- `GET /api/rounds/:id/odds?playerId=…` vraća ponudu iz keša (javno, kao i ostali pregled).

**Frontend (EKR-04, kartica tipa)**
- Posle izbora igrača ispod polja se prikazuje blok **„Ponuda kladionica”**. Svaki red ima logo i ime kladionice, granicu, kvotu za **Više** i kvotu za **Manje**, i vreme poslednjeg osvežavanja („pre 6 min”).
- Klik na kvotu popunjava granicu, smer i kvotu. Sva polja i dalje mogu ručno da se menjaju.
- Ako ponude nema: „Nijedna kladionica trenutno nema ovog igrača u ponudi”. Ako je kladionica nedostupna: siva oznaka „ponuda nedostupna”. Ručni unos uvek radi.
- Logotipi su statični fajlovi u `web/public/kladionice/` (preuzeti sa sajtova kladionica, za privatnu upotrebu ekipe). Ako loga nema, prikazuje se značka sa imenom.
- Uz predlog i tip se čuva izvor kvote (`odds_bookmaker_code`, prazno pri ručnom unosu). Ako član ručno promeni kvotu, izvor se briše. Izvor se prikazuje u kartici tipa i detalju kola i ne utiče na obračun (O-4).
- Prikazuju se Mozzart, Meridian i BalkanBet, tj. one od njih za koje ponuda radi (O-5).

### 4.2 Izmena tipa do zaključavanja (menja FR-09, REQ-08.6, REQ-09.3)

- Dok predlozi nisu zatvoreni (4.3), član menja **igrača, granicu, smer i kvotu** svog ličnog tipa slanjem **novog predloga**, i to više puta (O-3).
- Ovo važi i kada je raniji predlog već prihvaćen: kartica prihvaćenog tipa dobija dugme „Promeni tip”, a forma je unapred popunjena trenutnim tipom.
- Do prihvatanja važi stari tip. Kartica prikazuje i stari tip i novi predlog sa oznakom „Izmena — čeka potvrdu”. Novi predlog zamenjuje prethodni predlog istog člana koji još čeka.
- Admin prihvata ili odbija izmenu. Prihvatanjem se tip menja (postojeći `acceptProposal`).
- Tip ekipe radi isto: svaki član koji nije na hlađenju može dati novi predlog i glasati, a admin bira.
- Pravila x,5, kvote ≥ 1,01 i „igrač sa utakmice dana kola” ostaju ista. Član na hlađenju i dalje ne predlaže i ne glasa.
- Posle zaključavanja ništa se ne menja kroz običan unos, samo kroz ispravku (FR-12, BR-29), kao i do sada.

### 4.3 Automatsko zaključavanje na početku prve utakmice (menja BR-28, FR-11, REQ-11)

- Trenutak zaključavanja je `scheduled_at` (ili stvarni početak, ako je raniji) **prve utakmice među izabranim tipovima** (O-1, kao i sada). Worker radi na 30 s, pa kašnjenje može biti najviše ~30 s.
- **Novo:** u tom trenutku se zatvaraju predlozi i glasanje članova. API ih odbija čak i ako worker još nije zaključao kolo.
- Ako je kolo kompletno, sistem ga zaključava. Ako nije (O-2), kolo ostaje otvoreno **samo za admina**, uz postojeće upozorenje, dok ga admin ne dopuni i zaključa. Tipovi čija je utakmica počela mogu se samo označiti kao poništeni (BR-28, kao i sada).
- Predlozi koji tada još čekaju ostaju vidljivi. Admin ih može prihvatiti (postojeći `late_accept`, sa audit zapisom), jer su dati pre početka utakmice.
- Na ekranu kola prikazuje se odbrojavanje: „Predlozi se zatvaraju za 1 h 20 min”.
- Upozorenja adminu 60 i 15 min pre početka (FR-11 KP4) ostaju. Ručno zaključavanje od strane admina pre toga ostaje moguće.

## 5. Odluke naručioca (16.11.2026.)

| ID | Pitanje | Odluka |
|---|---|---|
| **O-1** | Na početku koje utakmice se kolo zaključuje? | Na početku **prve utakmice među izabranim tipovima** (kao i sada). |
| **O-2** | Šta ako kolo tada nije kompletno? | Kolo **ostaje otvoreno samo za admina** dok ga ne dopuni i zaključa; članovi više ne mogu da menjaju. |
| **O-3** | Šta radi izmena člana? | Pravi **novi predlog** koji admin prihvata. To važi i posle prihvatanja ranijeg predloga. |
| **O-4** | Čuvati izvor kvote? | **Da**, samo kao informacija. |
| **O-5** | Koje kladionice prikazivati? | **Mozzart, Meridian i BalkanBet** (samo one koje prođu fazu 0). |

## 6. Izmene dokumentacije (redosled po CLAUDE.md)

1. `05-poslovna-pravila.md`: BR-11 (izvor kvote), BR-28 (zatvaranje predloga na početku prve utakmice tipova), nova **BR-36** (ponuda kladionica: samo informacija, ručni unos ima prednost).
2. `10-pretpostavke.md`: nova **P-23** (odluke O-1…O-5 iz odeljka 5). P-22 se dopunjuje rečenicom „praćenje ponude: vidi P-23”. OP-12 dobija napomenu da je ponovo otvoren i rešen sa P-23.
3. `04-funkcionalni-zahtevi.md`: FR-07, FR-09 (KP1/KP2: novi predlog i posle prihvatanja), FR-08 (predlozi tipa ekipe se zatvaraju na početku prve utakmice), nova **FR-26** „Ponuda kladionica za izabranog igrača”.
4. `07-integracije.md`: novi odeljak „Kladionice (`OddsProvider`)”. `06-model-podataka.md`: dve nove tabele. `08-ekrani.md`: EKR-04 (blok ponude, odbrojavanje). `09-nefunkcionalni-zahtevi.md`: novi NFR za budžet zahteva i rad kada kladionica ne odgovara.
5. `requirements.md` (REQ-08.6, REQ-09, REQ-11, novi REQ-39), `design.md`, `tasks.md`, `learnings.md`.

## 7. Plan implementacije

| Faza | Sadržaj | Testovi |
|---|---|---|
| **0** | Istraživanje izvora kvota sa VM-a na dan kola Evrolige; izbor kladionica | Upis nalaza u learnings |
| **1** | Dokumentacija (odeljak 6) | — |
| **2** | Zatvaranje predloga i glasanja na početku prve utakmice tipova + odbrojavanje u UI (automatsko zaključavanje ostaje kakvo jeste) | API test (predlog/glas posle početka → 409), worker test (kompletno/nekompletno kolo) |
| **3** | „Promeni tip” posle prihvatanja: novi predlog, prikaz starog tipa i izmene na čekanju | API testovi (predlog posle prihvatanja, zamena predloga na čekanju, hlađenje, zaključano kolo), UI test |
| **4** | `OddsProvider` + migracija `003_odds` (uklj. `odds_bookmaker_code` na `picks`/`proposals`) + `oddsPoll` + endpoint | unit testovi parsera na snimljenim odgovorima (fixtures), uparivanje imena, budžet zahteva |
| **5** | UI blok „Ponuda kladionica” + logotipi | komponentni test (klik popunjava polja, prazno stanje, nedostupna kladionica) |
| **6** | Deploy, praćenje prvog kola uživo, dopuna learnings | — |

Faze 2 i 3 ne zavise od faze 0 i mogu da se isporuče odmah. Faze 4 i 5 zavise od ishoda faze 0.
