/** Define los errores HTTP que puede comunicar la API. */
/** Error de dominio con un estado HTTP seguro para mostrar al usuario. */
export class ErrorHttp extends Error {
  /** Asocia el mensaje público con su código de respuesta HTTP. */
  constructor(
    public estado: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}
