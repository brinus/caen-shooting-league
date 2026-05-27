// Parlay calculations and utilities
// Exports: productQuota(selections), applyBonus(quota, legs), getBonus(legs)

export function productQuota(selections){
  return selections.reduce((acc, s) => acc * (Number(s.quota) || 1), 1);
}

export function getBonus(numLegs){
  // keep original behaviour: example bonus table if present in page code
  // This function may be replaced by site's existing getBonus; kept here for modularity
  if (numLegs <= 1) return 1;
  if (numLegs === 2) return 1.02;
  if (numLegs === 3) return 1.035;
  if (numLegs === 4) return 1.05;
  return 1 + Math.min(0.2, 0.01 * numLegs);
}

export function applyBonus(quota, numLegs){
  return quota * getBonus(numLegs);
}
