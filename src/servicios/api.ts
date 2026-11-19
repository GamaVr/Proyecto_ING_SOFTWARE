/** Error HTTP que conserva el estado para diferenciar sesión vencida y fallos de conexión. */
export class ErrorApi extends Error {
  /** Construye un error legible con su código HTTP original. */
  constructor(
    public estado: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

/** Envía JSON con la cookie de sesión y convierte los errores del servidor en mensajes públicos. */
export async function api<T>(ruta: string, metodo = 'GET', cuerpo?: unknown): Promise<T> {
  let respuestaHttp: Response;
  try {
    respuestaHttp = await fetch(`/api${ruta}`, {
      method: metodo,
      credentials: 'same-origin',
      ...(cuerpo !== undefined
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }
        : {}),
    });
  } catch {
    throw new ErrorApi(0, 'No pudimos conectar con el servidor. Comprueba tu conexión.');
  }
  if (respuestaHttp.status === 204) return undefined as T;
  const resultado = await respuestaHttp
    .json()
    .catch(() => ({ error: 'El servidor no devolvió una respuesta válida.' }));
  if (!respuestaHttp.ok)
    throw new ErrorApi(respuestaHttp.status, resultado.error || 'No se pudo completar la acción.');
  return resultado as T;
}
