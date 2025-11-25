// js/index.js


// --- VERIFICAÇÃO DE LOGIN (NOVO) ---
// Verifica se existe um token salvo. Se não existir e não estiver na tela de login/reset, redireciona.
const token = localStorage.getItem('token');
if (!token && !window.location.href.includes('login.html') && !window.location.href.includes('reset-password.html')) {
    window.location.href = 'login.html';
}

// --- URL BASE DA API ---
// Certifique-se de que este IP está correto para o seu servidor
const API_BASE_URL = 'http://192.168.8.11:3000'; 
const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY'; // Mantenha sua chave aqui se usar AI

// --- ESTADO GLOBAL ---
window.currentReportType = 'ano-mes';
window.currentView = 'inicio';
window.activeCharts = {}; 
window.fullReportsData = {};

// --- UTILITÁRIOS DA API (Global) ---
window.callApi = async function(endpoint, method = 'GET', body = null) {
    const options = {
        method: method,
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}` // <--- O SEGREDO ESTÁ AQUI
        },
    };
    if (body) options.body = JSON.stringify(body);

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

        // Se o token for inválido (401) ou proibido (403)
        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = 'login.html';
            return;
        }

        if (!response.ok) {
            // ... (resto do seu tratamento de erro original) ...
            let errorMsg = `Erro da API: ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.message || errorMsg;
            } catch (e) {}
            throw new Error(errorMsg);
        }
        return await response.json();
    } catch (error) {
        console.error(`Erro ao chamar a API ${endpoint}:`, error);
        throw error;
    }
};

// --- UTILITÁRIOS DE UI (Global) ---
window.showToast = function(message, type = 'success') {
    const toast = document.getElementById('toast');
    if(!toast) return;
    toast.textContent = message;
    toast.className = `show ${type}`;
    setTimeout(() => { toast.className = ''; }, 3000);
};

window.showLoader = function(container) {
    if (container) {
        window.hideLoader(container);
        const loader = document.createElement('div');
        loader.className = 'loader-overlay text-center text-gray-500 py-8';
        loader.innerHTML = '<p><i class="fas fa-spinner fa-spin fa-2x"></i> A carregar...</p>';
        container.prepend(loader);
    }
};

window.hideLoader = function(container) {
    if (container) {
        const loader = container.querySelector('.loader-overlay');
        if (loader) loader.remove();
    }
};

window.formatCurrency = function(value) {
    if (typeof value !== 'number') value = Number(value);
    if (isNaN(value)) return 'R$ 0,00';
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
};

window.formatAbbreviated = function(value) {
    if (typeof value !== 'number') value = Number(value);
    if (isNaN(value)) return 'R$ 0';
    if (value === 0) return 'R$ 0';
    if (Math.abs(value) >= 1000000) return `R$ ${(value / 1000000).toFixed(2)} Mi`;
    if (Math.abs(value) >= 1000) return `R$ ${(value / 1000).toFixed(0)}k`;
    return window.formatCurrency(value);
};

window.formatDataLabel = function(value) {
    return window.formatCurrency(value);
};

window.toggleCollapsible = function(header) {
    const targetId = header.dataset.target;
    const content = document.getElementById(targetId);
    if (content) {
        content.classList.toggle('active');
        header.classList.toggle('collapsed');
        
        // Gira o ícone de seta
        const icon = header.querySelector('.toggle-icon');
        if (icon) {
            icon.classList.toggle('fa-chevron-down');
            icon.classList.toggle('fa-chevron-up');
        }
    }
}

// --- FUNÇÃO DE CÁLCULO DO RAT (NOVO) ---
window.updateRatAjustado = function() {
    const inputRat = document.getElementById('encargos-rat');
    const inputFap = document.getElementById('encargos-fap');
    const displayRatAjustado = document.getElementById('encargos-rat-ajustado');
    
    if (!inputRat || !inputFap || !displayRatAjustado) return; // Proteção
    
    const rat = parseFloat(inputRat.value) || 0;
    const fap = parseFloat(inputFap.value) || 0;
    const ajustado = (rat * fap);
    // Usa 4 casas decimais como no seu HTML
    displayRatAjustado.textContent = `${ajustado.toFixed(4)}%`; 
}

// --- FUNÇÃO PARA SALVAR HISTÓRICO DE ENCARGOS (NOVO) ---
window.saveEncargosHistorico = async function(event) {
    event.preventDefault(); // Impede o recarregamento da página
    const form = event.target;
    const modal = document.getElementById('encargos-modal');
    window.showLoader(modal); // Mostra o loader dentro do modal

    const idEstabelecimento = document.getElementById('encargos-id-estabelecimento').value;
    const nomeEstabelecimento = document.getElementById('encargos-nome-estabelecimento').value;

    try {
        const body = {
            id_estabelecimento: idEstabelecimento,
            nome_estabelecimento: nomeEstabelecimento,
            competencia: document.getElementById('encargos-competencia').value,
            rat: parseFloat(document.getElementById('encargos-rat').value),
            fap: parseFloat(document.getElementById('encargos-fap').value),
            terceiros: parseFloat(document.getElementById('encargos-terceiros').value),
            patronal: parseFloat(document.getElementById('encargos-patronal').value)
        };
        
        // Validação simples
        if (!body.competencia || isNaN(body.rat) || isNaN(body.fap)) {
            throw new Error('Preencha a Competência, RAT e FAP.');
        }

        // Chama a API para salvar
        await window.callApi('/cadastro/estabelecimentos/historico', 'POST', body);
        
        window.showToast('Vigência salva com sucesso!', 'success');
        
        // Limpa o formulário de *nova* vigência
        document.getElementById('encargos-competencia').value = '';
        document.getElementById('encargos-rat').value = '';
        document.getElementById('encargos-fap').value = '';
        window.updateRatAjustado(); // Reseta o cálculo para 0.0000%
        
        // Recarrega o histórico
        await window.openEncargosModal(idEstabelecimento, nomeEstabelecimento);

    } catch (err) {
        window.showToast(err.message, 'error');
    } finally {
        window.hideLoader(modal);
    }
}

// --- NAVEGAÇÃO (Global) ---
window.switchView = function(viewId) {
    console.log("Trocando para view:", viewId); 
    
    const mainViews = document.querySelectorAll('.view');
    const navLinks = document.querySelectorAll('.nav-link');

    mainViews.forEach(v => v.classList.remove('active'));
    navLinks.forEach(l => l.classList.remove('active'));
    
    const activeView = document.getElementById(`${viewId}-view`);
    if (activeView) activeView.classList.add('active');
    else console.error(`View não encontrada: ${viewId}-view`);
    
    let activeLinkQuery = `.nav-link[data-view='${viewId}']`;
    if(viewId.startsWith('cadastros-') || viewId.startsWith('relatorios-')) {
        activeLinkQuery = `.nav-link[data-view='${viewId.split('-')[0]}']`;
    }
    const activeLink = document.querySelector(activeLinkQuery);
    if (activeLink) activeLink.classList.add('active');
    
    window.currentView = viewId;
    
    // Dispara carregamento de dados dependendo da tela
    if (viewId === 'inicio') {
        if (window.loadInicioData) window.loadInicioData();
    } else if (viewId === 'relatorios') {
        if (window.loadReportFilters) window.loadReportFilters();
        if (window.showReport) window.showReport(window.currentReportType);
    } else if (viewId.startsWith('cadastros-')) {
        const cadastroType = viewId.split('-')[1];
        if (cadastroType === 'cc') window.loadCCData();
        else if (cadastroType === 'lotacoes') window.loadLotacoesStatus();
        else if (cadastroType === 'usuarios') window.loadUsers(); // <--- ADICIONE ISSO
        else if (['empresas', 'estabelecimentos', 'tiposfolha'].includes(cadastroType)) window.loadGenericCadastro(cadastroType);
    }
};

// --- LÓGICA DE CADASTROS SIMPLES ---
const sheetNames = { 
    empresas: 'Empresas', 
    estabelecimentos: 'Estabelecimentos', 
    lotacoes: 'Lotações', 
    tiposfolha: 'Tipos de Folha' 
};

window.loadGenericCadastro = async function(type) {
    const container = document.getElementById(`cadastros-${type}-view`);
    if (!container) return;
    
    window.showLoader(container);
    try {
        let route = type;
        const data = await window.callApi(`/cadastro/${route}`);
        if (type === 'estabelecimentos') {
            renderEstabelecimentosList(container, data);
        } else {
            renderGenericList(container, sheetNames[type] || type, data);
        }
    } catch (err) {
        window.showToast(err.message, 'error');
        container.innerHTML = `<p class="text-red-500 p-4">Erro ao carregar: ${err.message}</p>`;
    } finally {
        window.hideLoader(container);
    }
};

function renderGenericList(container, title, data) {
    let listHTML = `<div class="bg-white rounded-xl shadow-lg p-6 md:p-8"><h2 class="text-2xl font-bold text-gray-700 mb-4">${title}</h2>`;
    if (!data || data.length === 0) { 
        listHTML += '<p class="text-gray-500">Nenhum item cadastrado.</p>'; 
    } else {
        listHTML += '<ul class="divide-y divide-gray-200 max-h-96 overflow-y-auto">';
        data.forEach(item => {
            const text = typeof item === 'string' ? item : (item.nome || item.descricao || item.tipo || JSON.stringify(item));
            listHTML += `<li class="py-3 flex justify-between items-center"><span class="text-gray-800">${text}</span></li>`;
        });
        listHTML += '</ul>';
    }
    listHTML += '</div>';
    container.innerHTML = listHTML;
}

function renderEstabelecimentosList(container, data) {
    let html = `<div class="bg-white rounded-xl shadow-lg p-6 md:p-8"><div class="flex justify-between items-center mb-6"><h2 class="text-2xl font-bold text-gray-700">Gestão de Estabelecimentos</h2></div>`;
    if (!data || data.length === 0) {
        html += '<p class="text-gray-500">Nenhum estabelecimento encontrado.</p></div>';
        container.innerHTML = html;
        return;
    }
    html += `<div class="overflow-x-auto"><table class="min-w-full divide-y divide-gray-200 border"><thead class="bg-gray-50"><tr><th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Empresa</th><th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Estabelecimento</th><th class="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase">Ações</th></tr></thead><tbody class="bg-white divide-y divide-gray-200">`;
    data.forEach(item => {
        const safeId = String(item.id_estabelecimento).replace(/"/g, '&quot;');
        const safeName = String(item.nome_estabelecimento).replace(/"/g, '&quot;');
        html += `<tr class="hover:bg-gray-50"><td class="px-6 py-4 text-sm font-bold text-gray-700">${item.nome_empresa}</td><td class="px-6 py-4 text-sm text-gray-600">${item.nome_estabelecimento}</td><td class="px-6 py-4 text-center"><button onclick="openEncargosModal('${safeId}', '${safeName}')" class="text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium"><i class="fas fa-sliders-h"></i> Configurar</button></td></tr>`;
    });
    html += `</tbody></table></div></div>`;
    container.innerHTML = html;
}

// --- FUNÇÃO GLOBAL PARA O MODAL DE ENCARGOS ---
window.openEncargosModal = async function(idEstabelecimento, nomeEstabelecimento) {
    const modal = document.getElementById('encargos-modal');
    if(!modal) return;

    document.getElementById('encargos-id-estabelecimento').value = idEstabelecimento;
    document.getElementById('encargos-nome-estabelecimento').value = nomeEstabelecimento;
    document.getElementById('encargos-modal-subtitle').textContent = nomeEstabelecimento;
    
    // Reseta formulário
    document.getElementById('encargos-competencia').value = '';
    document.getElementById('encargos-rat').value = '';
    document.getElementById('encargos-fap').value = '';
    document.getElementById('encargos-terceiros').value = '5.80';
    document.getElementById('encargos-patronal').value = '20.00';
    
    // Chama a função de cálculo para resetar o display para 0.0000%
    if (typeof window.updateRatAjustado === 'function') {
        window.updateRatAjustado();
    } else {
        document.getElementById('encargos-rat-ajustado').textContent = '0.0000%';
    }
    
    // Carregar histórico
    const tbody = document.getElementById('encargos-history-tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500"><i class="fas fa-spinner fa-spin"></i> Carregando histórico...</td></tr>';

    try {
        const historico = await window.callApi(`/cadastro/estabelecimentos/${idEstabelecimento}/historico`);
        
        if (!historico || historico.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500 italic">Nenhum histórico cadastrado.</td></tr>';
        } else {
            tbody.innerHTML = historico.map(h => {
                const rat = parseFloat(h.rat);
                const fap = parseFloat(h.fap);
                const ajustado = (rat * fap).toFixed(4);
                const total = (parseFloat(h.aliq_patronal) + parseFloat(h.aliq_terceiros) + parseFloat(ajustado)).toFixed(2);
                
                return `
                    <tr class="hover:bg-gray-50 border-b last:border-b-0">
                        <td class="px-4 py-3 text-gray-800 font-medium">${h.competencia_inicio.split('-').reverse().join('/')}</td>
                        <td class="px-4 py-3 text-center text-gray-600">${h.rat} x ${h.fap}</td>
                        <td class="px-4 py-3 text-center font-bold text-blue-600">${ajustado}%</td>
                        <td class="px-4 py-3 text-center text-gray-600">${h.aliq_terceiros}%</td>
                        <td class="px-4 py-3 text-center font-bold text-green-600 bg-green-50 rounded-lg">${total}%</td>
                    </tr>
                `;
            }).join('');
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-red-500">Erro ao carregar histórico.</td></tr>`;
        window.showToast('Erro ao carregar histórico.', 'error');
    }
    
    modal.classList.remove('hidden');
};

window.loadLotacoesStatus = async function() {
    const container = document.getElementById('cadastros-lotacoes-view');
    window.showLoader(container);
    try {
        const data = await window.callApi('/lotacoes/status');
        let listHTML = `<div class="bg-white rounded-xl shadow-lg p-6 md:p-8"><h2 class="text-2xl font-bold text-gray-700 mb-4">Estado das Lotações</h2><ul class="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">`;
        data.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(item => {
            const color = item.isAssociated ? '#51cd73' : '#eddf43';
            const ccInfo = item.centroCusto ? `<span class="text-xs font-bold text-gray-500 ml-2">CC: ${item.centroCusto}</span>` : '';
            listHTML += `<li class="py-3 flex items-center gap-3"><span class="h-3 w-3 rounded-full" style="background-color: ${color};"></span><div class="flex flex-col"><span class="text-gray-800 font-medium">${item.nome}</span><span class="text-xs text-gray-500">${item.empresa} - ${item.estabelecimento} ${ccInfo}</span></div></li>`;
        });
        listHTML += '</ul></div>';
        container.innerHTML = listHTML;
    } catch (err) { window.showToast(err.message, 'error'); } finally { window.hideLoader(container); }
};

window.loadCCData = async function() {
    const container = document.getElementById('cc-list-container');
    window.showLoader(container);
    try {
        const ccList = await window.callApi('/cc');
        let ccHTML = '<div class="space-y-4">';
        
        ccList.sort((a,b) => a.nome.localeCompare(b.nome)).forEach((cc) => {
             const lotacoesBadges = (cc.lotacoes && cc.lotacoes.length > 0) 
                ? cc.lotacoes.map(l => `<span class="bg-blue-100 text-blue-800 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded">${l}</span>`).join('') 
                : '<span class="text-gray-400 text-xs italic">Nenhuma lotação associada</span>';
             
             // --- ALTERAÇÃO AQUI: Formata "ID - NOME" ---
             const tituloCard = cc.id ? `${cc.id} - ${cc.nome}` : cc.nome;

             ccHTML += `
                <div class="bg-white rounded-xl shadow p-4 border border-gray-200">
                    <h3 class="text-lg font-bold text-gray-800 mb-2">${tituloCard}</h3>
                    <div class="flex flex-wrap gap-2 mt-1">${lotacoesBadges}</div>
                </div>`;
        });
        
        ccHTML += '</div>';
        container.innerHTML = ccHTML;
    } catch (err) { 
        window.showToast(err.message, 'error'); 
    } finally { 
        window.hideLoader(container); 
    }
};

// --- LÓGICA DE LANÇAMENTOS ---
window.loadLancamentos = async function() {
    const mesAnoInput = document.getElementById('lancamento-mes');
    const tbody = document.getElementById('tbody-lancamentos');
    if (!mesAnoInput.value) {
        window.showToast('Por favor, selecione um Mês/Ano.', 'error');
        return;
    }
    
    const [ano, mes] = mesAnoInput.value.split('-');
    window.showLoader(tbody.parentElement);

    try {
        const data = await window.callApi(`/lancamentos/encargos?mes=${mes}&ano=${ano}`);
        renderLancamentosTbody(data);
    } catch (err) {
        window.showToast(err.message, 'error');
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-red-500 py-4">${err.message}</td></tr>`;
    } finally {
        window.hideLoader(tbody.parentElement);
    }
}

function renderLancamentosTbody(data) {
    const tbody = document.getElementById('tbody-lancamentos');
    
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-gray-500 py-4">Nenhuma empresa encontrada para este Mês/Ano.</td></tr>`;
        return;
    }

    let html = '';
    data.forEach(item => {
        const valInss = (item.inss || 0).toFixed(2);
        const valRural = (item.comercializacao_rural || 0).toFixed(2);
        const valRetencao = (item.retencao_1162 || 0).toFixed(2);
        const valCompensacao = (item.compensacao || 0).toFixed(2);

        html += `
            <tr class="hover:bg-gray-50" data-id-empresa="${item.id_empresa}" data-nome-empresa="${item.nome_empresa}">
                <td class="px-6 py-4 text-sm font-medium text-gray-800">${item.nome_empresa}</td>
                
                <td class="px-6 py-4">
                    <input type="number" step="0.01" class="lancamento-inss w-full text-right border border-cyan-300 rounded-md shadow-sm p-1 focus:ring-cyan-500 focus:border-cyan-500 font-bold text-cyan-700" value="${valInss}">
                </td>

                <td class="px-6 py-4">
                    <input type="number" step="0.01" class="lancamento-rural w-full text-right border border-gray-300 rounded-md shadow-sm p-1 focus:ring-blue-500 focus:border-blue-500" value="${valRural}">
                </td>

                <td class="px-6 py-4">
                    <input type="number" step="0.01" class="lancamento-retencao w-full text-right border border-gray-300 rounded-md shadow-sm p-1 focus:ring-blue-500 focus:border-blue-500" value="${valRetencao}">
                </td>

                <td class="px-6 py-4">
                    <input type="number" step="0.01" class="lancamento-compensacao w-full text-right border border-gray-300 rounded-md shadow-sm p-1 focus:ring-blue-500 focus:border-blue-500" value="${valCompensacao}">
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

window.saveLancamentos = async function(event) {
    event.preventDefault(); 
    const mesAnoInput = document.getElementById('lancamento-mes');
    const tbody = document.getElementById('tbody-lancamentos');
    const form = document.getElementById('form-lancamentos');

    if (!mesAnoInput.value) {
        window.showToast('Por favor, selecione um Mês/Ano.', 'error');
        return;
    }
    
    const [ano, mes] = mesAnoInput.value.split('-');
    const lancamentos = [];
    
    tbody.querySelectorAll('tr').forEach(row => {
        if (row.dataset.idEmpresa) {
            lancamentos.push({
                id_empresa: row.dataset.idEmpresa,
                nome_empresa: row.dataset.nomeEmpresa,
                inss: parseFloat(row.querySelector('.lancamento-inss').value) || 0, 
                comercializacao_rural: parseFloat(row.querySelector('.lancamento-rural').value) || 0,
                retencao_1162: parseFloat(row.querySelector('.lancamento-retencao').value) || 0,
                compensacao: parseFloat(row.querySelector('.lancamento-compensacao').value) || 0
            });
        }
    });

    if (lancamentos.length === 0) {
        window.showToast('Não há dados para salvar.', 'error');
        return;
    }

    window.showLoader(form);
    try {
        const body = { lancamentos, mes, ano };
        await window.callApi('/lancamentos/encargos', 'POST', body);
        window.showToast('Lançamentos salvos com sucesso!', 'success');
    } catch (err) {
        window.showToast(err.message, 'error');
    } finally {
        window.hideLoader(form);
    }
}

// INICIALIZAÇÃO GERAL
document.addEventListener('DOMContentLoaded', () => {
    
    // --- INÍCIO DO CÓDIGO NOVO (VERIFICAÇÃO DE ADMIN) ---
    // Coloque isto EXATAMENTE AQUI, na primeira linha dentro do listener
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    
    // Verifica se é admin (aceita 1 ou true)
    const isAdmin = userData.is_admin === 1 || userData.is_admin === true;

    // Se NÃO for admin, esconde o menu e bloqueia o acesso
    if (!isAdmin) {
        // 1. Esconde o link no menu
        const userMenuLink = document.querySelector('a[data-view="cadastros-usuarios"]');
        if (userMenuLink) {
            // Esconde o <li> pai do link
            userMenuLink.parentElement.style.display = 'none'; 
        }
        
        // 2. Protege a função de navegação (Monkey Patching)
        const originalSwitchView = window.switchView;
        window.switchView = function(viewId) {
            if (viewId === 'cadastros-usuarios' && !isAdmin) {
                window.showToast('Acesso negado. Apenas administradores.', 'error');
                return;
            }
            originalSwitchView(viewId);
        }
    }
    // Carregar view inicial
    window.switchView('inicio');
    
    // Event listener navegação
    document.querySelector('header').addEventListener('click', (e) => {
        const targetLink = e.target.closest('a');
        if (!targetLink) return;
        const viewId = targetLink.dataset.view;
        const reportType = targetLink.dataset.reportType;
        
        e.preventDefault();
        if (viewId === 'movimentos') { window.showToast('Desabilitado.', 'error'); return; }
        
        if (targetLink.id === 'about-link') { /* ... */ } 
        else if (targetLink.id === 'ai-analysis-link') { /* ... */ } 
        else if (reportType) { window.switchView('relatorios'); window.showReport(reportType); } 
        else if (viewId) { window.switchView(viewId); }
    });

    // Event listener global para todos os botões de expandir/recolher
    document.body.addEventListener('click', function(event) {
        const header = event.target.closest('.collapsible-header');
        if (header) {
            window.toggleCollapsible(header);
        }
    });

    // --- INÍCIO DAS CONEXÕES DE BOTÕES E FORMULÁRIOS ---

    // Conecta o botão "Carregar" da tela de Lançamentos
    const btnCarregar = document.getElementById('btn-carregar-lancamentos');
    if (btnCarregar) {
        btnCarregar.addEventListener('click', window.loadLancamentos);
    }

    // Conecta o formulário "Salvar Lançamentos"
    const formLancamentos = document.getElementById('form-lancamentos');
    if (formLancamentos) {
        formLancamentos.addEventListener('submit', window.saveLancamentos);
    }
    
    // Conecta o formulário "Salvar Vigência"
    const formEncargos = document.getElementById('encargos-form');
    if (formEncargos) {
        formEncargos.addEventListener('submit', window.saveEncargosHistorico);
    }

    // Conecta os inputs RAT e FAP para cálculo automático
    const inputRat = document.getElementById('encargos-rat');
    const inputFap = document.getElementById('encargos-fap');
    if (inputRat) inputRat.addEventListener('input', window.updateRatAjustado);
    if (inputFap) inputFap.addEventListener('input', window.updateRatAjustado);
});

// --- GESTÃO DE USUÁRIOS (ATUALIZADO) ---

window.loadUsers = async function() {
    const tbody = document.getElementById('tbody-usuarios');
    window.showLoader(tbody.parentElement);
    
    try {
        const users = await window.callApi('/usuarios');
        
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Nenhum usuário encontrado.</td></tr>';
            return;
        }

        let html = '';
        users.forEach(u => {
            const roleBadge = u.is_admin ? 
                '<span class="bg-purple-100 text-purple-800 text-xs font-bold px-2 py-1 rounded">Admin</span>' : 
                '<span class="bg-gray-100 text-gray-800 text-xs font-bold px-2 py-1 rounded">Comum</span>';

            // Stringify seguro para passar no onclick
            const userObj = JSON.stringify(u).replace(/"/g, '&quot;');

            html += `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 text-sm text-gray-500">#${u.id}</td>
                    <td class="px-6 py-4 text-sm font-medium text-gray-900">${u.nome}</td>
                    <td class="px-6 py-4 text-sm text-gray-600">${u.email}</td>
                    <td class="px-6 py-4 text-center">${roleBadge}</td>
                    <td class="px-6 py-4 text-center space-x-2">
                        <button onclick="window.editUser(${userObj})" class="text-blue-600 hover:text-blue-900 font-bold text-sm" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="window.deleteUser(${u.id})" class="text-red-600 hover:text-red-900 font-bold text-sm" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;

    } catch (err) {
        window.showToast('Erro ao carregar usuários.', 'error');
    } finally {
        window.hideLoader(tbody.parentElement);
    }
};

// --- FUNÇÕES DE USUÁRIO ATUALIZADAS ---

// 1. Preencher formulário para edição
window.editUser = function(user) {
    // Campos básicos
    document.getElementById('gestao-user-id').value = user.id;
    document.getElementById('gestao-user-nome').value = user.nome;
    document.getElementById('gestao-user-email').value = user.email;
    document.getElementById('gestao-user-senha').value = '';
    
    // NOVO: Define o perfil no Select
    document.getElementById('gestao-user-perfil').value = user.perfil || 'visualizador';

    // NOVO: Marca os Menus Permitidos
    const menusPermitidos = (user.menus_permitidos || '').split(',');
    document.querySelectorAll('.menu-check').forEach(chk => {
        chk.checked = menusPermitidos.includes(chk.value);
    });

    // NOVO: Marca os Relatórios Permitidos
    const relsPermitidos = (user.relatorios_permitidos || '').split(',');
    document.querySelectorAll('.perm-check').forEach(chk => {
        chk.checked = relsPermitidos.includes(chk.value);
    });

    // Ajustes visuais
    document.getElementById('user-form-title').textContent = 'Editar Usuário #' + user.id;
    document.getElementById('btn-save-user').innerHTML = '<i class="fas fa-save mr-2"></i> Atualizar';
    document.getElementById('btn-cancel-edit').classList.remove('hidden');
};

// 2. Limpar formulário
window.resetUserForm = function() {
    document.getElementById('form-usuario').reset();
    document.getElementById('gestao-user-id').value = '';
    
    // Reseta para visualizador
    document.getElementById('gestao-user-perfil').value = 'visualizador';
    
    // Desmarca tudo
    document.querySelectorAll('.menu-check, .perm-check').forEach(c => c.checked = false);

    document.getElementById('user-form-title').textContent = 'Cadastrar Novo Usuário';
    document.getElementById('btn-save-user').innerHTML = '<i class="fas fa-plus mr-2"></i> Adicionar';
    document.getElementById('btn-cancel-edit').classList.add('hidden');
};

// 3. Salvar (Envia tudo para o backend)
window.saveUser = async function(e) {
    e.preventDefault();
    
    const id = document.getElementById('gestao-user-id').value;
    const nome = document.getElementById('gestao-user-nome').value;
    const email = document.getElementById('gestao-user-email').value;
    const senha = document.getElementById('gestao-user-senha').value;
    
    // Pega o valor do Select de Perfil
    const perfil = document.getElementById('gestao-user-perfil').value;

    // Coleta Menus marcados
    const menus = Array.from(document.querySelectorAll('.menu-check:checked')).map(c => c.value);
    
    // Coleta Relatórios marcados
    const relatorios = Array.from(document.querySelectorAll('.perm-check:checked')).map(c => c.value);

    try {
        if (id) {
            // EDIÇÃO (PUT)
            await window.callApi(`/usuarios/${id}`, 'PUT', { nome, email, senha, perfil, menus, relatorios });
            window.showToast('Usuário atualizado!', 'success');
            window.resetUserForm();
        } else {
            // CRIAÇÃO (POST)
            // 1. Cria o usuário
            await window.callApi('/auth/register', 'POST', { nome, email, password: senha });
            
            // 2. Busca para pegar o ID e atualizar as permissões
            const users = await window.callApi('/usuarios');
            const newUser = users.find(u => u.email === email);
            
            if(newUser) {
                await window.callApi(`/usuarios/${newUser.id}`, 'PUT', { nome, email, perfil, menus, relatorios });
            }
            window.showToast('Usuário criado com permissões!', 'success');
            document.getElementById('form-usuario').reset();
        }
        
        window.loadUsers(); // Recarrega a tabela
    } catch (err) {
        window.showToast(err.message, 'error');
    }
};

window.deleteUser = async function(id) {
    if(!confirm('Tem certeza?')) return;
    try {
        await window.callApi(`/usuarios/${id}`, 'DELETE');
        window.showToast('Usuário removido.', 'success');
        window.loadUsers();
    } catch (err) {
        window.showToast(err.message, 'error');
    }
};