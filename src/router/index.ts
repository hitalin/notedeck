import { watch } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { useAccountsStore } from '@/stores/accounts'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'deck',
      component: () => import('@/views/DeckPage.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginPage.vue'),
      meta: { public: true },
    },
    {
      path: '/note/:accountId/:noteId',
      name: 'note-detail',
      component: () => import('@/views/NoteDetailPage.vue'),
      props: true,
    },
    {
      path: '/user/:accountId/:userId',
      name: 'user-profile',
      component: () => import('@/views/UserProfilePage.vue'),
      props: true,
    },
    {
      path: '/pip',
      name: 'pip',
      component: () => import('@/views/PipPage.vue'),
      meta: { pip: true },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundPage.vue'),
      meta: { public: true },
    },
  ],
})

// Non-blocking: let routes through immediately, redirect reactively when loaded
router.beforeEach((to) => {
  const accountsStore = useAccountsStore()

  if (!accountsStore.isLoaded) return

  const isPublic = to.meta.public === true
  const hasAccounts = accountsStore.accounts.length > 0

  if (!isPublic && !hasAccounts) {
    return { name: 'login' }
  }
})

// Redirect to login after accounts finish loading if none exist
export function setupAccountRedirect(): void {
  const accountsStore = useAccountsStore()
  const stop = watch(
    () => accountsStore.isLoaded,
    (loaded) => {
      if (!loaded) return
      stop()
      if (accountsStore.accounts.length === 0) {
        const route = router.currentRoute.value
        if (route.meta.public !== true) {
          router.replace({ name: 'login' })
        }
      }
    },
    { immediate: true },
  )
}
