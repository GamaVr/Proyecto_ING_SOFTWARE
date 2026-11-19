/** Error HTTP que conserva el estado para diferenciar sesión vencida y fallos de conexión. */
export class ApiError extends Error {
  /** Construye un error legible con su código HTTP original. */
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Envía JSON con la cookie de sesión y convierte los errores del servidor en mensajes públicos. */
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      ...(body !== undefined
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : {}),
    });
  } catch {
    throw new ApiError(0, 'No pudimos conectar con el servidor. Comprueba tu conexión.');
  }
  if (response.status === 204) return undefined as T;
  const result = await response
    .json()
    .catch(() => ({ error: 'El servidor no devolvió una respuesta válida.' }));
  if (!response.ok)
    throw new ApiError(response.status, result.error || 'No se pudo completar la acción.');
  return result as T;
}
