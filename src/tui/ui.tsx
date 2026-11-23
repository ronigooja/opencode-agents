import { For } from "solid-js"
import type { Theme } from "./types.ts"

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
