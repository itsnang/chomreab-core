export const TELEGRAM_SERVICE = Symbol('TELEGRAM_SERVICE');

export interface ITelegramService {
  sendMessage(chatId: string, text: string): Promise<void>;
}
