/**
 * Floating reaction effect — Misskey-compatible.
 * When a reaction count increases, the emoji floats upward and fades out.
 */

const EFFECT_DURATION = 1100 // ms

export function spawnReactionEffect(buttonEl: HTMLElement): void {
  if (document.hidden) return

  const rect = buttonEl.getBoundingClientRect()
  const x = rect.left + 16
  const y = rect.top + buttonEl.offsetHeight / 2

  // Clone emoji from the button (<img> for custom/twemoji, text for native)
  const emojiImg = buttonEl.querySelector('img')

  const container = document.createElement('div')
  container.style.cssText = `
    pointer-events: none;
    position: fixed;
    width: 128px;
    height: 128px;
    top: ${y - 64}px;
    left: ${x - 64}px;
    z-index: var(--nd-z-popup);
  `

  const text = document.createElement('span')
  const angle = 90 - Math.random() * 180

  if (emojiImg) {
    const clone = emojiImg.cloneNode(true) as HTMLImageElement
    clone.style.cssText = 'height: 1em; width: auto; vertical-align: middle;'
    text.appendChild(clone)
  } else {
    // Native emoji: get text content excluding the count span
    const clone = buttonEl.cloneNode(true) as HTMLElement
    clone.querySelector('span')?.remove()
    text.textContent = clone.textContent?.trim() ?? ''
  }

  text.style.cssText = `
    display: block;
    height: 1em;
    text-align: center;
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    margin: auto;
    color: var(--nd-accent);
    font-size: 18px;
    font-weight: bold;
    transform: translateY(-30px);
    transition: transform 1s cubic-bezier(0, .5, 0, 1), opacity 1s cubic-bezier(.5, 0, 1, .5);
    will-change: opacity, transform;
  `

  container.appendChild(text)
  document.body.appendChild(container)

  // Misskey uses setTimeout(10) to ensure the initial style is committed
  // before applying the target state, so the CSS transition triggers.
  setTimeout(() => {
    text.style.opacity = '0'
    text.style.transform = `translateY(-50px) rotateZ(${angle}deg)`
  }, 10)

  setTimeout(() => {
    container.remove()
  }, EFFECT_DURATION)
}
