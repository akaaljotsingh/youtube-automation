import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { logger } from '../../common/logger';

@Injectable()
export class NotificationService {
  private readonly token?: string;
  private readonly chatId?: string;

  constructor(cfg: ConfigService) {
    this.token = cfg.get<string>('TELEGRAM_BOT_TOKEN');
    this.chatId = cfg.get<string>('TELEGRAM_CHAT_ID');
  }

  async alert(message: string): Promise<void> {
    logger.info({ message }, 'alert');
    if (!this.token || !this.chatId) return;
    try {
      await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.chatId, text: message, disable_web_page_preview: true }),
      });
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'telegram alert failed');
    }
  }
}