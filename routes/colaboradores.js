// routes/colaboradores.js
// Listagem e detalhe de colaboradores, folha individual e resumo por período.


const express = require('express');
const { dbDW, handleError } = require('./_shared');

const router = express.Router();


router.get('/colaboradores', async (req, res) => {
    try {
        const { rows } = await dbDW.query(`
            SELECT DISTINCT ON (f.id_funcionario)
                f.id_funcionario, f.cpf, f.funcionario AS nome, f.data_nascimento, f.idade, f.sexo, f.raca_cor, f.estado_civil, f.tempo_casa, f.logradouro, f.end_numero, f.bairro, f.cep, f.grau_instrucao, f.num_dependentes, f.data_admissao, f.data_rescisao, f.data_transferencia, f.hablitacao_categoria, f.hablitacao_numero, f.tem_deficiencia, f.participacao_cipa, f.deficiencia_auditiva, f.deficiencia_fisica, f.deficiencia_intelectual, f.deficiencia_mental, f.deficiencia_visual, f.e_transferido, f.status, f.possui_dependente, f.geracao, f.tempo_servico, f.faixa_etaria, f.tempo_servico_dias, f.cod_funcionario, f.iniciativa_rescisao,
                c.cargo, c.cargo_cbo,
                e.empresa,
                es.estabelecimento,
                l.nome_lotacao, l.centro_custo_protheus
            FROM gold.d_fortes_funcionario f
            LEFT JOIN gold.f_fortes_pagamento ffp ON f.id_funcionario = ffp.id_funcionario
            LEFT JOIN gold.d_fortes_cargo c ON ffp.id_cargo = c.id_cargo
            LEFT JOIN gold.d_fortes_empresa e ON ffp.id_empresa = e.id_empresa
            LEFT JOIN gold.d_fortes_estabelecimento es ON ffp.id_estabelecimento = es.id_estabelecimento
            LEFT JOIN gold.d_fortes_lotacao l ON ffp.id_lotacao = l.id_lotacao
            ORDER BY f.id_funcionario, ffp.data DESC NULLS LAST
        `);
        res.json(rows);
    } catch (error) {
        handleError(res, error, 'Erro ao buscar dados de colaboradores.');
    }
});

router.get('/colaboradores/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await dbDW.query(`
            SELECT DISTINCT ON (f.id_funcionario)
                f.id_funcionario, f.cpf, f.funcionario AS nome, f.data_nascimento, f.idade, f.sexo, f.raca_cor, f.estado_civil, f.tempo_casa, f.logradouro, f.end_numero, f.bairro, f.cep, f.grau_instrucao, f.num_dependentes, f.data_admissao, f.data_rescisao, f.data_transferencia, f.hablitacao_categoria, f.hablitacao_numero, f.tem_deficiencia, f.participacao_cipa, f.deficiencia_auditiva, f.deficiencia_fisica, f.deficiencia_intelectual, f.deficiencia_mental, f.deficiencia_visual, f.e_transferido, f.status, f.possui_dependente, f.geracao, f.tempo_servico, f.faixa_etaria, f.tempo_servico_dias, f.cod_funcionario, f.iniciativa_rescisao,
                c.cargo, c.cargo_cbo,
                e.empresa,
                es.estabelecimento,
                l.nome_lotacao, l.centro_custo_protheus
            FROM gold.d_fortes_funcionario f
            LEFT JOIN gold.f_fortes_pagamento ffp ON f.id_funcionario = ffp.id_funcionario
            LEFT JOIN gold.d_fortes_cargo c ON ffp.id_cargo = c.id_cargo
            LEFT JOIN gold.d_fortes_empresa e ON ffp.id_empresa = e.id_empresa
            LEFT JOIN gold.d_fortes_estabelecimento es ON ffp.id_estabelecimento = es.id_estabelecimento
            LEFT JOIN gold.d_fortes_lotacao l ON ffp.id_lotacao = l.id_lotacao
            WHERE f.id_funcionario = $1
            ORDER BY f.id_funcionario, ffp.data DESC NULLS LAST
        `, [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Colaborador não encontrado.' });
        }
        
        res.json(rows[0]);
    } catch (error) {
        handleError(res, error, 'Erro ao buscar detalhes do colaborador.');
    }
});

router.get('/colaboradores/:id/folha', async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await dbDW.query(`
            SELECT
                f.data,
                d_tf.descricao AS tipo_folha,
                SUM(f.provento) AS provento,
                SUM(f.desconto) AS desconto,
                SUM(f.liquido) AS liquido
            FROM gold.f_fortes_pagamento f
            LEFT JOIN gold.d_fortes_tipo_folha d_tf ON f.id_folha = d_tf.id_folha
            WHERE f.id_funcionario = $1
            GROUP BY f.data, d_tf.descricao
            ORDER BY f.data DESC
        `, [id]);
        
        res.json(rows);
    } catch (error) {
        handleError(res, error, 'Erro ao buscar folha de pagamento do colaborador.');
    }
});

router.post('/colaboradores/resumo-folha', async (req, res) => {
    try {
        const { year, month } = req.body;
        let whereClauses = [];
        let params = [];
        let paramIndex = 1;

        if (year) {
            whereClauses.push(`EXTRACT(YEAR FROM f.data) = $${paramIndex++}`);
            params.push(year);
        }
        if (month) {
            whereClauses.push(`EXTRACT(MONTH FROM f.data) = $${paramIndex++}`);
            params.push(month);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const { rows } = await dbDW.query(`
            SELECT 
                f.id_funcionario,
                func.funcionario AS nome,
                func.cpf,
                c.cargo,
                e.empresa,
                l.nome_lotacao,
                SUM(f.provento) AS total_proventos,
                SUM(f.desconto) AS total_descontos,
                SUM(f.liquido) AS total_liquido,
                COUNT(*) AS quantidade_folhas
            FROM gold.f_fortes_pagamento f
            LEFT JOIN gold.d_fortes_funcionario func ON f.id_funcionario = func.id_funcionario
            LEFT JOIN gold.d_fortes_cargo c ON f.id_cargo = c.id_cargo
            LEFT JOIN gold.d_fortes_empresa e ON f.id_empresa = e.id_empresa
            LEFT JOIN gold.d_fortes_lotacao l ON f.id_lotacao = l.id_lotacao
            ${whereSql}
            GROUP BY f.id_funcionario, func.funcionario, func.cpf, c.cargo, e.empresa, l.nome_lotacao
            ORDER BY func.funcionario
        `, params);
        
        res.json(rows);
    } catch (error) {
        handleError(res, error, 'Erro ao buscar resumo de folha dos colaboradores.');
    }
});

module.exports = router;
