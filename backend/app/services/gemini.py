from typing import List, Optional

from google import genai
from google.genai import types

from app.config import get_settings
from app.models import AnalysisResponse, IpmChunk, PestIdentification
from app.services.ipm_search import search_ipm


SUPPORTED_SPREAD_METHODS = "wind, water, adjacency"
MAX_IDENTIFICATION_TOOL_CALLS = 5
MAX_ANALYSIS_TOOL_CALLS = 6


SEARCH_IPM_TOOL = types.Tool(
    function_declarations=[
        types.FunctionDeclaration(
            name="search_ipm",
            description=(
                "Search the UC IPM pest database. Use visual pest descriptions, "
                "crop names, damage symptoms, and likely agronomic terms. This tool "
                "returns relevant pest management chunks from UC IPM."
            ),
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "query": types.Schema(
                        type=types.Type.STRING,
                        description="Semantic search query for the UC IPM vector database.",
                    )
                },
                required=["query"],
            ),
        )
    ]
)


def _client() -> genai.Client:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuntimeError("Missing GEMINI_API_KEY")
    return genai.Client(api_key=settings.gemini_api_key)


def identify_pest(
    image_bytes: bytes,
    mime_type: str,
    crop_type: str,
) -> PestIdentification:
    settings = get_settings()
    image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)

    messages = [
        types.Content(
            role="user",
            parts=[
                image_part,
                types.Part(
                    text=(
                        "Identify this agricultural pest by using UC IPM search as needed.\n\n"
                        f"Crop type: {crop_type}\n\n"
                        "Start from visual details in the image and crop context. Search UC IPM "
                        "with descriptive queries before deciding on the pest name."
                    )
                ),
            ],
        )
    ]

    client = _client()

    for _ in range(MAX_IDENTIFICATION_TOOL_CALLS):
        response = client.models.generate_content(
            model=settings.gemini_vision_model,
            contents=messages,
            config=types.GenerateContentConfig(
                temperature=0.2,
                tools=[SEARCH_IPM_TOOL],
                tool_config=types.ToolConfig(
                    function_calling_config=types.FunctionCallingConfig(
                        mode=types.FunctionCallingConfigMode.AUTO
                    )
                ),
            ),
        )

        candidate = response.candidates[0]
        parts = candidate.content.parts
        tool_calls = [part for part in parts if part.function_call is not None]

        if not tool_calls:
            break

        messages.append(types.Content(role="model", parts=parts))

        tool_result_parts = []
        for part in tool_calls:
            function_call = part.function_call
            query = function_call.args.get("query", "")
            chunks = search_ipm(query)
            tool_result_parts.append(
                types.Part.from_function_response(
                    name="search_ipm",
                    response={"result": _format_ipm_context(chunks)},
                )
            )

        messages.append(types.Content(role="user", parts=tool_result_parts))

    messages.append(
        types.Content(
            role="user",
            parts=[
                types.Part(
                    text=(
                        "Now return the most likely pest identification as structured JSON. "
                        "Use the image, crop context, and UC IPM search results. If uncertain, "
                        "lower the confidence rather than inventing certainty."
                    )
                )
            ],
        )
    )

    final = client.models.generate_content(
        model=settings.gemini_vision_model,
        contents=messages,
        config=types.GenerateContentConfig(
            temperature=0.1,
            response_mime_type="application/json",
            response_schema=PestIdentification,
        ),
    )

    if not final.parsed:
        raise RuntimeError("Gemini failed to identify pest")

    return final.parsed


def synthesize_analysis(
    pest_name: str,
    crop_type: str,
    identification_confidence: float,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
) -> AnalysisResponse:
    settings = get_settings()
    location_context = _format_location_context(latitude, longitude)

    messages = [
        types.Content(
            role="user",
            parts=[
                types.Part(
                    text=(
                        "Find the UC IPM context needed to build the MVP pest analysis.\n\n"
                        f"Detected pest: {pest_name}\n"
                        f"Detection crop: {crop_type}\n"
                        f"Identification confidence: {identification_confidence}\n"
                        f"{location_context}\n\n"
                        "Use search_ipm multiple times. Cover spread/dispersal, vulnerable "
                        "crops or crop damage, and management recommendations before stopping."
                    )
                )
            ],
        )
    ]

    client = _client()

    for _ in range(MAX_ANALYSIS_TOOL_CALLS):
        response = client.models.generate_content(
            model=settings.gemini_analysis_model,
            contents=messages,
            config=types.GenerateContentConfig(
                temperature=0.2,
                tools=[SEARCH_IPM_TOOL],
                tool_config=types.ToolConfig(
                    function_calling_config=types.FunctionCallingConfig(
                        mode=types.FunctionCallingConfigMode.AUTO
                    )
                ),
            ),
        )

        candidate = response.candidates[0]
        parts = candidate.content.parts
        tool_calls = [part for part in parts if part.function_call is not None]

        if not tool_calls:
            break

        messages.append(types.Content(role="model", parts=parts))

        tool_result_parts = []
        for part in tool_calls:
            function_call = part.function_call
            query = function_call.args.get("query", "")
            chunks = search_ipm(query)
            tool_result_parts.append(
                types.Part.from_function_response(
                    name="search_ipm",
                    response={"result": _format_ipm_context(chunks)},
                )
            )

        messages.append(types.Content(role="user", parts=tool_result_parts))

    messages.append(
        types.Content(
            role="user",
            parts=[
                types.Part(
                    text=(
                        "Now produce the final MVP JSON using only the retrieved UC IPM context.\n\n"
                        "Rules:\n"
                        f"- spread_methods must only include: {SUPPORTED_SPREAD_METHODS}.\n"
                        "- If UC IPM mentions equipment, sanitation, humans, or nursery stock, "
                        "put that in recommendations, not spread_methods.\n"
                        "- vulnerable_crop should describe crop damage, likely duration in days, "
                        "and actionable recommendations.\n"
                        "- travel_distance should be a practical MVP distance in miles for alerting.\n"
                        "- confidence must be between 0 and 1.\n"
                        "- Use the original identification confidence as a ceiling if the IPM "
                        "evidence is weak."
                    )
                )
            ],
        )
    )

    final = client.models.generate_content(
        model=settings.gemini_analysis_model,
        contents=messages,
        config=types.GenerateContentConfig(
            temperature=0.1,
            response_mime_type="application/json",
            response_schema=AnalysisResponse,
        ),
    )

    if not final.parsed:
        raise RuntimeError("Gemini failed to produce structured analysis")

    return final.parsed


def _format_ipm_context(chunks: List[IpmChunk]) -> str:
    if not chunks:
        return "No UC IPM context was retrieved."

    formatted = []
    for index, chunk in enumerate(chunks, start=1):
        formatted.append(
            "\n".join(
                [
                    f"[{index}] {chunk.pest or 'unknown pest'} / {chunk.crop or 'unknown crop'}",
                    f"section: {chunk.section or 'unknown'}",
                    f"url: {chunk.url or 'unknown'}",
                    f"similarity: {chunk.similarity:.4f}",
                    chunk.document,
                ]
            )
        )
    return "\n\n---\n\n".join(formatted)


def _format_location_context(
    latitude: Optional[float],
    longitude: Optional[float],
) -> str:
    if latitude is None or longitude is None:
        return "Detection location: not provided"
    return f"Detection location: latitude {latitude}, longitude {longitude}"
