export interface AnalyticsEvent {
  name: string
  props?: Record<string, unknown>
  timestamp: number
}

const events: AnalyticsEvent[] = []

/** 사용자 행동 이벤트를 기록한다. 콘솔 출력 + 메모리 배열 저장(데모용). */
export function track(name: string, props?: Record<string, unknown>): void {
  const event: AnalyticsEvent = { name, props, timestamp: Date.now() }
  events.push(event)
  console.info('[analytics]', name, props ?? {})
}

/** 지금까지 기록된 이벤트 목록 (디버깅용) */
export function getTrackedEvents(): readonly AnalyticsEvent[] {
  return events
}
