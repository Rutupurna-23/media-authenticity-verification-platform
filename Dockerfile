FROM node:22-bookworm

# Firebase emulators require Java.
RUN apt-get update \
    && apt-get install -y openjdk-21-jre-headless \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY functions/package*.json ./functions/
RUN cd functions && npm ci

COPY . .

RUN npm run build
RUN npm --prefix functions run build

# Install Firebase CLI
RUN npm install -g firebase-tools@15.28.1

ENV NODE_ENV=development
ENV FIREBASE_PROJECT_ID=media-authenticity-platform
ENV GCLOUD_PROJECT=media-authenticity-platform
ENV GOOGLE_CLOUD_PROJECT=media-authenticity-platform

ENV FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
ENV FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199

ENV PORT=10000

EXPOSE 10000

CMD firebase emulators:start --only firestore,storage --project media-authenticity-platform & \
    sleep 10 && \
    npm start
