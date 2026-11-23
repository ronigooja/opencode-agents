import { For } from "solid-js"
import { TextAttributes } from "@opentui/core"
import type { Entry } from "../contract.ts"
import { badgeColor, type Theme } from "./types.ts"

export function Badge(props: { theme: Theme, source: Entry["source"] }) {
  return (
    <text wrapMode="none" flexShrink={0}>
      <span style={{ fg: props.theme.background.base, bg: badgeColor(props.theme, props.source), attributes: TextAttributes.BOLD }}> {props.source} </span>
    </text>
  )
}

export function Keys(props: { theme: Theme, items: readonly (readonly [string, string])[] }) {
  return (
    <text wrapMode="none" truncate>
      <For each={props.items}>
        {([key, action]) => (
          <>
            <span style={{ fg: props.theme.text.base, bg: props.theme.background.raised.high }}> {key} </span>
            <span style={{ fg: props.theme.text.muted }}> {action}  </span>
          </>
        )}
      </For>
    </text>
  )
}
