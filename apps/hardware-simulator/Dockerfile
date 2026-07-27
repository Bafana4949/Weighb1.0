FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 7001 7002
CMD ["python", "simulator.py", "--headless", "--tcp-host", "0.0.0.0", "--tcp-port", "7001"]
