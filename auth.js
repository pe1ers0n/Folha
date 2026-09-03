// auth.js
require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { dbApp } = require('./database');

const router = express.Router();

// --- SEGURANÇA: o segredo do JWT agora vem do .env, nunca do código-fonte. ---
// Falha rápido caso alguém apague a variável do .env por engano.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('[CONFIG] JWT_SECRET não definido no .env. Configure-o antes de iniciar o servidor.');
    process.exit(1);
}

// Configuração do E-mail (credenciais no .env; ajuste conforme seu provedor)
// Para testes, o link será exibido no console se não configurar isso.
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

router.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const [users] = await dbApp.query('SELECT * FROM usuarios WHERE email = ?', [email]);

        if (users.length === 0) {
            // Mensagem genérica (não revela se o e-mail existe ou não) para dificultar
            // enumeração de contas.
            return res.status(401).json({ message: 'E-mail ou senha inválidos.' });
        }

        const user = users[0];

        const isMatch = await bcrypt.compare(password, user.senha);

        if (!isMatch) {
            return res.status(401).json({ message: 'E-mail ou senha inválidos.' });
        }

        // Cria o token (inclui is_admin e as permissões de menu/relatório para o
        // middleware de autorização poder checar acesso sem precisar consultar o
        // banco a cada requisição - veja requireMenu em server.js)
        const token = jwt.sign(
            {
                id: user.id,
                nome: user.nome,
                is_admin: !!user.is_admin,
                menus_permitidos: user.menus_permitidos || '',
                relatorios_permitidos: user.relatorios_permitidos || ''
            },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            token,
            // SEGURANÇA/BUG: o frontend guarda este objeto no localStorage e usa
            // menus_permitidos/relatorios_permitidos dele (não do token) para decidir
            // o que mostrar no menu (window.hasMenuAccess/hasReportAccess em index.js).
            // Faltavam esses dois campos aqui, então todo usuário não-admin via o
            // menu inteiro escondido, mesmo com permissões marcadas no cadastro.
            user: {
                id: user.id,
                nome: user.nome,
                email: user.email,
                is_admin: user.is_admin,
                menus_permitidos: user.menus_permitidos || '',
                relatorios_permitidos: user.relatorios_permitidos || ''
            }
        });

    } catch (error) {
        console.error('Erro no login:', error.message);
        res.status(500).json({ message: 'Erro no servidor.' });
    }
});

// 2. Rota para Criar Usuário
// SEGURANÇA: antes, esta rota era 100% pública e qualquer pessoa podia criar sua
// própria conta de acesso ao sistema. Agora:
//   - Se ainda não existe NENHUM usuário cadastrado, permite criar o primeiro
//     usuário (que já nasce administrador) - isso é só para a instalação inicial.
//   - Depois disso, só um administrador autenticado pode criar novos usuários.
router.post('/auth/register', async (req, res) => {
    const { nome, email, password } = req.body;

    if (!nome || !email || !password) {
        return res.status(400).json({ message: 'Nome, e-mail e senha são obrigatórios.' });
    }

    try {
        const [existingUsers] = await dbApp.query('SELECT COUNT(*) as total FROM usuarios');
        const isFirstUser = !existingUsers[0] || Number(existingUsers[0].total) === 0;

        if (!isFirstUser) {
            // Não é o primeiro usuário: exige token válido de administrador.
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1];
            if (!token) {
                return res.status(401).json({ message: 'Apenas administradores podem criar novos usuários.' });
            }
            let decoded;
            try {
                decoded = jwt.verify(token, JWT_SECRET);
            } catch (err) {
                return res.status(403).json({ message: 'Sessão inválida ou expirada.' });
            }
            if (!decoded.is_admin) {
                return res.status(403).json({ message: 'Apenas administradores podem criar novos usuários.' });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await dbApp.query(
            'INSERT INTO usuarios (nome, email, senha, is_admin) VALUES (?, ?, ?, ?)',
            [nome, email, hashedPassword, isFirstUser ? 1 : 0]
        );
        res.json({
            message: isFirstUser
                ? 'Primeiro usuário (administrador) criado com sucesso!'
                : 'Usuário criado com sucesso!'
        });
    } catch (error) {
        console.error('Erro ao criar usuário:', error.message);
        res.status(500).json({ message: 'Erro ao criar usuário.' });
    }
});

// 3. Solicitar Recuperação de Senha
router.post('/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    // Mensagem sempre genérica (não revela se o e-mail existe), evitando
    // enumeração de contas — mesma política do login.
    const respostaGenerica = { message: 'Se o e-mail existir, um link foi enviado.' };
    try {
        const [users] = await dbApp.query('SELECT * FROM usuarios WHERE email = ?', [email]);
        // SEGURANÇA: antes retornava 404 "E-mail não encontrado", o que permitia
        // descobrir quais e-mails têm conta. Agora responde igual nos dois casos.
        if (users.length === 0) return res.json(respostaGenerica);

        const user = users[0];
        const token = crypto.randomBytes(20).toString('hex');
        const now = new Date();
        now.setHours(now.getHours() + 1); // Expira em 1 hora

        await dbApp.query('UPDATE usuarios SET reset_token = ?, reset_expires = ? WHERE id = ?', [token, now, user.id]);

        // BUG CORRIGIDO: "localhost" só funciona se quem clicar no link estiver
        // no MESMO computador do servidor - qualquer outra pessoa recebendo o
        // e-mail cairia num endereço que não existe pra ela. Usa a mesma
        // variável de ambiente (APP_BASE_URL) já criada pra Movimentações de
        // Setor, com o mesmo fallback de antes caso não esteja configurada.
        const baseUrl = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 8010}`;
        const resetLink = `${baseUrl}/reset-password.html?token=${token}`;
        
        console.log(`[DEBUG] Link de recuperação para ${email}: ${resetLink}`);

        // Tenta enviar e-mail (se falhar, o link está no console)
        try {
            await transporter.sendMail({
                to: email,
                subject: 'Recuperação de Senha - Sistema Folha',
                html: `<p>Clique no link para redefinir sua senha:</p><a href="${resetLink}">Redefinir Senha</a>`
            });
        } catch (emailErr) {
            console.log("Erro ao enviar e-mail (verifique console para link):", emailErr.message);
        }

        res.json({ message: 'Se o e-mail existir, um link foi enviado.' });

    } catch (error) {
        res.status(500).json({ message: 'Erro ao processar recuperação.' });
    }
});

// 4. Redefinir Senha
router.post('/auth/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    // Validação mínima de senha (evita senhas vazias/curtas demais no reset).
    if (!token || !newPassword || newPassword.length < 6) {
        return res.status(400).json({ message: 'Informe o token e uma nova senha com pelo menos 6 caracteres.' });
    }
    try {
        const [users] = await dbApp.query('SELECT * FROM usuarios WHERE reset_token = ? AND reset_expires > NOW()', [token]);
        
        if (users.length === 0) return res.status(400).json({ message: 'Token inválido ou expirado.' });

        const user = users[0];
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await dbApp.query('UPDATE usuarios SET senha = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?', [hashedPassword, user.id]);

        res.json({ message: 'Senha alterada com sucesso!' });

    } catch (error) {
        res.status(500).json({ message: 'Erro ao redefinir senha.' });
    }
});

module.exports = { router, JWT_SECRET };