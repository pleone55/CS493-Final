FROM node:14
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
ENV PORT=8000
EXPOSE ${PORT}
ENV GOOGLE_APPLICATION_CREDENTIALS='./final-project-leonep-1041pm-3265151e17ae.json'
CMD ["npm", "start"]