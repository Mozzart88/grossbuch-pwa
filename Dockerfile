# Stage 1 — build
FROM node:25-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_EXCHANGE_API_URL
ENV VITE_EXCHANGE_API_URL=$VITE_EXCHANGE_API_URL
RUN npm run build

# Stage 2 — serve
FROM nginx:alpine
COPY nginx.e2e.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
