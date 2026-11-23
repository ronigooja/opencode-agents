import { z } from "zod"
import { Rpc } from "@opencode/plugin"

export const Agent = z.object({
  mode: z.literal("subagent"),
  description: z.string().min(1),
  model: z.string().regex(/^[^/#\s]+\/[^/#\s]+(?:#[^/#\s]+)?$/),
  system: z.string().optional(),
})
export type Agent = z.infer<typeof Agent>
const ID = z.string().min(1).refine((id) => !["__proto__", "constructor", "prototype"].includes(id))
export const Definition = Rpc.define({
  id: "ronigooja.agents",
  methods: {
    list: { input: z.object({}), output: z.record(z.string(), z.discriminatedUnion("editable", [z.object({ editable: z.literal(true), agent: Agent }), z.object({ editable: z.literal(false) })])) },
    upsert: { input: z.object({ id: ID, agent: Agent, action: z.enum(["create", "edit"]) }), output: z.object({}) },
    remove: { input: z.object({ id: ID }), output: z.object({}) },
  },
  events: {},
}) satisfies Rpc.PortableDefinition
