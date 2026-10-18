# Ephemeris

Živá 3D mapa slnečnej sústavy s dátami z NASA JPL Horizons.

```
public/index.html   stránka (three.js a astronomy-engine z CDN, bez build kroku)
api/body.js         serverless proxy na JPL Horizons, bez závislostí
api/chat.js         astrologický sprievodca (Claude API, streamovanie)
api/geo.js          vyhľadávanie miesta narodenia (Open-Meteo, bez kľúča)
vercel.json         limity trvania funkcií
```

## Nasadenie na Vercel

```bash
cd ephemeris
npx vercel login          # len prvýkrát
npx vercel                # preview deploy; pri otázkach: framework "Other", ostatné nechaj predvolené
npx vercel --prod         # produkcia
```

Alebo cez GitHub: pushni priečinok do repozitára a vo Verceli zvoľ **Add New → Project → Import**. Framework preset nechaj na **Other**, build command prázdny.

Lokálny vývoj: `npx vercel dev`, potom otvor http://localhost:3000.

## Chatbot: API kľúč

Bez kľúča funguje všetko okrem rozhovoru so sprievodcom.

1. Na https://console.anthropic.com vytvor API kľúč (Settings → API Keys) a nabi kredit.
2. Vo Verceli otvor projekt → **Settings → Environment Variables** a pridaj `ANTHROPIC_API_KEY` s hodnotou kľúča.
3. Voliteľne pridaj `CHAT_MODEL` (predvolený je `claude-sonnet-5-5`; lacnejší je `claude-haiku-5-5`).
4. Daj **Redeploy**, aby sa premenná načítala.

Jedna otázka s kontextom horoskopu stojí pri Sonnete rádovo 0,5–1 cent. Funkcia má limit 30 otázok za 10 minút na IP adresu. Pri verejnom zdieľaní si v konzole Anthropic nastav aj mesačný limit míňania.

## Astrológia

- Západná tropická astrológia, geocentrické zdanlivé polohy (rovník a ekvinokcium dátumu).
- Slnko, Mesiac a planéty počíta `astronomy-engine`. Pravý uzol sa počíta oskulačne zo stavového vektora Mesiaca, Lilith ako stredné apogeum premietnuté na ekliptiku. Chirón ide z JPL Horizons cez `/api/body?id=chiron`.
- Domy: Placidus, Koch, Equal, Whole Sign, Porphyry. Nad polárnym kruhom sa Placidus a Koch automaticky prepnú na Porphyry.
- Overenie: 60 náhodných horoskopov (1925–2049, šírky do ±75°) proti Swiss Ephemeris 2.10. Planéty sa odchyľujú najviac o 18″, uzol o 28″, Lilith o 0,5″, hroty domov o 0,2″.
- Miestny čas narodenia sa prevádza na UTC podľa historických pravidiel IANA v prehliadači (napr. letný čas v ČSSR až od roku 1979, ale aj v roku 1946).
- Údaje o narodení sa ukladajú len do `localStorage` prehliadača. Do `/api/chat` idú len spolu s otázkou.

## Ako to funguje

Prehliadač pre každý objekt zavolá `GET /api/body?id=<id>`. Funkcia pošle do Horizons dva alebo tri dotazy:

| časť  | čo obsahuje | rozlíšenie |
|-------|-------------|------------|
| `live`  | stavové vektory teraz ±3 dni | krok 2 h |
| `track` | trajektória pre históriu a predikciu (sondy od štartu, telesá ±½ obehu, medzihviezdne objekty perihélium ±25 rokov) | 420–1400 bodov |
| `el`    | oskulačné elementy k aktuálnemu času (nie pre sondy) | 1 riadok |

`GET /api/body?id=<id>&at=<JD>` vráti presné okno ±2 dni okolo zvoleného dátumu. Stránka si ho pýta pre vybraný objekt, keď zastavíš čas mimo okna `live`.

Všetko je heliocentrické v rovine ekliptiky J2000, v AU a AU/deň. Medzi bodmi stránka interpoluje Hermiteovým splajnom zo stavových vektorov.

**Cache:** odpovede majú `s-maxage=6h, stale-while-revalidate=24h` a historické okná 30 dní. JPL tak dostane jednu dávku dotazov za 6 hodín bez ohľadu na počet návštevníkov.

**Robustnosť:**
- Kométy s viacerými návratmi (napr. `DES=1P`) vrátia zoznam záznamov. Funkcia vyberie posledný návrat pred aktuálnym rokom.
- Dotaz mimo pokrytia efemeríd („No ephemeris … prior to / after A.D. …") funkcia automaticky oreže na dostupný rozsah.
- Keď je Horizons nedostupné, stránka prejde na analytický model. Stav ukazuje v hlavičke a pri každom objekte.

## Pridanie objektu

1. `api/body.js` → do mapy `T` pridaj `id: { cmd: '<Horizons COMMAND>', … }`. Sondy majú záporné ID (`-31`), očíslované asteroidy `číslo;`, kométy `DES=…;`.
2. `public/index.html` → do `CATALOG` pridaj objekt s popisom a záložným modelom (`src.kep` alebo `traj`).

## Zdroj dát

NASA/JPL Solar System Dynamics, Horizons API: https://ssd-api.jpl.nasa.gov/doc/horizons.html
