// routes/usuarios.js
// Gestão de usuários do sistema. Protegido por requireAdmin em server.js
// (todas as rotas /usuarios exigem is_admin no token).
//
// CORREÇÃO IMPORTANTE: a tela de edição enviava só o campo "perfil"
// (visualizador/analista/admin), mas TODA a autorização do sistema (login,
// requireAdmin, requireMenu) usa a coluna "is_admin". Antes, os dois campos
// viviam desconectados: promover alguém a "Administrador" pela tela NÃO tinha
// efeito nenhum, porque is_admin nunca era atualizado. Agora derivamos
// is_admin de perfil e gravamos os dois, e o GET devolve is_admin (usado pelo
// selo Admin/Comum e por window.isAdminUser no frontend).

const express = require('express');
const bcrypt = require('bcryptjs');
const { dbApp, handleError } = require('./_shared');

const router = express.Router();

// perfil "admin" (do <select> da tela) é o que concede acesso total.
const perfilConcedeAdmin = (perfil) => perfil === 'admin';

// Conta quantos administradores existem (para não deixar o sistema sem nenhum).
async function contarAdmins() {
    const [rows] = await dbApp.query('SELECT COUNT(*) AS total FROM usuarios WHERE is_admin = 1');
    return Number(rows[0].total) || 0;
}

// Listar usuários (inclui is_admin, usado pelo selo e pela autorização no front)
router.get('/usuarios', async (req, res) => {
    try {
        const [rows] = await dbApp.query(`
            SELECT id, nome, email, is_admin, perfil, relatorios_permitidos, menus_permitidos, data_cadastro
            FROM usuarios
            ORDER BY nome
        `);
        res.json(rows);
    } catch (error) {
        handleError(res, error, 'Erro ao buscar usuários.');
    }
});

// Editar usuário
router.put('/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, email, senha, perfil, relatorios, menus } = req.body;

    try {
        const isAdmin = perfilConcedeAdmin(perfil) ? 1 : 0;

        // PROTEÇÃO: impede rebaixar o ÚLTIMO administrador (deixaria o sistema
        // sem ninguém capaz de gerenciar usuários/permissões).
        if (!isAdmin) {
            const [alvoRows] = await dbApp.query('SELECT is_admin FROM usuarios WHERE id = ?', [id]);
            const alvoEraAdmin = alvoRows.length > 0 && Number(alvoRows[0].is_admin) === 1;
            if (alvoEraAdmin && (await contarAdmins()) <= 1) {
                return res.status(409).json({
                    message: 'Este é o único administrador. Promova outro usuário a Administrador antes de rebaixar este.'
                });
            }
        }

        // Converte os arrays (['a','b']) em strings ("a,b") para salvar no banco
        const relatoriosString = Array.isArray(relatorios) ? relatorios.join(',') : relatorios;
        const menusString = Array.isArray(menus) ? menus.join(',') : menus;

        let query = 'UPDATE usuarios SET nome = ?, email = ?, perfil = ?, is_admin = ?, relatorios_permitidos = ?, menus_permitidos = ?';
        let params = [nome, email, perfil, isAdmin, relatoriosString, menusString];

        // Se a senha foi preenchida, atualiza também (com hash).
        if (senha && senha.trim() !== '') {
            const hashedPassword = await bcrypt.hash(senha, 10);
            query += ', senha = ?';
            params.push(hashedPassword);
        }

        query += ' WHERE id = ?';
        params.push(id);

        await dbApp.query(query, params);
        res.json({ message: 'Usuário atualizado com sucesso.' });
    } catch (error) {
        handleError(res, error, 'Erro ao atualizar usuário.');
    }
});

// Excluir usuário
router.delete('/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    try {
        if (req.user && req.user.id == id) {
            return res.status(400).json({ message: 'Você não pode excluir seu próprio usuário.' });
        }

        // PROTEÇÃO: impede excluir o último administrador.
        const [alvoRows] = await dbApp.query('SELECT is_admin FROM usuarios WHERE id = ?', [id]);
        const alvoEraAdmin = alvoRows.length > 0 && Number(alvoRows[0].is_admin) === 1;
        if (alvoEraAdmin && (await contarAdmins()) <= 1) {
            return res.status(409).json({
                message: 'Este é o único administrador e não pode ser excluído. Promova outro usuário a Administrador primeiro.'
            });
        }

        await dbApp.query('DELETE FROM usuarios WHERE id = ?', [id]);
        res.json({ message: 'Usuário removido com sucesso.' });
    } catch (error) {
        handleError(res, error, 'Erro ao excluir usuário.');
    }
});

module.exports = router;
