import type { InjectionKey } from 'vue'
import { inject, provide } from 'vue'

const NOTE_ACCOUNT_ID: InjectionKey<string> = Symbol('noteAccountId')

/** Provide the accountId for the current note rendering tree. */
export function provideNoteAccountId(accountId: string): void {
  provide(NOTE_ACCOUNT_ID, accountId)
}

/** Inject the accountId from the nearest note rendering ancestor. */
export function useNoteAccountId(): string | undefined {
  return inject(NOTE_ACCOUNT_ID, undefined)
}
