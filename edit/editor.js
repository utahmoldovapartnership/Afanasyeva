/* Afanasyeva — Client Edit Portal
 * Vanilla JS, no dependencies. Reads/writes content via the GitHub REST API.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Config & persisted settings
   * ------------------------------------------------------------------ */
  var DEFAULTS = { owner: 'utahmoldovapartnership', repo: 'Afanasyeva', branch: 'main' };
  var CFG_KEY = 'afanasyeva-gh';
  var DRAFT_KEY = 'afanasyeva-content';
  var LANGS = ['ru', 'en', 'ro'];

  var cfg = loadCfg();

  function loadCfg() {
    var c = { token: '', owner: DEFAULTS.owner, repo: DEFAULTS.repo, branch: DEFAULTS.branch };
    try {
      var raw = localStorage.getItem(CFG_KEY);
      if (raw) { var p = JSON.parse(raw); for (var k in p) if (p[k] != null) c[k] = p[k]; }
    } catch (e) {}
    return c;
  }
  function persistCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} }

  /* 1-click token auto-connect: #token=... or ?token=... */
  (function autoToken() {
    var tok = null;
    try {
      var h = (location.hash || '').replace(/^#/, '');
      var hp = new URLSearchParams(h.indexOf('=') > -1 ? h : '');
      tok = hp.get('token');
      if (!tok) { var qp = new URLSearchParams((location.search || '').replace(/^\?/, '')); tok = qp.get('token'); }
    } catch (e) {}
    if (tok) {
      cfg.token = tok.trim();
      persistCfg();
      try { history.replaceState(null, '', location.pathname); } catch (e) { location.hash = ''; }
    }
  })();

  /* ------------------------------------------------------------------ *
   * Editable schema  (maps editor fields -> content.json)
   * ------------------------------------------------------------------ */
  function svc(keys) { return keys.map(function (k) { return { t: 'text', key: k }; }); }

  var SECTIONS = [
    { id: 'contacts', ico: '📞', title: 'Контакты', intro: 'Телефон, email, адрес и часы работы.', fields: [
      { t: 'site', key: 'phone', label: 'Телефон (для кнопки «Позвонить»)', input: 'tel', hint: 'Без пробелов, с кодом страны, напр. +37369177796' },
      { t: 'site', key: 'phoneDisplay', label: 'Телефон (как показывать на сайте)', hint: 'Напр. +373 691 77 796' },
      { t: 'site', key: 'email', label: 'Email', input: 'email' },
      { t: 'text', key: 'con_addrval', label: 'Адрес', multiline: true, html: true },
      { t: 'text', key: 'con_days', label: 'Часы работы — основная строка' },
      { t: 'text', key: 'con_closed', label: 'Часы работы — выходные' },
      { t: 'site', key: 'googleMaps', label: 'Ссылка на карту Google', input: 'url' },
      { t: 'site', key: 'googleReview', label: 'Ссылка «Оставьте отзыв»', input: 'url' }
    ]},
    { id: 'social', ico: '📣', title: 'Соцсети', intro: 'Вставьте полные ссылки. Пустое поле прячет иконку.', fields: [
      { t: 'site', key: 'instagram', label: 'Instagram', input: 'url', hint: 'https://instagram.com/...' },
      { t: 'site', key: 'facebook', label: 'Facebook', input: 'url', hint: 'https://facebook.com/...' },
      { t: 'site', key: 'tiktok', label: 'TikTok', input: 'url', hint: 'https://tiktok.com/@...' }
    ]},
    { id: 'brand', ico: '✨', title: 'Логотип и бренд', fields: [
      { t: 'text', key: 'brand', label: 'Название', serif: true },
      { t: 'text', key: 'brandsub', label: 'Подпись под названием' }
    ]},
    { id: 'hero', ico: '🏠', title: 'Главный экран', fields: [
      { t: 'text', key: 'hero_eyebrow', label: 'Надзаголовок' },
      { t: 'text', key: 'hero_title', label: 'Заголовок', serif: true, multiline: true },
      { t: 'text', key: 'hero_lead', label: 'Описание', multiline: true, html: true },
      { t: 'text', key: 'hero_cta1', label: 'Кнопка 1' },
      { t: 'text', key: 'hero_cta2', label: 'Кнопка 2' },
      { t: 'image', slot: 'hero', label: 'Фото главного экрана' }
    ]},
    { id: 'about', ico: '📖', title: 'О студии', fields: [
      { t: 'text', key: 'about_title', label: 'Заголовок', serif: true },
      { t: 'text', key: 'about_body', label: 'Текст, абзац 1', multiline: true },
      { t: 'text', key: 'about_body2', label: 'Текст, абзац 2', multiline: true },
      { t: 'text', key: 'about_cap', label: 'Подпись к фото' },
      { t: 'image', slot: 'about_portrait', label: 'Фото в разделе «О студии»' }
    ]},
    { id: 'prices', ico: '💅', title: 'Услуги и цены', intro: 'Цены (числа) меняются в разметке сайта. Здесь — заголовки и названия услуг.', fields: [].concat(
      [ { t: 'text', key: 'price_title', label: 'Заголовок раздела', serif: true },
        { t: 'text', key: 'price_note', label: 'Примечание под ценами', multiline: true },
        { t: 'note', html: '<strong>Категории</strong>' } ],
      svc(['cat_hair', 'cat_style', 'cat_color', 'cat_brows', 'cat_mani', 'cat_pedi', 'cat_makeup']),
      [ { t: 'note', html: '<strong>Названия услуг</strong>' } ],
      svc(['s_kids','s_women','s_men','s_bioperm','s_long','s_mid','s_curls','s_updo','s_lighttone','s_lightroots','s_hidden','s_ombre','s_highlights','s_labor','s_browshape','s_browtint','s_manigel','s_manicombo','s_strength','s_french','s_design','s_repair','s_removal','s_pedigel','s_pediclassic','s_pediapp','s_pediedge','s_makeup'])
    )},
    { id: 'team', ico: '👩‍🎨', title: 'Команда', fields: [
      { t: 'text', key: 'team_title', label: 'Заголовок раздела', serif: true },
      { t: 'text', key: 'm1_name', label: 'Мастер 1 — имя' },
      { t: 'text', key: 'm1_role', label: 'Мастер 1 — роль' },
      { t: 'image', slot: 'tatiana', label: 'Мастер 1 — фото' },
      { t: 'text', key: 'm2_name', label: 'Мастер 2 — имя' },
      { t: 'text', key: 'm2_role', label: 'Мастер 2 — роль' },
      { t: 'image', slot: 'kristina', label: 'Мастер 2 — фото' },
      { t: 'text', key: 'm3_name', label: 'Мастер 3 — имя' },
      { t: 'text', key: 'm3_role', label: 'Мастер 3 — роль' },
      { t: 'image', slot: 'inna', label: 'Мастер 3 — фото' }
    ]},
    { id: 'gallery', ico: '🖼️', title: 'Галерея', intro: 'Заголовки и фотографии галереи (главная сетка).', fields: [].concat(
      [ { t: 'text', key: 'gal_title', label: 'Заголовок', serif: true },
        { t: 'text', key: 'gal_more', label: 'Кнопка «Смотреть все»' },
        { t: 'note', html: '<strong>Фотографии витрины</strong>' } ],
      ['g6','g3','g4','g8','g13','g7','g12','nails','hair_coloring','makeup','g2','face_paint','g5','g10','g9','g1','g11','toes'].map(function (s) { return { t: 'image', slot: s, label: s }; })
    )},
    { id: 'works', ico: '📸', title: 'Работы (каталог)', intro: 'Фотографии во всплывающем каталоге «Смотреть все работы».', fields:
      Array.apply(null, { length: 28 }).map(function (_, i) { var n = ('0' + (i + 1)).slice(-2); return { t: 'image', slot: 'work' + n, label: 'Работа ' + (i + 1) }; })
    },
    { id: 'beforeafter', ico: '🔁', title: 'До / После', fields: [
      { t: 'text', key: 'ba_title', label: 'Заголовок', serif: true },
      { t: 'text', key: 'ba1_cap', label: 'Пример 1 — подпись' },
      { t: 'image', slot: 'ba1_before', label: 'Пример 1 — ДО' },
      { t: 'image', slot: 'ba1_after', label: 'Пример 1 — ПОСЛЕ' },
      { t: 'text', key: 'ba2_cap', label: 'Пример 2 — подпись' },
      { t: 'image', slot: 'ba2_before', label: 'Пример 2 — ДО' },
      { t: 'image', slot: 'ba2_after', label: 'Пример 2 — ПОСЛЕ' },
      { t: 'text', key: 'ba3_cap', label: 'Пример 3 — подпись' },
      { t: 'image', slot: 'ba3_before', label: 'Пример 3 — ДО' },
      { t: 'image', slot: 'ba3_after', label: 'Пример 3 — ПОСЛЕ' }
    ]},
    { id: 'reviews', ico: '⭐', title: 'Отзывы', fields: [
      { t: 'text', key: 'rev_title', label: 'Заголовок', serif: true },
      { t: 'text', key: 'rev1_text', label: 'Отзыв 1 — текст', multiline: true },
      { t: 'text', key: 'rev1_author', label: 'Отзыв 1 — автор' },
      { t: 'text', key: 'rev2_text', label: 'Отзыв 2 — текст', multiline: true },
      { t: 'text', key: 'rev2_author', label: 'Отзыв 2 — автор' },
      { t: 'text', key: 'rev3_text', label: 'Отзыв 3 — текст', multiline: true },
      { t: 'text', key: 'rev3_author', label: 'Отзыв 3 — автор' }
    ]},
    { id: 'faq', ico: '❓', title: 'Вопросы', fields: [
      { t: 'text', key: 'faq_title', label: 'Заголовок', serif: true },
      { t: 'text', key: 'q1', label: 'Вопрос 1' }, { t: 'text', key: 'a1', label: 'Ответ 1', multiline: true },
      { t: 'text', key: 'q2', label: 'Вопрос 2' }, { t: 'text', key: 'a2', label: 'Ответ 2', multiline: true },
      { t: 'text', key: 'q3', label: 'Вопрос 3' }, { t: 'text', key: 'a3', label: 'Ответ 3', multiline: true },
      { t: 'text', key: 'q4', label: 'Вопрос 4' }, { t: 'text', key: 'a4', label: 'Ответ 4', multiline: true },
      { t: 'text', key: 'q5', label: 'Вопрос 5' }, { t: 'text', key: 'a5', label: 'Ответ 5', multiline: true },
      { t: 'text', key: 'q6', label: 'Вопрос 6' }, { t: 'text', key: 'a6', label: 'Ответ 6', multiline: true }
    ]},
    { id: 'cta', ico: '📅', title: 'Призыв к записи', fields: [
      { t: 'text', key: 'cta_title', label: 'Заголовок', serif: true },
      { t: 'text', key: 'cta_lead', label: 'Текст', multiline: true },
      { t: 'text', key: 'cta_call', label: 'Кнопка «Позвонить»' },
      { t: 'text', key: 'cta_write', label: 'Кнопка «Написать»' }
    ]},
    { id: 'footer', ico: '📄', title: 'Подвал', fields: [
      { t: 'text', key: 'foot_contact', label: 'Заголовок «Контакты»' },
      { t: 'text', key: 'foot_hours', label: 'Заголовок «Часы работы»' },
      { t: 'text', key: 'foot_social', label: 'Заголовок «Соцсети»' },
      { t: 'text', key: 'foot_review', label: 'Кнопка отзыва' },
      { t: 'text', key: 'footer', label: 'Строка копирайта', html: true },
      { t: 'text', key: 'foot_join', label: 'Приглашение в команду', html: true }
    ]},
    { id: 'seo', ico: '🔎', title: 'SEO', intro: 'Заголовок вкладки и описание для поисковиков.', fields: [
      { t: 'text', key: '_title', label: 'Title страницы' },
      { t: 'text', key: '_desc', label: 'Meta description', multiline: true }
    ]}
  ];

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */
  var state = {
    content: { version: 1, updated: '', site: {}, text: {}, images: {} },
    base: null,
    uiLang: 'ru',
    activeSection: SECTIONS[0].id,
    dirty: false,
    uploads: {} // slot -> {name, dataUrl, buffer, type}
  };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ------------------------------------------------------------------ *
   * Load current content (committed JSON + local draft)
   * ------------------------------------------------------------------ */
  function loadContent() {
    fetch('../data/content.json?v=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (json) {
        var c = json || { version: 1, site: {}, text: {}, images: {} };
        c.site = c.site || {}; c.text = c.text || {}; c.images = c.images || {};
        state.base = deepClone(c);
        // overlay local unsaved draft (if present)
        var draft = null;
        try { var raw = localStorage.getItem(DRAFT_KEY); if (raw) draft = JSON.parse(raw); } catch (e) {}
        state.content = draft ? mergeContent(deepClone(c), draft) : deepClone(c);
        state.dirty = !!draft && JSON.stringify(state.content) !== JSON.stringify(state.base);
        buildNav(); buildTabs(); render(); setDirty(state.dirty);
      })
      .catch(function () {
        state.base = { version: 1, site: {}, text: {}, images: {} };
        state.content = deepClone(state.base);
        buildNav(); buildTabs(); render();
        toast('Не удалось загрузить content.json', 'err');
      });
  }
  function mergeContent(base, over) {
    if (over.site) for (var k in over.site) base.site[k] = over.site[k];
    if (over.text) for (var t in over.text) { base.text[t] = Object.assign(base.text[t] || {}, over.text[t]); }
    if (over.images) for (var im in over.images) base.images[im] = over.images[im];
    return base;
  }

  /* ------------------------------------------------------------------ *
   * Rendering
   * ------------------------------------------------------------------ */
  function sectionById(id) { for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].id === id) return SECTIONS[i]; return SECTIONS[0]; }

  function buildNav() {
    var nav = $('#section-nav'); nav.innerHTML = '';
    SECTIONS.forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'nav-item' + (s.id === state.activeSection ? ' active' : '');
      b.type = 'button'; b.dataset.id = s.id;
      b.innerHTML = '<span class="nav-item__ico">' + s.ico + '</span><span>' + s.title + '</span>';
      b.addEventListener('click', function () { go(s.id); closeDrawer(); });
      nav.appendChild(b);
    });
  }
  function buildTabs() {
    var t = $('#tabstrip'); t.innerHTML = '';
    SECTIONS.forEach(function (s) {
      var c = document.createElement('button');
      c.className = 'tabchip' + (s.id === state.activeSection ? ' active' : '');
      c.type = 'button'; c.textContent = s.title; c.dataset.id = s.id;
      c.addEventListener('click', function () { go(s.id); });
      t.appendChild(c);
    });
  }
  function go(id) {
    state.activeSection = id;
    $('#crumb-current').textContent = sectionById(id).title;
    document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.toggle('active', n.dataset.id === id); });
    document.querySelectorAll('.tabchip').forEach(function (n) { n.classList.toggle('active', n.dataset.id === id); });
    var active = document.querySelector('.tabchip.active'); if (active && active.scrollIntoView) active.scrollIntoView({ inline: 'center', block: 'nearest' });
    render();
    $('#content').scrollTop = 0;
  }

  function textVal(key) { var o = state.content.text[key]; return (o && typeof o[state.uiLang] === 'string') ? o[state.uiLang] : ''; }
  function fieldLabel(f) { return f.label || (f.key && textRu(f.key)) || f.key || f.slot; }
  function textRu(key) { var o = state.content.text[key]; return o && o.ru ? o.ru : key; }

  function render() {
    var sec = sectionById(state.activeSection);
    var hasText = sec.fields.some(function (f) { return f.t === 'text'; });
    $('#lang-row').classList.toggle('hide', !hasText);

    var wrap = $('#fields'); wrap.innerHTML = '';
    if (sec.intro) { var p = document.createElement('p'); p.className = 'section-intro'; p.textContent = sec.intro; wrap.appendChild(p); }

    sec.fields.forEach(function (f) {
      if (f.t === 'note') { var n = document.createElement('p'); n.className = 'section-intro'; n.style.marginTop = '8px'; n.innerHTML = f.html; wrap.appendChild(n); return; }
      if (f.t === 'image') { wrap.appendChild(renderImage(f)); return; }
      wrap.appendChild(renderText(f));
    });
  }

  function renderText(f) {
    var box = document.createElement('label'); box.className = 'fld';
    var lab = document.createElement('span'); lab.className = 'fld__label'; lab.textContent = fieldLabel(f); box.appendChild(lab);

    var isSite = f.t === 'site';
    var el;
    if (!isSite && f.multiline) { el = document.createElement('textarea'); }
    else { el = document.createElement('input'); el.type = f.input || 'text'; }
    if (f.serif) el.className = 'is-serif';
    el.value = isSite ? (state.content.site[f.key] != null ? state.content.site[f.key] : '') : textVal(f.key);

    el.addEventListener('input', function () {
      if (isSite) { state.content.site[f.key] = el.value; }
      else {
        if (!state.content.text[f.key]) state.content.text[f.key] = {};
        state.content.text[f.key][state.uiLang] = el.value;
      }
      onEdit();
    });
    box.appendChild(el);

    if (f.html) { var tn = document.createElement('span'); tn.className = 'type-note'; tn.textContent = 'Можно использовать HTML (напр. <br>).'; box.appendChild(tn); }
    if (f.hint) { var h = document.createElement('span'); h.className = 'fld__hint'; h.textContent = f.hint; box.appendChild(h); }
    return box;
  }

  function currentImageSrc(slot) {
    if (state.uploads[slot]) return state.uploads[slot].dataUrl;
    var p = state.content.images[slot];
    if (!p) return '';
    return '../' + p; // paths are relative to site root; editor lives in /edit/
  }

  function renderImage(f) {
    var slot = f.slot;
    var box = document.createElement('div'); box.className = 'media';
    var lab = document.createElement('span'); lab.className = 'media__label'; lab.textContent = fieldLabel(f); box.appendChild(lab);

    var dz = document.createElement('div'); dz.className = 'dropzone';
    var prev = document.createElement('div'); prev.className = 'dropzone__preview';
    var img = document.createElement('img'); img.alt = ''; var src = currentImageSrc(slot); if (src) img.src = src; prev.appendChild(img);
    var main = document.createElement('div'); main.className = 'dropzone__main';
    var hint = document.createElement('div'); hint.className = 'dropzone__hint';
    hint.innerHTML = '<b>Перетащите фото сюда</b> или выберите файл' + (state.uploads[slot] ? '<span class="chip-new">новое</span>' : '');
    var acts = document.createElement('div'); acts.className = 'dropzone__actions';

    var pick = document.createElement('button'); pick.type = 'button'; pick.className = 'btn btn-ghost btn-sm'; pick.textContent = 'Выбрать файл';
    var file = document.createElement('input'); file.type = 'file'; file.accept = 'image/*,video/*'; file.style.display = 'none';
    pick.addEventListener('click', function () { file.click(); });
    file.addEventListener('change', function () { if (file.files && file.files[0]) handleFile(slot, file.files[0]); });

    var reset = document.createElement('button'); reset.type = 'button'; reset.className = 'btn btn-ghost btn-sm'; reset.textContent = 'Отменить';
    reset.style.display = state.uploads[slot] ? '' : 'none';
    reset.addEventListener('click', function () { delete state.uploads[slot]; onEdit(); render(); });

    acts.appendChild(pick); acts.appendChild(reset);
    main.appendChild(hint); main.appendChild(acts);
    var path = document.createElement('div'); path.className = 'dropzone__path'; path.textContent = state.uploads[slot] ? ('Будет загружено: Photos/' + state.uploads[slot].name) : (state.content.images[slot] || '');
    main.appendChild(path);
    dz.appendChild(prev); dz.appendChild(main); dz.appendChild(file); box.appendChild(dz);

    ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('drag'); }); });
    dz.addEventListener('drop', function (e) { var dt = e.dataTransfer; if (dt && dt.files && dt.files[0]) handleFile(slot, dt.files[0]); });
    return box;
  }

  function handleFile(slot, file) {
    if (file.size > 25 * 1024 * 1024) { toast('Файл больше 25 МБ — слишком большой', 'err'); return; }
    var ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    var name = slot.replace(/[^a-z0-9_]/gi, '') + '-' + Date.now() + '.' + ext;
    var frPrev = new FileReader();
    frPrev.onload = function () {
      var frBuf = new FileReader();
      frBuf.onload = function () {
        state.uploads[slot] = { name: name, dataUrl: frPrev.result, buffer: frBuf.result, type: file.type };
        onEdit(); render();
      };
      frBuf.readAsArrayBuffer(file);
    };
    frPrev.readAsDataURL(file);
  }

  /* ------------------------------------------------------------------ *
   * Dirty / draft / toast
   * ------------------------------------------------------------------ */
  function onEdit() { setDirty(true); saveDraft(); }
  function setDirty(v) {
    state.dirty = v;
    var b = $('#save-btn');
    b.classList.toggle('is-dirty', v);
    $('.btn-save__label', b).textContent = v ? 'Сохранить *' : 'Сохранить';
  }
  function saveDraft() {
    try {
      var d = { version: 1, site: state.content.site, text: state.content.text, images: state.content.images };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch (e) {}
  }
  var toastT;
  function toast(msg, kind) {
    var el = $('#toast');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.innerHTML = '<span class="toast__ico">' + (kind === 'ok' ? '✓' : kind === 'err' ? '⚠︎' : 'ℹ︎') + '</span>' + msg;
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add('show'); });
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.classList.remove('show'); setTimeout(function () { el.hidden = true; }, 300); }, 4200);
  }

  /* ------------------------------------------------------------------ *
   * GitHub API
   * ------------------------------------------------------------------ */
  function ghHeaders() {
    return { 'Authorization': 'Bearer ' + cfg.token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  }
  function apiUrl(path) {
    return 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) +
      '/contents/' + path.split('/').map(encodeURIComponent).join('/');
  }
  function utf8ToB64(str) { return btoa(unescape(encodeURIComponent(str))); }
  function bufToB64(buf) {
    var bytes = new Uint8Array(buf), bin = '', chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) { bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)); }
    return btoa(bin);
  }
  function ghGetSha(path) {
    return fetch(apiUrl(path) + '?ref=' + encodeURIComponent(cfg.branch), { headers: ghHeaders(), cache: 'no-store' })
      .then(function (r) {
        if (r.status === 200) return r.json().then(function (j) { return j.sha; });
        if (r.status === 404) return null;
        return r.text().then(function (t) { throw new Error('GitHub ' + r.status + ' (чтение ' + path + '): ' + t.slice(0, 160)); });
      });
  }
  function ghPut(path, b64, message) {
    return ghGetSha(path).then(function (sha) {
      var body = { message: message, content: b64, branch: cfg.branch };
      if (sha) body.sha = sha;
      return fetch(apiUrl(path), { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) })
        .then(function (r) { if (!r.ok) return r.text().then(function (t) { throw new Error('GitHub ' + r.status + ': ' + t.slice(0, 200)); }); return r.json(); });
    });
  }

  function doSave() {
    if (!cfg.token) { openSettings('Сначала подключите GitHub-токен.'); return; }
    setSaving(true);
    var slots = Object.keys(state.uploads);
    // upload media sequentially, then content.json
    var chain = Promise.resolve();
    slots.forEach(function (slot) {
      chain = chain.then(function () {
        var up = state.uploads[slot];
        return ghPut('Photos/' + up.name, bufToB64(up.buffer), 'Edit portal: upload image (' + slot + ')')
          .then(function () { state.content.images[slot] = 'Photos/' + up.name; });
      });
    });
    chain.then(function () {
      state.content.updated = new Date().toISOString();
      var json = JSON.stringify(state.content, null, 2);
      return ghPut('data/content.json', utf8ToB64(json), 'Edit portal: update site content');
    }).then(function () {
      state.uploads = {};
      state.base = deepClone(state.content);
      setDirty(false); saveDraft(); render();
      toast('Сохранено и опубликовано ✓', 'ok');
    }).catch(function (e) {
      toast('Ошибка сохранения: ' + e.message, 'err');
    }).then(function () { setSaving(false); });
  }
  function setSaving(v) {
    var b = $('#save-btn'); b.disabled = v; b.classList.toggle('is-loading', v);
    $('.btn-save__label', b).textContent = v ? 'Сохранение…' : (state.dirty ? 'Сохранить *' : 'Сохранить');
  }

  /* ------------------------------------------------------------------ *
   * Connection status / settings
   * ------------------------------------------------------------------ */
  function setConn(on, text) {
    var c = $('#conn-status');
    c.classList.toggle('is-on', !!on); c.classList.toggle('is-off', on === false);
    $('#conn-text').textContent = text;
  }
  function validate() {
    if (!cfg.token) { setConn(null, 'Не подключено'); return Promise.resolve(false); }
    setConn(null, 'Проверка…');
    return fetch('https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo), { headers: ghHeaders() })
      .then(function (r) {
        if (r.ok) { setConn(true, 'Подключено · ' + cfg.repo); return true; }
        setConn(false, r.status === 404 ? 'Репозиторий не найден' : (r.status === 401 ? 'Неверный токен' : 'Нет доступа (' + r.status + ')'));
        return false;
      })
      .catch(function () { setConn(false, 'Нет сети'); return false; });
  }

  function openSettings(msg) {
    $('#set-token').value = cfg.token || '';
    $('#set-owner').value = cfg.owner; $('#set-repo').value = cfg.repo; $('#set-branch').value = cfg.branch;
    var fb = $('#set-feedback'); fb.className = 'set-feedback'; fb.textContent = msg || '';
    $('#settings-modal').hidden = false;
  }
  function closeSettings() { $('#settings-modal').hidden = true; }

  /* ------------------------------------------------------------------ *
   * Drawer (mobile)
   * ------------------------------------------------------------------ */
  function openDrawer() { $('#app').classList.add('drawer-open'); $('#drawer-backdrop').hidden = false; $('#hamburger').setAttribute('aria-expanded', 'true'); }
  function closeDrawer() { $('#app').classList.remove('drawer-open'); $('#drawer-backdrop').hidden = true; $('#hamburger').setAttribute('aria-expanded', 'false'); }

  /* ------------------------------------------------------------------ *
   * Wire up events
   * ------------------------------------------------------------------ */
  function initEvents() {
    $('#save-btn').addEventListener('click', doSave);
    $('#reset-btn').addEventListener('click', function () {
      if (!state.dirty) { toast('Нет несохранённых изменений'); return; }
      if (!confirm('Отменить все несохранённые изменения?')) return;
      state.content = deepClone(state.base); state.uploads = {};
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
      setDirty(false); render(); toast('Изменения сброшены');
    });
    $('#download-btn').addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(state.content, null, 2)], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'content.json';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });

    // language segmented
    document.querySelectorAll('#lang-seg button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.uiLang = b.dataset.lang;
        document.querySelectorAll('#lang-seg button').forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
        render();
      });
    });

    // drawer
    $('#hamburger').addEventListener('click', function () { $('#app').classList.contains('drawer-open') ? closeDrawer() : openDrawer(); });
    $('#drawer-backdrop').addEventListener('click', closeDrawer);

    // settings
    $('#open-settings').addEventListener('click', function (e) { e.stopPropagation(); openSettings(); });
    $('#conn-status').addEventListener('click', function () { openSettings(); });
    document.querySelectorAll('[data-close-settings]').forEach(function (b) { b.addEventListener('click', closeSettings); });
    $('#set-save').addEventListener('click', function () {
      cfg.token = $('#set-token').value.trim();
      cfg.owner = $('#set-owner').value.trim() || DEFAULTS.owner;
      cfg.repo = $('#set-repo').value.trim() || DEFAULTS.repo;
      cfg.branch = $('#set-branch').value.trim() || DEFAULTS.branch;
      persistCfg(); $('#branch-badge').textContent = cfg.branch;
      closeSettings(); validate();
    });
    $('#set-test').addEventListener('click', function () {
      cfg.token = $('#set-token').value.trim(); cfg.owner = $('#set-owner').value.trim() || DEFAULTS.owner;
      cfg.repo = $('#set-repo').value.trim() || DEFAULTS.repo; cfg.branch = $('#set-branch').value.trim() || DEFAULTS.branch;
      var fb = $('#set-feedback'); fb.className = 'set-feedback'; fb.textContent = 'Проверка…';
      validate().then(function (ok) { fb.className = 'set-feedback ' + (ok ? 'ok' : 'err'); fb.textContent = ok ? 'Подключение работает ✓' : 'Не удалось подключиться. Проверьте токен и доступ.'; });
    });
    $('#set-disconnect').addEventListener('click', function () {
      cfg.token = ''; persistCfg(); $('#set-token').value = '';
      var fb = $('#set-feedback'); fb.className = 'set-feedback'; fb.textContent = 'Токен удалён из этого браузера.';
      validate();
    });

    // warn on unload if dirty
    window.addEventListener('beforeunload', function (e) { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */
  $('#branch-badge').textContent = cfg.branch;
  initEvents();
  loadContent();
  validate();
})();
