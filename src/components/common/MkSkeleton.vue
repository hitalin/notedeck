<template>
  <div :class="$style.skeleton">
    <div :class="$style.skeletonAvatar" />
    <div :class="$style.skeletonLines">
      <div :class="$style.skeletonLine" style="width: 40%" />
      <div :class="$style.skeletonLine" style="width: 80%" />
      <div :class="$style.skeletonLine" style="width: 60%" />
    </div>
  </div>
</template>

<style lang="scss" module>
.skeleton {
  display: flex;
  padding: 20px 28px;
  gap: 14px;
}

.skeletonAvatar {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  flex-shrink: 0;
  background: linear-gradient(90deg, var(--nd-buttonBg) 25%, var(--nd-panelHighlight) 50%, var(--nd-buttonBg) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

.skeletonLines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 6px;
}

.skeletonLine {
  height: 12px;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--nd-buttonBg) 25%, var(--nd-panelHighlight) 50%, var(--nd-buttonBg) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
</style>
