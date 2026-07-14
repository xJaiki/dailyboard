# DailyBoard

Micro-gestionale "zero-form" per i daily tecnici di un team.

## Avvio (sviluppo)

```
npm install
npm run start
```

- Frontend (Vite): http://localhost:5173
- Backend (Express + SQLite): http://localhost:3001

## Avvio con Docker (produzione)

Un'unica immagine con client buildato, server e DB — non serve portarsi dietro il codice sorgente.

```
docker build -t dailyboard .
docker run -d -p 3001:3001 -v dailyboard-data:/data --name dailyboard dailyboard
```

Apri http://localhost:3001. Il DB SQLite vive nel volume `dailyboard-data`, quindi sopravvive a `docker rm`/rebuild dell'immagine.

Comandi utili:

```
docker stop dailyboard      # ferma
docker start dailyboard     # riavvia
docker logs -f dailyboard   # log
docker rm -f dailyboard && docker volume rm dailyboard-data   # reset completo (cancella anche i dati)
```

## Smart Bar

Un unico campo di testo in cima all'app converte il linguaggio naturale in un task:

- `[XXX]` → categoria (es. `[BE]`, `[FE]`, `[DEV]`)
- `@utente` → assignee
- `#sprint` → sprint
- Testo restante → titolo

I tag possono comparire in qualsiasi ordine. Esempio:

```
[FE] Modificare uri chiamata da redditivita a filtri @mario #sprint-1
```

crea un task "Modificare uri chiamata da redditivita a filtri", categoria FE, assignee mario, sprint sprint-1.

## Note su task esistenti

Digita `>` nella smart bar per cercare un task esistente (frecce + Invio per selezionarlo), poi scrivi la nota e premi Invio: viene agganciata sotto il task invece di creare un duplicato.

## Tastiera

- `/` — focus sulla smart bar
- `↑` `↓` (o `j`/`k`) — naviga il feed
- `⇧↑` `⇧↓` — sposta il task dentro lo sprint
- `Invio` / `Spazio` — segna fatto/da fare
- `⌫` / `x` — elimina il task selezionato
- `e` — modifica titolo e tag (`[categoria] titolo @assignee #sprint`)
- `Z` — annulla (prima i delete in sospeso, poi l'ultima modifica)
- `v` — cambia vista (verticale/orizzontale)
- `n` — apre/chiude gli appunti del daily
- `?` — cheat-sheet delle scorciatoie
- `Tab` — completa i suggerimenti `@assignee` / `[categoria]`
