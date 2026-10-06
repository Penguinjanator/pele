export interface MermaidSuggestion {
  label: string;
  type: 'keyword' | 'variable' | 'enum' | 'property';
  detail?: string;
  boost?: number;
  apply?: string;
}

export interface MermaidCompletions {
  from: number;
  to: number;
  options: MermaidSuggestion[];
}

type Entry = readonly [label: string, detail?: string];

const suggestions = (entries: readonly Entry[], type: MermaidSuggestion['type'], suffix = ''): MermaidSuggestion[] =>
  entries.map(([label, detail], index) => ({ label, detail, type, boost: Math.max(0, 30 - index), ...(suffix ? { apply: label + suffix } : {}) }));

// The spelling Mermaid's documentation uses for each diagram type.
export const declarations: readonly Entry[] = [
  ['flowchart', 'Flowchart'], ['sequenceDiagram', 'Sequence'], ['classDiagram', 'Class'],
  ['stateDiagram-v2', 'State'], ['erDiagram', 'Entity relationship'], ['gantt', 'Gantt'],
  ['gitGraph', 'Git graph'], ['pie', 'Pie'], ['mindmap', 'Mindmap'], ['kanban', 'Kanban'],
  ['timeline', 'Timeline'], ['journey', 'User journey'], ['quadrantChart', 'Quadrant chart'],
  ['xychart', 'XY chart'], ['requirementDiagram', 'Requirement'], ['sankey', 'Sankey'],
  ['architecture-beta', 'Architecture'], ['C4Context', 'C4 context'], ['C4Container', 'C4 container'],
  ['C4Component', 'C4 component'], ['C4Dynamic', 'C4 dynamic'], ['C4Deployment', 'C4 deployment'],
  ['block', 'Block'], ['swimlane-beta', 'Swimlane'], ['agentflow-beta', 'Agentflow'],
  ['railroad-beta', 'Railroad'], ['treeView-beta', 'Tree view'], ['cynefin-beta', 'Cynefin'],
  ['wardley-beta', 'Wardley map'], ['eventmodeling', 'Event modeling'], ['usecase-beta', 'Use case'],
  ['venn-beta', 'Venn'], ['ishikawa-beta', 'Ishikawa'], ['packet', 'Packet'], ['radar-beta', 'Radar'],
  ['treemap-beta', 'Treemap'], ['info', 'Info'],
];

const styling: readonly Entry[] = [
  ['classDef', 'Define a class'], ['class', 'Apply a class'], ['style', 'Style one element'],
];
const flow: readonly Entry[] = [
  ['subgraph', 'Start a group'], ['end', 'Close a group'], ['direction', 'Direction of a group'],
  ['click', 'Link a node'], ...styling, ['linkStyle', 'Style a link by its number'],
];

// The words that can start a statement, by the type that detectType() reports.
export const keywords: Readonly<Record<string, readonly Entry[]>> = {
  flowchart: flow,
  swimlane: [['subgraph', 'Start a lane'], ['end', 'Close a lane'], ...flow.slice(2)],
  agentflow: [['flow', 'Start an agent'], ['end', 'Close an agent'], ['direction', 'Direction of an agent'], ...flow.slice(3)],
  sequence: [
    ['participant', 'Declare a participant'], ['actor', 'Declare an actor'], ['Note', 'Add a note'],
    ['activate', 'Start an activation'], ['deactivate', 'End an activation'],
    ['loop', 'Repeat'], ['alt', 'Alternative paths'], ['else', 'Next alternative'], ['opt', 'Optional'],
    ['par', 'In parallel'], ['and', 'Next parallel branch'], ['critical', 'Critical region'],
    ['option', 'Next critical branch'], ['break', 'Stop the sequence'], ['rect', 'Highlight a region'],
    ['end', 'Close a block'], ['box', 'Group participants'], ['autonumber', 'Number the messages'],
    ['create', 'Create a participant'], ['destroy', 'Destroy a participant'],
    ['link', 'Add a menu link'], ['links', 'Add menu links'], ['title', 'Title'],
  ],
  class: [
    ['class', 'Declare a class'], ['namespace', 'Group classes'], ['direction', 'Direction'],
    ['note', 'Add a note'], ['click', 'Link a class'], ['link', 'Link a class'],
    ['callback', 'Call a function'], ['classDef', 'Define a style class'],
    ['cssClass', 'Apply a style class'], ['style', 'Style one class'],
  ],
  state: [
    ['state', 'Declare a state'], ['note', 'Add a note'], ['direction', 'Direction'],
    ['classDef', 'Define a class'], ['class', 'Apply a class'],
  ],
  er: [['direction', 'Direction'], ['subgraph', 'Start a group'], ['end', 'Close a group'], ...styling],
  gantt: [
    ['title', 'Title'], ['dateFormat', 'Format of the dates in the source'],
    ['axisFormat', 'Format of the dates on the axis'], ['tickInterval', 'Spacing of the axis ticks'],
    ['section', 'Start a section'], ['excludes', 'Days to skip'], ['includes', 'Days to keep'],
    ['weekday', 'First day of the week'], ['weekend', 'First day of the weekend'],
    ['todayMarker', 'Style or hide the today line'], ['inclusiveEndDates', 'Count the end date'],
    ['topAxis', 'Put the axis on top'], ['click', 'Link a task'],
  ],
  gitGraph: [
    ['commit', 'Add a commit'], ['branch', 'Create a branch'], ['checkout', 'Switch branch'],
    ['switch', 'Switch branch'], ['merge', 'Merge a branch'], ['cherry-pick', 'Copy a commit'],
  ],
  pie: [['title', 'Title']],
  timeline: [['title', 'Title'], ['section', 'Start a section']],
  journey: [['title', 'Title'], ['section', 'Start a section']],
  quadrantChart: [
    ['title', 'Title'], ['x-axis', 'Label the horizontal axis'], ['y-axis', 'Label the vertical axis'],
    ['quadrant-1', 'Top right'], ['quadrant-2', 'Top left'], ['quadrant-3', 'Bottom left'],
    ['quadrant-4', 'Bottom right'], ['classDef', 'Define a class'],
  ],
  xychart: [
    ['title', 'Title'], ['x-axis', 'Horizontal axis'], ['y-axis', 'Vertical axis'],
    ['bar', 'Add a bar series'], ['line', 'Add a line series'],
  ],
  requirement: [
    ['requirement', 'Declare a requirement'], ['functionalRequirement'], ['interfaceRequirement'],
    ['performanceRequirement'], ['physicalRequirement'], ['designConstraint'],
    ['element', 'Declare an element'], ['direction', 'Direction'], ...styling,
  ],
  architecture: [['group', 'Declare a group'], ['service', 'Declare a service'], ['junction', 'Declare a junction']],
  c4: [
    ['title', 'Title'], ['Person'], ['Person_Ext'], ['System'], ['System_Ext'], ['SystemDb'], ['SystemDb_Ext'],
    ['SystemQueue'], ['SystemQueue_Ext'], ['Container'], ['Container_Ext'], ['ContainerDb'], ['ContainerDb_Ext'],
    ['ContainerQueue'], ['ContainerQueue_Ext'], ['Component'], ['Component_Ext'], ['ComponentDb'], ['ComponentQueue'],
    ['Boundary'], ['Enterprise_Boundary'], ['System_Boundary'], ['Container_Boundary'],
    ['Deployment_Node'], ['Node'], ['Node_L'], ['Node_R'],
    ['Rel'], ['BiRel'], ['Rel_Back'], ['Rel_U'], ['Rel_D'], ['Rel_L'], ['Rel_R'], ['RelIndex'],
    ['UpdateElementStyle'], ['UpdateRelStyle'], ['UpdateLayoutConfig'],
  ],
  block: [
    ['columns', 'Number of columns'], ['block', 'Start a nested block'], ['end', 'Close a block'],
    ['space', 'Leave a gap'], ...styling,
  ],
  packet: [['title', 'Title']],
  radar: [
    ['title', 'Title'], ['axis', 'Declare axes'], ['curve', 'Add a data series'], ['max', 'Largest value'],
    ['min', 'Smallest value'], ['graticule', 'Shape of the grid'], ['ticks', 'Number of rings'],
    ['showLegend', 'Show or hide the legend'],
  ],
  treemap: [['classDef', 'Define a class']],
  cynefin: [
    ['title', 'Title'], ['complex', 'Probe, sense, respond'], ['complicated', 'Sense, analyze, respond'],
    ['clear', 'Sense, categorize, respond'], ['chaotic', 'Act, sense, respond'], ['confusion', 'Not yet understood'],
  ],
  wardley: [
    ['title', 'Title'], ['component', 'Place a component'], ['anchor', 'Place a user need'],
    ['evolve', 'Show where a component is heading'], ['evolution', 'Name the stages'],
    ['pipeline', 'Group components'], ['note', 'Add a note'], ['annotation', 'Add a numbered marker'],
    ['annotations', 'Place the marker list'], ['accelerator', 'Add an accelerator'],
    ['deaccelerator', 'Add a brake'], ['size', 'Size of the map'],
  ],
  eventmodeling: [
    ['timeframe', 'Add a step'], ['tf', 'Add a step'], ['resetframe', 'Add a step that starts a new chain'],
    ['rf', 'Add a step that starts a new chain'], ['data', 'Describe the data of a step'],
  ],
  usecase: [
    ['actor', 'Declare an actor'], ['systemBoundary', 'Start a system'], ['end', 'Close a system'],
    ['direction', 'Direction'], ['note', 'Add a note'], ...styling,
  ],
  venn: [['title', 'Title'], ['set', 'Declare a set'], ['union', 'Label an overlap'], ['text', 'Add text to a set'], ['style', 'Style a set']],
  railroad: [['title', 'Title']],
};

const directions: readonly Entry[] = [['TB', 'Top to bottom'], ['BT', 'Bottom to top'], ['LR', 'Left to right'], ['RL', 'Right to left']];
const topDirections: readonly Entry[] = [['TD', 'Top down'], ...directions.slice(1)];
const noteSides: readonly Entry[] = [['right of'], ['left of'], ['over']];

export const flowchartShapes = (
  'rect rounded stadium fr-rect cyl datastore folder bucket console browser person circle bang cloud diam hex ' +
  'lean-r lean-l trap-b trap-t dbl-circ text notch-rect lin-rect sm-circ fr-circ fork hourglass brace brace-r braces ' +
  'bolt doc delay h-cyl lin-cyl curv-trap div-rect tri win-pane f-circ notch-pent flip-tri sl-rect docs st-rect ' +
  'bow-rect cross-circ tag-doc tag-rect flag odd lin-doc'
).split(' ');
export const agentflowShapes = ['task', 'tool', 'input', 'decision', 'refdoc', 'action'];

const styleProperties = [
  'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'color', 'font-size', 'font-weight', 'font-style', 'opacity',
].map((name): Entry => [name + ':']);

const flowTypes = new Set(['flowchart', 'swimlane', 'agentflow']);
// Types whose statements are made of names that are worth offering again.
const nameDetail: Readonly<Record<string, string>> = {
  flowchart: 'Node', swimlane: 'Node', agentflow: 'Node', sequence: 'Participant', class: 'Class', state: 'State',
  er: 'Entity', block: 'Block', architecture: 'Service', requirement: 'Name', usecase: 'Name',
};
// In these, the rest of a line after a colon is free text.
const colonText = new Set(['sequence', 'class', 'state', 'er']);
// In these, a `{` that ends a line opens a block of fields, not of statements.
const fieldBlocks = new Set(['class', 'er', 'requirement']);
const fillers = new Set([
  'as', 'in', 'of', 'right', 'left', 'over', 'for', 'TB', 'TD', 'BT', 'LR', 'RL', 'default',
  'contains', 'copies', 'derives', 'satisfies', 'verifies', 'refines', 'traces', 'href', 'call',
]);
const skipLine = /^(?:classDef|style|linkStyle|click|link|links|callback|direction|title|accTitle|accDescr|autonumber|columns)\b/;

interface Body { lines: string[]; first: number; declaration: number }

// Splits off front matter and finds the line that declares the diagram type.
function body(source: string): Body {
  const lines = source.split('\n');
  let first = 0;
  if (/^---\s*$/.test(lines[0] ?? '')) {
    const close = lines.findIndex((line, index) => index > 0 && /^---\s*$/.test(line));
    first = close < 0 ? lines.length : close + 1;
  }
  let declaration = first;
  while (declaration < lines.length && /^\s*(?:%%.*)?$/.test(lines[declaration])) declaration++;
  return { lines, first, declaration };
}

// A line with everything that is not structure taken out: strings, free text after a colon,
// the arrows that would read as letters, and the contents of labels.
function bare(line: string, type: string): string {
  let text = line.replace(/"[^"]*"?/g, ' ');
  if (colonText.has(type)) text = text.replace(/(?<!:):(?!:)[\s\S]*$/, '');
  if (type === 'sequence') text = text.replace(/\sas\s[\s\S]*$/, '').replace(/(?:<<)?--?(?:>>|>|x|\))/g, ' ');
  if (type === 'er') text = text.replace(/[|}][|o](?:--|\.\.)[|o][|{]/g, ' ');
  if (type === 'architecture') text = text.replace(/:[LRTB]\b|\b[LRTB]:/g, ' ');
  for (let round = 0; round < 3; round++) text = text.replace(/\[[^\[\]]*\]|\([^()]*\)|\{[^{}]*\}|\|[^|]*\|/g, ' ');
  return text;
}

// Calls `visit` for each statement line with its index, skipping blanks, comments, and the
// lines inside a block of fields. Returns whether `until` is inside such a block.
function statements(lines: string[], declaration: number, type: string, until: number, visit?: (text: string, line: string) => void): boolean {
  let fields = false;
  for (let index = declaration + 1; index < Math.min(until, lines.length); index++) {
    const line = lines[index].trim();
    if (fields) { fields = !line.startsWith('}'); continue; }
    if (line === '' || line.startsWith('%%')) continue;
    const text = bare(line, type);
    if (fieldBlocks.has(type) && /\{\s*$/.test(text)) fields = true;
    visit?.(text, line);
  }
  return fields;
}

// The names a diagram already uses: node ids, participants, classes, entities.
export function diagramNames(source: string, type: string): string[] {
  const { lines, declaration } = body(source);
  const reserved = new Set((keywords[type] ?? []).map(([label]) => label));
  const names = new Set<string>();
  const word = type === 'sequence' ? /[A-Za-z_]\w*/g : /[A-Za-z_]\w*(?:-\w+)*/g;
  statements(lines, declaration, type, lines.length, (text, line) => {
    if (skipLine.test(line)) return;
    for (const match of text.matchAll(word)) {
      const name = match[0];
      // A lone `o` or `x` against a link is one of its ends.
      const end = /^[ox]$/.test(name) && /[-=.]/.test((text[match.index - 1] ?? '') + (text[match.index + name.length] ?? ''));
      if (!end && !reserved.has(name) && !fillers.has(name)) names.add(name);
    }
  });
  return [...names];
}

const classNames = (source: string): string[] => [...new Set(
  [...source.matchAll(/^\s*classDef\s+([\w,-]+)/gm)].flatMap((match) => match[1].split(',')).filter((name) => name && name !== 'default'),
)];

const branchNames = (source: string): string[] => [...new Set(
  ['main', ...[...source.matchAll(/^\s*branch\s+(?:"([^"\n]+)"|([\w./-]+))/gm)].map((match) => match[1] ?? match[2])],
)];

const named = (names: string[], detail: string): MermaidSuggestion[] => names.map((label) => ({ label, detail, type: 'variable' }));

type Values = (source: string, type: string) => MermaidSuggestion[];

const sideOrWord = '((?:right|left)(?:\\s\\w*)?|\\w*)$';
const tokens = '(?:(?:[^"\\s]+|"[^"]*")\\s+)*';

// Places where only a fixed set of values, or a kind of name, makes sense. The last group of
// each pattern is the part of the value already typed. The list opens without waiting for a
// letter, unless the entry says otherwise.
const valueContexts: readonly (readonly [types: ReadonlySet<string> | null, pattern: RegExp, values: Values, wait?: boolean])[] = [
  [new Set(['flowchart', 'swimlane']), /@\{[^}]*\bshape:\s*([\w-]*)$/, () => suggestions(flowchartShapes.map((name): Entry => [name]), 'enum')],
  [new Set(['agentflow']), /@\{[^}]*\bshape:\s*([\w-]*)$/, () => suggestions(agentflowShapes.map((name): Entry => [name]), 'enum')],
  [null, /^\s*direction\s+(\w*)$/, () => suggestions(directions, 'enum')],
  [null, /:::([\w-]*)$/, (source) => named(classNames(source), 'Class')],
  [new Set(['flowchart', 'swimlane', 'agentflow', 'state', 'er', 'block', 'requirement', 'usecase']), /^\s*class\s+\S+\s+([\w-]*)$/, (source) => named(classNames(source), 'Class')],
  [new Set(['class']), /^\s*cssClass\s+\S+\s+([\w-]*)$/, (source) => named(classNames(source), 'Class')],
  [null, /^\s*(?:classDef|style)\s+\S+\s+(?:\S*[,;])?([\w-]*)$/, () => suggestions(styleProperties, 'property')],
  [flowTypes, /^\s*linkStyle\s+[\w,]+\s+(?:\S*[,;])?([\w-]*)$/, () => suggestions(styleProperties, 'property')],
  [null, /^\s*click\s+\S+\s+(\w*)$/, () => suggestions([['href', 'Open a link'], ['call', 'Call a function']], 'keyword')],
  [null, /^\s*(?:style|click)\s+([\w-]*)$/, (source, type) => (type in nameDetail ? named(diagramNames(source, type), nameDetail[type]) : [])],
  [new Set(['sequence']), new RegExp('^\\s*[Nn]ote\\s+' + sideOrWord), () => suggestions(noteSides, 'keyword')],
  [new Set(['sequence']), /^\s*(?:[Nn]ote\s+(?:right of|left of|over)\s+(?:[\w-]+\s*,\s*)?|(?:activate|deactivate|destroy)\s+)([\w-]*)$/, (source) => named(diagramNames(source, 'sequence'), 'Participant')],
  [new Set(['state']), new RegExp('^\\s*note\\s+' + sideOrWord), () => suggestions(noteSides.slice(0, 2), 'keyword')],
  [new Set(['state']), /^\s*note\s+(?:right of|left of)\s+([\w-]*)$/, (source) => named(diagramNames(source, 'state'), 'State')],
  [new Set(['class']), /^\s*note\s+(\w*)$/, () => suggestions([['for', 'Attach the note to a class']], 'keyword')],
  [new Set(['class']), /^\s*note\s+for\s+([\w-]*)$/, (source) => named(diagramNames(source, 'class'), 'Class')],
  [new Set(['gitGraph']), /\btype:\s*(\w*)$/, () => suggestions([['NORMAL'], ['REVERSE'], ['HIGHLIGHT']], 'enum')],
  [new Set(['gitGraph']), /^\s*(?:checkout|switch|merge)\s+([\w./-]*)$/, (source) => named(branchNames(source), 'Branch')],
  [new Set(['gitGraph']), new RegExp('^\\s*(?:commit|branch\\s+\\S+|merge\\s+\\S+|cherry-pick)\\s+' + tokens + '(\\w*)$'), () => suggestions([['id:', 'Name the commit'], ['tag:', 'Tag the commit'], ['type:', 'Kind of commit'], ['order:', 'Position of the branch'], ['parent:', 'Parent of a cherry-picked merge']], 'property', ' ')],
  [new Set(['requirement']), /^\s*risk:\s*(\w*)$/, () => suggestions([['low'], ['medium'], ['high']], 'enum')],
  [new Set(['requirement']), /^\s*verifymethod:\s*(\w*)$/, () => suggestions([['analysis'], ['inspection'], ['test'], ['demonstration']], 'enum')],
  [new Set(['requirement']), /\s-\s+(\w*)$/, () => suggestions([['contains'], ['copies'], ['derives'], ['satisfies'], ['verifies'], ['refines'], ['traces']], 'keyword')],
  [new Set(['gantt']), /^(?!\s*(?:title|dateFormat|axisFormat|tickInterval|section|excludes|includes|todayMarker|click)\b)[^:]*:\s*(?:(?:done|active|crit|milestone)\s*,\s*)*(\w*)$/, () => suggestions([['done', 'Finished'], ['active', 'In progress'], ['crit', 'Critical'], ['milestone', 'A single point in time']], 'keyword'), true],
  [new Set(['architecture']), /^\s*(?:service|group|junction)\b.*\sin\s+(\w*)$/, (source) => named([...source.matchAll(/^\s*group\s+(\w+)/gm)].map((match) => match[1]), 'Group')],
  [new Set(['architecture']), /^\s*(?:service|group)\s+\w+\((\w*)$/, () => suggestions([['cloud'], ['database'], ['disk'], ['internet'], ['server']], 'enum')],
  [new Set(['radar']), /^\s*graticule\s+(\w*)$/, () => suggestions([['circle'], ['polygon']], 'enum')],
  [new Set(['radar']), /^\s*showLegend\s+(\w*)$/, () => suggestions([['true'], ['false']], 'enum')],
];

// True when the text ends inside a string or a label, where words are the author's own.
function insideText(prefix: string, type: string): boolean {
  if ((prefix.match(/"/g)?.length ?? 0) % 2 === 1) return true;
  // An ER relationship is drawn with the same characters that open a label elsewhere.
  if (type === 'er') return false;
  const text = prefix.replace(/"[^"]*"/g, '');
  const open = (opener: string, closer: string): boolean => text.split(opener).length > text.split(closer).length;
  return open('[', ']') || open('(', ')') || open('{', '}') || (text.match(/\|/g)?.length ?? 0) % 2 === 1;
}

const requirementFields: readonly Entry[] = [['id:'], ['text:'], ['risk:'], ['verifymethod:'], ['type:'], ['docref:']];

// What can be written at `position`. `type` is what detectType() reports for the source.
// Without `explicit`, a list that is not a fixed set of values waits for the first letter.
export function mermaidCompletions(source: string, position: number, type: string | null, explicit = false): MermaidCompletions | null {
  const { lines, first, declaration } = body(source);
  const lineStart = source.lastIndexOf('\n', position - 1) + 1;
  const lineIndex = source.slice(0, lineStart).split('\n').length - 1;
  const prefix = source.slice(lineStart, position);
  if (lineIndex < first || /^\s*%%/.test(prefix)) return null;
  const suffix = source.slice(position).match(/^[\w-]+/)?.[0] ?? '';
  const result = (typed: string, options: MermaidSuggestion[], fixed = false): MermaidCompletions | null =>
    options.length === 0 || (typed === '' && !fixed && !explicit) ? null : { from: position - typed.length, to: position + suffix.length, options };

  if (lineIndex <= declaration || declaration >= lines.length) {
    const word = prefix.match(/^\s*([\w-]*)$/);
    if (word) return result(word[1], suggestions(declarations, 'keyword'));
    const direction = prefix.match(/^\s*(?:flowchart|graph|swimlane-beta|agentflow-beta)\s+(\w*)$/);
    return direction ? result(direction[1], suggestions(topDirections, 'enum'), true) : null;
  }
  if (type === null) return null;

  // The word at the cursor is not yet a name the diagram uses.
  const typed = prefix.match(/[\w-]*$/)![0];
  const others = source.slice(0, position - typed.length) + source.slice(position + suffix.length);

  for (const [types, pattern, values, wait] of valueContexts) {
    if (types && !types.has(type)) continue;
    const match = prefix.match(pattern);
    if (match) return result(match[match.length - 1], values(others, type), !wait);
  }
  if (insideText(prefix, type)) return null;

  const start = prefix.match(/^\s*([\w-]*)$/);
  if (statements(lines, declaration, type, lineIndex)) {
    return start && type === 'requirement' ? result(start[1], suggestions(requirementFields, 'property', ' ')) : null;
  }
  const names = type in nameDetail ? named(diagramNames(others, type), nameDetail[type]) : [];
  if (start) {
    const apply = type === 'c4' ? '(' : '';
    const words = suggestions(keywords[type] ?? [], 'keyword').map((option) => (apply && option.label !== 'title' ? { ...option, apply: option.label + apply } : option));
    return result(start[1], [...words, ...names]);
  }
  if (skipLine.test(prefix.trimStart())) return null;
  if (colonText.has(type) && /(?<!:):(?!:)/.test(prefix.replace(/"[^"]*"/g, ''))) return null;
  const word = prefix.match(/(?:^|[^\w-])([A-Za-z_][\w-]*)$/) ?? (explicit ? prefix.match(/(?:^|[^\w-])()$/) : null);
  return word ? result(word[1], names) : null;
}
