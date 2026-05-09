FROM mcr.microsoft.com/playwright:v1.59.1-noble

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends xvfb x11vnc fluxbox novnc websockify \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY docker ./docker
COPY config.example.json ./config.example.json

RUN sed -i 's/\r$//' docker/*.sh
RUN mkdir -p /app/data

CMD ["node", "src/monitor.js"]
