export type PrefixedSelect<P extends string, T extends string[]> = {
  [K in keyof T]: `${P}.${T[K]}`
}

export function prefixSelect<P extends string, T extends string[]>(
  prefix: P,
  arr: T,
) {
  return arr.map((name) => `${prefix}.${name}`) as PrefixedSelect<P, T>
}
