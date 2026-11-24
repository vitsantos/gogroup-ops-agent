# Gogroup Ops AI — Torre de Controle & Agente Executor de Exceções

Solução AI-First desenvolvida para priorizar, diagnosticar causas raiz sistêmicas e resolver autonomamente pedidos com exceção das marcas **Gocase** e **GoBeauté** (data de referência: `30/09/2026`).

## 1. Impacto Financeiro e Operacional (Defesa com Números)

* **Exposição Financeira Total:** **R$ 262.177,90** (`R$ 220.161,37` em `2.000` pedidos únicos + `R$ 42.016,53` em LTV de recompra em 12 meses).
* **Priorização Inteligente (Top 150/dia) vs. Fila por Ordem de Chegada (FIFO):**
  * **Fila Atual (FIFO):** Mitiga **R$ 10.687,09** de risco esperado no dia (`11` clientes VIP).
  * **Fila Priorizada por Risco + LTV (Top 150):** Mitiga **R$ 27.730,88** no mesmo dia (**+159,5%** ou **+R$ 17.043,79** a mais de proteção financeira usando exatamente a mesma capacidade de `150` tratativas/dia a `12 min/caso`), protegendo `23` clientes VIP (`receita_acumulada > R$ 1.500`).
* **Automação sem Esforço Humano (`193` exceções eliminadas da fila manual):**
  * **151 Falsos Atrasos (Bug no Checkout):** O sistema somava `1 + SLA contratado` em dias corridos em vez de dias úteis (ignorando fins de semana e os feriados `07/09/2026` e `12/10/2026`). Esses pedidos estão dentro do prazo contratado e são resolvidos com comunicação preventiva (`30,2 horas` economizadas).
  * **42 Tickets Duplicados:** Pedidos com duas exceções idênticas abertas no mesmo dia (`8,4 horas` economizadas).
* **Economia Direta Reenvio vs. Reembolso:** Priorizar reenvio (`24% CMV + frete médio`) frente ao reembolso integral economiza **R$ 18.610,16** apenas nos casos físicos do Top 150 e preserva a taxa de recompra (`70%` VIP / `28%` padrão).

## 2. Causas Raiz Sistêmicas Identificadas (48,6% do Volume)

1. **Bug de Prazo no Checkout:** 100% dos pedidos calcularam prazo em dias corridos, gerando 151 falsos atrasos.
2. **Impressora IMP-02 (CD1):** Concentra **59,2%** (`77` de `130`) de todas as `falha_personalizacao`.
3. **Turno Noite do CD2 + Brindes:** Concentra **75,4%** (`215` de `285`) dos casos de `item_faltante` (`75,8%` com `brinde_no_pedido = True`).
4. **Lote L2607-B (Ápice):** Concentra **69,9%** (`79` de `113`) dos casos de `vazamento_produto` (`76` no SKU `APC-1067`).
5. **Transportadora Rota Express:** Concentra **64,1%** dos `atraso_entrega` (`327/510`) e **66,1%** dos `rastreio_parado` (`117/177`).
6. **Transportadora Carga Norte:** Concentra **53,1%** das `avaria_transporte` (`102/192`).

## 3. Agente de IA Executor (Tool Calling)

O agente (`POST /api/agent`) não é apenas um chat informativo: ele executa um pipeline de 4 ferramentas (`tools`) para cada pedido acionado:
1. `auditar_pedido_e_sla()` — valida prazo real em dias úteis, feriados, duplicidades, VIP e causa raiz.
2. `simular_decisao_financeira()` — compara `Custo Reenvio (CMV 24% + Frete)` vs. `Reembolso Integral` e `Perda de LTV`.
3. `executar_resolucao_operacional()` — gera protocolo operacional (`REENVIO_PRIORITARIO`, `ENCERRAR_FALSO_ATRASO`, `NOTIFICAR_TRANSPORTADORA_SLA`, etc.) e sinaliza ação sistêmica.
4. `gerar_comunicacao_cliente()` — redige a mensagem final pronta para disparo ao cliente.