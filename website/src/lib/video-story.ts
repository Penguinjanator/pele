import type { VideoTheme } from './video-themes';

export interface VideoScene {
  name: string;
  steps: string[];
  themes?: VideoTheme[];
}

const launch: VideoScene[] = [
  {
    name: 'Flow',
    steps: [
      'flowchart',
      'flowchart\n  Idea',
      'flowchart\n  Idea --> Build',
      'flowchart\n  Idea --> Build\n  Build --> Review{Ready?}',
      'flowchart\n  Idea --> Build\n  Build --> Review{Ready?}\n  Review -->|Not yet| Build',
      'flowchart\n  Idea --> Build\n  Build --> Review{Ready?}\n  Review -->|Not yet| Build\n  Review -->|Yes| Launch',
    ],
  },
  {
    name: 'XY',
    steps: [
      'xychart\n  x-axis [Jan, Feb, Mar, Apr, May, Jun]\n  y-axis 0 --> 1000\n  bar [0, 0, 0, 0, 0, 0]',
      'xychart\n  x-axis [Jan, Feb, Mar, Apr, May, Jun]\n  y-axis 0 --> 1000\n  bar [10, 0, 0, 0, 0, 0]',
      'xychart\n  x-axis [Jan, Feb, Mar, Apr, May, Jun]\n  y-axis 0 --> 1000\n  bar [10, 25, 0, 0, 0, 0]',
      'xychart\n  x-axis [Jan, Feb, Mar, Apr, May, Jun]\n  y-axis 0 --> 1000\n  bar [10, 25, 65, 0, 0, 0]',
      'xychart\n  x-axis [Jan, Feb, Mar, Apr, May, Jun]\n  y-axis 0 --> 1000\n  bar [10, 25, 65, 160, 0, 0]',
      'xychart\n  x-axis [Jan, Feb, Mar, Apr, May, Jun]\n  y-axis 0 --> 1000\n  bar [10, 25, 65, 160, 400, 0]',
      'xychart\n  x-axis [Jan, Feb, Mar, Apr, May, Jun]\n  y-axis 0 --> 1000\n  bar [10, 25, 65, 160, 400, 1000]',
    ],
  },
  {
    name: 'Git',
    steps: [
      'gitGraph\n  commit id: "Launch"',
      'gitGraph\n  commit id: "Launch"\n  branch feature\n  commit id: "Design"',
      'gitGraph\n  commit id: "Launch"\n  branch feature\n  commit id: "Design"\n  commit id: "Iterate"',
      'gitGraph\n  commit id: "Launch"\n  branch feature\n  commit id: "Design"\n  commit id: "Iterate"\n  commit id: "Review"',
      'gitGraph\n  commit id: "Launch"\n  branch feature\n  commit id: "Design"\n  commit id: "Iterate"\n  commit id: "Review"\n  checkout main\n  merge feature id: "Release"',
    ],
  },
  {
    name: 'Pie',
    steps: [
      'pie\n  "New user" : 5',
      'pie\n  "New user" : 5\n  "Tried it" : 10',
      'pie\n  "New user" : 5\n  "Tried it" : 10\n  "Weekly" : 16',
      'pie\n  "New user" : 5\n  "Tried it" : 10\n  "Weekly" : 16\n  "Daily" : 69',
    ],
    themes: ['everforest', 'gruvbox', 'rose-pine'],
  },
  {
    name: 'Mindmap',
    steps: [
      'mindmap\n  root((Roadmap))',
      'mindmap\n  root((Roadmap))\n    Feedback\n      Requests\n      Voting\n      Insights\n      Surveys\n      Interviews\n      Analytics',
      'mindmap\n  root((Roadmap))\n    Feedback\n      Requests\n      Voting\n      Insights\n      Surveys\n      Interviews\n      Analytics\n    Features\n      Sharing\n      Offline\n      Integrations\n      Templates\n      Automations\n      Notifications',
      'mindmap\n  root((Roadmap))\n    Feedback\n      Requests\n      Voting\n      Insights\n      Surveys\n      Interviews\n      Analytics\n    Features\n      Sharing\n      Offline\n      Integrations\n      Templates\n      Automations\n      Notifications\n    Polish\n      Speed\n      Search\n      Accessibility\n      Shortcuts\n      Onboarding\n      Localization',
    ],
  },
];

const formula = 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}';
const energy = ['Geothermal,Energy,65', 'Hydro,Energy,20', 'Oil,Energy,15', 'Energy,Power,40', 'Energy,Heating,30', 'Energy,Industry,15', 'Energy,Transport,15'];

const visual: VideoScene[] = [
  {
    name: 'Math',
    steps: [
      'flowchart',
      'flowchart\n  Q["$$ax^2 + bx + c = 0$$"]',
      `flowchart\n  Q["$$ax^2 + bx + c = 0$$"]\n  Q --> X["$$${formula}$$"]`,
    ],
  },
  {
    name: 'Chemistry',
    steps: [
      'flowchart',
      'flowchart\n  In["<b>Reactants</b><br>6CO<sub>2</sub> + 6H<sub>2</sub>O"]',
      'flowchart\n  In["<b>Reactants</b><br>6CO<sub>2</sub> + 6H<sub>2</sub>O"]\n  In -->|<u>light</u>| Out["<b>Products</b><br>C<sub>6</sub>H<sub>12</sub>O<sub>6</sub> + 6O<sub>2</sub>"]',
    ],
  },
  {
    name: 'Sankey',
    steps: energy.map((_, index) => ['sankey', ...energy.slice(0, index + 1)].join('\n  ')),
    themes: ['everforest', 'gruvbox', 'rose-pine', 'paper'],
  },
];

export const videoStories = { launch, visual };
export type VideoStoryName = keyof typeof videoStories;
