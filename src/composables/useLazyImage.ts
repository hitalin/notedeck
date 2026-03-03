import { useIntersectionObserver } from '@vueuse/core'
import { computed, type Ref, ref } from 'vue'

/**
 * ビューポート近傍に入るまで画像読み込みを遅延させる composable。
 * 一度可視になったら observer を停止し、以降は常に src を返す。
 */
export function useLazyImage(
  src: Ref<string | undefined>,
  options?: { rootMargin?: string },
) {
  const targetRef = ref<HTMLElement | null>(null)
  const isVisible = ref(false)

  const { stop } = useIntersectionObserver(
    targetRef,
    ([entry]) => {
      if (entry?.isIntersecting) {
        isVisible.value = true
        stop()
      }
    },
    { rootMargin: options?.rootMargin ?? '600px' },
  )

  const lazySrc = computed(() => (isVisible.value ? src.value : undefined))

  return { targetRef, lazySrc, isVisible }
}
