export function getConfigValue(value: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((current, key) => (current as Record<string, unknown>)[key], value);
}
export function setConfigValue(value: unknown, path: string, next: unknown): void {
  const parts = path.split('.');
  const parent = parts
    .slice(0, -1)
    .reduce<unknown>((current, key) => (current as Record<string, unknown>)[key], value);
  (parent as Record<string, unknown>)[parts.at(-1)!] = next;
}
