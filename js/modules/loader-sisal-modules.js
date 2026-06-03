// Loader that imports modules and exposes expected globals for legacy code
import * as PARLAY from './parlay.js';
import * as DOM from './domUtils.js';
import * as SLIP from './slipStore.js';

// MonteCarlo/correlation functionality removed (no fallbacks)

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
// Correlation grid removed; no legacy rendering available

console.info('Sisal modules loaded: PARLAY, DOM, SLIP');
