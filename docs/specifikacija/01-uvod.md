# 1. Uvod i cilj sistema

## 1.1 Svrha dokumenta
Ovaj dokument definiše funkcionalne zahteve za web aplikaciju **"Veseli četvrtak"** kojom grupa prijatelja prati
zajedničko igranje tiketa na poene igrača Evrolige. Namenjen je članovima tima (radi potvrde pravila) i
razvojnom timu (kao osnova za implementaciju i testiranje).

## 1.2 Kontekst
Tim ima tačno četiri člana, i samo oni učestvuju u igri:

| Član | Napomena |
|------|----------|
| Ivanišević | pretpostavljeni administrator (P-11) |
| Tozislav | član |
| Lakićević | član |
| Simara | član |

U svakom kolu svaki član bira jednog igrača Evrolige i igra tip **"više"** ili **"manje"** na zadatu granicu poena
(npr. *više od 14,5 poena*). Sva četiri izbora čine jedan zajednički tiket koji uplaćuje jedan od članova.
Tiket je dobitan samo ako su sva četiri tipa pogođena.

Do sada se evidencija vodila ručno (poruke, beleške), pa su statistike ("ko nas je koštao", nizovi, ko je
koliko uplatio) nepouzdane i teške za praćenje.

## 1.3 Cilj sistema
1. **Jedno mesto istine** za sva kola, izbore, uplate i ishode.
2. **Brz unos kola** od strane administratora — pretraga igrača po imenu, minimalan broj klikova.
3. **Praćenje uživo** — tokom utakmica automatski prikaz poena odigranih igrača i da li je tip "u prolazu".
4. **Automatsko razrešenje** — po završetku utakmica sistem sam određuje pogodak/promašaj, status tiketa i
   ažurira statistiku, nizove, hlađenja (❄) i vatrice (🔥).
5. **Statistika i zabava** — ukupni bilans, raspodela ishoda (4/4…0/4), lične statistike i "blejm" rang lista.

## 1.4 Obim

**U obimu:**
- upravljanje kolima, izborima, uplatama i ishodima,
- integracija sa izvorom podataka Evrolige (igrači, raspored, live boxscore),
- automatsko računanje statistike i statusa (hlađenje, vatrica, blejm),
- istorija kola sa filtriranjem,
- prikaz prilagođen telefonu.

**Van obima:**
- stvarna uplata tiketa kod kladionice (aplikacija samo beleži uplatu),
- automatsko preuzimanje kvota iz kladionica,
- učesnici van četvoročlanog tima,
- druga takmičenja osim Evrolige (moguće proširenje, vidi OP-04),
- finansijski obračun dugovanja među članovima (odluka P-14),
- obaveštenja van aplikacije — push, Telegram, Viber (odluka P-20).

**Dodatno u obimu:** jednokratni uvoz istorijskih kola iz Google Sheets-a (XLS/XLSX, FR-25) i javni pregled bez prijave (BR-35).

## 1.5 Reference
- Zahtev naručioca (opis igre, tok rada, statistika) — originalni brief.
- Euroleague javni API — vidi poglavlje 7.
