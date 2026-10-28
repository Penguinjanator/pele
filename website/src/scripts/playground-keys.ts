export const isRtl = (element: Element) => getComputedStyle(element).direction === 'rtl';

export function setupArrowKeys(buttons: HTMLButtonElement[]) {
  buttons.forEach((button, index) => {
    button.addEventListener('keydown', (event) => {
      const forward = isRtl(button) ? 'ArrowLeft' : 'ArrowRight';
      const backward = forward === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
      let next: number;
      if (event.key === forward) next = (index + 1) % buttons.length;
      else if (event.key === backward) next = (index + buttons.length - 1) % buttons.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = buttons.length - 1;
      else return;
      event.preventDefault();
      buttons[next].click();
      buttons[next].focus();
    });
  });
}
