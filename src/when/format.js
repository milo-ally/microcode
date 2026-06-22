export function formatDate(date, style) {
  if (!date) return 'Invalid date';

  if (style === 'iso') {
    return date.toISOString();
  }

  if (style === 'readable') {
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  if (style === 'full') {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    const rest = date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return `${dayName}, ${rest}`;
  }

  return date.toString();
}
