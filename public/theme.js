(() => {
  const themes = {
    'deep-ocean': { color: '#101827' },
    ember: { color: '#1b1010' },
    daylight: { color: '#edf4fb' },
    minecraft: { color: '#17231f' }
  };
  const backgrounds = {
    default: '',
    custom: '',
    'minecraft-wallpaper-1': 'https://preview.redd.it/wallpapers-for-pc-or-mobile-v0-lkxwc3oidbog1.jpg?width=768&format=pjpg&auto=webp&s=57d4e77877145b495e5a693a8025c5d5a63d7208',
    'minecraft-wallpaper-2': 'https://preview.redd.it/here-are-some-wallpapaer-i-made-fell-free-to-share-ideas-of-v0-j4b6mhrutqhb1.png?width=1080&crop=smart&auto=webp&s=7285be29ad73e6676e71188ba5bc847701491d50'
  };

  function applyTheme(value) {
    const requested = value === 'default' ? 'deep-ocean' : value;
    const theme = Object.prototype.hasOwnProperty.call(themes, requested) ? requested : 'deep-ocean';
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('cccColorTheme', theme);
    document.querySelectorAll('[data-color-theme]').forEach(select => { select.value = theme; });
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themes[theme].color);
  }

  function applyBackground(value, customUrl) {
    const selected = Object.prototype.hasOwnProperty.call(backgrounds, value) ? value : 'default';
    const candidate = selected === 'custom' ? customUrl : backgrounds[selected];
    let url = '';
    if (candidate) try {
      const parsed = new URL(String(candidate), window.location.href);
      if (['http:', 'https:'].includes(parsed.protocol)) url = parsed.href;
    } catch {}
    const safeUrl = url.replace(/["\\\r\n]/g, '');
    document.documentElement.dataset.background = selected;
    document.documentElement.style.setProperty('--page-background-image', safeUrl ? `linear-gradient(rgba(10, 16, 14, .48), rgba(10, 16, 14, .48)), url("${safeUrl}")` : '');
    localStorage.setItem('cccBackground', selected);
    if (selected === 'custom') localStorage.setItem('cccCustomBackground', String(customUrl || ''));
    document.querySelectorAll('[data-background-choice]').forEach(select => { select.value = selected; });
    document.querySelectorAll('[data-background-url]').forEach(input => { input.value = localStorage.getItem('cccCustomBackground') || ''; });
  }

  applyTheme(localStorage.getItem('cccColorTheme') || 'deep-ocean');
  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(localStorage.getItem('cccColorTheme') || 'deep-ocean');
    document.querySelectorAll('[data-color-theme]').forEach(select => {
      select.addEventListener('change', event => applyTheme(event.target.value));
    });
    document.querySelectorAll('[data-background-choice]').forEach(select => {
      select.addEventListener('change', event => applyBackground(event.target.value, document.querySelector('[data-background-url]')?.value));
    });
    document.querySelectorAll('[data-background-apply]').forEach(button => {
      button.addEventListener('click', () => applyBackground('custom', document.querySelector('[data-background-url]')?.value));
    });
  });
  applyBackground(localStorage.getItem('cccBackground') || 'default', localStorage.getItem('cccCustomBackground') || '');
  window.CCCTheme = { apply: applyTheme, applyBackground };
})();
