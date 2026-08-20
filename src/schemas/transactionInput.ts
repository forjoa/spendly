import { z } from "zod";

/* Mapa básico de exponentes ISO4217. Añade las monedas que uses */
const CURRENCY_EXPONENTS: Record<string, number> = {
  USD: 2,
  EUR: 2,
  JPY: 0,
  KRW: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
};

/* Devuelve el número de decimales (exponent) para la moneda */
function getCurrencyExponent(currency: string | undefined): number {
  if (!currency) return 2;
  return CURRENCY_EXPONENTS[currency.toUpperCase()] ?? 2;
}

/* Convierte major units (string|number) a minor units (integer).
   Lanza error si formato inválido o demasiados decimales. */
export function majorToMinor(value: string | number, currency: string): number {
  const exp = getCurrencyExponent(currency);
  if (!currency) throw new Error("currency required to convert amount");

  const asString = typeof value === "number" ? value.toString() : (value ?? "").toString();
  const s = asString.trim();
  const match = s.match(/^([+-])?(\d+)(?:\.(\d+))?$/);
  if (!match) throw new Error("invalid numeric format");

  const sign = match[1] === "-" ? -1 : 1;
  const integerPart = match[2];
  const fractionPart = match[3] ?? "";

  if (fractionPart.length > exp) {
    throw new Error(`too many decimal places for ${currency} (max ${exp})`);
  }

  const fracPadded = fractionPart.padEnd(exp, "0");
  const combined = integerPart + fracPadded;
  const normalized = combined.replace(/^0+(?!$)/, "") || "0";
  const minor = Number(normalized) * sign;
  if (!Number.isSafeInteger(minor)) throw new Error("amount out of safe integer range");
  return minor;
}

/* Schema con preprocess: acepta amountMinor entero, o amount (decimal) + currency,
   o amountMinor decimal (lo interpreta como major) + currency. */
export const transactionInputSchema = z.preprocess((raw) => {
  if (typeof raw !== "object" || raw === null) return raw;
  const obj = raw as Record<string, unknown>;

  // Si ya hay amountMinor
  if (obj.amountMinor !== undefined) {
    const am = obj.amountMinor;
    // Entero number -> ok
    if (typeof am === "number" && Number.isInteger(am)) return obj;
    // String entero -> convertir a number
    if (typeof am === "string" && /^\s*[+-]?\d+\s*$/.test(am)) {
      return { ...obj, amountMinor: Number(am.trim()) };
    }
    // Si viene con fracción (number no entero o string decimal) -> convertir usando currency
    if (
      (typeof am === "number" && !Number.isInteger(am)) ||
      (typeof am === "string" && /^\s*[+-]?\d+\.\d+\s*$/.test(am))
    ) {
      if (typeof obj.currency !== "string" || obj.currency.trim() === "") {
        // dejar objeto sin cambiar para que la validación posterior falle y se informe la ausencia de currency
        return obj;
      }
      try {
        const minor = majorToMinor(am as string | number, obj.currency as string);
        return { ...obj, amountMinor: minor };
      } catch (e) {
        return obj;
      }
    }

    return obj;
  }

  // Si no hay amountMinor, pero hay amount + currency -> convertir
  if (obj.amount !== undefined && typeof obj.currency === "string") {
    try {
      const minor = majorToMinor(obj.amount as string | number, obj.currency as string);
      return { ...obj, amountMinor: minor };
    } catch (e) {
      return obj;
    }
  }

  return obj;
}, z.object({
  amountMinor: z.number().int(),
  currency: z.string().min(1),
  description: z.string().optional(),
  timestamp: z.string().optional(),
  // añade aquí el resto de campos de tu modelo si los necesitas
}));
