/**
 * Tiny classnames joiner. If your project already has `clsx` + `tailwind-merge`
 * (common with shadcn/ui — you have a components.json, so you likely do), delete
 * this file and import your existing `cn` from "@/lib/utils" instead.
 */
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
