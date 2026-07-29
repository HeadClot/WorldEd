/** Default first port tried when starting the local MCP HTTP host. */
export const MCP_DEFAULT_PORT = 18765;

/** Maximum ports tried after the default when a bind fails. */
export const MCP_PORT_SEARCH_RANGE = 32;

/** HTTP path for the MCP Streamable HTTP endpoint. */
export const MCP_HTTP_PATH = '/mcp';

/** Host interface bound by the MCP server (loopback only). */
export const MCP_BIND_HOST = '127.0.0.1';

/** Product name reported by MCP initialize. */
export const MCP_SERVER_NAME = 'aiworlded-solid-mcp';

/** Protocol version string returned during MCP initialize. */
export const MCP_PROTOCOL_VERSION = '2024-11-05';
