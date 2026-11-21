(() => {
  if (!window.isSecureContext || !/^https?:$/.test(location.protocol)) return;
  const button = document.getElementById('install-game');
  const help = document.getElementById('install-help');
  const status = document.getElementById('offline-state');
  const standalone = matchMedia('(display-mode: standalone)');
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let offer = null;

  function updateButton() {
    button.hidden = standalone.matches || navigator.standalone === true || !(offer || ios);
    if (button.hidden) help.hidden = true;
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    offer = event;
    updateButton();
  });
  window.addEventListener('appinstalled', () => {
    offer = null;
    button.hidden = help.hidden = true;
  });
  standalone.addEventListener('change', updateButton);
  updateButton();

  button.addEventListener('click', async () => {
    if (offer) {
      const current = offer;
      offer = null;
      updateButton();
      await current.prompt();
    } else if (ios) {
      help.hidden = !help.hidden;
      button.setAttribute('aria-expanded', String(!help.hidden));
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', {updateViaCache: 'none'})
      .then(() => navigator.serviceWorker.ready)
      .then(() => { status.hidden = false; })
      .catch(error => console.warn('Armazenamento offline indisponível.', error));
  }
})();
