import type { Config } from '../../preprocess.js';
import { esc, labelSvg, num } from '../../svg/builder.js';
import { svgDocument } from '../../svg/root.js';
import { RADIUS } from '../../svg/theme.js';
import { decodeEntities } from '../../text/entities.js';
import { layoutLabel } from '../../text/label.js';
import { Style, defaultMeasurer } from '../../text/measurer.js';
import type { RenderOptions, Rendered } from '../../types.js';
import { fitText, type Fitted } from '../common/fit-text.js';
import { packetOption, type PacketModel } from './model.js';

export function renderPacket(model: PacketModel, config: Config, options: RenderOptions): Rendered {
  const size = options.fontSize ?? 16;
  const labelSize = Math.round(size * 0.875);
  const bitSize = Math.round(size * 0.625);
  const measurer = options.measurer ?? defaultMeasurer(options.fontFamily);
  const pad = options.padding ?? 8;

  const packet = (config.packet ?? {}) as Config;
  const rowHeight = packetOption(config, 'rowHeight', 32, 1, 400);
  const bitWidth = packetOption(config, 'bitWidth', 32, 1, 400);
  const paddingX = packetOption(config, 'paddingX', 5, 0, 400);
  const paddingY = packetOption(config, 'paddingY', 5, 0, 400);
  const showBits = packet.showBits !== false;
  const descending = packet.bitOrder === 'descending';
  const bitsPerRow = model.bitsPerRow;
  // Bit numbers sit above each row and need room of their own.
  const numbers = showBits ? bitSize + 4 : 0;
  const pitch = numbers + rowHeight + paddingY;

  const gap = Math.min(paddingX, bitWidth - 1);
  const width = model.rows.length > 0 ? bitsPerRow * bitWidth - gap : 0;
  const rowsHeight = model.rows.length > 0 ? model.rows.length * pitch - paddingY : 0;
  const title = layoutLabel(model.title, false, measurer, size, 4000, Style.Bold);
  const titleHeight = title.height > 0 ? title.height + (rowsHeight > 0 ? 12 : 0) : 0;

  // The pieces of a field split across rows share its label, so each width is fitted once.
  const fits = new Map<string, Map<number, Fitted | undefined>>();
  const fit = (label: string, max: number): Fitted | undefined => {
    let byWidth = fits.get(label);
    if (!byWidth) fits.set(label, (byWidth = new Map()));
    if (!byWidth.has(max)) {
      byWidth.set(max, fitText(decodeEntities(label).trim(), max, labelSize, Math.round(size * 0.5), measurer));
    }
    return byWidth.get(max);
  };

  const left = pad + Math.max(0, (title.width - width) / 2);
  let fields = '';
  let bits = '';
  model.rows.forEach((row, index) => {
    const y = pad + index * pitch + numbers;
    for (const block of row) {
      const count = block.end - block.start + 1;
      const first = block.start % bitsPerRow;
      const x = left + (descending ? bitsPerRow - first - count : first) * bitWidth;
      const w = count * bitWidth - gap;
      const text = fit(block.label, w - 6);
      fields +=
        `<g class="pele-node" data-id="${block.start}-${block.end}">` +
        `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(rowHeight)}" rx="${RADIUS}" fill="var(--_s)" stroke="var(--_b)"/>` +
        (text && text.size <= rowHeight
          ? `<text x="${num(x + w / 2)}" y="${num(y + rowHeight / 2 + text.size * 0.35)}"${
              text.size === labelSize ? '' : ` font-size="${num(text.size)}"`
            }>${esc(text.text)}</text>`
          : '') +
        '</g>';
      if (!showBits) continue;
      const leading = descending ? block.end : block.start;
      const trailing = descending ? block.start : block.end;
      if (count === 1) {
        bits += `<text x="${num(x + w / 2)}" y="${num(y - 4)}" text-anchor="middle">${leading}</text>`;
      } else {
        bits +=
          `<text x="${num(x)}" y="${num(y - 4)}">${leading}</text>` +
          `<text x="${num(x + w)}" y="${num(y - 4)}" text-anchor="end">${trailing}</text>`;
      }
    }
  });

  const totalWidth = Math.ceil(Math.max(width, title.width) + 2 * pad);
  const totalHeight = Math.ceil(rowsHeight + titleHeight + 2 * pad);
  const content =
    (fields ? `<g class="pele-packet-fields" font-size="${labelSize}" text-anchor="middle">${fields}</g>` : '') +
    (bits ? `<g class="pele-packet-bits" font-size="${bitSize}" fill="var(--_m)">${bits}</g>` : '') +
    // Mermaid puts a packet's title under it.
    labelSvg(title, totalWidth / 2, totalHeight - pad - title.height / 2, ' class="pele-title" font-weight="bold"');

  return {
    svg: svgDocument('packet', totalWidth, totalHeight, size, options, model, content),
    width: totalWidth,
    height: totalHeight,
    links: [],
  };
}
