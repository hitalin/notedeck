import { useToast } from '@/stores/toast'

export function showLoginPrompt(): void {
  const toast = useToast()
  toast.show('再ログインするとリアクションや投稿ができます', 'info')
}
