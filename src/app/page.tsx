"use client";

import React, { useMemo, useState } from "react";
import dados from "@/data/dados_processados.json";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Cpu,
  DollarSign,
  Filter,
  Layers,
  Play,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";

type Pedido = (typeof dados.pedidos)[number];

interface TraceItem {
  tool: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

const formatBRL = (val: number) =>
  val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function OpsControlTower() {
  const { resumo, pedidos } = dados;

  const [abaAtiva, setAbaAtiva] = useState<"fila" | "causas">("fila");
  const [filtroModo, setFiltroModo] = useState<"top150" | "todos" | "vip" | "auto">("top150");
  const [filtroCausa, setFiltroCausa] = useState<string>("TODAS");
  const [busca, setBusca] = useState<string>("");
  const [resolvidosIds, setResolvidosIds] = useState<Record<string, string>>({});

  const [pedidoSelecionado, setPedidoSelecionado] = useState<Pedido>(pedidos[0]);
  const [instrucaoExtra, setInstrucaoExtra] = useState<string>("");
  const [executandoAgente, setExecutandoAgente] = useState<boolean>(false);
  const [traceAgente, setTraceAgente] = useState<TraceItem[]>([]);
  const [respostaAgente, setRespostaAgente] = useState<string>("");
  const [erroAgente, setErroAgente] = useState<string>("");

  const pedidosFiltrados = useMemo(() => {
    return pedidos.filter((p) => {
      if (filtroModo === "top150" && !p.acao_hoje_top150) return false;
      if (filtroModo === "vip" && !p.is_vip) return false;
      if (filtroModo === "auto" && !p.falso_atraso && !p.is_duplicado) return false;
      if (filtroCausa !== "TODAS" && p.causa_raiz !== filtroCausa) return false;
      if (busca.trim()) {
        const q = busca.toLowerCase();
        return (
          p.order_id.toLowerCase().includes(q) ||
          p.marca.toLowerCase().includes(q) ||
          p.tipo_excecao.toLowerCase().includes(q) ||
          p.transportadora.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [pedidos, filtroModo, filtroCausa, busca]);

  const executarAgenteNoPedido = async (pedidoAlvo: Pedido) => {
    setPedidoSelecionado(pedidoAlvo);
    setExecutandoAgente(true);
    setErroAgente("");
    setTraceAgente([]);
    setRespostaAgente("");

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: pedidoAlvo.order_id,
          instrucaoExtra,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErroAgente(data.error || "Falha ao acionar agente.");
      } else {
        setTraceAgente(data.trace || []);
        setRespostaAgente(data.resposta || "");
        setResolvidosIds((prev) => ({
          ...prev,
          [pedidoAlvo.order_id]: "Resolvido via Agente AI",
        }));
      }
    } catch {
      setErroAgente("Erro de conex?o com a API do agente.");
    } finally {
      setExecutandoAgente(false);
    }
  };

  const limparAutoLote = () => {
    const novos: Record<string, string> = { ...resolvidosIds };
    pedidos.forEach((p) => {
      if (p.falso_atraso) {
        novos[p.order_id] = "Falso Atraso Encerrado (SLA OK)";
      } else if (p.is_duplicado) {
        novos[`${p.order_id}-dup-${p.rank_prioridade}`] = "Duplicidade Mesclada";
      }
    });
    setResolvidosIds(novos);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-400">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">
                  Gogroup Ops AI ? Torre de Exce??es
                </h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
                  Ref: 30/09/2026 ? Cap. 150/dia
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Prioriza??o por Risco Financeiro (Pedido + LTV) & Agente Executor Aut?nomo (Gocase & GoBeaut?)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={limparAutoLote}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition"
            >
              <Zap className="w-3.5 h-3.5" />
              Auto-Resolver 193 Falsos Atrasos & Duplicados
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Exposi??o Financeira Total</span>
              <DollarSign className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {formatBRL(resumo.exposicao_financeira_total)}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {formatBRL(resumo.valor_total_pedidos)} em pedidos + LTV 12m em risco
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-900 border border-indigo-500/40">
            <div className="flex items-center justify-between text-indigo-300 text-xs mb-1">
              <span>Risco Mitigado Hoje (Top 150)</span>
              <TrendingUp className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-bold text-indigo-400">
              {formatBRL(resumo.risco_coberto_top150)}
            </div>
            <p className="text-xs text-emerald-400 mt-1 font-medium">
              +159,5% (+{formatBRL(resumo.ganho_vs_fifo_brl)}) vs. fila FIFO
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Eliminados Sem Esfor?o Humano</span>
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400">
              {resumo.falsos_atrasos_auto + resumo.duplicados_eliminados} casos
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {resumo.falsos_atrasos_auto} falsos atrasos (checkout) + {resumo.duplicados_eliminados} duplicados (38,6h salvas)
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Clientes VIP Priorizados Hoje</span>
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {resumo.vips_top150}{" "}
              <span className="text-sm font-normal text-slate-400">
                de {resumo.vips_totais} VIPs
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Receita &gt; R$ 1.500 (protege recompra de 70%)
            </p>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <button
                onClick={() => setAbaAtiva("fila")}
                className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition ${
                  abaAtiva === "fila"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:bg-slate-900"
                }`}
              >
                <Layers className="w-4 h-4" />
                Fila Priorizada do Dia (Top 150)
              </button>
              <button
                onClick={() => setAbaAtiva("causas")}
                className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition ${
                  abaAtiva === "causas"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:bg-slate-900"
                }`}
              >
                <Cpu className="w-4 h-4" />
                Diagn?stico de Causa Raiz (Sist?mico vs. Pontual)
              </button>
            </div>

            {abaAtiva === "fila" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 bg-slate-900 p-3 rounded-xl border border-slate-800">
                  <Filter className="w-4 h-4 text-slate-400" />
                  {[
                    { id: "top150", label: "Top 150 Hoje (100% Cap.)" },
                    { id: "vip", label: "Clientes VIP" },
                    { id: "auto", label: "Falsos Atrasos / Duplicados (193)" },
                    { id: "todos", label: "Todos (2.042)" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFiltroModo(f.id as typeof filtroModo)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                        filtroModo === f.id
                          ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                          : "bg-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}

                  <input
                    type="text"
                    placeholder="Buscar pedido, marca, exce??o..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="ml-auto bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                  <div className="max-h-[620px] overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950/90 text-slate-400 sticky top-0 border-b border-slate-800">
                        <tr>
                          <th className="py-3 px-3">Rank</th>
                          <th className="py-3 px-3">Pedido / Marca</th>
                          <th className="py-3 px-3">Exce??o & Causa Raiz</th>
                          <th className="py-3 px-3 text-right">Risco Esp.</th>
                          <th className="py-3 px-3 text-right">A??o IA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {pedidosFiltrados.slice(0, 150).map((p, idx) => {
                          const key = `${p.order_id}-${p.rank_prioridade}`;
                          const isSelected =
                            pedidoSelecionado.order_id === p.order_id &&
                            pedidoSelecionado.rank_prioridade === p.rank_prioridade;
                          const resolvido =
                            resolvidosIds[p.order_id] ||
                            resolvidosIds[`${p.order_id}-dup-${p.rank_prioridade}`];

                          return (
                            <tr
                              key={`${key}-${idx}`}
                              onClick={() => setPedidoSelecionado(p)}
                              className={`cursor-pointer transition ${
                                isSelected
                                  ? "bg-indigo-950/50"
                                  : "hover:bg-slate-800/50"
                              }`}
                            >
                              <td className="py-2.5 px-3 font-mono text-slate-400">
                                #{p.rank_prioridade}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-1.5 font-semibold text-white">
                                  <span>{p.order_id}</span>
                                  {p.is_vip && (
                                    <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[10px]">
                                      VIP
                                    </span>
                                  )}
                                </div>
                                <div className="text-slate-400 text-[11px]">
                                  {p.marca} ? {formatBRL(p.valor)} ? {p.transportadora} ({p.uf})
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="inline-block px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-medium mb-0.5">
                                  {p.tipo_excecao}
                                </span>
                                <div className="text-[11px] text-slate-400">
                                  {p.causa_raiz}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-semibold text-rose-400">
                                {formatBRL(p.risco_financeiro_esperado)}
                                <div className="text-[10px] text-slate-500 font-normal">
                                  Reenvio: {formatBRL(p.custo_reenvio)}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {resolvido ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px] font-medium">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Tratado
                                  </span>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      executarAgenteNoPedido(p);
                                    }}
                                    className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium inline-flex items-center gap-1"
                                  >
                                    <Play className="w-3 h-3" />
                                    Resolver
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 space-y-2">
                  <p className="font-semibold text-white text-sm">
                    Sist?mico vs. Caso a Caso: Onde mudar o processo agora
                  </p>
                  <p>
                    48,6% de todas as exce??es (993 casos) v?m de <strong>6 falhas estruturais concentradas</strong> que exigem corre??o de processo, equipamento ou fornecedor ? e n?o apenas tratativa individual:
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {resumo.causas_raiz.map((c) => (
                    <div
                      key={c.causa_raiz}
                      onClick={() => {
                        setFiltroCausa(c.causa_raiz);
                        setFiltroModo("todos");
                        setAbaAtiva("fila");
                      }}
                      className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 cursor-pointer transition flex items-center justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                          <h3 className="font-semibold text-sm text-white">
                            {c.causa_raiz}
                          </h3>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          Clique para filtrar esses {c.qtd} pedidos na fila operacional
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-white">
                          {c.qtd} pedidos
                        </div>
                        <div className="text-xs text-rose-400">
                          Risco: {formatBRL(c.risco_esperado)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 sticky top-20">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-indigo-400" />
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Agente Executor Aut?nomo (Tool Calling)
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Audita SLA, simula CMV vs. Reembolso, executa a??o e redige contato
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-300">
                Gemini-3.8-Flash
              </span>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-white">
                  {pedidoSelecionado.order_id} ? {pedidoSelecionado.marca}
                </span>
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-medium">
                  Rank #{pedidoSelecionado.rank_prioridade}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-slate-300 pt-1">
                <div>
                  <span className="text-slate-500">Exce??o:</span>{" "}
                  <strong>{pedidoSelecionado.tipo_excecao}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Valor:</span>{" "}
                  <strong>{formatBRL(pedidoSelecionado.valor)}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Custo Reenvio:</span>{" "}
                  <strong className="text-emerald-400">
                    {formatBRL(pedidoSelecionado.custo_reenvio)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">LTV em Risco:</span>{" "}
                  <strong className="text-amber-400">
                    {formatBRL(pedidoSelecionado.perda_ltv_12m)}
                  </strong>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500">Prazo Checkout vs. Real:</span>{" "}
                  <span>
                    {pedidoSelecionado.data_prometida} ?{" "}
                    <strong>{pedidoSelecionado.data_prometida_correta}</strong>{" "}
                    ({pedidoSelecionado.falso_atraso ? "DENTRO DO PRAZO" : `${pedidoSelecionado.dias_uteis_atraso_real}d ?teis atraso`})
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500">Causa Raiz:</span>{" "}
                  <span className="text-amber-300">{pedidoSelecionado.causa_raiz}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <input
                type="text"
                placeholder="Instru??o opcional (ex: priorizar envio expresso ou cupom)..."
                value={instrucaoExtra}
                onChange={(e) => setInstrucaoExtra(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={() => executarAgenteNoPedido(pedidoSelecionado)}
                disabled={executandoAgente}
                className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition"
              >
                <Sparkles className="w-4 h-4" />
                {executandoAgente
                  ? "Agente auditando e executando ferramentas..."
                  : `Executar Resolu??o Aut?noma em ${pedidoSelecionado.order_id}`}
              </button>
            </div>

            {erroAgente && (
              <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs">
                {erroAgente}
              </div>
            )}

            {traceAgente.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Ferramentas Executadas pelo Agente ({traceAgente.length})
                </p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {traceAgente.map((t, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px]"
                    >
                      <div className="flex items-center justify-between text-emerald-400 font-mono font-semibold">
                        <span>? {t.tool}()</span>
                        <span className="text-[10px] text-slate-500">Passo {i + 1}</span>
                      </div>
                      <pre className="text-slate-400 mt-1 overflow-x-auto text-[10px]">
                        {JSON.stringify(t.output, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {respostaAgente && (
              <div className="p-3.5 rounded-lg bg-indigo-950/30 border border-indigo-500/30 text-xs text-slate-200 whitespace-pre-line max-h-64 overflow-y-auto leading-relaxed">
                {respostaAgente}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
