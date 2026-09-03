// email.js
// Helper compartilhado de envio de e-mail (usado pela funcionalidade de
// Movimentações de Setor). Reaproveita as mesmas credenciais (.env) já usadas
// pelo fluxo de recuperação de senha em auth.js, mas centralizado aqui para
// não precisar duplicar a configuração do transporter em cada arquivo novo.
require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Envia um e-mail simples em HTML. Não lança erro para quem chamou "travar"
// o fluxo principal (ex.: geração dos envios do mês) - quem chama decide se
// quer tratar falha de envio como crítica ou só logar e seguir.
async function enviarEmail(destinatario, assunto, html) {
    return transporter.sendMail({
        to: destinatario,
        subject: assunto,
        html
    });
}

module.exports = { transporter, enviarEmail };
