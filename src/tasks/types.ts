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

export interface TaskPresentation {
  revealOnRun?: boolean
  clearHistoryOnRun?: boolean
  focusInput?: boolean
}

export interface TaskDefinition {
  id: string
  label: string
  detail?: string
  description?: string
  icon?: string
  group?: string
  isDefault?: boolean
  pinned?: boolean
  accountId?: string | null
  inputs?: TaskInput[]
  action: TaskAction
  presentation?: TaskPresentation
}

export const TASKS_FILE_VERSION = 2 as const

export interface TasksFile {
  version: typeof TASKS_FILE_VERSION
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
