import { useEmojisStore } from '@/stores/emojis'

export function useEmojiResolver() {
  const emojisStore = useEmojisStore()

  /** Resolve emoji shortcode to URL using note-level data + server cache */
  function resolveEmoji(
    shortcode: string,
    emojis: Record<string, string>,
    reactionEmojis: Record<string, string>,
    serverHost: string,
  ): string | null {
    const base = shortcode.replace(/@\.$/, '')
    const withDot = `${base}@.`
    return (
      emojis[shortcode] ||
      emojis[base] ||
      emojis[withDot] ||
      reactionEmojis[shortcode] ||
      reactionEmojis[base] ||
      reactionEmojis[withDot] ||
      emojisStore.resolve(serverHost, base)
    )
  }

  /** Resolve reaction key (e.g. ":emoji:") to URL, or null for Unicode emoji */
  function reactionUrl(
    reaction: string,
    emojis: Record<string, string>,
    reactionEmojis: Record<string, string>,
    serverHost: string,
  ): string | null {
    if (reaction.startsWith(':') && reaction.endsWith(':')) {
      return resolveEmoji(
        reaction.slice(1, -1),
        emojis,
        reactionEmojis,
        serverHost,
      )
    }
    return null
  }

  return { resolveEmoji, reactionUrl }
}
