import { load, JSON_SCHEMA } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { parseYaml } from '../../src/util/yaml.js';

// Pele's YAML reader only has to agree with js-yaml on what Mermaid passes it:
// node metadata (`@{ ... }`) and front matter.
const CASES = [
  '{\n shape: rounded \n}',
  '{\nshape: rounded , label: "DD"\n}',
  '{\n label: "This is }", other: "clock"\n}',
  '{\n animate: true, animation: fast, w: 100, h: 50.5, x: null, y: ~\n}',
  '{\n label: \'single quoted\', icon: "fa:fa-user", form: circle, pos: t \n}',
  '{\n a: [1, 2, three], b: {c: d, e: [f]}\n}',
  '{\n}',
  '\n        shape: circle\n        other: "clock"\n     \n',
  '\n        label: |\n          This is a\n          multiline string\n        other: "clock"\n     \n',
  '\n        label: >\n          folded\n          text\n\n          second paragraph\n        other: 1\n',
  '\n        label: "This is a<br/>multiline string"\n        other: "clock"\n',
  'title: Hello world\nconfig:\n  theme: dark\n  flowchart:\n    curve: linear\n    htmlLabels: false\n',
  'title: "Quoted: title"\ndisplayMode: compact\n',
  'config:\n  themeVariables:\n    primaryColor: "#ff0000"\n    fontSize: 16px\n  look: handDrawn # trailing comment\n',
  'list:\n  - a\n  - b: 1\n    c: 2\n  - [x, y]\nempty:\n',
  'a: 0x1f\nb: -12\nc: 1e3\nd: .5\ne: "12"\nf: True\ng: FALSE\nh: Null\n',
  'key with spaces: plain value\nurl: http://example.com/a#b\n',
  'multi: this is\n  continued on the next line\nnext: 1\n',
  '# only a comment\n',
  '',
  'just a scalar',
  '- 1\n- 2\n',
];

describe('yaml reader', () => {
  for (const source of CASES) {
    it(`agrees with js-yaml on ${JSON.stringify(source).slice(0, 60)}`, () => {
      expect(parseYaml(source) ?? null).toEqual(load(source, { schema: JSON_SCHEMA }) ?? null);
    });
  }

  it('rejects an unterminated flow mapping', () => {
    expect(() => parseYaml('{ a: 1')).toThrow();
    expect(() => load('{ a: 1', { schema: JSON_SCHEMA })).toThrow();
  });
});
