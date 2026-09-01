FROM python:3.11-slim

# Prevent Python from writing .pyc files & buffer output
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code and entrypoint script
COPY . .

# Expose local port 8000
ENV PORT=8080
EXPOSE 8080

# Run entrypoint script on container startup
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]