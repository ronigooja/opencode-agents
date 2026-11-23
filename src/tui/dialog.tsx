import { createMemo } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import type { Plugin } from "@opencode/plugin/tui"
import { createState } from "./state.ts"
import { DetailPane, ListPane } from "./views.tsx"
import { Keys } from "./ui.tsx"
import { wideWidth, type Api, type Entries } from "./types.ts"

export function AgentsDialog(props: { ctx: Plugin.Context, api: Api, initial: Entries }) {
  const dimensions = useTerminalDimensions()
  const wide = () => dimensions().width >= wideWidth
  const s = createState(props.ctx, props.api, props.initial, () => !wide())
  const theme = s.theme
  const height = () => Math.max(6, dimensions().height - 12)
  const hints = createMemo<readonly (readonly [string, string])[]>(() => {
    if (s.searching()) return [["Enter", "open"], ["Esc", "stop"]]
    if (s.picking()) return [["↑↓", "move"], ["Enter", "choose"], ["Esc", "back"]]
    if (s.editing() !== undefined) return [["Ctrl+S", "save"], ["Ctrl+L", "clear"], ["Esc", "cancel"]]
    if (s.creating() && s.focus() === "detail" && s.step() !== 2) return [["Tab", "next"], ["Ctrl+S", "create"], ["Esc", "back"]]
    if (s.focus() === "list") return [["↑↓", "move"], ["Enter", "open"], ["/", "search"], ["n", "new"], ["Esc", "close"]]
    if (s.creating()) return [["Tab", "next"], ["Enter", "choose"], ["Ctrl+S", "create"], ["Esc", "back"]]
    if (s.confirming()) return [["Enter", "confirm"], ["Esc", "cancel"]]
    if (!wide()) return [["↑↓", "move"], ["Enter", "edit"], ["d", "desc"], ["m", "model"], ["s", "system"], ["x", "clear"], ["Esc", "back"]]
    return [["↑↓", "move"], ["Enter", "edit"], ["d", "description"], ["m", "model"], ["s", "system"], ["x", "clear system"], ["Esc", "back"]]
  })
  return (
    <box padding={1} gap={0} flexDirection="column">
      <box flexDirection="row" gap={2}>
        <text fg={theme.text.base} attributes={TextAttributes.BOLD} wrapMode="none">Agents</text>
      </box>
      <box flexDirection="row" gap={2}>
        <box width={wide() ? 40 : undefined} flexGrow={wide() ? 0 : 1} flexShrink={0} visible={wide() || s.focus() === "list"}>
          <ListPane s={s} height={height()} />
        </box>
        <box flexGrow={1} flexDirection="column" visible={wide() || s.focus() === "detail"}>
          <DetailPane s={s} height={height()} />
        </box>
      </box>
      <Keys theme={theme} items={hints()} />
    </box>
  )
}
