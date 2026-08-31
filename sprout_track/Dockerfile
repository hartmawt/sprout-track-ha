ARG BUILD_FROM
FROM ${BUILD_FROM}

RUN apk add --no-cache jq curl

# Next.js only accepts basePath at build time, but the ingress prefix is not
# known until the add-on is installed. Make the upstream config read it from the
# environment so run.sh can rebuild against the real prefix. Editing in place
# keeps serverExternalPackages, which Prisma depends on.
RUN sed -i 's|^export default nextConfig;$|const __haBase = process.env.NEXT_BASE_PATH \|\| "";\nif (__haBase) { nextConfig.basePath = __haBase; nextConfig.assetPrefix = __haBase; }\nexport default nextConfig;|' /app/next.config.ts && \
    grep -q "__haBase" /app/next.config.ts

COPY run.sh /usr/local/bin/ha-run.sh
COPY tls-proxy.js /usr/local/bin/tls-proxy.js
COPY ingress-forward.js /usr/local/bin/ingress-forward.js
RUN sed -i 's/\r$//' /usr/local/bin/ha-run.sh && \
    chmod +x /usr/local/bin/ha-run.sh

ENTRYPOINT []
CMD ["/usr/local/bin/ha-run.sh"]
