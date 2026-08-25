import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  constructor(private config: ConfigService) {}
  async sendActivationCode(to: string, code: string) {
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const from = this.config.get<string>('SMTP_FROM');
    if (!host || !user || !pass || !from) {
      throw new ServiceUnavailableException(
        'Email delivery is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM.'
      );
    }
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });

    try {
      await transporter.sendMail({
        from,
        to,
        subject: 'Your ProctorX activation code',
        text: `Your ProctorX activation code is ${code}. It expires in 10 minutes. Do not share this code with anyone.`,
        html: `<p>Your ProctorX activation code is:</p><h1 style="letter-spacing: 6px">${code}</h1><p>This code expires in 10 minutes. Do not share it with anyone.</p>`,
      });
    } 
    catch (error) {
      console.error('OTP email delivery failed', error);
      throw new ServiceUnavailableException(
        'We could not send the activation email. Check the SMTP configuration and try again.'
      );
    }
  }
}
