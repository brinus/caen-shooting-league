# 🎯 CAEN Shooting League

Sito statico per il campionato interno di Nerf shooting.  
Le classifiche sono generate automaticamente da uno script Python che legge file CSV.

---

## Avvio locale

Serve un server HTTP locale (i browser bloccano JS caricati da `file://`):

```bash
python -m http.server 8080
# oppure
npx serve .
```

Poi apri `http://localhost:8080`.

---

## Registrare i risultati di una giornata

1. Apri il file CSV della stagione corrente in `risultati/` (es. `risultati/s1-2026.csv`).
2. Aggiungi una riga per ogni giocatore. Il formato è:

   ```
   data,giocatore,iniziali,t1,t2,t3
   ```

   | Campo | Descrizione |
   |---|---|
   | `data` | Data della giornata `YYYY-MM-DD` |
   | `giocatore` | Nome completo — deve essere **sempre identico** per la stessa persona |
   | `iniziali` | 2–3 lettere per l'avatar nel podio |
   | `t1`, `t2`, `t3` | Punteggio dei 3 tentativi (5 colpi ciascuno, max 50). Metti `-1` se non effettuato |

   Esempio:
   ```csv
   2026-05-05,Mario R.,MR,38,42,45
   2026-05-05,Anna B.,AB,35,-1,40
   ```

   > **Giornate di gara:** solo lunedì e mercoledì contano in classifica.  
   > Gli altri giorni vengono registrati come allenamento (utili per il record personale).

3. Rigenera la classifica:

   ```bash
   python scripts/aggiorna.py
   ```

4. Commit e push → GitLab CI pubblica automaticamente il sito.

---

## Aggiungere un post

In `data/data.js`, nel blocco `posts: [ ... ]`, incolla un nuovo oggetto **all'inizio** dell'array:

```js
{
  slug: "giornata-5-maggio",      // identificatore URL, unico, senza spazi né accenti
  titolo: "Giornata del 5 maggio — vince Mario",
  data: "2026-05-05",             // YYYY-MM-DD — post non visibili prima di questa data
  autore: "Admin",
  tag: ["risultati"],
  excerpt: "Breve descrizione mostrata nella card (max ~150 caratteri).",
  content: `# Titolo

Testo in **Markdown**.`
},
```

---

## Gestire le stagioni

### Struttura di `data/seasons.json`

Ogni stagione ha questi campi:

```json
{
  "id":     "s1-2026",
  "nome":   "Stagione 1",
  "numero": 1,
  "anno":   2026,
  "inizio": "2026-05-01",
  "fine":   "2026-07-31",
  "status": "next"
}
```

| `status` | Significato |
|---|---|
| `"next"` | In arrivo — mostrata nella home con badge "In arrivo" |
| `"attiva"` | Stagione corrente — promossa automaticamente dallo script quando `oggi >= inizio` |
| `"conclusa"` | Terminata — rimane visibile nel selettore classifica |

### Aggiungere una nuova stagione

1. Imposta `"status": "conclusa"` sulla stagione corrente in `seasons.json`.
2. Crea il file CSV vuoto per la nuova stagione: `risultati/s2-2026.csv`  
   (copia l'intestazione da un CSV esistente).
3. Aggiungi la nuova stagione in fondo a `seasons.json` con `"status": "next"`.
4. Esegui `python scripts/aggiorna.py`.

Lo script promuoverà automaticamente lo status a `"attiva"` a partire dalla data di inizio.

### Rimuovere una stagione

1. Rimuovi il blocco corrispondente da `data/seasons.json`.
2. Esegui `python scripts/aggiorna.py` (riscrive `classifica.js` senza quella stagione).
3. Facoltativamente elimina il file CSV in `risultati/` (lo script lo ignora se non è in `seasons.json`).

---

## Script `aggiorna.py`

```bash
# Aggiornamento normale
python scripts/aggiorna.py

# Anteprima senza scrivere file
python scripts/aggiorna.py --dry-run
```

Lo script:
- Legge `risultati/{season_id}.csv` per ogni stagione in `seasons.json`
- Calcola classifica giornaliera con spareggi `best → media sui 3 tentativi → 2° miglior tentativo`
- Assegna i punti campionato `1°=10pt, 2°=8pt, 3°=6pt, 4°-5°=4pt, 6°-7°=2pt, 8°-10°=1pt`
- Calcola classifica campionato con spareggi `Pt Camp. → media dei best giornalieri → Pt Tiro → Record`
- Calcola classifica cecchini con spareggi `Record ufficiale → media dei best giornalieri → 2° miglior tentativo ufficiale → Pt Tiro`
- Calcola classifica stagionale per punti campionato e per record personale (due titoli)
- Promuove le stagioni `"next"` a `"attiva"` se la data di inizio è passata
- Scrive `data/classifica.js` (non modificare manualmente)

---

## Struttura del progetto

```
risultati/
  s1-2025.csv       ← risultati per stagione (uno per stagione)
  s2-2025.csv
  s1-2026.csv
data/
  seasons.json      ← configurazione stagioni (modifica manuale)
  data.js           ← configurazione sito e post (modifica manuale)
  classifica.js     ← AUTO-GENERATO da aggiorna.py (non modificare)
scripts/
  aggiorna.py       ← pipeline dati
index.html          Homepage (titoli stagione + podio + ultimi post)
classifica.html     Classifica con selettore stagione e due tab
stats.html          Statistiche per giocatore (per stagione o carriera)
posts.html          Lista post
post.html           Singolo post (Markdown)
regolamento.html    Regole ufficiali
css/style.css       Stile
js/app.js           Logica client-side
.gitlab-ci.yml      Deploy automatico su GitLab Pages
```
