import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ITelegramService } from '../../application/interfaces/telegram.service';

@Injectable()
export class TelegramService implements ITelegramService {
  private readonly botToken: string;

  constructor(private readonly configService: ConfigService) {
    this.botToken = this.configService.getOrThrow<string>('telegram.botToken');
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    const response = await fetch(
      `https://api.telegram.org/bot${this.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.status}`);
    }
  }
}
