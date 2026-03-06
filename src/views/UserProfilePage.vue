<script setup lang="ts">
import { useRouter } from 'vue-router'
import UserProfileContent from '@/components/window/UserProfileContent.vue'

const props = defineProps<{
  accountId: string
  userId: string
}>()

const router = useRouter()
</script>

<template>
  <div class="user-profile-page">
    <header class="profile-header">
      <router-link to="/" class="back-btn _button">
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path
            d="M15 18l-6-6 6-6"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
      </router-link>
      <h1 class="profile-title">プロフィール</h1>
    </header>

    <UserProfileContent
      :account-id="props.accountId"
      :user-id="props.userId"
    />
  </div>
</template>

<style scoped>
.user-profile-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--nd-bg);
}

.profile-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 50px;
  padding: 0 16px;
  border-bottom: 1px solid var(--nd-divider);
  position: sticky;
  top: 0;
  background: var(--nd-windowHeader);
  backdrop-filter: blur(15px);
  z-index: 10;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  color: var(--nd-fg);
  text-decoration: none;
  transition: background 0.15s;
}

.back-btn:hover {
  background: var(--nd-buttonHoverBg);
  text-decoration: none;
}

.profile-title {
  font-size: 0.9em;
  font-weight: bold;
  margin: 0;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
