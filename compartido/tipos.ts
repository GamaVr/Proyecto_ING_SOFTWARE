/** Define los datos que comparten el cliente y el servidor. */
/** Contratos compartidos: el cliente nunca recibe las respuestas de rondas futuras. */
export interface User {
  id: string;
  name: string;
  email: string;
}
export interface Stats {
  played: number;
  bestStreak: number;
  bestScore: number;
}
export interface Settings {
  volume: number;
  music: number;
  effects: number;
  countdown: boolean;
  autoplay: boolean;
  contrast: boolean;
  largeInterface: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  volume: 78,
  music: 92,
  effects: 56,
  countdown: true,
  autoplay: true,
  contrast: false,
  largeInterface: false,
};
export interface GameConfig {
  genre: string;
  rounds: number;
  seconds: number;
  answerMode: 'both' | 'title';
}
export const DEFAULT_CONFIG: GameConfig = {
  genre: 'Todas',
  rounds: 10,
  seconds: 20,
  answerMode: 'both',
};
export interface RoundResult {
  round: number;
  title: string;
  artist: string;
  answer: string;
  correct: boolean;
  points: number;
  elapsed: number;
  userId: string;
  sourceUrl?: string | null;
  licenseUrl?: string | null;
}
export interface Player {
  id: string;
  name: string;
  team: number;
  score: number;
  ready: boolean;
}
export interface GameSnapshot {
  id: string;
  mode: 'solo' | 'duel' | 'teams';
  status: 'playing' | 'finished' | 'abandoned';
  config: GameConfig;
  round: number;
  total: number;
  startedAt: number;
  serverNow: number;
  players: Player[];
  results: RoundResult[];
  answered: boolean;
  audioStart: number;
  audioDuration: number;
  audioSource: 'builtin' | 'local' | 'jamendo' | 'audius' | 'deezer';
}
export interface RoomSnapshot {
  code: string;
  name: string;
  mode: 'duel' | 'teams';
  hostId: string;
  players: Player[];
  config: GameConfig;
  gameId: string | null;
  messages: { id: number; name: string; text: string }[];
}

/** Perfiles públicos: las búsquedas y solicitudes nunca exponen correos ajenos. */
export interface PublicUser {
  id: string;
  name: string;
}
export interface RoomInvitation {
  id: string;
  roomCode: string;
  roomName: string;
  mode: 'duel' | 'teams';
  sender: PublicUser;
  recipient: PublicUser;
  expiresAt: number;
}
export interface SocialSnapshot {
  friends: PublicUser[];
  incomingRequests: PublicUser[];
  outgoingRequests: PublicUser[];
  invitations: RoomInvitation[];
  sentInvitations: RoomInvitation[];
}
export interface UserSearchResult extends PublicUser {
  relationship: 'none' | 'friend' | 'incoming' | 'outgoing';
}
