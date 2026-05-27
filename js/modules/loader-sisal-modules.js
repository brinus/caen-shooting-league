// Loader that imports modules and exposes expected globals for legacy code
import * as MC from './montecarlo.js';
import * as CORR from './correlation.js';
import * as PARLAY from './parlay.js';
import * as DOM from './domUtils.js';
import * as SLIP from './slipStore.js';

// Expose functions expected by legacy inline scripts
window.estimateNextDayParlayProb = function(board, selections, N){ return MC.estimateParlayProb(board, selections, N); };
window.computePairwiseCorrelations = function(board, selections, N){
  const samples = MC.getCachedSamples(board);
  if (!samples || samples.length < (N||2000)) MC.ensureSamples(board, N||2000);
  const s2 = MC.getCachedSamples(board);
  return CORR.computePairwiseFromSamples(s2, board.next_matchday.players, selections);
};
window.getMonteCarloSamples = MC.getCachedSamples;
window.clearMonteCarloCache = MC.clearSamplesForDate;
window.productQuota = PARLAY.productQuota;
window.getBonusMod = PARLAY.getBonus;
window.applyBonusMod = PARLAY.applyBonus;
window.esc = DOM.esc;
window.fmtQ = DOM.fmtQ;
window.safeParseData = DOM.safeParseData;
window.SlipStore = {
  getSelections: SLIP.getSelections,
  setSelections: SLIP.setSelections,
  addSelection: SLIP.addSelection,
  removeAt: SLIP.removeAt,
  clear: SLIP.clear,
  onChange: SLIP.onChange,
  offChange: SLIP.offChange,
  toggle: SLIP.toggle,
  getPanel: SLIP.getPanel,
  setPanel: SLIP.setPanel
};

// Backwards-compat wrapper
window.renderCorrelationGrid = function(selections, corrObj, parlayProb, container){
  if (typeof window.__legacyRenderCorrelationGrid === 'function'){
    return window.__legacyRenderCorrelationGrid(selections, corrObj, parlayProb, container);
  }
  container && (container.innerHTML = '<div style="color:var(--text-muted)">Correlazioni disponibili.</div>');
};

console.info('Sisal modules loaded: MC, CORR, PARLAY, DOM');

// Wait for window.CSL.sisal to exist (module may load before inline data)
function waitForCsl(timeoutMs = 2000) {
  return new Promise(resolve => {
    if (window.CSL && Array.isArray(window.CSL.sisal)) return resolve(true);
    let waited = 0;
    const iv = setInterval(() => {
      if (window.CSL && Array.isArray(window.CSL.sisal)){
        clearInterval(iv);
        return resolve(true);
      }
      waited += 100;
      if (waited >= timeoutMs){
        clearInterval(iv);
        return resolve(false);
      }
    }, 100);
  });
}

// Map server MC JSON into the page data structures (backwards-compatible)
async function loadMcResults() {
  const ready = await waitForCsl(5000);
  if (!ready) console.warn('loader-sisal-modules: window.CSL.sisal not available after wait; attempting fetch anyway');

  const boards = (window.CSL && window.CSL.sisal) || [];
  const fetches = boards.map(async board => {
    const seasonId = board && board.season_id;
    if (!seasonId) return null;
    const url = `data/mc_results_${seasonId}.json`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      const json = await res.json().catch(() => null);
      return { board, json };
    } catch (e) {
      return null;
    }
  });

  try {
      const results = await Promise.all(fetches.map(async f => {
        try { return await f } catch(e){ return null }
      }));
    results.forEach(item => {
      if (!item || !item.json) return;
      const { board, json } = item;
      try {
        board.mc_summary = json || null;
        let next = json.next_matchday || {};
        let season = json.season || {};

        // Fallback: some MC outputs use `perPlayer` array shape. Convert to maps by player name.
        if ((!next || Object.keys(next).length === 0) && Array.isArray(json.perPlayer)) {
          const nextMap = {};
          const seasonMap = {};
          json.perPlayer.forEach(item => {
            const name = item.nome || item.name || item.player || item.player_name;
            if (!name) return;
            // next-matchday values may be nested or top-level on the item
            const nsrc = item.next || item.next_matchday || item;
            const n = {};
            if (nsrc.win != null) n.win = nsrc.win;
            if (nsrc.podio != null) n.podio = nsrc.podio;
            if (nsrc.over30 != null) n.over30 = nsrc.over30;
            if (nsrc.over25 != null) n.over25 = nsrc.over25;
            if (nsrc.over20 != null) n.over20 = nsrc.over20;
            if (Object.keys(n).length) nextMap[name] = n;

            // season-level values
            const ssrc = item.season || item;
            const s = {};
            if (ssrc.top5 != null) s.top5 = ssrc.top5;
            if (ssrc.avg18 != null) s.avg18 = ssrc.avg18;
            if (ssrc.best_over != null) s.best_over = ssrc.best_over;
            if (ssrc.best_over_plus5 != null) s.best_over_plus5 = ssrc.best_over_plus5;
            if (ssrc.media_over != null) s.media_over = ssrc.media_over;
            // also support flattened p-prefixed keys from older/new outputs
            if (item.pTitolo != null) s.win = item.pTitolo;
            if (item.pPodio != null) s.podio = item.pPodio;
            if (item.pTop5 != null) s.top5 = item.pTop5;
            if (item.pBest30 != null) s.best_over = item.pBest30;
            if (item.pAvg18 != null) s.avg18 = item.pAvg18;
            if (item.pThresholds != null) s.pThresholds = item.pThresholds;
            if (Object.keys(s).length) seasonMap[name] = s;
          });
          next = nextMap;
          season = seasonMap;
        }

        // If next map lacks values, try to seed next.over30 from season.best_over when available
        if (board.next_matchday && board.next_matchday.players && Object.keys(next).length === 0 && Object.keys(season).length > 0) {
          Object.keys(season).forEach(name => {
            const s = season[name];
            if (!next[name]) next[name] = {};
            if (s.best_over != null && next[name].over30 == null) next[name].over30 = s.best_over;
            if (s.pBest30 != null && next[name].over30 == null) next[name].over30 = s.pBest30;
          });
        }

        function impliedQuote(prob, margin=0.08){
          var bounded = Math.max(0.03, Math.min(0.92, prob || 0));
          var adjusted = Math.min(bounded * (1 + margin), 0.97);
          var q = 1 / adjusted;
          q = Math.max(1.08, Math.min(33.0, q));
          return Math.round(q * 100) / 100;
        }

        if (board.next_matchday && board.next_matchday.players){
          board.next_matchday.players.forEach(p => {
            const name = p.nome;
            let n = (next && next[name]) || null;

            // If no explicit next entry, try to find perPlayer entry and extract thresholds
            if (!n && Array.isArray(json.perPlayer)){
              const per = json.perPlayer.find(x => (x.nome||x.name||x.player||x.player_name) === name);
              if (per){
                n = {};
                // try pThresholds (assume last element is the highest threshold like >=30)
                if (Array.isArray(per.pThresholds) && per.pThresholds.length){
                  const idx = per.pThresholds.length - 1;
                  n.over30 = per.pThresholds[idx];
                  // also map probable over25 as first threshold if available
                  if (per.pThresholds.length >= 1) n.over25 = per.pThresholds[0];
                }
                // fallback keys
                if (per.pBest30 != null && (n.over30 == null)) n.over30 = per.pBest30;
                if (per.pAvg18 != null && per.pTop5 == null) {/* noop for season */}
                // also map pTitolo/pPodio if present
                if (per.pTitolo != null) n.win = per.pTitolo;
                if (per.pPodio != null) n.podio = per.pPodio;
              }
            }

            // final fallback to season map
            if (!n && season && season[name]){
              n = {};
              if (season[name].win != null) n.win = season[name].win;
              if (season[name].podio != null) n.podio = season[name].podio;
              if (season[name].best_over != null) n.over30 = season[name].best_over;
            }

            if (!n) return;
            p.quote_vittoria = impliedQuote(n.win);
            p.quote_podio = impliedQuote(n.podio);
            p.quote_over_30 = impliedQuote(n.over30);
            p.quote_over_25 = impliedQuote(n.over25);
            p.quote_over_20 = impliedQuote(n.over20);
            console.info('MC merge next:', board.season_id, name, { src: n, mapped: p.quote_over_30 });
          });
        }

        if (next && board.next_matchday){
          if (Array.isArray(next.specials)) board.next_matchday.specials = next.specials;
          if (Array.isArray(next.highlights)) board.next_matchday.highlights = next.highlights;
        }

        if (board.players && season){
          board.players.forEach(p => {
            const name = p.nome;
            const s = season[name];
            if (s == null) return;
            if (typeof s === 'number'){
              p.quote_titolo = impliedQuote(s);
            } else if (typeof s === 'object'){
              p.quote_titolo = impliedQuote(s.win);
              if (s.best_over != null) p.quote_best_over = impliedQuote(s.best_over);
              if (s.best_over_plus5 != null) p.quote_best_over_plus5 = impliedQuote(s.best_over_plus5);
              if (s.media_over != null) p.quote_media_over = impliedQuote(s.media_over);
              if (s.top5 != null) { p.quote_top5 = impliedQuote(s.top5); p.prob_top5 = s.top5; }
              if (s.avg18 != null) { p.quote_avg_18 = impliedQuote(s.avg18); p.prob_avg_18 = s.avg18; }
              if (s.best_over_thr1_value != null) p.best_over_thr1_value = s.best_over_thr1_value;
              if (s.best_over_thr2_value != null) p.best_over_thr2_value = s.best_over_thr2_value;
              if (s.media_over_thr_value != null) p.media_over_thr_value = s.media_over_thr_value;
              if (s.best_over != null) { p.quote_best_over_thr1 = impliedQuote(s.best_over); p.prob_best_over_thr1 = s.best_over; }
              if (s.best_over_plus5 != null) { p.quote_best_over_thr2 = impliedQuote(s.best_over_plus5); p.prob_best_over_thr2 = s.best_over_plus5; }
            }
          });
        }
      } catch (e) {
        console.warn('Failed to merge MC results for', board && board.season_id, e);
      }
      try {
        if (typeof window.renderSisalBoard === 'function') {
          try { window.renderSisalBoard(board.season_id); console.info('Re-rendered board after MC merge', board.season_id); } catch(e){ console.warn('renderSisalBoard failed', e); }
        }
      } catch(e) { /* noop */ }
      // Also attempt a targeted DOM patch for next-matchday Over30 cells (robust against timing issues)
      try {
        const tbody = document.getElementById('sisal-next-player-tbody');
        if (tbody && json && Array.isArray(json.perPlayer)){
          // helper impliedQuote (same as above)
          function impliedQuoteLocal(prob, margin=0.08){
            var bounded = Math.max(0.03, Math.min(0.92, prob || 0));
            var adjusted = Math.min(bounded * (1 + margin), 0.97);
            var q = 1 / adjusted;
            q = Math.max(1.08, Math.min(33.0, q));
            return Math.round(q * 100) / 100;
          }
          json.perPlayer.forEach(per => {
            const name = per.nome || per.name || per.player || per.player_name;
            if (!name) return;
            // find matching row by player name (trim and compare)
            Array.from(tbody.querySelectorAll('tr')).forEach(row => {
              const nameCell = row.querySelector('.sisal-table-player a') || row.querySelector('.sisal-table-player') || row.querySelector('td');
              if (!nameCell) return;
              const txt = (nameCell.textContent || '').trim();
              if (txt !== name) return;
              const tds = row.querySelectorAll('td');
              if (!tds || tds.length <= 4) return;
              const over30Td = tds[4];
              const span = over30Td.querySelector('.sisal-quote');
              // determine probability: prefer pOver30, then pThresholds[1], then pBest30
              var prob = per.pOver30 != null ? per.pOver30 : (Array.isArray(per.pThresholds) ? per.pThresholds[per.pThresholds.length-1] : null);
              if (prob == null && per.pBest30 != null) prob = per.pBest30;
              // fallback to season map
              if (prob == null && season && season[name] && season[name].best_over != null) prob = season[name].best_over;
              if (span && prob != null && isFinite(Number(prob)) && Number(prob) > 0){
                const q = impliedQuoteLocal(prob);
                span.textContent = Number(q).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});
                span.classList.remove('sisal-quote--closed');
                span.classList.add('sisal-quote--entered');
              }
            });
          });
        }
      } catch(e) { console.warn('DOM patch after MC merge failed', e); }
    });
  } catch (e) {
    console.warn('Loading MC results failed', e);
  }
}

// fire-and-forget with fallback: if fetch failed for boards, attempt dynamic import per season
loadMcResults().catch(async err => {
  console.warn('loadMcResults initial attempt failed, trying dynamic import fallback', err);
  const boards = (window.CSL && window.CSL.sisal) || [];
  for (const board of boards){
    try {
      const seasonId = board && board.season_id;
      if (!seasonId) continue;
      const path = `../../data/mc_results_${seasonId}.json`;
      try {
        const mod = await import(path, { assert: { type: 'json' } });
        const json = mod && mod.default ? mod.default : null;
        if (json) {
          board.mc_summary = json;
          // repeat minimal merge for next players
          const next = json.next_matchday || {};
          if (board.next_matchday && board.next_matchday.players && next){
            board.next_matchday.players.forEach(p => {
              const name = p.nome;
              const n = next[name];
              if (!n) return;
              p.quote_vittoria = (1/Math.max(0.03, Math.min(0.92, n.win||0))) || p.quote_vittoria;
              p.quote_podio = (1/Math.max(0.03, Math.min(0.92, n.podio||0))) || p.quote_podio;
              p.quote_over_30 = (1/Math.max(0.03, Math.min(0.92, n.over30||0))) || p.quote_over_30;
              p.quote_over_25 = (1/Math.max(0.03, Math.min(0.92, n.over25||0))) || p.quote_over_25;
              p.quote_over_20 = (1/Math.max(0.03, Math.min(0.92, n.over20||0))) || p.quote_over_20;
              console.info('Dynamic-import MC merge next:', board.season_id, name, { over30:n && n.over30 });
            });
          }
          try {
            if (typeof window.renderSisalBoard === 'function') {
              try { window.renderSisalBoard(board.season_id); console.info('Re-rendered board after dynamic-import MC merge', board.season_id); } catch(e){ console.warn('renderSisalBoard failed', e); }
            }
          } catch(e) { /* noop */ }
        }
      } catch (e) {
        console.warn('Dynamic import failed for', seasonId, e);
      }
    } catch(e){ console.warn('Fallback merge error', e) }
  }
});
