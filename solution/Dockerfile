ARG BUILDER_IMAGE="node:18"
ARG RUNNER_IMAGE="joseluisq/static-web-server:2.9-alpine"

FROM ${BUILDER_IMAGE} as builder

WORKDIR /app

RUN apt-get update && apt-get install jq --yes && apt-get autoremove --yes

COPY ./app .
RUN yarn install

COPY ./.taq .taq
RUN if test -f .env;\
      then sed -i "s/\(REACT_APP_CONTRACT_ADDRESS *= *\).*/\1$(jq -r 'last(.tasks[]).output[0].address' ./.taq/testing-state.json)/" .env ; \
      else jq -r '"REACT_APP_CONTRACT_ADDRESS=" + last(.tasks[]).output[0].address' ./.taq/testing-state.json > .env ; fi

RUN yarn build:prod

FROM ${RUNNER_IMAGE}

ENV NODE_ENV production
ENV SERVER_FALLBACK_PAGE /public/index.html
COPY --from=builder /app/build /public

EXPOSE 3000

ENTRYPOINT ["static-web-server", "--root", "/public" , "-g", "INFO" ,"-p" , "3000"]
