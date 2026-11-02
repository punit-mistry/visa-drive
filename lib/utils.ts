/**
 * Re-exported from shadcn's `cn` package so the whole codebase shares one
 * class-merging implementation. shadcn's generated components in
 * `components/ui` import from `"cn"` directly; everything we write imports
 * from `"@/lib/utils"`. Both resolve to the same function, so Tailwind
 * conflict resolution can never diverge between the two halves of the UI.
 */
export { cn } from "cn";
