<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only

Adapted from Misskey's MkSystemIcon.vue:
https://github.com/misskey-dev/misskey/blob/develop/packages/frontend/src/components/global/MkSystemIcon.vue
NoteDeck テーマ変数に合わせて色を置換。info / question / error の 3 種のみ移植。
-->

<script setup lang="ts">
defineProps<{
  type: 'info' | 'question' | 'error'
}>()
</script>

<template>
  <svg
    v-if="type === 'info'"
    :class="[$style.icon, $style.info]"
    viewBox="0 0 160 160"
  >
    <path
      d="M80,108L80,72"
      pathLength="1"
      :class="[$style.line, $style.animLine]"
    />
    <path d="M80,52L80,52" :class="[$style.line, $style.animFade]" />
    <circle
      cx="80"
      cy="80"
      r="56"
      pathLength="1"
      :class="[$style.line, $style.animCircle]"
    />
  </svg>
  <svg
    v-else-if="type === 'question'"
    :class="[$style.icon, $style.question]"
    viewBox="0 0 160 160"
  >
    <path
      d="M80,92L79.991,84C88.799,83.98 96,76.962 96,68C96,59.038 88.953,52 79.991,52C71.03,52 64,59.038 64,68"
      pathLength="1"
      :class="[$style.line, $style.animLine]"
    />
    <path d="M80,108L80,108" :class="[$style.line, $style.animFade]" />
    <circle
      cx="80"
      cy="80"
      r="56"
      pathLength="1"
      :class="[$style.line, $style.animCircle]"
    />
  </svg>
  <svg
    v-else-if="type === 'error'"
    :class="[$style.icon, $style.error]"
    viewBox="0 0 160 160"
  >
    <path
      d="M63,63L96,96"
      pathLength="1"
      style="--duration: 0.3s"
      :class="[$style.line, $style.animLine]"
    />
    <path
      d="M96,63L63,96"
      pathLength="1"
      style="--duration: 0.3s; --delay: 0.2s"
      :class="[$style.line, $style.animLine]"
    />
    <circle
      cx="80"
      cy="80"
      r="56"
      pathLength="1"
      :class="[$style.line, $style.animCircle]"
    />
  </svg>
</template>

<style lang="scss" module>
.icon {
  stroke-linecap: round;
  stroke-linejoin: round;

  &.info {
    color: var(--nd-accent);
  }

  &.question {
    color: var(--nd-fg);
  }

  &.error {
    color: var(--nd-error);
  }
}

.line {
  fill: none;
  stroke: currentColor;
  stroke-width: 8px;
  shape-rendering: geometricPrecision;
}

.animLine {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: line var(--duration, 0.5s) cubic-bezier(0, 0, 0.25, 1) 1 forwards;
  animation-delay: var(--delay, 0s);
}

.animCircle {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: line var(--duration, 0.5s) cubic-bezier(0, 0, 0.25, 1) 1 forwards;
  animation-delay: var(--delay, 0s);
  transform-origin: center;
  transform: rotate(-90deg);
}

.animFade {
  opacity: 0;
  animation: fade-in var(--duration, 0.5s) cubic-bezier(0, 0, 0.25, 1) 1 forwards
    ;
  animation-delay: var(--delay, 0s);
}

@keyframes line {
  0% {
    stroke-dashoffset: 1;
    opacity: 0;
  }
  100% {
    stroke-dashoffset: 0;
    opacity: 1;
  }
}

@keyframes fade-in {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
</style>
