import type { Config } from '../../preprocess.js';
import { esc, labelSvg, num } from '../../svg/builder.js';
import { svgDocument } from '../../svg/root.js';
import { RADIUS, seriesColor } from '../../svg/theme.js';
import type { Label } from '../../text/label.js';
import { Style, defaultMeasurer } from '../../text/measurer.js';
import type { RenderOptions, Rendered } from '../../types.js';
import { fitLabel, plainLabel } from '../common/fit.js';
import { journeyActors, type JourneyModel } from './db.js';

const PAD_X = 10;
const PAD_Y = 8;
const MIN_TEXT = 124;
const MAX_TEXT = 200;
const GAP = 12;
const BAND_PAD = 6;
const GUTTER = 24;
const LEVEL = 26;
const FACE = 11;
const DOT = 5;
const DOT_STEP = 13;
const LEGEND_GAP = 20;

const EYES = '<circle cx="-3.6" cy="-2.8" r="1.3"/><circle cx="3.6" cy="-2.8" r="1.3"/>';
const MOUTHS = { happy: 'M-5,2A6,6 0 0 0 5,2', neutral: 'M-4.5,4.5H4.5', sad: 'M-5,6.5A6,6 0 0 1 5,6.5' };

function face(x: number, y: number, mood: keyof typeof MOUTHS): string {
  return (
    `<g class="pele-face pele-face-${mood}" transform="translate(${num(x)},${num(y)})">` +
    `<circle r="${FACE}" fill="var(--_bg)" stroke="var(--_l)"/>` +
    `<g fill="var(--_l)">${EYES}</g>` +
    `<path d="${MOUTHS[mood]}" fill="none" stroke="var(--_l)" stroke-linecap="round"/>` +
    '</g>'
  );
}

export function renderJourney(model: JourneyModel, _config: Config, options: RenderOptions): Rendered {
  const size = options.fontSize ?? 16;
  const small = Math.round(size * 0.875);
  const tiny = Math.round(size * 0.75);
  const measurer = options.measurer ?? defaultMeasurer(options.fontFamily);
  const pad = options.padding ?? 8;
  const tasks = model.tasks;
  const n = tasks.length;

  // `Task: 5:` names an actor with no name; Mermaid gives it a dot and an empty legend row.
  const names = journeyActors(tasks).filter((name) => name !== '');
  const actor = new Map<string, number>();
  names.forEach((name, i) => actor.set(name, i));

  // Cards widen, up to a point, for a word that would not fit; past that the word is cut.
  let textW = MIN_TEXT;
  let labels = tasks.map((task) => plainLabel(task.task, measurer, small, textW));
  let widest = 0;
  for (const label of labels) widest = Math.max(widest, label.width);
  if (widest > textW) {
    textW = Math.min(Math.ceil(widest), MAX_TEXT);
    labels = tasks.map((task) => fitLabel(task.task, measurer, small, textW));
  }

  const cardW = textW + 2 * PAD_X;
  const pitch = cardW + GAP;
  const plotW = n > 0 ? n * pitch - GAP : 0;

  const lineH = Math.round(small * 1.5);
  const limit = Math.max(plotW, 240);
  const legend: { name: string; label: Label; x: number; y: number; h: number }[] = [];
  let legendW = 0;
  let legendH = 0;
  let lx = 0;
  for (const name of names) {
    const label = fitLabel(name, measurer, small, limit - 2 * DOT - 6);
    const w = 2 * DOT + 6 + label.width;
    if (lx > 0 && lx + w > limit) {
      lx = 0;
      legendH += 4;
    }
    const y = lx > 0 ? legend[legend.length - 1].y : legendH;
    const h = Math.max(label.height, lineH);
    legend.push({ name, label, x: lx, y, h });
    lx += w;
    legendW = Math.max(legendW, lx);
    legendH = Math.max(legendH, y + h);
    lx += LEGEND_GAP;
  }

  const bodyW = n > 0 ? GUTTER + plotW : 0;
  const title = fitLabel(model.title, measurer, size, Math.max(bodyW, 320), Style.Bold);
  const titleH = title.height > 0 ? title.height + 16 : 0;
  const width = Math.max(bodyW, title.width, n > 0 ? GUTTER + legendW : 0);
  const left = pad + (width - bodyW) / 2 + GUTTER;
  const top = pad + titleH;

  // A band covers a run of tasks that share a section, as in Mermaid; a section with no tasks draws nothing.
  const runs: { start: number; count: number; label: Label | undefined }[] = [];
  let bandH = 0;
  for (let i = 0; i < n; ) {
    let end = i + 1;
    while (end < n && tasks[end].section === tasks[i].section) end++;
    let label: Label | undefined;
    if (tasks[i].section !== '') {
      label = fitLabel(tasks[i].section, measurer, small, (end - i) * pitch - GAP - 2 * PAD_X, Style.Bold);
      bandH = Math.max(bandH, Math.max(label.height, lineH) + 2 * BAND_PAD);
    }
    runs.push({ start: i, count: end - i, label });
    i = end;
  }

  let textH = lineH;
  for (const label of labels) textH = Math.max(textH, label.height);
  const dotsH = names.length > 0 ? 2 * DOT + 6 : 0;
  const cardH = textH + dotsH + 2 * PAD_Y;
  const cardsY = top + (bandH > 0 ? bandH + BAND_PAD : 0);
  const chartTop = cardsY + cardH + FACE + 16;
  const chartBottom = chartTop + 4 * LEVEL;
  const right = left + plotW;

  let body = '';
  let bottom = top;
  if (n > 0) {
    let grid = '';
    let scale = '';
    for (let score = 5; score >= 1; score--) {
      const y = chartTop + (5 - score) * LEVEL;
      grid += `M${num(left - 6)},${num(y)}H${num(right)}`;
      scale += `<text x="${num(left - 12)}" y="${num(y + tiny * 0.35)}">${score}</text>`;
    }
    body +=
      `<path class="pele-grid" d="${grid}" fill="none" stroke="var(--_a)"/>` +
      `<g class="pele-scale" font-size="${tiny}" text-anchor="end" fill="var(--_m)">${scale}</g>`;

    let line = '';
    let stems = '';
    let faces = '';
    const cards: string[] = [];
    tasks.forEach((task, i) => {
      const x = left + i * pitch;
      const cx = x + cardW / 2;
      const score = task.score;
      const level = Number.isNaN(score) ? 3 : Math.min(5, Math.max(1, score));
      const y = chartTop + (5 - level) * LEVEL;
      line += `${i === 0 ? 'M' : 'L'}${num(cx)},${num(y)}`;
      stems += `M${num(cx)},${num(cardsY + cardH)}V${num(y - FACE)}`;
      faces += face(cx, y, score > 3 ? 'happy' : score < 3 ? 'sad' : 'neutral');

      let dots = '';
      const people = task.people.filter((name) => name !== '');
      const step = Math.min(DOT_STEP, (cardW - 2 * PAD_X - 2 * DOT) / Math.max(people.length - 1, 1));
      people.forEach((name, k) => {
        dots +=
          `<circle class="pele-actor" cx="${num(cx + (k - (people.length - 1) / 2) * step)}" cy="${num(cardsY + cardH - PAD_Y - DOT)}" r="${DOT}" fill="${seriesColor(actor.get(name) ?? 0)}" stroke="var(--_s)">` +
          `<title>${esc(name)}</title></circle>`;
      });
      cards.push(
        `<g class="pele-node pele-task" data-id="${esc(task.task.trim())}">` +
          `<rect x="${num(x)}" y="${num(cardsY)}" width="${num(cardW)}" height="${num(cardH)}" rx="${RADIUS}" fill="var(--_s)" stroke="var(--_b)"/>` +
          labelSvg(labels[i], cx, cardsY + PAD_Y + textH / 2, ` font-size="${small}"`) +
          dots +
          '</g>'
      );
    });
    body +=
      `<path class="pele-stems" d="${stems}" fill="none" stroke="var(--_b)" stroke-dasharray="2 3"/>` +
      (n > 1 ? `<path class="pele-edge" d="${line}" fill="none" stroke="var(--_l)" stroke-linejoin="round"/>` : '') +
      faces;

    for (const run of runs) {
      const members = cards.slice(run.start, run.start + run.count).join('');
      if (!run.label) {
        body += members;
        continue;
      }
      const x = left + run.start * pitch;
      const w = run.count * pitch - GAP;
      body +=
        `<g class="pele-cluster pele-section" data-id="${esc(tasks[run.start].section.trim())}">` +
        `<rect x="${num(x)}" y="${num(top)}" width="${num(w)}" height="${num(bandH)}" rx="${RADIUS}" fill="var(--_a)"/>` +
        labelSvg(run.label, x + w / 2, top + bandH / 2, ` font-size="${small}" font-weight="bold"`) +
        members +
        '</g>';
    }
    bottom = chartBottom + FACE;

    if (legend.length > 0) {
      const x0 = left + (plotW - legendW) / 2;
      const y0 = bottom + 16;
      let items = '';
      for (const item of legend) {
        const cy = y0 + item.y + item.h / 2;
        items +=
          `<g class="pele-legend-item" data-id="${esc(item.name)}">` +
          `<circle cx="${num(x0 + item.x + DOT)}" cy="${num(cy)}" r="${DOT}" fill="${seriesColor(actor.get(item.name) ?? 0)}"/>` +
          labelSvg(item.label, x0 + item.x + 2 * DOT + 6 + item.label.width / 2, cy, '') +
          '</g>';
      }
      body += `<g class="pele-legend" font-size="${small}">${items}</g>`;
      bottom = y0 + legendH;
    }
  }

  const totalWidth = Math.ceil(width + 2 * pad);
  const totalHeight = Math.ceil(Math.max(bottom, pad) + pad);
  const content =
    labelSvg(title, pad + width / 2, pad + title.height / 2, ' class="pele-title" font-weight="bold"') + body;
  return {
    svg: svgDocument('journey', totalWidth, totalHeight, size, options, model, content),
    width: totalWidth,
    height: totalHeight,
    links: [],
  };
}
