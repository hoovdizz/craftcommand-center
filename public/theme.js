(() => {
  const themes = {
    default: { color: '#101827' },
    ember: { color: '#1b1010' },
    daylight: { color: '#edf4fb' }
  };

  function applyTheme(value) {
    const theme = Object.hasOwn(themes, value) ? value : 'default';
    if (theme === 'default') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    localStorage.setItem('cccColorTheme', theme);
    document.querySelectorAll('[data-color-theme]').forEach(select => { select.value = theme; });
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themes[theme].color);
  }

  applyTheme(localStorage.getItem('cccColorTheme') || 'default');
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-color-theme]').forEach(select => {
      select.addEventListener('change', event => applyTheme(event.target.value));
    });
  });
  window.CCCTheme = { apply: applyTheme };
})();
