# SF DevOps Assistant

<p align="center">
  <img src="https://img.shields.io/badge/VS%20Code-Extension-blue?logo=visual-studio-code" alt="VS Code Extension">
  <img src="https://img.shields.io/badge/Salesforce-DevOps-00A1E0?logo=salesforce" alt="Salesforce">
  <img src="https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
</p>

**SF DevOps Assistant** é uma extensão do Visual Studio Code voltada ao ecossistema Salesforce, com foco em **deploy de metadados** e **boas práticas de DevOps**.

## 🎯 Objetivo

Reduzir a complexidade operacional, evitar erros humanos e padronizar o processo de preparação de deploys, atuando como uma ferramenta de assistência inteligente ao desenvolvedor Salesforce.

## ✨ Funcionalidades

### 🔌 Conexão com Orgs
- Reutiliza autenticação do Salesforce CLI
- Detecção automática da org ativa
- Seleção entre múltiplas orgs autenticadas
- Validação de permissões de leitura

### 📋 Explorador de Metadados
- **Permission Sets** - Visualização completa com permissões de objetos, campos e classes
- **Profiles** - Listagem e detalhes de profiles
- **Custom Objects** - Objetos customizados e standard configuráveis
- **Apex Classes** - Classes Apex com informações de API e status
- **Flows** - Flows e Process Builder

### 🚀 Montagem Assistida de Deploy (Feature Central)
1. Selecione um Permission Set ou Profile
2. Visualize os componentes associados (objetos, campos, classes)
3. Escolha o que incluir no deploy
4. Gere automaticamente:
   - XML dos metadados selecionados
   - `package.xml`
   - `destructiveChanges.xml` (opcional)

### 🔍 Comparação de Metadados (Diff)
- Comparação entre Org A × Org B
- Diff de Permission Sets detalhado
- Destaque de diferenças em permissões
- Relatório estruturado das divergências

### 📝 Auditoria e Rastreabilidade
- **Setup Audit Trail** - Histórico de alterações do Salesforce
  - Visualização do Audit Trail direto no VS Code
  - Filtro por seção (Permission Sets, Profiles, Users, etc.)
  - Busca por termo
  - Exportação em TXT, JSON ou CSV
- Log local de operações da extensão
- Sugestão automática de mensagem de commit

## 🛠️ Instalação

### Pré-requisitos

1. **Visual Studio Code** versão 1.85.0 ou superior
2. **Salesforce CLI** instalado e configurado
   ```bash
   npm install -g @salesforce/cli
   ```
3. **Node.js** versão 18 ou superior

### Instalação da Extensão

1. Clone o repositório:
   ```bash
   git clone https://github.com/seu-usuario/salesforce-devops-assistant.git
   cd salesforce-devops-assistant
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Compile o projeto:
   ```bash
   npm run compile
   ```

4. Abra o VS Code na pasta do projeto e pressione `F5` para iniciar em modo de desenvolvimento.

## 📖 Como Usar

### Conectando a uma Org

1. Certifique-se de ter pelo menos uma org autenticada via SF CLI:
   ```bash
   sf org login web --alias MinhaOrg
   ```

2. Abra a extensão clicando no ícone na barra lateral
3. A extensão detectará automaticamente a org padrão
4. Use "SF DevOps: Selecionar Org" para trocar entre orgs

### Explorando Metadados

1. Expanda as categorias no painel "Metadados"
2. Clique em um componente para ver seus detalhes
3. Use o botão "+" para adicionar à seleção de deploy

### Montagem Assistida de Deploy

1. Execute o comando `SF DevOps: Montagem Assistida de Deploy`
2. Selecione o tipo de componente (Permission Set, Profile, etc.)
3. Escolha os componentes desejados
4. Opte por incluir componentes relacionados
5. Gere o pacote de deploy

### Comparando Ambientes

1. Execute `SF DevOps: Comparar Metadados`
2. Selecione "Org vs Org"
3. Escolha a org de origem e destino
4. Visualize o relatório de diferenças

## ⚙️ Configurações

| Configuração | Descrição | Padrão |
|-------------|-----------|--------|
| `sfdevops.defaultOrg` | Alias da org padrão | `""` |
| `sfdevops.outputDirectory` | Diretório para pacotes de deploy | `./deploy-packages` |
| `sfdevops.enableAuditLog` | Habilitar log de auditoria | `true` |
| `sfdevops.auditLogPath` | Caminho do log de auditoria | `./.sfdevops/audit.log` |
| `sfdevops.autoGenerateCommitMessage` | Gerar mensagem de commit automaticamente | `true` |
| `sfdevops.metadataApiVersion` | Versão da Metadata API | `59.0` |

## 🎯 Comandos Disponíveis

| Comando | Descrição |
|---------|-----------|
| `SF DevOps: Conectar à Org` | Verifica conexão e valida permissões |
| `SF DevOps: Selecionar Org` | Alterna entre orgs autenticadas |
| `SF DevOps: Atualizar Metadados` | Recarrega metadados da org |
| `SF DevOps: Montagem Assistida de Deploy` | Inicia o wizard de montagem |
| `SF DevOps: Criar Pacote de Deploy` | Gera o pacote com a seleção atual |
| `SF DevOps: Gerar package.xml` | Gera apenas o package.xml |
| `SF DevOps: Comparar Metadados` | Executa diff entre ambientes |
| `SF DevOps: Ver Log de Auditoria` | Menu de opções de auditoria |
| `SF DevOps: Carregar Setup Audit Trail` | Busca histórico de alterações do Salesforce |
| `SF DevOps: Filtrar Audit Trail` | Filtra por seção do Setup |
| `SF DevOps: Buscar no Audit Trail` | Busca por termo no histórico |
| `SF DevOps: Exportar Audit Trail` | Exporta em TXT, JSON ou CSV |
| `SF DevOps: Gerar Mensagem de Commit` | Cria sugestão de commit message |

## 🏗️ Arquitetura

```
src/
├── commands/           # Handlers de comandos
│   ├── authCommands.ts
│   ├── metadataCommands.ts
│   ├── deployCommands.ts
│   ├── diffCommands.ts
│   └── auditCommands.ts
├── services/           # Lógica de negócio
│   ├── sfdxService.ts      # Integração com SF CLI
│   ├── metadataService.ts  # Leitura de metadados
│   ├── deployService.ts    # Montagem de pacotes
│   ├── diffService.ts      # Comparação de metadados
│   └── auditService.ts     # Auditoria e logs
├── views/              # Tree Views
│   ├── connectionTreeProvider.ts
│   ├── metadataTreeProvider.ts
│   ├── deploySelectionTreeProvider.ts
│   └── auditTreeProvider.ts
├── utils/              # Utilitários
│   ├── logger.ts
│   ├── config.ts
│   ├── xmlBuilder.ts
│   └── fileUtils.ts
├── types/              # Definições TypeScript
│   └── index.ts
└── extension.ts        # Ponto de entrada
```

## 🔒 Fora de Escopo

Esta extensão **não**:
- Executa deploy automático em orgs
- Substitui o Salesforce CLI
- Implementa CI/CD completo
- Suporta todos os tipos de metadata
- Possui interface gráfica complexa

## 🚧 Roadmap

- [x] Setup Audit Trail do Salesforce
- [x] Relatório de Diff aprimorado
- [ ] Integração com pipelines CI/CD
- [ ] Análise de impacto de deploy
- [ ] Templates de governança
- [ ] Suporte ampliado a metadados
- [ ] Validações automáticas pré-deploy
- [ ] Diff Local vs Org

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/NovaFuncionalidade`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/NovaFuncionalidade`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está licenciado sob a licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes.

## 👤 Autor

Desenvolvido como projeto de demonstração técnica de estágio.

---

<p align="center">
  <sub>Feito com ❤️ para a comunidade Salesforce</sub>
</p>
