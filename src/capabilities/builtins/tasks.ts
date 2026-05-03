import type { Command } from '@/commands/registry'
import { useTaskRunnerStore } from '@/stores/taskRunner'
import { useTasksStore } from '@/stores/tasks'

/**
 * `tasks.run` — ユーザー定義タスク (tasks.json5) を id で実行する。
 *
 * - TaskRunner 既存の `runTask()` を薄ラッパーで呼ぶ (= API 直叩きの実体は触らない)
 * - `inputs` を渡せば `usePrompt()` の対話 UI をスキップ (= AI / capability 経由
 *   での非対話実行を可能にする)
 * - 戻り値は TaskRun の projection (status / response / error / runId)
 */
export const tasksRunCapability: Command = {
  id: 'tasks.run',
  label: 'タスク実行',
  icon: 'ti-player-play',
  category: 'general',
  shortcuts: [],
  aiTool: true,
  permissions: ['tasks.run'],
  signature: {
    description:
      'tasks.json5 で定義済みのタスクを id で実行する。' +
      ' inputs を渡すと UI prompt をスキップして値を直接 inject できる。' +
      ' タスクの中身 (Misskey API method / params) は TaskDefinition 側で定義する。',
    params: {
      taskId: {
        type: 'string',
        description: 'TaskDefinition.id (tasks.json5 の各タスクの id)',
      },
      inputs: {
        type: 'object',
        description:
          'TaskInput.id をキーに値を持つオブジェクト。省略時は UI prompt が出る。',
        optional: true,
      },
    },
    returns: {
      type: 'object',
      description:
        'TaskRun projection: { runId, status: "ok"|"error"|"running"|"cancelled", response?, error? }',
    },
  },
  visible: false,
  execute: async (params) => {
    const taskId =
      typeof params?.taskId === 'string' ? params.taskId.trim() : ''
    if (!taskId) throw new Error('tasks.run: taskId is required')

    const def = useTasksStore().getById(taskId)
    if (!def) throw new Error(`tasks.run: task "${taskId}" not found`)

    const rawInputs = params?.inputs
    const inputs =
      rawInputs && typeof rawInputs === 'object' && !Array.isArray(rawInputs)
        ? (rawInputs as Record<string, string>)
        : undefined

    const run = await useTaskRunnerStore().runTask(taskId, inputs)
    if (!run) return { status: 'cancelled' as const }
    return {
      runId: run.id,
      status: run.status,
      response: run.response,
      error: run.error,
    }
  },
}

export const TASKS_BUILTIN_CAPABILITIES: readonly Command[] = [
  tasksRunCapability,
]
