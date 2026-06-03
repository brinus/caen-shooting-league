#!/usr/bin/env python3
"""Genera quote di mercato per la prossima giornata basandosi sullo storico.

Miglioramenti rispetto alla versione precedente:
- modello discreto a istogramma per punteggi (0..50) con prior Dirichlet
- separazione esplicita della probabilità di "miss" (assente)
- shrinkage empirico stabile per le distribuzioni categoriali
- tie-break deterministico (jitter numerico) invece di shuffle casuale
- modalità `fast` che usa NumPy quando disponibile (opzionale)
- refactor in componenti: data loader, model builder, simulatore, generator

Output: JSON conforme allo schema esistente (compatibilità totale).
"""
from pathlib import Path
import csv
import json
import random
import argparse
import zlib
import math
from collections import Counter, defaultdict
from typing import Dict, List, Tuple
import sys
from datetime import datetime

# Optional numpy acceleration
try:
    import numpy as np
except Exception:
    np = None


SCORE_MIN = 0
SCORE_MAX = 50
SCORE_RANGE = SCORE_MAX - SCORE_MIN + 1


def load_results(risultati_dir: Path) -> Tuple[Dict, List[int]]:
    players = {}
    global_scores = []
    for fp in sorted(risultati_dir.glob('*.csv')):
        with fp.open(encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for r in reader:
                name = (r.get('giocatore') or '').strip()
                if not name:
                    continue
                rec = players.setdefault(name, {'scores': [], 'misses': 0, 'opps': 0, 'rows': 0})
                rec['rows'] += 1
                for k in ('t1', 't2', 't3'):
                    rec['opps'] += 1
                    raw = r.get(k, '')
                    try:
                        v = int(raw)
                    except Exception:
                        v = -1
                    if v is None or v < 0:
                        rec['misses'] += 1
                    else:
                        # clamp defensively
                        v = max(SCORE_MIN, min(SCORE_MAX, v))
                        rec['scores'].append(v)
                        global_scores.append(v)
    return players, global_scores


def global_histogram(global_scores: List[int], max_score: int = None) -> List[float]:
    """Return empirical histogram over 0..max_score (inclusive).

    If max_score is None the module-level SCORE_MAX is used. This allows
    building a single extended discrete distribution (Option A) instead of
    an ad-hoc tail component.
    """
    if max_score is None:
        max_score = SCORE_MAX
    rng = range(SCORE_MIN, max_score + 1)
    length = max_score - SCORE_MIN + 1
    counts = [0.0] * length
    for s in global_scores:
        if s < SCORE_MIN:
            continue
        if s > max_score:
            # values beyond max_score are aggregated into the top bin
            counts[-1] += 1.0
        else:
            counts[s - SCORE_MIN] += 1.0
    total = sum(counts)
    if total <= 0:
        return [1.0 / length] * length
    return [c / total for c in counts]


def build_player_models(players: Dict, global_scores: List[int], max_score: int = None, alpha_prior: float = 20.0, alpha_miss: float = 1.0) -> Dict:
    """Costruisce per ogni giocatore un modello discreto:
    - `score_probs`: lista di probabilità per valori 0..50 (con Dirichlet prior)
    - `miss_prob`: probabilità di mancare (Laplace-smoothed)
    - `mean` e `var` calcolate dalla distribuzione posteriore
    """
    # determine histogram support: allow extending beyond SCORE_MAX based on
    # historical extreme percentiles so that tail mass is data-driven
    if max_score is None:
        # compute 99.5 percentile + small margin (data-driven extension)
        try:
            gs = sorted([s for s in global_scores if s is not None])
            if gs:
                p = 99.5
                k = (len(gs) - 1) * (p / 100.0)
                lo = int(math.floor(k))
                hi = int(math.ceil(k))
                if hi == lo:
                    perc = gs[int(k)]
                else:
                    frac = k - lo
                    perc = int(round(gs[lo] * (1 - frac) + gs[hi] * frac))
                margin = 2
                max_score = max(SCORE_MAX, perc + margin)
            else:
                max_score = SCORE_MAX
        except Exception:
            max_score = SCORE_MAX

    g_hist = global_histogram(global_scores, max_score=max_score)
    # We'll use adaptive shrinkage: prior mass reduces with number of observations
    models = {}
    support_len = len(g_hist)
    for name, rec in players.items():
        counts = [0.0] * support_len
        for s in rec.get('scores', []):
            if s is None:
                continue
            if s < SCORE_MIN:
                continue
            if s > max_score:
                # aggregate extreme observed values into the top bin
                counts[-1] += 1.0
            else:
                counts[s - SCORE_MIN] += 1.0
        obs_total = sum(counts)

        # adaptive prior: fewer obs -> stronger prior
        n_obs = int(sum(1 for _ in rec.get('scores', []) if _ is not None and _ >= SCORE_MIN))
        eff_alpha = alpha_prior / math.sqrt(n_obs + 1.0)
        prior_counts = [p * eff_alpha for p in g_hist]

        # posterior counts: data + prior (now over extended support)
        post_counts = [counts[i] + prior_counts[i] for i in range(support_len)]
        post_total = sum(post_counts)
        if post_total <= 0:
            probs = [1.0 / support_len] * support_len
        else:
            probs = [c / post_total for c in post_counts]

        # moments (include extended support)
        mean = sum((i + SCORE_MIN) * p for i, p in enumerate(probs))
        var = sum(((i + SCORE_MIN) - mean) ** 2 * p for i, p in enumerate(probs))

        # miss prob: Laplace smoothing
        opps = rec.get('opps', 0)
        misses = rec.get('misses', 0)
        miss_prob = (misses + alpha_miss) / (opps + alpha_miss * 2) if opps or alpha_miss else 0.0

        models[name] = {
            'score_probs': probs,
            'miss_prob': float(miss_prob),
            'attempts_on_record': int(len(rec.get('scores', []))),
            'opps': int(opps),
            'misses': int(misses),
            'mean': float(mean),
            'var': float(var),
            'support_max': max_score,
        }
    return models


def deterministic_jitter(name: str, iteration: int) -> float:
    """Deterministic small jitter in (0, 1e-6) from name and iteration using crc32."""
    # keep for backward-compat but return a fixed jitter per name (no iteration)
    h = zlib.crc32(name.encode('utf-8')) & 0xFFFFFFFF
    return (h % 1000000) / 1e6


def sample_attempt_from_model(model: Dict, rng=random, ability: float = 0.0) -> int:
    """Sample a single attempt from the model's unified discrete distribution.

    Returns -1 for a miss. The model contains `score_probs` over an extended
    support 0..support_max. `ability` reweights probabilities smoothly without
    introducing an artificial tail split.
    """
    if rng.random() < model.get('miss_prob', 0.0):
        return -1

    probs = model['score_probs']
    L = len(probs)

    # if ability != 0, reweight probabilities slightly to favor higher scores
    if ability and abs(ability) > 1e-12:
        beta = 0.6
        weights = []
        for i, p in enumerate(probs):
            scaled = (i / float(max(1, L - 1)))
            weights.append(p * math.exp(beta * ability * scaled))
        s = sum(weights)
        if s > 0:
            probs_mod = [w / s for w in weights]
        else:
            probs_mod = probs
    else:
        probs_mod = probs

    # draw according to the discrete probabilities
    r = rng.random()
    cum = 0.0
    for i, p in enumerate(probs_mod):
        cum += p
        if r <= cum:
            return i + SCORE_MIN
    # numerical fallback: return top of support
    return SCORE_MIN + L - 1


def simulate(players_models: Dict, iterations: int = 20000, max_pos: int = 10, mode: str = 'auto', seed: int = None, chunk_size: int = 5000, show_progress: bool = False, hist_max_per_player: Dict = None, global_record: int = 0, collect_hist: bool = False) -> Tuple[Dict, Counter, Dict, Dict]:
    """Simulatore principale. Restituisce la struttura compatibile con l'output precedente.

    Modes:
    - 'fast': uses numpy if available (vectorized per-player sampling in chunks)
    - 'accurate': pure-Python per-iteration sampling (deterministic tie-break)
    - 'auto': use 'fast' if numpy is available, otherwise 'accurate'
    """
    if mode == 'auto':
        mode = 'fast' if np is not None else 'accurate'
    if mode == 'fast' and np is None:
        mode = 'accurate'

    names = list(players_models.keys())
    n_players = len(names)
    stats = {n: {'wins': 0, 'podio': 0, 'over20': 0, 'over25': 0, 'over30': 0, 'pos_counts': Counter(), 'sum_best': 0.0, 'sum_avg': 0.0} for n in names}
    hist_counts = {n: Counter() for n in names} if collect_hist else None
    top_counts = Counter()
    # special event counters
    special_counts = {
        'outsider_on_podio': 0,
        'nuovo_cecchino': 0,
        'nessuno_sotto_10': 0,
        'record_personale_battuto': 0,
    }

    # precompute numpy arrays if in fast mode
    if mode == 'fast':
        # prepare arrays of probs per player over a unified extended support
        probs_arr = np.array([players_models[n]['score_probs'] for n in names])
        miss_probs = np.array([players_models[n]['miss_prob'] for n in names])
        rng = np.random.default_rng(seed)

        # chunked processing to limit memory
        it = 0
        last_perc = -1
        while it < iterations:
            take = min(chunk_size, iterations - it)
            # sample attempts: build empty array then fill per-player to avoid unnecessary allocs
            samples = np.empty((n_players, take, 3), dtype=np.int16)
            L = probs_arr.shape[1]
            for pi in range(n_players):
                p = probs_arr[pi]
                psum = float(p.sum())
                if psum <= 0:
                    norm = None
                else:
                    norm = (p / psum)
                flat = rng.choice(np.arange(L), size=(take * 3,), p=norm)
                samples[pi] = flat.reshape((take, 3))
                # apply misses: use sentinel -1 (overrides sampled values)
                miss_mask = rng.random((take, 3)) < miss_probs[pi]
                samples[pi][miss_mask] = -1

            # process chunk iterations
            for offset in range(take):
                iter_index = it + offset
                # compute per-player stats
                arr = samples[:, offset, :]
                valid_mask = arr >= 0
                counts = valid_mask.sum(axis=1)
                sums = np.where(valid_mask, arr, 0).sum(axis=1).astype(float)
                denom = np.where(counts > 0, counts, 1)
                avgs = np.where(counts > 0, sums / denom, 0.0)
                bests = np.where(counts > 0, arr.max(axis=1), -1)
                # second best (or -1 if not available)
                seconds = np.partition(arr, -2, axis=1)[:, -2]

                # build ranking keys and sort indices descending
                # tie-breaker: deterministic jitter per name and iter
                keys = list(zip(bests.tolist(), avgs.tolist(), seconds.tolist()))
                order = list(range(n_players))
                # stable tie-break: use name as final key
                order.sort(key=lambda idx: (keys[idx][0], keys[idx][1], keys[idx][2], names[idx]), reverse=True)
                for pos, idx in enumerate(order[:max_pos], start=1):
                    name = names[idx]
                    # count position
                    stats[name]['pos_counts'][pos] += 1
                    if pos == 1:
                        stats[name]['wins'] += 1
                    if pos <= 3:
                        stats[name]['podio'] += 1
                # accumulate sums for expected best/avg
                for idx in range(n_players):
                    name = names[idx]
                    stats[name]['sum_best'] += float(bests[idx])
                    stats[name]['sum_avg'] += float(avgs[idx])
                    # collect histogram of bests if requested
                    if collect_hist:
                        bv = int(bests[idx])
                        if bv < 0:
                            bv = 0
                        hist_counts[names[idx]][bv] += 1
                # record top-k ordering
                top_tuple = tuple(names[idx] for idx in order[:max_pos])
                top_counts[top_tuple] += 1
                # count thresholds
                for idx in range(n_players):
                    name = names[idx]
                    b = int(bests[idx])
                    if b >= 20:
                        stats[name]['over20'] += 1
                    if b >= 25:
                        stats[name]['over25'] += 1
                    if b >= 30:
                        stats[name]['over30'] += 1
                # special events per iteration
                # outsider on podium: any of top3 not in season top10
                if hist_max_per_player is not None:
                    seasonal_sorted = sorted(hist_max_per_player.items(), key=lambda kv: kv[1], reverse=True)
                    seasonal_top10 = set([kv[0] for kv in seasonal_sorted[:10]])
                    top3 = set(names[idx] for idx in order[:3])
                    if any(p not in seasonal_top10 for p in top3):
                        special_counts['outsider_on_podio'] += 1
                # nuovo cecchino: any best > global_record
                if global_record and any(int(b) > global_record for b in bests):
                    special_counts['nuovo_cecchino'] += 1
                # nessuno sotto i 10: all bests >= 10
                if all(int(b) >= 10 for b in bests):
                    special_counts['nessuno_sotto_10'] += 1
                # record personale battuto: any best > player's hist max
                if hist_max_per_player is not None and any(int(bests[i]) > hist_max_per_player.get(names[i], 0) for i in range(n_players)):
                    special_counts['record_personale_battuto'] += 1

            it += take
            if show_progress:
                processed = it
                perc = min(100, int(processed * 100 / iterations))
                if perc != last_perc:
                    print(f"Progress: {perc}% ({processed}/{iterations})", file=sys.stderr)
                    last_perc = perc

    else:
        # accurate: pure-Python per-iteration sampling with deterministic tie-break
        rng = random.Random(seed)
        last_perc = -1
        for it in range(iterations):
            results = {}
            for name in names:
                model = players_models[name]
                # correlated attempts: sample a per-player ability offset per iteration
                sigma_ability = 0.25
                ability = rng.gauss(0, sigma_ability)
                tries = [sample_attempt_from_model(model, rng=rng, ability=ability) for _ in range(3)]
                sorted_t = sorted(tries, reverse=True)
                best = sorted_t[0]
                second = sorted_t[1]
                avg = sum(tries) / 3.0
                results[name] = (best, avg, second)

            # ranking by tuple, deterministic jitter for tie-break
            order = list(names)
            order.sort(key=lambda nm: (results[nm][0], results[nm][1], results[nm][2], nm), reverse=True)
            for pos, name in enumerate(order[:max_pos], start=1):
                stats[name]['pos_counts'][pos] += 1
                if pos == 1:
                    stats[name]['wins'] += 1
                if pos <= 3:
                    stats[name]['podio'] += 1
            # record top-k ordering for this iteration
            top_tuple = tuple(order[:max_pos])
            top_counts[top_tuple] += 1
            for name in names:
                b = results[name][0]
                if b >= 20:
                    stats[name]['over20'] += 1
                if b >= 25:
                    stats[name]['over25'] += 1
                if b >= 30:
                    stats[name]['over30'] += 1
            # accumulate sums for expected best/avg
            for name in names:
                stats[name]['sum_best'] += float(results[name][0])
                stats[name]['sum_avg'] += float(results[name][1])
                # collect histogram of bests if requested
                if collect_hist:
                    bv = int(results[name][0])
                    if bv < 0:
                        bv = 0
                    hist_counts[name][bv] += 1
            # special events per iteration
            # outsider on podium: any of top3 not in season top10
            if hist_max_per_player is not None:
                seasonal_sorted = sorted(hist_max_per_player.items(), key=lambda kv: kv[1], reverse=True)
                seasonal_top10 = set([kv[0] for kv in seasonal_sorted[:10]])
                top3 = set(order[:3])
                if any(p not in seasonal_top10 for p in top3):
                    special_counts['outsider_on_podio'] += 1
            # nuovo cecchino: any best > global_record
            if global_record and any(results[n][0] > global_record for n in names):
                special_counts['nuovo_cecchino'] += 1
            # nessuno sotto i 10: all bests >= 10
            if all(results[n][0] >= 10 for n in names):
                special_counts['nessuno_sotto_10'] += 1
            # record personale battuto: any best > player's hist max
            if hist_max_per_player is not None and any(results[n][0] > hist_max_per_player.get(n, 0) for n in names):
                special_counts['record_personale_battuto'] += 1
            if show_progress and (it % max(1, iterations // 100) == 0):
                perc = min(100, int((it + 1) * 100 / iterations))
                if perc != last_perc:
                    print(f"Progress: {perc}% ({it+1}/{iterations})", file=sys.stderr)
                    last_perc = perc

    # convert to probabilities and construct output structure
    out = {}
    for name in names:
        s = stats[name]
        out[name] = {}
        mdl = players_models[name]
        out[name]['attempts_on_record'] = mdl.get('attempts_on_record', 0)
        out[name]['miss_rate'] = float(mdl.get('miss_prob', 0.0))
        out[name]['prob_over20'] = s['over20'] / iterations
        out[name]['prob_over25'] = s['over25'] / iterations
        out[name]['prob_over30'] = s['over30'] / iterations
        out[name]['prob_vittoria'] = s['wins'] / iterations
        out[name]['prob_podio'] = s['podio'] / iterations
        pos_probs = {}
        for pos in range(1, max_pos + 1):
            pos_probs[str(pos)] = s['pos_counts'].get(pos, 0) / iterations
        out[name]['positional_prob'] = pos_probs

        def odds(p):
            if p <= 0 or not math.isfinite(p):
                return None
            return round(max(1.01, 1.0 / p), 2)

        out[name]['odds_over20'] = odds(out[name]['prob_over20'])
        out[name]['odds_over25'] = odds(out[name]['prob_over25'])
        out[name]['odds_over30'] = odds(out[name]['prob_over30'])
        out[name]['odds_vittoria'] = odds(out[name]['prob_vittoria'])
        out[name]['odds_podio'] = odds(out[name]['prob_podio'])
        out[name]['positional_odds'] = {pos: odds(p) for pos, p in pos_probs.items()}
        # expected values
        out[name]['expected_best'] = s['sum_best'] / iterations if iterations > 0 else 0.0
        out[name]['expected_avg'] = s['sum_avg'] / iterations if iterations > 0 else 0.0

    if collect_hist:
        return out, top_counts, special_counts, hist_counts
    return out, top_counts, special_counts



def main():
    p = argparse.ArgumentParser(description='Genera quote di mercato per la prossima giornata (improved)')
    p.add_argument('--risultati', default='risultati', help='Cartella con CSV risultati')
    p.add_argument('--iters', type=int, default=2000000, help='Numero di simulazioni (default: 2000000)')
    p.add_argument('--out', default='market_odds.json', help='File JSON di output')
    p.add_argument('--max-pos', type=int, default=10, help='Massima posizione da riportare (default:10)')
    p.add_argument('--seed', type=int, default=None, help='Seed per RNG (opzionale)')
    p.add_argument('--max-odds', type=float, default=200.0, help='Clip massimo per le quote (default:200)')
    p.add_argument('--mode', choices=['auto', 'fast', 'accurate'], default='fast', help='Modalità di simulazione (fast usa numpy quando disponibile)')
    p.add_argument('--alpha-prior', type=float, default=10.0, help='Prior total mass for Dirichlet smoothing of score histogram')
    p.add_argument('--alpha-miss', type=float, default=1.0, help='Laplace smoothing for miss probability')
    p.add_argument('--chunk-size', type=int, default=5000, help='Chunk size for fast mode (minimizza memoria)')
    p.add_argument('--smooth-count', type=float, default=30.0, help='Pseudo-count per-event per-player for final smoothing (default:30)')
    p.add_argument('--vig', type=float, default=0.05, help='Bookmaker margin to reduce displayed odds (fraction, e.g. 0.05)')
    p.add_argument('--debug-plots', action='store_true', default=False, help='Generate debug plots (optional)')
    args = p.parse_args()

    ris_dir = Path(args.risultati)
    if not ris_dir.exists():
        print('Directory risultati non trovata:', ris_dir)
        return

    print('Caricamento risultati da', ris_dir)
    players, global_scores = load_results(ris_dir)
    if not players:
        print('Nessun giocatore trovato in', ris_dir)
        return

    print(f'Giocatori trovati: {len(players)}; iterazioni: {args.iters}; mode: {args.mode}')

    players_models = build_player_models(players, global_scores, alpha_prior=args.alpha_prior, alpha_miss=args.alpha_miss)

    p_smooth = args.smooth_count
    vig = args.vig

    # Prepare historical maxima and global record for special bets
    hist_max_per_player = {n: (max(players.get(n, {}).get('scores', [])) if players.get(n, {}).get('scores') else 0) for n in players_models.keys()}
    global_record = max(global_scores) if global_scores else 0

    # Always show progress
    # collect per-player best-score histograms when debug plots requested
    if args.debug_plots:
        out, top_counts, special_counts, hist_counts = simulate(players_models, iterations=args.iters, max_pos=args.max_pos, mode=args.mode, seed=args.seed, chunk_size=args.chunk_size, show_progress=True, hist_max_per_player=hist_max_per_player, global_record=global_record, collect_hist=True)
    else:
        out, top_counts, special_counts = simulate(players_models, iterations=args.iters, max_pos=args.max_pos, mode=args.mode, seed=args.seed, chunk_size=args.chunk_size, show_progress=True, hist_max_per_player=hist_max_per_player, global_record=global_record)

    # Apply smoothing and vig, then clip odds
    max_odds = args.max_odds
    N = float(args.iters)
    Kpos = args.max_pos
    for pname, pdata in out.items():
        # estimated raw counts from probabilities
        # Binary events: treat as two-category Dirichlet (alpha applied to both)
        def smooth_bin(p):
            alpha = p_smooth
            count = p * N
            p_new = (count + alpha) / (N + 2.0 * alpha) if N + 2.0 * alpha > 0 else p
            return p_new

        pdata['prob_over20'] = smooth_bin(pdata.get('prob_over20', 0.0))
        pdata['prob_over25'] = smooth_bin(pdata.get('prob_over25', 0.0))
        pdata['prob_over30'] = smooth_bin(pdata.get('prob_over30', 0.0))
        pdata['prob_vittoria'] = smooth_bin(pdata.get('prob_vittoria', 0.0))
        pdata['prob_podio'] = smooth_bin(pdata.get('prob_podio', 0.0))
        # approximate 95% CI for prob_vittoria (binomial approximation)
        p = pdata['prob_vittoria']
        se = math.sqrt(p * (1.0 - p) / N) if N > 0 else 0.0
        low = max(0.0, p - 1.96 * se)
        high = min(1.0, p + 1.96 * se)
        pdata['prob_vittoria_ci'] = [low, high]

        # positional: multinomial smoothing across K positions
        pos_probs = pdata.get('positional_prob', {})
        pos_new = {}
        for pos in range(1, Kpos + 1):
            p_old = pos_probs.get(str(pos), 0.0)
            count = p_old * N
            alpha = p_smooth
            denom = N + alpha * float(Kpos)
            ppos = (count + alpha) / denom if denom > 0 else p_old
            pos_new[str(pos)] = ppos
        # renormalize positional probs to sum <=1 (floating rounding)
        ssum = sum(pos_new.values())
        if ssum > 0:
            pos_new = {k: v / ssum * min(1.0, ssum) for k, v in pos_new.items()}
        pdata['positional_prob'] = pos_new

        # recompute odds applying vig as multiplicative reduction on displayed odds
        def odds_from_prob(p):
            if p <= 0 or not math.isfinite(p):
                return None
            # fair odds
            o = 1.0 / p
            # ensure baseline minimum before applying vig
            o = max(1.01, o)
            # apply vig as a reduction on payout, then enforce minimum again
            if vig and vig > 0:
                o = o * max(0.0, (1.0 - vig))
                o = max(1.01, o)
            return round(o, 2)

        pdata['odds_over20'] = odds_from_prob(pdata['prob_over20'])
        pdata['odds_over25'] = odds_from_prob(pdata['prob_over25'])
        pdata['odds_over30'] = odds_from_prob(pdata['prob_over30'])
        pdata['odds_vittoria'] = odds_from_prob(pdata['prob_vittoria'])
        pdata['odds_podio'] = odds_from_prob(pdata['prob_podio'])

        po = {pos: odds_from_prob(p) for pos, p in pdata['positional_prob'].items()}
        # apply clipping
        for pos, v in list(po.items()):
            if v is not None and v > max_odds:
                po[pos] = max_odds
        pdata['positional_odds'] = po

        for k in ('odds_over20', 'odds_over25', 'odds_over30', 'odds_vittoria', 'odds_podio'):
            v = pdata.get(k)
            if v is not None and v > max_odds:
                pdata[k] = max_odds

    out_path = Path(args.out)
    # Build top_rankings section: top 5 most frequent top-k lists
    top_rankings = []
    most = top_counts.most_common(5)
    for tup, cnt in most:
        ranking_prob = cnt / float(args.iters)
        # for each position, player and player's overall prob for that pos
        positions = []
        for i, player in enumerate(tup, start=1):
            player_pos_prob = out.get(player, {}).get('positional_prob', {}).get(str(i), 0.0)
            positions.append({'pos': i, 'player': player, 'player_pos_prob': player_pos_prob})
        top_rankings.append({'ranking': list(tup), 'ranking_prob': ranking_prob, 'positions': positions})

    meta = {'iterations': args.iters, 'updated_at': datetime.utcnow().isoformat() + 'Z'}
    # Build signals section: compute a simple signal (freddo/stabile/caldo)
    # based on z-score of win probability across players, and a confidence
    # percentage derived from attempts_on_record and miss_rate.
    player_list = list(out.keys())
    try:
        probs = [out[n].get('prob_vittoria', 0.0) for n in player_list]
        mean_p = sum(probs) / max(1, len(probs))
        var_p = sum((p - mean_p) ** 2 for p in probs) / max(1, len(probs))
        std_p = math.sqrt(var_p)
    except Exception:
        mean_p = 0.0
        std_p = 0.0

    signals = {}
    for n in player_list:
        p = out[n].get('prob_vittoria', 0.0)
        z = (p - mean_p) / std_p if std_p > 1e-12 else 0.0
        if z >= 0.8:
            sig = 'caldo'
        elif z <= -0.8:
            sig = 'freddo'
        else:
            sig = 'stabile'

        attempts = float(out[n].get('attempts_on_record', 0))
        miss = float(out[n].get('miss_rate', 0.0))
        # attempt_score: log-scaled to reward more historical data
        try:
            attempt_score = min(1.0, math.log10(attempts + 1) / 2.0)
        except Exception:
            attempt_score = 0.0
        conf = attempt_score * max(0.0, 1.0 - miss)
        confidence_pct = int(round(max(0.0, min(1.0, conf)) * 100))
        signals[n] = {'signal': sig, 'confidence': confidence_pct}

    with out_path.open('w', encoding='utf-8') as f:
        # market indicators: expected score and temperature per player
        market_indicators = {}
        for n in out.keys():
            expected = out.get(n, {}).get('expected_best', 0.0)
            temp = signals.get(n, {}).get('signal', 'stabile')
            market_indicators[n] = {'expected_score': round(float(expected), 2), 'temperature': temp}

        # special bets: probabilities and odds
        def odds_from_prob_local(p):
            if p <= 0 or not math.isfinite(p):
                return None
            o = 1.0 / p
            o = max(1.01, o)
            if vig and vig > 0:
                o = o * max(0.0, (1.0 - vig))
                o = max(1.01, o)
            o = round(o, 2)
            if o > max_odds:
                return max_odds
            return o

        N = float(args.iters)
        special_bets = {}
        for key, cnt in special_counts.items():
            prob = cnt / N if N > 0 else 0.0
            special_bets[key] = {'probability': prob, 'odds': odds_from_prob_local(prob)}

        json.dump({'meta': meta, 'markets': out, 'top_rankings': top_rankings, 'signals': signals, 'market_indicators': market_indicators, 'special_bets': special_bets}, f, ensure_ascii=False, indent=2)

    print('Output scritto in', out_path)

    # Optional debug plots
    if args.debug_plots:
        try:
            import matplotlib
            matplotlib.use('Agg')
            import matplotlib.pyplot as plt

            # Win probabilities (top N)
            top_n = 20
            players_sorted = sorted(out.items(), key=lambda kv: kv[1].get('prob_vittoria', 0.0), reverse=True)
            names = [kv[0] for kv in players_sorted[:top_n]]
            probs = [kv[1].get('prob_vittoria', 0.0) for kv in players_sorted[:top_n]]
            if names:
                plt.figure(figsize=(10, max(4, len(names) * 0.3)))
                y = list(range(len(names)))
                plt.barh(y, probs[::-1], color='C0')
                plt.yticks(y, names[::-1])
                plt.xlabel('Probabilità di vittoria')
                plt.title('Probabilità di vittoria (top %d)' % len(names))
                plt.tight_layout()
                png1 = out_path.with_name(out_path.stem + '-win-probs.png')
                plt.savefig(str(png1), dpi=150)
                plt.close()

            # Special bets probabilities
            keys = list(special_bets.keys())
            vals = [special_bets[k].get('probability', 0.0) for k in keys]
            if keys:
                plt.figure(figsize=(8, 4))
                plt.bar(range(len(keys)), vals, color='C1')
                plt.xticks(range(len(keys)), keys, rotation=45, ha='right')
                plt.ylabel('Probabilità')
                plt.title('Probabilità scommesse speciali')
                plt.tight_layout()
                png2 = out_path.with_name(out_path.stem + '-specials.png')
                plt.savefig(str(png2), dpi=150)
                plt.close()

            # Per-player histogram of best scores across simulations (top players)
            try:
                if 'hist_counts' in locals() and hist_counts:
                    # choose top players by win prob
                    top_hist_n = min(6, len(players_sorted))
                    top_players = [kv[0] for kv in players_sorted[:top_hist_n]]
                    # determine bin range from models' support
                    try:
                        bin_max = max((len(players_models[n]['score_probs']) - 1 for n in players_models.keys()))
                    except Exception:
                        bin_max = SCORE_MAX
                    # diagnostics: per-player mass beyond SCORE_MAX
                    try:
                        tail_masses = {n: sum(p for i, p in enumerate(players_models[n]['score_probs']) if (i + SCORE_MIN) > SCORE_MAX) for n in players_models.keys()}
                        # print top players by tail mass
                        tail_sorted = sorted(tail_masses.items(), key=lambda kv: kv[1], reverse=True)[:6]
                        print('Tail mass (> %d) top players:' % SCORE_MAX, tail_sorted)
                    except Exception:
                        pass
                    # combined multi-panel
                    rows = len(top_players)
                    fig_h = max(3, rows * 1.5)
                    fig, axes = plt.subplots(rows, 1, figsize=(10, fig_h), sharex=True)
                    if rows == 1:
                        axes = [axes]
                    for ax, pname in zip(axes, top_players):
                        cnt = hist_counts.get(pname, {})
                        bins = list(range(0, bin_max + 1))
                        counts = [cnt.get(b, 0) for b in bins]
                        # normalize to probability
                        total = sum(counts) if sum(counts) > 0 else 1
                        probs_hist = [c / total for c in counts]
                        ax.bar(bins, probs_hist, color='C2')
                        ax.set_ylabel(pname)
                        ax.set_xlim(0, bin_max)
                    axes[-1].set_xlabel('Punteggio (best per simulazione)')
                    plt.suptitle('Distribuzione dei punteggi migliori per simulazione (top players)')
                    plt.tight_layout(rect=[0, 0.03, 1, 0.95])
                    png3 = out_path.with_name(out_path.stem + '-best-hists.png')
                    plt.savefig(str(png3), dpi=150)
                    plt.close()
                else:
                    png3 = None
            except Exception as e:
                png3 = None
                print('Errore generazione istogrammi per player:', e)

            print('Debug plots salvati:', png1 if names else '(none)', png2 if keys else '(none)', png3 if 'png3' in locals() and png3 else '(none)')
        except Exception as e:
            print('Impossibile generare i debug plot (matplotlib potrebbe mancare):', e)


if __name__ == '__main__':
    main()
