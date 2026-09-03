// js/index.js


// --- VERIFICAÇÃO DE LOGIN (NOVO) ---
// Verifica se existe um token salvo. Se não existir e não estiver na tela de login/reset, redireciona.
const token = localStorage.getItem('token');
if (!token && !window.location.href.includes('login.html') && !window.location.href.includes('reset-password.html')) {
    window.location.href = 'login.html';
}

// --- URL BASE DA API ---
// Certifique-se de que este IP está correto para o seu servidor
const API_BASE_URL = 'http://localhost:8010';

// --- ESTADO GLOBAL ---
window.currentReportType = 'ano-mes';
window.currentView = 'inicio';
window.activeCharts = {}; 
window.fullReportsData = {};

// --- UTILITÁRIOS DA API (Global) ---
// Limiar (ms) a partir do qual avisamos no console/toast que uma chamada está lenta.
// Ajuda a perceber, direto no navegador, quando um filtro está gerando uma consulta pesada.
const SLOW_API_CALL_MS = 3000;

window.callApi = async function(endpoint, method = 'GET', body = null) {
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}` // <--- O SEGREDO ESTÁ AQUI
        },
    };
    if (body) options.body = JSON.stringify(body);

    const startTime = performance.now();
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        const durationMs = performance.now() - startTime;
        if (durationMs >= SLOW_API_CALL_MS) {
            console.warn(`[API] ${endpoint} demorou ${(durationMs / 1000).toFixed(1)}s`);
            if (typeof window.showToast === 'function') {
                window.showToast(`Consulta demorou ${(durationMs / 1000).toFixed(1)}s — considere filtrar por um período menor.`, 'info');
            }
        } else if (window.DEBUG_API === true) {
            console.log(`[API] ${endpoint} - ${durationMs.toFixed(0)}ms`);
        }

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

// --- CONTROLE DE ACESSO POR MENU (Global) ---
// Lê o usuário salvo no login (localStorage) e confere se ele tem permissão
// para o menu/relatório antes de exibir a tela. Isso é usado tanto para
// esconder links no menu quanto como trava de segurança em switchView/showReport
// (caso alguém tente navegar por um link antigo, atalho de teclado, etc.).
window.getCurrentUser = function() {
    try {
        return JSON.parse(localStorage.getItem('user') || '{}');
    } catch (e) {
        return {};
    }
};

window.isAdminUser = function() {
    const u = window.getCurrentUser();
    return u.is_admin === 1 || u.is_admin === true;
};

window.hasMenuAccess = function(menuKey) {
    if (window.isAdminUser()) return true;
    const u = window.getCurrentUser();
    const menus = (u.menus_permitidos || '').split(',').map(s => s.trim()).filter(Boolean);
    return menus.includes(menuKey);
};

window.hasReportAccess = function(reportType) {
    if (window.isAdminUser()) return true;
    const u = window.getCurrentUser();
    const reports = (u.relatorios_permitidos || '').split(',').map(s => s.trim()).filter(Boolean);
    return reports.includes(reportType);
};

// Mapa: viewId -> menu necessário para acessá-la. Views ausentes daqui
// (ex.: "inicio") são liberadas para qualquer usuário autenticado.
const VIEW_MENU_MAP = {
    'cadastros': 'cadastros',
    'cadastros-empresas': 'cadastros',
    'cadastros-estabelecimentos': 'cadastros',
    'cadastros-lotacoes': 'cadastros',
    'cadastros-tiposfolha': 'cadastros',
    'cadastros-cc': 'cadastros',
    'cadastros-encargos': 'cadastros',
    'cadastros-gestores': 'cadastros',
    'relatorios': 'relatorios',
    'lancamentos': 'lancamentos',
    'movimentacoes-setor': 'movimentacoes-setor'
};

// Lista de todos os tipos de relatório existentes no menu "Relatórios" (mesmos
// valores usados em data-report-type no HTML), na ordem em que aparecem no menu.
const ALL_REPORT_TYPES = [
    'custo-folha', 'extrato', 'ano-mes', 'empresa', 'centro-custo', 'lotacao', 'tipo-folha',
    'evento-analitico', 'valores', 'comparativo-periodos', 'lotacao-colaborador-eventos',
    'cc-lotacao-colaborador', 'folha-vs-colaboradores', 'colaboradores-por-setor', 'impacto-headcount'
];

window.hasViewAccess = function(viewId) {
    // "Usuários" é sempre restrito a administradores, independente do menu "cadastros".
    if (viewId === 'cadastros-usuarios') return window.isAdminUser();
    const requiredMenu = VIEW_MENU_MAP[viewId];
    if (!requiredMenu) return true;
    return window.hasMenuAccess(requiredMenu);
};

// Mostra a tela de "Acesso Bloqueado" no lugar da view pedida.
window.showAccessBlocked = function(message) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    const blockedView = document.getElementById('acesso-bloqueado-view');
    const messageEl = document.getElementById('acesso-bloqueado-message');
    if (messageEl) {
        messageEl.textContent = message || 'Você não tem permissão para acessar esta área do sistema. Fale com um administrador se precisar desse acesso.';
    }
    if (blockedView) blockedView.classList.add('active');

    window.currentView = 'acesso-bloqueado';
};

// Esconde do menu tudo que o usuário logado não tem permissão de acessar,
// para ele nem ver links em que vai bater em "Acesso Bloqueado".
window.applyMenuPermissionsToNav = function() {
    const isAdmin = window.isAdminUser();

    // Itens do menu principal controlados por menus_permitidos
    document.querySelectorAll('.nav-link[data-view]').forEach(link => {
        const viewId = link.dataset.view;
        if (viewId === 'inicio') return; // sempre visível
        const li = link.closest('li');
        if (!li) return;
        if (!window.hasViewAccess(viewId)) {
            li.style.display = 'none';
        }
    });

    // Itens do submenu "Relatórios" controlados por relatorios_permitidos
    if (!isAdmin) {
        document.querySelectorAll('.report-link[data-report-type]').forEach(link => {
            const reportType = link.dataset.reportType;
            if (!window.hasReportAccess(reportType)) {
                const li = link.closest('li');
                if (li) li.style.display = 'none';
            }
        });
    }
};

// --- NAVEGAÇÃO (Global) ---
window.switchView = function(viewId) {
    console.log("Trocando para view:", viewId);

    // Trava de segurança: se o usuário não tem permissão para esta view,
    // mostra a tela de acesso bloqueado em vez de carregar o conteúdo.
    if (!window.hasViewAccess(viewId)) {
        window.showAccessBlocked();
        if (window.showToast) window.showToast('Acesso negado: você não tem permissão para esta área.', 'error');
        return;
    }

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
        // Se o relatório padrão atual não é permitido para este usuário, troca
        // para o primeiro relatório ao qual ele realmente tem acesso.
        let reportToShow = window.currentReportType;
        if (!window.hasReportAccess(reportToShow)) {
            reportToShow = ALL_REPORT_TYPES.find(rt => window.hasReportAccess(rt)) || null;
        }
        if (window.showReport) {
            if (reportToShow) {
                window.showReport(reportToShow);
            } else {
                window.showAccessBlocked('Você ainda não tem acesso a nenhum relatório. Fale com um administrador.');
            }
        }
    } else if (viewId.startsWith('cadastros-')) {
        const cadastroType = viewId.split('-')[1];
        if (cadastroType === 'cc') window.loadCCData();
        else if (cadastroType === 'lotacoes') window.loadLotacoesStatus();
        else if (cadastroType === 'usuarios') window.loadUsers(); // <--- ADICIONE ISSO
        else if (cadastroType === 'gestores') window.loadGestoresCadastro();
        else if (cadastroType === 'encargos') { if (window.loadEncargosConfig) window.loadEncargosConfig(); }
        else if (['empresas', 'estabelecimentos', 'tiposfolha'].includes(cadastroType)) window.loadGenericCadastro(cadastroType);
    } else if (viewId === 'movimentacoes-setor') {
        if (window.loadMovimentacoesSetor) window.loadMovimentacoesSetor();
    }

    // Atualiza a URL com o menu aberto (os relatórios são tratados no showReport,
    // que sabe qual relatório específico está sendo exibido).
    if (viewId !== 'relatorios' && window.setRouteHash) {
        window.setRouteHash(window.hashDaView(viewId));
    }
};

// --- ROTEAMENTO POR HASH (a URL reflete o menu aberto) ---
// Ex.: #/inicio, #/cadastros, #/cadastros/lotacoes, #/relatorios/custo-folha,
// #/lancamentos, #/movimentacoes-setor. Usamos hash (#) porque funciona sem
// nenhuma mudança no servidor e sobrevive ao F5 (o hash não é enviado ao
// servidor; o index.html carrega e o JS restaura a tela pela URL).
window._hashInterno = false;

// Escreve o hash marcando que a mudança veio da própria navegação, para o
// listener de 'hashchange' não re-navegar (evita loop e recarga dupla).
window.setRouteHash = function(hash) {
    if (!hash || location.hash === hash) return;
    window._hashInterno = true;
    location.hash = hash;
};

// Converte um viewId em hash.
window.hashDaView = function(viewId) {
    if (!viewId || viewId === 'inicio') return '#/inicio';
    if (viewId === 'cadastros') return '#/cadastros';
    if (viewId.indexOf('cadastros-') === 0) return '#/cadastros/' + viewId.slice('cadastros-'.length);
    if (viewId === 'relatorios') return '#/relatorios';
    return '#/' + viewId;
};

// Lê a URL atual e navega para a tela correspondente (usado no carregamento e
// quando o usuário usa voltar/avançar do navegador ou digita/cola a URL).
window.applyHashRoute = function() {
    const bruto = (location.hash || '').replace(/^#\/?/, ''); // ex.: "relatorios/custo-folha"
    const partes = bruto.split('/').filter(Boolean);
    if (partes.length === 0) { window.switchView('inicio'); return; }
    const seg = partes[0];
    if (seg === 'relatorios') {
        // Define o relatório antes de abrir a tela para já mostrar o certo.
        if (partes[1]) window.currentReportType = partes[1];
        window.switchView('relatorios');
    } else if (seg === 'cadastros') {
        window.switchView(partes[1] ? 'cadastros-' + partes[1] : 'cadastros');
    } else {
        window.switchView(seg); // inicio, lancamentos, movimentacoes-setor
    }
};

// --- CADASTRO DE ENCARGOS (% sobre a massa salarial) ---
window.loadEncargosConfig = async function() {
    const input = document.getElementById('encargos-percentual');
    if (!input) return;
    try {
        const cfg = await window.callApi('/config/encargos', 'GET');
        input.value = (cfg && cfg.percentual != null) ? cfg.percentual : '';
    } catch (err) {
        if (window.showToast) window.showToast('Erro ao carregar encargos: ' + err.message, 'error');
    }
};

window.saveEncargosConfig = async function() {
    const input = document.getElementById('encargos-percentual');
    if (!input) return;
    const percentual = parseFloat(input.value);
    if (isNaN(percentual) || percentual < 0 || percentual > 1000) {
        if (window.showToast) window.showToast('Informe um percentual válido (0 a 1000).', 'error');
        return;
    }
    try {
        await window.callApi('/config/encargos', 'PUT', { percentual });
        if (window.showToast) window.showToast('Percentual de encargos salvo!', 'success');
    } catch (err) {
        if (window.showToast) window.showToast('Erro ao salvar: ' + err.message, 'error');
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

// Estado da lista de lotações (dados completos + busca + página atual).
// Guardado fora da função pra não precisar rebuscar na API a cada digitação
// na busca ou clique de "Próxima/Anterior" - só o /lotacoes/status inicial
// (já cacheado no backend) bate no banco; paginação e busca são só em memória.
let lotacoesState = { data: [], page: 1, pageSize: 25, searchTerm: '' };

// Diretório de gestores já cadastrados (Cadastros > Gestores), usado pra
// montar o <select> de "escolher gestor" de cada lotação abaixo - a tela de
// lotações não aceita mais digitar nome/e-mail direto, só selecionar um
// gestor que já existe no cadastro (ver window.loadGestoresCadastro).
// Carregado uma vez junto com a lista de lotações.
let gestoresDiretorio = [];

window.loadLotacoesStatus = async function() {
    const container = document.getElementById('cadastros-lotacoes-view');
    window.showLoader(container);
    try {
        const [data] = await Promise.all([
            window.callApi('/lotacoes/status'),
            window.callApi('/gestores').then((lista) => { gestoresDiretorio = lista || []; }).catch(() => { gestoresDiretorio = []; })
        ]);
        data.sort((a, b) => a.nome.localeCompare(b.nome));

        // Pré-calcula o texto de busca (nome + empresa + estabelecimento + CC)
        // de cada item uma única vez, em vez de recalcular a cada tecla digitada.
        data.forEach((item) => {
            item._searchText = [item.nome, item.empresa, item.estabelecimento, item.centroCusto]
                .filter(Boolean).join(' ').toLowerCase();
        });

        lotacoesState = { data, page: 1, pageSize: 25, searchTerm: '' };

        container.innerHTML = `
            <div class="bg-white rounded-xl shadow-lg p-6 md:p-8">
                <div class="flex flex-wrap justify-between items-center gap-3 mb-4">
                    <h2 class="text-2xl font-bold text-gray-700">Estado das Lotações</h2>
                    <div class="relative">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                        <input type="text" id="lotacoes-search-input" placeholder="Buscar lotação, empresa, CC..." class="border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm w-72" oninput="window.filterLotacoesList(this.value)">
                    </div>
                </div>
                ${gestoresDiretorio.length === 0 ? `<p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">Nenhum gestor cadastrado ainda - cadastre em <strong>Cadastros &gt; Gestores</strong> antes de vincular um gestor às lotações abaixo.</p>` : ''}
                <ul id="lotacoes-list" class="divide-y divide-gray-200"></ul>
                <div id="lotacoes-pagination" class="flex flex-wrap items-center justify-between gap-2 mt-4 pt-4 border-t border-gray-200"></div>
            </div>`;

        window.renderLotacoesPage();
    } catch (err) { window.showToast(err.message, 'error'); } finally { window.hideLoader(container); }
};

// Aplica a busca (sobre lotacoesState.data) e devolve só os itens que batem.
function getFilteredLotacoes() {
    const termo = (lotacoesState.searchTerm || '').trim().toLowerCase();
    if (!termo) return lotacoesState.data;
    return lotacoesState.data.filter((item) => item._searchText.includes(termo));
}

// Renderiza só a página atual (25 itens por vez) da lista já filtrada, em vez
// de jogar tudo no DOM de uma vez - isso é o que efetivamente melhora o
// desempenho de renderização quando a lista tem muitos itens.
window.renderLotacoesPage = function() {
    const list = document.getElementById('lotacoes-list');
    const paginationEl = document.getElementById('lotacoes-pagination');
    if (!list) return;

    const filtered = getFilteredLotacoes();
    const totalPaginas = Math.max(1, Math.ceil(filtered.length / lotacoesState.pageSize));
    if (lotacoesState.page > totalPaginas) lotacoesState.page = totalPaginas;
    if (lotacoesState.page < 1) lotacoesState.page = 1;

    const inicio = (lotacoesState.page - 1) * lotacoesState.pageSize;
    const pageItems = filtered.slice(inicio, inicio + lotacoesState.pageSize);

    if (pageItems.length === 0) {
        list.innerHTML = `<li class="py-8 text-center text-gray-500">Nenhuma lotação encontrada.</li>`;
    } else {
        list.innerHTML = pageItems.map((item) => {
            const color = item.isAssociated ? '#51cd73' : '#eddf43';
            const ccInfo = item.centroCusto ? `<span class="text-xs font-bold text-gray-500 ml-2">CC: ${item.centroCusto}</span>` : '';
            const nomeAttr = (item.nome || '').replace(/"/g, '&quot;');
            const gestoresVinculados = item.gestores || [];

            // Um "chip" por gestor já vinculado a esta lotação, cada um com um
            // "x" pra remover só aquele vínculo (window.removerGestorDaLotacao)
            // - não mexe nos outros gestores da mesma lotação.
            const chips = gestoresVinculados.map((g) => {
                const rotuloChip = (g.nome || g.email).replace(/"/g, '&quot;');
                return `<span class="inline-flex items-center gap-1 bg-sky-50 text-sky-800 text-xs font-medium pl-2 pr-1 py-1 rounded-full border border-sky-200">
                    ${rotuloChip}
                    <button type="button" class="text-sky-500 hover:text-red-600" onclick="window.removerGestorDaLotacao(this, ${g.id})" title="Remover este gestor da lotação"><i class="fas fa-times"></i></button>
                </span>`;
            }).join('');

            // Dropdown com os gestores já cadastrados (Cadastros > Gestores)
            // que AINDA não estão vinculados a esta lotação - escolher um e
            // clicar "Adicionar" vincula mais um gestor à mesma lotação (uma
            // lotação pode ter vários). Não existe mais campo de texto livre
            // aqui de propósito, pra evitar e-mail digitado errado ou
            // divergente do que já está no cadastro central de gestores.
            const idsVinculados = new Set(gestoresVinculados.map((g) => String(g.id)));
            const opcoesGestor = gestoresDiretorio
                .filter((g) => !idsVinculados.has(String(g.id)))
                .map((g) => {
                    const rotulo = g.nome ? `${g.nome} (${g.email})` : g.email;
                    return `<option value="${g.id}">${rotulo}</option>`;
                }).join('');

            return `<li class="py-3 flex flex-wrap items-center gap-3" data-nome-lotacao="${nomeAttr}">
                <span class="h-3 w-3 rounded-full flex-shrink-0" style="background-color: ${color};"></span>
                <div class="flex flex-col flex-1 min-w-[200px]">
                    <span class="text-gray-800 font-medium">${item.nome}</span>
                    <span class="text-xs text-gray-500">${item.empresa} - ${item.estabelecimento} ${ccInfo}</span>
                    <div class="flex flex-wrap gap-1 mt-1">${chips || '<span class="text-xs text-gray-400 italic">Sem gestor vinculado</span>'}</div>
                </div>
                <div class="flex items-center gap-2 flex-wrap">
                    <select class="gestor-select border border-gray-300 rounded px-2 py-1 text-sm w-64">
                        <option value="">Adicionar gestor...</option>
                        ${opcoesGestor}
                    </select>
                    <button type="button" class="text-blue-600 hover:underline text-xs font-bold" onclick="window.saveLotacaoGestorEmail(this)">Adicionar</button>
                </div>
            </li>`;
        }).join('');
    }

    if (paginationEl) {
        const inicioExibido = filtered.length === 0 ? 0 : inicio + 1;
        const fimExibido = Math.min(inicio + lotacoesState.pageSize, filtered.length);
        paginationEl.innerHTML = `
            <span class="text-xs text-gray-500">Mostrando ${inicioExibido}-${fimExibido} de ${filtered.length}</span>
            <div class="flex items-center gap-2">
                <button type="button" onclick="window.mudarPaginaLotacoes(-1)" ${lotacoesState.page <= 1 ? 'disabled' : ''} class="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50">Anterior</button>
                <span class="text-xs text-gray-500">Página ${lotacoesState.page} de ${totalPaginas}</span>
                <button type="button" onclick="window.mudarPaginaLotacoes(1)" ${lotacoesState.page >= totalPaginas ? 'disabled' : ''} class="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50">Próxima</button>
            </div>`;
    }
};

window.mudarPaginaLotacoes = function(delta) {
    lotacoesState.page += delta;
    window.renderLotacoesPage();
};

// Filtra a lista de lotações já carregada, sem precisar chamar a API de novo.
// Usa a função debounce global definida em filters.js. Toda busca nova volta
// para a página 1 (senão a página atual pode não existir mais no resultado filtrado).
const debouncedFilterLotacoes = (typeof debounce === 'function')
    ? debounce((term) => { lotacoesState.searchTerm = term; lotacoesState.page = 1; window.renderLotacoesPage(); }, 150)
    : (term) => { lotacoesState.searchTerm = term; lotacoesState.page = 1; window.renderLotacoesPage(); };

window.filterLotacoesList = function(term) {
    debouncedFilterLotacoes(term);
};

// Adiciona o gestor escolhido no <select> aos gestores já vinculados a uma
// lotação (usado pelo botão "Adicionar" na lista acima) - uma lotação pode
// ter vários gestores, então isso NÃO substitui os que já estavam lá. O nome
// da lotação vem do atributo data-nome-lotacao do <li> pai, em vez de um id
// no elemento, porque nome_lotacao pode ter espaços/caracteres não seguros
// pra usar direto como id de elemento HTML.
window.saveLotacaoGestorEmail = async function(buttonEl) {
    const li = buttonEl.closest('li');
    const nomeLotacao = li.dataset.nomeLotacao;
    const select = li.querySelector('.gestor-select');
    const idGestor = select ? select.value : '';

    if (!idGestor) {
        window.showToast('Escolha um gestor antes de adicionar.', 'error');
        return;
    }

    try {
        await window.callApi('/lotacoes/gestores', 'PUT', { nome_lotacao: nomeLotacao, id_gestor: idGestor });
        window.showToast('Gestor vinculado com sucesso!', 'success');
        // Atualiza o item em memória e re-renderiza só essa linha, pra já
        // mostrar o chip do gestor adicionado sem precisar recarregar a tela toda.
        const gestor = gestoresDiretorio.find((g) => String(g.id) === String(idGestor));
        const item = lotacoesState.data.find((i) => i.nome === nomeLotacao);
        if (item && gestor) {
            item.gestores = item.gestores || [];
            if (!item.gestores.some((g) => String(g.id) === String(gestor.id))) {
                item.gestores.push({ id: gestor.id, nome: gestor.nome, email: gestor.email });
            }
        }
        window.renderLotacoesPage();
    } catch (err) {
        window.showToast(err.message, 'error');
    }
};

// Remove um gestor específico de uma lotação (botão "x" de cada chip) - não
// exclui o gestor do diretório (Cadastros > Gestores), nem afeta os outros
// gestores vinculados à mesma lotação.
window.removerGestorDaLotacao = async function(buttonEl, idGestor) {
    const li = buttonEl.closest('li');
    const nomeLotacao = li.dataset.nomeLotacao;

    if (!confirm('Remover este gestor desta lotação?')) return;

    try {
        await window.callApi('/lotacoes/gestores', 'DELETE', { nome_lotacao: nomeLotacao, id_gestor: idGestor });
        window.showToast('Gestor removido da lotação.', 'success');
        const item = lotacoesState.data.find((i) => i.nome === nomeLotacao);
        if (item && item.gestores) {
            item.gestores = item.gestores.filter((g) => String(g.id) !== String(idGestor));
        }
        window.renderLotacoesPage();
    } catch (err) {
        window.showToast(err.message, 'error');
    }
};

// =============================================================
// --- CADASTROS > GESTORES (diretório central de nome + e-mail) ---
// CRUD simples: cadastra o gestor aqui uma vez e depois só ESCOLHE ele no
// dropdown de cada lotação em Cadastros > Lotações (ver
// window.loadLotacoesStatus acima) - evita redigitar/errar o e-mail em cada
// lotação que a mesma pessoa administra.
// =============================================================

window.gestoresCadastroState = { data: [] };

window.loadGestoresCadastro = async function() {
    const container = document.getElementById('cadastros-gestores-view');
    if (!container) return;
    window.showLoader(container);
    try {
        const data = await window.callApi('/gestores');
        window.gestoresCadastroState = { data };

        container.innerHTML = `
            <div class="bg-white rounded-xl shadow-lg p-6 md:p-8 mb-6">
                <h2 id="gestor-form-title" class="text-xl font-bold text-gray-700 mb-4">Novo Gestor</h2>
                <form id="form-gestor" class="flex flex-wrap items-end gap-3" onsubmit="window.saveGestor(event)">
                    <input type="hidden" id="gestor-id" value="">
                    <div class="flex flex-col">
                        <label class="text-xs text-gray-500 mb-1">Nome</label>
                        <input type="text" id="gestor-nome" required class="border border-gray-300 rounded px-3 py-2 text-sm w-56">
                    </div>
                    <div class="flex flex-col">
                        <label class="text-xs text-gray-500 mb-1">E-mail</label>
                        <input type="email" id="gestor-email" required class="border border-gray-300 rounded px-3 py-2 text-sm w-64">
                    </div>
                    <button type="submit" id="btn-save-gestor" class="bg-green-600 text-white font-bold px-4 py-2 rounded hover:bg-green-700 text-sm"><i class="fas fa-plus mr-1"></i> Adicionar</button>
                    <button type="button" id="btn-cancel-gestor" class="hidden text-gray-500 text-sm hover:underline" onclick="window.resetGestorForm()">Cancelar edição</button>
                </form>
            </div>
            <div class="bg-white rounded-xl shadow-lg p-6 md:p-8">
                <h2 class="text-2xl font-bold text-gray-700 mb-4">Gestores Cadastrados</h2>
                <ul id="gestores-list" class="divide-y divide-gray-200"></ul>
            </div>`;

        window.renderGestoresList();
    } catch (err) {
        window.showToast(err.message, 'error');
    } finally {
        window.hideLoader(container);
    }
};

window.renderGestoresList = function() {
    const list = document.getElementById('gestores-list');
    if (!list) return;
    const data = window.gestoresCadastroState.data || [];

    if (data.length === 0) {
        list.innerHTML = '<li class="py-8 text-center text-gray-500">Nenhum gestor cadastrado ainda.</li>';
        return;
    }

    list.innerHTML = data.map((g) => {
        const gestorObj = JSON.stringify(g).replace(/"/g, '&quot;');
        return `<li class="py-3 flex flex-wrap items-center justify-between gap-3">
            <div class="flex flex-col">
                <span class="text-gray-800 font-medium">${g.nome || '(sem nome)'}</span>
                <span class="text-xs text-gray-500">${g.email}</span>
            </div>
            <div class="flex items-center gap-3">
                <button type="button" class="text-blue-600 hover:text-blue-900 text-sm font-bold" onclick="window.editGestor(${gestorObj})" title="Editar"><i class="fas fa-edit"></i></button>
                <button type="button" class="text-red-600 hover:text-red-900 text-sm font-bold" onclick="window.deleteGestor(${g.id})" title="Excluir"><i class="fas fa-trash"></i></button>
            </div>
        </li>`;
    }).join('');
};

window.editGestor = function(gestor) {
    document.getElementById('gestor-id').value = gestor.id;
    document.getElementById('gestor-nome').value = gestor.nome || '';
    document.getElementById('gestor-email').value = gestor.email || '';
    document.getElementById('gestor-form-title').textContent = 'Editar Gestor';
    document.getElementById('btn-save-gestor').innerHTML = '<i class="fas fa-save mr-1"></i> Atualizar';
    document.getElementById('btn-cancel-gestor').classList.remove('hidden');
};

window.resetGestorForm = function() {
    const form = document.getElementById('form-gestor');
    if (form) form.reset();
    document.getElementById('gestor-id').value = '';
    document.getElementById('gestor-form-title').textContent = 'Novo Gestor';
    document.getElementById('btn-save-gestor').innerHTML = '<i class="fas fa-plus mr-1"></i> Adicionar';
    document.getElementById('btn-cancel-gestor').classList.add('hidden');
};

window.saveGestor = async function(e) {
    e.preventDefault();
    const id = document.getElementById('gestor-id').value;
    const nome_gestor = document.getElementById('gestor-nome').value.trim();
    const email_gestor = document.getElementById('gestor-email').value.trim();

    if (!nome_gestor || !email_gestor) {
        window.showToast('Informe o nome e o e-mail do gestor.', 'error');
        return;
    }

    try {
        if (id) {
            await window.callApi(`/gestores/${id}`, 'PUT', { nome_gestor, email_gestor });
            window.showToast('Gestor atualizado!', 'success');
        } else {
            await window.callApi('/gestores', 'POST', { nome_gestor, email_gestor });
            window.showToast('Gestor cadastrado!', 'success');
        }
        window.resetGestorForm();
        window.loadGestoresCadastro();
    } catch (err) {
        window.showToast(err.message, 'error');
    }
};

window.deleteGestor = async function(id) {
    if (!confirm('Tem certeza que deseja excluir este gestor?')) return;
    try {
        await window.callApi(`/gestores/${id}`, 'DELETE');
        window.showToast('Gestor removido.', 'success');
        window.loadGestoresCadastro();
    } catch (err) {
        window.showToast(err.message, 'error');
    }
};

// --- MOVIMENTAÇÕES DE SETOR ---
// Lista os e-mails já enviados aos gestores (resumo mensal da folha do
// setor + lista de colaboradores) e o status da resposta de cada um.
// IMPORTANTE: pendências sinalizadas aqui são só um AVISO para o
// Departamento Pessoal revisar - este sistema não altera a lotação de
// ninguém automaticamente.
//
// Estado da lista (dados completos + filtros + página atual), guardado fora
// da função pra não precisar rebuscar na API a cada filtro/clique de
// paginação - mesmo padrão já usado em lotacoesState (loadLotacoesStatus).
let movSetorState = { data: [], page: 1, pageSize: 25, filtroEmpresa: '', filtroLotacao: '', filtroGestor: '' };

window.loadMovimentacoesSetor = async function() {
    const container = document.getElementById('movimentacoes-setor-view');
    window.showLoader(container);
    try {
        const envios = await window.callApi('/movimentacoes-setor/admin/envios');

        // Sugere por padrão o mês anterior ao atual (mesmo período que o
        // disparo automático usa), já que normalmente é a folha mais recente
        // fechada quando alguém entra nessa tela.
        const hoje = new Date();
        let mesPadrao = hoje.getMonth(); // getMonth() é 0-indexado = mês anterior em base 1
        let anoPadrao = hoje.getFullYear();
        if (mesPadrao === 0) { mesPadrao = 12; anoPadrao -= 1; }

        const mesesNomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const anosOptions = [anoPadrao - 1, anoPadrao, anoPadrao + 1]
            .map((a) => `<option value="${a}" ${a === anoPadrao ? 'selected' : ''}>${a}</option>`).join('');
        const mesesOptions = mesesNomes
            .map((nome, i) => `<option value="${i + 1}" ${(i + 1) === mesPadrao ? 'selected' : ''}>${nome}</option>`).join('');

        movSetorState = { data: envios || [], page: 1, pageSize: 25, filtroEmpresa: '', filtroLotacao: '', filtroGestor: '' };

        // Opções dos filtros - só os valores que realmente aparecem nos envios
        // carregados. Um envio agora pode cobrir várias lotações/empresas
        // (consolidado por gestor), então usa e.lotacoes/e.empresas (arrays)
        // em vez do texto já unido, senão "Lotação A, Lotação B" viraria uma
        // única opção estranha no lugar de duas selecionáveis.
        const empresasOpts = [...new Set(movSetorState.data.flatMap((e) => e.empresas || []).filter(Boolean))].sort();
        const lotacoesOpts = [...new Set(movSetorState.data.flatMap((e) => e.lotacoes || []).filter(Boolean))].sort();
        const gestoresOpts = [...new Set(movSetorState.data.map((e) => e.emailGestor).filter(Boolean))].sort();
        const escapar = (v) => String(v).replace(/"/g, '&quot;');

        let html = `
            <div class="bg-white rounded-xl shadow-lg p-6 md:p-8 mb-6">
                <div class="flex flex-wrap justify-between items-center gap-4">
                    <div>
                        <h2 class="text-2xl font-bold text-gray-700">Movimentações de Setor</h2>
                        <p class="text-gray-500 text-sm max-w-2xl">E-mails enviados aos gestores com o resumo da folha e a lista de colaboradores do setor. Pendências sinalizadas pelos gestores são só um aviso - a correção da lotação é feita pelo Departamento Pessoal por fora, este sistema não altera nada automaticamente.</p>
                    </div>
                    <div class="flex items-end gap-2">
                        <div>
                            <label class="block text-xs font-bold text-gray-500 mb-1">Mês</label>
                            <select id="movsetor-mes" class="border border-gray-300 rounded px-2 py-1 text-sm">${mesesOptions}</select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 mb-1">Ano</label>
                            <select id="movsetor-ano" class="border border-gray-300 rounded px-2 py-1 text-sm">${anosOptions}</select>
                        </div>
                        <button type="button" onclick="window.enviarMovimentacoesDoMes()" class="bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2 rounded text-sm whitespace-nowrap">
                            <i class="fas fa-paper-plane mr-1"></i> Enviar e-mails do mês
                        </button>
                    </div>
                </div>
            </div>
            <div class="bg-white rounded-xl shadow-lg p-6 md:p-8">`;

        if (!envios || envios.length === 0) {
            html += `<p class="text-center text-gray-500 py-8">Nenhum envio ainda. Cadastre o e-mail do gestor em Cadastros &gt; Lotações e clique em "Enviar e-mails do mês".</p>`;
        } else {
            html += `
                <div class="flex flex-wrap items-end gap-3 mb-4 pb-4 border-b border-gray-200">
                    <div>
                        <label class="block text-xs font-bold text-gray-500 mb-1">Empresa</label>
                        <select id="movsetor-filtro-empresa" onchange="window.filtrarMovSetor()" class="border border-gray-300 rounded px-2 py-1 text-sm min-w-[160px]">
                            <option value="">Todas</option>
                            ${empresasOpts.map((v) => `<option value="${escapar(v)}">${v}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 mb-1">Lotação</label>
                        <select id="movsetor-filtro-lotacao" onchange="window.filtrarMovSetor()" class="border border-gray-300 rounded px-2 py-1 text-sm min-w-[160px]">
                            <option value="">Todas</option>
                            ${lotacoesOpts.map((v) => `<option value="${escapar(v)}">${v}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 mb-1">E-mail do Gestor</label>
                        <select id="movsetor-filtro-gestor" onchange="window.filtrarMovSetor()" class="border border-gray-300 rounded px-2 py-1 text-sm min-w-[160px]">
                            <option value="">Todos</option>
                            ${gestoresOpts.map((v) => `<option value="${escapar(v)}">${v}</option>`).join('')}
                        </select>
                    </div>
                    <button type="button" onclick="window.limparFiltrosMovSetor()" class="text-xs text-gray-500 hover:underline mb-1">Limpar filtros</button>
                </div>
                <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase">Lotações</th>
                        <th class="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase">Empresas</th>
                        <th class="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase">Competência</th>
                        <th class="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase">Gestor</th>
                        <th class="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase">Enviado em</th>
                        <th class="px-4 py-2 text-center text-xs font-bold text-gray-500 uppercase">Colaboradores</th>
                        <th class="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                        <th class="px-4 py-2 text-right text-xs font-bold text-gray-500 uppercase">Ações</th>
                    </tr>
                </thead>
                <tbody id="movsetor-tbody" class="divide-y divide-gray-100"></tbody>
            </table>
            <div id="movsetor-pagination" class="flex flex-wrap items-center justify-between gap-2 mt-4 pt-4 border-t border-gray-200"></div>`;
        }

        html += `</div>`;
        container.innerHTML = html;

        if (envios && envios.length > 0) window.renderMovSetorPage();
    } catch (err) {
        window.showToast(err.message, 'error');
    } finally {
        window.hideLoader(container);
    }
};

// Aplica os filtros (empresa/lotação/e-mail do gestor) sobre movSetorState.data.
// Empresa/lotação usam .includes() nos arrays (não igualdade direta) porque
// um envio consolidado pode cobrir várias lotações/empresas do mesmo gestor.
function getFilteredMovSetor() {
    return movSetorState.data.filter((e) => {
        if (movSetorState.filtroEmpresa && !(e.empresas || []).includes(movSetorState.filtroEmpresa)) return false;
        if (movSetorState.filtroLotacao && !(e.lotacoes || []).includes(movSetorState.filtroLotacao)) return false;
        if (movSetorState.filtroGestor && e.emailGestor !== movSetorState.filtroGestor) return false;
        return true;
    });
}

// Renderiza só a página atual (25 por vez) da lista já filtrada, em vez de
// jogar tudo no DOM de uma vez - mesmo padrão de performance usado em
// Cadastros > Lotações (window.renderLotacoesPage).
window.renderMovSetorPage = function() {
    const tbody = document.getElementById('movsetor-tbody');
    const paginationEl = document.getElementById('movsetor-pagination');
    if (!tbody) return;

    const filtered = getFilteredMovSetor();
    const totalPaginas = Math.max(1, Math.ceil(filtered.length / movSetorState.pageSize));
    if (movSetorState.page > totalPaginas) movSetorState.page = totalPaginas;
    if (movSetorState.page < 1) movSetorState.page = 1;

    const inicio = (movSetorState.page - 1) * movSetorState.pageSize;
    const pageItems = filtered.slice(inicio, inicio + movSetorState.pageSize);

    if (pageItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-8 text-center text-gray-500">Nenhum envio encontrado com esses filtros.</td></tr>`;
    } else {
        let html = '';
        pageItems.forEach((e, idx) => {
            const dataEnvio = e.dataEnvio ? new Date(e.dataEnvio).toLocaleDateString('pt-BR') : '-';
            let badge = `<span class="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded-full">Aguardando resposta</span>`;
            if (e.status === 'ok') {
                badge = `<span class="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full">OK - sem pendências</span>`;
            } else if (e.status === 'pendencias') {
                badge = `<span class="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-1 rounded-full cursor-pointer" onclick="window.toggleMovSetorPendencias(${idx})">${e.pendencias.length} pendência(s) <i class="fas fa-chevron-down ml-1"></i></span>`;
            }
            if (e.bloqueado) {
                badge += ` <span class="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full ml-1"><i class="fas fa-lock mr-1"></i>Bloqueado</span>`;
            }

            // Alterna entre "Bloquear" (link ainda editável pelo gestor) e
            // "Liberar" (link travado ou já respondido, pra permitir responder/editar de novo).
            const acaoBloqueio = e.bloqueado
                ? `<button type="button" onclick="window.liberarMovimentacao(${e.id})" class="text-green-600 hover:underline text-xs font-bold mr-3" title="Liberar para edição">
                        <i class="fas fa-unlock"></i> Liberar
                    </button>`
                : `<button type="button" onclick="window.bloquearMovimentacao(${e.id})" class="text-amber-600 hover:underline text-xs font-bold mr-3" title="Bloquear edição">
                        <i class="fas fa-lock"></i> Bloquear
                    </button>`;

            // Um envio que o gestor já respondeu (status diferente de
            // "aguardando") não pode mais ser excluído por aqui - a resposta já
            // registrada (aviso pro DP) seria perdida. O backend também recusa
            // esse caso (defesa em profundidade); aqui é só pra já não oferecer
            // o botão. Use "Bloquear" pra travar o link em vez de excluir.
            const acaoExcluir = e.status === 'aguardando'
                ? `<button type="button" onclick="window.excluirMovimentacao(${e.id})" class="text-red-600 hover:underline text-xs font-bold" title="Excluir">
                        <i class="fas fa-trash"></i> Excluir
                    </button>`
                : `<span class="text-gray-300 text-xs font-bold cursor-not-allowed" title="Já tem resposta do gestor registrada - não pode ser excluído. Use Bloquear.">
                        <i class="fas fa-trash"></i> Excluir
                    </span>`;

            html += `<tr>
                <td class="px-4 py-2 max-w-xs" title="${(e.lotacoes || []).join(', ')}">${e.nomeLotacao}</td>
                <td class="px-4 py-2 text-sm text-gray-500 max-w-xs" title="${(e.empresas || []).join(', ')}">${e.empresa || '-'}</td>
                <td class="px-4 py-2">${e.mesNome}/${e.ano}</td>
                <td class="px-4 py-2 text-sm text-gray-500">${e.emailGestor}</td>
                <td class="px-4 py-2 text-sm text-gray-500">${dataEnvio}</td>
                <td class="px-4 py-2 text-center text-sm text-gray-500">${e.totalColaboradores ?? '-'}</td>
                <td class="px-4 py-2">${badge}</td>
                <td class="px-4 py-2 text-right whitespace-nowrap">
                    <button type="button" onclick="window.reenviarMovimentacao(${e.id}, this)" class="text-sky-600 hover:underline text-xs font-bold mr-3" title="Reenviar e-mail">
                        <i class="fas fa-paper-plane"></i> Reenviar
                    </button>
                    ${acaoBloqueio}
                    ${acaoExcluir}
                </td>
            </tr>`;

            if (e.status === 'pendencias' && e.pendencias.length > 0) {
                html += `<tr id="movsetor-pendencia-${idx}" class="hidden bg-amber-50">
                    <td colspan="8" class="px-4 py-3">
                        <p class="text-xs font-bold text-amber-700 mb-2"><i class="fas fa-exclamation-triangle mr-1"></i> Aviso para o Departamento Pessoal - confira e corrija manualmente:</p>
                        <ul class="text-sm text-gray-700 space-y-1">
                            ${e.pendencias.map((p) => `<li><strong>${p.nome_funcionario}</strong>${p.cargo ? ` <span class="text-gray-500">(${p.cargo})</span>` : ''}${p.nomeLotacao ? ` <span class="text-sky-600">[${p.nomeLotacao}]</span>` : ''}${p.observacao ? ` - ${p.observacao}` : ' (gestor marcou pendência sem detalhar o motivo)'}</li>`).join('')}
                        </ul>
                    </td>
                </tr>`;
            }
        });
        tbody.innerHTML = html;
    }

    if (paginationEl) {
        const inicioExibido = filtered.length === 0 ? 0 : inicio + 1;
        const fimExibido = Math.min(inicio + movSetorState.pageSize, filtered.length);
        paginationEl.innerHTML = `
            <span class="text-xs text-gray-500">Mostrando ${inicioExibido}-${fimExibido} de ${filtered.length}</span>
            <div class="flex items-center gap-2">
                <button type="button" onclick="window.mudarPaginaMovSetor(-1)" ${movSetorState.page <= 1 ? 'disabled' : ''} class="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50">Anterior</button>
                <span class="text-xs text-gray-500">Página ${movSetorState.page} de ${totalPaginas}</span>
                <button type="button" onclick="window.mudarPaginaMovSetor(1)" ${movSetorState.page >= totalPaginas ? 'disabled' : ''} class="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50">Próxima</button>
            </div>`;
    }
};

window.mudarPaginaMovSetor = function(delta) {
    movSetorState.page += delta;
    window.renderMovSetorPage();
};

// Lê os 3 selects de filtro e re-renderiza a partir da página 1 (senão a
// página atual pode não existir mais no resultado filtrado).
window.filtrarMovSetor = function() {
    const empresaEl = document.getElementById('movsetor-filtro-empresa');
    const lotacaoEl = document.getElementById('movsetor-filtro-lotacao');
    const gestorEl = document.getElementById('movsetor-filtro-gestor');
    movSetorState.filtroEmpresa = empresaEl ? empresaEl.value : '';
    movSetorState.filtroLotacao = lotacaoEl ? lotacaoEl.value : '';
    movSetorState.filtroGestor = gestorEl ? gestorEl.value : '';
    movSetorState.page = 1;
    window.renderMovSetorPage();
};

window.limparFiltrosMovSetor = function() {
    const empresaEl = document.getElementById('movsetor-filtro-empresa');
    const lotacaoEl = document.getElementById('movsetor-filtro-lotacao');
    const gestorEl = document.getElementById('movsetor-filtro-gestor');
    if (empresaEl) empresaEl.value = '';
    if (lotacaoEl) lotacaoEl.value = '';
    if (gestorEl) gestorEl.value = '';
    window.filtrarMovSetor();
};

window.toggleMovSetorPendencias = function(idx) {
    const row = document.getElementById(`movsetor-pendencia-${idx}`);
    if (row) row.classList.toggle('hidden');
};

// Reenvia o e-mail de um envio já existente (mesmo link/token) - útil quando
// o e-mail não chegou (ex.: EMAIL_USER/EMAIL_PASS mal configurados na hora do
// disparo original). Ao contrário do disparo em lote, aqui um erro de envio
// é mostrado na hora pro usuário, em vez de só ficar no log do servidor.
window.reenviarMovimentacao = async function(id, buttonEl) {
    if (buttonEl) buttonEl.disabled = true;
    try {
        await window.callApi(`/movimentacoes-setor/admin/envios/${id}/reenviar`, 'POST');
        window.showToast('E-mail reenviado!', 'success');
    } catch (err) {
        window.showToast(err.message, 'error');
    } finally {
        if (buttonEl) buttonEl.disabled = false;
    }
};

// Remove um envio (usado pra limpar testes ou envios feitos por engano). O
// gestor não conseguirá mais responder pelo link antigo depois disso.
window.excluirMovimentacao = async function(id) {
    if (!confirm('Excluir este envio? O link enviado ao gestor para de funcionar.')) return;
    try {
        await window.callApi(`/movimentacoes-setor/admin/envios/${id}`, 'DELETE');
        window.showToast('Envio removido.', 'success');
        window.loadMovimentacoesSetor();
    } catch (err) {
        window.showToast(err.message, 'error');
    }
};

// Trava o link do gestor: mesmo que ele ainda não tenha respondido, a página
// pública passa a recusar a resposta enquanto estiver bloqueado.
window.bloquearMovimentacao = async function(id) {
    try {
        await window.callApi(`/movimentacoes-setor/admin/envios/${id}/bloquear`, 'POST');
        window.showToast('Envio bloqueado para edição.', 'success');
        window.loadMovimentacoesSetor();
    } catch (err) {
        window.showToast(err.message, 'error');
    }
};

// Libera o link do gestor pra responder/editar de novo (mesmo que já tivesse
// respondido antes - a resposta anterior fica salva e aparece pré-preenchida).
window.liberarMovimentacao = async function(id) {
    try {
        await window.callApi(`/movimentacoes-setor/admin/envios/${id}/liberar`, 'POST');
        window.showToast('Envio liberado para edição.', 'success');
        window.loadMovimentacoesSetor();
    } catch (err) {
        window.showToast(err.message, 'error');
    }
};

window.enviarMovimentacoesDoMes = async function() {
    const mes = document.getElementById('movsetor-mes').value;
    const ano = document.getElementById('movsetor-ano').value;
    try {
        const resultado = await window.callApi('/movimentacoes-setor/admin/enviar', 'POST', { ano, mes });

        // Diagnóstico: se não tem NENHUM gestor cadastrado, o problema não é o
        // mês escolhido - é que a tabela de gestores está vazia. Avisa isso
        // primeiro e não deixa cair na mensagem genérica "nenhum e-mail novo",
        // que confundia (parecia que o mês/período estava errado).
        if (resultado.totalGestoresCadastrados === 0) {
            window.showToast('Nenhum e-mail de gestor cadastrado ainda. Cadastre em Cadastros > Lotações (campo "e-mail do gestor" + botão Salvar) e tente de novo.', 'error');
            return;
        }

        const partes = [];
        if (resultado.criados > 0) partes.push(`${resultado.criados} e-mail(s) enviado(s)`);
        if (resultado.ignoradosJaExistiam > 0) partes.push(`${resultado.ignoradosJaExistiam} já tinham sido enviados`);
        if (resultado.semDadosDeFolha > 0) partes.push(`${resultado.semDadosDeFolha} sem dados de folha nesse período`);
        if (resultado.erros && resultado.erros.length > 0) partes.push(`${resultado.erros.length} com erro (veja o console do servidor)`);

        if (partes.length === 0) {
            window.showToast(`Nenhum e-mail novo para enviar (${resultado.totalGestoresCadastrados} gestor(es) cadastrado(s), mas nenhum se encaixou - confira o console do servidor).`, 'error');
        } else {
            const temErro = resultado.erros && resultado.erros.length > 0;
            window.showToast(partes.join(' - '), temErro ? 'error' : 'success');
        }
        window.loadMovimentacoesSetor();
    } catch (err) {
        window.showToast(err.message, 'error');
    }
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

    // Esconde do menu tudo que este usuário não tem permissão de ver
    // (cadastros/relatórios/lançamentos conforme menus_permitidos, itens de
    // relatório conforme relatorios_permitidos, e "Usuários" só para admin).
    // A checagem real de acesso acontece em switchView/showReport - isto aqui
    // é só para não mostrar links que vão dar "Acesso Bloqueado" ao clicar.
    window.applyMenuPermissionsToNav();

    // Carregar view inicial — se a URL já traz um menu (ex.: #/relatorios/custo-folha),
    // restaura essa tela; senão abre o Início.
    if (location.hash && location.hash.length > 2) {
        window.applyHashRoute();
    } else {
        window.switchView('inicio');
    }

    // Voltar/avançar do navegador ou URL editada pelo usuário: re-navega.
    // Mudanças feitas pela própria navegação são ignoradas (flag _hashInterno).
    window.addEventListener('hashchange', () => {
        if (window._hashInterno) { window._hashInterno = false; return; }
        window.applyHashRoute();
    });
    
    // Event listener navegação
    const header = document.querySelector('header');
    if (header) {
        header.addEventListener('click', (e) => {
            const targetLink = e.target.closest('a');
            if (!targetLink) return;
            
            const viewId = targetLink.dataset.view;
            const reportType = targetLink.dataset.reportType;
            
            e.preventDefault(); // Previne comportamento padrão de links
            
            if (viewId === 'movimentos') { 
                if(window.showToast) window.showToast('Desabilitado.', 'error'); 
                return; 
            }
            
            if (targetLink.id === 'about-link') {
                // Se tiver modal de sobre, chame aqui
            }
            else if (reportType) {
                if(window.switchView) window.switchView('relatorios'); 
                if(window.showReport) window.showReport(reportType); 
            } 
            else if (viewId) { 
                if(window.switchView) window.switchView(viewId); 
            }
        });
    }

     // --- 2. LISTENER GLOBAL (BOTÕES DENTRO DE MODAIS E ACORDEÕES) ---
    // --- GERENCIADOR DE CLIQUES CENTRALIZADO ---
    document.body.addEventListener('click', (e) => {
        
        // 1. FECHAR MODAIS (Classe .close-modal-btn ou botão "Fechar" azul)
        // Verifica se clicou no botão ou em algum ícone dentro dele
        const closeBtn = e.target.closest('.close-modal-btn, .modal-close-action'); 
        // Nota: Adicionei .modal-close-action caso você queira usar essa classe no botão azul "Fechar"
        
        // Verifica se clicou no botão "Fechar" específico do rodapé (se ele não tiver a classe acima)
        const isFooterCloseBtn = e.target.innerText.trim() === 'Fechar';

        if (closeBtn || (e.target.tagName === 'BUTTON' && isFooterCloseBtn)) {
            e.preventDefault();
            console.log("Fechando modais...");
            document.querySelectorAll('.modal-container').forEach(m => {
                m.classList.add('hidden');
                m.style.display = 'none'; // Força o fechamento
            });
            return; // Para a execução aqui
        }

        // 2. NAVEGAÇÃO (Links com data-view)
        // BUG CORRIGIDO: o <header> já tem seu próprio listener de clique (mais
        // acima) que trata os links de navegação (inclusive casos especiais como
        // reportType, about-link). Como esse listener global
        // aqui embaixo também escuta cliques em [data-view], um clique dentro do
        // header disparava switchView() DUAS VEZES (uma vez por listener) - daí
        // telas com consulta pesada, como Lotações, apareciam com a requisição
        // rodando (e demorando) duas vezes seguidas. Fora do header (ex.: o link
        // "Voltar para o Início" da tela de Acesso Bloqueado) continua funcionando
        // normalmente, só não trata de novo o que já foi tratado ali em cima.
        const navLink = e.target.closest('[data-view]');
        if (navLink) {
            if (navLink.closest('header')) return;
            e.preventDefault();
            window.switchView(navLink.dataset.view);
            return;
        }
        
        // 5. ACORDEÕES (Collapsible)
        const header = e.target.closest('.collapsible-header');
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