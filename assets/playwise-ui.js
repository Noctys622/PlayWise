(() => {
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.querySelector('[data-menu-toggle]');
    const menu = document.getElementById('site-menu');
    if (!toggle || !menu) return;
    function close(returnFocus = false) {
      menu.classList.remove('menu-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Ouvrir le menu');
      if (returnFocus) toggle.focus();
    }
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      menu.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    });
    menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => close()));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.classList.contains('menu-open')) close(true);
    });
    document.addEventListener('click', event => {
      if (!event.target.closest('.ui-header')) close();
    });
    window.addEventListener('resize', () => { if (window.innerWidth > 850) close(); });
    document.querySelectorAll('.heart,.fav').forEach(button => {
      if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', 'Ajouter ou retirer des favoris');
    });
  });
})();
