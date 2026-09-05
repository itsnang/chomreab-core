import { Injectable } from '@nestjs/common';
import { SchoolSettingsService } from '../../../school-settings/application/services/school-settings.service';
import type { ITelegramService } from '../../application/interfaces/telegram.service';

@Injectable()
export class TelegramService implements ITelegramService {
  constructor(private readonly schoolSettings: SchoolSettingsService) {}

  async sendMessage(chatId: string, text: string): Promise<void> {
    const botToken = await this.schoolSettings.getEffectiveBotToken();
    if (!botToken) {
      throw new Error('No Telegram bot token configured');
    }
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      },
    );
    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.status}`);
    }
  }
}
