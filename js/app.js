// CAEN Shooting League — Main Application JS

// ── Utilities ──────────────────────────────────────────────────

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

function daysUntil(dateStr) {
  const end = new Date(dateStr + 'T23:59:59');
  const now = new Date();
  return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
}

function getCurrentSeason() {
  return CSL.stagioni.find(function(s) { return s.status === 'attiva'; })
      || CSL.stagioni.find(function(s) { return s.status === 'next'; })
      || CSL.stagioni[CSL.stagioni.length - 1];
}

function today() {
  var d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function rankClass(pos) {
  return pos <= 3 ? 'rank-' + pos : 'rank-other';
}

function rankEmoji(pos) {
  return ['🥇', '🥈', '🥉'][pos - 1] || String(pos);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTieAverage(value) {
  return Number(value || 0).toLocaleString('it-IT', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function getSeasonAverage(player) {
  return player && player.media_tiro_spareggio != null
    ? player.media_tiro_spareggio
    : (player && player.media_tiro != null ? player.media_tiro : 0);
}

function getSecondRecord(player) {
  return player && player.secondo_record != null ? player.secondo_record : 0;
}

function compareCampionatoPlayers(a, b) {
  return (b.punti_campionato - a.punti_campionato)
    || (getSeasonAverage(b) - getSeasonAverage(a))
    || (b.punti_tiro - a.punti_tiro)
    || (b.record - a.record)
    || a.nome.localeCompare(b.nome, 'it');
}

function sameCampionatoRank(a, b) {
  return a.punti_campionato === b.punti_campionato
    && getSeasonAverage(a) === getSeasonAverage(b)
    && a.punti_tiro === b.punti_tiro
    && a.record === b.record;
}

function compareCecchiniPlayers(a, b) {
  return (b.record - a.record)
    || (getSeasonAverage(b) - getSeasonAverage(a))
    || (getSecondRecord(b) - getSecondRecord(a))
    || (b.punti_tiro - a.punti_tiro)
    || a.nome.localeCompare(b.nome, 'it');
}

function sameCecchiniRank(a, b) {
  return a.record === b.record
    && getSeasonAverage(a) === getSeasonAverage(b)
    && getSecondRecord(a) === getSecondRecord(b)
    && a.punti_tiro === b.punti_tiro;
}

function getSisalBoards() {
  return (CSL.sisal || []).filter(function(board) {
    return board.players && board.players.length > 0;
  });
}

function resolveSisalBoard(seasonId) {
  var boards = getSisalBoards();
  if (!boards.length) return null;

  if (seasonId && seasonId !== 'all') {
    return boards.find(function(board) { return board.season_id === seasonId; }) || null;
  }

  var activeSeason = getCurrentSeason();
  return boards.find(function(board) {
    return activeSeason && board.season_id === activeSeason.id;
  }) || boards[boards.length - 1];
}

function buildSisalTickerItems(board) {
  if (!board) return [];

  var items = [];
  if (board.next_matchday) {
    var next = board.next_matchday;
    next.highlights.forEach(function(item) {
      items.push({
        tag: 'G' + next.numero,
        market: item.market,
        player: item.player,
        extra: item.label,
        quote: item.quota,
      });
    });
    next.players.slice(0, 5).forEach(function(player) {
      items.push({
        tag: 'G' + next.numero,
        market: 'Vincente',
        player: player.nome,
        extra: 'linea ' + player.expected_score.toFixed(1),
        quote: player.quote_vittoria,
      });
    });
  }

  board.highlights.forEach(function(item) {
    items.push({
      tag: 'Stagione',
      market: item.market,
      player: item.player,
      extra: item.label,
      quote: item.quota,
    });
  });

  board.players.slice(0, 4).forEach(function(player) {
    items.push({
      tag: 'Titolo',
      market: 'Campione',
      player: player.nome,
      extra: 'pos. ' + player.posizione_attuale,
      quote: player.quote_titolo,
    });
  });

  return items;
}

function renderSisalTicker(prefix, seasonId) {
  var sectionEl = document.getElementById(prefix + '-sisal-section');
  var titleEl = document.getElementById(prefix + '-sisal-title');
  var metaEl = document.getElementById(prefix + '-sisal-meta');
  var trackEl = document.getElementById(prefix + '-sisal-ticker');
  if (!trackEl) return;

  var board = resolveSisalBoard(seasonId);
  if (!board) {
    if (sectionEl) sectionEl.style.display = 'none';
    return;
  }
  if (sectionEl) sectionEl.style.display = '';

  var items = buildSisalTickerItems(board);
  if (!items.length) {
    trackEl.innerHTML = '';
    return;
  }

  if (titleEl) {
    titleEl.textContent = 'Lavagna quote — ' + board.season_label;
  }
  if (metaEl) {
    metaEl.textContent = board.next_matchday
      ? 'Focus giornata: G' + board.next_matchday.numero + ' · ' + board.next_matchday.giorno + ' ' + formatDate(board.next_matchday.data)
      : 'Focus mercati stagionali';
  }

  function renderItem(item) {
    return '<div class="sisal-ticker-item">' +
      '<span class="sisal-ticker-tag">' + escapeHtml(item.tag) + '</span>' +
      '<div class="sisal-ticker-copy">' +
        '<span class="sisal-ticker-market">' + escapeHtml(item.market) + '</span>' +
        '<span class="sisal-ticker-player">' + escapeHtml(item.player) + '</span>' +
      '</div>' +
      '<span class="sisal-ticker-extra">' + escapeHtml(item.extra) + '</span>' +
      '<span class="sisal-ticker-quote">' + formatQuote(item.quote) + '</span>' +
    '</div>';
  }

  var setHtml = items.map(renderItem).join('');
  trackEl.innerHTML =
    '<div class="sisal-ticker-set">' + setHtml + '</div>' +
    '<div class="sisal-ticker-set" aria-hidden="true">' + setHtml + '</div>';
}

// ── Navigation ─────────────────────────────────────────────────

function initNav() {
  const filename = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(function(a) {
    if (a.getAttribute('href') === filename) {
      a.classList.add('active');
    }
  });
}

// ── Home Page ──────────────────────────────────────────────────

function initHome() {
  var season = getCurrentSeason();
  if (!season) return;

  // Season banner — sempre riferito alla stagione corrente/prossima
  var el = function(id) { return document.getElementById(id); };
  el('season-name').textContent = season.nome + ' ' + season.anno;
  el('season-dates').textContent = formatDate(season.inizio) + ' — ' + formatDate(season.fine);

  if (season.status === 'next') {
    var daysToStart = daysUntil(season.inizio);
    el('season-countdown').textContent = daysToStart > 0
      ? 'Inizia tra ' + daysToStart + ' giorni'
      : 'Inizia oggi!';
    el('season-countdown').style.color = 'var(--text-muted)';
    var badge = el('season-status-badge');
    if (badge) {
      badge.textContent = 'In arrivo';
      badge.style.background = 'rgba(255,204,0,0.1)';
      badge.style.borderColor = 'rgba(255,204,0,0.3)';
      badge.style.color = 'var(--secondary)';
      badge.style.animation = 'none';
    }
  } else if (season.status === 'attiva') {
    var days = daysUntil(season.fine);
    el('season-countdown').textContent = days > 0 ? days + ' giorni al termine' : 'Ultima giornata!';
  } else {
    el('season-countdown').textContent = 'Stagione conclusa';
    el('season-countdown').style.color = 'var(--text-muted)';
    var badge = el('season-status-badge');
    if (badge) {
      badge.textContent = 'Conclusa';
      badge.style.background = 'rgba(255,102,0,0.1)';
      badge.style.borderColor = 'rgba(255,102,0,0.25)';
      badge.style.color = 'var(--primary)';
      badge.style.animation = 'none';
    }
  }

  // Clic sul banner → classifica
  var banner = document.querySelector('.season-banner');
  if (banner) {
    banner.addEventListener('click', function() {
      window.location.href = 'classifica.html';
    });
  }

  // Recupera recuperi_max dalla stagione corrente (per stats card)
  if (season.classifica && season.classifica.length > 0) {
    var _recMax = season.classifica[0].recuperi_max || 0;
    if (_recMax) CSL._recuperi_max_active = _recMax;
  }

  // Stagione con dati reali: se la corrente è "next" (nessun risultato), usa l'ultima con dati
  var dataSeason = season;
  var showingPast = false;
  if (season.status === 'next' || season.classifica.length === 0) {
    var withData = CSL.stagioni.slice().reverse().find(function(s) {
      return s.classifica && s.classifica.length > 0;
    });
    if (withData) {
      dataSeason = withData;
      showingPast = true;
    }
  }

  // Etichette sezioni: indica la stagione di riferimento se diversa da quella corrente
  var pastLabel = showingPast ? ' <span style="font-weight:400;color:var(--text-muted);font-size:0.7em">(' + dataSeason.nome + ' ' + dataSeason.anno + ')</span>' : '';
  var champsTitle = el('champions-title');
  var podiumTitle = el('podium-title');
  if (champsTitle) champsTitle.innerHTML = '🥇 Titoli della Stagione' + pastLabel;
  if (podiumTitle) podiumTitle.innerHTML = '🏆 Top 3 — Punti Campionato' + pastLabel;

  // Hero stats
  var totalPartite = dataSeason.classifica.reduce(function(s, p) { return s + p.partite; }, 0);
  var records = dataSeason.classifica.map(function(p) { return p.record; });
  var maxRecord = records.length ? Math.max.apply(null, records) : 0;
  el('stat-giocatori').textContent = dataSeason.classifica.length || '—';
  el('stat-partite').textContent = totalPartite || '—';
  el('stat-record').textContent = maxRecord || '—';

  // Podium
  renderPodium(dataSeason.classifica.slice(0, 3));

  // Champions
  renderChampions(dataSeason);

  // Recent posts (latest 3, only published)
  var todayStr = today();
  var recentPosts = CSL.posts.filter(function(p) { return p.data <= todayStr; })
    .sort(function(a, b) { return new Date(b.data) - new Date(a.data); })
    .slice(0, 3);
  renderRecentPosts(recentPosts);

  renderSisalTicker('home', dataSeason.id);
}

function renderPodium(top3) {
  var container = document.getElementById('podium');
  if (!container) return;

  // Visual order: 2nd (left), 1st (center), 3rd (right)
  var order   = top3.length >= 2 ? [top3[1], top3[0], top3[2]] : [top3[0]];
  var classes = top3.length >= 2 ? ['second', 'first', 'third'] : ['first'];

  container.innerHTML = '';

  order.forEach(function(player, idx) {
    if (!player) return;
    var cls = classes[idx];
    var div = document.createElement('div');
    div.className = 'podium-place ' + cls;
    div.innerHTML =
      '<div class="podium-avatar">' + escapeHtml(player.iniziali) + '</div>' +
      '<div class="podium-name">' + escapeHtml(player.nome) + '</div>' +
      '<div class="podium-score">' + player.punti_campionato + ' pt camp.</div>' +
      '<div class="podium-block">' + rankEmoji(player.posizione) + '</div>';
    container.appendChild(div);
  });
}

function renderChampions(season) {
  var container = document.getElementById('champions-row');
  if (!container) return;

  var isPreseason = season.classifica.length === 0;
  if (isPreseason) {
    container.innerHTML =
      '<div class="champ-card champ-card--giornate"><div class="champ-card-label">Campione Giornate</div><div class="champ-card-empty">— In attesa di risultati —</div></div>' +
      '<div class="champ-card champ-card--score"><div class="champ-card-label">🎯 Cecchino della Stagione</div><div class="champ-card-empty">— In attesa di risultati —</div></div>';
    return;
  }

  var champGiornate = season.classifica.slice().sort(compareCampionatoPlayers)[0];

  var champScore = season.classifica.slice().sort(compareCecchiniPlayers)[0];

  var labelConcluded = season.status === 'conclusa' ? '🏆 Campione' : '⚡ Leader';
  var labelSniper    = season.status === 'conclusa' ? '🎯 Cecchino' : '🎯 Miglior Punteggio';

  function champCard(player, type, label, scoreHtml, subText) {
    return '<div class="champ-card champ-card--' + type + '">' +
      '<div class="champ-card-label">' + label + '</div>' +
      '<div class="champ-card-body">' +
        '<div class="champ-avatar">' + escapeHtml(player.iniziali) + '</div>' +
        '<div>' +
          '<div class="champ-info-name">' + escapeHtml(player.nome) + '</div>' +
          '<div class="champ-info-score">' + scoreHtml + '</div>' +
          '<div class="champ-info-sub">' + subText + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  container.innerHTML =
    champCard(
      champGiornate, 'giornate', labelConcluded,
      champGiornate.punti_campionato + ' pt camp.',
      'Punti tiro: ' + champGiornate.punti_tiro + ' &nbsp;·&nbsp; Vittorie: ' + champGiornate.vittorie
    ) +
    champCard(
      champScore, 'score', labelSniper,
      champScore.record + ' / 50',
      'Media: ' + champScore.media_tiro.toFixed(1) + ' &nbsp;·&nbsp; Pt camp.: ' + champScore.punti_campionato
    );
}

function renderRecentPosts(posts) {  var container = document.getElementById('recent-posts');
  if (!container) return;
  container.innerHTML = posts.map(function(p) {
    var tagHtml = p.tag.slice(0, 1).map(function(t) {
      return '<span class="post-tag">' + escapeHtml(t) + '</span>';
    }).join('');
    return '<a class="post-card" href="post.html?slug=' + encodeURIComponent(p.slug) + '">' +
      '<div class="post-meta"><span class="post-date">' + formatDate(p.data) + '</span>' + tagHtml + '</div>' +
      '<div class="post-title">' + escapeHtml(p.titolo) + '</div>' +
      '<div class="post-excerpt">' + escapeHtml(p.excerpt) + '</div>' +
      '<div class="post-read-more">Leggi →</div>' +
      '</a>';
  }).join('');
}

// ── Classifica Page ────────────────────────────────────────────

function initClassifica() {
  var select = document.getElementById('season-select');
  if (!select) return;

  // Populate selector — most recent first
  var sorted = CSL.stagioni.slice().reverse();
  var activeSeason = getCurrentSeason();
  var activeId = activeSeason ? activeSeason.id : (sorted[0] ? sorted[0].id : null);
  sorted.forEach(function(s) {
    var opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.nome + ' ' + s.anno + (s.status === 'attiva' ? ' ★' : '');
    if (s.id === activeId) opt.selected = true;
    select.appendChild(opt);
  });

  select.addEventListener('change', function() {
    renderLeaderboard(select.value);
  });

  // Tab switching (set up once)
  document.querySelectorAll('.lb-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.lb-tab').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var tab = btn.getAttribute('data-tab');
      var camp = document.getElementById('lb-panel-camp');
      var best = document.getElementById('lb-panel-best');
      if (camp) camp.style.display = tab === 'camp' ? '' : 'none';
      if (best) best.style.display = tab === 'best' ? '' : 'none';
    });
  });

  if (activeId) renderLeaderboard(activeId);
}

function renderLeaderboard(seasonId) {
  var season = CSL.stagioni.find(function(s) { return s.id === seasonId; });
  if (!season) return;

  // ── Classifica stagionale ──
  var tbody = document.getElementById('leaderboard-tbody');
  if (tbody) {
    var standings = season.classifica.slice().sort(compareCampionatoPlayers);
    var maxPts = standings[0] ? standings[0].punti_campionato : 1;

    tbody.innerHTML = standings.length
      ? standings.map(function(p) {
          var barPct = maxPts > 0 ? ((p.punti_campionato / maxPts) * 100).toFixed(1) : '0';
          var recUsati = p.recuperi_usati || 0;
          var recMax   = p.recuperi_max   || 0;
          var recHtml  = recMax > 0
            ? '<span class="recupero-counter' + (recUsati > 0 ? ' recupero-counter--used' : '') + '">' + recUsati + '/' + recMax + '</span>'
            : '<span style="color:var(--text-muted)">—</span>';
          return '<tr class="row-clickable" data-player="' + escapeHtml(p.nome) + '" title="Vedi statistiche">' +
            '<td><span class="rank-badge ' + rankClass(p.posizione) + '">' + p.posizione + '</span></td>' +
            '<td class="player-name">' + escapeHtml(p.nome) + '</td>' +
            '<td>' + p.partite + '</td>' +
            '<td><div class="score-bar-wrapper">' +
              '<div class="score-bar-bg"><div class="score-bar-fill" style="width:0" data-w="' + barPct + '%"></div></div>' +
              '<span class="score-value">' + p.punti_campionato + '</span>' +
            '</div></td>' +
            '<td>' + p.punti_tiro + '</td>' +
            '<td>' + formatTieAverage(getSeasonAverage(p)) + '</td>' +
            '<td>' + p.record + '</td>' +
            '<td>' + p.vittorie + '</td>' +
            '<td>' + recHtml + '</td>' +
            '</tr>'
        }).join('')
      : '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:2rem">Nessun risultato ancora.</td></tr>';

    // Animate bars
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        tbody.querySelectorAll('.score-bar-fill').forEach(function(bar) {
          bar.style.width = bar.getAttribute('data-w');
        });
      });
    });
    // Click row → statistiche giocatore
    tbody.querySelectorAll('tr[data-player]').forEach(function(tr) {
      tr.addEventListener('click', function() {
        window.location.href = 'stats.html?player=' + encodeURIComponent(tr.getAttribute('data-player'));
      });
    });
  }

  // ── Classifica Best Score ──
  var tbodyBest = document.getElementById('leaderboard-best-tbody');
  if (tbodyBest) {
    var byRecord = season.classifica.slice().sort(compareCecchiniPlayers);
    var bestPositions = [];
    byRecord.forEach(function(p, idx) {
      if (idx === 0 || !sameCecchiniRank(p, byRecord[idx - 1])) {
        bestPositions.push(idx + 1);
      } else {
        bestPositions.push(bestPositions[idx - 1]);
      }
    });
    var maxRecord = byRecord[0] ? byRecord[0].record : 50;
    tbodyBest.innerHTML = byRecord.length
      ? byRecord.map(function(p, idx) {
          var pos = bestPositions[idx];
          var barPct = maxRecord > 0 ? ((p.record / maxRecord) * 100).toFixed(1) : '0';
          return '<tr class="row-clickable" data-player="' + escapeHtml(p.nome) + '" title="Vedi statistiche">' +
            '<td><span class="rank-badge ' + rankClass(pos) + '">' + pos + '</span></td>' +
            '<td class="player-name">' + escapeHtml(p.nome) + '</td>' +
            '<td><div class="score-bar-wrapper">' +
              '<div class="score-bar-bg"><div class="score-bar-fill score-bar-fill--best" style="width:0" data-w="' + barPct + '%"></div></div>' +
              '<span class="score-value" style="color:var(--secondary)">' + p.record + '</span>' +
            '</div></td>' +
            '<td>' + formatTieAverage(getSeasonAverage(p)) + '</td>' +
            '<td>' + (getSecondRecord(p) > 0 ? getSecondRecord(p) : '—') + '</td>' +
            '<td>' + p.punti_tiro + '</td>' +
            '<td>' + p.partite + '</td>' +
            '<td>' + p.punti_campionato + '</td>' +
            '</tr>';
        }).join('')
      : '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:2rem">Nessun risultato ancora.</td></tr>';

    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        tbodyBest.querySelectorAll('.score-bar-fill--best').forEach(function(bar) {
          bar.style.width = bar.getAttribute('data-w');
        });
      });
    });
    // Click row → statistiche giocatore
    tbodyBest.querySelectorAll('tr[data-player]').forEach(function(tr) {
      tr.addEventListener('click', function() {
        window.location.href = 'stats.html?player=' + encodeURIComponent(tr.getAttribute('data-player'));
      });
    });
  }

  // ── Info stagione ──
  var info = document.getElementById('season-info-text');
  if (info) {
    var statusBadge = '';
    if (season.status === 'attiva') {
      statusBadge = ' &nbsp;<span class="badge-active">Attiva</span>';
    } else if (season.status === 'next') {
      statusBadge = ' &nbsp;<span class="badge-active" style="background:rgba(255,204,0,0.1);border-color:rgba(255,204,0,0.3);color:var(--secondary);animation:none">In arrivo</span>';
    }
    info.innerHTML = season.nome + ' ' + season.anno +
      ' &nbsp;·&nbsp; ' + formatDate(season.inizio) + ' — ' + formatDate(season.fine) +
      statusBadge;
  }

  // ── Classifica giornaliera ──
  renderGiornate(season);
}

function renderGiornate(season) {
  var container = document.getElementById('giornate-container');
  if (!container) return;

  var giornate = season.giornate || [];
  if (!giornate.length) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;padding:1rem 0">Nessuna giornata disputata.</p>';
    return;
  }

  var total = season.giornate_totali || giornate.length;
  container.innerHTML = giornate.map(function(g, idx) {
    var num = g.numero || (giornate.length - idx);
    var rows = g.risultati.map(function(r) {
      var ts = [r.t1, r.t2, r.t3];
      while (ts.length > 0 && ts[ts.length - 1] === -1) { ts.pop(); }
      var tentativi = ts.map(function(v) {
          return '<span class="tentativo' + (v >= 0 && v === r.punteggio && v > 0 ? ' best' : '') + (v === -1 ? ' not-attempted' : '') + '">' + (v === -1 ? '\u2014' : v) + '</span>';
        }).join(' ');
      var recuperoBadge = r.recupero
        ? '<span class="recupero-badge" title="Recupero — giocato il ' + formatDate(r.data_effettiva) + '">R</span>'
        : '';
      return '<tr' + (r.recupero ? ' class="row-recupero"' : '') + '>' +
        '<td><span class="rank-badge ' + rankClass(r.posizione) + '">' + r.posizione + '</span></td>' +
        '<td class="player-name">' + recuperoBadge + escapeHtml(r.nome) + '</td>' +
        '<td>' + tentativi + '</td>' +
        '<td><strong style="color:var(--text)">' + r.punteggio + '</strong></td>' +
        '<td>' + formatTieAverage(r.media_tre_tentativi) + '</td>' +
        '<td>' + r.secondo_miglior_tentativo + '</td>' +
        '<td><span class="camp-pts camp-pts-' + r.punti_campionato + '">' +
          (r.punti_campionato > 0 ? '+' + r.punti_campionato : '\u2014') +
        '</span></td>' +
        '</tr>'
    }).join('');

    return '<div class="giornata-card card" style="margin-bottom:1.25rem">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem">' +
        '<div style="display:flex;align-items:center;gap:0.75rem">' +
          '<span style="font-family:Orbitron,monospace;font-size:0.95rem;color:var(--secondary);letter-spacing:0.05em">G' + num + '<span style="font-size:0.7em;color:var(--text-muted);font-weight:400">/' + total + '</span></span>' +
          '<div>' +
            '<span style="font-family:Orbitron,monospace;font-size:0.82rem;color:var(--primary)">' + escapeHtml(g.giorno) + '</span>' +
            '<span style="color:var(--text-muted);font-size:0.78rem;margin-left:0.6rem">' + formatDate(g.data) + '</span>' +
          '</div>' +
        '</div>' +
        '<span style="font-size:0.75rem;color:var(--text-muted)">' + g.risultati.length + ' giocatori</span>' +
      '</div>' +
      '<div class="table-wrapper">' +
        '<table>' +
          '<thead><tr><th>#</th><th>Giocatore</th><th>Tentativi</th><th>Best</th><th>Media 3T</th><th>2° best</th><th>Camp.</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
  }).join('');
}

// ── Stats Page ─────────────────────────────────────────────────

/**
 * Aggrega le statistiche per giocatore da una lista di stagioni.
 * Ritorna un array di oggetti player con tutti i campi stats.
 */
function buildPlayerStats(seasons) {
  var players = {}; // keyed by nome
  // recuperi_max per giocatore dai dati classifica (per-stagione)
  var playerRecMax = {};

  seasons.forEach(function(season) {
    // Recupera recuperi_max dalla classifica stagionale
    (season.classifica || []).forEach(function(c) {
      if (c.recuperi_max) playerRecMax[c.nome] = c.recuperi_max;
    });
    (season.giornate || []).forEach(function(g) {
      (g.risultati || []).forEach(function(r) {
        var nome = r.nome;
        if (!players[nome]) {
          players[nome] = {
            nome:            nome,
            iniziali:        r.iniziali,
            partite:         0,
            punti_campionato:0,
            punti_tiro:      0,
            vittorie:        0,
            podi:            0,
            record:          0,
            recuperi_usati:  0,
            attempts_all:    [],
            t1_sum: 0, t1_n: 0,
            t2_sum: 0, t2_n: 0,
            t3_sum: 0, t3_n: 0,
            stagioni_ids:    [],
            best_giornata:   null, // { data, punteggio }
            scores_all:      [],   // tutti i best giornalieri per distribuzione
            scores_timeline: [],   // { data, punteggio } ordinati cronologicamente
          };
        }
        var p = players[nome];
        p.partite          += 1;
        p.punti_campionato += r.punti_campionato;
        p.punti_tiro       += r.punteggio;
        if (r.posizione === 1) p.vittorie += 1;
        if (r.posizione <= 3)  p.podi     += 1;
        if (r.punteggio > p.record) {
          p.record        = r.punteggio;
          p.best_giornata = { data: g.data, punteggio: r.punteggio };
        }
        if (r.recupero) p.recuperi_usati = (p.recuperi_usati || 0) + 1;
        p.scores_all.push(r.punteggio);
        [r.t1, r.t2, r.t3].forEach(function(v) {
          if (v >= 0) p.attempts_all.push(v);
        });
        // In timeline usa la data effettiva (reale) per i recuperi
        var timelineDate = (r.recupero && r.data_effettiva) ? r.data_effettiva : g.data;
        p.scores_timeline.push({ data: timelineDate, punteggio: r.punteggio, recupero: r.recupero || false });
        // Attempt averages (-1 = non effettuato, escluso dalla media)
        if (r.t1 >= 0) { p.t1_sum += r.t1; p.t1_n++; }
        if (r.t2 >= 0) { p.t2_sum += r.t2; p.t2_n++; }
        if (r.t3 >= 0) { p.t3_sum += r.t3; p.t3_n++; }
        // Stagioni distinte
        if (p.stagioni_ids.indexOf(season.id) === -1) p.stagioni_ids.push(season.id);
      });
    });
  });

  return Object.values(players).map(function(p) {
    var avg_t1 = p.t1_n ? (p.t1_sum / p.t1_n) : 0;
    var avg_t2 = p.t2_n ? (p.t2_sum / p.t2_n) : 0;
    var avg_t3 = p.t3_n ? (p.t3_sum / p.t3_n) : 0;
    var media_tiro = p.partite ? (p.punti_tiro / p.partite) : 0;
    var attemptsSorted = p.attempts_all.slice().sort(function(a, b) { return b - a; });
    // Consistenza: % giornate sopra la propria media
    var sopra_media = p.scores_all.filter(function(s) { return s >= media_tiro; }).length;
    return {
      nome:            p.nome,
      iniziali:        p.iniziali,
      partite:         p.partite,
      punti_campionato:p.punti_campionato,
      punti_tiro:      p.punti_tiro,
      vittorie:        p.vittorie,
      podi:            p.podi,
      record:          p.record,
      secondo_record:  attemptsSorted[1] || 0,
      media_tiro:      parseFloat(media_tiro.toFixed(1)),
      media_tiro_spareggio: parseFloat(media_tiro.toFixed(3)),
      avg_t1:          parseFloat(avg_t1.toFixed(1)),
      avg_t2:          avg_t2 ? parseFloat(avg_t2.toFixed(1)) : null,
      avg_t3:          avg_t3 ? parseFloat(avg_t3.toFixed(1)) : null,
      win_rate:        p.partite ? parseFloat((p.vittorie / p.partite * 100).toFixed(1)) : 0,
      podio_rate:      p.partite ? parseFloat((p.podi / p.partite * 100).toFixed(1)) : 0,
      consistenza:     p.partite ? parseFloat((sopra_media / p.partite * 100).toFixed(1)) : 0,
      best_giornata:   p.best_giornata,
      recuperi_usati:  p.recuperi_usati || 0,
      recuperi_max:    playerRecMax[p.nome] || 0,
      stagioni_count:  p.stagioni_ids.length,
      scores_timeline: p.scores_timeline.slice().sort(function(a, b) { return a.data < b.data ? -1 : 1; }),
    };
  }).sort(compareCampionatoPlayers);
}

function initStats() {
  var select = document.getElementById('stats-season-select');
  if (!select) return;

  // Seasons con dati, più recente prima, + opzione "Tutte"
  var withData = CSL.stagioni.filter(function(s) {
    return s.giornate && s.giornate.length > 0;
  }).slice().reverse();

  var optAll = document.createElement('option');
  optAll.value = 'all';
  optAll.textContent = 'Tutte le stagioni';
  select.appendChild(optAll);

  withData.forEach(function(s) {
    var opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.nome + ' ' + s.anno + (s.status === 'attiva' ? ' ★' : '');
    select.appendChild(opt);
  });

  var currentView = 'cards';

  // View toggle
  var btnTable = document.getElementById('view-table');
  var btnCards = document.getElementById('view-cards');
  if (btnTable && btnCards) {
    function setView(v) {
      currentView = v;
      btnTable.classList.toggle('active', v === 'table');
      btnCards.classList.toggle('active', v === 'cards');
      renderPlayers();
    }
    btnTable.addEventListener('click', function() { setView('table'); });
    btnCards.addEventListener('click', function() { setView('cards'); });
  }

  function getSeasons() {
    var val = select.value;
    return val === 'all' ? withData : withData.filter(function(s) { return s.id === val; });
  }

  function renderPlayers() {
    var seasons = getSeasons();
    var players = buildPlayerStats(seasons);
    renderStatsSummary(players, seasons);
    renderSisalTicker('stats', select.value);
    if (currentView === 'table') {
      renderStatsTable(players);
    } else {
      renderStatsGrid(players);
    }
    // Scroll + highlight se arrivati da ?player=...
    var urlParams = new URLSearchParams(window.location.search);
    var target = urlParams.get('player');
    if (target && currentView !== 'table') {
      setTimeout(function() {
        document.querySelectorAll('.stat-player-card').forEach(function(card) {
          var nameEl = card.querySelector('.stat-player-name');
          if (nameEl && nameEl.textContent === target) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.add('stat-player-card--highlight');
            setTimeout(function() { card.classList.remove('stat-player-card--highlight'); }, 2800);
          }
        });
      }, 150);
    }
  }

  select.addEventListener('change', renderPlayers);
  renderPlayers();
}

function renderStatsSummary(players, seasons) {
  var container = document.getElementById('stats-summary');
  if (!container) return;

  var totPartite   = players.reduce(function(s, p) { return s + p.partite; }, 0);
  var totGiornate  = seasons.reduce(function(s, season) { return s + (season.giornate || []).length; }, 0);
  var totTentativi = seasons.reduce(function(s, season) {
    return s + (season.giornate || []).reduce(function(sg, g) {
      return sg + (g.risultati || []).reduce(function(sr, r) {
        return sr + [r.t1, r.t2, r.t3].filter(function(v) { return v > 0; }).length;
      }, 0);
    }, 0);
  }, 0);
  var recordAssoluto = players.reduce(function(m, p) { return Math.max(m, p.record); }, 0);
  var recordHolder   = players.find(function(p) { return p.record === recordAssoluto; });
  var avgMedia       = players.length
    ? (players.reduce(function(s, p) { return s + p.media_tiro; }, 0) / players.length).toFixed(1)
    : '—';

  var items = [
    { value: players.length,            label: 'Giocatori' },
    { value: seasons.length,            label: 'Stagioni' },
    { value: totGiornate,               label: 'Giornate' },
    { value: totPartite,                label: 'Partecipazioni' },
    { value: totTentativi,              label: 'Tentativi' },
    { value: recordAssoluto + (recordHolder ? ' / 50' : ''), label: 'Record Assoluto', color: 'var(--secondary)' },
    { value: avgMedia,                  label: 'Media Generale' },
  ];

  container.innerHTML = items.map(function(item) {
    return '<div class="stats-summary-item">' +
      '<div class="stats-summary-value" style="' + (item.color ? 'color:' + item.color : '') + '">' + item.value + '</div>' +
      '<div class="stats-summary-label">' + item.label + '</div>' +
    '</div>';
  }).join('');
}

function renderStatsTable(players) {
  var container = document.getElementById('stats-grid');
  if (!container) return;

  if (!players.length) {
    container.innerHTML = '<p style="color:var(--text-muted);padding:2rem 0">Nessun dato disponibile.</p>';
    return;
  }

  // Colonne: { label, key, getValue }
  // key null = colonna non ordinabile (Media T1›T2›T3)
  var cols = [
    { label: 'Giocatore',     key: 'nome',            getValue: function(p) { return p.nome; } },
    { label: 'Pt Camp.',      key: 'punti_campionato',getValue: function(p) { return p.punti_campionato; } },
    { label: 'Record',        key: 'record',          getValue: function(p) { return p.record; } },
    { label: 'Media',         key: 'media_tiro',      getValue: function(p) { return p.media_tiro; } },
    { label: 'Pt Tiro',       key: 'punti_tiro',      getValue: function(p) { return p.punti_tiro; } },
    { label: 'Vitt.',         key: 'vittorie',        getValue: function(p) { return p.vittorie; } },
    { label: 'Podi',          key: 'podi',            getValue: function(p) { return p.podi; } },
    { label: 'Giornate',      key: 'partite',         getValue: function(p) { return p.partite; } },
    { label: 'Media T1›T2›T3',key: null,              getValue: null },
    { label: 'Win%',          key: 'win_rate',        getValue: function(p) { return p.win_rate; } },
    { label: 'Rec.',          key: 'recuperi_usati',  getValue: function(p) { return p.recuperi_usati; } },
    { label: 'Stagioni',      key: 'stagioni_count',  getValue: function(p) { return p.stagioni_count; } }
  ];

  var sortKey = 'punti_campionato';
  var sortDir = -1; // 1 = asc, -1 = desc

  function comparePlayersByColumn(a, b, key) {
    if (key === 'punti_campionato') return compareCampionatoPlayers(a, b);
    if (key === 'record') return compareCecchiniPlayers(a, b);
    if (key === 'media_tiro') {
      return (getSeasonAverage(b) - getSeasonAverage(a))
        || (b.punti_tiro - a.punti_tiro)
        || (b.record - a.record)
        || compareCampionatoPlayers(a, b);
    }
    if (key === 'punti_tiro') {
      return (b.punti_tiro - a.punti_tiro)
        || (getSeasonAverage(b) - getSeasonAverage(a))
        || (b.record - a.record)
        || compareCampionatoPlayers(a, b);
    }
    if (key === 'vittorie') return (b.vittorie - a.vittorie) || compareCampionatoPlayers(a, b);
    if (key === 'podi') return (b.podi - a.podi) || compareCampionatoPlayers(a, b);
    if (key === 'partite') return (b.partite - a.partite) || compareCampionatoPlayers(a, b);
    if (key === 'win_rate') return (b.win_rate - a.win_rate) || compareCampionatoPlayers(a, b);
    if (key === 'recuperi_usati') return (b.recuperi_usati - a.recuperi_usati) || compareCampionatoPlayers(a, b);
    if (key === 'stagioni_count') return (b.stagioni_count - a.stagioni_count) || compareCampionatoPlayers(a, b);
    if (key === 'nome') return a.nome.localeCompare(b.nome, 'it');

    var col = cols.find(function(c) { return c.key === key; });
    if (!col || !col.getValue) return 0;
    var va = col.getValue(a);
    var vb = col.getValue(b);
    if (typeof va === 'string') return String(va).localeCompare(String(vb), 'it');
    return vb - va;
  }

  function sortedPlayers() {
    var arr = players.slice();
    arr.sort(function(a, b) {
      var cmp = comparePlayersByColumn(a, b, sortKey);
      return sortDir === -1 ? cmp : -cmp;
    });
    return arr;
  }

  function buildRows(sorted) {
    var maxRecord = Math.max.apply(null, sorted.map(function(p) { return p.record; }));
    return sorted.map(function(p) {
      var trendArrow = (p.avg_t3 !== null && p.avg_t1 > 0)
        ? (p.avg_t3 > p.avg_t1 ? '<span style="color:#4caf50">▲</span>' : p.avg_t3 < p.avg_t1 ? '<span style="color:#ef5350">▼</span>' : '<span style="color:var(--text-muted)">–</span>')
        : '';
      var barPct = maxRecord > 0 ? (p.record / maxRecord * 100).toFixed(0) : 0;
      return '<tr>' +
        '<td class="player-name">' +
          '<span style="font-family:Orbitron,monospace;font-size:0.7rem;color:var(--text-muted);margin-right:0.4rem">' + escapeHtml(p.iniziali) + '</span>' +
          escapeHtml(p.nome) +
        '</td>' +
        '<td style="color:var(--primary);font-family:Orbitron,monospace;font-weight:700">' + p.punti_campionato + '</td>' +
        '<td>' +
          '<div class="score-bar-wrapper">' +
            '<div class="score-bar-bg"><div class="score-bar-fill score-bar-fill--best" style="width:0" data-w="' + barPct + '%"></div></div>' +
            '<span class="score-value" style="color:var(--secondary)">' + p.record + '</span>' +
          '</div>' +
        '</td>' +
        '<td>' + formatTieAverage(getSeasonAverage(p)) + '</td>' +
        '<td>' + p.punti_tiro + '</td>' +
        '<td>' + p.vittorie + '</td>' +
        '<td>' + p.podi + '</td>' +
        '<td>' + p.partite + '</td>' +
        '<td style="font-family:monospace;font-size:0.8rem;color:var(--text-muted)">' +
          p.avg_t1 + ' › ' + (p.avg_t2 !== null ? p.avg_t2 : '—') + ' › ' + (p.avg_t3 !== null ? p.avg_t3 : '—') +
          ' ' + trendArrow +
        '</td>' +
        '<td>' + p.win_rate + '%</td>' +
        '<td>' + (p.recuperi_usati > 0
          ? '<span class="recupero-counter recupero-counter--used">' + p.recuperi_usati + '/' + (p.recuperi_max || 4) + '</span>'
          : '<span style="color:var(--text-muted)">0/' + (p.recuperi_max || 4) + '</span>') + '</td>' +
        '<td>' + p.stagioni_count + '</td>' +
      '</tr>';
    }).join('');
  }

  function buildHeader() {
    return cols.map(function(c, i) {
      if (!c.key) return '<th>' + c.label + '</th>';
      var active = sortKey === c.key;
      var arrow = active ? (sortDir === 1 ? ' ↑' : ' ↓') : '';
      return '<th class="th-sort' + (active ? ' th-sort-active' : '') + '" data-col="' + i + '">' +
        c.label + '<span class="th-arrow">' + arrow + '</span></th>';
    }).join('');
  }

  function render() {
    var sorted = sortedPlayers();
    var table = container.querySelector('table');
    if (table) {
      // aggiorna solo header e tbody senza ricostruire il wrapper
      table.querySelector('thead tr').innerHTML = buildHeader();
      table.querySelector('tbody').innerHTML = buildRows(sorted);
    } else {
      container.innerHTML =
        '<div class="table-wrapper">' +
          '<table>' +
            '<thead><tr>' + buildHeader() + '</tr></thead>' +
            '<tbody>' + buildRows(sorted) + '</tbody>' +
          '</table>' +
        '</div>';
    }

    // click su th ordinabili
    container.querySelectorAll('.th-sort').forEach(function(th) {
      th.addEventListener('click', function() {
        var colIdx = parseInt(th.getAttribute('data-col'));
        var key = cols[colIdx].key;
        if (sortKey === key) {
          sortDir = sortDir * -1;
        } else {
          sortKey = key;
          sortDir = key === 'nome' ? 1 : -1;
        }
        render();
      });
    });

    // animazione barre
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        container.querySelectorAll('.score-bar-fill--best').forEach(function(el) {
          el.style.width = el.getAttribute('data-w');
        });
      });
    });
  }

  render();
}

// ── Sparkline SVG ────────────────────────────────────────────
function buildSparkline(timeline) {
  if (!timeline || timeline.length < 2) return '';

  var W = 260, H = 56, PAD = 6;
  var scores = timeline.map(function(t) { return t.punteggio; });
  var minV = Math.min.apply(null, scores);
  var maxV = Math.max.apply(null, scores);
  var range = maxV - minV || 1;

  function px(i) { return PAD + (i / (timeline.length - 1)) * (W - PAD * 2); }
  function py(v) { return (H - PAD) - ((v - minV) / range) * (H - PAD * 2); }

  // Polilinea punti
  var pts = timeline.map(function(t, i) { return px(i) + ',' + py(t.punteggio); }).join(' ');

  // Area sotto la curva (chiusa)
  var areaD = 'M ' + px(0) + ' ' + py(timeline[0].punteggio) + ' ' +
    timeline.slice(1).map(function(t, i) { return 'L ' + px(i + 1) + ' ' + py(t.punteggio); }).join(' ') +
    ' L ' + px(timeline.length - 1) + ' ' + H +
    ' L ' + px(0) + ' ' + H + ' Z';

  // Trend complessivo
  var isUp   = scores[scores.length - 1] > scores[0];
  var isFlat = scores[scores.length - 1] === scores[0];
  var lineColor = isFlat ? 'rgba(255,255,255,0.35)' : (isUp ? '#66bb6a' : '#ef5350');
  var areaId = 'sg' + Math.random().toString(36).slice(2, 8);

  // Cerchietti interattivi (dati in data-* per il tooltip)
  var dots = timeline.map(function(t, i) {
    var cx = px(i).toFixed(1);
    var cy = py(t.punteggio).toFixed(1);
    var isLast = i === timeline.length - 1;
    var dotFill = t.recupero ? '#64b5f6' : (isLast ? lineColor : 'rgba(255,255,255,0.55)');
    return '<circle class="spark-dot' + (isLast ? ' spark-dot--last' : '') + (t.recupero ? ' spark-dot--recupero' : '') + '"' +
      ' cx="' + cx + '" cy="' + cy + '"' +
      ' r="' + (isLast ? 4 : 3) + '"' +
      ' fill="' + dotFill + '"' +
      ' data-date="' + t.data + '" data-score="' + t.punteggio + '" data-recupero="' + (t.recupero ? '1' : '0') + '"/>';
  }).join('');

  return '<svg class="sparkline" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '"' +
    ' aria-hidden="true">' +
    '<defs>' +
      '<linearGradient id="' + areaId + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + lineColor + '" stop-opacity="0.25"/>' +
        '<stop offset="100%" stop-color="' + lineColor + '" stop-opacity="0"/>' +
      '</linearGradient>' +
    '</defs>' +
    '<path class="spark-area" d="' + areaD + '" fill="url(#' + areaId + ')"/>' +
    '<polyline class="spark-line" points="' + pts + '"' +
      ' fill="none" stroke="' + lineColor + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>' +
    dots +
  '</svg>';
}

function renderStatsGrid(players) {
  var container = document.getElementById('stats-grid');
  if (!container) return;

  if (!players.length) {
    container.innerHTML = '<p style="color:var(--text-muted);padding:2rem 0">Nessun dato disponibile.</p>';
    return;
  }

  var maxRecord  = players[0] ? Math.max.apply(null, players.map(function(p) { return p.record; })) : 50;
  var maxPts     = players[0] ? players[0].punti_campionato : 1;

  container.innerHTML = players.map(function(p, idx) {
    var seasonLabel = p.stagioni_count === 1 ? '1 stagione' : p.stagioni_count + ' stagioni';

    // Attempt progression
    var attempts = [
      { label: '1°', val: p.avg_t1 },
      { label: '2°', val: p.avg_t2 },
      { label: '3°', val: p.avg_t3 },
    ].filter(function(a) { return a.val !== null; });

    var attemptHtml = '';
    if (attempts.length > 0) {
      // Trend: primo tentativo vs ultimo
      var trendHtml = '';
      if (attempts.length >= 2) {
        var diff = parseFloat((attempts[attempts.length - 1].val - attempts[0].val).toFixed(1));
        if (diff > 1)       trendHtml = '<span class="attempt-trend attempt-trend--up">↗ +' + diff + '</span>';
        else if (diff < -1) trendHtml = '<span class="attempt-trend attempt-trend--down">↘ ' + diff + '</span>';
        else                trendHtml = '<span class="attempt-trend attempt-trend--flat">→ stabile</span>';
      }
      var bars = attempts.map(function(a, ai) {
        var pct = (a.val / 50 * 100).toFixed(0); // scala fissa 0–50
        var arrow = ai < attempts.length - 1
          ? '<div class="attempt-flow-arrow">›</div>' : '';
        return '<div class="attempt-flow-item">' +
          '<div class="attempt-flow-bar-wrap">' +
            '<div class="attempt-flow-bar-fill attempt-flow-bar-t' + (ai + 1) + '" style="height:0" data-h="' + pct + '%"></div>' +
          '</div>' +
          '<div class="attempt-flow-val">' + a.val + '</div>' +
          '<div class="attempt-flow-lbl">' + a.label + '</div>' +
        '</div>' + arrow;
      }).join('');
      attemptHtml = '<div class="attempt-flow">' +
        '<div class="attempt-flow-header">' +
          '<span class="attempt-flow-title">Progressione tentativi</span>' +
          trendHtml +
        '</div>' +
        '<div class="attempt-flow-scale-hint">media punteggio · scala 0–50</div>' +
        '<div class="attempt-flow-bars">' + bars + '</div>' +
      '</div>';
    }

    // Win/podio rate bars
    var rateHtml = '<div class="stat-rate-row">' +
      '<div class="stat-rate-item">' +
        '<span class="stat-rate-label">Vittorie</span>' +
        '<div class="stat-rate-bar"><div class="stat-rate-fill stat-rate-fill--vittorie" style="width:0" data-w="' + p.win_rate + '%"></div></div>' +
        '<span class="stat-rate-pct">' + p.win_rate + '%</span>' +
      '</div>' +
      '<div class="stat-rate-item">' +
        '<span class="stat-rate-label">Podi</span>' +
        '<div class="stat-rate-bar"><div class="stat-rate-fill stat-rate-fill--podi" style="width:0" data-w="' + p.podio_rate + '%"></div></div>' +
        '<span class="stat-rate-pct">' + p.podio_rate + '%</span>' +
      '</div>' +
    '</div>';

    var bestDay = p.best_giornata
      ? '<span style="font-size:0.68rem;color:var(--text-muted)">il ' + formatDate(p.best_giornata.data) + '</span>'
      : '';

    return '<div class="stat-player-card" data-idx="' + idx + '">' +
      // Header
      '<div class="stat-player-header">' +
        '<div class="stat-player-avatar">' + escapeHtml(p.iniziali) + '</div>' +
        '<div>' +
          '<div class="stat-player-name">' + escapeHtml(p.nome) + '</div>' +
          '<div class="stat-player-seasons">' + seasonLabel + ' &nbsp;·&nbsp; ' + p.partite + ' giornate' +
            (p.recuperi_usati > 0
              ? ' &nbsp;·&nbsp; <span class="recupero-counter recupero-counter--used" title="Recuperi usati">' + p.recuperi_usati + '/' + (p.recuperi_max || 4) + ' recuperi</span>'
              : '') +
          '</div>' +
        '</div>' +
      '</div>' +
      // Numbers grid
      '<div class="stat-numbers">' +
        '<div class="stat-number-item"><div class="stat-number-value highlight-orange">' + p.punti_campionato + '</div><div class="stat-number-label">Pt Camp.</div></div>' +
        '<div class="stat-number-item"><div class="stat-number-value highlight-gold">' + p.record + '</div><div class="stat-number-label">Record</div></div>' +
        '<div class="stat-number-item"><div class="stat-number-value">' + p.media_tiro.toFixed(1) + '</div><div class="stat-number-label">Media</div></div>' +
        '<div class="stat-number-item"><div class="stat-number-value">' + p.vittorie + '</div><div class="stat-number-label">Vittorie</div></div>' +
        '<div class="stat-number-item"><div class="stat-number-value">' + p.podi + '</div><div class="stat-number-label">Podi</div></div>' +
        '<div class="stat-number-item"><div class="stat-number-value">' + p.punti_tiro + '</div><div class="stat-number-label">Pt Tiro</div></div>' +
      '</div>' +
      // Attempt progression
      attemptHtml +
      // Win/podio rate
      rateHtml +
      // Sparkline
      (p.scores_timeline.length >= 2
        ? '<div class="sparkline-wrap">' +
            '<div class="sparkline-title">Andamento punteggi</div>' +
            buildSparkline(p.scores_timeline) +
            '<div class="sparkline-tooltip" style="display:none"></div>' +
          '</div>'
        : '') +
    '</div>';
  }).join('');

  // Animate bars after render
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      container.querySelectorAll('.attempt-flow-bar-fill').forEach(function(el) {
        el.style.height = el.getAttribute('data-h');
      });
      container.querySelectorAll('.stat-rate-fill').forEach(function(el) {
        el.style.width = el.getAttribute('data-w');
      });
    });
  });

  // Tooltip interattivo sui puntini della sparkline
  container.querySelectorAll('.sparkline-wrap').forEach(function(wrap) {
    var tooltip = wrap.querySelector('.sparkline-tooltip');
    wrap.querySelectorAll('.spark-dot').forEach(function(dot) {
      dot.addEventListener('mouseenter', function(e) {
        var d = new Date(dot.getAttribute('data-date') + 'T00:00:00');
        var label = d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
        var recLabel = dot.getAttribute('data-recupero') === '1' ? ' [R]' : '';
        tooltip.textContent = label + recLabel + ' — ' + dot.getAttribute('data-score') + ' pt';
        tooltip.style.display = 'block';
        // posiziona relativo alla wrap
        var wRect = wrap.getBoundingClientRect();
        var dRect = dot.getBoundingClientRect();
        var left = dRect.left - wRect.left + dRect.width / 2;
        tooltip.style.left = Math.min(Math.max(left, 28), wrap.offsetWidth - 28) + 'px';
      });
      dot.addEventListener('mouseleave', function() {
        tooltip.style.display = 'none';
      });
    });
  });
}

// ── Posts Page ─────────────────────────────────────────────────

function initPosts() {
  var container = document.getElementById('posts-grid');
  if (!container) return;
  var filterBar = document.getElementById('posts-filter-bar');
  var filterMeta = document.getElementById('posts-filter-meta');

  var todayStr = today();
  var sorted = CSL.posts.filter(function(p) { return p.data <= todayStr; })
    .sort(function(a, b) { return new Date(b.data) - new Date(a.data); });

  var tags = [];
  var tagCounts = {};
  sorted.forEach(function(post) {
    (post.tag || []).forEach(function(tag) {
      if (!tagCounts[tag]) {
        tagCounts[tag] = 0;
        tags.push(tag);
      }
      tagCounts[tag] += 1;
    });
  });
  tags.sort(function(a, b) { return a.localeCompare(b, 'it'); });

  var params = new URLSearchParams(window.location.search);
  var activeTag = params.get('tag');
  if (activeTag && tags.indexOf(activeTag) === -1) {
    activeTag = null;
  }

  function updateUrl() {
    var nextParams = new URLSearchParams(window.location.search);
    if (activeTag) {
      nextParams.set('tag', activeTag);
    } else {
      nextParams.delete('tag');
    }
    var query = nextParams.toString();
    var nextUrl = window.location.pathname + (query ? '?' + query : '');
    window.history.replaceState({}, '', nextUrl);
  }

  function renderFilters() {
    if (!filterBar) return;

    var filterItems = [{ tag: null, label: 'Tutti', count: sorted.length }].concat(tags.map(function(tag) {
      return { tag: tag, label: tag, count: tagCounts[tag] };
    }));

    filterBar.innerHTML = filterItems.map(function(item) {
      var isActive = item.tag === activeTag || (!item.tag && !activeTag);
      return '<button type="button" class="post-filter-chip' + (isActive ? ' active' : '') + '" data-tag="' + escapeHtml(item.tag || '') + '">' +
        '<span>' + escapeHtml(item.label) + '</span>' +
        '<span class="post-filter-chip-count">' + item.count + '</span>' +
      '</button>';
    }).join('');

    filterBar.querySelectorAll('.post-filter-chip').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var nextTag = btn.getAttribute('data-tag') || null;
        activeTag = nextTag || null;
        updateUrl();
        renderPosts();
      });
    });
  }

  function renderPosts() {
    var filtered = activeTag
      ? sorted.filter(function(post) { return (post.tag || []).indexOf(activeTag) !== -1; })
      : sorted;

    if (filterMeta) {
      filterMeta.textContent = activeTag
        ? filtered.length + ' post su ' + sorted.length + ' · tag attivo: ' + activeTag
        : sorted.length + ' post pubblicati · nessun filtro attivo';
    }

    container.innerHTML = filtered.length
      ? filtered.map(function(p) {
          var tagHtml = (p.tag || []).map(function(t) {
            return '<span class="post-tag">' + escapeHtml(t) + '</span>';
          }).join('');
          return '<a class="post-card" href="post.html?slug=' + encodeURIComponent(p.slug) + '">' +
            '<div class="post-meta"><span class="post-date">' + formatDate(p.data) + '</span>' + tagHtml + '</div>' +
            '<div class="post-title">' + escapeHtml(p.titolo) + '</div>' +
            '<div class="post-excerpt">' + escapeHtml(p.excerpt) + '</div>' +
            '<div class="post-read-more">Leggi →</div>' +
            '</a>';
        }).join('')
      : '<div class="posts-empty-state">Nessun post trovato per il tag selezionato.</div>';

    renderFilters();
  }

  renderPosts();
}

// ── Single Post Page ───────────────────────────────────────────

function initPost() {
  var params = new URLSearchParams(window.location.search);
  var slug = params.get('slug');

  if (!slug) { showPostError('Nessun post specificato.'); return; }

  var post = CSL.posts.find(function(p) { return p.slug === slug; });
  if (!post) { showPostError('Post non trovato.'); return; }

  document.title = post.titolo + ' — CSL';

  var titleEl = document.getElementById('post-title');
  var metaEl  = document.getElementById('post-meta');
  var bodyEl  = document.getElementById('post-content');
  if (!titleEl || !metaEl || !bodyEl) return;

  titleEl.textContent = post.titolo;
  metaEl.innerHTML =
    '<span>' + formatDate(post.data) + '</span>' +
    '<span>di ' + escapeHtml(post.autore) + '</span>' +
    post.tag.map(function(t) { return '<span class="post-tag">' + escapeHtml(t) + '</span>'; }).join('');

  if (typeof marked !== 'undefined') {
    // Configure marked for safe output
    marked.setOptions({ breaks: true });
    bodyEl.innerHTML = marked.parse(post.content);
  } else {
    // Fallback: plain text
    bodyEl.innerHTML = '<pre style="white-space:pre-wrap;font-size:0.9rem;color:var(--text)">' +
      escapeHtml(post.content) + '</pre>';
  }
}

function showPostError(msg) {
  var titleEl = document.getElementById('post-title');
  var bodyEl  = document.getElementById('post-content');
  if (titleEl) titleEl.textContent = 'Errore';
  if (bodyEl)  bodyEl.innerHTML = '<p style="color:var(--text-muted)">' + escapeHtml(msg) + '</p>';
}

// ── SISAL Page ────────────────────────────────────────────────

function formatQuote(value) {
  return Number(value || 0).toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCount(value, singular, plural) {
  return value + ' ' + (value === 1 ? singular : plural);
}

function getSisalTrendClass(trend) {
  return trend === 'Caldo'
    ? 'sisal-chip--hot'
    : trend === 'Freddo'
      ? 'sisal-chip--cold'
      : 'sisal-chip--steady';
}

function initSisal() {
  var select = document.getElementById('sisal-season-select');
  if (!select) return;

  var boards = (CSL.sisal || []).filter(function(board) {
    return board.players && board.players.length > 0;
  });

  if (!boards.length) {
    var tbody = document.getElementById('sisal-player-tbody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem">Quote non disponibili: servono almeno una o due giornate registrate.</td></tr>';
    }
    return;
  }

  var orderedBoards = boards.slice().reverse();
  orderedBoards.forEach(function(board) {
    var option = document.createElement('option');
    option.value = board.season_id;
    option.textContent = board.season_label;
    select.appendChild(option);
  });

  var activeSeason = getCurrentSeason();
  var defaultBoard = boards.find(function(board) {
    return activeSeason && board.season_id === activeSeason.id;
  }) || orderedBoards[0];

  select.value = defaultBoard.season_id;
  select.addEventListener('change', function() {
    renderSisalBoard(select.value);
  });

  renderSisalBoard(defaultBoard.season_id);
}

function renderSisalBoard(seasonId) {
  var board = (CSL.sisal || []).find(function(item) { return item.season_id === seasonId; });
  if (!board) return;

  var progressPct = board.giornate_totali
    ? Math.round((board.giornate_giocate / board.giornate_totali) * 100)
    : 0;

  var titleEl = document.getElementById('sisal-season-title');
  var summaryEl = document.getElementById('sisal-season-summary');
  var progressLabelEl = document.getElementById('sisal-progress-label');
  var progressFillEl = document.getElementById('sisal-progress-fill');
  var highlightsEl = document.getElementById('sisal-highlights');
  var nextTitleEl = document.getElementById('sisal-next-title');
  var nextCopyEl = document.getElementById('sisal-next-copy');
  var nextHighlightsEl = document.getElementById('sisal-next-highlights');
  var nextTbodyEl = document.getElementById('sisal-next-player-tbody');
  var nextSpecialsEl = document.getElementById('sisal-next-specials');
  var tbodyEl = document.getElementById('sisal-player-tbody');
  var specialsEl = document.getElementById('sisal-specials');
  var methodologyEl = document.getElementById('sisal-methodology');

  if (titleEl) titleEl.textContent = board.season_label;
  if (summaryEl) {
    summaryEl.innerHTML =
      '<span>' + board.giornate_giocate + ' giornate giocate su ' + board.giornate_totali + '</span>' +
      '<span>' + board.players.length + ' profili quotati</span>' +
      '<span>Quote decimali puramente decorative</span>';
  }
  if (progressLabelEl) {
    progressLabelEl.textContent = progressPct + '% di stagione modellata';
  }
  if (progressFillEl) {
    progressFillEl.style.width = progressPct + '%';
  }

  if (highlightsEl) {
    highlightsEl.innerHTML = board.highlights.map(function(item) {
      return '<article class="sisal-highlight-card">' +
        '<div class="sisal-highlight-top">' +
          '<span class="sisal-chip">' + escapeHtml(item.label) + '</span>' +
          '<span class="sisal-quote sisal-quote--featured">' + formatQuote(item.quota) + '</span>' +
        '</div>' +
        '<div class="sisal-highlight-market">' + escapeHtml(item.market) + '</div>' +
        '<div class="sisal-highlight-player">' + escapeHtml(item.player) + '</div>' +
        '<p class="sisal-highlight-copy">' + escapeHtml(item.blurb) + '</p>' +
      '</article>';
    }).join('');
  }

  if (nextTitleEl && nextCopyEl && nextHighlightsEl && nextTbodyEl && nextSpecialsEl) {
    if (!board.next_matchday) {
      nextTitleEl.textContent = 'Nessuna prossima giornata in calendario';
      nextCopyEl.textContent = 'Per questa stagione non ci sono altre date future disponibili al momento del push.';
      nextHighlightsEl.innerHTML =
        '<article class="sisal-highlight-card">' +
          '<div class="sisal-highlight-market">Calendario chiuso</div>' +
          '<div class="sisal-highlight-player">Lavagna sospesa</div>' +
          '<p class="sisal-highlight-copy">La sezione prossima giornata si riattiva appena esiste una futura lun/mer ancora valida nel range della stagione.</p>' +
        '</article>';
      nextTbodyEl.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem">Nessuna giornata futura disponibile per questa stagione.</td></tr>';
      nextSpecialsEl.innerHTML = '';
    } else {
      var next = board.next_matchday;
      nextTitleEl.textContent = 'G' + next.numero + ' · ' + next.giorno + ' ' + formatDate(next.data);
      nextCopyEl.textContent = 'Questa sezione viene rigenerata automaticamente sulla prossima lun/mer futura disponibile ogni volta che aggiorni i dati.';
      nextHighlightsEl.innerHTML = next.highlights.map(function(item) {
        return '<article class="sisal-highlight-card">' +
          '<div class="sisal-highlight-top">' +
            '<span class="sisal-chip">' + escapeHtml(item.label) + '</span>' +
            '<span class="sisal-quote sisal-quote--featured">' + formatQuote(item.quota) + '</span>' +
          '</div>' +
          '<div class="sisal-highlight-market">' + escapeHtml(item.market) + '</div>' +
          '<div class="sisal-highlight-player">' + escapeHtml(item.player) + '</div>' +
          '<p class="sisal-highlight-copy">' + escapeHtml(item.blurb) + '</p>' +
        '</article>';
      }).join('');
      nextTbodyEl.innerHTML = next.players.map(function(player) {
        var trendClass = getSisalTrendClass(player.trend);
        var linePct = Math.max(0, Math.min(100, (player.expected_score / 50) * 100)).toFixed(1);
        return '<tr>' +
          '<td class="sisal-table-player-cell">' +
            '<div class="sisal-table-player">' +
              '<a class="sisal-player-link" href="stats.html?player=' + encodeURIComponent(player.nome) + '">' + escapeHtml(player.nome) + '</a>' +
              '<div class="sisal-table-player-meta">' +
                '<span>media ' + player.media_tiro.toFixed(1) + '</span>' +
                '<span>record ' + player.record + '</span>' +
                '<span>linea ' + player.expected_score.toFixed(1) + '</span>' +
              '</div>' +
            '</div>' +
          '</td>' +
          '<td><span class="rank-badge ' + rankClass(player.posizione_attuale) + '">' + player.posizione_attuale + '</span></td>' +
          '<td><span class="sisal-quote">' + formatQuote(player.quote_vittoria) + '</span></td>' +
          '<td><span class="sisal-quote">' + formatQuote(player.quote_podio) + '</span></td>' +
          '<td><span class="sisal-quote">' + formatQuote(player.quote_over_25) + '</span></td>' +
          '<td><span class="sisal-quote">' + formatQuote(player.quote_over_20) + '</span></td>' +
          '<td>' +
            '<div class="sisal-signal">' +
              '<span class="sisal-chip ' + trendClass + '">' + escapeHtml(player.trend) + '</span>' +
              '<div class="sisal-confidence sisal-confidence--line">' +
                '<div class="sisal-confidence-bar"><div class="sisal-confidence-fill" style="width:' + linePct + '%"></div></div>' +
                '<span class="sisal-confidence-value">linea ' + player.expected_score.toFixed(1) + '</span>' +
              '</div>' +
            '</div>' +
          '</td>' +
        '</tr>';
      }).join('');
      nextSpecialsEl.innerHTML = next.specials.map(function(item) {
        return '<article class="sisal-special-card">' +
          '<div class="sisal-special-label">' + escapeHtml(item.label) + '</div>' +
          '<div class="sisal-special-quote">' + formatQuote(item.quota) + '</div>' +
          '<p class="sisal-special-copy">' + escapeHtml(item.note) + '</p>' +
        '</article>';
      }).join('');
    }
  }

  if (tbodyEl) {
    tbodyEl.innerHTML = board.players.map(function(player) {
      var trendClass = getSisalTrendClass(player.trend);
      return '<tr>' +
        '<td class="sisal-table-player-cell">' +
          '<div class="sisal-table-player">' +
            '<a class="sisal-player-link" href="stats.html?player=' + encodeURIComponent(player.nome) + '">' + escapeHtml(player.nome) + '</a>' +
            '<div class="sisal-table-player-meta">' +
              '<span>' + formatCount(player.partite, 'giornata', 'giornate') + '</span>' +
              '<span>media ' + player.media_tiro.toFixed(1) + '</span>' +
              '<span>record ' + player.record + '</span>' +
            '</div>' +
            '<div class="sisal-table-player-note">' + escapeHtml(player.note) + '</div>' +
          '</div>' +
        '</td>' +
        '<td><span class="rank-badge ' + rankClass(player.posizione_attuale) + '">' + player.posizione_attuale + '</span></td>' +
        '<td><span class="sisal-quote">' + formatQuote(player.quote_titolo) + '</span></td>' +
        '<td><span class="sisal-quote">' + formatQuote(player.quote_podio) + '</span></td>' +
        '<td><span class="sisal-quote">' + formatQuote(player.quote_best_30) + '</span></td>' +
        '<td><span class="sisal-quote">' + formatQuote(player.quote_avg_18) + '</span></td>' +
        '<td>' +
          '<div class="sisal-signal">' +
            '<span class="sisal-chip ' + trendClass + '">' + escapeHtml(player.trend) + '</span>' +
            '<div class="sisal-confidence">' +
              '<div class="sisal-confidence-bar"><div class="sisal-confidence-fill" style="width:' + player.confidence + '%"></div></div>' +
              '<span class="sisal-confidence-value">fiducia ' + player.confidence + '%</span>' +
            '</div>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  if (specialsEl) {
    specialsEl.innerHTML = board.specials.map(function(item) {
      return '<article class="sisal-special-card">' +
        '<div class="sisal-special-label">' + escapeHtml(item.label) + '</div>' +
        '<div class="sisal-special-quote">' + formatQuote(item.quota) + '</div>' +
        '<p class="sisal-special-copy">' + escapeHtml(item.note) + '</p>' +
      '</article>';
    }).join('');
  }

  if (methodologyEl) {
    methodologyEl.innerHTML = (board.methodology || []).map(function(item) {
      return '<li>' + escapeHtml(item) + '</li>';
    }).join('');
  }
}

// ── Router ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  initNav();
  var page = window.location.pathname.split('/').pop() || 'index.html';
  switch (page) {
    case 'index.html':
    case '':
      initHome();
      break;
    case 'classifica.html':
      initClassifica();
      break;
    case 'posts.html':
      initPosts();
      break;
    case 'post.html':
      initPost();
      break;
    case 'stats.html':
      initStats();
      break;
    case 'sisal.html':
      initSisal();
      break;
  }
});
