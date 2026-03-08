import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';

const EMAIL_DOMAIN = String(process.env.INBOUND_EMAIL_DOMAIN || process.env.MAIL_DOMAIN || '').trim().toLowerCase();
const SMTP_HOST = process.env.INBOUND_EMAIL_HOST || '0.0.0.0';
const SMTP_PORT = Number.parseInt(process.env.INBOUND_EMAIL_PORT || '2525', 10);

let smtpServer = null;

function normalizeEmailLocalPart(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '')
        .slice(0, 64);
}

function getInboundEmailStatus() {
    return {
        enabled: Boolean(EMAIL_DOMAIN),
        active: Boolean(smtpServer),
        domain: EMAIL_DOMAIN || null,
        host: SMTP_HOST,
        port: Number.isInteger(SMTP_PORT) ? SMTP_PORT : 2525,
        address_pattern: EMAIL_DOMAIN ? `*@${EMAIL_DOMAIN}` : null,
    };
}

async function stopInboundEmailServer() {
    if (!smtpServer) {
        return;
    }

    const activeServer = smtpServer;
    smtpServer = null;

    await new Promise((resolve) => {
        activeServer.close(() => resolve());
    });
}

async function startInboundEmailServer({ onMessage }) {
    if (!EMAIL_DOMAIN || smtpServer) {
        return getInboundEmailStatus();
    }

    smtpServer = new SMTPServer({
        authOptional: true,
        logger: false,
        disabledCommands: ['AUTH', 'STARTTLS'],
        hidePIPELINING: true,
        size: 10 * 1024 * 1024,
        onData(stream, session, callback) {
            simpleParser(stream)
                .then((parsed) => onMessage({ parsed, session }))
                .then(() => callback())
                .catch((error) => callback(error));
        },
    });

    await new Promise((resolve, reject) => {
        smtpServer.once('error', reject);
        smtpServer.listen(SMTP_PORT, SMTP_HOST, () => resolve());
    });

    return getInboundEmailStatus();
}

export {
    getInboundEmailStatus,
    normalizeEmailLocalPart,
    startInboundEmailServer,
    stopInboundEmailServer,
};
