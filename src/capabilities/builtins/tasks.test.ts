import { describe, expect, it } from 'vitest'
import { TASKS_BUILTIN_CAPABILITIES, tasksRunCapability } from './tasks'

// Note: 実 Pinia store / TaskRunner 呼び出しは ユニットテストでは
// 検証しない (Tauri / Misskey API 依存)。本テストは capability
// 定義の正しさ + 入力検証 (params validation) のみ。
// 実挙動は手動の統合テスト (DeckTaskRunnerColumn の AI トリガー) で確認。

describe('tasks.run capability', () => {
  it('declares tasks.run permission and aiTool: true', () => {
    expect(tasksRunCapability.permissions).toEqual(['tasks.run'])
    expect(tasksRunCapability.aiTool).toBe(true)
    expect(tasksRunCapability.id).toBe('tasks.run')
    expect(tasksRunCapability.signature?.returns?.type).toBe('object')
  })

  it('marks taskId as required and inputs as optional', () => {
    const params = tasksRunCapability.signature?.params
    expect(params?.taskId?.optional).not.toBe(true)
    expect(params?.inputs?.optional).toBe(true)
  })

  it('throws when taskId is missing or blank', async () => {
    await expect(tasksRunCapability.execute({})).rejects.toThrow(
      /taskId is required/,
    )
    await expect(tasksRunCapability.execute({ taskId: '   ' })).rejects.toThrow(
      /taskId is required/,
    )
  })

  it('is hidden from command palette (visible: false)', () => {
    // タスクは TaskRunner カラムから run するもので、コマンドパレット経由
    // で実行する想定はない (= 重複 UI を避ける)
    expect(tasksRunCapability.visible).toBe(false)
  })
})

describe('TASKS_BUILTIN_CAPABILITIES export', () => {
  it('exposes tasksRunCapability for registry registration', () => {
    expect(TASKS_BUILTIN_CAPABILITIES).toContain(tasksRunCapability)
  })
})
