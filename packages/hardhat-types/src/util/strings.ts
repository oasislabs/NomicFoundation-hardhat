/**
 * Replaces all the instances of [[toReplace]] by [[replacement]] in [[str]].
 */
export function replaceAll(
  str: string,
  toReplace: string,
  replacement: string
) {
  return str.split(toReplace).join(replacement);
}
