import {
  ALL_SEARCH_TYPES,
  ALL_CONTENT_OPTIONS,
  type ExaEndpoint,
  type ExaSearchType,
  type ExaContentOption,
  type IntegrationType,
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

/**
 * Defines which endpoints are applicable per integration type.
 * Integrations are only benchmarked against endpoints that make
 * sense for their type — e.g. Google Sheets doesn't need streaming.
 */
const APPLICABLE_ENDPOINTS: Record<IntegrationType, ExaEndpoint[]> = {
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

const ALL_SEARCH_TYPES_LIST = ALL_SEARCH_TYPES;
const ALL_CONTENT_OPTIONS_LIST = ALL_CONTENT_OPTIONS;

export function getApplicableEndpoints(type: IntegrationType): ExaEndpoint[] {
  return APPLICABLE_ENDPOINTS[type] ?? APPLICABLE_ENDPOINTS.other;
}

/**
 * Compute a benchmark score for an integration based on its declared
 * capabilities vs. the canonical API surface.
 *
 * Weights:
 *   endpoint coverage  = 40%
 *   search type coverage = 15%
 *   content option coverage = 35%
 *   SDK version match  = 10%
 */
export function computeBenchmark(
  type: IntegrationType,
  capabilities: {
    supported_endpoints: ExaEndpoint[];
    supported_search_types: ExaSearchType[];
    supported_content_options: ExaContentOption[];
  },
  sdkVersionMatch: boolean,
): {
  score: number;
  endpoint_coverage: { name: ExaEndpoint; supported: boolean }[];
  missing_endpoints: ExaEndpoint[];
  missing_search_types: ExaSearchType[];
  missing_content_options: ExaContentOption[];
} {
  const applicableEndpoints = getApplicableEndpoints(type);

  const endpointCoverage = applicableEndpoints.map((ep) => ({
    name: ep,
    supported: capabilities.supported_endpoints.includes(ep),
  }));
  const supportedCount = endpointCoverage.filter((e) => e.supported).length;
  const endpointScore = applicableEndpoints.length > 0
    ? (supportedCount / applicableEndpoints.length) * 40
    : 40;

  const supportedSearchTypes = capabilities.supported_search_types.filter(
    (st) => ALL_SEARCH_TYPES_LIST.includes(st),
  );
  const searchTypeScore = ALL_SEARCH_TYPES_LIST.length > 0
    ? (supportedSearchTypes.length / ALL_SEARCH_TYPES_LIST.length) * 15
    : 15;

  const supportedContentOptions = capabilities.supported_content_options.filter(
    (co) => ALL_CONTENT_OPTIONS_LIST.includes(co),
  );
  const contentScore = ALL_CONTENT_OPTIONS_LIST.length > 0
    ? (supportedContentOptions.length / ALL_CONTENT_OPTIONS_LIST.length) * 35
    : 35;

  const versionScore = sdkVersionMatch ? 10 : 0;

  const score = Math.round(endpointScore + searchTypeScore + contentScore + versionScore);

  const missingEndpoints = applicableEndpoints.filter(
    (ep) => !capabilities.supported_endpoints.includes(ep),
  );
  const missingSearchTypes = ALL_SEARCH_TYPES_LIST.filter(
    (st) => !capabilities.supported_search_types.includes(st),
  );
  const missingContentOptions = ALL_CONTENT_OPTIONS_LIST.filter(
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
