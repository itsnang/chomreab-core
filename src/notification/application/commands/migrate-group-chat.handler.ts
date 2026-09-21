import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParentLinkEntity } from '../../../parent-link/infrastructure/entities/parent-link.entity';
import { MigrateGroupChatCommand } from './migrate-group-chat.command';

/**
 * Telegram silently reissues a new chat id when a group is upgraded to a
 * supergroup, delivered as `migrate_to_chat_id` on the next message update
 * for that chat. Without this, every `ParentLink` row still pointing at the
 * old id would fail delivery from that moment on — and since the failure
 * isn't a 403, nothing would auto-unlink or otherwise surface it to anyone.
 */
@Injectable()
@CommandHandler(MigrateGroupChatCommand)
export class MigrateGroupChatHandler implements ICommandHandler<
  MigrateGroupChatCommand,
  void
> {
  constructor(
    @InjectRepository(ParentLinkEntity)
    private readonly parentLinkRepository: Repository<ParentLinkEntity>,
  ) {}

  async execute(command: MigrateGroupChatCommand): Promise<void> {
    // Left unscoped on purpose: a chat id rewrite is about the physical
    // Telegram chat, not a School boundary, and every ParentLink row at that
    // chat id — regardless of which School it belongs to — needs the same
    // new id or its messages start failing silently.
    // eslint-disable-next-line local/require-scoped-repository -- deliberately cross-tenant, see comment above and docs/adr/0010
    await this.parentLinkRepository.update(
      { telegramChatId: command.oldChatId },
      { telegramChatId: command.newChatId },
    );
  }
}
