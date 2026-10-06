import type { Config } from '../../preprocess.js';
import { esc, labelSvg, num } from '../../svg/builder.js';
import { ARROW, marker } from '../../svg/edges.js';
import { svgDocument } from '../../svg/root.js';
import { RADIUS } from '../../svg/theme.js';
import { layoutLabel, type Label } from '../../text/label.js';
import { Style, defaultMeasurer, type TextMeasurer } from '../../text/measurer.js';
import type { RenderOptions, Rendered } from '../../types.js';
import type { IshikawaModel, IshikawaNode } from './types.js';

// How far a bone moves toward the tail for each unit it rises from the spine.
const SLANT = 0.5;
const LENGTH = Math.hypot(SLANT, 1);
const FIRST_ROW = 14;
const ROW_GAP = 6;
const BONE_END = 8;
const TWIG_STEP = 22;
const STUB = 18;
const TEXT_GAP = 5;
const PAIR_GAP = 26;
const HEAD_GAP = 34;
const TAIL = 28;
const BOX_PAD_X = 10;
const BOX_PAD_Y = 5;

// A cause below a category. Bones at even depths run level, from the slanted bone above them
// toward the tail; bones at odd depths slant away from the spine, from the level bone above them.
interface Bone {
  label: Label;
  depth: number;
  parent: number;
  // Its place among its siblings, counted from the spine outward.
  slot: number;
  kids: number;
  // How far its row is from the spine.
  rise: number;
  // Where it meets its parent, measured level from the category's bone: 0 on it, negative toward the tail.
  at: number;
  // Where its text ends.
  textEnd: number;
}

interface Category {
  node: IshikawaNode;
  label: Label;
  boxW: number;
  boxH: number;
  bones: Bone[];
  // The length of its bone, as distance from the spine.
  rise: number;
  // How far its causes reach toward the tail, measured level from its bone.
  reach: number;
}

interface Frame {
  node: IshikawaNode;
  depth: number;
  parent: number;
  slot: number;
  // Set when the bone was made and only its row is still to come.
  bone: number;
}

// Gives every cause of a category a row of its own, so that no two texts can meet, and measures
// how far the whole of it reaches. A level bone takes the row nearest the spine and its twigs the
// rows beyond; a slanted twig takes the row beyond everything that hangs off it. The outline may
// be nested as deep as its indentation goes, so the walk keeps a stack of its own.
function arrange(node: IshikawaNode, up: boolean, measurer: TextMeasurer, size: number, small: number): Category {
  const label = layoutLabel(node.text, false, measurer, size, 180);
  const lineHeight = Math.round(small * 1.5);
  const bones: Bone[] = [];
  const rows: number[] = [];
  const stack: Frame[] = [];
  // Above the spine the first cause goes farthest out, so that the causes read from the top down.
  const push = (children: IshikawaNode[], depth: number, parent: number): void => {
    const n = children.length;
    for (let slot = n - 1; slot >= 0; slot--) {
      stack.push({ node: children[up ? n - 1 - slot : slot], depth, parent, slot, bone: -1 });
    }
  };
  push(node.children, 2, -1);
  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.bone !== -1) {
      rows.push(frame.bone);
      continue;
    }
    const index = bones.length;
    bones.push({
      label: layoutLabel(frame.node.text, false, measurer, small, 200),
      depth: frame.depth,
      parent: frame.parent,
      slot: frame.slot,
      kids: frame.node.children.length,
      rise: 0,
      at: 0,
      textEnd: 0,
    });
    if (frame.depth % 2 === 0) rows.push(index);
    else {
      frame.bone = index;
      stack.push(frame);
    }
    push(frame.node.children, frame.depth + 1, index);
  }

  let rise = FIRST_ROW;
  for (const index of rows) {
    const height = Math.max(bones[index].label.height, lineHeight) + ROW_GAP;
    bones[index].rise = rise + height / 2;
    rise += height;
  }
  const boxW = label.width + 2 * BOX_PAD_X;
  let reach = boxW / 2;
  for (const bone of bones) {
    const parent = bone.parent === -1 ? undefined : bones[bone.parent];
    if (bone.depth % 2 === 0) {
      bone.at = parent ? parent.at : 0;
      bone.textEnd = bone.at - (bone.kids > 0 ? (bone.kids + 1) * TWIG_STEP : STUB) - TEXT_GAP;
    } else {
      // Twigs stand along their level bone, the one nearest the spine nearest the tail.
      bone.at = parent!.at - (parent!.kids - bone.slot) * TWIG_STEP;
      bone.textEnd = bone.at - TEXT_GAP;
    }
    reach = Math.max(reach, bone.label.width - bone.textEnd);
  }
  return { node, label, boxW, boxH: label.height + 2 * BOX_PAD_Y, bones, rise: rise + BONE_END, reach };
}

export function renderIshikawa(model: IshikawaModel, _config: Config, options: RenderOptions): Rendered {
  const size = options.fontSize ?? 16;
  const small = Math.round(size * 0.875);
  const measurer = options.measurer ?? defaultMeasurer(options.fontFamily);
  const pad = options.padding ?? 8;
  const root = model.root;
  const title = layoutLabel(model.title, false, measurer, size, 4000, Style.Bold);
  const titleHeight = title.height > 0 ? title.height + 12 : 0;

  let body = '';
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  if (root) {
    const head = layoutLabel(root.text, false, measurer, size, 200, Style.Bold);
    const headH = Math.max(head.height + 24, 48);
    const headW = head.width + 24 + headH / 2;
    const categories = root.children.map((node, i) => arrange(node, i % 2 === 0, measurer, size, small));
    // Even a category without causes has a bone long enough to carry its name clear of the head.
    for (const category of categories) category.rise = Math.max(category.rise, headH / 2 + 14);

    // Categories meet the spine in pairs, one above and one below, each pair as far toward the
    // tail from the one before as the wider of the two needs.
    const xs: number[] = [];
    let x = -HEAD_GAP;
    for (let i = 0; i < categories.length; i += 2) {
      if (i > 0) {
        let room = 0;
        for (let side = 0; side < 2; side++) {
          const before = categories[i - 2 + side];
          const next = categories[i + side];
          if (before) room = Math.max(room, before.reach + (next ? next.boxW / 2 : 0));
        }
        x -= room + PAIR_GAP;
      }
      xs.push(x, x);
    }
    const tail = categories.length > 0 ? x - TAIL : -HEAD_GAP;

    maxX = headW;
    minX = tail;
    minY = -headH / 2;
    maxY = headH / 2;
    let groups = '';
    categories.forEach((category, i) => {
      const sign = i % 2 === 0 ? -1 : 1;
      const ax = xs[i];
      const px = (at: number, rise: number): number => ax + at - rise * SLANT;
      const endX = px(0, category.rise);
      const endY = sign * category.rise;
      // The bone stops short of the spine to leave its arrowhead a clean point.
      const trim = ARROW - 1;
      let d = `M${num(ax - (SLANT / LENGTH) * trim)},${num((sign * trim) / LENGTH)}L${num(endX)},${num(endY)}`;
      let texts = '';
      for (const bone of category.bones) {
        const y = sign * bone.rise;
        if (bone.depth % 2 === 0) {
          d += `M${num(px(bone.at, bone.rise))},${num(y)}H${num(px(bone.textEnd + TEXT_GAP, bone.rise))}`;
        } else {
          const from = category.bones[bone.parent].rise;
          d += `M${num(px(bone.at, from))},${num(sign * from)}L${num(px(bone.at, bone.rise))},${num(y)}`;
        }
        const right = px(bone.textEnd, bone.rise);
        texts += labelSvg(bone.label, right - bone.label.width / 2, y, bone.depth > 2 ? ' fill="var(--_m)"' : '');
        minX = Math.min(minX, right - bone.label.width);
      }
      const boxY = endY + sign * (category.boxH / 2);
      minX = Math.min(minX, endX - category.boxW / 2);
      maxX = Math.max(maxX, endX + category.boxW / 2);
      minY = Math.min(minY, boxY - category.boxH / 2);
      maxY = Math.max(maxY, boxY + category.boxH / 2);
      groups +=
        `<g class="pele-ishikawa-category" data-id="${esc(category.node.text)}">` +
        `<path class="pele-ishikawa-bones" d="${d}" fill="none" stroke="var(--_l)"/>` +
        marker('arrow_point', ax, 0, SLANT / LENGTH, -sign / LENGTH, 'var(--_l)') +
        `<rect x="${num(endX - category.boxW / 2)}" y="${num(boxY - category.boxH / 2)}" width="${num(category.boxW)}" height="${num(
          category.boxH
        )}" rx="${RADIUS}" fill="var(--_s)" stroke="var(--_b)"/>` +
        labelSvg(category.label, endX, boxY, ' class="pele-label"') +
        (texts ? `<g class="pele-ishikawa-causes" font-size="${small}">${texts}</g>` : '') +
        '</g>';
    });

    const r = headH / 2;
    body =
      `<path class="pele-ishikawa-spine" d="M${num(tail)},0H${num(-(ARROW - 1))}" fill="none" stroke="var(--_l)"/>` +
      marker('arrow_point', 0, 0, 1, 0, 'var(--_l)') +
      groups +
      `<g class="pele-ishikawa-head" data-id="${esc(root.text)}">` +
      `<path d="M0,${num(-r)}H${num(headW - r)}A${num(r)},${num(r)} 0 0 1 ${num(headW - r)},${num(r)}H0Z" fill="var(--_s)" stroke="var(--_b)" stroke-linejoin="round"/>` +
      labelSvg(head, 12 + head.width / 2, 0, ' class="pele-label" font-weight="bold"') +
      '</g>';
  }

  const inner = Math.max(maxX - minX, title.width);
  const width = Math.ceil(inner + 2 * pad);
  const height = Math.ceil(maxY - minY + titleHeight + 2 * pad);
  const ox = pad + (inner - (maxX - minX)) / 2 - minX;
  const oy = pad + titleHeight - minY;
  const svg = svgDocument(
    'ishikawa',
    width,
    height,
    size,
    options,
    {},
    labelSvg(title, width / 2, pad + title.height / 2, ' class="pele-title" font-weight="bold"') +
      (body ? `<g transform="translate(${num(ox)},${num(oy)})">${body}</g>` : '')
  );
  return { svg, width, height, links: [] };
}
