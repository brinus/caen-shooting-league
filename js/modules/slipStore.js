// Slip store: centralizza lo stato della schedina e fornisce eventi di cambiamento
// API: getSelections(), setSelections(arr), addSelection(bd), removeAt(i), clear(), onChange(cb), offChange(cb)

const _listeners = new Set();
let _selections = [];
let _selPanel = null;

function emit(){
  const snapshot = _selections.slice();
  _listeners.forEach(cb => {
    try { cb(snapshot); } catch(e){ console.error('slipStore listener', e); }
  });
}

export function getSelections(){ return _selections.slice(); }
export function setSelections(arr){ _selections = Array.isArray(arr) ? arr.slice() : []; emit(); }
export function replaceSelections(arr){ setSelections(arr); }
export function addSelection(bd){ _selections.push(bd); emit(); }
export function removeAt(i){ if (i>=0 && i<_selections.length) { _selections.splice(i,1); emit(); } }
export function clear(){ _selections = []; _selPanel = null; emit(); }
export function getPanel(){ return _selPanel; }
export function setPanel(p){ _selPanel = p; emit(); }

export function onChange(cb){ _listeners.add(cb); }
export function offChange(cb){ _listeners.delete(cb); }

// toggle helper: returns {added:boolean, removedIndex:number|null}
export function toggle(bd, panelName, conflictChecker){
  if (_selPanel && _selPanel !== panelName) return { error: 'panel_locked' };
  const key = bd.bet_type + '|' + bd.player_name + '|' + bd.market_label;
  const idx = _selections.findIndex(s => (s.bet_type + '|' + s.player_name + '|' + s.market_label) === key);
  if (idx >= 0){ _selections.splice(idx,1); if (_selections.length===0) _selPanel = null; emit(); return { removedIndex: idx } }
  if (_selections.length >= 10) return { error: 'limit' };
  if (typeof conflictChecker === 'function'){
    const conflict = conflictChecker(bd, _selections);
    if (conflict) return { error: 'conflict', message: conflict };
  }
  _selections.push(bd); if (!_selPanel) _selPanel = panelName; emit(); return { added:true };
}

export default {
  getSelections, setSelections, addSelection, removeAt, clear, onChange, offChange, toggle, getPanel, setPanel
};
