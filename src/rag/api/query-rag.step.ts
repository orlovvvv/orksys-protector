import type { ApiRouteConfig, Handlers } from 'motia'
import type { RAGResponse } from '../types'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { StateManager } from 'motia'

const STATE_TIMEOUT_MS = 60000 // 60 seconds

type RequestResult<T = unknown> =
  | { status: 'completed'; data: T }
  | { status: 'failed'; error: string; statusCode: number }

async function waitForRequestResult<T = unknown>(
  state: StateManager,
  groupId: string,
  requestId: string,
  timeoutMs: number = STATE_TIMEOUT_MS,
): Promise<RequestResult<T>> {
  const startTime = Date.now()
  const pollInterval = 500

  while (Date.now() - startTime < timeoutMs) {
    const result = await state.get<RequestResult<T>>(groupId, requestId)
    if (result) {
      return result
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval))
  }

  throw new Error('Request timeout')
}

async function initRequest(
  state: StateManager,
  groupId: string,
  requestId: string,
): Promise<void> {
  await state.set(groupId, requestId, {
    status: 'pending',
  })
}

function generateRequestId(): string {
  return randomUUID()
}

const bodySchema = z.object({
  query: z.string().min(1, 'Query is required'),
  limit: z.number().optional().default(5),
})

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'RagQuery',
  path: '/rag/query',
  method: 'POST',
  description: 'Query the RAG system using Groq + Llama 4 Maverick',
  emits: ['rag.query.requested', 'rag.query.completed'],
  flows: ['rag-workflow'],
  bodySchema,
  responseSchema: {
    200: z.object({
      query: z.string(),
      answer: z.string(),
      chunks: z.array(
        z.object({
          text: z.string(),
          title: z.string(),
          metadata: z.object({
            source: z.string(),
            page: z.number(),
          }),
          score: z.number().optional(),
        }),
      ),
    }),
    400: z.object({
      error: z.string(),
    }),
    500: z.object({
      error: z.string(),
    }),
    504: z.object({
      error: z.string(),
    }),
  },
}

export const handler: Handlers['RagQuery'] = async (req, { emit, logger, state }) => {
  const { query, limit } = bodySchema.parse(req.body)

  logger.info('Processing RAG query', { query, limit })

  const groqApiKey = process.env.GROQ_API_KEY
  if (!groqApiKey) {
    return {
      status: 500,
      body: {
        error: 'RAG system not properly configured - missing GROQ_API_KEY',
      },
    }
  }

  try {
    // Generate request ID and initialize state
    const requestId = generateRequestId()
    await initRequest(state, 'rag-workflow', requestId)

    // Emit query request event
    await emit({
      topic: 'rag.query.requested',
      data: {
        query,
        limit,
        stateKey: requestId,
      },
    })

    // Wait for result from Python processing step
    const result = await waitForRequestResult<RAGResponse>(
      state,
      'rag-workflow',
      requestId,
      60000, // 60 second timeout
    )

    if (result.status === 'failed') {
      return {
        status: result.statusCode,
        body: { error: result.error },
      }
    }

    return {
      status: 200,
      body: result.data,
    }
  } catch (error) {
    logger.error('Error processing RAG query', {
      error,
      query,
    })

    const isTimeout = error instanceof Error && error.message === 'Request timeout'

    return {
      status: isTimeout ? 504 : 500,
      body: {
        error: isTimeout ? 'Query processing timeout' : 'Failed to process RAG query',
      },
    }
  }
}
