import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type App,
  type ComputedRef,
  createApp,
  defineComponent,
  h,
  nextTick,
  shallowRef,
} from 'vue'
import { useUiStore } from '@/stores/ui'
import {
  provideColumnMountRegistry,
  useColumnLive,
  useColumnMount,
} from './useColumnMount'

type IOCallback = (entries: { isIntersecting: boolean }[]) => void

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []
  callback: IOCallback
  observed: Element[] = []
  disconnected = false
  constructor(callback: IOCallback) {
    this.callback = callback
    MockIntersectionObserver.instances.push(this)
  }
  observe(el: Element) {
    this.observed.push(el)
  }
  unobserve() {
    // モックでは何もしない
  }
  disconnect() {
    this.disconnected = true
  }
  takeRecords() {
    return []
  }
}

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  })
}

describe('useColumnMount: 復帰時の visibility リフレッシュ (#506)', () => {
  let app: App | null = null
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    MockIntersectionObserver.instances = []
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    setDocumentHidden(false)
    pinia = createPinia()
    setActivePinia(pinia)
  })

  afterEach(() => {
    app?.unmount()
    app = null
    vi.unstubAllGlobals()
    setDocumentHidden(false)
  })

  // テストハーネス: provide/inject の親子関係が必要なため h() で最小構成を組む
  // (アプリ本体の Vapor 制約はテストコードには適用しない)
  function mountHarness() {
    const cellEl = document.createElement('div')
    let live: { isVisible: ComputedRef<boolean> } | null = null

    const Child = defineComponent({
      setup() {
        const cellRef = shallowRef<HTMLElement | null>(cellEl)
        useColumnMount('col-1', cellRef, {
          isCompact: shallowRef(false),
          isActive: shallowRef(false),
        })
        live = useColumnLive('col-1')
        return () => null
      },
    })
    const Parent = defineComponent({
      setup() {
        provideColumnMountRegistry()
        return () => h(Child)
      },
    })

    app = createApp(Parent)
    app.use(pinia)
    app.mount(document.createElement('div'))
    if (!live) throw new Error('harness setup failed')
    return { cellEl, live: live as { isVisible: ComputedRef<boolean> } }
  }

  it('IO エントリで visibility が更新される', async () => {
    const { live } = mountHarness()
    await nextTick()
    const io = MockIntersectionObserver.instances.at(-1)
    expect(io).toBeDefined()

    io?.callback([{ isIntersecting: false }])
    expect(live.isVisible.value).toBe(false)

    io?.callback([{ isIntersecting: true }])
    expect(live.isVisible.value).toBe(true)
  })

  it('document.hidden 中の IO エントリは無視される', async () => {
    const { live } = mountHarness()
    await nextTick()
    const io = MockIntersectionObserver.instances.at(-1)

    io?.callback([{ isIntersecting: false }])
    expect(live.isVisible.value).toBe(false)

    setDocumentHidden(true)
    io?.callback([{ isIntersecting: true }])
    // hidden 中は捨てられ stale (false) のまま
    expect(live.isVisible.value).toBe(false)
  })

  it('deckResume で observer を張り直し現在の交差状態を再配送させる', async () => {
    const { cellEl, live } = mountHarness()
    await nextTick()
    const before = MockIntersectionObserver.instances.at(-1)
    expect(before).toBeDefined()

    // 背景化中に不可視化 → stale な false が残るシナリオ
    before?.callback([{ isIntersecting: false }])
    expect(live.isVisible.value).toBe(false)

    // フォアグラウンド復帰
    setDocumentHidden(false)
    useUiStore().emitDeckResume()
    await nextTick()

    // observer が再作成され、対象セルを observe し直している
    const after = MockIntersectionObserver.instances.at(-1)
    expect(after).toBeDefined()
    expect(after).not.toBe(before)
    expect(before?.disconnected).toBe(true)
    expect(after?.observed).toContain(cellEl)

    // 再 observe の初期エントリ (実ブラウザでは仕様上必ず配送される) で復元
    after?.callback([{ isIntersecting: true }])
    expect(live.isVisible.value).toBe(true)
  })
})
