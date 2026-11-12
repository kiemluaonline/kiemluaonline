FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py storage.py ./
COPY templates ./templates
COPY static ./static
COPY start.sh ./start.sh
EXPOSE 10000
CMD ["sh","/app/start.sh"]
