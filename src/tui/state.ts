import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import type { Plugin } from "@opencode/plugin/tui"
import type { InputRenderable, ScrollBoxRenderable, TextareaRenderable } from "@opentui/core"
import type { Agent } from "../contract.ts"
import { MANUAL, NEW, editMode, errorMessage, fields, idError, labels, type Api, type Entries, type Field, type Model, type Theme } from "./types.ts"

export type Pane = "list" | "detail"
export type Step = "id" | "description" | "model" | "system"
export type Option = { readonly value: string, readonly title: string, readonly description?: string }
export type Row = { readonly kind: "field", readonly field: Field } | { readonly kind: "remove" } | { readonly kind: "toggle" }
type Phase = "models" | "variants" | "manual"

export const steps: readonly Step[] = ["id", "description", "model", "system"]
const groupOrder = ["config", "builtin", "runtime"] as const
const groupTitles = { config: "CONFIG", builtin: "BUILT-IN", runtime: "RUNTIME" } as const
const groupOf = (entry: Entries[string]) => entry.builtin ? "builtin" : entry.source
const clamp = (value: number, count: number) => Math.max(0, Math.min(count - 1, value))
const keyOf = (model: Model) => `${model.providerID}/${model.modelID}`

export function createState(ctx: Plugin.Context, api: Api, initial: Entries, narrow: () => boolean) {
  const theme: Theme = ctx.theme.surface("dialog")
  const [entries, setEntries] = createSignal(initial)
  const [query, setQuery] = createSignal("")
  const [searching, setSearching] = createSignal(false)
  const [selected, setSelected] = createSignal(
    groupOrder.flatMap((source) => Object.keys(initial).sort().filter((id) => groupOf(initial[id]) === source))[0] ?? NEW,
  )
  const [focus, setFocus] = createSignal<Pane>("list")
  const [cursor, setCursor] = createSignal(0)
  const [editing, setEditing] = createSignal<Field>()
  const [confirming, setConfirming] = createSignal(false)
  const [step, setStep] = createSignal(0)
  const [picking, setPicking] = createSignal(false)
  const [phase, setPhase] = createSignal<Phase>("models")
  const [pickQuery, setPickQuery] = createSignal("")
  const [pickIndex, setPickIndex] = createSignal(0)
  const [pickBase, setPickBase] = createSignal("")
  const [models, setModels] = createSignal<Model[]>([])
  const [newModel, setNewModel] = createSignal("")
  const refs: {
    search?: InputRenderable
    list?: ScrollBoxRenderable
    detail?: ScrollBoxRenderable
    editor?: TextareaRenderable
    id?: InputRenderable
    description?: TextareaRenderable
    system?: TextareaRenderable
  } = {}

  const groups = createMemo(() => {
    const needle = query().toLowerCase()
    const ids = Object.keys(entries()).sort().filter((id) => id.toLowerCase().includes(needle))
    return groupOrder
      .map((source) => ({ title: groupTitles[source], ids: ids.filter((id) => groupOf(entries()[id]) === source) }))
      .filter((group) => group.ids.length > 0)
  })
  const ids = createMemo(() => groups().flatMap((group) => group.ids))
  const items = createMemo(() => [NEW, ...ids()])
  const creating = () => selected() === NEW
  const current = createMemo(() => (creating() || !Object.hasOwn(entries(), selected()) ? undefined : entries()[selected()]))
  const rows = createMemo<Row[]>(() => {
    const entry = current()
    if (!entry) return []
    return [
      ...fields.map((field) => ({ kind: "field" as const, field })),
      ...(entry.source === "config" ? [{ kind: "remove" as const }] : []),
      ...(entry.source !== "runtime" && entry.editable && !["compaction", "title", "summary"].includes(selected()) ? [{ kind: "toggle" as const }] : []),
    ]
  })
  const target = (): Step | undefined => {
    if (creating()) return focus() === "detail" ? steps[step()] : undefined
    return editing()
  }
  const textMode = () => searching() || picking() || (target() !== undefined && target() !== "model")
  const options = createMemo<Option[]>(() => {
    if (phase() === "variants") {
      const variants = models().find((model) => keyOf(model) === pickBase())?.variants ?? []
      return [{ value: "", title: "Default" }, ...variants.map((variant) => ({ value: variant.id, title: variant.id }))]
    }
    if (phase() !== "models") return []
    const needle = pickQuery().toLowerCase()
    const matched = models()
      .map((model) => ({ value: keyOf(model), title: model.name, description: keyOf(model) }))
      .filter((option) => `${option.title} ${option.value}`.toLowerCase().includes(needle))
    return [...matched, { value: MANUAL, title: "Enter manually…", description: "provider/model or provider/model#variant" }]
  })

  function flash(message: string, variant: "success" | "warning" | "error") {
    ctx.ui.toast.show({ message, variant })
  }

  async function run(task: () => Promise<unknown>, success: string) {
    try {
      await task()
      setEntries(await api.list())
      flash(success, "success")
      return true
    } catch (error) {
      flash(errorMessage(error), "error")
      return false
    }
  }

  function cancel() {
    setEditing(undefined)
    setPicking(false)
  }

  function select(id: string) {
    if (id === selected()) return
    refs.detail?.scrollTo(0)
    setSelected(id)
    setCursor(0)
    setConfirming(false)
    setStep(0)
    setNewModel("")
    cancel()
  }

  function pressAgent(id: string) {
    select(id)
    setFocus(narrow() ? "detail" : "list")
  }

  function newAgent() {
    select(NEW)
    setFocus("detail")
  }

  function beginSearch() {
    setFocus("list")
    setSearching(true)
  }

  function finishSearch() {
    if (ids().length === 0) return
    setSearching(false)
    setFocus("detail")
  }

  function filter(value: string) {
    setQuery(value)
    const list = ids()
    if (!creating() && !list.includes(selected()) && list.length > 0) select(list[0])
  }

  function cycle(delta: number) {
    setStep((index) => (index + delta + steps.length) % steps.length)
  }

  function toggleFocus() {
    setConfirming(false)
    setFocus(focus() === "list" ? "detail" : "list")
  }

  function move(delta: number) {
    if (focus() === "list") {
      const list = items()
      select(list[clamp(list.indexOf(selected()) + delta, list.length)])
      return
    }
    if (creating()) {
      cycle(delta)
      return
    }
    setConfirming(false)
    setCursor(clamp(cursor() + delta, rows().length))
  }

  function page(delta: number) {
    if (focus() === "list") {
      move(delta * 8)
      return
    }
    const box = refs.detail
    if (box) box.scrollBy(delta * Math.max(1, box.height - 1))
  }

  function startEdit(field: Field) {
    const entry = current()
    if (!entry || editing() === field) return
    if (!entry.editable || entry.source === "runtime") {
      flash(`${selected()} is registered at runtime and is read-only`, "warning")
      return
    }
    setFocus("detail")
    setConfirming(false)
    setCursor(fields.indexOf(field))
    setEditing(field)
    if (field === "model") void openPicker()
  }

  function shortcut(field: Field) {
    if (!creating()) startEdit(field)
  }

  function pressField(field: Field) {
    if (creating()) {
      pressStep(steps.indexOf(field))
      return
    }
    startEdit(field)
  }

  function pressStep(index: number) {
    setFocus("detail")
    setStep(index)
    if (steps[index] === "model") void openPicker()
  }

  function pressRow(index: number) {
    setFocus("detail")
    setCursor(index)
    activate()
  }

  function clearEditor() {
    const field = target()
    if (creating() && field === "description") refs.description?.replaceText("")
    else if (creating() && field === "system") refs.system?.replaceText("")
    else refs.editor?.replaceText("")
  }

  function canClearSystem() {
    const entry = current()
    return entry !== undefined && entry.source !== "runtime" && entry.editable && Boolean(entry.agent.system)
  }

  function askClearSystem() {
    if (creating() || editing() !== undefined || !canClearSystem()) return
    setFocus("detail")
    setCursor(fields.indexOf("system"))
    setConfirming(true)
  }

  function confirmClearSystem() {
    setConfirming(false)
    void commit("system", "")
  }

  function activate() {
    if (focus() === "list") {
      setFocus("detail")
      return
    }
    if (creating()) {
      if (steps[step()] === "model") void openPicker()
      return
    }
    const row = rows()[cursor()]
    if (row?.kind === "field" && row.field === "system" && confirming()) {
      confirmClearSystem()
      return
    }
    if (row?.kind === "field") {
      startEdit(row.field)
      return
    }
    if (row?.kind === "toggle") {
      if (confirming()) {
        setConfirming(false)
        const disabled = !current()?.disabled
        void run(() => api.upsert({ id: selected(), action: "edit", agent: { disabled } }), disabled ? `Disabled ${selected()}` : `Enabled ${selected()}`).then((ok) => {
          if (ok) setCursor(rows().findIndex((item) => item.kind === "toggle"))
        })
      } else setConfirming(true)
      return
    }
    if (row?.kind !== "remove") return
    if (confirming()) {
      void remove()
      return
    }
    setConfirming(true)
  }

  async function openPicker() {
    setPicking(true)
    setPhase("models")
    setPickQuery("")
    setPickIndex(0)
    try {
      await ctx.data.location.model.sync(ctx.location)
      setModels((ctx.data.location.model.list(ctx.location) ?? []).filter((model) => model.enabled))
    } catch (error) {
      flash(errorMessage(error), "error")
    }
  }

  function typePicker(value: string) {
    setPickQuery(value)
    setPickIndex(0)
  }

  function pickMove(delta: number) {
    setPickIndex(clamp(pickIndex() + delta, options().length))
  }

  function chooseModel(value: string) {
    if (creating()) {
      setNewModel(value)
      setPicking(false)
      return
    }
    void commit("model", value)
  }

  function choose() {
    if (phase() === "manual") {
      const value = pickQuery().trim()
      if (value) chooseModel(value)
      return
    }
    const option = options()[pickIndex()]
    if (!option) return
    if (phase() === "variants") {
      chooseModel(option.value ? `${pickBase()}#${option.value}` : pickBase())
      return
    }
    if (option.value === MANUAL) {
      setPickQuery(creating() ? newModel() : (current()?.agent.model ?? ""))
      setPhase("manual")
      return
    }
    const variants = models().find((model) => keyOf(model) === option.value)?.variants ?? []
    if (variants.length > 0) {
      setPickBase(option.value)
      setPickQuery("")
      setPickIndex(0)
      setPhase("variants")
      return
    }
    chooseModel(option.value)
  }

  function pickAt(index: number) {
    setPickIndex(index)
    choose()
  }

  function pickBack() {
    if (phase() !== "models") {
      setPickQuery("")
      setPickIndex(0)
      setPhase("models")
      return
    }
    if (creating()) setPicking(false)
    else cancel()
  }

  async function commit(field: Field, input: string) {
    const id = selected()
    const entry = current()
    if (!entry) return
    const value = field === "system" ? (input.trim() ? input.trimEnd() : "") : input.trim()
    if (field !== "system" && !value) {
      flash(`${labels[field]} is required`, "error")
      return
    }
    if (value === (entry.agent[field] ?? "")) {
      cancel()
      return
    }
    const agent = { [field]: value } satisfies Agent
    const ok = await run(() => api.upsert({ id, action: "edit", agent }), `Saved ${labels[field]} for ${id}`)
    if (ok) cancel()
  }

  async function create() {
    const id = (refs.id?.value ?? "").trim()
    const description = (refs.description?.plainText ?? "").trim()
    const model = newModel()
    const body = refs.system?.plainText ?? ""
    const system = body.trim() ? body.trimEnd() : undefined
    const problem = idError(id)
      ?? (Object.hasOwn(entries(), id) ? `Agent ${id} already exists` : undefined)
      ?? (description ? undefined : "Description is required")
      ?? (model ? undefined : "Model is required")
    if (problem) {
      flash(problem, "error")
      return
    }
    const agent = { mode: "subagent" as const, description, model, ...(system === undefined ? {} : { system }) } satisfies Agent
    if (!(await run(() => api.upsert({ id, action: "create", agent }), `Created ${id}`))) return
    select(id)
    setFocus("detail")
  }

  function save() {
    if (creating()) {
      void create()
      return
    }
    const field = editing()
    if (field !== undefined && field !== "model") void commit(field, refs.editor?.plainText ?? "")
  }

  async function remove() {
    const id = selected()
    const entry = current()
    if (!entry) return
    setConfirming(false)
    if (!(await run(() => api.remove({ id }), entry.builtin ? `Reset ${id}` : `Deleted ${id}`))) return
    if (Object.hasOwn(entries(), id)) {
      setCursor(clamp(cursor(), rows().length))
      return
    }
    setFocus("list")
    select(ids()[0] ?? NEW)
  }

  function leave() {
    if (searching()) {
      setSearching(false)
      return
    }
    if (picking()) {
      pickBack()
      return
    }
    if (creating()) {
      setFocus("list")
      return
    }
    cancel()
  }

  function back() {
    if (confirming()) {
      setConfirming(false)
      return
    }
    if (focus() === "detail") {
      cancel()
      setFocus("list")
      return
    }
    if (query()) {
      if (refs.search) refs.search.value = ""
      filter("")
      return
    }
    ctx.ui.dialog.clear()
  }

  ctx.keymap.layer(() => ({
    mode: "modal",
    priority: 100,
    enabled: () => !textMode(),
    commands: [
      { bind: "up", run: () => move(-1) },
      { bind: "down", run: () => move(1) },
      { bind: "pageup", run: () => page(-1) },
      { bind: "pagedown", run: () => page(1) },
      { bind: "return", run: () => activate() },
      { bind: "tab", run: () => (creating() && focus() === "detail" ? cycle(1) : toggleFocus()) },
      { bind: "shift+tab", run: () => (creating() && focus() === "detail" ? cycle(-1) : toggleFocus()) },
      { bind: "escape", run: () => back() },
      { bind: "ctrl+s", run: () => save() },
      { bind: "/", run: () => beginSearch() },
      { bind: "n", run: () => newAgent() },
      { bind: "d", run: () => shortcut("description") },
      { bind: "m", run: () => shortcut("model") },
      { bind: "s", run: () => shortcut("system") },
      { bind: "x", run: () => askClearSystem() },
    ],
  }))

  ctx.keymap.layer(() => ({
    mode: editMode,
    priority: 100,
    enabled: textMode,
    commands: [
      { bind: "ctrl+s", run: () => save() },
      { bind: "escape", run: () => leave() },
      {
        bind: "ctrl+l",
        run: () => {
          if (!searching() && !picking() && (target() === "system" || target() === "description")) return void clearEditor()
          return false
        },
      },
      {
        bind: "return",
        run: () => {
          if (searching()) return void finishSearch()
          if (picking()) return void choose()
          if (target() === "id") return void cycle(1)
          return false
        },
      },
      {
        bind: "tab",
        run: () => {
          if (creating() && !picking()) return void cycle(1)
          return false
        },
      },
      {
        bind: "shift+tab",
        run: () => {
          if (creating() && !picking()) return void cycle(-1)
          return false
        },
      },
      {
        bind: "up",
        run: () => {
          if (!picking()) return false
          pickMove(-1)
        },
      },
      {
        bind: "down",
        run: () => {
          if (!picking()) return false
          pickMove(1)
        },
      },
    ],
  }))

  createEffect(() => {
    if (!textMode()) return
    onCleanup(ctx.keymap.mode.push(editMode))
  })

  return {
    theme, refs, entries, query, searching, selected, focus, cursor, editing, picking, phase, pickQuery, pickIndex,
    confirming, step, options, creating, target, textMode, groups, ids, items, current, rows, newModel,
    filter, typePicker, pickAt, pickMove, pressAgent, pressField, pressRow, pressStep, newAgent, beginSearch, toggleFocus,
    save, leave, back, activate, startEdit, cancel, select, choose, remove, finishSearch, askClearSystem, confirmClearSystem, canClearSystem, clearEditor,
  }
}

export type State = ReturnType<typeof createState>
