import { For, Show, createEffect, createSignal, untrack } from "solid-js"
import { TextAttributes, type InputRenderable, type ScrollBoxRenderable, type TextareaRenderable } from "@opentui/core"
import { fields, labels, NEW, shortcuts, sourceNotes, type Field } from "./types.ts"
import { steps, type State, type Step } from "./state.ts"
import { Badge } from "./ui.tsx"

const pickerRows = 9
const rowID = (id: string) => (id === NEW ? "agents-row-new" : `agents-row-${id}`)
const fieldID = (field: Field) => `agents-field-${field}`

export function ListPane(props: { s: State, height: number }) {
  const s = props.s
  return (
    <box flexDirection="column" gap={1} height={props.height + 2}>
      <input
        ref={(element: InputRenderable) => (s.refs.search = element)}
        focused={s.searching()}
        placeholder="Search agents (/)"
        placeholderColor={s.theme.text.muted}
        backgroundColor={s.theme.background.raised.high}
        focusedBackgroundColor={s.theme.background.formfield.focused}
        focusedTextColor={s.theme.text.formfield.base}
        cursorColor={s.theme.text.formfield.base}
        onInput={(value: string) => s.filter(value)}
      />
      <scrollbox ref={(element: ScrollBoxRenderable) => (s.refs.list = element)} flexGrow={1} height={0} contentOptions={{ minHeight: 0 }}>
        <ListRow s={s} id={NEW} />
        <For each={s.groups()}>{(group) => <>
          <box height={1} onMouseUp={(event) => event.stopPropagation()} />
          <text fg={s.theme.text.muted} attributes={TextAttributes.BOLD} wrapMode="none" onMouseUp={(event) => event.stopPropagation()}>{group.title}</text>
          <For each={group.ids}>{(id) => <ListRow s={s} id={id} />}</For>
        </>}</For>
      </scrollbox>
      <Show when={s.ids().length === 0}>
        <text fg={s.theme.text.muted} wrapMode="none">No agents match “{s.query()}”.</text>
      </Show>
    </box>
  )
}

function ListRow(props: { s: State, id: string }) {
  const s = props.s
  const theme = s.theme
  const active = () => s.selected() === props.id
  const ink = (color: string) => (active() ? theme.text.action.primary.focused : color)
  const entry = () => s.entries()[props.id]
  const [width, setWidth] = createSignal(0)
  const [idWidth, setIdWidth] = createSignal(Array.from(props.id).length)
  const model = () => {
    const value = entry()?.disabled ? "disabled" : entry()?.source === "runtime" ? "read-only" : entry()?.agent.model ?? "default model"
    const available = Math.max(0, width() - idWidth() - 1)
    const short = value.length > available && value.includes("/") ? value.slice(value.indexOf("/") + 1) : value
    return Array.from(short).slice(0, available).join("")
  }
  createEffect(() => {
    if (active()) s.refs.list?.scrollChildIntoView(rowID(props.id))
  })
  return (
    <box
      id={rowID(props.id)}
      flexDirection="row"
      onSizeChange={function () { setWidth(this.width) }}
      backgroundColor={active() ? theme.background.action.primary.focused : undefined}
      onMouseUp={(event) => {
        event.stopPropagation()
        s.pressAgent(props.id)
      }}
    >
      <Show when={props.id !== NEW} fallback={<text fg={ink(theme.hue.accent[500])} attributes={TextAttributes.BOLD} wrapMode="none">+ New agent</text>}>
        <text fg={ink(entry()?.disabled ? theme.text.muted : theme.text.base)} wrapMode="none" flexShrink={0} onSizeChange={function () { setIdWidth(this.width) }}>{props.id}</text>
        <text fg={ink(theme.text.muted)} wrapMode="none" flexGrow={1} textAlign="right"> {model()}</text>
      </Show>
    </box>
  )
}

export function DetailPane(props: { s: State, height: number }) {
  const s = props.s
  return (
    <box flexDirection="column" height={props.height + 2}>
      <Show when={!s.creating()} fallback={<FormView s={s} height={props.height} />}>
        <Show when={s.current()} fallback={<text fg={s.theme.text.muted} wrapMode="none">No agent selected.</text>}>
          <Detail s={s} height={props.height} />
        </Show>
      </Show>
    </box>
  )
}

function Detail(props: { s: State, height: number }) {
  const s = props.s
  const entry = () => s.current()
  const source = () => entry()?.source ?? "runtime"
  const badge = () => entry()?.builtin ? "builtin" : source()
  return (
    <box flexDirection="column" gap={1} height="100%">
      <box flexDirection="row" gap={2}>
        <text fg={s.theme.text.base} attributes={TextAttributes.BOLD} wrapMode="none">{s.selected()}</text>
        <Badge theme={s.theme} source={badge()} />
        <Show when={entry()?.disabled}><text fg={s.theme.background.base} bg={s.theme.categorical[3 % s.theme.categorical.length][200]} wrapMode="none"> disabled </text></Show>
        <text fg={s.theme.text.muted} wrapMode="none" truncate>mode {entry()?.agent.mode ?? "unknown"} (read-only)</text>
      </box>
      <text fg={s.theme.text.muted} wrapMode="word">{entry()?.builtin && source() === "config" ? "Built-in agent, overridden in opencode.json. Reset to default removes the override." : sourceNotes[badge()]}</text>
      <scrollbox ref={(element: ScrollBoxRenderable) => (s.refs.detail = element)} flexGrow={1} height={0} contentOptions={{ minHeight: 0 }}>
        <box flexDirection="column">
          <For each={fields}>{(field, index) => <>
            <Show when={index() > 0}><box height={1} border={["top"]} borderColor={s.theme.text.muted} /></Show>
            <FieldBlock s={s} field={field} />
          </>}</For>
          <Show when={source() === "config"}>
            <ActionRow s={s} index={fields.length} label={entry()?.builtin ? "Reset to default" : "Delete agent"} />
          </Show>
          <Show when={s.rows().some((row) => row.kind === "toggle")}>
            <ActionRow s={s} index={fields.length + (source() === "config" ? 1 : 0)} label={entry()?.disabled ? "Enable agent" : "Disable agent"} />
          </Show>
        </box>
      </scrollbox>
    </box>
  )
}

function FieldBlock(props: { s: State, field: Field }) {
  const s = props.s
  const theme = s.theme
  const index = () => fields.indexOf(props.field)
  const active = () => s.focus() === "detail" && s.cursor() === index()
  const editing = () => s.editing() === props.field
  const entry = () => s.entries()[s.selected()]
  createEffect(() => {
    if (active()) s.refs.detail?.scrollChildIntoView(fieldID(props.field))
  })
  return (
    <box
      id={fieldID(props.field)}
      flexDirection="column"
      paddingBottom={1}
      onMouseUp={(event) => {
        event.stopPropagation()
        s.pressField(props.field)
      }}
    >
      <box flexDirection="row" gap={2}>
        <text fg={active() ? theme.hue.accent[500] : theme.text.base} attributes={TextAttributes.BOLD} wrapMode="none">
          {active() ? "▸ " : "  "}{labels[props.field]}
        </text>
        <Show when={entry()?.overrides.includes(props.field)}>
          <text fg={theme.text.muted} wrapMode="none">● override</text>
        </Show>
        <text fg={theme.text.muted} wrapMode="none">[{shortcuts[props.field]}] edit</text>
        <Show when={props.field === "system" && s.canClearSystem() && !editing()}>
          <text
            fg={theme.hue.accent[500]}
            wrapMode="none"
            onMouseUp={(event) => {
              event.stopPropagation()
              s.askClearSystem()
            }}
          >
            [x] clear
          </text>
        </Show>
      </box>
      <Show when={editing()} fallback={
        <box paddingLeft={2} flexDirection="column">
          <text fg={entry()?.agent[props.field] ? theme.text.base : theme.text.muted} wrapMode="word">{entry()?.agent[props.field] || (props.field === "model" ? "(not set · uses the default model)" : props.field === "system" ? "(not set · uses the default prompt)" : "(not set)")}</text>
          <Show when={props.field === "system" && active() && s.confirming()}>
            <text fg={theme.hue.accent[500]} wrapMode="word">Clear system prompt? Press Enter again to confirm, Esc to cancel</text>
          </Show>
        </box>
      }>
        <Show when={props.field === "model"} fallback={<TextEditor s={s} field={props.field} />}>
          <ModelPicker s={s} />
        </Show>
      </Show>
    </box>
  )
}

function TextEditor(props: { s: State, field: Field }) {
  const s = props.s
  const theme = s.theme
  const initial = untrack(() => s.entries()[s.selected()]?.agent[props.field] ?? "")
  return (
    <box flexDirection="column" paddingLeft={2}>
      <textarea
        ref={(element: TextareaRenderable) => (s.refs.editor = element)}
        focused
        minHeight={4}
        maxHeight={12}
        initialValue={initial}
        placeholder={props.field === "system" ? "Empty and save removes the system prompt" : "What this subagent is for"}
        focusedBackgroundColor={theme.background.formfield.focused}
        focusedTextColor={theme.text.formfield.base}
        cursorColor={theme.text.formfield.base}
      />
      <text fg={theme.text.muted} wrapMode="none">Ctrl+S save  Ctrl+L clear  Esc cancel</text>
    </box>
  )
}

export function ModelPicker(props: { s: State }) {
  const s = props.s
  const theme = s.theme
  const start = () => Math.max(0, Math.min(s.pickIndex() - Math.floor(pickerRows / 2), s.options().length - pickerRows))
  return (
    <box flexDirection="column" paddingLeft={2} gap={1}>
      <Show when={s.phase() !== "manual"} fallback={
        <box flexDirection="column">
          <input
            focused
            placeholder="provider/model or provider/model#variant"
            focusedBackgroundColor={theme.background.formfield.focused}
            focusedTextColor={theme.text.formfield.base}
            cursorColor={theme.text.formfield.base}
            value={untrack(() => s.pickQuery())}
            onInput={(value: string) => s.typePicker(value)}
          />
          <text fg={theme.text.muted} wrapMode="none">Enter use  Esc back</text>
        </box>
      }>
        <Show when={s.phase() === "models"} fallback={
          <text fg={theme.text.muted} wrapMode="none">Choose a variant for this model</text>
        }>
          <input
            focused
            placeholder="Search models"
            focusedBackgroundColor={theme.background.formfield.focused}
            focusedTextColor={theme.text.formfield.base}
            cursorColor={theme.text.formfield.base}
            onInput={(value: string) => s.typePicker(value)}
          />
        </Show>
        <box flexDirection="column">
          <For each={s.options().slice(start(), start() + pickerRows)}>
            {(option, offset) => {
              const index = () => start() + offset()
              const active = () => index() === s.pickIndex()
              return (
                <box
                  backgroundColor={active() ? theme.background.action.primary.focused : undefined}
                  onMouseUp={(event) => {
                    event.stopPropagation()
                    s.pickAt(index())
                  }}
                >
                  <text wrapMode="none" truncate fg={active() ? theme.text.action.primary.focused : theme.text.base}>
                    {option.title}
                    <span style={{ fg: active() ? theme.text.action.primary.focused : theme.text.muted }}>{option.description ? `  ${option.description}` : ""}</span>
                  </text>
                </box>
              )
            }}
          </For>
        </box>
        <Show when={s.options().length === 0}>
          <text fg={theme.text.muted} wrapMode="none">{s.pickQuery() === "" ? "Loading models…" : "No models match."}</text>
        </Show>
        <text fg={theme.text.muted} wrapMode="none">↑↓ move  Enter choose  Esc back</text>
      </Show>
    </box>
  )
}

function ActionRow(props: { s: State, index: number, label: string }) {
  const s = props.s
  const theme = s.theme
  const active = () => s.focus() === "detail" && s.cursor() === props.index && s.editing() === undefined
  return (
    <box
      id="agents-action"
      flexDirection="column"
      paddingBottom={1}
      backgroundColor={active() ? theme.background.action.primary.focused : undefined}
      onMouseUp={(event) => {
        event.stopPropagation()
        s.pressRow(props.index)
      }}
    >
      <text fg={active() ? theme.text.action.primary.focused : theme.hue.accent[500]} attributes={TextAttributes.BOLD} wrapMode="none">{props.label}</text>
      <Show when={s.confirming() && active()}>
        <text fg={theme.text.base} wrapMode="word">Press Enter again to confirm, Esc to cancel</text>
      </Show>
    </box>
  )
}

export function FormView(props: { s: State, height: number }) {
  const s = props.s
  const theme = s.theme
  const focused = (key: Step) => s.focus() === "detail" && s.step() === steps.indexOf(key)
  const heading = (key: Step, text: string) => (
    <text fg={focused(key) ? theme.hue.accent[500] : theme.text.base} attributes={TextAttributes.BOLD} wrapMode="none">{focused(key) ? "▸ " : "  "}{text}</text>
  )
  return (
    <box flexDirection="column" gap={1} height="100%">
      <text fg={theme.text.base} attributes={TextAttributes.BOLD} wrapMode="none">New subagent  <span style={{ fg: theme.text.muted }}>Tab next field · Ctrl+S create</span></text>
      <scrollbox ref={(element: ScrollBoxRenderable) => (s.refs.detail = element)} flexGrow={1} height={0} contentOptions={{ minHeight: 0 }}>
        <box flexDirection="column" gap={1}>
          <box flexDirection="column">
            {heading("id", "ID")}
            <input
              ref={(element: InputRenderable) => (s.refs.id = element)}
              focused={focused("id")}
              placeholder="e.g. reviewer"
              focusedBackgroundColor={theme.background.formfield.focused}
              focusedTextColor={theme.text.formfield.base}
              cursorColor={theme.text.formfield.base}
              onMouseUp={(event) => {
                event.stopPropagation()
                s.pressStep(0)
              }}
            />
          </box>
          <box flexDirection="column">
            {heading("description", "description (required)")}
            <textarea
              ref={(element: TextareaRenderable) => (s.refs.description = element)}
              focused={focused("description")}
              minHeight={3}
              maxHeight={8}
              placeholder="What this subagent is for"
              focusedBackgroundColor={theme.background.formfield.focused}
              focusedTextColor={theme.text.formfield.base}
              cursorColor={theme.text.formfield.base}
              onMouseUp={(event) => {
                event.stopPropagation()
                s.pressStep(1)
              }}
            />
          </box>
          <box flexDirection="column">
            {heading("model", "model (required)")}
            <Show when={s.picking() && focused("model")} fallback={
              <box
                paddingLeft={2}
                onMouseUp={(event) => {
                  event.stopPropagation()
                  s.pressStep(2)
                }}
              >
                <text fg={s.newModel() ? theme.text.base : theme.text.muted} wrapMode="word">{s.newModel() || "(press Enter to choose a model)"}</text>
              </box>
            }>
              <ModelPicker s={s} />
            </Show>
          </box>
          <box flexDirection="column">
            {heading("system", "system (optional)")}
            <textarea
              ref={(element: TextareaRenderable) => (s.refs.system = element)}
              focused={focused("system")}
              minHeight={4}
              maxHeight={12}
              placeholder="System prompt"
              focusedBackgroundColor={theme.background.formfield.focused}
              focusedTextColor={theme.text.formfield.base}
              cursorColor={theme.text.formfield.base}
              onMouseUp={(event) => {
                event.stopPropagation()
                s.pressStep(3)
              }}
            />
          </box>
        </box>
      </scrollbox>
    </box>
  )
}
