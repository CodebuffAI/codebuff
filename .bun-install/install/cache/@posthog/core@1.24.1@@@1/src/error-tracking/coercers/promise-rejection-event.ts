import { isBuiltin, isEvent, isPrimitive } from '@/utils'
import { CoercingContext, ErrorTrackingCoercer, ExceptionLike } from '../types'

type EventWithDetailReason = Event & { detail: { reason: unknown } }

// Web only
export class PromiseRejectionEventCoercer implements ErrorTrackingCoercer<
  PromiseRejectionEvent | EventWithDetailReason
> {
  match(err: unknown): err is PromiseRejectionEvent | EventWithDetailReason {
    return isBuiltin(err, 'PromiseRejectionEvent') || this.isCustomEventWrappingRejection(err)
  }

  private isCustomEventWrappingRejection(err: unknown): err is EventWithDetailReason {
    if (!isEvent(err)) {
      return false
    }
    try {
      const detail = (err as EventWithDetailReason).detail
      return detail != null && typeof detail === 'object' && 'reason' in detail
    } catch {
      return false
    }
  }

  coerce(err: PromiseRejectionEvent | EventWithDetailReason, ctx: CoercingContext): ExceptionLike | undefined {
    const reason = this.getUnhandledRejectionReason(err)
    if (isPrimitive(reason)) {
      return {
        type: 'UnhandledRejection',
        value: `Non-Error promise rejection captured with value: ${String(reason)}`,
        stack: ctx.syntheticException?.stack,
        synthetic: true,
      }
    } else {
      return ctx.apply(reason)
    }
  }

  private getUnhandledRejectionReason(error: PromiseRejectionEvent | EventWithDetailReason): unknown {
    try {
      // PromiseRejectionEvents store the object of the rejection under 'reason'
      // see https://developer.mozilla.org/en-US/docs/Web/API/PromiseRejectionEvent
      if ('reason' in error) {
        return error.reason
      }

      // something, somewhere, (likely a browser extension) effectively casts PromiseRejectionEvents
      // to CustomEvents, moving the `promise` and `reason` attributes of the PRE into
      // the CustomEvent's `detail` attribute, since they're not part of CustomEvent's spec
      // see https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent and
      // https://github.com/getsentry/sentry-javascript/issues/2380
      if ('detail' in error && error.detail != null && typeof error.detail === 'object' && 'reason' in error.detail) {
        return error.detail.reason
      }
    } catch {
      // no-empty
    }

    return error
  }
}
