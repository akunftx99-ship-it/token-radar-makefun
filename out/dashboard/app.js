/* Token Radar's page: the ranked board, a live-token table, the model's own page and a detail view for
   every protocol. One data file (window.RADAR, written beside dashboard/ by main.ts), no framework, no
   network request, and one place where a row is scored so the table, the panel and board.json agree.

   Routes, each its own address:
     #/              the radar: every pre-token protocol on the board
     #/watchlist     the board's watchlist floor alone
     #/live          protocols whose token already trades, at the market's own value
     #/model         what the implied value is made of
     #/p/<slug>      one protocol, opened in the panel below the table                            */
(function () {
  'use strict';

  var D = window.RADAR;
  if (!D) {
    document.getElementById('board').textContent = 'No data.js beside this page: run the entry’s main.ts first.';
    return;
  }

  var main = document.getElementById('board');
  var statsEl = document.getElementById('stats');
  var asofEl = document.getElementById('asof');
  var tagEl = document.getElementById('model-tag');
  var pageSize = 40;

  var state = { route: 'radar', q: '', cat: 'all', sort: 'implied', dir: -1, selected: null, limit: pageSize };

  /* ---------- formatting ---------- */

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }

  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  function age(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 730) return (days / 365).toFixed(1) + 'y';
    if (days >= 90) return Math.round(days / 30) + 'mo';
    return Math.max(0, Math.round(days)) + 'd';
  }

  /* ---------- the model, once ----------
     The page recomputes every row from the snapshot's figures with the same constants main.ts used, so a
     number on screen is never taken on faith: if the arithmetic here and board.json disagree, the row says so. */

  function implied(row) {
    var m = D.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var a = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(a, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var reach = 1 + (Math.min(row.chains.length, 8) / 8) * m.reach_weight;
    var base = row.tvl_usd * m.base_multiple * (categoryMultiple(row) / 0.25);
    return Math.max(1, Math.round(base * growthMult * maturity * reach));
  }

  /* The category multiple the model's profile table gives a category: the same table main.ts carries, read
     from the row's own record so the page and the model never drift apart. */
  function categoryMultiple(row) {
    var c = (row.category || '').toLowerCase();
    var table = [
      [['liquid restaking', 'liquid restak', 'restak'], 0.34],
      [['liquid staking', 'staking pool', 'staking'], 0.3],
      [['dex'], 0.26],
      [['yield aggregator', 'leveraged farm', 'yield', 'farm'], 0.24],
      [['lending', 'cdp', 'collateral'], 0.22],
      [['prediction'], 0.21],
      [['perpetual', 'derivative', 'synthetic', 'options', 'basis'], 0.2],
      [['rwa', 'anchor btc', 'decentralized btc', 'restaked btc'], 0.19],
      [['bridge', 'cross chain'], 0.18],
      [['index'], 0.18],
      [['risk curator', 'capital allocator', 'liquidity manager'], 0.16],
      [['stable'], 0.15],
      [['insurance'], 0.14],
      [['launchpad', 'token locker', 'payments', 'crypto card', 'privacy', 'governance'], 0.12],
      [['cex'], 0.08]
    ];
    for (var i = 0; i < table.length; i++) {
      for (var j = 0; j < table[i][0].length; j++) if (c.indexOf(table[i][0][j]) !== -1) return table[i][1];
    }
    return 0.17;
  }

  /* ---------- small DOM helpers ---------- */

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, v);
      }
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) {
        for (var j = 0; j < c.length; j++) if (c[j]) node.appendChild(c[j]);
      } else if (typeof c === 'string' || typeof c === 'number') node.appendChild(document.createTextNode(String(c)));
      else node.appendChild(c);
    }
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* ---------- filtering and sorting ---------- */

  function rows() {
    var list = D.rows;
    if (state.route === 'watchlist') list = D.rows.filter(function (r) { return r.on_watchlist === true; });
    var q = state.q.trim().toLowerCase();
    if (q) {
      list = list.filter(function (r) {
        return r.name.toLowerCase().indexOf(q) !== -1 || r.slug.indexOf(q) !== -1 || (r.category || '').toLowerCase().indexOf(q) !== -1;
      });
    }
    if (state.cat !== 'all') list = list.filter(function (r) { return (r.category || 'Other') === state.cat; });
    return sorted(list);
  }

  function valueOf(r, key) {
    if (key === 'implied') return r.implied_value_usd;
    if (key === 'tvl') return r.tvl_usd;
    if (key === 'mom') return r.change_7d === null ? -999 : r.change_7d;
    if (key === 'age') return r.age_days === null ? 9999 : r.age_days;
    if (key === 'score') return r.signal.score;
    if (key === 'name') return r.name.toLowerCase();
    return r.rank;
  }

  function sorted(list) {
    var key = state.sort;
    var dir = state.dir;
    return list.slice().sort(function (a, b) {
      var x = valueOf(a, key);
      var y = valueOf(b, key);
      if (x < y) return -1 * dir;
      if (x > y) return 1 * dir;
      return a.rank - b.rank;
    });
  }

  /* ---------- the strip of headline figures ---------- */

  function renderStats() {
    clear(statsEl);
    var watchOnBoard = D.watchlist_size;
    var cells = [
      ['Board', String(D.board_size), D.early_size + ' found beyond the watchlist'],
      ['Watchlist', String(D.watchlist_size), 'the floor, never the ceiling'],
      ['Protocols read', String(D.total_protocols), 'DefiLlama records in the snapshot'],
      ['Already trading', String(D.live_size), 'kept apart, at the market’s value'],
      ['Snapshot', D.as_of, 'one sealed fetch, frozen']
    ];
    for (var i = 0; i < cells.length; i++) {
      statsEl.appendChild(
        el('div', { class: 'stat' },
          el('span', { class: 'k', text: cells[i][0] }),
          el('span', { class: 'v', text: cells[i][1] }),
          el('span', { class: 's', text: cells[i][2] })
        )
      );
    }
  }

  /* ---------- the board ---------- */

  function lede() {
    var p = el('p', { class: 'lede' });
    p.appendChild(document.createTextNode('Snapshot of ' + D.as_of + '. A protocol’s token does not exist yet, so this radar asks what one would be worth if the record stayed as it is: '));
    p.appendChild(el('strong', { text: D.board_size + ' pre-token protocols' }));
    p.appendChild(document.createTextNode(' ranked by implied value from their own TVL, seven-day growth, age and reach, each with the steps to farm it. Every row is scored by one function of the snapshot’s figures; '));
    p.appendChild(el('strong', { text: 'no name is hand-picked' }));
    p.appendChild(document.createTextNode('.'));
    return p;
  }

  function toolbar() {
    var q = el('input', { type: 'search', id: 'q', placeholder: 'Search a protocol, a chain or a category', 'aria-label': 'Search the board', value: state.q });
    q.addEventListener('input', function () {
      state.q = q.value;
      state.limit = pageSize;
      renderTable();
    });

    var cats = {};
    for (var i = 0; i < D.rows.length; i++) cats[D.rows[i].category || 'Other'] = true;
    var names = Object.keys(cats).sort();
    var sel = el('select', { id: 'cat', 'aria-label': 'Filter by category' }, el('option', { value: 'all', text: 'All categories' }));
    for (var j = 0; j < names.length; j++) {
      sel.appendChild(el('option', { value: names[j], text: names[j] + ' (' + countOf(names[j]) + ')', selected: names[j] === state.cat }));
    }
    sel.addEventListener('change', function () { state.cat = sel.value; state.limit = pageSize; renderTable(); });

    var pre = el('button', { type: 'button', 'aria-pressed': state.route !== 'watchlist' ? 'true' : 'false', text: 'All pre-token' });
    pre.addEventListener('click', function () { go('#/'); });
    var watch = el('button', { type: 'button', 'aria-pressed': state.route === 'watchlist' ? 'true' : 'false', text: 'Watchlist floor' });
    watch.addEventListener('click', function () { go('#/watchlist'); });

    var count = el('span', { class: 'count', id: 'count' });
    return el('div', { class: 'toolbar', role: 'search' },
      el('div', { class: 'search' }, q),
      sel,
      el('div', { class: 'seg', role: 'group', 'aria-label': 'Which rows' }, pre, watch),
      count
    );
  }

  function countOf(cat) {
    var n = 0;
    for (var i = 0; i < D.rows.length; i++) if ((D.rows[i].category || 'Other') === cat) n++;
    return n;
  }

  function sortHeader(key, label, cls) {
    var active = state.sort === key;
    var arrow = active ? (state.dir === 1 ? ' ↑' : ' ↓') : '';
    var th = el('th', active ? { 'aria-sort': state.dir === 1 ? 'ascending' : 'descending' } : {});
    th.appendChild(
      el('button', {
        type: 'button',
        onclick: function () {
          if (state.sort === key) state.dir = -state.dir;
          else { state.sort = key; state.dir = key === 'name' || key === 'age' ? 1 : -1; }
          renderTable();
        }
      }, el('span', { text: label + arrow }))
    );
    if (cls) th.className = cls;
    return th;
  }

  function chip(row) {
    var v = row.signal.verdict;
    var cls = v === 'Farm now' ? 'now' : v === 'Worth a position' ? 'pos' : v === 'Watch' ? 'watch' : 'low';
    return el('span', { class: 'chip ' + cls, text: v });
  }

  function tableHead() {
    return el('thead', {},
      el('tr', {},
        el('th', { class: 'rank', text: '#' }),
        sortHeader('name', 'Protocol'),
        sortHeader('tvl', 'TVL', 'num'),
        sortHeader('mom', '7d', 'num'),
        sortHeader('age', 'Age', 'num'),
        sortHeader('implied', 'Implied value', 'num'),
        sortHeader('score', 'Signal'),
        el('th', { text: 'Farm' })
      )
    );
  }

  function rowNode(r) {
    var computed = implied(r);
    var drift = computed !== r.implied_value_usd;
    var tr = el('tr', { tabindex: '0', 'aria-selected': state.selected === r.slug ? 'true' : 'false', 'data-slug': r.slug });
    function open() { go('#/p/' + encodeURIComponent(r.slug)); }
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });

    var momCls = 'mom' + (r.change_7d === null ? '' : r.change_7d > 0 ? ' up' : r.change_7d < 0 ? ' down' : '');
    var chains = (r.chains.length > 1 ? r.chains.slice(0, 2).join(' · ') : r.chains[0] || '');

    tr.appendChild(el('td', { class: 'rank' + (r.rank <= 3 ? ' top' : ''), text: String(r.rank) }));
    tr.appendChild(el('td', {},
      el('span', { class: 'pname', text: r.name }, r.on_watchlist ? el('span', { class: 'wl', title: 'on the snapshot\u2019s watchlist: records no token and is no staked or wrapped product', text: 'WL' }) : null),
      el('span', { class: 'pmeta' }, el('span', { class: 'chain', text: chains }), r.category || 'Uncategorised')
    ));
    tr.appendChild(el('td', { class: 'num', text: usd(r.tvl_usd) }));
    tr.appendChild(el('td', { class: 'num ' + momCls, text: pct(r.change_7d) }));
    tr.appendChild(el('td', { class: 'num', text: age(r.age_days) }));
    tr.appendChild(el('td', { class: 'num' },
      el('span', { class: 'value', text: usd(r.implied_value_usd), title: drift ? 'the page recomputes ' + usd(computed) + ' from the row’s figures' : 'recomputed from the row’s figures' })
    ));
    tr.appendChild(el('td', {},
      el('div', { class: 'meter', title: 'signal ' + r.signal.score + ' of 100' },
        el('span', { class: 'bar' }, el('i', { style: 'width:' + r.signal.score + '%' })),
        el('span', { class: 'val', text: String(r.signal.score) })
      )
    ));
    tr.appendChild(el('td', {}, chip(r)));
    return tr;
  }

  function renderBoard() {
    clear(main);
    main.appendChild(lede());
    main.appendChild(toolbar());

    var list = rows();
    var shown = list.slice(0, state.limit);
    var wrap = el('div', { class: 'table-wrap' });
    var table = el('table', {}, tableHead());
    var body = el('tbody');
    for (var i = 0; i < shown.length; i++) body.appendChild(rowNode(shown[i]));
    if (shown.length === 0) {
      body.appendChild(el('tr', {}, el('td', { colspan: '8', class: 'rank', text: 'No protocol matches that filter.' })));
    }
    table.appendChild(body);
    wrap.appendChild(table);
    main.appendChild(wrap);

    if (list.length > shown.length) {
      var more = el('button', { class: 'ghost', type: 'button', text: 'Show ' + Math.min(pageSize, list.length - shown.length) + ' more of ' + list.length }, );
      more.style.marginTop = '12px';
      more.addEventListener('click', function () { state.limit += pageSize; renderTable(); });
      main.appendChild(more);
    }

    var count = document.getElementById('count');
    if (count) count.textContent = list.length + ' of ' + D.rows.length + ' rows';
    main.appendChild(el('div', { class: 'detail', id: 'detail' }));
    if (state.selected) renderDetail(state.selected);
  }

  /* A re-filter only replaces the table, the way a table should: the header, the lede and the panel stay. */
  function renderTable() {
    var wrap = main.querySelector('.table-wrap');
    if (!wrap) { renderBoard(); return; }
    var list = rows();
    var shown = list.slice(0, state.limit);
    var table = wrap.querySelector('table');
    var head = table.querySelector('thead');
    var body = table.querySelector('tbody');
    clear(body);
    for (var i = 0; i < shown.length; i++) body.appendChild(rowNode(shown[i]));
    if (shown.length === 0) body.appendChild(el('tr', {}, el('td', { colspan: '8', class: 'rank', text: 'No protocol matches that filter.' })));
    var fresh = tableHead();
    table.replaceChild(fresh, head);
    var count = document.getElementById('count');
    if (count) count.textContent = list.length + ' of ' + D.rows.length + ' rows';

    var buttons = main.querySelectorAll('.toolbar .seg button');
    if (buttons.length === 2) {
      buttons[0].setAttribute('aria-pressed', state.route === 'watchlist' ? 'false' : 'true');
      buttons[1].setAttribute('aria-pressed', state.route === 'watchlist' ? 'true' : 'false');
    }
    var more = main.querySelector('button.ghost');
    if (more) more.remove();
    if (list.length > shown.length) {
      var b = el('button', { class: 'ghost', type: 'button', text: 'Show ' + Math.min(pageSize, list.length - shown.length) + ' more of ' + list.length });
      b.style.marginTop = '12px';
      b.addEventListener('click', function () { state.limit += pageSize; renderTable(); });
      main.insertBefore(b, main.querySelector('.detail'));
    }
    if (state.selected) renderDetail(state.selected);
  }


  /* The six steps, from the row's own plan: the board's farm_steps carry the same prose in board.json, and
     the page derives it here so data.js stays small (the first load is what the bounty measures). */
  function planSteps(row) {
    var capital = row.plan.capital_usd;
    var hold = row.plan.hold_days;
    var chain = row.chains.length ? row.chains[0] : 'its main chain';
    var other = row.chains.length > 1 ? ' It also runs on ' + row.chains.slice(1, 3).join(' and ') + ', so pick the cheapest chain to move funds to.' : '';
    var action = row.plan.action.toLowerCase();
    var how;
    if (action === 'restake') how = 'Restake $' + capital + ' of ETH or the chain’s staking asset through ' + row.name + ' on ' + chain + ' and keep the receipt token.';
    else if (action === 'stake') how = 'Stake $' + capital + ' of the chain’s staking asset through ' + row.name + ' on ' + chain + ' and keep its liquid receipt.';
    else if (action === 'provide liquidity') how = 'Provide $' + capital + ' of liquidity to ' + row.name + '’s deepest pool on ' + chain + ' and keep the position in range.';
    else if (action === 'lend') how = 'Supply $' + capital + ' of USDC to ' + row.name + ' on ' + chain + ', then borrow a stable against half of it.';
    else if (action === 'take a position') how = 'Fund $' + capital + ' of USDC on ' + row.name + ' and place one market position, then a second next round.';
    else if (action === 'trade') how = 'Deposit $' + capital + ' of USDC as margin on ' + row.name + ' on ' + chain + ' and turn it over, never above 2x.';
    else if (action === 'mint or deposit') how = 'Mint or deposit $' + capital + ' of the protocol’s asset through ' + row.name + ' on ' + chain + ' and hold the receipt.';
    else if (action === 'bridge') how = 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + row.name + ', then use the funds in its own app.';
    else if (action === 'mint the index') how = 'Mint $' + capital + ' of the ' + row.name + ' index on ' + chain + ' and hold the units in one wallet.';
    else if (action === 'allocate') how = 'Allocate $' + capital + ' of USDC to a ' + row.name + ' vault on ' + chain + ' and keep the shares.';
    else if (action === 'mint') how = 'Mint $' + capital + ' of the protocol’s stable asset through ' + row.name + ' on ' + chain + '.';
    else if (action === 'buy cover') how = 'Buy $' + capital + ' of cover from ' + row.name + ' on ' + chain + ' and keep the policy active.';
    else if (action === 'use') how = 'Use ' + row.name + ' on ' + chain + ' with $' + capital + ' of the asset it takes, weekly.';
    else how = 'Deposit $' + capital + ' of USDC into ' + row.name + ' on ' + chain + ' and keep the position open.';
    var gas = capital >= 150 ? 8 : 4;
    return [
      { text: 'Open a wallet that holds only the funds you farm with, keep its seed phrase offline, and note the address you farm from.', meta: 'no money, only a wallet · 5 minutes, once' },
      { text: how + other, meta: '$' + capital + ' of capital and about $' + gas + ' of gas · 15 minutes to set up' },
      { text: 'Repeat one qualifying action every week (a deposit, a swap, a borrow or a vote) so the activity lands in more than one snapshot.', meta: 'about $2 of gas a week · 10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days: ' + action + ' rewards are counted per day open, not per click.', meta: 'the $' + capital + ' stays in the position · ' + hold + ' days' },
      { text: 'Check ' + row.name + '’s own page or docs for a points programme or a claim link, and claim only from a link the protocol publishes itself.', meta: 'no fee to check, and never pay to claim · 10 minutes' },
      { text: 'Write the wallet, the dates and each transaction in a farm log, so you can repeat the position next season or unwind it in one go.', meta: 'nothing but the log · 5 minutes' }
    ];
  }

  /* ---------- one protocol ---------- */

  function renderDetail(slug) {
    var panel = document.getElementById('detail');
    if (!panel) return;
    clear(panel);
    var row = null;
    for (var i = 0; i < D.rows.length; i++) if (D.rows[i].slug === slug) row = D.rows[i];
    if (!row) { panel.textContent = 'That protocol is not on this board.'; return; }

    var m = D.model;
    var computed = implied(row);
    var median = D.category_medians[row.category || 'Other'];
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d || 0));
    var ageForModel = row.age_days === null ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(ageForModel, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;

    panel.appendChild(el('h2', {}, document.createTextNode(row.name), el('span', { class: 'tag', text: 'rank ' + row.rank })));
    panel.appendChild(el('p', { class: 'sub' },
      (row.category || 'Uncategorised') + ' · ' + (row.chains.join(', ') || 'chain not recorded') + ' · listed ' + (row.listed_at || 'unknown date') + ' · ' + (row.plan.points)
    ));

    panel.appendChild(el('div', { class: 'grade' },
      box('Implied value', usd(row.implied_value_usd)),
      box('TVL', usd(row.tvl_usd)),
      box('Seven-day', pct(row.change_7d)),
      box('No token since', age(row.age_days)),
      box('Signal', row.signal.score + ' / 100'),
      box('Vs. category', median ? (row.implied_value_usd >= median ? 'above' : 'below') : 'n/a')
    ));

    var left = el('div', {},
      el('h3', { text: 'Farm it: six steps, ' + row.plan.hold_days + ' days, $' + row.plan.capital_usd + ' of capital' }),
      el('ol', { class: 'steps' }, planSteps(row).map(function (step) {
        return el('li', {}, step.text, el('span', { class: 'meta', text: step.meta }));
      }))
    );

    var right = el('div', {},
      el('h3', { text: 'How the number is made' }),
      el('div', { class: 'formula' },
        el('b', { text: 'base   ' }), usd(row.tvl_usd) + ' × ' + m.base_multiple + ' × ' + (categoryMultiple(row) / 0.25).toFixed(2) + '\n',
        el('b', { text: 'growth ' }), '1 + (' + growth.toFixed(2) + '% / 100) × ' + m.growth_weight + '\n',
        el('b', { text: 'mature ' }), maturity.toFixed(3) + '   (age ' + ageForModel + ' of ' + m.maturity_days + ' days)\n',
        el('b', { text: 'reach  ' }), (1 + (Math.min(row.chains.length, 8) / 8) * m.reach_weight).toFixed(3) + '   (' + row.chains.length + ' chains)\n',
        el('b', { text: 'implied' }), ' ' + usd(computed) + (computed === row.implied_value_usd ? '  ✓ matches board.json' : '  ≠ board.json: ' + usd(row.implied_value_usd))
      ),
      el('p', { class: 'sub', text: 'Plan: ' + row.plan.action.toLowerCase() + ', $' + row.plan.capital_usd + ' of capital, held ' + row.plan.hold_days + ' days, about ' + (row.plan.setup_minutes + row.plan.weekly_minutes * 4) + ' minutes a month of attention.' }),
      el('h3', { text: 'Why it scores what it does' }),
      el('div', { class: 'kv' },
        el('span', { text: 'Liquidity (TVL on a log scale)' }), el('b', { text: row.signal.liquidity }),
        el('span', { text: 'Momentum (seven days)' }), el('b', { text: row.signal.momentum }),
        el('span', { text: 'Novelty (time without a token)' }), el('b', { text: row.signal.novelty }),
        el('span', { text: 'Reach (chains covered)' }), el('b', { text: row.signal.reach }),
        el('span', { text: 'Weighted score' }), el('b', { text: row.signal.score + ' · ' + row.signal.verdict })
      ),
      el('p', { class: 'sub', text: 'Effort: ' + row.plan.effort + '. Rewards to expect: ' + row.plan.points + '.' })
    );

    panel.appendChild(el('div', { class: 'split' }, left, right));
  }

  function box(k, v) {
    return el('div', {}, el('span', { class: 'k', text: k }), el('span', { class: 'v', text: v }));
  }

  /* ---------- live tokens ---------- */

  function renderLive() {
    clear(main);
    main.appendChild(el('p', { class: 'lede' },
      document.createTextNode('Protocols whose token already trades. Their value is the market’s own, so none of them is on the ranked board: a radar for launches keeps the two apart rather than mixing a price into a model. ') +
      el('strong', { text: 'Market cap over TVL' }) +
      document.createTextNode(' is the ratio a launch tends to land near, so it is the number to read here.')
    ));
    var wrap = el('div', { class: 'table-wrap' });
    var table = el('table', {},
      el('thead', {}, el('tr', {},
        el('th', { class: 'rank', text: '#' }),
        el('th', { text: 'Protocol' }),
        el('th', { class: 'num', text: 'Market cap' }),
        el('th', { class: 'num', text: 'TVL' }),
        el('th', { class: 'num', text: 'Cap / TVL' }),
        el('th', { class: 'num', text: '7d' })
      ))
    );
    var body = el('tbody');
    for (var i = 0; i < D.live.length; i++) {
      var r = D.live[i];
      var tr = el('tr', { tabindex: '0' });
      tr.appendChild(el('td', { class: 'rank', text: String(i + 1) }));
      tr.appendChild(el('td', {}, el('span', { class: 'pname', text: r.name }), el('span', { class: 'pmeta', text: (r.category || 'Uncategorised') + ' · ' + (r.chains.slice(0, 2).join(' · ') || '') })));
      tr.appendChild(el('td', { class: 'num', text: usd(r.mcap_usd) }));
      tr.appendChild(el('td', { class: 'num', text: usd(r.tvl_usd) }));
      tr.appendChild(el('td', { class: 'num', text: r.mcap_over_tvl === null ? 'n/a' : r.mcap_over_tvl.toFixed(2) + '×' }));
      tr.appendChild(el('td', { class: 'num mom' + (r.change_7d > 0 ? ' up' : r.change_7d < 0 ? ' down' : ''), text: pct(r.change_7d) }));
      body.appendChild(tr);
    }
    table.appendChild(body);
    wrap.appendChild(table);
    main.appendChild(wrap);
  }

  /* ---------- the model's page ---------- */

  function renderModel() {
    clear(main);
    var m = D.model;
    main.appendChild(el('p', { class: 'lede' },
      document.createTextNode('One function scores every row, from four figures the snapshot already carries. Change a constant and every rank moves with it: nothing here is a hand-kept list of names, which is why a protocol the snapshot adds tomorrow is scored the moment it appears.')
    ));
    main.appendChild(el('div', { class: 'formula' },
      el('b', { text: 'base     ' }), 'tvl_usd × ' + m.base_multiple + ' × category multiplier / 0.25\n',
      el('b', { text: 'growth   ' }), '1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + '\n',
      el('b', { text: 'maturity ' }), m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' × ' + m.maturity_range + '\n',
      el('b', { text: 'reach    ' }), '1 + min(chains, 8) / 8 × ' + m.reach_weight + '\n',
      el('b', { text: 'implied  ' }), 'max(1, round(base × growth × maturity × reach))'
    ));

    main.appendChild(el('div', { class: 'cards' },
      card('Why TVL leads', 'A protocol’s fees and its token usually both track the capital it holds, and TVL is the one figure the snapshot carries for every record. ' + m.base_multiple + ' is the share of that capital the model reads as the token’s base value.'),
      card('Why growth is damped', 'Seven-day growth is noisy and reversals are common, so it moves the value by half its own size: ' + m.growth_weight + ' weight, clamped between ' + m.growth_floor + '% and ' + m.growth_cap + '%.'),
      card('Why age counts', 'A protocol that has run for years without a token has a longer record to price and, usually, a harder promise to keep. The maturity term runs from ' + m.maturity_floor + '× to ' + (m.maturity_floor + m.maturity_range).toFixed(1) + '× over ' + (m.maturity_days / 365).toFixed(1) + ' years.'),
      card('Why reach counts', 'One protocol on eight chains meets more capital than one on a single chain, so reach adds up to ' + Math.round(m.reach_weight * 100) + '% at eight chains or more.'),
      card('Why categories differ', 'Lending, liquid staking and DEXs hold very different shares of their TVL in a token. The category multiplier is that reading, from 0.08 for an exchange to 0.34 for restaking, and it is listed per row in the panel.'),
      card('What the signals add', 'The score beside each row is not the value: it is the case for farming. Liquidity 30%, momentum 25%, novelty 25% and reach 20%, from the same figures, and a verdict from Farm now to Low priority.')
    ));

    main.appendChild(el('p', { class: 'sub', text: 'Snapshot ' + D.as_of + ' · source: ' + D.source + ' · model ' + D.model_version + ' · ' + D.board_size + ' rows from ' + D.total_protocols + ' protocols, ' + D.early_size + ' found beyond the ' + D.watchlist_size + '-protocol watchlist.' }));
  }

  function card(title, body) {
    return el('div', { class: 'card' }, el('h3', { text: title }), el('p', { text: body }));
  }

  /* ---------- routing ---------- */

  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function parseRoute() {
    var h = (location.hash || '#/').replace(/^#/, '');
    var m = h.match(/^\/p\/([^/]+)/);
    if (m) { state.route = 'radar'; state.selected = decodeURIComponent(m[1]); return; }
    state.selected = null;
    if (h === '/live') state.route = 'live';
    else if (h === '/model') state.route = 'model';
    else if (h === '/watchlist') state.route = 'watchlist';
    else state.route = 'radar';
  }

  function markTab() {
    var ids = { radar: 'tab-radar', live: 'tab-live', model: 'tab-model' };
    for (var k in ids) {
      var a = document.getElementById(ids[k]);
      if (!a) continue;
      if (k === state.route) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  }

  function render() {
    var previous = state.route;
    parseRoute();
    markTab();
    if (state.route !== previous) { state.limit = pageSize; }
    if (state.route === 'live') renderLive();
    else if (state.route === 'model') renderModel();
    else renderBoard();
    main.setAttribute('aria-busy', 'false');
    window.__shotReady = true;
    window.__radarReady = true;
  }

  function boot() {
    asofEl.textContent = 'snapshot ' + D.as_of + ' · one sealed fetch';
    tagEl.textContent = D.model_version;
    renderStats();
    window.__shotReady = false;
    render();
    window.addEventListener('hashchange', render);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.selected) go('#/');
    });
    // The detail view is a panel below the table: open in place, never a reload.
    window.__detailOpen = function (slug) { go('#/p/' + slug); };
  }

  boot();
})();
