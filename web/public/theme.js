// Applies the saved theme before first paint (external file: CSP forbids inline scripts).
try {
  var t = localStorage.getItem('vc-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {}
