import { renderAsync } from 'pele/lazy';

// Only the diagram types on the page are fetched.
document.querySelectorAll<HTMLElement>('[data-pele-example]').forEach((figure) => {
  const draw = async () => {
    try {
      const { fontFamily } = getComputedStyle(figure);
      const { svg } = await renderAsync(figure.dataset.peleExample ?? '', { fontFamily, idPrefix: figure.dataset.pelePrefix ?? 'home-' });
      figure.innerHTML = svg;
    } catch {
      if (!figure.querySelector('svg')) figure.textContent = 'This diagram could not be rendered.';
    }
  };
  // Labels are measured with the page font, so wait until it is available.
  void document.fonts.ready.then(draw);
});
