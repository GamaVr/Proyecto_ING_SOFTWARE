/** Define los datos que comparten el cliente y el servidor. */
/** Contratos compartidos: el cliente nunca recibe las respuestas de rondas futuras. */
export interface Usuario {
  id: string;
  nombre: string;
  correo: string;
}
export interface Estadisticas {
  jugadas: number;
  mejorRacha: number;
  mejorPuntuacion: number;
}
export interface Preferencias {
  volumen: number;
  musica: number;
  efectos: number;
  cuentaRegresiva: boolean;
  reproduccionAutomatica: boolean;
  altoContraste: boolean;
  interfazGrande: boolean;
}
export const PREFERENCIAS_PREDETERMINADAS: Preferencias = {
  volumen: 78,
  musica: 92,
  efectos: 56,
  cuentaRegresiva: true,
  reproduccionAutomatica: true,
  altoContraste: false,
  interfazGrande: false,
};
export interface ConfiguracionPartida {
  genero: string;
  rondas: number;
  segundos: number;
  modoRespuesta: 'ambos' | 'titulo';
}
export const CONFIGURACION_PREDETERMINADA: ConfiguracionPartida = {
  genero: 'Todas',
  rondas: 10,
  segundos: 20,
  modoRespuesta: 'ambos',
};
export interface ResultadoRonda {
  ronda: number;
  titulo: string;
  artista: string;
  respuesta: string;
  correcta: boolean;
  puntos: number;
  transcurrido: number;
  usuarioId: string;
  urlFuente?: string | null;
  urlLicencia?: string | null;
}
export interface Jugador {
  id: string;
  nombre: string;
  equipo: number;
  puntuacion: number;
  listo: boolean;
}
export interface EstadoPartida {
  id: string;
  modo: 'individual' | 'duelo' | 'equipos';
  estado: 'en_curso' | 'terminada' | 'abandonada';
  configuracion: ConfiguracionPartida;
  ronda: number;
  total: number;
  iniciadaEn: number;
  ahoraServidor: number;
  jugadores: Jugador[];
  resultados: ResultadoRonda[];
  respondida: boolean;
  inicioAudio: number;
  duracionAudio: number;
  fuenteAudio: 'integrado' | 'local' | 'jamendo' | 'audius' | 'deezer';
}
export interface EstadoSala {
  codigo: string;
  nombre: string;
  modo: 'duelo' | 'equipos';
  anfitrionId: string;
  jugadores: Jugador[];
  configuracion: ConfiguracionPartida;
  partidaId: string | null;
  mensajes: { id: number; nombre: string; texto: string }[];
}

/** Perfiles públicos: las búsquedas y solicitudes nunca exponen correos ajenos. */
export interface UsuarioPublico {
  id: string;
  nombre: string;
}
export interface InvitacionSala {
  id: string;
  codigoSala: string;
  nombreSala: string;
  modo: 'duelo' | 'equipos';
  remitente: UsuarioPublico;
  destinatario: UsuarioPublico;
  expiraEn: number;
}
export interface EstadoSocial {
  amigos: UsuarioPublico[];
  solicitudesRecibidas: UsuarioPublico[];
  solicitudesEnviadas: UsuarioPublico[];
  invitaciones: InvitacionSala[];
  invitacionesEnviadas: InvitacionSala[];
}
export interface ResultadoBusquedaUsuario extends UsuarioPublico {
  relacion: 'ninguna' | 'amigo' | 'recibida' | 'enviada';
}
