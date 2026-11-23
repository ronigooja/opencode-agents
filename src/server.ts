import { Plugin } from "@opencode/plugin"
import { Definition } from "./contract.ts"
import { configPath, list, update } from "./config.ts"

export default Plugin.define({
  id: "ronigooja.agents",
  async setup(ctx) {
    await ctx.rpc.register(Definition, {
      list: async () => list(await configPath()),
      upsert: async ({ id, agent, action }) => {
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
