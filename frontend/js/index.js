// js/index.js

// --- URL BASE DA API ---
const API_BASE_URL = 'http://192.168.3.67:3000'; 
const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY';

// --- ESTADO GLOBAL ---
window.currentReportType = 'ano-mes';
window.currentView = 'inicio';
window.activeCharts = {}; 
window.fullReportsData = {};

// --- UTILITÁRIOS DA API (Global) ---
window.callApi = async function(endpoint, method = 'GET', body = null) {
    const options = {
        method: method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) options.body = JSON.stringify(body);

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        if (!response.ok) {
            // Tenta ler o erro como JSON, se falhar, lê como texto
            let errorMsg = `Erro da API: ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.message || errorMsg;
            } catch (e) {
                // Se não for JSON (ex: 404 HTML), usa o status text
            }
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
        else if (['empresas', 'estabelecimentos', 'tiposfolha'].includes(cadastroType)) window.loadGenericCadastro(cadastroType);
    }
};

// --- LÓGICA DE CADASTROS SIMPLES ---
// Ajuste as chaves aqui se o nome da rota for diferente (ex: 'tipos_folha' vs 'tiposfolha')
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
        // Verifica se a rota 'tiposfolha' deve ser ajustada
        let route = type;
        // Exemplo: se sua API usa 'tipos_folha' em vez de 'tiposfolha', descomente abaixo:
        // if (type === 'tiposfolha') route = 'tipos_folha'; 

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
            // Tenta encontrar a propriedade correta para exibir
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
    document.getElementById('encargos-rat-ajustado').textContent = '0.0000%';
    
    // Carregar histórico
    const tbody = document.getElementById('encargos-history-tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';
    
    try {
        const encodedId = encodeURIComponent(idEstabelecimento);
        const history = await window.callApi(`/cadastro/estabelecimentos/${encodedId}/historico`);
        
        if (!history || history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-400 italic">Nenhum histórico cadastrado.</td></tr>';
        } else {
            let html = '';
            history.forEach(item => {
                const rat = parseFloat(item.rat);
                const fap = parseFloat(item.fap);
                const terceiros = parseFloat(item.aliq_terceiros);
                const patronal = parseFloat(item.aliq_patronal);
                const ajustado = rat * fap;
                const total = patronal + terceiros + ajustado;
                
                let dataFormatada = item.competencia_inicio;
                // ... formatação de data se necessário ...
                
                html += `
                    <tr class="hover:bg-blue-50 transition border-b last:border-0">
                        <td class="px-4 py-3 font-bold text-blue-700">${dataFormatada}</td>
                        <td class="px-4 py-3 text-center text-gray-600 text-xs">${rat.toFixed(2)}% x ${fap.toFixed(4)}</td>
                        <td class="px-4 py-3 text-center font-bold text-gray-800 bg-gray-50">${ajustado.toFixed(4)}%</td>
                        <td class="px-4 py-3 text-center text-gray-600 text-xs">${terceiros.toFixed(2)}%</td>
                        <td class="px-4 py-3 text-center font-bold text-green-600">${total.toFixed(2)}%</td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        }
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-500 text-xs">Erro: ${error.message}</td></tr>`;
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
             const lotacoesBadges = (cc.lotacoes && cc.lotacoes.length > 0) ? cc.lotacoes.map(l => `<span class="bg-blue-100 text-blue-800 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded">${l}</span>`).join('') : '<span class="text-gray-400 text-xs italic">Nenhuma lotação associada</span>';
             ccHTML += `<div class="bg-white rounded-xl shadow p-4 border border-gray-200"><h3 class="text-lg font-bold text-gray-800 mb-2">${cc.nome}</h3><div class="flex flex-wrap gap-2 mt-1">${lotacoesBadges}</div></div>`;
        });
        ccHTML += '</div>';
        container.innerHTML = ccHTML;
    } catch (err) { window.showToast(err.message, 'error'); } finally { window.hideLoader(container); }
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
    window.showLoader(tbody.parentElement); // Mostra loader na tabela

    try {
        const data = await window.callApi(`/lancamentos/encargos?mes=${mes}&ano=${ano}`);
        renderLancamentosTbody(data);
    } catch (err) {
        window.showToast(err.message, 'error');
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-red-500 py-4">${err.message}</td></tr>`;
    } finally {
        window.hideLoader(tbody.parentElement);
    }
}

function renderLancamentosTbody(data) {
    const tbody = document.getElementById('tbody-lancamentos');
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-gray-500 py-4">Nenhuma empresa encontrada para este Mês/Ano.</td></tr>`;
        return;
    }

    let html = '';
    data.forEach(item => {
        html += `
            <tr class="hover:bg-gray-50" data-id-empresa="${item.id_empresa}" data-nome-empresa="${item.nome_empresa}">
                <td class="px-6 py-4 text-sm font-medium text-gray-800">${item.nome_empresa}</td>
                <td class="px-6 py-4">
                    <input type="number" step="0.01" class="lancamento-compensacao w-full text-right border-gray-300 rounded-md shadow-sm" value="${item.compensacao.toFixed(2)}">
                </td>
                <td class="px-6 py-4">
                    <input type="number" step="0.01" class="lancamento-recolhimento w-full text-right border-gray-300 rounded-md shadow-sm" value="${item.recolhimento.toFixed(2)}">
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

window.saveLancamentos = async function(event) {
    event.preventDefault(); // Impede o form de recarregar a página
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
                compensacao: parseFloat(row.querySelector('.lancamento-compensacao').value) || 0,
                recolhimento: parseFloat(row.querySelector('.lancamento-recolhimento').value) || 0,
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

    // --- INÍCIO DA CORREÇÃO ---
    // Adicione este bloco

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
    
    // --- FIM DA CORREÇÃO ---
});