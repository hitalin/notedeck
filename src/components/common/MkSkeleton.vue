<template>
  <div class="skeleton">
    <div class="skeleton-avatar" />
    <div class="skeleton-lines">
      <div class="skeleton-line" style="width: 40%" />
      <div class="skeleton-line" style="width: 80%" />
      <div class="skeleton-line" style="width: 60%" />
    </div>
  </div>
</template>

<style scoped>
.skeleton {
  display: flex;
  padding: 20px 28px;
  gap: 14px;
}

.skeleton-avatar {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  flex-shrink: 0;
  background: linear-gradient(90deg, var(--nd-buttonBg) 25%, var(--nd-panelHighlight) 50%, var(--nd-buttonBg) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

.skeleton-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 6px;
}

.skeleton-line {
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
