(() => {
  const themes = {
    'deep-ocean': { color: '#101827' },
    ember: { color: '#1b1010' },
    daylight: { color: '#edf4fb' }
  };

  function applyTheme(value) {
    const requested = value === 'default' ? 'deep-ocean' : value;
    const theme = Object.prototype.hasOwnProperty.call(themes, requested) ? requested : 'deep-ocean';
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('cccColorTheme', theme);
    document.querySelectorAll('[data-color-theme]').forEach(select => { select.value = theme; });
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themes[theme].color);
  }

  applyTheme(localStorage.getItem('cccColorTheme') || 'deep-ocean');
  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(localStorage.getItem('cccColorTheme') || 'deep-ocean');
    document.querySelectorAll('[data-color-theme]').forEach(select => {
      select.addEventListener('change', event => applyTheme(event.target.value));
    });
  });
  window.CCCTheme = { apply: applyTheme };
})();
