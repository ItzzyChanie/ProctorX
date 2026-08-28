import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  constructor(private config: ConfigService) {}
  private transporter() {
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
    return {
      from,
      transport: nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      }),
    };
  }

  async sendInstitutionVerificationCode(
    to: string,
    code: string,
    institutionName: string
  ) {
    const { from, transport } = this.transporter();
    try {
      await transport.sendMail({
        from,
        to,
        subject: 'Verify your ProctorX institutional application',
        text: `Your ProctorX verification code for ${institutionName} is ${code}. It expires in 10 minutes. Do not share this code with anyone.`,
        html: `<div style="font-family:Arial,sans-serif;color:#111827;max-width:520px"><h2 style="color:#4f46e5">Verify your institutional email</h2><p>Use this code to verify the ProctorX application for <strong>${institutionName}</strong>.</p><div style="font-size:30px;font-weight:700;letter-spacing:8px;padding:18px 0">${code}</div><p style="color:#64748b">The code expires in 10 minutes. Do not share it with anyone.</p></div>`,
      });
    } catch (error) {
      console.error('Institution verification email delivery failed', error);
      throw new ServiceUnavailableException(
        'We could not send the verification email. Check the address and try again.'
      );
    }
  }

  async sendActivationCode(to: string, code: string) {
    const { from, transport } = this.transporter();

    try {
      await transport.sendMail({
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
