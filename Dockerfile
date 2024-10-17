FROM node:20-slim

RUN apt-get -y update && apt-get -y install rsync && apt-get -y install curl

WORKDIR /app

RUN chmod g+w /app

COPY package*.json /app/
COPY ./src ./src

RUN npm install

CMD ["npx", "zx", "./src/index.mjs"]
