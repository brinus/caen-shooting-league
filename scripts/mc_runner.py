#!/usr/bin/env python3
"""mc_runner.py — Server-side Monte Carlo runner

Fetches results from Supabase (or local .env), computes player statistics,
and runs Monte Carlo simulations for the next matchday and for the
remaining season. Results are written to `data/mc_results_{season_id}.json`.

This implementation is pure-Python and avoids heavy numeric dependencies
so it can run in lightweight CI or serverless environments. It is tuned
to be configurable via environment variables.
"""
from __future__ import annotations
import os
import json
import random
from pathlib import Path
from datetime import datetime, date
import argparse
import sys
from typing import List, Dict, Any

REPO = Path(__file__).resolve().parent.parent
SEASONS_FILE = REPO / 'data' / 'seasons.json'
OUT_DIR = REPO / 'data'


def load_env_from_repo_root(repo: Path):
    env_path = repo / '.env'
    if env_path.exists():
        try:
            with open(env_path, encoding='utf-8') as ef:
                for raw in ef:
                    line = raw.strip()
                    if not line or line.startswith('#'):
                        continue
                    if '=' not in line:
                        continue
                    k, v = line.split('=', 1)
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    if k and k not in os.environ:
                        os.environ[k] = v
        except Exception:
            pass


def connect_supabase():
    SUPABASE_URL = os.getenv('SUPABASE_URL')
    SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
    try:
        from supabase import create_client
    except Exception as e:
        raise RuntimeError('Missing dependency supabase; pip install supabase') from e
    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    client.postgrest.auth(SUPABASE_KEY)
    return client


def fetch_results_for_season(client, season_id: str) -> List[Dict[str, Any]]:
    resp = client.table('risultati').select('data,giocatore,iniziali,t1,t2,t3').eq('stagione_id', season_id).order('data').execute()
    rows = resp.data if resp and hasattr(resp, 'data') else []
    parsed = []
    for r in rows:
        try:
            d = datetime.strptime(r.get('data') or '', '%Y-%m-%d').date()
        except Exception:
            continue
        t1 = r.get('t1') if r.get('t1') is not None else -1
        t2 = r.get('t2') if r.get('t2') is not None else -1
        t3 = r.get('t3') if r.get('t3') is not None else -1
        parsed.append({
            'data': d,
            'giocatore': r.get('giocatore') or '',
            'iniziali': r.get('iniziali') or '',
            't1': int(t1), 't2': int(t2), 't3': int(t3),
            'best': max([v for v in (t1, t2, t3) if v >= 0], default=0),
            'gara': True,
        })
    return parsed


def build_player_profiles(classifica: List[Dict[str, Any]], giornate: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    # Recreate sim_players from the old generator logic with conservative defaults
    by_name = {p['nome']: {**p, 'scores': []} for p in classifica}
    for g in giornate:
        for r in g.get('risultati', []):
            if r['nome'] in by_name:
                by_name[r['nome']]['scores'].append(r['punteggio'])

    all_scores = [s for p in by_name.values() for s in p['scores']]
    league_avg = sum(all_scores) / len(all_scores) if all_scores else 12.0
    # use simple stddev fallback
    def stddev(lst):
        if len(lst) < 2: return 6.0
        m = sum(lst)/len(lst)
        return (sum((x-m)**2 for x in lst)/len(lst))**0.5
    league_dev = max(stddev(all_scores), 4.5)

    played_days = len(giornate)
    season_weight = min(max((played_days / max(played_days, 1)) * 0.5, 0.18), 0.78)

    sim_players = []
    for p in classifica:
        scores = by_name[p['nome']]['scores']
        observed_avg = sum(scores)/len(scores) if scores else league_avg
        observed_dev = stddev(scores) if len(scores) > 1 else league_dev
        play_rate = min(max((p.get('partite',0) + 0.5) / max(played_days,1), 0.25), 0.95)
        adj_avg = (sum(scores) + league_avg * 3) / (len(scores) + 3) if scores else league_avg
        adj_dev = max((observed_dev * max(len(scores),1) + league_dev * 3) / (max(len(scores),1) + 3), 2.5)
        trend = 0.0
        if len(scores) >= 2:
            trend = max(min((scores[-1] - scores[-2]) * 0.18, 2.5), -2.5)

        sim_players.append({
            'name': p['nome'],
            'initials': p['iniziali'],
            'position': p.get('posizione', 0),
            'current_points': p.get('punti_campionato', 0),
            'current_score_points': p.get('punti_tiro', 0),
            'current_record': p.get('record', 0),
            'current_matches': p.get('partite', 0),
            'current_wins': p.get('vittorie', 0),
            'play_prob': play_rate,
            'score_mean': max(min(adj_avg, 40.0), 4.0),
            'score_dev': adj_dev,
            'trend': trend,
            'scores': scores,
        })

    return sim_players


def simulate_matchday_once(sim_players: List[Dict[str, Any]], rng: random.Random) -> List[Dict[str, Any]]:
    entries = []
    for player in sim_players:
        if rng.random() <= player['play_prob']:
            sampled = int(round(rng.gauss(player['score_mean'] + player['trend'], player['score_dev'])))
            score = max(0, min(50, sampled))
            entries.append({'name': player['name'], 'score': score})
    entries.sort(key=lambda e: e['score'], reverse=True)
    current_pos = 1
    for idx, entry in enumerate(entries):
        if idx > 0 and entry['score'] < entries[idx-1]['score']:
            current_pos = idx + 1
        entry['position'] = current_pos
    return entries


def monte_carlo_next_matchday(sim_players: List[Dict[str, Any]], iterations: int, seed: str = '') -> Dict[str, float]:
    rng = random.Random(seed or 'mc-next')
    counters = {p['name']: {'win':0,'podio':0,'over25':0,'over20':0} for p in sim_players}
    for _ in range(iterations):
        entries = simulate_matchday_once(sim_players, rng)
        if not entries:
            continue
        for e in entries:
            if e['position'] == 1:
                counters[e['name']]['win'] += 1
            if e['position'] <= 3:
                counters[e['name']]['podio'] += 1
            if e['score'] >= 25:
                counters[e['name']]['over25'] += 1
            if e['score'] >= 20:
                counters[e['name']]['over20'] += 1

    probs = {}
    for name, c in counters.items():
        probs[name] = {
            'win': (c['win'] + 1) / (iterations + 2),
            'podio': (c['podio'] + 1) / (iterations + 2),
            'over25': (c['over25'] + 1) / (iterations + 2),
            'over20': (c['over20'] + 1) / (iterations + 2),
        }
    return probs


def monte_carlo_season(sim_players: List[Dict[str, Any]], remaining_days: int, iterations: int, seed: str = '') -> Dict[str, float]:
    rng = random.Random(seed or 'mc-season')
    counters = {p['name']:0 for p in sim_players}
    for _ in range(iterations):
        state = {p['name']:{'points':p['current_points'],'score_points':p['current_score_points'],'record':p['current_record'],'matches':p['current_matches'],'wins':p['current_wins']} for p in sim_players}
        for _d in range(remaining_days):
            entries = simulate_matchday_once(sim_players, rng)
            if not entries:
                continue
            for e in entries:
                nm = state[e['name']]
                nm['points'] += puntos_per_pos(e['position']) if 'puntos_per_pos' in globals() else puntos_per_pos_builtin(e['position'])
                nm['score_points'] += e['score']
                nm['matches'] += 1
                nm['record'] = max(nm['record'], e['score'])
                if e['position'] == 1:
                    nm['wins'] += 1

        final_board = sorted(state.values(), key=lambda p:(-p['points'],-p['score_points'],-p['record'],-p['wins']))
        winner = final_board[0]
        # we don't have name easily here; instead recompute by matching points/backtracking
        # Simplify: count by player name via recomputing final ordering with names
        named_board = sorted(state.items(), key=lambda kv:(-kv[1]['points'],-kv[1]['score_points'],-kv[1]['record'],-kv[1]['wins']))
        winner_name = named_board[0][0]
        counters[winner_name] += 1

    probs = {name: (count + 1) / (iterations + 2) for name, count in counters.items()}
    return probs


def puntos_per_pos_builtin(pos: int) -> int:
    PUNTI = [10,8,6,4,4,2,2,1,1,1]
    return PUNTI[pos-1] if pos-1 < len(PUNTI) else 0


def write_output(season_id: str, next_probs: Dict[str, Dict[str,float]], season_probs: Dict[str,float], out_dir: Path):
    out = {
        'season_id': season_id,
        'generated_at': datetime.utcnow().isoformat() + 'Z',
        'next_matchday': next_probs,
        'season': season_probs,
    }
    out_file = out_dir / f'mc_results_{season_id}.json'
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(out, indent=2), encoding='utf-8')
    print(f'Wrote MC results to {out_file}')


def main():
    load_env_from_repo_root(REPO)
    parser = argparse.ArgumentParser(description='Run server-side Monte Carlo from Supabase data')
    parser.add_argument('--season', help='Season id (default: last in seasons.json)')
    parser.add_argument('--next-iters', type=int, default=5000, help='Iterations for next matchday')
    parser.add_argument('--season-iters', type=int, default=20000, help='Iterations for season simulation')
    args = parser.parse_args()

    # Load seasons config
    with open(SEASONS_FILE, encoding='utf-8') as f:
        seasons = json.load(f)
    season = None
    if args.season:
        season = next((s for s in seasons if s['id'] == args.season), None)
        if not season:
            print('Season not found in seasons.json')
            sys.exit(1)
    else:
        season = seasons[-1]

    client = connect_supabase()
    rows = fetch_results_for_season(client, season['id'])

    # Import helper functions from legacy generator to compute giornate/classifica
    import importlib.util
    spec = importlib.util.spec_from_file_location('agg', str(REPO / 'scripts' / 'aggiorna.py'))
    agg = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(agg)

    # re-use the legacy functions assign_recuperi/build_giornate/compute_classifica
    season_results, player_recuperi = agg.assign_recuperi(season, rows)
    giornate = agg.build_giornate(season, season_results)
    classifica = agg.compute_classifica(season, season_results, giornate, player_recuperi, season.get('max_recuperi',4))

    sim_players = build_player_profiles(classifica, giornate)

    # compute remaining days
    season_start = datetime.strptime(season['inizio'], '%Y-%m-%d').date()
    season_end = datetime.strptime(season['fine'], '%Y-%m-%d').date()
    played_dates = {datetime.strptime(day['data'], '%Y-%m-%d').date() for day in giornate}
    remaining_days = len([d for d in agg.list_giornate_gara(season_start, season_end) if d not in played_dates and d >= date.today()])

    next_probs = {}
    season_probs = {}
    if remaining_days > 0:
        next_probs = monte_carlo_next_matchday(sim_players, args.next_iters, seed=f'{season["id"]}-next')
        season_probs = monte_carlo_season(sim_players, remaining_days, args.season_iters, seed=f'{season["id"]}-season')
    else:
        print('No remaining matchdays for season; skipping MC')

    write_output(season['id'], next_probs, season_probs, OUT_DIR)


if __name__ == '__main__':
    main()
