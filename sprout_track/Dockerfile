ARG BUILD_FROM
FROM ${BUILD_FROM}

RUN apk add --no-cache jq

COPY run.sh /usr/local/bin/ha-run.sh
RUN sed -i 's/\r$//' /usr/local/bin/ha-run.sh && \
    chmod +x /usr/local/bin/ha-run.sh

ENTRYPOINT []
CMD ["/usr/local/bin/ha-run.sh"]
