import type { PublicChannel } from '@rol/shared';

const timeFormat = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' });

export const formatTime = (ts: number): string => timeFormat.format(new Date(ts));

export function formatDay(ts: number): string {
  const date = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return 'Hoy';
  if (sameDay(date, yesterday)) return 'Ayer';
  return dayFormat.format(date);
}

export function channelIcon(channel: PublicChannel): string {
  if (channel.type === 'general') return '🏛️';
  if (channel.type === 'group') return '👥';
  return '💬';
}
