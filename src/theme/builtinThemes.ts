import darkBaseData from './_dark.json5'
import lightBaseData from './_light.json5'
import miDarkData from './d-dark.json5'
import miLightData from './l-light.json5'
import type { MisskeyTheme } from './types'

/** Base dark theme — used as inheritance base for dark themes */
export const DARK_BASE = darkBaseData as MisskeyTheme

/** Base light theme — used as inheritance base for light themes */
export const LIGHT_BASE = lightBaseData as MisskeyTheme

/** Mi Dark — default dark theme (inherits from DARK_BASE) */
export const MI_DARK = miDarkData as MisskeyTheme

/** Mi Light — default light theme (inherits from LIGHT_BASE) */
export const MI_LIGHT = miLightData as MisskeyTheme

// Legacy aliases — existing code references these
export const DARK_THEME = MI_DARK
export const LIGHT_THEME = MI_LIGHT
