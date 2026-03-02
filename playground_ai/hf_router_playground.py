import os
from openai import OpenAI


def main() -> None:
    api_key = os.environ.get("HF_TOKEN")
    if not api_key:
        raise RuntimeError("HF_TOKEN is not set")
    client = OpenAI(
        base_url="https://router.huggingface.co/v1",
        api_key=api_key,
    )
    stream = client.chat.completions.create(
        model="Qwen/Qwen2.5-Coder-7B-Instruct:fastest",
        messages=[
            {
                "role": "user",
                "content": "What is the capital of France?",
            }
        ],
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            print(delta, end="", flush=True)


if __name__ == "__main__":
    main()
