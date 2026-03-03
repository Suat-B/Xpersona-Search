import os
import sys
from openai import OpenAI
from huggingface_hub import InferenceClient


MODEL = "Qwen/Qwen3-4B-Instruct-2507:nscale"
PROMPT = "What is the capital of France?"


def main() -> None:
    api_key = os.environ.get("HF_TOKEN")
    if not api_key:
        raise RuntimeError("HF_TOKEN is not set")

    provider = (sys.argv[1] if len(sys.argv) > 1 else "openai").strip().lower()

    if provider == "openai":
        client = OpenAI(
            base_url="https://router.huggingface.co/v1",
            api_key=api_key,
        )
        stream = client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "user",
                    "content": PROMPT,
                }
            ],
            stream=True,
        )
    elif provider in {"huggingface_hub", "hfhub", "hf"}:
        client = InferenceClient(api_key=api_key)
        stream = client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "user",
                    "content": PROMPT,
                }
            ],
            stream=True,
        )
    else:
        raise ValueError("Provider must be one of: openai, huggingface_hub")

    for chunk in stream:
        content = chunk.choices[0].delta.content
        if content:
            print(content, end="", flush=True)


if __name__ == "__main__":
    main()
