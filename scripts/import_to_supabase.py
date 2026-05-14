#!/usr/bin/env python3
"""
import_to_supabase.py — CAEN Shooting League

Importa i dati esistenti (stagioni, risultati da CSV, posts da data.js)
nel database Supabase del progetto.

Requisiti:
    pip install supabase python-dotenv

Configurazione:
    Creare un file .env nella root del repo (NON committarlo) con:
        SUPABASE_URL=https://<ref>.supabase.co
        SUPABASE_SERVICE_ROLE_KEY=<service_role_key>

Uso (dalla root del repo):
    python scripts/import_to_supabase.py
    python scripts/import_to_supabase.py --dry-run   # mostra cosa farebbe, non scrive
    python scripts/import_to_supabase.py --only stagioni
    python scripts/import_to_supabase.py --only risultati
    python scripts/import_to_supabase.py --only posts
"""

import argparse
import csv
import json
import os
import re
import sys
from pathlib import Path

# ── Percorsi ────────────────────────────────────────────────────────────────
REPO          = Path(__file__).resolve().parent.parent
RISULTATI_DIR = REPO / "risultati"
SEASONS_FILE  = REPO / "data" / "seasons.json"
DATA_JS_FILE  = REPO / "data" / "data.js"

# ── Argomenti CLI ────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Importa dati CSL su Supabase")
parser.add_argument("--dry-run",  action="store_true", help="Mostra cosa farebbe senza scrivere")
parser.add_argument("--only", choices=["stagioni", "risultati", "posts"], help="Importa solo una categoria")
args = parser.parse_args()

DRY_RUN = args.dry_run
ONLY    = args.only

# ── Dipendenze ───────────────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv(REPO / ".env")
except ImportError:
    pass  # .env non richiesto se variabili già definite nell'ambiente

try:
    from supabase import create_client, Client
except ImportError:
    print("Errore: installa le dipendenze con: pip install supabase python-dotenv")
    sys.exit(1)

SUPABASE_URL             = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("Errore: definire SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (file .env o variabili d'ambiente)")
    sys.exit(1)

if DRY_RUN:
    print("⚠️  DRY-RUN: nessuna scrittura verrà effettuata\n")
    supabase = None
else:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


# ────────────────────────────────────────────────────────────────────────────
# 1. STAGIONI
# ────────────────────────────────────────────────────────────────────────────

def import_stagioni():
    print("── Stagioni ────────────────────────────────────────────")
    with open(SEASONS_FILE, encoding="utf-8") as f:
        seasons = json.load(f)

    for s in seasons:
        row = {
            "id":           s["id"],
            "nome":         s["nome"],
            "numero":       s["numero"],
            "anno":         s["anno"],
            "inizio":       s["inizio"],
            "fine":         s["fine"],
            "status":       s.get("status", "completata"),
            "max_recuperi": s.get("max_recuperi", 4),
        }
        print(f"  stagione: {row['id']} — {row['nome']} ({row['anno']})")
        if not DRY_RUN:
            supabase.table("stagioni").upsert(row).execute()

    print(f"  ✓ {len(seasons)} stagion{'e' if len(seasons)==1 else 'i'} importat{'a' if len(seasons)==1 else 'e'}\n")


# ────────────────────────────────────────────────────────────────────────────
# 2. RISULTATI
# ────────────────────────────────────────────────────────────────────────────

def import_risultati():
    print("── Risultati ───────────────────────────────────────────")

    with open(SEASONS_FILE, encoding="utf-8") as f:
        seasons = json.load(f)

    total = 0
    for s in seasons:
        sid     = s["id"]
        csv_file = RISULTATI_DIR / f"{sid}.csv"
        if not csv_file.exists():
            print(f"  ⚠️  File non trovato: {csv_file}")
            continue

        rows = []
        with open(csv_file, encoding="utf-8") as f:
            reader = csv.DictReader(
                line for line in f if not line.strip().startswith("#")
            )
            for row in reader:
                t1 = int(row["t1"].strip()) if row["t1"].strip() not in ("", "-") else -1
                t2 = int(row["t2"].strip()) if row["t2"].strip() not in ("", "-") else -1
                t3_raw = row["t3"].strip().rstrip(",")
                t3 = int(t3_raw) if t3_raw not in ("", "-") else -1
                rows.append({
                    "stagione_id": sid,
                    "data":        row["data"].strip(),
                    "giocatore":   row["giocatore"].strip(),
                    "iniziali":    row["iniziali"].strip(),
                    "t1": t1, "t2": t2, "t3": t3,
                })

        print(f"  stagione {sid}: {len(rows)} righe")
        if DRY_RUN:
            for r in rows[:3]:
                print(f"    {r}")
            if len(rows) > 3:
                print(f"    ... e altre {len(rows)-3}")
        else:
            # Cancella risultati esistenti per la stagione, poi inserisce
            supabase.table("risultati").delete().eq("stagione_id", sid).execute()
            # Inserisce a batch di 500
            batch_size = 500
            for i in range(0, len(rows), batch_size):
                supabase.table("risultati").insert(rows[i:i+batch_size]).execute()

        total += len(rows)

    print(f"  ✓ {total} risultati importati\n")


# ────────────────────────────────────────────────────────────────────────────
# 3. POSTS (estrazione da data.js)
# ────────────────────────────────────────────────────────────────────────────

def _extract_posts_from_data_js() -> list[dict]:
    """
    Estrae i post dall'array `posts` in data.js usando regex.
    Ritorna una lista di dict con i campi standard.
    """
    with open(DATA_JS_FILE, encoding="utf-8") as f:
        source = f.read()

    # Estrae ogni blocco {slug: ..., titolo: ..., data: ..., ...}
    posts = []

    # Regex per estrarre i campi semplici (stringa singola riga)
    def extract_field(text, field):
        m = re.search(
            rf'{field}\s*:\s*["\']([^"\']*)["\']',
            text, re.DOTALL
        )
        return m.group(1).strip() if m else ""

    def extract_array_field(text, field):
        m = re.search(
            rf'{field}\s*:\s*\[([^\]]*)\]',
            text, re.DOTALL
        )
        if not m: return []
        items = re.findall(r'["\']([^"\']+)["\']', m.group(1))
        return items

    # Trova tutti i blocchi di post (delimitati da { slug: ... })
    # Approccio: split per blocchi che iniziano con "slug:"
    blocks = re.split(r'\{\s*\n?\s*slug\s*:', source)
    for i, block in enumerate(blocks[1:]):  # salta il primo (before first post)
        # Ricostruisce il blocco
        block = "slug:" + block

        # Trova la fine del blocco (ultimo ` o ' che chiude il content)
        # Estrattiamo i campi noti
        slug    = extract_field(block, "slug")
        titolo  = extract_field(block, "titolo")
        data    = extract_field(block, "data")
        autore  = extract_field(block, "autore")
        excerpt = extract_field(block, "excerpt")
        tags    = extract_array_field(block, "tag")

        # Estrae il content (template literal o stringa multi-riga)
        # Cerca: content: `...` (template literal)
        m_tl = re.search(r'content\s*:\s*`([\s\S]*?)`(?:\s*\}|\s*\.replace)', block)
        if m_tl:
            content = m_tl.group(1).strip()
            # Se c'è .replace(/^ {4}/gm, '') nel sorgente, applica la stessa pulizia
            if ".replace(/^ {4}/gm, '')" in block:
                content = re.sub(r'(?m)^ {4}', '', content)
        else:
            # Fallback: stringa normale
            m_str = re.search(r'content\s*:\s*["\']([^"\']*)["\']', block)
            content = m_str.group(1).strip() if m_str else ""

        if not slug:
            continue

        posts.append({
            "slug":      slug,
            "titolo":    titolo,
            "data":      data,
            "autore":    autore,
            "tags":      tags,
            "excerpt":   excerpt,
            "content":   content,
            "published": True,
        })

    return posts


def import_posts():
    print("── Posts ────────────────────────────────────────────────")
    posts = _extract_posts_from_data_js()
    print(f"  trovati {len(posts)} post in data.js")

    for p in posts:
        print(f"  post: {p['slug']} — {p['titolo'][:50]}")
        if DRY_RUN:
            continue
        # upsert by slug: aggiorna se già presente
        existing = supabase.table("posts").select("id").eq("slug", p["slug"]).execute()
        if existing.data:
            supabase.table("posts").update({
                "titolo": p["titolo"], "data": p["data"], "autore": p["autore"],
                "tags": p["tags"], "excerpt": p["excerpt"], "content": p["content"],
                "published": p["published"],
            }).eq("slug", p["slug"]).execute()
        else:
            supabase.table("posts").insert(p).execute()

    print(f"  ✓ {len(posts)} post importati\n")


# ────────────────────────────────────────────────────────────────────────────
# Main
# ────────────────────────────────────────────────────────────────────────────

def main():
    print("CSL → Supabase import\n")

    if ONLY is None or ONLY == "stagioni":
        import_stagioni()

    if ONLY is None or ONLY == "risultati":
        import_risultati()

    if ONLY is None or ONLY == "posts":
        import_posts()

    print("✅  Importazione completata.")


if __name__ == "__main__":
    main()
