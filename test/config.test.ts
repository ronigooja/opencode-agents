import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises"
import path from "node:path"
import { list, update } from "../src/config.ts"

const agent = { mode: "subagent", description: "one", model: "provider/model" } as const

test("JSONC edits preserve unrelated content and serialize concurrent writes", async () => {
  const dir = await mkdtemp(path.resolve("test", "fixture-"))
  try {
    const file = path.join(dir, "opencode.jsonc")
    await writeFile(file, '{\n  // keep this comment\n  "other": { "x": 42 },\n  "agents": {\n    "existing": { "mode": "subagent", "description": "old", "model": "p/m", "steps": 4 }\n  }\n}\n')
    await update(file, "added", "create", agent)
    await update(file, "existing", "edit", { ...agent, description: "updated" })
    await Promise.all(Array.from({ length: 12 }, (_, i) => update(file, `parallel${i}`, "create", agent)))
    await update(file, "added", "remove")
    const content = await readFile(file, "utf8")
    assert.match(content, /\/\/ keep this comment/)
    assert.match(content, /"other": \{ "x": 42 \}/)
    assert.match(content, /"steps": 4/)
    assert.deepEqual((await list(file)).existing, { editable: true, agent: { ...agent, description: "updated" } })
    assert.equal(Object.keys(await list(file)).length, 13)
    assert.equal((await stat(file)).mode & 0o777, 0o600)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("creating an existing ID fails", async () => {
  const dir = await mkdtemp(path.resolve("test", "fixture-"))
  try {
    const file = path.join(dir, "opencode.json")
    await writeFile(file, JSON.stringify({ agents: { existing: agent } }))
    await assert.rejects(update(file, "existing", "create", agent), /already exists/)
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")).agents.existing, agent)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("unsupported entries are listed read-only and remain unchanged", async () => {
  const dir = await mkdtemp(path.resolve("test", "fixture-"))
  try {
    const file = path.join(dir, "opencode.json")
    const content = '{ "agents": { "external": { "mode": "primary", "steps": 7 } } }'
    await writeFile(file, content)
    assert.deepEqual((await list(file)).external, { editable: false })
    await assert.rejects(update(file, "external", "create", agent), /already exists/)
    await assert.rejects(update(file, "external", "edit", agent), /read-only/)
    await assert.rejects(update(file, "external", "remove"), /read-only/)
    assert.equal(await readFile(file, "utf8"), content)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
