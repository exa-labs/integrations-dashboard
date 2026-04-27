"use client";

import {
  ALL_ENDPOINTS,
  ALL_SEARCH_TYPES,
  ALL_CONTENT_OPTIONS,
  type ExaEndpoint,
  type ExaSearchType,
  type ExaContentOption,
} from "@/types/integrations";

interface Props {
  endpoints: ExaEndpoint[];
  searchTypes: ExaSearchType[];
  contentOptions: ExaContentOption[];
  onEndpointsChange: (v: ExaEndpoint[]) => void;
  onSearchTypesChange: (v: ExaSearchType[]) => void;
  onContentOptionsChange: (v: ExaContentOption[]) => void;
}

const ENDPOINT_LABELS: Record<ExaEndpoint, string> = {
  search: "Search",
  search_streaming: "Search (streaming)",
  get_contents: "Get Contents",
  find_similar: "Find Similar",
  answer: "Answer",
  answer_streaming: "Answer (streaming)",
  research: "Research (create/get/poll)",
};

const SEARCH_TYPE_LABELS: Record<ExaSearchType, string> = {
  auto: "auto",
  fast: "fast",
  neural: "neural",
  instant: "instant",
  "deep-lite": "deep-lite",
  deep: "deep",
  "deep-reasoning": "deep-reasoning",
};

const CONTENT_OPTION_LABELS: Record<ExaContentOption, string> = {
  text: "text",
  highlights: "highlights",
  summary: "summary",
  livecrawl: "livecrawl",
  subpages: "subpages",
  extras: "extras (links/images)",
};

function CheckboxGroup<T extends string>({
  label,
  allValues,
  selected,
  labels,
  onChange,
}: {
  label: string;
  allValues: readonly T[];
  selected: T[];
  labels: Record<T, string>;
  onChange: (v: T[]) => void;
}) {
  const toggle = (value: T) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {allValues.map((value) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-1.5 rounded border border-gray-200 px-2 py-1 text-xs hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={selected.includes(value)}
              onChange={() => toggle(value)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>{labels[value]}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function CapabilitiesSection({
  endpoints,
  searchTypes,
  contentOptions,
  onEndpointsChange,
  onSearchTypesChange,
  onContentOptionsChange,
}: Props) {
  return (
    <div className="space-y-3">
      <CheckboxGroup
        label="Supported Endpoints"
        allValues={ALL_ENDPOINTS}
        selected={endpoints}
        labels={ENDPOINT_LABELS}
        onChange={onEndpointsChange}
      />
      <CheckboxGroup
        label="Supported Search Types"
        allValues={ALL_SEARCH_TYPES}
        selected={searchTypes}
        labels={SEARCH_TYPE_LABELS}
        onChange={onSearchTypesChange}
      />
      <CheckboxGroup
        label="Supported Content Options"
        allValues={ALL_CONTENT_OPTIONS}
        selected={contentOptions}
        labels={CONTENT_OPTION_LABELS}
        onChange={onContentOptionsChange}
      />
    </div>
  );
}
