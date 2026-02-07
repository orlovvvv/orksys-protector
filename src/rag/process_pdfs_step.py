import os
import time
import re
from typing import Dict, Any, List
import httpx

from pydantic import BaseModel, Field
from docling.document_converter import DocumentConverter
from docling.chunking import HybridChunker
from transformers import AutoTokenizer


# Pydantic input schema for validation
class FileMetadata(BaseModel):
    filePath: str
    fileName: str


class ProcessPdfsInput(BaseModel):
    """Input schema for PDF processing step"""
    files: List[FileMetadata] = Field(..., description="List of PDF files to process")

# Set environment variable to avoid tokenizer parallelism warning
os.environ["TOKENIZERS_PARALLELISM"] = "false"

# Jina Embeddings v4 configuration
JINA_EMBEDDINGS_URL = "https://api.jina.ai/v1/embeddings"
JINA_EMBEDDINGS_MODEL = "jina-embeddings-v4"
EMBEDDING_DIM = 2048  # Jina Embeddings v4 default dimension

config = {
    "type": "event",
    "name": "ProcessPdfs",
    "description": "Process PDF files with Docling, create chunks, and generate embeddings using Jina API",
    "flows": ["rag-workflow"],
    "subscribes": ["rag.process.pdfs"],
    "emits": ["rag.chunks.ready"],
    "input": ProcessPdfsInput.model_json_schema()
}

async def generate_jina_embeddings(texts: List[str], api_key: str) -> List[List[float]]:
    """Generate embeddings using Jina Embeddings v4 API"""
    context.logger.info(f"Generating embeddings for {len(texts)} chunks using Jina API...")

    async with httpx.AsyncClient(timeout=60.0) as client:
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
                "input": texts
            }
        )
        response.raise_for_status()
        data = response.json()

        embeddings = [item["embedding"] for item in data["data"]]
        context.logger.info(f"Generated {len(embeddings)} embeddings with dimension {len(embeddings[0])}")
        return embeddings

async def handler(input, context):
    # Validate input using Pydantic
    try:
        validated_input = ProcessPdfsInput(**input)
    except Exception as e:
        context.logger.error(f"Input validation failed: {str(e)}")
        raise ValueError(f"Invalid input: {str(e)}")

    jina_api_key = os.environ.get("JINA_API_KEY")
    if not jina_api_key:
        raise Exception("Missing JINA_API_KEY environment variable")

    for file in validated_input.files:
        # Get file info from input
        file_path = file.filePath
        filename = file.fileName

        context.logger.info(f"Processing PDF file: {filename}")

        # Initialize Docling converter and chunker
        converter = DocumentConverter()
        MAX_TOKENS = 1024

        tokenizer = AutoTokenizer.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")
        chunker = HybridChunker(
            tokenizer=tokenizer,
            max_tokens=MAX_TOKENS,
        )

        # Process the PDF
        chunks = []
        try:
            # Convert PDF to Docling document
            result = converter.convert(file_path)
            doc = result.document

            # Get chunks using the chunker
            docling_chunks = list(chunker.chunk(dl_doc=doc))
            context.logger.info(f"Created {len(docling_chunks)} chunks from PDF")

            # Extract text from each chunk
            texts = [chunk.text for chunk in docling_chunks]

            # Generate embeddings using Jina API (batch for efficiency)
            # Process in batches of 100 texts to avoid exceeding API limits
            all_embeddings = []
            batch_size = 100
            for i in range(0, len(texts), batch_size):
                batch_texts = texts[i:i+batch_size]
                batch_embeddings = await generate_jina_embeddings(batch_texts, jina_api_key)
                all_embeddings.extend(batch_embeddings)

            # Create chunk objects with embeddings
            for i, chunk in enumerate(docling_chunks):
                chunks.append({
                    "text": chunk.text,
                    "title": os.path.splitext(filename)[0],
                    "metadata": {
                        "source": filename,
                        "page": chunk.page_number if hasattr(chunk, 'page_number') else 1
                    },
                    "embedding": all_embeddings[i]  # Use Jina-generated embedding
                })

        except Exception as e:
            context.logger.error(f"Error processing {filename}: {str(e)}")
            raise e

        context.logger.info(f"Processed {len(chunks)} chunks with embeddings from PDF")

        # Generate a unique state key using the filename (without extension) and timestamp
        base_name = os.path.splitext(filename)[0]
        # Remove any non-alphanumeric characters and replace spaces with underscores
        safe_name = re.sub(r'[^a-zA-Z0-9]', '_', base_name)
        chunks_state_key = f"chunks_{safe_name}_{int(time.time())}"

        # Save chunks to state
        await context.state.set('rag-workflow', chunks_state_key, chunks)
        context.logger.info(f"Saved chunks to state with key: {chunks_state_key}")

        await context.emit({
            "topic": "rag.chunks.ready",
            "data": {
                "stateKey": chunks_state_key,
                "filename": filename,
                "chunkCount": len(chunks)
            }
        })
