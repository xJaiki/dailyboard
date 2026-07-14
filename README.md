# DailyBoard

Micro-gestionale "zero-form" per i daily tecnici di un team.

## Avvio

```
npm install
npm run start
```

- Frontend (Vite): http://localhost:5173
- Backend (Express + SQLite): http://localhost:3001

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
- `Invio` / `Spazio` — segna fatto/da fare
- `⌫` / `x` — elimina il task selezionato
- `e` — modifica il titolo
- `Tab` — completa i suggerimenti `@assignee` / `[categoria]`
