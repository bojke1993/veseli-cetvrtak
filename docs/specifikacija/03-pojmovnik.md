# 3. Pojmovnik

| Pojam | Definicija |
|-------|------------|
| **Član (tima)** | Jedan od četiri učesnika: Ivanišević, Tozislav, Lakićević, Simara. |
| **Kolo** | Jedna runda igre u aplikaciji = jedan zajednički tiket. Ima redni broj (automatski) i datum otvaranja. Obuhvata utakmice jednog dana — "dan kola", bilo koji dan u nedelji (P-08). |
| **Kolo Evrolige** | Zvanična runda takmičenja (npr. 5. kolo regularnog dela). Automatski, informativni podatak uz kolo u aplikaciji. |
| **Izbor / Tip** | Jedna stavka tiketa: igrač Evrolige + utakmica + granica + smer (više/manje). Svako kolo ima tačno 4 tipa. |
| **Lični tip** | Tip koji je odigrao konkretan član; pripisuje mu se u ličnu statistiku. |
| **Tip ekipe** | 4. tip koji ostala trojica zajednički biraju umesto člana na hlađenju. Ne pripisuje se nijednom članu (P-05). |
| **Granica** | Broj poena na koji se igra (npr. 14,5). Uvek oblika x,5 — cela granica nije dozvoljena (P-03). |
| **Smer** | "Više" (poeni > granica) ili "Manje" (poeni < granica). |
| **Kvota** | Koeficijent kladionice. **Ukupna kvota** tiketa je ona koju je kladionica dala za ceo tiket; **pojedinačna kvota** je kvota jednog tipa (opciono). |
| **Uplata** | Iznos uložen na tiket u kolu (RSD). |
| **Uplatilac** | Član koji je fizički uplatio tiket u tom kolu. |
| **Potencijalni dobitak** | Uplata × ukupna kvota (P-04). Izračunava se automatski pri unosu. |
| **Stvarni dobitak** | Iznos isplaćen po dobitnom tiketu; jednak potencijalnom, osim ako je umanjen zbog poništenih tipova ili ručno korigovan. |
| **Pogodak** | Tip čiji je ishod u skladu sa smerom (npr. "više 14,5" i igrač dao 18). |
| **Promašaj** | Tip čiji ishod nije u skladu sa smerom. |
| **Poništen tip (void)** | Tip koji se ne računa: igrač nije zaigrao (DNP) ili utakmica nije počela na dan kola (odložena/otkazana) (P-01, P-02). Kvota mu je 1,00. |
| **Dan kola** | Dan (veče) na koji se igra kolo; sve utakmice tipova kola su tog dana (BR-07). |
| **Sezona** | Sezona Evrolige (npr. 2026/27); na početku sezone nizovi, vatrice i hlađenje se resetuju (BR-33). |
| **Uvezeno kolo** | Kolo preneto iz ranije evidencije (Google Sheets, XLS); računa se kao pravo kolo (BR-34). |
| **Gost** | Neprijavljen posetilac koji vidi podatke u režimu samo za pregled (BR-35). |
| **Ishod tiketa** | Broj pogođenih od važećih tipova, npr. 3/4. Kolo sa poništenim tipom prikazuje se kao npr. 3/3 (+1 poništen). |
| **Status tiketa** | *Otvoren* → *Zaključen* → *U toku* → *Dobitan* / *Gubitan* / *Poništen*. |
| **"U prolazu"** | Live stanje tipa: na osnovu trenutnih poena tip bi bio pogođen da se utakmica sad završi. |
| **Niz (streak)** | Broj uzastopnih ličnih pogodaka ili promašaja člana. Poništeni tipovi i kola na hlađenju ga ne prekidaju (P-05, P-06). |
| **Hlađenje** ❄ (pahuljica) | Kazna: član koji promaši 5 puta zaredom ne igra naredno kolo. |
| **Vatrica** 🔥 | Nagrada/oznaka: član sa 3 pogotka zaredom dobija vatricu; gubi je pri prvom sledećem promašaju. |
| **Blejm** | Situacija kada je član **jedini** promašaj na tiketu (ishod 3/4 i promašaj je njegov lični tip). "Blejm rang lista" broji ove situacije po članu. |
| **DNP** | *Did Not Play* — igrač je bio na spisku ili van njega, ali nije ulazio u igru (0 sekundi). |
| **Boxscore** | Tabela statistike igrača jedne utakmice (poeni, minuti...). "Live boxscore" se ažurira tokom utakmice. |
| **Zaključavanje glasanja** | Akcija kojom admin zamrzava izbore kola; posle toga izmene su moguće samo kroz proceduru ispravke (FR-12). |
| **Razrešenje** | Određivanje ishoda tipa (pogodak/promašaj/poništen) i tiketa. Može biti automatsko ili ručno. |
| **Bilans** | Ukupno dobijeno − ukupno uplaćeno. |
| **Audit log** | Nepromenljiv zapis svih izmena posle zaključavanja i svih ručnih intervencija. |
| **Sezona (seasonCode)** | Oznaka sezone Evrolige u API-ju, npr. `E2026` za sezonu 2026/27. |
| **gameCode** | Identifikator utakmice unutar sezone u Euroleague API-ju. |
