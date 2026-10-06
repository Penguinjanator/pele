import { mountAsync } from 'pele/lazy';

// Only the diagram types on the page are fetched.
document.querySelectorAll<HTMLElement>('[data-pele-example]').forEach((figure) => {
  const draw = async () => {
    try {
      await mountAsync(figure, figure.dataset.peleExample ?? '', { idPrefix: figure.dataset.pelePrefix ?? 'home-' });
    } catch {
      if (!figure.querySelector('svg')) figure.textContent = 'This diagram could not be rendered.';
    }
  };
  // Labels are measured with the page font, so wait until it is available.
  void document.fonts.ready.then(draw);
});
