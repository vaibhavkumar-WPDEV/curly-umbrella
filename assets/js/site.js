/* =============================================================================
   site.js — page chrome: theme, mobile nav, sticky header, scroll-spy,
   the demo banner, and the footer email capture.
   ========================================================================== */
(function () {
  'use strict';

  var THEME_KEY = 'nb.theme';
  var BANNER_KEY = 'nb.banner.dismissed';
  var root = document.documentElement;

  /* ------------------------------------------------------------- theme */
  var stored = null;
  try { stored = localStorage.getItem(THEME_KEY); } catch (err) { stored = null; }
  if (stored === 'light' || stored === 'dark') {
    root.setAttribute('data-theme', stored);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    root.setAttribute('data-theme', 'light');
  }

  var themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    var syncThemeLabel = function () {
      var isLight = root.getAttribute('data-theme') === 'light';
      themeToggle.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
    };
    syncThemeLabel();
    themeToggle.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem(THEME_KEY, next); } catch (err) { /* private mode */ }
      syncThemeLabel();
    });
  }

  /* --------------------------------------------------------- demo banner */
  var banner = document.getElementById('demoBanner');
  if (banner) {
    var dismissed = false;
    try { dismissed = localStorage.getItem(BANNER_KEY) === '1'; } catch (err) { dismissed = false; }
    if (dismissed) { banner.hidden = true; }
    banner.addEventListener('click', function (event) {
      if (!event.target.closest('[data-close-banner]')) { return; }
      banner.hidden = true;
      try { localStorage.setItem(BANNER_KEY, '1'); } catch (err) { /* private mode */ }
    });
  }

  /* ----------------------------------------------------------- mobile nav */
  var menuToggle = document.getElementById('menuToggle');
  var nav = document.getElementById('siteNav');
  if (menuToggle && nav) {
    menuToggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      menuToggle.setAttribute('aria-expanded', String(open));
      menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    nav.addEventListener('click', function (event) {
      if (event.target.tagName !== 'A') { return; }
      nav.classList.remove('is-open');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  }

  /* ------------------------------------------------ sticky header + spy */
  var header = document.getElementById('siteHeader');
  var links = Array.prototype.slice.call(document.querySelectorAll('.site-nav a'));
  var sections = links
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  var onScroll = function () {
    if (header) { header.classList.toggle('is-stuck', window.scrollY > 8); }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if ('IntersectionObserver' in window && sections.length) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) { return; }
        links.forEach(function (link) {
          link.classList.toggle('is-active', link.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (section) { observer.observe(section); });
  }

  /* --------------------------------------------------------- email capture */
  var form = document.getElementById('contactForm');
  var status = document.getElementById('contactStatus');
  if (form && status) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var email = form.elements.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        status.textContent = 'That email does not look right — mind checking it?';
        status.className = 'cta__status is-err';
        return;
      }
      // Demo build: no backend. A real deployment posts to the CRM endpoint here.
      try {
        var queue = JSON.parse(localStorage.getItem('nb.proposals') || '[]');
        queue.push({ email: email, at: new Date().toISOString() });
        localStorage.setItem('nb.proposals', JSON.stringify(queue));
      } catch (err) { /* private mode */ }
      status.textContent = 'Thanks — a designer will follow up within one business day.';
      status.className = 'cta__status is-ok';
      form.reset();
    });
  }
})();
