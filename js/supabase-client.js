// CAEN Shooting League — Supabase Client + Auth helpers
// Configurare SUPABASE_URL e SUPABASE_ANON_KEY con i valori del proprio progetto Supabase.
// La anon key è pubblica per design (protezione tramite RLS nel DB).

const SUPABASE_URL      = 'https://uerwrizwqdacnboasznc.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlcndyaXp3cWRhY25ib2Fzem5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NjQ0NzUsImV4cCI6MjA5NDM0MDQ3NX0.fx1R_H_RFWH9-HaMpLb-8sobHcGBE4v_gUvr8E_dBrM'

const _supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── Stato sessione ─────────────────────────────────────────────

let _session  = null
let _profile  = null

async function _loadSession() {
  const { data: { session } } = await _supa.auth.getSession()
  _session = session
  if (session) {
    // Non-bloccante: il profilo arriva in background; il ruolo è già nel JWT (app_metadata)
    _supa.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => { _profile = data; _applyAuthUI() })
      .catch(() => {})
  } else {
    _profile = null
  }
}

// ── API pubblica ───────────────────────────────────────────────

const CSLAuth = {

  /** Ritorna la sessione corrente (può essere null se non loggati). */
  getSession() { return _session },

  /** Ritorna il profilo dell'utente loggato (null se non loggati). */
  getProfile() { return _profile },

  /** True se l'utente loggato è admin. */
  isAdmin() {
    // Prima controlla app_metadata nel JWT (disponibile subito, senza fetch DB)
    if (_session?.user?.app_metadata?.user_role === 'admin') return true
    return _profile?.role === 'admin'
  },

  /** True se c'è un utente loggato (qualsiasi ruolo). */
  isLoggedIn() { return !!_session },

  /**
   * Login con username + password.
   * @returns {Promise<{error: string|null}>}
   */
  async signIn(username, password) {
    const email = `${username.trim().toLowerCase()}@csl.local`
    const { data, error } = await _supa.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    _session = data.session
    // Carica il profilo senza bloccare il redirect — verrà ricaricato al page load successivo
    _supa.from('profiles').select('*').eq('id', data.user.id).single()
      .then(({ data: profile }) => { _profile = profile })
      .catch(() => {})
    return { error: null }
  },

  /** Logout. */
  async signOut() {
    await _supa.auth.signOut()
    _session = null
    _profile = null
    window.location.href = 'index.html'
  },

  /**
   * Crea un nuovo account utente (solo admin, via Edge Function).
   * @param {{ username, password, display_name, role?, player_name? }} opts
   * @returns {Promise<{error: string|null, user_id?: string}>}
   */
  async createUser(opts) {
    if (!_session) return { error: 'Non sei autenticato' }
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${_session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(opts),
    })
    const json = await res.json()
    if (!res.ok) return { error: json.error || 'Errore creazione utente' }
    return { error: null, user_id: json.user_id }
  },

  /** Cambia password dell'utente loggato. */
  async updatePassword(newPassword) {
    const { error } = await _supa.auth.updateUser({ password: newPassword })
    return { error: error?.message || null }
  },

  // ── Wallet (Bossoli) ───────────────────────────────────────

  /** Ritorna il saldo del wallet: { base_coins, bet_coins, total }. */
  async getWallet() {
    if (!_session) return { base_coins: 0, bet_coins: 0, total: 0 }
    const { data } = await _supa
      .from('wallets')
      .select('base_coins, bet_coins')
      .eq('profile_id', _session.user.id)
      .single()
    const base = data?.base_coins ?? 0
    const bets = data?.bet_coins  ?? 0
    return { base_coins: base, bet_coins: bets, total: base + bets }
  },

  // ── Scommesse ──────────────────────────────────────────────

  /** Ritorna le scommesse dell'utente loggato. */
  async getBets(seasonId = null) {
    if (!_session) return []
    let q = _supa
      .from('scommesse')
      .select('id, season_id, bet_type, player_name, importo, quota, status, vincita_netta, created_at, resolved_at, giornata_date, giornata_num, market_label')
      .eq('profile_id', _session.user.id)
      .order('created_at', { ascending: false })
    if (seasonId) q = q.eq('season_id', seasonId)
    const { data } = await q
    return data || []
  },

  /**
   * Piazza una scommessa (RPC atomica).
   * @param {object} [opts]  { giornata_date, giornata_num, market_label }
   * @returns {Promise<{success?:boolean, bet_id?:string, new_balance?:number, error?:string}>}
   */
  async placeBet(season_id, bet_type, player_name, importo, quota, opts) {
    if (!_session) return { error: 'Non autenticato' }
    const params = {
      p_season_id:   season_id,
      p_bet_type:    bet_type,
      p_player_name: player_name,
      p_importo:     importo,
      p_quota:       quota,
    }
    if (opts) {
      if (opts.giornata_date != null) params.p_giornata_date = opts.giornata_date
      if (opts.giornata_num  != null) params.p_giornata_num  = opts.giornata_num
      if (opts.market_label  != null) params.p_market_label  = opts.market_label
    }
    const { data, error } = await _supa.rpc('place_bet', params)
    if (error) return { error: error.message }
    return data
  },

  /**
   * Vota (o cambia voto) in un sondaggio di un post.
   */
  async castVote(poll_id, choice_id) {
    if (!_session) return { error: 'Non autenticato' }
    const { data, error } = await _supa.rpc('cast_vote', { p_poll_id: poll_id, p_choice_id: choice_id })
    if (error) return { error: error.message }
    return data
  },

  /**
   * Cancella una scommessa propria entro 1h (e prima che il risultato esista).
   */
  async cancelBet(bet_id) {
    if (!_session) return { error: 'Non autenticato' }
    const { data, error } = await _supa.rpc('cancel_bet', { p_bet_id: bet_id })
    if (error) return { error: error.message }
    return data
  },

  /**
   * Piazza una scommessa multipla (parlay) — richiede 2+ selezioni.
   * @param {string}   seasonId
   * @param {string}   panel        'stagione' | 'giornata' | 'speciali'
   * @param {object[]} legs         array delle singole selezioni
   * @param {number}   importo      Bossoli puntati
   * @param {number}   quotaBase    prodotto delle quote individuali
   * @param {number}   bonusMult    moltiplicatore bonus (es. 1.10)
   * @param {number}   quotaFinal   quotaBase × bonusMult
   * @param {object}   [opts]       { giornata_date, giornata_num }
   */
  async placeParlay(seasonId, panel, legs, importo, quotaBase, bonusMult, quotaFinal, opts = {}) {
    if (!_session) return { error: 'Non autenticato' }
    const { data, error } = await _supa.rpc('place_parlay', {
      p_season_id:    seasonId,
      p_panel:        panel,
      p_legs:         legs,
      p_importo:      importo,
      p_quota_base:   quotaBase,
      p_bonus_mult:   bonusMult,
      p_quota_final:  quotaFinal,
      p_giornata_date: opts.giornata_date || null,
      p_giornata_num:  opts.giornata_num  || null,
    })
    if (error) return { error: error.message }
    return data
  },

  /** Cancella una schedina multipla propria entro 1h. */
  async cancelParlay(bet_id) {
    if (!_session) return { error: 'Non autenticato' }
    const { data, error } = await _supa.rpc('cancel_parlay', { p_bet_id: bet_id })
    if (error) return { error: error.message }
    return data
  },

  /** Ritorna le scommesse multiple dell'utente loggato. */
  async getParlayBets() {
    if (!_session) return []
    const { data } = await _supa
      .from('parlay_bets')
      .select('*')
      .eq('profile_id', _session.user.id)
      .order('created_at', { ascending: false })
    return data || []
  },

  /**
   * Risolve una scommessa (solo admin).
   * @param {string} bet_id  UUID della scommessa
   * @param {'vinta'|'persa'|'annullata'} status
   */
  async resolveBet(bet_id, status) {
    if (!this.isAdmin()) return { error: 'Non autorizzato' }
    const { data, error } = await _supa.rpc('resolve_bet', {
      p_bet_id: bet_id,
      p_status: status,
    })
    if (error) return { error: error.message }
    return data
  },

  /**
   * Sincronizza retroattivamente i wallet di tutti i giocatori (solo admin).
   * base_coins = giornate_giocate × 100
   */
  async syncWallets() {
    if (!this.isAdmin()) return { error: 'Non autorizzato' }
    const { data, error } = await _supa.rpc('sync_all_wallets')
    if (error) return { error: error.message }
    return data
  },

  /** Admin: ritorna tutte le scommesse attive con profilo utente. */
  async getAllActiveBets() {
    if (!this.isAdmin()) return []
    const { data } = await _supa
      .from('scommesse')
      .select('id, profile_id, season_id, bet_type, player_name, importo, quota, status, created_at, profiles(display_name, username)')
      .eq('status', 'attiva')
      .order('created_at', { ascending: false })
    return data || []
  },

  // ── Accesso client Supabase per query dirette ──────────────
  get client() { return _supa },
}

// Inizializza al caricamento
_loadSession().then(() => {
  document.dispatchEvent(new CustomEvent('csl:auth-ready', { detail: { profile: _profile } }))
  _applyAuthUI()
})

// Ascolta cambiamenti sessione
_supa.auth.onAuthStateChange((event, session) => {
  _session = session
  if (session) {
    _supa.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => { _profile = data; _applyAuthUI() })
      .catch(() => {})
  } else {
    _profile = null
  }
  _applyAuthUI()
})

// ── UI dinamica nav ────────────────────────────────────────────

function _applyAuthUI() {
  const placeholder = document.getElementById('nav-auth-placeholder')
  if (!placeholder) return

  if (!CSLAuth.isLoggedIn()) {
    placeholder.innerHTML = `<a href="login.html" class="nav-auth-btn">Accedi</a>`
    return
  }

  const p = CSLAuth.getProfile()
  const name = p?.display_name || p?.username
    || _session?.user?.user_metadata?.display_name
    || _session?.user?.email?.split('@')[0] || '?'
  const adminLink = CSLAuth.isAdmin()
    ? `<a href="admin.html" class="nav-auth-link nav-auth-admin" title="Pannello Admin">⚙ Admin</a>`
    : ''

  placeholder.innerHTML = `
    <div class="nav-auth-user">
      ${adminLink}
      <a href="profilo.html" class="nav-auth-link" title="Il tuo profilo">
        <span class="nav-auth-avatar">${name.charAt(0).toUpperCase()}</span>
        <span class="nav-auth-name">${_escapeHtml(name)}</span>
      </a>
      <button class="nav-auth-btn nav-auth-logout" onclick="CSLAuth.signOut()" title="Logout">⏻</button>
    </div>
  `
}

function _escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

window.CSLAuth = CSLAuth
