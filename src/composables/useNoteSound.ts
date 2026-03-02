const bufferCache = new Map<string, AudioBuffer>()
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

  try {
    const url = `https://${host}/client-assets/sounds/syuilo/pope1.mp3`
    const resp = await fetch(url)
    if (!resp.ok) return null
    const arrayBuf = await resp.arrayBuffer()
    const ctx = getAudioContext()
    const audioBuf = await ctx.decodeAudioData(arrayBuf)
    bufferCache.set(host, audioBuf)
    return audioBuf
  } catch {
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
