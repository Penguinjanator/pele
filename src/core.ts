import { detect, type DiagramType } from './detect.js';
import { PeleError } from './errors.js';
import { decodeEntities } from './text/entities.js';
import { encodeEntities, preprocess, type Config } from './preprocess.js';
import type { DiagramModel } from './models.js';
import type { Diagram, RenderOptions, RenderResult } from './types.js';

export { PeleError } from './errors.js';
export type { PeleErrorCode } from './errors.js';
export type { DiagramType } from './detect.js';
export type { TextMeasurer } from './text/measurer.js';
export type { IconResolver, LinkInfo, RenderOptions, RenderResult } from './types.js';
export type { Diagram } from './types.js';

const diagrams = new Map<DiagramType, Diagram<unknown>>();

// Makes diagram types available to render() and parse(). The full entry point registers every
// type; an app that imports this module picks the ones it needs.
export function register(...list: Diagram<any>[]): void {
  for (const diagram of list) diagrams.set(diagram.type, diagram as Diagram<unknown>);
}

export function registered(type: DiagramType): boolean {
  return diagrams.has(type);
}

// Mermaid's default maxTextSize.
const DEFAULT_LIMIT = 50000;
// Mermaid has no limit on its output. A source within the limit can still describe a drawing
// of many megabytes, which would stall the page it is put into.
const DEFAULT_OUTPUT_LIMIT = 4_000_000;

// Deep nesting can exhaust the stack in a few recursive spots. Report it as a limit, not a crash.
function guarded<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof RangeError) throw new PeleError('Diagram is nested too deeply.', 'limit');
    throw error;
  }
}

interface Parsed {
  type: DiagramType;
  diagram: Diagram<unknown>;
  model: unknown;
  config: Config;
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
  const diagram = diagrams.get(type);
  if (diagram === undefined) {
    throw new PeleError(`Diagram type "${type}" is not supported yet.`, 'unsupported-diagram', { type });
  }
  const config = extra ? { ...extra, ...pre.config } : pre.config;
  const source = diagram.keepComments ? pre.withComments : pre.text;
  const model = diagram.parse(encodeEntities(source) + '\n', config, pre.title, pre.lineOffset);
  return { type, diagram, model, config };
}

export function detectType(text: string): DiagramType | null {
  return detect(preprocess(text).text);
}

export function supports(text: string): boolean {
  try {
    const type = detectType(text);
    return type !== null && diagrams.has(type);
  } catch {
    return false;
  }
}

export function parse(text: string, options: { limit?: number } = {}): DiagramModel {
  return guarded(() => parseSource(text, options.limit, undefined).model as DiagramModel);
}

export function render(text: string, options: RenderOptions = {}): RenderResult {
  return guarded(() => {
    const { type, diagram, model, config } = parseSource(text, options.limit, options.config);
    const section = config[diagram.section ?? type];
    const fixed = typeof section === 'object' && section !== null && !Array.isArray(section) && section.useMaxWidth === false;
    const responsive = options.responsive ?? !fixed;
    // The host's icon resolver and the ids in `links` see names as the author meant them, with
    // entity codes turned into their characters, as `data-icon` and `data-id` in the SVG do.
    const resolve = options.icons;
    const icons = resolve && ((name: string) => resolve(decodeEntities(name)));
    const rendered = diagram.render(model, config, { ...options, responsive, icons });
    const outputLimit = options.outputLimit ?? DEFAULT_OUTPUT_LIMIT;
    if (rendered.svg.length > outputLimit) {
      throw new PeleError(`Diagram output is longer than the limit of ${outputLimit} characters.`, 'limit', { type });
    }
    for (const link of rendered.links) link.id = decodeEntities(link.id);
    return { type, ...rendered };
  });
}
