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

function renderStatsAnalysis(players) {
  var el = document.getElementById('stats-analysis-section');
  if (!el || !players || !players.length) { if (el) el.innerHTML = ''; return; }

  // Gather all individual scores
  var allScores = [];
  players.forEach(function(p) {
    p.scores_timeline.forEach(function(s) { allScores.push(s.punteggio); });
  });
  if (allScores.length < 3) { el.innerHTML = ''; return; }

  // ── 1. Distribuzione punteggi (histogram) ─────────────────────────
  var buckets = [
    { label: '0\u20139',   min: 0,  max: 9  },
    { label: '10\u201314', min: 10, max: 14 },
    { label: '15\u201319', min: 15, max: 19 },
    { label: '20\u201324', min: 20, max: 24 },
    { label: '25\u201329', min: 25, max: 29 },
    { label: '30+',   min: 30, max: 99 }
  ];
  var counts  = buckets.map(function(b) {
    return allScores.filter(function(s) { return s >= b.min && s <= b.max; }).length;
  });
  var maxCount = Math.max.apply(null, counts) || 1;
  var bColors  = ['rgba(100,181,246,0.72)', 'rgba(73,210,155,0.65)', 'rgba(73,210,155,0.85)',
                  'rgba(255,204,0,0.78)',   'rgba(255,102,0,0.78)',  'rgba(255,80,80,0.82)'];
  var svgW = 320, svgH = 155, padL = 26, padR = 6, padT = 10, padB = 28;
  var plotW = svgW - padL - padR, plotH = svgH - padT - padB;
  var barW  = plotW / buckets.length;

  var histBars = buckets.map(function(b, i) {
    var bh  = (counts[i] / maxCount) * plotH;
    var x   = padL + i * barW + barW * 0.08;
    var y   = padT + plotH - bh;
    var w   = barW * 0.84;
    var pct = allScores.length ? (counts[i] / allScores.length * 100).toFixed(1) : 0;
    return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(bh, 0).toFixed(1) + '" fill="' + bColors[i] + '" rx="2">' +
        '<title>' + b.label + ': ' + counts[i] + ' risultati (' + pct + '%)</title>' +
      '</rect>' +
      (counts[i] > 0 ? '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (y - 3).toFixed(1) + '" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.5)">' + counts[i] + '</text>' : '') +
      '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (padT + plotH + 14).toFixed(1) + '" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.32)">' + b.label + '</text>';
  }).join('');

  var histYAxis = [0, 0.5, 1].map(function(frac) {
    var val = Math.round(frac * maxCount);
    var gy  = padT + plotH - frac * plotH;
    return '<text x="' + (padL - 3) + '" y="' + (gy + 3).toFixed(1) + '" text-anchor="end" font-size="7" fill="rgba(255,255,255,0.22)">' + val + '</text>' +
      '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (padL + plotW) + '" y2="' + gy.toFixed(1) + '" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>';
  }).join('');

  var chart1Svg = '<svg viewBox="0 0 ' + svgW + ' ' + svgH + '" style="width:100%;height:auto">' +
    histYAxis + histBars + '</svg>';

  // ── 2. Scatter: media_tiro × win_rate (bolla = numero giornate) ───
  var sc2W = 320, sc2H = 200, sc2PL = 34, sc2PR = 12, sc2PT = 10, sc2PB = 28;
  var sc2PlotW = sc2W - sc2PL - sc2PR, sc2PlotH = sc2H - sc2PT - sc2PB;
  var medias2  = players.map(function(p) { return p.media_tiro || 0; });
  var minM2 = Math.max(0, Math.min.apply(null, medias2) - 2), maxM2 = Math.max.apply(null, medias2) + 2;
  var maxParts = Math.max.apply(null, players.map(function(p) { return p.partite || 1; })) || 1;
  var scColors = ['#ffd700','#c0c0c0','#cd7f32','#49d29b','#ff6600','#64b5f6','#ce93d8','#ef9a9a','#a5d6a7','#ffcc80'];

  var sc2Grid = '';
  for (var gi2 = 0; gi2 <= 4; gi2++) {
    var gx2 = sc2PL + (gi2 / 4) * sc2PlotW;
    var gy2 = sc2PT + (gi2 / 4) * sc2PlotH;
    sc2Grid += '<line x1="' + gx2.toFixed(1) + '" y1="' + sc2PT + '" x2="' + gx2.toFixed(1) + '" y2="' + (sc2PT + sc2PlotH) + '" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>';
    sc2Grid += '<line x1="' + sc2PL + '" y1="' + gy2.toFixed(1) + '" x2="' + (sc2PL + sc2PlotW) + '" y2="' + gy2.toFixed(1) + '" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>';
    sc2Grid += '<text x="' + gx2.toFixed(1) + '" y="' + (sc2PT + sc2PlotH + 13) + '" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.25)">' + (minM2 + gi2 * (maxM2 - minM2) / 4).toFixed(0) + '</text>';
    sc2Grid += '<text x="' + (sc2PL - 4) + '" y="' + (gy2 + 3).toFixed(1) + '" text-anchor="end" font-size="7" fill="rgba(255,255,255,0.25)">' + Math.round((1 - gi2 / 4) * 100) + '%</text>';
  }
  var sc2Dots = players.map(function(p, i) {
    var px2  = sc2PL + ((p.media_tiro || 0) - minM2) / (maxM2 - minM2 || 1) * sc2PlotW;
    var py2  = sc2PT + (1 - (p.win_rate || 0) / 100) * sc2PlotH;
    var r2   = 4 + Math.round((p.partite || 1) / maxParts * 5);
    var fill = scColors[Math.min(scColors.length - 1, i)];
    var init = p.iniziali || p.nome.substring(0, 2).toUpperCase();
    return '<circle cx="' + px2.toFixed(1) + '" cy="' + py2.toFixed(1) + '" r="' + r2 + '" fill="' + fill + '" fill-opacity="0.8" stroke="rgba(0,0,0,0.3)" stroke-width="1">' +
        '<title>' + escapeHtml(p.nome) + '\nMedia: ' + (p.media_tiro || 0).toFixed(1) + ' | Win%: ' + (p.win_rate || 0) + '% | Giornate: ' + p.partite + '</title>' +
      '</circle>' +
      '<text x="' + (px2 + r2 + 2).toFixed(1) + '" y="' + (py2 + 3).toFixed(1) + '" font-size="8" fill="rgba(255,255,255,0.48)">' + escapeHtml(init) + '</text>';
  }).join('');
  var chart2Svg = '<svg viewBox="0 0 ' + sc2W + ' ' + sc2H + '" style="width:100%;height:auto">' +
    '<rect x="' + sc2PL + '" y="' + sc2PT + '" width="' + sc2PlotW + '" height="' + sc2PlotH + '" fill="rgba(255,255,255,0.015)" rx="2"/>' +
    sc2Grid + sc2Dots +
    '<text x="' + (sc2PL + sc2PlotW / 2) + '" y="' + (sc2H - 1) + '" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.28)">Media tiro \u2192</text>' +
    '<text x="10" y="' + (sc2PT + sc2PlotH / 2) + '" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.28)" transform="rotate(-90 10 ' + (sc2PT + sc2PlotH / 2) + ')">Win% \u2192</text>' +
  '</svg>';

  // ── 3. Stacked bar: vittorie / altri podi / fuori podio ───────────
  var maxPartite = Math.max.apply(null, players.map(function(p) { return p.partite || 1; })) || 1;
  var chart3Html = players.slice(0, 8).map(function(p) {
    var w1 = (p.vittorie / maxPartite * 100).toFixed(1);
    var w2 = ((p.podi - p.vittorie) / maxPartite * 100).toFixed(1);
    var w3 = ((p.partite - p.podi) / maxPartite * 100).toFixed(1);
    return '<div class="stats-stacked-row">' +
      '<span class="stats-stacked-name">' + escapeHtml(p.nome) + '</span>' +
      '<div class="stats-stacked-bar">' +
        '<div class="stats-stacked-seg stats-stacked-seg--vitt"  style="width:' + w1 + '%" title="Vittorie: ' + p.vittorie + '"></div>' +
        '<div class="stats-stacked-seg stats-stacked-seg--pod"   style="width:' + w2 + '%" title="Altri podi: ' + (p.podi - p.vittorie) + '"></div>' +
        '<div class="stats-stacked-seg stats-stacked-seg--other" style="width:' + w3 + '%" title="Fuori podio: ' + (p.partite - p.podi) + '"></div>' +
      '</div>' +
      '<span class="stats-stacked-val">' + p.vittorie + 'V / ' + p.podi + 'P</span>' +
    '</div>';
  }).join('');
  var chart3Legend =
    '<div class="stats-stacked-legend">' +
      '<span><span class="stats-stacked-dot stats-stacked-dot--vitt"></span>Vittorie</span>' +
      '<span><span class="stats-stacked-dot stats-stacked-dot--pod"></span>Podi</span>' +
      '<span><span class="stats-stacked-dot stats-stacked-dot--other"></span>Fuori podio</span>' +
    '</div>';

  // ── 4. Trend punteggi nel tempo (top 5, SVG polyline) ─────────────
  var trendPlayers = players.slice(0, 5);
  var trendColors  = ['#ffd700', '#c0c0c0', '#cd7f32', '#49d29b', '#ff6600'];
  var dateSet = {};
  players.forEach(function(p) {
    p.scores_timeline.forEach(function(s) { dateSet[s.data] = true; });
  });
  var allDates = Object.keys(dateSet).sort();
  var trendW = 320, trendH = 155, trendPL = 28, trendPR = 8, trendPT = 10, trendPB = 28;
  var trendPlotW = trendW - trendPL - trendPR, trendPlotH = trendH - trendPT - trendPB;
  var trendSvg = '';

  if (allDates.length >= 2) {
    var allSc2 = [];
    players.forEach(function(p) { p.scores_timeline.forEach(function(s) { allSc2.push(s.punteggio); }); });
    var minSc = Math.max(0, Math.min.apply(null, allSc2) - 2), maxSc = Math.max.apply(null, allSc2) + 2;

    var trendGrid = '';
    for (var ti = 0; ti <= 3; ti++) {
      var ty  = trendPT + (ti / 3) * trendPlotH;
      var tyl = Math.round(maxSc - ti * (maxSc - minSc) / 3);
      trendGrid += '<line x1="' + trendPL + '" y1="' + ty.toFixed(1) + '" x2="' + (trendPL + trendPlotW) + '" y2="' + ty.toFixed(1) + '" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>';
      trendGrid += '<text x="' + (trendPL - 3) + '" y="' + (ty + 3).toFixed(1) + '" text-anchor="end" font-size="7" fill="rgba(255,255,255,0.22)">' + tyl + '</text>';
    }
    var trendLines = trendPlayers.map(function(p, pi) {
      var byDate = {};
      p.scores_timeline.forEach(function(s) { byDate[s.data] = s.punteggio; });
      var pts = allDates.map(function(d, di) {
        if (byDate[d] === undefined) return null;
        var px3 = trendPL + (di / (allDates.length - 1)) * trendPlotW;
        var py3 = trendPT + (1 - (byDate[d] - minSc) / (maxSc - minSc || 1)) * trendPlotH;
        return { x: px3, y: py3, sc: byDate[d] };
      }).filter(function(pt) { return pt !== null; });
      if (pts.length < 2) return '';
      var pathD = pts.map(function(pt, pti) {
        return (pti === 0 ? 'M' : 'L') + pt.x.toFixed(1) + ',' + pt.y.toFixed(1);
      }).join(' ');
      return '<path d="' + pathD + '" stroke="' + trendColors[pi] + '" stroke-width="1.5" fill="none" opacity="0.8"/>' +
        pts.map(function(pt) {
          return '<circle cx="' + pt.x.toFixed(1) + '" cy="' + pt.y.toFixed(1) + '" r="2.5" fill="' + trendColors[pi] + '" fill-opacity="0.9"><title>' + escapeHtml(p.nome) + ': ' + pt.sc + '</title></circle>';
        }).join('');
    }).join('');
    var xLabels = [0, Math.floor((allDates.length - 1) / 2), allDates.length - 1].map(function(ii) {
      if (ii < 0 || ii >= allDates.length) return '';
      var x3 = trendPL + (ii / (allDates.length - 1)) * trendPlotW;
      var d   = new Date(allDates[ii] + 'T00:00:00');
      return '<text x="' + x3.toFixed(1) + '" y="' + (trendPT + trendPlotH + 13) + '" text-anchor="middle" font-size="7" fill="rgba(255,255,255,0.25)">' + d.getDate() + '/' + (d.getMonth() + 1) + '</text>';
    }).join('');
    trendSvg = '<svg viewBox="0 0 ' + trendW + ' ' + trendH + '" style="width:100%;height:auto">' +
      '<rect x="' + trendPL + '" y="' + trendPT + '" width="' + trendPlotW + '" height="' + trendPlotH + '" fill="rgba(255,255,255,0.015)" rx="2"/>' +
      trendGrid + trendLines + xLabels + '</svg>';
  } else {
    trendSvg = '<p style="font-size:0.78rem;color:var(--text-muted);padding:1rem 0">Dati insufficienti per il grafico di tendenza.</p>';
  }
  var trendLegendHtml = '<div class="stats-trend-legend">' +
    trendPlayers.map(function(p, pi) {
      return '<span class="stats-trend-legend-item"><span style="display:inline-block;width:14px;height:2px;background:' + trendColors[pi] + ';vertical-align:middle;border-radius:1px;margin-right:4px"></span>' + escapeHtml(p.nome) + '</span>';
    }).join('') +
  '</div>';

  // ── 5. Statistiche descrittive (tabella) ──────────────────────────
  var statsRows = players.map(function(p) {
    var scores = p.scores_timeline.map(function(s) { return s.punteggio; });
    var n = scores.length || 1;
    var mean = scores.reduce(function(a, b) { return a + b; }, 0) / n;
    var variance = scores.reduce(function(acc, s) { return acc + Math.pow(s - mean, 2); }, 0) / n;
    var stdDev = Math.sqrt(variance).toFixed(1);
    var sorted2 = scores.slice().sort(function(a, b) { return a - b; });
    var median = sorted2.length % 2 === 0
      ? ((sorted2[sorted2.length / 2 - 1] + sorted2[sorted2.length / 2]) / 2).toFixed(1)
      : sorted2[Math.floor(sorted2.length / 2)].toFixed(1);
    return '<tr>' +
      '<td>' + escapeHtml(p.nome) + '</td>' +
      '<td>' + mean.toFixed(1) + '</td>' +
      '<td>' + stdDev + '</td>' +
      '<td>' + median + '</td>' +
      '<td>' + (scores.length ? Math.min.apply(null, scores) : '\u2014') + '</td>' +
      '<td>' + (scores.length ? Math.max.apply(null, scores) : '\u2014') + '</td>' +
      '<td>' + p.consistenza + '%</td>' +
    '</tr>';
  }).join('');
  var statsTable = '<div class="table-wrapper">' +
    '<table><thead><tr>' +
      '<th>Giocatore</th><th>Media</th><th>Dev.Std.</th><th>Mediana</th><th>Min</th><th>Max</th><th>Costanza</th>' +
    '</tr></thead><tbody>' + statsRows + '</tbody></table>' +
  '</div>';

  // ── Assemble ──────────────────────────────────────────────────────
  el.innerHTML =
    '<div class="stats-analysis-header">' +
      '<span class="stats-analysis-icon">\ud83d\udd2c</span>' +
      '<div>' +
        '<div class="stats-analysis-kicker">Analisi statistica approfondita</div>' +
        '<div class="stats-analysis-title">Indagini & Grafici</div>' +
      '</div>' +
    '</div>' +
    '<div class="stats-analysis-body">' +
      '<div class="stats-analysis-grid">' +
        '<div class="stats-analysis-card">' +
          '<div class="stats-analysis-card-title">\ud83d\udcca Distribuzione punteggi</div>' +
          '<div class="stats-analysis-card-sub">Frequenza dei risultati \u2014 tutte le stagioni selezionate (' + allScores.length + ' risultati)</div>' +
          chart1Svg +
        '</div>' +
        '<div class="stats-analysis-card">' +
          '<div class="stats-analysis-card-title">\u2726 Media \u00d7 Win rate</div>' +
          '<div class="stats-analysis-card-sub">Dimensione bolla = numero giornate disputate</div>' +
          chart2Svg +
        '</div>' +
      '</div>' +
      '<div class="stats-analysis-grid">' +
        '<div class="stats-analysis-card">' +
          '<div class="stats-analysis-card-title">\ud83c\udfc5 Vittorie & Podi</div>' +
          '<div class="stats-analysis-card-sub">Composizione dei risultati per giocatore (top 8)</div>' +
          chart3Legend + chart3Html +
        '</div>' +
        '<div class="stats-analysis-card">' +
          '<div class="stats-analysis-card-title">\ud83d\udcc8 Trend punteggi nel tempo</div>' +
          '<div class="stats-analysis-card-sub">Top 5 per campionato \u2014 andamento sessione per sessione</div>' +
          trendSvg + trendLegendHtml +
        '</div>' +
      '</div>' +
      '<div class="stats-analysis-card stats-analysis-card--full">' +
        '<div class="stats-analysis-card-title">\ud83d\udcd0 Statistiche descrittive</div>' +
        '<div class="stats-analysis-card-sub">Media, deviazione standard, mediana, minimo, massimo e costanza per giocatore</div>' +
        statsTable +
      '</div>' +
    '</div>';
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
    renderStatsAnalysis(players);
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
      // Mini radar
      '<div class="stats-radar-mini">' +
        '<div class="stats-radar-title">Profilo giocatore</div>' +
        '<canvas class="stats-radar-canvas" width="200" height="160"></canvas>' +
      '</div>' +
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
      container.querySelectorAll('.stat-player-card').forEach(function(card, idx) {
        if (players[idx]) _drawStatsRadar(card, players[idx], players);
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

  // Cerca prima in Supabase (CSL.posts già aggiornato dal router), poi nel fallback
  var post = CSL.posts.find(function(p) { return p.slug === slug; });

  if (!post) {
    // Tentativo diretto su Supabase se attivo
    if (_supabaseActive()) {
      CSLAuth.client.from('posts').select('*').eq('slug', slug).single()
        .then(function(res) {
          if (res.data) {
            var p = res.data;
            _renderPost({
              id:      p.id,
              slug:    p.slug,
              titolo:  p.titolo,
              data:    p.data,
              autore:  p.autore || '',
              tag:     p.tags || [],
              excerpt: p.excerpt || '',
              content: p.content || '',
            });
          } else {
            showPostError('Post non trovato.');
          }
        })
        .catch(function() { showPostError('Post non trovato.'); });
    } else {
      showPostError('Post non trovato.');
    }
    return;
  }

  _renderPost(post);
}

function _renderPost(post) {
  document.title = post.titolo + ' — CSL';

  var titleEl = document.getElementById('post-title');
  var metaEl  = document.getElementById('post-meta');
  var bodyEl  = document.getElementById('post-content');
  if (!titleEl || !metaEl || !bodyEl) return;

  titleEl.textContent = post.titolo;
  metaEl.innerHTML =
    '<span>' + formatDate(post.data) + '</span>' +
    '<span>di ' + escapeHtml(post.autore) + '</span>' +
    (post.tag || []).map(function(t) { return '<span class="post-tag">' + escapeHtml(t) + '</span>'; }).join('');

  if (typeof marked !== 'undefined') {
    marked.setOptions({ breaks: true });
    bodyEl.innerHTML = marked.parse(post.content);
  } else {
    bodyEl.innerHTML = '<pre style="white-space:pre-wrap;font-size:0.9rem;color:var(--text)">' +
      escapeHtml(post.content) + '</pre>';
  }

  // Emette evento per il pulsante admin "Modifica post"
  if (post.id) {
    document.dispatchEvent(new CustomEvent('csl:post-loaded', { detail: { postId: post.id } }));
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

// ── Live SISAL Odds Engine ─────────────────────────────────────────────────

/** Normal CDF (Abramowitz & Stegun approximation) */
function _normCDF(x) {
  var t = 1 / (1 + 0.2316419 * Math.abs(x));
  var poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  var pdf = Math.exp(-0.5 * x * x) / 2.5066282746310002;
  var cdf = 1 - pdf * poly;
  return x >= 0 ? cdf : 1 - cdf;
}

/** Convert probability to decimal odds with bookmaker margin */
function _probToOdds(p, margin) {
  return Math.round(Math.max(1.02, (margin || 1.08) / Math.max(0.005, p)) * 100) / 100;
}

/** Compute CSS class for quote color-coding */
function getSisalQuoteClass(q) {
  if (q < 2.0)  return 'sisal-quote--fav';
  if (q < 4.0)  return 'sisal-quote--mid';
  if (q < 10.0) return 'sisal-quote--long';
  return 'sisal-quote--extreme';
}

/** Find the next matchday (Mon or Wed) after the last played giornata.
 *  If static data is stale (last played date is in the past), skips forward
 *  to the next future matchday and adjusts the giornata number. */
function _findSisalNextMatchday(stagione) {
  var giornate = stagione.giornate || [];
  if (!giornate.length) return null;
  var sortedAll   = giornate.slice().sort(function(a, b) { return a.data.localeCompare(b.data); });
  // Consider only played giornate (have risultati) when deciding next number/date
  var played = giornate.filter(function(g) { return g && g.risultati && g.risultati.length; });
  var planned = (stagione._plannedGiornate || []).filter(function(g) { return g && g.data; })
    .sort(function(a, b) {
      var an = a.numero || 0, bn = b.numero || 0;
      return an !== bn ? an - bn : a.data.localeCompare(b.data);
    });
  var lastData = null;
  var nextNum  = 1;
  var DAYS     = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

  if (played.length) {
    var sortedPlayed = played.slice().sort(function(a, b) { return a.data.localeCompare(b.data); });
    lastData = sortedPlayed[sortedPlayed.length - 1].data;
    nextNum  = Math.max.apply(null, played.map(function(g){ return g.numero || 0; })) + 1;
  } else {
    lastData = sortedAll[sortedAll.length - 1].data;
    nextNum  = Math.max.apply(null, giornate.map(function(g){ return g.numero || 0; })) + 1;
  }
  // Prefer explicit planned calendar from DB when available.
  // This allows moving a giornata to a non-standard day (e.g. Friday) from admin.
  if (planned.length) {
    var todayStr = (function() {
      var t = new Date();
      t.setHours(0, 0, 0, 0);
      return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
    })();
    var plannedNext = planned.find(function(g) { return (g.numero || 0) >= nextNum; })
      || planned.find(function(g) { return g.data >= todayStr; });
    if (plannedNext) {
      var pd = new Date(plannedNext.data + 'T00:00:00');
      return {
        numero: plannedNext.numero || nextNum,
        data: plannedNext.data,
        giorno: DAYS[pd.getDay()]
      };
    }
  }

  // Start from day after lastData; if that's in the past, advance to today
  // (accounts for stale static data that doesn't include recent matchdays)
  var afterLast = new Date(lastData + 'T00:00:00');
  afterLast.setDate(afterLast.getDate() + 1);
  var todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
  var start = afterLast > todayDate ? afterLast : new Date(todayDate);

  // Count Mon/Wed days we're skipping over to correctly compute nextNum
  var scan = new Date(afterLast);
  while (scan < start) {
    var sdow = scan.getDay();
    if (sdow === 1 || sdow === 3) nextNum++;
    scan.setDate(scan.getDate() + 1);
  }

  var d = new Date(start);
  for (var i = 0; i < 14; i++) {
    var dow = d.getDay();
    if (dow === 1 || dow === 3) {
      var dateStr = d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
      if (stagione.fine && dateStr > stagione.fine) return null;
      return { numero: nextNum, data: dateStr, giorno: DAYS[dow] };
    }
    d.setDate(d.getDate() + 1);
  }
  return null;
}

/** Box-Muller transform: single sample from N(mu, sigma) */
function _randNorm(mu, sigma) {
  var u1 = Math.random(), u2 = Math.random();
  var z  = Math.sqrt(-2 * Math.log(Math.max(1e-10, u1))) * Math.cos(2 * Math.PI * u2);
  return mu + sigma * z;
}

/**
 * Monte Carlo season simulation.
 * Simulates N_SIM full seasons from the current standings.
 * Sigma per player: (record - media) / sqrt(2*ln(k)), floor 3, cap 9.
 * Mean shrunk toward league average (prior_k=3) to handle small-sample players.
 * Championship points by giornata rank: [10,8,6,4,4,2,2,1,1,1,0,...].
 * Returns per-player { pTitolo, pPodio, pTop5, pBest30, pAvg18 }.
 */
function _runMonteCarlo(classifica, giornate, giocate, totali, N_SIM) {
  var n       = classifica.length;
  var rimaste = Math.max(0, totali - giocate);
  var PTS     = [10, 8, 6, 4, 4, 2, 2, 1, 1, 1];

  var medias  = classifica.map(function(p) { return p.media_tiro  || 0; });
  var sigmas  = classifica.map(function(p) {
    var k   = Math.max(2, p.partite || giocate);
    var z_k = Math.sqrt(2 * Math.log(k));
    return Math.min(9, Math.max(3.0, ((p.record || 0) - (p.media_tiro || 0)) / z_k));
  });
  var gPlayed = classifica.map(function(p) { return p.partite || giocate; });
  var curPts  = classifica.map(function(p) { return p.punti_campionato || 0; });
  var curSums = medias.map(function(m, i) { return m * gPlayed[i]; });

  // Build per-player historical scores from provided giornate (chronological)
  var nameIndex = Object.create(null);
  classifica.forEach(function(p, i) { nameIndex[p.nome] = i; });
  var histories = new Array(n);
  for (var i = 0; i < n; i++) histories[i] = [];
  if (Array.isArray(giornate) && giornate.length) {
    // iterate oldest -> newest to keep chronological order
    for (var gi = giornate.length - 1; gi >= 0; gi--) {
      var gday = giornate[gi];
      if (!gday || !gday.risultati) continue;
      for (var ri = 0; ri < gday.risultati.length; ri++) {
        var r = gday.risultati[ri];
        var idx = nameIndex[r.nome];
        if (typeof idx !== 'undefined') histories[idx].push(Number(r.punteggio) || 0);
      }
    }
  }

  // Bayesian shrinkage: pull mean toward league average for players with few games.
  // adjMedia = (k * media + PRIOR_K * leagueMean) / (k + PRIOR_K)
  // With PRIOR_K=3 a player needs ~6 games before their own mean dominates (75%).
  var PRIOR_K    = 3;
  var leagueMean = medias.reduce(function(s, m) { return s + m; }, 0) / Math.max(1, n);
  var adjMedias  = classifica.map(function(p, i) {
    var k = Math.max(1, p.partite || giocate);
    return (k * medias[i] + PRIOR_K * leagueMean) / (k + PRIOR_K);
  });

  // Season already over: deterministic result
  if (rimaste === 0) {
    var ord0 = curPts.map(function(_, i) { return i; })
                     .sort(function(a, b) { return curPts[b] !== curPts[a] ? curPts[b] - curPts[a] : curSums[b] - curSums[a]; });
    return classifica.map(function(_, i) {
      var rank = ord0.indexOf(i);
      return { pTitolo: rank===0?1:0, pPodio: rank<3?1:0, pTop5: rank<5?1:0,
               pBest30: (classifica[i].record||0)>=30?1:0,
               pAvg18:  (classifica[i].media_tiro||0)>=18?1:0 };
    });
  }

  var cntTitolo = new Array(n).fill(0);
  var cntPodio  = new Array(n).fill(0);
  var cntTop5   = new Array(n).fill(0);
  var cntBest30 = new Array(n).fill(0);
  var cntAvg18  = new Array(n).fill(0);
  var posCounts = new Array(n);
  for (var i = 0; i < n; i++) posCounts[i] = new Array(n).fill(0);
  var orderMap = Object.create(null);

  // Pre-allocate to avoid GC pressure in the hot loop
  var simPts    = new Array(n);
  var simSums   = new Array(n);
  var hitBest30 = new Array(n);
  var scores    = new Array(n);
  var order     = new Array(n);

  for (var s = 0; s < N_SIM; s++) {
    for (var i = 0; i < n; i++) {
      simPts[i]    = curPts[i];
      simSums[i]   = curSums[i];
      hitBest30[i] = false;
    }

    // copy histories for this simulation so simulated days feed future predictions
    var simHist = new Array(n);
    for (var i = 0; i < n; i++) simHist[i] = histories[i] ? histories[i].slice() : [];

    for (var g = 0; g < rimaste; g++) {
      // For each player, predict expected score for this future giornata using a simple linear fit
      for (var i = 0; i < n; i++) {
        var hist = simHist[i] || [];
        var m = hist.length;
        var expected = adjMedias[i];
        var sigmaVal = sigmas[i];

        // Use last up to 5 scores for fit if available
        var window = m > 5 ? hist.slice(m - 5) : hist.slice();
        if (window.length >= 2) {
          // linear regression y ~ a + b*t  (t = 0..L-1)
          var L = window.length;
          var sumT = 0, sumY = 0;
          for (var tt = 0; tt < L; tt++) { sumT += tt; sumY += window[tt]; }
          var meanT = sumT / L, meanY = sumY / L;
          var cov = 0, varT = 0;
          for (var tt2 = 0; tt2 < L; tt2++) { cov += (tt2 - meanT) * (window[tt2] - meanY); varT += (tt2 - meanT) * (tt2 - meanT); }
          var slope = varT > 0 ? cov / varT : 0;
          var intercept = meanY - slope * meanT;
          expected = intercept + slope * L; // predict next index
          // compute sample stddev for window
          var sumSq = 0;
          for (var tt3 = 0; tt3 < L; tt3++) sumSq += Math.pow(window[tt3] - meanY, 2);
          var sdev = Math.sqrt(Math.max(0, sumSq / Math.max(1, L - 1)));
          if (!isFinite(sdev) || sdev < 1.5) sdev = sigmaVal;
          sigmaVal = sdev;
        } else if (window.length === 1) {
          expected = window[0];
          sigmaVal = Math.max(sigmaVal * 0.9, 2.5);
        } else {
          // no history: fall back to adjusted mean
          expected = adjMedias[i];
          sigmaVal = sigmas[i];
        }

        // clamp expected
        expected = Math.max(0, Math.min(50, expected));

        var sc = Math.round(Math.min(50, Math.max(0, _randNorm(expected, sigmaVal))));
        scores[i] = sc;
        simSums[i] += sc;
        if (sc >= 30) hitBest30[i] = true;

        // push simulated score so next future day uses it in fit
        simHist[i].push(sc);
      }

      // Rank by score desc, tiebreak by cumulative score
      for (var i = 0; i < n; i++) order[i] = i;
      order.sort(function(a, b) {
        return scores[b] !== scores[a] ? scores[b] - scores[a] : simSums[b] - simSums[a];
      });
      for (var r = 0; r < n; r++) simPts[order[r]] += (PTS[r] || 0);
    }
    // Final championship standings
    for (var i = 0; i < n; i++) order[i] = i;
    order.sort(function(a, b) {
      return simPts[b] !== simPts[a] ? simPts[b] - simPts[a] : simSums[b] - simSums[a];
    });
    for (var r2 = 0; r2 < n; r2++) {
      var fi = order[r2];
      // record position frequency for matrix
      posCounts[fi][r2]++;
      if (r2 === 0) cntTitolo[fi]++;
      if (r2 < 3)  cntPodio[fi]++;
      if (r2 < 5)  cntTop5[fi]++;
    }
    for (var i = 0; i < n; i++) {
      if (hitBest30[i]) cntBest30[i]++;
      if (simSums[i] / (gPlayed[i] + rimaste) >= 18) cntAvg18[i]++;
    }
    // serialize order to key and count
    var key = order.join('|');
    orderMap[key] = (orderMap[key] || 0) + 1;
  }
  // build per-player probabilities
  var perPlayer = classifica.map(function(_, i) {
    return {
      pTitolo: Math.max(0.001, cntTitolo[i] / N_SIM),
      pPodio:  Math.max(0.005, cntPodio[i]  / N_SIM),
      pTop5:   Math.max(0.010, cntTop5[i]   / N_SIM),
      pBest30: Math.max(0.005, cntBest30[i] / N_SIM),
      pAvg18:  Math.max(0.005, cntAvg18[i]  / N_SIM)
    };
  });

  // top orders
  var orders = Object.keys(orderMap).map(function(k) { return { key: k, cnt: orderMap[k] }; });
  orders.sort(function(a, b) { return b.cnt - a.cnt; });
  var topOrders = orders.slice(0, 10).map(function(o) {
    return { order: o.key.split('|').map(function(x) { return parseInt(x, 10); }), count: o.cnt, pct: Math.round(1000 * o.cnt / N_SIM) / 10 };
  });

  return { perPlayer: perPlayer, posMatrix: posCounts, topOrders: topOrders, sims: N_SIM };
}

/**
 * Compute a full SISAL board from live CSL.stagioni data.
 * Returns a board object in the same shape as CSL.sisal entries.
 * @param {object} stagione - One entry from CSL.stagioni
 * @param {object|null} staticBoard - Corresponding CSL.sisal entry for fallback data
 */
function computeLiveSisalBoard(stagione, staticBoard) {
  if (!stagione || !stagione.classifica || !stagione.classifica.length) return staticBoard || null;

  var classifica  = stagione.classifica;
  var giornateAll = stagione.giornate || [];
  // consider only played giornate (those with risultati) for giocate / histories
  var giornate     = giornateAll.filter(function(g) { return g && g.risultati && g.risultati.length; });
  var giocate      = giornate.length;
  var totali      = stagione.giornate_totali || 26;
  var rimaste     = Math.max(0, totali - giocate);
  var MARGIN  = 1.08;

  // ── Monte Carlo season simulation (5 000 runs) ────────────────────
  var mc = _runMonteCarlo(classifica, giornate, giocate, totali, 5000);
  var mcPerPlayer = (mc && mc.perPlayer) ? mc.perPlayer : [];

  // ── Per-player season odds (from Monte Carlo) ─────────────────────
  var players = classifica.map(function(p, i) {
    var probs   = mcPerPlayer[i] || { pTitolo:0.001, pPodio:0.02, pTop5:0.05, pBest30:0.01, pAvg18:0.01 };
    var pT      = probs.pTitolo;
    var pPodio  = probs.pPodio;
    var pTop5   = probs.pTop5;
    var pBest30 = probs.pBest30;
    var pAvg18  = probs.pAvg18;

    // Trend: use static board data if available, else derive
    var staticP = staticBoard && staticBoard.players
      ? staticBoard.players.find(function(sp) { return sp.nome === p.nome; })
      : null;
    var trend = staticP ? staticP.trend
      : ((p.vittorie || 0) >= 2 ? 'Caldo'
        : (p.media_tiro || 0) < 12 ? 'Freddo' : 'Stabile');

    var confidence = Math.min(90, 65 + Math.round((p.partite || 0) * 2.5));

    var note = i < 3 ? 'già nel traffico buono'
      : (p.record || 0) >= 25 ? 'ha già mostrato un colpo pesante'
      : (p.partite || 0) < 3  ? 'campione ancora corto'
      : 'profilo in definizione';
    if ((p.vittorie || 0) >= 2) note = 'vincitore seriale; ' + note;

    return {
      nome:                p.nome,
      iniziali:            p.iniziali,
      posizione_attuale:   p.posizione,
      partite:             p.partite,
      media_tiro:          p.media_tiro,
      record:              p.record,
      trend:               trend,
      confidence:          confidence,
      quote_titolo:        _probToOdds(pT,     MARGIN),
      quote_podio:         _probToOdds(pPodio, MARGIN),
      quote_top5:          _probToOdds(pTop5,  MARGIN),
      quote_best_30:       _probToOdds(Math.max(0.01, pBest30), MARGIN),
      quote_avg_18:        _probToOdds(pAvg18, MARGIN),
      note:                note
    };
  });

  // ── Next matchday ──────────────────────────────────────────────────
  var nextInfo = _findSisalNextMatchday(stagione);
  var nextMatchday = null;
  if (nextInfo) {
    var strengths  = classifica.map(function(p) {
      return 0.60 * (p.media_tiro || 0) + 0.40 * (p.record || 0);
    });
    var totalStr = strengths.reduce(function(a, b) { return a + b; }, 0) || 1;
    var nmPlayers = classifica.map(function(p, i) {
      var s      = strengths[i];
      var pVitt  = s / totalStr;
      var pPod   = Math.min(0.96, (s / totalStr) * 3.2);
      var sigma  = Math.max(3.0, ((p.record || 0) - (p.media_tiro || 0)) * 0.5 + 2.5);
      var pOv25  = _normCDF(((p.media_tiro || 0) - 25) / sigma);
      var pOv20  = _normCDF(((p.media_tiro || 0) - 20) / sigma);
      var staticNm = staticBoard && staticBoard.next_matchday && staticBoard.next_matchday.players
        ? staticBoard.next_matchday.players.find(function(sp) { return sp.nome === p.nome; })
        : null;
      var trend  = (staticNm && staticNm.trend) || (classifica[i] && classifica[i].trend) || 'Stabile';
      return {
        nome:               p.nome,
        iniziali:           p.iniziali,
        posizione_attuale:  p.posizione,
        media_tiro:         p.media_tiro,
        record:             p.record,
        trend:              trend,
        expected_score:     Math.round((0.70 * (p.media_tiro || 0) + 0.30 * (p.record || 0)) * 10) / 10,
        quote_vittoria:     _probToOdds(Math.max(0.005, pVitt),  MARGIN),
        quote_podio:        _probToOdds(Math.max(0.02,  pPod),   MARGIN),
        quote_over_25:      _probToOdds(Math.max(0.005, pOv25),  MARGIN),
        quote_over_20:      _probToOdds(Math.max(0.01,  pOv20),  MARGIN)
      };
    });
    nmPlayers.sort(function(a, b) { return b.expected_score - a.expected_score; });
    var bestVitt  = nmPlayers.slice().sort(function(a, b) { return a.quote_vittoria - b.quote_vittoria; })[0];
    var best25    = nmPlayers.slice().sort(function(a, b) { return a.quote_over_25  - b.quote_over_25;  })[0];
    nextMatchday = {
      numero:    nextInfo.numero,
      data:      nextInfo.data,
      giorno:    nextInfo.giorno,
      players:   nmPlayers,
      highlights: [
        { label: 'Favorito G' + nextInfo.numero, market: 'Vince la giornata',  player: bestVitt.nome, quota: bestVitt.quote_vittoria, blurb: 'Score atteso ' + bestVitt.expected_score + '. La quota più bassa del board giornata.' },
        { label: 'Cecchino 25+',                  market: 'Score over 25',       player: best25.nome,  quota: best25.quote_over_25,  blurb: 'Record ' + best25.record + ': più vicino al muro dei 25 punti.' }
      ],
      specials: [
        { label: 'Nessuno sotto 10',         quota: 2.20, note: 'Tutti i presenti chiudono con almeno 10 punti.' },
        { label: 'Record personale battuto', quota: 3.50, note: 'Almeno un giocatore supera il proprio personal best.' }
      ]
    };
  }

  // ── Highlights ─────────────────────────────────────────────────────
  var leaderP   = players[0];
  var best30P   = players.slice().sort(function(a, b) { return a.quote_best_30 - b.quote_best_30; })[0];
  var bestAvg18 = players.slice().sort(function(a, b) { return a.quote_avg_18  - b.quote_avg_18;  })[0];
  var outsiderP = players.filter(function(p, i) { return i >= 4; })
    .sort(function(a, b) { return a.quote_podio - b.quote_podio; })[0] || players[Math.min(4, players.length - 1)];
  var highlights = [
    { label: 'Favorito titolo',     market: 'Campione stagionale',   player: leaderP.nome,   quota: leaderP.quote_titolo,   blurb: 'Quota più bassa del board: posizione 1, record ' + leaderP.record + ' e ' + leaderP.partite + ' partite registrate.' },
    { label: 'Cecchino 30+',        market: 'Best score over 30',    player: best30P.nome,   quota: best30P.quote_best_30,  blurb: 'Record attuale ' + best30P.record + '/50 — il più vicino al muro dei trenta.' },
    { label: 'Value bet',           market: 'Media finale over 18',  player: bestAvg18.nome, quota: bestAvg18.quote_avg_18, blurb: 'Media attuale ' + (bestAvg18.media_tiro || 0).toFixed(1) + ': margine stretto ma giocabile, almeno sulla carta.' },
    { label: 'Outsider con senso',  market: 'Podio finale',          player: outsiderP.nome, quota: outsiderP.quote_podio,  blurb: 'Record ' + (outsiderP.record || '—') + ' che fa sperare. Fuori dal podio ma non troppo lontano.' }
  ];

  var specials = (staticBoard && staticBoard.specials) ? staticBoard.specials : [
    { label: 'Record assoluto 30+',             quota: 1.12,  note: 'Qualcuno rompe il muro dei trenta entro fine stagione.' },
    { label: 'Finale al fotofinish',            quota: 14.47, note: 'Primo e secondo chiudono separati da massimo un punto campionato.' },
    { label: 'Outsider a podio',                quota: 4.59,  note: 'Uno degli attuali fuori top 5 rientra tra i primi tre alla sirena.' },
    { label: 'Campione con almeno 2 vittorie',  quota: 1.08,  note: 'Il vincitore finale mette insieme almeno due giornate vinte sul campo.' }
  ];

  return {
    season_id:       stagione.id,
    season_label:    stagione.nome + ' ' + stagione.anno,
    giornate_giocate: giocate,
    giornate_totali:  totali,
    _isLive:         true,
    players:         players,
    highlights:      highlights,
    mc_summary:      mc || null,
    specials:        specials,
    methodology: [
      'Simulazione Monte Carlo: 5 000 stagioni complete simulate per ciascun aggiornamento del board.',
      'Per ogni simulazione, le giornate rimanenti vengono giocate estraendo i punteggi da N(μ_adj, σ²), con σ stimato da (record − media) / √(2·ln(k)). La media attesa è corretta con shrinkage bayesiano: μ_adj = (k·μ + 3·μ_league) / (k+3), che riduce il peso di singole partite eccezionali per i giocatori con poche gare disputate.',
      'I punteggi simulati vengono classificati secondo il sistema punti ufficiale (10-8-6-4-4-2-2-1-1-1); in caso di parità si usa il punteggio cumulativo come spareggio.',
      'Le probabilità di titolo, podio e top5 emergono direttamente dal conteggio dei risultati finali su 5 000 run — garantendo per costruzione che P(titolo) ≤ P(podio) ≤ P(top5).',
      'Best 30+: frazione di simulazioni in cui il giocatore registra almeno una giornata con punteggio ≥ 30.',
      'Media ≥18: frazione di simulazioni in cui la media finale di stagione supera 18 punti.',
      'Giornata successiva: modello strength-based con CDF normale per le quote over/under.',
      'Quote decimali con margine ~8% (overround 1.08). Solo per uso satirico: nessuna scommessa reale consentita.'
    ],
    next_matchday: nextMatchday
  };
}

async function initSisal() {
  var select = document.getElementById('sisal-season-select');
  if (!select) return;

  // Compute live boards from CSL.stagioni and update CSL.sisal in-place
  if (CSL.stagioni && CSL.stagioni.length) {
    for (const stagione of CSL.stagioni) {
      // If Supabase client available, attempt to fetch planned calendar from DB.
      // Do not overwrite played results-based giornate coming from CSLRanking.
      if (window.CSLAuth && CSLAuth.client) {
        try {
          const { data: dbGiornate, error: dbErr } = await CSLAuth.client
            .from('giornate')
            .select('id, season_id, numero, data')
            .eq('season_id', stagione.id)
            .order('numero', { ascending: true });
          if (!dbErr && Array.isArray(dbGiornate) && dbGiornate.length) {
            stagione._plannedGiornate = dbGiornate;
          }
        } catch (e) {
          console.warn('Failed to load giornate from Supabase for', stagione.id, e);
        }
      }

      var staticBoard = (CSL.sisal || []).find(function(b) { return b.season_id === stagione.id; });
      var liveBoard   = computeLiveSisalBoard(stagione, staticBoard);
      if (!liveBoard) continue;
      // Ensure records are consistent with per-giornata aggregation
      try {
        var statsPlayers = buildPlayerStats([stagione]);
        var spMap = Object.create(null);
        statsPlayers.forEach(function(sp) { spMap[sp.nome] = sp; });
        liveBoard.players.forEach(function(lp) {
          var sp = spMap[lp.nome];
          if (sp && typeof sp.record !== 'undefined' && sp.record !== lp.record) {
            console.warn('SISAL record mismatch for', lp.nome, 'CSL.classifica:', lp.record, 'aggregated:', sp.record);
            lp.record = sp.record; // align to aggregated history
          }
        });
      } catch (e) { console.error('record consistency check failed', e); }
      if (!CSL.sisal) CSL.sisal = [];
      var idx = CSL.sisal.findIndex(function(b) { return b.season_id === stagione.id; });
      if (idx >= 0) {
        CSL.sisal[idx] = liveBoard;
      } else {
        CSL.sisal.push(liveBoard);
      }
    }
    // Notify bet modal so it can re-populate with fresh data
    document.dispatchEvent(new CustomEvent('sisal:boards-ready'));
  }

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
  // Avoid duplicate options on re-init
  while (select.options.length) select.remove(0);
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
  _renderSisalTicker(defaultBoard);
}

function renderSisalBoard(seasonId) {
  var board = (CSL.sisal || []).find(function(item) { return item.season_id === seasonId; });
  if (!board) return;

  var progressPct = board.giornate_totali
    ? Math.round((board.giornate_giocate / board.giornate_totali) * 100)
    : 0;

  var titleEl         = document.getElementById('sisal-season-title');
  var summaryEl       = document.getElementById('sisal-season-summary');
  var progressLabelEl = document.getElementById('sisal-progress-label');
  var progressFillEl  = document.getElementById('sisal-progress-fill');
  var highlightsEl    = document.getElementById('sisal-highlights');
  var nextTitleEl     = document.getElementById('sisal-next-title');
  var nextCopyEl      = document.getElementById('sisal-next-copy');
  var nextHighlightsEl = document.getElementById('sisal-next-highlights');
  var nextTbodyEl     = document.getElementById('sisal-next-player-tbody');
  var nextSpecialsEl  = document.getElementById('sisal-next-specials');
  var nextTagEl       = document.getElementById('sisal-next-tag');
  var tbodyEl         = document.getElementById('sisal-player-tbody');
  var specialsEl      = document.getElementById('sisal-specials');
  var methodologyEl   = document.getElementById('sisal-methodology');
  var liveBadgeEl     = document.getElementById('sisal-live-badge');

  if (titleEl) titleEl.textContent = board.season_label;
  if (summaryEl) {
    var liveSpan = board._isLive
      ? '<span style="color:var(--sisal-green)">⚡ quote live calcolate</span>'
      : '<span>Quote pre-generate</span>';
    summaryEl.innerHTML =
      '<span>' + board.giornate_giocate + ' giornate · ' + (board.giornate_totali - board.giornate_giocate) + ' rimanenti</span>' +
      '<span>' + board.players.length + ' profili quotati</span>' +
      liveSpan;
  }
  if (progressLabelEl) progressLabelEl.textContent = progressPct + '% di stagione';
  if (progressFillEl)  progressFillEl.style.width  = progressPct + '%';

  // Live badge
  if (liveBadgeEl) liveBadgeEl.hidden = !board._isLive;

  // ── Highlight cards ───────────────────────────────────────────────
  if (highlightsEl) {
    var highlightCls = ['sisal-highlight-card--title', 'sisal-highlight-card--sharp', 'sisal-highlight-card--value', 'sisal-highlight-card--outsider'];
    highlightsEl.innerHTML = board.highlights.map(function(item, idx) {
      var cls = highlightCls[idx] || '';
      return '<article class="sisal-highlight-card ' + cls + '">' +
        '<div class="sisal-highlight-top">' +
          '<span class="sisal-chip">' + escapeHtml(item.label) + '</span>' +
          '<span class="sisal-quote sisal-quote--featured ' + getSisalQuoteClass(item.quota) + '">' + formatQuote(item.quota) + '</span>' +
        '</div>' +
        '<div class="sisal-highlight-market">' + escapeHtml(item.market) + '</div>' +
        '<div class="sisal-highlight-player">' + escapeHtml(item.player) + '</div>' +
        '<p class="sisal-highlight-copy">' + escapeHtml(item.blurb) + '</p>' +
      '</article>';
    }).join('');
  }

  // ── Next Matchday ─────────────────────────────────────────────────
  if (nextTitleEl && nextCopyEl && nextHighlightsEl && nextTbodyEl && nextSpecialsEl) {
    var sectionNameEl = document.getElementById('sisal-next-section-name');
    if (sectionNameEl) {
      sectionNameEl.textContent = board.next_matchday
        ? 'G' + board.next_matchday.numero + ' · Prossima Giornata'
        : 'Prossima Giornata';
    }
    if (!board.next_matchday) {
      if (nextTagEl) { nextTagEl.textContent = 'stagione conclusa'; nextTagEl.className = 'sisal-next-tag'; }
      nextTitleEl.textContent = 'Nessuna giornata futura in calendario';
      nextCopyEl.textContent  = 'La lavagna prossima giornata si riattiva quando esiste una lun/mer futura nel range stagione.';
      nextHighlightsEl.innerHTML = '<article class="sisal-highlight-card"><div class="sisal-highlight-market">Calendario chiuso</div><div class="sisal-highlight-player">Lavagna sospesa</div><p class="sisal-highlight-copy">Fine stagione.</p></article>';
      nextTbodyEl.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem">Nessuna giornata futura disponibile.</td></tr>';
      nextSpecialsEl.innerHTML = '';
    } else {
      var next = board.next_matchday;
      var today     = new Date(); today.setHours(0, 0, 0, 0);
      var nextDate  = new Date(next.data + 'T00:00:00');
      var isToday   = nextDate.getTime() === today.getTime();
      var isPast    = nextDate < today;
      var daysAway  = Math.round((nextDate - today) / 86400000);

      nextTitleEl.textContent = 'G' + next.numero + ' · ' + next.giorno + ' ' + formatDate(next.data);
      if (nextCopyEl) {
        if (board._isLive) {
          nextCopyEl.textContent = 'Quote calcolate in tempo reale dal motore CSL SISAL. Aggiornate automaticamente a ogni caricamento.';
        } else {
          nextCopyEl.textContent = 'Questa sezione viene rigenerata automaticamente sulla prossima lun/mer futura disponibile.';
        }
      }
      if (nextTagEl) {
        if (isToday)  { nextTagEl.textContent = '🟡 OGGI'; nextTagEl.className = 'sisal-next-tag sisal-next-tag--today'; }
        else if (isPast) { nextTagEl.textContent = '⏰ +' + Math.abs(daysAway) + ' gg fa'; nextTagEl.className = 'sisal-next-tag sisal-next-tag--past'; }
        else { nextTagEl.textContent = 'tra ' + daysAway + ' gg'; nextTagEl.className = 'sisal-next-tag'; }
        if (board._isLive) { nextTagEl.textContent = '⚡ live'; nextTagEl.className = 'sisal-next-tag sisal-next-tag--live'; }
      }

      nextHighlightsEl.innerHTML = (next.highlights || []).map(function(item) {
        return '<article class="sisal-highlight-card">' +
          '<div class="sisal-highlight-top">' +
            '<span class="sisal-chip">' + escapeHtml(item.label) + '</span>' +
            '<span class="sisal-quote sisal-quote--featured ' + getSisalQuoteClass(item.quota) + '">' + formatQuote(item.quota) + '</span>' +
          '</div>' +
          '<div class="sisal-highlight-market">' + escapeHtml(item.market) + '</div>' +
          '<div class="sisal-highlight-player">' + escapeHtml(item.player) + '</div>' +
          '<p class="sisal-highlight-copy">' + escapeHtml(item.blurb || '') + '</p>' +
        '</article>';
      }).join('');

      var trendIcon = { 'Caldo': '🔥', 'Freddo': '🧊', 'Stabile': '→' };
      nextTbodyEl.innerHTML = (next.players || []).map(function(player) {
        var trendClass = getSisalTrendClass(player.trend);
        var linePct = Math.max(0, Math.min(100, ((player.expected_score || 0) / 50) * 100)).toFixed(1);
        var ti = trendIcon[player.trend] || '→';
        return '<tr class="sisal-row' + (player.trend === 'Caldo' ? ' sisal-row--hot' : player.trend === 'Freddo' ? ' sisal-row--cold' : '') + '">' +
          '<td class="sisal-table-player-cell">' +
            '<div class="sisal-table-player">' +
              '<a class="sisal-player-link" href="stats.html?player=' + encodeURIComponent(player.nome) + '">' + escapeHtml(player.nome) + '</a>' +
              '<div class="sisal-table-player-meta">' +
                '<span>media ' + (player.media_tiro || 0).toFixed(1) + '</span>' +
                '<span>record ' + (player.record || 0) + '</span>' +
                '<span>linea ' + (player.expected_score || 0).toFixed(1) + '</span>' +
              '</div>' +
            '</div>' +
          '</td>' +
          '<td><span class="rank-badge ' + rankClass(player.posizione_attuale) + '">' + (player.posizione_attuale || '—') + '</span></td>' +
          '<td><span class="sisal-quote sisal-quote--anim ' + getSisalQuoteClass(player.quote_vittoria) + '">' + formatQuote(player.quote_vittoria) + '</span></td>' +
          '<td><span class="sisal-quote sisal-quote--anim ' + getSisalQuoteClass(player.quote_podio) + '">' + formatQuote(player.quote_podio) + '</span></td>' +
          '<td><span class="sisal-quote sisal-quote--anim ' + getSisalQuoteClass(player.quote_over_25) + '">' + formatQuote(player.quote_over_25) + '</span></td>' +
          '<td><span class="sisal-quote sisal-quote--anim ' + getSisalQuoteClass(player.quote_over_20) + '">' + formatQuote(player.quote_over_20) + '</span></td>' +
          '<td>' +
            '<div class="sisal-signal">' +
              '<span class="sisal-chip ' + trendClass + '">' + ti + ' ' + escapeHtml(player.trend) + '</span>' +
              '<div class="sisal-confidence sisal-confidence--line">' +
                '<div class="sisal-confidence-bar"><div class="sisal-confidence-fill" style="width:' + linePct + '%"></div></div>' +
                '<span class="sisal-confidence-value">linea ' + (player.expected_score || 0).toFixed(1) + '</span>' +
              '</div>' +
            '</div>' +
          '</td>' +
        '</tr>';
      }).join('');

      nextSpecialsEl.innerHTML = (next.specials || []).map(function(item) {
        return '<article class="sisal-special-card">' +
          '<div class="sisal-special-label">' + escapeHtml(item.label) + '</div>' +
          '<div class="sisal-special-quote ' + getSisalQuoteClass(item.quota) + '">' + formatQuote(item.quota) + '</div>' +
          '<p class="sisal-special-copy">' + escapeHtml(item.note) + '</p>' +
        '</article>';
      }).join('');
    }
  }

  // ── Season players table ──────────────────────────────────────────
  var trendIconMap = { 'Caldo': '🔥', 'Freddo': '🧊', 'Stabile': '→' };
  if (tbodyEl) {
    tbodyEl.innerHTML = board.players.map(function(player) {
      var trendClass = getSisalTrendClass(player.trend);
      var ti = trendIconMap[player.trend] || '→';
      return '<tr class="sisal-row' + (player.trend === 'Caldo' ? ' sisal-row--hot' : player.trend === 'Freddo' ? ' sisal-row--cold' : '') + '">' +
        '<td class="sisal-table-player-cell">' +
          '<div class="sisal-table-player">' +
            '<a class="sisal-player-link" href="stats.html?player=' + encodeURIComponent(player.nome) + '">' + escapeHtml(player.nome) + '</a>' +
            '<div class="sisal-table-player-meta">' +
              '<span>' + formatCount(player.partite, 'giornata', 'giornate') + '</span>' +
              '<span>media ' + (player.media_tiro || 0).toFixed(1) + '</span>' +
              '<span>record ' + (player.record || 0) + '</span>' +
            '</div>' +
            '<div class="sisal-table-player-note">' + escapeHtml(player.note || '') + '</div>' +
          '</div>' +
        '</td>' +
        '<td><span class="rank-badge ' + rankClass(player.posizione_attuale) + '">' + (player.posizione_attuale || '—') + '</span></td>' +
        '<td><span class="sisal-quote sisal-quote--anim ' + getSisalQuoteClass(player.quote_titolo) + '">' + formatQuote(player.quote_titolo) + '</span></td>' +
        '<td><span class="sisal-quote sisal-quote--anim ' + getSisalQuoteClass(player.quote_podio) + '">' + formatQuote(player.quote_podio) + '</span></td>' +
        '<td><span class="sisal-quote sisal-quote--anim ' + getSisalQuoteClass(player.quote_best_30) + '">' + formatQuote(player.quote_best_30) + '</span></td>' +
        '<td><span class="sisal-quote sisal-quote--anim ' + getSisalQuoteClass(player.quote_avg_18) + '">' + formatQuote(player.quote_avg_18) + '</span></td>' +
        '<td>' +
          '<div class="sisal-signal">' +
            '<span class="sisal-chip ' + trendClass + '">' + ti + ' ' + escapeHtml(player.trend) + '</span>' +
            '<div class="sisal-confidence">' +
              '<div class="sisal-confidence-bar"><div class="sisal-confidence-fill" style="width:' + (player.confidence || 0) + '%"></div></div>' +
              '<span class="sisal-confidence-value">fiducia ' + (player.confidence || 0) + '%</span>' +
            '</div>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  if (specialsEl) {
    specialsEl.innerHTML = (board.specials || []).map(function(item) {
      return '<article class="sisal-special-card">' +
        '<div class="sisal-special-label">' + escapeHtml(item.label) + '</div>' +
        '<div class="sisal-special-quote ' + getSisalQuoteClass(item.quota) + '">' + formatQuote(item.quota) + '</div>' +
        '<p class="sisal-special-copy">' + escapeHtml(item.note) + '</p>' +
      '</article>';
    }).join('');
  }

  if (methodologyEl) {
    methodologyEl.innerHTML = (board.methodology || []).map(function(item) {
      return '<li>' + escapeHtml(item) + '</li>';
    }).join('');
  }

  // Trigger quote animation
  setTimeout(function() {
    document.querySelectorAll('.sisal-quote--anim').forEach(function(el) {
      el.classList.add('sisal-quote--entered');
    });
  }, 80);

  // Charts and scroll reveal
  renderSisalCharts(board);
  setTimeout(_initScrollReveal, 120);
}

/** Render probability/score bar charts in the predictions section */
function renderSisalCharts(board) {
  var el = document.getElementById('sisal-charts-container');
  if (!el || !board || !board.players || !board.players.length) return;
  var allP = board.players.slice(0, 10);

  // ── helpers ──────────────────────────────────────────────────────
  function _nProbs(quotes) {
    var raw = quotes.map(function(q) { return 1 / Math.max(q, 0.01); });
    var tot = raw.reduce(function(a, b) { return a + b; }, 0) || 1;
    return raw.map(function(r) { return r / tot; });
  }
  function _bPct(val, max) { return Math.max(0, Math.min(100, Math.round((val / (max || 1)) * 100))); }
  function _bRow(name, pct, val, cc, tip) {
    return '<div class="sisal-bar-row" title="' + (tip ? escapeHtml(tip) : '') + '">' +
      '<span class="sisal-bar-name">' + escapeHtml(name) + '</span>' +
      '<div class="sisal-bar-track"><div class="sisal-bar-fill ' + cc + '" data-pct="' + pct + '"></div></div>' +
      '<span class="sisal-bar-val">' + val + '</span>' +
    '</div>';
  }

  // ── 1. Probabilità Titolo ────────────────────────────────────────
  var tProbs = _nProbs(allP.map(function(p) { return p.quote_titolo || 99; }));
  var maxTP  = Math.max.apply(null, tProbs) || 1;
  var chart1 = allP.map(function(p, i) {
    var prob = Math.round(tProbs[i] * 100);
    var cc   = prob > 25 ? 'sisal-bar-fill--green' : prob > 12 ? 'sisal-bar-fill--orange' : 'sisal-bar-fill--yellow';
    return _bRow(p.nome, _bPct(tProbs[i], maxTP), '@' + formatQuote(p.quote_titolo), cc, p.nome + ' — prob. ' + prob + '%');
  }).join('');

  // ── 2. Score atteso prossima giornata ────────────────────────────
  var nmP = (board.next_matchday && board.next_matchday.players && board.next_matchday.players.length)
    ? board.next_matchday.players.slice(0, 8) : allP.slice(0, 8);
  var scores   = nmP.map(function(p) { return p.expected_score || p.media_tiro || 0; });
  var maxSc    = Math.max.apply(null, scores) || 1;
  var nmLabel  = board.next_matchday ? '⚡ Score atteso G' + board.next_matchday.numero : '📊 Media corrente';
  var chart2   = nmP.map(function(p, i) {
    var val = scores[i];
    var cc  = val >= 22 ? 'sisal-bar-fill--green' : val >= 17 ? 'sisal-bar-fill--orange' : 'sisal-bar-fill--yellow';
    return _bRow(p.nome, _bPct(val, maxSc), val.toFixed(1), cc, p.nome + ' — atteso ' + val.toFixed(1));
  }).join('');

  // ── 3. Media vs Record grouped ──────────────────────────────────
  var maxMR = Math.max.apply(null, allP.map(function(p) { return Math.max(p.media_tiro || 0, p.record || 0); })) || 1;
  var chart3 =
    '<div class="sisal-bar-row sisal-bar-row--legend">' +
      '<span class="sisal-bar-name"></span>' +
      '<div class="sisal-bar-group">' +
        '<span class="sisal-bar-legend-item"><span class="sisal-bar-legend-dot" style="background:var(--sisal-green)"></span>media</span>' +
        '<span class="sisal-bar-legend-item"><span class="sisal-bar-legend-dot" style="background:var(--primary)"></span>record</span>' +
      '</div>' +
      '<span class="sisal-bar-val"></span>' +
    '</div>' +
    allP.map(function(p) {
      return '<div class="sisal-bar-row sisal-bar-row--grouped" title="' + escapeHtml(p.nome) + ' media ' + (p.media_tiro || 0).toFixed(1) + ' / record ' + (p.record || 0) + '">' +
        '<span class="sisal-bar-name">' + escapeHtml(p.nome) + '</span>' +
        '<div class="sisal-bar-group">' +
          '<div class="sisal-bar-track sisal-bar-track--sm"><div class="sisal-bar-fill sisal-bar-fill--green" data-pct="' + _bPct(p.media_tiro || 0, maxMR) + '"></div></div>' +
          '<div class="sisal-bar-track sisal-bar-track--sm"><div class="sisal-bar-fill sisal-bar-fill--orange" data-pct="' + _bPct(p.record || 0, maxMR) + '"></div></div>' +
        '</div>' +
        '<span class="sisal-bar-val">' + (p.media_tiro || 0).toFixed(1) + '&nbsp;/&nbsp;' + (p.record || 0) + '</span>' +
      '</div>';
    }).join('');

  // ── 4. Temperatura mercato (probabilità cumulata su tutti i mercati) ─────────────
  var tempScores = allP.map(function(p) {
    return (1 / Math.max(p.quote_titolo  || 99, 0.01)) +
           (1 / Math.max(p.quote_podio   || 99, 0.01)) +
           (1 / Math.max(p.quote_best_30 || 99, 0.01)) +
           (1 / Math.max(p.quote_avg_18  || 99, 0.01));
  });
  var maxTemp = Math.max.apply(null, tempScores) || 1;
  var chart4 = allP.map(function(p, i) {
    var temp = tempScores[i];
    var pct  = Math.round(temp / maxTemp * 100);
    var cc   = pct > 60 ? 'sisal-bar-fill--green' : pct > 35 ? 'sisal-bar-fill--orange' : 'sisal-bar-fill--yellow';
    var tip  = p.nome + ' — T:@' + formatQuote(p.quote_titolo) + ' P:@' + formatQuote(p.quote_podio) + ' 30+:@' + formatQuote(p.quote_best_30) + ' 18+:@' + formatQuote(p.quote_avg_18);
    return _bRow(p.nome, pct, pct + '%', cc, tip);
  }).join('');

  // ── 5. Fiducia algoritmo (barre orizzontali) ──────────────────
  var chart5 = allP.slice(0, 8).map(function(p) {
    var conf = p.confidence || 0;
    var cc   = conf > 65 ? 'sisal-bar-fill--green' : conf > 40 ? 'sisal-bar-fill--yellow' : 'sisal-bar-fill--orange';
    return _bRow(p.nome, conf, conf + '%', cc, p.nome + ' — fiducia algoritmo ' + conf + '%');
  }).join('');

  // ── 6. Radar Canvas — profilo giocatore ─────────────────────────
  window._sisalRadarData = allP.slice(0, 6).map(function(p) {
    return {
      nome: p.nome.split(' ')[0],
      dims: [
        1 / (p.quote_titolo  || 99),
        1 / (p.quote_podio   || 99),
        1 / (p.quote_best_30 || 99),
        1 / (p.quote_avg_18  || 99),
        (p.confidence || 0) / 100
      ]
    };
  });
  var radarTabs = window._sisalRadarData.map(function(p, i) {
    return '<button class="sisal-radar-tab' + (i === 0 ? ' active' : '') + '" data-idx="' + i + '">' + escapeHtml(p.nome) + '</button>';
  }).join('');
  var chart6 = '<div class="sisal-radar-tabs">' + radarTabs + '</div>' +
    '<canvas id="sisal-radar-canvas" width="320" height="250"></canvas>';

  // ── 7. Scatter SVG: Media × Record ──────────────────────────────
  var svgW = 320, svgH = 220, pL = 34, pR = 12, pT = 10, pB = 28;
  var plotW = svgW - pL - pR, plotH = svgH - pT - pB;
  var medias  = allP.map(function(p) { return p.media_tiro || 0; });
  var records = allP.map(function(p) { return p.record || 0; });
  var minM = Math.max(0, Math.min.apply(null, medias)  - 2), maxM = Math.max.apply(null, medias)  + 2;
  var minR = Math.max(0, Math.min.apply(null, records) - 2), maxR = Math.max.apply(null, records) + 2;
  var rColors = ['#ffd700', '#c0c0c0', '#cd7f32', '#49d29b', '#ff6600', '#64b5f6', '#ce93d8', '#ef9a9a'];
  var svgGrid = '';
  for (var gi = 0; gi <= 4; gi++) {
    var gx = pL + (gi / 4) * plotW, gy = pT + (gi / 4) * plotH;
    svgGrid += '<line x1="' + gx.toFixed(1) + '" y1="' + pT + '" x2="' + gx.toFixed(1) + '" y2="' + (pT + plotH) + '" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>';
    svgGrid += '<line x1="' + pL + '" y1="' + gy.toFixed(1) + '" x2="' + (pL + plotW) + '" y2="' + gy.toFixed(1) + '" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>';
    svgGrid += '<text x="' + gx.toFixed(1) + '" y="' + (pT + plotH + 14) + '" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.3)">' + (minM + gi * (maxM - minM) / 4).toFixed(0) + '</text>';
  }
  for (var yi = 0; yi <= 3; yi++) {
    var gyy = pT + (yi / 3) * plotH, yLbl = Math.round(maxR - yi * (maxR - minR) / 3);
    svgGrid += '<text x="' + (pL - 4) + '" y="' + (gyy + 3).toFixed(1) + '" text-anchor="end" font-size="8" fill="rgba(255,255,255,0.3)">' + yLbl + '</text>';
  }
  var svgDots = allP.map(function(p, i) {
    var px   = pL + ((p.media_tiro || 0) - minM) / (maxM - minM) * plotW;
    var py   = pT + (1 - ((p.record || 0) - minR) / (maxR - minR)) * plotH;
    var r    = 4 + Math.round((p.confidence || 50) / 100 * 4);
    var fill = rColors[Math.min(rColors.length - 1, (p.posizione_attuale || 9) - 1)];
    var init = p.iniziali || p.nome.substring(0, 2).toUpperCase();
    return '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="' + r + '" fill="' + fill + '" fill-opacity="0.82" stroke="rgba(0,0,0,0.35)" stroke-width="1" class="sisal-scatter-dot">' +
        '<title>' + escapeHtml(p.nome) + '\nMedia: ' + (p.media_tiro || 0).toFixed(1) + ' | Record: ' + (p.record || 0) + ' | Fiducia: ' + (p.confidence || 0) + '%</title>' +
      '</circle>' +
      '<text x="' + (px + r + 2).toFixed(1) + '" y="' + (py + 3).toFixed(1) + '" font-size="8" fill="rgba(255,255,255,0.55)">' + escapeHtml(init) + '</text>';
  }).join('');
  var chart7 = '<svg viewBox="0 0 ' + svgW + ' ' + svgH + '" style="width:100%;height:auto">' +
    '<rect x="' + pL + '" y="' + pT + '" width="' + plotW + '" height="' + plotH + '" fill="rgba(255,255,255,0.02)" rx="2"/>' +
    svgGrid + svgDots +
    '<text x="' + (pL + plotW / 2) + '" y="' + (svgH - 2) + '" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.35)">Media tiro →</text>' +
    '<text x="10" y="' + (pT + plotH / 2) + '" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.35)" transform="rotate(-90 10 ' + (pT + plotH / 2) + ')">Record →</text>' +
  '</svg>';

  // ── Final standings carousel (top MC orders, top10 filtered) ─────
  var chartFinal = '';
  var palette = ['#ffd700','#ffb74d','#ff8a65','#4db6ac','#64b5f6','#ba68c8','#e57373','#ffd54f','#aed581','#90a4ae'];
  if (board && board.mc_summary && board.mc_summary.topOrders && board.mc_summary.topOrders.length) {
    var tops = board.mc_summary.topOrders.filter(function(o){ return o.order && o.order.length; }).slice(0,5);
    var slides = tops.map(function(o, si) {
      var items = '';
      // only show top10 players (allP indexes)
      var shown = 0;
      for (var idx = 0; idx < o.order.length && shown < 10; idx++) {
        var pi = o.order[idx];
        // skip if player not in top10
        if (allP.map(function(x){return x.nome; }).indexOf((board.players[pi]||{}).nome) === -1) continue;
        var p = board.players[pi] || { nome: '—' };
        var posPct = 0;
        if (board.mc_summary.posMatrix && board.mc_summary.sims) {
          posPct = Math.round(1000 * (board.mc_summary.posMatrix[pi] && board.mc_summary.posMatrix[pi][shown] ? board.mc_summary.posMatrix[pi][shown] : 0) / board.mc_summary.sims) / 10;
        }
        var color = palette[shown % palette.length];
          items += '<div class="sisal-final-row" style="--accent-color:' + color + '">'
            + '<span class="sisal-final-rank">' + (shown+1) + '</span>'
            + '<span class="sisal-final-name">' + escapeHtml(p.nome) + '</span>'
            + '<span class="sisal-final-pospct">' + posPct + '%</span></div>';
        shown++;
      }
      return '<div class="sisal-final-slide" data-idx="' + si + '"' + (si===0? ' style="display:block"' : '') + '>' +
        '<div class="sisal-final-header">Possibile classifica — ' + (o.pct || 0) + '%</div>' + items + '</div>';
    }).join('');

    var dots = tops.map(function(_, di) { return '<button class="sisal-final-dot' + (di===0? ' active' : '') + '" data-idx="' + di + '"></button>'; }).join('');
    chartFinal = '<div class="sisal-final-carousel">'
      + '<button class="sisal-final-prev" aria-label="Prev">◀</button>'
      + '<div id="sisal-final-carousel-wrap"><div class="sisal-final-carousel-track">' + slides + '</div></div>'
      + '<button class="sisal-final-next" aria-label="Next">▶</button>'
      + '<div class="sisal-final-dots">' + dots + '</div>'
      + '</div>';
  } else {
    chartFinal = '<div id="sisal-final-carousel-wrap"><p class="text-muted">Nessun dato Monte Carlo disponibile.</p></div>';
  }

  // ── 8. Simulatore quota ──────────────────────────────────────────
  var simOpts = allP.map(function(p, i) {
    return '<option value="' + i + '">' + escapeHtml(p.nome) + '</option>';
  }).join('');
  var chart8 =
    '<div class="sisal-sim-wrap">' +
      '<div class="sisal-sim-left">' +
        '<div class="sisal-sim-row">' +
          '<label class="sisal-sim-label">Giocatore</label>' +
          '<select id="sisal-sim-player" class="sisal-sim-select">' + simOpts + '</select>' +
        '</div>' +
        '<div class="sisal-sim-row">' +
          '<label class="sisal-sim-label">Media tiro <span id="sisal-sim-media-val"></span></label>' +
          '<input type="range" id="sisal-sim-media" min="5" max="40" step="0.5" class="sisal-sim-range">' +
        '</div>' +
        '<div class="sisal-sim-row">' +
          '<label class="sisal-sim-label">Record personale <span id="sisal-sim-record-val"></span></label>' +
          '<input type="range" id="sisal-sim-record" min="5" max="50" step="1" class="sisal-sim-range">' +
        '</div>' +
        '<div class="sisal-sim-multi">' +
          '<div class="sisal-sim-market-card">' +
            '<div class="sisal-sim-market-label">🏆 Titolo</div>' +
            '<div class="sisal-sim-market-value" id="sisal-sim-q-titolo">—</div>' +
            '<div class="sisal-sim-market-delta" id="sisal-sim-d-titolo"></div>' +
          '</div>' +
          '<div class="sisal-sim-market-card">' +
            '<div class="sisal-sim-market-label">🥉 Podio</div>' +
            '<div class="sisal-sim-market-value" id="sisal-sim-q-podio">—</div>' +
            '<div class="sisal-sim-market-delta" id="sisal-sim-d-podio"></div>' +
          '</div>' +
          '<div class="sisal-sim-market-card">' +
            '<div class="sisal-sim-market-label">🎯 Best 30+</div>' +
            '<div class="sisal-sim-market-value" id="sisal-sim-q-best30">—</div>' +
            '<div class="sisal-sim-market-delta" id="sisal-sim-d-best30"></div>' +
          '</div>' +
          '<div class="sisal-sim-market-card">' +
            '<div class="sisal-sim-market-label">📈 Media 18+</div>' +
            '<div class="sisal-sim-market-value" id="sisal-sim-q-avg18">—</div>' +
            '<div class="sisal-sim-market-delta" id="sisal-sim-d-avg18"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="sisal-sim-right">' +
        '<div id="sisal-sim-chart-bars" class="sisal-sim-chart"></div>' +
        '<div id="sisal-sim-chart-dist" class="sisal-sim-chart" style="margin-top:10px"></div>' +
      '</div>' +
    '</div>';

  // ── Assemble ─────────────────────────────────────────────────────
  el.innerHTML =
    '<div class="sisal-charts-note">📊 Analisi basata sui top ' + allP.length + ' giocatori per classifica campionato corrente</div>' +
    '<div class="sisal-charts-grid">' +
      '<div class="sisal-chart-card sisal-reveal"><div class="sisal-chart-title">🔁 Possibili classifiche finali (Top 10)</div>' + chartFinal + '</div>' +
      '<div class="sisal-chart-card sisal-reveal"><div class="sisal-chart-title">' + nmLabel + '</div>' + chart2 + '</div>' +
    '</div>' +
    '<div class="sisal-charts-grid">' +
      '<div class="sisal-chart-card sisal-reveal"><div class="sisal-chart-title">📊 Media vs Record</div>' + chart3 + '</div>' +
      '<div class="sisal-chart-card sisal-reveal"><div class="sisal-chart-title">🌡 Temperatura mercato</div>' + chart4 + '</div>' +
    '</div>' +
    '<div class="sisal-charts-grid sisal-charts-grid--3">' +
      '<div class="sisal-chart-card sisal-reveal"><div class="sisal-chart-title">🧠 Fiducia algoritmo</div>' + chart5 + '</div>' +
      '<div class="sisal-chart-card sisal-reveal sisal-chart-radar-card"><div class="sisal-chart-title">🕸 Radar — profilo</div>' + chart6 + '</div>' +
      '<div class="sisal-chart-card sisal-reveal"><div class="sisal-chart-title">✦ Media × Record</div>' + chart7 + '</div>' +
    '</div>' +
    '<div class="sisal-charts-grid">' +
      '<div class="sisal-chart-card sisal-reveal sisal-chart-sim-full"><div class="sisal-chart-title">🎛 Simulatore quote</div>' + chart8 + '</div>' +
    '</div>';

  // ── Animate + init interactive ───────────────────────────────────
  setTimeout(function() {
    el.querySelectorAll('.sisal-bar-fill[data-pct]').forEach(function(bar) {
      bar.style.width = bar.getAttribute('data-pct') + '%';
    });
    el.querySelectorAll('.sisal-reveal').forEach(function(card, idx) {
      setTimeout(function() { card.classList.add('visible'); }, idx * 90);
    });
    _drawSisalRadar(el, 0);
    el.querySelectorAll('.sisal-radar-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        el.querySelectorAll('.sisal-radar-tab').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        _drawSisalRadar(el, parseInt(btn.getAttribute('data-idx') || '0'));
      });
    });
    _initSisalSimulatore(el, allP, board);
    // Init final-standings carousel (cycle top MC orders) with controls
    var carouselContainer = el.querySelector('.sisal-final-carousel');
    if (carouselContainer) {
      var wrap = carouselContainer.querySelector('#sisal-final-carousel-wrap');
      var track = wrap ? wrap.querySelector('.sisal-final-carousel-track') : null;
      var slides = track ? track.querySelectorAll('.sisal-final-slide') : [];
      var dots = carouselContainer.querySelectorAll('.sisal-final-dot');
      var prevBtn = carouselContainer.querySelector('.sisal-final-prev');
      var nextBtn = carouselContainer.querySelector('.sisal-final-next');
      if (slides && slides.length) {
        var cidx = 0;
        function showSlide(i) {
          if (!track) return;
          track.style.transform = 'translateX(' + (-i * 100) + '%)';
          if (dots && dots.length) {
            dots.forEach(function(d) { d.classList.remove('active'); });
            if (dots[i]) dots[i].classList.add('active');
          }
        }
        // ensure initial position
        if (track) track.style.transform = 'translateX(0)';
        showSlide(0);
        var carouselTimer = setInterval(function() { cidx = (cidx + 1) % slides.length; showSlide(cidx); }, 5000);
        if (prevBtn) prevBtn.addEventListener('click', function() { clearInterval(carouselTimer); cidx = (cidx - 1 + slides.length) % slides.length; showSlide(cidx); carouselTimer = setInterval(function() { cidx = (cidx + 1) % slides.length; showSlide(cidx); }, 5000); });
        if (nextBtn) nextBtn.addEventListener('click', function() { clearInterval(carouselTimer); cidx = (cidx + 1) % slides.length; showSlide(cidx); carouselTimer = setInterval(function() { cidx = (cidx + 1) % slides.length; showSlide(cidx); }, 5000); });
        if (dots && dots.length) {
          dots.forEach(function(dot) {
            dot.addEventListener('click', function() {
              var idx = parseInt(dot.getAttribute('data-idx') || '0', 10);
              clearInterval(carouselTimer);
              cidx = idx; showSlide(cidx);
              carouselTimer = setInterval(function() { cidx = (cidx + 1) % slides.length; showSlide(cidx); }, 5000);
            });
          });
        }
      }
    }
  }, 200);
}

/** Draw radar pentagon chart on canvas for player at playerIdx */
function _drawSisalRadar(container, playerIdx) {
  var canvas = container.querySelector('#sisal-radar-canvas');
  if (!canvas || !window._sisalRadarData) return;
  var data   = window._sisalRadarData;
  var player = data[playerIdx] || data[0];
  if (!player) return;

  // Normalize each dimension: max value across all players = 1
  var maxD = [0, 0, 0, 0, 0];
  data.forEach(function(p) { p.dims.forEach(function(v, di) { if (v > maxD[di]) maxD[di] = v; }); });
  var normD = player.dims.map(function(v, di) { return maxD[di] > 0 ? v / maxD[di] : 0; });

  var W = canvas.width, H = canvas.height;
  var cx = W / 2, cy = H / 2 + 4;
  var R  = Math.min(W, H) / 2 - 42;
  var labels = ['Titolo', 'Podio', 'Best 30+', 'Med. 18+', 'Fiducia'];
  var n = 5;
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // Background rings
  for (var ri = 1; ri <= 4; ri++) {
    ctx.beginPath();
    for (var ai = 0; ai < n; ai++) {
      var ang = (Math.PI * 2 * ai / n) - Math.PI / 2;
      var rr  = (ri / 4) * R;
      var xx  = cx + rr * Math.cos(ang), yy = cy + rr * Math.sin(ang);
      if (ai === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,' + (ri === 4 ? '0.13' : '0.06') + ')';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (ri === 4) { ctx.fillStyle = 'rgba(255,255,255,0.02)'; ctx.fill(); }
  }

  // Axis lines
  for (var ai = 0; ai < n; ai++) {
    var ang = (Math.PI * 2 * ai / n) - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + R * Math.cos(ang), cy + R * Math.sin(ang));
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Label
    var lx = cx + (R + 20) * Math.cos(ang), ly = cy + (R + 20) * Math.sin(ang);
    ctx.font = '9px Orbitron, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.textAlign = 'center';
    ctx.fillText(labels[ai], lx, ly + 3);
  }

  // Player polygon
  ctx.beginPath();
  for (var di = 0; di < n; di++) {
    var ang = (Math.PI * 2 * di / n) - Math.PI / 2;
    var rr  = normD[di] * R;
    var xx  = cx + rr * Math.cos(ang), yy = cy + rr * Math.sin(ang);
    if (di === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(73,210,155,0.18)';
  ctx.fill();
  ctx.strokeStyle = '#49d29b';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Vertex dots
  for (var di = 0; di < n; di++) {
    var ang = (Math.PI * 2 * di / n) - Math.PI / 2;
    var rr  = normD[di] * R;
    ctx.beginPath();
    ctx.arc(cx + rr * Math.cos(ang), cy + rr * Math.sin(ang), 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#49d29b';
    ctx.fill();
  }

  // Player name in center
  ctx.font = 'bold 11px Orbitron, monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.textAlign = 'center';
  ctx.fillText(player.nome, cx, cy + 4);
}

/** Draw mini radar pentagon on a .stats-radar-canvas element inside a player card */
function _drawStatsRadar(cardEl, player, allPlayers) {
  var canvas = cardEl.querySelector('.stats-radar-canvas');
  if (!canvas) return;

  var maxMedia  = Math.max.apply(null, allPlayers.map(function(p) { return p.media_tiro || 0; })) || 1;
  var maxRecord = Math.max.apply(null, allPlayers.map(function(p) { return p.record || 0; })) || 1;
  // 5 dims: Media, Record, Win%, Costanza, Podi%
  var dims = [
    (player.media_tiro || 0) / maxMedia,
    (player.record || 0) / maxRecord,
    (player.win_rate || 0) / 100,
    (player.consistenza || 0) / 100,
    (player.podio_rate || 0) / 100
  ];
  var labels = ['Media', 'Record', 'Win%', 'Costanza', 'Podi%'];
  var n = 5;
  var W = canvas.width, H = canvas.height;
  var cx = W / 2, cy = H / 2 + 2;
  var R = Math.min(W, H) / 2 - 28;
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // Background rings
  for (var ri = 1; ri <= 4; ri++) {
    ctx.beginPath();
    for (var ai = 0; ai < n; ai++) {
      var ang = (Math.PI * 2 * ai / n) - Math.PI / 2;
      var rr  = (ri / 4) * R;
      var xx  = cx + rr * Math.cos(ang), yy = cy + rr * Math.sin(ang);
      if (ai === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,' + (ri === 4 ? '0.12' : '0.05') + ')';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Axis lines + labels
  for (var ai2 = 0; ai2 < n; ai2++) {
    var ang2 = (Math.PI * 2 * ai2 / n) - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + R * Math.cos(ang2), cy + R * Math.sin(ang2));
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
    var lx = cx + (R + 16) * Math.cos(ang2), ly = cy + (R + 16) * Math.sin(ang2);
    ctx.font = '7px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.textAlign = 'center';
    ctx.fillText(labels[ai2], lx, ly + 3);
  }

  // Player polygon
  ctx.beginPath();
  for (var di = 0; di < n; di++) {
    var ang3 = (Math.PI * 2 * di / n) - Math.PI / 2;
    var rr3  = dims[di] * R;
    var xx3  = cx + rr3 * Math.cos(ang3), yy3 = cy + rr3 * Math.sin(ang3);
    if (di === 0) ctx.moveTo(xx3, yy3); else ctx.lineTo(xx3, yy3);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,102,0,0.14)';
  ctx.fill();
  ctx.strokeStyle = '#ff6600';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Vertex dots
  for (var di2 = 0; di2 < n; di2++) {
    var ang4 = (Math.PI * 2 * di2 / n) - Math.PI / 2;
    var rr4  = dims[di2] * R;
    ctx.beginPath();
    ctx.arc(cx + rr4 * Math.cos(ang4), cy + rr4 * Math.sin(ang4), 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ff6600';
    ctx.fill();
  }
}

/** Initialise the simulatore sliders and live odds recalculation */
function _initSisalSimulatore(container, allP, board) {
  var playerSel    = container.querySelector('#sisal-sim-player');
  var mediaSlider  = container.querySelector('#sisal-sim-media');
  var recordSlider = container.querySelector('#sisal-sim-record');
  var mediaValEl   = container.querySelector('#sisal-sim-media-val');
  var recordValEl  = container.querySelector('#sisal-sim-record-val');
  if (!playerSel || !mediaSlider || !recordSlider) return;

  var MARGIN    = 1.08;
  var totalR    = board.giornate_totali  || 8;
  var played    = board.giornate_giocate || 1;
  var remaining = Math.max(1, totalR - played);

  function _updateCard(qId, dId, q, origQ) {
    var qEl = container.querySelector('#' + qId);
    var dEl = container.querySelector('#' + dId);
    if (qEl) qEl.textContent = '@' + q.toFixed(2).replace('.', ',');
    if (dEl) {
      var delta = origQ - q;
      if (Math.abs(delta) < 0.05) {
        dEl.textContent = '\u2248 quota attuale';
        dEl.className = 'sisal-sim-market-delta';
      } else if (delta > 0) {
        dEl.textContent = '\u25b2 ' + Math.abs(delta).toFixed(2);
        dEl.className = 'sisal-sim-market-delta sisal-sim-market-delta--better';
      } else {
        dEl.textContent = '\u25bc ' + Math.abs(delta).toFixed(2);
        dEl.className = 'sisal-sim-market-delta sisal-sim-market-delta--worse';
      }
    }
  }

  function recalc() {
    var idx    = parseInt(playerSel.value) || 0;
    var media  = parseFloat(mediaSlider.value);
    var record = parseInt(recordSlider.value);
    if (mediaValEl)  mediaValEl.textContent  = media.toFixed(1);
    if (recordValEl) recordValEl.textContent = record;

    var simP = allP.map(function(pl, i) {
      return { media: i === idx ? media : (pl.media_tiro || 0), record: i === idx ? record : (pl.record || 0) };
    });
    var strengths = simP.map(function(pl) { return 0.65 * pl.media + 0.35 * pl.record; });
    var totalStr  = strengths.reduce(function(a, b) { return a + b; }, 0) || 1;

    // Titolo
    var pT = Math.max(0.005, Math.min(0.95, (strengths[idx] / totalStr) * (0.4 + 0.6 * remaining / totalR)));
    var qT = _probToOdds(pT, MARGIN);

    // Podio
    var pPodio = Math.max(0.01, Math.min(0.97, (3 * strengths[idx] / totalStr) * (0.5 + 0.5 * remaining / totalR)));
    var qPodio = _probToOdds(pPodio, MARGIN);

    // Best 30+
    var dist30  = 30 - record;
    var pBest30;
    if (dist30 <= 0) {
      pBest30 = 0.90;
    } else {
      var sigma30 = Math.max(2.0, record * 0.25);
      pBest30 = Math.min(0.93, 1 - Math.pow(1 - Math.max(0.005, _normCDF(-dist30 / sigma30)), Math.max(1, remaining)));
    }
    var qBest30 = _probToOdds(Math.max(0.01, pBest30), MARGIN);

    // Media 18+
    var gPlayed   = allP[idx].partite || Math.max(1, played);
    var currTot   = media * gPlayed;
    var pAvg18;
    if (remaining <= 0) {
      pAvg18 = media >= 18 ? 0.92 : 0.03;
    } else {
      var neededFut = (18 * (gPlayed + remaining) - currTot) / remaining;
      if (neededFut <= 0) {
        pAvg18 = 0.92;
      } else if (neededFut > 49) {
        pAvg18 = 0.01;
      } else {
        var sigma18 = Math.max(3.0, (record - media) * 0.4 + 3.0);
        pAvg18 = _normCDF(-((neededFut - media) / sigma18));
      }
    }
    var qAvg18 = _probToOdds(Math.max(0.01, Math.min(0.93, pAvg18)), MARGIN);

    _updateCard('sisal-sim-q-titolo', 'sisal-sim-d-titolo', qT,      allP[idx].quote_titolo  || qT);
    _updateCard('sisal-sim-q-podio',  'sisal-sim-d-podio',  qPodio,  allP[idx].quote_podio   || qPodio);
    _updateCard('sisal-sim-q-best30', 'sisal-sim-d-best30', qBest30, allP[idx].quote_best_30 || qBest30);
    _updateCard('sisal-sim-q-avg18',  'sisal-sim-d-avg18',  qAvg18,  allP[idx].quote_avg_18  || qAvg18);

    // Update simulator charts: market comparison bars and delta list
    try {
      var barsEl = container.querySelector('#sisal-sim-chart-bars');
      var distEl = container.querySelector('#sisal-sim-chart-dist');
      if (barsEl) {
        var markets = [
          { id: 'titolo', label: 'Titolo', simQ: qT, origQ: allP[idx].quote_titolo || qT },
          { id: 'podio',  label: 'Podio',  simQ: qPodio, origQ: allP[idx].quote_podio  || qPodio },
          { id: 'best30', label: 'Best30', simQ: qBest30, origQ: allP[idx].quote_best_30 || qBest30 },
          { id: 'avg18',  label: 'Media18',simQ: qAvg18,  origQ: allP[idx].quote_avg_18  || qAvg18 }
        ];
        // compute pseudo-prob (inverse of quote) for visual comparison
        var maxV = 0;
        markets.forEach(function(m){ m.origP = 1 / Math.max(1.01, m.origQ); m.simP = 1 / Math.max(1.01, m.simQ); maxV = Math.max(maxV, m.origP, m.simP); });
        var html = markets.map(function(m){
          var origW = Math.round((m.origP / maxV) * 100);
          var simW  = Math.round((m.simP  / maxV) * 100);
          return '<div class="sisal-sim-bar-row"><div class="sisal-sim-bar-label">' + m.label + '</div>' +
            '<div class="sisal-sim-bar-wrap"><div class="sisal-sim-bar orig" style="width:' + origW + '%"></div><div class="sisal-sim-bar sim" style="width:' + simW + '%"></div></div>' +
            '<div class="sisal-sim-bar-vals">@' + m.origQ.toFixed(2).replace('.',',') + ' → @' + m.simQ.toFixed(2).replace('.',',') + '</div></div>';
        }).join('');
        barsEl.innerHTML = html;
      }
      if (distEl) {
        var deltas = [
          { k: 'Titolo', d: (allP[idx].quote_titolo || qT) - qT },
          { k: 'Podio',  d: (allP[idx].quote_podio  || qPodio) - qPodio },
          { k: 'Best30', d: (allP[idx].quote_best_30|| qBest30) - qBest30 },
          { k: 'Media18',d: (allP[idx].quote_avg_18 || qAvg18) - qAvg18 }
        ];
        var html2 = '<ul class="sisal-sim-delta-list">' + deltas.map(function(x){
          var cls = x.d > 0 ? 'better' : (x.d < 0 ? 'worse' : 'equal');
          var sym = x.d > 0 ? '\u25b2' : (x.d < 0 ? '\u25bc' : '\u2248');
          return '<li class="sisal-sim-delta-' + cls + '"><span class="k">' + x.k + '</span> <span class="v">' + sym + ' ' + Math.abs(x.d).toFixed(2) + '</span></li>';
        }).join('') + '</ul>';
        distEl.innerHTML = html2;
      }
    } catch (e) { console.error('sim charts update', e); }
  }

  function syncToPlayer() {
    var idx = parseInt(playerSel.value) || 0;
    var p   = allP[idx];
    mediaSlider.value  = (p.media_tiro || 15).toFixed(1);
    recordSlider.value = (p.record || 20);
    recalc();
  }

  playerSel.addEventListener('change', syncToPlayer);
  mediaSlider.addEventListener('input', recalc);
  recordSlider.addEventListener('input', recalc);
  syncToPlayer();
}


/** Activate IntersectionObserver-based scroll reveal for .sisal-reveal elements */
function _initScrollReveal() {
  if (typeof IntersectionObserver === 'undefined') {
    document.querySelectorAll('.sisal-reveal').forEach(function(el) { el.classList.add('visible'); });
    return;
  }
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });
  document.querySelectorAll('.sisal-reveal:not(.visible)').forEach(function(el) {
    observer.observe(el);
  });
}

/** Build the scrolling ticker content from the board */
function _renderSisalTicker(board) {
  var el = document.getElementById('sisal-ticker-content');
  if (!el || !board || !board.players) return;
  var items = [];
  board.players.slice(0, 8).forEach(function(p) {
    items.push({ market: 'TITOLO', name: p.nome.split(' ')[0], quota: p.quote_titolo });
    items.push({ market: 'MEDIA18', name: p.nome.split(' ')[0], quota: p.quote_avg_18 });
    items.push({ market: 'PODIO', name: p.nome.split(' ')[0], quota: p.quote_podio });
  });
  if (board.next_matchday && board.next_matchday.players) {
    board.next_matchday.players.slice(0, 6).forEach(function(p) {
      items.push({ market: 'G' + board.next_matchday.numero + ' WIN', name: p.nome.split(' ')[0], quota: p.quote_vittoria });
    });
  }
  // Repeat for seamless loop
  var full = items.concat(items);
  el.innerHTML = full.map(function(item) {
    var qClass = getSisalQuoteClass(item.quota);
    return '<span class="sisal-ticker-item">' +
      '<span class="sisal-ticker-item-market">' + escapeHtml(item.market) + '</span>' +
      '<span class="sisal-ticker-item-name">' + escapeHtml(item.name) + '</span>' +
      '<span class="sisal-ticker-item-q ' + qClass + '">@' + formatQuote(item.quota) + '</span>' +
    '</span>';
  }).join('');
}

// ── Supabase Integration ───────────────────────────────────────

/**
 * Ritorna true se Supabase è configurato (URL non è il placeholder).
 * Usato per decidere se caricare dati dinamici o usare i file statici.
 */
function _supabaseActive() {
  return typeof CSLAuth !== 'undefined'
    && typeof CSLAuth.client !== 'undefined'
    && !CSLAuth.client.supabaseUrl?.includes('YOUR_PROJECT_REF');
}

/**
 * Carica i post da Supabase e li converte nel formato CSL.posts.
 * Ritorna i post aggiornati (o l'array statico se Supabase non disponibile).
 */
async function _loadPostsFromSupabase() {
  if (!_supabaseActive()) return CSL.posts || [];
  try {
    var res = await CSLAuth.client
      .from('posts')
      .select('id, slug, titolo, data, autore, tags, excerpt, content, published')
      .eq('published', true)
      .order('data', { ascending: false });
    if (res.error || !res.data) return CSL.posts || [];
    return res.data.map(function(p) {
      return {
        id:      p.id,
        slug:    p.slug,
        titolo:  p.titolo,
        data:    p.data,
        autore:  p.autore || '',
        tag:     p.tags || [],
        excerpt: p.excerpt || '',
        content: p.content || '',
      };
    });
  } catch (e) {
    return CSL.posts || [];
  }
}

/**
 * Carica le stagioni con ranking da Supabase via CSLRanking.
 */
async function _loadStagioniFromSupabase() {
  if (!_supabaseActive() || typeof CSLRanking === 'undefined') return null;
  return new Promise(function(resolve) {
    CSLRanking.loadStagioniFromSupabase(function(data) { resolve(data); });
  });
}

// ── Router ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  initNav();
  var page = window.location.pathname.split('/').pop() || 'index.html';

  // Se Supabase è attivo, aspetta auth-ready per dati live; altrimenti rende subito.
  var _rendered = false;
  var _liveBootStarted = false;

  function _run() {
    if (_rendered) return;
    _rendered = true;
    try { _initScrollReveal(); } catch (e) { /* ignore if unavailable */ }
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
  }

  async function _bootLiveAndRun() {
    if (_liveBootStarted) return;
    _liveBootStarted = true;

    try {
      var liveStagioni = await _loadStagioniFromSupabase();
      if (liveStagioni && liveStagioni.length) {
        CSL.stagioni = liveStagioni;
      }

      var livePosts = await _loadPostsFromSupabase();
      if (livePosts && livePosts.length) {
        CSL.posts = livePosts;
      }

      if (page === 'regolamento.html' && _supabaseActive()) {
        try {
          var regRes = await CSLAuth.client
            .from('regolamento').select('content').eq('id', 1).single();
          if (!regRes.error && regRes.data && regRes.data.content) {
            var rulesContent = document.querySelector('.rules-content');
            if (rulesContent) {
              rulesContent.innerHTML = regRes.data.content;
              if (CSLAuth.isAdmin()) {
                _injectRegolamentoAdminBtn(rulesContent);
              }
            }
          }
        } catch (e) { /* usa HTML statico */ }
      }

      if (page === 'post.html' && CSLAuth.isAdmin()) {
        document.addEventListener('csl:post-loaded', function(ev) {
          _injectPostAdminBtn(ev.detail.postId);
        });
      }
    } catch (e) {
      console.warn('Live bootstrap failed, using current in-memory data.', e);
    }

    _run();
  }

  if (_supabaseActive()) {
    // Boot live data immediately; keep auth-ready as an extra signal in case session arrives later.
    _bootLiveAndRun();
    document.addEventListener('csl:auth-ready', _bootLiveAndRun);
    setTimeout(_run, 3000);
  } else {
    _run();
  }

  // Recompute SISAL boards when stagioni/giornate are updated elsewhere (admin)
  document.addEventListener('stagioni:updated', function() {
    try {
      // Rebuild live boards and re-render current selection
      initSisal().then(function() {
        var sel = document.getElementById('sisal-season-select');
        if (sel && sel.value) renderSisalBoard(sel.value);
        else {
          var active = getCurrentSeason();
          if (active) renderSisalBoard(active.id);
        }
      }).catch(function(e){ console.error('stagioni:updated handler failed', e); });
    } catch (e) { console.error(e); }
  });
});

function _injectRegolamentoAdminBtn(container) {
  var btn = document.createElement('a');
  btn.href = 'admin.html#regolamento';
  btn.className = 'btn-link admin-edit-btn';
  btn.innerHTML = '✎ Modifica regolamento';
  btn.style.cssText = 'display:block;text-align:right;margin-bottom:1rem';
  container.parentNode.insertBefore(btn, container);
}

function _injectPostAdminBtn(postId) {
  if (!postId) return;
  var backLink = document.querySelector('.post-back-link');
  if (!backLink) return;
  var editBtn = document.createElement('a');
  editBtn.href = 'admin-post.html?id=' + encodeURIComponent(postId);
  editBtn.className = 'btn-link admin-edit-btn';
  editBtn.innerHTML = '✎ Modifica post';
  editBtn.style.cssText = 'margin-left:1rem';
  backLink.parentNode.insertBefore(editBtn, backLink.nextSibling);
}
