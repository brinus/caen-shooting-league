// CAEN Shooting League — Admin Panel Logic

document.addEventListener('csl:auth-ready', function () {
  if (!CSLAuth.isLoggedIn()) {
    window.location.href = 'login.html?next=' + encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)
    return
  }
  if (!CSLAuth.isAdmin()) {
    document.getElementById('admin-guard').hidden = false
    return
  }
  document.getElementById('admin-content').hidden = false
  initTabs()
  loadGiornateTab()
  loadPostsTab()
  loadRegolamentoTab()
  loadUtentiTab()
  loadStagioniTab()
  loadCommentiTab()
})

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
    .from('profiles').select('username, display_name, role, player_name, created_at').order('created_at')

  if (error) { listEl.textContent = 'Errore: ' + error.message; return }
  if (!data?.length) { listEl.textContent = 'Nessun utente.'; return }

  listEl.innerHTML = data.map(function (u) {
    const roleCls = u.role === 'admin' ? 'badge-admin' : 'badge-participant'
    return `<div class="admin-list-row">
      <strong>${escHtml(u.username)}</strong>
      <span>${escHtml(u.display_name)}</span>
      <span class="badge ${roleCls}">${u.role === 'admin' ? 'Admin' : 'Partecipante'}</span>
      <span class="text-muted">${u.player_name ? escHtml(u.player_name) : '—'}</span>
    </div>`
  }).join('')
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
  const { data } = await CSLAuth.client.from('stagioni').select('id, nome, anno').order('anno').order('numero')
  if (data?.length) seasons = data

  sel.innerHTML = seasons.map(s =>
    `<option value="${escHtml(s.id)}">${escHtml(s.nome)} ${s.anno}</option>`
  ).join('')

  // Pre-seleziona stagione attiva
  const active = seasons.find(s => s.status === 'attiva')
  if (active) sel.value = active.id
}
