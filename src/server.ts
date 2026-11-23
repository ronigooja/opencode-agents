import { Plugin } from "@opencode/plugin"
import { Definition } from "./contract.ts"
import { configPath, list, update } from "./config.ts"
import { builtins, compose } from "./source.ts"

export default Plugin.define({
  id: "ronigooja.agents",
  async setup(ctx) {
    async function runtime() {
      return (await ctx.agent.list()).data.map((item) => {
        const model = item.model ? `${item.model.providerID}/${item.model.id}${item.model.variant ? `#${item.model.variant}` : ""}` : undefined
        return { id: item.id, agent: { mode: item.mode, ...(item.description !== undefined ? { description: item.description } : {}), ...(model !== undefined ? { model } : {}) } }
      })
    }
    await ctx.rpc.register(Definition, {
      list: async () => compose(await list(await configPath()), await runtime()),
      upsert: async ({ id, agent, action }) => {
        const configured = await list(await configPath())
        const known = (await runtime()).some((item) => item.id === id)
        if (action === "create" && (!agent.description || !agent.model)) throw new Error("Description and model are required")
        if (action === "create" && (known || configured[id])) throw new Error(`Agent ${id} already exists`)
        if (action === "edit" && !configured[id] && !builtins.has(id)) {
          throw new Error(known ? `Agent ${id} is read-only` : `Agent ${id} does not exist`)
        }
        await update(await configPath(), id, action, agent)
        return {}
      },
      remove: async ({ id }) => {
        await update(await configPath(), id, "remove")
        return {}
      },
    })
  },
})
