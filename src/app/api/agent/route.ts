import { NextRequest, NextResponse } from "next/server";
import dados from "@/data/dados_processados.json";

type Pedido = (typeof dados.pedidos)[number];

function buscarPedido(orderId: string): Pedido | undefined {
  return dados.pedidos.find(
    (p) => p.order_id.toUpperCase() === orderId.trim().toUpperCase()
  );
}

const tools = [
  {
    type: "function",
    function: {
      name: "auditar_pedido_e_sla",
      description:
        "Audita um pedido específico cruzando data do pedido, prazo prometido no checkout, prazo real em dias úteis (com feriados), histórico VIP do cliente, duplicidades e causa raiz sistêmica.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Código do pedido" },
        },
        required: ["order_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "simular_decisao_financeira",
      description:
        "Calcula e compara o custo de reenvio (24% CMV + frete médio) contra o custo de reembolso integral e o impacto no LTV de recompra em 12 meses.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string" },
        },
        required: ["order_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "executar_resolucao_operacional",
      description:
        "Executa a ação operacional definitiva no sistema: ordem de reenvio, encerramento de falso atraso, protocolo na transportadora ou bloqueio de lote/máquina.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string" },
          tipo_acao: {
            type: "string",
            enum: [
              "REENVIO_PRIORITARIO",
              "ENCERRAR_FALSO_ATRASO",
              "NOTIFICAR_TRANSPORTADORA_SLA",
              "REEMBOLSO_INTEGRAL",
              "CONTATO_CLIENTE_DADOS",
            ],
          },
          acao_sistemica_lote_ou_equipamento: { type: "string" },
          justificativa_financeira: { type: "string" },
        },
        required: ["order_id", "tipo_acao", "justificativa_financeira"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gerar_comunicacao_cliente",
      description:
        "Redige a mensagem personalizada final para o cliente (WhatsApp/E-mail).",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string" },
          canal: { type: "string", enum: ["WhatsApp", "E-mail"] },
          mensagem: { type: "string" },
        },
        required: ["order_id", "canal", "mensagem"],
      },
    },
  },
];

function executarToolLocal(name: string, args: Record<string, unknown>) {
  const orderId = String(args.order_id || "");
  const pedido = buscarPedido(orderId);

  if (!pedido) {
    return { erro: `Pedido ${orderId} não encontrado na base de exceções.` };
  }

  if (name === "auditar_pedido_e_sla") {
    return {
      order_id: pedido.order_id,
      marca: pedido.marca,
      tipo_excecao: pedido.tipo_excecao,
      status_atual: pedido.status,
      data_pedido: pedido.data_pedido,
      data_prometida_checkout: pedido.data_prometida,
      data_prometida_real_dias_uteis: pedido.data_prometida_correta,
      dias_uteis_atraso_real: pedido.dias_uteis_atraso_real,
      falso_atraso: pedido.falso_atraso,
      is_duplicado: pedido.is_duplicado,
      causa_raiz_identificada: pedido.causa_raiz,
      transportadora: pedido.transportadora,
      uf: pedido.uf,
      cd: pedido.cd,
      turno: pedido.turno,
      maquina: pedido.maquina,
      lote_produto: pedido.lote_produto,
      cliente_vip: pedido.is_vip,
      receita_acumulada_cliente: pedido.receita_acumulada,
    };
  }

  if (name === "simular_decisao_financeira") {
    return {
      order_id: pedido.order_id,
      valor_pedido: pedido.valor,
      custo_reenvio_cmv_mais_frete: pedido.custo_reenvio,
      custo_reembolso_integral: pedido.custo_reembolso,
      economia_direta_optando_por_reenvio: pedido.economia_reenvio,
      probabilidade_cancelamento_atual: `${Math.round(pedido.prob_perda * 100)}%`,
      perda_ltv_12m_se_mal_resolvido: pedido.perda_ltv_12m,
      risco_financeiro_esperado: pedido.risco_financeiro_esperado,
      recomendacao_matematica: pedido.falso_atraso
        ? "Pedido dentro do SLA real em dias úteis. Enviar atualização proativa sem custo de reenvio."
        : `Reenvio prioritário economiza R$ ${pedido.economia_reenvio.toFixed(2)} vs. reembolso e protege recompra (${pedido.is_vip ? "70%" : "28%"}).`,
    };
  }

  if (name === "executar_resolucao_operacional") {
    return {
      status_execucao: "EXECUTADO_COM_SUCESSO",
      protocolo: `OPS-${Date.now().toString().slice(-6)}`,
      order_id: pedido.order_id,
      novo_status_ticket: "resolvido_pelo_agente",
      acao_executada: args.tipo_acao,
      acao_sistemica: args.acao_sistemica_lote_ou_equipamento || "Nenhuma",
      economia_estimada_brl: pedido.falso_atraso
        ? pedido.valor
        : Math.max(0, pedido.economia_reenvio),
      timestamp: new Date().toISOString(),
    };
  }

  if (name === "gerar_comunicacao_cliente") {
    return {
      status_envio: "PRONTO_PARA_DISPARO",
      canal: args.canal,
      destinatario_customer_id: pedido.customer_id,
      conteudo: args.mensagem,
    };
  }

  return { erro: "Ferramenta desconhecida" };
}

function executarFallbackResiliente(pedido: Pedido, instrucaoExtra?: string) {
  const audit = executarToolLocal("auditar_pedido_e_sla", { order_id: pedido.order_id });
  const sim = executarToolLocal("simular_decisao_financeira", { order_id: pedido.order_id });

  const tipoAcao = pedido.falso_atraso
    ? "ENCERRAR_FALSO_ATRASO"
    : ["endereco_divergente", "pagamento_pendente"].includes(pedido.tipo_excecao)
    ? "CONTATO_CLIENTE_DADOS"
    : ["atraso_entrega", "rastreio_parado"].includes(pedido.tipo_excecao)
    ? "NOTIFICAR_TRANSPORTADORA_SLA"
    : "REENVIO_PRIORITARIO";

  const mensagemCliente = pedido.falso_atraso
    ? `Olá! Passando para tranquilizar você sobre o pedido ${pedido.order_id} (${pedido.marca}): ele segue dentro do prazo contratado em dias úteis (previsão até ${pedido.data_prometida_correta}) com a transportadora ${pedido.transportadora}.`
    : `Olá! Identificamos uma ocorrência (${pedido.tipo_excecao}) no seu pedido ${pedido.order_id} da ${pedido.marca} e já acionamos prioridade máxima (${tipoAcao}) sem nenhum custo adicional para você.`;

  const exec = executarToolLocal("executar_resolucao_operacional", {
    order_id: pedido.order_id,
    tipo_acao: tipoAcao,
    acao_sistemica_lote_ou_equipamento: pedido.causa_raiz,
    justificativa_financeira: `Economia de R$ ${pedido.economia_reenvio.toFixed(2)} vs reembolso + proteção de LTV R$ ${pedido.perda_ltv_12m.toFixed(2)}.`,
  });

  const comm = executarToolLocal("gerar_comunicacao_cliente", {
    order_id: pedido.order_id,
    canal: "WhatsApp",
    mensagem: mensagemCliente,
  });

  const trace = [
    { tool: "auditar_pedido_e_sla", input: { order_id: pedido.order_id }, output: audit },
    { tool: "simular_decisao_financeira", input: { order_id: pedido.order_id }, output: sim },
    {
      tool: "executar_resolucao_operacional",
      input: { order_id: pedido.order_id, tipo_acao: tipoAcao },
      output: exec,
    },
    {
      tool: "gerar_comunicacao_cliente",
      input: { order_id: pedido.order_id, canal: "WhatsApp" },
      output: comm,
    },
  ];

  const resposta = [
    `**1. DiagnÃ³stico:** Pedido ${pedido.order_id} (${pedido.marca}) â€” \`${pedido.tipo_excecao}\`. Causa raiz: ${pedido.causa_raiz}. Cliente ${pedido.is_vip ? "VIP (> R$ 1.500)" : "padrÃ£o"}.`,
    `**2. Decisão Financeira:** Risco esperado de R$ ${pedido.risco_financeiro_esperado.toFixed(2)}. ${
      pedido.falso_atraso
        ? "Nenhum custo adicional necessário (dentro do SLA útil)."
        : `Reenvio custa R$ ${pedido.custo_reenvio.toFixed(2)} contra R$ ${pedido.custo_reembolso.toFixed(2)} de reembolso (economia de R$ ${pedido.economia_reenvio.toFixed(2)}).`
    }`,
    `**3. Ação Executada:** \`${tipoAcao}\` (Protocolo ${exec.protocolo}).${instrucaoExtra ? ` Observação aplicada: ${instrucaoExtra}.` : ""}`,
    `**4. Mensagem ao Cliente (WhatsApp):** "${mensagemCliente}"`,
  ].join("\n\n");

  return { resposta, trace, pedido, modelo: "fallback_autonomo_local" };
}

async function chamarGeminiComRetry(
  apiKey: string,
  messages: Array<Record<string, unknown>>
) {
  const modelos = ["gemini-3.8-flash", "gemini-3.8-flash-lite", "gemini-3.5-flash"];

  for (const model of modelos) {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            tools,
            tool_choice: "auto",
            temperature: 0.2,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        return { data, model };
      }

      if (response.status === 503 || response.status === 429) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      break;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { orderId, instrucaoExtra } = await req.json();
    const pedido = buscarPedido(orderId);

    if (!pedido) {
      return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(executarFallbackResiliente(pedido, instrucaoExtra));
    }

    const messages: Array<Record<string, unknown>> = [
      {
        role: "system",
        content: `Você é o Agente Executor de Operações da Gogroup (Gocase e GoBeauté).
Execute as ferramentas na ordem: 'auditar_pedido_e_sla', 'simular_decisao_financeira', 'executar_resolucao_operacional' e 'gerar_comunicacao_cliente'.
Ao final, entregue um resumo curto e objetivo em português com: Diagnóstico, Decisão Financeira (em R$), Ação Executada e Mensagem ao Cliente.`,
      },
      {
        role: "user",
        content: `Processe e resolva a exceção do pedido ${pedido.order_id} (${pedido.marca}, ${pedido.tipo_excecao}). ${
          instrucaoExtra ? `Instrução extra: ${instrucaoExtra}` : ""
        }`,
      },
    ];

    const traceLogs: Array<{
      tool: string;
      input: Record<string, unknown>;
      output: Record<string, unknown>;
    }> = [];

    let modeloUsado = "gemini-3.8-flash";

    for (let step = 0; step < 5; step++) {
      const resGemini = await chamarGeminiComRetry(apiKey, messages);

      if (!resGemini) {
        return NextResponse.json(executarFallbackResiliente(pedido, instrucaoExtra));
      }

      modeloUsado = resGemini.model;
      const msg = resGemini.data.choices[0].message;
      messages.push(msg);

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return NextResponse.json({
          resposta: msg.content,
          trace: traceLogs,
          pedido,
          modelo: modeloUsado,
        });
      }

      for (const toolCall of msg.tool_calls) {
        const fnName = toolCall.function.name;
        const fnArgs = JSON.parse(toolCall.function.arguments || "{}");
        const result = executarToolLocal(fnName, fnArgs);

        traceLogs.push({ tool: fnName, input: fnArgs, output: result });
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }

    return NextResponse.json({
      resposta: "Execução concluída pelo agente.",
      trace: traceLogs,
      pedido,
      modelo: modeloUsado,
    });
  } catch (err: unknown) {
    console.error("Erro no agente:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno ao executar o agente." },
      { status: 500 }
    );
  }
}