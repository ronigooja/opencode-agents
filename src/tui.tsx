import { Plugin } from "@opencode/plugin/tui"
import { Definition } from "./contract.ts"

export default Plugin.define({
  id: "ronigooja.agents.tui",
  setup(ctx) {
    const rpc = ctx.client.rpc(Definition)
    async function manage() {
      try {
        const agents = await rpc.list({})
        const id = await ctx.ui.dialog.select({
          title: "Manage subagents",
          options: [
            { title: "Create subagent", value: "" },
            ...Object.entries(agents).map(([id, entry]) => ({ title: id, description: entry.editable ? entry.agent.description : "Read-only (unsupported format)", value: id, disabled: !entry.editable })),
          ],
        })
        if (id === undefined) return
        const name = id || await ctx.ui.dialog.prompt({ title: "Subagent ID" })
        if (!name) return
        const entry = id ? agents[id] : undefined
        const existing = entry?.editable ? entry.agent : undefined
        if (existing) {
          const action = await ctx.ui.dialog.select({ title: name, options: [
            { title: "Edit", value: "edit" }, { title: "Delete", value: "delete" },
          ] })
          if (!action) return
          if (action === "delete") {
            if (await ctx.ui.dialog.confirm({ title: "Delete subagent", message: `Delete ${name}?` })) {
              await rpc.remove({ id: name })
              ctx.ui.toast.show({ message: `Deleted ${name}`, variant: "success" })
            }
            return
          }
        }
        const description = await ctx.ui.dialog.prompt({ title: "Description", value: existing?.description })
        if (description === undefined) return
        await ctx.data.location.model.sync(ctx.location)
        const models = ctx.data.location.model.list(ctx.location) ?? []
        const selected = await ctx.ui.dialog.select({ title: "Model", options: [
          { title: "Enter model manually", value: "" },
          ...models.filter((model) => model.enabled).map((model) => ({ title: model.name, description: `${model.providerID}/${model.modelID}`, value: `${model.providerID}/${model.modelID}` })),
        ] })
        if (selected === undefined) return
        const item = models.find((model) => `${model.providerID}/${model.modelID}` === selected)
        const variant = item?.variants.length ? await ctx.ui.dialog.select({ title: "Model variant", options: [
          { title: "Default", value: "" },
          ...item.variants.map((variant) => ({ title: variant.id, value: variant.id })),
        ] }) : ""
        if (variant === undefined) return
        const model = selected ? `${selected}${variant ? `#${variant}` : ""}` : await ctx.ui.dialog.prompt({ title: "Model (provider/model or provider/model#variant)", value: existing?.model })
        if (model === undefined) return
        const system = await ctx.ui.dialog.prompt({ title: "System prompt (optional)", value: existing?.system })
        if (system === undefined) return
        await rpc.upsert({ id: name, action: id ? "edit" : "create", agent: { mode: "subagent", description, model, ...(system ? { system } : {}) } })
        ctx.ui.toast.show({ message: `Saved ${name}`, variant: "success" })
      } catch (error) {
        const message = error instanceof Error || (typeof error === "object" && error !== null && "message" in error) ? String(error.message) : String(error)
        ctx.ui.toast.show({ message, variant: "error" })
      }
    }
    ctx.keymap.layer(() => ({ mode: "global", commands: [{ id: "ronigooja.agents.manage", title: "Agents: manage", palette: true, run: manage }] }))
  },
})
