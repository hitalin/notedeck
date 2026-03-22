/**
 * Re-export Tauri's invoke for centralized import path.
 *
 * "[TAURI] Couldn't find callback id" warnings during HMR/reload are harmless
 * Tauri-side messages that cannot be suppressed from JS. A previous attempt to
 * block invoke calls via a "disposing" flag caused all API calls to silently
 * fail when beforeunload fired without an actual unload, resulting in
 * spontaneous mass logouts.
 */
export { invoke } from '@tauri-apps/api/core'
