import { VlyClient } from '../client';
import type { 
  EmailRequest, 
  EmailResponse,
  RequestOptions,
  ApiResponse
} from '../types';

export class VlyEmail extends VlyClient {
  async send(
    email: EmailRequest, 
    options?: RequestOptions
  ): Promise<ApiResponse<EmailResponse>> {
    this.log('Sending email', { 
      to: email.to, 
      subject: email.subject 
    });

    const payload = {
      to: Array.isArray(email.to) ? email.to : [email.to],
      from: email.from || 'noreply@project.vly.sh',
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: email.attachments,
      replyTo: email.replyTo,
      cc: email.cc ? (Array.isArray(email.cc) ? email.cc : [email.cc]) : undefined,
      bcc: email.bcc ? (Array.isArray(email.bcc) ? email.bcc : [email.bcc]) : undefined
    };

    const response = await this.request<EmailResponse>(
      '/v1/email/send',
      'POST',
      payload,
      options
    );

    if (response.success) {
      this.log('Email sent successfully', { 
        id: response.data?.id,
        status: response.data?.status 
      });
    }

    return response;
  }

  async sendBatch(
    emails: EmailRequest[],
    options?: RequestOptions
  ): Promise<ApiResponse<EmailResponse[]>> {
    this.log('Sending batch emails', { count: emails.length });

    const payload = {
      emails: emails.map(email => ({
        to: Array.isArray(email.to) ? email.to : [email.to],
        from: email.from || 'noreply@vly.io',
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments: email.attachments,
        replyTo: email.replyTo,
        cc: email.cc ? (Array.isArray(email.cc) ? email.cc : [email.cc]) : undefined,
        bcc: email.bcc ? (Array.isArray(email.bcc) ? email.bcc : [email.bcc]) : undefined
      }))
    };

    return this.request<EmailResponse[]>(
      '/v1/email/batch',
      'POST',
      payload,
      options
    );
  }

  async getStatus(
    emailId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<EmailResponse>> {
    this.log('Getting email status', { emailId });

    return this.request<EmailResponse>(
      `/v1/email/status/${emailId}`,
      'GET',
      undefined,
      options
    );
  }

  async verifyDomain(
    domain: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{
    domain: string;
    verified: boolean;
    dnsRecords: Array<{
      type: string;
      name: string;
      value: string;
      verified: boolean;
    }>;
  }>> {
    this.log('Verifying domain', { domain });

    return this.request(
      '/v1/email/domains/verify',
      'POST',
      { domain },
      options
    );
  }

  async listDomains(
    options?: RequestOptions
  ): Promise<ApiResponse<Array<{
    domain: string;
    verified: boolean;
    createdAt: string;
    verifiedAt?: string;
  }>>> {
    this.log('Listing email domains');

    return this.request(
      '/v1/email/domains',
      'GET',
      undefined,
      options
    );
  }
}