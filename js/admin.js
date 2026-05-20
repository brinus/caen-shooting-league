// CAEN Shooting League — Admin Panel Logic

let _adminBooted = false

async function bootAdminPanel() {
  if (_adminBooted) return
  if (!window.CSLAuth || !CSLAuth.client) return

  let session = CSLAuth.getSession()
  if (!session) {
    try {
      const res = await CSLAuth.client.auth.getSession()
      session = res && res.data ? res.data.session : null
    } catch (e) {
      console.warn('Admin panel: getSession failed', e)
    }
  }

  if (!session) {
    window.location.href = 'login.html?next=' + encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)
    return
  }

  const isAdmin = !!(session.user && session.user.app_metadata && session.user.app_metadata.user_role === 'admin') || CSLAuth.isAdmin()
  if (!isAdmin) {
    const guard = document.getElementById('admin-guard')
    if (guard) {
      guard.hidden = false
      guard.textContent = 'Accesso negato. Solo gli admin possono visualizzare questa pagina.'
    }
    return
  }

  _adminBooted = true
  document.getElementById('admin-content').hidden = false
  initTabs()
  loadGiornateTab()
  loadCalendarioTab()
  loadStagioniTab()
  loadScommesseTab()
  loadPostsTab()
  loadRegolamentoTab()
  loadCommentiTab()
  loadUtentiTab()
}

document.addEventListener('csl:auth-ready', bootAdminPanel)

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootAdminPanel, { once: true })
} else {
  bootAdminPanel()
}

setTimeout(function() {
  if (_adminBooted) return
  bootAdminPanel().catch(function(e) {
    console.error('Admin auth fallback error', e)
    const guard = document.getElementById('admin-guard')
    if (guard) {
      guard.hidden = false
      guard.textContent = 'Autenticazione non pronta: controlla la console per eventuali errori di rete o di Supabase. Prova a ricaricare la pagina.'
    }
  })
}, 3000)

// ── Tabs ───────────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.admin-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'))
      document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'))
      btn.classList.add('active')
      const panelId = 'tab-' + btn.dataset.tab
      const panel = document.getElementById(panelId)
      if (panel) panel.classList.add('active')
    })
  })

  // Apri tab da hash URL
  const hash = window.location.hash.replace('#', '')
  if (hash) {
    const btn = document.querySelector(`.admin-tab[data-tab="${hash}"]`)
    if (btn) btn.click()
  }
}

// ── Utilità ────────────────────────────────────────────────────

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function showMsg(id, msg, isError) {
  const el = document.getElementById(id)
  if (!el) return
  el.textContent = msg
  el.hidden = false
  el.className = isError ? 'form-error' : 'form-success'
}

function hideMsg(id) {
  const el = document.getElementById(id)
  if (el) el.hidden = true
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── TAB: Giornate ──────────────────────────────────────────────

async function loadGiornateTab() {
  await populateSeasonSelect('giornata-stagione')
  document.getElementById('giornata-data').addEventListener('change', onGiornataDateChange)
  document.getElementById('btn-add-player-row').addEventListener('click', addPlayerRow)
  document.getElementById('btn-clear-giornata').addEventListener('click', clearGiornataForm)
  document.getElementById('form-giornata').addEventListener('submit', saveGiornata)
  document.getElementById('giornata-stagione').addEventListener('change', loadExistingGiornata)
  addPlayerRow()  // riga iniziale
  await loadGiornateList()
}

// ── TAB: Calendario — gestione giornate pianificate ─────────────────
async function loadCalendarioTab() {
  await populateSeasonSelect('calendario-stagione')
  const sel = document.getElementById('calendario-stagione')
  if (!sel) return
  sel.addEventListener('change', renderCalendario)
  document.getElementById('btn-refresh-calendario').addEventListener('click', function () { renderCalendario() })
  document.getElementById('btn-add-calendario-entry').addEventListener('click', async function () {
    // create a tentative giornata with numero = max+1 and empty date
    const seasonId = sel.value
    if (!seasonId) return
    // fetch existing to determine next numero
    const { data } = await CSLAuth.client.from('giornate').select('id, numero').eq('season_id', seasonId).order('numero', { ascending: true })
    const maxNum = (data && data.length) ? Math.max.apply(null, data.map(g => g.numero || 0)) : 0
    const season = await loadSeasonCalendarMeta(seasonId)
    const defaults = season ? buildDefaultSeasonSchedule(season.inizio, season.fine) : []
    const target = defaults[maxNum] || null
    const newRow = { season_id: seasonId, numero: maxNum + 1, data: target ? target.data : null }
    const { data: ins, error } = await CSLAuth.client.from('giornate').insert(newRow).select()
    if (error) { showMsg('calendario-error', error.message, true); return }
    showMsg('calendario-msg', '✓ Giornata aggiunta.', false)
    renderCalendario()
  })
  // initial render
  await renderCalendario()
}

async function renderCalendario() {
  const sel = document.getElementById('calendario-stagione')
  const seasonId = sel ? sel.value : null
  const grid = document.getElementById('calendario-grid')
  const editor = document.getElementById('calendario-editor')
  const summary = document.getElementById('calendario-summary')
  if (!seasonId) {
    if (grid) grid.innerHTML = '<p class="text-muted" style="grid-column:1/-1">Seleziona una stagione.</p>'
    if (summary) summary.innerHTML = ''
    return
  }
  if (grid) grid.innerHTML = '<p class="text-muted" style="grid-column:1/-1">Caricamento…</p>'
  if (editor) { editor.hidden = true; editor.innerHTML = '' }
  hideMsg('calendario-error'); hideMsg('calendario-msg')

  const season = await loadSeasonCalendarMeta(seasonId)
  if (!season) {
    if (grid) grid.innerHTML = '<p class="text-muted" style="grid-column:1/-1">Stagione non trovata.</p>'
    return
  }

  // Ensure default lun/mer schedule exists in DB up to season end.
  await ensureDefaultCalendarForSeason(season)

  // fetch giornate for season and all risultati dates to mark which giornate have results
  const [gRes, rRes] = await Promise.all([
    CSLAuth.client.from('giornate').select('id, numero, data, note').eq('season_id', seasonId).order('numero', { ascending: true }),
    CSLAuth.client.from('risultati').select('data').eq('stagione_id', seasonId)
  ])
  const allRows = gRes.data || []
  const gData = allRows
    .filter(function(g) { return (g.note || '') !== 'deleted' })
    .map(function(g) { return Object.assign({ isDefault: false }, g) })
  const rData = rRes.data || []
  const haveResults = new Set((rData || []).map(r => r.data))

  if (!gData.length) {
    if (grid) grid.innerHTML = '<p class="text-muted" style="grid-column:1/-1">Nessuna giornata pianificata.</p>'
    return
  }

  const defaultSchedule = buildDefaultSeasonSchedule(season.inizio, season.fine)
  const byNumero = Object.create(null)
  gData.forEach(function(g) { byNumero[g.numero] = g })
  defaultSchedule.forEach(function(def) {
    if (byNumero[def.numero] && byNumero[def.numero].data === def.data) {
      byNumero[def.numero].isDefault = true
    }
  })

  renderCalendarSummary(season, gData, haveResults)

  // default to current month
  const now = new Date()
  let anchorDate = new Date(now)
  anchorDate.setHours(0, 0, 0, 0)
  var seasonStart = new Date(season.inizio + 'T00:00:00')
  var seasonEnd = new Date(season.fine + 'T00:00:00')
  if (anchorDate < seasonStart) anchorDate = seasonStart
  if (anchorDate > seasonEnd && gData.length) anchorDate = new Date(gData[gData.length - 1].data + 'T00:00:00')
  let curMonth = anchorDate.getMonth()
  let curYear = anchorDate.getFullYear()

  document.getElementById('cal-prev').onclick = function () {
    curMonth--
    if (curMonth < 0) { curMonth = 11; curYear-- }
    renderCalendarGrid(seasonId, gData, haveResults, curMonth, curYear)
  }
  document.getElementById('cal-next').onclick = function () {
    curMonth++
    if (curMonth > 11) { curMonth = 0; curYear++ }
    renderCalendarGrid(seasonId, gData, haveResults, curMonth, curYear)
  }
  document.getElementById('btn-cal-show-list').onclick = function () {
    renderCalendarList(gData, haveResults)
  }

  renderCalendarGrid(seasonId, gData, haveResults, curMonth, curYear)
}

async function loadSeasonCalendarMeta(seasonId) {
  const { data, error } = await CSLAuth.client
    .from('stagioni')
    .select('id, nome, anno, inizio, fine, status')
    .eq('id', seasonId)
    .single()
  if (error) {
    showMsg('calendario-error', error.message, true)
    return null
  }
  return data || null
}

function buildDefaultSeasonSchedule(inizio, fine) {
  if (!inizio || !fine) return []
  const result = []
  let n = 0
  let d = new Date(inizio + 'T00:00:00')
  const end = new Date(fine + 'T00:00:00')
  while (d <= end) {
    const dow = d.getDay()
    if (dow === 1 || dow === 3) {
      n++
      result.push({
        numero: n,
        data: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
      })
    }
    d.setDate(d.getDate() + 1)
  }
  return result
}

async function ensureDefaultCalendarForSeason(season) {
  if (!season) return
  const defaults = buildDefaultSeasonSchedule(season.inizio, season.fine)
  if (!defaults.length) return
  const { data: existing, error } = await CSLAuth.client
    .from('giornate')
    .select('id, numero, data, note')
    .eq('season_id', season.id)
    .order('numero', { ascending: true })
  if (error) {
    showMsg('calendario-error', error.message, true)
    return
  }

  const existingByNumero = Object.create(null)
  ;(existing || []).forEach(function(g) { existingByNumero[g.numero] = g })
  const missing = defaults.filter(function(def) { return !existingByNumero[def.numero] })
  if (!missing.length) return

  const rows = missing.map(function(def) {
    return {
      season_id: season.id,
      numero: def.numero,
      data: def.data,
      note: 'auto-programmata'
    }
  })
  const { error: insertErr } = await CSLAuth.client.from('giornate').insert(rows)
  if (insertErr && !String(insertErr.message || '').toLowerCase().includes('duplicate')) {
    showMsg('calendario-error', insertErr.message, true)
  }
}

function renderCalendarSummary(season, gData, haveResults) {
  const summary = document.getElementById('calendario-summary')
  if (!summary) return
  const played = gData.filter(function(g) { return haveResults.has(g.data) })
  const upcoming = gData.filter(function(g) { return !haveResults.has(g.data) })
  const next = upcoming[0] || null
  summary.innerHTML =
    '<div class="admin-calendar-pill"><strong>' + escHtml(season.nome) + ' ' + escHtml(String(season.anno || '')) + '</strong></div>' +
    '<div class="admin-calendar-pill">Giocate: <strong>' + played.length + '</strong></div>' +
    '<div class="admin-calendar-pill">Programmate: <strong>' + gData.length + '</strong></div>' +
    '<div class="admin-calendar-pill">Range: <strong>' + escHtml(formatDate(season.inizio)) + '</strong> → <strong>' + escHtml(formatDate(season.fine)) + '</strong></div>' +
    (next ? '<div class="admin-calendar-pill admin-calendar-pill--accent">Prossima: <strong>G' + escHtml(String(next.numero)) + '</strong> · ' + escHtml(formatDate(next.data)) + '</div>' : '')
}

function renderCalendarList(gData, haveResults) {
  const grid = document.getElementById('calendario-grid')
  if (!grid) return
  const ordered = gData.slice().sort(function(a, b) { return a.numero - b.numero })
  grid.innerHTML = ordered.map(function(g) {
    return '<div class="admin-calendar-list-row">'
      + '<span class="admin-calendar-list-rank">G' + escHtml(String(g.numero)) + '</span>'
      + '<span class="admin-calendar-list-date">' + escHtml(formatDate(g.data)) + '</span>'
      + '<span class="admin-calendar-list-status">' + (haveResults.has(g.data) ? 'Giocata' : 'Programmata') + '</span>'
      + '</div>'
  }).join('')
}

function renderCalendarGrid(seasonId, gData, haveResults, month, year) {
  const monthNames = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
  const monthLabelEl = document.getElementById('cal-month-label')
  const grid = document.getElementById('calendario-grid')
  monthLabelEl.textContent = monthNames[month] + ' ' + year
  grid.innerHTML = ''

  // week day headers
  const days = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom']
  days.forEach(function(d) {
    const hd = document.createElement('div')
    hd.className = 'admin-calendar-weekday'
    hd.textContent = d
    grid.appendChild(hd)
  })

  // first day of month (JS: 0=Sun). We want Monday-first layout
  const first = new Date(year, month, 1)
  let startDow = first.getDay() // 0=Sun
  // convert to Monday=0..Sunday=6
  startDow = (startDow + 6) % 7
  const daysInMonth = new Date(year, month+1, 0).getDate()
  // fill leading blanks
  for (let i = 0; i < startDow; i++) { const cell = emptyCalCell(); grid.appendChild(cell) }

  for (let d = 1; d <= daysInMonth; d++) {
    const dd = new Date(year, month, d)
    const dateStr = dd.getFullYear() + '-' + String(dd.getMonth()+1).padStart(2,'0') + '-' + String(dd.getDate()).padStart(2,'0')
    const cell = document.createElement('div')
    cell.className = 'admin-calendar-day'

    const top = document.createElement('div')
    top.className = 'admin-calendar-day-top'
    const lbl = document.createElement('div'); lbl.className = 'admin-calendar-day-num'; lbl.textContent = d
    const badge = document.createElement('div'); badge.className = 'admin-calendar-day-badge'
    top.appendChild(lbl); top.appendChild(badge)

    const body = document.createElement('div'); body.className = 'admin-calendar-day-body'
    const isToday = isSameCalendarDate(dd, new Date())
    if (isToday) cell.classList.add('is-today')

    // find giornata scheduled on this date
    const g = gData.find(x => x.data === dateStr)
    if (g) {
      badge.textContent = 'G' + (g.numero || '—')
      body.textContent = hasValueText(g, haveResults, dateStr)
      cell.classList.add(haveResults.has(dateStr) ? 'is-played' : 'is-planned')
      if (g.isDefault) cell.classList.add('is-default')
    } else {
      body.textContent = dd.getDay() === 1 || dd.getDay() === 3 ? 'slot lun/mer' : ''
      if (body.textContent) cell.classList.add('is-available')
    }

    cell.appendChild(top); cell.appendChild(body)
    cell.addEventListener('click', function () { openCalendarDayEditor(seasonId, dateStr, g, haveResults) })
    grid.appendChild(cell)
  }
}

function emptyCalCell() {
  const c = document.createElement('div')
  c.className = 'admin-calendar-empty'
  return c
}

function isSameCalendarDate(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function hasValueStyle(g, haveResults, dateStr) { return haveResults.has(dateStr) ? 'var(--sisal-green)' : 'var(--text-muted)' }
function hasValueText(g, haveResults, dateStr) { return haveResults.has(dateStr) ? 'risultati presenti' : 'programmata' }
function hasResultsStyle(g, haveResults, dateStr) { return haveResults.has(dateStr) ? 'rgba(77,182,172,0.06)' : 'transparent' }

async function openCalendarDayEditor(seasonId, dateStr, giornata, haveResults) {
  const editor = document.getElementById('calendario-editor')
  editor.hidden = false
  var currentNum = giornata && giornata.numero ? String(giornata.numero) : ''
  var currentDate = giornata && giornata.data ? giornata.data : dateStr
  editor.innerHTML =
    '<div style="font-weight:700;margin-bottom:0.35rem">' + (giornata ? 'Modifica giornata' : 'Nuova giornata') + '</div>' +
    '<div class="text-muted" style="margin-bottom:0.85rem;font-size:0.82rem">Selezione corrente: ' + escHtml(formatDate(dateStr)) + '</div>' +
    '<div class="form-row" style="margin-bottom:0.75rem">' +
      '<div class="form-group" style="min-width:140px">' +
        '<label>Numero</label>' +
        '<input type="number" min="1" class="form-input" id="cal-edit-num" value="' + escHtml(currentNum) + '" placeholder="es. 6">' +
      '</div>' +
      '<div class="form-group" style="min-width:220px">' +
        '<label>Data</label>' +
        '<input type="date" class="form-input" id="cal-edit-date" value="' + escHtml(currentDate) + '">' +
      '</div>' +
    '</div>' +
    '<div class="form-hint" style="margin-bottom:0.8rem">Puoi spostare una giornata cambiando la data. Esempio: G6 dal 20 maggio al 22 maggio.</div>' +
    '<div style="display:flex;gap:0.6rem;flex-wrap:wrap">' +
      '<button type="button" class="btn-primary" id="cal-edit-save">Salva</button>' +
      (giornata ? '<button type="button" class="btn-danger" id="cal-edit-delete">Elimina</button>' : '') +
      '<button type="button" class="btn-secondary" id="cal-edit-close">Chiudi</button>' +
    '</div>'

  const saveBtn = document.getElementById('cal-edit-save')
  const closeBtn = document.getElementById('cal-edit-close')
  const deleteBtn = document.getElementById('cal-edit-delete')

  saveBtn.onclick = async function () {
    hideMsg('calendario-error')
    const num = parseInt(document.getElementById('cal-edit-num').value, 10)
    const targetDate = document.getElementById('cal-edit-date').value
    if (!isFinite(num) || num < 1) {
      showMsg('calendario-error', 'Numero giornata non valido.', true)
      return
    }
    if (!targetDate) {
      showMsg('calendario-error', 'Seleziona una data valida.', true)
      return
    }

    const [{ data: sameNumero, error: numErr }, { data: sameDate, error: dateErr }] = await Promise.all([
      CSLAuth.client.from('giornate').select('id, numero, note').eq('season_id', seasonId).eq('numero', num),
      CSLAuth.client.from('giornate').select('id, numero, note').eq('season_id', seasonId).eq('data', targetDate)
    ])
    if (numErr) { showMsg('calendario-error', numErr.message, true); return }
    if (dateErr) { showMsg('calendario-error', dateErr.message, true); return }

    var payload = { season_id: seasonId, numero: num, data: targetDate, note: (giornata && giornata.note) ? giornata.note : 'manuale' }
    var existingNumero = (sameNumero || []).find(function(r) { return (r.note || '') !== 'deleted' && (!giornata || r.id !== giornata.id) })
    if (existingNumero) {
      showMsg('calendario-error', 'Esiste gia una G' + num + ' attiva. Spostala o cancellala prima.', true)
      return
    }
    var existingDeletedNumero = (sameNumero || []).find(function(r) { return (r.note || '') === 'deleted' })
    if (giornata && giornata.id) payload.id = giornata.id
    else if (existingDeletedNumero) payload.id = existingDeletedNumero.id

    var dateConflict = (sameDate || []).find(function(r) { return (r.note || '') !== 'deleted' && (!giornata || r.id !== giornata.id) })
    if (dateConflict) {
      showMsg('calendario-error', 'La data scelta ospita gia G' + dateConflict.numero + '.', true)
      return
    }

    if (giornata && giornata.data && giornata.data !== targetDate && haveResults && haveResults.has(giornata.data)) {
      var moveResults = confirm('Esistono gia risultati per ' + formatDate(giornata.data) + '. Vuoi spostare anche i risultati alla nuova data?')
      if (moveResults) {
        const { error: moveErr } = await CSLAuth.client
          .from('risultati')
          .update({ data: targetDate })
          .eq('stagione_id', seasonId)
          .eq('data', giornata.data)
        if (moveErr) {
          showMsg('calendario-error', 'Errore spostando i risultati: ' + moveErr.message, true)
          return
        }
      }
    }

    const { error } = await CSLAuth.client.from('giornate').upsert(payload, { onConflict: 'id' })
    if (error) { showMsg('calendario-error', error.message, true); return }
    showMsg('calendario-msg', '✓ Giornata salvata.', false)
    await refreshStagioniCache()
    renderCalendario()
    editor.hidden = true
  }

  if (deleteBtn) {
    deleteBtn.onclick = async function () {
      if (!giornata || !giornata.id) return
      hideMsg('calendario-error')
      if (haveResults && haveResults.has(giornata.data)) {
        showMsg('calendario-error', 'Questa giornata ha gia risultati registrati. Spostala oppure gestisci prima i risultati.', true)
        return
      }
      if (!confirm('Eliminare G' + giornata.numero + ' dal calendario?')) return
      const { error } = await CSLAuth.client
        .from('giornate')
        .update({ note: 'deleted' })
        .eq('id', giornata.id)
      if (error) { showMsg('calendario-error', error.message, true); return }
      showMsg('calendario-msg', '✓ Giornata rimossa dal calendario.', false)
      await refreshStagioniCache()
      renderCalendario()
      editor.hidden = true
    }
  }

  closeBtn.onclick = function () { editor.hidden = true }
}

async function refreshStagioniCache() {
  if (typeof _loadStagioniFromSupabase === 'function') {
    const live = await _loadStagioniFromSupabase()
    if (live && live.length) CSL.stagioni = live
  }
  document.dispatchEvent(new CustomEvent('stagioni:updated'))
  document.dispatchEvent(new CustomEvent('sisal:boards-ready'))
}

async function onGiornataDateChange() {
  const dateVal = document.getElementById('giornata-data').value
  if (!dateVal) return
  const d = new Date(dateVal + 'T00:00:00')
  const day = d.getDay()  // 0=dom,1=lun,3=mer
  const banner = document.getElementById('giornata-tipo-info')
  if (day === 1 || day === 3) {
    banner.className = 'admin-info-banner admin-info-ok'
    banner.textContent = `✓ ${['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'][day]} — giornata di gara ufficiale`
  } else {
    banner.className = 'admin-info-banner admin-info-warn'
    banner.textContent = `⚠ ${['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'][day]} — questa data verrà trattata come recupero/allenamento`
  }
  banner.hidden = false
  await loadExistingGiornata()
}

/**
 * Carica i risultati esistenti per la data+stagione selezionata e precompila il form.
 * Se non ci sono dati esistenti, lascia il form com'è.
 */
async function loadExistingGiornata() {
  const stagioneId = document.getElementById('giornata-stagione').value
  const dateVal    = document.getElementById('giornata-data').value
  if (!stagioneId || !dateVal) return

  const { data, error } = await CSLAuth.client
    .from('risultati')
    .select('giocatore, iniziali, t1, t2, t3')
    .eq('stagione_id', stagioneId)
    .eq('data', dateVal)
    .order('giocatore')

  if (error || !data?.length) return  // nessun dato esistente: lascia il form com'è

  const container = document.getElementById('giornata-rows-container')
  container.innerHTML = ''
  data.forEach(function (r) {
    addPlayerRow(
      r.giocatore,
      r.iniziali,
      r.t1 >= 0 ? r.t1 : undefined,
      r.t2 >= 0 ? r.t2 : undefined,
      r.t3 >= 0 ? r.t3 : undefined
    )
  })
  showMsg('giornata-success',
    `✓ Caricati ${data.length} risultati esistenti per questa data — modifica e salva per aggiornare.`, false)
}

function addPlayerRow(nome, iniziali, t1, t2, t3) {
  const container = document.getElementById('giornata-rows-container')
  const row = document.createElement('div')
  row.className = 'giornata-player-row'
  row.innerHTML = `
    <input type="text" class="form-input player-nome" placeholder="Nome Cognome" value="${escHtml(nome || '')}" required>
    <input type="text" class="form-input player-iniziali" placeholder="NC" maxlength="3" value="${escHtml(iniziali || '')}" style="width:60px">
    <input type="number" class="form-input player-t1" placeholder="T1" min="-1" max="50" value="${t1 !== undefined ? t1 : ''}" style="width:70px">
    <input type="number" class="form-input player-t2" placeholder="T2" min="-1" max="50" value="${t2 !== undefined ? t2 : ''}" style="width:70px">
    <input type="number" class="form-input player-t3" placeholder="T3" min="-1" max="50" value="${t3 !== undefined ? t3 : ''}" style="width:70px">
    <button type="button" class="btn-icon btn-remove-row" title="Rimuovi">✕</button>
  `
  row.querySelector('.btn-remove-row').addEventListener('click', function () { row.remove() })

  // Auto-completa iniziali dal nome
  row.querySelector('.player-nome').addEventListener('blur', function () {
    const ini = row.querySelector('.player-iniziali')
    if (!ini.value) {
      ini.value = this.value.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3)
    }
  })

  container.appendChild(row)
}

function clearGiornataForm() {
  document.getElementById('giornata-data').value = ''
  document.getElementById('giornata-rows-container').innerHTML = ''
  document.getElementById('giornata-tipo-info').hidden = true
  addPlayerRow()
  hideMsg('giornata-error')
  hideMsg('giornata-success')
}

async function saveGiornata(e) {
  e.preventDefault()
  hideMsg('giornata-error')
  hideMsg('giornata-success')

  const stagioneId = document.getElementById('giornata-stagione').value
  const dataVal    = document.getElementById('giornata-data').value

  if (!stagioneId || !dataVal) {
    showMsg('giornata-error', 'Seleziona stagione e data.', true)
    return
  }

  const rows = []
  document.querySelectorAll('#giornata-rows-container .giornata-player-row').forEach(function (row) {
    const nome = row.querySelector('.player-nome').value.trim()
    const iniziali = row.querySelector('.player-iniziali').value.trim()
    const t1Raw = row.querySelector('.player-t1').value
    const t2Raw = row.querySelector('.player-t2').value
    const t3Raw = row.querySelector('.player-t3').value
    if (!nome) return
    rows.push({
      stagione_id: stagioneId,
      data:        dataVal,
      giocatore:   nome,
      iniziali:    iniziali || nome.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3),
      t1:          t1Raw !== '' ? parseInt(t1Raw) : -1,
      t2:          t2Raw !== '' ? parseInt(t2Raw) : -1,
      t3:          t3Raw !== '' ? parseInt(t3Raw) : -1,
      created_by:  CSLAuth.getProfile()?.id,
    })
  })

  if (!rows.length) {
    showMsg('giornata-error', 'Aggiungi almeno un giocatore.', true)
    return
  }

  const btn = document.getElementById('btn-save-giornata')
  btn.disabled = true
  btn.textContent = 'Salvataggio…'

  // Elimina le righe esistenti per questa data+stagione, poi inserisce le nuove
  // (upsert tramite delete+insert per gestire modifiche a tentativi parziali)
  const { error: delErr } = await CSLAuth.client
    .from('risultati')
    .delete()
    .eq('stagione_id', stagioneId)
    .eq('data', dataVal)

  if (delErr) {
    showMsg('giornata-error', 'Errore durante l\'aggiornamento: ' + delErr.message, true)
    btn.disabled = false
    btn.textContent = 'Salva giornata'
    return
  }

  const { error } = await CSLAuth.client.from('risultati').insert(rows)

  btn.disabled = false
  btn.textContent = 'Salva giornata'

  if (error) {
    showMsg('giornata-error', error.message, true)
  } else {
    showMsg('giornata-success', `✓ ${rows.length} risultati salvati per il ${formatDate(dataVal)}.`, false)
    clearGiornataForm()
    await loadGiornateList()
  }
}

async function loadGiornateList() {
  const listEl = document.getElementById('giornate-list')
  listEl.textContent = 'Caricamento…'

  const { data, error } = await CSLAuth.client
    .from('risultati')
    .select('data, stagione_id, giocatore')
    .order('data', { ascending: false })

  if (error) { listEl.textContent = 'Errore: ' + error.message; return }
  if (!data?.length) { listEl.textContent = 'Nessuna giornata registrata.'; return }

  // Raggruppa per data
  const byDate = {}
  data.forEach(function (r) {
    const key = r.stagione_id + '|' + r.data
    if (!byDate[key]) byDate[key] = { data: r.data, stagione_id: r.stagione_id, players: [] }
    byDate[key].players.push(r.giocatore)
  })

  const rows = Object.values(byDate).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 30)
  listEl.innerHTML = rows.map(function (g) {
    return `<div class="admin-list-row">
      <span class="admin-list-date">${formatDate(g.data)}</span>
      <span class="text-muted">${g.stagione_id}</span>
      <span>${g.players.length} giocatori</span>
    </div>`
  }).join('')
}

// ── TAB: Post ──────────────────────────────────────────────────

async function loadPostsTab() {
  const listEl = document.getElementById('posts-admin-list')

  // Prima mostra i post statici da data.js come fallback
  let posts = (CSL.posts || []).map(p => ({
    id: null, slug: p.slug, titolo: p.titolo, data: p.data,
    autore: p.autore, tags: p.tag, published: true, _static: true
  }))

  // Poi carica da Supabase
  const { data, error } = await CSLAuth.client
    .from('posts').select('id, slug, titolo, data, autore, tags, published').order('data', { ascending: false })

  if (!error && data) posts = data

  if (!posts.length) {
    listEl.textContent = 'Nessun post pubblicato.'
    return
  }

  listEl.innerHTML = posts.map(function (p) {
    const editLink = p.id ? `<a href="admin-post.html?id=${escHtml(p.id)}" class="btn-link-sm">Modifica</a>` : ''
    const viewLink = `<a href="post.html?slug=${escHtml(p.slug)}" class="btn-link-sm" target="_blank">Visualizza</a>`
    const pubBadge = p.published === false
      ? '<span class="badge-draft">Bozza</span>'
      : '<span class="badge-published">Pubblicato</span>'
    return `<div class="admin-list-row">
      <span class="admin-list-date">${escHtml(p.data)}</span>
      <span class="admin-list-title">${escHtml(p.titolo)}</span>
      ${pubBadge}
      <span class="admin-list-actions">${viewLink} ${editLink}</span>
    </div>`
  }).join('')
}

// ── TAB: Regolamento ───────────────────────────────────────────

async function loadRegolamentoTab() {
  const { data, error } = await CSLAuth.client
    .from('regolamento').select('content').eq('id', 1).single()

  if (!error && data) {
    document.getElementById('regolamento-content').value = data.content || ''
  }

  document.getElementById('btn-save-regolamento').addEventListener('click', async function () {
    hideMsg('regolamento-error')
    hideMsg('regolamento-success')
    const content = document.getElementById('regolamento-content').value
    const { error: saveErr } = await CSLAuth.client
      .from('regolamento')
      .upsert({ id: 1, content, updated_by: CSLAuth.getProfile()?.id })

    if (saveErr) showMsg('regolamento-error', saveErr.message, true)
    else showMsg('regolamento-success', '✓ Regolamento aggiornato.', false)
  })

  document.getElementById('btn-preview-regolamento').addEventListener('click', function () {
    const content = document.getElementById('regolamento-content').value
    const preview = document.getElementById('regolamento-preview')
    preview.innerHTML = content
    preview.style.display = preview.style.display === 'none' ? 'block' : 'none'
    this.textContent = preview.style.display === 'none' ? 'Anteprima' : 'Nascondi anteprima'
  })
}

// ── TAB: Utenti ────────────────────────────────────────────────

async function loadUtentiTab() {
  document.getElementById('form-create-user').addEventListener('submit', async function (e) {
    e.preventDefault()
    hideMsg('create-user-error')
    hideMsg('create-user-success')

    const btn = document.getElementById('btn-create-user')
    btn.disabled = true

    const opts = {
      username:     document.getElementById('new-username').value.trim(),
      password:     document.getElementById('new-password').value,
      display_name: document.getElementById('new-display-name').value.trim(),
      role:         document.getElementById('new-role').value,
      player_name:  document.getElementById('new-player-name').value.trim() || null,
    }

    const { error } = await CSLAuth.createUser(opts)
    btn.disabled = false

    if (error) {
      showMsg('create-user-error', error, true)
    } else {
      showMsg('create-user-success', `✓ Account "${opts.username}" creato.`, false)
      document.getElementById('form-create-user').reset()
      await loadUsersList()
    }
  })

  await loadUsersList()
}

async function loadUsersList() {
  const listEl = document.getElementById('users-list')
  listEl.textContent = 'Caricamento…'

  const { data, error } = await CSLAuth.client
    .from('profiles').select('id, username, display_name, role, player_name, created_at').order('created_at')

  if (error) { listEl.textContent = 'Errore: ' + error.message; return }
  if (!data?.length) { listEl.textContent = 'Nessun utente.'; return }

  const selfId = CSLAuth.getProfile()?.id

  listEl.innerHTML = data.map(function (u) {
    const roleLabels = { admin: 'Admin', participant: 'Partecipante', guest: 'Ospite' }
    const roleCls    = { admin: 'badge-admin', participant: 'badge-participant', guest: 'badge-guest' }
    const isSelf = u.id === selfId
    const roleSelect = isSelf ? '' : `
      <select class="form-input user-role-select" data-id="${escHtml(u.id)}" style="width:auto;font-size:0.8rem;padding:0.25rem 0.5rem">
        <option value="participant" ${u.role === 'participant' ? 'selected' : ''}>Partecipante</option>
        <option value="guest"       ${u.role === 'guest'       ? 'selected' : ''}>Ospite</option>
        <option value="admin"       ${u.role === 'admin'       ? 'selected' : ''}>Admin</option>
      </select>
      <button class="btn-secondary user-role-save" data-id="${escHtml(u.id)}" style="padding:0.25rem 0.7rem;font-size:0.8rem">Salva</button>`
    return `<div class="admin-list-row" style="flex-wrap:wrap;gap:0.5rem">
      <strong style="min-width:120px">${escHtml(u.username)}</strong>
      <span>${escHtml(u.display_name)}</span>
      <span class="badge ${roleCls[u.role] || 'badge-participant'}">${roleLabels[u.role] || u.role}</span>
      <span class="text-muted">${u.player_name ? escHtml(u.player_name) : '—'}</span>
      ${roleSelect}
    </div>`
  }).join('')

  listEl.querySelectorAll('.user-role-save').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      const profileId = btn.dataset.id
      const sel = listEl.querySelector(`.user-role-select[data-id="${profileId}"]`)
      const newRole = sel.value
      btn.disabled = true
      const { data: rpcData, error: rpcErr } = await CSLAuth.client.rpc('update_user_role', {
        p_profile_id: profileId,
        p_role: newRole,
      })
      btn.disabled = false
      if (rpcErr || rpcData?.error) {
        alert('Errore: ' + (rpcErr?.message || rpcData?.error))
        return
      }
      showMsg('create-user-success', '✓ Ruolo aggiornato.', false)
      await loadUsersList()
    })
  })
}

// ── TAB: Stagioni ──────────────────────────────────────────────

async function loadStagioniTab() {
  document.getElementById('form-stagione').addEventListener('submit', async function (e) {
    e.preventDefault()
    hideMsg('stagione-error')
    hideMsg('stagione-success')

    const payload = {
      id:           document.getElementById('stagione-id').value.trim(),
      nome:         document.getElementById('stagione-nome').value.trim(),
      numero:       parseInt(document.getElementById('stagione-numero').value),
      anno:         parseInt(document.getElementById('stagione-anno').value),
      inizio:       document.getElementById('stagione-inizio').value,
      fine:         document.getElementById('stagione-fine').value,
      max_recuperi: parseInt(document.getElementById('stagione-recuperi').value),
      status:       document.getElementById('stagione-status').value,
    }

    if (!payload.id || !payload.nome || !payload.inizio || !payload.fine) {
      showMsg('stagione-error', 'Compila tutti i campi obbligatori.', true)
      return
    }

    const { error } = await CSLAuth.client.from('stagioni').insert(payload)
    if (error) showMsg('stagione-error', error.message, true)
    else {
      showMsg('stagione-success', `✓ Stagione "${payload.nome}" creata.`, false)
      document.getElementById('form-stagione').reset()
      await loadStagioniList()
      await populateSeasonSelect('giornata-stagione')
    }
  })

  await loadStagioniList()
}

async function loadStagioniList() {
  const listEl = document.getElementById('stagioni-list')
  listEl.textContent = 'Caricamento…'

  const { data, error } = await CSLAuth.client.from('stagioni').select('*').order('anno').order('numero')

  if (error) { listEl.textContent = 'Errore: ' + error.message; return }
  if (!data?.length) { listEl.textContent = 'Nessuna stagione.'; return }

  listEl.innerHTML = data.map(function (s) {
    const statusCls = s.status === 'attiva' ? 'badge-active' : (s.status === 'conclusa' ? 'badge-draft' : '')
    return `<div class="admin-list-row">
      <code>${escHtml(s.id)}</code>
      <strong>${escHtml(s.nome)} ${s.anno}</strong>
      <span class="badge ${statusCls}">${s.status}</span>
      <span class="text-muted">${escHtml(s.inizio)} → ${escHtml(s.fine)}</span>
    </div>`
  }).join('')
}

// ── TAB: Commenti ────────────────────────────────────────

async function loadCommentiTab() {
  await loadAllComments()
}

async function loadAllComments() {
  const listEl = document.getElementById('admin-comments-list')
  listEl.textContent = 'Caricamento…'

  const { data, error } = await CSLAuth.client
    .from('comments')
    .select('id, content, created_at, post_id, profiles(display_name, username), posts(titolo, slug)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) { listEl.textContent = 'Errore: ' + error.message; return }
  if (!data?.length) { listEl.innerHTML = '<p class="text-muted">Nessun commento ancora.</p>'; return }

  listEl.innerHTML = data.map(function (c) {
    const author = c.profiles?.display_name || c.profiles?.username || '?'
    const postTitle = c.posts?.titolo || c.post_id
    const postLink = c.posts?.slug
      ? `<a href="post.html?slug=${escHtml(c.posts.slug)}" target="_blank" class="btn-link-sm">${escHtml(postTitle)}</a>`
      : escHtml(postTitle)
    const date = new Date(c.created_at).toLocaleString('it-IT', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
    return `<div class="admin-list-row admin-comment-row" data-id="${escHtml(c.id)}">
      <div class="admin-comment-meta">
        <strong>${escHtml(author)}</strong>
        <span class="text-muted">${date}</span>
        <span>su ${postLink}</span>
      </div>
      <div class="admin-comment-body">${escHtml(c.content)}</div>
      <button class="btn-icon btn-remove-row admin-comment-del" data-id="${escHtml(c.id)}" title="Elimina commento">✕</button>
    </div>`
  }).join('')

  listEl.querySelectorAll('.admin-comment-del').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      if (!confirm('Eliminare questo commento?')) return
      const { error: delErr } = await CSLAuth.client.from('comments').delete().eq('id', btn.dataset.id)
      if (delErr) { alert('Errore: ' + delErr.message); return }
      await loadAllComments()
    })
  })
}

async function populateSeasonSelect(selectId) {
  const sel = document.getElementById(selectId)
  if (!sel) return

  let seasons = CSL.stagioni || []
  const { data } = await CSLAuth.client.from('stagioni').select('id, nome, anno, status').order('anno').order('numero')
  if (data?.length) seasons = data

  sel.innerHTML = seasons.map(s =>
    `<option value="${escHtml(s.id)}">${escHtml(s.nome)} ${s.anno}</option>`
  ).join('')

  // Pre-seleziona stagione attiva
  const active = seasons.find(s => s.status === 'attiva')
  if (active) sel.value = active.id
}

// ── TAB: Scommesse ─────────────────────────────────────────────

async function loadScommesseTab() {
  // Sub-tabs singole / multiple
  document.querySelectorAll('.admin-subtab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.admin-subtab').forEach(function (b) {
        b.style.background = 'transparent'
        b.style.color = 'var(--text-muted)'
        b.classList.remove('active')
      })
      btn.style.background = 'rgba(255,102,0,0.12)'
      btn.style.color = 'var(--primary)'
      btn.classList.add('active')
      document.getElementById('subpanel-singole').hidden  = btn.dataset.subtab !== 'singole'
      document.getElementById('subpanel-multiple').hidden = btn.dataset.subtab !== 'multiple'
    })
  })

  document.getElementById('scommesse-filtro-status').addEventListener('change', reloadScommesse)
  document.getElementById('btn-reload-scommesse').addEventListener('click', reloadScommesse)
  await reloadScommesse()
}

async function reloadScommesse() {
  // Carica i dati live di stagioni/risultati da Supabase prima di calcolare
  // lo stato delle scommesse. Necessario perché csl:auth-ready può scattare
  // prima che app.js aggiorni CSL.stagioni con i dati live.
  if (typeof _loadStagioniFromSupabase === 'function') {
    const live = await _loadStagioniFromSupabase()
    if (live && live.length) CSL.stagioni = live
  }
  await Promise.all([loadScommesseSingole(), loadScommesseMultiple()])
}

// ── Indicatore vincente/perdente in tempo reale ────────────────
// Usa i dati statici CSL.stagioni (classifica + risultati giornate).

function _normName(s) { return (s || '').toLowerCase().trim() }

function getBetCurrentStatus(betType, playerName, giornataDate, seasonId) {
  const stagione = (CSL.stagioni || []).find(st => st.id === seasonId)
  if (!stagione) return null

  const pn = _normName(playerName)
  const isValidPlayer = pn && pn !== '—'

  // ── Scommesse stagionali ─────────────────────────────────────
  if (['titolo', 'podio', 'top5', 'best_30', 'avg_18'].includes(betType)) {
    if (!isValidPlayer) return null
    const p = (stagione.classifica || []).find(r => _normName(r.nome) === pn)
    if (!p) return null
    const pos = p.posizione
    switch (betType) {
      case 'titolo':
        return pos === 1 ? _betWin(`1° ✓`) : _betLose(`${pos}°`)
      case 'podio':
        return pos <= 3  ? _betWin(`${pos}° ✓`) : _betLose(`${pos}°`)
      case 'top5':
        return pos <= 5  ? _betWin(`${pos}° ✓`) : _betLose(`${pos}°`)
      case 'best_30': {
        const r = p.record
        return r >= 30 ? _betWin(`Record ${r} ✓`) : _betLose(`Record ${r} — serve 30+`)
      }
      case 'avg_18': {
        const m = p.media_tiro
        return m >= 18 ? _betWin(`Media ${m.toFixed(1)} ✓`) : _betLose(`Media ${m.toFixed(1)} — serve ≥18`)
      }
    }
  }

  // ── Scommesse di giornata ────────────────────────────────────
  if (betType.startsWith('giornata_')) {
    if (!giornataDate) return null
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const ggDate = new Date(giornataDate + 'T00:00:00')
    if (ggDate > today) return { label: 'Non ancora disputata', cls: 'pending' }

    const giornata = (stagione.giornate || []).find(g => g.data === giornataDate)
    if (!giornata) return { label: 'Risultati non ancora inseriti', cls: 'unknown' }

    const risultati = giornata.risultati || []
    if (!isValidPlayer) return null
    const pr = risultati.find(r => _normName(r.nome) === pn)
    if (!pr) return { label: 'Giocatore assente', cls: 'unknown' }

    const pos = pr.posizione, score = pr.punteggio
    switch (betType) {
      case 'giornata_win':
        return pos === 1  ? _betWin(`1° — ${score}pt. ✓`) : _betLose(`${pos}° — ${score}pt.`)
      case 'giornata_podio':
        return pos <= 3   ? _betWin(`${pos}° — ${score}pt. ✓`) : _betLose(`${pos}° — ${score}pt.`)
      case 'giornata_over_20':
        return score >= 20 ? _betWin(`${score}pt. ✓`) : _betLose(`${score}pt. — serve 20+`)
      case 'giornata_over_25':
        return score >= 25 ? _betWin(`${score}pt. ✓`) : _betLose(`${score}pt. — serve 25+`)
      case 'giornata_over_30':
        return score >= 30 ? _betWin(`${score}pt. ✓`) : _betLose(`${score}pt. — serve 30+`)
    }
  }

  return null // speciale o non determinabile
}

function _betWin(label)  { return { label, cls: 'winning' } }
function _betLose(label) { return { label, cls: 'losing' }  }

function betCurrentStatusHtml(status) {
  if (!status) return ''
  const map = {
    winning: 'bet-cur-win',
    losing:  'bet-cur-lose',
    pending: 'bet-cur-pending',
    unknown: 'bet-cur-unknown',
  }
  const icons = { winning: '🟢', losing: '🔴', pending: '⏳', unknown: '❓' }
  const cls  = map[status.cls] || 'bet-cur-unknown'
  const icon = icons[status.cls] || '❓'
  return `<span class="bet-current-status ${cls}">${icon} ${escHtml(status.label)}</span>`
}

async function loadScommesseSingole() {
  const listEl = document.getElementById('scommesse-singole-list')
  const statusFilter = document.getElementById('scommesse-filtro-status').value
  listEl.innerHTML = '<p class="text-muted" style="padding:0.5rem 0">Caricamento…</p>'

  let q = CSLAuth.client
    .from('scommesse')
    .select('*, profiles(id, username, display_name)')
    .order('created_at', { ascending: false })
    .limit(300)
  if (statusFilter !== 'tutte') q = q.eq('status', statusFilter)

  const { data, error } = await q
  if (error) { listEl.textContent = 'Errore: ' + error.message; return }
  if (!data?.length) { listEl.innerHTML = '<p class="text-muted" style="padding:1rem 0">Nessuna scommessa.</p>'; return }

  const today = new Date(); today.setHours(0, 0, 0, 0)

  // Separa scadute (attive con data passata) da attive normali e risolte
  const expiredActive  = data.filter(s => s.status === 'attiva' && s.giornata_date && new Date(s.giornata_date + 'T00:00:00') < today)
  const pendingActive  = data.filter(s => s.status === 'attiva' && !(s.giornata_date && new Date(s.giornata_date + 'T00:00:00') < today))
  const resolved       = data.filter(s => s.status !== 'attiva')

  // Banner riepilogativo
  let summaryHtml = ''
  if (expiredActive.length > 0) {
    summaryHtml = `<div class="admin-bet-summary admin-bet-summary--warn">
      <span>⚠ <strong>${expiredActive.length}</strong> scommess${expiredActive.length === 1 ? 'a' : 'e'} scadut${expiredActive.length === 1 ? 'a' : 'e'} (data passata, ancora attiv${expiredActive.length === 1 ? 'a' : 'e'})</span>
      <button id="btn-mark-expired-lost" class="btn-secondary" style="padding:0.25rem 0.85rem;font-size:0.8rem;white-space:nowrap">✗ Segna tutte come perse</button>
    </div>`
  } else if (statusFilter === 'attiva' || statusFilter === 'tutte') {
    summaryHtml = `<div class="admin-bet-summary">
      <span>📊 ${pendingActive.length + resolved.length} scommesse — ${pendingActive.length} attive${resolved.length ? ', ' + resolved.length + ' risolte' : ''}</span>
    </div>`
  }

  const BET_LABEL = {
    titolo:           '🏆 Titolo stagione',
    podio:            '🥉 Podio stagione',
    top5:             '🔝 Top 5 stagione',
    best_30:          '🎯 Best 30+',
    avg_18:           '📈 Media ≥18',
    giornata_win:     '🥇 Vincitore giornata',
    giornata_podio:   '🏅 Podio giornata',
    giornata_over_20: '🎯 Sopra 20 punti',
    giornata_over_25: '🎯 Sopra 25 punti',
    giornata_over_30: '🎯 Sopra 30 punti',
    speciale:         '⭐ Speciale',
  }

  // Ordine: scadute prime, poi attive, poi risolte
  const sorted = [...expiredActive, ...pendingActive, ...resolved]

  const rowsHtml = sorted.map(function (s) {
    const user    = s.profiles?.display_name || s.profiles?.username || '?'
    const tipo    = BET_LABEL[s.bet_type] || s.bet_type
    const potWin  = Math.floor(s.importo * s.quota)
    const isGiornata = s.bet_type.startsWith('giornata_')
    const isSpeciale = s.bet_type === 'speciale'
    const isExpired  = s.status === 'attiva' && s.giornata_date && new Date(s.giornata_date + 'T00:00:00') < today

    const createdStr = new Date(s.created_at).toLocaleString('it-IT', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })

    // Riga di contesto: cosa/quando/chi
    const ctx = []
    if (s.player_name && s.player_name !== '—' && s.player_name.trim() !== '') {
      ctx.push(`<span class="bet-ctx-player">🎯 ${escHtml(s.player_name)}</span>`)
    }
    if (s.giornata_date) {
      const ggDate   = new Date(s.giornata_date + 'T00:00:00')
      const ggFmt    = ggDate.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      const ggNum    = s.giornata_num ? ` — GG${s.giornata_num}` : ''
      const expired  = isExpired ? ' bet-ctx-date--past' : ''
      ctx.push(`<span class="bet-ctx-date${expired}">📅 ${ggFmt}${ggNum}</span>`)
    } else if (isGiornata) {
      ctx.push(`<span class="bet-ctx-warn">⚠ Giornata di riferimento non specificata</span>`)
    }
    if (isSpeciale) {
      const label = s.market_label ? escHtml(s.market_label) : '<em class="text-muted">Nessuna descrizione disponibile</em>'
      ctx.push(`<span class="bet-ctx-label">💬 ${label}</span>`)
    }

    const contextHtml = ctx.length ? `<div class="bet-card-context">${ctx.join('')}</div>` : ''
    const expiredBadge = isExpired ? '<span class="badge badge-expired">⚠ Data passata</span>' : ''
    const cardClass    = isExpired ? 'admin-bet-card admin-bet-card--expired' : 'admin-bet-card'
    const actions      = s.status === 'attiva' ? betActionButtons(s.id, 'singola') : ''

    // Indicatore vincente/perdente (solo per scommesse attive)
    const curStatus    = s.status === 'attiva'
      ? getBetCurrentStatus(s.bet_type, s.player_name, s.giornata_date, s.season_id)
      : null
    const curStatusHtml = betCurrentStatusHtml(curStatus)

    return `<div class="${cardClass}" data-id="${escHtml(s.id)}">
      <div class="bet-card-header">
        <span class="bet-card-date">${createdStr}</span>
        <strong class="bet-card-user">${escHtml(user)}</strong>
        <span class="badge badge-bet-type">${escHtml(tipo)}</span>
        <div class="bet-card-badges">${betStatusBadge(s.status)}${expiredBadge}</div>
      </div>
      ${contextHtml}
      <div class="bet-card-footer">
        <span class="bet-card-amount">${s.importo} 🪙 → <strong>${potWin} 🪙</strong> <span class="text-muted">(×${s.quota})</span></span>
        ${curStatusHtml}
        ${actions ? `<div class="bet-card-actions">${actions}</div>` : ''}
      </div>
    </div>`
  }).join('')

  listEl.innerHTML = summaryHtml + rowsHtml

  // Pulsante bulk "segna scadute come perse"
  const bulkBtn = document.getElementById('btn-mark-expired-lost')
  if (bulkBtn) {
    bulkBtn.addEventListener('click', async function () {
      if (!confirm(`Segnare ${expiredActive.length} scommess${expiredActive.length === 1 ? 'a' : 'e'} scadut${expiredActive.length === 1 ? 'a' : 'e'} come perse?`)) return
      bulkBtn.disabled = true
      bulkBtn.textContent = 'Elaborazione…'
      let ok = 0, fail = 0
      for (const s of expiredActive) {
        const { data: r, error: e } = await CSLAuth.client.rpc('resolve_bet', { p_bet_id: s.id, p_status: 'persa' })
        if (e || r?.error) fail++; else ok++
      }
      showMsg('scommesse-success', `✓ ${ok} scommess${ok === 1 ? 'a' : 'e'} segnate come perse${fail ? ` (${fail} errori)` : ''}.`, fail > 0)
      document.getElementById('scommesse-error').hidden = true
      await reloadScommesse()
    })
  }

  attachBetListeners(listEl, 'singola')
}

async function loadScommesseMultiple() {
  const listEl = document.getElementById('scommesse-multiple-list')
  const statusFilter = document.getElementById('scommesse-filtro-status').value
  listEl.innerHTML = '<p class="text-muted" style="padding:0.5rem 0">Caricamento…</p>'

  let q = CSLAuth.client
    .from('parlay_bets')
    .select('*, profiles(id, username, display_name)')
    .order('created_at', { ascending: false })
    .limit(300)
  if (statusFilter !== 'tutte') q = q.eq('status', statusFilter)

  const { data, error } = await q
  if (error) { listEl.textContent = 'Errore: ' + error.message; return }
  if (!data?.length) { listEl.innerHTML = '<p class="text-muted" style="padding:1rem 0">Nessuna schedina multipla.</p>'; return }

  const today = new Date(); today.setHours(0, 0, 0, 0)

  const BET_LABEL = {
    titolo:           '🏆 Titolo stagione',
    podio:            '🥉 Podio stagione',
    top5:             '🔝 Top 5 stagione',
    best_30:          '🎯 Best 30+',
    avg_18:           '📈 Media ≥18',
    giornata_win:     '🥇 Vincitore gg.',
    giornata_podio:   '🏅 Podio gg.',
    giornata_over_20: '🎯 Sopra 20pt.',
    giornata_over_25: '🎯 Sopra 25pt.',
    giornata_over_30: '🎯 Sopra 30pt.',
    speciale:         '⭐ Speciale',
  }
  const PANEL_LABEL = { stagione: 'Stagione', giornata: 'Giornata', speciali: 'Speciali' }

  const expiredActive = data.filter(s => s.status === 'attiva' && s.giornata_date && new Date(s.giornata_date + 'T00:00:00') < today)

  let summaryHtml = ''
  if (expiredActive.length > 0) {
    summaryHtml = `<div class="admin-bet-summary admin-bet-summary--warn">
      <span>⚠ <strong>${expiredActive.length}</strong> schedin${expiredActive.length === 1 ? 'a' : 'e'} scadut${expiredActive.length === 1 ? 'a' : 'e'} da risolvere</span>
      <button id="btn-mark-parlay-expired-lost" class="btn-secondary" style="padding:0.25rem 0.85rem;font-size:0.8rem;white-space:nowrap">✗ Segna tutte come perse</button>
    </div>`
  }

  const pendingActive = data.filter(s => s.status === 'attiva' && !(s.giornata_date && new Date(s.giornata_date + 'T00:00:00') < today))
  const resolved      = data.filter(s => s.status !== 'attiva')
  const sorted        = [...expiredActive, ...pendingActive, ...resolved]

  const rowsHtml = sorted.map(function (s) {
    const user    = s.profiles?.display_name || s.profiles?.username || '?'
    const legs    = Array.isArray(s.legs) ? s.legs : []
    const potWin  = Math.floor(s.importo * s.quota_final)
    const panel   = PANEL_LABEL[s.panel] || s.panel
    const isExpired = s.status === 'attiva' && s.giornata_date && new Date(s.giornata_date + 'T00:00:00') < today

    const createdStr = new Date(s.created_at).toLocaleString('it-IT', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })

    // Data giornata (per parlay di tipo giornata)
    let dateRefHtml = ''
    if (s.giornata_date) {
      const ggDate  = new Date(s.giornata_date + 'T00:00:00')
      const ggFmt   = ggDate.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      const ggNum   = s.giornata_num ? ` — GG${s.giornata_num}` : ''
      const cls     = isExpired ? 'bet-ctx-date bet-ctx-date--past' : 'bet-ctx-date'
      dateRefHtml   = `<div class="bet-card-context"><span class="${cls}">📅 ${ggFmt}${ggNum}</span></div>`
    }

    // Gambe (legs)
    const legsHtml = legs.map(function (l, i) {
      const lTipo   = BET_LABEL[l.bet_type] || l.bet_type || '?'
      const lPlayer = (l.player_name && l.player_name !== '—') ? escHtml(l.player_name) : ''
      const lLabel  = l.market_label ? `<em class="text-muted"> — ${escHtml(l.market_label)}</em>` : ''
      // Indicatore per la singola gamba
      const legDate   = l.giornata_date || s.giornata_date   // usa data dal leg o dalla parlay
      const legStatus = s.status === 'attiva'
        ? getBetCurrentStatus(l.bet_type, l.player_name, legDate, s.season_id)
        : null
      const legStatusHtml = betCurrentStatusHtml(legStatus)
      return `<div class="bet-leg-row">
        <span class="bet-leg-num">${i + 1}</span>
        <span class="bet-leg-type">${escHtml(lTipo)}</span>
        ${lPlayer ? `<span class="bet-leg-player">🎯 ${lPlayer}</span>` : ''}
        ${lLabel}
        ${legStatusHtml}
        <span class="bet-leg-quota text-muted">×${Number(l.quota).toFixed(2)}</span>
      </div>`
    }).join('')

    const expiredBadge = isExpired ? '<span class="badge badge-expired">⚠ Data passata</span>' : ''
    const cardClass    = isExpired ? 'admin-bet-card admin-bet-card--expired' : 'admin-bet-card'
    const actions      = s.status === 'attiva' ? betActionButtons(s.id, 'multipla') : ''

    // Riepilogo stato gambe (solo scommessa attiva)
    let parlayOverallHtml = ''
    if (s.status === 'attiva' && legs.length > 0) {
      const legStatuses = legs.map(function (l) {
        return getBetCurrentStatus(l.bet_type, l.player_name, l.giornata_date || s.giornata_date, s.season_id)
      })
      const winning = legStatuses.filter(st => st?.cls === 'winning').length
      const losing  = legStatuses.filter(st => st?.cls === 'losing').length
      const total   = legs.length
      if (losing > 0) {
        parlayOverallHtml = `<span class="bet-current-status bet-cur-lose">🔴 ${losing} gamba${losing !== 1 ? 'e' : ''} perdente${losing !== 1 ? 'i' : ''} — schedina a rischio</span>`
      } else if (winning === total && total > 0) {
        parlayOverallHtml = `<span class="bet-current-status bet-cur-win">🟢 Tutte vincenti (${winning}/${total})</span>`
      } else if (winning > 0) {
        parlayOverallHtml = `<span class="bet-current-status bet-cur-pending">⏳ ${winning}/${total} vincenti — in corso</span>`
      }
    }

    return `<div class="${cardClass}" data-id="${escHtml(s.id)}">
      <div class="bet-card-header">
        <span class="bet-card-date">${createdStr}</span>
        <strong class="bet-card-user">${escHtml(user)}</strong>
        <span class="badge badge-bet-type">📋 ${escHtml(panel)}</span>
        <span class="text-muted" style="font-size:0.8rem">${legs.length} gamb${legs.length === 1 ? 'a' : 'e'}</span>
        <div class="bet-card-badges">${betStatusBadge(s.status)}${expiredBadge}</div>
      </div>
      ${dateRefHtml}
      <div class="bet-legs-list">${legsHtml}</div>
      <div class="bet-card-footer">
        <span class="bet-card-amount">${s.importo} 🪙 → <strong>${potWin} 🪙</strong> <span class="text-muted">(×${Number(s.quota_final).toFixed(2)})</span></span>
        ${parlayOverallHtml}
        ${actions ? `<div class="bet-card-actions">${actions}</div>` : ''}
      </div>
    </div>`
  }).join('')

  listEl.innerHTML = summaryHtml + rowsHtml

  const bulkBtn = document.getElementById('btn-mark-parlay-expired-lost')
  if (bulkBtn) {
    bulkBtn.addEventListener('click', async function () {
      if (!confirm(`Segnare ${expiredActive.length} schedin${expiredActive.length === 1 ? 'a' : 'e'} scadut${expiredActive.length === 1 ? 'a' : 'e'} come perse?`)) return
      bulkBtn.disabled = true
      bulkBtn.textContent = 'Elaborazione…'
      let ok = 0, fail = 0
      for (const s of expiredActive) {
        const { data: r, error: e } = await CSLAuth.client.rpc('resolve_parlay', { p_bet_id: s.id, p_status: 'persa' })
        if (e || r?.error) fail++; else ok++
      }
      showMsg('scommesse-success', `✓ ${ok} schedin${ok === 1 ? 'a' : 'e'} segnate come perse${fail ? ` (${fail} errori)` : ''}.`, fail > 0)
      document.getElementById('scommesse-error').hidden = true
      await reloadScommesse()
    })
  }

  attachBetListeners(listEl, 'multipla')
}

function betActionButtons(id, tipo) {
  const sid = escHtml(id)
  return `<button class="btn-vinci btn-bet-action" data-id="${sid}" data-tipo="${tipo}"
    style="background:rgba(73,210,155,0.15);color:var(--success);border:1px solid rgba(73,210,155,0.3);padding:0.2rem 0.6rem;border-radius:4px;cursor:pointer;font-size:0.75rem;font-weight:600">✓ Vinta</button>
  <button class="btn-perdi btn-bet-action" data-id="${sid}" data-tipo="${tipo}"
    style="background:rgba(255,80,80,0.12);color:#ff6060;border:1px solid rgba(255,80,80,0.25);padding:0.2rem 0.6rem;border-radius:4px;cursor:pointer;font-size:0.75rem;font-weight:600">✗ Persa</button>
  <button class="btn-annulla btn-bet-action" data-id="${sid}" data-tipo="${tipo}"
    style="background:rgba(150,150,150,0.1);color:var(--text-muted);border:1px solid rgba(150,150,150,0.2);padding:0.2rem 0.6rem;border-radius:4px;cursor:pointer;font-size:0.75rem">⊘ Ann.</button>`
}

function betStatusBadge(status) {
  const map = {
    attiva:    '<span class="badge badge-attiva-bet">Attiva</span>',
    vinta:     '<span class="badge badge-vinta">Vinta</span>',
    persa:     '<span class="badge badge-persa">Persa</span>',
    annullata: '<span class="badge badge-annullata">Annullata</span>',
  }
  return map[status] || `<span class="badge">${escHtml(status)}</span>`
}

function attachBetListeners(container, tipo) {
  const statusMap = { 'btn-vinci': 'vinta', 'btn-perdi': 'persa', 'btn-annulla': 'annullata' }
  container.querySelectorAll('.btn-bet-action').forEach(function (btn) {
    const newStatus = Object.entries(statusMap).find(([cls]) => btn.classList.contains(cls))?.[1]
    if (!newStatus) return
    btn.addEventListener('click', function () { resolveBet(btn.dataset.id, newStatus, tipo) })
  })
}

async function resolveBet(betId, newStatus, tipo) {
  const label = { vinta: 'vincente', persa: 'persa', annullata: 'annullata' }[newStatus]
  if (!confirm(`Segnare questa ${tipo === 'singola' ? 'scommessa' : 'schedina'} come ${label}?`)) return

  const rpcName = tipo === 'singola' ? 'resolve_bet' : 'resolve_parlay'
  const { data: rpcData, error } = await CSLAuth.client.rpc(rpcName, {
    p_bet_id: betId,
    p_status: newStatus,
  })

  if (error || rpcData?.error) {
    showMsg('scommesse-error', 'Errore: ' + (error?.message || rpcData?.error), true)
    document.getElementById('scommesse-success').hidden = true
    return
  }
  showMsg('scommesse-success', `✓ Segnata come ${newStatus}.`, false)
  document.getElementById('scommesse-error').hidden = true
  await reloadScommesse()
}
