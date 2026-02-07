import { randomUUID } from 'node:crypto'
import type { FlowContext } from 'motia'

type RequestResult<T = unknown> =
  | { status: 'completed'; data: T }
  | { status: 'failed'; error: string; statusCode?: number }
  | { status: 'pending' }

// Extract the state manager type from FlowContext
type StateManager = FlowContext['state']

const STATE_TIMEOUT_MS = 10000 // 10 seconds
const POLL_INTERVAL_MS = 100 // 100ms

/**
 * Generate a unique request ID for state-based synchronous requests
 */
export function generateRequestId(): string {
  return randomUUID()
}

/**
 * Type guard to check if result is a completed result
 */
function isCompletedResult<T>(result: RequestResult<T>): result is { status: 'completed'; data: T } {
  return result.status === 'completed'
}

/**
 * Type guard to check if result is a failed result
 */
function isFailedResult(result: RequestResult): result is { status: 'failed'; error: string; statusCode?: number } {
  return result.status === 'failed'
}

/**
 * Get the data from a completed request result
 * Throws an error if the result is not completed
 */
export function getResultData<T>(result: RequestResult<T>): T {
  if (isCompletedResult(result)) {
    return result.data
  }
  throw new Error('Result is not completed')
}

/**
 * Wait for a request to complete by polling state
 * Returns the result when status is 'completed' or 'failed', or throws on timeout
 */
export async function waitForRequestResult<T = unknown>(
  state: StateManager,
  groupId: string,
  requestId: string,
  timeoutMs: number = STATE_TIMEOUT_MS,
): Promise<RequestResult<T>> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    const result = await state.get<RequestResult<T>>(groupId, requestId)

    if (result && result.status !== 'pending') {
      return result
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  // Timeout occurred
  return {
    status: 'failed',
    error: 'Request processing timed out',
    statusCode: 504,
  }
}

/**
 * Initialize a request in state with pending status
 */
export async function initRequest<T = unknown>(
  state: StateManager,
  groupId: string,
  requestId: string,
  requestData: T,
): Promise<void> {
  await state.set(groupId, requestId, {
    status: 'pending',
    ...requestData,
  })
}
