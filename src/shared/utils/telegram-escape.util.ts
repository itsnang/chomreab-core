/** Escapes text for safe interpolation into a Telegram HTML-mode message.
 *  Telegram rejects the whole `sendMessage` call (400) if the text contains
 *  unescaped `<`, `>`, or `&` that don't form valid HTML markup, so any
 *  untrusted or free-form text (student names, teacher-entered notes, etc.)
 *  must be escaped before being interpolated into a message string. */
export function escapeTelegramHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
