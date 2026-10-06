import type { Config } from '../../preprocess.js';
import type { Diagram } from '../../types.js';
import { FlowDb } from './db.js';
import { parseFlowchart } from './parser.js';
import { renderFlowchart } from './render.js';

export const flowchart: Diagram<FlowDb> = {
  type: 'flowchart',
  parse(source, config, title) {
    const flow = (config.flowchart ?? {}) as Config;
    const db = new FlowDb({ inheritDir: flow.inheritDir === true });
    if (title) db.title = title;
    parseFlowchart(source, db);
    return db;
  },
  render: renderFlowchart,
};
