import type { Plugin } from "@opencode/plugin/tui"
import type { Agent, Entry } from "../contract.ts"

export type Field = "description" | "model" | "system"
export type Entries = Record<string, Entry>
export type Theme = ReturnType<Plugin.Context["theme"]["surface"]>
export type Model = NonNullable<ReturnType<Plugin.Context["data"]["location"]["model"]["list"]>>[number]
export type Api = {
  list(): Promise<Entries>
  upsert(input: { id: string, action: "create" | "edit", agent: Agent }): Promise<unknown>
  remove(input: { id: string }): Promise<unknown>
}

export const fields = ["description", "model", "system"] as const satisfies readonly Field[]
export const labels = { description: "description", model: "model", system: "system" } satisfies Record<Field, string>
export const shortcuts = { description: "d", model: "m", system: "s" } satisfies Record<Field, string>
export const sourceNotes = {
  builtin: "Built-in agent. Saving a field writes an override to opencode.json.",
  config: "Defined in opencode.json. Changes are saved immediately.",
  runtime: "Registered at runtime by another plugin or config. Read-only here.",
} satisfies Record<Entry["source"], string>
export const NEW = ""
export const MANUAL = "__manual__"
export const editMode = "agents-edit"
export const wideWidth = 100

const sources = ["builtin", "config", "runtime"] as const

export function badgeColor(theme: Theme, source: Entry["source"]) {
  return theme.categorical[sources.indexOf(source) % theme.categorical.length][200]
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function idError(id: string) {
  if (!id) return "ID is required"
  if (/\s/.test(id) || id.includes("#") || id.includes("/")) return "ID must not contain spaces, # or /"
  return undefined
}
