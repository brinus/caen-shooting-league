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

  /** Cambia password di un utente (admin) — usa Edge Function o Supabase Admin API se necessario. */
  async updatePassword(newPassword) {
    const { error } = await _supa.auth.updateUser({ password: newPassword })
    return { error: error?.message || null }
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
