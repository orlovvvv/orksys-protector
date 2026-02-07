# RAG Document Storage

Place your PDF documents in this folder to process them with the RAG system.

## Technology Stack

- **Jina Embeddings v4**: 2048-dimension multimodal embeddings
- **Jina Reranker v3**: State-of-the-art listwise reranking for improved relevance
- **Weaviate**: Self-hosted vector database for similarity search
- **Groq Llama 4 Maverick**: Fast multimodal LLM for answer generation
- **Docling**: Advanced PDF parsing with intelligent chunking

## Usage

### 1. Add PDFs
Place your PDF files in this directory (`src/rag/docs/pdfs/`)

### 2. Set Environment Variables

Add these to your `.env` file:

```bash
# Weaviate (self-hosted)
WEAVIATE_URL="https://weaviate.ork.systems"
WEAVIATE_API_KEY="your-weaviate-api-key"

# Jina API (get your key from https://console.jina.ai)
JINA_API_KEY="your-jina-api-key"

# Groq API (get your key from https://console.groq.com/keys)
GROQ_API_KEY="your-groq-api-key"
```

### 3. Start the Server

```bash
pnpm run dev
```

### 4. Process Documents

```bash
curl -X POST http://localhost:3000/rag/process-pdfs \
  -H "Content-Type: application/json" \
  -d '{"folderPath": "src/rag/docs/pdfs"}'
```

### 5. Query Your Documents

```bash
curl -X POST http://localhost:3000/rag/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What are the main topics in the documents?", "limit": 5}'
```

## How It Works

1. **PDF Processing**:
   - Docling parses PDFs and intelligently chunks them
   - Jina Embeddings v4 API generates 2048-dimension embeddings for each chunk
   - Chunks with embeddings are stored in Weaviate

2. **Query Processing**:
   - Jina Embeddings v4 API generates embedding for the query
   - Weaviate performs vector similarity search (fetches 3x results for reranking)
   - Jina Reranker v3 API reranks results by relevance
   - Groq Llama 4 Maverick generates the final answer with citations

## API Response Format

```json
{
  "query": "Your question here",
  "answer": "The answer based on documents...",
  "chunks": [
    {
      "text": "Relevant document text...",
      "title": "Document Title",
      "metadata": {
        "source": "document.pdf",
        "page": 5
      },
      "score": 0.95
    }
  ]
}
```
