import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { join } from 'path';
import { RegistrationRequests } from '../registration-requests/registration-requests.entity';
import { getEbookTemplate } from './template/ebook';

@Injectable()
export class EmailService {
    private transporter: nodemailer.Transporter;

    constructor() {
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
    }

    async sendEmailWithTemplate<T>(to: string, subject: string, templateFn: (data: T) => string, data: T, attachments?: any[]): Promise<void> {
        const html = templateFn(data);
        
        const mailOptions = {
            from: process.env.SMTP_FROM || 'noreply@smartdashboard.com',
            to,
            subject,
            html,
            attachments,
        };
        console.log('Sending email with options:', mailOptions);
        await this.transporter.sendMail(mailOptions);
    }

    async sendRegistrationEbook(registrationData: RegistrationRequests): Promise<void> {
        const ebookPath = join(process.cwd(), 'public', 'ebook.pdf');
        
        const attachments = [
            {
                filename: 'Smart_Dashboard_Guide.pdf',
                path: ebookPath,
                contentType: 'application/pdf',
            },
        ];

        await this.sendEmailWithTemplate(
            registrationData.email,
            'Chào mừng bạn đến với Smart Dashboard - Tặng kèm Ebook',
            getEbookTemplate,
            registrationData,
            attachments
        );
    }
}