export async function readProviderJson(
  response: Response,
  provider: string
): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();

  if (!response.ok) {
    throw new Error(`${provider} API request failed (${response.status})`);
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error(`${provider} API returned an invalid response`);
  }

  return body as Record<string, unknown>;
}

export function getObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Provider response is missing ${field}`);
  }
  return value as Record<string, unknown>;
}

export function getArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Provider response is missing ${field}`);
  }
  return value;
}

export function getString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Provider response is missing ${field}`);
  }
  return value;
}
