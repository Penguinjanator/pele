import { detect, type DiagramType } from './detect.js';
import { PeleError } from './errors.js';
import { encodeEntities, preprocess, type Config } from './preprocess.js';
import { FlowDb } from './diagrams/flowchart/db.js';
import { parseFlowchart } from './diagrams/flowchart/parser.js';
import { renderFlowchart } from './diagrams/flowchart/render.js';
import type { FlowchartModel } from './diagrams/flowchart/types.js';
import type { TextMeasurer } from './text/measurer.js';

export { PeleError } from './errors.js';
export type { PeleErrorCode } from './errors.js';
export type { DiagramType } from './detect.js';
export type { TextMeasurer } from './text/measurer.js';
export type { FlowchartModel } from './diagrams/flowchart/types.js';

export type DiagramModel = FlowchartModel;

export type IconResolver = (name: string) => string | null | undefined;

export interface RenderOptions {
  measurer?: TextMeasurer;
  fontFamily?: string;
  fontSize?: number;
  idPrefix?: string;
  maxWidth?: boolean;
  padding?: number;
  limit?: number;
  icons?: IconResolver;
  config?: Config;
}

export interface LinkInfo {
  id: string;
  href: string;
  internal: boolean;
}

export interface RenderResult {
  svg: string;
  width: number;
  height: number;
  type: DiagramType;
  links: LinkInfo[];
}

const IMPLEMENTED = new Set<DiagramType>(['flowchart']);

interface Parsed {
  type: DiagramType;
  model: DiagramModel;
  config: Config;
}

// Mermaid's default maxTextSize.
const DEFAULT_LIMIT = 50000;

// Deep nesting can exhaust the stack in a few recursive spots. Report it as a limit, not a crash.
function guarded<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof RangeError) throw new PeleError('Diagram is nested too deeply.', 'limit');
    throw error;
  }
}

function parseSource(text: string, limit: number = DEFAULT_LIMIT, extra: Config | undefined): Parsed {
  if (text.length > limit) {
    throw new PeleError(`Diagram source is longer than the limit of ${limit} characters.`, 'limit');
  }
  const pre = preprocess(text);
  const type = detect(pre.text);
  if (type === null) {
    throw new PeleError('No diagram type detected for the given text.', 'unsupported-diagram');
  }
  if (!IMPLEMENTED.has(type)) {
    throw new PeleError(`Diagram type "${type}" is not supported yet.`, 'unsupported-diagram', { type });
  }
  const config = extra ? { ...extra, ...pre.config } : pre.config;
  const flow = (config.flowchart ?? {}) as Config;
  const db = new FlowDb({ inheritDir: flow.inheritDir === true });
  if (pre.title) db.title = pre.title;
  parseFlowchart(encodeEntities(pre.text) + '\n', db);
  return { type, model: db, config };
}

export function detectType(text: string): DiagramType | null {
  return detect(preprocess(text).text);
}

export function supports(text: string): boolean {
  try {
    const type = detectType(text);
    return type !== null && IMPLEMENTED.has(type);
  } catch {
    return false;
  }
}

export function parse(text: string, options: { limit?: number } = {}): DiagramModel {
  return guarded(() => parseSource(text, options.limit, undefined).model);
}

export function render(text: string, options: RenderOptions = {}): RenderResult {
  return guarded(() => {
    const { type, model, config } = parseSource(text, options.limit, options.config);
    return { type, ...renderFlowchart(model as FlowDb, config, options) };
  });
}
