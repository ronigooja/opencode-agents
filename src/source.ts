import type { Agent, Entry } from "./contract.ts"

export const builtins = new Set(["build", "plan", "general", "explore", "compaction", "title", "summary"])

export type Configured = { editable: boolean, agent: Agent, fields: string[] }
export type Runtime = { id: string, agent: Agent }

export function compose(configured: Record<string, Configured>, runtime: Runtime[]): Record<string, Entry> {
  const runtimeAgents = new Map(runtime.map((item) => [item.id, item.agent]))
  const ids = new Set([...Object.keys(configured), ...runtimeAgents.keys()])
  return Object.fromEntries([...ids].map((id) => {
    const builtin = builtins.has(id)
    const current = configured[id]
    const agent = runtimeAgents.get(id)
    if (current) return [id, { editable: current.editable, source: "config" as const, builtin, disabled: current.agent.disabled === true, agent: { ...agent, ...current.agent }, overrides: Object.keys(current.agent), fields: current.fields }]
    if (builtin) return [id, { editable: true, source: "builtin" as const, builtin, disabled: false, agent: agent ?? {}, overrides: [], fields: [] }]
    return [id, { editable: false, source: "runtime" as const, builtin, disabled: false, agent: agent ?? {}, overrides: [], fields: [] }]
  }))
}
