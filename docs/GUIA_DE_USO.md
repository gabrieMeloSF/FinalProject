# Guia de Uso - SF DevOps Assistant

## Sumário

1. [Primeiros Passos](#1-primeiros-passos)
2. [Conectando a uma Org](#2-conectando-a-uma-org)
3. [Explorando Metadados](#3-explorando-metadados)
4. [Criando Pacotes de Deploy](#4-criando-pacotes-de-deploy)
5. [Comparando Ambientes](#5-comparando-ambientes)
6. [Auditoria e Rastreabilidade](#6-auditoria-e-rastreabilidade)
7. [Dicas e Boas Práticas](#7-dicas-e-boas-práticas)

---

## 1. Primeiros Passos

### Pré-requisitos

1. **Visual Studio Code** instalado
2. **Salesforce CLI** instalado e configurado:
   ```bash
   # Instalar SF CLI
   npm install -g @salesforce/cli
   
   # Verificar instalação
   sf --version
   ```
3. Pelo menos uma **org Salesforce autenticada**:
   ```bash
   # Autenticar em uma org
   sf org login web --alias MinhaOrg
   ```

### Ativando a Extensão

A extensão é ativada automaticamente quando você:
- Abre um projeto Salesforce (pasta com `sfdx-project.json`)
- Executa qualquer comando da extensão

Após ativação, você verá o ícone **SF DevOps** na barra lateral esquerda.

---

## 2. Conectando a uma Org

### Verificar Conexão Atual

1. Clique no ícone **SF DevOps** na barra lateral
2. Expanda a seção **Conexão**
3. Verifique a org atual exibida

### Trocar de Org

**Método 1: Via Tree View**
1. Expanda **Orgs Disponíveis**
2. Clique na org desejada

**Método 2: Via Command Palette**
1. Pressione `Ctrl+Shift+P` (ou `Cmd+Shift+P` no Mac)
2. Digite `SF DevOps: Selecionar Org`
3. Escolha a org na lista

### Validar Permissões

Execute `SF DevOps: Conectar à Org` para validar que a org tem as permissões necessárias para leitura de metadados.

---

## 3. Explorando Metadados

### Navegando pela Árvore

1. Abra a seção **Metadados** na barra lateral
2. Expanda as categorias:
   - **Permission Sets** - Conjuntos de permissões
   - **Profiles** - Perfis de usuário
   - **Objetos** - Objetos custom e standard
   - **Apex Classes** - Classes Apex
   - **Flows** - Flows e Process Builder

3. Clique em um item para expandir seus detalhes

### Atualizando Metadados

Os metadados são carregados sob demanda e mantidos em cache. Para forçar atualização:

1. Clique no botão **↻** (refresh) no cabeçalho da seção Metadados
2. Ou execute `SF DevOps: Atualizar Metadados`

### Buscando Componentes

Execute `SF DevOps: Adicionar ao Deploy` e digite o nome do componente para buscar em todas as categorias.

---

## 4. Criando Pacotes de Deploy

### Método 1: Seleção Manual

1. **Navegue** até o componente na árvore de Metadados
2. **Clique no botão +** ao lado do componente
3. **Repita** para todos os componentes desejados
4. **Verifique** a seleção na seção "Seleção de Deploy"
5. **Gere o pacote**:
   - Clique no ícone de pacote no cabeçalho
   - Ou execute `SF DevOps: Criar Pacote de Deploy`

### Método 2: Montagem Assistida (Recomendado)

1. Execute `SF DevOps: Montagem Assistida de Deploy`
2. **Passo 1**: Selecione o tipo de componente principal
   ```
   [ ] Permission Set    ← Recomendado para começar
   [ ] Profile
   [ ] Custom Object
   [ ] Apex Class
   ```
3. **Passo 2**: Selecione os componentes (múltipla seleção)
4. **Passo 3**: Escolha incluir componentes relacionados
   ```
   Para Permission Sets, isso adiciona automaticamente:
   - Objetos referenciados
   - Campos com permissões
   - Classes Apex com acesso
   ```
5. **Passo 4**: Escolha a próxima ação
   - Gerar pacote agora
   - Continuar adicionando
   - Ver seleção

### Gerenciando a Seleção

- **Remover item**: Clique no botão **-** ao lado do item
- **Limpar tudo**: Clique no ícone de limpar no cabeçalho
- **Ver estatísticas**: O resumo mostra total por tipo

### Gerando o Pacote

Ao gerar o pacote, você pode:
1. Informar a **org de destino** (opcional, para referência)
2. Escolher **abrir a pasta** ou **abrir o package.xml**

#### Estrutura do Pacote Gerado

```
deploy_2024-01-15T10-30-45/
├── package.xml              # Manifest do deploy
├── deploy-info.json         # Informações de auditoria
└── permissionsets/          # Arquivos de metadados
    └── MeuPermissionSet.permissionset-meta.xml
```

### Gerando Apenas o package.xml

Se você só precisa do manifest:
1. Adicione os componentes à seleção
2. Execute `SF DevOps: Gerar package.xml`
3. O XML será aberto em um novo documento
4. Salve onde desejar

---

## 5. Comparando Ambientes

### Comparação Org vs Org

1. Execute `SF DevOps: Comparar Metadados`
2. Selecione **Org vs Org**
3. Escolha a **org de origem** (ex: Sandbox)
4. Escolha a **org de destino** (ex: Production)
5. Selecione o **tipo de metadado** (Permission Sets)
6. Opcionalmente, filtre por um componente específico

### Interpretando o Resultado

O relatório mostra um resumo visual com ações sugeridas:

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  RESUMO DA COMPARAÇÃO                                                         │
├───────────────────────────────────────────────────────────────────────────────┤
│  Total de componentes analisados: 10                                          │
│                                                                               │
│  ✅ 2 NOVO(S)       → Existe na ORIGEM, falta no DESTINO                      │
│                        (Ação: fazer deploy para o destino)                    │
│  ❌ 1 REMOVIDO(S)  → Existe no DESTINO, não existe na ORIGEM                  │
│                        (Ação: remover do destino ou adicionar na origem)      │
│  ⚠️  3 DIFERENTE(S) → Existe em ambos, mas com configurações diferentes       │
│                        (Ação: sincronizar as diferenças)                      │
│  ✔️  4 IDÊNTICO(S)  → Configuração igual em ambos os ambientes                │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Detalhes das diferenças:**
- `✅ NOVOS` = Componentes que existem na origem e precisam ser criados no destino
- `❌ REMOVIDOS` = Componentes que existem só no destino (extras)
- `⚠️ DIFERENTES` = Componentes com configurações distintas (mostra campo a campo)

Para cada componente diferente, o relatório mostra:
- 🔵 **Origem**: valor atual na org de origem
- 🟢 **Destino**: valor atual na org de destino

### Usando o Diff para Deploy

1. Execute o diff entre Sandbox e Production
2. Identifique componentes `[+]` e `[~]`
3. Adicione esses componentes à seleção de deploy
4. Gere o pacote para migrar as diferenças

---

## 6. Auditoria e Rastreabilidade

A extensão oferece duas funcionalidades de auditoria:
- **Setup Audit Trail**: Histórico de alterações feitas no Setup do Salesforce
- **Log Local**: Registro das operações realizadas pela extensão

### Setup Audit Trail (Salesforce)

O Setup Audit Trail mostra todas as alterações administrativas feitas no Salesforce.

#### Carregando o Audit Trail

1. Execute `SF DevOps: Carregar Setup Audit Trail`
2. Um documento formatado será aberto com o histórico
3. A sidebar também é atualizada com os registros

#### Filtrando por Seção

1. Execute `SF DevOps: Filtrar Audit Trail`
2. Selecione a seção desejada:
   - `All` - Todas as seções
   - `Permission Sets` - Alterações em Permission Sets
   - `Profiles` - Alterações em Profiles
   - `Manage Users` - Gerenciamento de usuários
   - `Security Controls` - Controles de segurança
   - `Customize` - Customizações
   - etc.

#### Buscando por Termo

1. Execute `SF DevOps: Buscar no Audit Trail`
2. Digite o termo de busca (nome de usuário, campo, etc.)
3. Visualize os resultados filtrados

#### Exportando o Audit Trail

1. Execute `SF DevOps: Exportar Audit Trail`
2. Escolha o formato:
   - **Texto (.txt)** - Documento formatado para leitura
   - **JSON (.json)** - Estrutura para processamento
   - **CSV (.csv)** - Para abrir em planilhas (Excel, Google Sheets)
3. O arquivo é salvo em `.sfdevops/`

### Log Local da Extensão

Registro das operações realizadas pela extensão.

#### Tipos de Eventos Registrados

| Evento | Descrição |
|--------|-----------|
| 📦 Pacote Criado | Um novo pacote de deploy foi gerado |
| 📤 Pacote Exportado | O pacote foi salvo no sistema de arquivos |
| 🔍 Diff Executado | Uma comparação entre ambientes foi feita |
| 📥 Metadados Recuperados | Metadados foram carregados da org |
| 🔌 Org Conectada | Conexão estabelecida com uma org |

#### Acessando o Log Local

1. Execute `SF DevOps: Ver Log de Auditoria`
2. Escolha **Log Local da Extensão**
3. Opções disponíveis:
   - Visualizar log formatado
   - Exportar para arquivo
   - Limpar log

### Gerando Mensagem de Commit

Após criar um pacote:
1. Execute `SF DevOps: Gerar Mensagem de Commit`
2. A mensagem é gerada automaticamente:
   ```
   [Deploy] 5 PermissionSet(s), 3 CustomObject(s) from DevSandbox - 2024-01-15
   ```
3. Escolha **Copiar** ou **Usar no Git**

---

## 7. Dicas e Boas Práticas

### Organização do Workflow

1. **Sempre valide a conexão** antes de começar
2. **Atualize metadados** antes de criar pacotes críticos
3. **Use a montagem assistida** para Permission Sets - ela inclui automaticamente as dependências
4. **Faça o diff** antes de deploy para produção
5. **Consulte o log de auditoria** para revisões

### Permission Sets vs Profiles

| Use Permission Sets quando... | Use Profiles quando... |
|-------------------------------|------------------------|
| Precisa de permissões modulares | Precisa definir permissões base |
| Quer reutilizar entre usuários | Controla layout assignments |
| Gerencia permissões temporárias | Define record type defaults |

### Evitando Erros Comuns

1. **Não inclua dependências manualmente**
   - Use "Incluir Relacionados" para Permission Sets
   - A extensão resolve as referências automaticamente

2. **Verifique a versão da API**
   - Configure em Settings → SF DevOps → Metadata API Version
   - Use a mesma versão da org de destino

3. **Cuidado com destructiveChanges**
   - Só são gerados para itens marcados como "delete"
   - Revise sempre antes de usar em produção

### Estrutura Recomendada de Diretórios

```
meu-projeto-salesforce/
├── sfdx-project.json
├── force-app/
│   └── main/
│       └── default/
├── deploy-packages/          ← Pacotes gerados
│   ├── deploy_2024-01-15.../
│   └── deploy_2024-01-16.../
└── .sfdevops/
    └── audit.log             ← Log de auditoria
```

### Atalhos de Teclado

| Ação | Atalho |
|------|--------|
| Abrir Command Palette | `Ctrl+Shift+P` / `Cmd+Shift+P` |
| Buscar comandos SF DevOps | `Ctrl+Shift+P` → digite "SF DevOps" |

---

## Solução de Problemas

### "Salesforce CLI não encontrado"

```bash
# Verifique a instalação
sf --version

# Se não estiver instalado
npm install -g @salesforce/cli
```

### "Nenhuma org autenticada"

```bash
# Autentique uma org
sf org login web --alias MinhaOrg

# Liste orgs autenticadas
sf org list
```

### "Erro ao carregar metadados"

1. Verifique a conexão com a org
2. Valide as permissões do usuário
3. Tente atualizar os metadados manualmente

### Pacote gerado está vazio

1. Verifique se há itens na "Seleção de Deploy"
2. Certifique-se de que os itens não estão marcados como "delete"

---

## Próximos Passos

Após gerar o pacote, você pode fazer o deploy usando o SF CLI:

```bash
# Validar o pacote (dry run)
sf project deploy start --source-dir ./deploy-packages/deploy_xxx --dry-run

# Fazer o deploy
sf project deploy start --source-dir ./deploy-packages/deploy_xxx

# Deploy com testes
sf project deploy start --source-dir ./deploy-packages/deploy_xxx --test-level RunLocalTests
```

---

*Para informações técnicas detalhadas, consulte a [Documentação Técnica](./DOCUMENTACAO_TECNICA.md).*
