import { readFile, writeFile, rename, mkdir, stat, unlink } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { homedir } from "node:os"
import path from "node:path"
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser"
import { Agent } from "./contract.ts"

const queues = new Map<string, Promise<void>>()

export async function configPath() {
  const directory = process.env.OPENCODE_CONFIG_DIR || path.join(homedir(), ".config", "opencode")
  const json = path.join(directory, "opencode.json")
  const jsonc = path.join(directory, "opencode.jsonc")
  if (await stat(json).then((item) => item.isFile(), () => false)) return json
  if (await stat(jsonc).then((item) => item.isFile(), () => false)) return jsonc
  return json
}

async function read(file: string) {
  const text = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "{}"
    throw error
  })
  const errors: ParseError[] = []
  const data: unknown = parse(text, errors, { allowTrailingComma: true })
  if (errors.length || !data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid configuration JSONC")
  return { text, data: data as Record<string, unknown> }
}

export async function list(file: string) {
  const { data } = await read(file)
  if (data.agents === undefined) return {}
  if (!data.agents || typeof data.agents !== "object" || Array.isArray(data.agents)) throw new Error("agents must be an object")
  return Object.fromEntries(Object.entries(data.agents).map(([id, value]) => {
    const agent = Agent.safeParse(value)
    return [id, agent.success ? { editable: true as const, agent: agent.data } : { editable: false as const }]
  }))
}

export function update(file: string, id: string, action: "create" | "edit" | "remove", agent?: Agent) {
  const key = path.resolve(file)
  const previous = queues.get(key) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(async () => {
    const { text, data } = await read(key)
    if (data.agents !== undefined && (!data.agents || typeof data.agents !== "object" || Array.isArray(data.agents))) throw new Error("agents must be an object")
    const agents = data.agents as Record<string, unknown> | undefined
    const exists = agents !== undefined && Object.hasOwn(agents, id)
    const existing = exists ? agents![id] : undefined
    if (action === "create" && exists) throw new Error(`Agent ${id} already exists`)
    if (action !== "create" && !exists) throw new Error(`Agent ${id} does not exist`)
    if (action !== "create" && !Agent.safeParse(existing).success) throw new Error(`Agent ${id} is read-only`)
    if (action !== "remove" && !agent) throw new Error("Agent is required")
    const value = agent === undefined ? undefined : {
      ...(existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {}),
      ...agent,
    }
    if (value && agent?.system === undefined) delete value.system
    const output = applyEdits(text, modify(text, ["agents", id], value, { formattingOptions: { tabSize: 2, insertSpaces: true } }))
    await mkdir(path.dirname(key), { recursive: true })
    const temporary = `${key}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, output, { mode: 0o600, flag: "wx" })
      await rename(temporary, key)
    } finally {
      await unlink(temporary).catch(() => {})
    }
  })
  queues.set(key, next)
  void next.finally(() => { if (queues.get(key) === next) queues.delete(key) }).catch(() => {})
  return next
}
