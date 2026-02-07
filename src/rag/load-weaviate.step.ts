import weaviate from 'weaviate-client'
import type { EventConfig, Handlers } from 'motia'
import type { DocumentChunkType } from './types'
import { z } from 'zod'

const inputSchema = z.object({
  stateKey: z.string(),
})

export const config: EventConfig = {
  type: 'event',
  name: 'LoadWeaviate',
  description: 'Load document chunks with pre-generated embeddings into Weaviate',
  subscribes: ['rag.chunks.ready'],
  emits: ['rag.chunks.loaded'],
  flows: ['rag-workflow'],
  input: inputSchema,
}

export const handler: Handlers['LoadWeaviate'] = async (
  input,
  { emit, logger, state },
) => {
  // Get chunks from state
  const chunks = await state.get<DocumentChunkType[]>('rag-workflow', input.stateKey)
  if (!chunks) {
    throw new Error('No chunks found in state')
  }

  logger.info('Retrieved chunks from state', { count: chunks.length })

  const weaviateUrl = process.env.WEAVIATE_URL
  const weaviateApiKey = process.env.WEAVIATE_API_KEY

  if (!weaviateUrl || !weaviateApiKey) {
    throw new Error('Missing required environment variables: WEAVIATE_URL or WEAVIATE_API_KEY')
  }

  // Initialize Weaviate client
  logger.info('Initializing Weaviate client')
  const client = await weaviate.connectTo(
    weaviateUrl,
    {
      authCredentials: new weaviate.ApiKey(weaviateApiKey),
    },
  )

  try {
    const collection = client.collections.get('Books')

    // Process chunks in batches
    const batchSize = 100
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize).map((chunk: DocumentChunkType) => ({
        properties: {
          text: chunk.text,
          title: chunk.title,
          source: chunk.metadata.source,
          page: chunk.metadata.page,
        },
        vector: chunk.embedding, // Use pre-generated embedding
      }))

      // Insert batch with vectors
      await collection.data.insertMany(batch)
      logger.info(`Inserted batch ${Math.floor(i / batchSize) + 1}`, {
        count: batch.length,
      })
    }

    await emit({ topic: 'rag.chunks.loaded', data: { count: chunks.length } })
    logger.info('All chunks loaded into Weaviate', { total: chunks.length })
  } catch (error) {
    logger.error('Error in load-weaviate step', { error })
    throw error
  } finally {
    await client.close()
  }
}
