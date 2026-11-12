// Tema claro/escuro. Carrega antes do resto para a página não "piscar".
(function () {
  var KEY = 'tw.theme';
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function mode() {
    try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; }
  }
  function apply() {
    var m = mode();
    var dark = m === 'dark' || (m === 'auto' && mq && mq.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.themeMode = m;
  }
  apply();
  if (mq && mq.addEventListener) mq.addEventListener('change', apply);
  window.twTheme = {
    get: mode,
    set: function (m) {
      try { if (m === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, m); } catch (e) { /* sem armazenamento */ }
      apply();
    },
  };
})();
