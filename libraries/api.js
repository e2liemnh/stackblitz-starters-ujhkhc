/*! shopify/storefront-api-client@0.3.4 -- Copyright (c) 2023-present, Shopify Inc. -- license (MIT): https://github.com/Shopify/shopify-app-js/blob/main/LICENSE.md */
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.ShopifyStorefrontAPIClient = {}));
})(this, (function (exports) { 'use strict';

    const CLIENT$1 = 'GraphQL Client';
    const MIN_RETRIES = 0;
    const MAX_RETRIES = 3;
    const GQL_API_ERROR = "An error occurred while fetching from the API. Review 'graphQLErrors' for details.";
    const UNEXPECTED_CONTENT_TYPE_ERROR = 'Response returned unexpected Content-Type:';
    const NO_DATA_OR_ERRORS_ERROR = 'An unknown error has occurred. The API did not return a data object or any errors in its response.';
    const CONTENT_TYPES = {
        json: 'application/json',
        multipart: 'multipart/mixed',
    };
    const SDK_VARIANT_HEADER$1 = 'X-SDK-Variant';
    const SDK_VERSION_HEADER$1 = 'X-SDK-Version';
    const DEFAULT_SDK_VARIANT$1 = 'shopify-graphql-client';
    // This is value is replaced with package.json version during rollup build process
    const DEFAULT_CLIENT_VERSION$1 = '0.10.4';
    const RETRY_WAIT_TIME = 1000;
    const RETRIABLE_STATUS_CODES = [429, 503];
    const DEFER_OPERATION_REGEX = /@(defer)\b/i;
    const NEWLINE_SEPARATOR = '\r\n';
    const BOUNDARY_HEADER_REGEX = /boundary="?([^=";]+)"?/i;
    const HEADER_SEPARATOR = NEWLINE_SEPARATOR + NEWLINE_SEPARATOR;

    function formatErrorMessage(message, client = CLIENT$1) {
        return message.startsWith(`${client}`) ? message : `${client}: ${message}`;
    }
    function getErrorMessage(error) {
        return error instanceof Error ? error.message : JSON.stringify(error);
    }
    function getErrorCause(error) {
        return error instanceof Error && error.cause ? error.cause : undefined;
    }
    function combineErrors(dataArray) {
        return dataArray.flatMap(({ errors }) => {
            return errors ?? [];
        });
    }
    function validateRetries({ client, retries, }) {
        if (retries !== undefined &&
            (typeof retries !== 'number' ||
                retries < MIN_RETRIES ||
                retries > MAX_RETRIES)) {
            throw new Error(`${client}: The provided "retries" value (${retries}) is invalid - it cannot be less than ${MIN_RETRIES} or greater than ${MAX_RETRIES}`);
        }
    }
    function getKeyValueIfValid(key, value) {
        return value &&
            (typeof value !== 'object' ||
                Array.isArray(value) ||
                (typeof value === 'object' && Object.keys(value).length > 0))
            ? { [key]: value }
            : {};
    }
    function buildDataObjectByPath(path, data) {
        if (path.length === 0) {
            return data;
        }
        const key = path.pop();
        const newData = {
            [key]: data,
        };
        if (path.length === 0) {
            return newData;
        }
        return buildDataObjectByPath(path, newData);
    }
    function combineObjects(baseObject, newObject) {
        return Object.keys(newObject || {}).reduce((acc, key) => {
            if ((typeof newObject[key] === 'object' || Array.isArray(newObject[key])) &&
                baseObject[key]) {
                acc[key] = combineObjects(baseObject[key], newObject[key]);
                return acc;
            }
            acc[key] = newObject[key];
            return acc;
        }, Array.isArray(baseObject) ? [...baseObject] : { ...baseObject });
    }
    function buildCombinedDataObject([initialDatum, ...remainingData]) {
        return remainingData.reduce(combineObjects, { ...initialDatum });
    }

    function generateHttpFetch({ clientLogger, customFetchApi = fetch, client = CLIENT$1, defaultRetryWaitTime = RETRY_WAIT_TIME, retriableCodes = RETRIABLE_STATUS_CODES, }) {
        const httpFetch = async (requestParams, count, maxRetries) => {
            const nextCount = count + 1;
            const maxTries = maxRetries + 1;
            let response;
            try {
                response = await customFetchApi(...requestParams);
                clientLogger({
                    type: 'HTTP-Response',
                    content: {
                        requestParams,
                        response,
                    },
                });
                if (!response.ok &&
                    retriableCodes.includes(response.status) &&
                    nextCount <= maxTries) {
                    throw new Error();
                }
                return response;
            }
            catch (error) {
                if (nextCount <= maxTries) {
                    const retryAfter = response?.headers.get('Retry-After');
                    await sleep(retryAfter ? parseInt(retryAfter, 10) : defaultRetryWaitTime);
                    clientLogger({
                        type: 'HTTP-Retry',
                        content: {
                            requestParams,
                            lastResponse: response,
                            retryAttempt: count,
                            maxRetries,
                        },
                    });
                    return httpFetch(requestParams, nextCount, maxRetries);
                }
                throw new Error(formatErrorMessage(`${maxRetries > 0
                ? `Attempted maximum number of ${maxRetries} network retries. Last message - `
                : ''}${getErrorMessage(error)}`, client));
            }
        };
        return httpFetch;
    }
    async function sleep(waitTime) {
        return new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    function createGraphQLClient({ headers, url, customFetchApi = fetch, retries = 0, logger, }) {
        validateRetries({ client: CLIENT$1, retries });
        const config = {
            headers,
            url,
            retries,
        };
        const clientLogger = generateClientLogger(logger);
        const httpFetch = generateHttpFetch({
            customFetchApi,
            clientLogger,
            defaultRetryWaitTime: RETRY_WAIT_TIME,
        });
        const fetch = generateFetch(httpFetch, config);
        const request = generateRequest(fetch);
        const requestStream = generateRequestStream(fetch);
        return {
            config,
            fetch,
            request,
            requestStream,
        };
    }
    function generateClientLogger(logger) {
        return (logContent) => {
            if (logger) {
                logger(logContent);
            }
        };
    }
    async function processJSONResponse(response) {
        const { errors, data, extensions } = await response.json();
        return {
            ...getKeyValueIfValid('data', data),
            ...getKeyValueIfValid('extensions', extensions),
            ...(errors || !data
                ? {
                    errors: {
                        networkStatusCode: response.status,
                        message: formatErrorMessage(errors ? GQL_API_ERROR : NO_DATA_OR_ERRORS_ERROR),
                        ...getKeyValueIfValid('graphQLErrors', errors),
                        response,
                    },
                }
                : {}),
        };
    }
    function generateFetch(httpFetch, { url, headers, retries }) {
        return async (operation, options = {}) => {
            const { variables, headers: overrideHeaders, url: overrideUrl, retries: overrideRetries, } = options;
            const body = JSON.stringify({
                query: operation,
                variables,
            });
            validateRetries({ client: CLIENT$1, retries: overrideRetries });
            const flatHeaders = Object.entries({
                ...headers,
                ...overrideHeaders,
            }).reduce((headers, [key, value]) => {
                headers[key] = Array.isArray(value) ? value.join(', ') : value.toString();
                return headers;
            }, {});
            if (!flatHeaders[SDK_VARIANT_HEADER$1] && !flatHeaders[SDK_VERSION_HEADER$1]) {
                flatHeaders[SDK_VARIANT_HEADER$1] = DEFAULT_SDK_VARIANT$1;
                flatHeaders[SDK_VERSION_HEADER$1] = DEFAULT_CLIENT_VERSION$1;
            }
            const fetchParams = [
                overrideUrl ?? url,
                {
                    method: 'POST',
                    headers: flatHeaders,
                    body,
                },
            ];
            return httpFetch(fetchParams, 1, overrideRetries ?? retries);
        };
    }
    function generateRequest(fetch) {
        return async (...props) => {
            if (DEFER_OPERATION_REGEX.test(props[0])) {
                throw new Error(formatErrorMessage('This operation will result in a streamable response - use requestStream() instead.'));
            }
            try {
                const response = await fetch(...props);
                const { status, statusText } = response;
                const contentType = response.headers.get('content-type') || '';
                if (!response.ok) {
                    return {
                        errors: {
                            networkStatusCode: status,
                            message: formatErrorMessage(statusText),
                            response,
                        },
                    };
                }
                if (!contentType.includes(CONTENT_TYPES.json)) {
                    return {
                        errors: {
                            networkStatusCode: status,
                            message: formatErrorMessage(`${UNEXPECTED_CONTENT_TYPE_ERROR} ${contentType}`),
                            response,
                        },
                    };
                }
                return processJSONResponse(response);
            }
            catch (error) {
                return {
                    errors: {
                        message: getErrorMessage(error),
                        line:1
                    },
                };
            }
        };
    }
    async function* getStreamBodyIterator(response) {
        const decoder = new TextDecoder();
        // Response body is an async iterator
        if (response.body[Symbol.asyncIterator]) {
            for await (const chunk of response.body) {
                yield decoder.decode(chunk);
            }
        }
        else {
            const reader = response.body.getReader();
            let readResult;
            try {
                while (!(readResult = await reader.read()).done) {
                    yield decoder.decode(readResult.value);
                }
            }
            finally {
                reader.cancel();
            }
        }
    }
    function readStreamChunk(streamBodyIterator, boundary) {
        return {
            async *[Symbol.asyncIterator]() {
                try {
                    let buffer = '';
                    for await (const textChunk of streamBodyIterator) {
                        buffer += textChunk;
                        if (buffer.indexOf(boundary) > -1) {
                            const lastBoundaryIndex = buffer.lastIndexOf(boundary);
                            const fullResponses = buffer.slice(0, lastBoundaryIndex);
                            const chunkBodies = fullResponses
                                .split(boundary)
                                .filter((chunk) => chunk.trim().length > 0)
                                .map((chunk) => {
                                const body = chunk
                                    .slice(chunk.indexOf(HEADER_SEPARATOR) + HEADER_SEPARATOR.length)
                                    .trim();
                                return body;
                            });
                            if (chunkBodies.length > 0) {
                                yield chunkBodies;
                            }
                            buffer = buffer.slice(lastBoundaryIndex + boundary.length);
                            if (buffer.trim() === `--`) {
                                buffer = '';
                            }
                        }
                    }
                }
                catch (error) {
                    throw new Error(`Error occured while processing stream payload - ${getErrorMessage(error)}`);
                }
            },
        };
    }
    function createJsonResponseAsyncIterator(response) {
        return {
            async *[Symbol.asyncIterator]() {
                const processedResponse = await processJSONResponse(response);
                yield {
                    ...processedResponse,
                    hasNext: false,
                };
            },
        };
    }
    function getResponseDataFromChunkBodies(chunkBodies) {
        return chunkBodies
            .map((value) => {
            try {
                return JSON.parse(value);
            }
            catch (error) {
                throw new Error(`Error in parsing multipart response - ${getErrorMessage(error)}`);
            }
        })
            .map((payload) => {
            const { data, incremental, hasNext, extensions, errors } = payload;
            // initial data chunk
            if (!incremental) {
                return {
                    data: data || {},
                    ...getKeyValueIfValid('errors', errors),
                    ...getKeyValueIfValid('extensions', extensions),
                    hasNext,
                };
            }
            // subsequent data chunks
            const incrementalArray = incremental.map(({ data, path, errors }) => {
                return {
                    data: data && path ? buildDataObjectByPath(path, data) : {},
                    ...getKeyValueIfValid('errors', errors),
                };
            });
            return {
                data: incrementalArray.length === 1
                    ? incrementalArray[0].data
                    : buildCombinedDataObject([
                        ...incrementalArray.map(({ data }) => data),
                    ]),
                ...getKeyValueIfValid('errors', combineErrors(incrementalArray)),
                hasNext,
            };
        });
    }
    function validateResponseData(responseErrors, combinedData) {
        if (responseErrors.length > 0) {
            throw new Error(GQL_API_ERROR, {
                cause: {
                    graphQLErrors: responseErrors,
                },
            });
        }
        if (Object.keys(combinedData).length === 0) {
            throw new Error(NO_DATA_OR_ERRORS_ERROR);
        }
    }
    function createMultipartResponseAsyncInterator(response, responseContentType) {
        const boundaryHeader = (responseContentType ?? '').match(BOUNDARY_HEADER_REGEX);
        const boundary = `--${boundaryHeader ? boundaryHeader[1] : '-'}`;
        if (!response.body?.getReader &&
            !response.body[Symbol.asyncIterator]) {
            throw new Error('API multipart response did not return an iterable body', {
                cause: response,
            });
        }
        const streamBodyIterator = getStreamBodyIterator(response);
        let combinedData = {};
        let responseExtensions;
        return {
            async *[Symbol.asyncIterator]() {
                try {
                    let streamHasNext = true;
                    for await (const chunkBodies of readStreamChunk(streamBodyIterator, boundary)) {
                        const responseData = getResponseDataFromChunkBodies(chunkBodies);
                        responseExtensions =
                            responseData.find((datum) => datum.extensions)?.extensions ??
                                responseExtensions;
                        const responseErrors = combineErrors(responseData);
                        combinedData = buildCombinedDataObject([
                            combinedData,
                            ...responseData.map(({ data }) => data),
                        ]);
                        streamHasNext = responseData.slice(-1)[0].hasNext;
                        validateResponseData(responseErrors, combinedData);
                        yield {
                            ...getKeyValueIfValid('data', combinedData),
                            ...getKeyValueIfValid('extensions', responseExtensions),
                            hasNext: streamHasNext,
                        };
                    }
                    if (streamHasNext) {
                        throw new Error(`Response stream terminated unexpectedly`);
                    }
                }
                catch (error) {
                    const cause = getErrorCause(error);
                    yield {
                        ...getKeyValueIfValid('data', combinedData),
                        ...getKeyValueIfValid('extensions', responseExtensions),
                        errors: {
                            message: formatErrorMessage(getErrorMessage(error)),
                            networkStatusCode: response.status,
                            ...getKeyValueIfValid('graphQLErrors', cause?.graphQLErrors),
                            response,
                        },
                        hasNext: false,
                    };
                }
            },
        };
    }
    function generateRequestStream(fetch) {
        return async (...props) => {
            if (!DEFER_OPERATION_REGEX.test(props[0])) {
                throw new Error(formatErrorMessage('This operation does not result in a streamable response - use request() instead.'));
            }
            try {
                const response = await fetch(...props);
                const { statusText } = response;
                if (!response.ok) {
                    throw new Error(statusText, { cause: response });
                }
                const responseContentType = response.headers.get('content-type') || '';
                switch (true) {
                    case responseContentType.includes(CONTENT_TYPES.json):
                        return createJsonResponseAsyncIterator(response);
                    case responseContentType.includes(CONTENT_TYPES.multipart):
                        return createMultipartResponseAsyncInterator(response, responseContentType);
                    default:
                        throw new Error(`${UNEXPECTED_CONTENT_TYPE_ERROR} ${responseContentType}`, { cause: response });
                }
            }
            catch (error) {
                return {
                    async *[Symbol.asyncIterator]() {
                        const response = getErrorCause(error);
                        yield {
                            errors: {
                                message: formatErrorMessage(getErrorMessage(error)),
                                ...getKeyValueIfValid('networkStatusCode', response?.status),
                                ...getKeyValueIfValid('response', response),
                            },
                            hasNext: false,
                        };
                    },
                };
            }
        };
    }

    function validateDomainAndGetStoreUrl({ client, storeDomain, }) {
        try {
            if (!storeDomain || typeof storeDomain !== 'string') {
                throw new Error();
            }
            const trimmedDomain = storeDomain.trim();
            const protocolUrl = trimmedDomain.match(/^https?:/)
                ? trimmedDomain
                : `https://${trimmedDomain}`;
            const url = new URL(protocolUrl);
            url.protocol = 'https';
            return url.origin;
        }
        catch (_error) {
            throw new Error(`${client}: a valid store domain ("${storeDomain}") must be provided`);
        }
    }
    function validateApiVersion({ client, currentSupportedApiVersions, apiVersion, logger, }) {
        const versionError = `${client}: the provided apiVersion ("${apiVersion}")`;
        const supportedVersion = `Currently supported API versions: ${currentSupportedApiVersions.join(', ')}`;
        if (!apiVersion || typeof apiVersion !== 'string') {
            throw new Error(`${versionError} is invalid. ${supportedVersion}`);
        }
        const trimmedApiVersion = apiVersion.trim();
        if (!currentSupportedApiVersions.includes(trimmedApiVersion)) {
            if (logger) {
                logger({
                    type: 'Unsupported_Api_Version',
                    content: {
                        apiVersion,
                        supportedApiVersions: currentSupportedApiVersions,
                    },
                });
            }
            else {
                console.warn(`${versionError} is likely deprecated or not supported. ${supportedVersion}`);
            }
        }
    }

    function getQuarterMonth(quarter) {
        const month = quarter * 3 - 2;
        return month === 10 ? month : `0${month}`;
    }
    function getPrevousVersion(year, quarter, nQuarter) {
        const versionQuarter = quarter - nQuarter;
        if (versionQuarter <= 0) {
            return `${year - 1}-${getQuarterMonth(versionQuarter + 4)}`;
        }
        return `${year}-${getQuarterMonth(versionQuarter)}`;
    }
    function getCurrentApiVersion() {
        const date = new Date();
        const month = date.getUTCMonth();
        const year = date.getUTCFullYear();
        const quarter = Math.floor(month / 3 + 1);
        return {
            year,
            quarter,
            version: `${year}-${getQuarterMonth(quarter)}`,
        };
    }
    function getCurrentSupportedApiVersions() {
        const { year, quarter, version: currentVersion } = getCurrentApiVersion();
        const nextVersion = quarter === 4
            ? `${year + 1}-01`
            : `${year}-${getQuarterMonth(quarter + 1)}`;
        return [
            getPrevousVersion(year, quarter, 3),
            getPrevousVersion(year, quarter, 2),
            getPrevousVersion(year, quarter, 1),
            currentVersion,
            nextVersion,
            'unstable',
        ];
    }

    function generateGetHeaders(config) {
        return (customHeaders) => {
            return { ...(customHeaders ?? {}), ...config.headers };
        };
    }
    function generateGetGQLClientParams({ getHeaders, getApiUrl }) {
        return (operation, options) => {
            const props = [operation];
            if (options && Object.keys(options).length > 0) {
                const { variables, apiVersion: propApiVersion, headers, retries } = options;
                props.push({
                    ...(variables ? { variables } : {}),
                    ...(headers ? { headers: getHeaders(headers) } : {}),
                    ...(propApiVersion ? { url: getApiUrl(propApiVersion) } : {}),
                    ...(retries ? { retries } : {}),
                });
            }
            return props;
        };
    }

    const DEFAULT_CONTENT_TYPE = 'application/json';
    const DEFAULT_SDK_VARIANT = 'storefront-api-client';
    // This is value is replaced with package.json version during rollup build process
    const DEFAULT_CLIENT_VERSION = '0.3.4';
    const PUBLIC_ACCESS_TOKEN_HEADER = 'X-Shopify-Storefront-Access-Token';
    const PRIVATE_ACCESS_TOKEN_HEADER = 'Shopify-Storefront-Private-Token';
    const SDK_VARIANT_HEADER = 'X-SDK-Variant';
    const SDK_VERSION_HEADER = 'X-SDK-Version';
    const SDK_VARIANT_SOURCE_HEADER = 'X-SDK-Variant-Source';
    const CLIENT = 'Storefront API Client';

    function validatePrivateAccessTokenUsage(privateAccessToken) {
        if (privateAccessToken && typeof window !== 'undefined') {
            throw new Error(`${CLIENT}: private access tokens and headers should only be used in a server-to-server implementation. Use the public API access token in nonserver environments.`);
        }
    }
    function validateRequiredAccessTokens(publicAccessToken, privateAccessToken) {
        if (!publicAccessToken && !privateAccessToken) {
            throw new Error(`${CLIENT}: a public or private access token must be provided`);
        }
        if (publicAccessToken && privateAccessToken) {
            throw new Error(`${CLIENT}: only provide either a public or private access token`);
        }
    }

    function createStorefrontApiClient({ storeDomain, apiVersion, publicAccessToken, privateAccessToken, clientName, retries = 0, customFetchApi, logger, }) {
        const currentSupportedApiVersions = getCurrentSupportedApiVersions();
        const storeUrl = validateDomainAndGetStoreUrl({
            client: CLIENT,
            storeDomain,
        });
        const baseApiVersionValidationParams = {
            client: CLIENT,
            currentSupportedApiVersions,
            logger,
        };
        validateApiVersion({ ...baseApiVersionValidationParams, apiVersion });
        validateRequiredAccessTokens(publicAccessToken, privateAccessToken);
        validatePrivateAccessTokenUsage(privateAccessToken);
        const apiUrlFormatter = generateApiUrlFormatter(storeUrl, apiVersion, baseApiVersionValidationParams);
        const config = {
            storeDomain: storeUrl,
            apiVersion,
            ...(publicAccessToken
                ? { publicAccessToken }
                : {
                    privateAccessToken: privateAccessToken,
                }),
            headers: {
                'Content-Type': DEFAULT_CONTENT_TYPE,
                Accept: DEFAULT_CONTENT_TYPE,
                [SDK_VARIANT_HEADER]: DEFAULT_SDK_VARIANT,
                [SDK_VERSION_HEADER]: DEFAULT_CLIENT_VERSION,
                ...(clientName ? { [SDK_VARIANT_SOURCE_HEADER]: clientName } : {}),
                ...(publicAccessToken
                    ? { [PUBLIC_ACCESS_TOKEN_HEADER]: publicAccessToken }
                    : { [PRIVATE_ACCESS_TOKEN_HEADER]: privateAccessToken }),
            },
            apiUrl: apiUrlFormatter(),
            clientName,
        };
        const graphqlClient = createGraphQLClient({
            headers: config.headers,
            url: config.apiUrl,
            retries,
            customFetchApi,
            logger,
        });
        const getHeaders = generateGetHeaders(config);
        const getApiUrl = generateGetApiUrl(config, apiUrlFormatter);
        const getGQLClientParams = generateGetGQLClientParams({
            getHeaders,
            getApiUrl,
        });
        const client = {
            config,
            getHeaders,
            getApiUrl,
            fetch: (...props) => {
                return graphqlClient.fetch(...getGQLClientParams(...props));
            },
            request: (...props) => {
                return graphqlClient.request(...getGQLClientParams(...props));
            },
            requestStream: (...props) => {
                return graphqlClient.requestStream(...getGQLClientParams(...props));
            },
        };
        return Object.freeze(client);
    }
    function generateApiUrlFormatter(storeUrl, defaultApiVersion, baseApiVersionValidationParams) {
        return (apiVersion) => {
            if (apiVersion) {
                validateApiVersion({
                    ...baseApiVersionValidationParams,
                    apiVersion,
                });
            }
            const urlApiVersion = (apiVersion ?? defaultApiVersion).trim();
            return `${storeUrl}/api/${urlApiVersion}/graphql.json`;
        };
    }
    function generateGetApiUrl(config, apiUrlFormatter) {
        return (propApiVersion) => {
            return propApiVersion ? apiUrlFormatter(propApiVersion) : config.apiUrl;
        };
    }

    exports.createStorefrontApiClient = createStorefrontApiClient;

}));