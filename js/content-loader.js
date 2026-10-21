/*
 * content-loader.js — Client Edit Portal hydration (additive, non-breaking)
 *
 * Loads data/content.json and overlays it on top of the existing HTML, which
 * stays in place as the default/fallback (SEO, first paint and offline viewing
 * keep working even if this script or the JSON never load).
 *
 * Integrates with the site's own i18n system (window.AfanasyevaSite) so that
 * language switching and all existing styling are preserved untouched.
 */
(function () {
  'use strict';
  var DRAFT_KEY = 'afanasyeva-content';

  function api() { return window.AfanasyevaSite; }

  function applyText(text) {
    var a = api();
    if (!a || !a.I18N || !text) return;
    Object.keys(text).forEach(function (key) {
      var v = text[key];
      if (!v || typeof v !== 'object') return;
      ['ru', 'en', 'ro'].forEach(function (lang) {
        if (typeof v[lang] === 'string' && a.I18N[lang]) {
          a.I18N[lang][key] = v[lang];
        }
      });
    });
  }

  function applySite(site) {
    var a = api();
    if (!site) return;
    if (a && a.SITE) {
      ['email', 'instagram', 'facebook', 'tiktok', 'googleReview', 'googleMaps', 'googleMapsEmbed']
        .forEach(function (k) { if (typeof site[k] === 'string') a.SITE[k] = site[k]; });
    }
    if (site.phone) {
      var tel = 'tel:' + String(site.phone).replace(/\s+/g, '');
      document.querySelectorAll('a[href^="tel:"]').forEach(function (el) { el.setAttribute('href', tel); });
    }
    if (site.phoneDisplay) {
      document.querySelectorAll('[data-phone-text]').forEach(function (el) { el.textContent = site.phoneDisplay; });
    }
    if (site.email) {
      var fe = document.getElementById('foot-email');
      if (fe) fe.textContent = site.email;
    }
  }

  function applyImages(images) {
    if (!images) return;
    Object.keys(images).forEach(function (slot) {
      var path = images[slot];
      if (!path) return;
      document.querySelectorAll('[data-img="' + slot + '"]').forEach(function (img) {
        if (img.getAttribute('src') !== path) img.setAttribute('src', path);
      });
    });
  }

  var LANGS = ['ru', 'en', 'ro'];
  function escText(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return escText(s).replace(/"/g, '&quot;'); }
  function pick(obj, lang) { if (!obj) return ''; if (typeof obj === 'string') return obj; return (obj[lang] != null ? obj[lang] : (obj.ru != null ? obj.ru : '')); }

  // Rebuild the entire prices section (tabs + groups) from a dynamic structure.
  function applyPricing(pricing) {
    if (!pricing || !pricing.categories || !pricing.categories.length) return;
    var tabsWrap = document.querySelector('.tabs');
    var priceWrap = document.querySelector('.pricewrap');
    if (!tabsWrap || !priceWrap) return;
    var a = api();
    var lang = (a && a.getLang) ? a.getLang() : 'ru';
    var tabsHtml = '', groupsHtml = '';

    pricing.categories.forEach(function (cat, ci) {
      var catKey = 'dyncat_' + cat.id;
      if (a && a.I18N) LANGS.forEach(function (l) { if (a.I18N[l]) a.I18N[l][catKey] = pick(cat.name, l) || cat.id; });
      tabsHtml += '<button class="tab" role="tab" aria-selected="' + (ci === 0 ? 'true' : 'false') +
        '" data-cat="' + escAttr(cat.id) + '" data-i18n="' + escAttr(catKey) + '">' + escText(pick(cat.name, lang)) + '</button>';

      var rows = '';
      (cat.services || []).forEach(function (sv) {
        var svKey = 'dynsvc_' + sv.id;
        if (a && a.I18N) LANGS.forEach(function (l) { if (a.I18N[l]) a.I18N[l][svKey] = pick(sv.name, l) || sv.id; });
        var priceHtml = (sv.num != null && sv.num !== '')
          ? (escText(sv.num) + (sv.plus ? '<span class="pl">+</span>' : '') + ' ' + escText(sv.cur || 'MDL'))
          : '';
        rows += '<div class="prow"><span class="nm" data-i18n="' + escAttr(svKey) + '">' + escText(pick(sv.name, lang)) +
          '</span><span class="pr">' + priceHtml + '</span></div>';
      });
      groupsHtml += '<div class="pricegroup" data-group="' + escAttr(cat.id) + '"' + (ci === 0 ? '' : ' hidden') + '>' + rows + '</div>';
    });

    tabsWrap.innerHTML = tabsHtml;
    priceWrap.innerHTML = groupsHtml;
  }

  // Rebuild the "all works" catalog grid from a dynamic list.
  function applyWorks(works) {
    if (!works || !works.length) return;
    var grid = document.getElementById('cat-grid');
    if (!grid) return;
    var html = '';
    works.forEach(function (w) {
      var src = (w && (w.img || w.src)) || w;
      if (!src) return;
      var alt = (w && w.alt) || '';
      html += '<button type="button" class="cat-thumb" data-full="' + escAttr(src) + '" data-alt="' + escAttr(alt) + '">' +
        '<img src="' + escAttr(src) + '" alt="' + escAttr(alt) + '" loading="lazy" decoding="async"></button>';
    });
    grid.innerHTML = html;
  }

  function apply(content) {
    if (!content) return;
    applyText(content.text);
    applySite(content.site);
    applyImages(content.images);
    applyPricing(content.pricing);
    applyWorks(content.works);
    var a = api();
    if (a && a.rerender) a.rerender();
  }

  // 1) Instant local preview from the client's own unsaved draft (if any).
  var draft = null;
  try {
    var raw = localStorage.getItem(DRAFT_KEY);
    if (raw) draft = JSON.parse(raw);
  } catch (e) { /* ignore */ }
  if (draft) apply(draft);

  // 2) Authoritative committed content, then re-apply the local draft so any
  //    unsaved local edits still win in the preview.
  fetch('data/content.json?v=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (json) { if (json) apply(json); if (draft) apply(draft); })
    .catch(function () { /* offline: keep HTML defaults / draft */ });
})();
