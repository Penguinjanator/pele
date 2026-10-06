import { render } from 'pele';

document.querySelectorAll<HTMLElement>('[data-pele-example]').forEach((figure) => {
  const draw = () => {
    try {
      const { fontFamily } = getComputedStyle(figure);
      figure.innerHTML = render(figure.dataset.peleExample ?? '', { fontFamily, idPrefix: 'home-' }).svg;
    } catch {
      if (!figure.querySelector('svg')) figure.textContent = 'This diagram could not be rendered.';
    }
  };
  // Labels are measured with the page font, so wait until it is available.
  void document.fonts.ready.then(draw);
});
