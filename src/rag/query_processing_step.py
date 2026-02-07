import os
from typing import Dict, Any, List, Optional
import httpx
import weaviate
from groq import Groq
from pydantic import BaseModel, Field


# Pydantic input schema for validation
class QueryInput(BaseModel):
    """Input schema for RAG query processing step"""
    query: str = Field(..., description="The user's query/question")
    limit: int = Field(default=5, ge=1, le=50, description="Maximum number of chunks to retrieve")
    stateKey: Optional[str] = Field(default=None, description="Optional state key for storing results")

# Jina API configuration
JINA_EMBEDDINGS_URL = "https://api.jina.ai/v1/embeddings"
JINA_RERANK_URL = "https://api.jina.ai/v1/rerank"
JINA_EMBEDDINGS_MODEL = "jina-embeddings-v4"
JINA_RERANKER_MODEL = "jina-reranker-v3"
EMBEDDING_DIM = 2048

config = {
    "type": "event",
    "name": "ProcessRagQuery",
    "description": "Process RAG query with Jina embeddings, Weaviate search, Jina reranker, and Groq generation",
    "flows": ["rag-workflow"],
    "subscribes": ["rag.query.requested"],
    "emits": ["rag.query.completed"],
    "input": QueryInput.model_json_schema()
}

async def generate_jina_embedding(text: str, api_key: str) -> List[float]:
    """Generate embedding for a single query using Jina Embeddings v4 API"""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            JINA_EMBEDDINGS_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": JINA_EMBEDDINGS_MODEL,
                "normalized": True,
                "embedding_type": "float",
                "input": [text]
            }
        )
        response.raise_for_status()
        data = response.json()
        return data["data"][0]["embedding"]

async def rerank_documents(query: str, documents: List[Dict], top_n: int, api_key: str) -> List[Dict]:
    """Rerank documents using Jina Reranker v3 API"""
    # Extract text from documents for reranking
    doc_texts = [doc["text"] for doc in documents]

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            JINA_RERANK_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": JINA_RERANKER_MODEL,
                "query": query,
                "documents": doc_texts,
                "top_n": top_n,
                "return_documents": True
            }
        )
        response.raise_for_status()
        data = response.json()

        # Reorder documents based on reranker results
        reranked_docs = []
        for result in data["results"]:
            idx = result["index"]
            doc = documents[idx].copy()
            doc["rerank_score"] = result["relevance_score"]
            reranked_docs.append(doc)

        return reranked_docs

async def handler(input, context):
    # Validate input using Pydantic
    try:
        validated_input = QueryInput(**input)
    except Exception as e:
        context.logger.error(f"Input validation failed: {str(e)}")
        raise ValueError(f"Invalid input: {str(e)}")

    query = validated_input.query
    limit = validated_input.limit
    state_key = validated_input.stateKey

    context.logger.info(f"Processing RAG query: {query[:100]}...")

    # Get environment variables
    weaviate_url = os.environ.get('WEAVIATE_URL')
    weaviate_api_key = os.environ.get('WEAVIATE_API_KEY')
    jina_api_key = os.environ.get('JINA_API_KEY')
    groq_api_key = os.environ.get('GROQ_API_KEY')

    if not weaviate_url or not weaviate_api_key:
        raise Exception("Missing WEAVIATE_URL or WEAVIATE_API_KEY environment variables")
    if not jina_api_key:
        raise Exception("Missing JINA_API_KEY environment variable")
    if not groq_api_key:
        raise Exception("Missing GROQ_API_KEY environment variable")

    try:
        # Step 1: Generate embedding for the query using Jina API
        context.logger.info("Generating query embedding with Jina API...")
        query_embedding = await generate_jina_embedding(query, jina_api_key)
        context.logger.info(f"Query embedding dimension: {len(query_embedding)}")

        # Step 2: Connect to Weaviate and search by vector
        context.logger.info(f"Searching Weaviate for top {limit * 3} results (for reranking)...")
        client = weaviate.connect_to_weaviate_cloud(
            weaviate_url,
            auth_credentials=weaviate.api_key(weaviate_api_key)
        )

        collection = client.collections.get('Books')

        # Search by vector - get more results than needed for reranking
        search_limit = limit * 3
        response = collection.query.near_vector(
            near_vector=query_embedding,
            limit=search_limit,
            return_properties=['text', 'title', 'source', 'page']
        )

        chunks = []
        for obj in response.objects:
            props = obj.properties
            chunks.append({
                "text": props.get('text', ''),
                "title": props.get('title', 'Unknown'),
                "metadata": {
                    "source": props.get('source', 'unknown'),
                    "page": props.get('page', 1)
                },
                "score": obj.metadata.distance if hasattr(obj.metadata, 'distance') else None
            })

        context.logger.info(f"Found {len(chunks)} relevant chunks from Weaviate")

        if not chunks:
            answer = "I couldn't find any relevant information in the documents to answer your question."
            result = {
                "query": query,
                "answer": answer,
                "chunks": []
            }
        else:
            # Step 3: Rerank results using Jina Reranker API
            context.logger.info(f"Reranking {len(chunks)} chunks with Jina Reranker API...")
            reranked_chunks = await rerank_documents(query, chunks, limit, jina_api_key)
            context.logger.info(f"Reranked to top {len(reranked_chunks)} chunks")

            # Step 4: Generate answer with Groq using reranked results
            context.logger.info("Generating answer with Groq...")

            groq_client = Groq(api_key=groq_api_key)

            # Build context from reranked chunks
            context_str = "\n\n---\n\n".join([
                f"Document: {c['title']}\nSource: {c['metadata']['source']}, Page {c['metadata']['page']}\n{c['text']}"
                for c in reranked_chunks
            ])

            system_prompt = """You are a helpful assistant that answers questions based on the provided document context.
Always cite the source document and page number when referencing information.
If the answer cannot be found in the context, say so clearly.
Be concise but thorough."""

            user_prompt = f"""Context from documents:
{context_str}

Question: {query}

Please answer the question based on the provided context. Include source citations."""

            chat_completion = groq_client.chat.completions.create(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                model="llama-4-maverick-17b-128e-instruct",  # Llama 4 Maverick for multimodal + reasoning
                temperature=0.3,
                max_tokens=2048
            )

            answer = chat_completion.choices[0].message.content
            context.logger.info(f"Generated answer: {answer[:100]}...")

            result = {
                "query": query,
                "answer": answer,
                "chunks": [
                    {
                        "text": c["text"],
                        "title": c["title"],
                        "metadata": c["metadata"],
                        "score": c.get("rerank_score", c.get("score"))
                    }
                    for c in reranked_chunks
                ]
            }

        client.close()

    finally:
        if 'client' in locals():
            try:
                client.close()
            except:
                pass

    # Store result in state for API to retrieve
    if state_key:
        await context.state.set('rag-workflow', state_key, result)
        context.logger.info(f"Stored result in state with key: {state_key}")

    await context.emit({
        "topic": "rag.query.completed",
        "data": result
    })
