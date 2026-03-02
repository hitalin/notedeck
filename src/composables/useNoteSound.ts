const PROXY_BASE = 'http://127.0.0.1:19820/proxy/image'
const RETRY_AFTER_MS = 5 * 60 * 1000
const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

const bufferCache = new Map<string, AudioBuffer>()
const failedHosts = new Map<string, number>()
let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

// Mobile browsers require user interaction to activate AudioContext
if (IS_MOBILE) {
  const activate = () => {
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') ctx.resume()
  }
  document.addEventListener('touchstart', activate, { once: true })
  document.addEventListener('click', activate, { once: true })
}

async function ensureBuffer(
  host: string,
  soundType: string,
): Promise<AudioBuffer | null> {
  const cacheKey = `${host}:${soundType}`
  const cached = bufferCache.get(cacheKey)
  if (cached) return cached

  const failedAt = failedHosts.get(cacheKey)
  if (failedAt && Date.now() - failedAt < RETRY_AFTER_MS) return null

  try {
    const remoteUrl = `https://${host}/client-assets/sounds/${soundType}.mp3`
    const url = IS_MOBILE
      ? remoteUrl
      : `${PROXY_BASE}?url=${encodeURIComponent(remoteUrl)}`
    const resp = await fetch(url)
    if (!resp.ok) {
      failedHosts.set(cacheKey, Date.now())
      return null
    }
    const arrayBuf = await resp.arrayBuffer()
    const ctx = getAudioContext()
    const audioBuf = await ctx.decodeAudioData(arrayBuf)
    bufferCache.set(cacheKey, audioBuf)
    failedHosts.delete(cacheKey)
    return audioBuf
  } catch {
    failedHosts.set(cacheKey, Date.now())
    return null
  }
}

export function useNoteSound(
  getHost: () => string | undefined,
  soundType = 'syuilo/n-aec',
) {
  let lastPlayedAt = 0

  function play() {
    const now = Date.now()
    if (now - lastPlayedAt < 300) return
    lastPlayedAt = now

    const host = getHost()
    if (!host) return

    const ctx = getAudioContext()
    if (ctx.state === 'suspended') ctx.resume()

    ensureBuffer(host, soundType).then((buffer) => {
      if (!buffer) return
      const source = ctx.createBufferSource()
      source.buffer = buffer
      const gain = ctx.createGain()
      // Fade-in to prevent crackling/popping
      gain.gain.setValueAtTime(0, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.005)
      source.connect(gain)
      gain.connect(ctx.destination)
      source.start()
    })
  }

  function warmup() {
    const host = getHost()
    if (host) ensureBuffer(host, soundType)
  }

  return { play, warmup }
}
