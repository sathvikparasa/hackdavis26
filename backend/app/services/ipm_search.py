from typing import List

import psycopg
from google import genai
from google.genai import types

from app.config import get_settings
from app.models import IpmChunk


def search_ipm(query: str) -> List[IpmChunk]:
    settings = get_settings()
    if not settings.supabase_db_url:
        raise RuntimeError("Missing SUPABASE_DB_URL")
    if not settings.gemini_api_key:
        raise RuntimeError("Missing GEMINI_API_KEY")

    query_embedding = _vector_literal(_embed_query(query))

    sql = """
    select
      chunk_id,
      document,
      url,
      crop,
      pest,
      section,
      1 - (embedding <=> %s::vector) as similarity
    from public.ucipm_chunks
    order by embedding <=> %s::vector
    limit %s;
    """

    with psycopg.connect(settings.supabase_db_url, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (query_embedding, query_embedding, settings.ipm_match_count))
            rows = cur.fetchall()

    return [
        IpmChunk(
            chunk_id=row[0],
            document=row[1],
            url=row[2],
            crop=row[3],
            pest=row[4],
            section=row[5],
            similarity=float(row[6]),
        )
        for row in rows
    ]


def _embed_query(query: str) -> List[float]:
    settings = get_settings()
    client = genai.Client(api_key=settings.gemini_api_key)
    result = client.models.embed_content(
        model=settings.google_embed_model,
        contents=query,
        config=types.EmbedContentConfig(
            task_type="RETRIEVAL_QUERY",
            output_dimensionality=settings.google_embed_dimensions,
        ),
    )
    return result.embeddings[0].values


def _vector_literal(values: List[float]) -> str:
    return "[" + ",".join(str(float(value)) for value in values) + "]"
