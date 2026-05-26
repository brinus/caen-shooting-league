// CAEN Shooting League — Ranking Engine (JS port of scripts/aggiorna.py)
// Calcola classifiche giornaliere e stagionali dai risultati grezzi in Supabase.
// Output compatibile con il formato già usato da app.js (CSL.stagioni).

// ── Costanti ───────────────────────────────────────────────────

const PUNTI_CAMPIONATO = [10, 8, 6, 4, 4, 2, 2, 1, 1, 1]  // dalla posizione 1; dall'11° → 0
const GIORNI_ITA = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
// weekday ISO: 0=lun..6=dom — per Date.getDay() domenica=0
const GIORNATE_GARA_JS = new Set([1, 3])  // Date.getDay(): 1=lun, 3=mer

// ── Utilità ────────────────────────────────────────────────────

function _puntiPerPos(pos) {
  return pos - 1 < PUNTI_CAMPIONATO.length ? PUNTI_CAMPIONATO[pos - 1] : 0
}

function _normalizeTentativo(v) {
  return v >= 0 ? v : 0
}

/** Calcola metriche di un tentativo (t1,t2,t3) usate per gli spareggi. */
function getAttemptMetrics(t1, t2, t3) {
  const slots = [_normalizeTentativo(t1), _normalizeTentativo(t2), _normalizeTentativo(t3)]
  const sorted = [...slots].sort((a, b) => b - a)
  return {
    best: sorted[0],
    media_tre_tentativi: Math.round((slots.reduce((s, v) => s + v, 0) / 3) * 1000) / 1000,
    secondo_miglior_tentativo: sorted[1],
  }
}

/** Chiave di ordinamento giornata (più alto = migliore). */
function _giornataRankSignature(p) {
  return [p.best, p.media_tre_tentativi, p.secondo_miglior_tentativo]
}

function _giornataSignatureEq(a, b) {
  const sa = _giornataRankSignature(a)
  const sb = _giornataRankSignature(b)
  return sa[0] === sb[0] && sa[1] === sb[1] && sa[2] === sb[2]
}

function _giornataSortCmp(a, b) {
  if (b.best !== a.best) return b.best - a.best
  if (b.media_tre_tentativi !== a.media_tre_tentativi) return b.media_tre_tentativi - a.media_tre_tentativi
  if (b.secondo_miglior_tentativo !== a.secondo_miglior_tentativo) return b.secondo_miglior_tentativo - a.secondo_miglior_tentativo
  return a.nome.localeCompare(b.nome, 'it')
}

function _classificaRankSignature(p) {
  return [p.punti_campionato, p.media_tiro_spareggio, p.punti_tiro, p.record]
}

function _classificaSignatureEq(a, b) {
  const sa = _classificaRankSignature(a)
  const sb = _classificaRankSignature(b)
  return sa.every((v, i) => v === sb[i])
}

function _classificaSortCmp(a, b) {
  if (b.punti_campionato !== a.punti_campionato) return b.punti_campionato - a.punti_campionato
  if (b.media_tiro_spareggio !== a.media_tiro_spareggio) return b.media_tiro_spareggio - a.media_tiro_spareggio
  if (b.punti_tiro !== a.punti_tiro) return b.punti_tiro - a.punti_tiro
  if (b.record !== a.record) return b.record - a.record
  return a.nome.localeCompare(b.nome, 'it')
}

/** True se la data è una giornata di gara (lun/mer). */
function isGiornataGara(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return GIORNATE_GARA_JS.has(d.getDay())
}

/** Conta lun+mer nell'intervallo [inizio, fine] inclusi. */
function countGiornateTotali(inizioStr, fineStr) {
  const end = new Date(fineStr + 'T00:00:00')
  let count = 0
  let d = new Date(inizioStr + 'T00:00:00')
  while (d <= end) {
    if (GIORNATE_GARA_JS.has(d.getDay())) count++
    d = new Date(d.getTime() + 86400000)
  }
  return count
}

/** Ritorna array di date "YYYY-MM-DD" delle giornate di gara nel range. */
function listGiornateGara(inizioStr, fineStr) {
  const end = new Date(fineStr + 'T00:00:00')
  const giorni = []
  let d = new Date(inizioStr + 'T00:00:00')
  while (d <= end) {
    if (GIORNATE_GARA_JS.has(d.getDay())) giorni.push(_dateToStr(d))
    d = new Date(d.getTime() + 86400000)
  }
  return giorni
}

function _dateToStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0')
}

function _giornoDella(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return GIORNI_ITA[d.getDay()]
}

// ── Recuperi ───────────────────────────────────────────────────

/**
 * Assegna i recuperi alle giornate di gara disponibili.
 * Input: season {inizio, fine, max_recuperi}, results [{data, giocatore, gara, ...}]
 * Output: { results: risultati estesi (recupero assegnato alla giornata),
 *            playerRecuperi: {giocatore: n_recuperi} }
 */
function assignRecuperi(season, results) {
  const allGameDays = listGiornateGara(season.inizio, season.fine)

  // Giornate già giocate per giocatore
  const playerPlayed = {}
  for (const r of results) {
    if (r.data >= season.inizio && r.data <= season.fine && r.gara) {
      if (!playerPlayed[r.giocatore]) playerPlayed[r.giocatore] = new Set()
      playerPlayed[r.giocatore].add(r.data)
    }
  }

  // Candidati recupero: giorni non di gara nella stagione
  const rawRecuperi = results.filter(r =>
    r.data >= season.inizio && r.data <= season.fine && !r.gara
  ).sort((a, b) => a.giocatore.localeCompare(b.giocatore) || a.data.localeCompare(b.data))

  const playerAssigned = {}
  // Start with recuperi already present in the dataset (admin-saved rows
  // may already have `recupero = true`). Count them so they aren't lost.
  const playerRecuperi = {}
  for (const r of results) {
    if (r.recupero) playerRecuperi[r.giocatore] = (playerRecuperi[r.giocatore] || 0) + 1
  }
  const modified = []

  for (const r of rawRecuperi) {
    const g = r.giocatore
    const occupied = new Set([
      ...(playerPlayed[g] || []),
      ...(playerAssigned[g] || []),
    ])
    const assignedDay = allGameDays.find(gd => !occupied.has(gd))
    if (!assignedDay) continue

    if (!playerAssigned[g]) playerAssigned[g] = []
    playerAssigned[g].push(assignedDay)
    playerRecuperi[g] = (playerRecuperi[g] || 0) + 1

    modified.push({
      ...r,
      data_effettiva: r.data,
      data: assignedDay,
      gara: true,
      recupero: true,
    })
  }

  return { results: [...results, ...modified], playerRecuperi }
}

// ── Classifiche giornaliere ────────────────────────────────────

/**
 * Costruisce le giornate con risultati e posizioni.
 * Input: season, results (con gara=true/false già assegnato)
 * Output: array di giornate ordinate per data desc
 */
function buildGiornate(season, results) {
  const gare = {}  // data → {giocatore → candidato}

  for (const r of results) {
    // Group results by the scheduled giornata date (`r.data`). If a result
    // is a recupero, `data_effettiva` is kept as the real-played date but the
    // calendario/classifica must show the player on the giornata it counts for.
    const scheduledDate = r.data
    if (scheduledDate < season.inizio || scheduledDate > season.fine || !r.gara) continue

    const metrics = getAttemptMetrics(r.t1, r.t2, r.t3)
    const candidate = {
      nome: r.giocatore,
      iniziali: r.iniziali,
      t1: r.t1, t2: r.t2, t3: r.t3,
      best: metrics.best,
      media_tre_tentativi: metrics.media_tre_tentativi,
      secondo_miglior_tentativo: metrics.secondo_miglior_tentativo,
      recupero: r.recupero || false,
      data_effettiva: r.data_effettiva || null,
    }

    if (!gare[scheduledDate]) gare[scheduledDate] = {}
    const current = gare[scheduledDate][r.giocatore]
    if (!current || _giornataSortCmp(candidate, current) < 0) {
      gare[scheduledDate][r.giocatore] = candidate
    }
  }

  const giornate = []
  const sortedDates = Object.keys(gare).sort((a, b) => b.localeCompare(a))

  for (const dataGara of sortedDates) {
    const partecipanti = Object.values(gare[dataGara]).sort(_giornataSortCmp)
    const risultati = []
    let pos = 1

    for (let i = 0; i < partecipanti.length; i++) {
      const p = partecipanti[i]
      if (i > 0 && !_giornataSignatureEq(p, partecipanti[i - 1])) {
        pos = i + 1
      }
      risultati.push({
        posizione: pos,
        nome: p.nome,
        iniziali: p.iniziali,
        t1: p.t1, t2: p.t2, t3: p.t3,
        punteggio: p.best,
        media_tre_tentativi: p.media_tre_tentativi,
        secondo_miglior_tentativo: p.secondo_miglior_tentativo,
        punti_campionato: _puntiPerPos(pos),
        recupero: p.recupero,
        data_effettiva: p.data_effettiva,
      })
    }

    const numCal = countGiornateTotali(season.inizio, dataGara)
    giornate.push({
      data: dataGara,
      giorno: _giornoDella(dataGara),
      numero: numCal,
      risultati,
    })
  }

  return giornate
}

// ── Classifica stagionale ──────────────────────────────────────

/**
 * Calcola la classifica stagionale dai punti campionato delle giornate.
 */
function computeClassifica(season, results, giornate, playerRecuperi, maxRecuperi) {
  if (!giornate.length) return []

  // Tentativi ufficiali per giocatore (per record e secondo record)
  const officiaTentativi = {}
  const inizialiMap = {}
  for (const r of results) {
    if (r.data < season.inizio || r.data > season.fine || !r.gara) continue
    const g = r.giocatore
    inizialiMap[g] = r.iniziali
    if (!officiaTentativi[g]) officiaTentativi[g] = []
    for (const v of [r.t1, r.t2, r.t3]) {
      if (v >= 0) officiaTentativi[g].push(v)
    }
  }

  const stats = {}
  for (const giornata of giornate) {
    for (const ris of giornata.risultati) {
      const g = ris.nome
      if (!stats[g]) stats[g] = { partite: 0, punti_campionato: 0, punti_tiro: 0, vittorie: 0 }
      stats[g].partite++
      stats[g].punti_campionato += ris.punti_campionato
      stats[g].punti_tiro += ris.punteggio
      if (ris.posizione === 1) stats[g].vittorie++
    }
  }

  const classifica = []
  const pr = playerRecuperi || {}
  for (const [g, s] of Object.entries(stats)) {
    const partite = s.partite
    const mediaSpareg = partite ? s.punti_tiro / partite : 0
    const sorted = (officiaTentativi[g] || []).sort((a, b) => b - a)
    const record = sorted[0] || 0
    const secondoRecord = sorted[1] || 0
    classifica.push({
      nome: g,
      iniziali: inizialiMap[g] || '??',
      partite,
      punti_campionato: s.punti_campionato,
      punti_tiro: s.punti_tiro,
      media_tiro: Math.round(mediaSpareg * 10) / 10,
      media_tiro_spareggio: Math.round(mediaSpareg * 1000) / 1000,
      record,
      secondo_record: secondoRecord,
      vittorie: s.vittorie,
      recuperi_usati: pr[g] || 0,
      recuperi_max: maxRecuperi || season.max_recuperi || 4,
    })
  }

  classifica.sort(_classificaSortCmp)
  let pos = 1
  for (let i = 0; i < classifica.length; i++) {
    if (i > 0 && !_classificaSignatureEq(classifica[i], classifica[i - 1])) {
      pos = i + 1
    }
    classifica[i].posizione = pos
  }

  return classifica
}

// ── Classifica Cecchini ────────────────────────────────────────

function computeCecchini(season, results, maxRecuperi) {
  const ufficiali = {}   // giocatore → lista tentativi ufficiali
  const inizialiMap = {}

  for (const r of results) {
    if (r.data < season.inizio || r.data > season.fine || !r.gara) continue
    const g = r.giocatore
    inizialiMap[g] = r.iniziali
    if (!ufficiali[g]) ufficiali[g] = []
    for (const v of [r.t1, r.t2, r.t3]) {
      if (v >= 0) ufficiali[g].push(v)
    }
  }

  const cecchini = []
  for (const [g, tentativi] of Object.entries(ufficiali)) {
    const sorted = [...tentativi].sort((a, b) => b - a)
    const record = sorted[0] || 0
    const secondoRecord = sorted[1] || 0
    const puntiTiro = tentativi.reduce((s, v) => s + v, 0)
    const media = tentativi.length ? puntiTiro / tentativi.length : 0
    cecchini.push({
      nome: g,
      iniziali: inizialiMap[g] || '??',
      record,
      secondo_record: secondoRecord,
      media_tiro_spareggio: Math.round(media * 1000) / 1000,
      punti_tiro: puntiTiro,
    })
  }

  cecchini.sort((a, b) => {
    if (b.record !== a.record) return b.record - a.record
    if (b.media_tiro_spareggio !== a.media_tiro_spareggio) return b.media_tiro_spareggio - a.media_tiro_spareggio
    if (b.secondo_record !== a.secondo_record) return b.secondo_record - a.secondo_record
    if (b.punti_tiro !== a.punti_tiro) return b.punti_tiro - a.punti_tiro
    return a.nome.localeCompare(b.nome, 'it')
  })

  let pos = 1
  for (let i = 0; i < cecchini.length; i++) {
    if (i > 0) {
      const a = cecchini[i], b = cecchini[i - 1]
      if (a.record !== b.record ||
          a.media_tiro_spareggio !== b.media_tiro_spareggio ||
          a.secondo_record !== b.secondo_record ||
          a.punti_tiro !== b.punti_tiro) {
        pos = i + 1
      }
    }
    cecchini[i].posizione = pos
  }

  return cecchini
}

// ── Funzione principale ────────────────────────────────────────

/**
 * Dato un oggetto stagione e un array di righe risultati (da Supabase),
 * ritorna la stagione arricchita con classifica, giornate e cecchini
 * nel formato già usato da app.js.
 *
 * @param {Object} season - Riga dalla tabella stagioni
 * @param {Array}  rows   - Righe dalla tabella risultati (stessa stagione)
 * @returns {Object} season con .classifica, .giornate, .cecchini, .giornate_totali
 */
function buildSeasonData(season, rows) {
  // Normalizza: rispetta i flag provenienti dal DB quando presenti;
  // altrimenti determina `gara` dal giorno della settimana. Mantieni
  // il flag `recupero` così com'è nel DB.
  const rawResults = rows.map(r => ({
    ...r,
    gara: (typeof r.gara === 'boolean') ? r.gara : isGiornataGara(r.data),
    recupero: !!r.recupero,
  }))

  const { results, playerRecuperi } = assignRecuperi(season, rawResults)
  const giornate  = buildGiornate(season, results)
  const classifica = computeClassifica(season, results, giornate, playerRecuperi, season.max_recuperi)
  const cecchini  = computeCecchini(season, results, season.max_recuperi)

  return {
    ...season,
    giornate_totali: countGiornateTotali(season.inizio, season.fine),
    classifica,
    giornate,
    cecchini,
  }
}

// ── Caricamento dati da Supabase ───────────────────────────────

/**
 * Carica tutte le stagioni con i dati calcolati da Supabase.
 * Sostituisce CSL.stagioni nella pagina.
 * Chiama il callback onReady(stagioni) quando i dati sono pronti.
 */
async function loadStagioniFromSupabase(onReady) {
  try {
    const db = CSLAuth.client

    const [{ data: stagioni }, { data: risultati }] = await Promise.all([
      db.from('stagioni').select('*').order('anno').order('numero'),
      db.from('risultati').select('*'),
    ])

    if (!stagioni || !risultati) {
      console.warn('CSLRanking: dati Supabase non disponibili, uso dati statici')
      return onReady(null)
    }

    const processed = stagioni.map(s => {
      const rows = risultati.filter(r => r.stagione_id === s.id)
      return buildSeasonData(s, rows)
    })

    onReady(processed)
  } catch (err) {
    console.error('CSLRanking: errore caricamento Supabase', err)
    onReady(null)
  }
}

window.CSLRanking = {
  getAttemptMetrics,
  assignRecuperi,
  buildGiornate,
  computeClassifica,
  computeCecchini,
  buildSeasonData,
  loadStagioniFromSupabase,
  isGiornataGara,
  listGiornateGara,
  countGiornateTotali,
}
