import { Injectable } from '@nestjs/common';
import type { ITelegramBotInfoService } from '../../application/interfaces/telegram-bot-info.service';

interface TelegramGetMeResponse {
  ok: boolean;
  result?: { username?: string };
}

@Injectable()
export class TelegramBotInfoService implements ITelegramBotInfoService {
  async getUsername(token: string): Promise<string | null> {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/getMe`,
      );
      if (!response.ok) return null;
      const body = (await response.json()) as TelegramGetMeResponse;
      return body.ok && body.result?.username ? body.result.username : null;
    } catch {
      // Network failure or malformed response — same "keep what's cached"
      // treatment as a rejected token; getMe is not on any critical path.
      return null;
    }
  }
}
