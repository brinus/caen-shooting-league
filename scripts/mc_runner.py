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
import numpy as np
import hashlib
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
    # Vectorized implementation using NumPy
    # numpy SeedSequence expects ints; accept string seeds by hashing them to an int
    if seed:
        if isinstance(seed, (int, np.integer)):
            ss = int(seed)
        elif isinstance(seed, (list, tuple)):
            ss = seed
        else:
            h = hashlib.sha256(str(seed).encode('utf-8')).digest()
            ss = int.from_bytes(h[:8], 'big')
        rng = np.random.default_rng(ss)
    else:
        rng = np.random.default_rng(None)
    names = [p['name'] for p in sim_players]
    P = len(sim_players)
    if P == 0:
        return {}

    means = np.array([p['score_mean'] + p.get('trend', 0.0) for p in sim_players], dtype=float)
    devs = np.array([max(0.0001, p['score_dev']) for p in sim_players], dtype=float)
    play_probs = np.array([p.get('play_prob', 1.0) for p in sim_players], dtype=float)

    # samples shape: (P, iterations)
    samples = rng.normal(loc=means[:, None], scale=devs[:, None], size=(P, iterations))
    # apply play mask
    play_mask = rng.random(size=(P, iterations)) < play_probs[:, None]
    # clip and set non-playing to -inf so they lose
    samples = np.round(samples).astype(int)
    samples = np.clip(samples, 0, 50)
    samples = samples.astype(float)
    samples[~play_mask] = -1e6

    # determine top positions per simulation
    order = np.argsort(-samples, axis=0)  # indices of players sorted desc
    winners = order[0, :]
    pods = order[:3, :]

    win_counts = np.bincount(winners, minlength=P)
    pod_counts = np.zeros(P, dtype=int)
    for i in range(P):
        pod_counts[i] = np.count_nonzero(np.any(pods == i, axis=0))

    over25 = np.sum((samples >= 25) & play_mask, axis=1)
    over20 = np.sum((samples >= 20) & play_mask, axis=1)
    over30 = np.sum((samples >= 30) & play_mask, axis=1)

    probs = {}
    for idx, name in enumerate(names):
        probs[name] = {
            'win': (int(win_counts[idx]) + 1) / (iterations + 2),
            'podio': (int(pod_counts[idx]) + 1) / (iterations + 2),
            'over30': (int(over30[idx]) + 1) / (iterations + 2),
            'over25': (int(over25[idx]) + 1) / (iterations + 2),
            'over20': (int(over20[idx]) + 1) / (iterations + 2),
        }
    return probs


def monte_carlo_season(sim_players: List[Dict[str, Any]], remaining_days: int, iterations: int, seed: str = '') -> Dict[str, float]:
    # Batch Monte Carlo using NumPy to reduce Python loop overhead
    # numpy SeedSequence expects ints; accept string seeds by hashing them to an int
    if seed:
        if isinstance(seed, (int, np.integer)):
            ss = int(seed)
        elif isinstance(seed, (list, tuple)):
            ss = seed
        else:
            h = hashlib.sha256(str(seed).encode('utf-8')).digest()
            ss = int.from_bytes(h[:8], 'big')
        rng = np.random.default_rng(ss)
    else:
        rng = np.random.default_rng(None)
    names = [p['name'] for p in sim_players]
    P = len(sim_players)
    if P == 0 or remaining_days <= 0:
        return {p['name']: 0.0 for p in sim_players}

    means = np.array([p['score_mean'] + p.get('trend', 0.0) for p in sim_players], dtype=float)
    devs = np.array([max(0.0001, p['score_dev']) for p in sim_players], dtype=float)
    play_probs = np.array([p.get('play_prob', 1.0) for p in sim_players], dtype=float)
    current_points = np.array([p.get('current_points', 0) for p in sim_players], dtype=int)
    current_score_points = np.array([p.get('current_score_points', 0) for p in sim_players], dtype=int)
    current_record = np.array([p.get('current_record', 0) for p in sim_players], dtype=int)
    current_wins = np.array([p.get('current_wins', 0) for p in sim_players], dtype=int)
    current_matches = np.array([p.get('current_matches', 0) for p in sim_players], dtype=int)
    # precompute thresholds per player (based on current_record/current average)
    best_thresh_arr = ((current_record // 5) + 1) * 5
    best_plus5_arr = best_thresh_arr + 5
    current_avg = np.array([ (p.get('current_score_points',0) / p.get('current_matches',1)) if p.get('current_matches',0) > 0 else 0.0 for p in sim_players ], dtype=float)
    media_thresh_arr = ((current_avg.astype(int) // 5) + 1) * 5

    counters = np.zeros(P, dtype=int)
    podio_counts = np.zeros(P, dtype=int)
    top5_counts = np.zeros(P, dtype=int)
    avg18_counts = np.zeros(P, dtype=int)
    # Additional counters for BestOver/BestOver+5/MediaOver (multiples of 5)
    best_over_counts = np.zeros(P, dtype=int)
    best_over_plus5_counts = np.zeros(P, dtype=int)
    media_over_counts = np.zeros(P, dtype=int)

    batch = 2000
    for start in range(0, iterations, batch):
        b = min(batch, iterations - start)
        # simulate scores: shape (P, remaining_days, b)
        scores = rng.normal(loc=means[:, None, None], scale=devs[:, None, None], size=(P, remaining_days, b))
        play = rng.random(size=(P, remaining_days, b)) < play_probs[:, None, None]
        scores = np.round(scores).astype(int)
        scores = np.clip(scores, 0, 50).astype(float)
        scores[~play] = -1e6

        # for each simulation in batch, compute points accumulated
        for sim_idx in range(b):
            state_points = current_points.copy()
            state_score_points = current_score_points.copy()
            state_record = current_record.copy()
            state_wins = current_wins.copy()
            state_matches = current_matches.copy()

            for d in range(remaining_days):
                col = scores[:, d, sim_idx]
                # if no one played, skip
                if np.all(col < 0):
                    continue
                order = np.argsort(-col)
                # assign positions with ties: players with same score get same pos - approximate
                # compute positions
                pos = np.empty(P, dtype=int)
                pos.fill(np.iinfo(int).max)
                rank = 1
                prev = None
                for idx in range(P):
                    player_idx = order[idx]
                    val = col[player_idx]
                    if val < 0:
                        break
                    if prev is None:
                        pos[player_idx] = rank
                        prev = val
                    else:
                        if val < prev:
                            rank = idx + 1
                            prev = val
                        pos[player_idx] = rank

                for i in range(P):
                    if pos[i] == np.iinfo(int).max:
                        continue
                    state_points[i] += puntos_per_pos_builtin(pos[i])
                    state_score_points[i] += int(max(0, col[i]))
                    state_record[i] = max(state_record[i], int(max(0, col[i])))
                    # increment match count if player played
                    state_matches[i] += 1
                    if pos[i] == 1:
                        state_wins[i] += 1

            # determine final ordering (keep existing lexsort ordering to preserve behaviour)
            order_final = np.lexsort((-state_wins, -state_record, -state_score_points, -state_points, np.arange(P)))
            winner_idx = order_final[0]
            counters[winner_idx] += 1

            # compute positions from order_final (1-based)
            positions = np.empty(P, dtype=int)
            for rank_idx in range(P):
                positions[order_final[rank_idx]] = rank_idx + 1

            # collect podio events
            for i in range(P):
                if positions[i] <= 3:
                    podio_counts[i] += 1
                if positions[i] <= 5:
                    top5_counts[i] += 1

            # compute BestOver/BestOver+5/MediaOver thresholds from starting values
            # threshold is the next multiple of 5 strictly greater than current value
            # e.g., current 18 -> threshold 20; current 20 -> threshold 25
            for i in range(P):
                cur_best = int(current_record[i])
                best_thresh = ((cur_best // 5) + 1) * 5
                best_plus5_thresh = best_thresh + 5

                # final best and average
                final_best = int(state_record[i])
                final_matches = int(state_matches[i]) if int(state_matches[i]) > 0 else 0
                final_avg = (state_score_points[i] / final_matches) if final_matches > 0 else 0.0

                if final_best >= best_thresh:
                    best_over_counts[i] += 1
                if final_best >= best_plus5_thresh:
                    best_over_plus5_counts[i] += 1

                # mediaOver: next multiple of 5 strictly greater than current average
                cur_avg = (current_score_points[i] / current_matches[i]) if current_matches[i] > 0 else 0.0
                media_thresh = ((int(cur_avg) // 5) + 1) * 5
                if final_avg > 0 and final_avg >= media_thresh:
                    media_over_counts[i] += 1
                # avg18 specific
                if final_avg >= 18.0:
                    avg18_counts[i] += 1

    probs = {}
    for i in range(P):
        probs[names[i]] = {
            'win': (int(counters[i]) + 1) / (iterations + 2),
            'podio': (int(podio_counts[i]) + 1) / (iterations + 2),
            'top5': (int(top5_counts[i]) + 1) / (iterations + 2),
            'best_over': (int(best_over_counts[i]) + 1) / (iterations + 2),
            'best_over_plus5': (int(best_over_plus5_counts[i]) + 1) / (iterations + 2),
            'media_over': (int(media_over_counts[i]) + 1) / (iterations + 2),
            'avg18': (int(avg18_counts[i]) + 1) / (iterations + 2),
            'best_over_thr1_value': int(best_thresh_arr[i]),
            'best_over_thr2_value': int(best_plus5_arr[i]),
            'media_over_thr_value': int(media_thresh_arr[i]),
        }
    return probs


def puntos_per_pos_builtin(pos: int) -> int:
    PUNTI = [10,8,6,4,4,2,2,1,1,1]
    return PUNTI[pos-1] if pos-1 < len(PUNTI) else 0


def write_output(season_id: str, next_probs: Dict[str, Dict[str,float]], season_probs: Dict[str,float], out_dir: Path):
    # Build compatibility `perPlayer` array and thresholds summary
    player_names = sorted(set(list(next_probs.keys()) + list(season_probs.keys())))
    per_player = []
    for name in player_names:
        n = next_probs.get(name, {})
        s = season_probs.get(name, {})
        item = {
            'nome': name,
            # next-day probabilities
            'pNextWin': n.get('win'),
            'pNextPodio': n.get('podio'),
            'pOver25': n.get('over25'),
            'pOver20': n.get('over20'),
            'pOver30': n.get('over30'),
            # season-level probabilities (fallbacks)
            'pTitolo': s.get('win'),
            'pPodio': s.get('podio'),
            'pTop5': s.get('top5'),
            'pBest30': s.get('best_over'),
            'pAvg18': s.get('avg18'),
            # thresholds array for backward compat: [pOver25, pOver30]
            'pThresholds': [n.get('over25'), n.get('over30')]
        }
        per_player.append(item)

    # thresholds summary (example: [pOver25_global, pOver30_global] computed as averages)
    thresholds = None
    if per_player:
        vals25 = [x['pThresholds'][0] for x in per_player if x['pThresholds'][0] is not None]
        vals30 = [x['pThresholds'][1] for x in per_player if x['pThresholds'][1] is not None]
        thresholds = [sum(vals25)/len(vals25) if vals25 else None, sum(vals30)/len(vals30) if vals30 else None]

    out = {
        'season_id': season_id,
        'generated_at': datetime.utcnow().isoformat() + 'Z',
        'next_matchday': next_probs,
        'season': season_probs,
        'perPlayer': per_player,
        'thresholds': thresholds,
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
