FROM python:3.9

RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH"

WORKDIR /app

COPY --chown=user ./requirements.txt requirements.txt
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir python-multipart && pip install --no-cache-dir -r requirements.txt

COPY --chown=user . /app

# Use PORT environment variable for Render, default to 7860
# Render automatically sets PORT environment variable
ENV PORT=7860
EXPOSE $PORT

# Make start script executable
COPY --chown=user start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Use app.main:app since the FastAPI app is in app/main.py
# Render can use either the CMD or the start.sh script
# For Render, use shell form to allow environment variable substitution
CMD ["/app/start.sh"]
