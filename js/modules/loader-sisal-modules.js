// Loader that imports modules and exposes expected globals for legacy code
import * as MC from './montecarlo.js';
import * as CORR from './correlation.js';
import * as PARLAY from './parlay.js';
import * as DOM from './domUtils.js';

// Expose functions expected by legacy inline scripts
window.estimateNextDayParlayProb = function(board, selections, N){ return MC.estimateParlayProb(board, selections, N); };
window.computePairwiseCorrelations = function(board, selections, N){
  const samples = MC.getCachedSamples(board);
  // ensure samples if none exist
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

// Backwards-compat: if old code calls renderCorrelationGrid(selections, corrObj, container)
window.renderCorrelationGrid = function(selections, corrObj, parlayProb, container){
  // simple wrapper that reconstructs previous behavior by delegating to existing function
  // If original renderCorrelationGrid exists on page (we added updated version earlier), prefer that
  if (typeof window.__legacyRenderCorrelationGrid === 'function'){
    return window.__legacyRenderCorrelationGrid(selections, corrObj, parlayProb, container);
  }
  // fallback simple render
  container && (container.innerHTML = '<div style="color:var(--text-muted)">Correlazioni disponibili.</div>');
};

console.info('Sisal modules loaded: MC, CORR, PARLAY, DOM');
