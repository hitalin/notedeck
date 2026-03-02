const PROXY_BASE = 'http://127.0.0.1:19820/proxy/image'
const SOUND_PATH = '/client-assets/sounds/syuilo/pope1.mp3'
const RETRY_AFTER_MS = 5 * 60 * 1000

const bufferCache = new Map<string, AudioBuffer>()
const failedHosts = new Map<string, number>()
let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

async function ensureBuffer(host: string): Promise<AudioBuffer | null> {
  const cached = bufferCache.get(host)
  if (cached) return cached

  const failedAt = failedHosts.get(host)
  if (failedAt && Date.now() - failedAt < RETRY_AFTER_MS) return null

  try {
    const remoteUrl = `https://${host}${SOUND_PATH}`
    const url = `${PROXY_BASE}?url=${encodeURIComponent(remoteUrl)}`
    const resp = await fetch(url)
    if (!resp.ok) {
      failedHosts.set(host, Date.now())
      return null
    }
    const arrayBuf = await resp.arrayBuffer()
    const ctx = getAudioContext()
    const audioBuf = await ctx.decodeAudioData(arrayBuf)
    bufferCache.set(host, audioBuf)
    failedHosts.delete(host)
    return audioBuf
  } catch {
    failedHosts.set(host, Date.now())
    return null
  }
}

export function useNoteSound(getHost: () => string | undefined) {
  let lastPlayedAt = 0

  function play() {
    const now = Date.now()
    if (now - lastPlayedAt < 300) return
    lastPlayedAt = now

    const host = getHost()
    if (!host) return

    const ctx = getAudioContext()
    if (ctx.state === 'suspended') {
      ctx.resume()
    }

    ensureBuffer(host).then((buffer) => {
      if (!buffer) return
      const source = ctx.createBufferSource()
      source.buffer = buffer
      const gain = ctx.createGain()
      gain.gain.value = 0.3
      source.connect(gain)
      gain.connect(ctx.destination)
      source.start()
    })
  }

  return { play }
}
