export interface TaskTextInput {
  id: string
  type: 'text'
  prompt: string
  default?: string
}

export interface TaskPickInput {
  id: string
  type: 'pick'
  prompt: string
  options: string[]
  default?: string
}

export type TaskInput = TaskTextInput | TaskPickInput

export interface TaskApiAction {
  type: 'api'
  method: string
  params?: Record<string, unknown>
}

export type TaskAction = TaskApiAction

export interface TaskDefinition {
  id: string
  label: string
  description?: string
  accountId?: string | null
  inputs?: TaskInput[]
  action: TaskAction
}

export interface TasksFile {
  version: 1
  tasks: TaskDefinition[]
}

export type TaskRunStatus = 'running' | 'ok' | 'error'

export interface TaskRun {
  id: number
  taskId: string
  label: string
  status: TaskRunStatus
  startedAt: number
  finishedAt?: number
  accountId: string | null
  method: string
  params: unknown
  response?: unknown
  error?: string
}
