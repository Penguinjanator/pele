import { laneLayout } from '../../layout/lanes.js';
import type { Diagram } from '../../types.js';
import type { FlowDb } from '../flowchart/db.js';
import type { FlowGraph } from '../flowchart/graph.js';
import { flowchart } from '../flowchart/index.js';
import { renderFlowchart, type FlowVariant } from '../flowchart/render.js';
import type { FlowchartModel } from '../flowchart/types.js';

export type SwimlaneModel = FlowchartModel;

const DEFAULT_LANE = '__swimlane_default__';

// Nodes outside every lane share one unnamed lane, as in Mermaid. Lanes all run the same way,
// so a `direction` inside a subgraph has no effect.
function prepare(graph: FlowGraph): void {
  let loose = false;
  for (const node of graph.nodes) {
    if (node.isGroup) node.dir = undefined;
    else if (node.parentId === undefined) loose = true;
  }
  if (!loose) return;
  for (const node of graph.nodes) if (!node.isGroup && node.parentId === undefined) node.parentId = DEFAULT_LANE;
  graph.nodes.push({
    id: DEFAULT_LANE,
    label: undefined,
    labelType: 'text',
    shape: 'rect',
    isGroup: true,
    parentId: undefined,
    cssStyles: [],
    cssCompiledStyles: [],
    cssClasses: '',
    dir: undefined,
  });
}

const variant: FlowVariant = { type: 'swimlane', prepare, layout: laneLayout };

// A swimlane diagram is a flowchart whose top-level subgraphs are lanes: same syntax, same model.
export const swimlane: Diagram<FlowDb> = {
  type: 'swimlane',
  parse: flowchart.parse,
  render: (db, config, options) => renderFlowchart(db, config, options, variant),
};
