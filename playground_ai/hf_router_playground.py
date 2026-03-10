import os
import sys
from openai import OpenAI
from huggingface_hub import InferenceClient


# Default to NVIDIA's router with the Bytedance 36B Instruct model.
MODEL = "bytedance/seed-oss-36b-instruct"
PROMPT = "What is the capital of France?"
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"


def main() -> None:
    nvidia_key = os.environ.get("NVIDIA_API_KEY")
    hf_key = os.environ.get("HF_TOKEN")
    provider = (sys.argv[1] if len(sys.argv) > 1 else "nvidia").strip().lower()

    if provider in {"nvidia", "openai"}:
        if not nvidia_key:
            raise RuntimeError("NVIDIA_API_KEY is not set")
        client = OpenAI(
            base_url=NVIDIA_BASE_URL,
            api_key=nvidia_key,
        )
        stream = client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "user",
                    "content": PROMPT,
                }
            ],
            temperature=1.1,
            top_p=0.95,
            max_tokens=512,
            stream=True,
            extra_body={"thinking_budget": -1},
        )
    elif provider in {"huggingface_hub", "hfhub", "hf"}:
        if not hf_key:
            raise RuntimeError("HF_TOKEN is not set")
        client = InferenceClient(api_key=hf_key)
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
        raise ValueError("Provider must be one of: nvidia, openai, huggingface_hub")

    for chunk in stream:
        content = chunk.choices[0].delta.content
        if content:
            print(content, end="", flush=True)


if __name__ == "__main__":
    main()
