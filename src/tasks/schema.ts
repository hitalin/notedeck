import JSON5 from 'json5'
import type { TaskAction, TaskDefinition, TaskInput, TasksFile } from './types'

export class TasksParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TasksParseError'
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseInput(raw: unknown, path: string): TaskInput {
  if (!isObj(raw)) throw new TasksParseError(`${path}: must be an object`)
  const id = raw.id
  const type = raw.type
  const prompt = raw.prompt
  if (typeof id !== 'string' || !id)
    throw new TasksParseError(`${path}.id: non-empty string required`)
  if (typeof prompt !== 'string')
    throw new TasksParseError(`${path}.prompt: string required`)
  if (type === 'text') {
    const def = raw.default
    return {
      id,
      type: 'text',
      prompt,
      ...(typeof def === 'string' ? { default: def } : {}),
    }
  }
  if (type === 'pick') {
    const options = raw.options
    if (!Array.isArray(options) || options.some((o) => typeof o !== 'string'))
      throw new TasksParseError(`${path}.options: string[] required`)
    const def = raw.default
    return {
      id,
      type: 'pick',
      prompt,
      options: options as string[],
      ...(typeof def === 'string' ? { default: def } : {}),
    }
  }
  throw new TasksParseError(`${path}.type: must be 'text' or 'pick'`)
}

function parseAction(raw: unknown, path: string): TaskAction {
  if (!isObj(raw)) throw new TasksParseError(`${path}: must be an object`)
  if (raw.type !== 'api')
    throw new TasksParseError(`${path}.type: only 'api' is supported`)
  const method = raw.method
  if (typeof method !== 'string' || !method)
    throw new TasksParseError(`${path}.method: non-empty string required`)
  const params = raw.params
  if (params !== undefined && !isObj(params))
    throw new TasksParseError(`${path}.params: must be an object`)
  return {
    type: 'api',
    method,
    ...(isObj(params) ? { params } : {}),
  }
}

function parseTask(raw: unknown, path: string): TaskDefinition {
  if (!isObj(raw)) throw new TasksParseError(`${path}: must be an object`)
  const id = raw.id
  const label = raw.label
  if (typeof id !== 'string' || !/^[\w-]+$/.test(id))
    throw new TasksParseError(
      `${path}.id: non-empty string matching /^[\\w-]+$/ required`,
    )
  if (typeof label !== 'string' || !label)
    throw new TasksParseError(`${path}.label: non-empty string required`)
  const inputs = raw.inputs
  const parsedInputs =
    inputs === undefined
      ? undefined
      : Array.isArray(inputs)
        ? inputs.map((v, i) => parseInput(v, `${path}.inputs[${i}]`))
        : (() => {
            throw new TasksParseError(`${path}.inputs: must be an array`)
          })()
  const action = parseAction(raw.action, `${path}.action`)
  const accountId = raw.accountId
  const description = raw.description
  const def: TaskDefinition = {
    id,
    label,
    action,
    ...(typeof description === 'string' ? { description } : {}),
    ...(typeof accountId === 'string' || accountId === null
      ? { accountId }
      : {}),
    ...(parsedInputs ? { inputs: parsedInputs } : {}),
  }
  return def
}

export function parseTasks(raw: string): TasksFile {
  const trimmed = raw.trim()
  if (!trimmed) return { version: 1, tasks: [] }
  let data: unknown
  try {
    data = JSON5.parse(trimmed)
  } catch (e) {
    throw new TasksParseError(
      `tasks.json5: JSON5 parse error — ${(e as Error).message}`,
    )
  }
  if (!isObj(data))
    throw new TasksParseError('tasks.json5: root must be an object')
  if (data.version !== 1)
    throw new TasksParseError('tasks.json5: version must be 1')
  const tasks = data.tasks
  if (!Array.isArray(tasks))
    throw new TasksParseError('tasks.json5: tasks must be an array')
  const parsed = tasks.map((t, i) => parseTask(t, `tasks[${i}]`))
  const seen = new Set<string>()
  for (const t of parsed) {
    if (seen.has(t.id))
      throw new TasksParseError(`tasks.json5: duplicate task id "${t.id}"`)
    seen.add(t.id)
  }
  return { version: 1, tasks: parsed }
}
