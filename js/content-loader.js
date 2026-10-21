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

  function apply(content) {
    if (!content) return;
    applyText(content.text);
    applySite(content.site);
    applyImages(content.images);
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
