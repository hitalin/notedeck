import { useToast } from '@/stores/toast'

export function showLoginPrompt(): void {
  const toast = useToast()
  toast.show('再ログインすると操作できます', 'info')
}
