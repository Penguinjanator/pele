import type { DiagramType } from './detect.js';
import type { Config } from './preprocess.js';
import type { TextMeasurer } from './text/measurer.js';

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

export interface Rendered {
  svg: string;
  width: number;
  height: number;
  links: LinkInfo[];
}

export interface RenderResult extends Rendered {
  type: DiagramType;
}

// What a diagram type provides. `source` has been through preprocessing and entity encoding
// and ends with a newline, as Mermaid's parsers expect.
export interface Diagram<Model> {
  type: DiagramType;
  parse(source: string, config: Config, title: string | undefined): Model;
  render(model: Model, config: Config, options: RenderOptions): Rendered;
}
