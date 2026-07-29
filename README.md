# Enterprise WebRTC Videoconferencing Solution (MiroTalk-based)

This repository contains the complete implementation, production-grade containerization blueprint, and deployment architecture for an enterprise-ready WebRTC Real-Time Communication (RTC) videoconferencing platform based on **MiroTalk SFU**.

---

## 🏗️ 1. Sistema e Fluxo WebRTC: Arquitetura do Sistema

Abaixo está o fluxo detalhado das conexões de controle/sinalização (via WebSockets/Socket.io) e do transporte de mídias de vídeo e áudio em tempo real (WebRTC/SRTP) através do **MediaSoup SFU** e do servidor **Coturn (STUN/TURN)** para redes corporativas restritas.

```text
                                       +----------------------------+
                                       |      Corporate Proxy       |
                                       |        (NGINX SSL)         |
                                       +--------------+-------------+
                                                      |
                                      /               |               \
                        (HTTPS / Port 443)    (WSS / Port 443)     (HTTP / Port 443)
                              /                       |                       \
                             v                        v                        v
                +-------------------------+  +------------------+  +-----------------------+
                |    Corporate User /     |  |   MiroTalk SFU   |  | Authentication API    |
                |    WebRTC Browser       |  |  Signaling Host  |  | Gateway (TypeScript)  |
                +----+--------------------+  +------------------+  +-----------------------+
                     |        ^                                                ^
                     |        | (WebRTC Signaling: Join, SDP, ICE Candidates)  |
                     |        +------------------------------------------------+
                     |
                     | <==== WebRTC Media Stream (RTP over UDP/TCP) =====> (Ports 40000 - 40100)
                     |
                     v
        +------------+------------+
        |  Coturn (STUN/TURN)     | <== (Symmetric NAT Traversal fallback)
        |  Relay Service (UDP)    |
        +-------------------------+
```

### O Papel do Servidor Coturn (STUN/TURN) no Ambiente Corporativo

Nas redes empresariais, firewalls restritivos e NATs simétricos frequentemente impedem a comunicação ponto-a-ponto (P2P) direta ou conexões diretas entre o navegador do usuário e o servidor SFU.
1. **STUN (Session Traversal Utilities for NAT):** Permite ao cliente descobrir seu IP público e tipo de NAT para estabelecer conexões diretas de baixíssima latência.
2. **TURN (Traversal Using Relays Around NAT):** Se a conexão direta falhar, o tráfego de mídia criptografado (SRTP) é retransmitido pelo servidor Coturn utilizando as portas padrão (ex: `3478` ou `5349` sobre TLS). Isso garante 100% de conectividade de áudio, vídeo e compartilhamento de tela mesmo atrás de firewalls altamente restritos corporativos.

---

## 🛠️ 2. Estrutura de Infraestrutura & Deploy (`docker-compose.yml`)

A solução é totalmente containerizada utilizando Docker Compose para orquestração de microsserviços. Os componentes principais são:
1. **NGINX Reverse Proxy:** Manipula a terminação SSL/TLS de forma segura, oferece suporte a WebSockets persistentes (`wss://`) e expõe as rotas de API da Gateway e do MiroTalk sob a mesma porta HTTPS segura (`443`).
2. **MiroTalk SFU Engine:** Servidor de alta performance alimentado por Node.js e MediaSoup para rotear fluxos de mídia sem descodificação intermediária desnecessária.
3. **Coturn Server:** Servidor de NAT Traversal robusto pré-configurado com autenticação segura de longo termo (`lt-creds-mechanism`).
4. **Auth Gateway (TypeScript):** Servidor seguro de provisionamento de salas privadas e geração de tokens JWT criptográficos.

---

## 🛡️ 3. Gateway de Autenticação & Controle de Acesso (API JWT)

O subprojeto `gateway/` em TypeScript expõe serviços robustos e seguros:

### Endpoints da API

#### A. Criar Sala Segura (`POST /api/v1/rooms/create`)
Provisiona uma sala e gera URLs seguras com privilégios específicos utilizando JWT.
- **Headers:** `Authorization: Bearer <CORP_TOKEN>`
- **Request Body:**
```json
{
  "roomName": "sala-conselho-diretor",
  "username": "diretor-geral",
  "role": "host"
}
```
- **Response Body (200 OK):**
```json
{
  "success": true,
  "room": "sala-conselho-diretor",
  "role": "host",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6...",
  "url": "https://rtc.company.com/join/?room=sala-conselho-diretor&token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### B. Validar Token JWT (`POST /api/v1/rooms/validate-token`)
Utilizado pelo MiroTalk ou webhooks de segurança para validar a validade do token.
- **Request Body:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## 🎨 4. Personalização e Branding Visual (MiroTalk customization)

Para aplicar identidade visual empresarial no MiroTalk, configure ou injete parâmetros através do arquivo `config.js` do MiroTalk SFU:

1. **Alteração de Tema e Estilo (Dark/Light Mode):**
   No arquivo `config.js` do MiroTalk, você pode editar a folha de estilo customizada ou injetar variáveis globais de CSS:
   ```javascript
   // config.js
   theme: {
     background: '#0f172a', // Slate 900
     primary: '#2563eb',    // Indigo/Blue corporativo
     buttons: '#1e293b',
     fontFamily: 'Inter, sans-serif'
   }
   ```

2. **Injeção de Logotipo:**
   Substitua o logo padrão hospedado na pasta de recursos estáticos (`public/images/logo.png`) ou configure o caminho no arquivo de parametrização `config.js`:
   ```javascript
   branding: {
     logoUrl: '/images/custom-corporate-logo.png',
     productName: 'Enterprise Meet'
   }
   ```

3. **Toggles de Funcionalidades via `config.js` ou Env Vars:**
   Você pode desabilitar dinamicamente recursos na interface do usuário para maior conformidade corporativa:
   ```javascript
   buttons: {
     shareScreen: true,     // Habilitar/Desabilitar compartilhamento de tela
     recordMeeting: false,  // Desabilitar gravação para privacidade de dados
     chat: true,            // Habilitar chat corporativo
     raiseHand: true        // Habilitar levantamento de mão
   }
   ```

---

## 🚀 5. Guia de Hardening e Portas Exigidas (Produção)

Para garantir que o tráfego passe corretamente pelo firewall e mantenha uma segurança "Zero-Trust", certifique-se de expor as seguintes portas em seu roteador/firewall na nuvem:

| Serviço / Protocolo | Porta Externa | Protocolo de Rede | Propósito |
|---------------------|---------------|-------------------|-----------|
| HTTP                | 80            | TCP               | Redirecionamento HTTPS |
| HTTPS (Websockets)  | 443           | TCP               | Sinalização, Portal Web e APIs |
| Coturn (STUN/TURN)  | 3478          | UDP & TCP         | Descoberta de IP e Relay de Mídia básico |
| Coturn (TURNS TLS)  | 5349          | UDP & TCP         | Relay de Mídia Criptografado (TLS) |
| Mediasoup SFU       | 40000 - 40100 | UDP & TCP         | Transporte de Áudio/Vídeo WebRTC |
| Coturn Relay        | 49152 - 49200 | UDP               | Alocação de endpoints de retransmissão |

### Comandos de Inicialização e Validação do Ambiente

1. **Copie e configure o arquivo `.env` para produção:**
   ```bash
   cp .env.example .env
   # Edite os valores apropriados, especialmente PUBLIC_IP e DOMAIN_NAME
   nano .env
   ```

2. **Suba os containers em segundo plano:**
   ```bash
   docker-compose up -d --build
   ```

3. **Comando de validação de conectividade local e status:**
   ```bash
   docker-compose ps
   docker-compose logs -f auth-gateway
   ```

4. **Ferramenta de Diagnóstico WebRTC:**
   - Para validar se as portas do seu servidor TURN/STUN estão ativas e abertas, utilize o utilitário oficial [Trickle ICE do Google/WebRTC](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/).
   - Insira os detalhes do servidor: `turn:seu-dominio.com:3478`, insira as credenciais geradas dinamicamente e confirme a recepção dos candidatos de tipo `relay` e `srflx`.
