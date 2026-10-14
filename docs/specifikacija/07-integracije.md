# 7. Integracije sa spoljnim API-jem

## 7.1 Potrebni podaci
| Potreba | Koristi se u | Učestalost |
|---------|--------------|------------|
| Baza igrača (ime, klub, pozicija, slika) | FR-03, FR-06 | 1× dnevno + na zahtev |
| Raspored utakmica (gameCode, timovi, termin, status) | FR-04, FR-05, FR-07 | 1× dnevno; na dan utakmice na 15 min |
| Live boxscore (poeni, minuti po igraču, rezultat, četvrtina) | FR-13 | na 30 s tokom utakmica sa tipom |
| Konačni boxscore | FR-14 | po završetku + ponovna provera posle 12 h |

## 7.2 Preporučeni izvor: javni Euroleague API (api-live.euroleague.net / live.euroleague.net)

Euroleague Basketball koristi javno dostupan API za sopstveni sajt i aplikacije. Nema autentifikacije ni API ključa.
Postoji Swagger dokumentacija: `https://api-live.euroleague.net/swagger/index.html`.
API **nije zvanično podržan za treće strane**: nema SLA, nema objavljenog rate limita i struktura se može promeniti bez najave.
Koriste ga open-source biblioteke (npr. Python `euroleague-api` — giasemidis/euroleague_api, R `euroleaguer`), što potvrđuje stabilnost u praksi.

Kod takmičenja: `E` = Evroliga (`U` = Evrokup). Kod sezone: `E` + početna godina, npr. **`E2026`** za sezonu 2026/27.

### Endpointi

> Oznaka ✅ = potvrđeno u izvornom kodu open-source biblioteka; ⚠️ = potrebno verifikovati u Swagger-u pre implementacije.

| Namena | Metod i putanja | Status |
|--------|-----------------|--------|
| Utakmice sezone po kolu | `GET https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/games?roundNumber={n}` | ✅ |
| Rezultati / gameCode-ovi sezone (stariji v1) | `GET https://api-live.euroleague.net/v1/results?seasonCode=E2026` | ✅ (putanja), ⚠️ parametri |
| Podaci o konkretnoj utakmici (v3) | `GET https://api-live.euroleague.net/v3/competitions/E/seasons/E2026/games/{gameCode}/{resurs}` | ✅ šablon, ⚠️ nazivi resursa (npr. `stats`) |
| Klubovi | `GET https://api-live.euroleague.net/v2/clubs` | ⚠️ |
| Igrači/osobe u sezoni (roster) | `GET https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/people` (filtrirati na tip "igrač") | ⚠️ |
| Statistika igrača sezone | `GET https://api-live.euroleague.net/v3/competitions/E/statistics/players/traditional?seasonCode=E2026` | ⚠️ (rezervni izvor spiska igrača) |
| **Live / konačni boxscore** | `GET https://live.euroleague.net/api/Boxscore?gamecode={gameCode}&seasoncode=E2026` | ✅ |
| Zaglavlje utakmice (rezultat, četvrtina, vreme, status) | `GET https://live.euroleague.net/api/Header?gamecode={gameCode}&seasoncode=E2026` | ⚠️ |
| Play-by-play (nije neophodan) | `GET https://live.euroleague.net/api/PlayByPlay?gamecode={gameCode}&seasoncode=E2026` | ⚠️ |

**Boxscore odgovor (`live.euroleague.net/api/Boxscore`)** sadrži ključeve `Stats` (po timu, lista igrača sa poenima, minutima…), `ByQuarter`, `EndOfQuarter`. Iz liste igrača koriste se: identifikator igrača, ime, `Points`, `Minutes`. Mapiranje igrača Boxscore → PLAYER radi se po `external_id` (person code), a rezervno po normalizovanom imenu + klubu.

### Ograničenja i pravila korišćenja
- **Autentifikacija:** nije potrebna.
- **Rate limit:** nije objavljen; `live.euroleague.net` je u praksi osetljiviji (open-source SDK-ovi namerno usporavaju zahteve ka njemu). Pravila za našu aplikaciju:
  - live polling samo za utakmice na kojima postoji tip u aktivnom kolu (najviše 4 utakmice), interval 30 s, zaglavlje + boxscore po utakmici po ciklusu (≤ 16 zahteva/min, granica 20);
  - eksponencijalni backoff (30 s → 60 s → 2 min → 5 min) pri greškama 429/5xx;
  - jasan `User-Agent` sa kontaktom aplikacije;
  - **klijenti (browseri) nikada ne zovu API direktno** — samo naš server, koji keš-ira i distribuira podatke.
- **Uslovi korišćenja:** sadržaj (posebno slike igrača i logotipi) je vlasništvo Euroleague Basketball. Aplikacija je privatna, nekomercijalna, za 4 korisnika; slike se prikazuju preko linka (bez kopiranja na naš server). Pre puštanja u rad pročitati Terms of Use na euroleaguebasketball.net; ako uslovi zabranjuju ovakvu upotrebu, preći na alternativu (7.3).
- **Stabilnost:** svi pozivi idu kroz adapter (7.4) sa validacijom šeme odgovora; promena strukture izaziva upozorenje adminu, ne pad aplikacije.

## 7.3 Alternative

> Odluka P-21: budžet je **0 EUR**. Primarni izvor je besplatni Euroleague API, a rezerva je ručni unos (7.5). Plaćene alternative ispod navode se samo za slučaj da tim kasnije promeni odluku.

| Izvor | Prednosti | Mane |
|-------|-----------|------|
| **API-Basketball (api-sports.io)** | dokumentovan, API ključ, besplatan plan (~100 zahteva/dan), pokriva Evroligu, live rezultate i statistiku igrača po utakmici | besplatna kvota nedovoljna za live polling na 30 s (potreban plaćeni plan, ~10–20 USD/mes); live statistika igrača može kasniti |
| **Sportradar Basketball API** | profesionalan, pouzdan, SLA | komercijalni ugovor, cena neprimerena privatnoj aplikaciji |
| **Scraping zvaničnog sajta** | — | krhko, verovatno u suprotnosti sa uslovima; ne preporučuje se |

## 7.4 Arhitektura integracije
- Interfejs **`EuroleagueProvider`** sa metodama: `listClubs()`, `listPlayers(season)`, `listGames(season, round?)`, `getGameHeader(season, gameCode)`, `getBoxscore(season, gameCode)`.
- Implementacije: `EuroleagueLiveApiProvider` (primarna), `ApiSportsProvider` (alternativa), `ManualProvider` (rezervni režim).
- Pozadinski worker:
  - `players-sync` (dnevno), `schedule-sync` (dnevno + na 15 min na dan utakmice),
  - `live-poller` (aktivan samo kada postoji utakmica u statusu `live` sa tipom; pokreće se 10 min pre zakazanog početka),
  - `finalizer` (po završetku utakmice → FR-14), `rechecker` (12 h posle kraja → BR-15).
- Izmene se upisuju u bazu (GAME, PLAYER_GAME_STAT) i šalju klijentima preko SSE/WebSocket kanala (NFR-01).
- Svaki ciklus se beleži u SYNC_RUN.

## 7.5 Rezervni režim (API nedostupan)
1. **Igrači:** ostaje poslednja sinhronizovana baza; admin može ručno dodati igrača (FR-03 KP3).
2. **Raspored:** admin može ručno uneti utakmicu (timovi, datum i vreme).
3. **Live:** ekran prikazuje poslednje poznate podatke sa upozorenjem "Podaci kasne"; ponuđen je link ka zvaničnom live prikazu utakmice.
4. **Razrešenje:** posle 6 h bez konačnih podataka admin dobija zadatak za ručno razrešenje (FR-14 KP4, FR-15). Ako API ne prijavi odlaganje, a utakmica ne počne na dan kola, admin je ručno označava kao neodigranu (tip poništen, BR-14).
5. Promena provajdera je konfiguracija servera, bez izmene ostatka aplikacije.

## 7.6 Pre implementacije (zadaci verifikacije)
- [ ] Proveriti u Swagger-u tačne putanje za igrače/osobe, klubove i zaglavlje utakmice (stavke ⚠️).
- [ ] Snimiti primere odgovora (JSON fixture) za Boxscore pre, tokom i posle utakmice, i za DNP igrača.
- [ ] Potvrditi kako API označava odloženu/otkazanu utakmicu.
- [ ] Pročitati Terms of Use Euroleague Basketball.
