export type DiagramType =
  | 'flowchart'
  | 'sequence'
  | 'class'
  | 'state'
  | 'er'
  | 'pie'
  | 'gantt'
  | 'gitGraph'
  | 'mindmap'
  | 'timeline'
  | 'journey'
  | 'xychart'
  | 'quadrantChart'
  | 'requirement'
  | 'c4'
  | 'sankey'
  | 'block'
  | 'packet'
  | 'kanban'
  | 'architecture'
  | 'radar'
  | 'treemap'
  | 'info'
  | 'agentflow'
  | 'usecase'
  | 'railroad'
  | 'treeView'
  | 'venn'
  | 'cynefin'
  | 'wardley'
  | 'swimlane'
  | 'ishikawa'
  | 'eventmodeling';

// Mermaid's detectors, in the order Mermaid registers them. The first match wins.
const DETECTORS: readonly (readonly [DiagramType, RegExp])[] = [
  ['flowchart', /^\s*flowchart-elk/],
  ['mindmap', /^\s*mindmap/],
  ['architecture', /^\s*architecture/],
  ['agentflow', /^\s*agentflow-beta\b/],
  ['c4', /^\s*C4Context|C4Container|C4Component|C4Dynamic|C4Deployment/],
  ['kanban', /^\s*kanban/],
  ['class', /^\s*classDiagram/],
  ['er', /^\s*erDiagram/],
  ['gantt', /^\s*gantt/],
  ['info', /^\s*info/],
  ['pie', /^\s*pie/],
  ['requirement', /^\s*requirement(Diagram)?/],
  ['sequence', /^\s*sequenceDiagram/],
  ['swimlane', /^\s*swimlane-beta\b/],
  ['flowchart', /^\s*(graph|flowchart)/],
  ['timeline', /^\s*timeline/],
  ['gitGraph', /^\s*gitGraph/],
  ['state', /^\s*stateDiagram/],
  ['journey', /^\s*journey/],
  ['quadrantChart', /^\s*quadrantChart/],
  ['sankey', /^\s*sankey(-beta)?/],
  ['packet', /^\s*packet(-beta)?/],
  ['xychart', /^\s*xychart(-beta)?/],
  ['block', /^\s*block(-beta)?/],
  ['eventmodeling', /^\s*eventmodeling/],
  ['treeView', /^\s*treeView-beta/],
  ['radar', /^\s*radar-beta/],
  ['ishikawa', /^\s*ishikawa(-beta)?\b/i],
  ['treemap', /^\s*treemap/],
  ['railroad', /^\s*railroad-(?:ebnf-|abnf-|peg-)?beta/i],
  ['venn', /^\s*venn-beta/],
  ['wardley', /^\s*wardley-beta/i],
  ['cynefin', /^\s*cynefin-beta(?:[\s:]|$)/],
  ['usecase', /^\s*usecase-beta(?:\s|$)/],
];

export function detect(cleaned: string): DiagramType | null {
  for (const [type, re] of DETECTORS) if (re.test(cleaned)) return type;
  return null;
}
