import { useConfirm } from '@/stores/confirm'
import type { DeckColumn } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { usePrompt } from '@/stores/prompt'
import { useToast } from '@/stores/toast'

export type EntityType = 'clip' | 'list' | 'antenna'

export const ENTITY_CONFIGS: Record<
  EntityType,
  {
    label: string
    idKey: string
    updateEndpoint: string
    deleteEndpoint: string
  }
> = {
  clip: {
    label: 'クリップ',
    idKey: 'clipId',
    updateEndpoint: 'clips/update',
    deleteEndpoint: 'clips/delete',
  },
  list: {
    label: 'リスト',
    idKey: 'listId',
    updateEndpoint: 'users/lists/update',
    deleteEndpoint: 'users/lists/delete',
  },
  antenna: {
    label: 'アンテナ',
    idKey: 'antennaId',
    updateEndpoint: 'antennas/update',
    deleteEndpoint: 'antennas/delete',
  },
}

export function useEntityCrud(type: EntityType, getColumn: () => DeckColumn) {
  const config = ENTITY_CONFIGS[type]
  const deckStore = useDeckStore()
  const { confirm } = useConfirm()
  const { prompt } = usePrompt()
  const toast = useToast()

  function getEntityId() {
    return (getColumn() as unknown as Record<string, unknown>)[config.idKey] as
      | string
      | undefined
  }

  async function rename(closeMenu: () => void) {
    closeMenu()
    const col = getColumn()
    const newName = await prompt({
      title: `${config.label}名を変更`,
      defaultValue: col.name ?? '',
    })
    if (!newName) return
    try {
      const entityId = getEntityId()
      if (!entityId || !col.accountId) return
      const { invoke } = await import('@/utils/tauriInvoke')
      await invoke('api_request', {
        accountId: col.accountId,
        endpoint: config.updateEndpoint,
        params: { [config.idKey]: entityId, name: newName },
      })
      deckStore.updateColumn(col.id, { name: newName })
      toast.show(`${config.label}名を変更しました`)
    } catch {
      toast.show(`${config.label}名の変更に失敗しました`, 'error')
    }
  }

  async function deleteEntity(closeMenu: () => void) {
    closeMenu()
    const col = getColumn()
    const ok = await confirm({
      title: `${config.label}を削除`,
      message: `この${config.label}をサーバーから削除しますか？この操作は取り消せません。`,
      okLabel: '削除',
      type: 'danger',
    })
    if (!ok) return
    try {
      const entityId = getEntityId()
      if (!entityId || !col.accountId) return
      const { invoke } = await import('@/utils/tauriInvoke')
      await invoke('api_request', {
        accountId: col.accountId,
        endpoint: config.deleteEndpoint,
        params: { [config.idKey]: entityId },
      })
      deckStore.removeColumn(col.id)
      toast.show(`${config.label}を削除しました`)
    } catch {
      toast.show(`${config.label}の削除に失敗しました`, 'error')
    }
  }

  return { rename, deleteEntity, config }
}
