FROM python:3.12-slim

WORKDIR /app

ENV OPENHANDS_GATEWAY_RUNTIME_KIND=docker
ENV OPENHANDS_SUPPRESS_BANNER=1
ENV PYTHONUTF8=1
ENV PYTHONIOENCODING=utf-8

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
RUN python -m playwright install chromium

COPY agent_turn.py ./agent_turn.py
COPY server.py ./server.py

EXPOSE 8010

CMD ["python", "server.py"]
