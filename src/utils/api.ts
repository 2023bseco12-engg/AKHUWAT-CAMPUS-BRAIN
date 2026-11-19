export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const text = await res.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    const errMsg =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: string }).error)
        : `Request failed with status ${res.status}`;
    throw new Error(errMsg);
  }

  return data as T;
}

export async function uploadFile(file: File): Promise<{ url: string; fileName: string; mimeType: string; size: number }> {
  const form = new FormData();
  form.append('file', file);
  return apiFetch('/api/upload', {
    method: 'POST',
    body: form,
  });
}
