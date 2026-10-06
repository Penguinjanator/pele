export const formatTime = (milliseconds: number) => milliseconds < 0.05
  ? '< 0.1 ms'
  : `${milliseconds.toLocaleString(undefined, { maximumFractionDigits: milliseconds < 10 ? 2 : milliseconds < 100 ? 1 : 0 })} ms`;

// One run is too noisy to report. Repeats within a small budget and takes the median.
export function timed<T>(run: () => T): { result: T; time: string } {
  const times: number[] = [];
  const started = performance.now();
  let result = run();
  times.push(performance.now() - started);
  while (times.length < 7 && performance.now() - started < 60) {
    const runStarted = performance.now();
    result = run();
    times.push(performance.now() - runStarted);
  }
  times.sort((a, b) => a - b);
  return { result, time: formatTime(times[Math.floor(times.length / 2)]) };
}
