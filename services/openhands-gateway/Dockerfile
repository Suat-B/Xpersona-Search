FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY agent_turn.py ./agent_turn.py
COPY server.py ./server.py

EXPOSE 8010

CMD ["python", "server.py"]
