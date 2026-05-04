export const DEFAULT_CATEGORIES = [
  "Food",
  "Groceries",
  "Transport",
  "Accommodation",
  "Cigarettes",
  "Coffee",
  "Bills",
  "Entertainment",
  "Health",
  "Income",
  "Other",
] as const;

export type Category = string;

const BUILTIN_CHIP: Record<string, string> = {
  Food: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  Groceries: "bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300",
  Transport: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  Accommodation: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  Cigarettes: "bg-stone-200 text-stone-800 dark:bg-stone-900 dark:text-stone-300",
  Coffee: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-300",
  Bills: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  Entertainment: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300",
  Health: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  Income: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  Other: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
};

const BUILTIN_BAR: Record<string, string> = {
  Food: "bg-amber-500",
  Groceries: "bg-lime-500",
  Transport: "bg-sky-500",
  Accommodation: "bg-violet-500",
  Cigarettes: "bg-stone-500",
  Coffee: "bg-orange-500",
  Bills: "bg-red-500",
  Entertainment: "bg-pink-500",
  Health: "bg-emerald-500",
  Income: "bg-teal-500",
  Other: "bg-zinc-500",
};

const FALLBACK_CHIPS = [
  "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
  "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-300",
  "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
];
const FALLBACK_BARS = [
  "bg-cyan-500",
  "bg-fuchsia-500",
  "bg-yellow-500",
  "bg-indigo-500",
  "bg-rose-500",
  "bg-blue-500",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function categoryChip(c: Category): string {
  return BUILTIN_CHIP[c] ?? FALLBACK_CHIPS[hash(c) % FALLBACK_CHIPS.length];
}

export function categoryBar(c: Category): string {
  return BUILTIN_BAR[c] ?? FALLBACK_BARS[hash(c) % FALLBACK_BARS.length];
}
