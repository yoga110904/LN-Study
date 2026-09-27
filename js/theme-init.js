// Dipasang sebelum CSS supaya tidak ada kedipan tema. File terpisah (bukan inline) agar lolos CSP.
try {
  var t = localStorage.getItem("theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
} catch (e) {}
