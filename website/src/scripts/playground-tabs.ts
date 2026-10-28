import { setupArrowKeys } from './playground-keys';

export function setupPlaygroundTabs() {
  const root = document.querySelector<HTMLElement>('.playground')!;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-playground-tab]')];
  const mobile = window.matchMedia('(max-width: 760px)');

  const update = () => {
    tabs.forEach((tab) => {
      const name = tab.dataset.playgroundTab!;
      const selected = root.dataset.activePanel === name;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(`${name}-panel`)!;
      if (mobile.matches) panel.setAttribute('role', 'tabpanel');
      else panel.removeAttribute('role');
      panel.setAttribute('aria-labelledby', `${name}-${mobile.matches ? 'tab' : 'heading'}`);
    });
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      root.dataset.activePanel = tab.dataset.playgroundTab;
      update();
    });
  });
  setupArrowKeys(tabs);
  mobile.addEventListener('change', update);
  update();
}
