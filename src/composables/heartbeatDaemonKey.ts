/**
 * HEARTBEAT (#411) — `useHeartbeatDaemon` の戻り値を AI カラム等から
 * `inject` するための Vue InjectionKey。App.vue で 1 度だけ
 * `provide(HeartbeatDaemonKey, useHeartbeatDaemon())` する。
 */

import type { InjectionKey } from 'vue'
import type { useHeartbeatDaemon } from './useHeartbeatDaemon'

export type HeartbeatDaemonHandle = ReturnType<typeof useHeartbeatDaemon>

export const HeartbeatDaemonKey: InjectionKey<HeartbeatDaemonHandle> =
  Symbol('HeartbeatDaemon')
