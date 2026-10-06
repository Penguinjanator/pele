import type { DiagramType } from '../detect.js';
import type { Diagram } from '../types.js';
import { flowchart } from './flowchart/index.js';

// Every implemented diagram type. Detection covers more types than this; the rest are unsupported.
const all = [flowchart] as Diagram<unknown>[];

export const diagrams = new Map<DiagramType, Diagram<unknown>>(all.map((d) => [d.type, d]));
