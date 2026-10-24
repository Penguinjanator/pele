import { parse, type PieModel, type SankeyModel, type XyChartModel } from 'pele';

export type ChartModel = PieModel | SankeyModel | XyChartModel;

export function chartMotion(from: ChartModel, source: string): ((progress: number) => ChartModel) | undefined {
  const target = parse(source);
  const model = parse(source);
  if (from.type === 'pie' && target.type === 'pie' && model.type === 'pie') {
    const sections = [...target.sections];
    return progress => {
      model.sections = new Map(sections.map(([label, value]) => {
        const start = from.sections.get(label) ?? 0;
        return [label, start + (value - start) * progress];
      }));
      return model;
    };
  }
  if (from.type === 'sankey' && target.type === 'sankey' && model.type === 'sankey') {
    const starts = target.links.map(link =>
      from.links.find(old => old.source.id === link.source.id && old.target.id === link.target.id)?.value ?? 0);
    return progress => {
      model.links.forEach((link, index) => { link.value = starts[index] + (target.links[index].value - starts[index]) * progress; });
      return model;
    };
  }
  if (from.type === 'xychart' && target.type === 'xychart' && model.type === 'xychart') {
    return progress => {
      model.plots = target.plots.map((plot, index) => {
        const previous = from.plots[index]?.type === plot.type ? from.plots[index] : undefined;
        return {
          ...plot,
          data: plot.data.map(([label, value]) => {
            if (value === undefined) return [label, undefined];
            const start = previous?.data.find(point => point[0] === label)?.[1] ?? 0;
            return [label, start + (value - start) * progress];
          }),
        };
      });
      return model;
    };
  }
}
