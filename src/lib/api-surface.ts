import {
  ALL_SEARCH_TYPES,
  ALL_CONTENT_OPTIONS,
  type ExaEndpoint,
  type ExaSearchType,
  type ExaContentOption,
  type IntegrationType,
  type BaselineType,
} from "@/types/integrations";

/**
 * Canonical API surface extracted from exa-py and exa-js SDKs.
 * This is the source of truth for what parameters/features each
 * integration should ideally support.
 */

export interface ParamSpec {
  name: string;
  category: "required" | "core" | "filtering" | "content" | "freshness" | "advanced" | "safety" | "extras";
}

export interface EndpointSpec {
  name: ExaEndpoint;
  path: string;
  priority: "P0" | "P1" | "P2";
  params: ParamSpec[];
}

export const EXA_API_SURFACE: EndpointSpec[] = [
  {
    name: "search",
    path: "/search",
    priority: "P0",
    params: [
      { name: "query", category: "required" },
      { name: "num_results", category: "core" },
      { name: "type", category: "core" },
      { name: "include_domains", category: "filtering" },
      { name: "exclude_domains", category: "filtering" },
      { name: "start_crawl_date", category: "filtering" },
      { name: "end_crawl_date", category: "filtering" },
      { name: "start_published_date", category: "filtering" },
      { name: "end_published_date", category: "filtering" },
      { name: "include_text", category: "filtering" },
      { name: "exclude_text", category: "filtering" },
      { name: "category", category: "filtering" },
      { name: "user_location", category: "filtering" },
      { name: "moderation", category: "safety" },
      { name: "system_prompt", category: "advanced" },
      { name: "output_schema", category: "advanced" },
      { name: "additional_queries", category: "advanced" },
      { name: "contents", category: "content" },
    ],
  },
  {
    name: "search_streaming",
    path: "/search",
    priority: "P1",
    params: [
      { name: "query", category: "required" },
      { name: "num_results", category: "core" },
      { name: "type", category: "core" },
      { name: "contents", category: "content" },
    ],
  },
  {
    name: "get_contents",
    path: "/contents",
    priority: "P0",
    params: [
      { name: "urls", category: "required" },
      { name: "text", category: "content" },
      { name: "highlights", category: "content" },
      { name: "summary", category: "content" },
      { name: "livecrawl", category: "freshness" },
      { name: "livecrawl_timeout", category: "freshness" },
      { name: "max_age_hours", category: "freshness" },
      { name: "subpages", category: "extras" },
      { name: "subpage_target", category: "extras" },
      { name: "extras", category: "extras" },
    ],
  },
  {
    name: "find_similar",
    path: "/findSimilar",
    priority: "P1",
    params: [
      { name: "url", category: "required" },
      { name: "num_results", category: "core" },
      { name: "include_domains", category: "filtering" },
      { name: "exclude_domains", category: "filtering" },
      { name: "exclude_source_domain", category: "filtering" },
      { name: "category", category: "filtering" },
      { name: "contents", category: "content" },
    ],
  },
  {
    name: "answer",
    path: "/answer",
    priority: "P0",
    params: [
      { name: "query", category: "required" },
      { name: "text", category: "core" },
      { name: "system_prompt", category: "advanced" },
      { name: "model", category: "advanced" },
      { name: "output_schema", category: "advanced" },
      { name: "user_location", category: "filtering" },
    ],
  },
  {
    name: "answer_streaming",
    path: "/answer",
    priority: "P1",
    params: [
      { name: "query", category: "required" },
      { name: "text", category: "core" },
      { name: "system_prompt", category: "advanced" },
      { name: "model", category: "advanced" },
    ],
  },
  {
    name: "research",
    path: "/research/v1",
    priority: "P1",
    params: [
      { name: "instructions", category: "required" },
      { name: "model", category: "advanced" },
      { name: "output_schema", category: "advanced" },
    ],
  },
];

const APPLICABLE_ENDPOINTS_BY_TYPE: Record<IntegrationType, ExaEndpoint[]> = {
  python: [
    "search", "search_streaming", "get_contents", "find_similar",
    "answer", "answer_streaming", "research",
  ],
  typescript: [
    "search", "search_streaming", "get_contents", "find_similar",
    "answer", "answer_streaming", "research",
  ],
  external: [
    "search", "get_contents", "find_similar", "answer",
  ],
  sheets: [
    "search", "get_contents",
  ],
  other: [
    "search", "get_contents", "answer",
  ],
};

const BASELINE_ENDPOINTS: Record<BaselineType, ExaEndpoint[]> = {
  first_party: [],
  python_sdk: [
    "search", "search_streaming", "get_contents", "find_similar",
    "answer", "answer_streaming", "research",
  ],
  typescript_sdk: [
    "search", "search_streaming", "get_contents", "find_similar",
    "answer", "answer_streaming", "research",
  ],
  mcp: [
    "search", "get_contents", "find_similar", "research",
  ],
  api_direct: [
    "search", "get_contents", "find_similar", "answer",
  ],
  docs: [
    "search", "get_contents", "find_similar", "answer",
  ],
  websets_api: [],
  na: [],
};

const MCP_SEARCH_TYPES: ExaSearchType[] = ["auto", "fast", "instant"];
const MCP_CONTENT_OPTIONS: ExaContentOption[] = ["text", "highlights", "summary", "subpages"];

export interface BaselineSurface {
  endpoints: ExaEndpoint[];
  searchTypes: ExaSearchType[];
  contentOptions: ExaContentOption[];
}

export function getBaselineSurface(baselineType: BaselineType): BaselineSurface {
  if (baselineType === "mcp") {
    return {
      endpoints: BASELINE_ENDPOINTS.mcp,
      searchTypes: MCP_SEARCH_TYPES,
      contentOptions: MCP_CONTENT_OPTIONS,
    };
  }
  return {
    endpoints: BASELINE_ENDPOINTS[baselineType],
    searchTypes: ALL_SEARCH_TYPES,
    contentOptions: ALL_CONTENT_OPTIONS,
  };
}

export function getApplicableEndpoints(type: IntegrationType): ExaEndpoint[] {
  return APPLICABLE_ENDPOINTS_BY_TYPE[type] ?? APPLICABLE_ENDPOINTS_BY_TYPE.other;
}

export function getApplicableEndpointsByBaseline(baselineType: BaselineType): ExaEndpoint[] {
  return BASELINE_ENDPOINTS[baselineType];
}

export function computeBenchmark(
  type: IntegrationType,
  capabilities: {
    supported_endpoints: ExaEndpoint[];
    supported_search_types: ExaSearchType[];
    supported_content_options: ExaContentOption[];
  },
  sdkVersionMatch: boolean,
  baselineType?: BaselineType,
): {
  score: number;
  endpoint_coverage: { name: ExaEndpoint; supported: boolean }[];
  missing_endpoints: ExaEndpoint[];
  missing_search_types: ExaSearchType[];
  missing_content_options: ExaContentOption[];
} {
  if (baselineType === "first_party" || baselineType === "na" || baselineType === "websets_api") {
    return {
      score: 100,
      endpoint_coverage: [],
      missing_endpoints: [],
      missing_search_types: [],
      missing_content_options: [],
    };
  }

  const surface = baselineType ? getBaselineSurface(baselineType) : null;
  const applicableEndpoints = surface ? surface.endpoints : getApplicableEndpoints(type);
  const applicableSearchTypes = surface ? surface.searchTypes : ALL_SEARCH_TYPES;
  const applicableContentOptions = surface ? surface.contentOptions : ALL_CONTENT_OPTIONS;

  const endpointCoverage = applicableEndpoints.map((ep) => ({
    name: ep,
    supported: capabilities.supported_endpoints.includes(ep),
  }));
  const supportedCount = endpointCoverage.filter((e) => e.supported).length;
  const endpointScore = applicableEndpoints.length > 0
    ? (supportedCount / applicableEndpoints.length) * 40
    : 40;

  const supportedSearchTypes = capabilities.supported_search_types.filter(
    (st) => applicableSearchTypes.includes(st),
  );
  const searchTypeScore = applicableSearchTypes.length > 0
    ? (supportedSearchTypes.length / applicableSearchTypes.length) * 15
    : 15;

  const supportedContentOptions = capabilities.supported_content_options.filter(
    (co) => applicableContentOptions.includes(co),
  );
  const contentScore = applicableContentOptions.length > 0
    ? (supportedContentOptions.length / applicableContentOptions.length) * 35
    : 35;

  const versionScore = sdkVersionMatch ? 10 : 0;

  const score = Math.round(endpointScore + searchTypeScore + contentScore + versionScore);

  const missingEndpoints = applicableEndpoints.filter(
    (ep) => !capabilities.supported_endpoints.includes(ep),
  );
  const missingSearchTypes = applicableSearchTypes.filter(
    (st) => !capabilities.supported_search_types.includes(st),
  );
  const missingContentOptions = applicableContentOptions.filter(
    (co) => !capabilities.supported_content_options.includes(co),
  );

  return {
    score,
    endpoint_coverage: endpointCoverage,
    missing_endpoints: missingEndpoints,
    missing_search_types: missingSearchTypes,
    missing_content_options: missingContentOptions,
  };
}

export function scoreToHealth(score: number): "healthy" | "outdated" | "needs_audit" {
  if (score >= 90) return "healthy";
  if (score >= 60) return "needs_audit";
  return "outdated";
}
