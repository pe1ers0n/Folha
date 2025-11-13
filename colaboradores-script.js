// --- LÓGICA DE COLABORADORES ---
let colaboradoresData = [];
let colaboradoresFiltered = [];
let currentPage = 1;
const itemsPerPage = 10;
let sortColumn = 'nome';
let sortOrder = 'asc';

async function loadColaboradores() {
    try {
        const response = await fetch('/colaboradores');
        if (!response.ok) throw new Error('Erro ao buscar colaboradores');
        colaboradoresData = await response.json();
        colaboradoresFiltered = [...colaboradoresData];
        updateColaboradoresStats();
        renderColaboradoresTable();
    } catch (error) {
        console.error('Erro ao carregar colaboradores:', error);
        showToast('Erro ao carregar colaboradores', 'error');
    }
}

function updateColaboradoresStats() {
    const total = colaboradoresData.length;
    const ativos = colaboradoresData.filter(c => c.status === 'A' || c.status === 'Ativo').length;
    const inativos = total - ativos;
    const empresas = new Set(colaboradoresData.map(c => c.empresa).filter(Boolean)).size;

    document.getElementById('total-colaboradores').textContent = total.toLocaleString('pt-BR');
    document.getElementById('total-ativos').textContent = ativos.toLocaleString('pt-BR');
    document.getElementById('total-inativos').textContent = inativos.toLocaleString('pt-BR');
    document.getElementById('total-empresas').textContent = empresas.toLocaleString('pt-BR');
}

function filterColaboradores(searchTerm) {
    const term = searchTerm.toLowerCase();
    colaboradoresFiltered = colaboradoresData.filter(c => 
        (c.nome && c.nome.toLowerCase().includes(term)) ||
        (c.cpf && c.cpf.toLowerCase().includes(term)) ||
        (c.cargo && c.cargo.toLowerCase().includes(term))
    );
    currentPage = 1;
    renderColaboradoresTable();
}

function sortColaboradores(column) {
    if (sortColumn === column) {
        sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortOrder = 'asc';
    }

    colaboradoresFiltered.sort((a, b) => {
        let aVal = a[column] || '';
        let bVal = b[column] || '';
        if (typeof aVal === 'string') aVal = aVal.toLowerCase();
        if (typeof bVal === 'string') bVal = bVal.toLowerCase();
        return sortOrder === 'asc' ? aVal > bVal ? 1 : -1 : aVal < bVal ? 1 : -1;
    });

    renderColaboradoresTable();
}

function renderColaboradoresTable() {
    const tbody = document.getElementById('colaboradores-tbody');
    tbody.innerHTML = '';

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageData = colaboradoresFiltered.slice(start, end);

    pageData.forEach(colaborador => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        row.innerHTML = `
            <td class="px-4 py-3">${colaborador.nome || '-'}</td>
            <td class="px-4 py-3">${colaborador.cpf || '-'}</td>
            <td class="px-4 py-3">${colaborador.cargo || '-'}</td>
            <td class="px-4 py-3">${colaborador.empresa || '-'}</td>
            <td class="px-4 py-3">${colaborador.nome_lotacao || '-'}</td>
            <td class="px-4 py-3">
                <span class="px-3 py-1 rounded-full text-xs font-semibold ${
                    (colaborador.status === 'A' || colaborador.status === 'Ativo') 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                }">
                    ${(colaborador.status === 'A' || colaborador.status === 'Ativo') ? 'Ativo' : 'Inativo'}
                </span>
            </td>
            <td class="px-4 py-3">
                <button class="text-blue-600 hover:text-blue-900 font-semibold" onclick="openColaboradorModal(${colaborador.id_funcionario})">
                    <i class="fas fa-eye"></i> Ver
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });

    renderPagination();
}

function renderPagination() {
    const pagination = document.getElementById('colaboradores-pagination');
    pagination.innerHTML = '';
    const totalPages = Math.ceil(colaboradoresFiltered.length / itemsPerPage);

    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.className = `px-3 py-1 rounded-lg ${
            i === currentPage 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
        }`;
        btn.textContent = i;
        btn.onclick = () => {
            currentPage = i;
            renderColaboradoresTable();
        };
        pagination.appendChild(btn);
    }
}

async function openColaboradorModal(colaboradorId) {
    try {
        const response = await fetch(`/colaboradores/${colaboradorId}`);
        if (!response.ok) throw new Error('Erro ao buscar detalhes do colaborador');
        const colaborador = await response.json();

        document.getElementById('colaborador-modal-title').textContent = `Detalhes - ${colaborador.nome}`;
        const modalContent = document.getElementById('colaborador-modal-content');
        modalContent.innerHTML = `
            <div><strong>Nome:</strong> ${colaborador.nome || '-'}</div>
            <div><strong>CPF:</strong> ${colaborador.cpf || '-'}</div>
            <div><strong>Cargo:</strong> ${colaborador.cargo || '-'}</div>
            <div><strong>Empresa:</strong> ${colaborador.empresa || '-'}</div>
            <div><strong>Lotação:</strong> ${colaborador.nome_lotacao || '-'}</div>
            <div><strong>Centro de Custo:</strong> ${colaborador.centro_custo_protheus || '-'}</div>
            <div><strong>Data de Admissão:</strong> ${colaborador.data_admissao ? new Date(colaborador.data_admissao).toLocaleDateString('pt-BR') : '-'}</div>
            <div><strong>Data de Nascimento:</strong> ${colaborador.data_nascimento ? new Date(colaborador.data_nascimento).toLocaleDateString('pt-BR') : '-'}</div>
            <div><strong>Idade:</strong> ${colaborador.idade || '-'}</div>
            <div><strong>Sexo:</strong> ${colaborador.sexo || '-'}</div>
            <div><strong>Estado Civil:</strong> ${colaborador.estado_civil || '-'}</div>
            <div><strong>Grau de Instrução:</strong> ${colaborador.grau_instrucao || '-'}</div>
            <div><strong>Dependentes:</strong> ${colaborador.num_dependentes || '0'}</div>
        `;

        // Carregar histórico de folha
        const folhaResponse = await fetch(`/colaboradores/${colaboradorId}/folha`);
        if (folhaResponse.ok) {
            const folhaData = await folhaResponse.json();
            const folhaTbody = document.getElementById('colaborador-folha-tbody');
            folhaTbody.innerHTML = '';

            folhaData.slice(0, 20).forEach(folha => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="px-4 py-2">${new Date(folha.data).toLocaleDateString('pt-BR')}</td>
                    <td class="px-4 py-2">${folha.tipo_folha || '-'}</td>
                    <td class="px-4 py-2 text-right">R$ ${parseFloat(folha.provento || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                    <td class="px-4 py-2 text-right">R$ ${parseFloat(folha.desconto || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                    <td class="px-4 py-2 text-right font-semibold">R$ ${parseFloat(folha.liquido || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                `;
                folhaTbody.appendChild(row);
            });
        }

        document.getElementById('colaborador-modal').classList.remove('hidden');
    } catch (error) {
        console.error('Erro ao abrir modal:', error);
        showToast('Erro ao carregar detalhes do colaborador', 'error');
    }
}

function closeColaboradorModal() {
    document.getElementById('colaborador-modal').classList.add('hidden');
}

// Event Listeners para Colaboradores
document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('colaboradores-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterColaboradores(e.target.value);
        });
    }

    document.querySelectorAll('#colaboradores-table .sortable-header').forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.column;
            sortColaboradores(column);
        });
    });

    const modalClose = document.getElementById('colaborador-modal-close');
    const modalCloseBtn = document.getElementById('colaborador-modal-close-btn');
    if (modalClose) modalClose.addEventListener('click', closeColaboradorModal);
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeColaboradorModal);

    const exportBtn = document.getElementById('colaboradores-export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const csv = [
                ['Nome', 'CPF', 'Cargo', 'Empresa', 'Lotação', 'Status'],
                ...colaboradoresFiltered.map(c => [
                    c.nome || '',
                    c.cpf || '',
                    c.cargo || '',
                    c.empresa || '',
                    c.nome_lotacao || '',
                    (c.status === 'A' || c.status === 'Ativo') ? 'Ativo' : 'Inativo'
                ])
            ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `colaboradores_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
        });
    }
});
