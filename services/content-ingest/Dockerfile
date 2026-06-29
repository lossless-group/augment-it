FROM node:22-alpine

# ghostscript — server-side PDF compression for source.attach (operator-uploaded
# report PDFs get squeezed with -dPDFSETTINGS=/ebook so the stored corpus copy
# stays a few MB instead of tens of MB).
RUN apk add --no-cache ghostscript

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src

CMD ["npm", "start"]
