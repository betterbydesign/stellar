// Local diagnostic samples only. Never controls readiness, authorization or saving.
const starts = new Map<string, number>();
export function startTiming(operation: string) {
  starts.set(operation, performance.now());
}
export function finishTiming(operation: string, metric: string) {
  const start = starts.get(operation);
  if (start === undefined) return;
  starts.delete(operation);
  performance.measure(`stellar.${metric}`, { start, end: performance.now() });
  // Bound the diagnostic buffer for long editing sessions.
  const entries = performance.getEntriesByName(`stellar.${metric}`, "measure");
  if (entries.length > 100) performance.clearMeasures(`stellar.${metric}`);
}
export function moveTiming(from: string, to: string) {
  const start = starts.get(from);
  starts.delete(from);
  if (start !== undefined) starts.set(to, start);
}
