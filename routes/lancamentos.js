// routes/lancamentos.js
// Lançamento manual de encargos por empresa/competência (menu Lançamentos).


const express = require('express');
const { dbDW, dbApp, handleError } = require('./_shared');

const router = express.Router();


router.get('/lancamentos/encargos', async (req, res) => {
    const { mes, ano } = req.query;
    if (!mes || !ano) return res.status(400).json({ message: 'Mês e Ano são obrigatórios.' });
    const competencia = `${ano}-${mes}-01`;

    try {
        // (Query do DW permanece igual...)
        const queryDW = `SELECT DISTINCT emp.id_empresa, emp.empresa AS nome_empresa FROM gold.f_fortes_pagamento f JOIN gold.d_fortes_empresa emp ON TRIM(CAST(f.id_empresa AS TEXT)) = TRIM(CAST(emp.id_empresa AS TEXT)) WHERE EXTRACT(MONTH FROM f.data) = $1 AND EXTRACT(YEAR FROM f.data) = $2 ORDER BY emp.empresa`;
        const { rows: empresasDW } = await dbDW.query(queryDW, [mes, ano]);

        if (empresasDW.length === 0) return res.json([]);

        // --- ALTERAÇÃO AQUI: Buscar colunas novas ---
        const [lancamentosSalvos] = await dbApp.query(`
            SELECT 
                id_empresa, 
                valor_inss, -- NOVO
                valor_compensacao,
                valor_comercializacao_rural,
                valor_retencao_1162
            FROM lancamentos_encargos_empresa 
            WHERE competencia = ?
        `, [competencia]);

        const resultado = empresasDW.map(emp => {
            const salvo = lancamentosSalvos.find(l => String(l.id_empresa) === String(emp.id_empresa));
            return {
                id_empresa: emp.id_empresa,
                nome_empresa: emp.nome_empresa,
                inss: salvo ? parseFloat(salvo.valor_inss) : 0.00, // NOVO
                compensacao: salvo ? parseFloat(salvo.valor_compensacao) : 0.00,
                comercializacao_rural: salvo ? parseFloat(salvo.valor_comercializacao_rural) : 0.00,
                retencao_1162: salvo ? parseFloat(salvo.valor_retencao_1162) : 0.00
            };
        });

        res.json(resultado);
    } catch (error) {
        handleError(res, error, 'Erro ao buscar lançamentos de encargos.');
    }
});

router.post('/lancamentos/encargos', async (req, res) => {
    const { lancamentos, mes, ano } = req.body;
    const competencia = `${ano}-${mes}-01`;
    
    try {
        for (const item of lancamentos) {
            // --- ALTERAÇÃO AQUI: Insert/Update com novos campos ---
            await dbApp.query(`
                INSERT INTO lancamentos_encargos_empresa 
                (id_empresa, nome_empresa, competencia, valor_inss, valor_compensacao, valor_comercializacao_rural, valor_retencao_1162, data_atualizacao)
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE 
                    valor_inss = VALUES(valor_inss), -- NOVO
                    valor_compensacao = VALUES(valor_compensacao),
                    valor_comercializacao_rural = VALUES(valor_comercializacao_rural),
                    valor_retencao_1162 = VALUES(valor_retencao_1162),
                    data_atualizacao = NOW()
            `, [
                item.id_empresa, 
                item.nome_empresa, 
                competencia, 
                item.inss,
                item.compensacao,
                item.comercializacao_rural,
                item.retencao_1162
            ]);
        }
        res.json({ message: 'Lançamentos salvos com sucesso!' });
    } catch (error) {
        handleError(res, error, 'Erro ao salvar lançamentos.');
    }
});

module.exports = router;
