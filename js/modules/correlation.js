// Correlation engine: uses samples produced by montecarlo to compute marginals, joint and ratio
// Exports: computePairwiseFromSamples(samples, players, selections)

/**
 * Compute pairwise marginals, joint probabilities and ratio matrix
 * samples: array of arrays (simulated scores) length N
 * players: array of player objects with `nome`
 * selections: array of selection descriptors { player_name, bet_type }
 */
export function computePairwiseFromSamples(samples, players, selections){
  const N = samples.length || 0;
  const L = selections.length;
  const margCounts = new Array(L).fill(0);
  const jointCounts = new Array(L).fill(0).map(()=>new Array(L).fill(0));
  if (N === 0) return { marginals: margCounts.map(()=>0), joint: jointCounts, ratio: jointCounts };

  for (let t=0;t<N;t++){
    const sim = samples[t];
    const sorted = sim.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v);
    for (let i=0;i<L;i++){
      const s = selections[i];
      const pidx = players.findIndex(pp=>pp.nome === s.player_name);
      if (pidx === -1) continue;
      let ok_i = false;
      if (s.bet_type === 'giornata_win') ok_i = (sorted[0].i === pidx);
      else if (s.bet_type === 'giornata_podio') ok_i = (sorted.slice(0,3).map(x=>x.i).indexOf(pidx) !== -1);
      else if (s.bet_type === 'giornata_over_20') ok_i = (sim[pidx] > 20);
      else if (s.bet_type === 'giornata_over_25') ok_i = (sim[pidx] > 25);
      margCounts[i] += ok_i ? 1 : 0;
      for (let j=i;j<L;j++){
        const s2 = selections[j];
        const pidx2 = players.findIndex(pp=>pp.nome === s2.player_name);
        if (pidx2 === -1) continue;
        let ok_j = false;
        if (s2.bet_type === 'giornata_win') ok_j = (sorted[0].i === pidx2);
        else if (s2.bet_type === 'giornata_podio') ok_j = (sorted.slice(0,3).map(x=>x.i).indexOf(pidx2) !== -1);
        else if (s2.bet_type === 'giornata_over_20') ok_j = (sim[pidx2] > 20);
        else if (s2.bet_type === 'giornata_over_25') ok_j = (sim[pidx2] > 25);
        if (ok_i && ok_j) jointCounts[i][j] += 1;
        if (i !== j && ok_i && ok_j) jointCounts[j][i] += 1;
      }
    }
  }

  const margP = margCounts.map(c => Math.max(1e-12, c / N));
  const jointP = jointCounts.map(row => row.map(c => Math.max(0, c / N)));
  const ratio = jointP.map((row,i) => row.map((jp,j) => {
    const denom = margP[i] * margP[j];
    return denom > 0 ? jp / denom : 0;
  }));

  return { marginals: margP, joint: jointP, ratio };
}
