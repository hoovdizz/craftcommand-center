(() => {
  'use strict';
  let deferredPrompt = null;
  if (!localStorage.getItem('cccDisplayMode')) localStorage.setItem('cccDisplayMode', 'both');
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

  function installButtons() {
    return [...document.querySelectorAll('[data-install-app]')];
  }
  function refreshButtons() {
    installButtons().forEach(button => button.classList.toggle('hidden', standalone()));
  }
  async function triggerInstall() {
    if (standalone()) return;
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => null);
      deferredPrompt = null;
      refreshButtons();
      return;
    }
    if (isIos()) {
      alert('On iPhone or iPad: tap the Share button, then choose “Add to Home Screen”.');
    } else {
      alert('Open your browser menu and choose “Install app” or “Add to Home screen”.');
    }
  }
  function createFirstLoginBanner() {
    if (standalone() || localStorage.getItem('cccInstallPromptSeen') === '1' || document.querySelector('#installBanner')) return;
    const host = document.querySelector('#appView main') || document.querySelector('main');
    if (!host) return;
    const banner = document.createElement('section');
    banner.id = 'installBanner';
    banner.className = 'card wide installBanner';
    banner.innerHTML = `<div><h2>Put CraftCommand Center on this phone</h2><p>Install it as a home-screen app for one-tap access without hunting for the browser bookmark.</p></div><div class="buttonRow"><button class="good" type="button" data-install-app>📲 Install App</button><button type="button" data-dismiss-install>Not now</button></div>`;
    host.prepend(banner);
    banner.querySelector('[data-install-app]').addEventListener('click', triggerInstall);
    banner.querySelector('[data-dismiss-install]').addEventListener('click', () => {
      localStorage.setItem('cccInstallPromptSeen', '1');
      banner.remove();
    });
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    refreshButtons();
  });
  window.addEventListener('appinstalled', () => {
    localStorage.setItem('cccInstallPromptSeen', '1');
    document.querySelector('#installBanner')?.remove();
    refreshButtons();
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-install-app]');
    if (button) triggerInstall();
  });
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  window.CCCPwa = { offerInstall: createFirstLoginBanner, install: triggerInstall };
  refreshButtons();
})();
