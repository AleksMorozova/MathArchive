export function formatDate(value: string) {
  return new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(value));
}

export function formatFileSize(value: number) {
  if (value === 0) {
    return '0 КБ';
  }

  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024))} КБ`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
}

export function fileExtension(fileName: string) {
  const extension = fileName.split('.').pop();
  return extension ? extension.toUpperCase() : '';
}
