// js/filters.js

// Estado local de controle para não recarregar filtros repetidamente sem necessidade
let reportsFiltersPopulated = false;

// --- FUNÇÕES UTILITÁRIAS GLOBAIS ---

window.getSelectedItems = function(panel) {
    if (!panel) return [];
    return Array.from(panel.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
}

window.updateMultiSelectFilterText = function(panelElement) {
    // Encontra o botão de texto associado a este painel
    // A estrutura é: button > span(text) + panel
    // Ou: div.multi-select-dropdown > button + panel
    const dropdown = panelElement.closest('.multi-select-dropdown');
    if (!dropdown) return;
    
    const buttonText = dropdown.querySelector('button span');
    if (!buttonText) return;

    // Define o texto padrão baseado no ID do painel para saber o contexto
    let defaultText = "Selecionar";
    if (panelElement.id.includes('company')) defaultText = "Todas as Empresas";
    else if (panelElement.id.includes('cc')) defaultText = "Todos os Centros";
    else if (panelElement.id.includes('payroll')) defaultText = "Todos os Tipos";
    else if (panelElement.id.includes('lotation')) defaultText = "Todas as Lotações";
    else if (panelElement.id.includes('event')) defaultText = "Todos os Eventos";

    const selected = window.getSelectedItems(panelElement);
    const selectedCount = selected.length;
    
    // Lógica inteligente de texto
    const totalCheckboxes = panelElement.querySelectorAll('input[type="checkbox"]').length;
    
    if (selectedCount === 0) {
        buttonText.textContent = "Nenhum selecionado";
    } else if (selectedCount === totalCheckboxes) {
        buttonText.textContent = defaultText; // Se todos marcados, volta ao padrão (ex: Todas as Empresas)
    } else if (selectedCount === 1) {
        buttonText.textContent = selected[0];
    } else {
        buttonText.textContent = `${selectedCount} selecionados`;
    }
}

// --- LÓGICA DE EVENTOS (DELEGAÇÃO) ---
// Esta é a correção principal: Um único listener no corpo da página
document.addEventListener('click', function(e) {
    
    // 1. Clique em "Marcar Todos"
    if (e.target.classList.contains('select-all')) {
        e.preventDefault();
        e.stopPropagation();
        const panel = e.target.closest('.multi-select-dropdown-panel');
        if (panel) {
            const checkboxes = panel.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(cb => {
                // Marca apenas se estiver visível (respeita busca)
                if (cb.parentElement.style.display !== 'none') {
                    cb.checked = true;
                }
            });
            window.updateMultiSelectFilterText(panel);
        }
    }

    // 2. Clique em "Desmarcar Todos"
    if (e.target.classList.contains('deselect-all')) {
        e.preventDefault();
        e.stopPropagation();
        const panel = e.target.closest('.multi-select-dropdown-panel');
        if (panel) {
            const checkboxes = panel.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(cb => {
                // Desmarca apenas se estiver visível
                if (cb.parentElement.style.display !== 'none') {
                    cb.checked = false;
                }
            });
            window.updateMultiSelectFilterText(panel);
        }
    }

    // 3. Clique dentro do painel (impede fechar ao clicar)
    if (e.target.closest('.multi-select-dropdown-panel')) {
        // Se não for um link (a), para a propagação
        if (e.target.tagName !== 'A') {
            e.stopPropagation(); 
        }
    }
});

// Listener para mudança nos checkboxes (atualiza texto)
document.addEventListener('change', function(e) {
    if (e.target.type === 'checkbox' && e.target.closest('.multi-select-dropdown-panel')) {
        const panel = e.target.closest('.multi-select-dropdown-panel');
        window.updateMultiSelectFilterText(panel);
    }
});

// Pequeno utilitário de debounce: evita refiltrar a lista a cada tecla digitada
// quando o painel tem muitos itens (ex.: lista de eventos/lotações), reduzindo
// o trabalho de layout do navegador durante a digitação.
function debounce(fn, delayMs) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delayMs);
    };
}

const applyFilterSearch = (panel, searchTerm) => {
    const listContainer = panel.querySelector('.list-container') || panel;
    const labels = listContainer.querySelectorAll('label');
    let visibleCount = 0;

    labels.forEach(label => {
        const text = label.textContent.toLowerCase();
        const matches = text.includes(searchTerm);
        label.style.display = matches ? 'flex' : 'none';
        if (matches) visibleCount++;
    });

    // Mensagem de "nenhum resultado" para o usuário entender por que a lista sumiu
    let emptyMsg = listContainer.querySelector('.filter-empty-message');
    if (visibleCount === 0 && labels.length > 0) {
        if (!emptyMsg) {
            emptyMsg = document.createElement('p');
            emptyMsg.className = 'filter-empty-message text-xs text-gray-400 text-center py-2';
            emptyMsg.textContent = 'Nenhum resultado encontrado.';
            listContainer.appendChild(emptyMsg);
        }
        emptyMsg.style.display = 'block';
    } else if (emptyMsg) {
        emptyMsg.style.display = 'none';
    }
};

// Listener para busca (input) — com debounce para listas grandes
document.addEventListener('input', debounce(function(e) {
    // Aceita qualquer caixa de busca dentro de um painel multi-seleção
    // (os inputs usam classes como .company-search/.cc-search, não .filter-search).
    const panel = e.target.closest && e.target.closest('.multi-select-dropdown-panel');
    if (panel && e.target.matches('input[type="text"]')) {
        applyFilterSearch(panel, e.target.value.toLowerCase());
    }
}, 150));


// --- FUNÇÃO DE CARREGAMENTO ---

window.loadReportFilters = async function() {
    if (reportsFiltersPopulated) return;
    
    try {
        const data = await window.callApi('/reports/filters', 'GET');
        if (data.filterOptions) {
            window.populateReportFilters(data.filterOptions);
            reportsFiltersPopulated = true;
        }
    } catch (err) {
        window.showToast("Erro ao carregar filtros: " + err.message, 'error');
    }
}

// Preenche os filtros da tela de Relatórios com as opções vindas do backend
// (GET /reports/filters). Popula os selects de Ano e Mês e as listas de
// checkboxes dos painéis multi-seleção (Empresa, Centro de Custo, Lotação,
// Tipo de Folha, Evento). Deixar tudo desmarcado significa "todos" (o backend
// só filtra quando algo é selecionado).
window.populateReportFilters = function(filterOptions) {
    const opts = filterOptions || {};

    // --- Selects de Ano e Mês ---
    const preencherSelect = (id, valores) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const atual = sel.value;
        sel.innerHTML = '';
        ['Todos', ...(valores || [])].forEach(v => {
            const o = document.createElement('option');
            o.value = v;
            o.textContent = v;
            sel.appendChild(o);
        });
        // Mantém a seleção anterior se ainda existir
        if (atual && Array.from(sel.options).some(o => o.value === atual)) {
            sel.value = atual;
        }
    };
    preencherSelect('reports-filter-year', opts.years);
    preencherSelect('reports-filter-month', opts.months);

    // --- Painéis multi-seleção: preenche as listas com checkboxes ---
    const preencherLista = (seletor, itens) => {
        const lista = document.querySelector(seletor);
        if (!lista) return;
        lista.innerHTML = '';
        (itens || []).forEach(item => {
            const label = document.createElement('label');
            label.className = 'flex items-center gap-2 px-2 py-1 hover:bg-gray-50 rounded cursor-pointer text-sm';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = item;            // set via propriedade: seguro para nomes com aspas/acentos
            cb.className = 'shrink-0';
            const span = document.createElement('span');
            span.textContent = item;    // textContent evita qualquer injeção de HTML
            span.className = 'truncate';
            label.appendChild(cb);
            label.appendChild(span);
            lista.appendChild(label);
        });
    };

    // Barra "Marcar todos / Desmarcar todos" no topo de cada painel. Os
    // listeners .select-all/.deselect-all já existem neste arquivo; só faltavam
    // os botões nos painéis de Relatórios (o dashboard já tinha).
    const adicionarBarraSelecao = (panelId) => {
        const panel = document.getElementById(panelId);
        if (!panel) return;
        if (panel.querySelector('.filter-select-toolbar')) return; // evita duplicar
        const bar = document.createElement('div');
        bar.className = 'filter-select-toolbar flex items-center justify-between gap-2 px-2 py-1 border-b bg-gray-50';
        bar.innerHTML = '<a href="#" class="select-all text-xs font-semibold text-sky-600 hover:underline">Marcar todos</a>' +
                        '<a href="#" class="deselect-all text-xs font-semibold text-gray-500 hover:underline">Desmarcar todos</a>';
        panel.insertBefore(bar, panel.firstChild);
    };

    const paineis = [
        ['reports-company-panel', '.company-list', opts.companies],
        ['reports-cc-panel', '.cc-list', opts.costCenters],
        ['reports-lotation-panel', '.lotation-list', opts.lotations],
        ['reports-payroll-type-panel', '.payroll-type-list', opts.payrollTypes],
        ['reports-event-panel', '.event-list', opts.events],
    ];
    paineis.forEach(function(p) {
        adicionarBarraSelecao(p[0]);
        preencherLista('#' + p[0] + ' ' + p[1], p[2]);
    });
};
