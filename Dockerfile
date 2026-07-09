FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN mkdir -p /data uploads
ENV PORT=3000
ENV DATA_DIR=/data
EXPOSE 3000
CMD ["node", "server/index.js"]
