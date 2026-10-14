# Početni podaci — istorija kola

**Izvor:** `Veseli cetvrtak.xlsx` (Google Sheets), listovi `EL 2526` (38 kola, 04.12.2025. – 07.04.2026.) i `EL 2627` (7 kola, 24.09. – 09.10.2026.).
**Uvezeno:** 15.10.2026. — 45 kola, 180 tipova (lokalna baza). Fajl u formatu šablona aplikacije: [`istorija-za-uvoz.xlsx`](istorija-za-uvoz.xlsx) (igrači su označeni Evroliga ID-jem, npr. `Sylvain Francisco [013001]`).

> **Na produkciji (VM):** igrači iz 2025/26 kojih više nema u Evroligi ne postoje u novoj bazi, pa ih ekran za uvoz ne bi automatski prepoznao. Istoriju zato uvesti istom skriptom (`server/scripts/load-history.ts`), koja ih prvo doda kao neaktivne — to je deo koraka deploy-a.

## Kako je tabela protumačena

| U tabeli | U aplikaciji |
|----------|--------------|
| Kolone Tozislav / Ivanisevic / Lakicevic / Simara | lični tipovi tih članova |
| `Francisco 15.5- (18)` | igrač, granica 15,5, **−** = manje, **+** = više, (poeni) |
| Zelena / crvena / žuta ćelija | pogodak / promašaj / poništen (igrač nije igrao) |
| `Uplatio`: Simke, Laki, Ivan, Toza | Simara, Lakićević, Ivanišević, Tozislav |
| `Dobitak` u 2026/27 | potencijalni dobitak → kvota = dobitak / uplata (zaokruženo na 2 decimale) |
| `Dobitak` u 2025/26 | stvarni dobitak; za dobitna kola kvota = dobitak / uplata |
| `Kolo (dan)`, npr. `14 (T1)` | kolo Evrolige (informativno), određeno iz stvarnih utakmica tog dana |

## Odluke (potvrđeno 15.10.2026.)

- **2025/26 nema uplatioca, granica ni kvota gubitnih kola** → ostavljeno prazno. Ukupne uplate, dobici i bilans su tačni; statistika „ko je koliko uplatio“ počinje od 2026/27.
- **Hlađenje u 2025/26 nije postojalo** (npr. Tozislav 6 promašaja zaredom bez pauze) → uvezena kola se ne prijavljuju kao „nekonzistentno hlađenje“. Nizovi i vatrice se računaju; nova sezona ih ionako resetuje.
- **15.01.2026. Lakićević „Butler“ bez +/−** → više.

## Provera

Svi tipovi su provereni prema zvaničnim boxscore-ovima Evrolige za taj dan:
- svaka boja (pogodak/promašaj) u 2026/27 odgovara zvaničnim poenima i granici;
- svaki žuti (poništen) tip odgovara igraču koji nije igrao (DNP ili nije bio u sastavu);
- zbirovi se poklapaju sa tabelom (2025/26: uplaćeno 26.200, dobijeno 39.200, profit +13.000; 2026/27: −3.500).

Razlike koje ne menjaju ishod (u aplikaciji su upisani zvanični poeni): Gudurić 25.09. (tabela 18, zvanično 17), Carter 01.10. (10 / 11), Gabriel 09.10. (12 / 14).

Zbirne formule u tabeli za 2025/26 obuhvataju 37 kola — kolo 07.04.2026. nije uračunato; aplikacija ga računa.

## Uparivanje igrača

Igrači su upareni sa pravim igračima Evrolige preko boxscore-a utakmica tog dana (fonetsko poređenje imena + poeni gde su upisani). Igrači iz prošle sezone kojih više nema u Evroligi dodati su kao neaktivni (sa Evroliga ID-jem). Skripta: `server/scripts/load-history.ts`.

| Upisano u tabeli | Igrač (Evroliga) | Puta | Napomena |
|---|---|---|---|
| Angola | Braian Angola | 1 |  |
| Avramovic | Aleksa Avramovic | 1 |  |
| Babb | Nick Weiler-Babb | 1 |  |
| Badio | Brancou Badio | 2 |  |
| Bertans | Davis Bertans | 1 |  |
| Blakeney | Antonio Blakeney | 2 |  |
| Blat | Tamir Blatt | 1 |  |
| Blatt | Tamir Blatt | 1 |  |
| Blossomgame | Jaron Blossomgame | 1 |  |
| Bolomboj | Joel Bolomboy | 2 |  |
| Bonga | Isaac Bonga | 1 |  |
| Brooks | Armoni Brooks | 1 |  |
| Bruno | Bruno Fernando | 3 |  |
| Butler | Jared Butler | 4 |  |
| C. Jones | Chris Jones | 1 |  |
| Calathes | Nick Calathes | 3 |  |
| Carter | Tyson Carter | 1 |  |
| Chris Jones | Chris Jones | 1 |  |
| Clark | Jimmy Clark Iii | 1 |  |
| CMM | Codi Miller-Mcintyre | 1 |  |
| De Kolo | Nando De Colo | 1 |  |
| Dimitrijevic | Neno Dimitrijevic | 1 |  |
| Dinvidi | Spencer Dinwiddie | 2 |  |
| DJ Stewart | Dj Stewart | 1 |  |
| Dobric | Ognjen Dobric | 1 |  |
| Dorsey | Tyler Dorsey | 2 |  |
| E. Bryant | Elijah Bryant | 3 |  |
| Edwards | Carsen Edwards | 1 |  |
| Faried | Kenneth Faried | 1 |  |
| Feliz | Andres Feliz | 1 |  |
| Forest | Trent Forrest | 2 |  |
| Forrest | Trent Forrest | 1 |  |
| Fournier | Evan Fournier | 6 |  |
| Francisco | Sylvain Francisco | 1 |  |
| Francisko | Sylvain Francisco | 2 |  |
| Gabriel | Wenyen Gabriel | 1 |  |
| Gos | Nigel Williams-Goss | 1 |  |
| Guduric | Marko Guduric | 1 |  |
| Hall | Devon Hall | 1 |  |
| Hayes-Davis | Nigel Hayes-Davis | 2 |  |
| Hezonja | Mario Hezonja | 3 |  |
| Hifi | Nadir Hifi | 1 |  |
| Horton-Tucker | Talen Horton Tucker | 1 |  |
| Huanco | Juancho Hernangomez | 1 |  |
| I. Mike | Isiaha Mike | 1 |  |
| Izundu | Ebuka Izundu | 3 |  |
| Jekiri | Tonye Jekiri | 2 |  |
| Jessup | Justinian Jessup | 1 |  |
| K. Hayes | Kevarrius Hayes | 3 |  |
| Kalinic | Nikola Kalinic | 1 |  |
| Kampaco | Facundo Campazzo | 3 |  |
| Kodi | Codi Miller-Mcintyre | 1 |  |
| Kurucs | Rodions Kurucs | 1 |  |
| L. Walker | Lonnie Walker Iv | 2 |  |
| Lessort | Mathias Lessort | 1 |  |
| Lucic | Vladimir Lucic | 2 |  |
| Lundberg | Iffe Lundberg | 2 |  |
| Luwawu | Timothe Luwawu-Cabarrot | 1 |  |
| Luwawu-Cabarrot | Timothe Luwawu-Cabarrot | 1 |  |
| M'Baye | Amath M'baye | 1 |  |
| Maledon | Theo Maledon | 2 |  |
| Mck. Wirght | Mckinley Wright Iv | 1 |  |
| Mck. Wright | Mckinley Wright Iv | 3 |  |
| Milton | Shake Milton | 1 |  |
| Milutinov | Nikola Milutinov | 2 |  |
| Mirotic | Nikola Mirotic | 1 |  |
| Mitoglou | Konstantinos Mitoglou | 1 |  |
| Moneke | Chima Moneke | 3 |  |
| Montero | Jean Montero | 1 |  |
| Motiejunas | Donatas Motiejunas | 1 |  |
| Motley | Johnathan Motley | 1 |  |
| Ndiaye | Mbaye Ndiaye | 1 |  |
| Nebo | Josh Nebo | 1 |  |
| Nedovic | Nemanja Nedovic | 1 |  |
| Nunn | Kendrick Nunn | 3 |  |
| Nwora | Jordan Nwora | 3 |  |
| Obst | Andreas Obst | 6 |  |
| Odzelej | Semi Ojeleye | 1 |  |
| Omoruyi | Eugene Omoruyi | 1 |  |
| Osman | Cedi Osman | 2 |  |
| Oturu | Dan Oturu | 4 |  |
| Ouattara | Yakuba Ouattara | 2 |  |
| Parra | Joel Parra | 1 |  |
| Peters | Alec Peters | 1 |  |
| Petrusev | Filip Petrusev | 1 |  |
| PJ Dozier | Pj Dozier | 1 |  |
| Punter | Kevin Punter | 2 |  |
| Rhoden | Jared Rhoden | 1 | ručno potvrđeno |
| Robinson | Justin Robinson | 1 |  |
| Saint-Supery | Mario Saint-Supery | 1 |  |
| Saric | Dario Saric | 1 |  |
| Shengelia | Tornike Shengelia | 3 |  |
| Slukas | Kostas Sloukas | 1 |  |
| Smailagic | Alen Smailagic | 3 |  |
| Sorkin | Roman Sorkin | 6 |  |
| Sterling | Sterling Brown | 1 |  |
| Strazel | Matthew Strazel | 2 |  |
| Tavares | Walter Tavares | 1 |  |
| Tawares | Walter Tavares | 1 |  |
| Taylor | Kameron Taylor | 1 |  |
| Thies | Daniel Theis | 2 | ručno potvrđeno |
| Thompson | Darius Thompson | 1 |  |
| TJ Shorts | Tj Shorts | 1 |  |
| Tubelis | Azuolas Tubelis | 1 |  |
| Tyrique Jones | Tyrique Jones | 1 |  |
| Valančiunas | Jonas Valanciunas | 1 |  |
| Vezenkov | Sasha Vezenkov | 2 |  |
| Voigtmann | Johannes Voigtmann | 1 |  |
| W. Hernangomez | Willy Hernangomez | 1 |  |
| Walkup | Thomas Walkup | 1 |  |
| Washington | Duane Washington | 2 |  |
| Weiler-Babb | Nick Weiler-Babb | 1 |  |
