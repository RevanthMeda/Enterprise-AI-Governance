(() => {
  const root = document.getElementById("redoc-root");
  const error = document.getElementById("redoc-error");
  const specUrl = root?.dataset.specUrl;

  if (root && specUrl && window.Redoc) {
    window.Redoc.init(specUrl, { scrollYOffset: 16 }, root);
    return;
  }

  if (error) {
    error.style.display = "block";
  }
})();
