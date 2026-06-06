FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src

CMD ["npm", "start"]
