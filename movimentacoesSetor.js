// movimentacoesSetor.js
// Funcionalidade "Movimentações de Setor": todo mês, envia um e-mail para o
// gestor de cada lotação (cadastrado em Cadastros > Lotações) com o resumo
// da folha do setor e um link para ele revisar a lista de colaboradores e
// avisar se algum não faz mais parte da equipe dele.
//
// IMPORTANTE: este sistema NÃO altera a lotação de ninguém automaticamente.
// A observação do gestor só fica registrada aqui como um aviso/pendência
// para o Departamento Pessoal avaliar e corrigir por conta própria no
// sistema de origem (Fortes). Ver tela "Movimentações de Setor" no frontend.
//
// CONSOLIDAÇÃO POR GESTOR: um gestor pode administrar várias lotações, e uma
// lotação pode ter mais de um gestor (tabela lotacao_gestores_vinculos, N:N).
// Em vez de
// mandar um e-mail/link separado por lotação (poluindo a caixa de entrada do
// gestor e a tela de admin), geramos UM envio por gestor/mês reunindo todas
// as lotações dele - um só e-mail, um só link, uma página de resposta
// agrupada por lotação. Envios antigos (gerados antes desta mudança, um por
// lotação) continuam funcionando normalmente - ver os comentários "fallback"
// abaixo.
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { dbDW, dbApp } = require('./database');
const { enviarEmail } = require('./email');

const router = express.Router();

const MESES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// Link enviado por e-mail precisa ser um endereço que o gestor (de outro
// computador) consiga acessar - "localhost" NÃO funcionaria para ele.
// Configure APP_BASE_URL no .env (ex.: http://localhost:8010) se o
// endereço do servidor for diferente do valor abaixo.
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 8010}`;

// Depois desse número de dias, o link de resposta do gestor é considerado
// expirado (mas ainda é possível consultar, só não responder mais).
const TOKEN_EXPIRA_DIAS = parseInt(process.env.MOVIMENTACAO_TOKEN_EXPIRA_DIAS || '60', 10);

const handleError = (res, error, message = 'Ocorreu um erro no servidor.') => {
    console.error('Erro em movimentacoesSetor:', error);
    res.status(500).json({ message, error: error.message });
};

// --- BUSCA NO DATA WAREHOUSE: resumo de valores + lista de colaboradores de UMA lotação ---
async function buildResumoELista(nomeLotacao, ano, mes) {
    const lastDay = new Date(ano, mes, 0).getDate();
    const startDate = `${ano}-${String(mes).padStart(2, '0')}-01`;
    const endDate = `${ano}-${String(mes).padStart(2, '0')}-${lastDay}`;

    // ATUALIZADO: também traz o nome da empresa, pra mostrar/filtrar por
    // empresa na tela de admin. CORREÇÃO: d_fortes_lotacao NÃO tem coluna
    // id_empresa (deu erro "column l.id_empresa does not exist" em produção) -
    // o vínculo com empresa só existe na tabela de fatos, então o join com
    // d_fortes_empresa tem que ser feito por f.id_empresa, igual já é feito
    // em outras consultas do projeto (ex.: /lotacoes/status em routes.js).
    //
    // "PROVENTOS" NÃO SOMA O EVENTO 001 (ADIANTAMENTO): o adiantamento é
    // descontado do próprio colaborador no fechamento do mês, então contá-lo
    // como provento infla o valor mostrado ao gestor de forma enganosa. Só o
    // total de "proventos" exclui esse evento - descontos/líquido continuam
    // somando tudo normalmente. LPAD(...,3,'0') normaliza id_evento pra 3
    // dígitos antes de comparar com '001', pra funcionar tanto se a coluna
    // vier como texto ('001'/'1') quanto como número.
    const { rows: totalRows } = await dbDW.query(
        `SELECT
            COALESCE(SUM(CASE WHEN LPAD(TRIM(CAST(d_evt.id_evento AS TEXT)), 3, '0') != '001' THEN f.provento ELSE 0 END), 0) AS proventos,
            COALESCE(SUM(f.desconto), 0) AS descontos,
            COALESCE(SUM(f.liquido), 0) AS liquido,
            MAX(emp.empresa) AS empresa
         FROM gold.f_fortes_pagamento f
         LEFT JOIN gold.d_fortes_lotacao l ON f.id_lotacao = l.id_lotacao
         LEFT JOIN gold.d_fortes_empresa emp ON f.id_empresa = emp.id_empresa
         LEFT JOIN gold.d_fortes_evento d_evt ON f.id_evento = d_evt.id_evento
         WHERE l.nome_lotacao = $1 AND f.data >= $2 AND f.data <= $3`,
        [nomeLotacao, startDate, endDate]
    );

    // ATUALIZADO: agora traz também o total de proventos de CADA colaborador
    // no período (não só a lista de nomes), pra mostrar na página de resposta
    // do gestor junto com o nome de cada um. Mesma exclusão do evento 001
    // (Adiantamento) explicada acima. Também traz o cargo (join com
    // d_fortes_cargo via f.id_cargo, mesmo padrão usado em outros relatórios
    // do projeto) - usa MAX(c.cargo) em vez de colocar no GROUP BY pra não
    // duplicar a linha do colaborador caso o cargo tenha mudado no meio do
    // período (fica só o cargo mais recente).
    const { rows: colabRows } = await dbDW.query(
        `SELECT func.id_funcionario, func.funcionario,
                MAX(c.cargo) AS cargo,
                COALESCE(SUM(CASE WHEN LPAD(TRIM(CAST(d_evt.id_evento AS TEXT)), 3, '0') != '001' THEN f.provento ELSE 0 END), 0) AS proventos
         FROM gold.f_fortes_pagamento f
         LEFT JOIN gold.d_fortes_lotacao l ON f.id_lotacao = l.id_lotacao
         LEFT JOIN gold.d_fortes_funcionario func ON f.id_funcionario = func.id_funcionario
         LEFT JOIN gold.d_fortes_evento d_evt ON f.id_evento = d_evt.id_evento
         LEFT JOIN gold.d_fortes_cargo c ON f.id_cargo = c.id_cargo
         WHERE l.nome_lotacao = $1 AND f.data >= $2 AND f.data <= $3
           AND func.funcionario IS NOT NULL
         GROUP BY func.id_funcionario, func.funcionario
         ORDER BY func.funcionario`,
        [nomeLotacao, startDate, endDate]
    );

    const totals = totalRows[0] || { proventos: 0, descontos: 0, liquido: 0, empresa: null };
    return {
        proventos: parseFloat(totals.proventos) || 0,
        descontos: parseFloat(totals.descontos) || 0,
        liquido: parseFloat(totals.liquido) || 0,
        empresa: totals.empresa || null,
        colaboradores: colabRows.map((r) => ({
            id_funcionario: r.id_funcionario,
            nome_funcionario: r.funcionario,
            cargo: r.cargo || null,
            proventos: parseFloat(r.proventos) || 0
        }))
    };
}

// --- CONTEÚDO DO E-MAIL (compartilhado entre o envio automático/em lote e o
// botão "Reenviar" da tela de admin, pra não duplicar o template) ---
// "lotacoes" é a lista de setores do gestor incluídos neste envio, cada um
// com seu proprio sub-resumo; "resumoTotal" é a soma de todos eles.
function buildEmailMovimentacaoConteudo({ token, emailGestor, ano, mes, lotacoes, resumoTotal }) {
    const link = `${APP_BASE_URL}/resposta-movimentacao.html?token=${token}`;
    const mesNome = MESES[mes - 1];
    const fmt = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const listaLotacoesHtml = lotacoes
        .map((l) => `<li><strong>${l.nomeLotacao}</strong>${l.empresa ? ` (${l.empresa})` : ''} - Proventos: R$ ${fmt(l.proventos)} | Descontos: R$ ${fmt(l.descontos)} | Líquido: R$ ${fmt(l.liquido)}</li>`)
        .join('');

    const subject = lotacoes.length === 1
        ? `Movimentação de Setor - ${lotacoes[0].nomeLotacao} - ${mesNome}/${ano}`
        : `Movimentação de Setor - ${lotacoes.length} setores - ${mesNome}/${ano}`;

    const introSetores = lotacoes.length === 1
        ? `do setor <strong>${lotacoes[0].nomeLotacao}</strong>`
        : `dos <strong>${lotacoes.length} setores</strong> sob sua gestão`;

    const html = `
        <p>Olá,</p>
        <p>Segue o resumo da folha de pagamento ${introSetores} referente a <strong>${mesNome}/${ano}</strong>:</p>
        <ul>${listaLotacoesHtml}</ul>
        <p><strong>Total geral:</strong> Proventos R$ ${fmt(resumoTotal.proventos)} | Descontos R$ ${fmt(resumoTotal.descontos)} | Líquido R$ ${fmt(resumoTotal.liquido)}</p>
        <p>Por favor, confira a lista de colaboradores de cada setor e nos avise se algum deles não faz mais parte da sua equipe:</p>
        <p><a href="${link}">Conferir colaboradores e responder</a></p>
        <p style="color:#888; font-size:12px;">Este link é pessoal e válido por ${TOKEN_EXPIRA_DIAS} dias. Não compartilhe.</p>
    `;
    return { subject, html, link };
}

// --- ENVIO DO E-MAIL (usado pelo disparo em lote/automático) ---
// Engole erro de envio de propósito: um gestor com e-mail com problema não
// pode travar a geração dos envios dos outros gestores. O registro já existe
// no banco (status "aguardando") e pode ser reenviado depois pelo botão
// "Reenviar" da tela de admin (rota /movimentacoes-setor/admin/envios/:id/reenviar).
async function enviarEmailMovimentacao({ token, emailGestor, ano, mes, lotacoes, resumoTotal }) {
    const { subject, html, link } = buildEmailMovimentacaoConteudo({ token, emailGestor, ano, mes, lotacoes, resumoTotal });
    try {
        await enviarEmail(emailGestor, subject, html);
    } catch (err) {
        console.error(`Erro ao enviar e-mail de movimentação para ${emailGestor}:`, err.message);
        console.log(`[DEBUG] Link de movimentação (${emailGestor}): ${link}`);
    }
}

// --- GERAÇÃO DOS ENVIOS DE UM MÊS (usada pelo botão manual e pelo agendamento automático) ---
// Idempotente: gestor+ano+mês tem restrição UNIQUE no banco, então rodar de
// novo para o mesmo período não duplica envios já criados.
async function gerarEnviosDoMes(ano, mes) {
    // "totalGestoresCadastrados" existe só para diagnóstico: se vier 0 aqui, o
    // problema NÃO é a folha do mês - é que a tabela lotacao_gestores_vinculos
    // está vazia (nenhum gestor vinculado a nenhuma lotação ainda), então nem
    // chega a olhar pro DW. Isso ajuda a diferenciar "esqueci de vincular o
    // gestor" de "vinculei, mas não tem dados de folha nesse período". Aqui,
    // "totalGestoresCadastrados" conta GESTORES (e-mails únicos), não
    // lotações - um gestor com 3 lotações conta como 1.
    const resultado = { criados: 0, ignoradosJaExistiam: 0, semDadosDeFolha: 0, totalGestoresCadastrados: 0, erros: [] };

    // Uma lotação pode ter mais de um gestor vinculado (tabela
    // lotacao_gestores_vinculos, ver database.js) - nesse caso ela aparece
    // aqui uma vez por gestor, e cada gestor recebe seu próprio envio
    // consolidado incluindo essa lotação (o agrupamento abaixo, por
    // email_gestor, já lida com isso naturalmente).
    const [linhas] = await dbApp.query('SELECT nome_lotacao, email_gestor FROM lotacao_gestores_vinculos');

    // Agrupa as lotações por e-mail do gestor - é isso que permite um gestor
    // com várias lotações receber um envio/e-mail único em vez de um por lotação.
    const porGestor = new Map();
    for (const linha of linhas) {
        if (!linha.email_gestor) continue;
        if (!porGestor.has(linha.email_gestor)) porGestor.set(linha.email_gestor, []);
        porGestor.get(linha.email_gestor).push(linha.nome_lotacao);
    }
    resultado.totalGestoresCadastrados = porGestor.size;
    if (porGestor.size === 0) return resultado;

    for (const [emailGestor, nomesLotacoes] of porGestor.entries()) {
        try {
            const [existentes] = await dbApp.query(
                'SELECT id FROM movimentacoes_setor_envios WHERE email_gestor = ? AND ano = ? AND mes = ?',
                [emailGestor, ano, mes]
            );
            if (existentes.length > 0) {
                resultado.ignoradosJaExistiam++;
                continue;
            }

            // Busca o resumo de CADA lotação do gestor separadamente no DW
            // (a consulta é por lotação) e depois junta tudo num envio só.
            // Uma lotação sem dados de folha nesse período simplesmente não
            // entra na lista - não impede as outras lotações do mesmo gestor.
            const lotacoesComDados = [];
            const todosColaboradores = [];
            let totalProventos = 0;
            let totalDescontos = 0;
            let totalLiquido = 0;

            for (const nomeLotacao of nomesLotacoes) {
                const resumo = await buildResumoELista(nomeLotacao, ano, mes);
                if (resumo.colaboradores.length === 0) continue;

                lotacoesComDados.push({
                    nomeLotacao,
                    empresa: resumo.empresa,
                    proventos: resumo.proventos,
                    descontos: resumo.descontos,
                    liquido: resumo.liquido
                });
                totalProventos += resumo.proventos;
                totalDescontos += resumo.descontos;
                totalLiquido += resumo.liquido;

                resumo.colaboradores.forEach((c) => {
                    todosColaboradores.push({ ...c, nomeLotacao, empresa: resumo.empresa });
                });
            }

            if (lotacoesComDados.length === 0) {
                resultado.semDadosDeFolha++;
                continue;
            }

            const token = crypto.randomBytes(24).toString('hex');
            const [insertResult] = await dbApp.query(
                `INSERT INTO movimentacoes_setor_envios
                    (token, email_gestor, ano, mes, valor_proventos, valor_descontos, valor_liquido, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'aguardando')`,
                [token, emailGestor, ano, mes, totalProventos, totalDescontos, totalLiquido]
            );
            const idEnvio = insertResult.insertId;

            for (const c of todosColaboradores) {
                await dbApp.query(
                    'INSERT INTO movimentacoes_setor_colaboradores (id_envio, id_funcionario, nome_funcionario, cargo, nome_lotacao, empresa, proventos) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [idEnvio, c.id_funcionario, c.nome_funcionario, c.cargo, c.nomeLotacao, c.empresa, c.proventos]
                );
            }

            // Grava o subtotal (proventos/descontos/líquido) de CADA lotação
            // do gestor - já calculado acima em lotacoesComDados. É o que
            // permite a página de resposta do gestor mostrar o subtotal de
            // cada setor, não só o total geral do envio.
            for (const l of lotacoesComDados) {
                await dbApp.query(
                    'INSERT INTO movimentacoes_setor_lotacoes (id_envio, nome_lotacao, empresa, valor_proventos, valor_descontos, valor_liquido) VALUES (?, ?, ?, ?, ?, ?)',
                    [idEnvio, l.nomeLotacao, l.empresa, l.proventos, l.descontos, l.liquido]
                );
            }

            await enviarEmailMovimentacao({
                token,
                emailGestor,
                ano,
                mes,
                lotacoes: lotacoesComDados,
                resumoTotal: { proventos: totalProventos, descontos: totalDescontos, liquido: totalLiquido }
            });
            resultado.criados++;
        } catch (err) {
            console.error(`Erro ao gerar envio de movimentação para gestor "${emailGestor}":`, err.message);
            resultado.erros.push({ lotacao: emailGestor, erro: err.message });
        }
    }

    return resultado;
}

// =============================================================
// --- ROTAS PROTEGIDAS (uso interno do RH/admin) ---
// Ficam sob /movimentacoes-setor/admin/* para herdar, em server.js, o
// middleware requireMenu('movimentacoes-setor') sem afetar as rotas
// públicas de resposta do gestor (que não usam esse prefixo).
// =============================================================

router.get('/movimentacoes-setor/admin/envios', async (req, res) => {
    try {
        const [envios] = await dbApp.query(
            `SELECT id, token, nome_lotacao, email_gestor, ano, mes, valor_proventos, valor_descontos, valor_liquido,
                    status, bloqueado_edicao, empresa, data_envio, data_resposta
             FROM movimentacoes_setor_envios
             ORDER BY data_envio DESC`
        );

        if (envios.length === 0) return res.json([]);

        const ids = envios.map((e) => e.id);
        const placeholders = ids.map(() => '?').join(',');
        const [colaboradores] = await dbApp.query(
            `SELECT id_envio, id_funcionario, nome_funcionario, cargo, nome_lotacao, empresa, fora_setor, observacao
             FROM movimentacoes_setor_colaboradores
             WHERE id_envio IN (${placeholders})`,
            ids
        );

        const colabPorEnvio = {};
        colaboradores.forEach((c) => {
            if (!colabPorEnvio[c.id_envio]) colabPorEnvio[c.id_envio] = [];
            colabPorEnvio[c.id_envio].push({
                id_funcionario: c.id_funcionario,
                nome_funcionario: c.nome_funcionario,
                cargo: c.cargo,
                nomeLotacao: c.nome_lotacao,
                empresa: c.empresa,
                fora_setor: !!c.fora_setor,
                observacao: c.observacao
            });
        });

        const result = envios.map((e) => {
            const colabs = colabPorEnvio[e.id] || [];
            const pendencias = colabs.filter((c) => c.fora_setor);

            // Lista de lotações/empresas deste envio: envios NOVOS
            // (consolidados por gestor) derivam isso dos colaboradores
            // salvos, já que um envio agora pode cobrir vários setores.
            // Envios ANTIGOS (um por lotação, de antes desta mudança) não
            // têm nome_lotacao/empresa gravados por colaborador - caem no
            // fallback usando as colunas do próprio envio.
            const lotacoesSet = new Set(colabs.map((c) => c.nomeLotacao).filter(Boolean));
            const empresasSet = new Set(colabs.map((c) => c.empresa).filter(Boolean));
            const lotacoes = lotacoesSet.size > 0 ? Array.from(lotacoesSet) : (e.nome_lotacao ? [e.nome_lotacao] : []);
            const empresas = empresasSet.size > 0 ? Array.from(empresasSet) : (e.empresa ? [e.empresa] : []);

            return {
                id: e.id,
                lotacoes,
                empresas,
                nomeLotacao: lotacoes.join(', ') || '-',
                empresa: empresas.join(', ') || null,
                emailGestor: e.email_gestor,
                ano: e.ano,
                mes: e.mes,
                mesNome: MESES[e.mes - 1],
                valorProventos: parseFloat(e.valor_proventos) || 0,
                valorDescontos: parseFloat(e.valor_descontos) || 0,
                valorLiquido: parseFloat(e.valor_liquido) || 0,
                status: e.status,
                bloqueado: !!e.bloqueado_edicao,
                dataEnvio: e.data_envio,
                dataResposta: e.data_resposta,
                totalColaboradores: colabs.length,
                pendencias
            };
        });

        res.json(result);
    } catch (error) {
        handleError(res, error, 'Erro ao buscar movimentações de setor.');
    }
});

router.post('/movimentacoes-setor/admin/enviar', async (req, res) => {
    const anoNum = parseInt(req.body.ano, 10);
    const mesNum = parseInt(req.body.mes, 10);
    if (!anoNum || !mesNum || mesNum < 1 || mesNum > 12) {
        return res.status(400).json({ message: 'Informe um ano e mês válidos.' });
    }
    try {
        const resultado = await gerarEnviosDoMes(anoNum, mesNum);
        res.json(resultado);
    } catch (error) {
        handleError(res, error, 'Erro ao disparar e-mails de movimentação de setor.');
    }
});

// Reenvia o e-mail de um envio já existente (mesmo token/link - não recria
// nada). Útil para os casos em que o e-mail falhou na hora (ex.: EMAIL_USER/
// EMAIL_PASS mal configurados) e o registro ficou parado em "Aguardando
// resposta" sem o gestor nunca ter recebido nada.
router.post('/movimentacoes-setor/admin/envios/:id/reenviar', async (req, res) => {
    const { id } = req.params;
    try {
        const [envios] = await dbApp.query(
            `SELECT token, nome_lotacao, email_gestor, ano, mes, valor_proventos, valor_descontos, valor_liquido
             FROM movimentacoes_setor_envios WHERE id = ?`,
            [id]
        );
        if (envios.length === 0) {
            return res.status(404).json({ message: 'Envio não encontrado.' });
        }
        const e = envios[0];

        // Reconstrói a lista de lotações pro e-mail. Preferência pelo
        // subtotal gravado em movimentacoes_setor_lotacoes na geração (tem
        // proventos/descontos/líquido corretos por setor). Fallback 1: soma
        // só o proventos dos colaboradores salvos (envios gerados entre a
        // consolidação por gestor e a criação desta tabela - descontos/
        // líquido não dá pra recalcular, ficam 0). Fallback 2: envio antigo
        // de antes da consolidação (uma lotação só) - usa os totais do
        // próprio envio.
        const [lotacoesLotTable] = await dbApp.query(
            `SELECT nome_lotacao, empresa, valor_proventos, valor_descontos, valor_liquido
             FROM movimentacoes_setor_lotacoes WHERE id_envio = ?`,
            [id]
        );
        let lotacoes;
        if (lotacoesLotTable.length > 0) {
            lotacoes = lotacoesLotTable.map((l) => ({
                nomeLotacao: l.nome_lotacao,
                empresa: l.empresa,
                proventos: parseFloat(l.valor_proventos) || 0,
                descontos: parseFloat(l.valor_descontos) || 0,
                liquido: parseFloat(l.valor_liquido) || 0
            }));
        } else {
            const [lotacoesRows] = await dbApp.query(
                `SELECT nome_lotacao, empresa, COALESCE(SUM(proventos), 0) AS proventos
                 FROM movimentacoes_setor_colaboradores
                 WHERE id_envio = ? AND nome_lotacao IS NOT NULL
                 GROUP BY nome_lotacao, empresa`,
                [id]
            );
            lotacoes = lotacoesRows.length > 0
                ? lotacoesRows.map((l) => ({
                    nomeLotacao: l.nome_lotacao,
                    empresa: l.empresa,
                    proventos: parseFloat(l.proventos) || 0,
                    descontos: 0,
                    liquido: 0
                }))
                : [{
                    nomeLotacao: e.nome_lotacao || '(setor)',
                    empresa: null,
                    proventos: parseFloat(e.valor_proventos) || 0,
                    descontos: parseFloat(e.valor_descontos) || 0,
                    liquido: parseFloat(e.valor_liquido) || 0
                }];
        }

        const { subject, html } = buildEmailMovimentacaoConteudo({
            token: e.token,
            emailGestor: e.email_gestor,
            ano: e.ano,
            mes: e.mes,
            lotacoes,
            resumoTotal: {
                proventos: parseFloat(e.valor_proventos) || 0,
                descontos: parseFloat(e.valor_descontos) || 0,
                liquido: parseFloat(e.valor_liquido) || 0
            }
        });

        // Diferente de enviarEmailMovimentacao (usada no disparo em lote), aqui
        // NÃO engolimos o erro - quem clicou no botão precisa saber se falhou.
        await enviarEmail(e.email_gestor, subject, html);

        res.json({ message: 'E-mail reenviado com sucesso.' });
    } catch (error) {
        handleError(res, error, 'Erro ao reenviar e-mail. Confira EMAIL_USER/EMAIL_PASS no .env.');
    }
});

// Exclui um envio (e, em cascata, as respostas/colaboradores associados -
// ver FOREIGN KEY ... ON DELETE CASCADE na criação da tabela em database.js).
// Usado para limpar envios de teste ou lançados por engano.
// PROTEÇÃO: se o gestor já respondeu (status diferente de "aguardando"), a
// exclusão é bloqueada - apagar perderia o aviso/pendência já registrado
// para o Departamento Pessoal. Nesse caso, use "Bloquear" pra travar o link
// em vez de excluir.
router.delete('/movimentacoes-setor/admin/envios/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [envios] = await dbApp.query('SELECT status FROM movimentacoes_setor_envios WHERE id = ?', [id]);
        if (envios.length === 0) {
            return res.status(404).json({ message: 'Envio não encontrado.' });
        }
        if (envios[0].status !== 'aguardando') {
            return res.status(409).json({
                message: 'Este envio já tem resposta do gestor registrada e não pode ser excluído. Use "Bloquear" se quiser impedir novas respostas.'
            });
        }
        await dbApp.query('DELETE FROM movimentacoes_setor_envios WHERE id = ?', [id]);
        res.json({ message: 'Envio removido.' });
    } catch (error) {
        handleError(res, error, 'Erro ao remover envio.');
    }
});

// Bloqueia o link de resposta do gestor: mesmo que ele ainda não tenha
// respondido (status "aguardando"), a rota pública passa a recusar tanto a
// consulta detalhada quanto o envio de resposta enquanto estiver bloqueado.
// Útil pra travar um envio disparado por engano ou suspender temporariamente
// enquanto o RH revisa algo.
router.post('/movimentacoes-setor/admin/envios/:id/bloquear', async (req, res) => {
    const { id } = req.params;
    try {
        await dbApp.query('UPDATE movimentacoes_setor_envios SET bloqueado_edicao = 1 WHERE id = ?', [id]);
        res.json({ message: 'Envio bloqueado para edição.' });
    } catch (error) {
        handleError(res, error, 'Erro ao bloquear envio.');
    }
});

// Libera um envio bloqueado (ou já respondido) para edição. Também reseta o
// status para "aguardando" - sem isso, mesmo desbloqueado o gestor não
// conseguiria reenviar porque a rota de resposta só aceita status
// "aguardando". As respostas anteriores (fora_setor/observação) continuam
// salvas e aparecem pré-preenchidas pro gestor editar, não some nada.
router.post('/movimentacoes-setor/admin/envios/:id/liberar', async (req, res) => {
    const { id } = req.params;
    try {
        await dbApp.query(
            `UPDATE movimentacoes_setor_envios SET bloqueado_edicao = 0, status = 'aguardando' WHERE id = ?`,
            [id]
        );
        res.json({ message: 'Envio liberado para edição.' });
    } catch (error) {
        handleError(res, error, 'Erro ao liberar envio.');
    }
});

// =============================================================
// --- ROTAS PÚBLICAS (o gestor acessa pelo link do e-mail, sem login) ---
// Autenticadas apenas pelo token (aleatório, imprevisível). Precisam estar
// isentas do middleware authenticateToken global em server.js.
// =============================================================

// Lista de cargos e setores já existentes no Fortes, usada como sugestão de
// autocomplete (<datalist>) nos campos "Para qual setor foi transferido?" e
// "Qual o novo cargo?" da página de resposta do gestor - assim ele escolhe
// entre um valor já cadastrado em vez de digitar de forma livre (evita erro
// de digitação/nome divergente do que já existe no Fortes).
//
// PERFORMANCE: consulta só as tabelas de dimensão (d_fortes_cargo/
// d_fortes_lotacao), sem tocar na tabela de fatos - mesmo padrão já usado na
// rota /lotacoes (routes.js). Além disso, o resultado é guardado em cache em
// memória por alguns minutos (CACHE_OPCOES_MS) - a lista de cargos/setores
// praticamente não muda de um minuto pro outro, e essa rota é pública (sem
// login), chamada toda vez que qualquer gestor abre o link do e-mail, então
// vale evitar bater no Data Warehouse a cada carregamento de página.
const CACHE_OPCOES_MS = 5 * 60 * 1000; // 5 minutos
let cacheOpcoes = { dados: null, expiraEm: 0 };

router.get('/movimentacoes-setor/opcoes', async (req, res) => {
    try {
        if (cacheOpcoes.dados && Date.now() < cacheOpcoes.expiraEm) {
            return res.json(cacheOpcoes.dados);
        }

        // "DISTINCT cargo" sozinho não bastava - a tabela de dimensão tem uma
        // linha por id_cargo, e o mesmo nome aparece mais de uma vez com
        // espaços a mais ("Auxiliar Administrativo " x "Auxiliar
        // Administrativo") ou capitalização diferente ("AUXILIAR
        // ADMINISTRATIVO" x "Auxiliar Administrativo"), que pro banco são
        // strings diferentes. Agrupar por UPPER(TRIM(...)) junta essas
        // variações num só item da lista; MAX(TRIM(...)) escolhe uma versão
        // do texto pra exibir (o group by não garante qual variação viria
        // primeiro, então precisa de um agregador).
        const { rows: cargoRows } = await dbDW.query(
            `SELECT MAX(TRIM(cargo)) AS cargo
             FROM gold.d_fortes_cargo
             WHERE cargo IS NOT NULL AND TRIM(cargo) != ''
             GROUP BY UPPER(TRIM(cargo))
             ORDER BY MAX(TRIM(cargo))`
        );
        const { rows: lotacaoRows } = await dbDW.query(
            `SELECT MAX(TRIM(nome_lotacao)) AS nome_lotacao
             FROM gold.d_fortes_lotacao
             WHERE nome_lotacao IS NOT NULL AND TRIM(nome_lotacao) != ''
             GROUP BY UPPER(TRIM(nome_lotacao))
             ORDER BY MAX(TRIM(nome_lotacao))`
        );

        const dados = {
            cargos: cargoRows.map((r) => r.cargo),
            lotacoes: lotacaoRows.map((r) => r.nome_lotacao)
        };
        cacheOpcoes = { dados, expiraEm: Date.now() + CACHE_OPCOES_MS };
        res.json(dados);
    } catch (error) {
        // Autocomplete é só um "nice to have" - se o DW estiver fora do ar,
        // devolve listas vazias em vez de 500, pra não travar a página de
        // resposta do gestor (os campos continuam funcionando como texto livre).
        console.error('Erro ao buscar cargos/lotações para autocomplete:', error.message);
        res.json({ cargos: [], lotacoes: [] });
    }
});

router.get('/movimentacoes-setor/responder/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const [envios] = await dbApp.query(
            `SELECT id, nome_lotacao, email_gestor, ano, mes, valor_proventos, valor_descontos, valor_liquido, status, bloqueado_edicao, data_envio, data_resposta
             FROM movimentacoes_setor_envios WHERE token = ?`,
            [token]
        );
        if (envios.length === 0) {
            return res.status(404).json({ message: 'Link inválido ou não encontrado.' });
        }
        const envio = envios[0];
        const diasDesdeEnvio = (Date.now() - new Date(envio.data_envio).getTime()) / (1000 * 60 * 60 * 24);

        // Ordenado por cargo dentro de cada setor (colaboradores do mesmo
        // cargo ficam agrupados visualmente na página do gestor), com nome
        // como desempate para colaboradores do mesmo cargo.
        const [colaboradores] = await dbApp.query(
            `SELECT id_funcionario, nome_funcionario, cargo, nome_lotacao, empresa, proventos, fora_setor, observacao
             FROM movimentacoes_setor_colaboradores WHERE id_envio = ? ORDER BY nome_lotacao, cargo, nome_funcionario`,
            [envio.id]
        );

        // Subtotal (proventos/descontos/líquido) de cada lotação deste envio,
        // gravado na hora da geração (ver gerarEnviosDoMes). Envios gerados
        // antes desta tabela existir não têm linha aqui - nesse caso o
        // subtotal por setor cai no fallback abaixo (baseado no que já está
        // salvo por colaborador/envio).
        const [subtotaisLotacoes] = await dbApp.query(
            `SELECT nome_lotacao, valor_proventos, valor_descontos, valor_liquido
             FROM movimentacoes_setor_lotacoes WHERE id_envio = ?`,
            [envio.id]
        );
        const subtotalPorLotacao = new Map();
        subtotaisLotacoes.forEach((l) => {
            subtotalPorLotacao.set(l.nome_lotacao, {
                proventos: parseFloat(l.valor_proventos) || 0,
                descontos: parseFloat(l.valor_descontos) || 0,
                liquido: parseFloat(l.valor_liquido) || 0
            });
        });

        // Agrupa os colaboradores por lotação pra montar a página de resposta
        // com uma seção por setor. Envios antigos (sem nome_lotacao salvo por
        // colaborador) caem todos num grupo só, usando o nome da lotação
        // gravado no próprio envio (fallback de compatibilidade).
        const gruposMap = new Map();
        colaboradores.forEach((c) => {
            const chave = c.nome_lotacao || envio.nome_lotacao || '(setor)';
            if (!gruposMap.has(chave)) {
                gruposMap.set(chave, { nomeLotacao: chave, empresa: c.empresa || null, colaboradores: [] });
            }
            gruposMap.get(chave).colaboradores.push({
                id_funcionario: c.id_funcionario,
                nome_funcionario: c.nome_funcionario,
                cargo: c.cargo,
                proventos: parseFloat(c.proventos) || 0,
                fora_setor: !!c.fora_setor,
                observacao: c.observacao
            });
        });

        // Anexa o subtotal de cada grupo/lotação. 3 níveis de fallback:
        // 1) valor gravado em movimentacoes_setor_lotacoes (envios novos) -
        //    tem proventos/descontos/líquido corretos.
        // 2) envio com uma lotação só (grupo único) e sem linha na tabela
        //    nova - usa o total do próprio envio (que é, nesse caso, igual
        //    ao subtotal daquela lotação).
        // 3) nenhum dos dois - soma só o proventos dos colaboradores do grupo
        //    (é o único valor guardado por colaborador) e deixa descontos/
        //    líquido como null pro frontend simplesmente não mostrar essas
        //    duas linhas.
        const grupos = Array.from(gruposMap.values()).map((g) => {
            let subtotal = subtotalPorLotacao.get(g.nomeLotacao);
            if (!subtotal && gruposMap.size === 1) {
                subtotal = {
                    proventos: parseFloat(envio.valor_proventos) || 0,
                    descontos: parseFloat(envio.valor_descontos) || 0,
                    liquido: parseFloat(envio.valor_liquido) || 0
                };
            }
            if (!subtotal) {
                subtotal = {
                    proventos: g.colaboradores.reduce((soma, c) => soma + c.proventos, 0),
                    descontos: null,
                    liquido: null
                };
            }
            return { ...g, subtotalProventos: subtotal.proventos, subtotalDescontos: subtotal.descontos, subtotalLiquido: subtotal.liquido };
        });

        res.json({
            emailGestor: envio.email_gestor,
            ano: envio.ano,
            mes: envio.mes,
            mesNome: MESES[envio.mes - 1],
            valorProventos: parseFloat(envio.valor_proventos) || 0,
            valorDescontos: parseFloat(envio.valor_descontos) || 0,
            valorLiquido: parseFloat(envio.valor_liquido) || 0,
            status: envio.status,
            bloqueado: !!envio.bloqueado_edicao,
            jaRespondido: envio.status !== 'aguardando',
            dataResposta: envio.data_resposta,
            expirado: diasDesdeEnvio > TOKEN_EXPIRA_DIAS,
            totalColaboradores: colaboradores.length,
            lotacoes: grupos
        });
    } catch (error) {
        handleError(res, error, 'Erro ao buscar dados da movimentação.');
    }
});

router.post('/movimentacoes-setor/responder/:token', async (req, res) => {
    const { token } = req.params;
    const { colaboradores } = req.body;

    if (!Array.isArray(colaboradores)) {
        return res.status(400).json({ message: 'Dados inválidos.' });
    }

    try {
        const [envios] = await dbApp.query(
            'SELECT id, status, bloqueado_edicao, data_envio FROM movimentacoes_setor_envios WHERE token = ?',
            [token]
        );
        if (envios.length === 0) {
            return res.status(404).json({ message: 'Link inválido ou não encontrado.' });
        }
        const envio = envios[0];

        if (envio.bloqueado_edicao) {
            return res.status(423).json({ message: 'Este link foi bloqueado. Fale com o RH se precisar enviar uma resposta.' });
        }

        if (envio.status !== 'aguardando') {
            return res.status(409).json({ message: 'Esta resposta já foi enviada anteriormente.' });
        }

        const diasDesdeEnvio = (Date.now() - new Date(envio.data_envio).getTime()) / (1000 * 60 * 60 * 24);
        if (diasDesdeEnvio > TOKEN_EXPIRA_DIAS) {
            return res.status(410).json({ message: 'Este link expirou. Fale com o RH para receber um novo.' });
        }

        // TRANSAÇÃO: antes, cada colaborador era atualizado numa query solta e
        // só depois o status do envio mudava. Se algo falhasse no meio, parte
        // dos colaboradores ficava gravada e o status do envio inconsistente.
        // Agora tudo (as atualizações dos colaboradores + a mudança de status)
        // acontece dentro de uma transação: ou grava tudo, ou nada.
        const conn = await dbApp.getConnection();
        try {
            await conn.beginTransaction();

            let temPendencia = false;
            for (const c of colaboradores) {
                const foraSetor = !!c.fora_setor;
                if (foraSetor) temPendencia = true;
                // Limite defensivo no tamanho da observação (evita texto gigante).
                const observacao = c.observacao ? String(c.observacao).slice(0, 2000) : null;
                await conn.query(
                    'UPDATE movimentacoes_setor_colaboradores SET fora_setor = ?, observacao = ? WHERE id_envio = ? AND id_funcionario = ?',
                    [foraSetor ? 1 : 0, observacao, envio.id, c.id_funcionario]
                );
            }

            const novoStatus = temPendencia ? 'pendencias' : 'ok';
            await conn.query(
                'UPDATE movimentacoes_setor_envios SET status = ?, data_resposta = NOW() WHERE id = ?',
                [novoStatus, envio.id]
            );

            await conn.commit();
        } catch (txErr) {
            await conn.rollback();
            throw txErr; // tratado pelo catch externo (handleError)
        } finally {
            conn.release();
        }

        res.json({ message: 'Resposta registrada com sucesso. Obrigado!' });
    } catch (error) {
        handleError(res, error, 'Erro ao registrar resposta.');
    }
});

module.exports = { router, gerarEnviosDoMes };
