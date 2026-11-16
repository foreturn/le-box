import type {
  NodeProfile,
  NodeProtocol,
  ProtocolDescriptor,
  ValidationIssue,
} from "../types/singbox";
import {
  buildNaiveOutbound,
  createDefaultNaiveProfile,
  exportNaiveUri,
  importNaiveProfilesFromInput,
  sanitizeNodeProfileForSave,
  validateNaiveProfile,
} from "./naiveSchema";

export const NODE_PROTOCOL_OPTIONS: ProtocolDescriptor[] = [
  {
    value: "naive",
    title: "NaiveProxy",
    badge: "NaiveProxy",
    summary: "基于 Chromium/Cronet 网络栈的 HTTP/2 与 QUIC 抗流量分析协议 (sing-box >= 1.13.0)",
    supported: true,
  },
];

export function getProtocolMeta(protocol: NodeProtocol): ProtocolDescriptor {
  return (
    NODE_PROTOCOL_OPTIONS.find((item) => item.value === protocol) ??
    NODE_PROTOCOL_OPTIONS[0]!
  );
}

export function normalizeNodeProfile(raw: Partial<NodeProfile>): NodeProfile {
  const base = createDefaultNaiveProfile(raw);
  return {
    ...base,
    protocol: raw.protocol ?? "naive",
  };
}

export function createDefaultNodeProfile(
  protocol: NodeProtocol,
  partial: Partial<NodeProfile> = {},
): NodeProfile {
  switch (protocol) {
    case "naive":
      return createDefaultNaiveProfile({ ...partial, protocol: "naive" });
  }
}

export function validateNodeProfile(profile: NodeProfile): ValidationIssue[] {
  const protocol = profile.protocol ?? "naive";
  switch (protocol) {
    case "naive":
      return validateNaiveProfile(profile);
  }
}

export function buildNodeOutbound(
  profile: NodeProfile,
  dnsLocalTag = "dns-local",
): Record<string, unknown> {
  const protocol = profile.protocol ?? "naive";
  switch (protocol) {
    case "naive":
      return buildNaiveOutbound(profile, dnsLocalTag);
  }
}

export function exportNodeUri(profile: NodeProfile): string {
  const protocol = profile.protocol ?? "naive";
  switch (protocol) {
    case "naive":
      return exportNaiveUri(profile);
  }
}

export function importNodeProfilesFromInput(input: string): NodeProfile[] {
  return importNaiveProfilesFromInput(input);
}

export function generateUniqueNodeTag(
  existingProfiles: NodeProfile[],
  prefix = "naive-out",
): string {
  const used = new Set(existingProfiles.map((item) => item.tag.trim()).filter(Boolean));
  if (!used.has(prefix)) return prefix;
  let seq = existingProfiles.length + 1;
  let candidate = `${prefix}-${seq}`;
  while (used.has(candidate)) {
    seq += 1;
    candidate = `${prefix}-${seq}`;
  }
  return candidate;
}

export function generateUniqueNodeName(
  existingProfiles: NodeProfile[],
  prefix = "NaiveProxy 节点",
): string {
  const used = new Set(existingProfiles.map((item) => item.name.trim()).filter(Boolean));
  if (!used.has(prefix) && existingProfiles.length === 0) return prefix;
  let seq = existingProfiles.length + 1;
  let candidate = `${prefix} ${seq}`;
  while (used.has(candidate)) {
    seq += 1;
    candidate = `${prefix} ${seq}`;
  }
  return candidate;
}

export function prepareNodeProfileForSave(
  profile: NodeProfile,
  existingProfiles: NodeProfile[] = [],
): NodeProfile {
  return sanitizeNodeProfileForSave(profile, existingProfiles);
}
