#!/usr/bin/env python3
"""
aggiorna.py — CAEN Shooting League

Legge risultati/{season_id}.csv per ogni stagione, calcola le classifiche
e genera data/classifica.js.

Uso (dalla root del repo):
    python scripts/aggiorna.py
    python scripts/aggiorna.py --dry-run   # stampa l'output senza scrivere

Logica di punteggio:
    - Giornate di gara: lunedì (0) e mercoledì (2)
    - Ogni giocatore ha fino a 3 tentativi per giornata (5 colpi, max 50 pt)
    - Il punteggio della giornata = miglior tentativo (max tra t1, t2, t3)
    - Classifica giornaliera: ordinata per miglior tentativo, poi media sui 3 tentativi,
                            poi secondo miglior tentativo
    - Punti campionato: 1°=10pt, 2°=8pt, 3°=6pt, 4°-5°=4pt,
                        6°-7°=2pt, 8°-10°=1pt, dall'11° in poi=0pt
                        Ex aequo solo se coincidono tutti i criteri sportivi di spareggio
    - record       = miglior singolo tentativo ufficiale (giornata di gara o recupero)
    - -1           = tentativo non effettuato: escluso dal best, vale 0 nelle metriche di spareggio
"""

import csv
import json
import math
import random
import sys
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

# ── Configurazione percorsi ────────────────────────────────────
REPO          = Path(__file__).resolve().parent.parent
RISULTATI_DIR = REPO / "risultati"
SEASONS_FILE  = REPO / "data" / "seasons.json"
OUTPUT_FILE   = REPO / "data" / "classifica.js"
SISAL_FILE    = REPO / "data" / "sisal.js"

# Giorni di gara: 0 = lunedì, 2 = mercoledì
GIORNATE_GARA = {0, 2}

# Punti campionato per posizione (indice 0 = 1° posto)
PUNTI_CAMPIONATO = [10, 8, 6, 4, 4, 2, 2, 1, 1, 1]  # dall'11° in poi: 0
GIORNI_ITA = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"]


def punti_per_pos(pos: int) -> int:
    """pos è 1-based. Ritorna i punti campionato."""
    if pos - 1 < len(PUNTI_CAMPIONATO):
        return PUNTI_CAMPIONATO[pos - 1]
    return 0


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def stddev(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    avg = mean(values)
    variance = sum((value - avg) ** 2 for value in values) / len(values)
    return math.sqrt(variance)


def normalize_attempt(value: int) -> int:
    """Normalizza il tentativo per spareggi: -1 equivale a 0."""
    return value if value >= 0 else 0


def get_attempt_slots(t1: int, t2: int, t3: int) -> list[int]:
    return [normalize_attempt(t1), normalize_attempt(t2), normalize_attempt(t3)]


def get_attempt_metrics(t1: int, t2: int, t3: int) -> dict[str, float | int]:
    slots = get_attempt_slots(t1, t2, t3)
    ordered = sorted(slots, reverse=True)
    return {
        "best": ordered[0],
        "media_tre_tentativi": round(sum(slots) / 3, 3),
        "secondo_miglior_tentativo": ordered[1],
    }


def giornata_rank_signature(player: dict) -> tuple[int, float, int]:
    return (
        player["best"],
        player["media_tre_tentativi"],
        player["secondo_miglior_tentativo"],
    )


def giornata_sort_key(player: dict) -> tuple[float | int | str, ...]:
    return (
        -player["best"],
        -player["media_tre_tentativi"],
        -player["secondo_miglior_tentativo"],
        player["nome"],
    )


def classifica_rank_signature(player: dict) -> tuple[int, float, int, int]:
    return (
        player["punti_campionato"],
        player["media_tiro_spareggio"],
        player["punti_tiro"],
        player["record"],
    )


def classifica_sort_key(player: dict) -> tuple[float | int | str, ...]:
    return (
        -player["punti_campionato"],
        -player["media_tiro_spareggio"],
        -player["punti_tiro"],
        -player["record"],
        player["nome"],
    )


# ── Lettura dati ───────────────────────────────────────────────

def is_giornata_gara(d: date) -> bool:
    return d.weekday() in GIORNATE_GARA


def count_giornate_totali(inizio: date, fine: date) -> int:
    """Conta tutti i lunedì e mercoledì (giornate di gara previste) nel range [inizio, fine]."""
    from datetime import timedelta
    count = 0
    d = inizio
    while d <= fine:
        if d.weekday() in GIORNATE_GARA:
            count += 1
        d += timedelta(days=1)
    return count


def list_giornate_gara(inizio: date, fine: date) -> list[date]:
    from datetime import timedelta

    giornate = []
    d = inizio
    while d <= fine:
        if d.weekday() in GIORNATE_GARA:
            giornate.append(d)
        d += timedelta(days=1)
    return giornate


def giorno_ita(d: date) -> str:
    return GIORNI_ITA[d.weekday()]


def load_results(season_id: str) -> list[dict]:
    """Legge risultati/{season_id}.csv e restituisce lista di righe parsate."""
    csv_file = RISULTATI_DIR / f"{season_id}.csv"
    if not csv_file.exists():
        print(f"  INFO: risultati/{season_id}.csv non trovato — stagione senza dati.")
        return []

    raw_rows = []
    with open(csv_file, newline="", encoding="utf-8") as f:
        for line in f:
            stripped = line.strip()
            if stripped and not stripped.startswith("#"):
                raw_rows.append(stripped)

    results = []
    reader = csv.DictReader(raw_rows)
    for row in reader:
        try:
            d = datetime.strptime(row["data"].strip(), "%Y-%m-%d").date()
            t1 = int(row["t1"].strip() or 0)
            t2 = int(row["t2"].strip() or 0)
            t3 = int(row["t3"].strip() or 0)
            # -1 = tentativo non effettuato: escludi dal calcolo del best
            vals = [v for v in [t1, t2, t3] if v >= 0]
            results.append({
                "data":      d,
                "giocatore": row["giocatore"].strip(),
                "iniziali":  row["iniziali"].strip(),
                "t1": t1, "t2": t2, "t3": t3,
                "best":  max(vals) if vals else 0,
                "gara":  is_giornata_gara(d),
            })
        except (ValueError, KeyError) as e:
            print(f"  WARN riga ignorata — {dict(row)}: {e}")

    return results


# ── Recuperi ──────────────────────────────────────────────────

def assign_recuperi(
    season: dict, all_results: list[dict]
) -> tuple[list[dict], dict[str, int]]:
    """
    Identifica i risultati effettuati in giorni non di gara (recupero) e li
    assegna alla giornata di gara più vecchia non ancora giocata da quel
    giocatore nella stagione.

    Ritorna (lista_risultati_estesa, {giocatore: n_recuperi_usati}).
    """
    from datetime import timedelta

    inizio = datetime.strptime(season["inizio"], "%Y-%m-%d").date()
    fine   = datetime.strptime(season["fine"],   "%Y-%m-%d").date()

    # Lista ordinata di tutte le giornate di gara della stagione
    all_game_days: list[date] = []
    d = inizio
    while d <= fine:
        if d.weekday() in GIORNATE_GARA:
            all_game_days.append(d)
        d += timedelta(days=1)

    # Giornate già giocate per ciascun giocatore (solo risultati di gara ufficiali)
    player_played: dict[str, set] = defaultdict(set)
    for r in all_results:
        if inizio <= r["data"] <= fine and r["gara"]:
            player_played[r["giocatore"]].add(r["data"])

    # Candidati recupero: giorni non di gara, dentro la stagione
    raw_recuperi = [
        r for r in all_results
        if inizio <= r["data"] <= fine and not r["gara"]
    ]
    # Ordina per giocatore poi per data, così si assegnano cronologicamente
    raw_recuperi.sort(key=lambda r: (r["giocatore"], r["data"]))

    player_assigned: dict[str, set] = defaultdict(set)
    player_recuperi: dict[str, int] = defaultdict(int)
    modified: list[dict] = []

    for r in raw_recuperi:
        g = r["giocatore"]
        occupied = player_played[g] | player_assigned[g]
        assigned_day = next(
            (gd for gd in all_game_days if gd not in occupied), None
        )
        if assigned_day is None:
            print(f"  WARN: {g} — nessuna giornata disponibile per recupero del {r['data']}")
            continue

        player_assigned[g].add(assigned_day)
        player_recuperi[g] += 1
        new_r = dict(r)
        new_r["data_effettiva"] = r["data"].isoformat()   # data reale di gioco
        new_r["data"]           = assigned_day             # assegnato alla giornata
        new_r["gara"]           = True
        new_r["recupero"]       = True
        modified.append(new_r)

    # Restituisce i risultati originali + i recuperi assegnati
    # (i risultati originali non-game-day vengono ignorati da build_giornate
    #  perché hanno gara=False; i modified hanno gara=True)
    return list(all_results) + modified, dict(player_recuperi)


# ── Classifica giornaliera ─────────────────────────────────────

def build_giornate(season: dict, all_results: list[dict]) -> list[dict]:
    """
    Restituisce la lista delle giornate di gara, ognuna con:
      data, giorno_settimana, risultati (lista ordinata con posizione e punti campionato)
    """
    inizio = datetime.strptime(season["inizio"], "%Y-%m-%d").date()
    fine   = datetime.strptime(season["fine"],   "%Y-%m-%d").date()

    gare: dict[date, dict[str, dict]] = defaultdict(dict)
    for r in all_results:
        if inizio <= r["data"] <= fine and r["gara"]:
            g = r["giocatore"]
            metrics = get_attempt_metrics(r["t1"], r["t2"], r["t3"])
            candidate = {
                "nome":                     g,
                "iniziali":                 r["iniziali"],
                "t1":                       r["t1"],
                "t2":                       r["t2"],
                "t3":                       r["t3"],
                "best":                     metrics["best"],
                "media_tre_tentativi":      metrics["media_tre_tentativi"],
                "secondo_miglior_tentativo": metrics["secondo_miglior_tentativo"],
                "recupero":                 r.get("recupero", False),
                "data_effettiva":           r.get("data_effettiva", ""),
            }
            current = gare[r["data"]].get(g)
            if current is None or giornata_sort_key(candidate) < giornata_sort_key(current):
                gare[r["data"]][g] = candidate

    giornate = []
    for data_gara, partecipanti in sorted(gare.items(), reverse=True):
        sorted_p = sorted(partecipanti.values(), key=giornata_sort_key)

        risultati = []
        pos = 1
        for idx, p in enumerate(sorted_p):
            if idx > 0 and giornata_rank_signature(p) != giornata_rank_signature(sorted_p[idx - 1]):
                pos = idx + 1
            risultati.append({
                "posizione":         pos,
                "nome":              p["nome"],
                "iniziali":          p["iniziali"],
                "t1":                p["t1"],
                "t2":                p["t2"],
                "t3":                p["t3"],
                "punteggio":         p["best"],
                "media_tre_tentativi": p["media_tre_tentativi"],
                "secondo_miglior_tentativo": p["secondo_miglior_tentativo"],
                "punti_campionato":  punti_per_pos(pos),
                "recupero":          p["recupero"],
                "data_effettiva":    p["data_effettiva"],
            })

        # Numero reale nel calendario: quanti lun/mer tra inizio e data_gara (inclusa)
        num_cal = count_giornate_totali(inizio, data_gara)

        giornate.append({
            "data":             data_gara.isoformat(),
            "giorno":           giorno_ita(data_gara),
            "numero":           num_cal,
            "risultati":        risultati,
        })

    return giornate


# ── Classifica stagionale ──────────────────────────────────────

def compute_classifica(
    season: dict, all_results: list[dict], giornate: list[dict],
    player_recuperi: dict[str, int] | None = None,
    max_recuperi: int = 4,
) -> list[dict]:
    """
    Calcola la classifica stagionale basata sui punti campionato accumulati
    nelle giornate di gara.
    """
    if not giornate:
        return []

    inizio = datetime.strptime(season["inizio"], "%Y-%m-%d").date()
    fine   = datetime.strptime(season["fine"],   "%Y-%m-%d").date()

    iniziali_map: dict[str, str] = {}
    official_attempts: dict[str, list[int]] = defaultdict(list)
    for r in all_results:
        if inizio <= r["data"] <= fine and r["gara"]:
            g = r["giocatore"]
            iniziali_map[g] = r["iniziali"]
            official_attempts[g].extend(v for v in [r["t1"], r["t2"], r["t3"]] if v >= 0)

    # Accumula dai risultati delle giornate
    stats: dict[str, dict] = {}
    for giornata in giornate:
        for ris in giornata["risultati"]:
            g = ris["nome"]
            if g not in stats:
                stats[g] = {
                    "partite":          0,
                    "punti_campionato": 0,
                    "punti_tiro":       0,
                    "vittorie":         0,
                }
            stats[g]["partite"]          += 1
            stats[g]["punti_campionato"] += ris["punti_campionato"]
            stats[g]["punti_tiro"]       += ris["punteggio"]
            if ris["posizione"] == 1:
                stats[g]["vittorie"] += 1

    # Costruisci classifica
    classifica = []
    pr = player_recuperi or {}
    for g, s in stats.items():
        partite = s["partite"]
        media_tiro_spareggio = (s["punti_tiro"] / partite) if partite else 0.0
        attempts_sorted = sorted(official_attempts.get(g, []), reverse=True)
        record = attempts_sorted[0] if attempts_sorted else 0
        secondo_record = attempts_sorted[1] if len(attempts_sorted) > 1 else 0
        classifica.append({
            "nome":             g,
            "iniziali":         iniziali_map.get(g, "??"),
            "partite":          partite,
            "punti_campionato": s["punti_campionato"],
            "punti_tiro":       s["punti_tiro"],
            "media_tiro":       round(media_tiro_spareggio, 1) if partite else 0.0,
            "media_tiro_spareggio": round(media_tiro_spareggio, 3),
            "record":           record,
            "secondo_record":   secondo_record,
            "vittorie":         s["vittorie"],
            "recuperi_usati":   pr.get(g, 0),
            "recuperi_max":     max_recuperi,
        })

    classifica.sort(key=classifica_sort_key)
    pos = 1
    for i, p in enumerate(classifica):
        if i > 0 and classifica_rank_signature(p) != classifica_rank_signature(classifica[i - 1]):
            pos = i + 1
        p["posizione"] = pos

    return classifica


# ── SISAL Mode ────────────────────────────────────────────────

def implied_quote(probability: float, margin: float = 0.08) -> float:
    """Converte una probabilità in quota decimale con piccolo margine bookmaker."""
    bounded = clamp(probability, 0.03, 0.92)
    adjusted = min(bounded * (1 + margin), 0.97)
    return round(clamp(1 / adjusted, 1.08, 33.0), 2)


def js_obj(value, indent: int = 0) -> str:
    pad = " " * indent
    if isinstance(value, dict):
        if not value:
            return "{}"
        items = list(value.items())
        inner = []
        for key, item in items:
            inner.append(f'{pad}  {key}: {js_obj(item, indent + 2)}')
        return "{\n" + ",\n".join(inner) + f"\n{pad}" + "}"
    if isinstance(value, list):
        if not value:
            return "[]"
        inner = [f'{pad}  {js_obj(item, indent + 2)}' for item in value]
        return "[\n" + ",\n".join(inner) + f"\n{pad}" + "]"
    return js_val(value)


def build_sisal_board(season: dict, classifica: list[dict], giornate: list[dict]) -> dict:
    if not classifica or not giornate:
        return {
            "season_id": season["id"],
            "season_label": f'{season["nome"]} {season["anno"]}',
            "giornate_giocate": len(giornate),
            "giornate_totali": season.get("giornate_totali", len(giornate)),
            "players": [],
            "highlights": [],
            "specials": [],
            "next_matchday": None,
            "methodology": [
                "Quote non disponibili: nessuna giornata valida registrata.",
                "Pagina puramente ironica: nessuna scommessa reale.",
            ],
        }

    def simulate_matchday(players: list[dict], rng: random.Random) -> list[dict]:
        entries = []
        for player in players:
            if rng.random() <= player["play_prob"]:
                sampled = int(round(rng.gauss(player["score_mean"] + player["trend"], player["score_dev"])))
                score = int(clamp(sampled, 0, 50))
                entries.append({
                    "name": player["name"],
                    "score": score,
                })

        if not entries:
            return []

        entries.sort(key=lambda item: item["score"], reverse=True)
        current_pos = 1
        for idx, entry in enumerate(entries):
            if idx > 0 and entry["score"] < entries[idx - 1]["score"]:
                current_pos = idx + 1
            entry["position"] = current_pos
        return entries

    by_name = {
        player["nome"]: {
            "nome": player["nome"],
            "iniziali": player["iniziali"],
            "posizione": player["posizione"],
            "punti": player["punti_campionato"],
            "punti_tiro": player["punti_tiro"],
            "record": player["record"],
            "media": player["media_tiro"],
            "partite": player["partite"],
            "vittorie": player["vittorie"],
            "scores": [],
        }
        for player in classifica
    }

    giornate_chrono = sorted(giornate, key=lambda day: day["data"])
    for giornata in giornate_chrono:
        for risultato in giornata["risultati"]:
            by_name[risultato["nome"]]["scores"].append(risultato["punteggio"])

    all_scores = [score for player in by_name.values() for score in player["scores"]]
    league_avg = mean(all_scores)
    league_dev = max(stddev(all_scores), 4.5)
    played_days = len(giornate_chrono)
    total_days = season.get("giornate_totali", played_days)
    remaining_days = max(total_days - played_days, 0)
    season_weight = clamp((played_days / max(total_days, 1)) * 3.0, 0.18, 0.78)
    season_start = datetime.strptime(season["inizio"], "%Y-%m-%d").date()
    season_end = datetime.strptime(season["fine"], "%Y-%m-%d").date()
    played_dates = {datetime.strptime(day["data"], "%Y-%m-%d").date() for day in giornate}
    next_matchday_date = next(
        (day for day in list_giornate_gara(season_start, season_end) if day not in played_dates and day >= date.today()),
        None,
    )
    league_participation = (
        sum(player["partite"] for player in by_name.values()) / (len(by_name) * played_days)
        if by_name and played_days else 0.5
    )

    sim_players = []
    for player in by_name.values():
        observed_scores = player["scores"]
        observed_avg = mean(observed_scores)
        observed_dev = stddev(observed_scores) if len(observed_scores) > 1 else league_dev
        play_rate = ((player["partite"] + league_participation * 4) / (played_days + 4)) if played_days else league_participation
        adj_avg = (sum(observed_scores) + league_avg * 3) / (len(observed_scores) + 3)
        adj_dev = clamp((observed_dev * len(observed_scores) + league_dev * 3) / (len(observed_scores) + 3), 2.5, 9.0)
        trend = 0.0
        if len(observed_scores) >= 2:
            trend = clamp((observed_scores[-1] - observed_scores[-2]) * 0.18, -2.5, 2.5)

        sim_players.append({
            "name": player["nome"],
            "initials": player["iniziali"],
            "position": player["posizione"],
            "current_points": player["punti"],
            "current_score_points": player["punti_tiro"],
            "current_record": player["record"],
            "current_matches": player["partite"],
            "current_wins": player["vittorie"],
            "current_avg": player["media"],
            "play_prob": clamp(play_rate, 0.25, 0.95),
            "score_mean": clamp(adj_avg, 4.0, 40.0),
            "score_dev": adj_dev,
            "trend": trend,
            "scores": observed_scores,
        })

    iterations = 4000
    rng = random.Random(f'{season["id"]}-sisal-board')
    counters = {
        player["name"]: {
            "title": 0,
            "podio": 0,
            "top5": 0,
            "best30": 0,
            "avg18": 0,
        }
        for player in sim_players
    }
    specials = {
        "record30": 0,
        "photo_finish": 0,
        "outsider_podium": 0,
        "winner_2plus": 0,
    }
    next_day_counters = {
        player["name"]: {
            "win": 0,
            "podio": 0,
            "over25": 0,
            "over20": 0,
        }
        for player in sim_players
    }
    next_day_specials = {
        "leader_win": 0,
        "outsider_win": 0,
        "winner_25plus": 0,
        "photo_finish": 0,
    }

    current_outsiders = {player["name"] for player in sim_players if player["position"] > 5}

    if next_matchday_date is not None:
        next_day_rng = random.Random(f'{season["id"]}-sisal-next-matchday')
        for _ in range(iterations):
            next_entries = simulate_matchday(sim_players, next_day_rng)
            if not next_entries:
                continue

            for entry in next_entries:
                bucket = next_day_counters[entry["name"]]
                if entry["position"] == 1:
                    bucket["win"] += 1
                if entry["position"] <= 3:
                    bucket["podio"] += 1
                if entry["score"] >= 25:
                    bucket["over25"] += 1
                if entry["score"] >= 20:
                    bucket["over20"] += 1

            winner = next_entries[0]
            second_score = next_entries[1]["score"] if len(next_entries) > 1 else -99
            if winner["name"] == classifica[0]["nome"]:
                next_day_specials["leader_win"] += 1
            if winner["name"] in current_outsiders:
                next_day_specials["outsider_win"] += 1
            if winner["score"] >= 25:
                next_day_specials["winner_25plus"] += 1
            if winner["score"] - second_score <= 2:
                next_day_specials["photo_finish"] += 1

    for _ in range(iterations):
        state = {
            player["name"]: {
                "name": player["name"],
                "points": player["current_points"],
                "score_points": player["current_score_points"],
                "record": player["current_record"],
                "matches": player["current_matches"],
                "wins": player["current_wins"],
            }
            for player in sim_players
        }

        for _day in range(remaining_days):
            entries = simulate_matchday(sim_players, rng)
            if not entries:
                continue

            for entry in entries:
                player_state = state[entry["name"]]
                player_state["points"] += punti_per_pos(entry["position"])
                player_state["score_points"] += entry["score"]
                player_state["matches"] += 1
                player_state["record"] = max(player_state["record"], entry["score"])
                if entry["position"] == 1:
                    player_state["wins"] += 1

        final_board = sorted(
            state.values(),
            key=lambda player: (
                -player["points"],
                -player["score_points"],
                -player["record"],
                -player["wins"],
                player["name"],
            ),
        )

        for rank, player in enumerate(final_board, start=1):
            bucket = counters[player["name"]]
            if rank == 1:
                bucket["title"] += 1
            if rank <= 3:
                bucket["podio"] += 1
            if rank <= 5:
                bucket["top5"] += 1
            if player["record"] >= 30:
                bucket["best30"] += 1
            if player["matches"] > 0 and (player["score_points"] / player["matches"]) >= 18:
                bucket["avg18"] += 1

        top_gap = final_board[0]["points"] - final_board[1]["points"] if len(final_board) > 1 else 99
        if any(player["record"] >= 30 for player in final_board):
            specials["record30"] += 1
        if top_gap <= 1:
            specials["photo_finish"] += 1
        if any(player["name"] in current_outsiders for player in final_board[:3]):
            specials["outsider_podium"] += 1
        if final_board[0]["wins"] >= 2:
            specials["winner_2plus"] += 1

    def probability(counter: int) -> float:
        return (counter + 1) / (iterations + 2)

    def blend_probability(raw: float, prior: float) -> float:
        return clamp(raw * season_weight + prior * (1 - season_weight), 0.04, 0.88)

    player_count = max(len(classifica), 1)
    title_prior = 1 / player_count
    podio_prior = min(3, player_count) / player_count
    top5_prior = min(5, player_count) / player_count

    player_rows = []
    for player in classifica:
        scores = by_name[player["nome"]]["scores"]
        trend_delta = (scores[-1] - scores[-2]) if len(scores) >= 2 else 0
        if trend_delta >= 4:
            trend_label = "Caldo"
        elif trend_delta <= -4:
            trend_label = "Freddo"
        else:
            trend_label = "Stabile"

        best_prior = clamp(0.08 + max(player["record"] - 18, 0) / 48 + player["media_tiro"] / 180, 0.08, 0.46)
        avg_prior = clamp(0.08 + max(player["media_tiro"] - 12, 0) / 18, 0.08, 0.58)

        title_prob = blend_probability(probability(counters[player["nome"]]["title"]), title_prior)
        podio_prob = blend_probability(probability(counters[player["nome"]]["podio"]), podio_prior)
        top5_prob = blend_probability(probability(counters[player["nome"]]["top5"]), top5_prior)
        best_prob = blend_probability(probability(counters[player["nome"]]["best30"]), best_prior)
        avg_prob = blend_probability(probability(counters[player["nome"]]["avg18"]), avg_prior)
        confidence = int(round(clamp(42 + played_days * 7 + player["partite"] * 4, 48, 93)))

        notes = []
        if player["posizione"] <= 3:
            notes.append("già nel traffico buono")
        if player["record"] >= 25:
            notes.append("ha già mostrato un colpo pesante")
        if trend_label == "Caldo":
            notes.append("trend in crescita")
        elif trend_label == "Freddo":
            notes.append("serve una ripartenza")
        if player["partite"] <= max(1, played_days // 2):
            notes.append("campione ancora corto")
        note = "; ".join(notes[:2]) or "profilo ancora in definizione"

        player_rows.append({
            "nome": player["nome"],
            "iniziali": player["iniziali"],
            "posizione_attuale": player["posizione"],
            "partite": player["partite"],
            "media_tiro": player["media_tiro"],
            "record": player["record"],
            "trend": trend_label,
            "confidence": confidence,
            "quote_titolo": implied_quote(title_prob),
            "quote_podio": implied_quote(podio_prob),
            "quote_top5": implied_quote(top5_prob),
            "quote_best_30": implied_quote(best_prob),
            "quote_avg_18": implied_quote(avg_prob),
            "note": note,
        })

    player_rows.sort(key=lambda row: (row["quote_titolo"], row["quote_podio"], row["posizione_attuale"]))

    def pick_unique(candidates: list[dict], used_names: set[str]) -> dict:
        for candidate in candidates:
            if candidate["nome"] not in used_names:
                used_names.add(candidate["nome"])
                return candidate
        fallback = candidates[0]
        used_names.add(fallback["nome"])
        return fallback

    used_names: set[str] = set()
    favorite = pick_unique(player_rows, used_names)
    sniper = pick_unique(sorted(player_rows, key=lambda row: (row["quote_best_30"], row["quote_titolo"])), used_names)
    average_pick = pick_unique(sorted(player_rows, key=lambda row: (row["quote_avg_18"], row["quote_podio"])), used_names)
    outsider_candidates = [row for row in sorted(player_rows, key=lambda row: (row["quote_podio"], row["quote_titolo"])) if row["posizione_attuale"] > 3]
    value_pick = pick_unique(outsider_candidates or player_rows, used_names)

    next_matchday = None
    if next_matchday_date is not None:
        next_player_rows = []
        win_prior = 1 / player_count
        podio_day_prior = min(3, player_count) / player_count
        over25_base = 0.12
        over20_base = 0.32
        for player in classifica:
            win_prob = blend_probability(probability(next_day_counters[player["nome"]]["win"]), win_prior)
            podio_day_prob = blend_probability(probability(next_day_counters[player["nome"]]["podio"]), podio_day_prior)
            over25_prior = clamp(over25_base + max(player["record"] - 20, 0) / 36 + player["media_tiro"] / 220, 0.1, 0.55)
            over20_prior = clamp(over20_base + max(player["media_tiro"] - 14, 0) / 24, 0.22, 0.72)
            over25_prob = blend_probability(probability(next_day_counters[player["nome"]]["over25"]), over25_prior)
            over20_prob = blend_probability(probability(next_day_counters[player["nome"]]["over20"]), over20_prior)
            next_player_rows.append({
                "nome": player["nome"],
                "iniziali": player["iniziali"],
                "posizione_attuale": player["posizione"],
                "media_tiro": player["media_tiro"],
                "record": player["record"],
                "trend": next(row["trend"] for row in player_rows if row["nome"] == player["nome"]),
                "expected_score": round(clamp(player["media_tiro"] + next(
                    sim_player["trend"] for sim_player in sim_players if sim_player["name"] == player["nome"]
                ), 0.0, 50.0), 1),
                "quote_vittoria": implied_quote(win_prob),
                "quote_podio": implied_quote(podio_day_prob),
                "quote_over_25": implied_quote(over25_prob),
                "quote_over_20": implied_quote(over20_prob),
            })

        next_player_rows.sort(key=lambda row: (row["quote_vittoria"], row["quote_podio"], row["posizione_attuale"]))
        used_next_names: set[str] = set()
        next_favorite = pick_unique(next_player_rows, used_next_names)
        next_sniper = pick_unique(sorted(next_player_rows, key=lambda row: (row["quote_over_25"], row["quote_vittoria"])), used_next_names)
        next_value_candidates = [row for row in sorted(next_player_rows, key=lambda row: (row["quote_podio"], row["quote_vittoria"])) if row["posizione_attuale"] > 3]
        next_value = pick_unique(next_value_candidates or next_player_rows, used_next_names)

        next_matchday = {
            "numero": count_giornate_totali(season_start, next_matchday_date),
            "data": next_matchday_date.isoformat(),
            "giorno": giorno_ita(next_matchday_date),
            "players": next_player_rows,
            "highlights": [
                {
                    "label": "Favorito di giornata",
                    "market": "Vincente prossima giornata",
                    "player": next_favorite["nome"],
                    "quota": next_favorite["quote_vittoria"],
                    "blurb": f'Linea piu corta per la giornata secca: media attesa {next_favorite["expected_score"]:.1f}.',
                },
                {
                    "label": "25+ in canna",
                    "market": "Punteggio giornata over 25",
                    "player": next_sniper["nome"],
                    "quota": next_sniper["quote_over_25"],
                    "blurb": f'Record attuale {next_sniper["record"]}: profilo da colpo pesante gia visto.',
                },
                {
                    "label": "Underdog da ufficio",
                    "market": "Podio prossima giornata",
                    "player": next_value["nome"],
                    "quota": next_value["quote_podio"],
                    "blurb": f'Quota media ma spazio per infilarsi tra i primi tre gia alla prossima.',
                },
            ],
            "specials": [
                {
                    "label": "Leader attuale vince ancora",
                    "quota": implied_quote(blend_probability(probability(next_day_specials["leader_win"]), win_prior)),
                    "note": "Il capolista conferma il comando anche nella prossima giornata secca.",
                },
                {
                    "label": "Outsider vince la giornata",
                    "quota": implied_quote(blend_probability(probability(next_day_specials["outsider_win"]), 0.36)),
                    "note": "Uno degli attuali fuori top 5 piazza il colpo grosso nella prossima uscita.",
                },
                {
                    "label": "Vincitore con 25+",
                    "quota": implied_quote(blend_probability(probability(next_day_specials["winner_25plus"]), 0.34)),
                    "note": "Per vincere la giornata servira un venticinque o meglio.",
                },
                {
                    "label": "Arrivo in due punti",
                    "quota": implied_quote(blend_probability(probability(next_day_specials["photo_finish"]), 0.42)),
                    "note": "Il primo e il secondo chiudono separati da massimo due punti nel best di giornata.",
                },
            ],
        }

    return {
        "season_id": season["id"],
        "season_label": f'{season["nome"]} {season["anno"]}',
        "giornate_giocate": played_days,
        "giornate_totali": total_days,
        "players": player_rows,
        "highlights": [
            {
                "label": "Favorito titolo",
                "market": "Campione stagionale",
                "player": favorite["nome"],
                "quota": favorite["quote_titolo"],
                "blurb": f'Quota piu bassa del board: posizione {favorite["posizione_attuale"]}, record {favorite["record"]} e profilo gia leggibile.',
            },
            {
                "label": "Cecchino 30+",
                "market": "Best score over 30",
                "player": sniper["nome"],
                "quota": sniper["quote_best_30"],
                "blurb": f'Record attuale {sniper["record"]}/50 e spazio per un colpo da copertina.',
            },
            {
                "label": "Value bet",
                "market": "Media finale over 18",
                "player": average_pick["nome"],
                "quota": average_pick["quote_avg_18"],
                "blurb": f'Media attuale {average_pick["media_tiro"]:.1f}: margine stretto ma giocabile, almeno sulla carta.',
            },
            {
                "label": "Outsider con senso",
                "market": "Podio finale",
                "player": value_pick["nome"],
                "quota": value_pick["quote_podio"],
                "blurb": value_pick["note"].capitalize() + ".",
            },
        ],
        "specials": [
            {
                "label": "Record assoluto 30+",
                "quota": implied_quote(probability(specials["record30"])),
                "note": "Mercato secco: qualcuno rompe il muro dei trenta entro fine stagione.",
            },
            {
                "label": "Finale al fotofinish",
                "quota": implied_quote(probability(specials["photo_finish"])),
                "note": "Primo e secondo chiudono separati da massimo un punto campionato.",
            },
            {
                "label": "Outsider a podio",
                "quota": implied_quote(probability(specials["outsider_podium"])),
                "note": "Uno degli attuali fuori top 5 rientra tra i primi tre alla sirena.",
            },
            {
                "label": "Campione con almeno 2 vittorie",
                "quota": implied_quote(probability(specials["winner_2plus"])),
                "note": "Il vincitore finale mette insieme almeno due giornate vinte sul campo.",
            },
        ],
        "next_matchday": next_matchday,
        "methodology": [
            "Quote ricavate da 4000 simulazioni Monte Carlo sulle giornate restanti.",
            "La sezione prossima giornata usa la prima lun/mer futura disponibile al momento del push.",
            "Il modello usa media tiro, record, trend recente e presenza stimata sulle giornate residue.",
            "Pagina satirica: niente soldi, solo previsioni inutilmente serie e gloria d'ufficio.",
        ],
    }


# ── Serializzatori JS ──────────────────────────────────────────

def js_val(v) -> str:
    """Converte un valore Python nel corrispondente letterale JavaScript."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, str):
        return "null" if v == "" else f'"{v}"'
    return str(v)


def js_list(items: list[dict], fields: list[str], indent: int = 6) -> list[str]:
    """Genera righe JS per una lista di oggetti con i campi specificati."""
    lines = []
    pad = " " * indent
    for j, item in enumerate(items):
        comma = "" if j == len(items) - 1 else ","
        parts = [f"{f}: {js_val(item[f])}" for f in fields]
        lines.append(f'{pad}{{ {", ".join(parts)} }}{comma}')
    return lines


def render_js(seasons_config: list[dict]) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [
        "// AUTO-GENERATO da scripts/aggiorna.py — non modificare manualmente",
        f"// Ultimo aggiornamento: {now}",
        "",
        "CSL.stagioni = [",
    ]

    CLASSIFICA_FIELDS = [
        "posizione", "nome", "iniziali", "partite",
        "punti_campionato", "punti_tiro", "media_tiro", "media_tiro_spareggio",
        "record", "secondo_record", "vittorie",
        "recuperi_usati", "recuperi_max",
    ]
    GIORNATA_PLAYER_FIELDS = [
        "posizione", "nome", "iniziali",
        "t1", "t2", "t3", "punteggio", "media_tre_tentativi",
        "secondo_miglior_tentativo", "punti_campionato",
        "recupero", "data_effettiva",
    ]

    for i, season in enumerate(seasons_config):
        season_results_raw = load_results(season["id"])
        max_recuperi       = season.get("max_recuperi", 4)
        season_results, player_recuperi = assign_recuperi(season, season_results_raw)
        giornate    = build_giornate(season, season_results)
        classifica  = compute_classifica(season, season_results, giornate, player_recuperi, max_recuperi)
        last_season = (i == len(seasons_config) - 1)

        lines.append("  {")
        lines.append(f'    id:     "{season["id"]}",')
        lines.append(f'    nome:   "{season["nome"]}",')
        lines.append(f'    numero: {season["numero"]},')
        lines.append(f'    anno:   {season["anno"]},')
        lines.append(f'    inizio: "{season["inizio"]}",')
        lines.append(f'    fine:   "{season["fine"]}",')
        lines.append(f'    status: "{season["status"]}",')
        inizio_d = datetime.strptime(season["inizio"], "%Y-%m-%d").date()
        fine_d   = datetime.strptime(season["fine"],   "%Y-%m-%d").date()
        lines.append(f'    giornate_totali: {count_giornate_totali(inizio_d, fine_d)},')
        # classifica stagionale
        if classifica:
            lines.append("    classifica: [")
            lines.extend(js_list(classifica, CLASSIFICA_FIELDS, indent=6))
            lines.append("    ],")
        else:
            lines.append("    classifica: [],")

        # giornate
        if giornate:
            lines.append("    giornate: [")
            for k, g in enumerate(giornate):
                last_g = (k == len(giornate) - 1)
                lines.append("      {")
                lines.append(f'        data:    "{g["data"]}",')
                lines.append(f'        giorno:  "{g["giorno"]}",')
                lines.append(f'        numero:  {g["numero"]},')
                if g["risultati"]:
                    lines.append("        risultati: [")
                    lines.extend(js_list(g["risultati"], GIORNATA_PLAYER_FIELDS, indent=10))
                    lines.append("        ]")
                else:
                    lines.append("        risultati: []")
                lines.append("      }" + ("" if last_g else ","))
            lines.append("    ]")
        else:
            lines.append("    giornate: []")

        lines.append("  }" + ("" if last_season else ","))

    lines.append("];")
    lines.append("")
    return "\n".join(lines)


def render_sisal_js(seasons_config: list[dict]) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    boards = []
    for season in seasons_config:
        season_results_raw = load_results(season["id"])
        season_results, _player_recuperi = assign_recuperi(season, season_results_raw)
        giornate = build_giornate(season, season_results)
        classifica = compute_classifica(season, season_results, giornate)
        board = build_sisal_board(
            {
                **season,
                "giornate_totali": season.get("giornate_totali") or count_giornate_totali(
                    datetime.strptime(season["inizio"], "%Y-%m-%d").date(),
                    datetime.strptime(season["fine"], "%Y-%m-%d").date(),
                ),
            },
            classifica,
            giornate,
        )
        boards.append(board)

    return "\n".join([
        "// AUTO-GENERATO da scripts/aggiorna.py — non modificare manualmente",
        f"// Ultimo aggiornamento: {now}",
        "",
        f"CSL.sisal = {js_obj(boards)};",
        "",
    ])


# ── Main ───────────────────────────────────────────────────────

def main():
    dry_run = "--dry-run" in sys.argv

    with open(SEASONS_FILE, encoding="utf-8") as f:
        seasons_config = json.load(f)

    today = date.today()

    # Auto-promuovi stagioni "next" se la data d'inizio è passata
    for season in seasons_config:
        if season["status"] == "next":
            inizio = datetime.strptime(season["inizio"], "%Y-%m-%d").date()
            if today >= inizio:
                season["status"] = "attiva"

    for season in seasons_config:
        season_results_raw = load_results(season["id"])
        max_recuperi       = season.get("max_recuperi", 4)
        season_results, player_recuperi = assign_recuperi(season, season_results_raw)
        n_gara     = sum(1 for r in season_results if r["gara"])
        n_recupero = sum(player_recuperi.values())
        giornate   = build_giornate(season, season_results)
        classifica = compute_classifica(season, season_results, giornate, player_recuperi, max_recuperi)
        print(f"  {season['nome']} {season['anno']} ({season['inizio']} → {season['fine']}): "
              f"{len(classifica)} giocatori, {len(giornate)} giornate ({n_gara} righe gara, {n_recupero} recuperi)")

    output = render_js(seasons_config)
    sisal_output = render_sisal_js(seasons_config)

    if dry_run:
        print("\n--- CLASSIFICA OUTPUT (dry run) ---")
        print(output)
        print("\n--- SISAL OUTPUT (dry run) ---")
        print(sisal_output)
    else:
        OUTPUT_FILE.write_text(output, encoding="utf-8")
        SISAL_FILE.write_text(sisal_output, encoding="utf-8")
        print(f"\nScritto: {OUTPUT_FILE}")
        print(f"Scritto: {SISAL_FILE}")


if __name__ == "__main__":
    main()
