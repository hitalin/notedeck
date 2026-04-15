import type { NormalizedNote } from '@/adapters/types'
import { hapticLight } from '@/utils/haptics'

interface PollApi {
  votePoll(noteId: string, choice: number): Promise<void>
}

export async function votePoll(
  api: PollApi,
  note: NormalizedNote,
  choice: number,
  onMutated?: () => void,
): Promise<void> {
  const poll = note.poll
  if (!poll) return
  if (poll.expiresAt && new Date(poll.expiresAt) < new Date()) return
  const target = poll.choices[choice]
  if (!target) return
  if (target.isVoted) return
  if (!poll.multiple && poll.choices.some((c) => c.isVoted)) return

  hapticLight()
  const prevChoices = poll.choices.map((c) => ({ ...c }))

  // isVoted のみ楽観更新。votes の +1 はストリーミングの pollVoted イベントに任せる
  // (二重カウントを避けるため)。ストリーミング未接続時は次回取得で整合する。
  poll.choices = poll.choices.map((c, i) =>
    i === choice ? { ...c, isVoted: true } : c,
  )
  onMutated?.()

  try {
    await api.votePoll(note.id, choice)
  } catch (e) {
    poll.choices = prevChoices
    onMutated?.()
    throw e
  }
}
