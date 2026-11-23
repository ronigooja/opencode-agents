import { z } from "zod"
import { Rpc } from "@opencode/plugin"

export const Agent = z.object({
  mode: z.enum(["subagent", "primary", "all"]).optional(),
  description: z.string().optional(),
  model: z.string().regex(/^(?:[^/#\s]+\/[^/#\s]+(?:#[^/#\s]+)?)?$/).optional(),
  system: z.string().optional(),
  disabled: z.boolean().optional(),
})
export type Agent = z.infer<typeof Agent>
const Entry = z.object({ editable: z.boolean(), source: z.enum(["builtin", "config", "runtime"]), builtin: z.boolean(), disabled: z.boolean().default(false), agent: Agent, overrides: z.array(z.string()), fields: z.array(z.string()) })
export type Entry = z.infer<typeof Entry>
const ID = z.string().min(1).refine((id) => !["__proto__", "constructor", "prototype"].includes(id))
export const Definition = Rpc.define({
  id: "ronigooja.agents",
  methods: {
    list: { input: z.object({}), output: z.record(z.string(), Entry) },
    upsert: { input: z.object({ id: ID, agent: Agent, action: z.enum(["create", "edit"]) }), output: z.object({}) },
    remove: { input: z.object({ id: ID }), output: z.object({}) },
  },
  events: {},
}) satisfies Rpc.PortableDefinition
