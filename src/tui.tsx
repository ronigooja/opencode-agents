import { Plugin } from "@opencode/plugin/tui"
import { Definition } from "./contract.ts"
import { AgentsDialog } from "./tui/dialog.tsx"
import { errorMessage, type Api, type Entries } from "./tui/types.ts"

export default Plugin.define({
  id: "ronigooja.agents.tui",
  setup(ctx) {
    const rpc = ctx.client.rpc(Definition)
    const api: Api = {
      list: () => rpc.list({}),
      upsert: (input) => rpc.upsert(input),
      remove: (input) => rpc.remove(input),
    }

    async function manage() {
      let entries: Entries
      try {
        entries = await api.list()
      } catch (error) {
        ctx.ui.toast.show({ message: errorMessage(error), variant: "error" })
        return
      }
      ctx.ui.dialog.show(() => <AgentsDialog ctx={ctx} api={api} initial={entries} />)
      ctx.ui.dialog.set({ size: "xlarge", centered: true })
    }

    ctx.keymap.layer(() => ({ mode: "global", commands: [{ id: "ronigooja.agents.manage", title: "Agents: manage", palette: true, run: manage }] }))
  },
})
