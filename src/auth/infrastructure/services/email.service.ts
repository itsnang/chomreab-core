import { Injectable } from '@nestjs/common';

@Injectable()
export class EmailService {
  async sendPasswordResetEmail(_email: string, _token: string): Promise<void> {
    // TODO: POST to email API with { email, token }
  }
}
