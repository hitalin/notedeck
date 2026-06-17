import type { NormalizedUserDetail } from '@/adapters/types'
import { hapticLight } from '@/utils/haptics'

interface FollowApi {
  followUser(userId: string): Promise<void>
  unfollowUser(userId: string): Promise<void>
  cancelFollowRequest(userId: string): Promise<void>
}

export async function toggleFollow(
  api: FollowApi,
  user: NormalizedUserDetail,
): Promise<void> {
  hapticLight()

  // 鍵アカウントへの未承認フォローリクエストはキャンセルする
  // (following/delete は notFollowing エラーになるため別エンドポイント)
  if (user.hasPendingFollowRequestFromYou) {
    user.hasPendingFollowRequestFromYou = false
    try {
      await api.cancelFollowRequest(user.id)
    } catch (e) {
      user.hasPendingFollowRequestFromYou = true
      throw e
    }
    return
  }

  const prev = user.isFollowing

  try {
    user.isFollowing = !prev
    if (prev) {
      user.followersCount = Math.max(0, user.followersCount - 1)
      await api.unfollowUser(user.id)
    } else {
      user.followersCount += 1
      await api.followUser(user.id)
    }
  } catch (e) {
    user.isFollowing = prev
    if (prev) {
      user.followersCount += 1
    } else {
      user.followersCount = Math.max(0, user.followersCount - 1)
    }
    throw e
  }
}
