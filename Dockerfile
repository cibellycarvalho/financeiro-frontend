FROM node:20-alpine AS builder
WORKDIR /app
ARG VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY VITE_API_URL VITE_CRM_API_URL
COPY package*.json .
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
