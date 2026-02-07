import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'

const bodySchema = z.object({
  folderPath: z.string().default('src/rag/docs/pdfs'),
})

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'RagProcessPdfs',
  path: '/rag/process-pdfs',
  method: 'POST',
  description: 'Start PDF processing workflow for RAG',
  emits: ['rag.read.pdfs'],
  flows: ['rag-workflow'],
  bodySchema,
  responseSchema: {
    200: z.object({
      message: z.string(),
      folderPath: z.string(),
    }),
    400: z.object({
      error: z.string(),
    }),
    500: z.object({
      error: z.string(),
    }),
  },
}

export const handler: Handlers['RagProcessPdfs'] = async (req, { emit, logger }) => {
  const { folderPath } = bodySchema.parse(req.body)

  logger.info('Starting PDF processing workflow', { folderPath })

  try {
    await emit({
      topic: 'rag.read.pdfs',
      data: { folderPath },
    })

    return {
      status: 200,
      body: {
        message: 'PDF processing workflow started',
        folderPath,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Failed to start PDF processing', { error: message })

    return {
      status: 500,
      body: { error: 'Failed to start PDF processing' },
    }
  }
}
