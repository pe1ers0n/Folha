-- schema.sql
-- Este script define a estrutura do banco de dados dimensional (Star Schema)
-- que a aplicação agora utiliza.

-- Cria o "schema" (ou banco de dados) chamado 'gold' se ele não existir.
CREATE SCHEMA IF NOT EXISTS gold;

-- Define o schema 'gold' como o padrão para os comandos a seguir.
-- (Nota: O 'USE gold;' pode não ser padrão em todo SQL, 
-- é mais seguro prefixar tabelas com 'gold.', como o routes.js faz)


-- --- TABELAS DE DIMENSÃO (d_...) ---
-- Descrevem "quem", "o quê", "onde", "quando".

-- Dimensão: Empresa
CREATE TABLE IF NOT EXISTS gold.d_fortes_empresa (
    id_empresa VARCHAR(255) PRIMARY KEY,
    empresa TEXT,
    razao_social TEXT,
    cnpj_cpf TEXT
);

-- Dimensão: Cargo
CREATE TABLE IF NOT EXISTS gold.d_fortes_cargo (
    id_cargo VARCHAR(255) PRIMARY KEY,
    cd_cargo TEXT,
    cargo TEXT,
    cargo_cbo TEXT,
    cargo_cbo2009 TEXT
);

-- Dimensão: Funcionário (baseado nas imagens)
CREATE TABLE IF NOT EXISTS gold.d_fortes_funcionario (
    id_funcionario VARCHAR(255) PRIMARY KEY,
    cpf TEXT,
    funcionario TEXT,
    data_nascimento DATE,
    idade INT,
    sexo TEXT,
    raca_cor TEXT,
    estado_civil TEXT,
    tempo_casa INT,
    logradouro TEXT,
    end_numero TEXT,
    bairro TEXT,
    cep TEXT,
    grau_instrucao TEXT,
    num_dependentes INT,
    data_admissao DATE,
    data_rescisao DATE,
    data_transferencia DATE,
    habilitacao_categoria TEXT,
    habilitacao_numero TEXT,
    tem_deficiencia INT,
    participa_cipa TEXT,
    deficiencia_auditiva INT,
    deficiencia_fisica INT,
    deficiencia_intelectual INT,
    deficiencia_mental INT,
    deficiencia_visual INT,
    e_transferido TEXT,
    status TEXT,
    possui_dependente TEXT,
    geracao TEXT,
    tempo_servico TEXT,
    faixa_etaria TEXT,
    tempo_servico_dias INT,
    cod_funcionario TEXT,
    iniciativa_rescisao TEXT
);

-- Dimensão: Lotação
CREATE TABLE IF NOT EXISTS gold.d_fortes_lotacao (
    id_lotacao VARCHAR(255) PRIMARY KEY,
    nome_lotacao TEXT,
    nome_lotacao_mae TEXT,
    -- CORRIGIDO: de centro_custo_propmaes para centro_custo_protheus
    centro_custo_protheus TEXT
);

-- Dimensão: Tipo de Folha
CREATE TABLE IF NOT EXISTS gold.d_fortes_tipo_folha (
    id_folha INT PRIMARY KEY,
    descricao TEXT
);

-- Dimensão: Evento (Necessária para routes.js, estrutura inferida)
CREATE TABLE IF NOT EXISTS gold.d_fortes_evento (
    id_evento VARCHAR(255) PRIMARY KEY,
    evento TEXT
);

-- Dimensão: Estabelecimento (Necessária para routes.js, estrutura inferida)
CREATE TABLE IF NOT EXISTS gold.d_fortes_estabelecimento (
    id_estabelecimento VARCHAR(255) PRIMARY KEY,
    nome_estabelecimento TEXT
);


-- --- TABELA DE FATOS (f_...) ---
-- Armazena os valores numéricos e as chaves para as dimensões.

CREATE TABLE IF NOT EXISTS gold.f_fortes_pagamento (
    -- Chaves Estrangeiras (ligações para as dimensões)
    id_folha INT,
    id_empresa VARCHAR(255),
    id_evento VARCHAR(255),
    id_funcionario VARCHAR(255),
    id_estabelecimento VARCHAR(255),
    id_cargo VARCHAR(255),
    id_lotacao VARCHAR(255),
    id_categoria_esocial INT,
    id_rescisao TEXT,
    
    -- Métricas (os números)
    data DATE,
    referencia INT,
    provento DECIMAL(13, 2),
    desconto DECIMAL(13, 2),
    liquido DECIMAL(13, 2),
    informacao DECIMAL(13, 2),
    
    -- Outros atributos
    folha_seq INT,
    folha_encerrada TEXT,
    origem TEXT,
    data_inicio_mes DATE,

    -- Definição das chaves estrangeiras
    FOREIGN KEY (id_folha) REFERENCES gold.d_fortes_tipo_folha(id_folha),
    FOREIGN KEY (id_empresa) REFERENCES gold.d_fortes_empresa(id_empresa),
    FOREIGN KEY (id_evento) REFERENCES gold.d_fortes_evento(id_evento),
    FOREIGN KEY (id_funcionario) REFERENCES gold.d_fortes_funcionario(id_funcionario),
    FOREIGN KEY (id_estabelecimento) REFERENCES gold.d_fortes_estabelecimento(id_estabelecimento),
    FOREIGN KEY (id_cargo) REFERENCES gold.d_fortes_cargo(id_cargo),
    FOREIGN KEY (id_lotacao) REFERENCES gold.d_fortes_lotacao(id_lotacao)
);

-- Adiciona índices nas colunas de chave estrangeira da tabela de fatos
-- para otimizar a performance das consultas (JOINs).
CREATE INDEX IF NOT EXISTS idx_f_pag_id_folha ON gold.f_fortes_pagamento(id_folha);
CREATE INDEX IF NOT EXISTS idx_f_pag_id_empresa ON gold.f_fortes_pagamento(id_empresa);
CREATE INDEX IF NOT EXISTS idx_f_pag_id_evento ON gold.f_fortes_pagamento(id_evento);
CREATE INDEX IF NOT EXISTS idx_f_pag_id_funcionario ON gold.f_fortes_pagamento(id_funcionario);
CREATE INDEX IF NOT EXISTS idx_f_pag_id_estabelecimento ON gold.f_fortes_pagamento(id_estabelecimento);
CREATE INDEX IF NOT EXISTS idx_f_pag_id_cargo ON gold.f_fortes_pagamento(id_cargo);
CREATE INDEX IF NOT EXISTS idx_f_pag_id_lotacao ON gold.f_fortes_pagamento(id_lotacao);
CREATE INDEX IF NOT EXISTS idx_f_pag_data ON gold.f_fortes_pagamento(data);

-- --- RECOMENDAÇÃO DE PERFORMANCE (rodar manualmente, tabela não criada por este script) ---
-- A tabela gold.d_protheus_centro_custo é usada em praticamente todos os filtros de
-- Dashboard/Relatórios (buildWhereClause em routes.js) através de um self-join que
-- calcula o "centro de custo pai" a partir dos 3 primeiros dígitos do id (LEFT(id::text,3)).
-- Essa comparação não usa índice normal por ser baseada em uma expressão. Se a tabela
-- for grande e as consultas de filtro continuarem lentas mesmo com o cache de
-- aplicação (routes.js), considere criar um índice funcional, por exemplo:
--
--   CREATE INDEX IF NOT EXISTS idx_cc_id_prefixo3
--       ON gold.d_protheus_centro_custo (LEFT(id_centro_custo::text, 3));
--
-- Isso permite que o banco use índice na parte "pai.id_centro_custo::text" da comparação
-- em vez de escanear a tabela inteira a cada execução.