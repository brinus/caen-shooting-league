# 🎯 CAEN Shooting League

Sito dinamico per il campionato interno di Nerf shooting.  
Autenticazione utenti, profili giocatori, pannello admin — powered by **Supabase**.

---

## Setup iniziale Supabase

### 1. Crea il progetto Supabase

1. Registrati su [supabase.com](https://supabase.com) e crea un nuovo progetto.
2. Annota **Project URL** e **anon key** dalla sezione *Settings → API*.

### 2. Configura il client JS

In `js/supabase-client.js` sostituisci i placeholder:

```js
const SUPABASE_URL  = 'https://<ref>.supabase.co';
const SUPABASE_ANON_KEY = '<anon_key>';
```

> L'`anon key` è pubblica per design in Supabase. Le RLS policies proteggono i dati.

### 3. Esegui la migrazione SQL

Copia il contenuto di `supabase/migrations/001_initial_schema.sql` e incollalo nell'editor SQL del Dashboard Supabase (*SQL Editor → New query → Run*).

### 4. Importa i dati esistenti

```bash
pip install supabase python-dotenv

# Crea .env (NON committare questo file)
echo "SUPABASE_URL=https://<ref>.supabase.co" > .env
echo "SUPABASE_SERVICE_ROLE_KEY=<service_role_key>" >> .env

# Anteprima
python scripts/import_to_supabase.py --dry-run

# Import completo
python scripts/import_to_supabase.py
```

> La `service_role_key` si trova in *Settings → API → service_role*. Non esporla mai nel codice frontend.

### 5. Crea il primo admin

1. Nel Dashboard Supabase, vai su *Authentication → Users → Create user*.
2. Oppure usa l'Edge Function dopo il deploy (vedi §6).
3. Poi nella tabella `profiles` imposta `role = 'admin'` per quell'utente.

### 6. Deploy Edge Function (creazione utenti)

```bash
# Installa Supabase CLI
npm install -g supabase

# Login e link al progetto
supabase login
supabase link --project-ref <ref>

# Imposta la service role key come secret
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service_role_key>

# Deploy
supabase functions deploy create-user
```

---

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
  s1-2026.csv         ← risultati per stagione (uno per stagione)
data/
  seasons.json        ← configurazione stagioni (modifica manuale o via admin panel)
  data.js             ← configurazione sito e post (legacy, migrati su Supabase)
  classifica.js       ← AUTO-GENERATO da aggiorna.py (non modificare)
scripts/
  aggiorna.py         ← pipeline dati (CSV → classifica.js per deploy statico)
  import_to_supabase.py ← import dati esistenti su Supabase (una-tantum)
supabase/
  migrations/
    001_initial_schema.sql  ← schema DB + RLS (eseguire nel Dashboard Supabase)
  functions/
    create-user/
      index.ts         ← Edge Function creazione utenti admin-only
js/
  app.js               ← Logica client-side (ranking, pagine)
  supabase-client.js   ← Client Supabase + auth helpers (CSLAuth global)
  ranking.js           ← Porting logica Python ranking → JavaScript (CSLRanking global)
  admin.js             ← Logica pannello admin
css/
  style.css            ← Stile (include stili auth/admin/profilo)
index.html             Homepage
classifica.html        Classifica con selettore stagione e due tab
stats.html             Statistiche per giocatore
posts.html             Lista post
post.html              Singolo post (Markdown)
regolamento.html       Regole ufficiali
login.html             Pagina di login
profilo.html           Profilo giocatore con statistiche
admin.html             Pannello admin (giornate, post, utenti, stagioni)
admin-post.html        Editor post (Markdown + anteprima live)
.gitlab-ci.yml         Deploy automatico su GitLab Pages
```
