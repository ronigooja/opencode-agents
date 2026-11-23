import { Plugin } from "@opencode/plugin/tui"
import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { For, Show, createMemo, createSignal } from "solid-js"
import { Definition, type Agent, type Entry } from "./contract.ts"

type Field = "description" | "model" | "system"
type Route = { name: "list" } | { name: "detail", id: string }
type Action = { name: "create" } | { name: "edit", id: string, field: Field } | { name: "remove", id: string }
type Entries = Record<string, Entry>

const fields: readonly Field[] = ["description", "model", "system"]
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim()
const label = { description: "description", model: "model", system: "system" } satisfies Record<Field, string>

export default Plugin.define({
  id: "ronigooja.agents.tui",
  setup(ctx) {
    const rpc = ctx.client.rpc(Definition)

    function badge(source: Entry["source"]) {
      const theme = ctx.theme.surface("dialog")
      if (source === "builtin") return theme.hue.interactive[500]
      if (source === "config") return theme.hue.accent[500]
      return theme.text.feedback.warning.base
    }

    function errorMessage(error: unknown) {
      return error instanceof Error ? error.message : String(error)
    }

    async function pickModel(current: string | undefined) {
      await ctx.data.location.model.sync(ctx.location)
      const list = (ctx.data.location.model.list(ctx.location) ?? []).filter((model) => model.enabled)
      const selected = await ctx.ui.dialog.select({
        title: "Model",
        placeholder: "Search models",
        options: [
          { title: "Enter manually…", value: "__manual__", description: "provider/model or provider/model#variant" },
          ...list.map((model) => ({ title: model.name, description: `${model.providerID}/${model.modelID}`, value: `${model.providerID}/${model.modelID}` })),
        ],
      })
      if (selected === undefined) return undefined
      if (selected === "__manual__") return ctx.ui.dialog.prompt({ title: "Model", placeholder: "provider/model or provider/model#variant", value: current })
      const item = list.find((model) => `${model.providerID}/${model.modelID}` === selected)
      if (!item?.variants.length) return selected
      const variant = await ctx.ui.dialog.select({
        title: "Variant",
        options: [
          { title: "Default", value: "" },
          ...item.variants.map((variant) => ({ title: variant.id, value: variant.id })),
        ],
      })
      if (variant === undefined) return undefined
      return variant ? `${selected}#${variant}` : selected
    }

    async function create(): Promise<Route> {
      const id = (await ctx.ui.dialog.prompt({ title: "New subagent ID", placeholder: "e.g. reviewer" }))?.trim()
      if (!id) return { name: "list" }
      const description = await ctx.ui.dialog.prompt({ title: `${id} · description`, placeholder: "What this subagent is for" })
      if (!description) return { name: "list" }
      const model = await pickModel(undefined)
      if (!model) return { name: "list" }
      const system = await ctx.ui.dialog.prompt({ title: `${id} · system prompt (optional)` })
      if (system === undefined) return { name: "list" }
      await rpc.upsert({ id, action: "create", agent: { mode: "subagent", description, model, ...(system ? { system } : {}) } })
      ctx.ui.toast.show({ message: `Created ${id}`, variant: "success" })
      return { name: "detail", id }
    }

    async function edit(id: string, field: Field, entry: Entry): Promise<Route> {
      const current = entry.agent[field]
      const value = field === "model"
        ? await pickModel(current)
        : await ctx.ui.dialog.prompt({
          title: `${id} · ${label[field]}`,
          description: field === "system" ? "Leave empty to remove the system prompt." : undefined,
          value: current ?? "",
        })
      if (value === undefined || value === (current ?? "")) return { name: "detail", id }
      await rpc.upsert({ id, action: "edit", agent: { [field]: value } satisfies Agent })
      ctx.ui.toast.show({ message: `Saved ${label[field]} for ${id}`, variant: "success" })
      return { name: "detail", id }
    }

    async function remove(id: string, entry: Entry): Promise<Route> {
      const reset = entry.builtin
      const ok = await ctx.ui.dialog.confirm({
        title: reset ? "Reset to default" : "Delete agent",
        message: reset ? `Remove the override for ${id}? The built-in definition is kept.` : `Delete ${id} from opencode.json?`,
      })
      if (ok) {
        await rpc.remove({ id })
        ctx.ui.toast.show({ message: reset ? `Reset ${id}` : `Deleted ${id}`, variant: "success" })
      }
      return { name: "detail", id }
    }

    function page(route: Route, entries: Entries) {
      return new Promise<Route | Action | undefined>((resolve) => {
        let settled = false
        const done = (next?: Route | Action) => {
          if (settled) return
          settled = true
          resolve(next)
        }
        ctx.ui.dialog.show(() => <Page route={route} entries={entries} done={done} />, () => done(undefined))
        ctx.ui.dialog.set({ size: "large", centered: true })
      })
    }

    function Page(props: { route: Route, entries: Entries, done: (next?: Route | Action) => void }) {
      const dimensions = useTerminalDimensions()
      const theme = ctx.theme.surface("dialog")
      const [query, setQuery] = createSignal("")
      const [cursor, setCursor] = createSignal(0)
      const detailID = () => (props.route.name === "detail" ? props.route.id : "")
      const detail = () => props.entries[detailID()]
      const matches = (text: string) => {
        const needle = text.toLowerCase()
        return Object.keys(props.entries).sort().filter((id) => id.toLowerCase().includes(needle))
      }
      const listIDs = createMemo(() => matches(query()))
      const rows = createMemo(() => {
        if (props.route.name === "list") return [{ kind: "create" as const }, ...listIDs().map((id) => ({ kind: "agent" as const, id }))]
        const entry = detail()
        if (!entry) return []
        return [
          ...fields.map((field) => ({ kind: "field" as const, field })),
          ...(entry.source === "config" ? [{ kind: "remove" as const }] : []),
        ]
      })
      const visible = () => Math.max(4, dimensions().height - 14)
      const windowStart = () => Math.max(0, Math.min(cursor() - Math.floor(visible() / 2), rows().length - visible()))
      const selected = (index: number) => index === cursor()
      const ink = (index: number, color: typeof theme.text.base) => (selected(index) ? theme.text.action.primary.focused : color)
      const rowBackground = (index: number) => (selected(index) ? theme.background.action.primary.focused : undefined)
      const move = (delta: number) => setCursor((current) => Math.max(0, Math.min(rows().length - 1, current + delta)))

      function activate(index: number) {
        setCursor(index)
        const row = rows()[index]
        if (!row) return
        if (row.kind === "create") return props.done({ name: "create" })
        if (row.kind === "agent") return props.done({ name: "detail", id: row.id })
        const entry = detail()
        if (!entry) return
        if (row.kind === "remove") return props.done({ name: "remove", id: detailID() })
        if (!entry.editable || entry.source === "runtime") {
          ctx.ui.toast.show({ message: `${detailID()} is registered at runtime and is read-only`, variant: "warning" })
          return
        }
        props.done({ name: "edit", id: detailID(), field: row.field })
      }

      ctx.keymap.layer(() => ({
        mode: "modal",
        commands: [
          { bind: "up", run: () => move(-1) },
          { bind: "down", run: () => move(1) },
          { bind: "return", run: () => activate(cursor()) },
          { bind: "escape", run: () => props.done(props.route.name === "detail" ? { name: "list" } : undefined) },
        ],
      }))

      const Keys = (keys: { items: readonly (readonly [string, string])[] }) => (
        <text wrapMode="none" truncate>
          <For each={keys.items}>
            {([key, action]) => (
              <>
                <span style={{ fg: theme.text.base, bg: theme.background.raised.high }}> {key} </span>
                <span style={{ fg: theme.text.muted }}> {action}  </span>
              </>
            )}
          </For>
        </text>
      )

      const ListView = () => (
        <>
          <box flexDirection="row" gap={2}>
            <text fg={theme.text.base} attributes={TextAttributes.BOLD} wrapMode="none">Manage agents</text>
            <text fg={theme.text.muted} wrapMode="none">{listIDs().length} agents</text>
          </box>
          <input
            focused
            placeholder="Search agents"
            focusedBackgroundColor={theme.background.formfield.focused}
            focusedTextColor={theme.text.formfield.base}
            cursorColor={theme.text.formfield.base}
            onInput={(value: string) => {
              setQuery(value)
              setCursor(value && matches(value).length ? 1 : 0)
            }}
          />
          <box flexDirection="column">
            <For each={rows().slice(windowStart(), windowStart() + visible())}>
              {(row, offset) => {
                const index = () => windowStart() + offset()
                return (
                  <box
                    backgroundColor={rowBackground(index())}
                    onMouseUp={(event: { stopPropagation: () => void }) => {
                      event.stopPropagation()
                      activate(index())
                    }}
                  >
                    <Show when={row.kind === "create"} fallback={
                      <AgentRow id={row.kind === "agent" ? row.id : ""} index={index()} entry={props.entries[row.kind === "agent" ? row.id : ""]!} />
                    }>
                      <text fg={ink(index(), theme.hue.accent[500])} attributes={TextAttributes.BOLD} wrapMode="none" truncate>+ Create subagent</text>
                    </Show>
                  </box>
                )
              }}
            </For>
          </box>
          <Show when={listIDs().length === 0}>
            <text fg={theme.text.muted} wrapMode="none">No agents match “{query()}”.</text>
          </Show>
        </>
      )

      const AgentRow = (row: { id: string, index: number, entry: Entry }) => {
        const overrides = row.entry.overrides.length ? ` · overrides ${row.entry.overrides.join(", ")}` : ""
        return (
          <text wrapMode="none" truncate>
            <span style={{ fg: theme.background.base, bg: badge(row.entry.source), attributes: TextAttributes.BOLD }}> {row.entry.source} </span>
            <span style={{ fg: ink(row.index, theme.text.base), attributes: TextAttributes.BOLD }}>  {row.id}</span>
            <span style={{ fg: ink(row.index, theme.text.muted) }}>  {row.entry.agent.mode ?? "unknown"} · {row.entry.agent.model ?? "default model"}{overrides}</span>
          </text>
        )
      }

      const DetailView = () => (
        <>
          <box flexDirection="row" gap={2}>
            <text fg={theme.text.base} attributes={TextAttributes.BOLD} wrapMode="none">{detailID()}</text>
            <text wrapMode="none"><span style={{ fg: theme.background.base, bg: badge(detail()!.source), attributes: TextAttributes.BOLD }}> {detail()!.source} </span></text>
            <text fg={theme.text.muted} wrapMode="none" truncate>mode {detail()!.agent.mode ?? "unknown"} (read-only, set in opencode.json)</text>
          </box>
          <text fg={theme.text.muted} wrapMode="none" truncate>
            {detail()!.source === "builtin"
              ? "Built-in agent. Saving a field writes an override to opencode.json."
              : detail()!.source === "config"
                ? "Defined in opencode.json. Changes are saved immediately."
                : "Registered at runtime by another plugin or config. Read-only here."}
          </text>
          <box flexDirection="column">
            <For each={rows().slice(windowStart(), windowStart() + visible())}>
              {(row, offset) => {
                const index = () => windowStart() + offset()
                return (
                  <box
                    backgroundColor={rowBackground(index())}
                    onMouseUp={(event: { stopPropagation: () => void }) => {
                      event.stopPropagation()
                      activate(index())
                    }}
                  >
                    <Show when={row.kind === "field"} fallback={
                      <text fg={ink(index(), theme.hue.accent[500])} attributes={TextAttributes.BOLD} wrapMode="none">
                        {row.kind === "remove" ? (detail()!.builtin ? "Reset to default" : "Delete agent") : ""}
                      </text>
                    }>
                      <FieldRow field={row.kind === "field" ? row.field : "description"} index={index()} />
                    </Show>
                  </box>
                )
              }}
            </For>
          </box>
        </>
      )

      const FieldRow = (props: { field: Field, index: number }) => {
        const value = () => {
          const current = detail()?.agent[props.field]
          return current === undefined || current === "" ? "(unset)" : oneLine(current)
        }
        const overridden = () => detail()?.overrides.includes(props.field) ?? false
        return (
          <text wrapMode="none" truncate>
            <span style={{ fg: ink(props.index, theme.text.base), attributes: TextAttributes.BOLD }}>{selected(props.index) ? "▸ " : "  "}{label[props.field].padEnd(12)}</span>
            <span style={{ fg: ink(props.index, theme.text.muted) }}>{value()}</span>
            <Show when={overridden()}>
              <span style={{ fg: theme.hue.accent[500] }}>  ● override</span>
            </Show>
          </text>
        )
      }

      return (
        <box padding={1} gap={1}>
          <Show when={props.route.name === "list"} fallback={<DetailView />}>
            <ListView />
          </Show>
          <Keys items={props.route.name === "list"
            ? [["↑↓", "move"], ["Enter", "open"], ["Esc", "close"]] as const
            : [["↑↓", "move"], ["Enter", "edit"], ["Esc", "back"]] as const} />
        </box>
      )
    }

    async function manage() {
      let route: Route = { name: "list" }
      while (true) {
        try {
          const entries = await rpc.list({})
          if (route.name === "detail" && !entries[route.id]) route = { name: "list" }
          const next = await page(route, entries)
          if (next === undefined) return
          if (next.name === "list" || next.name === "detail") {
            route = next
            continue
          }
          route = await perform(next, entries)
        } catch (error) {
          ctx.ui.toast.show({ message: errorMessage(error), variant: "error" })
          return
        }
      }
    }

    async function perform(action: Action, entries: Entries): Promise<Route> {
      if (action.name === "create") return create()
      const entry = entries[action.id]
      if (!entry) return { name: "list" }
      if (action.name === "edit") return edit(action.id, action.field, entry)
      return remove(action.id, entry)
    }

    ctx.keymap.layer(() => ({ mode: "global", commands: [{ id: "ronigooja.agents.manage", title: "Agents: manage", palette: true, run: manage }] }))
  },
})
