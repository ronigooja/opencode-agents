import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises"
import path from "node:path"
import { list, update } from "../src/config.ts"
import { compose } from "../src/source.ts"

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
    assert.deepEqual((await list(file)).existing, { editable: true, fields: ["steps"], agent: { ...agent, description: "updated" } })
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
    const content = '{ "agents": { "external": 7 } }'
    await writeFile(file, content)
    assert.deepEqual((await list(file)).external, { editable: false, agent: {}, fields: [] })
    await assert.rejects(update(file, "external", "create", agent), /already exists/)
    await assert.rejects(update(file, "external", "edit", agent), /read-only/)
    await assert.rejects(update(file, "external", "remove"), /read-only/)
    assert.equal(await readFile(file, "utf8"), content)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("partial overrides preserve unknown fields, clear empty fields, support reset", async () => {
  const dir = await mkdtemp(path.resolve("test", "fixture-"))
  try {
    const file = path.join(dir, "opencode.json")
    await writeFile(file, JSON.stringify({ agents: { explore: { model: "p/m", steps: 4, options: { x: true }, description: "old" } } }))
    assert.equal((await list(file)).explore.editable, true)
    await update(file, "explore", "edit", { model: "p/new", description: "" })
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")).agents.explore, { model: "p/new", steps: 4, options: { x: true } })
    await update(file, "explore", "edit", { system: "" })
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")).agents.explore, { model: "p/new", steps: 4, options: { x: true } })
    await update(file, "explore", "remove")
    assert.equal((await list(file)).explore, undefined)
    await update(file, "explore", "edit", { model: "p/override" })
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")).agents.explore, { model: "p/override" })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("comments inside an overridden agent survive a field edit", async () => {
  const dir = await mkdtemp(path.resolve("test", "fixture-"))
  try {
    const file = path.join(dir, "opencode.jsonc")
    await writeFile(file, '{\n  "agents": {\n    "explore": {\n      // keep me\n      "model": "p/m"\n    }\n  }\n}\n')
    await update(file, "explore", "edit", { model: "p/new" })
    const content = await readFile(file, "utf8")
    assert.match(content, /\/\/ keep me/)
    assert.match(content, /"model": "p\/new"/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("sources distinguish builtin, config and runtime agents", () => {
  const configured = {
    explore: { editable: true, agent: { model: "p/m" }, fields: [] },
    custom: { editable: true, agent: agent, fields: [] },
  }
  const runtime = [
    { id: "build", agent: { mode: "primary" as const } },
    { id: "explore", agent: { mode: "subagent" as const, description: "runtime" } },
    { id: "plugin-agent", agent: { mode: "subagent" as const } },
  ]
  const entries = compose(configured, runtime)
  assert.deepEqual(entries.build, { editable: true, source: "builtin", builtin: true, agent: { mode: "primary" }, overrides: [], fields: [] })
  assert.deepEqual(entries.explore, { editable: true, source: "config", builtin: true, agent: { mode: "subagent", description: "runtime", model: "p/m" }, overrides: ["model"], fields: [] })
  assert.deepEqual(entries.custom, { editable: true, source: "config", builtin: false, agent, overrides: ["mode", "description", "model"], fields: [] })
  assert.deepEqual(entries["plugin-agent"], { editable: false, source: "runtime", builtin: false, agent: { mode: "subagent" }, overrides: [], fields: [] })
})

test("unsupported config entries are config-sourced but read-only", () => {
  const entries = compose({ broken: { editable: false, agent: {}, fields: [] } }, [{ id: "broken", agent: { mode: "subagent" as const } }])
  assert.deepEqual(entries.broken, { editable: false, source: "config", builtin: false, agent: { mode: "subagent" }, overrides: [], fields: [] })
})
