<script setup lang="ts">
import { onMounted, useTemplateRef, watch } from 'vue'

import { usePortal } from '@/composables/usePortal'
import { useVaporTransitionGroup } from '@/composables/useVaporTransition'
import { useToast } from '@/stores/toast'

const { toasts } = useToast()
const { rendered, enteringIds, leavingIds } = useVaporTransitionGroup(toasts, {
  enterDuration: 250,
  leaveDuration: 120,
})

const toastPortalRef = useTemplateRef<HTMLElement>('toastPortalRef')
usePortal(toastPortalRef)

// ネイティブ <dialog> の showModal() (AddColumnDialog 等) は top layer に
// 入るため、z-index ではトーストを上に出せない。トースト自身も popover
// として top layer に載せる (後から開いた top-layer 要素が上に積まれるので
// 常に最前面)。popover="manual" なので背後の操作はブロックしない。
onMounted(() => {
  const el = toastPortalRef.value
  // Popover API 未対応環境は属性を外して fixed + z-index にフォールバック
  if (el && typeof el.showPopover !== 'function') el.removeAttribute('popover')
})

watch(
  () => rendered.value.length,
  (len) => {
    const el = toastPortalRef.value
    if (!el || typeof el.showPopover !== 'function') return
    try {
      if (len > 0 && !el.matches(':popover-open')) el.showPopover()
      else if (len === 0 && el.matches(':popover-open')) el.hidePopover()
    } catch {
      // 表示状態の競合等は無視 (fixed 配置のまま見える)
    }
  },
)
</script>

<template>
    <div ref="toastPortalRef" popover="manual" :class="$style.container">
      <div
        v-for="toast in rendered"
        :key="toast.id"
        :class="[
          $style.toast,
          $style[toast.type],
          enteringIds.has(toast.id) && $style.toastEnter,
          leavingIds.has(toast.id) && $style.toastLeave,
        ]"
      >
        <i
          :class="[
            $style.icon,
            toast.type === 'success' ? 'ti ti-check' :
            toast.type === 'warning' ? 'ti ti-alert-triangle' :
            toast.type === 'error' ? 'ti ti-x' :
            'ti ti-info-circle',
          ]"
        />
        <span :class="$style.text">{{ toast.text }}</span>
      </div>
    </div>
</template>

<style lang="scss" module>
.container {
  position: fixed;
  /* popover (top layer) 時の UA デフォルト (inset:0 / margin:auto / border 等)
     を打ち消す。inset は top/left より先に書くこと (shorthand) */
  inset: auto;
  top: 15%;
  left: 50%;
  translate: -50% 0;
  z-index: var(--nd-z-toast);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin: 0;
  border: none;
  padding: 0;
  background: transparent;
  overflow: visible;
  pointer-events: none;
}

/* UA の「閉じた popover は display:none」を author 指定の display:flex が
   上書きしてしまうため、明示的に再現する (fallback で属性を外した場合は
   このセレクタに一致せず常時 flex) */
.container[popover]:not(:popover-open) {
  display: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: var(--nd-radius-md);
  font-size: 0.85em;
  color: #fff;
  background: var(--nd-panel);
  box-shadow: var(--nd-shadow-m);
  contain: paint;
  pointer-events: auto;
  white-space: nowrap;
  max-width: 90vw;
}

.icon {
  flex-shrink: 0;
  font-size: 1.1em;
}

.text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.success {
  color: #fff;
  background: color-mix(in srgb, var(--nd-success) 90%, transparent);
}

.error {
  color: #fff;
  background: color-mix(in srgb, var(--nd-error) 90%, transparent);
}

.warning {
  color: #fff;
  background: color-mix(in srgb, var(--nd-warn) 85%, transparent);
}

.info {
  color: #fff;
  background: color-mix(in srgb, var(--nd-accent) 85%, transparent);
}

.toastEnter {
  animation: toast-enter 0.25s var(--nd-ease-spring) both;
}

.toastLeave {
  animation: toast-leave var(--nd-duration-base) var(--nd-ease-decel) both;
}

@keyframes toast-enter {
  from {
    opacity: 0;
    transform: translateY(-16px) scale(0.9);
  }
}

@keyframes toast-leave {
  to {
    opacity: 0;
    transform: translateY(6px) scale(0.95);
  }
}

</style>
