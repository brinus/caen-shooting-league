// Monte Carlo engine for sisal board
// Exports: getCachedSamples(board, N), ensureSamples(board, N), estimateParlayProb(board, selections, N)

// Simple in-memory cache keyed by board.next_matchday.data
const _samplesCache = new Map();

function randNormal(u1,u2){
  // Box-Muller transform
  return Math.sqrt(-2*Math.log(u1)) * Math.cos(2*Math.PI*u2);
}

function randNorm(mu, sigma){
  const u1 = Math.max(1e-12, Math.random());
  const u2 = Math.random();
  return mu + (isFinite(sigma) ? sigma * Math.sqrt(-2*Math.log(u1)) * Math.cos(2*Math.PI*u2) : 3 * randNormal(u1,u2));
}

function buildMusSigs(players){
  const mus = players.map(p => Number(p.expected_score) || Number(p.media_tiro) || 15);
  const sigs = players.map(p => {
    const base = Number(p.media_tiro) || Number(p.expected_score) || 15;
    const s = 0.18 * base + 2.0; // dynamic variance heuristic
    return Math.max(1.2, Math.min(10, s));
  });
  return { mus, sigs };
}

/**
 * Ensure cached samples for a board's next_matchday exist and contain at least N samples.
 * Adds a global day factor and simple player noise. Returns samples array of arrays.
 */
export function ensureSamples(board, N){
  N = N || 2000;
  if (!board || !board.next_matchday || !board.next_matchday.players) return [];
  const key = board.next_matchday.data || (board.next_matchday.date || '');
  let entry = _samplesCache.get(key);
  if (!entry || !entry.samples) entry = { samples: [], updated: Date.now() };

  const players = board.next_matchday.players;
  const ms = buildMusSigs(players);

  const need = Math.max(0, N - entry.samples.length);
  for (let g=0; g<need; g++){
    // global day factor: small random shift common to all players
    const dayFactor = randNorm(0, Math.max(1.0, Math.sqrt(players.length) * 0.15));
    const sim = new Array(players.length);
    for (let i=0;i<players.length;i++){
      // player-specific noise
      // include small correlation: a fraction of dayFactor contributes to player's score
      const corrShare = 0.35; // tunable
      const mu = ms.mus[i] + dayFactor * corrShare;
      const sigma = Math.max(0.8, ms.sigs[i] * (0.9 + 0.2 * Math.random())); // slight dynamic variance
      sim[i] = randNorm(mu, sigma);
    }
    entry.samples.push(sim);
  }

  // trim cache to reasonable limit
  if (entry.samples.length > 10000) entry.samples = entry.samples.slice(entry.samples.length - 10000);
  entry.updated = Date.now();
  _samplesCache.set(key, entry);
  return entry.samples;
}

export function getCachedSamples(board){
  if (!board || !board.next_matchday) return [];
  const key = board.next_matchday.data || (board.next_matchday.date || '');
  const entry = _samplesCache.get(key);
  return entry ? entry.samples : [];
}

/**
 * Estimate parlay joint probability for selections using cached/ensured samples.
 * selections: array of selection objects with bet_type and player_name
 */
export function estimateParlayProb(board, selections, N){
  N = N || 2000;
  if (!board || !board.next_matchday || !selections || !selections.length) return 0;
  const samples = ensureSamples(board, N);
  const players = board.next_matchday.players;

  let hits = 0;
  for (let t=0; t<N; t++){
    const sim = samples[t];
    const sorted = sim.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v);
    let ok = true;
    for (let j=0;j<selections.length;j++){
      const pr = selections[j];
      const pidx = players.findIndex(pp=>pp.nome === pr.player_name);
      if (pidx === -1) { ok = false; break; }
      if (pr.bet_type === 'giornata_win'){
        if (sorted[0].i !== pidx) { ok = false; break; }
      } else if (pr.bet_type === 'giornata_podio'){
        const ranks = sorted.slice(0,3).map(x=>x.i);
        if (ranks.indexOf(pidx) === -1) { ok = false; break; }
      } else if (pr.bet_type === 'giornata_over_20'){
        if (sim[pidx] <= 20) { ok = false; break; }
      } else if (pr.bet_type === 'giornata_over_25'){
        if (sim[pidx] <= 25) { ok = false; break; }
      } else if (typeof pr.fn === 'function'){
        if (!pr.fn(sim[pidx])) { ok = false; break; }
      } else { ok = false; break; }
    }
    if (ok) hits++;
  }
  return Math.max(1e-12, hits / N);
}

// expose a simple cache clear for maintenance
export function clearSamplesForDate(dateKey){
  _samplesCache.delete(dateKey);
}

// small diagnostics export
export function _cacheInfo(){
  return { keys: Array.from(_samplesCache.keys()), size: _samplesCache.size };
}
