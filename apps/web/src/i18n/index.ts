import { en, type Dictionary } from "./en";
import { fr } from "./fr";
import { de } from "./de";
import { es } from "./es";
import { it } from "./it";
import { pt } from "./pt";
import { nl } from "./nl";
import { pl } from "./pl";

const dictionaries: Record<string, Dictionary> = { en, fr, de, es, it, pt, nl, pl };
export const locales = Object.keys(dictionaries);
// Native names for the language menu.
export const localeNames: Record<string, string> = { en: "English", fr: "Français", de: "Deutsch", es: "Español", it: "Italiano", pt: "Português", nl: "Nederlands", pl: "Polski" };
export const defaultLocale = "en";

export function t(locale: string | undefined): Dictionary {
  return dictionaries[locale ?? defaultLocale] ?? en;
}

// Path helpers: the default locale has no prefix, every other locale lives under /{locale}.
export function localePath(locale: string, path: string): string {
  return locale === defaultLocale ? path : `/${locale}${path === "/" ? "" : path}`;
}
