import { enableZoom } from '../../../src/zoom';

// The page arrives drawn. A diagram that was shrunk to fit its card can be zoomed and panned.
for (const figure of document.querySelectorAll<HTMLElement>('.example-figure')) {
  const holders = figure.querySelectorAll<HTMLElement>('.example-wide, .example-medium, .example-narrow');
  for (const holder of holders.length > 0 ? holders : [figure]) enableZoom(holder);
}
