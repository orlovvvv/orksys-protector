import weaviate, { WeaviateClient } from 'weaviate-client'
import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

// Minimal schema since this step runs alongside ReadPdfs and receives the same payload
// but doesn't actually use the input
const inputSchema = z.object({
  folderPath: z.string(),
})

export const config: EventConfig = {
  type: 'event',
  name: 'InitWeaviate',
  description: 'Initialize Weaviate collection for RAG with Jina Embeddings v4 (2048 dimensions)',
  subscribes: ['rag.read.pdfs'],
  emits: [],
  flows: ['rag-workflow'],
  input: inputSchema,
}

// Schema without built-in vectorizer - we provide pre-computed embeddings
// Using 2048 dimensions for Jina Embeddings v4
const WEAVIATE_SCHEMA = {
  name: 'Books',
  description: 'Books and documents for RAG with Jina Embeddings v4',
  vectorizers: undefined, // No vectorizer - we provide pre-computed embeddings (2048 dim)
  properties: [
    {
      name: 'text',
      dataType: 'text' as const,
      vectorizePropertyName: false,
    },
    {
      name: 'title',
      dataType: 'text' as const,
      vectorizePropertyName: false,
    },
    {
      name: 'source',
      dataType: 'text' as const,
      vectorizePropertyName: false,
    },
    {
      name: 'page',
      dataType: 'number' as const,
    },
  ],
}

const collectionExists = async (client: WeaviateClient) =>
  client.collections.get('Books').exists()
const createCollection = async (client: WeaviateClient) =>
  client.collections.create(WEAVIATE_SCHEMA)

export const handler: Handlers['InitWeaviate'] = async (_input, { logger }) => {
  logger.info('Initializing Weaviate client for Jina Embeddings v4 (2048 dimensions)')

  const weaviateUrl = process.env.WEAVIATE_URL
  const weaviateApiKey = process.env.WEAVIATE_API_KEY

  if (!weaviateUrl || !weaviateApiKey) {
    logger.error('Missing required environment variables', {
      hasWeaviateUrl: !!weaviateUrl,
      hasWeaviateApiKey: !!weaviateApiKey,
    })
    throw new Error('Missing required environment variables: WEAVIATE_URL or WEAVIATE_API_KEY')
  }

  // Initialize Weaviate client for self-hosted instance
  const client = await weaviate.connectTo(
    weaviateUrl,
    {
      authCredentials: new weaviate.ApiKey(weaviateApiKey),
    },
  )

  try {
    const exists = await collectionExists(client)
    if (exists) {
      logger.info(`Collection "${WEAVIATE_SCHEMA.name}" already exists – keeping as-is.`)
      logger.info('Note: If you changed embedding models, you may need to delete and recreate the collection')
    } else {
      logger.info(`Creating collection "${WEAVIATE_SCHEMA.name}" with 2048 dimensions...`)
      await createCollection(client)
      logger.info('Collection created')
    }
  } catch (error) {
    logger.error('Error in init-weaviate step', { error })
    throw error
  } finally {
    await client.close()
  }
}
