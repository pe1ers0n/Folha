// auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { dbApp } = require('./database');

const router = express.Router();
const JWT_SECRET = 'sua_chave_secreta_super_segura_aqui'; // Troque isso por algo complexo

// Configuração do E-mail (Exemplo com Gmail - ajuste conforme seu provedor)
// Para testes, o link será exibido no console se não configurar isso.
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'seu_email@gmail.com',
        pass: 'sua_senha_de_app' 
    }
});

// auth.js (Trecho da rota login)

router.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    console.log('--- TENTATIVA DE LOGIN ---');
    console.log('Email recebido:', email);
    console.log('Senha recebida:', password);

    try {
        const [users] = await dbApp.query('SELECT * FROM usuarios WHERE email = ?', [email]);
        
        console.log('Usuários encontrados no banco:', users.length);

        if (users.length === 0) {
            console.log('❌ Falha: Usuário não encontrado no banco.');
            return res.status(401).json({ message: 'E-mail não encontrado.' });
        }

        const user = users[0];
        console.log('Hash no banco:', user.senha); // Mostra o hash salvo

        const isMatch = await bcrypt.compare(password, user.senha);
        console.log('A senha bate com o hash?', isMatch);

        if (!isMatch) {
            console.log('❌ Falha: A senha digitada não bate com o hash.');
            return res.status(401).json({ message: 'Senha incorreta.' });
        }

        console.log('✅ Sucesso: Login aprovado!');
        
        // Cria o token
        const token = jwt.sign({ id: user.id, nome: user.nome }, JWT_SECRET, { expiresIn: '8h' });

        res.json({ 
            token, 
            user: { 
                id: user.id, 
                nome: user.nome, 
                email: user.email,
                is_admin: user.is_admin // <--- Agora enviamos o nível de acesso
            } 
        });

    } catch (error) {
        console.error('Erro Fatal:', error);
        res.status(500).json({ message: 'Erro no servidor.' });
    }
});

// 2. Rota para Criar Usuário (Útil para criar o primeiro admin)
router.post('/auth/register', async (req, res) => {
    const { nome, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await dbApp.query('INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)', [nome, email, hashedPassword]);
        res.json({ message: 'Usuário criado com sucesso!' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao criar usuário.' + error.message });
    }
});

// 3. Solicitar Recuperação de Senha
router.post('/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const [users] = await dbApp.query('SELECT * FROM usuarios WHERE email = ?', [email]);
        if (users.length === 0) return res.status(404).json({ message: 'E-mail não encontrado.' });

        const user = users[0];
        const token = crypto.randomBytes(20).toString('hex');
        const now = new Date();
        now.setHours(now.getHours() + 1); // Expira em 1 hora

        await dbApp.query('UPDATE usuarios SET reset_token = ?, reset_expires = ? WHERE id = ?', [token, now, user.id]);

        // Link para o frontend (ajuste a URL se necessário)
        const resetLink = `http://localhost:3000/reset-password.html?token=${token}`;
        
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