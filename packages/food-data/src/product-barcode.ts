/** Validate the GS1 check digit; UPC-A and its EAN-13 representation share one ID. */
export function normalizeProductBarcode(input: string): string | null {
  const code = input.trim();
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(code) || /^0+$/.test(code)) return null;
  let sum = 0;
  for (let index = code.length - 2, weight = 3; index >= 0; index--, weight = weight === 3 ? 1 : 3) {
    sum += Number(code[index]) * weight;
  }
  if ((10 - sum % 10) % 10 !== Number(code[code.length - 1])) return null;
  return code.length === 12 ? `0${code}` : code;
}
