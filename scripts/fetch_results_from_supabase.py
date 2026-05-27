#!/usr/bin/env python3
"""Fetch results from Supabase and write local CSVs into `risultati/`.

Usage:
    Set environment variables `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (GitHub Actions secrets)
    then run:
        python scripts/fetch_results_from_supabase.py

If the env vars are missing the script exits without changing files.
"""
import os
import csv
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT_DIR = REPO / 'risultati'
SEASONS_FILE = REPO / 'data' / 'seasons.json'

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set; skipping fetch.')
    sys.exit(0)

try:
    from supabase import create_client
except Exception as e:
    print('Missing dependency supabase. Install with: pip install supabase')
    raise

import json

OUT_DIR.mkdir(parents=True, exist_ok=True)

print('Connecting to Supabase...')
client = create_client(SUPABASE_URL, SUPABASE_KEY)
client.postgrest.auth(SUPABASE_KEY)

with open(SEASONS_FILE, encoding='utf-8') as f:
    seasons = json.load(f)

for s in seasons:
    sid = s.get('id')
    if not sid:
        continue
    print(f'Fetching risultati for season {sid}...')
    try:
        resp = client.table('risultati').select('data,giocatore,iniziali,t1,t2,t3').eq('stagione_id', sid).order('data', count='exact').execute()
    except Exception as e:
        print('Error querying Supabase:', e)
        continue

    rows = resp.data if resp and hasattr(resp, 'data') else []
    if not rows:
        print(f'  no rows for {sid}, skipping')
        continue

    out_file = OUT_DIR / f'{sid}.csv'
    print(f'  writing {len(rows)} rows to {out_file}')
    with open(out_file, 'w', encoding='utf-8', newline='') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(['data','giocatore','iniziali','t1','t2','t3'])
        for r in rows:
            d = r.get('data') or ''
            gioc = r.get('giocatore') or ''
            inz = r.get('iniziali') or ''
            t1 = r.get('t1') if r.get('t1') is not None else -1
            t2 = r.get('t2') if r.get('t2') is not None else -1
            t3 = r.get('t3') if r.get('t3') is not None else -1
            writer.writerow([d, gioc, inz, t1, t2, t3])

print('Fetch complete.')
